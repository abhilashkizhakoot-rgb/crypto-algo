/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
  Activity,
  DollarSign,
  Filter,
} from "lucide-react";
import { Trade, TradeDirection, ExitReason, MarketRegime } from "../types.js";

interface TradeHistoryProps {
  trades: Trade[];
}

export default function TradeHistory({ trades }: TradeHistoryProps) {
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [directionFilter, setDirectionFilter] = useState<"ALL" | "LONG" | "SHORT">("ALL");
  const [winFilter, setWinFilter] = useState<"ALL" | "WINS" | "LOSSES">("ALL");
  const [reasonFilter, setReasonFilter] = useState<"ALL" | ExitReason>("ALL");

  const toggleSelectTrade = (id: string) => {
    setSelectedTradeId(selectedTradeId === id ? null : id);
  };

  // Apply filters
  const filteredTrades = trades.filter((t) => {
    if (directionFilter !== "ALL" && t.direction !== directionFilter) return false;
    if (winFilter === "WINS" && !t.is_win) return false;
    if (winFilter === "LOSSES" && t.is_win) return false;
    if (reasonFilter !== "ALL" && t.exit_reason !== reasonFilter) return false;
    return true;
  });

  const getReasonBadgeClass = (reason: ExitReason | null) => {
    switch (reason) {
      case ExitReason.TAKE_PROFIT:
        return "bg-emerald-50 border-emerald-200 text-emerald-700";
      case ExitReason.STOP_LOSS:
        return "bg-rose-50 border-rose-200 text-rose-700";
      case ExitReason.TIME_LIMIT_29MIN:
        return "bg-indigo-50 border-indigo-200 text-indigo-700";
      case ExitReason.SENTIMENT_REVERSAL:
        return "bg-amber-50 border-amber-200 text-amber-700";
      case ExitReason.MANUAL_EXIT:
        return "bg-slate-150 border-slate-250 text-slate-700";
      default:
        return "bg-slate-50 border-slate-200 text-slate-500";
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters Strip */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4" id="history-filters-bar">
        <div className="flex items-center gap-2">
          <Filter className="w-4.5 h-4.5 text-indigo-600" />
          <span className="font-sans font-semibold text-xs text-slate-800 uppercase tracking-wider">Filter History</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Direction Filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-400 font-mono text-[10px] uppercase">Dir</span>
            <select
              value={directionFilter}
              onChange={(e) => setDirectionFilter(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 text-slate-800 p-1.5 rounded-lg text-xs font-sans outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
            >
              <option value="ALL">All Directions</option>
              <option value="LONG">Long Positions</option>
              <option value="SHORT">Short Positions</option>
            </select>
          </div>

          {/* Win/Loss Filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-400 font-mono text-[10px] uppercase">Status</span>
            <select
              value={winFilter}
              onChange={(e) => setWinFilter(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 text-slate-800 p-1.5 rounded-lg text-xs font-sans outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
            >
              <option value="ALL">All Outcomes</option>
              <option value="WINS">Wins Only</option>
              <option value="LOSSES">Losses Only</option>
            </select>
          </div>

          {/* Reason Filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-400 font-mono text-[10px] uppercase">Exit Trigger</span>
            <select
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 text-slate-800 p-1.5 rounded-lg text-xs font-sans outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
            >
              <option value="ALL">All Exits</option>
              <option value={ExitReason.TAKE_PROFIT}>Take Profit (TP)</option>
              <option value={ExitReason.STOP_LOSS}>Stop Loss (SL)</option>
              <option value={ExitReason.TIME_LIMIT_29MIN}>29 Min Timeout</option>
              <option value={ExitReason.SENTIMENT_REVERSAL}>Sentiment Reversal</option>
              <option value={ExitReason.MANUAL_EXIT}>Manual User Exit</option>
            </select>
          </div>
        </div>
      </div>

      {/* Trades Table List */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden" id="trades-table-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200 font-mono text-[10px] text-slate-400 uppercase">
                <th className="py-3 px-4 font-normal">Timestamp</th>
                <th className="py-3 px-4 font-normal">Direction</th>
                <th className="py-3 px-4 font-normal">Size (BTC)</th>
                <th className="py-3 px-4 font-normal">Entry Price</th>
                <th className="py-3 px-4 font-normal">Exit Price</th>
                <th className="py-3 px-4 font-normal">Trigger Reason</th>
                <th className="py-3 px-4 font-normal text-right">Net P&L</th>
                <th className="py-3 px-4 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTrades.map((t) => {
                const isSelected = selectedTradeId === t.id;
                return (
                  <React.Fragment key={t.id}>
                    <tr
                      onClick={() => toggleSelectTrade(t.id)}
                      className={`hover:bg-slate-50/50 transition-colors duration-150 cursor-pointer text-xs ${
                        isSelected ? "bg-slate-50" : ""
                      }`}
                    >
                      <td className="py-3.5 px-4 font-mono text-slate-500">
                        {new Date(t.entry_timestamp).toLocaleDateString()} {new Date(t.entry_timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                          t.direction === TradeDirection.LONG ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-rose-50 border-rose-200 text-rose-700"
                        }`}>
                          {t.direction === TradeDirection.LONG ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {t.direction}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-sans font-semibold text-slate-800">
                        {t.quantity_btc} BTC
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-500">
                        ${t.entry_price.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-500">
                        {t.exit_price ? `$${t.exit_price.toLocaleString()}` : "Active..."}
                      </td>
                      <td className="py-3.5 px-4">
                        {t.exit_reason ? (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-[10px] font-medium border uppercase ${getReasonBadgeClass(t.exit_reason)}`}>
                            {t.exit_reason.replace("_", " ")}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono italic text-[10px]">Active scanning...</span>
                        )}
                      </td>
                      <td className={`py-3.5 px-4 text-right font-sans font-bold text-sm ${t.pnl_usdt && t.pnl_usdt >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {t.pnl_usdt ? `${t.pnl_usdt >= 0 ? "+" : ""}$${t.pnl_usdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Active"}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400">
                        {isSelected ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </td>
                    </tr>

                    {/* Trade Detail Drawer */}
                    {isSelected && (
                      <tr>
                        <td colSpan={8} className="bg-slate-50 border-t border-b border-slate-100 p-5">
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-slate-600" id={`trade-drawer-${t.id}`}>
                            {/* Execution stats */}
                            <div className="space-y-3">
                              <h4 className="text-[10px] font-mono text-indigo-650 uppercase tracking-wider">Trade Parameters</h4>
                              <div className="space-y-1.5 text-xs font-sans">
                                <div className="flex justify-between border-b border-slate-200/50 pb-1">
                                  <span className="text-slate-400">Leverage:</span>
                                  <span className="font-semibold text-slate-700">{t.leverage}x Cross</span>
                                </div>
                                <div className="flex justify-between border-b border-slate-200/50 pb-1">
                                  <span className="text-slate-400">Hold Duration:</span>
                                  <span className="font-semibold text-slate-700">{Math.floor(t.hold_duration_seconds / 60)}m {t.hold_duration_seconds % 60}s</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Commissions Paid:</span>
                                  <span className="font-mono text-slate-700">${t.fees_paid_usdt.toFixed(4)}</span>
                                </div>
                              </div>
                            </div>

                            {/* Adverse excursions */}
                            <div className="space-y-3">
                              <h4 className="text-[10px] font-mono text-rose-600 uppercase tracking-wider">Risk Excursions</h4>
                              <div className="space-y-1.5 text-xs font-sans">
                                <div className="flex justify-between border-b border-slate-200/50 pb-1">
                                  <span className="text-slate-400">Max Fav Excursion (MFE):</span>
                                  <span className="font-mono text-emerald-600 font-bold">+{t.max_favorable_excursion.toFixed(3)}%</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Max Adv Excursion (MAE):</span>
                                  <span className="font-mono text-rose-600 font-bold">-{t.max_adverse_excursion.toFixed(3)}%</span>
                                </div>
                              </div>
                            </div>

                            {/* Sentiment parameters */}
                            <div className="space-y-3">
                              <h4 className="text-[10px] font-mono text-amber-600 uppercase tracking-wider">Sentiment Factors</h4>
                              <div className="space-y-1.5 text-xs font-sans">
                                <div className="flex justify-between border-b border-slate-200/50 pb-1">
                                  <span className="text-slate-400">Sentiment Score:</span>
                                  <span className={`font-mono font-bold ${t.sentiment_score_at_entry >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{t.sentiment_score_at_entry.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Momentum Vector:</span>
                                  <span className="font-mono text-slate-700">{t.sentiment_momentum_at_entry >= 0 ? "BULLISH" : "BEARISH"} ({t.sentiment_momentum_at_entry.toFixed(2)})</span>
                                </div>
                              </div>
                            </div>

                            {/* Technical snapshots */}
                            <div className="space-y-3">
                              <h4 className="text-[10px] font-mono text-indigo-650 uppercase tracking-wider">Feature Snapshot</h4>
                              <div className="space-y-1.5 text-xs font-sans">
                                <div className="flex justify-between border-b border-slate-200/50 pb-1">
                                  <span className="text-slate-400">Market Regime:</span>
                                  <span className="font-semibold text-slate-700 uppercase text-[10px]">{t.regime_at_entry.replace("_", " ")}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Entry Score:</span>
                                  <span className="font-mono text-indigo-600 font-bold">{t.entry_signal_score}/100</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {filteredTrades.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center font-mono text-slate-400 text-xs italic py-16">
                    No historical trades matching the current filter criteria...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
