# Account, Organization, And Permission Runbook

## Purpose

This runbook explains how to bootstrap, operate, and validate BattleFlow's first-party account, organization, and resource permission system.

## First-Release Scope

Implemented:

- user registration, login, logout, session lookup, and organization onboarding;
- multiple organizations per user;
- organization members, departments, department inheritance, and cross-department teams;
- platform super admin bootstrap and management;
- Postgres-backed resource authorization for Skills, workflows, knowledge bases, PRD documents, snapshots, milestones, and chat prompt context;
- hybrid Skill/workflow storage where business metadata and permission indexes live in Postgres while package/file assets remain in file or object storage.

Not implemented in the first release:

- email verification;
- password reset.

## Required Environment

Set these only on the server:

| Variable | Required | Purpose |
| --- | --- | --- |
| `BATTLEFLOW_DATABASE_URL` | Yes | Direct Postgres connection string for account, organization, authorization, knowledge, PRD, milestone, and resource metadata operations. |
| `BATTLEFLOW_SUPER_ADMIN_EMAILS` | Recommended for bootstrap | Comma-separated emails that bootstrap matching signed-in users as enabled super admins. |
| `BATTLEFLOW_SUPER_ADMIN_USER_IDS` | Optional bootstrap alternative | Comma-separated user IDs that bootstrap matching signed-in users as enabled super admins. |
| `BATTLEFLOW_MIGRATION_ORGANIZATION_ID` | Required for non-official resource migration | Organization that receives backfilled file-backed Skill/workflow resources. |
| `BATTLEFLOW_MIGRATION_USER_ID` | Required for non-official resource migration | User that receives admin owner grants for backfilled file-backed Skill/workflow resources. |
| `SKILL_REGISTRY_DIR` | Optional | File-backed Skill registry root. |
| `WORKFLOW_REGISTRY_DIR` | Optional | File-backed workflow registry root. |

Do not expose these values through client components, API responses, logs, or screenshots.

## Fresh Database Bootstrap

```bash
BATTLEFLOW_DATABASE_URL=postgresql://... pnpm db:postgres:init
```

This applies:

1. `scripts/database/001_knowledge_store.sql`;
2. `scripts/database/002_account_org_permissions.sql`.

Run it before using the first-party auth routes.

## Existing Runtime Resource Backfill

When an environment already has file-backed Skill or workflow data, backfill the Postgres permission index before exposing the environment to users:

```bash
BATTLEFLOW_DATABASE_URL=postgresql://... \
BATTLEFLOW_MIGRATION_ORGANIZATION_ID=org-id \
BATTLEFLOW_MIGRATION_USER_ID=user-id \
pnpm db:resources:migrate
```

The migration:

- loads official Skill seed metadata from `skills/official/`;
- loads runtime Skill metadata and review requests from `data/skill-registry/index.json` or `SKILL_REGISTRY_DIR`;
- loads workflow workspace and workflow metadata from `data/workflows/store.json` or `WORKFLOW_REGISTRY_DIR`;
- writes owner `resource_access_grants` for non-official backfilled resources;
- stores asset manifests and metadata in Postgres;
- does not execute imported scripts;
- does not move large package assets into Postgres.

Without this backfill, non-official historical file-backed resources are intentionally hidden because routes require a Postgres permission row before returning protected assets or prompt context.

## Super Admin Bootstrap

1. Set at least one bootstrap principal:

   ```bash
   BATTLEFLOW_SUPER_ADMIN_EMAILS=owner@example.com pnpm dev
   ```

2. Sign in as that user.
3. Open `/dashboard` or call `/api/auth/me`.
4. Confirm `/dashboard/admin` shows the platform admin tab.
5. Use the platform tab to grant at least one backup super admin.

Bootstrap config values remain server-only. API and UI surfaces show database-backed assignments, not raw environment values.

## Runtime Authorization Rules

- Protected dashboard routes call `/api/auth/me` before rendering workspace content.
- Protected API routes use `requireUser`, `requireOrganizationContext`, `requirePermission`, or `requirePlatformPermission`.
- Skill and workflow package assets are returned or injected into chat only after the Postgres resource permission index allows the action.
- Super admins can administer product content across organizations, but cannot access secret material such as connection strings, environment variables, password hashes, or session token hashes.
- Imported Skill packages, knowledge snippets, uploaded workflow files, and package assets are always untrusted data.

## Operational Checks

Run before deployment:

```bash
pnpm test
pnpm validate
pnpm build
```

Run manual authorization QA from [AUTHORIZATION_QA.md](AUTHORIZATION_QA.md) against a non-production database.

## Incident And Recovery Notes

- If a session token is suspected to be compromised, revoke the row in `user_sessions`.
- If a password hash is suspected to be compromised, disable the user until a password reset flow exists or rotate credentials manually through a controlled administrative path.
- If a super admin was granted incorrectly, revoke it from `/dashboard/admin`; the API prevents revoking the last enabled super admin.
- If file-backed resources disappear after enabling authorization, run `pnpm db:resources:migrate` with the intended migration organization and owner user.
- Treat any committed or logged `BATTLEFLOW_DATABASE_URL`, Supabase service-role key, password hash, or session token hash as a security incident.
