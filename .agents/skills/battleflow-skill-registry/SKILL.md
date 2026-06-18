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
4. Preserve official Skill IDs unless deliberately migrating downstream state.
5. Update `skills/official/*/CHANGELOG.md` when changing a seeded official Skill's behavior or output structure.
6. Keep API status codes and JSON response shapes explicit.
7. Run validation.

## Validation

```bash
pnpm validate
```

Run `pnpm build` when changing imports, server-only code, or route-handler runtime behavior.

