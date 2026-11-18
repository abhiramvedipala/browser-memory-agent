# PR #26: MCP tools validate every URL against the allowlist

Branch: `phase-4/mcp-safety` into `main`. Closes #26.

## Summary
Tests that every URL-taking MCP tool rejects anything but the local demo server, before a browser starts, and that tool descriptions state the boundary.

## How it was tested
tests/mcp-safety.test.ts (17 cases); CI on the PR.

## Numbers produced
0 browsers launched for 14 rejected calls
