# In-process MCP client tests for the full tool flow

Branch: `phase-4/mcp-tests` into `main`. Closes #5.

## Summary
In-process MCP client tests: list, get, replay to success, replay to pending_approval then deny (0 submissions) or approve (1 submission), external URL rejected.

## How it was tested
tests/mcp-flows.test.ts (5 cases) locally and in CI.

## Numbers produced
deny: 0 server submissions; approve: exactly 1
