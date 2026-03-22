/**
 * demo-log-generator.js
 * Generates fake logcat entries for testing web UI and Telegram
 * without a real ADB device connected.
 */

const EventEmitter = require('events');

const SAMPLE_TAGS = ['Unity', 'GameEngine', 'MyGame', 'AudioManager', 'NetworkManager', 'UIManager', 'il2cpp'];
const SAMPLE_LEVELS = ['V', 'D', 'I', 'W', 'E', 'F'];
// Weight distribution: more V/D/I, fewer W/E, rare F
const LEVEL_WEIGHTS =   [10,   15,   20,   6,   4,   1];

const SAMPLE_MESSAGES = {
  V: ['Entering state: Idle', 'Tick 0.016ms', 'Asset loaded: sprite_001.png', 'Cache hit: player_data'],
  D: ['Player position updated: x=120 y=340', 'Frame 1042 rendered', 'Socket ping: 42ms', 'Loaded scene: GameLevel_03'],
  I: ['Game started', 'User logged in: player_001', 'Level 3 completed', 'Score updated: 9800', 'Connected to server ws://game.local:9000'],
  W: ['Low memory warning: 128MB remaining', 'Slow frame detected: 85ms', 'Retry attempt 2/3 for API call', 'Texture compression fallback used'],
  E: ['NullReferenceException in PlayerController.Update()', 'Failed to load asset: missing_texture.png', 'Network timeout after 5000ms', 'Invalid state transition: Dead -> Running'],
  F: ['FATAL: Out of memory — heap limit exceeded', 'FATAL: Unhandled exception in game loop'],
};

class DemoLogGenerator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.intervalMs = options.intervalMs || 400; // emit a log every 400ms
    this.running = false;
    this._timer = null;
    this._pid = 1234;
  }

  start() {
    if (this.running) return;
    this.running = true;
    console.log('[Demo] Generating fake log entries every', this.intervalMs, 'ms');
    this._tick();
  }

  stop() {
    this.running = false;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  }

  _tick() {
    if (!this.running) return;
    this.emit('log', this._generate());
    this._timer = setTimeout(() => this._tick(), this.intervalMs);
  }

  _generate() {
    const level = this._weightedLevel();
    const tag = SAMPLE_TAGS[Math.floor(Math.random() * SAMPLE_TAGS.length)];
    const msgs = SAMPLE_MESSAGES[level];
    const message = msgs[Math.floor(Math.random() * msgs.length)];
    const now = new Date();
    const ts = `${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} `
             + `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:`
             + `${String(now.getSeconds()).padStart(2,'0')}.${String(now.getMilliseconds()).padStart(3,'0')}`;
    return {
      timestamp: ts,
      pid: String(this._pid),
      tid: String(this._pid + Math.floor(Math.random() * 10)),
      level,
      tag,
      message,
      raw: `${ts}  ${this._pid}  ${this._pid} ${level} ${tag}: ${message}`,
    };
  }

  _weightedLevel() {
    const total = LEVEL_WEIGHTS.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < SAMPLE_LEVELS.length; i++) {
      r -= LEVEL_WEIGHTS[i];
      if (r <= 0) return SAMPLE_LEVELS[i];
    }
    return 'I';
  }
}

module.exports = DemoLogGenerator;
