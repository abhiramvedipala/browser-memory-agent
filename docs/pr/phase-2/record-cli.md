# PR #12: bma record command

Branch: `phase-2/record-cli` into `main`. Closes #12.

## Summary
bma record and bma list: headed (or scripted) recording of a human workflow into SQLite through a guarded context; external URLs rejected before any browser starts.

## How it was tested
tests/record-session.test.ts: 8 cases; also ran bma record with https://example.com (exit 3); check.sh green.

## Numbers produced
none
