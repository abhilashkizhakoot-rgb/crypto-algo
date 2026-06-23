/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { dbManager } from "./src/db_sim.js";
import { tradingEngine } from "./src/engine.js";
import { ConnectionStatus } from "./src/types.js";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Body parser
  app.use(express.json());

  // ----------------------------------------------------
  // REST API: Exchange Configuration
  // ----------------------------------------------------

  app.get("/api/exchange/credentials", (req, res) => {
    const creds = dbManager.getCredentials();
    // Mask API secrets before sending to front-end
    const maskedCreds = {
      ...creds,
      api_key: creds.api_key ? `${creds.api_key.substring(0, 8)}...xxxx` : "",
      api_secret: creds.api_secret ? `${creds.api_secret.substring(0, 8)}...yyyy` : "",
    };
    res.json(maskedCreds);
  });

  app.put("/api/exchange/credentials", (req, res) => {
    const updates = req.body;
    // Don't overwrite if it is the masked placeholder
    if (updates.api_key && updates.api_key.includes("...xxxx")) {
      delete updates.api_key;
    }
    if (updates.api_secret && updates.api_secret.includes("...yyyy")) {
      delete updates.api_secret;
    }

    const updated = dbManager.updateCredentials(updates);
    res.json(updated);
  });

  app.post("/api/exchange/test-connection", (req, res) => {
    dbManager.updateCredentials({
      connection_status: ConnectionStatus.TESTING,
      last_tested_at: new Date().toISOString(),
    });

    // Simulate short network test and succeed
    setTimeout(() => {
      dbManager.updateCredentials({
        connection_status: ConnectionStatus.CONNECTED,
        last_successful_connection: new Date().toISOString(),
        connection_error_message: null,
      });
    }, 1500);

    res.json({ status: "testing_initiated" });
  });

  app.post("/api/exchange/disconnect", (req, res) => {
    const disconnected = dbManager.updateCredentials({
      connection_status: ConnectionStatus.DISABLED,
    });
    res.json(disconnected);
  });

  // ----------------------------------------------------
  // REST API: Trading Control
  // ----------------------------------------------------

  app.post("/api/trading/start", (req, res) => {
    dbManager.updateConfig("general", { is_trading_active: true });
    res.json({ status: "trading_started" });
  });

  app.post("/api/trading/stop", (req, res) => {
    dbManager.updateConfig("general", { is_trading_active: false });
    res.json({ status: "trading_stopped" });
  });

  app.post("/api/trading/force-exit", (req, res) => {
    const executed = tradingEngine.forceExit();
    res.json({ executed, message: executed ? "Manual trade exit executed successfully." : "No active trade to exit." });
  });

  // ----------------------------------------------------
  // REST API: Status & Live Feeds
  // ----------------------------------------------------

  app.get("/api/status", (req, res) => {
    res.json(tradingEngine.getStatus());
  });

  app.get("/api/market/candles", (req, res) => {
    // Expose candles and computed indicator lines for charts
    res.json(tradingEngine.getStatus());
  });

  // ----------------------------------------------------
  // REST API: Trades, Signals, and Logs
  // ----------------------------------------------------

  app.get("/api/trades", (req, res) => {
    res.json(dbManager.getTrades());
  });

  app.get("/api/trades/:id", (req, res) => {
    const trade = dbManager.getTradeById(req.params.id);
    if (!trade) {
      res.status(404).json({ error: "Trade not found" });
    } else {
      res.json(trade);
    }
  });

  app.get("/api/signals", (req, res) => {
    res.json(dbManager.getSignals());
  });

  app.get("/api/headlines", (req, res) => {
    res.json(dbManager.getHeadlines());
  });

  app.get("/api/logs", (req, res) => {
    res.json(tradingEngine.getLogs());
  });

  // ----------------------------------------------------
  // REST API: Analytics
  // ----------------------------------------------------

  app.get("/api/analytics/summary", (req, res) => {
    res.json(dbManager.getAnalyticsSummary());
  });

  app.get("/api/analytics/equity-curve", (req, res) => {
    res.json(dbManager.getEquityCurve());
  });

  app.get("/api/analytics/daily-breakdown", (req, res) => {
    res.json(dbManager.getDailyBreakdown());
  });

  app.get("/api/analytics/regime-performance", (req, res) => {
    res.json(dbManager.getPerformanceByRegime());
  });

  // ----------------------------------------------------
  // REST API: Strategy Configurations & Profiles
  // ----------------------------------------------------

  app.get("/api/config", (req, res) => {
    res.json(dbManager.getConfig());
  });

  app.put("/api/config/:category", (req, res) => {
    const category = req.params.category as any;
    const updates = req.body;
    const updated = dbManager.updateConfig(category, updates);
    res.json(updated);
  });

  app.get("/api/config/profiles", (req, res) => {
    res.json(dbManager.getProfiles());
  });

  app.post("/api/config/profiles/save", (req, res) => {
    const { name, config } = req.body;
    dbManager.saveProfile(name, config);
    res.json({ status: "profile_saved" });
  });

  app.post("/api/config/profiles/load/:name", (req, res) => {
    const config = dbManager.loadProfile(req.params.name);
    res.json(config);
  });

  app.delete("/api/config/profiles/:name", (req, res) => {
    dbManager.deleteProfile(req.params.name);
    res.json({ status: "profile_deleted" });
  });

  app.get("/api/config/history", (req, res) => {
    res.json(dbManager.getConfigHistory());
  });

  // ----------------------------------------------------
  // REST API: Machine Learning Management
  // ----------------------------------------------------

  app.get("/api/ml/features/importance", (req, res) => {
    // Top features based on our 50 feature specification
    const importance = [
      { name: "catboost_probability", score: 98.4 },
      { name: "regime_at_entry", score: 85.2 },
      { name: "current_sentiment", score: 79.1 },
      { name: "atr_expansion_ratio", score: 68.3 },
      { name: "rsi_14", score: 62.1 },
      { name: "ema_structure_score", score: 54.8 },
      { name: "sentiment_momentum", score: 51.2 },
      { name: "vwap_distance_pct", score: 47.9 },
      { name: "volume_expansion_ratio", score: 38.5 },
      { name: "adx_14", score: 32.1 },
    ];
    res.json(importance);
  });

  app.post("/api/ml/retrain", (req, res) => {
    // Simulate walk-forward purged training process
    const jobId = `job-${Date.now()}`;
    const startRetraining = () => {
      tradingEngine.getLogs().unshift(`[ML-Retraining] Retraining Job ${jobId} initiated...`);
      tradingEngine.getLogs().unshift(`[ML-Retraining] Gathering last 6 months of 1-minute historical candles...`);
      tradingEngine.getLogs().unshift(`[ML-Retraining] Computing 50 Technical, Volatility, Sentiment, and Interaction features...`);
      tradingEngine.getLogs().unshift(`[ML-Retraining] Running walk-forward purged validation (10-candle gap protection)...`);
      setTimeout(() => {
        const newAuc = 0.82 + Math.random() * 0.05;
        dbManager.updateConfig("ml_settings", {
          last_trained_at: new Date().toISOString(),
          validation_auc: Number(newAuc.toFixed(2)),
          model_version: `v2.4.${Math.floor(Math.random() * 9 + 2)}`,
        }, "ML Auto Trainer");
        tradingEngine.getLogs().unshift(`[ML-Retraining] Job ${jobId} SUCCESS. Model converged with Validation AUC: ${newAuc.toFixed(2)}. Hot deployed to engine.`);
      }, 4000);
    };

    startRetraining();
    res.json({ job_id: jobId, status: "started" });
  });

  // ----------------------------------------------------
  // Server-Sent Events (SSE) Stream
  // Perfect for real-time iframe-compatible live dashboard feeds
  // ----------------------------------------------------

  app.get("/api/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Send initial status
    const sendEvent = (data: any) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent({
      type: "status",
      payload: tradingEngine.getStatus(),
    });

    const interval = setInterval(() => {
      sendEvent({
        type: "status",
        payload: tradingEngine.getStatus(),
      });
    }, 1500);

    req.on("close", () => {
      clearInterval(interval);
    });
  });

  // ----------------------------------------------------
  // Vite Integration & Static File Serving
  // ----------------------------------------------------

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`AI Scalper Bot backend server is running on http://localhost:${PORT}`);
  });
}

startServer();
