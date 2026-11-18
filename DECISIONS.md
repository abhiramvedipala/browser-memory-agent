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
