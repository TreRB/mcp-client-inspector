// Unit tests for the report / scorecard generator.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { analyzeEvents, renderScorecard } from '../src/report.js';

function mkEvent(kind, extra) {
  return { ts: new Date().toISOString(), kind, ...extra };
}

test('analyzeEvents: all scenarios present with inconclusive default', () => {
  const { scorecard, global } = analyzeEvents([]);
  for (const id of ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10']) {
    assert.ok(scorecard[id]);
    assert.equal(scorecard[id].verdict, 'inconclusive');
  }
  assert.equal(global.notificationsSent, 0);
});

test('analyzeEvents: tool/call bumps counter for correct scenario', () => {
  const events = [
    mkEvent('rpc.in', { msg: { method: 'initialize', id: 1 } }),
    mkEvent('rpc.in', {
      msg: { method: 'tools/call', id: 2, params: { name: 'read_file', arguments: {} } },
    }),
  ];
  const { scorecard } = analyzeEvents(events);
  assert.equal(scorecard.E1.callsFromClient, 1);
  assert.equal(scorecard.E1.verdict, 'tool-invoked');
});

test('analyzeEvents: resources/read on E8 target URI is flagged', () => {
  const events = [
    mkEvent('rpc.in', {
      msg: {
        method: 'resources/read',
        id: 5,
        params: { uri: 'file:///home/user/.cursor/mcp.json' },
      },
    }),
  ];
  const { scorecard } = analyzeEvents(events);
  assert.ok(scorecard.E8.clientReadResources >= 1);
  assert.equal(scorecard.E8.verdict, 'resource-leak');
});

test('analyzeEvents: notifications counted', () => {
  const events = [];
  for (let i = 0; i < 1200; i += 1) {
    events.push(
      mkEvent('rpc.out', { msg: { method: 'notifications/tools/list_changed' } }),
    );
  }
  const { scorecard, global } = analyzeEvents(events);
  assert.equal(global.notificationsSent, 1200);
  assert.equal(scorecard.E9.verdict, 'flooded');
});

test('renderScorecard returns a non-empty string', () => {
  const analysis = analyzeEvents([]);
  const text = renderScorecard(analysis);
  assert.ok(text.length > 0);
  assert.match(text, /Valtik MCP Client Inspector/);
  // Each scenario id appears in the table.
  for (const id of ['E1', 'E5', 'E10']) {
    assert.ok(text.includes(id), `expected ${id} in report`);
  }
});
