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
   - `scripts/database/002_account_org_permissions.sql` bootstraps first-party accounts, sessions, organizations, and resource grants.
   - `scripts/database/006_chat_runs.sql` bootstraps detached workflow chat runs and replayable run events.

Agents must preserve the distinction between source files and runtime registry data.

### Tracked Storage Convergence TODO

Workflow and Skill business metadata still use transitional dual storage: Postgres is preferred for reads when configured, while `data/workflows/store.json` and `data/skill-registry/index.json` remain fallback or mutation stores in parts of the runtime. Converge this architecture in a dedicated migration phase rather than deleting the file-backed paths as ordinary dead code.

Before switching to Postgres-only reads and writes, add an idempotent server-side migration with a dry-run report, explicit organization and owner mapping, backups, newer-record conflict protection, and reconciliation of IDs, counts, workflow state, steps, Skill versions, and review requests. After production data is verified, remove the JSON metadata fallback and dual-write paths. Continue storing Skill package contents, node workspaces, uploads, and promoted artifacts on the filesystem or a future object store; those files are not metadata fallback.

## API Routes

All API handlers use App Router route handlers under `src/app/api`.

- `/api/skills` manages Skill list/detail/download/import/review/rollback/archive.
- `/api/skills/tune` generates workflow Skill tuning drafts through the Claude Agent SDK.
- `/api/workflows` manages file-backed workspaces and workflows. Workflow cloning is a server-side create operation: it authorizes source read access, creates fresh workflow and step identities, and initializes the clone's owner metadata without copying source runtime content.
- `/api/workflows/artifacts` streams server-promoted workflow artifacts after `workflow.read` authorization and artifact path containment checks.
- `/api/workflows/node-outputs` lists and downloads readable documents written inside the authorized current workflow node. Hidden files, metadata, symlinks, unsupported extensions, oversized files, and path escapes are rejected.
- `/api/chat` starts and resumes product-planning chat runs with knowledge and workflow context. POST creates a detached Postgres `chat_runs` record, starts Claude Agent SDK work in the server process, and returns an SSE subscription to persisted `chat_run_events`. GET with `workflow_id` lists authorized runs, including `waiting_human` pending prompts; GET with `run_id` replays events after `Last-Event-ID` or `after`; DELETE marks a run canceled and aborts only when the current process owns its controller.
- `/api/chat/respond` submits a user answer or tool approval decision for a pending workflow chat run. It loads the run by `runId`, authorizes against the stored workflow with `workflow.update`, and resolves only the in-process deferred request that matches `runId + promptId`.
- `/api/demos/handoffs` creates and reads node-level Demo handoff records after workflow authorization. `POST` requires `workflow.update`, sends the current completed step's durable `step.output` to the external Demo platform, and stores the returned link in `workflow.demoHandoffs`; `GET` requires `workflow.read`.
- `/api/agent-runtime` reports Claude Agent SDK runtime availability and configured tools.
- `/api/knowledge` handles knowledge data for the dashboard. Knowledge document indexing/search uses direct Postgres when `BATTLEFLOW_DATABASE_URL` is configured.

Route handlers that access the file system or spawn CLI processes must keep `runtime = 'nodejs'`.

Skill package imports preserve structured package asset metadata for conventional folders such as `assets/templates/`, `assets/examples/`, `assets/`, `attachments/`, `scripts/`, `templates/`, `template/`, `tools/`, `references/`, `examples/`, and `tasks/`. `SKILL.md` is the source of truth for executable method instructions; legacy registry fields such as methodology, checklist, prompt template, and outputs are derived for compatibility. Small text assets can be included in `/api/chat` as explicitly untrusted, bounded reference context. Binary and oversized assets remain metadata-only, and imported scripts are never executed by the registry or chat runtime.

Skill registry identity has two layers: `skill_id` is the logical Skill identity used for create/update detection, while `id` remains the internal registry record key for backwards compatibility. Team-targeted imports and personal publish submissions create `review_requests` rather than temporary team Skill records. Approval creates a new team Skill when no team record has the same `skill_id`, or updates the existing team Skill with the requested version bump when one already exists. Pending review requests are listed separately from usable Skills.

## Agent Runtime Boundary

Workflow chat uses the Claude Agent SDK adapter in `src/lib/agent-adapters/claude-agent-sdk.ts`.

- It streams SDK messages from `query()` and maps them into BattleFlow `AgentEvent` values.
- Failed tool results remain recoverable tool events. The adapter continues consuming SDK messages so Claude can retry, choose another available tool, or finish without that tool; only a top-level SDK error result, a thrown stream error, explicit cancellation, or abort terminates the turn as failed.
- It keeps Claude Agent SDK session persistence enabled for workflow chat. A previous same-node run is resumed only when its node-context fingerprint still matches the current Skill and materialized previous-step inputs; input changes start a fresh SDK session.
- On resumed node turns, BattleFlow sends only the current user message to the SDK instead of replaying prior user/assistant chat history. First turns, legacy nodes with no stored session id, and stale SDK session handles that Claude reports as missing use the bounded-history fallback.
- It uses `tools` to restrict the base built-in tool set to the explicit `BATTLEFLOW_CLAUDE_TOOLS` allowlist. For a node with a materialized bound Skill, it dynamically adds `Skill` and rejects any `input.skill` that does not match that binding. `allowedTools` remains an auto-approval surface, not an availability boundary. Every tool call also passes a BattleFlow `PreToolUse` policy guard. When a node chat turn has a HITL handler, `Write` and `Edit` remain available through `tools` but are removed from `allowedTools` so SDK `canUseTool` can request approval after server path validation passes.
- Workflow chat turns resolve the active Skill from the workflow step server-side, materialize that Skill under `data/workflows/<orgId>/<workflowId>/nodes/<stepId>/.claude/skills/<skill>/SKILL.md`, set SDK `cwd` to the node directory, enable `settingSources: ['project']`, and pass `skills: [currentSkillName]` so only the current node Skill is enabled.
- Before a node chat turn starts, confirmed outputs from enabled previous steps are copied into `nodes/<stepId>/inputs/previous-step-outputs/`. The Agent receives only node-local paths plus `inputs/manifest.json`, so ordinary `Glob` discovery can find upstream inputs without parent-directory traversal.
- When the current node already has a promoted artifact, chat materialization copies that artifact back into the node cwd as an editable draft. The shared artifact file remains server-controlled.
- Documents created by guarded `Write` or `Edit` calls remain node-local current outputs until the user confirms the step. The dashboard reads this list from `/api/workflows/node-outputs`; it no longer turns the latest assistant prose into a generated Markdown attachment during confirmation.
- The runtime directory currently remains inside the BattleFlow checkout under `data/workflows/`. Moving it to a repo-external runtime root remains a tracked follow-up to reduce parent project discovery, git working-tree noise, and accidental runtime-data commits.
- Node chat turns may use configured file tools only inside approved runtime roots. `Read`, `Grep`, and `Glob` can read the current node cwd, including node-local `inputs/`, plus explicit attachment directories; symlink escapes, parent traversal, sibling nodes, repo paths, and node metadata are denied. Materialized Skill files under the current node `.claude/skills/` remain readable so SDK Skill discovery and debugging can inspect the active Skill copy. `Write` and `Edit` are allowed only for ordinary node output paths; `.claude/`, `inputs/`, node metadata, sibling nodes, repo paths, and symlink escapes are denied before any user approval prompt is shown.
- It registers Claude Agent SDK built-in AskUserQuestion user dialogs through `onUserDialog` and `supportedDialogKinds`. BattleFlow does not add a custom MCP ask-user tool for workflow chat; the built-in dialog is mapped into `human_input_request` / `human_input_result` run events.
- It passes `strictMcpConfig: true` and an empty `mcpServers` map by default. MCP tools, `Bash`, `Agent`, and `MultiEdit` are blocked by both SDK disallow rules and the BattleFlow `PreToolUse` guard unless a future security review explicitly enables a narrower surface.
- It uses `CLAUDE_COMMAND` only when a custom Claude executable is configured; otherwise the SDK bundled executable is used. It also uses `CLAUDE_MODEL` and `CLAUDE_WORKSPACE_DIR`. BattleFlow does not set a per-turn Claude budget cap.
- It can enable the approved Claude Code `Read`, `Grep`, `Glob`, `WebSearch`, `WebFetch`, `Write`, and `Edit` tools when configured through `BATTLEFLOW_CLAUDE_TOOLS`, plus the node-bound `Skill` tool when a workflow step has a materialized Skill. Unsupported tool names, including `MultiEdit` and `Bash`, are ignored. Production start through `scripts/start.sh` supplies the base approved tool list and uses the version-matched Agent SDK bundled runtime by default.
- It uses deployment environment variables for Claude authentication. Docker Compose injects Anthropic variables directly into the container; the local `~/.claude/settings.json` fallback is only enabled for `BATTLEFLOW_PROJECT_ENV=DEV`, or when an explicit `BATTLEFLOW_CLAUDE_SETTINGS_PATH` is provided.

Workflow chat run lifecycle is detached from the browser SSE connection:

- `POST /api/chat` requires `workflow.update`, creates a `chat_runs` row, appends a `chat_run` event, starts the SDK consumer in the server process, and returns a subscription stream.
- Before creating a new run, `POST /api/chat` looks up recent runs for the same organization, workflow, and step. If it finds a non-canceled run with a `session_id`, the new run records `metadata.resume_session_id` and `metadata.resume_source_run_id` and resumes that session.
- If Claude reports that the stored resume session no longer exists, the active run removes the resume metadata, records `metadata.resume_failed_session_id` and `metadata.resume_failed_reason`, publishes a replayable status event, and retries the same user turn with bounded chat history.
- The SDK consumer appends every assistant, tool, HITL, status, usage, terminal, error, and done payload to `chat_run_events` before publishing it to in-process subscribers.
- AskUserQuestion and tool approval requests move the run to `waiting_human`, persist the pending request in `chat_runs.metadata.pending_human_input`, and publish a replayable `human_input_request` event. When `/api/chat/respond` resolves the current-process deferred, the run returns to `running` and a `human_input_result` event clears the pending UI.
- `GET /api/chat?run_id=...` requires `workflow.read`, replays persisted events after `Last-Event-ID`, `after`, `after_sequence`, or `afterSequence`, emits `id: <sequence>` for each event, and then subscribes to new events.
- Browser disconnects only remove the SSE subscriber. They do not cancel the SDK run.
- `DELETE /api/chat?run_id=...` requires `workflow.update`, updates the run status to `canceled`, cancels any in-process pending human input for the run, and aborts the SDK only when the current Node process owns the run controller. In multi-instance deployments, other instances observe the canceled DB status between events and stop cooperatively.
- Pending HITL state is durable enough for refresh and cross-instance read visibility, but the deferred continuation lives in the Node process that owns the active SDK run. If `/api/chat/respond` lands on a different process, the route returns a conflict while keeping the pending prompt visible from Postgres-backed run state.
- Run rows persist the latest `session_id`, but the actual Claude transcript is managed by Claude Code session persistence. Without a shared SDK `sessionStore` or shared Claude session storage, multi-instance deployments should treat `session_id` as a resume handle that is strongest when the same runtime filesystem can see the transcript.
- Successful, failed, and canceled terminal states persist an assistant or error message back to the workflow step chat so a later workflow refresh can recover the final user-visible state.

Skill tuning and workflow validation use the same Claude Agent SDK adapter through a non-persistent prompt helper. Do not grant broader SDK tools, broaden permissions, or add new project discovery surfaces without a security review.

## Workflow Validation Loop

Workflow step completion is guarded by a validation loop:

1. The user produces and saves a candidate assistant output for the active step.
2. The dashboard calls `POST /api/workflows/validation` with `start_step_validation` or `retry_step_validation`.
3. The route stores the candidate as `step.candidateOutput`, hashes it, writes a `validation_candidate` step snapshot, creates a validation attempt, and moves the step to `self_checking`.
4. The runtime runs a Skill self-check through the Claude Agent SDK adapter with no session persistence, then persists the phase.
5. If the workflow-level Agent validation switch is enabled, the runtime runs an independent Agent validation against the same candidate and acceptance criteria. The switch is off by default while the Agent gate is being refined.
6. When the required phases pass, the route sets `step.status = "completed"`, promotes the candidate into `step.output`, and writes a server-promoted workflow artifact plus `artifacts/manifest.json`. With Agent validation disabled, Skill self-check is the only required phase.
7. Failed or error results from any required phase set `step.status = "validation_failed"`, keep the candidate in candidate fields, leave `step.output` unchanged, and keep downstream steps blocked.

The workflow step status values are:

- `pending`: locked until the active execution group reaches the step;
- `in_progress`: editable and ready for chat output;
- `self_checking`: Skill self-check is running;
- `agent_validating`: independent Agent validation is running;
- `validation_failed`: current candidate did not pass and the user must revise or retry;
- `completed`: candidate was accepted by the completion gate and became durable step output.

Each workflow stores `validationAttempts` with criteria, candidate hash, candidate snapshot ID, self-check result, optional Agent validation result, final attempt status, and timestamps. The dashboard reads these records to show blockers and retry actions.

## Workflow Shared Artifacts

Confirmed workflow outputs are also promoted into a workflow-level shared artifact area:

- files live under `data/workflows/<orgId>/<workflowId>/artifacts/`;
- metadata lives in `WorkflowRecord.artifacts`;
- `artifacts/manifest.json` mirrors compact metadata for agent-readable discovery;
- each artifact records the producing step, title, summary, file name, relative path, MIME type, byte size, checksum, version, and timestamps.

Only server-side output confirmation code calls `promoteWorkflowStepArtifact()`. The validation route resolves the selected node-output path inside the authorized node directory, reads the document server-side, and promotes it only after the candidate becomes `step.output`; this phase does not change validation semantics. Client requests cannot directly write shared artifact paths. Confirming the same step and file name again overwrites the shared file, keeps the artifact id stable, and increments the version. Differently named files remain separate artifacts.

Downstream chat turns never read the shared artifact directory directly. The server automatically copies every eligible confirmed artifact into the current node's read-only `inputs/previous-step-outputs/` directory and writes a node-local manifest. Legacy completed steps whose old summary artifact names one unique node document use that real node document as the copied input. The context fingerprint prevents a session created with stale inputs from being resumed.

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
