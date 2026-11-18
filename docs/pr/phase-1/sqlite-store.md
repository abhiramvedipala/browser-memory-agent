# PR #5: SQLite schema, migrations and typed repository

Branch: `phase-1/sqlite-store` into `main`. Closes #5.

## Summary
SQLite schema with seven tables, user_version migrations and a typed Store repository (versioned workflows, runs, approvals, LLM ledger, embedding cache).

## How it was tested
tests/store.test.ts: 16 cases on an in-memory database; check.sh green.

## Numbers produced
none
