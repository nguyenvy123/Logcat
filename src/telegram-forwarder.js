/**
 * telegram-forwarder.js
 * Forwards log entries to a Telegram chat via Bot API.
 * Batches messages to avoid hitting Telegram rate limits (30 msg/sec).
 */

// Use built-in fetch (Node 18+) or fallback to node-fetch
const fetch = globalThis.fetch ?? require('node-fetch');

// Telegram limits: 30 messages/sec per bot, 4096 chars per message
const BATCH_INTERVAL_MS = 1000; // flush batch every 1 second
const MAX_BATCH_SIZE = 10;       // max log lines per batch message
const MAX_MSG_LENGTH = 4000;     // safe limit under 4096

// Log level to emoji mapping for readability
const LEVEL_EMOJI = {
  V: '⬜',
  D: '🔵',
  I: '🟢',
  W: '🟡',
  E: '🔴',
  F: '💥',
  S: '⛔',
};

class TelegramForwarder {
  constructor(options = {}) {
    this.botToken = options.botToken;
    this.chatId = options.chatId;
    this.enabled = !!(this.botToken && this.chatId);
    this.queue = [];
    this.timer = null;
    this.totalSent = 0;
    this.totalFailed = 0;
  }

  /**
   * Enqueue a log entry. Starts the batch flush timer if not already running.
   */
  enqueue(logEntry) {
    if (!this.enabled) return;
    this.queue.push(logEntry);

    if (!this.timer) {
      this.timer = setTimeout(() => this._flush(), BATCH_INTERVAL_MS);
    }
  }

  /**
   * Flush queued log entries as a single Telegram message.
   */
  async _flush() {
    this.timer = null;
    if (this.queue.length === 0) return;

    // Take up to MAX_BATCH_SIZE entries
    const batch = this.queue.splice(0, MAX_BATCH_SIZE);
    const text = this._formatBatch(batch);

    try {
      await this._sendMessage(text);
      this.totalSent += batch.length;
    } catch (err) {
      this.totalFailed += batch.length;
      console.error('[Telegram] Send failed:', err.message);
    }

    // If more in queue, schedule next flush
    if (this.queue.length > 0) {
      this.timer = setTimeout(() => this._flush(), BATCH_INTERVAL_MS);
    }
  }

  /**
   * Format a batch of log entries into a single Telegram message.
   * Uses monospace code block for readability.
   */
  _formatBatch(entries) {
    const lines = entries.map(e => {
      const emoji = LEVEL_EMOJI[e.level] || '⬜';
      return `${emoji} [${e.level}] ${e.tag}: ${e.message}`;
    });

    const body = lines.join('\n');
    const full = `<pre>${this._escapeHtml(body)}</pre>`;

    // Truncate if too long
    if (full.length > MAX_MSG_LENGTH) {
      const truncated = body.substring(0, MAX_MSG_LENGTH - 50);
      return `<pre>${this._escapeHtml(truncated)}\n... (truncated)</pre>`;
    }
    return full;
  }

  async _sendMessage(text) {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: this.chatId,
        text,
        parse_mode: 'HTML',
        disable_notification: true, // silent push to avoid spam
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body}`);
    }
  }

  /**
   * Send a plain notification message (e.g. "Logcat started").
   */
  async notify(message) {
    if (!this.enabled) return;
    try {
      await this._sendMessage(message);
    } catch (err) {
      console.error('[Telegram] Notify failed:', err.message);
    }
  }

  _escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  stats() {
    return { sent: this.totalSent, failed: this.totalFailed, queued: this.queue.length };
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

module.exports = TelegramForwarder;
