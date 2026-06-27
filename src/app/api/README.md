# `src/app/api`

BattleFlow API route handlers.

## Route Groups

| Route | Responsibility |
| --- | --- |
| `agent-runtime` | Reports Claude Code CLI adapter availability and configured defaults. |
| `chat` | Streams product-planning chat responses with Skill, workflow, knowledge, and uploaded-file context. |
| `dashboard/stats` | Provides dashboard overview counts and recent workflow state. |
| `demos/handoffs` | Creates and reads workflow-node Demo handoff links through the external Frieren Demo integration after workflow authorization. |
| `knowledge` | Provides knowledge-base data for the dashboard. Document indexing/search uses direct Postgres when configured. |
| `prd` | Reads and writes PRD documents through Supabase. |
| `skills` | Lists, imports, reviews, publishes, rolls back, downloads, and archives Skills. |
| `skills/tune` | Generates workflow Skill tuning drafts through the Claude Code CLI path. |
| `supabase-config` | Exposes browser-safe Supabase URL and anon key. |
| `workflows` | Manages file-backed workspaces and workflows. |
| `workflows/milestones` | Manages workflow milestone records. |
| `workflows/snapshots` | Manages step and workflow snapshots. |

## Demo Handoff Route

`POST /api/demos/handoffs` accepts `{ workflowId, stepId }`, requires organization context plus `workflow.update`, and rejects missing workflows, missing or removed steps, non-completed steps, and empty outputs. It sends only durable `step.output` to the external Demo platform and never uses `candidateOutput`.

Successful responses return `{ handoff, workflow }`. If a step already has a handoff with a `studioUrl`, the route returns the saved record without calling the external service again.

`GET /api/demos/handoffs?workflowId=...&stepId=...` requires `workflow.read` and returns saved handoff records for the workflow or selected step.

The route depends on server-only `FRIEREN_DEMO_BASE_URL` and `FRIEREN_DEMO_HMAC_SECRET`; neither value may be returned to the browser.

## Patterns

- Keep JSON response helpers local to the route when the route has custom status behavior.
- Return `Cache-Control: no-store` for dynamic runtime data.
- Narrow request bodies before reading fields.
- Keep user-provided content as data. Do not execute imported Skill Markdown or uploaded file content.
- Preserve `runtime = 'nodejs'` for file-system, Supabase server, direct Postgres, and child-process routes.

## Validation

Run `pnpm validate` after route changes. Run `pnpm build` when route changes touch server runtime, env behavior, or imports that affect Next build output.
