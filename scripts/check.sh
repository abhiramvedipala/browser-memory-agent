#!/usr/bin/env bash
# One command that every PR and CI run must pass: lint, types, tests, bench smoke.
set -euo pipefail
cd "$(dirname "$0")/.."
export LLM_MODE="${LLM_MODE:-replay}"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"

echo "== eslint =="; npx eslint .
echo "== tsc =="; npx tsc --noEmit
echo "== vitest =="; npx vitest run
echo "== bench smoke =="; npm run --silent bench:smoke
echo "check: OK"
