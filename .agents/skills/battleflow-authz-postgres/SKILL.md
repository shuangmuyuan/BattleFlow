---
name: battleflow-authz-postgres
description: Change BattleFlow first-party auth, organization permissions, Postgres authorization metadata, and protected resource routes safely.
version: "1.0.0"
user-invocable: true
---

# BattleFlow Authz Postgres Skill

Use this skill when changing first-party accounts, sessions, organizations, departments, teams, invitations, platform super admins, resource grants, resource metadata, or API route authorization.

## Read First

1. `AGENTS.md`
2. `docs/AUTHORIZATION_DESIGN.md`
3. `docs/ACCOUNT_ORG_PERMISSION_RUNBOOK.md`
4. `docs/SECURITY.md`
5. `docs/TESTING_GUIDE.md`
6. The closest module README under `src/app/api`, `src/lib`, `src/storage`, or `scripts`

## Procedure

1. Identify the boundary being changed: account/session, organization management, department/team scope, platform admin, resource grant, resource metadata, or route guard.
2. Keep direct Postgres access server-only and use parameterized SQL for runtime values.
3. Resolve auth before protected reads or writes:
   - use `requireUser` for user-level routes;
   - use `requireOrganizationContext` for organization-scoped routes;
   - use `requirePermission` for organization, department, team, and grant decisions;
   - use `requirePlatformPermission` for platform super admin routes;
   - use `requireSkillIdAccess` or `requireWorkflowAccess` before returning file-backed assets, workflow outputs, snapshots, milestones, PRD documents, knowledge chunks, or chat prompt context.
4. Preserve deny-by-default behavior and active-organization boundaries. Super admins may access product data, but never secret material.
5. Store only password hashes, session token hashes, and invitation token hashes. Do not log or return plaintext auth tokens.
6. Write audit events for membership, invitation, department, team, platform admin, and destructive authorization changes.
7. Keep Skill/workflow package assets in file/object storage. Postgres stores business metadata, version/state indexes, asset manifests, and grants.
8. For historical file-backed Skill/workflow data, update `scripts/migrate-resource-metadata.mjs` and docs instead of silently granting access during reads.
9. Update docs when env vars, bootstrap steps, migration behavior, authorization semantics, or first-release exclusions change.
10. Add or update focused tests for changed permission decisions or auth/session helpers.

## Validation

```bash
pnpm test
pnpm validate
```

Run `pnpm build` when route handlers, server runtime behavior, dependencies, migrations, or database scripts change.

For security-sensitive changes, also run:

```bash
NPM_CONFIG_REGISTRY=https://registry.npmjs.org pnpm audit --prod --audit-level moderate
```

Record any database-backed manual QA that could not run locally because `BATTLEFLOW_DATABASE_URL` is unavailable.
