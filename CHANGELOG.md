# Changelog

One entry per merged PR, grouped by phase.

## Phase 1
- PR #1 Demo server with bench state endpoints: node:http demo server on 127.0.0.1 with per-session state, bench endpoints, request log and submission counter.

- PR #2 Six demo apps and 20 benchmark flows: Six server-rendered demo apps (bookshop, library, jobs, recipes, docs, helpdesk) and 20 flow definitions with golden steps and server-side success checks.

- PR #3 Seeded DOM mutation engine: Seeded mutation engine with 11 operators across light/medium/heavy levels and a single-operator mode; ground-truth ids preserved.

- PR #4 Safety allowlist, route guard and password refusal: URL allowlist, Playwright context route guard that aborts and counts non-local requests, and a recorder-side refusal of password/payment/CAPTCHA fields.

- PR #5 SQLite schema, migrations and typed repository: SQLite schema with seven tables, user_version migrations and a typed Store repository (versioned workflows, runs, approvals, LLM ledger, embedding cache).

- PR #6 Benchmark metrics with bootstrap confidence intervals: Pure metric functions: success, step accuracy, wrong-element, refusal, recovery vs css-only, time percentiles, retry stats and per-key breakdowns, each with a seeded 95% bootstrap CI that resamples flows.

- PR #7 Phase 1 decisions, study guide and interview notes: Decisions D3-D7, study guide and interview notes for Phase 1.


## Phase 2
- PR #8 In-page target extractor: In-page script that describes an element (role, accessible name, label, placeholder, text, nearby text, attrs, CSS candidates, bbox) and a sweep test proving names agree with Playwright's getByRole on every demo control at none and heavy.

- PR #9 Event recorder with debounced fills and parameter detection: Recorder that attaches to a browser context and turns click, fill (debounced), select, check, Enter and submit into workflow steps with {{param}} detection; refuses password/payment fields before the value leaves the page.

- PR #10 Deterministic golden recordings of all 20 flows: npm run record:golden records all 20 flows via the real recorder in a guarded context and writes JSON (with a scorer-only ground-truth sidecar); a test re-records and diffs.

- PR #11 LLM client with fixtures and budget guard, and step intent labels: Record/replay LLM client (replay default, missing fixture is an error), budget guard at 1.80 USD with running total, price table, ledger rows, and one-call step intent labelling with a deterministic fallback. Live fixtures are pending (no API key approved).

