# PR #17: Resolver chain: css, role, semantic with refuse-rather-than-guess

Branch: `phase-3/resolver-chain` into `main`. Closes #17.

## Summary
css, role and semantic resolver strategies with a verified full chain, score and margin thresholds, and the refuse-rather-than-guess rule; identity and context embedded separately.

## How it was tested
tests/resolver.test.ts (14 cases) incl. ties, decoys and low-margin refusal; check.sh green.

## Numbers produced
none
