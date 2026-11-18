# Progress

Status board. Updated after every merged PR (local PR numbers until the GitHub repo exists).

## Phase 1: Demo apps, store and harness
- [x] scaffold (on `main`)
- [x] Demo server with bench state endpoints (PR #1)
- [x] Six demo apps and 20 benchmark flows (PR #2)
- [x] Seeded DOM mutation engine (PR #3)
- [x] Safety allowlist, route guard and password refusal (PR #4)
- [x] SQLite schema, migrations and typed repository (PR #5)
- [x] Benchmark metrics with bootstrap confidence intervals (PR #6)
- [x] Phase 1 decisions, study guide and interview notes (PR #7)
<!-- phase-1 -->

## Phase 2: Recorder
- [x] In-page target extractor (PR #8)
- [x] Event recorder with debounced fills and parameter detection (PR #9)
- [x] Deterministic golden recordings of all 20 flows (PR #10)
- [x] LLM client with fixtures and budget guard, and step intent labels (PR #11)
<!-- phase-2 -->

## Phase 3: Replayer, resolver and approval gate
<!-- phase-3 -->

## Phase 4: MCP server
<!-- phase-4 -->

## Phase 5: Benchmark, results and docs
<!-- phase-5 -->

## Needs me
- Create the GitHub repo `abhiramvedipala/browser-memory-agent` (private), then push `main` first, wait for CI, then tags and branches at most three at a time. Issues and PRs live in `ISSUES.md` and `docs/pr/` until then.
- `ANTHROPIC_API_KEY`, only to record LLM fixtures (hard cap $2). Pending recordings: `LLM_MODE=record npm run label:intents` (about 20 small calls), the `llm` tie-break fixtures and the from-scratch agent fixtures (Phases 3 and 4). Until then those rows are marked pending in RESULTS.md.
