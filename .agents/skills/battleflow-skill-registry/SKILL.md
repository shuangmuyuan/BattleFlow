---
name: battleflow-skill-registry
description: Change BattleFlow Skill registry behavior without breaking imports, review workflow, official seeds, or runtime data boundaries.
version: "1.0.0"
user-invocable: true
---

# BattleFlow Skill Registry Skill

Use this skill for work around `src/lib/skill-registry.ts`, `/api/skills`, official seed Skills, Skill import, review, publishing, rollback, archive, and Skill Markdown rendering.

## Read First

1. `AGENTS.md`
2. `docs/ARCHITECTURE.md`
3. `docs/SECURITY.md`
4. `src/lib/README.md`
5. `skills/official/README.md`

## Procedure

1. Map the requested behavior to the Skill lifecycle: seed, import, review, publish, rollback, archive, or render.
2. Keep file-backed runtime data under `SKILL_REGISTRY_DIR`; do not commit runtime registry output.
3. Treat uploaded, path-imported, and Git-imported Skill content as untrusted data.
4. When changing package asset loading, keep scripts/templates/tools/references data-only: discover only regular files under intended package folders, bound text content, keep binary/oversized files metadata-only, and never execute imported scripts automatically.
5. When exposing package assets to chat runtime, frame them as untrusted reference material and keep their prompt budget separate from uploaded workflow files.
6. Preserve official Skill IDs unless deliberately migrating downstream state.
7. Update `skills/official/*/CHANGELOG.md` when changing a seeded official Skill's behavior or output structure.
8. Keep API status codes and JSON response shapes explicit.
9. Run validation.

## Validation

```bash
pnpm validate
```

Run `pnpm build` when changing imports, server-only code, or route-handler runtime behavior.

For package asset behavior, also run a temporary fixture import that includes at least one script, one template, one text attachment, and one binary attachment.
