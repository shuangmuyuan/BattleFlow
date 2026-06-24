# Performance

## Performance-Sensitive Paths

- Dashboard shell rendering and navigation in `src/app/dashboard/layout.tsx`.
- Skill registry list/detail/import interactions.
- Workflow page state, context files, snapshots, and chat panels.
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

## Chat and Agent Runtime

- Stream responses instead of buffering full model output.
- Truncate workflow, knowledge, and file context before prompt construction.
- Keep Skill package assets under a separate prompt budget from uploaded workflow files.
- Keep CLI budget defaults conservative.
- Surface adapter availability through `/api/agent-runtime` without blocking dashboard rendering.
