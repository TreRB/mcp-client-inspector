# mcp-client-inspector

**An evil MCP server you point your IDE at. Tests whether Cursor, Claude Code, Windsurf, Cline, or Zed defends itself against a malicious MCP integration.**

Every MCP security tool on GitHub scans the server side. Nobody tests whether your **client** defends against a malicious server. That gap is the entire point of this tool.

This is the companion to [`mcp-security-scanner`](https://github.com/TreRB/mcp-security-scanner). Where the scanner audits MCP server source code, this tool audits MCP clients by running a deliberately-malicious server at them.

## Strong disclaimer (read before running)

This tool runs an MCP server that is **deliberately malicious**. It intentionally:

- Registers tools whose names collide with common legitimate tools (`read_file`, `shell`)
- Returns 10 MB of garbage to exhaust LLM context windows
- Embeds Unicode bidi override characters and prompt injection in tool descriptions
- Returns output that mimics Claude / OpenAI `tool_calls` shape to trick naive clients
- Claims ownership of paths like `~/.claude/settings.json` and `~/.cursor/mcp.json` (real writes only happen if your client is broken)
- Spams `notifications/tools/list_changed` at approximately 10 kHz

**Run it only against MCP clients you own and are actively testing.** Do not point a production client at it. Running this exposes the connected client to real attack surface. You are responsible for what happens next.

## Install and run

```bash
npm install -g valtik-mcp-client-inspector

# In your IDE's MCP config, add an "inspector" server:
#   command: mcp-client-inspector
#   args:    ["serve", "--scenario", "all"]

# Use the IDE, poke at tools, watch what it does.

# When done:
mcp-client-inspector report --log ./mcp-inspector.log
```

Node 20+. ESM. No runtime deps.

## What each scenario tests

Ten scenarios. Each targets one client-side defense that should exist and frequently does not.

| ID  | Attack                                        | What a defended client does                                         |
| --- | --------------------------------------------- | ------------------------------------------------------------------- |
| E1  | Tool name collision across servers            | Disambiguates `read_file@evil` vs `read_file@legit`                  |
| E2  | 10 MB tool response                           | Truncates or refuses, never pipes the whole blob into LLM context    |
| E3  | Unicode bidi override in tool description     | Sanitizes U+202E before rendering or passing to the LLM              |
| E4  | Prompt injection embedded in docstring        | Isolates tool metadata from the system prompt                        |
| E5  | Schema race: declared list vs actual response | Validates tool output against the declared schema                    |
| E6  | Dynamic re-registration mid-session           | Re-queries `tools/list`, does not trust stale cache                  |
| E7  | Poisoned tool result (mimics `tool_calls`)    | Does not render server text as if the model emitted tool calls       |
| E8  | Config-file write (CVE-2026-30615 class)      | Rejects writes to its own MCP config file                            |
| E9  | 10 kHz notification flood                     | Rate limits or disconnects the noisy server                          |
| E10 | Contradictory `{"error":"success"}`           | Classifies as failure, does not show success UI                      |

## How to use it

```
1. Install the tool globally or reference its path.
2. Add it as an MCP server in your IDE's config.
3. Restart the IDE so it picks up the new server.
4. Use the IDE normally: invoke tools, approve or deny prompts,
   observe dialog behavior, notice any UI weirdness.
5. Stop the IDE when done.
6. Run `mcp-client-inspector report` to get a scorecard.
```

The scorecard cross-references what the evil server sent against what the IDE did in response, flagging any tool call that should have required user approval but did not, any file write to protected paths, and any notification flood that was not rate-limited.

Because MCP does not let the server directly observe client UX state (was a dialog shown, was a button clicked), some findings require you to cross-reference the log with what you saw. The goal is a **repeatable methodology**, not fully automated judgment.

## Log format

Every RPC in both directions goes to a JSONL file:

```json
{"ts":"2026-04-18T00:00:00.000Z","kind":"rpc.in","msg":{...}}
{"ts":"2026-04-18T00:00:00.000Z","kind":"rpc.out","msg":{...}}
{"ts":"2026-04-18T00:00:00.000Z","kind":"server.start","scenario":"all"}
```

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

## Who this is for

- **MCP client authors** (Cursor, Claude Code, Windsurf, Cline, Zed) validating defenses before each release
- **Enterprise security teams** that let engineers install MCP servers in IDEs and need to know what the blast radius is
- **Security researchers** looking for new MCP client attack patterns
- **Anyone shipping an MCP server** who wants to be sure their published integration won't accidentally trip its users

## Roadmap

- **v0.2** SSE transport, auto-attach for browser-based MCP clients
- **v0.3** YAML scenario packs, targeted CVE repros as attacks land in NVD
- **v0.4** Client fingerprinting by RPC cadence

## License and attribution

MIT (c) 2026 Valtik Studios LLC. Not affiliated with Anthropic. "MCP" and "Model Context Protocol" are specifications by Anthropic.
