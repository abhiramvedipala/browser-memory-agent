# PR #25: Tuned thresholds accept a wrong element when the target is absent

Branch: `phase-4/fix-tuning-negatives` into `main`. Closes #25.

## Summary
Threshold tuning now includes target-absent negative rows; thresholds re-frozen (MiniLM 0.60/0.015, hash 0.53/0.03). Fixes the two refusal tests failing on main.

## How it was tested
npm run tune on seeds 0-2; tests/resolver.test.ts and tests/replay.test.ts green; check.sh green locally and in CI.

## Numbers produced
MiniLM accepts 85/353 hard steps with 0 wrong, 0/353 absent-target accepted
