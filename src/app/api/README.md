# `src/app/api`

BattleFlow API route handlers.

## Route Groups

| Route | Responsibility |
| --- | --- |
| `agent-runtime` | Reports Claude Code CLI adapter availability and configured defaults. |
| `chat` | Starts, resumes, stops, and answers HITL prompts for product-planning chat runs with Skill, workflow, knowledge, and uploaded-file context. |
| `dashboard/stats` | Provides dashboard overview counts and recent workflow state. |
| `demos/handoffs` | Creates and reads workflow-node Demo handoff links through the external Frieren Demo integration after workflow authorization. |
| `knowledge` | Provides knowledge-base data for the dashboard. Document indexing/search uses direct Postgres when configured. |
| `prd` | Reads and writes PRD documents through direct Postgres. |
| `skills` | Lists, imports, reviews, publishes, rolls back, downloads, and archives Skills. |
| `skills/tune` | Generates workflow Skill tuning drafts through the Claude Code CLI path. |
| `workflows` | Manages file-backed workspaces and workflows. |
| `workflows/milestones` | Manages workflow milestone records. |
| `workflows/snapshots` | Manages step and workflow snapshots. |

## Demo Handoff Route

`POST /api/demos/handoffs` accepts `{ workflowId, stepId }`, requires organization context plus `workflow.update`, and rejects missing workflows, missing or removed steps, non-completed steps, and empty outputs. It sends only durable `step.output` to the external Demo platform and never uses `candidateOutput`.

Successful responses return `{ handoff, workflow }`. If a step already has a handoff with a `studioUrl`, the route returns the saved record without calling the external service again.

`GET /api/demos/handoffs?workflowId=...&stepId=...` requires `workflow.read` and returns saved handoff records for the workflow or selected step.

The route depends on server-only `FRIEREN_DEMO_BASE_URL` and `FRIEREN_DEMO_HMAC_SECRET`; neither value may be returned to the browser.

## Chat Route

`POST /api/chat` accepts workflow chat messages, requires `workflow.update`, creates a detached `chat_runs` row, starts the Claude Agent SDK in the current server process, and returns an SSE subscription backed by persisted `chat_run_events`.

For node chat, `POST /api/chat` also checks recent same-organization, same-workflow, same-step runs before creating the new run. If a prior non-canceled run has `session_id`, the new run stores `metadata.resume_session_id` and `metadata.resume_source_run_id`, passes that session to the SDK as `resumeSessionId`, and sends only the current user message to the SDK. Without a prior session id, the route keeps the bounded-history fallback for first turns and legacy data. If Claude reports that the stored SDK session no longer exists, the active run records the failed resume handle, clears the resume metadata, and retries the same turn with bounded history.

`GET /api/chat?workflow_id=...` requires `workflow.read` and returns recent run summaries, including `waiting_human` runs with `pending_human_input` so the dashboard can recover pending cards after refresh.

`GET /api/chat?run_id=...` requires `workflow.read` against the stored run workflow and replays persisted SSE events after `Last-Event-ID`, `after`, `after_sequence`, or `afterSequence`.

`DELETE /api/chat?run_id=...` requires `workflow.update`, marks the run canceled, clears pending HITL state, and aborts only if the current process owns the SDK controller.

`POST /api/chat/respond` accepts `{ runId|run_id, promptId|prompt_id, answer|result|response|decision|cancelled }`, loads the run first, requires `workflow.update` on the stored workflow, verifies the pending prompt id, and resolves only an active in-process deferred. Cross-instance deployments may return a conflict if the request reaches a non-owner process; the pending state remains visible in Postgres.

## Patterns

- Keep JSON response helpers local to the route when the route has custom status behavior.
- Return `Cache-Control: no-store` for dynamic runtime data.
- Narrow request bodies before reading fields.
- Keep user-provided content as data. Do not execute imported Skill Markdown or uploaded file content.
- Preserve `runtime = 'nodejs'` for file-system, direct Postgres, and child-process routes.

## Validation

Run `pnpm validate` after route changes. Run `pnpm build` when route changes touch server runtime, env behavior, or imports that affect Next build output.
