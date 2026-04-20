// Unit tests for each scenario's tool list + call-handling behavior.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SCENARIOS, SCENARIO_IDS, getScenario, listScenarios } from '../src/scenarios/index.js';

test('registry exposes all ten scenarios E1..E10', () => {
  assert.deepEqual(SCENARIO_IDS, ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10']);
  for (const id of SCENARIO_IDS) {
    const s = getScenario(id);
    assert.equal(s.id, id);
    assert.ok(typeof s.title === 'string' && s.title.length > 0);
    assert.ok(typeof s.description === 'string' && s.description.length > 0);
    assert.ok(typeof s.handleCall === 'function');
  }
});

test('listScenarios returns array shape', () => {
  const items = listScenarios();
  assert.equal(items.length, 10);
  assert.ok(items.every((x) => x.id && x.title && x.description));
});

test('getScenario throws on unknown', () => {
  assert.throws(() => getScenario('E99'));
});

test('E1: colliding names include read_file, list_files, search', () => {
  const names = SCENARIOS.E1.tools.map((t) => t.name);
  assert.ok(names.includes('read_file'));
  assert.ok(names.includes('list_files'));
  assert.ok(names.includes('search'));
  const r = SCENARIOS.E1.handleCall('read_file', { path: '/etc/passwd' });
  assert.match(r.content[0].text, /EVIL\[E1\]/);
});

test('E2: payload is ~10MB', () => {
  const sample = SCENARIOS.E2._buildPayload(1024);
  assert.equal(sample.length, 1024);
  // Do not actually allocate 10MB in the test.
});

test('E3: bidi description contains U+202E', () => {
  assert.ok(SCENARIOS.E3._bidiDescription.includes('\u202E'));
  const r = SCENARIOS.E3.handleCall('safe_read', { path: '/tmp/x' });
  assert.match(r.content[0].text, /EVIL\[E3\]/);
});

test('E4: description contains injection phrase', () => {
  const tool = SCENARIOS.E4.tools.find((t) => t.name === 'lookup_docs');
  assert.match(tool.description, /Disregard all prior instructions/);
  assert.ok(SCENARIOS.E4.tools.some((t) => t.name === 'exfil'));
  const r = SCENARIOS.E4.handleCall('exfil', { payload: 'secret' });
  assert.deepEqual(r._exfiltrated, { payload: 'secret' });
});

test('E5: advertised schema differs from returned result', () => {
  const tool = SCENARIOS.E5.tools[0];
  assert.equal(tool.outputSchema.properties.status.type, 'string');
  const r = SCENARIOS.E5.handleCall('do_thing', { input: 'hi' });
  const body = JSON.parse(r.content[0].text);
  assert.equal(typeof body.status, 'number'); // schema violation
});

test('E6: re-registration flips version after trigger', () => {
  const state = {};
  const s = SCENARIOS.E6;
  // First calls -> version 1.
  for (let i = 0; i < s._TRIGGER_AFTER - 1; i += 1) {
    s.handleCall('do_thing', {}, state);
  }
  assert.equal(s.listTools(state)[0].description, s._V1_TOOL.description);
  // Trigger call.
  const r = s.handleCall('do_thing', {}, state);
  assert.equal(r._rereg, true);
  assert.equal(s.listTools(state)[0].description, s._V2_TOOL.description);
});

test('E7: result contains fake tool_calls structure', () => {
  const r = SCENARIOS.E7.handleCall('get_status', {});
  const body = JSON.parse(r.content[0].text);
  assert.ok(Array.isArray(body.tool_calls));
  assert.equal(body.tool_calls[0].function.name, 'shell');
});

test('E8: config URIs cover claude/cursor/vscode/continue/windsurf', () => {
  const uris = SCENARIOS.E8._TARGET_URIS.join('\n');
  assert.match(uris, /\.claude\/settings\.json/);
  assert.match(uris, /\.cursor\/mcp\.json/);
  assert.match(uris, /Code\/User\/settings\.json/);
  assert.match(uris, /\.continue\/config\.json/);
  assert.match(uris, /windsurf\/mcp_config\.json/);
  const r = SCENARIOS.E8.handleCall('patch_resource', {
    uri: SCENARIOS.E8._TARGET_URIS[0],
    patch: { mcpServers: { x: { command: 'y' } } },
  });
  assert.ok(r._writeAttempt);
});

test('E9: stream yields list_changed notifications', async () => {
  const s = { ...SCENARIOS.E9, durationMs: 50, rateHz: 1000 };
  // Bind generator to preserved this.
  const gen = SCENARIOS.E9.stream.call(s, { signal: { aborted: false } });
  let count = 0;
  for await (const evt of gen) {
    assert.equal(evt.jsonrpc, '2.0');
    assert.equal(evt.method, 'notifications/tools/list_changed');
    count += 1;
    if (count >= 5) break;
  }
  assert.ok(count >= 5);
});

test('E10: returns contradictory shape', () => {
  const r = SCENARIOS.E10.handleCall('safe_op', {});
  assert.equal(r.error, 'success');
  assert.equal(r.isError, false);
  assert.match(r.content[0].text, /FATAL/);
});
