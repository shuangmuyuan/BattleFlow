# Performance

## Performance-Sensitive Paths

- Dashboard shell rendering and navigation in `src/app/dashboard/layout.tsx`.
- Skill registry list/detail/import interactions.
- Workflow page state, context files, snapshots, and chat panels.
- Workflow validation gates through `/api/workflows/validation`.
- Chat streaming through `/api/chat`.
- Claude CLI Skill tuning through `/api/skills/tune`.
- File-backed registry read/write paths.
- Supabase config injection and browser client initialization.

## UI Budgets

- Dashboard pages should own internal scrolling and avoid layout shifts.
- Mobile navigation must remain horizontally scrollable without clipping labels.
- Overlay content must remain viewport-bounded.
- Large Markdown outputs should be previewed compactly where possible.
- Avoid nested decorative cards; repeated items may use cards, but section shells should stay simple.

## Bundle and Rendering

- Prefer Server Components unless client state is required.
- Keep `'use client'` boundaries small.
- Avoid importing server-only modules into client components.
- Use lucide icons selectively; do not import entire icon sets.
- Keep generated Markdown rendering lightweight; `CompactMarkdown` is intentionally limited.

## Registry Performance

File-backed registries are simple and inspectable but not meant for high-concurrency workloads.

- Avoid unnecessary full-store rewrites in hot paths.
- Preserve atomic writes for workflow and Skill state.
- Keep uploaded or generated content bounded before storing inline.
- Keep imported Skill package asset text bounded before storing inline; binary and oversized package assets should stay metadata-only.
- Move large binary assets out of JSON registry files if usage grows.
- Workflow validation writes the registry in phases: start attempt/candidate snapshot, self-check result, and final Agent validation result. Avoid adding extra writes inside long-running validation unless the UI consumes them.

## Chat and Agent Runtime

- Stream responses instead of buffering full model output.
- Truncate workflow, knowledge, and file context before prompt construction.
- Keep Skill package assets under a separate prompt budget from uploaded workflow files.
- Keep CLI budget defaults conservative.
- Surface adapter availability through `/api/agent-runtime` without blocking dashboard rendering.
- Validation prompts use bounded candidate, Skill, previous-step, and recent-message context. Keep those budgets conservative because each validation can make two CLI calls plus one repair call when JSON parsing fails.
- `/api/workflows/validation` is currently synchronous from the browser's perspective. Long Claude CLI runs can hold the request open; if usage grows, move validation into a queued/background job with polling rather than increasing prompt size or route timeouts.
