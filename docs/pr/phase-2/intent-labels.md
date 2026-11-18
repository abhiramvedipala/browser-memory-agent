# PR #11: LLM client with fixtures and budget guard, and step intent labels

Branch: `phase-2/intent-labels` into `main`. Closes #11.

## Summary
Record/replay LLM client (replay default, missing fixture is an error), budget guard at 1.80 USD with running total, price table, ledger rows, and one-call step intent labelling with a deterministic fallback. Live fixtures are pending (no API key approved).

## How it was tested
tests/llm.test.ts: 16 cases with a fake transport; check.sh green.

## Numbers produced
0 USD spent
