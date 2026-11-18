# PR #6: Benchmark metrics with bootstrap confidence intervals

Branch: `phase-1/bench-metrics` into `main`. Closes #6.

## Summary
Pure metric functions: success, step accuracy, wrong-element, refusal, recovery vs css-only, time percentiles, retry stats and per-key breakdowns, each with a seeded 95% bootstrap CI that resamples flows.

## How it was tested
tests/metrics.test.ts: 17 hand-computed cases incl. empty, all-failure and ties; check.sh green.

## Numbers produced
none
