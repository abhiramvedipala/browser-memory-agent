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
