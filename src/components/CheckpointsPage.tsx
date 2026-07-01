/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Sliders,
  ShieldAlert,
  Server,
  TrendingUp,
  BookOpen,
  ArrowRight,
  ShieldCheck,
  CheckSquare,
} from "lucide-react";
import { Trade } from "../types.js";

interface Checkpoint {
  name: string;
  met: boolean;
  current_value: any;
  required: string;
  description: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM";
}

interface CheckpointsPageProps {
  status: {
    is_trading_active: boolean;
    is_paper_trading: boolean;
    current_price: number;
    current_regime: string;
    regime_confidence: number;
    critical_event_active: boolean;
    critical_event_keyword: string | null;
    protection_remaining_seconds: number | null;
    active_trade: Trade | null;
    account_balance_usdt: number;
    checkpoints?: {
      conditions: Checkpoint[];
      entry_score: number;
      signal_direction: "LONG" | "SHORT" | "NEUTRAL";
      all_conditions_met: boolean;
      rejection_reason: string | null;
    };
  };
  onRefresh: () => void;
  onTabChange: (tab: any) => void;
}

export default function CheckpointsPage({ status, onRefresh, onTabChange }: CheckpointsPageProps) {
  const checkpointsData = status.checkpoints;

  // Fallback checks if checkpoints are not yet loaded from backend status
  const fallbackConditions: Checkpoint[] = [
    {
      name: "CatBoost AI Prediction",
      met: false,
      current_value: "P(LONG) = 50.0%",
      required: "P(LONG) > 70% OR < 30%",
      description: "Uses pre-trained ensemble trees mapping momentum, RSI spreads, and market sentiments.",
      priority: "CRITICAL",
    },
    {
      name: "Market Regime Filter",
      met: status.current_regime !== "RANGE_BOUND" && status.current_regime !== "LOW_VOLATILITY",
      current_value: status.current_regime,
      required: "STRONG_UPTREND for LONG, STRONG_DOWNTREND for SHORT",
      description: "Restricts execution during low volatility ranging zones to prevent chop losses.",
      priority: "CRITICAL",
    },
    {
      name: "Exponential Trend Alignment",
      met: true,
      current_value: "BULLISH",
      required: "Must align with signal direction, or bypassed automatically in ranging markets",
      description: "Confirms overall trend line support, bypassed automatically during ranging regimes to enable bottom/top mean-reversion scalp entries.",
      priority: "HIGH",
    },
    {
      name: "Sentiment Engine Alignment",
      met: true,
      current_value: "0.15",
      required: "LONG: >= -0.15, SHORT: <= 0.15",
      description: "Blocks entries only when social/news sentiment strongly opposes the trade direction, preventing false filters on neutral scalp days.",
      priority: "HIGH",
    },
    {
      name: "Relative Volume Confirmation",
      met: true,
      current_value: "1.35x",
      required: "> 1.3x above 20-period MA",
      description: "Validates that trade has supporting transaction volume to avoid false breakups.",
      priority: "MEDIUM",
    },
    {
      name: "News Event Protection Lock",
      met: !status.critical_event_active,
      current_value: status.critical_event_active ? `BLOCKED` : "PASSING",
      required: "No high-impact critical events",
      description: "Circuit breaker that blocks trading when black-swan hot words are scanned in news feeds.",
      priority: "CRITICAL",
    },
    {
      name: "Daily Trade Count Limit",
      met: true,
      current_value: "0 trades",
      required: "< 6 trades/day",
      description: "Risk mitigation ceiling to prevent overtrading and revenge trading sessions.",
      priority: "CRITICAL",
    },
    {
      name: "ADX Trend Strength Filter",
      met: true,
      current_value: "24.5",
      required: "ADX > 22 in trend, or ADX <= 25 in range mode",
      description: "Confirms trend presence (ADX > 22) or consolidations (ADX <= 25) depending on the active market regime.",
      priority: "MEDIUM",
    },
    {
      name: "Minimum Account Equity Check",
      met: status.account_balance_usdt >= 100,
      current_value: `$${status.account_balance_usdt.toFixed(2)} USDT`,
      required: ">= $100.00 USDT",
      description: "Ensures the portfolio has enough margin buffer to sustain futures margin requirements.",
      priority: "CRITICAL",
    },
    {
      name: "Exchange API Credentials Check",
      met: status.is_paper_trading,
      current_value: status.is_paper_trading ? "PAPER MODE ACTIVE" : "KEYS UNCONFIGURED",
      required: "Live API credentials required if not in Paper Mode",
      description: "Validates connection keys and signatures required to route orders to Delta Exchange REST endpoints.",
      priority: "CRITICAL",
    },
    {
      name: "Loss Streak Cooldown Protection",
      met: true,
      current_value: "PASSING",
      required: "No active cooldown from consecutive losses",
      description: "Automated timeout that blocks trading after being hit by N consecutive losses to prevent emotional or algorithmic revenge trading.",
      priority: "CRITICAL",
    },
    {
      name: "Optimal Session Timing Window Check (IST)",
      met: true,
      current_value: "PASSING",
      required: "Avoid weekends & 2:00 AM - 8:00 AM IST",
      description: "Checks whether current session is optimal (6:30 PM - 1:30 AM IST) and avoids risky periods (Weekends & 2:00 AM - 8:00 AM IST).",
      priority: "HIGH",
    },
    {
      name: "VWAP Deviation Anchor",
      met: true,
      current_value: "PASSING",
      required: "LONG: Price <= Upper Band, SHORT: Price >= Lower Band",
      description: "Guards against entering trades when price is extremely overextended (above upper band for LONG, or below lower band for SHORT).",
      priority: "CRITICAL",
    },
    {
      name: "Wedge Pattern Filter",
      met: true,
      current_value: "PASSING (NO WEDGE)",
      required: "LONG breakout or SHORT breakout during wedge patterns",
      description: "Filters trades during wedge compression to avoid low-probability trendline traps, unless a confirmed breakout with high volume occurs.",
      priority: "CRITICAL",
    },
    {
      name: "EMA 100 Overextension Protection",
      met: true,
      current_value: "PASSING",
      required: "If high recent movement (>1.8*ATR in 10 bars): Price <= 100 EMA + 2.2*ATR (LONG) / Price >= 100 EMA - 2.2*ATR (SHORT)",
      description: "Avoids entering late 'along-the-trend' breakout trades when there is a rapid movement over an earlier short period and price overextends from the 100 EMA.",
      priority: "CRITICAL",
    },
  ];

  const conditions = checkpointsData?.conditions || fallbackConditions;
  const signalDirection = checkpointsData?.signal_direction || "NEUTRAL";
  const entryScore = checkpointsData?.entry_score || 0;
  const allConditionsMet = checkpointsData?.all_conditions_met ?? false;

  const metCount = conditions.filter((c) => c.met).length;
  const blockedCount = conditions.length - metCount;
  const criticalBlockedCount = conditions.filter((c) => !c.met && c.priority === "CRITICAL").length;

  return (
    <div className="space-y-6" id="checkpoints-radar-page">
      {/* ================= HEADER AND HEALTH SCORE ================= */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-indigo-600 animate-pulse" />
            <h1 className="font-sans font-bold text-lg text-slate-800 tracking-tight">Checkpoints Radar Tracker</h1>
          </div>
          <p className="text-xs text-slate-500">
            Real-time scanner analyzing {conditions.length} strict quantitative, qualitative, and technical trade entry gating conditions.
          </p>
        </div>

        <div className="flex flex-wrap gap-4 items-center">
          <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 flex items-center gap-3">
            <div className={`p-2 rounded-lg ${criticalBlockedCount > 0 ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"}`}>
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-mono uppercase">System Checklist</p>
              <p className="text-sm font-sans font-bold text-slate-800">
                {metCount} / {conditions.length} Passed
              </p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 flex items-center gap-3">
            <div className={`p-2 rounded-lg ${entryScore >= 80 ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-mono uppercase">Signal Entry Score</p>
              <p className="text-sm font-sans font-bold text-slate-800">
                {entryScore} / 100
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ================= CRITICAL BLOCKED SPOTLIGHT ================= */}
      {blockedCount > 0 && (
        <div className="bg-rose-50/60 border border-rose-100 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-1.5 bg-rose-100 text-rose-700 rounded-lg shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h2 className="font-sans font-bold text-xs text-rose-900 uppercase tracking-wider">
                Automated Order Routing Locked • {blockedCount} Blocked Checkpoint{blockedCount > 1 ? "s" : ""}
              </h2>
              <p className="text-xs text-rose-700/90 leading-relaxed">
                The trade scanner is actively blocking order routing. Automated trades will only execute when all {conditions.length} checklists pass concurrently and the Entry Score is &ge; 80.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {conditions.filter((c) => !c.met).map((item, index) => (
              <div
                key={index}
                className="bg-white border border-rose-100 rounded-xl p-3 shadow-2xs space-y-2 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-sans font-bold text-slate-800 tracking-tight">{item.name}</span>
                    <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded-md ${
                      item.priority === "CRITICAL"
                        ? "bg-rose-100 text-rose-800"
                        : item.priority === "HIGH"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-slate-100 text-slate-800"
                    }`}>
                      {item.priority}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{item.description}</p>
                </div>
                <div className="bg-rose-50 border border-rose-100/50 rounded-lg p-2 text-[10px] space-y-1 mt-2">
                  <div className="flex justify-between font-mono">
                    <span className="text-rose-500">Live:</span>
                    <span className="font-bold text-rose-700">{item.current_value}</span>
                  </div>
                  <div className="flex justify-between font-mono text-slate-500">
                    <span>Required:</span>
                    <span className="font-medium text-slate-700">{item.required}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Troubleshooting Actions */}
          <div className="bg-white/80 border border-rose-100/50 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-slate-400 shrink-0" />
              <span>Need to pass credentials or enable trading? Use the quick setup panels:</span>
            </div>
            <div className="flex gap-2">
              {!status.is_trading_active && (
                <button
                  onClick={() => onTabChange("config")}
                  className="flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                >
                  Activate Trading <ArrowRight className="w-3 h-3" />
                </button>
              )}
              {!status.is_paper_trading && conditions.some((c) => c.name.includes("Credentials") && !c.met) && (
                <button
                  onClick={() => onTabChange("config")}
                  className="flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                >
                  Enter Exchange API Keys <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= ALL 10 CONDITIONS CHECKLIST GRID ================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-sans font-bold text-xs text-slate-400 uppercase tracking-wider font-mono">
            Full {conditions.length}-Checklist Radar Dashboard
          </h2>
          <span className="text-[10px] font-mono text-slate-400">Updates live per tick</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {conditions.map((item, index) => (
            <div
              key={index}
              className={`bg-white border rounded-2xl p-5 shadow-xs transition-all relative overflow-hidden ${
                item.met
                  ? "border-emerald-200 hover:border-emerald-300"
                  : "border-slate-200/80 hover:border-slate-300"
              }`}
            >
              {/* Top Accent Line */}
              <div className={`absolute top-0 left-0 right-0 h-1 ${item.met ? "bg-emerald-500" : "bg-slate-200"}`} />

              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-400 font-bold">C{index + 1}</span>
                    <h3 className="font-sans font-bold text-sm text-slate-800 tracking-tight">{item.name}</h3>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">{item.description}</p>
                </div>

                <div className="shrink-0 pt-0.5">
                  {item.met ? (
                    <div className="flex items-center gap-1 text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-2.5 py-1 text-[10px] font-bold font-mono">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      PASSED
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-slate-500 bg-slate-50 border border-slate-100 rounded-full px-2.5 py-1 text-[10px] font-bold font-mono">
                      <XCircle className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                      BLOCKED
                    </div>
                  )}
                </div>
              </div>

              {/* Parameters Breakdown */}
              <div className="mt-4 grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                <div className="space-y-0.5">
                  <span className="text-[9px] font-mono text-slate-400 uppercase">Current Live Metric</span>
                  <p className={`text-xs font-mono font-bold ${item.met ? "text-emerald-700" : "text-rose-700 bg-rose-50/50 px-1.5 py-0.5 rounded-md inline-block"}`}>
                    {item.current_value}
                  </p>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[9px] font-mono text-slate-400 uppercase">Target Gate Requirement</span>
                  <p className="text-xs font-mono font-medium text-slate-700">{item.required}</p>
                </div>
              </div>

              {/* Priority badge */}
              <div className="mt-3 flex justify-between items-center text-[10px]">
                <span className="text-slate-400">Risk Priority:</span>
                <span className={`font-bold font-mono px-2 py-0.5 rounded-md ${
                  item.priority === "CRITICAL"
                    ? "bg-rose-50 text-rose-700 border border-rose-100/50"
                    : item.priority === "HIGH"
                    ? "bg-amber-50 text-amber-700 border border-amber-100/30"
                    : "bg-slate-50 text-slate-600 border border-slate-100"
                }`}>
                  {item.priority}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
