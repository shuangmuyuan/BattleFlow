# `src/app/api`

BattleFlow API route handlers.

## Route Groups

| Route | Responsibility |
| --- | --- |
| `admin/super-admins` | Lists, grants, and revokes platform super admins through server-only Postgres access and platform permissions. |
| `agent-runtime` | Reports Claude Code CLI adapter availability and configured defaults. |
| `auth/*` | First-party registration, login, logout, current user, onboarding, and invitation acceptance. |
| `chat` | Streams product-planning chat responses with authorized Skill, workflow, knowledge, and uploaded-file context. |
| `dashboard/stats` | Provides dashboard overview counts and recent workflow state. |
| `knowledge` | Provides knowledge-base data for the dashboard. Document indexing/search uses direct Postgres when configured. |
| `organizations` | Lists and updates active organizations; manages organization members, departments, teams, team/department assignments, and invitations through Postgres-backed permissions. |
| `prd` | Reads and writes PRD documents through direct Postgres after workflow authorization. |
| `skills` | Lists, imports, reviews, publishes, rolls back, downloads, and archives Skills through Postgres-backed resource permission filtering. |
| `skills/tune` | Generates workflow Skill tuning drafts through the Claude Code CLI path. |
| `supabase-config` | Exposes browser-safe Supabase URL and anon key. |
| `workflows` | Manages file-backed workspaces and workflows with Postgres-backed metadata and resource permission filtering. |
| `workflows/milestones` | Manages workflow milestone records through direct Postgres after workflow authorization. |
| `workflows/snapshots` | Manages step and workflow snapshots after workflow authorization. |
| `workflows/validation` | Runs workflow step self-check and independent Agent validation gates. |

## Workflow Validation Route

`POST /api/workflows/validation` supports:

- `start_step_validation`: stores a candidate artifact, runs Skill self-check, then runs independent Agent validation.
- `retry_step_validation`: reruns the same gate flow for a revised candidate after failure.
- `clear_failed_validation`: clears candidate/gate fields on the current step without deleting historical attempts.

`GET /api/workflows/validation?workflow_id=...&step_id=...` returns validation attempts for a workflow or step.

Only a passed final attempt promotes candidate output to `step.output`. Failed or error attempts keep the candidate in candidate fields and leave downstream steps blocked.

## Patterns

- Keep JSON response helpers local to the route when the route has custom status behavior.
- Return `Cache-Control: no-store` for dynamic runtime data.
- Narrow request bodies before reading fields.
- Use `requireOrganizationContext` and `requirePermission` before reading organization-scoped data or mutating organization state.
- Use `requireUser` and `requirePlatformPermission` before reading or mutating platform-wide state such as super admin assignments.
- Use Postgres-backed resource metadata checks before returning Skill package assets, workflow outputs, snapshots, milestones, PRD content, knowledge chunks, or chat prompt context.
- Keep user-provided content as data. Do not execute imported Skill Markdown or uploaded file content.
- Preserve `runtime = 'nodejs'` for file-system, Supabase server, direct Postgres, and child-process routes.

## Validation

Run `pnpm validate` after route changes. Run `pnpm build` when route changes touch server runtime, env behavior, or imports that affect Next build output.
