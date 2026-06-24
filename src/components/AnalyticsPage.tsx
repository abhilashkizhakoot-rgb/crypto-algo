/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import {
  TrendingUp,
  Percent,
  TrendingDown,
  Activity,
  Sparkles,
  BookOpen,
  PieChart,
  Grid,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { DailyStats, MarketRegime } from "../types.js";
import { safeFormatDateTimeShort, safeFormatDateShort, safeFormatNumber } from "../utils/format";

interface AnalyticsPageProps {
  summary: any;
  equityCurve: { timestamp: string; balance: number }[];
  dailyStats: DailyStats[];
  regimeStats: Record<string, { trades: number; win_rate: number; pnl: number }>;
}

export default function AnalyticsPage({
  summary,
  equityCurve,
  dailyStats,
  regimeStats,
}: AnalyticsPageProps) {
  // Format dates for charts
  const formattedEquityData = equityCurve.map((pt) => ({
    ...pt,
    time: safeFormatDateTimeShort(pt.timestamp),
  }));

  const formattedDailyData = dailyStats.map((d) => ({
    ...d,
    dateStr: safeFormatDateShort(d.date + "T00:00:00"),
  }));

  // Format regime data for charting
  const regimeChartData = Object.keys(regimeStats).map((key) => ({
    name: key.replace("_", " "),
    trades: regimeStats[key].trades,
    winRate: regimeStats[key].win_rate,
    pnl: regimeStats[key].pnl,
  }));

  return (
    <div className="space-y-6">
      {/* 4-Widget Stats Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" id="analytics-stats-grid">
        <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5">
          <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Net Profit (USDT)</p>
          <p className={`text-xl font-sans font-extrabold mt-1 ${summary.net_profit_usdt >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {summary.net_profit_usdt >= 0 ? "+" : ""}${safeFormatNumber(summary.net_profit_usdt, 2, 2)}
          </p>
          <div className="flex items-center gap-1.5 mt-2 text-[10px] text-slate-400 font-mono">
            <span>Commissions:</span>
            <span className="text-slate-600 font-semibold">${summary.fees_paid_usdt?.toFixed(2)}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5">
          <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Win Rate / Totals</p>
          <p className="text-xl font-sans font-extrabold text-slate-800 mt-1">
            {summary.win_rate}%
          </p>
          <div className="flex items-center gap-1 mt-2 text-[10px] text-slate-400 font-mono">
            <span className="text-emerald-600 font-bold">{summary.wins} Wins</span>
            <span>/</span>
            <span className="text-rose-600 font-bold">{summary.losses} Losses</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5">
          <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Profit Factor</p>
          <p className="text-xl font-sans font-extrabold text-indigo-650 mt-1">
            {summary.profit_factor}x
          </p>
          <div className="flex items-center gap-1.5 mt-2 text-[10px] text-slate-400 font-mono">
            <span>Target ratio:</span>
            <span className="text-slate-600 font-semibold">{">"}1.5x</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5">
          <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Sharpe Ratio</p>
          <p className="text-xl font-sans font-extrabold text-slate-800 mt-1">
            {summary.sharpe_ratio}
          </p>
          <div className="flex items-center gap-1.5 mt-2 text-[10px] text-slate-400 font-mono">
            <span>Drawdown:</span>
            <span className="text-rose-600 font-semibold">${safeFormatNumber(summary.max_drawdown_usdt)}</span>
          </div>
        </div>
      </div>

      {/* Cumulative Equity Curve Chart */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5" id="equity-curve-chart-card">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="w-5 h-5 text-indigo-600" />
          <span className="font-sans font-semibold text-slate-800 text-sm">Cumulative Growth (USD)</span>
        </div>

        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={formattedEquityData} margin={{ top: 5, right: 10, left: 15, bottom: 5 }}>
              <defs>
                <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="time" stroke="#94a3b8" fontSize={9} tickLine={false} axisLine={false} />
              <YAxis
                domain={["dataMin - 100", "dataMax + 100"]}
                stroke="#94a3b8"
                fontSize={9}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `$${safeFormatNumber(val)}`}
              />
              <Tooltip
                contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0" }}
                labelStyle={{ color: "#64748b", fontSize: "10px" }}
                itemStyle={{ fontSize: "11px", color: "#1e293b" }}
                formatter={(val: any) => [`$${safeFormatNumber(val)}`, "Balance"]}
              />
              <Area type="monotone" dataKey="balance" stroke="#4f46e5" strokeWidth={2} fillOpacity={1} fill="url(#colorBalance)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="analytics-bottom-charts">
        {/* Daily Profit Breakdown */}
        <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Percent className="w-5 h-5 text-indigo-600" />
            <span className="font-sans font-semibold text-slate-800 text-sm">Daily Net Gains (USDT)</span>
          </div>

          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={formattedDailyData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="dateStr" stroke="#94a3b8" fontSize={9} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0" }}
                  labelStyle={{ color: "#64748b", fontSize: "10px" }}
                  itemStyle={{ fontSize: "11px", color: "#1e293b" }}
                  formatter={(val) => [`$${val}`, "Net PnL"]}
                />
                <Bar dataKey="net_profit_usdt">
                  {formattedDailyData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.net_profit_usdt >= 0 ? "#10b981" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Performance by Market Regime */}
        <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Grid className="w-5 h-5 text-indigo-600" />
              <span className="font-sans font-semibold text-slate-800 text-sm">Performance by Regime</span>
            </div>

            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={regimeChartData} layout="vertical" margin={{ top: 5, right: 10, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" stroke="#94a3b8" fontSize={9} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                  <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={8} tickLine={false} axisLine={false} width={80} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0" }}
                    labelStyle={{ color: "#64748b", fontSize: "10px" }}
                    itemStyle={{ fontSize: "11px", color: "#1e293b" }}
                  />
                  <Bar dataKey="pnl" fill="#4f46e5" radius={[0, 4, 4, 0]}>
                    {regimeChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? "#4f46e5" : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
