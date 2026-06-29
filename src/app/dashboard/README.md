# `src/app/dashboard`

Product workspace UI for BattleFlow.

## Pages

- `layout.tsx` provides the fixed protected dashboard shell, sidebar, mobile nav, organization selector, theme toggle, and account menu.
- `page.tsx` shows aggregate counts, quick actions, recent workflows, and recent Skills.
- `skills/page.tsx` manages Skill listing, import, review, version history, rollback, and archive flows.
- `workflows/page.tsx` manages workspaces, workflow creation, step execution, context files, snapshots, and output review.
- `knowledge/page.tsx` manages knowledge-base surfaces.
- `demos/page.tsx` provides demo generation surfaces.
- `admin/page.tsx` manages organization members, departments, cross-department teams, and gated admin readiness surfaces.

## Layout Rules

- Keep the outer shell fixed to the viewport with internal scroll regions.
- Load `/api/auth/me` before rendering protected dashboard content; redirect unauthenticated users to `/login`.
- Redirect authenticated users without organizations to `/onboarding`.
- Preserve mobile navigation and horizontal overflow behavior.
- Avoid layout shifts caused by dynamic content.
- When adding overlays, use `src/components/ui` wrappers so viewport-boundary checks remain valid.
- If class-token contracts change intentionally, update `scripts/check-responsive-layout.mjs` in the same change.

## Workflow Validation UI

The workflow page treats step completion as a validation gate:

- the primary step action is `运行验证`, not direct local completion;
- the workflow-level `Agent 验证` switch is off by default; when off, validation stops after Skill self-check, and when on it also runs the independent Agent gate;
- failed gates keep the user on the same step and show a compact non-modal blocker summary in the chat area;
- the right context panel stays focused on outputs, review materials, and archived material instead of duplicating validation internals;
- only server-returned passed workflows should advance the active step;
- re-editing a completed step clears old output and gate fields so downstream context no longer uses stale output.

## Validation

For UI changes run:

```bash
pnpm validate
```

Run the local app for visual checks when changing workflow layout, overlays, responsive behavior, or dashboard navigation.
