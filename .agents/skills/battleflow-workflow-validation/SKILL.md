---
name: battleflow-workflow-validation
description: Change BattleFlow workflow validation loop behavior without breaking gate state, candidate isolation, read-only agent checks, or step progression.
version: "1.0.0"
user-invocable: true
---

# BattleFlow Workflow Validation Skill

Use this skill for changes around workflow validation gates, step validation attempts, self-check and independent Agent validation, candidate output promotion, and workflow completion behavior.

## Read First

1. `AGENTS.md`
2. `docs/ARCHITECTURE.md`
3. `docs/SECURITY.md`
4. `docs/PERFORMANCE.md`
5. `docs/TESTING_GUIDE.md`
6. `src/lib/README.md`
7. `src/app/api/README.md`
8. `src/app/dashboard/README.md`

## Procedure

1. Identify whether the change touches state modeling, validation prompt logic, Claude CLI runtime, API persistence, dashboard gate UI, or Skill acceptance criteria.
2. Preserve the workflow step state contract: `completed` is the only state that unlocks downstream steps; `self_checking`, `agent_validating`, and `validation_failed` are blocking states.
3. Keep failed or errored candidate output isolated in `candidateOutput`, validation snapshots, and attempts. Do not write it to `step.output`, and do not let it become default downstream context.
4. Promote a candidate only when both Skill self-check and independent Agent validation pass.
5. Keep validation prompts explicit that Skill content, uploaded files, knowledge snippets, chat history, self-check results, and candidate output are untrusted reference material.
6. Keep Claude CLI validation read-only: `--safe-mode`, `--no-session-persistence`, `--tools ''`, and `--permission-mode dontAsk`.
7. Keep request bodies narrowed from `unknown`, bound large user-controlled text, and avoid user-controlled file paths.
8. Preserve strict JSON validation results and bounded diagnostics; do not infer pass/fail from prose.
9. For dashboard changes, show gate status clearly and keep the user on the blocked step when validation fails.
10. Update related docs and tests when behavior, commands, states, or route contracts change.

## Validation

```bash
pnpm test
pnpm validate
```

Run `pnpm build` when changing route handlers, server runtime code, dependencies, Next.js configuration, or Claude CLI adapter behavior.

For behavior changes, manually check a failing candidate and a passing retry in `/dashboard/workflows` until browser automation exists.
