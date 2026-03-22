/**
 * server.js
 * Main entry point: Express HTTP server + WebSocket server.
 * Bridges ADB logcat (or Demo mode) → Web UI (WebSocket) + Telegram.
 */

// Electron loads .env first and sets this flag — skip duplicate load
if (!process.env._DOTENV_LOADED) require('dotenv').config();

const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const AdbLogcat = require('./adb-logcat');
const DemoLogGenerator = require('./demo-log-generator');
const TelegramForwarder = require('./telegram-forwarder');

// ─── Config ────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3000', 10);
const ADB_PATH = process.env.ADB_PATH || 'adb';
const ADB_DEVICE = process.env.ADB_DEVICE || null; // e.g. 'emulator-5554'
// Comma-separated tag list, e.g. "Unity,GameEngine,MyApp"
const ADB_TAGS = process.env.ADB_TAGS
  ? process.env.ADB_TAGS.split(',').map(t => t.trim()).filter(Boolean)
  : [];
const ADB_MIN_LEVEL = process.env.ADB_MIN_LEVEL || 'V';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const TELEGRAM_ENABLED = process.env.TELEGRAM_ENABLED !== 'false';

// Demo mode: generate fake logs instead of ADB (set DEMO_MODE=true in .env)
const DEMO_MODE = process.env.DEMO_MODE === 'true';
const DEMO_INTERVAL_MS = parseInt(process.env.DEMO_INTERVAL_MS || '400', 10);

// Max log entries kept in memory for new client catch-up
const LOG_HISTORY_LIMIT = parseInt(process.env.LOG_HISTORY_LIMIT || '500', 10);

// ─── Setup ─────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const telegram = new TelegramForwarder({
  botToken: TELEGRAM_TOKEN,
  chatId: TELEGRAM_CHAT_ID,
  enabled: TELEGRAM_ENABLED,
});

// Use DemoLogGenerator when DEMO_MODE=true, otherwise real ADB
const logSource = DEMO_MODE
  ? new DemoLogGenerator({ intervalMs: DEMO_INTERVAL_MS })
  : new AdbLogcat({ adbPath: ADB_PATH, deviceSerial: ADB_DEVICE, tags: ADB_TAGS, minLevel: ADB_MIN_LEVEL });

// Keep 'logcat' alias so rest of code stays unchanged
const logcat = logSource;

// In-memory ring buffer for recent logs (new clients get history)
const logHistory = [];

// Telegram forwarding toggle (can be toggled via API)
let telegramForwarding = TELEGRAM_ENABLED && telegram.enabled;

// ─── WebSocket ─────────────────────────────────────────────────────────────

wss.on('connection', (ws) => {
  console.log('[WS] Client connected');

  // Send current config state
  ws.send(JSON.stringify({
    type: 'config',
    data: {
      tags: ADB_TAGS,
      minLevel: ADB_MIN_LEVEL,
      telegramEnabled: telegramForwarding,
      telegramConfigured: telegram.enabled,
      historyCount: logHistory.length,
    },
  }));

  // Replay recent log history
  if (logHistory.length > 0) {
    ws.send(JSON.stringify({ type: 'history', data: logHistory }));
  }

  ws.on('message', (msg) => {
    try {
      const cmd = JSON.parse(msg.toString());
      handleClientCommand(cmd, ws);
    } catch (_) { /* ignore invalid JSON */ }
  });

  ws.on('close', () => console.log('[WS] Client disconnected'));
});

function broadcast(message) {
  const payload = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

function handleClientCommand(cmd, ws) {
  if (cmd.type === 'ping') {
    ws.send(JSON.stringify({ type: 'pong' }));
  } else if (cmd.type === 'clear_history') {
    logHistory.length = 0;
    broadcast({ type: 'cleared' });
  } else if (cmd.type === 'get_stats') {
    ws.send(JSON.stringify({ type: 'stats', data: getTelegramStats() }));
  }
}

// ─── Logcat Events ─────────────────────────────────────────────────────────

logcat.on('log', (entry) => {
  // Add to ring buffer
  logHistory.push(entry);
  if (logHistory.length > LOG_HISTORY_LIMIT) {
    logHistory.shift();
  }

  // Broadcast to all WebSocket clients
  broadcast({ type: 'log', data: entry });

  // Forward to Telegram if enabled
  if (telegramForwarding) {
    telegram.enqueue(entry);
  }
});

logcat.on('error_msg', (msg) => {
  console.error('[ADB stderr]', msg);
  broadcast({ type: 'adb_error', data: msg });
});

logcat.on('spawn_error', (err) => {
  const msg = `Failed to start adb: ${err.message}. Make sure adb is in PATH.`;
  console.error('[ADB]', msg);
  broadcast({ type: 'adb_error', data: msg });
});

logcat.on('close', (code) => {
  console.log(`[ADB] logcat process exited with code ${code}`);
  broadcast({ type: 'adb_closed', data: { code } });
});

// ─── REST API ──────────────────────────────────────────────────────────────

// GET /api/status
app.get('/api/status', (req, res) => {
  res.json({
    logcat: { running: logcat.running, tags: ADB_TAGS, minLevel: ADB_MIN_LEVEL },
    telegram: { configured: telegram.enabled, forwarding: telegramForwarding, ...telegram.stats() },
    clients: wss.clients.size,
    historyCount: logHistory.length,
  });
});

// POST /api/telegram/toggle
app.post('/api/telegram/toggle', (req, res) => {
  if (!telegram.enabled) {
    return res.status(400).json({ error: 'Telegram not configured' });
  }
  telegramForwarding = !telegramForwarding;
  broadcast({ type: 'telegram_toggled', data: { enabled: telegramForwarding } });
  res.json({ telegramForwarding });
});

// POST /api/logcat/restart
app.post('/api/logcat/restart', (req, res) => {
  logcat.stop();
  setTimeout(() => logcat.start(), 500);
  res.json({ status: 'restarting' });
});

// POST /api/history/clear
app.post('/api/history/clear', (req, res) => {
  logHistory.length = 0;
  broadcast({ type: 'cleared' });
  res.json({ status: 'cleared' });
});

// ─── Helpers ───────────────────────────────────────────────────────────────

function getTelegramStats() {
  return { forwarding: telegramForwarding, ...telegram.stats() };
}

// ─── Start ─────────────────────────────────────────────────────────────────

// serverReady resolves with PORT once the HTTP server is listening.
// Electron main process awaits this before opening the BrowserWindow.
const serverReady = new Promise((resolve) => {
  server.listen(PORT, () => {
    console.log(`\n🚀 Logcat Streamer running at http://localhost:${PORT}`);
    console.log(`   Mode       : ${DEMO_MODE ? '🎭 DEMO (fake logs)' : '📱 ADB'}`);
    if (!DEMO_MODE) {
      console.log(`   ADB device : ${ADB_DEVICE || 'auto-detect'}`);
      console.log(`   Tag filter : ${ADB_TAGS.length ? ADB_TAGS.join(', ') : 'ALL'}`);
      console.log(`   Min level  : ${ADB_MIN_LEVEL}`);
    }
    console.log(`   Telegram   : ${telegram.enabled ? (telegramForwarding ? '✅ enabled' : '⏸ configured but paused') : '❌ not configured'}`);
    console.log('');

    logcat.start();

    if (telegram.enabled) {
      const modeLabel = DEMO_MODE ? '🎭 Demo Mode' : `📱 Device: <code>${ADB_DEVICE || 'auto'}</code>`;
      telegram.notify(`🟢 Logcat Streamer started\n${modeLabel}\nTags: <code>${ADB_TAGS.join(', ') || 'ALL'}</code>`);
    }

    resolve(PORT);
  });
});

module.exports = { serverReady };

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...');
  logcat.stop();
  telegram.stop();
  server.close(() => process.exit(0));
});
