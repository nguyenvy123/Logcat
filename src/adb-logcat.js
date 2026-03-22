/**
 * adb-logcat.js
 * Spawns `adb logcat` and emits parsed log entries via EventEmitter.
 * Supports tag/package filtering and log level filtering.
 */

const { spawn } = require('child_process');
const EventEmitter = require('events');

// Log level priority map
const LEVEL_MAP = { V: 0, D: 1, I: 2, W: 3, E: 4, F: 5, S: 6 };

// Regex to parse logcat threadtime format:
// MM-DD HH:MM:SS.mmm  PID  TID LEVEL TAG  : message
const LOG_REGEX = /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+)\s+(\d+)\s+(\d+)\s+([VDIWEFS])\s+(.+?)\s*:\s(.*)$/;

class AdbLogcat extends EventEmitter {
  constructor(options = {}) {
    super();
    this.adbPath = options.adbPath || 'adb';
    this.deviceSerial = options.deviceSerial || null; // e.g. 'emulator-5554'
    this.tags = options.tags || []; // e.g. ['Unity', 'GameEngine'] — empty = all tags
    this.minLevel = options.minLevel || 'V'; // minimum level to emit
    this.process = null;
    this.running = false;
  }

  /**
   * Build adb args for logcat command.
   * If tags are specified, use tag:level filter syntax.
   */
  _buildArgs() {
    const args = [];
    if (this.deviceSerial) {
      args.push('-s', this.deviceSerial);
    }
    args.push('logcat', '-v', 'threadtime');

    if (this.tags.length > 0) {
      // e.g. Unity:V GameEngine:V *:S  (suppress all other tags)
      const minLevel = this.minLevel || 'V';
      this.tags.forEach(tag => args.push(`${tag}:${minLevel}`));
      args.push('*:S'); // silence everything else
    }

    return args;
  }

  start() {
    if (this.running) return;
    this.running = true;

    const args = this._buildArgs();
    console.log(`[ADB] Starting: ${this.adbPath} ${args.join(' ')}`);

    this.process = spawn(this.adbPath, args);

    // Buffer for incomplete lines
    let buffer = '';

    this.process.stdout.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete last line
      lines.forEach(line => this._parseLine(line.trim()));
    });

    this.process.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) {
        this.emit('error_msg', msg);
      }
    });

    this.process.on('close', (code) => {
      this.running = false;
      this.emit('close', code);
    });

    this.process.on('error', (err) => {
      this.running = false;
      this.emit('spawn_error', err);
    });
  }

  stop() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.running = false;
  }

  /**
   * Parse a single logcat line and emit 'log' event if valid.
   */
  _parseLine(line) {
    if (!line || line.startsWith('-----')) return;

    const match = LOG_REGEX.exec(line);
    if (!match) {
      // Non-standard line — emit as raw
      this.emit('log', {
        timestamp: new Date().toISOString(),
        pid: '',
        tid: '',
        level: 'V',
        tag: 'RAW',
        message: line,
        raw: line,
      });
      return;
    }

    const [, timestamp, pid, tid, level, tag, message] = match;

    // Apply minimum level filter (when no tag filter is set)
    if (this.tags.length === 0) {
      const minPriority = LEVEL_MAP[this.minLevel] ?? 0;
      const msgPriority = LEVEL_MAP[level] ?? 0;
      if (msgPriority < minPriority) return;
    }

    this.emit('log', {
      timestamp,
      pid,
      tid,
      level,
      tag: tag.trim(),
      message,
      raw: line,
    });
  }
}

module.exports = AdbLogcat;
