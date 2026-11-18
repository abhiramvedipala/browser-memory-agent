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

### Phase 2: recorder
7. PR #8 `phase-2/target-extractor`: `src/page/bma-page.js`, `describe()`.
8. PR #9 `phase-2/event-recorder`: `src/page/bma-record.js`, then `src/recorder/recorder.ts`.
9. PR #10 `phase-2/golden-recordings`: `src/recorder/golden.ts`, `bench/recordings/*.json`.
10. PR #11 `phase-2/intent-labels`: `src/llm/client.ts` (record/replay), `budget.ts`, `intents.ts`.
11. PR #12 `phase-2/record-cli`: `src/recorder/session.ts`, `src/cli.ts`.
12. PR #13 `phase-2/recording-format-doc`: `docs/recording-format.md`.

### Phase 3: replayer, resolver and approval gate
13. PR #15 `phase-3/embedder`: `src/embeddings/embedder.ts`, then `minilm.ts`.
14. PR #16 `phase-3/candidate-extraction`: `collect()` in `src/page/bma-page.js`, `src/replay/candidates.ts`.
15. PR #17 `phase-3/resolver-chain`: `src/resolver/strategies.ts`, then `chain.ts` (the core of the project).
16. PR #18 `phase-3/retry-and-screenshots`: `src/replay/retry.ts`.
17. PR #19 `phase-3/approval-gate`: `src/replay/approval.ts`, `needsApproval()` and `gateStep()`.
18. PR #20 `phase-3/replay-engine`: `src/replay/engine.ts`, `replayWorkflow()`.
19. PR #21 `phase-3/threshold-tuning`: `scripts/tune.ts`, `config/tuning-report.json`.
20. PR #22 `phase-3/llm-tiebreak`: `src/llm/tiebreak.ts`.

## Reading paths
- 15 minutes: `demo-apps/mutate.ts` (what the benchmark does to pages), `src/safety/allowlist.ts`, `src/memory/schema.sql`.
- 60 minutes: add `demo-apps/server.ts`, one app plus its flow JSON, `src/bench/flows.ts`, `src/bench/metrics.ts` and their tests.

(The ten key commits and the full paths are completed in Phase 5.)
