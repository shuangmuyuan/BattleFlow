# Product Spec

## Product

BattleFlow is a workspace for AI-native product planning. It helps teams turn reusable planning methods into Skills, compose those Skills into workflows, review outputs, and assemble PRD-ready material.

## Audience

- Product managers who need repeatable research, competitor analysis, and requirements breakdown workflows.
- Product teams that want a shared Skill library with official, team, and personal scopes.
- Reviewers who need to approve Skill improvements before they become team assets.
- Builders experimenting with agent-assisted product planning, knowledge retrieval, and workflow output review.

## Core Jobs

1. Maintain a Skill repository with official, team, and personal Skills.
2. Import Skills from uploads, server paths, and Git repositories.
3. Review personal Skill changes before publishing them to the team scope.
4. Compose Skills into workflows that produce structured planning artifacts.
5. Attach context files, reviewed materials, and knowledge sources to workflow steps.
6. Generate durable Markdown outputs that can become PRD sections.
7. Preserve step snapshots and milestones for later review.

## Current Capabilities

- Official seed Skills: market insight, competitor analysis, and user-needs breakdown.
- File-backed Skill registry under `data/skill-registry/` by default.
- File-backed workflow registry under `data/workflows/` by default.
- Dashboard pages for Skills, workflows, knowledge, demos, and workspace overview.
- Chat route that can use Coze SDK LLMs or the Claude Code CLI adapter.
- Supabase configuration injection for browser auth and server-side data access.
- UI validation scripts that enforce overlay and responsive layout contracts.

## Success Criteria

- A user can discover or import a Skill, inspect its methodology, and run it as part of a workflow.
- Workflow outputs are standalone Markdown documents suitable for review and PRD assembly.
- Team-scoped Skill changes have an explicit review path instead of silent mutation.
- The dashboard stays usable on desktop and mobile viewport widths.
- Agents can safely modify the repo by following `AGENTS.md`, this docs hub, and `.agents/`.

## Non-Goals

- BattleFlow is not a generic task manager.
- BattleFlow is not a full document editor.
- BattleFlow is not an unrestricted autonomous agent runtime.
- BattleFlow does not make runtime registries under `data/` part of source control.
- BattleFlow does not currently provide a full automated unit/e2e test suite.

