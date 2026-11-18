# Recording format

A recorded workflow is stored in SQLite (`src/memory/schema.sql`, migrated by `PRAGMA user_version`) and can be exported as JSON with `bma export --name <name>`. Committed golden recordings live in `bench/recordings/<flow>.json` and add one scorer-only field, `groundTruth` (see the end).

## Tables

### `workflows`
| Column | Meaning |
|---|---|
| `id` | Integer primary key. |
| `name` | Workflow name. Saving the same name again creates the next `version`; old versions stay replayable. |
| `task` | The task sentence, with `{{param}}` placeholders. |
| `intent` | One-line purpose (written by the intent-labelling pass; empty until labelled). |
| `start_url_pattern` | Where the workflow starts, as a pattern: port wildcarded, ids as `:id`, query and `/v2`-style alias segments ignored. |
| `params_json` | Default parameter values recorded with the workflow, e.g. `{"query":"rust"}`. |
| `version` | 1, 2, ... per name. `(name, version)` is unique. |
| `created_at` | ISO timestamp. |

### `steps`
| Column | Meaning |
|---|---|
| `workflow_id`, `idx` | Owner and 0-based position; unique together. |
| `action` | `navigate`, `click`, `fill`, `select`, `check`, `press`, `submit` or `wait_for` (checked by SQLite). |
| `intent` | One short phrase describing the step; `fallbackIntent()` builds one when no label exists. |
| `url_pattern` | The page pattern the step expects. A mismatch at replay is logged, not fatal. |
| `value_template` | Text typed, option value chosen, `true`/`false` for checkboxes, key for `press`, URL for `navigate`. May contain `{{param}}`. A typed value equal to a param default is stored as the placeholder. |
| `target_json` | The element description below; `null` for `navigate`. |

### `target_json` (validated by `TargetSchema`)
| Field | Meaning |
|---|---|
| `role` | ARIA role, explicit or implied by the tag (`textbox`, `button`, `link`, `combobox`, `checkbox`, `tab`...). |
| `accessibleName` | The name assistive technology would announce (aria-labelledby, aria-label, label, content, title, placeholder). Same value Playwright's `getByRole` matches. |
| `label` | Text of the associated `<label>`, if any. |
| `placeholder` | Placeholder text. |
| `text` | The element's own visible text (for a `select`, all its option labels, not the selected one). |
| `nearbyText` | Context joined with ` | `: fieldset legend, heading of the enclosing list item or card, form name, nearest preceding heading, sibling labels. |
| `tag`, `inputType` | Tag name and `type` attribute for inputs. |
| `attrs` | Allowlisted attributes only: `name`, `type`, `href` (path and query), `value`, `role`, `aria-selected`, `aria-expanded`, `autocomplete`, `for`. Never `class`, `id`, `data-*`. |
| `cssCandidates` | Up to three selectors, best first: `#id`, `[data-testid="..."]`, a short structural path. |
| `bbox` | Bounding box at record time (layout dependent, informational). |
| `frameUrl` | Page URL at record time. |

### Other tables
- `embeddings(text_hash, model, dims, vector)`: cache of float32 vectors keyed by sha256 of the text and the model name.
- `runs(id, workflow_id, strategy, mutation_level, seed, status, started_at, ended_at, duration_ms)`: one row per replay. `status` is `running`, `success`, `failed`, `pending_approval` or `denied`.
- `run_steps(run_id, idx, strategy_used, candidates_json, chosen_json, score, margin, retries, screenshot_path, error)`: which strategy resolved the step, the top 5 scored candidates, the chosen one, the confidence score and margin over the runner-up, retry count, failure screenshot and error.
- `approvals(id, run_id, step_idx, summary_json, screenshot_path, decision, decided_by, decided_at)`: one row per submission gate. `decision` is `approved`, `denied` or `timeout` (timeout counts as denied); `decided_by` is `cli`, `mcp`, `benchmark-flag` or `timeout`.
- `llm_calls(id, purpose, model, input_tokens, output_tokens, cost_usd, latency_ms, fixture_key, created_at)`: the cost ledger the budget guard reads.

## A real example

Exported from the store by `npx tsx scripts/export-example.ts bookshop-rust-paperback 3` (first three steps; timestamps normalised):

```json
{
  "workflows": {
    "id": 1,
    "name": "bookshop-rust-paperback",
    "task": "Find a {{format}} book about {{query}} under ${{maxPrice}} and add it to the cart",
    "intent": "",
    "start_url_pattern": "http://127.0.0.1:*/bookshop",
    "params_json": "{\"query\":\"rust\",\"format\":\"paperback\",\"maxPrice\":\"40\"}",
    "version": 1,
    "created_at": "2026-11-18T00:00:00.000Z"
  },
  "steps": [
    {
      "id": 1,
      "workflow_id": 1,
      "idx": 0,
      "action": "navigate",
      "intent": "",
      "url_pattern": "http://127.0.0.1:*/bookshop",
      "value_template": "http://127.0.0.1:4173/bookshop/",
      "target_json": null,
      "created_at": "2026-11-18T00:00:00.000Z"
    },
    {
      "id": 2,
      "workflow_id": 1,
      "idx": 1,
      "action": "fill",
      "intent": "",
      "url_pattern": "http://127.0.0.1:*/bookshop",
      "value_template": "{{query}}",
      "target_json": {
        "role": "textbox",
        "accessibleName": "Search books",
        "label": "Search books",
        "placeholder": "Title or author",
        "text": "",
        "nearbyText": "Welcome to the Bookshop | Search books",
        "tag": "input",
        "inputType": "text",
        "attrs": {
          "name": "q",
          "type": "text"
        },
        "cssCandidates": [
          "#f-q",
          "[data-testid=\"q-input\"]",
          "form > div:nth-of-type(1) > div:nth-of-type(1) > input"
        ],
        "bbox": {
          "x": 160,
          "y": 183,
          "width": 187,
          "height": 35
        },
        "frameUrl": "http://127.0.0.1:4173/bookshop/"
      },
      "created_at": "2026-11-18T00:00:00.000Z"
    },
    {
      "id": 3,
      "workflow_id": 1,
      "idx": 2,
      "action": "click",
      "intent": "",
      "url_pattern": "http://127.0.0.1:*/bookshop",
      "value_template": null,
      "target_json": {
        "role": "button",
        "accessibleName": "Search",
        "label": "",
        "placeholder": "",
        "text": "Search",
        "nearbyText": "Welcome to the Bookshop",
        "tag": "button",
        "inputType": "",
        "attrs": {
          "type": "submit"
        },
        "cssCandidates": [
          "[data-testid=\"search-btn\"]",
          "div > form > div:nth-of-type(2) > button"
        ],
        "bbox": {
          "x": 160,
          "y": 288,
          "width": 68,
          "height": 35
        },
        "frameUrl": "http://127.0.0.1:4173/bookshop/"
      },
      "created_at": "2026-11-18T00:00:00.000Z"
    }
  ]
}
```

## Ground truth sidecar (benchmark only)
Files in `bench/recordings/` also carry `groundTruth`: for each step, the hidden id of the element a human used (`null` for `navigate`). It is read only by the scorer to decide whether a resolver picked the right element. It is not stored in SQLite, not part of `target_json`, and a test checks it never appears in the steps.

## Limits
Only elements in the main frame are described (no iframes, no shadow DOM). Recordings contain no passwords or payment fields: the recorder refuses them before the value leaves the page.
