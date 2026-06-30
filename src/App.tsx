import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Square, 
  TrendingUp, 
  TrendingDown, 
  Newspaper, 
  Settings, 
  Activity, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  ShieldAlert, 
  DollarSign, 
  Clock, 
  Plus, 
  RefreshCw, 
  ArrowUpRight, 
  ArrowDownRight,
  Sparkles
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';

interface Gate {
  name: string;
  met: boolean;
  value: string;
  required: string;
  weight: number;
  skipped: boolean;
}

interface Trade {
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

interface Headline {
  id: string;
  time: number;
  headline: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  sentiment: number;
}

interface EngineStatus {
  currentPrice: number;
  isRunning: boolean;
  config: {
    leverage: number;
    riskPercent: number;
    entryScoreThreshold: number;
    requiredRelativeVolume: number;
    adxThreshold: number;
    newsProtectionMinutes: number;
    pullbackMaxPercent: number;
    skippedGates: string[];
  };
  longScore: number;
  shortScore: number;
  longCheckpoints: Gate[];
  shortCheckpoints: Gate[];
  trades: Trade[];
  logs: string[];
  headlines: Headline[];
  indicators: {
    ema21_1m: number;
    ema50_1m: number;
    ema21_15m: number;
    ema50_15m: number;
    adx: number;
    relVolume: number;
    pullbackDistance: number;
  };
  newsProtection: {
    active: boolean;
    remainingMinutes: number;
    lastHeadline: string;
  };
  candles1m: { time: number; close: number }[];
}

export default function App() {
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Settings form state
  const [leverage, setLeverage] = useState<number>(10);
  const [riskPercent, setRiskPercent] = useState<number>(2);
  const [scoreThreshold, setScoreThreshold] = useState<number>(75);
  const [relVolReq, setRelVolReq] = useState<number>(1.5);
  const [adxReq, setAdxReq] = useState<number>(20);
  const [newsMinutes, setNewsMinutes] = useState<number>(15);
  const [pullbackMax, setPullbackMax] = useState<number>(0.15);

  // News Creator Form State
  const [newsHeadline, setNewsHeadline] = useState<string>('');
  const [newsImpact, setNewsImpact] = useState<'HIGH' | 'MEDIUM' | 'LOW'>('LOW');
  const [newsSentiment, setNewsSentiment] = useState<number>(0.3);

  // Active tab for Long/Short Checkpoints
  const [activeStrategyTab, setActiveStrategyTab] = useState<'LONG' | 'SHORT'>('LONG');

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Fetch status helper
  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json() as EngineStatus;
        setStatus(data);
        setError(null);
      } else {
        throw new Error("Failed to reach backend API.");
      }
    } catch (err: any) {
      setError("Cannot sync with local Trading Engine. Make sure the server is fully started.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  // Sync settings when status loads
  useEffect(() => {
    if (status) {
      setLeverage(status.config.leverage);
      setRiskPercent(status.config.riskPercent);
      setScoreThreshold(status.config.entryScoreThreshold);
      setRelVolReq(status.config.requiredRelativeVolume);
      setAdxReq(status.config.adxThreshold);
      setNewsMinutes(status.config.newsProtectionMinutes);
      setPullbackMax(status.config.pullbackMaxPercent);
    }
  }, [status === null]);

  // Actions
  const toggleEngine = async () => {
    if (!status) return;
    const endpoint = status.isRunning ? '/api/stop' : '/api/start';
    try {
      const res = await fetch(endpoint, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateConfig = async (newConfig: any) => {
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleGate = async (gateName: string) => {
    if (!status) return;
    const isCurrentlySkipped = status.config.skippedGates.includes(gateName);
    const updatedSkips = isCurrentlySkipped 
      ? status.config.skippedGates.filter(g => g !== gateName)
      : [...status.config.skippedGates, gateName];
    
    await handleUpdateConfig({ skippedGates: updatedSkips });
  };

  const handleManualEntry = async (type: 'LONG' | 'SHORT') => {
    try {
      const res = await fetch('/api/force-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type })
      });
      if (!res.ok) {
        const errData = await res.json();
        alert(errData.error || "Failed to trigger trade.");
      } else {
        const data = await res.json();
        setStatus(data.status);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleManualExit = async () => {
    try {
      const res = await fetch('/api/force-exit', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddHeadline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsHeadline.trim()) return;
    try {
      const res = await fetch('/api/headline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headline: newsHeadline,
          impact: newsImpact,
          sentiment: newsSentiment
        })
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status);
        setNewsHeadline('');
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0b0f19] text-gray-200">
        <Activity className="w-12 h-12 text-emerald-500 animate-spin mb-4" />
        <h2 className="text-xl font-bold tracking-wide">Syncing with Delta Engine...</h2>
        <p className="text-gray-400 mt-2 text-sm">Booting background loops, please wait.</p>
      </div>
    );
  }

  const activeTrade = status?.trades.find(t => t.status === 'ACTIVE');
  const pastTrades = status?.trades.filter(t => t.status === 'CLOSED') || [];

  return (
    <div className="min-h-screen bg-[#070a13] text-gray-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-black">
      {/* Top Banner Message */}
      {status?.newsProtection.active && (
        <div className="bg-amber-950 border-b border-amber-800 text-amber-200 text-sm px-4 py-2 flex items-center justify-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400 animate-pulse" />
          <span>
            <strong>News Protection Active:</strong> Entries blocked for {status.newsProtection.remainingMinutes} minutes due to headline: <em>"{status.newsProtection.lastHeadline}"</em>
          </span>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-[#141b2d] bg-[#0b0f19] px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500/10 border border-emerald-500/30 p-2 rounded-lg">
            <Activity className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-wider text-white flex items-center gap-2">
              DELTA ENGINE <span className="text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-400/20 px-2 py-0.5 rounded-full uppercase">Active Alpha</span>
            </h1>
            <p className="text-xs text-gray-400">Algorithmic Multidimensional BTC Leveraged Bot</p>
          </div>
        </div>

        {/* Current Metrics */}
        <div className="flex flex-wrap items-center gap-6">
          <div className="bg-[#0e1424] border border-[#141b2d] px-4 py-2 rounded-xl">
            <span className="text-xs text-gray-400 block uppercase tracking-wider font-semibold">BTC / USDT</span>
            <span className="text-lg font-mono font-bold text-white flex items-center gap-2">
              ${status?.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              <span className="text-xs text-emerald-400 font-normal">Live</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${status?.isRunning ? 'bg-emerald-500 animate-ping' : 'bg-rose-500'}`} />
              <span className="text-sm font-semibold">{status?.isRunning ? 'RUNNING' : 'STOPPED'}</span>
            </div>
            
            <button 
              onClick={toggleEngine}
              className={`px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition duration-200 ${
                status?.isRunning 
                  ? 'bg-rose-600/20 text-rose-300 border border-rose-500/30 hover:bg-rose-600/30' 
                  : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-950/40'
              }`}
            >
              {status?.isRunning ? (
                <>
                  <Square className="w-4 h-4 fill-current" /> Pause Bot
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" /> Start Bot
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-y-auto">
        
        {/* Left Side: Market Chart, Indicators & Settings (lg: 4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Chart Section */}
          <div className="bg-[#0b0f19] border border-[#141b2d] rounded-2xl p-4 flex flex-col h-72">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">BTC Price Trend (1m candles)</h3>
              <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-mono">
                1m interval
              </span>
            </div>
            
            <div className="flex-1 min-h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={status?.candles1m || []}>
                  <defs>
                    <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" hide />
                  <YAxis domain={['auto', 'auto']} hide />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Area type="monotone" dataKey="close" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorPrice)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Quick Indicators Grid */}
            <div className="grid grid-cols-4 gap-2 mt-2 pt-3 border-t border-[#141b2d] text-center">
              <div>
                <span className="text-[10px] text-gray-400 block uppercase">EMA 21</span>
                <span className="text-xs font-mono font-bold text-white">${status?.indicators.ema21_1m.toFixed(1)}</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block uppercase">EMA 50</span>
                <span className="text-xs font-mono font-bold text-white">${status?.indicators.ema50_1m.toFixed(1)}</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block uppercase">ADX</span>
                <span className="text-xs font-mono font-bold text-white">{status?.indicators.adx.toFixed(1)}</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block uppercase">Rel Vol</span>
                <span className="text-xs font-mono font-bold text-white">{status?.indicators.relVolume.toFixed(2)}x</span>
              </div>
            </div>
          </div>

          {/* Strategy Variables Config */}
          <div className="bg-[#0b0f19] border border-[#141b2d] rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4 border-b border-[#141b2d] pb-2">
              <Settings className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">Configurable Guardrails</h3>
            </div>
            
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-gray-400 uppercase tracking-wider block mb-1">Leverage</label>
                  <input 
                    type="number" 
                    value={leverage} 
                    onChange={e => {
                      const val = Math.max(1, Math.min(125, Number(e.target.value)));
                      setLeverage(val);
                      handleUpdateConfig({ leverage: val });
                    }}
                    className="w-full bg-[#111827] border border-[#1e293b] rounded-lg px-3 py-1.5 font-mono text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 uppercase tracking-wider block mb-1">Risk per trade %</label>
                  <input 
                    type="number" 
                    value={riskPercent} 
                    onChange={e => {
                      const val = Math.max(0.1, Math.min(10, Number(e.target.value)));
                      setRiskPercent(val);
                      handleUpdateConfig({ riskPercent: val });
                    }}
                    className="w-full bg-[#111827] border border-[#1e293b] rounded-lg px-3 py-1.5 font-mono text-sm text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-gray-400 uppercase tracking-wider block mb-1">Entry Score Trigger ({scoreThreshold} pts)</label>
                <input 
                  type="range" 
                  min="40" 
                  max="100" 
                  value={scoreThreshold} 
                  onChange={e => {
                    setScoreThreshold(Number(e.target.value));
                    handleUpdateConfig({ entryScoreThreshold: Number(e.target.value) });
                  }}
                  className="w-full h-1.5 bg-[#1e293b] rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-gray-400 uppercase tracking-wider block mb-1">Req Relative Vol</label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={relVolReq} 
                    onChange={e => {
                      const val = Math.max(1, Number(e.target.value));
                      setRelVolReq(val);
                      handleUpdateConfig({ requiredRelativeVolume: val });
                    }}
                    className="w-full bg-[#111827] border border-[#1e293b] rounded-lg px-3 py-1.5 font-mono text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 uppercase tracking-wider block mb-1">ADX Regime threshold</label>
                  <input 
                    type="number" 
                    value={adxReq} 
                    onChange={e => {
                      const val = Math.max(10, Number(e.target.value));
                      setAdxReq(val);
                      handleUpdateConfig({ adxThreshold: val });
                    }}
                    className="w-full bg-[#111827] border border-[#1e293b] rounded-lg px-3 py-1.5 font-mono text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-gray-400 uppercase tracking-wider block mb-1">News Block Mins</label>
                  <input 
                    type="number" 
                    value={newsMinutes} 
                    onChange={e => {
                      const val = Math.max(0, Number(e.target.value));
                      setNewsMinutes(val);
                      handleUpdateConfig({ newsProtectionMinutes: val });
                    }}
                    className="w-full bg-[#111827] border border-[#1e293b] rounded-lg px-3 py-1.5 font-mono text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 uppercase tracking-wider block mb-1">Max Pullback Dist %</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={pullbackMax} 
                    onChange={e => {
                      const val = Math.max(0.01, Number(e.target.value));
                      setPullbackMax(val);
                      handleUpdateConfig({ pullbackMaxPercent: val });
                    }}
                    className="w-full bg-[#111827] border border-[#1e293b] rounded-lg px-3 py-1.5 font-mono text-sm text-white"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Middle Panel: Strategy Gates Integrity & Scoreboard (lg: 5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-[#0b0f19] border border-[#141b2d] rounded-2xl p-5 flex flex-col flex-1">
            
            {/* Tabs & Title */}
            <div className="flex items-center justify-between border-b border-[#141b2d] pb-3 mb-4">
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
                Integrity Checkpoint Matrix
              </h3>
              
              <div className="flex bg-[#111827] p-0.5 rounded-lg border border-[#1e293b]">
                <button
                  onClick={() => setActiveStrategyTab('LONG')}
                  className={`px-3 py-1 rounded text-xs font-bold transition duration-150 ${
                    activeStrategyTab === 'LONG' 
                      ? 'bg-emerald-500 text-black' 
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  LONG
                </button>
                <button
                  onClick={() => setActiveStrategyTab('SHORT')}
                  className={`px-3 py-1 rounded text-xs font-bold transition duration-150 ${
                    activeStrategyTab === 'SHORT' 
                      ? 'bg-rose-500 text-white' 
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  SHORT
                </button>
              </div>
            </div>

            {/* Scorecard Progress Header */}
            <div className="mb-6 bg-[#0e1424] border border-[#141b2d] p-4 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-400">DECISION SCORE FOR {activeStrategyTab}</span>
                <span className="font-mono text-lg font-extrabold text-white">
                  {activeStrategyTab === 'LONG' ? status?.longScore : status?.shortScore} 
                  <span className="text-xs text-gray-400 font-medium"> / {status?.config.entryScoreThreshold} Required</span>
                </span>
              </div>
              
              <div className="w-full bg-[#1e293b] h-3 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${
                    activeStrategyTab === 'LONG' 
                      ? (status && status.longScore >= status.config.entryScoreThreshold ? 'bg-emerald-500' : 'bg-emerald-600/40')
                      : (status && status.shortScore >= status.config.entryScoreThreshold ? 'bg-rose-500' : 'bg-rose-600/40')
                  }`}
                  style={{ width: `${Math.min(100, (((activeStrategyTab === 'LONG' ? status?.longScore : status?.shortScore) || 0) / 115) * 100)}%` }}
                />
              </div>

              {/* Pullback condition banner */}
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#141b2d] text-xs">
                <span className="text-gray-400">Pullback To 1m EMA 21:</span>
                <span className={`font-mono font-bold ${
                  (status?.indicators.pullbackDistance || 0) <= (status?.config.pullbackMaxPercent || 0.15) 
                    ? 'text-emerald-400' 
                    : 'text-rose-400'
                }`}>
                  {status?.indicators.pullbackDistance.toFixed(3)}% 
                  <span className="text-gray-400 font-normal"> (Max {status?.config.pullbackMaxPercent}%)</span>
                </span>
              </div>
            </div>

            {/* Gates Checklist */}
            <div className="flex-1 flex flex-col gap-2 overflow-y-auto max-h-[360px] pr-1">
              {(activeStrategyTab === 'LONG' ? status?.longCheckpoints : status?.shortCheckpoints)?.map((g, idx) => (
                <div 
                  key={idx}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all duration-150 ${
                    g.skipped 
                      ? 'bg-slate-900/30 border-slate-800 text-slate-400' 
                      : g.met 
                        ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-100' 
                        : 'bg-rose-950/20 border-rose-500/15 text-rose-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => handleToggleGate(g.name)}
                      title={g.skipped ? "Include Gate" : "Skip Gate"}
                      className={`w-5 h-5 rounded flex items-center justify-center border transition-all ${
                        g.skipped 
                          ? 'bg-slate-800 border-slate-700 text-slate-500' 
                          : g.met 
                            ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400' 
                            : 'bg-rose-600/20 border-rose-500 text-rose-400'
                      }`}
                    >
                      {g.skipped ? 'S' : g.met ? '✓' : '✗'}
                    </button>

                    <div>
                      <span className="text-xs font-semibold block">{g.name}</span>
                      <span className="text-[10px] text-gray-400 block font-mono">
                        {g.value} &nbsp;|&nbsp; Req: {g.required}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-bold block">+{g.weight} pts</span>
                    {g.skipped && <span className="text-[9px] text-slate-500 uppercase block font-bold">Skipped</span>}
                  </div>
                </div>
              ))}
            </div>
            
            <p className="text-[10px] text-gray-400 mt-4 text-center">
              * Click the gate checkbox to toggle **Skip Gate** mode and test pipeline integrity!
            </p>
          </div>
        </div>

        {/* Right Side: Positions, Orders & History (lg: 3 cols) */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          
          {/* Active position card */}
          <div className="bg-[#0b0f19] border border-[#141b2d] rounded-2xl p-5">
            <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-4 border-b border-[#141b2d] pb-2">
              Active Position
            </h3>

            {activeTrade ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-extrabold ${
                    activeTrade.type === 'LONG' ? 'bg-emerald-500 text-black' : 'bg-rose-500 text-white'
                  }`}>
                    {activeTrade.type} {status?.config.leverage}x
                  </span>
                  
                  <span className={`font-mono text-lg font-black ${
                    activeTrade.pnlPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {activeTrade.pnlPercent >= 0 ? '+' : ''}{activeTrade.pnlPercent.toFixed(2)}%
                  </span>
                </div>

                <div className="space-y-1 bg-[#111827] p-3 rounded-xl font-mono text-xs border border-[#1e293b]">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Entry Price:</span>
                    <span className="text-white">${activeTrade.entryPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Current Price:</span>
                    <span className="text-white">${status?.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Stop Loss:</span>
                    <span className="text-rose-400">${activeTrade.stopLoss.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Take Profit:</span>
                    <span className="text-emerald-400">${activeTrade.takeProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between border-t border-[#1e293b] pt-1 mt-1 font-bold">
                    <span className="text-gray-400">Nominal PnL:</span>
                    <span className={activeTrade.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      ${activeTrade.pnl.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleManualExit}
                  className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs py-2 rounded-xl transition duration-150"
                >
                  Force Close Position
                </button>
              </div>
            ) : (
              <div className="text-center py-6">
                <span className="text-xs text-gray-500 block mb-4">No active position held.</span>
                
                <div className="flex gap-2">
                  <button
                    onClick={() => handleManualEntry('LONG')}
                    className="flex-1 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 font-bold text-xs py-2 rounded-xl transition duration-150"
                  >
                    Force Long
                  </button>
                  <button
                    onClick={() => handleManualEntry('SHORT')}
                    className="flex-1 bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/30 font-bold text-xs py-2 rounded-xl transition duration-150"
                  >
                    Force Short
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Past execution logs */}
          <div className="bg-[#0b0f19] border border-[#141b2d] rounded-2xl p-5 flex-1 flex flex-col max-h-[300px]">
            <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-3 border-b border-[#141b2d] pb-2">
              Trade History
            </h3>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {pastTrades.length > 0 ? (
                pastTrades.map((t, idx) => (
                  <div key={idx} className="bg-[#111827] border border-[#1e293b] p-3 rounded-xl text-xs font-mono">
                    <div className="flex justify-between items-center mb-1">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        t.type === 'LONG' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                      }`}>
                        {t.type} {t.pnlPercent >= 0 ? '🏆' : '💀'}
                      </span>
                      <span className={t.pnlPercent >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                        {t.pnlPercent >= 0 ? '+' : ''}{t.pnlPercent.toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-400">
                      In: ${t.entryPrice.toFixed(0)} | Out: ${t.exitPrice?.toFixed(0)}
                    </div>
                    <div className="text-[9px] text-gray-500 mt-1 italic truncate">
                      {t.reason}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-gray-500 text-xs py-10">
                  No trades completed yet.
                </div>
              )}
            </div>
          </div>
        </div>

      </main>

      {/* Footer Area: Headline Injection & Live Engine Logs */}
      <footer className="border-t border-[#141b2d] bg-[#0b0f19] p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* News & Headline Creator */}
        <div className="lg:col-span-5 bg-[#0e1424] border border-[#141b2d] p-5 rounded-2xl">
          <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-emerald-400" />
            Headline Sentiment Injector
          </h4>

          <form onSubmit={handleAddHeadline} className="space-y-3">
            <div>
              <input 
                type="text"
                placeholder="E.g., Federal Reserve cuts interest rates by 50 basis points"
                value={newsHeadline}
                onChange={e => setNewsHeadline(e.target.value)}
                className="w-full bg-[#111827] border border-[#1e293b] rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex gap-4 items-center">
              <div className="flex-1">
                <label className="text-[9px] text-gray-400 uppercase block mb-1">Impact</label>
                <select 
                  value={newsImpact}
                  onChange={e => setNewsImpact(e.target.value as any)}
                  className="w-full bg-[#111827] border border-[#1e293b] rounded-xl px-2 py-1.5 text-xs text-white"
                >
                  <option value="LOW">LOW (Standard sentiment)</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH (Protection Timer lock)</option>
                </select>
              </div>

              <div className="w-36">
                <label className="text-[9px] text-gray-400 uppercase block mb-1">Sentiment: {newsSentiment > 0 ? 'Bullish' : newsSentiment < 0 ? 'Bearish' : 'Neutral'} ({newsSentiment})</label>
                <input 
                  type="range"
                  min="-1"
                  max="1"
                  step="0.1"
                  value={newsSentiment}
                  onChange={e => setNewsSentiment(Number(e.target.value))}
                  className="w-full h-1 bg-[#1e293b] rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>

              <button
                type="submit"
                className="self-end bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition duration-150 flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Inject
              </button>
            </div>
          </form>
        </div>

        {/* Live Logs Terminal */}
        <div className="lg:col-span-7 bg-black/40 border border-[#141b2d] p-4 rounded-2xl flex flex-col h-40">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Engine Terminal Output
            </span>
            <button 
              onClick={fetchStatus}
              className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold uppercase tracking-wider flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" /> Force Poll
            </button>
          </div>

          <div className="flex-1 overflow-y-auto font-mono text-[10px] text-emerald-400/90 space-y-1">
            {status?.logs && status.logs.length > 0 ? (
              status.logs.map((log, idx) => (
                <div key={idx} className="whitespace-pre-wrap">{log}</div>
              ))
            ) : (
              <div className="text-gray-600">Waiting for live data feed...</div>
            )}
            <div ref={logsEndRef} />
          </div>
        </div>

      </footer>
    </div>
  );
}
