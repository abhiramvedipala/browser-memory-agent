# PR #15: Embedder interface, MiniLM, hash embedder and SQLite cache

Branch: `phase-3/embedder` into `main`. Closes #15.

## Summary
Embedder interface with MiniLM (transformers.js, verified on Node 22 arm64) and a deterministic HashEmbedder, plus a SQLite vector cache with batches of at most 64.

## How it was tested
tests/embedder.test.ts (9 cases incl. a MiniLM synonym test when models/ is cached); check.sh green.

## Numbers produced
MiniLM cold start 3.4 s; cos(cart,basket)=0.67 vs cos(cart,hold)=0.22
