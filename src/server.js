// server.js — Evil MCP server core.
//
// Implements just enough of the Model Context Protocol (2024-11-05 +
// minor extensions) to accept connections from real clients:
//   - initialize
//   - initialized (notification)
//   - tools/list
//   - tools/call
//   - resources/list
//   - resources/read
//   - shutdown / exit / ping
//
// Transport: line-delimited JSON (one JSON object per line) over
// stdin/stdout. Content-Length framing is optional for newer clients;
// we accept either.
//
// Everything malicious lives in the scenarios. This file is just the
// dispatcher.

import { getScenario, listScenarios, SCENARIOS } from './scenarios/index.js';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'valtik-mcp-client-inspector';
const SERVER_VERSION = '0.1.0';

// Accepts {serve: 'E1' | 'all', log: fn, stdin, stdout, maxRuntimeSec}
// Returns a handle with .stop().
export function startServer({
  scenarioId = 'all',
  log = () => {},
  stdin = process.stdin,
  stdout = process.stdout,
  stderr = process.stderr,
  maxRuntimeSec = 600,
} = {}) {
  const ac = new AbortController();
  const state = { e6: undefined };
  const scenarios = selectScenarios(scenarioId);

  log({
    kind: 'server.start',
    scenario: scenarioId,
    scenarios: scenarios.map((s) => s.id),
    protocolVersion: PROTOCOL_VERSION,
  });

  const write = (obj) => {
    const line = JSON.stringify(obj);
    stdout.write(line + '\n');
    log({ kind: 'rpc.out', msg: obj });
  };

  const onMessage = async (msg) => {
    log({ kind: 'rpc.in', msg });
    if (!msg || typeof msg !== 'object') return;

    // Notifications have no id.
    const isNotification = msg.id === undefined || msg.id === null;
    const { method, params, id } = msg;

    try {
      if (method === 'initialize') {
        write({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
            capabilities: {
              tools: { listChanged: true },
              resources: { listChanged: true, subscribe: false },
              logging: {},
            },
          },
        });
        return;
      }

      if (method === 'initialized' || method === 'notifications/initialized') {
        // Client signalled it is ready. Kick off E9's notification storm
        // (if E9 is in scope) asynchronously.
        for (const s of scenarios) {
          if (typeof s.stream === 'function') {
            startStream(s, write, ac.signal, log);
          }
        }
        return;
      }

      if (method === 'tools/list') {
        write({
          jsonrpc: '2.0',
          id,
          result: { tools: collectTools(scenarios, state) },
        });
        return;
      }

      if (method === 'tools/call') {
        const toolName = params?.name;
        const args = params?.arguments ?? {};
        const scenario = findScenarioForTool(scenarios, toolName, state);
        if (!scenario) {
          write({
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Tool not found: ${toolName}` },
          });
          return;
        }
        const result = scenario.handleCall(toolName, args, state);

        // If the scenario mutated list_changed state (E6), emit a
        // notification so a well-behaved client re-queries.
        if (result?._rereg) {
          write({
            jsonrpc: '2.0',
            method: 'notifications/tools/list_changed',
            params: {},
          });
        }

        write({ jsonrpc: '2.0', id, result });
        return;
      }

      if (method === 'resources/list') {
        const resources = [];
        for (const s of scenarios) {
          if (Array.isArray(s.resources)) resources.push(...s.resources);
        }
        write({ jsonrpc: '2.0', id, result: { resources } });
        return;
      }

      if (method === 'resources/read') {
        write({
          jsonrpc: '2.0',
          id,
          result: {
            contents: [
              {
                uri: params?.uri ?? '',
                mimeType: 'application/json',
                text: '{"evil": true}',
              },
            ],
          },
        });
        return;
      }

      if (method === 'ping') {
        write({ jsonrpc: '2.0', id, result: {} });
        return;
      }

      if (method === 'shutdown') {
        write({ jsonrpc: '2.0', id, result: null });
        return;
      }

      if (method === 'exit') {
        ac.abort();
        return;
      }

      // Unknown method.
      if (!isNotification) {
        write({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        });
      }
    } catch (err) {
      log({ kind: 'server.error', error: String(err?.stack || err) });
      if (!isNotification) {
        write({
          jsonrpc: '2.0',
          id,
          error: { code: -32603, message: `Internal error: ${err.message}` },
        });
      }
    }
  };

  // Framing: support both "one JSON per line" AND LSP-style
  // Content-Length framing.
  const framed = createFrameParser(onMessage);
  stdin.on('data', (chunk) => framed.push(chunk));
  stdin.on('error', (err) => log({ kind: 'stdin.error', error: String(err) }));

  // Max-runtime guard.
  const runtimeTimer = setTimeout(() => {
    log({ kind: 'server.timeout', maxRuntimeSec });
    stop();
  }, maxRuntimeSec * 1000);
  runtimeTimer.unref?.();

  const stop = () => {
    ac.abort();
    clearTimeout(runtimeTimer);
    log({ kind: 'server.stop' });
  };

  // SIGTERM / SIGINT handlers (harness mode).
  const sigHandler = (sig) => {
    log({ kind: 'server.signal', signal: sig });
    stop();
    // Give the logger a tick, then exit.
    setTimeout(() => process.exit(0), 50).unref?.();
  };
  process.once('SIGTERM', () => sigHandler('SIGTERM'));
  process.once('SIGINT', () => sigHandler('SIGINT'));

  return { stop, signal: ac.signal, scenarios };
}

// ------------- helpers -------------

function selectScenarios(id) {
  if (!id || String(id).toLowerCase() === 'all') {
    return Object.values(SCENARIOS);
  }
  return [getScenario(id)];
}

function collectTools(scenarios, state) {
  const all = [];
  for (const s of scenarios) {
    const tools = typeof s.listTools === 'function' ? s.listTools(state) : s.tools || [];
    for (const t of tools) all.push(t);
  }
  return all;
}

function findScenarioForTool(scenarios, toolName, state) {
  for (const s of scenarios) {
    const tools = typeof s.listTools === 'function' ? s.listTools(state) : s.tools || [];
    if (tools.some((t) => t.name === toolName)) return s;
  }
  return null;
}

function startStream(scenario, write, signal, log) {
  (async () => {
    try {
      for await (const evt of scenario.stream({ signal })) {
        if (signal.aborted) return;
        write(evt);
      }
    } catch (err) {
      log({ kind: 'stream.error', scenario: scenario.id, error: String(err) });
    }
  })();
}

// ------------- framing -------------
//
// Accepts incoming chunks. Feeds complete JSON-RPC messages to onMsg.
// Handles:
//   A) LSP-style:  "Content-Length: N\r\n\r\n{...}"
//   B) Line-delim: "{...}\n"
export function createFrameParser(onMsg) {
  let buf = Buffer.alloc(0);

  const tryParse = () => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Try Content-Length framing first.
      const headerEnd = buf.indexOf('\r\n\r\n');
      if (headerEnd >= 0) {
        const header = buf.slice(0, headerEnd).toString('utf8');
        const m = /Content-Length:\s*(\d+)/i.exec(header);
        if (m) {
          const len = parseInt(m[1], 10);
          const total = headerEnd + 4 + len;
          if (buf.length < total) return; // wait
          const body = buf.slice(headerEnd + 4, total).toString('utf8');
          buf = buf.slice(total);
          safeDispatch(body, onMsg);
          continue;
        }
      }

      // Fall back to line framing.
      const nl = buf.indexOf(0x0a);
      if (nl < 0) return; // wait
      const line = buf.slice(0, nl).toString('utf8').trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      safeDispatch(line, onMsg);
    }
  };

  return {
    push(chunk) {
      buf = Buffer.concat([buf, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
      tryParse();
    },
  };
}

function safeDispatch(text, onMsg) {
  try {
    const obj = JSON.parse(text);
    // Batch support (array of requests).
    if (Array.isArray(obj)) {
      for (const o of obj) onMsg(o);
    } else {
      onMsg(obj);
    }
  } catch (err) {
    // Ignore malformed frame.
    // A real server would return parse error; we are evil — silence works.
  }
}

// Exported for tests.
export const _internal = {
  PROTOCOL_VERSION,
  SERVER_NAME,
  SERVER_VERSION,
  collectTools,
  findScenarioForTool,
  selectScenarios,
  listScenarios,
};
