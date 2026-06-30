import { dbManager } from './db';

// Interfaces for engine
export interface Candlestick {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface GateStatus {
  name: string;
  met: boolean;
  value: string;
  required: string;
  weight: number;
  skipped: boolean;
}

export interface Trade {
  id: string;
  time: number;
  type: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number | null;
  status: 'ACTIVE' | 'CLOSED';
  pnl: number;
  pnlPercent: number;
  stopLoss: number;
  takeProfit: number;
  score: number;
  reason: string;
}

export interface StrategyConfig {
  leverage: number;
  riskPercent: number;
  entryScoreThreshold: number;
  requiredRelativeVolume: number;
  adxThreshold: number;
  newsProtectionMinutes: number;
  pullbackMaxPercent: number; // Max distance from EMA 21 to trigger pullback entry
  skippedGates: string[];
}

export class TradingEngine {
  private static instance: TradingEngine | null = null;
  
  private candles1m: Candlestick[] = [];
  private candles15m: Candlestick[] = [];
  private currentPrice: number = 65000;
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private logs: string[] = [];
  private trades: Trade[] = [];
  
  private config: StrategyConfig = {
    leverage: 10,
    riskPercent: 2,
    entryScoreThreshold: 75,
    requiredRelativeVolume: 1.5,
    adxThreshold: 20,
    newsProtectionMinutes: 15,
    pullbackMaxPercent: 0.15, // 0.15% from EMA 21
    skippedGates: []
  };

  private lastNewsTime: number = 0;
  private lastNewsImpact: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  private lastNewsHeadline: string = '';

  private constructor() {
    this.trades = dbManager.getTrades();
    this.config = dbManager.getConfig() || this.config;
    this.logs.push(`[${new Date().toISOString()}] Trading Engine initialized.`);
  }

  public static getInstance(): TradingEngine {
    if (!TradingEngine.instance) {
      TradingEngine.instance = new TradingEngine();
    }
    return TradingEngine.instance;
  }

  public async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.log("Starting Trading Engine core loop...");
    
    // Fetch initial candles
    await this.initCandles();
    
    // Start interval loop (every 3 seconds to simulate/fetch new ticks)
    this.intervalId = setInterval(async () => {
      await this.tick();
    }, 3000);
  }

  public stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.log("Trading Engine stopped.");
  }

  private log(message: string) {
    const formatted = `[${new Date().toLocaleTimeString()}] ${message}`;
    this.logs.unshift(formatted);
    if (this.logs.length > 200) this.logs.pop();
    console.log(formatted);
  }

  private async initCandles() {
    this.log("Initializing historical 1-minute and 15-minute candlestick data...");
    let success1m = false;
    let success15m = false;

    // Fetch 1-minute candles from Binance
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      
      const res = await fetch(
        'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=100',
        { signal: controller.signal }
      );
      clearTimeout(timeoutId);
      
      if (res.ok) {
        const data = await res.json() as any[];
        this.candles1m = data.map(d => ({
          time: Number(d[0]),
          open: Number(d[1]),
          high: Number(d[2]),
          low: Number(d[3]),
          close: Number(d[4]),
          volume: Number(d[5]),
        }));
        if (this.candles1m.length > 0) {
          this.currentPrice = this.candles1m[this.candles1m.length - 1].close;
          success1m = true;
          this.log(`Successfully fetched ${this.candles1m.length} 1-minute candles from Binance.`);
        }
      }
    } catch (err) {
      this.log("Failed to fetch 1m candles from Binance. Using generated fallback.");
    }

    // Fetch 15-minute candles from Binance
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      
      const res = await fetch(
        'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=100',
        { signal: controller.signal }
      );
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json() as any[];
        this.candles15m = data.map(d => ({
          time: Number(d[0]),
          open: Number(d[1]),
          high: Number(d[2]),
          low: Number(d[3]),
          close: Number(d[4]),
          volume: Number(d[5]),
        }));
        if (this.candles15m.length > 0) {
          success15m = true;
          this.log(`Successfully fetched ${this.candles15m.length} 15-minute candles from Binance.`);
        }
      }
    } catch (err) {
      this.log("Failed to fetch 15m candles from Binance. Using generated fallback.");
    }

    // Fallbacks if Binance API fails
    if (!success1m) {
      this.candles1m = this.generateHistoricalCandles(1, 100);
      this.currentPrice = this.candles1m[this.candles1m.length - 1].close;
    }
    if (!success15m) {
      this.candles15m = this.generateHistoricalCandles(15, 100);
    }
  }

  private generateHistoricalCandles(intervalMinutes: number, count: number): Candlestick[] {
    const list: Candlestick[] = [];
    let price = 65000;
    let time = Date.now() - (count * intervalMinutes * 60 * 1000);
    
    for (let i = 0; i < count; i++) {
      const change = (Math.random() - 0.495) * 200; // slight upward bias
      const open = price;
      const close = price + change;
      const high = Math.max(open, close) + Math.random() * 50;
      const low = Math.min(open, close) - Math.random() * 50;
      const volume = Math.random() * 50 + 10;
      
      list.push({ time, open, high, low, close, volume });
      price = close;
      time += intervalMinutes * 60 * 1000;
    }
    return list;
  }

  private async tick() {
    // 1. Simulate subtle live price action or fetch latest tick from Binance
    try {
      const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
      if (res.ok) {
        const data = await res.json() as { price: string };
        const fetchedPrice = Number(data.price);
        if (!isNaN(fetchedPrice) && fetchedPrice > 0) {
          this.currentPrice = fetchedPrice;
        } else {
          this.simulatePriceChange();
        }
      } else {
        this.simulatePriceChange();
      }
    } catch {
      this.simulatePriceChange();
    }

    // 2. Add current tick to the active 1m candle
    this.updateCandlesWithLatestPrice();

    // 3. Manage active trades
    this.manageActiveTrades();

    // 4. Run strategy scan for entries
    this.scanForEntry();
  }

  private simulatePriceChange() {
    const volatility = 0.0005; // 0.05% typical tick
    const changePercent = (Math.random() - 0.49) * volatility; // slight positive drift
    this.currentPrice = Number((this.currentPrice * (1 + changePercent)).toFixed(2));
  }

  private updateCandlesWithLatestPrice() {
    const now = Date.now();
    
    // Update 1m candle
    if (this.candles1m.length === 0) return;
    let last1m = this.candles1m[this.candles1m.length - 1];
    
    // If a minute has elapsed, push a new candle
    if (now - last1m.time >= 60 * 1000) {
      const newCandle: Candlestick = {
        time: Math.floor(now / 60000) * 60000,
        open: last1m.close,
        high: this.currentPrice,
        low: this.currentPrice,
        close: this.currentPrice,
        volume: Math.random() * 5 + 1
      };
      this.candles1m.push(newCandle);
      if (this.candles1m.length > 200) this.candles1m.shift();
      last1m = this.candles1m[this.candles1m.length - 1];
    } else {
      last1m.close = this.currentPrice;
      last1m.high = Math.max(last1m.high, this.currentPrice);
      last1m.low = Math.min(last1m.low, this.currentPrice);
      last1m.volume += Math.random() * 0.1;
    }

    // Update 15m candle
    if (this.candles15m.length === 0) return;
    let last15m = this.candles15m[this.candles15m.length - 1];
    if (now - last15m.time >= 15 * 60 * 1000) {
      const newCandle: Candlestick = {
        time: Math.floor(now / 900000) * 900000,
        open: last15m.close,
        high: this.currentPrice,
        low: this.currentPrice,
        close: this.currentPrice,
        volume: Math.random() * 50 + 10
      };
      this.candles15m.push(newCandle);
      if (this.candles15m.length > 200) this.candles15m.shift();
    } else {
      last15m.close = this.currentPrice;
      last15m.high = Math.max(last15m.high, this.currentPrice);
      last15m.low = Math.min(last15m.low, this.currentPrice);
      last15m.volume += Math.random() * 0.5;
    }
  }

  // Calculate Exponential Moving Average (EMA)
  private calculateEMA(candles: Candlestick[], period: number): number[] {
    const values = candles.map(c => c.close);
    const ema: number[] = [];
    if (values.length === 0) return ema;

    const k = 2 / (period + 1);
    
    // Start with Simple Moving Average for first period
    let sum = 0;
    for (let i = 0; i < Math.min(period, values.length); i++) {
      sum += values[i];
    }
    let currentEma = sum / Math.min(period, values.length);
    ema.push(currentEma);

    for (let i = 1; i < values.length; i++) {
      currentEma = values[i] * k + currentEma * (1 - k);
      ema.push(currentEma);
    }
    return ema;
  }

  // Calculate Average True Range (ATR)
  private calculateATR(candles: Candlestick[], period: number = 14): number {
    if (candles.length < 2) return 100;
    let sumTR = 0;
    for (let i = candles.length - Math.min(period, candles.length - 1); i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      sumTR += tr;
    }
    return sumTR / period;
  }

  // Calculate ADX (Average Directional Index)
  private calculateADX(candles: Candlestick[], period: number = 14): number {
    if (candles.length < period * 2) return 25; // default robust fallback
    
    let plusDM = 0;
    let minusDM = 0;
    let sumTR = 0;

    for (let i = candles.length - period; i < candles.length; i++) {
      const highDiff = candles[i].high - candles[i - 1].high;
      const lowDiff = candles[i - 1].low - candles[i].low;
      
      const tr = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      );
      sumTR += tr;

      if (highDiff > lowDiff && highDiff > 0) plusDM += highDiff;
      if (lowDiff > highDiff && lowDiff > 0) minusDM += lowDiff;
    }

    if (sumTR === 0) return 20;
    const diPlus = (plusDM / sumTR) * 100;
    const diMinus = (minusDM / sumTR) * 100;
    
    const sumDI = diPlus + diMinus;
    if (sumDI === 0) return 20;
    const dx = (Math.abs(diPlus - diMinus) / sumDI) * 100;
    
    // Simulate ADX smoothing
    return Number(dx.toFixed(2));
  }

  // Check if a gate/checkpoint is set to be skipped
  private isGateSkipped(config: StrategyConfig, gateName: string): boolean {
    return config.skippedGates.includes(gateName);
  }

  private scanForEntry() {
    // Prevent entry if there is an active trade
    const active = this.trades.find(t => t.status === 'ACTIVE');
    if (active) return;

    // Check News Protection Block
    const now = Date.now();
    const minutesSinceNews = (now - this.lastNewsTime) / 60000;
    if (this.lastNewsImpact === 'HIGH' && minutesSinceNews < this.config.newsProtectionMinutes) {
      // News protection is active, entries blocked
      return;
    }

    // Run Strategy Calculations
    const ema21_1m = this.calculateEMA(this.candles1m, 21);
    const ema50_1m = this.calculateEMA(this.candles1m, 50);
    const ema21_15m = this.calculateEMA(this.candles15m, 21);
    const ema50_15m = this.calculateEMA(this.candles15m, 50);

    const lastEma21_1m = ema21_1m[ema21_1m.length - 1] || this.currentPrice;
    const lastEma50_1m = ema50_1m[ema50_1m.length - 1] || this.currentPrice;
    const lastEma21_15m = ema21_15m[ema21_15m.length - 1] || this.currentPrice;
    const lastEma50_15m = ema50_15m[ema50_15m.length - 1] || this.currentPrice;

    // Check Relative Volume (1m candle relative to last 20 1m candles)
    const recentCandles = this.candles1m.slice(-20);
    const avgVolume = recentCandles.reduce((sum, c) => sum + c.volume, 0) / Math.max(1, recentCandles.length);
    const currentVolume = this.candles1m[this.candles1m.length - 1]?.volume || 1;
    const relVolume = currentVolume / Math.max(0.1, avgVolume);

    // ADX calculation
    const adx = this.calculateADX(this.candles1m);

    // CatBoost simulation (uses candle indicators for high quality simulation)
    const lastCandle = this.candles1m[this.candles1m.length - 1];
    const rsiSim = lastCandle ? ((lastCandle.close - lastCandle.open) / (lastCandle.high - lastCandle.low + 1)) * 50 + 50 : 50;
    const longProbability = Number((rsiSim * 0.6 + (this.currentPrice > lastEma21_1m ? 20 : 0) + Math.random() * 20).toFixed(1));
    const shortProbability = Number((100 - longProbability).toFixed(1));

    // Evaluate Checkpoints for LONG
    let longScore = 0;
    const longGates: GateStatus[] = [];

    // 1. CatBoost AI Prediction (threshold: Long > 60%)
    const catboostLongMet = longProbability >= 60;
    longGates.push({
      name: "CatBoost AI Prediction",
      met: catboostLongMet,
      value: `Bullish Prob: ${longProbability}%`,
      required: ">= 60%",
      weight: 35,
      skipped: this.isGateSkipped(this.config, "CatBoost AI Prediction")
    });
    if (catboostLongMet || this.isGateSkipped(this.config, "CatBoost AI Prediction")) {
      longScore += 35;
    }

    // 2. Market Regime Filter (Trending confirmation)
    const regimeLongMet = adx >= this.config.adxThreshold;
    longGates.push({
      name: "Market Regime Filter",
      met: regimeLongMet,
      value: `ADX: ${adx.toFixed(1)}`,
      required: `>= ${this.config.adxThreshold}`,
      weight: 15,
      skipped: this.isGateSkipped(this.config, "Market Regime Filter")
    });
    if (regimeLongMet || this.isGateSkipped(this.config, "Market Regime Filter")) {
      longScore += 15;
    }

    // 3. Exponential Trend Alignment (1-Min EMA alignment)
    const emaLongAligned_1m = this.currentPrice > lastEma21_1m && lastEma21_1m > lastEma50_1m;
    longGates.push({
      name: "Exponential Trend Alignment",
      met: emaLongAligned_1m,
      value: `EMA21 (${lastEma21_1m.toFixed(1)}) > EMA50 (${lastEma50_1m.toFixed(1)})`,
      required: "Price > EMA21 > EMA50",
      weight: 15,
      skipped: this.isGateSkipped(this.config, "Exponential Trend Alignment")
    });
    if (emaLongAligned_1m || this.isGateSkipped(this.config, "Exponential Trend Alignment")) {
      longScore += 15;
    }

    // 4. 15-Min Trend Filter
    const emaLongAligned_15m = lastEma21_15m > lastEma50_15m;
    longGates.push({
      name: "15-Min Trend Filter",
      met: emaLongAligned_15m,
      value: `15m EMA21 (${lastEma21_15m.toFixed(1)}) > EMA50 (${lastEma50_15m.toFixed(1)})`,
      required: "EMA21 > EMA50 (15m)",
      weight: 15,
      skipped: this.isGateSkipped(this.config, "15-Min Trend Filter")
    });
    if (emaLongAligned_15m || this.isGateSkipped(this.config, "15-Min Trend Filter")) {
      longScore += 15;
    }

    // 5. Sentiment Engine Alignment
    const headlines = dbManager.getHeadlines();
    const sentScore = headlines.reduce((sum, h) => sum + h.sentiment, 0) / Math.max(1, headlines.length);
    const sentimentLongMet = sentScore >= 0.05; // Bullish sentiment
    longGates.push({
      name: "Sentiment Engine Alignment",
      met: sentimentLongMet,
      value: `Sentiment: ${sentScore >= 0.1 ? 'Bullish' : sentScore <= -0.1 ? 'Bearish' : 'Neutral'} (${sentScore.toFixed(2)})`,
      required: ">= 0.05 Score",
      weight: 15,
      skipped: this.isGateSkipped(this.config, "Sentiment Engine Alignment")
    });
    if (sentimentLongMet || this.isGateSkipped(this.config, "Sentiment Engine Alignment")) {
      longScore += 15;
    }

    // 6. Relative Volume Confirmation
    const volMet = relVolume >= this.config.requiredRelativeVolume;
    longGates.push({
      name: "Relative Volume Confirmation",
      met: volMet,
      value: `Rel Vol: ${relVolume.toFixed(2)}x`,
      required: `>= ${this.config.requiredRelativeVolume}x`,
      weight: 10,
      skipped: this.isGateSkipped(this.config, "Relative Volume Confirmation")
    });
    if (volMet || this.isGateSkipped(this.config, "Relative Volume Confirmation")) {
      longScore += 10;
    }

    // 7. ADX Trend Strength Filter
    const adxStrengthMet = adx >= 20;
    longGates.push({
      name: "ADX Trend Strength Filter",
      met: adxStrengthMet,
      value: `ADX: ${adx.toFixed(1)}`,
      required: ">= 20",
      weight: 10,
      skipped: this.isGateSkipped(this.config, "ADX Trend Strength Filter")
    });
    if (adxStrengthMet || this.isGateSkipped(this.config, "ADX Trend Strength Filter")) {
      longScore += 10;
    }

    // Evaluate Checkpoints for SHORT
    let shortScore = 0;
    const shortGates: GateStatus[] = [];

    // 1. CatBoost AI Prediction (Short)
    const catboostShortMet = shortProbability >= 60;
    shortGates.push({
      name: "CatBoost AI Prediction",
      met: catboostShortMet,
      value: `Bearish Prob: ${shortProbability}%`,
      required: ">= 60%",
      weight: 35,
      skipped: this.isGateSkipped(this.config, "CatBoost AI Prediction")
    });
    if (catboostShortMet || this.isGateSkipped(this.config, "CatBoost AI Prediction")) {
      shortScore += 35;
    }

    // 2. Market Regime Filter (Short)
    const regimeShortMet = adx >= this.config.adxThreshold;
    shortGates.push({
      name: "Market Regime Filter",
      met: regimeShortMet,
      value: `ADX: ${adx.toFixed(1)}`,
      required: `>= ${this.config.adxThreshold}`,
      weight: 15,
      skipped: this.isGateSkipped(this.config, "Market Regime Filter")
    });
    if (regimeShortMet || this.isGateSkipped(this.config, "Market Regime Filter")) {
      shortScore += 15;
    }

    // 3. Exponential Trend Alignment (Bearish 1-Min EMA alignment)
    const emaShortAligned_1m = this.currentPrice < lastEma21_1m && lastEma21_1m < lastEma50_1m;
    shortGates.push({
      name: "Exponential Trend Alignment",
      met: emaShortAligned_1m,
      value: `EMA21 (${lastEma21_1m.toFixed(1)}) < EMA50 (${lastEma50_1m.toFixed(1)})`,
      required: "Price < EMA21 < EMA50",
      weight: 15,
      skipped: this.isGateSkipped(this.config, "Exponential Trend Alignment")
    });
    if (emaShortAligned_1m || this.isGateSkipped(this.config, "Exponential Trend Alignment")) {
      shortScore += 15;
    }

    // 4. 15-Min Trend Filter (Short)
    const emaShortAligned_15m = lastEma21_15m < lastEma50_15m;
    shortGates.push({
      name: "15-Min Trend Filter",
      met: emaShortAligned_15m,
      value: `15m EMA21 (${lastEma21_15m.toFixed(1)}) < EMA50 (${lastEma50_15m.toFixed(1)})`,
      required: "EMA21 < EMA50 (15m)",
      weight: 15,
      skipped: this.isGateSkipped(this.config, "15-Min Trend Filter")
    });
    if (emaShortAligned_15m || this.isGateSkipped(this.config, "15-Min Trend Filter")) {
      shortScore += 15;
    }

    // 5. Sentiment Engine Alignment (Short)
    const sentimentShortMet = sentScore <= -0.05; // Bearish sentiment
    shortGates.push({
      name: "Sentiment Engine Alignment",
      met: sentimentShortMet,
      value: `Sentiment: ${sentScore >= 0.1 ? 'Bullish' : sentScore <= -0.1 ? 'Bearish' : 'Neutral'} (${sentScore.toFixed(2)})`,
      required: "<= -0.05 Score",
      weight: 15,
      skipped: this.isGateSkipped(this.config, "Sentiment Engine Alignment")
    });
    if (sentimentShortMet || this.isGateSkipped(this.config, "Sentiment Engine Alignment")) {
      shortScore += 15;
    }

    // 6. Relative Volume Confirmation (Short)
    shortGates.push({
      name: "Relative Volume Confirmation",
      met: volMet,
      value: `Rel Vol: ${relVolume.toFixed(2)}x`,
      required: `>= ${this.config.requiredRelativeVolume}x`,
      weight: 10,
      skipped: this.isGateSkipped(this.config, "Relative Volume Confirmation")
    });
    if (volMet || this.isGateSkipped(this.config, "Relative Volume Confirmation")) {
      shortScore += 10;
    }

    // 7. ADX Trend Strength Filter (Short)
    shortGates.push({
      name: "ADX Trend Strength Filter",
      met: adxStrengthMet,
      value: `ADX: ${adx.toFixed(1)}`,
      required: ">= 20",
      weight: 10,
      skipped: this.isGateSkipped(this.config, "ADX Trend Strength Filter")
    });
    if (adxStrengthMet || this.isGateSkipped(this.config, "ADX Trend Strength Filter")) {
      shortScore += 10;
    }

    // Check entry logic
    if (longScore >= this.config.entryScoreThreshold) {
      // Pullback validation for LONG
      const pctDistanceFromEMA = Math.abs((this.currentPrice - lastEma21_1m) / lastEma21_1m) * 100;
      const isPullbackConfirmed = pctDistanceFromEMA <= this.config.pullbackMaxPercent;

      if (isPullbackConfirmed) {
        this.executeEntry('LONG', longScore, `Long score threshold (${longScore}/${this.config.entryScoreThreshold}) met and price pulling back to EMA21 (distance: ${pctDistanceFromEMA.toFixed(3)}%)`);
      } else {
        this.log(`LONG score threshold met (${longScore} >= ${this.config.entryScoreThreshold}), but entry BLOCKED by Pullback Filter (Distance: ${pctDistanceFromEMA.toFixed(2)}% > Max: ${this.config.pullbackMaxPercent}%)`);
      }
    } else if (shortScore >= this.config.entryScoreThreshold) {
      // Pullback validation for SHORT
      const pctDistanceFromEMA = Math.abs((this.currentPrice - lastEma21_1m) / lastEma21_1m) * 100;
      const isPullbackConfirmed = pctDistanceFromEMA <= this.config.pullbackMaxPercent;

      if (isPullbackConfirmed) {
        this.executeEntry('SHORT', shortScore, `Short score threshold (${shortScore}/${this.config.entryScoreThreshold}) met and price pulling back to EMA21 (distance: ${pctDistanceFromEMA.toFixed(3)}%)`);
      } else {
        this.log(`SHORT score threshold met (${shortScore} >= ${this.config.entryScoreThreshold}), but entry BLOCKED by Pullback Filter (Distance: ${pctDistanceFromEMA.toFixed(2)}% > Max: ${this.config.pullbackMaxPercent}%)`);
      }
    }
  }

  public forceManualEntry(type: 'LONG' | 'SHORT') {
    const active = this.trades.find(t => t.status === 'ACTIVE');
    if (active) {
      throw new Error("Cannot open a manual trade while another trade is active.");
    }
    this.executeEntry(type, 100, "Manual override trigger");
  }

  private executeEntry(type: 'LONG' | 'SHORT', score: number, reason: string) {
    const entryPrice = this.currentPrice;
    const atr = this.calculateATR(this.candles1m);
    
    // Position metrics with standard risk-to-reward (1:2 ratio)
    const slDistance = Math.max(atr * 1.5, entryPrice * 0.005); // dynamic Stop Loss
    const stopLoss = type === 'LONG' ? entryPrice - slDistance : entryPrice + slDistance;
    const takeProfit = type === 'LONG' ? entryPrice + (slDistance * 2) : entryPrice - (slDistance * 2);

    const newTrade: Trade = {
      id: Math.random().toString(36).substring(2, 9),
      time: Date.now(),
      type,
      entryPrice,
      exitPrice: null,
      status: 'ACTIVE',
      pnl: 0,
      pnlPercent: 0,
      stopLoss,
      takeProfit,
      score,
      reason
    };

    this.trades.unshift(newTrade);
    dbManager.saveTrades(this.trades);
    this.log(`🚀 ENTERED ${type} position at $${entryPrice.toFixed(2)}. SL: $${stopLoss.toFixed(2)}, TP: $${takeProfit.toFixed(2)}. Reason: ${reason}`);
  }

  private manageActiveTrades() {
    const active = this.trades.find(t => t.status === 'ACTIVE');
    if (!active) return;

    // Calculate dynamic PnL
    const diff = this.currentPrice - active.entryPrice;
    const directionMultiplier = active.type === 'LONG' ? 1 : -1;
    const priceChangePct = (diff / active.entryPrice) * 100;
    
    active.pnlPercent = priceChangePct * directionMultiplier * this.config.leverage;
    // PNL in dollars assuming nominal position size of 1 BTC
    active.pnl = diff * directionMultiplier * this.config.leverage;

    // Check Exit Conditions (SL, TP)
    let triggeredExit = false;
    let exitReason = '';

    if (active.type === 'LONG') {
      if (this.currentPrice <= active.stopLoss) {
        triggeredExit = true;
        exitReason = 'STOP_LOSS_HIT';
      } else if (this.currentPrice >= active.takeProfit) {
        triggeredExit = true;
        exitReason = 'TAKE_PROFIT_HIT';
      }
    } else {
      // SHORT
      if (this.currentPrice >= active.stopLoss) {
        triggeredExit = true;
        exitReason = 'STOP_LOSS_HIT';
      } else if (this.currentPrice <= active.takeProfit) {
        triggeredExit = true;
        exitReason = 'TAKE_PROFIT_HIT';
      }
    }

    if (triggeredExit) {
      active.status = 'CLOSED';
      active.exitPrice = this.currentPrice;
      dbManager.saveTrades(this.trades);
      this.log(`🔒 CLOSED ${active.type} trade at $${this.currentPrice.toFixed(2)}. PnL: ${active.pnlPercent.toFixed(2)}% ($${active.pnl.toFixed(2)}). Exit event: ${exitReason}`);
    }
  }

  public forceManualExit() {
    const active = this.trades.find(t => t.status === 'ACTIVE');
    if (!active) {
      throw new Error("No active trade to exit.");
    }
    active.status = 'CLOSED';
    active.exitPrice = this.currentPrice;
    dbManager.saveTrades(this.trades);
    this.log(`🔒 MANUALLY CLOSED ${active.type} trade at $${this.currentPrice.toFixed(2)}. Final PnL: ${active.pnlPercent.toFixed(2)}%`);
  }

  public addNewsHeadline(headline: string, impact: 'HIGH' | 'MEDIUM' | 'LOW', sentiment: number) {
    dbManager.addHeadline({
      id: Math.random().toString(36).substring(2, 9),
      time: Date.now(),
      headline,
      impact,
      sentiment
    });

    if (impact === 'HIGH') {
      this.lastNewsTime = Date.now();
      this.lastNewsImpact = 'HIGH';
      this.lastNewsHeadline = headline;
      this.log(`⚠️ HIGH IMPACT NEWS DETECTED: "${headline}". Entry protection timer triggered (blocks all entry scans for ${this.config.newsProtectionMinutes} mins)`);
    } else {
      this.log(`📰 Headline received: "${headline}" (Impact: ${impact}, Sentiment: ${sentiment})`);
    }
  }

  public updateConfig(newConfig: Partial<StrategyConfig>) {
    this.config = { ...this.config, ...newConfig };
    dbManager.saveConfig(this.config);
    this.log(`⚙️ Strategy configuration updated: ${JSON.stringify(newConfig)}`);
  }

  public getEngineStatus() {
    const ema21_1m = this.calculateEMA(this.candles1m, 21);
    const ema50_1m = this.calculateEMA(this.candles1m, 50);
    const ema21_15m = this.calculateEMA(this.candles15m, 21);
    const ema50_15m = this.calculateEMA(this.candles15m, 50);

    const lastEma21_1m = ema21_1m[ema21_1m.length - 1] || this.currentPrice;
    const lastEma50_1m = ema50_1m[ema50_1m.length - 1] || this.currentPrice;
    const lastEma21_15m = ema21_15m[ema21_15m.length - 1] || this.currentPrice;
    const lastEma50_15m = ema50_15m[ema50_15m.length - 1] || this.currentPrice;

    const recentCandles = this.candles1m.slice(-20);
    const avgVolume = recentCandles.reduce((sum, c) => sum + c.volume, 0) / Math.max(1, recentCandles.length);
    const currentVolume = this.candles1m[this.candles1m.length - 1]?.volume || 1;
    const relVolume = currentVolume / Math.max(0.1, avgVolume);
    
    const adx = this.calculateADX(this.candles1m);
    const lastCandle = this.candles1m[this.candles1m.length - 1];
    const rsiSim = lastCandle ? ((lastCandle.close - lastCandle.open) / (lastCandle.high - lastCandle.low + 1)) * 50 + 50 : 50;
    const longProbability = Number((rsiSim * 0.6 + (this.currentPrice > lastEma21_1m ? 20 : 0) + Math.random() * 20).toFixed(1));
    const shortProbability = Number((100 - longProbability).toFixed(1));

    // Compile Long and Short checkpoints
    const longCheckpoints = [
      { name: "CatBoost AI Prediction", met: longProbability >= 60, value: `${longProbability}%`, required: ">= 60%", weight: 35 },
      { name: "Market Regime Filter", met: adx >= this.config.adxThreshold, value: `ADX ${adx.toFixed(1)}`, required: `>= ${this.config.adxThreshold}`, weight: 15 },
      { name: "Exponential Trend Alignment", met: this.currentPrice > lastEma21_1m && lastEma21_1m > lastEma50_1m, value: `BTC (${this.currentPrice}) > EMA21 (${lastEma21_1m.toFixed(1)})`, required: "Bullish Alignment (1m)", weight: 15 },
      { name: "15-Min Trend Filter", met: lastEma21_15m > lastEma50_15m, value: `EMA21 (${lastEma21_15m.toFixed(1)}) > EMA50 (${lastEma50_15m.toFixed(1)})`, required: "EMA21 > EMA50 (15m)", weight: 15 },
      { name: "Sentiment Engine Alignment", met: (dbManager.getHeadlines().reduce((sum, h) => sum + h.sentiment, 0) / Math.max(1, dbManager.getHeadlines().length)) >= 0.05, value: `Score: ${(dbManager.getHeadlines().reduce((sum, h) => sum + h.sentiment, 0) / Math.max(1, dbManager.getHeadlines().length)).toFixed(2)}`, required: ">= 0.05 Score", weight: 15 },
      { name: "Relative Volume Confirmation", met: relVolume >= this.config.requiredRelativeVolume, value: `${relVolume.toFixed(2)}x`, required: `>= ${this.config.requiredRelativeVolume}x`, weight: 10 },
      { name: "ADX Trend Strength Filter", met: adx >= 20, value: `ADX ${adx.toFixed(1)}`, required: ">= 20", weight: 10 }
    ];

    const shortCheckpoints = [
      { name: "CatBoost AI Prediction", met: shortProbability >= 60, value: `${shortProbability}%`, required: ">= 60%", weight: 35 },
      { name: "Market Regime Filter", met: adx >= this.config.adxThreshold, value: `ADX ${adx.toFixed(1)}`, required: `>= ${this.config.adxThreshold}`, weight: 15 },
      { name: "Exponential Trend Alignment", met: this.currentPrice < lastEma21_1m && lastEma21_1m < lastEma50_1m, value: `BTC (${this.currentPrice}) < EMA21 (${lastEma21_1m.toFixed(1)})`, required: "Bearish Alignment (1m)", weight: 15 },
      { name: "15-Min Trend Filter", met: lastEma21_15m < lastEma50_15m, value: `EMA21 (${lastEma21_15m.toFixed(1)}) < EMA50 (${lastEma50_15m.toFixed(1)})`, required: "EMA21 < EMA50 (15m)", weight: 15 },
      { name: "Sentiment Engine Alignment", met: (dbManager.getHeadlines().reduce((sum, h) => sum + h.sentiment, 0) / Math.max(1, dbManager.getHeadlines().length)) <= -0.05, value: `Score: ${(dbManager.getHeadlines().reduce((sum, h) => sum + h.sentiment, 0) / Math.max(1, dbManager.getHeadlines().length)).toFixed(2)}`, required: "<= -0.05 Score", weight: 15 },
      { name: "Relative Volume Confirmation", met: relVolume >= this.config.requiredRelativeVolume, value: `${relVolume.toFixed(2)}x`, required: `>= ${this.config.requiredRelativeVolume}x`, weight: 10 },
      { name: "ADX Trend Strength Filter", met: adx >= 20, value: `ADX ${adx.toFixed(1)}`, required: ">= 20", weight: 10 }
    ];

    // Calculate long score
    let longScore = 0;
    longCheckpoints.forEach(g => {
      if (g.met || this.isGateSkipped(this.config, g.name)) {
        longScore += g.weight;
      }
    });

    // Calculate short score
    let shortScore = 0;
    shortCheckpoints.forEach(g => {
      if (g.met || this.isGateSkipped(this.config, g.name)) {
        shortScore += g.weight;
      }
    });

    const now = Date.now();
    const minutesSinceNews = (now - this.lastNewsTime) / 60000;
    const isNewsProtectionActive = this.lastNewsImpact === 'HIGH' && minutesSinceNews < this.config.newsProtectionMinutes;
    const newsProtectionTimeRemaining = isNewsProtectionActive ? Math.ceil(this.config.newsProtectionMinutes - minutesSinceNews) : 0;

    const pullbackDistance = Math.abs((this.currentPrice - lastEma21_1m) / lastEma21_1m) * 100;

    return {
      currentPrice: this.currentPrice,
      isRunning: this.isRunning,
      config: this.config,
      longScore,
      shortScore,
      longCheckpoints: longCheckpoints.map(g => ({ ...g, skipped: this.isGateSkipped(this.config, g.name) })),
      shortCheckpoints: shortCheckpoints.map(g => ({ ...g, skipped: this.isGateSkipped(this.config, g.name) })),
      trades: this.trades,
      logs: this.logs,
      headlines: dbManager.getHeadlines(),
      indicators: {
        ema21_1m: lastEma21_1m,
        ema50_1m: lastEma50_1m,
        ema21_15m: lastEma21_15m,
        ema50_15m: lastEma50_15m,
        adx,
        relVolume,
        pullbackDistance,
      },
      newsProtection: {
        active: isNewsProtectionActive,
        remainingMinutes: newsProtectionTimeRemaining,
        lastHeadline: this.lastNewsHeadline
      },
      candles1m: this.candles1m.slice(-30), // send last 30 candles for simple live chart
    };
  }
}
