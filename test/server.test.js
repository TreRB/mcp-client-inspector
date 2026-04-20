// Integration-ish tests for server dispatch (in-memory streams).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';

import { startServer, createFrameParser } from '../src/server.js';

function mkStreams() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  stdin.setEncoding?.('utf8');
  stdout.setEncoding('utf8');
  return { stdin, stdout };
}

function collectLines(stream, n) {
  return new Promise((resolve) => {
    const out = [];
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk.toString();
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (!line.trim()) continue;
        try {
          out.push(JSON.parse(line));
        } catch (_) {
          out.push({ _raw: line });
        }
        if (out.length >= n) resolve(out);
      }
    });
  });
}

test('server responds to initialize with protocolVersion', async () => {
  const { stdin, stdout } = mkStreams();
  const logged = [];
  startServer({
    scenarioId: 'E1',
    stdin,
    stdout,
    log: (e) => logged.push(e),
    maxRuntimeSec: 5,
  });

  const lines = collectLines(stdout, 1);
  stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n');
  const [resp] = await lines;
  assert.equal(resp.id, 1);
  assert.equal(resp.result.protocolVersion, '2024-11-05');
  assert.equal(resp.result.serverInfo.name, 'valtik-mcp-client-inspector');
});

test('server returns E1 tools on tools/list', async () => {
  const { stdin, stdout } = mkStreams();
  startServer({ scenarioId: 'E1', stdin, stdout, log: () => {}, maxRuntimeSec: 5 });
  const lines = collectLines(stdout, 2);
  stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) + '\n');
  stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
  const out = await lines;
  const listResp = out.find((m) => m.id === 2);
  assert.ok(listResp);
  const names = listResp.result.tools.map((t) => t.name);
  assert.ok(names.includes('read_file'));
});

test('server tools/call returns scenario result', async () => {
  const { stdin, stdout } = mkStreams();
  startServer({ scenarioId: 'E1', stdin, stdout, log: () => {}, maxRuntimeSec: 5 });
  const lines = collectLines(stdout, 3);
  stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) + '\n');
  stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
  stdin.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'read_file', arguments: { path: '/etc/passwd' } },
    }) + '\n',
  );
  const out = await lines;
  const callResp = out.find((m) => m.id === 3);
  assert.ok(callResp);
  assert.match(callResp.result.content[0].text, /EVIL\[E1\]/);
});

test('server returns Method not found for unknown requests', async () => {
  const { stdin, stdout } = mkStreams();
  startServer({ scenarioId: 'E1', stdin, stdout, log: () => {}, maxRuntimeSec: 5 });
  const lines = collectLines(stdout, 1);
  stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'nope' }) + '\n');
  const [resp] = await lines;
  assert.equal(resp.id, 9);
  assert.equal(resp.error.code, -32601);
});

test('createFrameParser handles both line and Content-Length framing', () => {
  const received = [];
  const parser = createFrameParser((m) => received.push(m));
  parser.push('{"jsonrpc":"2.0","id":1,"method":"ping"}\n');
  const body = '{"jsonrpc":"2.0","id":2,"method":"ping"}';
  const lenBytes = Buffer.byteLength(body, 'utf8');
  parser.push(`Content-Length: ${lenBytes}\r\n\r\n${body}`);
  assert.equal(received.length, 2);
  assert.equal(received[0].id, 1);
  assert.equal(received[1].id, 2);
});
