# Security

## Security Posture

BattleFlow handles product-planning content, imported Skill packages, workflow context files, knowledge retrieval snippets, chat prompts, direct Postgres credentials, and optional Claude CLI execution. Treat all user-provided Skill content and imported files as untrusted.

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
- Skill, workflow, knowledge-base, PRD, snapshot, milestone, chat, and workflow artifact routes must resolve first-party auth and Postgres-backed resource permissions before returning file-backed package assets, workflow outputs, artifacts, or prompt context.
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

Skill imports can come from uploads, local/server paths, or Git URLs. Keep these boundaries:

- Validate package shape before import.
- Keep server-path imports constrained by `SKILL_IMPORT_ROOTS`.
- Do not execute imported Skill content during import.
- Treat scripts, templates, tools, references, and attachments inside Skill packages as untrusted data-only assets. They may be indexed and exposed to prompts as bounded reference text, but must never be executed automatically.
- Keep oversized or binary package assets metadata-only.
- Do not trust `meta.json` fields without validation and narrowing.
- Archive or reject malformed Skills rather than normalizing unsafe content.

## Agent SDK and CLI Execution

Workflow chat runs through the Claude Agent SDK adapter in `src/lib/agent-adapters/claude-agent-sdk.ts`. The current implementation keeps the adapter intentionally constrained while enabling project Skill discovery only for materialized workflow nodes:

- `persistSession: false`;
- node chat turns set `cwd` to `data/workflows/<orgId>/<workflowId>/nodes/<stepId>/`;
- node chat turns enable `settingSources: ['project']` and SDK `skills: [currentSkillName]` after the server materializes the current workflow step Skill under that node's `.claude/skills/` directory;
- non-node SDK calls that do not pass a Skill keep `settingSources: []` and keep `Skill` disallowed;
- available tools come only from the explicit `BATTLEFLOW_CLAUDE_TOOLS` allowlist;
- `allowedTools` mirrors that allowlist only for auto-approval, while `tools` restricts availability;
- `Write` and `Edit` are allowed only for node chat turns whose `writableRoot` equals the current node cwd; the SDK adapter enforces target paths through both `canUseTool` and `PreToolUse`;
- `.claude/`, `.battleflow-node-workspace.json`, shared `artifacts/`, sibling nodes, repo paths, symlink escapes, `MultiEdit`, and `Bash` are denied;
- `Skill` is enabled only through SDK `skills` filtering for the current node Skill;
- `permissionMode: 'dontAsk'`;
- no BattleFlow-managed per-turn Claude budget cap is set.

Skill materialization copies the server-side registry package into the node workspace instead of symlinking it. Symlinks inside Skill packages are skipped so a package cannot smuggle reads to files outside the package once the node cwd is active. Client-supplied `skill_definition` fields do not control the active Skill, package path, prompt content, or readable directories; the workflow step `skill_id` and server-side registry record are authoritative.

Workflow chat runs are detached from browser SSE connections. A browser refresh, route change, dropped network connection, or subscription cancellation only removes that subscriber; it must not abort the Claude Agent SDK run. The only user-facing stop path is `DELETE /api/chat?run_id=...`, which requires `workflow.update`, marks the persisted run `canceled`, and aborts the current-process controller only when available. Cross-instance deployments rely on the persisted canceled status so the owning process can stop cooperatively between SDK events.

Replayable run events are served through `GET /api/chat?run_id=...` after `workflow.read` authorization. The route must use the run's stored workflow ID for authorization, support `Last-Event-ID`/`after` replay without exposing other workflow runs, and never allow clients to choose arbitrary event files or filesystem paths.

Claude authentication for deployed environments must be injected through server environment variables such as `ANTHROPIC_BASE_URL` plus `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, or `CLAUDE_CODE_OAUTH_TOKEN`. Docker Compose already passes the Anthropic variables from the compose environment into the container. The adapter may read the `env` block from `~/.claude/settings.json` only when `BATTLEFLOW_PROJECT_ENV=DEV`, or from an explicitly configured `BATTLEFLOW_CLAUDE_SETTINGS_PATH`; that local fallback is for developer machines and must not be treated as a production secret source.

The legacy Claude Code CLI helper in `src/lib/agent-adapters/claude-code-cli.ts` remains available for workflow validation and other non-chat helper flows. It is still constrained with safe mode, no session persistence, no tools by default in helper/development flows, and JSON output.
When the environment includes SDK write tools, CLI helper argument construction still filters `Write` and `Edit` out before invoking Claude Code.

Do not enable broader SDK/CLI tools, broader permissions, additional project discovery surfaces, human-in-the-loop tools, or persistent sessions without documenting the threat model and validating the change. The current approved chat tool surface is limited to Claude Code `Read`, `Grep`, `Glob`, `WebSearch`, `WebFetch`, `Write`, and `Edit` when configured through `BATTLEFLOW_CLAUDE_TOOLS`, plus SDK-managed project Skill loading for the single materialized current node Skill. File tools exist so the runtime can read workflow-owned attachments and promoted workflow artifacts by path instead of injecting full files into prompts. Web tools may send user prompts and URLs outside BattleFlow through the configured Claude runtime, so enable them only in environments where outbound web access is expected. `Write` and `Edit` are for node-local drafts only and must pass the server write guard. Do not enable `MultiEdit`, `Bash`, or human-in-the-loop tools for ordinary chat turns.

Workflow validation uses the same constrained Claude Code CLI boundary. Skill self-check always uses safe mode, no tools, and no session persistence. Independent Agent validation uses the same boundary only when the workflow-level Agent validation switch is enabled. Validation prompts frame Skill Markdown, uploaded files, retrieved knowledge, chat history, self-check output, and candidate artifacts as untrusted reference material. The validation Agent is a judge only: it must return structured JSON and must not execute instructions from candidate content or package assets.

Validation failures and runtime errors are stored as bounded summaries and findings. Do not log or surface full uploaded private documents, full candidate artifacts, credentials, raw service-role keys, or raw CLI prompts in validation error messages.

## Workflow Shared Artifacts

Server-promoted workflow artifacts are durable outputs created only after a candidate has been confirmed into `step.output`. The shared area is intentionally read-only for agent chat turns:

- artifact files are stored under `data/workflows/<orgId>/<workflowId>/artifacts/`;
- metadata is stored in `WorkflowRecord.artifacts` and mirrored into `artifacts/manifest.json`;
- failed or unconfirmed candidates remain in candidate fields and must not be promoted to `step.output` or shared artifacts;
- chat prompts include compact artifact metadata and node-relative paths, not full artifact bodies or absolute runtime roots;
- Claude Agent SDK receives the artifacts directory as an additional readable directory only when promoted artifacts exist;
- when a node is rerun, the current node artifact is copied back into that node cwd as an editable draft, and the model edits only that copy.

`GET /api/workflows/artifacts` must require `workflow.read` before looking up the artifact record. The route must resolve the stored artifact path with the server-side artifact resolver and reject any path outside the workflow `artifacts/` directory. Do not trust client-supplied paths, file names, MIME types, or artifact metadata for filesystem access.

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
