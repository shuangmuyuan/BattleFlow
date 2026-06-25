# Account, Organization, And Permission System Executive Report

## Executive Summary

BattleFlow now has a first-party account, organization, and permission foundation backed by direct Postgres through `BATTLEFLOW_DATABASE_URL`. The implementation replaces the prior Supabase Auth direction for new account flows, adds multi-organization membership, department and team authorization, platform super admins, resource grants, and route-level authorization for core product resources.

The work also keeps large Skill and workflow package assets in file or object storage while moving business metadata, versions, state indexes, asset manifests, and permission indexes into Postgres.

## Product Impact

- Users can register, log in, log out, create an organization during onboarding, accept invitations, and switch active organizations.
- A user can belong to multiple organizations.
- Organizations can manage members, roles, statuses, departments, cross-department teams, and invitations.
- Department permissions inherit to child departments for all actions.
- Team permissions can span departments.
- Platform super admins can view and manage product content across organizations, but still cannot access secret material.
- Skills, workflows, snapshots, milestones, PRD material, knowledge access, and chat prompt context are protected by organization and resource authorization checks.

## Technical Details

- Added account and permission schema contracts in Drizzle plus `scripts/database/002_account_org_permissions.sql`.
- Added Postgres bootstrap commands and resource metadata migration commands.
- Added first-party auth services for password hashing, session token hashing, secure cookies, safe redirects, registration, login, logout, current-user lookup, onboarding, and invitation acceptance.
- Added route-facing auth helpers: `requireUser`, `requireOrganizationContext`, `requirePermission`, `requirePlatformPermission`, `requireSkillIdAccess`, and `requireWorkflowAccess`.
- Added organization management repository helpers and APIs under `src/app/api/organizations/`.
- Added super admin bootstrap and management under `src/lib/auth/super-admins.ts` and `src/app/api/admin/super-admins/route.ts`.
- Added `/dashboard/admin` for organization administration and platform admin management.
- Added `src/lib/resource-metadata-repository.ts` and migrated Skill, workflow, snapshot, milestone, chat, PRD, knowledge, and Skill tuning routes to enforce Postgres-backed authorization before protected reads or mutations.
- Added regression tests for permission inheritance, multi-org denial, team scope, resource grants, super admin behavior, session/password helpers, audit-event parameterization, and resource authorization.
- Added durable docs and QA guides for design, operations, security, authorization QA, and admin UI QA.
- Added `.agents/skills/battleflow-authz-postgres/SKILL.md` and `/battleflow-authz-change` for future agent work on this subsystem.

## Architecture Decisions

- Direct Postgres is the account and authorization source of truth.
- First-party auth is used for BattleFlow account flows.
- Session, invitation, and credential tokens are hash-only at rest.
- Route handlers deny by default and resolve authorization before protected reads or writes.
- Super admins receive broad product access but no secret access.
- Skill and workflow package assets stay in file or object storage; Postgres stores metadata, indexes, versions, manifests, and grants.
- The first release intentionally excludes email verification, password reset, and invitation email delivery.

## Security Summary

The security review found and fixed blocking dependency issues before completion. Production dependency audit has no moderate, high, or critical findings and only one low-severity advisory remains.

Security properties now include:

- HttpOnly SameSite session cookies, with secure cookies in production.
- Password hashing with Node `scrypt`.
- Session and invitation token hashing.
- Parameterized SQL for runtime Postgres access.
- Audit events for membership, invitation, department, team, platform admin, and destructive permission changes.
- Centralized permission checks for organization, department, team, resource, and platform admin decisions.
- Secret material remains server-side and is not exposed through APIs or UI state.

Residual security follow-ups are tracked for dev/tooling dependency advisories, one low production advisory, and a non-blocking Next NFT trace warning around the Skill tuning route.

## QA Verification Guide

Use these durable guides for manual and environment-backed QA:

- `docs/AUTHORIZATION_QA.md`
- `docs/ADMIN_MANAGEMENT_QA.md`
- `docs/ACCOUNT_ORG_PERMISSION_RUNBOOK.md`

Key manual flows to run against a non-production Postgres database:

- register, log in, log out, and create the first organization;
- accept an invitation and switch active organizations;
- manage organization members, roles, statuses, departments, and cross-department teams;
- verify inherited department permissions and team-scoped access;
- verify unauthorized users receive 401 or 403 before protected content is returned;
- verify Skill, workflow, knowledge, PRD, snapshot, milestone, and chat prompt context authorization;
- verify platform super admin list, grant, revoke, and last-enabled-admin protection.

## Validation Commands Run

- `pnpm test`: passed with 31 auth and authorization tests in the final security-review pass.
- `pnpm validate`: passed after each implementation task and after the final agent-kit update.
- Final Task 14 `pnpm validate`: passed after writing this report.
- `pnpm build`: passed after runtime-impacting tasks; the final runtime build completed on Next `16.2.9` with a non-blocking NFT trace warning recorded in the security report.
- `node --check scripts/migrate-resource-metadata.mjs`: passed.
- `git diff --check`: passed after relevant tasks.
- `NPM_CONFIG_REGISTRY=https://registry.npmjs.org pnpm audit --prod --audit-level moderate`: passed with only one low-severity advisory.
- Full `pnpm audit --audit-level moderate`: no critical findings after fixes; dev/tooling advisories remain.

## Files And Areas Changed

- Auth and permissions: `src/lib/auth/`
- Organization management: `src/lib/organization-management.ts`, `src/app/api/organizations/`
- Super admin management: `src/lib/auth/super-admins.ts`, `src/app/api/admin/super-admins/route.ts`
- Resource metadata and authorization: `src/lib/resource-metadata-repository.ts`, resource-related API routes
- Dashboard and admin UI: `src/app/dashboard/layout.tsx`, `src/app/dashboard/admin/page.tsx`, `src/app/onboarding/page.tsx`, `src/app/login/page.tsx`
- Database and migration scripts: `src/storage/database/shared/schema.ts`, `scripts/database/002_account_org_permissions.sql`, `scripts/migrate-resource-metadata.mjs`
- Documentation: authorization design, runbook, security docs, testing guide, QA guides, module READMEs
- Agent kit: `battleflow-authz-postgres` skill and `/battleflow-authz-change` command

## FAQs

**Does this still use Supabase Auth?**
No. The implemented account flow is first-party and backed by direct Postgres. Existing Supabase client/config code remains only where the broader app still needs it.

**Can a new user create an organization?**
Yes. Registration supports organization creation, and authenticated users without organizations are routed to onboarding.

**Can a user belong to multiple organizations?**
Yes. Active organization context is resolved and can be switched.

**Can teams cross departments?**
Yes. Team membership is scoped to an organization and can include members across departments.

**Do department permissions inherit?**
Yes. Department action scope inherits to child departments.

**Can super admins view all organization content?**
Yes for product content. They still cannot access secrets, database URLs, service-role keys, or raw secret material.

## Residual Risks

- Database-backed successful browser/API happy-path QA was not completed locally because no `BATTLEFLOW_DATABASE_URL` was available in the worktree.
- First release excludes email verification, password reset, and invitation email delivery.
- Dev/tooling dependency advisories remain outside the production audit.
- Production audit still reports one low-severity advisory.
- Next `16.2.9` emits a non-blocking NFT trace warning for the Skill tuning route.

## Recommended Next Steps

1. Run `pnpm db:postgres:init` and `pnpm db:resources:migrate` against a non-production Postgres database.
2. Execute `docs/AUTHORIZATION_QA.md` and `docs/ADMIN_MANAGEMENT_QA.md` end to end with real data.
3. Schedule a dependency/tooling hardening pass for remaining dev advisories and the low production advisory.
4. Review the Next NFT trace warning around `/api/skills/tune`.
5. Decide when to add email verification, password reset, and invitation email delivery.
