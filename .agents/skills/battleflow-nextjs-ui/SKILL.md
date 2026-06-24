---
name: battleflow-nextjs-ui
description: Make BattleFlow dashboard and component UI changes while preserving shadcn, responsive, overlay, and hydration contracts.
version: "1.0.0"
user-invocable: true
---

# BattleFlow Next.js UI Skill

Use this skill for dashboard pages, shared components, styling, responsive layout, theme behavior, overlays, and client/server component boundaries.

## Read First

1. `AGENTS.md`
2. `DESIGN.md`
3. `docs/STANDARDS.md`
4. `docs/PERFORMANCE.md`
5. The closest module README under `src/app/dashboard`, `src/components`, or `src/app`

## Procedure

1. Identify whether the change belongs in a page, `src/components/battleflow`, or `src/components/ui`.
2. Keep generic primitives in `src/components/ui`; put product composition in `src/components/battleflow` or page modules.
3. Use lucide-react icons and existing shadcn/ui components.
4. Preserve explicit scroll and sizing constraints for dashboard layouts.
5. Avoid SSR/client hydration mismatches by moving browser-only values into client state and effects.
6. For workflow chat UI changes, verify streaming, cancellation, persistence status, and durable-output semantics separately; chat presentation must not silently become confirmed step output.
7. If overlay or responsive class contracts intentionally change, update the corresponding validation script.
8. Run validation.

## Validation

```bash
pnpm validate
```

Run the app visually when changing layout, overlays, navigation, or responsive behavior.

For changes that depend on remote runtime data, validate through the documented SSH tunnel and record whether Browser plugin or Playwright fallback was used.
