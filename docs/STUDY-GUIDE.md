# Study guide

How to read this repo before an interview. Updated at the end of every phase.

## PRs in reading order

### Phase 1: demo apps, store and harness
1. PR #1 `phase-1/demo-server`: `demo-apps/server.ts`, one file, loopback only, per-session state.
2. PR #2 `phase-1/demo-apps`: `demo-apps/ui.ts`, then any app (start with `apps/bookshop.ts`), then `bench/flows/*.json`.
3. PR #3 `phase-1/mutation-engine`: `demo-apps/mutate.ts`: the operators and `LEVEL_OPS`.
4. PR #4 `phase-1/safety-allowlist`: `src/safety/allowlist.ts` and `guard.ts`.
5. PR #5 `phase-1/sqlite-store`: `src/memory/schema.sql`, then `store.ts`.
6. PR #6 `phase-1/bench-metrics`: `src/bench/metrics.ts`, `bootstrapCI()`.

## Reading paths
- 15 minutes: `demo-apps/mutate.ts` (what the benchmark does to pages), `src/safety/allowlist.ts`, `src/memory/schema.sql`.
- 60 minutes: add `demo-apps/server.ts`, one app plus its flow JSON, `src/bench/flows.ts`, `src/bench/metrics.ts` and their tests.

(The ten key commits and the full paths are completed in Phase 5.)
