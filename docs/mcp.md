# Using browser-memory-agent from an MCP client

`bma mcp` is a stdio MCP server. It starts the local demo apps on `127.0.0.1:4173` if they are not already running and exposes six tools:

| Tool | What it does |
|---|---|
| `list_workflows` | Latest version of every recorded workflow. |
| `get_workflow` | One workflow with its steps (action, intent, value template, target role and name). |
| `record_workflow` | Opens a browser window on a local demo app and records what you do; saved when you close the window. |
| `replay_workflow` | Replays a workflow. Returns the run summary, or `pending_approval` with the form fields and a screenshot path when a submission needs approval. Optional `strategy`, `mutation_level`, `seed`, `params`. |
| `approve_submission` | Approve or deny the pending submission. Denying stops the run before anything is submitted. |
| `get_run` | Status, per-step strategy, scores, errors, screenshots and approvals of a run. |

Only the local demo apps are supported: any other URL is rejected by `src/safety/allowlist.ts`, and logins, passwords, payments and CAPTCHAs are never automated. No API key is needed; the default `semantic-minilm` strategy runs locally.

## Setup

```bash
npm ci
npx playwright install chromium
npm run model:fetch
```

## Claude Code

From the repo root:

```bash
claude mcp add browser-memory -- node bin/bma.js mcp --seed-golden
```

Or in `.mcp.json` at the repo root:

```json
{
  "mcpServers": {
    "browser-memory": {
      "command": "node",
      "args": ["bin/bma.js", "mcp", "--seed-golden"]
    }
  }
}
```

## Claude Desktop

In `claude_desktop_config.json`, with the absolute path to your clone:

```json
{
  "mcpServers": {
    "browser-memory": {
      "command": "node",
      "args": ["<path-to-clone>/bin/bma.js", "mcp", "--seed-golden"]
    }
  }
}
```

`--seed-golden` loads the 20 golden recordings into an empty database so there is something to replay straight away. Use `--db <file>` to keep your own recordings elsewhere (default `data/bma.db`, gitignored).

## A real session

[`mcp-transcript.md`](mcp-transcript.md) is a session captured by `npm run mcp:transcript`, which starts `bma mcp --seed-golden` as a child process and calls it with the MCP SDK client over stdio. It shows:

- listing and inspecting workflows;
- a replay on a medium-mutated page where one step is refused: the button "Apply" was renamed "Update", the best candidate scored 0.53 against the frozen 0.60 threshold, and the run stopped instead of guessing;
- a replay that pauses at the "Place hold" submission with the field summary and a screenshot, then a denial (nothing reaches the server);
- a request for `https://example.com`, refused.
