# PR #4: Safety allowlist, route guard and password refusal

Branch: `phase-1/safety-allowlist` into `main`. Closes #4.

## Summary
URL allowlist, Playwright context route guard that aborts and counts non-local requests, and a recorder-side refusal of password/payment/CAPTCHA fields.

## How it was tested
tests/allowlist.test.ts (24 cases) and tests/safety-guard.test.ts: external navigation blocked, 0 blocked requests during a heavy-mutated flow, password field refused.

## Numbers produced
0 external requests during a demo flow
