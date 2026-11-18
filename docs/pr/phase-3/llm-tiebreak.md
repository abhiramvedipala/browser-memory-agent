# PR #22: Optional LLM tie-break over the top 3 candidates

Branch: `phase-3/llm-tiebreak` into `main`. Closes #22.

## Summary
Optional llm strategy: top-3 shortlist, answers 1-3 or none, unparseable means none; off by default, budgeted through the record/replay client.

## How it was tested
tests/tiebreak.test.ts (6 cases) with a fake transport; live fixtures pending (see D8); check.sh green.

## Numbers produced
none
