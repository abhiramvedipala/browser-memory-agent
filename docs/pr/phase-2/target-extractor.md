# PR #8: In-page target extractor

Branch: `phase-2/target-extractor` into `main`. Closes #8.

## Summary
In-page script that describes an element (role, accessible name, label, placeholder, text, nearby text, attrs, CSS candidates, bbox) and a sweep test proving names agree with Playwright's getByRole on every demo control at none and heavy.

## How it was tested
tests/extractor.test.ts: 14 cases incl. 2 sweeps over 13 pages; check.sh green.

## Numbers produced
none
