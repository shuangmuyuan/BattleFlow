import { hasPostgresDatabaseConfig, queryPostgres } from '@/storage/database/postgres-client';
import {
  AuthConfigError,
  type AuthOrganization,
  type AuthSession,
  type AuthUser,
  type DepartmentMembership,
  type DepartmentNode,
  type OrganizationMembership,
  type ResourceAccessGrant,
  type TeamMembership,
} from './types';

interface SessionUserRow {
  session_id: string;
  session_user_id: string;
  expires_at: Date | string;
  revoked_at: Date | string | null;
  last_seen_at: Date | string | null;
  user_id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  user_status: string;
}

interface OrganizationMembershipRow {
  organization_id: string;
  user_id: string;
  role: OrganizationMembership['role'];
  membership_status: string;
  organization_name: string;
  organization_slug: string;
  organization_status: string;
}

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  status: string;
}

interface DepartmentRow {
  id: string;
  organization_id: string;
  parent_department_id: string | null;
  name: string;
  slug: string;
}

interface DepartmentMembershipRow {
  department_id: string;
  user_id: string;
  role: DepartmentMembership['role'];
}

interface TeamMembershipRow {
  team_id: string;
  organization_id: string;
  department_id: string | null;
  user_id: string;
  role: TeamMembership['role'];
}

interface ResourceGrantRow {
  id: string;
  organization_id: string;
  resource_type: string;
  resource_id: string;
  subject_type: ResourceAccessGrant['subjectType'];
  subject_id: string;
  permission: ResourceAccessGrant['permission'];
}

function assertAuthDatabaseConfigured(): void {
  if (!hasPostgresDatabaseConfig()) {
    throw new AuthConfigError();
  }
}

function toDate(value: Date | string | null): Date | null {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value : new Date(value);
}

function mapUser(row: SessionUserRow): AuthUser {
  return {
    id: row.user_id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    status: row.user_status,
  };
}

function mapSession(row: SessionUserRow): AuthSession {
  return {
    id: row.session_id,
    userId: row.session_user_id,
    expiresAt: toDate(row.expires_at) ?? new Date(0),
    revokedAt: toDate(row.revoked_at),
    lastSeenAt: toDate(row.last_seen_at),
  };
}

function mapOrganization(row: OrganizationRow): AuthOrganization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
  };
}

function mapOrganizationMembership(row: OrganizationMembershipRow): OrganizationMembership {
  return {
    organizationId: row.organization_id,
    userId: row.user_id,
    role: row.role,
    status: row.membership_status,
    organization: {
      id: row.organization_id,
      name: row.organization_name,
      slug: row.organization_slug,
      status: row.organization_status,
    },
  };
}

export async function fetchSessionUserByTokenHash(tokenHash: string): Promise<{
  user: AuthUser;
  session: AuthSession;
} | null> {
  assertAuthDatabaseConfigured();

  const result = await queryPostgres<SessionUserRow>(
    `
      SELECT
        s.id AS session_id,
        s.user_id AS session_user_id,
        s.expires_at,
        s.revoked_at,
        s.last_seen_at,
        u.id AS user_id,
        u.email,
        u.display_name,
        u.avatar_url,
        u.status AS user_status
      FROM user_sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.session_token_hash = $1
      LIMIT 1
    `,
    [tokenHash],
  );

  const row = result.rows[0];
  return row ? { user: mapUser(row), session: mapSession(row) } : null;
}

export async function updateSessionLastSeen(sessionId: string): Promise<void> {
  assertAuthDatabaseConfigured();

  await queryPostgres(
    'UPDATE user_sessions SET last_seen_at = now() WHERE id = $1',
    [sessionId],
  );
}

export async function fetchIsSuperAdmin(userId: string): Promise<boolean> {
  assertAuthDatabaseConfigured();

  const result = await queryPostgres<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM platform_admins
        WHERE user_id = $1
          AND role = 'super_admin'
          AND enabled = true
          AND revoked_at IS NULL
      ) AS exists
    `,
    [userId],
  );

  return Boolean(result.rows[0]?.exists);
}

export async function fetchOrganizationMemberships(userId: string): Promise<OrganizationMembership[]> {
  assertAuthDatabaseConfigured();

  const result = await queryPostgres<OrganizationMembershipRow>(
    `
      SELECT
        m.organization_id,
        m.user_id,
        m.role,
        m.status AS membership_status,
        o.name AS organization_name,
        o.slug AS organization_slug,
        o.status AS organization_status
      FROM organization_members m
      JOIN organizations o ON o.id = m.organization_id
      WHERE m.user_id = $1
        AND m.status = 'active'
      ORDER BY m.joined_at ASC
    `,
    [userId],
  );

  return result.rows.map(mapOrganizationMembership);
}

export async function fetchOrganizationById(organizationId: string): Promise<AuthOrganization | null> {
  assertAuthDatabaseConfigured();

  const result = await queryPostgres<OrganizationRow>(
    `
      SELECT id, name, slug, status
      FROM organizations
      WHERE id = $1
      LIMIT 1
    `,
    [organizationId],
  );

  return result.rows[0] ? mapOrganization(result.rows[0]) : null;
}

export async function fetchFirstOrganization(): Promise<AuthOrganization | null> {
  assertAuthDatabaseConfigured();

  const result = await queryPostgres<OrganizationRow>(`
    SELECT id, name, slug, status
    FROM organizations
    ORDER BY created_at ASC
    LIMIT 1
  `);

  return result.rows[0] ? mapOrganization(result.rows[0]) : null;
}

export async function fetchDepartments(organizationId: string): Promise<DepartmentNode[]> {
  assertAuthDatabaseConfigured();

  const result = await queryPostgres<DepartmentRow>(
    `
      SELECT id, organization_id, parent_department_id, name, slug
      FROM departments
      WHERE organization_id = $1
      ORDER BY name ASC
    `,
    [organizationId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    parentDepartmentId: row.parent_department_id,
    name: row.name,
    slug: row.slug,
  }));
}

export async function fetchDepartmentMemberships(
  organizationId: string,
  userId: string,
): Promise<DepartmentMembership[]> {
  assertAuthDatabaseConfigured();

  const result = await queryPostgres<DepartmentMembershipRow>(
    `
      SELECT dm.department_id, dm.user_id, dm.role
      FROM department_members dm
      JOIN departments d ON d.id = dm.department_id
      WHERE d.organization_id = $1
        AND dm.user_id = $2
    `,
    [organizationId, userId],
  );

  return result.rows.map((row) => ({
    departmentId: row.department_id,
    userId: row.user_id,
    role: row.role,
  }));
}

export async function fetchTeamMemberships(
  organizationId: string,
  userId: string,
): Promise<TeamMembership[]> {
  assertAuthDatabaseConfigured();

  const result = await queryPostgres<TeamMembershipRow>(
    `
      SELECT tm.team_id, t.organization_id, t.department_id, tm.user_id, tm.role
      FROM team_members tm
      JOIN teams t ON t.id = tm.team_id
      WHERE t.organization_id = $1
        AND tm.user_id = $2
    `,
    [organizationId, userId],
  );

  return result.rows.map((row) => ({
    teamId: row.team_id,
    organizationId: row.organization_id,
    departmentId: row.department_id,
    userId: row.user_id,
    role: row.role,
  }));
}

export async function fetchResourceGrants(organizationId: string): Promise<ResourceAccessGrant[]> {
  assertAuthDatabaseConfigured();

  const result = await queryPostgres<ResourceGrantRow>(
    `
      SELECT
        id,
        organization_id,
        resource_type,
        resource_id,
        subject_type,
        subject_id,
        permission
      FROM resource_access_grants
      WHERE organization_id = $1
    `,
    [organizationId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    permission: row.permission,
  }));
}
