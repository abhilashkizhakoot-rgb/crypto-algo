import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import path from 'path';
import { TradingEngine } from './src/engine';

const resolvedDirname = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Initialize and start trading engine
const engine = TradingEngine.getInstance();
engine.start().then(() => {
  console.log("Trading Engine started successfully on server boot.");
}).catch(err => {
  console.error("Error starting Trading Engine on boot:", err);
});

// API Routes
app.get('/api/status', (req, res) => {
  try {
    const status = engine.getEngineStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/config', (req, res) => {
  try {
    engine.updateConfig(req.body);
    res.json({ success: true, status: engine.getEngineStatus() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/headline', (req, res) => {
  try {
    const { headline, impact, sentiment } = req.body;
    if (!headline || !impact || sentiment === undefined) {
      return res.status(400).json({ error: "Missing required fields: headline, impact, sentiment" });
    }
    engine.addNewsHeadline(headline, impact, Number(sentiment));
    res.json({ success: true, status: engine.getEngineStatus() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/force-entry', (req, res) => {
  try {
    const { type } = req.body;
    if (type !== 'LONG' && type !== 'SHORT') {
      return res.status(400).json({ error: "Invalid trade type. Must be 'LONG' or 'SHORT'" });
    }
    engine.forceManualEntry(type);
    res.json({ success: true, status: engine.getEngineStatus() });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/force-exit', (req, res) => {
  try {
    engine.forceManualExit();
    res.json({ success: true, status: engine.getEngineStatus() });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/start', (req, res) => {
  try {
    engine.start();
    res.json({ success: true, status: engine.getEngineStatus() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stop', (req, res) => {
  try {
    engine.stop();
    res.json({ success: true, status: engine.getEngineStatus() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Serve static build from dist folder
app.use(express.static(path.join(resolvedDirname, 'dist')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(resolvedDirname, 'dist', 'index.html'));
});

const server = createServer(app);
server.listen(port, '0.0.0.0', () => {
  console.log(`Server listening at http://0.0.0.0:${port}`);
});
