# PR #2: Six demo apps and 20 benchmark flows

Branch: `phase-1/demo-apps` into `main`. Closes #2.

## Summary
Six server-rendered demo apps (bookshop, library, jobs, recipes, docs, helpdesk) and 20 flow definitions with golden steps and server-side success checks.

## How it was tested
tests/flows.test.ts: 20 golden scripts each pass their success check on mut=none; check.sh green.

## Numbers produced
20 flows, 6 apps, 0 external assets
