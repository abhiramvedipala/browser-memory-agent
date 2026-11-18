# PR #18: Retries with backoff and failure screenshots

Branch: `phase-3/retry-and-screenshots` into `main`. Closes #18.

## Summary
resolveWithRetry: up to 3 attempts with backoff for late elements, and on refusal a full-page screenshot plus a scored-candidate dump under runs/<run_id>/.

## How it was tested
tests/retry.test.ts (3 cases) incl. a control revealed after 900 ms; check.sh green.

## Numbers produced
none
