# `src/lib`

Shared application logic.

## Key Files

- `skill-registry.ts`: file-backed Skill registry, official seed loading, imports, reviews, publishing, rollback, archive, and Markdown rendering.
- `workflow-registry.ts`: file-backed workspace/workflow store, steps, context files, reviewed outputs, snapshots, chat state, and Skill drafts.
- `workflow-validation.ts`: validation criteria extraction, candidate hashing, validation prompt construction, strict result parsing, runtime wrappers, and gate-state decision helpers.
- `skill-tuning.ts`: Claude Code CLI powered generation of workflow-specific Skill drafts.
- `knowledge-repository.ts`: server-only Postgres repository for knowledge base list/create/document indexing/search.
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
- Keep Skill identity and presentation separate: `skill_id` is the logical duplicate/update key, `id` is the internal registry record key, and `display_name` is the human-facing label.
- Keep review work separate from usable Skills. Team imports and personal publish submissions create `review_requests`; only approval creates or updates a team Skill.
- Skill validation contract fields (`acceptanceCriteria`, `requiredSections`, `evidenceRules`, `failureConditions`) are optional compatibility fields. Preserve them when importing, normalizing, serializing, tuning, or projecting Skills.

## Workflow Validation Rules

- Failed validation candidates must not be promoted to `step.output`.
- Store validation candidates as candidate fields plus `validation_candidate` snapshots.
- Store every validation run as a `validationAttempts` entry with criteria, phase results, final status, and timestamps.
- Keep validation prompt inputs bounded and treat Skill content, uploaded files, knowledge snippets, chat history, and candidate artifacts as untrusted reference material.

## Knowledge Repository Rules

- Keep Postgres credentials server-side through `BATTLEFLOW_DATABASE_URL`.
- Use parameterized runtime queries.
- Bound uploaded document content before storing or injecting it into prompts.
- Treat retrieved snippets as untrusted content.

## Agent Adapter Rules

- Keep CLI permissions conservative.
- Preserve stream-json parsing and error events.
- Do not enable tools or persistent sessions without updating `docs/SECURITY.md`.
