# Security

## Security Posture

BattleFlow handles product-planning content, imported Skill packages, workflow context files, knowledge retrieval snippets, chat prompts, direct Postgres credentials, and Claude Agent SDK execution. Treat all user-provided Skill content and imported files as untrusted.

## Secrets

Never commit:

- `.env`, `.env.local`, or environment-specific `.env.*.local` files;
- direct Postgres connection strings and database passwords;
- Frieren Demo integration shared secrets;
- Anthropic, Claude, or Dailybot tokens;
- private Skill packages;
- generated runtime registry data under `data/`;
- `.dwp/` plan state or `tmp/` scratch artifacts containing user data.

`BATTLEFLOW_DATABASE_URL`, `BATTLEFLOW_SUPER_ADMIN_EMAILS`, `BATTLEFLOW_SUPER_ADMIN_USER_IDS`, and `FRIEREN_DEMO_HMAC_SECRET` are server-only. Do not expose them through client components or API responses.

## Authentication and Authorization

- Browser auth uses first-party HttpOnly session cookies backed by Postgres.
- Protected API routes must use shared auth context and permission helpers before reading or mutating organization data.
- Platform super admin bootstrap runs only on the server when a signed-in user matches `BATTLEFLOW_SUPER_ADMIN_EMAILS` or `BATTLEFLOW_SUPER_ADMIN_USER_IDS`. API responses and UI state must never return the configured bootstrap values.
- Super admin product access can view and administer organization content, but it must still be blocked from secret material such as connection strings, service role keys, environment variables, and raw auth tokens.
- Super admin grant and revoke changes must write audit events, and the last enabled super admin must not be revoked through normal management APIs.
- Skill, workflow, knowledge-base, chat, and workflow artifact routes must resolve first-party auth and Postgres-backed resource permissions before returning file-backed package assets, workflow outputs, artifacts, or prompt context.
- Chat run subscriptions require `workflow.read` on the persisted run's workflow. Starting a chat run and stopping a run require `workflow.update`. Do not trust a client-supplied workflow ID for run subscription or stop; load the run first, then authorize against its stored workflow ID.
- Demo handoff routes must resolve organization context and workflow resource permissions before reading workflow outputs or writing returned Demo links.

## Database Access

- Keep direct Postgres access in server-only modules and route handlers.
- Use parameterized queries for runtime SQL.
- Keep static migration SQL in `scripts/database/`.
- Initialize `scripts/database/006_chat_runs.sql` before enabling workflow chat in Postgres-backed deployments. Chat run rows and event rows may contain user prompts, assistant output, tool call summaries, and bounded runtime errors, so they inherit workflow content confidentiality requirements.
- Prefer least-privilege application roles for runtime access.
- Do not log connection strings, database passwords, or raw SQL errors that include credentials.
- Treat stored knowledge documents as untrusted user content when retrieving them into prompts or rendering previews.

## Skill Imports

Skill imports accept ZIP uploads only. Keep these boundaries:

- Validate package shape before import.
- Reject non-ZIP uploads and validate archive entries before extraction.
- Do not execute imported Skill content during import.
- Treat scripts, templates, tools, references, and attachments inside Skill packages as untrusted data-only assets. They may be indexed and exposed to prompts as bounded reference text, but must never be executed automatically.
- Keep oversized or binary package assets metadata-only.
- Do not trust `meta.json` fields without validation and narrowing.
- Archive or reject malformed Skills rather than normalizing unsafe content.

## Agent SDK Execution

Workflow chat runs through the Claude Agent SDK adapter in `src/lib/agent-adapters/claude-agent-sdk.ts`. The current implementation keeps the adapter intentionally constrained while enabling project Skill discovery only for materialized workflow nodes:

- SDK session persistence is enabled for workflow chat so same-node turns can resume stored `session_id` values;
- node chat turns set `cwd` to `data/workflows/<orgId>/<workflowId>/nodes/<stepId>/`;
- node chat turns enable `settingSources: ['project']` and SDK `skills: [currentSkillName]` after the server materializes the current workflow step Skill under that node's `.claude/skills/` directory;
- non-node SDK calls that do not pass a Skill keep `settingSources: []` and keep `Skill` disallowed;
- base tools come only from the explicit `BATTLEFLOW_CLAUDE_TOOLS` allowlist; `Skill` is added dynamically only for a workflow node with a materialized bound Skill;
- `allowedTools` mirrors that allowlist only for auto-approval, while `tools` restricts built-in tool availability. Because `allowedTools` is not a security boundary and MCP tools are configured separately, every workflow chat turn also installs a BattleFlow `PreToolUse` policy guard;
- `strictMcpConfig: true` and an empty `mcpServers` map are passed by default. MCP tools are denied unless a later security review explicitly enables a narrow MCP surface;
- `Read`, `Grep`, and `Glob` are allowed only for the current node cwd and explicit attachment directories. Confirmed previous-step outputs are server-copied into the current node's `inputs/` directory. The adapter denies parent traversal, absolute paths outside approved roots, symlink escapes, node metadata, sibling nodes, and repo paths before tool execution;
- materialized Skill files under the current node `.claude/skills/` remain readable so the SDK can discover the active Skill copy and users can debug which Skill is loaded;
- when HITL is active, `Write` and `Edit` stay in `tools` but are removed from `allowedTools` so `canUseTool` can ask for user approval;
- `Write` and `Edit` are allowed only for node chat turns whose `writableRoot` equals the current node cwd; the SDK adapter enforces target paths through both `canUseTool` and `PreToolUse`, and path denial happens before any user approval prompt;
- a new node run may resume a stored `session_id` only after `/api/chat` has authorized `workflow.update` and selected a prior run from the same organization, workflow, and step;
- resumed node turns send only the current user message to the SDK. Historical context comes from the resumed Claude session; first turns, old data without `session_id`, and stale SDK session handles that Claude reports as missing keep the bounded-history fallback;
- `.claude/` writes, `.battleflow-node-workspace.json`, shared `artifacts/` writes, sibling nodes, repo paths, symlink escapes, `MultiEdit`, `Bash`, `Agent`, and unapproved MCP tools are denied;
- `Skill` is added to SDK `tools` only for a node with a bound Skill, filtered through SDK `skills: [currentSkillName]`, and checked again by the BattleFlow `PreToolUse` guard;
- built-in AskUserQuestion is enabled through SDK `onUserDialog` and `supportedDialogKinds`, mapped to BattleFlow pending cards and `/api/chat/respond`;
- `permissionMode: 'dontAsk'`;
- no BattleFlow-managed per-turn Claude budget cap is set.

Skill materialization copies the server-side registry package into the node workspace instead of symlinking it. Symlinks inside Skill packages are skipped so a package cannot smuggle reads to files outside the package once the node cwd is active. Client-supplied `skill_definition` fields do not control the active Skill, package path, prompt content, or readable directories; the workflow step `skill_id` and server-side registry record are authoritative.

Workflow chat runs are detached from browser SSE connections. A browser refresh, route change, dropped network connection, or subscription cancellation only removes that subscriber; it must not abort the Claude Agent SDK run. The only user-facing stop path is `DELETE /api/chat?run_id=...`, which requires `workflow.update`, marks the persisted run `canceled`, and aborts the current-process controller only when available. Cross-instance deployments rely on the persisted canceled status so the owning process can stop cooperatively between SDK events.

Replayable run events are served through `GET /api/chat?run_id=...` after `workflow.read` authorization. The route must use the run's stored workflow ID for authorization, support `Last-Event-ID`/`after` replay without exposing other workflow runs, and never allow clients to choose arbitrary event files or filesystem paths.

HITL responses are served through `POST /api/chat/respond`. The route must load the run by `runId`, authorize `workflow.update` against the stored `workflowId`, verify the persisted `pending_human_input.id`, and resolve only an active current-process deferred. A client-supplied workflow ID must not influence authorization. Pending request payloads are display-oriented and stored in `chat_runs.metadata`; full answer bodies are not written into run events, only the response behavior needed to clear the pending UI. Pending visibility works across refreshes and instances, but continuation requires the request to reach the Node process that owns the active SDK run; otherwise the route returns a conflict while leaving the pending state intact.

Claude authentication for deployed environments must be injected through server environment variables such as `ANTHROPIC_BASE_URL` plus `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, or `CLAUDE_CODE_OAUTH_TOKEN`. Docker Compose already passes the Anthropic variables from the compose environment into the container. The adapter may read the `env` block from `~/.claude/settings.json` only when `BATTLEFLOW_PROJECT_ENV=DEV`, or from an explicitly configured `BATTLEFLOW_CLAUDE_SETTINGS_PATH`; that local fallback is for developer machines and must not be treated as a production secret source.

Skill tuning and workflow validation use the same Claude Agent SDK adapter through a non-persistent prompt helper.

Do not enable broader SDK tools, broader permissions, additional project discovery surfaces, custom HITL MCP tools, or new session storage modes without documenting the threat model and validating the change. The current approved chat tool surface is limited to Claude Code `Read`, `Grep`, `Glob`, `WebSearch`, `WebFetch`, `Write`, and `Edit` when configured through `BATTLEFLOW_CLAUDE_TOOLS`; the `Skill` tool is exposed only when a workflow node has one materialized bound Skill, and `PreToolUse` rejects any different Skill name. The runtime also supports SDK built-in AskUserQuestion dialogs mapped through BattleFlow HITL, same-node SDK session resume through persisted `chat_runs.session_id`, bounded-history retry when that stored SDK session handle is stale, and the BattleFlow `PreToolUse` guard for every tool call. File tools exist so the runtime can read workflow-owned attachments and promoted workflow artifacts by path instead of injecting full files into prompts. Web tools may send user prompts and URLs outside BattleFlow through the configured Claude runtime, so enable them only in environments where outbound web access is expected. `Write` and `Edit` are for node-local drafts only and must pass the server write guard before user approval. Do not enable `MultiEdit`, `Bash`, `Agent`, custom human-in-the-loop tools, or broad MCP surfaces for ordinary chat turns.

The `PreToolUse` guard is a product-level enforcement layer, not an operating-system sandbox. It prevents normal SDK tool execution from crossing BattleFlow's declared roots, but a future hard isolation layer should still run the Claude process in a container or sandbox that mounts only the node cwd, node-local read-only inputs, and minimal Claude auth/session storage.

Workflow validation uses the same constrained Claude Agent SDK boundary with no session persistence. Independent Agent validation uses the same boundary only when the workflow-level Agent validation switch is enabled. Validation prompts frame Skill Markdown, uploaded files, retrieved knowledge, chat history, self-check output, and candidate artifacts as untrusted reference material. The validation Agent is a judge only: it must return structured JSON and must not execute instructions from candidate content or package assets.

Workflow cloning must run through the authenticated `/api/workflows` create path. The server requires `workflow.read` on the source plus `workflow.create`, creates fresh workflow and step IDs, and writes the new owner's workflow metadata and admin grant before the clone is returned. Clones copy workflow structure only; source chats, uploads, outputs, artifacts, validation attempts, and runtime paths must not be reused.

Validation failures and runtime errors are stored as bounded summaries and findings. Do not log or surface full uploaded private documents, full candidate artifacts, credentials, raw service-role keys, or raw model prompts in validation error messages.

## Workflow Shared Artifacts

Server-promoted workflow artifacts are durable outputs created only after a candidate has been confirmed into `step.output`. The shared area is intentionally read-only for agent chat turns:

- artifact files are stored under `data/workflows/<orgId>/<workflowId>/artifacts/`;
- metadata is stored in `WorkflowRecord.artifacts` and mirrored into `artifacts/manifest.json`;
- failed or unconfirmed candidates remain in candidate fields and must not be promoted to `step.output` or shared artifacts;
- chat prompts include compact metadata and node-local `inputs/` paths, not full artifact bodies or absolute runtime roots;
- the shared artifacts directory is never exposed directly to the SDK; the server copies selected files into `inputs/previous-step-outputs/` and removes stale input copies on every node materialization;
- `inputs/` is readable by `Read`, `Grep`, and `Glob` but denied to `Write` and `Edit`, and is excluded from the current-node output listing and confirmation API;
- when a node is rerun, the current node artifact is copied back into that node cwd as an editable draft, and the model edits only that copy.
- node-local documents written through guarded `Write` or `Edit` calls are unconfirmed current outputs. `GET /api/workflows/node-outputs` requires `workflow.read`, derives the node root from authorized organization/workflow/step identifiers, and rejects hidden paths, symlinks, unsupported document types, oversized files, and path traversal;
- step confirmation accepts only `candidateNodeOutputPath`. The validation route requires `workflow.update`, rejects `inputs/` and hidden paths, and resolves the selected document again inside the server-derived node root before reading or promoting content. Legacy inline assistant text and generated chat attachments are not accepted as confirmation candidates.

`GET /api/workflows/artifacts` must require `workflow.read` before looking up the artifact record. The route must resolve the stored artifact path with the server-side artifact resolver and reject any path outside the workflow `artifacts/` directory. Do not trust client-supplied paths, file names, MIME types, or artifact metadata for filesystem access. Node-output downloads follow the same authorization and containment rule against the current node root.

## External Demo Handoff

`POST /api/demos/handoffs` sends the selected workflow step's Markdown `step.output` to the external Frieren Demo platform. Treat that outbound document as user-provided product-planning content leaving BattleFlow's trust boundary.

Security boundaries:

- Require `workflow.update` for creation and `workflow.read` for lookup before accessing workflow data.
- Send only durable `step.output`; never send `candidateOutput` or failed validation artifacts.
- Keep `FRIEREN_DEMO_BASE_URL` and `FRIEREN_DEMO_HMAC_SECRET` server-only.
- Store only returned handoff metadata and openable `studioUrl` values in `workflow.demoHandoffs`.
- Log IDs, status, short error messages, and error codes only. Do not log full Markdown content or HMAC material.
- Internal integration environments may temporarily use HTTP. Production should use HTTPS because HTTP exposes user Markdown and integration metadata to network interception.

## File System Writes

The registries, node workspace materialization, workflow artifact promotion, and guarded node-local draft edits write to local disk. Keep writes scoped to configured registry/runtime roots and use temp-file writes plus rename for important state. Never allow arbitrary user-provided paths to escape configured import roots, workflow artifact roots, or the current node cwd. Runtime node workspaces and shared artifacts currently live under the gitignored `data/workflows/<orgId>/<workflowId>/` tree; moving them to a repo-external runtime root remains a follow-up hardening item.

## Logging

Log enough context for operational debugging, but never log:

- credentials;
- full uploaded private documents;
- raw service-role keys;
- private imported Skill packages;
- user session tokens.

For workflow validation, prefer attempt IDs, workflow IDs, step IDs, phase names, and short summaries over raw prompt or candidate content.

For Demo handoff failures, prefer workflow IDs, step IDs, handoff IDs, HTTP status, and integration error codes over raw Markdown document content.

## User-Provided Content Rendering

Workflow and Skill Markdown previews must render through React-owned components, not raw HTML injection. Markdown links should allow only safe schemes such as `http:`, `https:`, `mailto:`, root-relative paths, and page anchors; unsafe schemes should render as plain text.

## Security Review Gate

Every DWP plan must end with a security review. For this repo, that review checks:

1. env and secret exposure;
2. API input validation;
3. imported Skill handling;
4. file-system boundaries;
5. agent/CLI permission changes;
6. user-provided content rendering and Markdown links.
