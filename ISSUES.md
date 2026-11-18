# Issues

Mirror of the GitHub issues so the project reads offline. Status: open / fixed in PR #n / won't fix.

## #1 Demo server with bench state endpoints
- Label: feature | Milestone: Phase 1 | Branch: `phase-1/demo-server` | Status: fixed in PR #1
- What and why: Demo server with bench state endpoints.
- Acceptance checks:
  - [x] Server binds 127.0.0.1 only
  - [x] GET /__bench/state and /__bench/reset work per session cookie
  - [x] POST submissions are counted per session
  - [x] Requests are logged
  - [x] Unit tests cover routing, cookies and state

## #2 Six demo apps and 20 benchmark flows
- Label: feature | Milestone: Phase 1 | Branch: `phase-1/demo-apps` | Status: fixed in PR #2
- What and why: Six demo apps and 20 benchmark flows.
- Acceptance checks:
  - [x] 6 apps served under their own base paths
  - [x] 20 flows defined in bench/flows/*.json with task, params, start URL, golden steps and success check
  - [x] Every interactive element carries data-bench-id
  - [x] Golden script passes each flow success check on mut=none

## #3 Seeded DOM mutation engine
- Label: feature | Milestone: Phase 1 | Branch: `phase-1/mutation-engine` | Status: fixed in PR #3
- What and why: Seeded DOM mutation engine.
- Acceptance checks:
  - [x] Operators: ids, classes, wrap, testids, reorder, synonyms, labels, move, decoy, urlpath, delay
  - [x] Levels none/light/medium/heavy plus single-operator mode
  - [x] Same seed gives the same DOM
  - [x] data-bench-id preserved on every original interactive element
  - [x] Each operator unit-tested

## #4 Safety allowlist, route guard and password refusal
- Label: feature | Milestone: Phase 1 | Branch: `phase-1/safety-allowlist` | Status: fixed in PR #4
- What and why: Safety allowlist, route guard and password refusal.
- Acceptance checks:
  - [x] src/safety/allowlist.ts checks every navigation URL
  - [x] Context route guard aborts any non-local request and counts them
  - [x] Recorder-side check refuses type=password and similar sensitive fields
  - [x] Tests prove external navigation is blocked and zero external requests happen on a demo flow

## #5 SQLite schema, migrations and typed repository
- Label: feature | Milestone: Phase 1 | Branch: `phase-1/sqlite-store` | Status: fixed in PR #5
- What and why: SQLite schema, migrations and typed repository.
- Acceptance checks:
  - [x] schema.sql with the seven tables
  - [x] Migrations driven by PRAGMA user_version
  - [x] Typed repository functions for workflows, steps, runs, run_steps, approvals, llm_calls, embeddings
  - [x] Tests on an in-memory database

## #6 Benchmark metrics with bootstrap confidence intervals
- Label: feature | Milestone: Phase 1 | Branch: `phase-1/bench-metrics` | Status: fixed in PR #6
- What and why: Benchmark metrics with bootstrap confidence intervals.
- Acceptance checks:
  - [x] Replay record type and step outcome kinds
  - [x] Success, step accuracy, wrong-element, refusal and recovery rates with 95 percent bootstrap CIs over flows
  - [x] Median and p95 time, tokens and cost per flow, retry stats, grouping by operator
  - [x] Unit tests on hand-computed cases: empty, all failures, ties

## #7 Phase 1 decisions, study guide and interview notes
- Label: docs | Milestone: Phase 1 | Branch: `phase-1/docs-and-notes` | Status: fixed in PR #7
- What and why: Phase 1 decisions, study guide and interview notes.
- Acceptance checks:
  - [x] DECISIONS.md covers demo-app, session, mutation and metric choices
  - [x] STUDY-GUIDE lists Phase 1 PRs in reading order
  - [x] INTERVIEW-NOTES has the Phase 1 section

## #8 In-page target extractor
- Label: feature | Milestone: Phase 2 | Branch: `phase-2/target-extractor` | Status: fixed in PR #8
- What and why: In-page target extractor.
- Acceptance checks:
  - [x] In-page script computes role, accessible name, label, placeholder, text, nearby text, attrs, CSS candidates, bbox for an element
  - [x] Never reads data-bench-id
  - [x] Accessible names agree with Playwright getByRole on every demo-app control
  - [x] Unit tests on fixture HTML pages

## #9 Event recorder with debounced fills and parameter detection
- Label: feature | Milestone: Phase 2 | Branch: `phase-2/event-recorder` | Status: fixed in PR #9
- What and why: Event recorder with debounced fills and parameter detection.
- Acceptance checks:
  - [x] exposeBinding listener records click, fill, select, check, Enter and submit
  - [x] Fills are debounced and merged; sensitive fields are refused before the value leaves the page
  - [x] Typed values matching a flow param become {{name}}
  - [x] Initial navigation recorded, navigations caused by interactions are not
  - [x] Tests record real golden flows

## #10 Deterministic golden recordings of all 20 flows
- Label: feature | Milestone: Phase 2 | Branch: `phase-2/golden-recordings` | Status: fixed in PR #10
- What and why: Deterministic golden recordings of all 20 flows.
- Acceptance checks:
  - [x] npm run record:golden records every flow through the real recorder with no LLM
  - [x] Recordings exported as JSON under bench/recordings with a ground-truth sidecar
  - [x] Importer loads a recording into SQLite
  - [x] A test re-records and diffs against the committed files

## #11 LLM client with fixtures and budget guard, and step intent labels
- Label: feature | Milestone: Phase 2 | Branch: `phase-2/intent-labels` | Status: fixed in PR #11
- What and why: LLM client with fixtures and budget guard, and step intent labels.
- Acceptance checks:
  - [x] LLM client with replay (default) and record modes; missing fixture in replay is an error, never a network call
  - [x] Budget guard refuses calls that would pass 1.80 USD and prints the running total
  - [x] Every recorded call is written to the llm_calls ledger
  - [x] One call per workflow writes a short intent per step, with a deterministic fallback
  - [x] Works fully in replay mode
