# `skills/official`

Seeded official BattleFlow product-planning Skills.

## Registry

`registry.json` lists official Skill directories and their import metadata.

## Current Skills

| Skill | Purpose |
| --- | --- |
| `market-insight` | Extract industry trends, market sizing, user-need shifts, opportunities, risks, and assumptions. |
| `competitor-analysis` | Compare competitor positioning, feature matrices, experience differences, and strategic opportunities. |
| `user-needs-breakdown` | Convert planning context into personas, scenarios, user stories, acceptance criteria, priorities, and dependencies. |

Each Skill directory contains:

- `skill.md`: human/agent-readable methodology and instructions;
- `meta.json`: machine-readable metadata and definition;
- `CHANGELOG.md`: version history.

## Rules

- Keep `meta.json` valid JSON.
- Preserve stable Skill IDs unless intentionally migrating registry data.
- Update `CHANGELOG.md` for behavior or output-structure changes.
- Treat official Skills as product source, not runtime registry state.

