---
name: "source-command-design-system"
description: "Create or refresh BattleFlow's docs/DESIGN.md through the DWP design-system addon."
---

# source-command-design-system

Use this skill when the user asks to run the migrated source command `design-system`.

## Command Template

# /design-system

Create or refresh `docs/DESIGN.md`, indexed from `AGENTS.md`, so coding agents generate BattleFlow interface output consistent with this repository's own conventions.

This command is a thin delegator to the DeepWorkPlan design-system addon.

## Steps

1. Read `.agents/skills/deepworkplan/addons/design-system/SKILL.md`.
2. Apply the visual-ui profile from BattleFlow's real design sources:
   - `src/app/globals.css`
   - root `DESIGN.md`
   - `src/components/ui`
   - `src/components/battleflow`
   - `src/hooks/use-theme.ts`
3. Reconcile `docs/DESIGN.md` additively. Preserve root `DESIGN.md` as historical/source design direction unless the user explicitly asks to move or delete it.
4. Ensure `AGENTS.md`, `docs/README.md`, and `.agents/docs/COMMANDS_REFERENCE.md` reference this command/file.
5. Validate that token references resolve and that key text/background pairings meet WCAG AA.

## Notes

- Installed profile: visual-ui.
- CLI-output and conversational profiles require separate explicit acceptance before adding.
- Do not paste a third-party design system. Reason from BattleFlow's implemented tokens and components.
