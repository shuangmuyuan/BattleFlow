# Skills and Agents Catalog

This catalog must match `.agents/skills` and `.agents/agents`.

## Skills

| Skill | Path | Purpose |
| --- | --- | --- |
| DeepWorkPlan | `.agents/skills/deepworkplan/SKILL.md` | Installed DWP router and sub-skills for create, execute, refine, resume, status, verify, onboard, and author. |
| BattleFlow Authz Postgres | `.agents/skills/battleflow-authz-postgres/SKILL.md` | Procedure for first-party auth, organization permissions, public/private resource grants, Postgres metadata, super admins, and protected route changes. |
| BattleFlow Next.js UI | `.agents/skills/battleflow-nextjs-ui/SKILL.md` | Procedure for dashboard, component, responsive, overlay, styling, and hydration-safe UI changes. |
| BattleFlow Skill Registry | `.agents/skills/battleflow-skill-registry/SKILL.md` | Procedure for Skill registry, spec validation, template download, import, review, publishing, rollback, and official seed changes. |
| BattleFlow Workflow Validation | `.agents/skills/battleflow-workflow-validation/SKILL.md` | Procedure for workflow validation gates, candidate isolation, self-check default-on behavior, optional independent Agent checks, and step progression. |

## Agents

| Agent | Path | Tier | Purpose |
| --- | --- | --- | --- |
| frontend-reviewer | `.agents/agents/frontend-reviewer.md` | standard | Reviews UI, App Router, shadcn/ui, responsive, overlay, and hydration changes. |
| product-planning-reviewer | `.agents/agents/product-planning-reviewer.md` | standard | Reviews Skill methodology, workflow outputs, and PRD-oriented planning content. |
| security-reviewer | `.agents/agents/security-reviewer.md` | heavy | Reviews auth, secrets, imports, file-system, and agent/CLI permission changes. |
| docs-maintainer | `.agents/agents/docs-maintainer.md` | light | Keeps docs and agent-kit catalogs synchronized with code changes. |
