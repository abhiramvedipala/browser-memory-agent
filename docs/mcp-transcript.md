# MCP session transcript

Produced by `npm run mcp:transcript` against `bma mcp --seed-golden` over stdio. Long JSON is trimmed with `...`; run ids and paths vary per run.

## Tools offered

- `list_workflows`: List recorded workflows (latest version of each). Only the local demo apps served by this repo on http://127.0.0.1 are supported; any other URL is rejected. Logins, passwords, payments and CAPTCHAs are never automated, and every form submission waits for approve_submission.
- `get_workflow`: Get one workflow with its steps (action, intent, value template, target role and name).
- `record_workflow`: Open a browser window on a local demo app and record what the person does as a named workflow. The recording is saved when the window is closed. Only the local demo apps served by this repo on http://127.0.0.1 are supported; any other URL is rejected. Logins, passwords, payments and CAPTCHAs are never automated, and every form submission waits for approve_submission.
- `replay_workflow`: Replay a recorded workflow on the local demo apps. Returns a run summary, or pending_approval with the form fields and a screenshot path when a submission needs approve_submission. Only the local demo apps served by this repo on http://127.0.0.1 are supported; any other URL is rejected. Logins, passwords, payments and CAPTCHAs are never automated, and every form submission waits for approve_submission.
- `approve_submission`: Approve or deny the pending form submission of a replay. Denying stops the run before anything is submitted.
- `get_run`: Get the status, per-step strategy, scores, errors, screenshots and approvals of a run.

## List workflows

Call `list_workflows` with `{}`:

```json
{
  "workflows": [
    {
      "name": "recipes-vegan-pasta",
      "version": 1,
      "task": "Find {{q}} recipes, keep only vegan ones and open Vegan Pesto Pasta",
      "steps": 6,
      "params": {
        "q": "pasta"
      }
    },
    {
      "name": "recipes-soup",
      "version": 1,
      "task": "Search {{q}} recipes and open Tomato Basil Soup",
      "steps": 4,
      "params": {
        "q": "soup"
      }
    },
    {
      "name": "recipes-quick-salad",
      "version": 1,
      "task": "Find {{q}} recipes sorted by cooking time and open the quickest",
      "steps": 6,
      "params": {
        "q": "salad",
        "sort": "time"
      }
    },
    {
      "name": "library-spanish-available",
      "version": 1,
      "task": "Find an available {{language}} book about {{keywords}}",
      "steps": 7,
      "params": {
        "keywords": "climate",
        "language": "spanish"
      }
    },
    {
      "name": "library-place-hold",
      "version": 1,
      "task": "Place a hold on a {{keywords}} book for {{name}} at the {{branch}} branch",
      "steps": 10,
      "params": {
        "keywords": "poetry",
        "name": "Alex Demo",
        "email": "alex@example.test",
        "branch": "east"
      }
    },
    {
      "name": "library-author-filter",
      "version": 1,
      "task": "Search the catalog for {{keywords}} by author {{author}} and open the
...
```

## Inspect one workflow

Call `get_workflow` with `{"name":"library-place-hold"}`:

```json
{
  "name": "library-place-hold",
  "version": 1,
  "task": "Place a hold on a {{keywords}} book for {{name}} at the {{branch}} branch",
  "params": {
    "keywords": "poetry",
    "name": "Alex Demo",
    "email": "alex@example.test",
    "branch": "east"
  },
  "steps": [
    {
      "idx": 0,
      "action": "navigate",
      "intent": "",
      "value": "http://127.0.0.1:4173/library/"
    },
    {
      "idx": 1,
      "action": "fill",
      "intent": "",
      "value": "{{keywords}}",
      "role": "textbox",
      "name": "Keywords"
    },
    {
      "idx": 2,
      "action": "click",
      "intent": "",
      "value": null,
      "role": "button",
      "name": "Search catalog"
    },
    {
      "idx": 3,
      "action": "click",
      "intent": "",
      "value": null,
      "role": "link",
      "name": "Poemas selectos"
    },
    {
      "idx": 4,
      "action": "click",
      "intent": "",
      "value": null,
      "role": "link",
      "name": "Place a hold"
    },
    {
      "idx": 5,
      "action": "fill",
      "intent": "",
      "value": "{{name}}",
      "role": "textbox",
      "name": "Full name"
    },
    {
      "idx": 6,
      "action": "fill",
      "intent": "",
      "value": "{{email}}",
      "role": "textbox",
      "name": "Email address"
    },
    {
      "idx": 7,
      "action": "select",
      "intent": "",
      "value": "{{branch}}
...
```

## Replay a search-only flow on a medium-mutated page

Call `replay_workflow` with `{"name":"recipes-vegan-pasta","mutation_level":"medium","seed":100}`:

```json
{
  "status": "failed",
  "run_id": "b7fb4872-5887-45e0-af32-58b36e079f69",
  "strategy": "semantic-minilm",
  "duration_ms": 3746,
  "steps": [
    {
      "idx": 0,
      "strategy": "navigate",
      "score": null,
      "margin": null,
      "retries": 0,
      "error": null,
      "screenshot_path": null
    },
    {
      "idx": 1,
      "strategy": "css",
      "score": null,
      "margin": null,
      "retries": 0,
      "error": null,
      "screenshot_path": null
    },
    {
      "idx": 2,
      "strategy": "role",
      "score": null,
      "margin": null,
      "retries": 0,
      "error": null,
      "screenshot_path": null
    },
    {
      "idx": 3,
      "strategy": "role",
      "score": null,
      "margin": null,
      "retries": 0,
      "error": null,
      "screenshot_path": null
    },
    {
      "idx": 4,
      "strategy": "none",
      "score": 0.5299340046203181,
      "margin": 0.3656109462158744,
      "retries": 2,
      "error": "refused: css: matched div > form > div:nth-of-type(2) > button but the element does not look like the recorded one; role: 0 elements match role+name; semantic: best score 0.530 below 0.6",
      "screenshot_path": "runs/b7fb4872-5887-45e0-af32-58b36e079f69/step-4.png"
    }
  ],
  "approvals": []
}
```

## Replay a flow that submits a form: it pauses for approval

Call `replay_workflow` with `{"name":"library-place-hold"}`:

```json
{
  "status": "pending_approval",
  "run_id": "14c3ebf4-3a31-4f89-97fa-ef8df95761f0",
  "approval_id": 1,
  "step": 9,
  "control": "Place hold",
  "fields": [
    {
      "label": "Full name",
      "value": "Alex Demo"
    },
    {
      "label": "Email address",
      "value": "alex@example.test"
    },
    {
      "label": "Pickup branch",
      "value": "East"
    },
    {
      "label": "Email me when it is ready",
      "value": "checked"
    }
  ],
  "screenshot_path": "runs/14c3ebf4-3a31-4f89-97fa-ef8df95761f0/approval-9.png",
  "next": "call approve_submission with approve true or false"
}
```

## Deny the submission: nothing reaches the server

Call `approve_submission` with `{"approval_id":1,"approve":false}`:

```json
{
  "status": "denied",
  "run_id": "14c3ebf4-3a31-4f89-97fa-ef8df95761f0",
  "strategy": "semantic-minilm",
  "duration_ms": 345,
  "steps": [
    {
      "idx": 0,
      "strategy": "navigate",
      "score": null,
      "margin": null,
      "retries": 0,
      "error": null,
      "screenshot_path": null
    },
    {
      "idx": 1,
      "strategy": "css",
      "score": null,
      "margin": null,
      "retries": 0,
      "error": null,
      "screenshot_path": null
    },
    {
      "idx": 2,
      "strategy": "css",
      "score": null,
      "margin": null,
      "retries": 0,
      "error": null,
      "screenshot_path": null
    },
    {
      "idx": 3,
      "strategy": "css",
      "score": null,
      "margin": null,
      "retries": 0,
      "error": null,
      "screenshot_path": null
    },
    {
      "idx": 4,
      "strategy": "css",
      "score": null,
      "margin": null,
      "retries": 0,
      "error": null,
      "screenshot_path": null
    },
    {
      "idx": 5,
      "strategy": "css",
      "score": null,
      "margin": null,
      "retries": 0,
      "error": null,
      "screenshot_path": null
    },
    {
      "idx": 6,
      "strategy": "css",
      "score": null,
      "margin": null,
      "retries": 0,
      "error": null,
      "screenshot_path": null
    },
    {
      "idx": 7,
      "strategy": "css",
      "score": null,
      "
...
```

## Try a real website: refused

Call `replay_workflow` with `{"name":"recipes-soup","start_url":"https://example.com"}` (error):

```json
Blocked URL https://example.com: scheme https: is not allowed (only http on loopback). This agent only drives the local demo apps on 127.0.0.1.
```

