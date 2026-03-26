/**
 * server.js
 * Main entry point: Express HTTP server + WebSocket server.
 * Bridges ADB logcat (or Demo mode) → Web UI (WebSocket) + Telegram.
 * Supports multiple ADB devices simultaneously.
 */

// Electron loads .env first and sets this flag — skip duplicate load
if (!process.env._DOTENV_LOADED) require('dotenv').config();

const http = require('http');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const AdbLogcat = require('./adb-logcat');
const DemoLogGenerator = require('./demo-log-generator');
const TelegramForwarder = require('./telegram-forwarder');
const { getDeviceMetadata, loadLdPlayerDisplayMap } = require('./ldplayer-instance-map');

// ─── Config ────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3000', 10);
const ADB_PATH = process.env.ADB_PATH || 'adb';
// Comma-separated device serials — leave blank to auto-detect all
const ADB_DEVICE_ENV = process.env.ADB_DEVICE || '';
const ADB_TAGS = process.env.ADB_TAGS
  ? process.env.ADB_TAGS.split(',').map(t => t.trim()).filter(Boolean)
  : [];
const ADB_MIN_LEVEL = process.env.ADB_MIN_LEVEL || 'V';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const TELEGRAM_ENABLED = process.env.TELEGRAM_ENABLED !== 'false';

const DEMO_MODE = process.env.DEMO_MODE === 'true';
const DEMO_INTERVAL_MS = parseInt(process.env.DEMO_INTERVAL_MS || '400', 10);
const LOG_HISTORY_LIMIT = parseInt(process.env.LOG_HISTORY_LIMIT || '500', 10);

// ─── Setup ─────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const telegram = new TelegramForwarder({
  botToken: TELEGRAM_TOKEN,
  chatId: TELEGRAM_CHAT_ID,
  enabled: TELEGRAM_ENABLED,
});

// In-memory ring buffer for recent logs
const logHistory = [];
let telegramForwarding = TELEGRAM_ENABLED && telegram.enabled;

// Active logcat instances: Map<serial, AdbLogcat>
const logcatInstances = new Map();
let ldPlayerDisplayMap = new Map();

// ─── Device Detection ──────────────────────────────────────────────────────

function getConnectedDevices() {
  try {
    const output = execSync(`"${ADB_PATH}" devices`, { timeout: 5000 }).toString();
    return output.split('\n')
      .slice(1)
      .map(line => line.trim())
      .filter(line => line.endsWith('\tdevice'))
      .map(line => line.split('\t')[0]);
  } catch (e) {
    console.error('[ADB] Failed to list devices:', e.message);
    return [];
  }
}

function resolveDevices() {
  if (ADB_DEVICE_ENV) {
    return ADB_DEVICE_ENV.split(',').map(s => s.trim()).filter(Boolean);
  }
  return getConnectedDevices();
}

function getDeviceList() {
  return [...logcatInstances.keys()].map(serial => getDeviceMetadata(serial, ldPlayerDisplayMap));
}

// ─── Logcat Management ─────────────────────────────────────────────────────

function attachLogcat(serial) {
  if (logcatInstances.has(serial)) return;

  const instance = new AdbLogcat({
    adbPath: ADB_PATH,
    deviceSerial: serial,
    tags: ADB_TAGS,
    minLevel: ADB_MIN_LEVEL,
  });

  instance.on('log', (entry) => {
    const device = getDeviceMetadata(serial, ldPlayerDisplayMap);
    entry.device = device.serial;
    entry.deviceName = device.displayName;
    logHistory.push(entry);
    if (logHistory.length > LOG_HISTORY_LIMIT) logHistory.shift();
    broadcast({ type: 'log', data: entry });
    if (telegramForwarding) telegram.enqueue(entry);
  });

  instance.on('error_msg', (msg) => {
    console.error(`[ADB:${serial}] stderr:`, msg);
    broadcast({ type: 'adb_error', data: `[${serial}] ${msg}` });
  });

  instance.on('spawn_error', (err) => {
    const msg = `Failed to start adb for ${serial}: ${err.message}`;
    console.error('[ADB]', msg);
    broadcast({ type: 'adb_error', data: msg });
  });

  instance.on('close', (code) => {
    console.log(`[ADB:${serial}] exited with code ${code}`);
    broadcast({ type: 'adb_closed', data: { code, device: serial } });
    logcatInstances.delete(serial);
  });

  logcatInstances.set(serial, instance);
  instance.start();
  console.log(`[ADB] Started logcat for device: ${serial}`);
}

function startAllDevices() {
  if (DEMO_MODE) return;
  ldPlayerDisplayMap = loadLdPlayerDisplayMap({ adbPath: ADB_PATH });
  const devices = resolveDevices();
  if (devices.length === 0) {
    console.warn('[ADB] No devices found. Waiting...');
    broadcast({ type: 'adb_error', data: 'No ADB devices connected.' });
    return;
  }
  console.log(`[ADB] Found ${devices.length} device(s): ${devices.join(', ')}`);
  devices.forEach(attachLogcat);
  broadcast({ type: 'devices', data: devices.map(serial => getDeviceMetadata(serial, ldPlayerDisplayMap)) });
}

function stopAllDevices() {
  logcatInstances.forEach((inst, serial) => {
    inst.stop();
    console.log(`[ADB] Stopped logcat for device: ${serial}`);
  });
  logcatInstances.clear();
}

// ─── Demo Mode ─────────────────────────────────────────────────────────────

let demoSource = null;
if (DEMO_MODE) {
  demoSource = new DemoLogGenerator({ intervalMs: DEMO_INTERVAL_MS });
  demoSource.on('log', (entry) => {
    entry.device = 'demo';
    entry.deviceName = 'demo';
    logHistory.push(entry);
    if (logHistory.length > LOG_HISTORY_LIMIT) logHistory.shift();
    broadcast({ type: 'log', data: entry });
    if (telegramForwarding) telegram.enqueue(entry);
  });
}

// ─── WebSocket ─────────────────────────────────────────────────────────────

wss.on('connection', (ws) => {
  console.log('[WS] Client connected');

  const devices = DEMO_MODE ? [{ serial: 'demo', displayName: 'demo' }] : getDeviceList();

  ws.send(JSON.stringify({
    type: 'config',
    data: {
      tags: ADB_TAGS,
      minLevel: ADB_MIN_LEVEL,
      telegramEnabled: telegramForwarding,
      telegramConfigured: telegram.enabled,
      historyCount: logHistory.length,
      devices,
    },
  }));

  if (logHistory.length > 0) {
    ws.send(JSON.stringify({ type: 'history', data: logHistory }));
  }

  ws.on('message', (msg) => {
    try {
      const cmd = JSON.parse(msg.toString());
      handleClientCommand(cmd, ws);
    } catch (_) {}
  });

  ws.on('close', () => console.log('[WS] Client disconnected'));
});

function broadcast(message) {
  const payload = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
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

// ─── REST API ──────────────────────────────────────────────────────────────

app.get('/api/status', (req, res) => {
  res.json({
    devices: getDeviceList(),
    tags: ADB_TAGS,
    minLevel: ADB_MIN_LEVEL,
    telegram: { configured: telegram.enabled, forwarding: telegramForwarding, ...telegram.stats() },
    clients: wss.clients.size,
    historyCount: logHistory.length,
  });
});

app.post('/api/telegram/toggle', (req, res) => {
  if (!telegram.enabled) return res.status(400).json({ error: 'Telegram not configured' });
  telegramForwarding = !telegramForwarding;
  broadcast({ type: 'telegram_toggled', data: { enabled: telegramForwarding } });
  res.json({ telegramForwarding });
});

app.post('/api/logcat/restart', (req, res) => {
  stopAllDevices();
  setTimeout(startAllDevices, 500);
  res.json({ status: 'restarting' });
});

app.post('/api/history/clear', (req, res) => {
  logHistory.length = 0;
  broadcast({ type: 'cleared' });
  res.json({ status: 'cleared' });
});

app.post('/api/export', (req, res) => {
  const { lines = [], filepath } = req.body;
  if (!filepath) {
    return res.status(400).json({ error: 'filepath is required' });
  }
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filepath, lines.join('\n'), 'utf8');
  res.json({ status: 'saved', path: filepath, count: lines.length });
});

// ─── Helpers ───────────────────────────────────────────────────────────────

function getTelegramStats() {
  return { forwarding: telegramForwarding, ...telegram.stats() };
}

// ─── Start ─────────────────────────────────────────────────────────────────

const serverReady = new Promise((resolve) => {
  server.listen(PORT, () => {
    console.log(`\n🚀 Logcat Streamer running at http://localhost:${PORT}`);
    console.log(`   Mode       : ${DEMO_MODE ? '🎭 DEMO (fake logs)' : '📱 ADB (multi-device)'}`);
    if (!DEMO_MODE) {
      console.log(`   Tag filter : ${ADB_TAGS.length ? ADB_TAGS.join(', ') : 'ALL'}`);
      console.log(`   Min level  : ${ADB_MIN_LEVEL}`);
    }
    console.log(`   Telegram   : ${telegram.enabled ? (telegramForwarding ? '✅ enabled' : '⏸ paused') : '❌ not configured'}`);
    console.log('');

    if (DEMO_MODE) {
      demoSource.start();
    } else {
      startAllDevices();
    }

    if (telegram.enabled) {
      telegram.notify(`🟢 Logcat Streamer started\nTags: <code>${ADB_TAGS.join(', ') || 'ALL'}</code>`);
    }

    resolve(PORT);
  });
});

module.exports = { serverReady };

process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...');
  stopAllDevices();
  if (demoSource) demoSource.stop();
  telegram.stop();
  server.close(() => process.exit(0));
});
