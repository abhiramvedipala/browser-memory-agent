# Interview notes

Updated after every phase.

## Phase 1: demo apps, store and harness

### What this phase built
- Six local demo web apps (bookshop, library, jobs, recipes, docs, helpdesk) and 20 benchmark flows with server-side success checks.
- A seeded mutation engine with 11 operators in three levels, plus a single-operator mode.
- A hard safety boundary: URL allowlist, context-level route guard, refusal to record password and payment fields.
- A SQLite store with versioned workflows, runs, approvals, an LLM cost ledger and an embedding cache.
- Benchmark metrics with bootstrap confidence intervals.

### Key design decisions (and "why not X?")
- Pages are DOM trees, not strings (D3). Why not a headless framework like React? Mutations would fight the framework's own ids and rendering.
- Ground truth is an attribute the resolver may not read, and success is judged by the server (D5). Why not trust the agent? An agent that clicks the wrong button and reports success would score perfectly.
- Safety is code, not a README promise: every request is checked in the route guard. Why not just point at local URLs? Because a bug in the agent should still be unable to touch a real site.
- Bootstrap over flows (D7). Why not a normal binomial interval? Replays of one flow share the same page structure, so they are correlated.

### Hardest problem
Keeping the mutated pages functional. Decoys must be inert, aliased `/v2` links must route, and delayed controls must appear. A test runs all 20 golden flows under heavy mutation, which caught nothing only because the operators were designed around it (decoys are `type=button`, the server strips `/v2`).

### Likely questions
1. *How do you know the benchmark is fair?* Same pages for every strategy, seeded mutations, ground truth hidden from the resolver, tuning on seeds 0-2 and evaluation on 100+.
2. *What stops the agent hitting a real website?* `Allowlist` plus `installRouteGuard`, tested with a blocked `https://example.com` navigation and a count of zero blocked requests on a full flow.
3. *Why SQLite?* One local file, transactional writes for multi-step workflows, no server to run; `user_version` migrations are enough for one schema.
4. *Why cookies for session state?* Two parallel browser contexts must not share carts or counters, and URLs should stay clean.
5. *What does a bootstrap CI over flows mean?* Resample whole flows with replacement, recompute the rate 2,000 times, take the 2.5th and 97.5th percentiles; it respects that replays of one flow are not independent.

### Files to open
`demo-apps/mutate.ts`, `src/safety/guard.ts`, `src/memory/store.ts`, `src/bench/metrics.ts`, `tests/mutated-flows.test.ts`.

## Phase 2: recorder

### What this phase built
- An in-page describer: role, accessible name, label, placeholder, text, nearby text, allowlisted attributes and CSS candidates for any element.
- A recorder using `exposeBinding`: clicks, debounced fills, selects, checkboxes, Enter and submit become steps; typed values equal to a param become `{{name}}`.
- Passwords and payment fields are refused before the value leaves the page.
- 20 deterministic golden recordings, a record/replay LLM client with a budget guard, and `bma record`.

### Key decisions (and "why not X?")
- Plain JS injected into the page (D9). Why not TypeScript? Bundler helpers break inside the page.
- Accessible names verified against Playwright (D10). Why not trust my own computation? The role-only baseline would be unfair.
- LLM calls through fixtures, replay by default (D8). Why not call the API in tests? Flaky, costly, and CI must need no key.

### Hardest problem
Recording faithfully: Enter in a field makes the browser click the default button (a phantom click), `document.open` (used by `setContent`) silently removes listeners, and Playwright's `selectOption` fires synthetic events, so filtering on `isTrusted` was wrong. Each was found by a failing test.

### Likely questions
1. *How does recording know a value is a parameter?* Exact, case-insensitive match against default param values at record time.
2. *How do you keep secrets out of the store?* The page script sends only a refusal for sensitive fields; the Node side checks again; a test types a password and greps the output.
3. *Why record the accessible name?* It is the most stable cross-redesign signal and what Playwright role locators use.
4. *What if the LLM fixture is missing in CI?* The test fails with the fixture key; nothing calls the network.
5. *Why a ground-truth sidecar?* The scorer needs the right answer without the resolver ever seeing it.

### Files to open
`src/page/bma-page.js`, `src/recorder/recorder.ts`, `src/llm/client.ts`, `tests/recorder.test.ts`.
