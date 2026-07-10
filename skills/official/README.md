# `skills/official`

Seeded official BattleFlow product-planning Skills.

## Registry

`registry.json` lists official Skill directories and their import metadata.

## Current Skills

No official seed Skills are currently bundled in this repository.

When official seed Skills are added again, each Skill directory should contain:

- `skill.md`: human/agent-readable methodology and instructions;
- `meta.json`: machine-readable metadata and definition;
- `CHANGELOG.md`: version history.

## Rules

- Keep `meta.json` valid JSON.
- Preserve stable Skill IDs unless intentionally migrating registry data.
- Update `CHANGELOG.md` for behavior or output-structure changes.
- Treat official Skills as product source, not runtime registry state.
