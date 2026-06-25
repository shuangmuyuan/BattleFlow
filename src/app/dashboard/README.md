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

## Workflow Validation UI

The workflow page treats step completion as a validation gate:

- the primary step action is `运行验证`, not direct local completion;
- failed gates keep the user on the same step and show a non-modal blocker summary in the chat area;
- the right `门禁` tab shows current status, criteria, self-check result, Agent validation result, blockers, latest attempt time, candidate download, and retry action;
- only server-returned passed workflows should advance the active step;
- re-editing a completed step clears old output and gate fields so downstream context no longer uses stale output.

## Validation

For UI changes run:

```bash
pnpm validate
```

Run the local app for visual checks when changing workflow layout, overlays, responsive behavior, or dashboard navigation.
