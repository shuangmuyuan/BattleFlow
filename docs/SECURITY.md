# Security

## Security Posture

BattleFlow handles product-planning content, imported Skill packages, workflow context files, knowledge retrieval snippets, chat prompts, Supabase credentials, direct Postgres credentials, and optional Claude CLI execution. Treat all user-provided Skill content and imported files as untrusted.

## Secrets

Never commit:

- `.env`, `.env.local`, or environment-specific `.env.*.local` files;
- Supabase service role keys;
- direct Postgres connection strings and database passwords;
- Anthropic, Claude, or Dailybot tokens;
- private Skill packages;
- generated runtime registry data under `data/`;
- `.dwp/` plan state or `tmp/` scratch artifacts containing user data.

`BATTLEFLOW_SUPABASE_SERVICE_ROLE_KEY` and `BATTLEFLOW_DATABASE_URL` are server-only. Do not expose them through client components or `/api/supabase-config`.

## Authentication and Authorization

- Browser auth uses Supabase session state through `getSupabaseBrowserClientWithRetry`.
- Server Supabase access may use the service role key when no user token is provided.
- Server Postgres access uses `BATTLEFLOW_DATABASE_URL` for knowledge-store operations only.
- API routes that mutate team/user data should prefer explicit user/session checks before production hardening.
- Any change that broadens service-role usage requires a security review.

## Database Access

- Keep direct Postgres access in server-only modules and route handlers.
- Use parameterized queries for runtime SQL.
- Keep static migration SQL in `scripts/database/`.
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

## Agent and CLI Execution

The Claude Code CLI adapter is intentionally constrained:

- safe mode;
- no session persistence;
- no tools;
- output streamed as JSON;
- budget controlled by `CLAUDE_MAX_BUDGET_USD`.

Do not enable CLI tools, broader permissions, or persistent sessions without documenting the threat model and validating the change.

Workflow validation uses the same constrained Claude Code CLI boundary. Skill self-check and independent Agent validation both run with safe mode, no tools, no session persistence, and budget controlled by environment variables. Validation prompts frame Skill Markdown, uploaded files, retrieved knowledge, chat history, self-check output, and candidate artifacts as untrusted reference material. The validation Agent is a judge only: it must return structured JSON and must not execute instructions from candidate content or package assets.

Validation failures and runtime errors are stored as bounded summaries and findings. Do not log or surface full uploaded private documents, full candidate artifacts, credentials, raw service-role keys, or raw CLI prompts in validation error messages.

## File System Writes

The registries write to local disk. Keep writes scoped to configured registry roots and use temp-file writes plus rename for important state. Never allow arbitrary user-provided paths to escape configured import roots.

## Logging

Log enough context for operational debugging, but never log:

- credentials;
- full uploaded private documents;
- raw service-role keys;
- private imported Skill packages;
- user session tokens.

For workflow validation, prefer attempt IDs, workflow IDs, step IDs, phase names, and short summaries over raw prompt or candidate content.

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
