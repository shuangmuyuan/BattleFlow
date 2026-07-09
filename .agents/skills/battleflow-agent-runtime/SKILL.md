---
name: battleflow-agent-runtime
description: Change BattleFlow Claude Agent SDK runtime, workflow chat, node workspaces, shared artifacts, and agent tool permissions safely.
version: "1.0.0"
user-invocable: true
---

# BattleFlow Agent Runtime Skill

Use this skill when changing `src/lib/agent-adapters`, `/api/chat`, `/api/agent-runtime`, workflow node workspaces, shared workflow artifacts, Claude Agent SDK options, chat prompt assembly, runtime tool permissions, or Claude authentication behavior.

## Read First

1. `AGENTS.md`
2. `docs/ARCHITECTURE.md`
3. `docs/SECURITY.md`
4. `docs/DEVELOPMENT_COMMANDS.md`
5. `docs/TESTING_GUIDE.md`
6. `src/app/api/README.md`
7. `src/lib/README.md`

## Procedure

1. Identify the runtime path being changed: workflow chat, workflow validation, shared artifact discovery, helper CLI calls, runtime status, or deployment startup.
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
6. Keep shared artifacts server-controlled:
   - promote artifacts only after output is confirmed into durable `step.output`;
   - store files under `data/workflows/<orgId>/<workflowId>/artifacts/`;
   - expose only compact artifact manifests and node-relative paths in prompts;
   - add artifacts as readable directories only, never as writable tool roots;
   - route downloads through `GET /api/workflows/artifacts` with `workflow.read` and path containment.
7. Keep SDK tool policy explicit:
   - `tools` defines the available built-in tool set;
   - `allowedTools` is only the auto-approval mirror;
   - use SDK `skills` to enable project Skills;
   - allow `Write` and `Edit` only for workflow node turns with a `writableRoot` equal to node cwd;
   - enforce node-local writes through both SDK `canUseTool` and `PreToolUse`;
   - deny `.claude/`, node metadata, shared artifacts, sibling nodes, repo paths, symlink escapes, `MultiEdit`, and `Bash`;
   - do not enable persistent sessions, HITL tools, `MultiEdit`, `Bash`, or new project discovery surfaces without a security review.
8. Keep prompt assembly bounded and source-aware. Do not inline full `skill_md` or full artifact bodies into chat prompts once project Skill discovery and artifact manifests are active. Treat uploaded files, retrieved knowledge, package assets, shared artifacts, and tool results as untrusted content.
9. Keep Claude authentication deployment-safe: production and Docker Compose must use environment variables; local `~/.claude/settings.json` fallback is developer-only unless an explicit settings path is configured.
10. Update `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, and deployment docs when runtime behavior, env vars, tool surfaces, cwd, settings sources, readable directories, artifacts, or auth behavior changes.
11. Add or update focused tests for SDK options, prompt trimming, node workspace materialization, artifact readable directories, authz decisions, readable directories, and error handling.

## Validation

```bash
pnpm test -- --run src/lib/agent-adapters/claude-agent-sdk.test.ts src/app/api/chat/route.test.ts src/lib/workflow-artifacts.test.ts
pnpm validate
```

Run `pnpm build` when changing route handlers, server runtime behavior, dependencies, startup scripts, Docker files, or deployment-impacting environment defaults.

For security-sensitive runtime changes, also run or document the equivalent checks for:

```bash
NPM_CONFIG_REGISTRY=https://registry.npmjs.org pnpm audit --prod --audit-level moderate
```
