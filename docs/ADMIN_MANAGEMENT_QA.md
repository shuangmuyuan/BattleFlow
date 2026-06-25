# Admin Management Manual QA

Use this checklist when validating `/dashboard/admin` after account, organization, and permission changes.

## Prerequisites

- Start the app with `pnpm dev`.
- Use an account with `org_owner` or `org_admin` membership for organization-admin checks.
- Use a regular `org_member` account for restricted-access checks.
- Use a platform super admin account for the platform-admin tab.
- Configure `BATTLEFLOW_SUPER_ADMIN_EMAILS` or `BATTLEFLOW_SUPER_ADMIN_USER_IDS` server-side before the first bootstrap sign-in.
- Configure `BATTLEFLOW_DATABASE_URL` and run `pnpm db:postgres:init` before testing successful database-backed flows.

## Organization Admin

1. Sign in as an organization admin and open `/dashboard/admin`.
2. Confirm the dashboard navigation shows the Admin entry on desktop and mobile.
3. Confirm members, departments, teams, resource permissions, and, only for super admins, platform admins are available as tabs.
4. Search members by email, display name, and role.
5. Change a member role or status and confirm the table refreshes after saving.
6. Remove a member and confirm the destructive action dialog appears before the request is sent.
7. Create an invitation with an organization role and optional initial department/team assignments.
8. Confirm the generated invitation link uses `/login?invite=...`.

## Departments

1. Create a root department and a child department.
2. Confirm the tree shows the child nested below the parent.
3. Confirm the inherited access preview count changes when child departments exist.
4. Assign a member to a department role.
5. Edit a department parent and confirm invalid parent moves are rejected by the API.
6. Try deleting a department with child departments or linked teams and confirm the API rejects it.
7. Delete an empty department and confirm the destructive action dialog appears.

## Teams

1. Create a team without a linked department and confirm it is labeled as cross-department.
2. Create a team linked to a department.
3. Assign a member from any department to the team.
4. Edit a team name and description.
5. Delete a team and confirm the destructive action dialog appears.

## Restricted Users

1. Sign in as a regular organization member.
2. Confirm the Admin navigation item is hidden.
3. Navigate directly to `/dashboard/admin`.
4. Confirm the page shows a restricted-access state and no management controls are operable.

## Platform Super Admins

1. Sign in as a user that matches the server-only bootstrap configuration.
2. Open `/dashboard/admin` and confirm the Platform admins tab is visible.
3. Confirm the tab lists enabled super admins but does not show bootstrap environment variable values.
4. Grant super admin access to an existing user by email and confirm the list refreshes.
5. Revoke a non-last enabled super admin and confirm the destructive action dialog appears before the request is sent.
6. Confirm the last enabled super admin cannot be revoked from the UI.
7. Confirm an organization admin that is not a super admin cannot see the Platform admins tab and receives 403 from `/api/admin/super-admins`.

## Responsive Checks

1. Validate desktop width around 1440 px.
2. Validate tablet width around 768 px.
3. Validate mobile width around 390 px.
4. Confirm tabs, wide tables, dialogs, and destructive confirmations remain readable and do not overflow the viewport.

## Pending Backend Surfaces

- Resource permission grant editing remains disabled until Skill/workflow resource metadata and grant APIs are migrated in Task 9.
