# PR #19: Approval gate before form submission

Branch: `phase-3/approval-gate` into `main`. Closes #19.

## Summary
Approval gate: rules for what pauses a run, approvals rows with field summary and screenshot, CLI (default No), MCP-manual and deny-all providers, timeout as deny, and a benchmark auto-approve flag refused for non-local URLs.

## How it was tested
tests/approval.test.ts (11 cases); engine-level 'denied leaves submission count 0' test lands with the replay engine; check.sh green.

## Numbers produced
none
