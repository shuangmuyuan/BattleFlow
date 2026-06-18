# `src/app/api`

BattleFlow API route handlers.

## Route Groups

| Route | Responsibility |
| --- | --- |
| `agent-runtime` | Reports Claude Code CLI adapter availability and configured defaults. |
| `chat` | Streams product-planning chat responses with Skill, workflow, knowledge, and uploaded-file context. |
| `dashboard/stats` | Provides dashboard overview counts and recent workflow state. |
| `knowledge` | Provides knowledge-base data for the dashboard. |
| `prd` | Reads and writes PRD documents through Supabase. |
| `skills` | Lists, imports, reviews, publishes, rolls back, downloads, and archives Skills. |
| `skills/tune` | Generates workflow Skill tuning drafts through the Claude Code CLI path. |
| `supabase-config` | Exposes browser-safe Supabase URL and anon key. |
| `workflows` | Manages file-backed workspaces and workflows. |
| `workflows/milestones` | Manages workflow milestone records. |
| `workflows/snapshots` | Manages step and workflow snapshots. |

## Patterns

- Keep JSON response helpers local to the route when the route has custom status behavior.
- Return `Cache-Control: no-store` for dynamic runtime data.
- Narrow request bodies before reading fields.
- Keep user-provided content as data. Do not execute imported Skill Markdown or uploaded file content.
- Preserve `runtime = 'nodejs'` for file-system, Supabase server, and child-process routes.

## Validation

Run `pnpm validate` after route changes. Run `pnpm build` when route changes touch server runtime, env behavior, or imports that affect Next build output.

