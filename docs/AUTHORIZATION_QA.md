# Authorization QA Guide

## Purpose

Use this guide to verify BattleFlow account, organization, and resource authorization behavior after running the Postgres account and resource migrations.

## Prerequisites

1. Set `BATTLEFLOW_DATABASE_URL` for a non-production Postgres database.
2. Run `pnpm db:postgres:init`.
3. Run `pnpm db:resources:migrate` if the environment already has file-backed Skill or workflow runtime data.
4. Start the app with `pnpm dev`.
5. Use at least four test accounts:
   - platform super admin;
   - organization owner/admin;
   - ordinary organization member;
   - user with no membership in the target organization.

## Automated Gates

Run these before manual QA:

```bash
pnpm test
pnpm validate
pnpm build
```

## Manual Checklist

### Registration, Login, And Logout

- Register a new account with a new organization name and verify the user lands in the dashboard under that organization.
- Register with an invitation token and verify the user joins the invited organization, role, departments, and teams.
- Log in with a valid password and verify `battleflow_session` and `battleflow_active_org` are HttpOnly cookies.
- Log out and verify `/dashboard` redirects to `/login?next=/dashboard`.
- Disable the user in Postgres and verify existing sessions no longer access `/api/auth/me` or dashboard APIs.
- Revoke or expire a session row and verify the browser must authenticate again.

### Organization Switching

- Add one user to two organizations.
- Switch the active organization from the dashboard shell.
- Verify organization-scoped pages only show data from the active organization.
- Try to send `x-battleflow-organization-id` for an organization where the user is not a member and verify the API returns 403.

### Member, Department, And Team Management

- As an organization admin, create an invitation, update a member role, disable a member, and verify audit events are written.
- As a department manager, manage a child department and verify sibling departments remain inaccessible.
- Assign a user from Department A to a team attached to Department B and verify cross-department team access works.
- As an ordinary member, attempt member, department, and team mutations and verify 403 responses.

### Resource Permissions

- Import a personal Skill and verify only the owner can read, update, archive, or use package assets.
- Import or publish a team Skill and verify granted organization/team users can read and run it.
- Verify a user with only a read grant cannot publish, update, archive, or delete the Skill.
- Create a workflow and verify only the owner or users with workflow grants can read details, snapshots, milestones, chat context, and generated PRD documents.
- Remove a resource grant and verify stale browser tabs no longer receive protected resource data after refresh.

### Knowledge And Prompt Context

- Create a knowledge base as an authorized user.
- Search the knowledge route as an authorized user and verify only active-organization knowledge bases are returned.
- Select a knowledge base in chat and verify unauthorized users cannot retrieve its chunks or inject it into prompt context.
- Select a Skill with package assets in chat and verify unauthorized users cannot include package assets in prompt context.

### Super Admin

- Bootstrap a super admin with server-only env configuration.
- Verify the super admin can see organization content across tenants through product APIs.
- Verify product responses never include `BATTLEFLOW_DATABASE_URL`, password hashes, session token hashes, invitation tokens, or raw environment values.
- Grant another super admin, revoke it, and verify audit events are written.
- Attempt to revoke the last enabled super admin and verify the API denies it.

### Unauthorized And Error Cases

- Call protected APIs without cookies and verify 401 responses.
- Call protected APIs with a user from the wrong organization and verify 403 responses.
- Request a non-existent protected resource and verify the route does not expose another organization's content.
- Temporarily unset `BATTLEFLOW_DATABASE_URL` in a local environment and verify auth-protected routes fail closed with 503 where applicable.

## Local Run Notes

When a local Postgres database is unavailable, record the blocked checks in the task log or release notes with the missing environment variable and the exact checklist sections not completed.
