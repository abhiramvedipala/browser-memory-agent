# PR #20: Replay engine and bma replay

Branch: `phase-3/replay-engine` into `main`. Closes #20.

## Summary
replayWorkflow plus bma replay: guarded context, param check, retries, approval gate, run and run_step logging, observe hook for the scorer. Denied and timed-out approvals leave the server submission count at 0.

## How it was tested
tests/replay.test.ts (14 cases); check.sh green.

## Numbers produced
helpdesk replay with approvals: exactly 1 server submission; denied/timeout: 0
