# PR #24: Stdio MCP server with six tools

Branch: `phase-4/mcp-server` into `main`. Closes #24.

## Summary
Stdio MCP server (bma mcp) with record_workflow, list_workflows, get_workflow, replay_workflow, approve_submission and get_run; replays run in the background and pause with pending_approval.

## How it was tested
tests/mcp-server.test.ts smoke tests; check.sh green.

## Numbers produced
none
