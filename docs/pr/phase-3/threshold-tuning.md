# PR #21: Tune thresholds on seeds 0-2 and freeze them

Branch: `phase-3/threshold-tuning` into `main`. Closes #21.

## Summary
Threshold tuning on seeds 0-2 only: oracle-driven pass over 353 hard steps, per-embedder thresholds frozen in config/resolver.json (tuned=true).

## How it was tested
tests/tuning.test.ts; npm run tune produced MiniLM 0.44/0.06 and hash 0.37/0.105; check.sh green.

## Numbers produced
MiniLM: 208 accepted correct, 1 wrong, 144 refused of 353 hard steps; hash: 192/0/161
