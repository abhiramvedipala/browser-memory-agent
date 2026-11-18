# Decisions

## D1: TypeScript pinned to 6.0.3
Context: typescript 7.0.x is the latest on npm. Options: 7.x, 6.0.x. Choice: 6.0.3. Why: typescript-eslint 8.73 declares `typescript >=4.8.4 <6.1.0`, so 7.x would break linting.

## D2: Node binary
Context: Homebrew's `node@22` on this Mac fails to start (missing libsimdjson.34 after a brew upgrade). Choice: use `/usr/local/bin/node` (v22.16.0, universal arm64 binary). Why: satisfies the Node >= 22 requirement without touching the system install. CI uses Node 22 from actions/setup-node.

## D3: Demo apps are server-rendered El trees, no client JS
Context: the mutation engine renames ids and classes, wraps and moves elements. Options: (a) apps with client-side JS that finds elements by id, (b) string templates plus an HTML parser, (c) pages built as small DOM trees and serialized once. Choice: (c). Why: tree edits are exact, there is no parser dependency, and apps that use plain forms and links keep working when every id and class is renamed. The only script on a page is the one the `delay` operator injects.

## D4: One session per cookie, mutation settings in cookies
Context: the benchmark runs two browser contexts at once and links must stay clean (`/bookshop/book/4`, not `...?mut=heavy&seed=100`). Choice: the server keeps state per `bma_sid` cookie and remembers `mut`/`seed` from the first request in cookies. Why: contexts cannot see each other's cart or submission counter, and URL patterns recorded from a `none` page match replays on mutated pages.

## D5: Ground truth lives in `data-bench-id`, success lives on the server
Context: the benchmark needs to know when the resolver picked the wrong element and when a flow really succeeded. Choice: every interactive element has `data-bench-id` (only the scorer and golden scripts read it; the candidate extractor strips it and a test enforces that); flow success is evaluated from the server's event log (`/__bench/state`), never from the agent's own claim. Decoys carry `decoy.*` ids so choosing one counts as a wrong element.

## D6: Mutation operators use independent PRNG streams
Context: per-operator results (success by mutation operator) need an operator to behave the same alone as inside a level. Choice: each operator draws from `makeRng(seed|path|operator)`; `?mut=op:<name>` runs a single operator. Why: determinism per page and clean attribution. Trade-off: single-operator rows apply at the operator's normal probability, not 100%.

## D7: Metric conventions
Context: small samples (20 flows) and clustered replays. Choice: empty denominators are NaN ("n/a"); CIs are percentile bootstraps that resample whole flows; per-step accuracy counts only steps actually reached; wrong-element rate is per replay (one wrong action anywhere counts once). Alternative rejected: a Wilson interval over replays, which would treat the 12 replays of one flow as independent and look more certain than it is.

## D8: LLM access is record/replay, and no live calls were made during the build
Context: the owner has not approved spending on an API key for this project. Choice: everything that can run without live calls is built and tested against a fake transport; `LLM_MODE=replay` (default in tests, CI and check.sh) serves `fixtures/llm/<sha256>.json` and a missing fixture throws. The three live-recording steps (step intent labels, the `llm` tie-break, the from-scratch agent baseline) are implemented but their fixtures are not recorded yet; they are listed under "Needs me" in PROGRESS.md. Why: the benchmark's main table (css-only, role-only, semantic-hash, semantic-minilm) needs no LLM at all, and recorded intents are optional because `fallbackIntent()` builds deterministic labels. Price table: `claude-haiku-5-5` at $1 / $5 per million tokens is an assumption (see `src/llm/pricing.ts`) to confirm before the first live call; the budget guard prices unknown models at the highest known rate.

## D9: The in-page script is plain JavaScript
Context: the describer and the recording listeners are serialized into the page. Options: TypeScript functions passed to `page.evaluate`, or plain `.js` files read as text. Choice: plain JS (`src/page/bma-page.js`, `bma-record.js`). Why: tsx/esbuild can inject helpers (such as `__name`) that do not exist in the page. Trade-off: no type checking in those files; the extractor tests and the Playwright agreement sweep cover them instead.

## D10: Accessible names are computed in-page and checked against Playwright
Context: the `role-only` baseline is only fair if recorded names match what `getByRole` sees. Choice: a pragmatic accname subset plus a sweep test that every visible control on 13 demo pages (none and heavy) is found by `getByRole(role, {name, exact})`. `<summary>` has no Playwright role, so it is excluded from the sweep and handled specially in the role strategy.

## D11: A `select` is described by its option labels
Context: the selected option changes after the user chooses, so recording it would make the description differ from the replay-time one. Choice: `text` holds all option labels.

## D12: What counts as a submission for the approval gate
Context: the brief says to pause on any `type=submit` click. Every search form in the demo apps uses a submit button, so that would ask a human to approve every search. Choice: pause on `submit` steps, Enter in a form field, and submit clicks on POST forms or buttons named submit/send/place/confirm/order/pay/reserve; a GET form is a query and does not pause. Trade-off: "Add to cart" and "Save job" (POST) pause too, which is the safer side; the benchmark flag approves them automatically and records each approval.

## D13: Resolver thresholds tuned on seeds 0-2 only, per embedder
Context: cosine scales differ between MiniLM and the hash embedder, and only steps that css (name-confirmed) and role cannot resolve ever reach the semantic strategy. Method (`npm run tune`, `scripts/tune.ts`): an oracle-driven pass replays all 20 golden flows at light, medium and heavy on seeds 0, 1, 2, acting on the ground-truth element so the page always advances, while scoring the semantic resolver on the live page. 353 "hard" steps were collected. Grid search over minScore 0.20 to 0.90 and minMargin 0 to 0.20, utility = accepted-correct minus 10 times accepted-wrong, ties go to the stricter pair.
Result: MiniLM minScore 0.44, minMargin 0.06 (208 accepted correct, 1 accepted wrong, 144 refused of 353; top-1 was correct on 317). Hash minScore 0.37, minMargin 0.105 (192 correct, 0 wrong, 161 refused; top-1 correct on 305). Frozen in `config/resolver.json` (`tuned: true`), report in `config/tuning-report.json`. The benchmark runs on seeds 100 to 102, never used for tuning.
