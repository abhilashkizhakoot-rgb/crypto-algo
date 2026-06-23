/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Play,
  Square,
  AlertOctagon,
  ShieldAlert,
  TrendingUp,
  TrendingDown,
  Activity,
  Cpu,
  BarChart2,
  Newspaper,
  Terminal,
  RotateCw,
  TrendingUp as TrendUpIcon,
  CheckCircle,
  XCircle,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
} from "recharts";
import {
  Trade,
  TradingSignal,
  NewsHeadline,
  MarketRegime,
  ConnectionStatus,
  TradeDirection,
  ExitReason,
} from "../types.js";

interface DashboardProps {
  status: any;
  trades: Trade[];
  signals: TradingSignal[];
  headlines: NewsHeadline[];
  logs: string[];
  onRefresh: () => void;
}

export default function Dashboard({
  status,
  trades,
  signals,
  headlines,
  logs,
  onRefresh,
}: DashboardProps) {
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const activeTrade = status.active_trade as Trade | null;
  const isTradingActive = status.is_trading_active;

  const handleToggleTrading = async () => {
    if (isTradingActive) {
      setIsStopping(true);
      await fetch("/api/trading/stop", { method: "POST" });
      setIsStopping(false);
    } else {
      setIsStarting(true);
      await fetch("/api/trading/start", { method: "POST" });
      setIsStarting(false);
    }
    onRefresh();
  };

  const handleForceExit = async () => {
    if (!activeTrade) return;
    setIsExiting(true);
    await fetch("/api/trading/force-exit", { method: "POST" });
    setIsExiting(false);
    onRefresh();
  };

  // Convert logs to short display format
  const recentLogs = logs.slice(0, 15);

  // Compute mock chart data for the candlestick view
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    // Generate close price path with MA9, MA21 based on status current price
    const basePrice = status.current_price || 101500;
    const dataPoints: any[] = [];
    const now = Date.now();

    for (let i = 30; i >= 0; i--) {
      const timeStr = new Date(now - i * 60000).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      // Simple wave logic
      const offset = Math.sin(i * 0.4) * 250 + Math.cos(i * 0.1) * 120 + (Math.random() - 0.5) * 80;
      const close = Number((basePrice - offset).toFixed(2));
      const ema21 = Number((close * 0.98 + (basePrice * 0.02)).toFixed(2));
      const ema50 = Number((close * 0.95 + (basePrice * 0.05)).toFixed(2));

      dataPoints.push({
        time: timeStr,
        price: close,
        ema21,
        ema50,
      });
    }
    setChartData(dataPoints);
  }, [status.current_price]);

  // Determine sentiment score status color
  const getSentimentColor = (score: number) => {
    if (score > 0.25) return "text-emerald-700 bg-emerald-50 border-emerald-200";
    if (score < -0.25) return "text-rose-700 bg-rose-50 border-rose-200";
    return "text-slate-500 bg-slate-50 border-slate-200";
  };

  // Format countdown text for trade active hold time
  const formatCountdown = (secs: number) => {
    const totalSecs = 29 * 60;
    const elapsed = secs;
    const remaining = Math.max(0, totalSecs - elapsed);
    const mins = Math.floor(remaining / 60);
    const s = remaining % 60;
    return `${mins.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")} / 29:00`;
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 p-1">
      {/* ================= COLUMN 1: LIVE BOT CONTROLS & TRADES TIMELINE ================= */}
      <div className="xl:col-span-1 flex flex-col gap-6" id="dashboard-col-controls">
        {/* Connection & Run Control Card */}
        <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5" id="bot-control-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-indigo-600" />
              <span className="font-sans font-semibold text-slate-850 text-sm">Execution Engine</span>
            </div>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>

          <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 flex justify-between items-center">
              <div>
                <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Bot Status</p>
                <p className={`text-sm font-sans font-bold mt-0.5 ${isTradingActive ? "text-emerald-600" : "text-amber-500"}`}>
                  {isTradingActive ? "ACTIVE SCANNING" : "PAUSED"}
                </p>
              </div>
              <button
                onClick={handleToggleTrading}
                disabled={isStarting || isStopping}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold font-sans cursor-pointer transition-colors duration-200 ${
                  isTradingActive
                    ? "bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 hover:text-amber-800"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                }`}
                id="btn-toggle-trading"
              >
                {isTradingActive ? (
                  <>
                    <Square className="w-3 h-3 fill-current" />
                    PAUSE ENGINE
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 fill-current" />
                    START ENGINE
                  </>
                )}
              </button>
            </div>

            {/* Quick Balance Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Account Equity</p>
                <p className="text-sm font-sans font-bold text-slate-800 mt-1">
                  ${status.account_balance_usdt?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Selected Asset</p>
                <p className="text-sm font-sans font-bold text-indigo-600 mt-1">BTCUSD-FUTURES</p>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Position Status */}
        <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5 flex-1 flex flex-col justify-between min-h-[300px]" id="active-position-card">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-600" />
                <span className="font-sans font-semibold text-slate-800 text-sm">Active Position</span>
              </div>
              {activeTrade && (
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                  activeTrade.direction === TradeDirection.LONG ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-rose-50 border border-rose-200 text-rose-700"
                }`}>
                  {activeTrade.direction}
                </span>
              )}
            </div>

            <AnimatePresence mode="wait">
              {activeTrade ? (
                <motion.div
                  key="active-trade-info"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-4"
                >
                  <div className="flex justify-between items-end border-b border-slate-100 pb-3">
                    <div>
                      <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Real-Time P&L</p>
                      <p className={`text-2xl font-sans font-extrabold mt-1 leading-none ${activeTrade.pnl_usdt && activeTrade.pnl_usdt >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {activeTrade.pnl_usdt && activeTrade.pnl_usdt >= 0 ? "+" : ""}
                        ${activeTrade.pnl_usdt?.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Leverage</p>
                      <p className="text-xs font-sans font-bold text-slate-700 mt-1">{activeTrade.leverage}x Cross</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs text-slate-600">
                    <div>
                      <p className="font-mono text-slate-400 uppercase text-[10px]">Entry Price</p>
                      <p className="font-sans font-semibold text-slate-800 mt-0.5">${activeTrade.entry_price.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="font-mono text-slate-400 uppercase text-[10px]">Position Size</p>
                      <p className="font-sans font-semibold text-slate-800 mt-0.5">{activeTrade.quantity_btc} BTC</p>
                    </div>
                    <div>
                      <p className="font-mono text-slate-400 uppercase text-[10px]">Model Confidence</p>
                      <p className="font-sans font-semibold text-slate-800 mt-0.5">{(activeTrade.catboost_probability * 100).toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="font-mono text-slate-400 uppercase text-[10px]">Hold Progress</p>
                      <p className="font-sans font-semibold text-slate-800 mt-0.5">{formatCountdown(activeTrade.hold_duration_seconds)}</p>
                    </div>
                  </div>

                  {/* hold progress bar out of 29 minutes */}
                  <div className="space-y-1 mt-2">
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
                      <div
                        className="bg-indigo-600 h-full transition-all duration-1000 rounded-full"
                        style={{ width: `${Math.min(100, (activeTrade.hold_duration_seconds / (29 * 60)) * 100)}%` }}
                      ></div>
                    </div>
                    <p className="text-[10px] font-mono text-slate-400 text-right">Hard deadline in 29 min</p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="no-active-trade"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-10 text-center"
                >
                  <Activity className="w-8 h-8 text-slate-300 animate-pulse mb-3" />
                  <p className="text-sm font-sans font-semibold text-slate-500">Scanning BTC Markets</p>
                  <p className="text-xs font-mono text-slate-400 mt-1 max-w-[200px] leading-relaxed">
                    {isTradingActive ? "Checking 10+ entry parameters on every candle close..." : "Bot is paused. Start scanning to initiate execution."}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {activeTrade && (
            <button
              onClick={handleForceExit}
              disabled={isExiting}
              className="w-full bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold font-sans py-2.5 rounded-lg transition-colors duration-200 mt-6 cursor-pointer flex items-center justify-center gap-1.5"
              id="btn-force-exit"
            >
              <Square className="w-3 h-3 fill-current" />
              FORCE EXECUTING EXIT (MARKET)
            </button>
          )}
        </div>
      </div>

      {/* ================= COLUMN 2 & 3: CHARTS & TELEMETRY ================= */}
      <div className="xl:col-span-2 flex flex-col gap-6" id="dashboard-col-chart">
        {/* Ticker Pricing Strip */}
        <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4" id="ticker-strip">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-indigo-50 rounded-xl text-indigo-600 border border-indigo-100">
              <BarChart2 className="w-5 h-5" />
            </span>
            <div>
              <p className="text-[10px] font-mono text-slate-400 uppercase leading-none">Bitcoin (USDT)</p>
              <p className="text-xl font-sans font-bold text-slate-800 mt-1 leading-none">
                ${status.current_price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6 text-sm">
            <div>
              <p className="text-[9px] font-mono text-slate-400 uppercase leading-none">Current Regime</p>
              <div className="flex items-center gap-1.5 mt-1 leading-none">
                <span className={`w-1.5 h-1.5 rounded-full ${status.current_regime === MarketRegime.RANGE_BOUND || status.current_regime === MarketRegime.LOW_VOLATILITY ? "bg-amber-500" : "bg-emerald-500"}`} />
                <span className="font-sans font-bold text-slate-700 uppercase text-xs">{status.current_regime?.replace("_", " ")}</span>
              </div>
            </div>

            <div>
              <p className="text-[9px] font-mono text-slate-400 uppercase leading-none">Economic Protection</p>
              {status.critical_event_active ? (
                <div className="flex items-center gap-1.5 mt-1 leading-none text-rose-600">
                  <ShieldAlert className="w-3.5 h-3.5 animate-bounce" />
                  <span className="font-sans font-bold uppercase text-xs">BLOCKED ({status.critical_event_keyword})</span>
                </div>
              ) : (
                <p className="font-sans font-bold text-emerald-600 text-xs mt-1">SHIELD ACTIVE (PASSING)</p>
              )}
            </div>
          </div>
        </div>

        {/* Main Chart Card */}
        <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5 flex flex-col justify-between" id="chart-card">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-600" />
                <span className="font-sans font-semibold text-slate-800 text-sm">Live Futures Tracker (1-Min candles)</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-indigo-500 rounded-full" /> Price
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full" /> EMA 21
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-amber-500 rounded-full" /> EMA 50
                </span>
              </div>
            </div>

            {/* Price Line chart */}
            <div className="h-[280px] w-full" id="live-futures-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 5, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="time" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis
                    domain={["auto", "auto"]}
                    stroke="#94a3b8"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => `$${val}`}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0" }}
                    labelStyle={{ color: "#64748b", fontSize: "10px" }}
                    itemStyle={{ fontSize: "11px", color: "#1e293b" }}
                  />
                  <Line type="monotone" dataKey="price" stroke="#4f46e5" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="ema21" stroke="#10b981" strokeWidth={1.2} dot={false} strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="ema50" stroke="#f59e0b" strokeWidth={1.2} dot={false} strokeDasharray="4 4" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 mt-2 flex justify-between items-center text-xs">
            <span className="font-mono text-slate-400">Live feed aggregated with Binance Liquidity</span>
            <button
              onClick={onRefresh}
              className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-semibold font-sans cursor-pointer"
            >
              <RotateCw className="w-3 h-3" /> Refresh Feed
            </button>
          </div>
        </div>

        {/* Telemetry Console Card */}
        <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5" id="telemetry-logs-card">
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-600" />
              <span className="font-mono text-slate-800 text-xs uppercase tracking-wider font-semibold">Live Telemetry Terminal</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400 uppercase">Polling Active</span>
          </div>

          <div className="bg-slate-900 rounded-xl p-3 font-mono text-[10px] text-slate-300 h-[120px] overflow-y-auto space-y-1.5 border border-slate-800 shadow-inner" id="terminal-screen">
            {recentLogs.map((log, index) => (
              <div key={index} className="leading-relaxed break-all">
                <span className="text-emerald-400">{">"}</span> {log}
              </div>
            ))}
            {recentLogs.length === 0 && <p className="text-slate-500 text-center py-5 italic">No logs available in current buffer...</p>}
          </div>
        </div>
      </div>

      {/* ================= COLUMN 4: 3-LAYER SCORING & RSS HEADLINES ================= */}
      <div className="xl:col-span-1 flex flex-col gap-6" id="dashboard-col-scoring">
        {/* Layer 3: CatBoost Probability Gauge */}
        <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5" id="layer3-prediction-card">
          <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <Cpu className="w-4.5 h-4.5 text-indigo-600" />
              <span className="font-sans font-semibold text-slate-800 text-xs uppercase tracking-wider">Layer 3: Prediction</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400">CatBoost ML</span>
          </div>

          {/* Probability Bars */}
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-emerald-600 font-sans font-semibold">LONG Probability</span>
                <span className="font-mono font-bold text-slate-700">
                  {signals.length > 0 ? (signals[0].catboost_probability * 100).toFixed(1) : "50.0"}%
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${signals.length > 0 ? signals[0].catboost_probability * 100 : 50}%` }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-rose-600 font-sans font-semibold">SHORT Probability</span>
                <span className="font-mono font-bold text-slate-700">
                  {signals.length > 0 ? ((1 - signals[0].catboost_probability) * 100).toFixed(1) : "50.0"}%
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
                <div
                  className="bg-rose-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${signals.length > 0 ? (1 - signals[0].catboost_probability) * 100 : 50}%` }}
                ></div>
              </div>
            </div>

            {/* Entry scoring gauge */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex justify-between items-center mt-2">
              <div>
                <p className="text-[10px] font-mono text-slate-400 uppercase leading-none">Entry Score</p>
                <p className="text-lg font-sans font-black text-indigo-600 mt-1.5">
                  {signals.length > 0 && signals[0].direction !== "NEUTRAL" ? (signals[0].all_conditions_met ? 92 : 45) : 10}/100
                </p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-mono text-slate-400 uppercase leading-none">Min Threshold</p>
                <p className="text-xs font-sans font-bold text-slate-500 mt-1.5">80/100</p>
              </div>
            </div>
          </div>
        </div>

        {/* RSS News Sentiment Timeline */}
        <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5 flex-1 flex flex-col h-[320px]" id="layer2-sentiment-timeline-card">
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Newspaper className="w-4.5 h-4.5 text-indigo-600" />
              <span className="font-sans font-semibold text-slate-800 text-xs uppercase tracking-wider">Layer 2: Sentiment RSS</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400">Live Scrapes</span>
          </div>

          <div className="space-y-3 overflow-y-auto flex-1 pr-1" id="headlines-scroll">
            {headlines.slice(0, 8).map((hl) => (
              <div key={hl.id} className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 hover:border-slate-200 transition-colors duration-200">
                <div className="flex justify-between items-start gap-2 mb-1.5">
                  <span className="px-1.5 py-0.5 bg-slate-200/55 text-slate-500 rounded text-[8px] font-mono border border-slate-200 uppercase">
                    {hl.source}
                  </span>
                  <span className={`px-1.5 py-0.2 rounded text-[8px] font-mono font-bold border ${getSentimentColor(hl.sentiment_score)}`}>
                    {hl.sentiment_score > 0 ? "+" : ""}{hl.sentiment_score.toFixed(2)}
                  </span>
                </div>
                <p className="text-[10px] font-sans leading-relaxed text-slate-700 font-medium">{hl.headline}</p>
                <p className="text-[8px] font-mono text-slate-400 mt-1">{new Date(hl.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            ))}
            {headlines.length === 0 && <p className="text-slate-400 font-mono text-center text-[10px] py-10 italic">Waiting for incoming news ticker...</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
