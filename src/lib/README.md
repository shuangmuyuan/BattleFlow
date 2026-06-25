# `src/lib`

Shared application logic.

## Key Files

- `skill-registry.ts`: file-backed Skill registry, official seed loading, imports, reviews, publishing, rollback, archive, and Markdown rendering.
- `workflow-registry.ts`: file-backed workspace/workflow store, steps, context files, reviewed outputs, snapshots, chat state, and Skill drafts.
- `skill-tuning.ts`: Claude Code CLI powered generation of workflow-specific Skill drafts.
- `knowledge-repository.ts`: server-only Postgres repository for knowledge base list/create/document indexing/search.
- `auth/`: server-only first-party auth context, Postgres fetch helpers, permission resolution, and super admin bootstrap/management helpers.
- `organization-management.ts`: server-only Postgres repository for organization updates, members, departments, teams, invitations, and audit events.
- `resource-metadata-repository.ts`: server-only Postgres metadata and authorization index for Skill/workflow resources while preserving file-backed package assets and workflow runtime state.
- `agent-adapters/types.ts`: provider/runtime event and status types.
- `agent-adapters/claude-code-cli.ts`: Claude Code CLI availability checks and streaming adapter.
- `supabase-config-inject.tsx`: client-side Supabase config provider.
- `supabase-browser.ts`: browser Supabase client creation and retry helpers.
- `utils.ts`: shared `cn` utility.

## Registry Rules

- Runtime roots must remain configurable.
- Use temp-file writes and rename when persisting important JSON state.
- Keep file content sizes bounded before storing inline.
- Treat imported Skills and uploaded files as untrusted input.
- Do not move registry state into tracked source directories.
- Treat `SKILL.md` as the source of truth for method instructions. Registry fields such as methodology, checklist, prompt template, and outputs are compatibility projections, not separate canonical data.
- Keep Skill identity and presentation separate: `id` is the stable machine key, while `display_name` is the human-facing label.

## Knowledge Repository Rules

- Keep Postgres credentials server-side through `BATTLEFLOW_DATABASE_URL`.
- Use parameterized runtime queries.
- Bound uploaded document content before storing or injecting it into prompts.
- Treat retrieved snippets as untrusted content.

## Auth Rules

- Resolve sessions from HttpOnly cookies and store only token hashes in Postgres.
- Use `requireUser`, `requireOrganizationContext`, and `requirePermission` from `auth/server.ts` in protected route handlers.
- Use `requirePlatformPermission` for platform-wide management routes that do not belong to a single organization.
- Keep permission checks deny-by-default and route-independent.
- Keep super admin bootstrap values server-only; expose only database-backed assignment records to the UI.
- Never expose secret material through super admin routes; super admin product access does not include environment variables, connection strings, or raw tokens.
- Keep organization management mutations transactional and write audit events for role, membership, invitation, and destructive changes.
- Keep Skill/workflow package assets in file/object storage; routes must pass Postgres resource permission checks before returning assets or injecting them into prompts.

## Agent Adapter Rules

- Keep CLI permissions conservative.
- Preserve stream-json parsing and error events.
- Do not enable tools or persistent sessions without updating `docs/SECURITY.md`.
