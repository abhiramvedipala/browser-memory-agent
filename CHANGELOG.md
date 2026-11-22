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

- PR #12 bma record command: bma record and bma list: headed (or scripted) recording of a human workflow into SQLite through a guarded context; external URLs rejected before any browser starts.

- PR #13 Recording format documentation with a real exported example: docs/recording-format.md documents every table and field with a real example exported by script; bma export prints a stored workflow.

- PR #14 Phase 2 decisions, study guide and interview notes: Phase 2 decisions D9-D11, study guide and interview notes.


## Phase 3
- PR #15 Embedder interface, MiniLM, hash embedder and SQLite cache: Embedder interface with MiniLM (transformers.js, verified on Node 22 arm64) and a deterministic HashEmbedder, plus a SQLite vector cache with batches of at most 64.

- PR #16 Candidate extraction with descriptions: In-page collect() plus collectCandidates(): visible interactive elements with descriptions, documented policy for hidden, disabled and offscreen elements, and candidateText() for embeddings.

- PR #17 Resolver chain: css, role, semantic with refuse-rather-than-guess: css, role and semantic resolver strategies with a verified full chain, score and margin thresholds, and the refuse-rather-than-guess rule; identity and context embedded separately.

- PR #18 Retries with backoff and failure screenshots: resolveWithRetry: up to 3 attempts with backoff for late elements, and on refusal a full-page screenshot plus a scored-candidate dump under runs/<run_id>/.

- PR #19 Approval gate before form submission: Approval gate: rules for what pauses a run, approvals rows with field summary and screenshot, CLI (default No), MCP-manual and deny-all providers, timeout as deny, and a benchmark auto-approve flag refused for non-local URLs.

- PR #20 Replay engine and bma replay: replayWorkflow plus bma replay: guarded context, param check, retries, approval gate, run and run_step logging, observe hook for the scorer. Denied and timed-out approvals leave the server submission count at 0.

- PR #21 Tune thresholds on seeds 0-2 and freeze them: Threshold tuning on seeds 0-2 only: oracle-driven pass over 353 hard steps, per-embedder thresholds frozen in config/resolver.json (tuned=true).

- PR #22 Optional LLM tie-break over the top 3 candidates: Optional llm strategy: top-3 shortlist, answers 1-3 or none, unparseable means none; off by default, budgeted through the record/replay client.

- PR #23 Phase 3 study guide and interview notes: Phase 3 study guide and interview notes.


## Phase 4
- PR #24 Stdio MCP server with six tools: Stdio MCP server (bma mcp) with record_workflow, list_workflows, get_workflow, replay_workflow, approve_submission and get_run; replays run in the background and pause with pending_approval.

- PR #25 Tuned thresholds accept a wrong element when the target is absent: Threshold tuning now includes target-absent negative rows; thresholds re-frozen (MiniLM 0.60/0.015, hash 0.53/0.03). Fixes the two refusal tests failing on main.

- PR #26 MCP tools validate every URL against the allowlist: Tests that every URL-taking MCP tool rejects anything but the local demo server, before a browser starts, and that tool descriptions state the boundary.

- In-process MCP client tests for the full tool flow: In-process MCP client tests: list, get, replay to success, replay to pending_approval then deny (0 submissions) or approve (1 submission), external URL rejected.
- MCP client config and a real session transcript: docs/mcp.md with ready client config for bma mcp and a real stdio session transcript produced by npm run mcp:transcript; fixes a doubled 'refused:' prefix.
