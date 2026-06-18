# `src/app/dashboard`

Product workspace UI for BattleFlow.

## Pages

- `layout.tsx` provides the fixed dashboard shell, sidebar, mobile nav, theme toggle, and optional auth menu.
- `page.tsx` shows aggregate counts, quick actions, recent workflows, and recent Skills.
- `skills/page.tsx` manages Skill listing, import, review, version history, rollback, and archive flows.
- `workflows/page.tsx` manages workspaces, workflow creation, step execution, context files, snapshots, and output review.
- `knowledge/page.tsx` manages knowledge-base surfaces.
- `demos/page.tsx` provides demo generation surfaces.

## Layout Rules

- Keep the outer shell fixed to the viewport with internal scroll regions.
- Preserve mobile navigation and horizontal overflow behavior.
- Avoid layout shifts caused by dynamic content.
- When adding overlays, use `src/components/ui` wrappers so viewport-boundary checks remain valid.
- If class-token contracts change intentionally, update `scripts/check-responsive-layout.mjs` in the same change.

## Validation

For UI changes run:

```bash
pnpm validate
```

Run the local app for visual checks when changing workflow layout, overlays, responsive behavior, or dashboard navigation.

