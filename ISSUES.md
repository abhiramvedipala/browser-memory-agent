# Issues

Mirror of the GitHub issues so the project reads offline. Status: open / fixed in PR #n / won't fix.

## #1 Demo server with bench state endpoints
- Label: feature | Milestone: Phase 1 | Branch: `phase-1/demo-server` | Status: open
- What and why: Demo server with bench state endpoints.
- Acceptance checks:
  - [ ] Server binds 127.0.0.1 only
  - [ ] GET /__bench/state and /__bench/reset work per session cookie
  - [ ] POST submissions are counted per session
  - [ ] Requests are logged
  - [ ] Unit tests cover routing, cookies and state
