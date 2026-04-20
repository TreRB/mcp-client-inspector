# valtik-mcp-client-inspector

Evil-MCP-server harness for testing the **client-side** defenses of
Model Context Protocol integrations in IDEs: Cursor, Claude Code,
Windsurf, Continue, Cline, Zed, and anything else speaking MCP over
stdio.

This is the complement to
[`mcp-security-scanner`](https://github.com/TreRB/mcp-security-scanner),
which audits MCP **server** source code. This tool attacks **clients**.

## STRONG disclaimer (read this)

This tool runs an MCP server that is **deliberately malicious**. It
intentionally:

- Registers tools whose names collide with common legit tools.
- Returns 10MB of garbage to exhaust LLM context windows.
- Embeds Unicode bidi override characters and prompt-injection payloads
  in tool descriptions.
- Returns results that mimic Claude/OpenAI `tool_calls` structures to
  confuse naive clients.
- Claims ownership of resources at paths like `~/.claude/settings.json`
  and `~/.cursor/mcp.json`.
- Spams `notifications/tools/list_changed` at ~10 kHz.

**Run it only against MCP clients you own and are actively testing.**
Do not ship this into production. Do not point a client you care about
at it without understanding the attacks it will attempt. The `patch_resource`
tool intentionally exercises
[CVE-2026-30615](https://nvd.nist.gov/)-class surfaces; real writes only
happen if your client is broken enough to perform them.

Running this exposes the connected client to real attack surface. **You
are responsible for what happens next.**

## Install

```sh
npm install -g valtik-mcp-client-inspector
# or, from a clone:
git clone <repo> && cd mcp-client-inspector && npm install
```

Requires Node 20+. ESM only.

## Quick start

```sh
# List every scenario.
mcp-client-inspector scenarios

# Spawn an evil server running all ten scenarios on stdio.
mcp-client-inspector serve --scenario all --log ./mcp-inspector.log

# In your IDE's MCP config, point a server at:
#   command: node
#   args:    <abs path to>/src/cli.js serve --scenario all
#
# Drive your IDE: invoke tools, accept / deny prompts, observe what it does.

# When you're done, produce a scorecard:
mcp-client-inspector report --log ./mcp-inspector.log
```

## Scenarios

| ID  | Attack                              | What it tests                                                    |
| --- | ----------------------------------- | ---------------------------------------------------------------- |
| E1  | Tool name collision                 | Does client disambiguate `read_file` between servers?            |
| E2  | Oversized tool response             | Does client truncate 10MB results?                               |
| E3  | Unicode bidi in tool description    | Does UI sanitize U+202E away from LLM context?                   |
| E4  | Prompt injection in docstring       | Does client isolate tool metadata from the system prompt?        |
| E5  | Schema race (list vs call)          | Does client validate tool output against declared schema?        |
| E6  | Dynamic re-registration             | Does client re-query `tools/list` or trust the cache?            |
| E7  | Poisoned tool result                | Does client render `tool_calls`-shaped text as if model emitted? |
| E8  | Config-file write (CVE-2026-30615)  | Does client accept writes to its own MCP config file?            |
| E9  | Excessive notifications             | Does client rate-limit / disconnect a noisy server?              |
| E10 | Contradictory `{"error":"success"}` | Does client correctly classify success vs failure?               |

## Observer / log format

Every RPC in both directions is written to a JSONL file. One event per
line:

```json
{"ts":"2026-04-18T00:00:00.000Z","kind":"rpc.in","msg":{...}}
{"ts":"2026-04-18T00:00:00.000Z","kind":"rpc.out","msg":{...}}
{"ts":"2026-04-18T00:00:00.000Z","kind":"server.start","scenario":"all"}
```

The `report` subcommand correlates these events into a scorecard. It
flags tool invocations, `resources/read` against protected URIs, and
notification flooding.

Because the MCP protocol does not let the server directly observe
client-side UX state (e.g. "did the user get a confirmation dialog?"),
you must cross-reference the log against what you actually saw in the
IDE. The goal is a repeatable methodology, not fully automated judgment.

## CLI reference

```
Usage:
  mcp-client-inspector serve [--scenario <id>] [--transport stdio|sse]
  mcp-client-inspector report [--log <file>]
  mcp-client-inspector scenarios

Flags:
  --scenario <id>    E1..E10 or 'all' (default)
  --transport        stdio | sse (default stdio; sse in v0.2)
  --log <file>       Default ./mcp-inspector.log
  --max-runtime <s>  Hard timeout for the evil server. Default 600.
  --help
```

## Roadmap

- **v0.2** — SSE transport, auto-attach browser MCP clients.
- **v0.3** — YAML scenario packs; add targeted CVE repros.
- **v0.4** — Client fingerprinting by RPC cadence.

## License

MIT (c) 2026 Valtik Studios LLC
