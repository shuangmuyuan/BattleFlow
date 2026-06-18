# `src/lib`

Shared application logic.

## Key Files

- `skill-registry.ts`: file-backed Skill registry, official seed loading, imports, reviews, publishing, rollback, archive, and Markdown rendering.
- `workflow-registry.ts`: file-backed workspace/workflow store, steps, context files, reviewed outputs, snapshots, chat state, and Skill drafts.
- `skill-tuning.ts`: Claude Code CLI powered generation of workflow-specific Skill drafts.
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

## Agent Adapter Rules

- Keep CLI permissions conservative.
- Preserve stream-json parsing and error events.
- Do not enable tools or persistent sessions without updating `docs/SECURITY.md`.

