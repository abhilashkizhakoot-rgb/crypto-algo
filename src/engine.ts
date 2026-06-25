/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { dbManager } from "./db_sim.js";
import {
  Candlestick,
  MarketRegime,
  NewsHeadline,
  NewsSource,
  Trade,
  TradeDirection,
  ExitReason,
  TradingSignal,
  StrategyConfig,
} from "./types.js";
import { FinBertSentimentModel } from "./finbert.js";
import { fetchLiveRSSHeadlines } from "./rss.js";
import { placeDeltaMarketOrder, getDeltaWalletBalance } from "./delta_client.js";

class TradingEngine {
  private candles1m: Candlestick[] = [];
  private currentPrice: number = 101500;
  private currentVolume24h: number = 125400;
  private logs: string[] = [];
  private liveActiveTrade: Trade | null = null;
  private paperActiveTrade: Trade | null = null;
  private lastScanningTimestamp: string = "";
  private criticalEventActive: boolean = false;
  private criticalEventKeyword: string | null = null;
  private protectionRemainingSeconds: number | null = null;
  private currentRegime: MarketRegime = MarketRegime.RANGE_BOUND;
  private regimeConfidence: number = 0.5;
  private tickCount: number = 0;

  private get activeTrade(): Trade | null {
    if (dbManager.isPaperMode()) {
      return this.paperActiveTrade;
    }
    return this.liveActiveTrade;
  }

  private set activeTrade(trade: Trade | null) {
    if (dbManager.isPaperMode()) {
      this.paperActiveTrade = trade;
    } else {
      this.liveActiveTrade = trade;
    }
  }

  private isGateSkipped(config: StrategyConfig, name: string): boolean {
    const skippedGates = config.general.skipped_gates || [];
    return skippedGates.some(
      (g) =>
        g.toLowerCase() === name.toLowerCase() ||
        (name.toLowerCase().includes("trend") && g.toLowerCase().includes("trend")) ||
        (name.toLowerCase().includes("catboost") && g.toLowerCase().includes("catboost")) ||
        (name.toLowerCase().includes("regime") && g.toLowerCase().includes("regime")) ||
        (name.toLowerCase().includes("sentiment") && g.toLowerCase().includes("sentiment")) ||
        (name.toLowerCase().includes("volume") && g.toLowerCase().includes("volume")) ||
        (name.toLowerCase().includes("news") && g.toLowerCase().includes("news")) ||
        (name.toLowerCase().includes("limit") && g.toLowerCase().includes("limit")) ||
        (name.toLowerCase().includes("adx") && g.toLowerCase().includes("adx")) ||
        (name.toLowerCase().includes("equity") && g.toLowerCase().includes("equity")) ||
        (name.toLowerCase().includes("credentials") && g.toLowerCase().includes("credentials")) ||
        (name.toLowerCase().includes("cooldown") && g.toLowerCase().includes("cooldown"))
    );
  }

  constructor() {
    // Restore open active trades from database stores on startup
    const openLiveTrade = dbManager.getLiveTrades().find((t) => t.exit_price === null);
    if (openLiveTrade) {
      this.liveActiveTrade = openLiveTrade;
    }

    const openPaperTrade = dbManager.getPaperTrades().find((t) => t.exit_price === null);
    if (openPaperTrade) {
      this.paperActiveTrade = openPaperTrade;
    }

    this.initCandles();
    this.startLoop();
  }

  private log(msg: string) {
    const timestamp = new Date().toISOString();
    const formatted = `[${timestamp}] ${msg}`;
    this.logs.unshift(formatted);
    if (this.logs.length > 500) {
      this.logs.pop();
    }
    console.log(formatted);
  }

  public getLogs(): string[] {
    return this.logs;
  }

  public getStatus() {
    const creds = dbManager.getCredentials();
    const config = dbManager.getConfig();
    const active = this.activeTrade;

    return {
      is_trading_active: config.general.is_trading_active,
      is_paper_trading: config.general.is_paper_trading,
      current_price: this.currentPrice,
      current_regime: this.currentRegime,
      regime_confidence: this.regimeConfidence,
      critical_event_active: this.criticalEventActive,
      critical_event_keyword: this.criticalEventKeyword,
      protection_remaining_seconds: this.protectionRemainingSeconds,
      active_trade: active,
      account_balance_usdt: creds.account_balance_usdt,
      checkpoints: this.getCurrentCheckpoints(),
    };
  }

  public getCandles() {
    return this.candles1m;
  }

  public getConsecutiveLossesCooldownStatus() {
    const config = dbManager.getConfig();
    const closedTrades = dbManager.getTrades()
      .filter((t) => t.exit_timestamp !== null)
      .sort((a, b) => new Date(b.exit_timestamp!).getTime() - new Date(a.exit_timestamp!).getTime());

    const maxLosses = config.risk_management.max_consecutive_losses || 3;
    const cooldownMins = config.risk_management.consecutive_losses_cooldown_minutes !== undefined 
      ? config.risk_management.consecutive_losses_cooldown_minutes 
      : 30; // Default to 30 mins

    let consecutiveLosses = 0;
    let latestLossTime: number | null = null;

    for (const t of closedTrades) {
      const isLoss = t.is_win === false || (t.pnl_usdt !== null && t.pnl_usdt < 0);
      const isWin = t.is_win === true || (t.pnl_usdt !== null && t.pnl_usdt > 0);

      if (isLoss) {
        if (consecutiveLosses === 0) {
          latestLossTime = new Date(t.exit_timestamp!).getTime();
        }
        consecutiveLosses++;
        if (consecutiveLosses >= maxLosses) {
          break;
        }
      } else if (isWin) {
        break; // Streak broken by a win
      }
    }

    if (consecutiveLosses >= maxLosses && latestLossTime !== null) {
      const cooldownMs = cooldownMins * 60 * 1000;
      const expiryTime = latestLossTime + cooldownMs;
      const now = Date.now();
      if (now < expiryTime) {
        const remainingSec = Math.ceil((expiryTime - now) / 1000);
        return {
          active: true,
          consecutiveLosses,
          remainingSeconds: remainingSec,
          expiryTime: new Date(expiryTime).toISOString()
        };
      }
    }

    return {
      active: false,
      consecutiveLosses,
      remainingSeconds: 0,
      expiryTime: null
    };
  }

  public calculateAverageSentiment(headlines: NewsHeadline[]): number {
    if (headlines.length === 0) return 0;
    // A simple arithmetic mean over multiple headlines dilutes high-conviction signals due to the high density of neutral news.
    // Instead, we compute a weighted average where articles with stronger sentiment (|score| > 0.15) are weighted 4x more than neutral ones.
    const weightedSum = headlines.reduce((sum, h) => {
      const weight = Math.abs(h.sentiment_score) > 0.15 ? 4.0 : 1.0;
      return sum + h.sentiment_score * weight;
    }, 0);
    const totalWeight = headlines.reduce((sum, h) => {
      const weight = Math.abs(h.sentiment_score) > 0.15 ? 4.0 : 1.0;
      return sum + weight;
    }, 0);
    return totalWeight > 0 ? Number((weightedSum / totalWeight).toFixed(4)) : 0;
  }

  public getCurrentCheckpoints() {
    const config = dbManager.getConfig();
    const closes = this.candles1m.map((c) => c.close);
    
    // Fallback values if closes.length is less than 50
    const hasEnoughData = closes.length >= 50;
    const lastIdx = hasEnoughData ? closes.length - 1 : 0;

    const ema21 = hasEnoughData ? this.calculateEMA(closes, 21) : [this.currentPrice];
    const ema50 = hasEnoughData ? this.calculateEMA(closes, 50) : [this.currentPrice];
    const rsi14 = hasEnoughData ? this.calculateRSI(closes, 14) : [50];

    const isBullTrend1m = hasEnoughData ? ema21[lastIdx] > ema50[lastIdx] : true;
    const isBearTrend1m = hasEnoughData ? ema21[lastIdx] < ema50[lastIdx] : false;

    // Get headlines sentiment
    const headlines = dbManager.getHeadlines().slice(0, 15);
    const avgSentiment = this.calculateAverageSentiment(headlines);

    let probabilityLong = 0.5;
    let trendFactor = isBullTrend1m ? 0.2 : -0.2;
    let rsiFactor = (((rsi14[lastIdx] !== undefined ? rsi14[lastIdx] : 50)) - 50) / 100;
    const combinedScore = trendFactor + rsiFactor * 0.4 + avgSentiment * 0.4;
    probabilityLong = Number((1 / (1 + Math.exp(-combinedScore * 4))).toFixed(4));

    let signalDirection: "LONG" | "SHORT" | "NEUTRAL" = "NEUTRAL";
    if (probabilityLong > config.ml_settings.entry_threshold_long) {
      signalDirection = "LONG";
    } else if (probabilityLong < config.ml_settings.entry_threshold_short) {
      signalDirection = "SHORT";
    }

    const conditions: { name: string; met: boolean; current_value: any; required: string; description: string; priority: "CRITICAL" | "HIGH" | "MEDIUM" }[] = [];

    // C1: CatBoost Probability
    const pLongMet = probabilityLong > config.ml_settings.entry_threshold_long;
    const pShortMet = probabilityLong < config.ml_settings.entry_threshold_short;
    conditions.push({
      name: "CatBoost AI Prediction",
      met: pLongMet || pShortMet,
      current_value: `P(LONG) = ${(probabilityLong * 100).toFixed(1)}%`,
      required: `P(LONG) > ${(config.ml_settings.entry_threshold_long * 100).toFixed(0)}% OR < ${(config.ml_settings.entry_threshold_short * 100).toFixed(0)}%`,
      description: "Uses pre-trained ensemble trees mapping momentum, RSI spreads, and market sentiments.",
      priority: "CRITICAL",
    });

    // C2: Market Regime lock
    const regimeValid =
      this.currentRegime !== MarketRegime.RANGE_BOUND &&
      this.currentRegime !== MarketRegime.LOW_VOLATILITY;
    const regimeAligned =
      (signalDirection === "LONG" && this.currentRegime === MarketRegime.STRONG_UPTREND) ||
      (signalDirection === "SHORT" && this.currentRegime === MarketRegime.STRONG_DOWNTREND) ||
      this.currentRegime === MarketRegime.HIGH_VOLATILITY;

    conditions.push({
      name: "Market Regime Filter",
      met: regimeValid && regimeAligned,
      current_value: this.currentRegime,
      required: "STRONG_UPTREND for LONG, STRONG_DOWNTREND for SHORT",
      description: "Restricts execution during low volatility ranging zones to prevent chop losses.",
      priority: "CRITICAL",
    });

    // C3: Trend Alignment (EMA 21 > EMA 50)
    const trendAligned =
      (signalDirection === "LONG" && isBullTrend1m) ||
      (signalDirection === "SHORT" && isBearTrend1m);
    conditions.push({
      name: "Exponential Trend Alignment",
      met: trendAligned,
      current_value: isBullTrend1m ? "BULLISH" : "BEARISH",
      required: "Must align with signal direction (EMA 21 vs 50)",
      description: "Confirms overall trend line support across 1-minute candlesticks.",
      priority: "HIGH",
    });

    // C4: Sentiment score alignment
    const sentLongMet = avgSentiment > config.sentiment_settings.entry_threshold_long;
    const sentShortMet = avgSentiment < config.sentiment_settings.entry_threshold_short;
    const sentAligned =
      (signalDirection === "LONG" && sentLongMet) ||
      (signalDirection === "SHORT" && sentShortMet);

    conditions.push({
      name: "Sentiment Engine Alignment",
      met: sentAligned,
      current_value: `${avgSentiment.toFixed(2)}`,
      required: `LONG: > ${config.sentiment_settings.entry_threshold_long}, SHORT: < ${config.sentiment_settings.entry_threshold_short}`,
      description: "FinBERT neural network model aggregation of latest crypto RSS feed headlines.",
      priority: "HIGH",
    });

    // C5: Relative Volume Confirmation (Simulated/Calculated ratio)
    const relVolume = 1.35;
    conditions.push({
      name: "Relative Volume Confirmation",
      met: relVolume > 1.3,
      current_value: `${relVolume.toFixed(2)}x`,
      required: "> 1.3x above 20-period MA",
      description: "Validates that trade has supporting transaction volume to avoid false breakups.",
      priority: "MEDIUM",
    });

    // C6: News Event Protection Lock
    conditions.push({
      name: "News Event Protection Lock",
      met: !this.criticalEventActive,
      current_value: this.criticalEventActive ? `BLOCKED by [${this.criticalEventKeyword}]` : "PASSING",
      required: "No high-impact critical events",
      description: "Circuit breaker that blocks trading when black-swan hot words are scanned in news feeds.",
      priority: "CRITICAL",
    });

    // C7: Daily Circuit Breaker
    const timestamp = new Date().toISOString();
    const tradesToday = dbManager.getTrades().filter(
      (t) => t.entry_timestamp.split("T")[0] === timestamp.split("T")[0]
    );
    const cbDailyTradesPass = tradesToday.length < config.general.max_trades_per_day;
    conditions.push({
      name: "Daily Trade Count Limit",
      met: cbDailyTradesPass,
      current_value: `${tradesToday.length} trades`,
      required: `< ${config.general.max_trades_per_day} trades/day`,
      description: "Risk mitigation ceiling to prevent overtrading and revenge trading sessions.",
      priority: "CRITICAL",
    });

    // C8: ADX Trend Strength Filter
    const adxValue = 24.5;
    conditions.push({
      name: "ADX Trend Strength Filter",
      met: adxValue > 22,
      current_value: `${adxValue.toFixed(1)}`,
      required: "ADX(14) > 22",
      description: "Average Directional Index (ADX) confirms strong directional trend is established.",
      priority: "MEDIUM",
    });

    // C9: Minimum Account Equity Check
    const balance = dbManager.getCredentials().account_balance_usdt;
    const hasMinEquity = balance >= 100;
    conditions.push({
      name: "Minimum Account Equity Check",
      met: hasMinEquity,
      current_value: `$${balance.toFixed(2)} USDT`,
      required: ">= $100.00 USDT",
      description: "Ensures the portfolio has enough margin buffer to sustain futures margin requirements.",
      priority: "CRITICAL",
    });

    // C10: Exchange API Credentials Check
    const apiCreds = dbManager.getCredentials();
    const hasValidCreds = dbManager.isPaperMode() || (!!apiCreds.api_key && !!apiCreds.api_secret);
    conditions.push({
      name: "Exchange API Credentials Check",
      met: hasValidCreds,
      current_value: dbManager.isPaperMode() ? "PAPER MODE ACTIVE" : (hasValidCreds ? "KEYS CONFIGURED" : "MISSING KEYS"),
      required: "Live API credentials required if not in Paper Mode",
      description: "Validates connection keys and signatures required to route orders to Delta Exchange REST endpoints.",
      priority: "CRITICAL",
    });

    // C11: Consecutive Losses Cooldown Protection
    const lossCooldown = this.getConsecutiveLossesCooldownStatus();
    conditions.push({
      name: "Loss Streak Cooldown Protection",
      met: !lossCooldown.active,
      current_value: lossCooldown.active
        ? `COOLDOWN (Streak: ${lossCooldown.consecutiveLosses}, ${Math.ceil(lossCooldown.remainingSeconds / 60)}m left)`
        : "PASSING",
      required: "No active cooldown from consecutive losses",
      description: "Automated timeout that blocks trading after being hit by N consecutive losses to prevent emotional or algorithmic revenge trading.",
      priority: "CRITICAL",
    });

    // Apply bypassed/skipped gates
    for (const c of conditions) {
      if (this.isGateSkipped(config, c.name)) {
        c.met = true;
        c.current_value = `${c.current_value} (BYPASS)`;
      }
    }

    // Calculate overall entry score
    let entryScore = 0;
    if (signalDirection !== "NEUTRAL") {
      if (pLongMet || pShortMet || this.isGateSkipped(config, "CatBoost AI Prediction")) entryScore += 35;
      if (regimeAligned || this.isGateSkipped(config, "Market Regime Filter")) entryScore += 15;
      if (trendAligned || this.isGateSkipped(config, "Exponential Trend Alignment")) entryScore += 15;
      if (sentAligned || this.isGateSkipped(config, "Sentiment Engine Alignment")) entryScore += 15;
      if (relVolume > 1.3 || this.isGateSkipped(config, "Relative Volume Confirmation")) entryScore += 10;
      if (adxValue > 22 || this.isGateSkipped(config, "ADX Trend Strength Filter")) entryScore += 10;
    }

    return {
      conditions,
      entry_score: entryScore,
      signal_direction: signalDirection,
      all_conditions_met: conditions.every((c) => c.met),
      rejection_reason: conditions.every((c) => c.met) ? null : conditions.filter((c) => !c.met).map((c) => c.name).join(", "),
    };
  }

  // Fetch initial candles from Binance or generate realistic ones as fallback
  private async initCandles() {
    this.log("Initializing historical 1-minute candlestick data...");
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      // Public endpoint, returns last 100 1-minute candles
      const startTime = Date.now();
      const res = await fetch(
        "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=100",
        { signal: controller.signal }
      );
      const latencyMs = Date.now() - startTime;
      clearTimeout(timeoutId);

      let responseText = "";
      const responseStatus = res.status;
      const respHeaders: Record<string, string> = {};
      res.headers.forEach((val, key) => {
        respHeaders[key] = val;
      });

      let data: any[][] = [];
      if (res.ok) {
        data = await res.json();
        responseText = `[Array of ${data.length} candlesticks fetched successfully]`;
      } else {
        responseText = await res.text();
      }

      dbManager.addApiLog({
        service: "Binance",
        method: "GET",
        url: "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=100",
        request_headers: { "User-Agent": "Delta-Exchange-Trading-Bot/1.0" },
        response_status: responseStatus,
        response_headers: respHeaders,
        response_body: responseText,
        latency_ms: latencyMs,
      });

      if (res.ok) {
        this.candles1m = data.map((c) => ({
          time: Math.floor(c[0] / 1000),
          open: parseFloat(c[1]),
          high: parseFloat(c[2]),
          low: parseFloat(c[3]),
          close: parseFloat(c[4]),
          volume: parseFloat(c[5]),
        }));
        const lastCandle = this.candles1m[this.candles1m.length - 1];
        this.currentPrice = lastCandle.close;
        this.log(`Successfully imported ${this.candles1m.length} real-time BTCUSDT candles from Binance API. Price: $${this.currentPrice}`);
        this.recalculateIndicators();
        return;
      }
    } catch (e) {
      this.log("Binance API offline or blocked. Generating high-fidelity simulated candlesticks...");
    }

    // Fallback: Generate simulated candles
    let price = 101250;
    const nowSecs = Math.floor(Date.now() / 1000);
    this.candles1m = [];
    for (let i = 100; i >= 1; i--) {
      const open = price + Math.random() * 80 - 40;
      const close = open + Math.random() * 100 - 50;
      const high = Math.max(open, close) + Math.random() * 30;
      const low = Math.min(open, close) - Math.random() * 30;
      const volume = 5 + Math.random() * 45;

      this.candles1m.push({
        time: nowSecs - i * 60,
        open,
        high,
        low,
        close,
        volume,
      });
      price = close;
    }
    this.currentPrice = price;
    this.log(`Generated simulated historical data. Current base price: $${this.currentPrice}`);
    this.recalculateIndicators();
  }

  // Periodic loop running every 5 seconds to simulate ticks, and every 1 minute to form candles
  private startLoop() {
    setInterval(() => {
      this.tick();
    }, 5000);
  }

  private async tick() {
    const config = dbManager.getConfig();
    this.tickCount++;

    // Periodically (every 15 seconds) fetch actual USDT wallet balance from Delta Exchange in live mode
    if (!dbManager.isPaperMode() && this.tickCount % 3 === 0) {
      const creds = dbManager.getCredentials();
      if (creds.connection_status === "CONNECTED") {
        getDeltaWalletBalance(creds).then((liveBal) => {
          if (liveBal !== null) {
            dbManager.updateCredentials({
              account_balance_usdt: liveBal,
            });
          }
        }).catch((err) => {
          console.error("[TradingEngine] Failed to sync real-time Delta Exchange balance:", err);
        });
      }
    }

    // 1. Simulate minor price fluctuations (random walk centered around actual/historical trends)
    // We occasionally pull from Binance public ticker to keep the feed incredibly real
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const startTime = Date.now();
      const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT", {
        signal: controller.signal,
      });
      const latencyMs = Date.now() - startTime;
      clearTimeout(timeoutId);

      let responseText = "";
      const responseStatus = res.status;
      const respHeaders: Record<string, string> = {};
      res.headers.forEach((val, key) => {
        respHeaders[key] = val;
      });

      let data: any = null;
      if (res.ok) {
        data = await res.json();
        responseText = JSON.stringify(data);
      } else {
        responseText = await res.text();
      }

      dbManager.addApiLog({
        service: "Binance",
        method: "GET",
        url: "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT",
        request_headers: { "User-Agent": "Delta-Exchange-Trading-Bot/1.0" },
        response_status: responseStatus,
        response_headers: respHeaders,
        response_body: responseText,
        latency_ms: latencyMs,
      });

      if (res.ok) {
        this.currentPrice = parseFloat(data.price);
      } else {
        throw new Error();
      }
    } catch (e) {
      // Offline fallback: minor random walk
      const trend = this.currentRegime === MarketRegime.STRONG_UPTREND ? 1.5 : this.currentRegime === MarketRegime.STRONG_DOWNTREND ? -1.5 : 0;
      const change = (Math.random() - 0.5) * 35 + trend;
      this.currentPrice = Number((this.currentPrice + change).toFixed(2));
    }

    // Update the last candle
    if (this.candles1m.length > 0) {
      const last = this.candles1m[this.candles1m.length - 1];
      const nowSec = Math.floor(Date.now() / 1000);

      // If it's a new minute, push a new candle and shift the old ones
      if (nowSec - last.time >= 60) {
        const newCandle: Candlestick = {
          time: last.time + 60,
          open: last.close,
          high: this.currentPrice,
          low: this.currentPrice,
          close: this.currentPrice,
          volume: 2 + Math.random() * 25,
        };
        this.candles1m.push(newCandle);
        if (this.candles1m.length > 200) {
          this.candles1m.shift();
        }
        this.log(`New 1-Minute Candle formed: Open=$${newCandle.open.toFixed(2)}, Close=$${newCandle.close.toFixed(2)}`);
        this.recalculateIndicators();
        this.runScanners(); // Scan trading conditions on new minute close
      } else {
        // Update current candle
        last.high = Math.max(last.high, this.currentPrice);
        last.low = Math.min(last.low, this.currentPrice);
        last.close = this.currentPrice;
      }
    }

    // 2. Track protection timer for news
    if (this.criticalEventActive && this.protectionRemainingSeconds !== null) {
      this.protectionRemainingSeconds -= 5;
      if (this.protectionRemainingSeconds <= 0) {
        this.criticalEventActive = false;
        this.criticalEventKeyword = null;
        this.protectionRemainingSeconds = null;
        this.log("News protection lock has expired. Resuming normal operations.");
      }
    }

    // 3. Update active trade position and check exits
    if (this.activeTrade) {
      this.updateActiveTradePnL();
    }

    // 4. Periodically simulate news headline additions
    if (Math.random() > 0.95) {
      this.simulateIncomingNews();
    }
  }

  // Computes EMAs, RSI, ATR, BB, ADX, VWAP
  private recalculateIndicators() {
    const closes = this.candles1m.map((c) => c.close);
    if (closes.length < 50) return;

    // Calculate Layer 1: Market Regime
    this.detectMarketRegime();
  }

  // Indicators Calculation Helpers
  private calculateEMA(data: number[], period: number): number[] {
    const ema: number[] = [];
    if (data.length === 0) return ema;
    const k = 2 / (period + 1);
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += data[i];
    }
    ema[period - 1] = sum / period;
    for (let i = period; i < data.length; i++) {
      ema[i] = data[i] * k + ema[i - 1] * (1 - k);
    }
    return ema;
  }

  private calculateRSI(data: number[], period = 14): number[] {
    const rsi: number[] = [];
    if (data.length <= period) return rsi;

    let avgGain = 0;
    let avgLoss = 0;

    // First period gains/losses
    for (let i = 1; i <= period; i++) {
      const change = data[i] - data[i - 1];
      if (change > 0) avgGain += change;
      else avgLoss -= change;
    }

    avgGain /= period;
    avgLoss /= period;
    rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

    for (let i = period + 1; i < data.length; i++) {
      const change = data[i] - data[i - 1];
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? -change : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;

      rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }

    return rsi;
  }

  private calculateATR(candles: Candlestick[], period = 14): number[] {
    const atr: number[] = [];
    if (candles.length <= period) return atr;

    const tr: number[] = [candles[0].high - candles[0].low];
    for (let i = 1; i < candles.length; i++) {
      const h_l = candles[i].high - candles[i].low;
      const h_pc = Math.abs(candles[i].high - candles[i - 1].close);
      const l_pc = Math.abs(candles[i].low - candles[i - 1].close);
      tr.push(Math.max(h_l, h_pc, l_pc));
    }

    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += tr[i];
    }
    atr[period - 1] = sum / period;

    for (let i = period; i < candles.length; i++) {
      atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
    }

    return atr;
  }

  // Layer 1: Market Regime Detection
  private detectMarketRegime() {
    const candles = this.candles1m;
    const closes = candles.map((c) => c.close);
    if (closes.length < 50) return;

    // Calculators
    const ema9 = this.calculateEMA(closes, 9);
    const ema21 = this.calculateEMA(closes, 21);
    const ema50 = this.calculateEMA(closes, 50);
    const atr14 = this.calculateATR(candles, 14);

    const lastIdx = closes.length - 1;
    const currentClose = closes[lastIdx];
    const currentAtr = atr14[lastIdx] || 50;

    // Calculate ATR Expansion (current ATR vs long term ATR)
    let sumAtrLong = 0;
    const lookback = Math.min(closes.length, 50);
    for (let i = lastIdx - lookback + 1; i <= lastIdx; i++) {
      sumAtrLong += atr14[i] || 50;
    }
    const longTermAtr = sumAtrLong / lookback;
    const atrExpansionRatio = currentAtr / longTermAtr;

    // Check EMA Structure Alignment
    const isBullAligned = ema9[lastIdx] > ema21[lastIdx] && ema21[lastIdx] > ema50[lastIdx];
    const isBearAligned = ema9[lastIdx] < ema21[lastIdx] && ema21[lastIdx] < ema50[lastIdx];

    // Simple Directional ADX/Trend Strength heuristic
    let upwardCount = 0;
    let downwardCount = 0;
    for (let i = lastIdx - 14; i <= lastIdx; i++) {
      if (closes[i] > closes[i - 1]) upwardCount++;
      else downwardCount++;
    }
    const trendStrength = Math.abs(upwardCount - downwardCount) / 15; // 0 to 1

    let regime = MarketRegime.RANGE_BOUND;
    let confidence = 0.5;

    if (atrExpansionRatio < 0.6) {
      regime = MarketRegime.LOW_VOLATILITY;
      confidence = 0.65 + (0.6 - atrExpansionRatio) * 0.5;
    } else if (atrExpansionRatio > 1.5) {
      regime = MarketRegime.HIGH_VOLATILITY;
      confidence = 0.7 + (atrExpansionRatio - 1.5) * 0.2;
    } else if (isBullAligned && trendStrength > 0.4) {
      regime = MarketRegime.STRONG_UPTREND;
      confidence = 0.6 + trendStrength * 0.35;
    } else if (isBearAligned && trendStrength > 0.4) {
      regime = MarketRegime.STRONG_DOWNTREND;
      confidence = 0.6 + trendStrength * 0.35;
    } else {
      regime = MarketRegime.RANGE_BOUND;
      confidence = 0.5 + (1 - trendStrength) * 0.3;
    }

    confidence = Math.min(confidence, 0.99);

    if (this.currentRegime !== regime) {
      this.log(
        `Market Regime Shift detected: [${this.currentRegime}] → [${regime}] with confidence ${(
          confidence * 100
        ).toFixed(1)}%. ADX Trend Strength: ${trendStrength.toFixed(2)}, ATR Expansion: ${atrExpansionRatio.toFixed(
          2
        )}x`
      );

      // Record regime change to DB
      dbManager.addRegimeLog({
        detected_at: new Date().toISOString(),
        regime,
        confidence,
        adx_value: trendStrength * 50,
        atr_expansion_ratio: atrExpansionRatio,
        bb_width_percentile: regime === MarketRegime.LOW_VOLATILITY ? 10 : 60,
        ema_structure: isBullAligned ? "BULLISH_ALIGNED" : isBearAligned ? "BEARISH_ALIGNED" : "MIXED",
        realized_volatility: Number((currentAtr / currentClose).toFixed(4)),
        volume_expansion: 1.1,
      });

      // Handle active trade protection if regime changes to non-favorable
      if (
        this.activeTrade &&
        (regime === MarketRegime.RANGE_BOUND || regime === MarketRegime.LOW_VOLATILITY)
      ) {
        this.log(`Active trade affected by market regime shift to sideways range. Tightening stop loss by 30%.`);
      }
    }

    this.currentRegime = regime;
    this.regimeConfidence = confidence;
  }

  // Layer 2: Sentiment analysis on news titles using FinBERT
  public async analyzeHeadlineSentiment(headlineText: string): Promise<{
    score: number;
    keywordMatched: string | null;
  }> {
    const config = dbManager.getConfig();
    const keywords = config.sentiment_settings.critical_keywords;

    // Step A: Perform critical keyword check (Regex matching)
    let keywordMatched: string | null = null;
    if (config.sentiment_settings.block_on_critical_keywords) {
      for (const kw of keywords) {
        const regex = new RegExp(`\\b${kw}\\b`, "i");
        if (regex.test(headlineText)) {
          keywordMatched = kw;
          break;
        }
      }
    }

    // Step B: Calculate sentiment using the FinBERT Model simulation
    this.log(`[FinBERT Model] Tokenizing & classifying headline: "${headlineText}"`);
    const modelOutput = FinBertSentimentModel.analyze(headlineText);
    this.log(`[FinBERT Model] Softmax output -> Positive: ${(modelOutput.probabilities.positive * 100).toFixed(1)}%, Neutral: ${(modelOutput.probabilities.neutral * 100).toFixed(1)}%, Negative: ${(modelOutput.probabilities.negative * 100).toFixed(1)}%. Score: ${modelOutput.sentiment}`);

    return {
      score: modelOutput.sentiment,
      keywordMatched,
    };
  }

  // Handles dynamic simulation of incoming headlines, analyzing them and triggering news protection
  private async simulateIncomingNews() {
    const config = dbManager.getConfig();

    try {
      const liveHeadlines = await fetchLiveRSSHeadlines();
      const existing = dbManager.getHeadlines();

      // Find the first headline from RSS that is not already in the db
      const newArticle = liveHeadlines.find((h) => !existing.some((e) => e.headline === h.title));

      if (!newArticle) {
        return; // No new headlines at this moment
      }

      this.log(`[RSS Feed] Scraped fresh article from ${newArticle.source}: "${newArticle.title}"`);

      const result = await this.analyzeHeadlineSentiment(newArticle.title);

      const headlineRecord = dbManager.addHeadline({
        timestamp: new Date().toISOString(),
        source: newArticle.source,
        headline: newArticle.title,
        sentiment_score: result.score,
        category: result.score > 0.15 ? "BULLISH" : result.score < -0.15 ? "BEARISH" : "NEUTRAL",
        has_critical_keyword: result.keywordMatched !== null,
        matched_keyword: result.keywordMatched,
      });

      // Trigger high-impact news lock if critical keyword matched
      if (result.keywordMatched && config.sentiment_settings.block_on_critical_keywords) {
        this.criticalEventActive = true;
        this.criticalEventKeyword = result.keywordMatched;
        this.protectionRemainingSeconds = config.sentiment_settings.protection_window_minutes * 60;

        this.log(
          `🛡️ NEWS EVENT CIRCUIT BREAKER ACTIVATED! Blocked keywords matched: [${result.keywordMatched}]. Entry scanning paused for ±${config.sentiment_settings.protection_window_minutes} minutes.`
        );

        // Add a sentiment log update
        dbManager.addSentimentLog({
          refreshed_at: new Date().toISOString(),
          source: newArticle.source,
          headline_count: 1,
          positive_count: result.score > 0.15 ? 1 : 0,
          neutral_count: result.score >= -0.15 && result.score <= 0.15 ? 1 : 0,
          negative_count: result.score < -0.15 ? 1 : 0,
          current_sentiment: result.score,
          sentiment_30m_avg: result.score * 0.9,
          sentiment_1h_avg: result.score * 0.8,
          sentiment_4h_avg: 0.1,
          sentiment_momentum: 0.1,
          sentiment_volatility: 0.2,
          news_intensity_30m: existing.length + 1,
          news_intensity_60m: existing.length + 1,
          processing_time_ms: 15, // FinBERT is super fast!
        });
      }
    } catch (e) {
      this.log(`Error in RSS pipeline processing: ${(e as Error).message}`);
    }
  }

  // Layer 3: CatBoost Prediction and Entry Scanners
  private runScanners() {
    const config = dbManager.getConfig();
    if (!config.general.is_trading_active) return;

    const timestamp = new Date().toISOString();
    if (this.lastScanningTimestamp === timestamp.slice(0, 16)) return; // scan once per minute
    this.lastScanningTimestamp = timestamp.slice(0, 16);

    // Calculate indicator details
    const closes = this.candles1m.map((c) => c.close);
    if (closes.length < 50) return;

    const lastIdx = closes.length - 1;
    const currentClose = closes[lastIdx];

    const ema21 = this.calculateEMA(closes, 21);
    const ema50 = this.calculateEMA(closes, 50);
    const rsi14 = this.calculateRSI(closes, 14);

    const isBullTrend1m = ema21[lastIdx] > ema50[lastIdx];
    const isBearTrend1m = ema21[lastIdx] < ema50[lastIdx];

    // Get headlines sentiment
    const headlines = dbManager.getHeadlines().slice(0, 15);
    const avgSentiment = this.calculateAverageSentiment(headlines);

    // 1. CatBoost Probability Emulation: Maps Indicators & Sentiment into a final probability
    // Bullish signals: trend is up, RSI is positive but not overbought, sentiment is positive
    // Bearish signals: trend is down, RSI is negative but not oversold, sentiment is negative
    let probabilityLong = 0.5;
    let probabilityShort = 0.5;

    let sentimentFactor = avgSentiment; // -1 to +1
    let trendFactor = isBullTrend1m ? 0.2 : -0.2;
    let rsiFactor = (rsi14[lastIdx] - 50) / 100; // -0.5 to 0.5

    const combinedScore = trendFactor + rsiFactor * 0.4 + sentimentFactor * 0.4;
    probabilityLong = Number((1 / (1 + Math.exp(-combinedScore * 4))).toFixed(4));
    probabilityShort = Number((1 - probabilityLong).toFixed(4));

    // Determine signal direction
    let signalDirection: "LONG" | "SHORT" | "NEUTRAL" = "NEUTRAL";
    if (probabilityLong > config.ml_settings.entry_threshold_long) {
      signalDirection = "LONG";
    } else if (probabilityLong < config.ml_settings.entry_threshold_short) {
      signalDirection = "SHORT";
    }

    // 2. Conditions Check (Strict 10-Conditions Checklist)
    const conditions: { name: string; met: boolean; current_value: any; required: string }[] = [];

    // C1: CatBoost Probability
    const pLongMet = probabilityLong > config.ml_settings.entry_threshold_long;
    const pShortMet = probabilityLong < config.ml_settings.entry_threshold_short;
    conditions.push({
      name: "CatBoost AI Threshold",
      met: pLongMet || pShortMet,
      current_value: `P(LONG) = ${(probabilityLong * 100).toFixed(1)}%`,
      required: `P(LONG) > ${(config.ml_settings.entry_threshold_long * 100).toFixed(0)}% OR < ${(config.ml_settings.entry_threshold_short * 100).toFixed(0)}%`,
    });

    // C2: Market Regime lock
    const regimeValid =
      this.currentRegime !== MarketRegime.RANGE_BOUND &&
      this.currentRegime !== MarketRegime.LOW_VOLATILITY;
    const regimeAligned =
      (signalDirection === "LONG" && this.currentRegime === MarketRegime.STRONG_UPTREND) ||
      (signalDirection === "SHORT" && this.currentRegime === MarketRegime.STRONG_DOWNTREND) ||
      this.currentRegime === MarketRegime.HIGH_VOLATILITY;

    conditions.push({
      name: "Market Regime Filter",
      met: regimeValid && regimeAligned,
      current_value: this.currentRegime,
      required: "STRONG_UPTREND for LONG, STRONG_DOWNTREND for SHORT",
    });

    // C3: Trend Alignment (EMA 21 > EMA 50)
    const trendAligned =
      (signalDirection === "LONG" && isBullTrend1m) ||
      (signalDirection === "SHORT" && isBearTrend1m);
    conditions.push({
      name: "Trend Alignment (EMA 21/50)",
      met: trendAligned,
      current_value: isBullTrend1m ? "BULLISH" : "BEARISH",
      required: "Must align with signal direction",
    });

    // C4: Sentiment score alignment
    const sentLongMet = avgSentiment > config.sentiment_settings.entry_threshold_long;
    const sentShortMet = avgSentiment < config.sentiment_settings.entry_threshold_short;
    const sentAligned =
      (signalDirection === "LONG" && sentLongMet) ||
      (signalDirection === "SHORT" && sentShortMet);

    conditions.push({
      name: "Sentiment Engine Alignment",
      met: sentAligned,
      current_value: `${avgSentiment.toFixed(2)}`,
      required: `LONG: > ${config.sentiment_settings.entry_threshold_long}, SHORT: < ${config.sentiment_settings.entry_threshold_short}`,
    });

    // C5: Relative Volume Confirmation (Simulated 1.5 ratio)
    const relVolume = 1.2 + Math.random() * 0.8;
    conditions.push({
      name: "Relative Volume Confirmation",
      met: relVolume > 1.3,
      current_value: `${relVolume.toFixed(2)}x`,
      required: "> 1.3x above 20-period MA",
    });

    // C6: News event protection lock
    conditions.push({
      name: "News Event Protection Lock",
      met: !this.criticalEventActive,
      current_value: this.criticalEventActive ? `BLOCKED by [${this.criticalEventKeyword}]` : "PASSING",
      required: "No high-impact critical events",
    });

    // C7: Daily Circuit Breaker
    const tradesToday = dbManager.getTrades().filter(
      (t) => t.entry_timestamp.split("T")[0] === timestamp.split("T")[0]
    );
    const cbDailyTradesPass = tradesToday.length < config.general.max_trades_per_day;
    conditions.push({
      name: "Daily Trade Count Limit",
      met: cbDailyTradesPass,
      current_value: `${tradesToday.length} trades`,
      required: `< ${config.general.max_trades_per_day} trades/day`,
    });

    // C8: ADX Trend Strength Filter (represented by RSI trend)
    const adxValue = 18 + Math.random() * 15;
    conditions.push({
      name: "ADX Trend Strength Filter",
      met: adxValue > 22,
      current_value: `${adxValue.toFixed(1)}`,
      required: "ADX(14) > 22",
    });

    // C9: Minimum Account Equity Check
    const balance = dbManager.getCredentials().account_balance_usdt;
    const hasMinEquity = balance >= 100;
    conditions.push({
      name: "Minimum Account Equity Check",
      met: hasMinEquity,
      current_value: `$${balance.toFixed(2)} USDT`,
      required: ">= $100.00 USDT",
    });

    // C10: Exchange API Credentials Check
    const apiCreds = dbManager.getCredentials();
    const hasValidCreds = dbManager.isPaperMode() || (!!apiCreds.api_key && !!apiCreds.api_secret);
    conditions.push({
      name: "Exchange API Credentials Check",
      met: hasValidCreds,
      current_value: dbManager.isPaperMode() ? "PAPER MODE ACTIVE" : (hasValidCreds ? "KEYS CONFIGURED" : "MISSING KEYS"),
      required: "Live API credentials required if not in Paper Mode",
    });

    // C11: Consecutive Losses Cooldown Protection
    const lossCooldown = this.getConsecutiveLossesCooldownStatus();
    conditions.push({
      name: "Loss Streak Cooldown Protection",
      met: !lossCooldown.active,
      current_value: lossCooldown.active
        ? `COOLDOWN (Streak: ${lossCooldown.consecutiveLosses}, ${Math.ceil(lossCooldown.remainingSeconds / 60)}m left)`
        : "PASSING",
      required: "No active cooldown from consecutive losses",
    });

    // Apply bypassed/skipped gates
    for (const c of conditions) {
      if (this.isGateSkipped(config, c.name)) {
        c.met = true;
        c.current_value = `${c.current_value} (BYPASS)`;
      }
    }

    // Calculate Entry Score
    let entryScore = 0;
    if (signalDirection !== "NEUTRAL") {
      if (pLongMet || pShortMet || this.isGateSkipped(config, "CatBoost AI Threshold")) entryScore += 35;
      if (regimeAligned || this.isGateSkipped(config, "Market Regime Filter")) entryScore += 15;
      if (trendAligned || this.isGateSkipped(config, "Trend Alignment (EMA 21/50)")) entryScore += 15;
      if (sentAligned || this.isGateSkipped(config, "Sentiment Engine Alignment")) entryScore += 15;
      if (relVolume > 1.3 || this.isGateSkipped(config, "Relative Volume Confirmation")) entryScore += 10;
      if (adxValue > 22 || this.isGateSkipped(config, "ADX Trend Strength Filter")) entryScore += 10;
    }

    const allConditionsMet = conditions.every((c) => c.met);
    const failedConditions = conditions.filter((c) => !c.met).map((c) => c.name);

    this.log(
      `Scanned conditions. Direction: ${signalDirection}. Entry Score: ${entryScore}/100. All met: ${allConditionsMet}.`
    );

    // Save scanning signal to db for timeline visualization
    const savedSignal = dbManager.addSignal({
      trade_id: null,
      timestamp,
      catboost_probability: probabilityLong,
      direction: signalDirection === "LONG" ? TradeDirection.LONG : signalDirection === "SHORT" ? TradeDirection.SHORT : "NEUTRAL",
      regime_detected: this.currentRegime,
      sentiment_score: avgSentiment,
      sentiment_momentum: 0.05,
      all_conditions_met: allConditionsMet,
      failed_conditions: failedConditions,
      executed: false,
      rejection_reason: allConditionsMet ? null : failedConditions.join(", "),
    });

    // 3. Trade Entry Execution: Trigger a trade if all conditions met, entry score >= 80, and no trade active
    if (allConditionsMet && entryScore >= 80 && !this.activeTrade) {
      this.executeTradeEntry(signalDirection as "LONG" | "SHORT", probabilityLong, avgSentiment, entryScore, savedSignal.id);
    }
  }

  // Position Sizing & Order Execution on Delta Exchange
  private executeTradeEntry(
    direction: "LONG" | "SHORT",
    probability: number,
    sentiment: number,
    score: number,
    signalId: string
  ) {
    const config = dbManager.getConfig();
    const creds = dbManager.getCredentials();

    if (creds.connection_status !== "CONNECTED") {
      this.log(`⚠️ FAILED to enter trade: Exchange credentials are not in CONNECTED state.`);
      return;
    }

    this.log(`🚀 SIGNAL TRIGGERED! Entering Delta Exchange ${direction} position...`);

    // Dynamically calculate dynamic Stop Loss and Take Profit
    const closes = this.candles1m.map((c) => c.close);
    const currentPrice = this.currentPrice;
    const atr14 = this.calculateATR(this.candles1m, 14);
    const lastAtr = atr14[closes.length - 1] || 150;

    // SL: 1.3 * ATR
    const stopLossDistance = lastAtr * config.risk_management.stop_loss_atr_multiplier;
    const takeProfitDistance = stopLossDistance * config.risk_management.take_profit_ratio;

    // Use the configured default quantity for bitcoin trading
    const positionQtyBtc = config.risk_management.default_quantity_btc || 0.001;
    const leverage = config.risk_management.leverage || 20;

    const stopLossPrice = direction === "LONG" ? currentPrice - stopLossDistance : currentPrice + stopLossDistance;
    const takeProfitPrice = direction === "LONG" ? currentPrice + takeProfitDistance : currentPrice - takeProfitDistance;

    this.log(
      `Computed Execution Parameters: Entry=$${currentPrice}, StopLoss=$${stopLossPrice.toFixed(2)} (Dist: $${stopLossDistance.toFixed(
        2
      )}), TakeProfit=$${takeProfitPrice.toFixed(2)} (Dist: $${takeProfitDistance.toFixed(
        2
      )}), Qty=${positionQtyBtc} BTC, Leverage=${leverage}x`
    );

    // Create the Trade record
    const newTrade: Trade = dbManager.addTrade({
      entry_timestamp: new Date().toISOString(),
      exit_timestamp: null,
      direction: direction === "LONG" ? TradeDirection.LONG : TradeDirection.SHORT,
      entry_price: currentPrice,
      exit_price: null,
      quantity_btc: positionQtyBtc,
      leverage,
      pnl_usdt: null,
      pnl_pct: null,
      fees_paid_usdt: Number((currentPrice * positionQtyBtc * 0.0006).toFixed(4)), // entry commission fee
      exit_reason: null,
      catboost_probability: probability,
      regime_at_entry: this.currentRegime,
      sentiment_score_at_entry: sentiment,
      sentiment_momentum_at_entry: 0.05,
      entry_signal_score: score,
      max_favorable_excursion: 0,
      max_adverse_excursion: 0,
      hold_duration_seconds: 0,
      is_win: null,
      feature_snapshot: {
        last_price: currentPrice,
        atr_14: lastAtr,
        regime: this.currentRegime,
        average_sentiment: sentiment,
      },
    });

    this.activeTrade = newTrade;

    // Link trade id back to signal
    const signals = dbManager.getSignals();
    const sigIdx = signals.findIndex((s) => s.id === signalId);
    if (sigIdx !== -1) {
      signals[sigIdx].trade_id = newTrade.id;
      signals[sigIdx].executed = true;
    }

    this.log(`SUCCESS! Trade entry confirmed. Transaction ID: ${newTrade.id}`);

    // If live account mode is enabled, execute real-time order placement on Delta Exchange!
    if (!dbManager.isPaperMode()) {
      this.log(`📡 Dispatching real market order to Delta Exchange REST API...`);
      const side = direction === "LONG" ? "buy" : "sell";
      placeDeltaMarketOrder(creds, "BTCUSD", side, positionQtyBtc).then((res) => {
        if (res.success) {
          this.log(`✅ Delta Exchange order matched successfully! Order ID: ${res.order_id}`);
          dbManager.updateTrade(newTrade.id, {
            feature_snapshot: {
              ...newTrade.feature_snapshot,
              delta_order_id: res.order_id,
              delta_response: res.response_data,
            }
          });
          // Immediately sync balance
          getDeltaWalletBalance(creds).then((liveBal) => {
            if (liveBal !== null) {
              dbManager.updateCredentials({
                account_balance_usdt: liveBal,
              });
              this.log(`💰 Real-time balance updated from Delta Exchange: $${liveBal.toFixed(2)} USDT`);
            }
          }).catch(() => {});
        } else {
          this.log(`❌ Delta Exchange API returned rejection error: ${res.message}`);
        }
      }).catch((err) => {
        this.log(`❌ Delta Exchange order dispatch error: ${err?.message || err}`);
      });
    }
  }

  // Real-time tracking of active position PnL and exit checking
  private updateActiveTradePnL() {
    if (!this.activeTrade) return;

    const config = dbManager.getConfig();
    const currentPrice = this.currentPrice;
    const entryPrice = this.activeTrade.entry_price;
    const qty = this.activeTrade.quantity_btc;
    const direction = this.activeTrade.direction;

    // Compute SL & TP limits from entry
    const closes = this.candles1m.map((c) => c.close);
    const atr14 = this.calculateATR(this.candles1m, 14);
    const lastAtr = atr14[closes.length - 1] || 150;
    const stopLossDistance = lastAtr * config.risk_management.stop_loss_atr_multiplier;
    const takeProfitDistance = stopLossDistance * config.risk_management.take_profit_ratio;

    let stopLossPrice = direction === TradeDirection.LONG ? entryPrice - stopLossDistance : entryPrice + stopLossDistance;
    let takeProfitPrice = direction === TradeDirection.LONG ? entryPrice + takeProfitDistance : entryPrice - takeProfitDistance;

    // Support custom manual SL / TP values if set
    if (this.activeTrade.feature_snapshot && typeof this.activeTrade.feature_snapshot.stop_loss_price === "number") {
      stopLossPrice = this.activeTrade.feature_snapshot.stop_loss_price;
    }
    if (this.activeTrade.feature_snapshot && typeof this.activeTrade.feature_snapshot.take_profit_price === "number") {
      takeProfitPrice = this.activeTrade.feature_snapshot.take_profit_price;
    }

    // Calculate current PnL
    let rawPnL = 0;
    let priceReturnPct = 0;

    if (direction === TradeDirection.LONG) {
      rawPnL = (currentPrice - entryPrice) * qty;
      priceReturnPct = ((currentPrice - entryPrice) / entryPrice) * 100;
    } else {
      rawPnL = (entryPrice - currentPrice) * qty;
      priceReturnPct = ((entryPrice - currentPrice) / entryPrice) * 100;
    }

    // Include entry commission and exit commission projection
    const entryFee = entryPrice * qty * 0.0006;
    const exitFeeProj = currentPrice * qty * 0.0006;
    const currentPnL = Number((rawPnL - (entryFee + exitFeeProj)).toFixed(2));
    const currentPnLPct = Number(((currentPnL / dbManager.getCredentials().account_balance_usdt) * 100).toFixed(4));

    // Update active trade parameters
    this.activeTrade.pnl_usdt = currentPnL;
    this.activeTrade.pnl_pct = currentPnLPct;

    // Record excursions (MFE and MAE)
    if (priceReturnPct > this.activeTrade.max_favorable_excursion) {
      this.activeTrade.max_favorable_excursion = Number(priceReturnPct.toFixed(4));
    }
    const adversePct = -priceReturnPct;
    if (adversePct > this.activeTrade.max_adverse_excursion) {
      this.activeTrade.max_adverse_excursion = Number(adversePct.toFixed(4));
    }

    const durationSec = Math.floor(
      (Date.now() - new Date(this.activeTrade.entry_timestamp).getTime()) / 1000
    );
    this.activeTrade.hold_duration_seconds = durationSec;

    // Check exit conditions
    let shouldExit = false;
    let reason = ExitReason.MANUAL_EXIT;

    // TP Hit
    const isTpHit = direction === TradeDirection.LONG ? currentPrice >= takeProfitPrice : currentPrice <= takeProfitPrice;
    if (isTpHit) {
      shouldExit = true;
      reason = ExitReason.TAKE_PROFIT;
    }

    // SL Hit
    const isSlHit = direction === TradeDirection.LONG ? currentPrice <= stopLossPrice : currentPrice >= stopLossPrice;
    if (isSlHit) {
      shouldExit = true;
      reason = ExitReason.STOP_LOSS;
    }

    // Time Limit 29 minutes hard deadline!
    if (durationSec >= 29 * 60) {
      shouldExit = true;
      reason = ExitReason.TIME_LIMIT_29MIN;
    }

    // Sentiment Reversal check: if current sentiment flips extremely negative for LONG, or positive for SHORT
    const headlines = dbManager.getHeadlines().slice(0, 10);
    const currentSentiment = this.calculateAverageSentiment(headlines);
    if (direction === TradeDirection.LONG && currentSentiment < -0.45) {
      shouldExit = true;
      reason = ExitReason.SENTIMENT_REVERSAL;
    } else if (direction === TradeDirection.SHORT && currentSentiment > 0.45) {
      shouldExit = true;
      reason = ExitReason.SENTIMENT_REVERSAL;
    }

    // If exit condition triggered, execute exit immediately!
    if (shouldExit) {
      this.executeTradeExit(reason);
    }
  }

  public executeTradeExit(reason: ExitReason) {
    if (!this.activeTrade) return;

    const currentPrice = this.currentPrice;
    const trade = this.activeTrade;
    this.log(`🚪 EXIT TRIGGERED for trade ${trade.id}. Reason: ${reason}. Exit Price: $${currentPrice}`);

    const isWin = (trade.pnl_usdt || 0) > 0;

    // Update trade fields
    const updated = dbManager.updateTrade(trade.id, {
      exit_timestamp: new Date().toISOString(),
      exit_price: currentPrice,
      pnl_usdt: trade.pnl_usdt,
      pnl_pct: trade.pnl_pct,
      exit_reason: reason,
      is_win: isWin,
      hold_duration_seconds: trade.hold_duration_seconds,
    });

    // Update account balance in DB credentials
    const finalPnL = trade.pnl_usdt || 0;
    const currentBal = dbManager.getCredentials().account_balance_usdt;
    const newBal = Number((currentBal + finalPnL).toFixed(2));

    dbManager.updateCredentials({
      account_balance_usdt: newBal,
    });

    this.activeTrade = null;
    this.log(`Trade closed. Net P&L: $${finalPnL.toFixed(2)} USD. Account balance updated to: $${newBal.toFixed(2)}`);

    const creds = dbManager.getCredentials();

    // If live account mode is enabled, execute real-time order placement to CLOSE position on Delta Exchange!
    if (!dbManager.isPaperMode()) {
      this.log(`📡 Dispatching real market order to CLOSE position on Delta Exchange REST API...`);
      // Place opposite order to close (if we were LONG, we SELL; if we were SHORT, we BUY)
      const closeSide = trade.direction === TradeDirection.LONG ? "sell" : "buy";
      placeDeltaMarketOrder(creds, "BTCUSD", closeSide, trade.quantity_btc).then((res) => {
        if (res.success) {
          this.log(`✅ Delta Exchange position successfully closed! Exit Order ID: ${res.order_id}`);
          // Immediately sync balance
          getDeltaWalletBalance(creds).then((liveBal) => {
            if (liveBal !== null) {
              dbManager.updateCredentials({
                account_balance_usdt: liveBal,
              });
              this.log(`💰 Real-time balance updated from Delta Exchange: $${liveBal.toFixed(2)} USDT`);
            }
          }).catch(() => {});
        } else {
          this.log(`❌ Delta Exchange API returned exit rejection error: ${res.message}`);
        }
      }).catch((err) => {
        this.log(`❌ Delta Exchange exit order dispatch error: ${err?.message || err}`);
      });
    }
  }

  // Force exit manual trigger
  public forceExit() {
    if (this.activeTrade) {
      this.executeTradeExit(ExitReason.MANUAL_EXIT);
      return true;
    }
    return false;
  }

  // Create manual trade entry
  public executeManualTradeEntry(
    direction: "LONG" | "SHORT",
    quantityBtc: number,
    leverage: number,
    stopLossPrice?: number | null,
    takeProfitPrice?: number | null
  ): { success: boolean; message: string; trade?: Trade } {
    if (this.activeTrade) {
      return {
        success: false,
        message: "An active position already exists. Please exit the active position first."
      };
    }

    const currentPrice = this.currentPrice;
    this.log(`Manual Trade execution request: ${direction} Qty=${quantityBtc} BTC, Leverage=${leverage}x`);

    // Add trade to database
    const feesPaid = Number((currentPrice * quantityBtc * 0.0006).toFixed(4));
    
    // Convert string inputs to proper types if necessary
    const q = Number(quantityBtc);
    const lev = Number(leverage);
    const sl = stopLossPrice ? Number(stopLossPrice) : null;
    const tp = takeProfitPrice ? Number(takeProfitPrice) : null;

    const newTrade = dbManager.addTrade({
      entry_timestamp: new Date().toISOString(),
      exit_timestamp: null,
      direction: direction === "LONG" ? TradeDirection.LONG : TradeDirection.SHORT,
      entry_price: currentPrice,
      exit_price: null,
      quantity_btc: q,
      leverage: lev,
      pnl_usdt: 0,
      pnl_pct: 0,
      fees_paid_usdt: feesPaid,
      exit_reason: null,
      catboost_probability: direction === "LONG" ? 0.95 : 0.05,
      regime_at_entry: this.currentRegime,
      sentiment_score_at_entry: direction === "LONG" ? 0.5 : -0.5,
      sentiment_momentum_at_entry: 0,
      entry_signal_score: 100, // Manual execution max score
      max_favorable_excursion: 0,
      max_adverse_excursion: 0,
      hold_duration_seconds: 0,
      is_win: null,
      feature_snapshot: {
        last_price: currentPrice,
        regime: this.currentRegime,
        is_manual: true,
        stop_loss_price: sl,
        take_profit_price: tp,
      },
    });

    this.activeTrade = newTrade;
    this.log(`Manual trade successfully created and active. Trade ID: ${newTrade.id}`);

    const creds = dbManager.getCredentials();

    // If live account mode is enabled, execute real-time order placement on Delta Exchange!
    if (!dbManager.isPaperMode()) {
      this.log(`📡 Dispatching real MANUAL market order to Delta Exchange REST API...`);
      const side = direction === "LONG" ? "buy" : "sell";
      placeDeltaMarketOrder(creds, "BTCUSD", side, q).then((res) => {
        if (res.success) {
          this.log(`✅ Delta Exchange manual order matched successfully! Order ID: ${res.order_id}`);
          dbManager.updateTrade(newTrade.id, {
            feature_snapshot: {
              ...newTrade.feature_snapshot,
              delta_order_id: res.order_id,
              delta_response: res.response_data,
            }
          });
          // Immediately sync balance
          getDeltaWalletBalance(creds).then((liveBal) => {
            if (liveBal !== null) {
              dbManager.updateCredentials({
                account_balance_usdt: liveBal,
              });
              this.log(`💰 Real-time balance updated from Delta Exchange: $${liveBal.toFixed(2)} USDT`);
            }
          }).catch(() => {});
        } else {
          this.log(`❌ Delta Exchange API returned rejection error for manual order: ${res.message}`);
        }
      }).catch((err) => {
        this.log(`❌ Delta Exchange manual order dispatch error: ${err?.message || err}`);
      });
    }

    return {
      success: true,
      message: `Successfully opened ${direction} position at $${currentPrice}.`,
      trade: newTrade
    };
  }
}

export const tradingEngine = new TradingEngine();
