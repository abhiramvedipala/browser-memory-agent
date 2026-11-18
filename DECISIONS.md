# Decisions

## D1: TypeScript pinned to 6.0.3
Context: typescript 7.0.x is the latest on npm. Options: 7.x, 6.0.x. Choice: 6.0.3. Why: typescript-eslint 8.73 declares `typescript >=4.8.4 <6.1.0`, so 7.x would break linting.

## D2: Node binary
Context: Homebrew's `node@22` on this Mac fails to start (missing libsimdjson.34 after a brew upgrade). Choice: use `/usr/local/bin/node` (v22.16.0, universal arm64 binary). Why: satisfies the Node >= 22 requirement without touching the system install. CI uses Node 22 from actions/setup-node.
