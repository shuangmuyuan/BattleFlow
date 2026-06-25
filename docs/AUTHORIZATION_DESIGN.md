# Authorization Design

## Purpose

BattleFlow needs first-party account management, organization administration, and resource authorization for product-planning teams. This document is the implementation source of truth for the account, organization, department, team, super admin, resource grant, and audit model.

The first release uses direct Postgres through `BATTLEFLOW_DATABASE_URL`. It does not use Supabase Auth as the new account-system core.

## Confirmed Product Decisions

- Users can register on the platform and create a new organization.
- Users can belong to multiple organizations.
- Teams can include members across departments.
- Department permissions inherit to child departments for all actions.
- Skills, workflows, knowledge bases, PRD documents, and future organization resources must support department and team authorization.
- Super admins have maximum product permissions and can view all organization content.
- Super admins must never be able to read database connection strings, service-role keys, environment variables, or other secret values through product UI or API responses.
- The first release does not include email verification or password reset.

## Storage Direction

BattleFlow already has a direct Postgres path for knowledge data:

- `src/storage/database/postgres-client.ts` creates a server-only `pg.Pool` from `BATTLEFLOW_DATABASE_URL`.
- `scripts/database/001_knowledge_store.sql` bootstraps organizations, knowledge bases, knowledge documents, and search indexes.
- `src/lib/knowledge-repository.ts` uses parameterized SQL.

The account and authorization system should extend this direction.

Postgres should store:

- users, password credentials, sessions, and audit events;
- organizations, organization memberships, departments, teams, and their memberships;
- platform admins;
- resource authorization grants;
- Skill and workflow business facts that need tenant isolation, workflow state, review state, versioning, listing, search, audit, and permission checks.

File or object storage should store:

- imported Skill package archives;
- extracted package assets;
- templates, examples, attachments, binary assets, and large original files.

Postgres should store asset manifests, URI/path values, checksums, metadata, and permission indexes. Product routes must use those Postgres records before exposing any file/object asset.

## Account Model

### Users

`users` is the first-party user table.

Recommended fields:

- `id`
- `email`
- `display_name`
- `avatar_url`
- `status`: `active` or `disabled`
- `created_at`
- `updated_at`

User status is enforced server-side. Disabled users cannot use dashboard APIs even if they still have an unexpired session cookie.

### Password Credentials

`user_password_credentials` stores password-auth material.

Recommended fields:

- `user_id`
- `password_hash`
- `password_updated_at`
- `failed_attempt_count`
- `locked_until`
- `created_at`
- `updated_at`

Passwords must be hashed with a mature password hashing algorithm such as argon2id or bcrypt. Password hashes are never logged or returned.

### Sessions

`user_sessions` stores first-party sessions.

Recommended fields:

- `id`
- `user_id`
- `session_token_hash`
- `expires_at`
- `revoked_at`
- `created_at`
- `last_seen_at`
- optional `ip_hash`
- optional `user_agent_hash`

Session tokens are only stored as hashes. The browser receives the session through HttpOnly, Secure, SameSite cookies. Client-side JavaScript does not persist plaintext session tokens.

The first release supports registration, login, logout, and organization onboarding. It does not support email verification or password reset.

## Organization Model

`organizations` is the tenant boundary.

Recommended additional fields beyond the existing base table:

- `created_by`
- `status`
- optional `settings`

`organization_members` connects users to organizations.

Recommended fields:

- `organization_id`
- `user_id`
- `role`
- `status`
- `joined_at`
- `updated_at`

Recommended organization roles:

- `org_owner`: owns the organization and can manage settings, members, departments, teams, resources, and future ownership-sensitive operations.
- `org_admin`: manages members, departments, teams, and resources, but cannot transfer or delete the organization unless explicitly allowed later.
- `org_manager`: manages assigned operational scopes.
- `org_member`: uses resources granted to the organization, department, team, or user.
- `org_viewer`: read-only where granted.

Users can belong to multiple organizations. Requests operate under an active organization context, resolved from a request header, route parameter, or persisted session preference.

## Department Model

`departments` represents an organization-scoped hierarchy.

Recommended fields:

- `id`
- `organization_id`
- `parent_department_id`
- `name`
- `slug`
- `description`
- `created_by`
- `created_at`
- `updated_at`

`department_members` connects users to departments.

Recommended fields:

- `department_id`
- `user_id`
- `role`
- `joined_at`

Recommended roles:

- `department_admin`
- `department_manager`
- `department_member`
- `department_viewer`

Department permissions inherit to child departments for all actions. The implementation should make inheritance explicit in the permission engine rather than duplicating role checks in routes or UI components.

## Team Model

`teams` is an organization-scoped collaboration group. Teams can be attached to a department for navigation and reporting, but team membership can include users from different departments.

Recommended fields:

- `id`
- `organization_id`
- nullable `department_id`
- `name`
- `slug`
- `description`
- `created_by`
- `created_at`
- `updated_at`

`team_members` connects users to teams.

Recommended fields:

- `team_id`
- `user_id`
- `role`
- `joined_at`

Recommended roles:

- `team_admin`
- `team_manager`
- `team_member`
- `team_viewer`

Team permissions do not cascade. A team grant applies to that team and its explicitly granted resources.

## Platform Admin Model

`platform_admins` stores platform-level administrators.

Recommended fields:

- `user_id`
- `role`: currently `super_admin`
- `enabled`
- `granted_by`
- `granted_at`
- `revoked_by`
- `revoked_at`

Initial super admins are bootstrapped from server-only environment configuration, such as `BATTLEFLOW_SUPER_ADMIN_EMAILS` or `BATTLEFLOW_SUPER_ADMIN_USER_IDS`. After bootstrap, only an enabled super admin can grant or revoke super admin status.

The system must prevent accidental revocation of the last enabled super admin. Every super admin grant, revoke, and disable operation writes an audit event.

## Resource Authorization

Use `resource_access_grants` for cross-resource access.

Recommended fields:

- `resource_type`: `skill`, `workflow`, `knowledge_base`, `prd_document`, or future resource type
- `resource_id`
- `organization_id`
- `subject_type`: `organization`, `department`, `team`, or `user`
- `subject_id`
- `permission`: `read`, `comment`, `run`, `create`, `update`, `approve`, `publish`, `delete`, or `admin`
- `created_by`
- `created_at`
- `updated_at`

Resources may still have owner or organization columns for fast filtering. Resource grants handle collaborators, scoped access, and exceptions.

## Permission Resolution

All permission checks happen server-side through shared helpers.

Recommended helpers:

- `requireUser(request)`
- `requireOrganizationContext(request)`
- `requirePermission(context, action, target)`

Resolution order:

1. Validate the first-party session cookie.
2. Load user and session from Postgres.
3. Reject disabled users and expired/revoked sessions.
4. If the user is an enabled super admin, allow product-level access to all organization content while still blocking secret material.
5. Resolve active organization membership.
6. Resolve organization role permissions.
7. Resolve direct and inherited department permissions.
8. Resolve team permissions.
9. Resolve resource-specific grants.
10. Apply owner/personal fallback rules where explicitly supported.
11. Deny by default.

Example action names:

- `platform.users.manage`
- `platform.super_admins.manage`
- `organization.read`
- `organization.manage`
- `organization.members.manage`
- `organization.departments.manage`
- `organization.teams.manage`
- `skill.read`
- `skill.import`
- `skill.submit_review`
- `skill.approve`
- `skill.publish`
- `workflow.read`
- `workflow.create`
- `workflow.update`
- `workflow.delete`
- `knowledge_base.read`
- `knowledge_base.manage`
- `prd.read`
- `prd.manage`

## API Boundaries

Add or update routes for:

- current user and capabilities;
- registration, login, logout, and onboarding;
- organizations and organization members;
- departments and department members;
- teams and team members;
- super admins;
- resource grants.

Existing routes for Skills, workflows, knowledge bases, PRD documents, dashboard stats, chat, and workflow snapshots/milestones must use the shared auth context before reading or mutating resources.

Direct access to `BATTLEFLOW_DATABASE_URL` does not imply product authorization. Route handlers must reject unauthorized requests before reading or writing protected rows, files, package assets, or prompt context.

## Skill And Workflow Storage

Skills and workflows should move from file-backed production facts to Postgres-backed business facts.

Store in Postgres:

- Skill metadata, scope, status, author, tags, versions, review state, publish history, rollback history, and asset manifests.
- Workflow workspace metadata, workflows, steps, step chat state, context selections, reviewed outputs, snapshots, milestones, Skill drafts, and PRD relationships.
- Resource grants and organization ownership for both Skills and workflows.

Store as files or future object storage:

- Original Skill package archives.
- Extracted package assets.
- Attachments, templates, examples, references, images, and binary files.

Postgres records point to asset locations and checksums. Asset reads must go through authorization checks.

## Audit Events

`audit_events` records security- and administration-relevant operations.

Required events include:

- super admin grant, revoke, and disable;
- organization role changes;
- department and team membership changes;
- resource grant changes;
- destructive organization or resource administration;
- auth-sensitive session changes where useful.

Audit metadata should be structured and bounded. Do not store secrets, raw session tokens, full private documents, or database credentials in audit metadata.

## First Release Exclusions

The first release explicitly does not include:

- email verification;
- password reset.

The UI must not promise these features. If placeholders are needed, they should be disabled and clearly treated as future work.

## Validation Direction

Implementation tasks should add automated coverage for:

- registration, login, logout, and session rejection;
- disabled users;
- multi-organization access;
- department inheritance for all actions;
- cross-department teams;
- resource grants;
- super admin access;
- unauthorized route access;
- Skill/workflow asset authorization.

Manual QA must cover dashboard onboarding, organization switching, member management, department/team management, resource permissions, super admin management, and unauthorized access.
