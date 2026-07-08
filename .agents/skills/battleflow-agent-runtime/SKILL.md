---
name: battleflow-agent-runtime
description: Change BattleFlow Claude Agent SDK runtime, workflow chat, node workspaces, and agent tool permissions safely.
version: "1.0.0"
user-invocable: true
---

# BattleFlow Agent Runtime Skill

Use this skill when changing `src/lib/agent-adapters`, `/api/chat`, `/api/agent-runtime`, workflow node workspaces, Claude Agent SDK options, chat prompt assembly, runtime tool permissions, or Claude authentication behavior.

## Read First

1. `AGENTS.md`
2. `docs/ARCHITECTURE.md`
3. `docs/SECURITY.md`
4. `docs/DEVELOPMENT_COMMANDS.md`
5. `docs/TESTING_GUIDE.md`
6. `src/app/api/README.md`
7. `src/lib/README.md`

## Procedure

1. Identify the runtime path being changed: workflow chat, workflow validation, helper CLI calls, runtime status, or deployment startup.
2. Preserve the provider boundary: workflow chat uses the Claude Agent SDK adapter; workflow validation and helper flows may still use the constrained Claude Code CLI helper.
3. Resolve authorization before assembling prompt context or materializing runtime files:
   - use `requireOrganizationContext`;
   - use `requireWorkflowAccess` for workflow reads/updates;
   - use `requireSkillIdAccess` for the workflow step Skill.
4. Treat the workflow step as the authoritative active Skill source. Do not trust client-supplied `skill_definition`, package paths, prompt templates, or package assets for active runtime behavior.
5. Keep node workspace materialization inside the configured runtime root:
   - materialize copies, not symlinks;
   - skip package symlinks;
   - enforce realpath containment under `SKILL_REGISTRY_DIR/packages` or `skills/official`;
   - keep `data/workflows/` runtime data gitignored.
6. Keep SDK tool policy explicit:
   - `tools` defines the available built-in tool set;
   - `allowedTools` is only the auto-approval mirror;
   - use SDK `skills` to enable project Skills;
   - do not enable `Write`, `Edit`, `MultiEdit`, `Bash`, persistent sessions, HITL tools, or new project discovery surfaces without a security review.
7. Keep prompt assembly bounded and source-aware. Do not inline full `skill_md` into chat prompts once project Skill discovery is active. Treat uploaded files, retrieved knowledge, package assets, and tool results as untrusted content.
8. Keep Claude authentication deployment-safe: production and Docker Compose must use environment variables; local `~/.claude/settings.json` fallback is developer-only unless an explicit settings path is configured.
9. Update `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, and deployment docs when runtime behavior, env vars, tool surfaces, cwd, settings sources, or auth behavior changes.
10. Add or update focused tests for SDK options, prompt trimming, node workspace materialization, authz decisions, readable directories, and error handling.

## Validation

```bash
pnpm test -- --run src/lib/agent-adapters/claude-agent-sdk.test.ts src/app/api/chat/route.test.ts
pnpm validate
```

Run `pnpm build` when changing route handlers, server runtime behavior, dependencies, startup scripts, Docker files, or deployment-impacting environment defaults.

For security-sensitive runtime changes, also run or document the equivalent checks for:

```bash
NPM_CONFIG_REGISTRY=https://registry.npmjs.org pnpm audit --prod --audit-level moderate
```

