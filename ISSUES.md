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
- Label: feature | Milestone: Phase 1 | Branch: `phase-1/sqlite-store` | Status: open
- What and why: SQLite schema, migrations and typed repository.
- Acceptance checks:
  - [ ] schema.sql with the seven tables
  - [ ] Migrations driven by PRAGMA user_version
  - [ ] Typed repository functions for workflows, steps, runs, run_steps, approvals, llm_calls, embeddings
  - [ ] Tests on an in-memory database
