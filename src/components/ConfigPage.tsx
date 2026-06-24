/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  Settings,
  Cpu,
  Shield,
  History,
  Save,
  Trash2,
  FolderOpen,
  ArrowLeftRight,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { StrategyConfig, ConfigHistoryEntry, NewsSource } from "../types.js";

interface ConfigPageProps {
  config: StrategyConfig;
  profiles: Record<string, StrategyConfig>;
  history: ConfigHistoryEntry[];
  onRefresh: () => void;
}

export default function ConfigPage({
  config,
  profiles,
  history,
  onRefresh,
}: ConfigPageProps) {
  const [activeTab, setActiveTab] = useState<"general" | "ml" | "sentiment" | "risk" | "profiles" | "history">("risk");
  const [newProfileName, setNewProfileName] = useState("");
  const [keywordInput, setKeywordInput] = useState("");

  // Sub-tab State Mirroring
  const [generalConfig, setGeneralConfig] = useState(config.general);
  const [mlConfig, setMlConfig] = useState(config.ml_settings);
  const [sentimentConfig, setSentimentConfig] = useState(config.sentiment_settings);
  const [riskConfig, setRiskConfig] = useState(config.risk_management);

  useEffect(() => {
    setGeneralConfig(config.general);
    setMlConfig(config.ml_settings);
    setSentimentConfig(config.sentiment_settings);
    setRiskConfig(config.risk_management);
  }, []); // Run only on mount to prevent background refreshes from clearing user edits

  const handleSaveCategory = async (category: string, data: any) => {
    try {
      const res = await fetch(`/api/config/${category}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        onRefresh();
        alert(`Success: ${category.toUpperCase()} parameters successfully committed to DB.`);
      }
    } catch (e) {
      alert("Failed to commit settings, check server connection.");
    }
  };

  const handleSaveProfile = async () => {
    if (!newProfileName.trim()) return;
    try {
      const res = await fetch("/api/config/profiles/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProfileName, config }),
      });
      if (res.ok) {
        setNewProfileName("");
        onRefresh();
        alert(`Profile "${newProfileName}" successfully exported.`);
      }
    } catch (e) {
      alert("Failed to save profile.");
    }
  };

  const handleLoadProfile = async (name: string) => {
    try {
      const res = await fetch(`/api/config/profiles/load/${name}`, {
        method: "POST",
      });
      if (res.ok) {
        const loaded = await res.json();
        setGeneralConfig(loaded.general);
        setMlConfig(loaded.ml_settings);
        setSentimentConfig(loaded.sentiment_settings);
        setRiskConfig(loaded.risk_management);
        onRefresh();
        alert(`Strategy Profile "${name}" successfully compiled and hot-deployed.`);
      }
    } catch (e) {
      alert("Failed to load profile.");
    }
  };

  const handleDeleteProfile = async (name: string) => {
    if (!confirm(`Are you sure you want to delete profile "${name}"?`)) return;
    try {
      const res = await fetch(`/api/config/profiles/${name}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onRefresh();
      }
    } catch (e) {
      alert("Failed to delete profile.");
    }
  };

  const handleAddKeyword = () => {
    if (!keywordInput.trim()) return;
    const kw = keywordInput.trim();
    if (sentimentConfig.critical_keywords.includes(kw)) return;

    const updatedKw = [...sentimentConfig.critical_keywords, kw];
    setSentimentConfig({ ...sentimentConfig, critical_keywords: updatedKw });
    setKeywordInput("");
  };

  const handleRemoveKeyword = (kw: string) => {
    const updatedKw = sentimentConfig.critical_keywords.filter((k) => k !== kw);
    setSentimentConfig({ ...sentimentConfig, critical_keywords: updatedKw });
  };

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 min-h-[500px] flex flex-col md:flex-row gap-8">
      {/* Sidebar Tabs Selectors */}
      <div className="md:w-1/4 flex flex-col gap-1 border-r border-slate-100 pr-4 flex-shrink-0" id="config-tabs-sidebar">
        <button
          onClick={() => setActiveTab("risk")}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg text-xs font-sans font-semibold transition-all duration-150 cursor-pointer ${
            activeTab === "risk" ? "bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          }`}
        >
          <Shield className="w-4 h-4" />
          General & Risk Management
        </button>

        <button
          onClick={() => setActiveTab("ml")}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg text-xs font-sans font-semibold transition-all duration-150 cursor-pointer ${
            activeTab === "ml" ? "bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          }`}
        >
          <Cpu className="w-4 h-4" />
          CatBoost AI Thresholds
        </button>

        <button
          onClick={() => setActiveTab("sentiment")}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg text-xs font-sans font-semibold transition-all duration-150 cursor-pointer ${
            activeTab === "sentiment" ? "bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          Sentiment RSS Filters
        </button>

        <button
          onClick={() => setActiveTab("profiles")}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg text-xs font-sans font-semibold transition-all duration-150 cursor-pointer ${
            activeTab === "profiles" ? "bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          }`}
        >
          <FolderOpen className="w-4 h-4" />
          Strategy Profile Profiles
        </button>

        <button
          onClick={() => setActiveTab("history")}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg text-xs font-sans font-semibold transition-all duration-150 cursor-pointer ${
            activeTab === "history" ? "bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          }`}
        >
          <History className="w-4 h-4" />
          Rollback Audit History
        </button>
      </div>

      {/* Main Form Fields Container */}
      <div className="flex-1" id="config-form-content">
        {/* ================= RISK MANAGEMENT TAB ================= */}
        {activeTab === "risk" && (
          <div className="space-y-6">
            <div>
              <h3 className="font-sans font-bold text-sm text-slate-800">Dynamic Risk & Position Sizing</h3>
              <p className="text-xs text-slate-400 font-sans mt-1">Configure Delta Exchange futures exposure and circuit-breaker safeguards.</p>
            </div>

            <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-sm">
              <div>
                <h4 className="text-xs font-bold font-sans text-slate-700 flex items-center gap-1.5 uppercase">
                  <Shield className="w-4 h-4 text-indigo-500" />
                  Strategy Execution Environment
                </h4>
                <p className="text-[11px] text-slate-400 mt-1">
                  Toggle between simulated paper execution with zero financial risk and real Delta Exchange contract trading.
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/trading/toggle-paper-mode", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ is_paper_trading: true }),
                      });
                      if (res.ok) {
                        onRefresh();
                        alert("Environment successfully toggled to PAPER TRADING.");
                      }
                    } catch (e) {
                      alert("Failed to toggle mode.");
                    }
                  }}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                    generalConfig.is_paper_trading
                      ? "bg-amber-100 border-amber-200 text-amber-800"
                      : "bg-white border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Paper Trading
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/trading/toggle-paper-mode", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ is_paper_trading: false }),
                      });
                      if (res.ok) {
                        onRefresh();
                        alert("Environment successfully toggled to LIVE ACCOUNT.");
                      }
                    } catch (e) {
                      alert("Failed to toggle mode.");
                    }
                  }}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                    !generalConfig.is_paper_trading
                      ? "bg-rose-600 border-rose-600 text-white"
                      : "bg-white border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Live Account
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-slate-600">
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-400 uppercase">Risk Per Trade (%)</label>
                <input
                  type="number"
                  step="0.05"
                  value={riskConfig.risk_per_trade_pct}
                  onChange={(e) => setRiskConfig({ ...riskConfig, risk_per_trade_pct: parseFloat(e.target.value) || 0.1 })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none font-mono"
                />
                <p className="text-[10px] text-slate-400">Capital percentage risked on stop loss execution (Recommended: 0.5%)</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-400 uppercase">Max Risk Per Trade (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={riskConfig.max_risk_per_trade_pct}
                  onChange={(e) => setRiskConfig({ ...riskConfig, max_risk_per_trade_pct: parseFloat(e.target.value) || 1.0 })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none font-mono"
                />
                <p className="text-[10px] text-slate-400">Absolute peak risk permitted under high volatility parameters.</p>
              </div>

              <div className="space-y-2 col-span-1 md:col-span-2 bg-indigo-50/40 border border-indigo-100/50 rounded-xl p-4 mt-1">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold text-indigo-950 font-sans uppercase tracking-wider flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
                    Target Leverage
                  </label>
                  <span className="font-mono text-xs font-bold bg-indigo-100 text-indigo-700 px-2.5 py-0.5 rounded-full">
                    {riskConfig.leverage || 20}x
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-2">
                  <input
                    type="range"
                    min="1"
                    max="100"
                    step="1"
                    value={riskConfig.leverage || 20}
                    onChange={(e) => setRiskConfig({ ...riskConfig, leverage: parseInt(e.target.value) || 20 })}
                    className="flex-1 h-1.5 bg-indigo-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={riskConfig.leverage || 20}
                    onChange={(e) => setRiskConfig({ ...riskConfig, leverage: Math.max(1, Math.min(100, parseInt(e.target.value) || 1)) })}
                    className="w-16 bg-white border border-slate-200 rounded-lg p-1.5 text-center text-xs font-mono font-bold text-slate-800 focus:ring-1 focus:ring-indigo-400 outline-none"
                  />
                </div>
                <p className="text-[10px] text-indigo-600/80 mt-1 font-sans">
                  Specifies position scaling on Delta Exchange contracts. Higher leverage scales position size but increases liquidation risk.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-400 uppercase">Stop Loss ATR Multiplier</label>
                <input
                  type="number"
                  step="0.1"
                  value={riskConfig.stop_loss_atr_multiplier}
                  onChange={(e) => setRiskConfig({ ...riskConfig, stop_loss_atr_multiplier: parseFloat(e.target.value) || 1.0 })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none font-mono"
                />
                <p className="text-[10px] text-slate-400">Dynamic Stop Distance factor: multiplier × ATR(14) (Standard: 1.3x)</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-400 uppercase">Take Profit Reward Ratio</label>
                <input
                  type="number"
                  step="0.1"
                  value={riskConfig.take_profit_ratio}
                  onChange={(e) => setRiskConfig({ ...riskConfig, take_profit_ratio: parseFloat(e.target.value) || 2.0 })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none font-mono"
                />
                <p className="text-[10px] text-slate-400">Risk-to-reward fraction: TakeProfit distance / StopLoss distance (Default: 2.0x)</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-400 uppercase">Max Consecutive Losses</label>
                <input
                  type="number"
                  value={riskConfig.max_consecutive_losses}
                  onChange={(e) => setRiskConfig({ ...riskConfig, max_consecutive_losses: parseInt(e.target.value) || 3 })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none font-mono"
                />
                <p className="text-[10px] text-slate-400">Triggers a 30-min scan cooldown lock on consecutive failures.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-400 uppercase">Daily Drawdown Circuit Breaker (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={riskConfig.daily_loss_limit_pct}
                  onChange={(e) => setRiskConfig({ ...riskConfig, daily_loss_limit_pct: parseFloat(e.target.value) || 2.0 })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none font-mono"
                />
                <p className="text-[10px] text-slate-400">Stops trading until next day UTC 00:00 when hit (Strict limit: 2.0%)</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-400 uppercase">Default Trading Quantity (BTC)</label>
                <input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  value={riskConfig.default_quantity_btc !== undefined ? riskConfig.default_quantity_btc : 0.001}
                  onChange={(e) => setRiskConfig({ ...riskConfig, default_quantity_btc: parseFloat(e.target.value) || 0.001 })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none font-mono"
                  id="config-default-quantity-btc"
                />
                <p className="text-[10px] text-slate-400">Position size for auto-signals and default for manual entries (e.g. 0.001 BTC)</p>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-5 flex justify-end">
              <button
                onClick={() => handleSaveCategory("risk_management", riskConfig)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-sans font-semibold px-5 py-2.5 rounded-lg transition-colors duration-150 cursor-pointer shadow-sm"
              >
                COMMIT RISK PARAMETERS
              </button>
            </div>
          </div>
        )}

        {/* ================= ML AI THRESHOLDS TAB ================= */}
        {activeTab === "ml" && (
          <div className="space-y-6">
            <div>
              <h3 className="font-sans font-bold text-sm text-slate-800">CatBoost Classifier Probability Parameters</h3>
              <p className="text-xs text-slate-400 font-sans mt-1">Configure walk-forward decision model thresholds and automated retraining triggers.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-slate-600">
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-400 uppercase">Entry Threshold (LONG)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.5"
                  max="0.99"
                  value={mlConfig.entry_threshold_long}
                  onChange={(e) => setMlConfig({ ...mlConfig, entry_threshold_long: parseFloat(e.target.value) || 0.8 })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none font-mono"
                />
                <p className="text-[10px] text-slate-400">Minimum P(LONG) probability to allow buy order entry (Recommended: 0.80)</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-400 uppercase">Entry Threshold (SHORT)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="0.5"
                  value={mlConfig.entry_threshold_short}
                  onChange={(e) => setMlConfig({ ...mlConfig, entry_threshold_short: parseFloat(e.target.value) || 0.2 })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none font-mono"
                />
                <p className="text-[10px] text-slate-400">Maximum P(LONG) threshold to allow short sell entry (Recommended: 0.20)</p>
              </div>
            </div>

            <div className="bg-slate-50/50 p-4 border border-slate-200 rounded-xl space-y-3">
              <h4 className="text-xs font-sans font-bold text-indigo-700 uppercase">Retraining Schedules</h4>
              <div className="space-y-2.5 text-xs text-slate-600">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mlConfig.auto_retrain_weekly}
                    onChange={(e) => setMlConfig({ ...mlConfig, auto_retrain_weekly: e.target.checked })}
                    className="rounded border-slate-300 bg-white text-indigo-600 focus:ring-indigo-400"
                  />
                  <span>Perform Automatic Walk-Forward Retraining Weekly (Sunday 00:00 UTC)</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mlConfig.retrain_on_perf_drop}
                    onChange={(e) => setMlConfig({ ...mlConfig, retrain_on_perf_drop: e.target.checked })}
                    className="rounded border-slate-300 bg-white text-indigo-600 focus:ring-indigo-400"
                  />
                  <span>Retrain on Strategy Performance Drop ({">"}10% win-rate variance)</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mlConfig.retrain_on_feature_drift}
                    onChange={(e) => setMlConfig({ ...mlConfig, retrain_on_feature_drift: e.target.checked })}
                    className="rounded border-slate-300 bg-white text-indigo-600 focus:ring-indigo-400"
                  />
                  <span>Retrain on Feature Drift Alerts (Population Stability Index {">"} 0.25)</span>
                </label>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-5 flex justify-end">
              <button
                onClick={() => handleSaveCategory("ml_settings", mlConfig)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-sans font-semibold px-5 py-2.5 rounded-lg transition-colors duration-150 cursor-pointer shadow-sm"
              >
                COMMIT ML PARAMETERS
              </button>
            </div>
          </div>
        )}

        {/* ================= SENTIMENT ENGINE TAB ================= */}
        {activeTab === "sentiment" && (
          <div className="space-y-6">
            <div>
              <h3 className="font-sans font-bold text-sm text-slate-800">Sentiment RSS & News Protection Lock</h3>
              <p className="text-xs text-slate-400 font-sans mt-1">Configure headlines keyword matching thresholds and individual feed scoring ratios.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-slate-600">
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-400 uppercase">LONG Sentiment Minimum</label>
                <input
                  type="number"
                  step="0.05"
                  value={sentimentConfig.entry_threshold_long}
                  onChange={(e) => setSentimentConfig({ ...sentimentConfig, entry_threshold_long: parseFloat(e.target.value) || 0.25 })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none font-mono"
                />
                <p className="text-[10px] text-slate-400">Weighted average threshold needed to buy (Default: +0.25)</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-400 uppercase">SHORT Sentiment Maximum</label>
                <input
                  type="number"
                  step="0.05"
                  value={sentimentConfig.entry_threshold_short}
                  onChange={(e) => setSentimentConfig({ ...sentimentConfig, entry_threshold_short: parseFloat(e.target.value) || -0.25 })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none font-mono"
                />
                <p className="text-[10px] text-slate-400">Weighted average threshold needed to short sell (Default: -0.25)</p>
              </div>
            </div>

            {/* Keyword block list */}
            <div className="bg-slate-50/50 p-4 border border-slate-200 rounded-xl space-y-3">
              <h4 className="text-xs font-sans font-bold text-indigo-700 uppercase">Shield Protection: Critical Keywords</h4>
              <p className="text-[10px] text-slate-400 leading-relaxed font-sans">
                RSS news headings containing any keyword below will trigger an immediate entry block and lock trading parameters to mitigate news event slippages.
              </p>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter keyword (e.g. SEC, CPI, FED)..."
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  className="flex-1 bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-800 outline-none"
                />
                <button
                  onClick={handleAddKeyword}
                  className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-xs text-white rounded-lg font-sans cursor-pointer shadow-sm font-semibold"
                >
                  Add
                </button>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                {sentimentConfig.critical_keywords.map((kw) => (
                  <span
                    key={kw}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs font-sans text-slate-700"
                  >
                    {kw}
                    <button
                      onClick={() => handleRemoveKeyword(kw)}
                      className="text-slate-400 hover:text-rose-500 font-bold transition-colors cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-200 pt-5 flex justify-end">
              <button
                onClick={() => handleSaveCategory("sentiment_settings", sentimentConfig)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-sans font-semibold px-5 py-2.5 rounded-lg transition-colors duration-150 cursor-pointer shadow-sm"
              >
                COMMIT SENTIMENT PARAMETERS
              </button>
            </div>
          </div>
        )}

        {/* ================= STRATEGY PROFILE TAB ================= */}
        {activeTab === "profiles" && (
          <div className="space-y-6">
            <div>
              <h3 className="font-sans font-bold text-sm text-slate-800">Active Profile Management</h3>
              <p className="text-xs text-slate-400 font-sans mt-1">Export, snapshot, and hot-reload active parameter configurations.</p>
            </div>

            <div className="bg-slate-50/50 p-4 border border-slate-200 rounded-xl space-y-4">
              <h4 className="text-xs font-sans font-bold text-indigo-700 uppercase">Save Active Parameters</h4>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Profile Name (e.g. Extreme Volatility Grid)..."
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  className="flex-1 bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 outline-none"
                />
                <button
                  onClick={handleSaveProfile}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-sans font-semibold px-5 py-2.5 rounded-lg cursor-pointer flex items-center gap-2 shadow-sm"
                >
                  <Save className="w-4 h-4" /> Export
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-sans font-bold text-slate-400 uppercase">Stored Configs</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.keys(profiles).map((name) => (
                  <div
                    key={name}
                    className="bg-slate-50/50 border border-slate-200 rounded-xl p-4 flex justify-between items-center"
                  >
                    <div>
                      <p className="text-sm font-sans font-bold text-slate-800">{name}</p>
                      <p className="text-[10px] font-mono text-slate-400 mt-1 uppercase">Ready to compile</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleLoadProfile(name)}
                        className="p-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-600 rounded-lg cursor-pointer"
                        title="Load Strategy Profile"
                      >
                        <FolderOpen className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteProfile(name)}
                        className="p-2 bg-slate-100 border border-slate-200 hover:bg-rose-50 hover:text-rose-600 rounded-lg text-slate-400 cursor-pointer"
                        title="Delete Profile"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {Object.keys(profiles).length === 0 && (
                  <p className="text-slate-400 font-mono text-center text-xs italic py-10 col-span-2">No stored profiles found...</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================= ROLLBACK AUDIT HISTORY TAB ================= */}
        {activeTab === "history" && (
          <div className="space-y-6">
            <div>
              <h3 className="font-sans font-semibold text-sm text-slate-800">Rollback & Audit Log</h3>
              <p className="text-xs text-slate-400 font-sans mt-1">Review strategy parameter modifications and rollback previous executions.</p>
            </div>

            <div className="space-y-3 h-[400px] overflow-y-auto pr-1">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="bg-slate-50/50 border border-slate-200 rounded-xl p-4 space-y-3"
                >
                  <div className="flex justify-between items-center text-xs border-b border-slate-200 pb-2">
                    <span className="font-mono text-slate-400">
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md font-sans text-[10px] border border-slate-200">
                      {entry.changed_by}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {entry.changes.map((c, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono text-slate-500 font-semibold">{c.key}</span>
                        <span className="text-slate-400">:</span>
                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-mono">
                          {JSON.stringify(c.old_value)}
                        </span>
                        <ArrowLeftRight className="w-3.5 h-3.5 text-slate-400" />
                        <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded font-mono">
                          {JSON.stringify(c.new_value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {history.length === 0 && (
                <p className="text-slate-400 font-mono text-center text-xs italic py-10">No config modification audits found...</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
