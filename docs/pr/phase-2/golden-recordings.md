# PR #10: Deterministic golden recordings of all 20 flows

Branch: `phase-2/golden-recordings` into `main`. Closes #10.

## Summary
npm run record:golden records all 20 flows via the real recorder in a guarded context and writes JSON (with a scorer-only ground-truth sidecar); a test re-records and diffs.

## How it was tested
tests/golden-recordings.test.ts: 4 cases incl. full re-record diff; check.sh green.

## Numbers produced
20 recordings, 4 to 11 steps each
