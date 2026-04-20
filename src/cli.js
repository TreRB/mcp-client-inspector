#!/usr/bin/env node
// cli.js — Valtik MCP Client Inspector CLI.
//
// Subcommands:
//   serve      Spawn evil MCP server(s) on stdio.
//   report     Analyze an observation log.
//   scenarios  List all scenarios E1-E10.
//
// Flags:
//   --scenario    <id>  E1..E10 or 'all' (default)
//   --transport   stdio|sse  (default stdio; sse = v0.2, not yet)
//   --log         <file>  (default ./mcp-inspector.log)
//   --max-runtime <sec>   (default 600)
//   --help

import chalk from 'chalk';

import { startServer } from './server.js';
import { createLogger } from './log.js';
import { listScenarios, SCENARIOS } from './scenarios/index.js';
import { renderReportFromFile } from './report.js';

const USAGE = `
${chalk.bold('valtik-mcp-client-inspector')} — evil-MCP-server harness for testing MCP clients.

${chalk.bold('Usage:')}
  mcp-client-inspector serve [--scenario <id>] [--transport stdio|sse]
  mcp-client-inspector report [--log <file>]
  mcp-client-inspector scenarios

${chalk.bold('Commands:')}
  serve         Spawn an evil MCP server for a scenario (or 'all')
  report        Analyze the log and produce a scorecard
  scenarios     List all scenarios E1-E10

${chalk.bold('Flags:')}
  --scenario <id>    E1..E10 or 'all' (default)
  --transport        stdio | sse (default stdio)
  --log <file>       Where to write observation log (default ./mcp-inspector.log)
  --max-runtime <s>  Hard timeout for the evil server (default 600)
  --help

${chalk.yellow.bold('WARNING:')} This tool runs a DELIBERATELY MALICIOUS MCP server.
Only connect it to IDE/clients you own. See README.md for scope.
`;

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      out.help = true;
    } else if (a === '--scenario') {
      out.scenario = argv[++i];
    } else if (a === '--transport') {
      out.transport = argv[++i];
    } else if (a === '--log') {
      out.log = argv[++i];
    } else if (a === '--max-runtime') {
      out.maxRuntime = Number(argv[++i]);
    } else if (a.startsWith('--')) {
      throw new Error(`Unknown flag: ${a}`);
    } else {
      out._.push(a);
    }
  }
  return out;
}

async function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(chalk.red(err.message) + '\n');
    process.stderr.write(USAGE);
    process.exit(2);
  }

  const cmd = args._[0];

  if (args.help || !cmd) {
    process.stdout.write(USAGE);
    process.exit(args.help ? 0 : 2);
  }

  if (cmd === 'scenarios') {
    process.stdout.write(chalk.bold('Available evil MCP scenarios\n'));
    process.stdout.write(chalk.dim('─'.repeat(60)) + '\n');
    for (const s of listScenarios()) {
      process.stdout.write(
        chalk.yellow(s.id.padEnd(4)) + chalk.bold(s.title) + '\n',
      );
      process.stdout.write('    ' + chalk.dim(s.description) + '\n\n');
    }
    process.exit(0);
  }

  if (cmd === 'serve') {
    const scenarioId = args.scenario ?? 'all';
    const transport = args.transport ?? 'stdio';
    const logPath = args.log ?? './mcp-inspector.log';
    const maxRuntimeSec = Number.isFinite(args.maxRuntime) ? args.maxRuntime : 600;

    if (transport !== 'stdio') {
      process.stderr.write(
        chalk.red(`Transport "${transport}" is not yet supported (stdio only in v0.1).\n`),
      );
      process.exit(3);
    }

    if (scenarioId !== 'all' && !SCENARIOS[String(scenarioId).toUpperCase()]) {
      process.stderr.write(chalk.red(`Unknown scenario: ${scenarioId}\n`));
      process.exit(3);
    }

    const log = createLogger(logPath);

    // NB: We write ONLY JSON-RPC to stdout so the real MCP client can
    // parse it. All user-facing messages must go to stderr.
    process.stderr.write(
      chalk.yellow.bold('[EVIL] ') +
        `serving scenario=${scenarioId} transport=${transport} log=${logPath}\n`,
    );
    process.stderr.write(
      chalk.dim('Connect your MCP client using:\n') +
        chalk.dim('  command: node\n') +
        chalk.dim(`  args:    ${process.argv[1]} serve --scenario ${scenarioId}\n`),
    );

    startServer({
      scenarioId,
      log,
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      maxRuntimeSec,
    });

    // Keep the event loop alive; server has its own stop paths.
    return;
  }

  if (cmd === 'report') {
    const logPath = args.log ?? './mcp-inspector.log';
    try {
      const text = renderReportFromFile(logPath);
      process.stdout.write(text + '\n');
      process.exit(0);
    } catch (err) {
      process.stderr.write(chalk.red(`report failed: ${err.message}\n`));
      process.exit(4);
    }
  }

  process.stderr.write(chalk.red(`Unknown command: ${cmd}\n`));
  process.stderr.write(USAGE);
  process.exit(2);
}

main(process.argv.slice(2)).catch((err) => {
  process.stderr.write(chalk.red(String(err?.stack || err)) + '\n');
  process.exit(1);
});
