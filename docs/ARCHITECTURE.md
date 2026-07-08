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
| `src/lib` | File-backed registries, workflow registry, agent adapters, Skill tuning, knowledge repositories, and utilities. |
| `src/storage` | Direct Postgres client creation and database access boundaries. |
| `skills/official` | Seeded product-planning Skills used to initialize the Skill registry. |
| `scripts` | Development, build, production start, and static layout validation. |

## Data and State

BattleFlow currently has two storage styles:

1. File-backed runtime registries:
   - `SKILL_REGISTRY_DIR` defaults to `data/skill-registry`.
   - `WORKFLOW_REGISTRY_DIR` defaults to `data/workflows`.
   - Both directories are gitignored runtime state.
2. Direct Postgres data model and resource metadata:
   - `src/storage/database/postgres-client.ts` creates a server-only Postgres pool from `BATTLEFLOW_DATABASE_URL`.
   - `scripts/database/001_knowledge_store.sql` bootstraps organizations, knowledge bases, knowledge documents, and lexical/trigram search indexes.
   - `scripts/database/002_account_org_permissions.sql` bootstraps first-party accounts, sessions, organizations, resource grants, snapshots, milestones, and PRD documents.

Agents must preserve the distinction between source files and runtime registry data.

## API Routes

All API handlers use App Router route handlers under `src/app/api`.

- `/api/skills` manages Skill list/detail/download/import/review/rollback/archive.
- `/api/skills/tune` generates workflow Skill tuning drafts through the Claude Code CLI.
- `/api/workflows` manages file-backed workspaces and workflows.
- `/api/workflows/artifacts` streams server-promoted workflow artifacts after `workflow.read` authorization and artifact path containment checks.
- `/api/workflows/snapshots` manages workflow step snapshots.
- `/api/workflows/milestones` manages milestones.
- `/api/chat` streams product-planning chat responses with knowledge and workflow context.
- `/api/demos/handoffs` creates and reads node-level Demo handoff records after workflow authorization. `POST` requires `workflow.update`, sends the current completed step's durable `step.output` to the external Demo platform, and stores the returned link in `workflow.demoHandoffs`; `GET` requires `workflow.read`.
- `/api/agent-runtime` reports Claude Code CLI adapter availability.
- `/api/prd` reads and writes PRD documents through direct Postgres.
- `/api/knowledge` handles knowledge data for the dashboard. Knowledge document indexing/search uses direct Postgres when `BATTLEFLOW_DATABASE_URL` is configured.

Route handlers that access the file system or spawn CLI processes must keep `runtime = 'nodejs'`.

Skill package imports preserve structured package asset metadata for conventional folders such as `assets/templates/`, `assets/examples/`, `assets/`, `attachments/`, `scripts/`, `templates/`, `template/`, `tools/`, `references/`, `examples/`, and `tasks/`. `SKILL.md` is the source of truth for executable method instructions; legacy registry fields such as methodology, checklist, prompt template, and outputs are derived for compatibility. Small text assets can be included in `/api/chat` as explicitly untrusted, bounded reference context. Binary and oversized assets remain metadata-only, and imported scripts are never executed by the registry or chat runtime.

Skill registry identity has two layers: `skill_id` is the logical Skill identity used for create/update detection, while `id` remains the internal registry record key for backwards compatibility. Team-targeted imports and personal publish submissions create `review_requests` rather than temporary team Skill records. Approval creates a new team Skill when no team record has the same `skill_id`, or updates the existing team Skill with the requested version bump when one already exists. Pending review requests are listed separately from usable Skills.

## Agent Runtime Boundary

Workflow chat uses the Claude Agent SDK adapter in `src/lib/agent-adapters/claude-agent-sdk.ts`.

- It streams SDK messages from `query()` and maps them into BattleFlow `AgentEvent` values.
- It keeps `persistSession: false` in the current implementation, preserving the previous per-turn prompt assembly behavior until detached runs and session resume are introduced.
- It uses `tools` to restrict the available built-in tool set to the explicit `BATTLEFLOW_CLAUDE_TOOLS` allowlist, and mirrors that list in `allowedTools` only for auto-approval.
- Workflow chat turns resolve the active Skill from the workflow step server-side, materialize that Skill under `data/workflows/<orgId>/<workflowId>/nodes/<stepId>/.claude/skills/<skill>/SKILL.md`, set SDK `cwd` to the node directory, enable `settingSources: ['project']`, and pass `skills: [currentSkillName]` so only the current node Skill is enabled.
- When a workflow has promoted artifacts, chat turns add `data/workflows/<orgId>/<workflowId>/artifacts/` as an additional read-only directory and inject only a compact artifact manifest with node-relative paths such as `../../artifacts/manifest.json`.
- The runtime directory currently remains inside the BattleFlow checkout under `data/workflows/`. Moving it to a repo-external runtime root remains a tracked follow-up to reduce parent project discovery, git working-tree noise, and accidental runtime-data commits.
- It explicitly disallows `Write`, `Edit`, `MultiEdit`, and `Bash` for workflow chat turns. Non-node calls that do not pass a Skill continue to disallow `Skill` as well.
- It uses `CLAUDE_COMMAND` only when a custom Claude executable is configured; otherwise the SDK bundled executable is used. It also uses `CLAUDE_MODEL`, `CLAUDE_MAX_BUDGET_USD`, and `CLAUDE_WORKSPACE_DIR`.
- It can enable the approved Claude Code `Read`, `Grep`, `Glob`, `WebSearch`, and `WebFetch` tools when configured through `BATTLEFLOW_CLAUDE_TOOLS`. Unsupported tool names are ignored. Production start through `scripts/start.sh` supplies that approved tool list by default so deployments that run `pnpm start` get workflow attachment reads and web access without a manual environment edit.
- It uses deployment environment variables for Claude authentication. Docker Compose injects Anthropic variables directly into the container; the local `~/.claude/settings.json` fallback is only enabled for `BATTLEFLOW_PROJECT_ENV=DEV`, or when an explicit `BATTLEFLOW_CLAUDE_SETTINGS_PATH` is provided.

The legacy Claude Code CLI adapter in `src/lib/agent-adapters/claude-code-cli.ts` remains available for workflow validation and helper flows such as `runClaudeCodeCliPrompt`. Do not grant SDK/CLI write tools, broaden permissions, or add new project discovery surfaces without a security review.

## Workflow Validation Loop

Workflow step completion is guarded by a validation loop:

1. The user produces and saves a candidate assistant output for the active step.
2. The dashboard calls `POST /api/workflows/validation` with `start_step_validation` or `retry_step_validation`.
3. The route stores the candidate as `step.candidateOutput`, hashes it, writes a `validation_candidate` step snapshot, creates a validation attempt, and moves the step to `self_checking`.
4. The runtime runs a Skill self-check through the Claude Code CLI adapter in safe mode with no tools and no session persistence, then persists the phase.
5. If the workflow-level Agent validation switch is enabled, the runtime runs an independent Agent validation against the same candidate and acceptance criteria. The switch is off by default while the Agent gate is being refined.
6. When the required phases pass, the route sets `step.status = "completed"`, promotes the candidate into `step.output`, and writes a server-promoted workflow artifact plus `artifacts/manifest.json`. With Agent validation disabled, Skill self-check is the only required phase.
7. Failed or error results from any required phase set `step.status = "validation_failed"`, keep the candidate in candidate fields, leave `step.output` unchanged, and keep downstream steps blocked.

The workflow step status values are:

- `pending`: locked until the active execution group reaches the step;
- `in_progress`: editable and ready for chat output;
- `self_checking`: Skill self-check is running;
- `agent_validating`: independent Agent validation is running;
- `validation_failed`: current candidate did not pass and the user must revise or retry;
- `completed`: candidate passed validation and became durable step output.

Each workflow stores `validationAttempts` with criteria, candidate hash, candidate snapshot ID, self-check result, optional Agent validation result, final attempt status, and timestamps. The dashboard reads these records to show blockers and retry actions.

## Workflow Shared Artifacts

Validated workflow outputs are also promoted into a workflow-level shared artifact area:

- files live under `data/workflows/<orgId>/<workflowId>/artifacts/`;
- metadata lives in `WorkflowRecord.artifacts`;
- `artifacts/manifest.json` mirrors compact metadata for agent-readable discovery;
- each artifact records the producing step, title, summary, file name, relative path, MIME type, byte size, checksum, version, and timestamps.

Only server-side validation code calls `promoteWorkflowStepArtifact()`. Client requests cannot directly write shared artifact paths. Re-validating the same step updates that step's artifact in place, keeps the artifact id stable, and increments the version.

Downstream chat turns can read promoted artifacts through Claude Agent SDK file tools because the artifact directory is passed as an additional read-only directory. The prompt lists node-relative paths instead of absolute runtime paths so chat output and tool-call UI do not expose local deployment roots such as `/app` or a developer home directory.

Artifact downloads go through `GET /api/workflows/artifacts?workflow_id=&artifact_id=`. The route requires `workflow.read`, looks up the artifact record from the authorized workflow, resolves the stored relative path inside the workflow's `artifacts/` directory, rejects path escape attempts, and streams the file with download headers.

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
- first-party account and organization display.

Pages must own their scroll regions and avoid body-level layout drift. The static validation scripts enforce required class tokens for this.
