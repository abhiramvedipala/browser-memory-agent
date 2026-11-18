# Issues

Mirror of the GitHub issues so the project reads offline. Status: open / fixed in PR #n / won't fix.

## #1 Demo server with bench state endpoints
- Label: feature | Milestone: Phase 1 | Branch: `phase-1/demo-server` | Status: fixed in PR #1
- What and why: Demo server with bench state endpoints.
- Acceptance checks:
  - [x] Server binds 127.0.0.1 only
  - [x] GET /__bench/state and /__bench/reset work per session cookie
  - [x] POST submissions are counted per session
  - [x] Requests are logged
  - [x] Unit tests cover routing, cookies and state
