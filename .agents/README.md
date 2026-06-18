# BattleFlow Agent Kit

`.agents/` is the canonical cross-agent home for BattleFlow.

## Layout

| Path | Purpose |
| --- | --- |
| `agents/` | Role personas for recurring review and implementation work. |
| `commands/` | Thin command delegators. Logic stays in skills or agents. |
| `skills/` | Installed and repo-specific skills. |
| `docs/` | Catalogs that describe the kit and command surface. |
| `settings.json` | Shared model-tier and permission metadata. |

`.claude` is a symlink to this directory for Claude-compatible tools. Other agents should read this directory directly.

