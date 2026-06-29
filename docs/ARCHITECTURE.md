# Architecture

## Runtime Shape

BattleFlow is a Next.js 16 App Router application with a custom Node HTTP server:

- `src/server.ts` creates the HTTP server, prepares the Next app, and delegates every request to Next.
- `scripts/dev.sh` runs the server through `tsx watch`.
- `scripts/build.sh` runs `next build` and bundles `src/server.ts` into `dist/server.js` with `tsup`.
- `scripts/start.sh` runs the bundled production server.

The repository is an individual application repo, not a monorepo and not an orchestrator hub.

## Major Areas

| Area | Responsibility |
| --- | --- |
| `src/app` | App Router entry points, layouts, dashboard pages, login page, API route handlers, metadata, robots. |
| `src/components/ui` | shadcn/ui primitives and bounded Radix wrappers. |
| `src/components/battleflow` | Product-level UI helpers such as page headers, cards, empty states, and compact Markdown rendering. |
| `src/lib` | File-backed registries, workflow registry, agent adapters, Skill tuning, Supabase config injection, utilities. |
| `src/storage` | Supabase client creation, direct Postgres knowledge-store access, and Drizzle schema definitions. |
| `skills/official` | Seeded product-planning Skills used to initialize the Skill registry. |
| `scripts` | Development, build, production start, and static layout validation. |

## Data and State

BattleFlow currently has two storage styles:

1. File-backed runtime registries:
   - `SKILL_REGISTRY_DIR` defaults to `data/skill-registry`.
   - `WORKFLOW_REGISTRY_DIR` defaults to `data/workflows`.
   - Both directories are gitignored runtime state.
2. Supabase-backed data model and direct Postgres knowledge store:
   - `src/storage/database/shared/schema.ts` defines organizations, members, Skills, workflows, steps, snapshots, milestones, knowledge bases, and PRD documents.
   - `src/storage/database/supabase-client.ts` creates server clients with anon or service-role keys depending on available env.
   - `src/storage/database/postgres-client.ts` creates a server-only Postgres pool from `BATTLEFLOW_DATABASE_URL` for knowledge-store operations when a full Supabase REST/Auth stack is not available.
   - `scripts/database/001_knowledge_store.sql` bootstraps organizations, knowledge bases, knowledge documents, and lexical/trigram search indexes.
   - Browser auth uses injected public Supabase config from `src/lib/supabase-config-inject.tsx` and `src/lib/supabase-browser.ts`.

Agents must preserve the distinction between source files and runtime registry data.

## API Routes

All API handlers use App Router route handlers under `src/app/api`.

- `/api/skills` manages Skill list/detail/download/import/review/rollback/archive.
- `/api/skills/tune` generates workflow Skill tuning drafts through the Claude Code CLI.
- `/api/workflows` manages file-backed workspaces and workflows.
- `/api/workflows/snapshots` manages workflow step snapshots.
- `/api/workflows/milestones` manages milestones.
- `/api/chat` streams product-planning chat responses with knowledge and workflow context.
- `/api/demos/handoffs` creates and reads node-level Demo handoff records after workflow authorization. `POST` requires `workflow.update`, sends the current completed step's durable `step.output` to the external Demo platform, and stores the returned link in `workflow.demoHandoffs`; `GET` requires `workflow.read`.
- `/api/agent-runtime` reports Claude Code CLI adapter availability.
- `/api/supabase-config` exposes browser-safe Supabase config.
- `/api/prd` reads and writes PRD documents through Supabase.
- `/api/knowledge` handles knowledge data for the dashboard. Knowledge document indexing/search uses direct Postgres when `BATTLEFLOW_DATABASE_URL` is configured.

Route handlers that access the file system or spawn CLI processes must keep `runtime = 'nodejs'`.

Skill package imports preserve structured package asset metadata for conventional folders such as `assets/templates/`, `assets/examples/`, `assets/`, `attachments/`, `scripts/`, `templates/`, `template/`, `tools/`, `references/`, `examples/`, and `tasks/`. `SKILL.md` is the source of truth for executable method instructions; legacy registry fields such as methodology, checklist, prompt template, and outputs are derived for compatibility. Small text assets can be included in `/api/chat` as explicitly untrusted, bounded reference context. Binary and oversized assets remain metadata-only, and imported scripts are never executed by the registry or chat runtime.

Skill registry identity has two layers: `skill_id` is the logical Skill identity used for create/update detection, while `id` remains the internal registry record key for backwards compatibility. Team-targeted imports and personal publish submissions create `review_requests` rather than temporary team Skill records. Approval creates a new team Skill when no team record has the same `skill_id`, or updates the existing team Skill with the requested version bump when one already exists. Pending review requests are listed separately from usable Skills.

## Agent Runtime Boundary

The Claude Code CLI adapter lives in `src/lib/agent-adapters/claude-code-cli.ts`.

- It checks CLI availability with `claude --version`.
- It streams JSON events from `claude -p`.
- It defaults to safe mode, no session persistence, no tools, and a configurable budget.
- It uses `CLAUDE_COMMAND`, `CLAUDE_MODEL`, `CLAUDE_MAX_BUDGET_USD`, and `CLAUDE_WORKSPACE_DIR`.

Do not grant CLI tools or broaden permissions without a security review.

## Workflow Validation Loop

Workflow step completion is guarded by a validation loop:

1. The user produces and saves a candidate assistant output for the active step.
2. The dashboard calls `POST /api/workflows/validation` with `start_step_validation` or `retry_step_validation`.
3. The route stores the candidate as `step.candidateOutput`, hashes it, writes a `validation_candidate` step snapshot, creates a validation attempt, and moves the step to `self_checking`.
4. The runtime runs a Skill self-check through the Claude Code CLI adapter in safe mode with no tools and no session persistence, then persists the phase.
5. If the workflow-level Agent validation switch is enabled, the runtime runs an independent Agent validation against the same candidate and acceptance criteria. The switch is off by default while the Agent gate is being refined.
6. When the required phases pass, the route sets `step.status = "completed"` and promotes the candidate into `step.output`. With Agent validation disabled, Skill self-check is the only required phase.
7. Failed or error results from any required phase set `step.status = "validation_failed"`, keep the candidate in candidate fields, leave `step.output` unchanged, and keep downstream steps blocked.

The workflow step status values are:

- `pending`: locked until the active execution group reaches the step;
- `in_progress`: editable and ready for chat output;
- `self_checking`: Skill self-check is running;
- `agent_validating`: independent Agent validation is running;
- `validation_failed`: current candidate did not pass and the user must revise or retry;
- `completed`: candidate passed validation and became durable step output.

Each workflow stores `validationAttempts` with criteria, candidate hash, candidate snapshot ID, self-check result, optional Agent validation result, final attempt status, and timestamps. The dashboard reads these records to show blockers and retry actions.

## Demo Handoff Integration

Completed workflow nodes can be handed off to the external Frieren Demo platform from the workflow execution UI. The integration is intentionally node-scoped:

- `externalWorkflowId` is the BattleFlow workflow step ID.
- `externalProjectKey` is the BattleFlow workflow ID.
- `documents[0]` is the current step's Markdown output from `step.output`.
- `title` is derived from the first Markdown H1 in the output, then the step name, then a workflow/step fallback.

The server-only client lives in `src/lib/integrations/frieren-demo.ts`. It signs the raw JSON body with HMAC-SHA256, calls `POST /api/integrations/workflows/handoff`, handles non-JSON failures safely, and enforces the documented document count and byte-size limits before making the request.

Required server-side environment variables:

- `FRIEREN_DEMO_BASE_URL`
- `FRIEREN_DEMO_HMAC_SECRET`

`studioUrl` values returned as relative paths are resolved against `FRIEREN_DEMO_BASE_URL` before storage so the dashboard can render an openable link without exposing the shared secret. Current internal integration environments may use HTTP, but production deployments should use HTTPS because user Markdown requirements are sent to the external Demo platform.

## UI Architecture

The dashboard has a fixed viewport shell in `src/app/dashboard/layout.tsx`:

- desktop sidebar with collapsible navigation;
- mobile horizontal navigation;
- bounded main scroll regions;
- theme toggle using `useTheme`;
- optional Supabase auth user display.

Pages must own their scroll regions and avoid body-level layout drift. The static validation scripts enforce required class tokens for this.
