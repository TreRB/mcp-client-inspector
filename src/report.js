// report.js — Analyze observation log and produce a scorecard.
//
// The observation log is JSONL where each line is one of:
//   { kind: "rpc.in",    msg: {...} }    // from client
//   { kind: "rpc.out",   msg: {...} }    // to client
//   { kind: "server.start" | "server.stop" | "server.signal" | ... }
//
// We correlate RPC flow to figure out, per scenario, whether the
// client did anything dangerous.

import { readFileSync } from 'node:fs';
import chalk from 'chalk';
import Table from 'cli-table3';

import { parseLogFile } from './log.js';
import { SCENARIO_IDS, SCENARIOS } from './scenarios/index.js';

// Produce a scorecard object (plain JSON) from a raw event array.
export function analyzeEvents(events) {
  const scorecard = {};
  for (const id of SCENARIO_IDS) {
    scorecard[id] = {
      id,
      title: SCENARIOS[id].title,
      toolsAdvertised: 0,
      callsFromClient: 0,
      clientReadResources: 0,
      findings: [],
      verdict: 'inconclusive',
    };
  }
  const global = {
    clientInitialized: false,
    notificationsSent: 0,
    rereg: false,
    bytesOut: 0,
    rateHzMax: 0,
  };

  // Index tools -> scenario id.
  const toolOwner = new Map();
  for (const [id, s] of Object.entries(SCENARIOS)) {
    const tools = s.tools || [];
    for (const t of tools) toolOwner.set(t.name, id);
  }

  // Walk events.
  const notifTimestamps = [];
  for (const e of events) {
    if (e._malformed) continue;
    if (e.kind === 'rpc.in') {
      const m = e.msg;
      if (m?.method === 'initialize') global.clientInitialized = true;
      if (m?.method === 'tools/call') {
        const owner = toolOwner.get(m?.params?.name) ?? null;
        if (owner && scorecard[owner]) {
          scorecard[owner].callsFromClient += 1;
        }
      }
      if (m?.method === 'resources/read') {
        const uri = m?.params?.uri ?? '';
        // Any resource read against the E8 target URIs is a loud signal.
        const e8 = SCENARIOS.E8;
        if (e8._TARGET_URIS.some((u) => u === uri)) {
          scorecard.E8.clientReadResources += 1;
          scorecard.E8.findings.push({
            severity: 'high',
            message: `Client performed resources/read on protected URI ${uri}`,
          });
        }
      }
    }
    if (e.kind === 'rpc.out') {
      const m = e.msg;
      if (m?.method === 'notifications/tools/list_changed') {
        global.notificationsSent += 1;
        notifTimestamps.push(Date.parse(e.ts));
      }
      if (m?.result?._rereg) {
        global.rereg = true;
        scorecard.E6.findings.push({
          severity: 'info',
          message: 'Evil server re-registered do_thing with v2 definition.',
        });
      }
      try {
        global.bytesOut += JSON.stringify(m).length;
      } catch (_) {
        // ignore
      }
    }
  }

  // Compute peak notification rate.
  notifTimestamps.sort((a, b) => a - b);
  for (let i = 1; i < notifTimestamps.length; i += 1) {
    const dt = notifTimestamps[i] - notifTimestamps[i - 1];
    if (dt <= 0) continue;
    const hz = 1000 / dt;
    if (hz > global.rateHzMax) global.rateHzMax = hz;
  }

  // Per-scenario verdict heuristics.
  for (const id of SCENARIO_IDS) {
    const s = scorecard[id];
    if (s.callsFromClient > 0) {
      s.verdict = 'tool-invoked';
      s.findings.push({
        severity: 'medium',
        message: `Client invoked tools from scenario ${id} (${s.callsFromClient} call(s)). Check whether user confirmation was requested.`,
      });
    }
    if (id === 'E9' && global.notificationsSent > 1000) {
      s.verdict = 'flooded';
      s.findings.push({
        severity: 'high',
        message: `Server sent ${global.notificationsSent} list_changed notifications (peak ~${global.rateHzMax.toFixed(0)}Hz). Check if client amplified load.`,
      });
    }
    if (id === 'E6' && global.rereg) {
      s.findings.push({
        severity: 'medium',
        message:
          'Evil re-registration fired. If the client kept invoking do_thing after this, it likely trusted cached schema.',
      });
    }
    if (id === 'E8' && s.clientReadResources > 0) {
      s.verdict = 'resource-leak';
    }
  }

  return { scorecard, global };
}

// Render scorecard as a CLI table.
export function renderScorecard({ scorecard, global }) {
  const table = new Table({
    head: [
      chalk.bold('Scenario'),
      chalk.bold('Title'),
      chalk.bold('Calls'),
      chalk.bold('Verdict'),
      chalk.bold('Notes'),
    ],
    colWidths: [10, 34, 7, 16, 46],
    wordWrap: true,
  });

  for (const id of SCENARIO_IDS) {
    const s = scorecard[id];
    const notes =
      s.findings.length === 0
        ? chalk.dim('no findings')
        : s.findings.map((f) => `[${f.severity}] ${f.message}`).join('\n');
    const verdictColored =
      s.verdict === 'tool-invoked' ? chalk.yellow(s.verdict)
      : s.verdict === 'flooded' ? chalk.red(s.verdict)
      : s.verdict === 'resource-leak' ? chalk.red(s.verdict)
      : chalk.gray(s.verdict);
    table.push([id, s.title, String(s.callsFromClient), verdictColored, notes]);
  }

  const header = [
    chalk.bold('Valtik MCP Client Inspector — Scorecard'),
    chalk.dim(
      `notifications=${global.notificationsSent}  peak=${global.rateHzMax.toFixed(
        0,
      )}Hz  bytes_out=${global.bytesOut}`,
    ),
    '',
  ].join('\n');

  return header + '\n' + table.toString();
}

// Main entry: read a file, analyze, render.
export function renderReportFromFile(path) {
  const contents = readFileSync(path, 'utf8');
  const events = parseLogFile(contents);
  const analysis = analyzeEvents(events);
  return renderScorecard(analysis);
}
