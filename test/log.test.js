// Unit tests for the observation log writer and parser.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ObservationLog, createLogger, parseLogFile } from '../src/log.js';

test('ObservationLog writes JSONL', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-log-'));
  const path = join(dir, 'x.log');
  const log = new ObservationLog(path);
  log.write({ kind: 'rpc.in', msg: { id: 1 } });
  log.write({ kind: 'rpc.out', msg: { id: 1, result: {} } });
  log.close();
  const contents = readFileSync(path, 'utf8');
  const events = parseLogFile(contents);
  assert.equal(events.length, 2);
  assert.equal(events[0].kind, 'rpc.in');
  assert.equal(events[1].msg.result.id ?? events[1].msg.id, 1);
  rmSync(dir, { recursive: true, force: true });
});

test('createLogger returns a callable with .close()', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-log-'));
  const path = join(dir, 'y.log');
  const log = createLogger(path);
  log({ kind: 'server.start' });
  log.close();
  const events = parseLogFile(readFileSync(path, 'utf8'));
  assert.equal(events[0].kind, 'server.start');
  rmSync(dir, { recursive: true, force: true });
});

test('parseLogFile tolerates malformed lines', () => {
  const txt = '{"a":1}\nnot json\n{"b":2}\n';
  const events = parseLogFile(txt);
  assert.equal(events.length, 3);
  assert.equal(events[1]._malformed, true);
  assert.equal(events[2].b, 2);
});
