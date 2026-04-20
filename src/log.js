// log.js — JSONL observation log.
//
// We intentionally avoid external deps. One event = one line.
// Events are written synchronously to reduce loss on SIGTERM.

import { createWriteStream, openSync, writeSync, closeSync, existsSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export class ObservationLog {
  constructor(filePath) {
    this.filePath = resolve(filePath);
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    // Use sync fd so we never lose events at termination.
    this.fd = openSync(this.filePath, 'a');
  }

  write(event) {
    const line =
      JSON.stringify({
        ts: new Date().toISOString(),
        ...event,
      }) + '\n';
    try {
      writeSync(this.fd, line);
    } catch (err) {
      // Last-resort stderr notice; do not throw from logger.
      try {
        process.stderr.write(`[mcp-client-inspector] log write failed: ${err.message}\n`);
      } catch (_) {
        // ignore
      }
    }
  }

  close() {
    try {
      closeSync(this.fd);
    } catch (_) {
      // ignore
    }
  }
}

// Convenience wrapper for consumers that just want a function.
export function createLogger(filePath) {
  const log = new ObservationLog(filePath);
  const fn = (event) => log.write(event);
  fn.close = () => log.close();
  fn.filePath = log.filePath;
  return fn;
}

// Parses a JSONL log file. Returns an array of event objects.
// Bad lines are returned as { _malformed: true, raw: <line> }.
export function parseLogFile(fileContents) {
  const events = [];
  for (const rawLine of fileContents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      events.push(JSON.parse(line));
    } catch (_) {
      events.push({ _malformed: true, raw: line });
    }
  }
  return events;
}

// Small helper used elsewhere — write many events in one call.
export function writeEvents(stream, events) {
  if (!(stream instanceof Object)) return;
  for (const e of events) {
    if (typeof stream.write === 'function') {
      stream.write(e);
    }
  }
}

// Exposed for tests.
export const _internal = { createWriteStream };
