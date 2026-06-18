# Standards

## Language and Naming

- New code, comments, documentation, agent files, and commits must be English.
- Existing Chinese UI copy and official Skill content may remain until a deliberate localization pass.
- Use descriptive TypeScript names. Prefer domain terms already present in the codebase: Skill, workflow, workspace, step, snapshot, milestone, knowledge base, PRD.

## TypeScript

- Treat `strict` as required even when TypeScript allows a shortcut.
- Do not introduce implicit `any` or `as any`.
- Type route request bodies with local narrowing helpers before use.
- Keep `unknown` at the boundary and narrow it before reading fields.
- Remove unused imports and variables before finishing.
- Prefer existing local helper patterns over new abstractions.

## Next.js and React

- App Router is the only router in use.
- Server Components are the default. Add `'use client'` only for state, effects, browser APIs, event handlers, or client hooks.
- Do not render browser-only or time-varying values directly during SSR.
- Use route handlers for API surfaces; set `runtime = 'nodejs'` when using Node APIs.
- Do not use a raw `<head>` tag. Use metadata APIs and documented resource-loading patterns.

## UI and Styling

- Use shadcn/ui components from `src/components/ui`.
- Use `lucide-react` icons for action affordances.
- Keep product-level UI helpers in `src/components/battleflow`.
- Preserve the dark, focused BattleFlow interface direction in root `DESIGN.md`.
- Do not import raw Radix overlay primitives from business code. Use the bounded wrapper components.
- Keep scroll regions explicit with `min-h-0`, `min-w-0`, and `overflow-*` where needed.

## Route Handlers

- Keep JSON response helpers local and explicit.
- Use `Cache-Control: no-store` for dynamic runtime data responses.
- Return 400 for invalid user input, 404 for missing records, and 500 for unexpected failures.
- Log server errors with enough context for debugging, but never log secrets.

## Registries and File System

- File-backed registries must write through temp files and atomic rename where practical.
- Runtime registry roots must remain configurable through env vars.
- Never commit `data/skill-registry/` or `data/workflows/`.
- Skill import paths must stay constrained by configured roots.

## Commits

Use Conventional Commits:

```text
feat(workflows): add step snapshot review
fix(skills): reject invalid import package
docs(agents): document dwp workflow
```

