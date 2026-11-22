# MCP client config and a real session transcript

Branch: `phase-4/mcp-client-config` into `main`. Closes #7.

## Summary
docs/mcp.md with ready client config for bma mcp and a real stdio session transcript produced by npm run mcp:transcript; fixes a doubled 'refused:' prefix.

## How it was tested
npm run mcp:transcript against the real stdio server (no API key); CI.

## Numbers produced
transcript: 1 refusal (score 0.53 < 0.60), 1 approval pause, 1 denial, 1 blocked URL
