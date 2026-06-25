import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { getPostgresPool, queryPostgres } from '../storage/database/postgres-client';
import { createSessionToken, hashToken } from './auth/session';
import type { DepartmentRole, OrganizationRole, TeamRole } from './auth/types';

const INVITATION_TTL_DAYS = 7;

interface QueryExecutor {
  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
}

export class OrganizationManagementValidationError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = 'OrganizationManagementValidationError';
  }
}

interface MemberRow extends QueryResultRow {
  user_id: string;
  email: string;
  display_name: string | null;
  role: OrganizationRole;
  status: string;
  joined_at: Date | string;
}

interface OrganizationRow extends QueryResultRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
}

interface DepartmentRow extends QueryResultRow {
  id: string;
  organization_id: string;
  parent_department_id: string | null;
  name: string;
  slug: string;
  description: string | null;
}

interface DepartmentMemberRow extends QueryResultRow {
  department_id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  role: DepartmentRole;
}

interface TeamRow extends QueryResultRow {
  id: string;
  organization_id: string;
  department_id: string | null;
  name: string;
  slug: string;
  description: string | null;
}

interface TeamMemberRow extends QueryResultRow {
  team_id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  role: TeamRole;
}

interface InvitationRow extends QueryResultRow {
  id: string;
  email: string;
  role: OrganizationRole;
  expires_at: Date | string;
  accepted_at: Date | string | null;
  created_at: Date | string;
}

export interface CreateInvitationResult {
  invitation: {
    id: string;
    email: string;
    role: OrganizationRole;
    expiresAt: string;
  };
  token: string;
}

function normalizeText(value: string | null | undefined, fieldName: string, maxLength: number): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new OrganizationManagementValidationError(`${fieldName} is required`);
  }
  return trimmed.slice(0, maxLength);
}

function normalizeOptionalText(value: string | null | undefined, maxLength: number): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function normalizeEmail(value: string): string {
  const email = normalizeText(value, 'Email', 255).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new OrganizationManagementValidationError('Valid email is required');
  }
  return email;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'item';
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPostgresPool().connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function makeUniqueSlug(
  client: PoolClient,
  tableName: 'departments' | 'teams',
  organizationId: string,
  name: string,
  preferredSlug?: string | null,
): Promise<string> {
  const base = slugify(preferredSlug || name);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = attempt === 0 ? '' : `-${attempt + 1}`;
    const slug = `${base}${suffix}`.slice(0, 64);
    const result = await client.query(
      `SELECT 1 FROM ${tableName} WHERE organization_id = $1 AND slug = $2 LIMIT 1`,
      [organizationId, slug],
    );
    if (result.rowCount === 0) {
      return slug;
    }
  }

  throw new OrganizationManagementValidationError('Unable to create unique slug');
}

function uniqueStringIds(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

async function ensureOrganizationMember(
  client: PoolClient,
  organizationId: string,
  userId: string,
): Promise<void> {
  const result = await client.query(
    `
      SELECT 1
      FROM organization_members
      WHERE organization_id = $1
        AND user_id = $2
        AND status = 'active'
      LIMIT 1
    `,
    [organizationId, userId],
  );
  if (result.rowCount === 0) {
    throw new OrganizationManagementValidationError('Active organization member not found');
  }
}

async function ensureDepartment(
  client: PoolClient,
  organizationId: string,
  departmentId: string,
): Promise<void> {
  const result = await client.query(
    'SELECT 1 FROM departments WHERE organization_id = $1 AND id = $2 LIMIT 1',
    [organizationId, departmentId],
  );
  if (result.rowCount === 0) {
    throw new OrganizationManagementValidationError('Department not found');
  }
}

async function ensureTeam(
  client: PoolClient,
  organizationId: string,
  teamId: string,
): Promise<void> {
  const result = await client.query(
    'SELECT 1 FROM teams WHERE organization_id = $1 AND id = $2 LIMIT 1',
    [organizationId, teamId],
  );
  if (result.rowCount === 0) {
    throw new OrganizationManagementValidationError('Team not found');
  }
}

async function ensureDepartmentIds(
  client: PoolClient,
  organizationId: string,
  departmentIds: string[],
): Promise<void> {
  if (departmentIds.length === 0) {
    return;
  }

  const result = await client.query<{ count: string }>(
    `
      SELECT count(*)::text AS count
      FROM departments
      WHERE organization_id = $1
        AND id = ANY($2::varchar[])
    `,
    [organizationId, departmentIds],
  );
  if (Number(result.rows[0]?.count ?? 0) !== departmentIds.length) {
    throw new OrganizationManagementValidationError('One or more departments were not found');
  }
}

async function ensureTeamIds(
  client: PoolClient,
  organizationId: string,
  teamIds: string[],
): Promise<void> {
  if (teamIds.length === 0) {
    return;
  }

  const result = await client.query<{ count: string }>(
    `
      SELECT count(*)::text AS count
      FROM teams
      WHERE organization_id = $1
        AND id = ANY($2::varchar[])
    `,
    [organizationId, teamIds],
  );
  if (Number(result.rows[0]?.count ?? 0) !== teamIds.length) {
    throw new OrganizationManagementValidationError('One or more teams were not found');
  }
}

async function ensureDepartmentParentCanBeSet(input: {
  client: PoolClient;
  organizationId: string;
  departmentId: string;
  parentDepartmentId: string | null;
}): Promise<void> {
  if (!input.parentDepartmentId) {
    return;
  }

  if (input.parentDepartmentId === input.departmentId) {
    throw new OrganizationManagementValidationError('Department cannot be its own parent');
  }

  await ensureDepartment(input.client, input.organizationId, input.parentDepartmentId);

  const result = await input.client.query(
    `
      WITH RECURSIVE descendants AS (
        SELECT id
        FROM departments
        WHERE organization_id = $1
          AND parent_department_id = $2
        UNION ALL
        SELECT d.id
        FROM departments d
        JOIN descendants child ON child.id = d.parent_department_id
        WHERE d.organization_id = $1
      )
      SELECT 1
      FROM descendants
      WHERE id = $3
      LIMIT 1
    `,
    [input.organizationId, input.departmentId, input.parentDepartmentId],
  );
  if (result.rowCount && result.rowCount > 0) {
    throw new OrganizationManagementValidationError('Department cannot be moved below one of its descendants');
  }
}

async function ensureDepartmentCanBeDeleted(
  client: PoolClient,
  organizationId: string,
  departmentId: string,
): Promise<void> {
  const result = await client.query<{
    exists: boolean;
    has_child_departments: boolean;
    has_teams: boolean;
  }>(
    `
      SELECT
        EXISTS (
          SELECT 1 FROM departments WHERE organization_id = $1 AND id = $2
        ) AS exists,
        EXISTS (
          SELECT 1 FROM departments WHERE organization_id = $1 AND parent_department_id = $2
        ) AS has_child_departments,
        EXISTS (
          SELECT 1 FROM teams WHERE organization_id = $1 AND department_id = $2
        ) AS has_teams
    `,
    [organizationId, departmentId],
  );
  const row = result.rows[0];
  if (!row?.exists) {
    throw new OrganizationManagementValidationError('Department not found');
  }
  if (row.has_child_departments || row.has_teams) {
    throw new OrganizationManagementValidationError('Move child departments and teams before deleting this department');
  }
}

export async function writeAuditEvent(input: {
  organizationId?: string | null;
  actorUserId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}, client?: QueryExecutor): Promise<void> {
  const executor = client ?? getPostgresPool();
  await executor.query(
    `
      INSERT INTO audit_events (organization_id, actor_user_id, action, target_type, target_id, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, now())
    `,
    [
      input.organizationId ?? null,
      input.actorUserId ?? null,
      input.action,
      input.targetType,
      input.targetId ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

export async function updateOrganization(input: {
  organizationId: string;
  name?: string | null;
  description?: string | null;
  status?: string | null;
  actorUserId: string;
}) {
  const shouldUpdateName = input.name !== undefined;
  const shouldUpdateDescription = input.description !== undefined;
  const shouldUpdateStatus = input.status !== undefined;

  if (!shouldUpdateName && !shouldUpdateDescription && !shouldUpdateStatus) {
    throw new OrganizationManagementValidationError('At least one organization field is required');
  }

  return withTransaction(async (client) => {
    const result = await client.query<OrganizationRow>(
      `
        UPDATE organizations
        SET
          name = CASE WHEN $2::boolean THEN $3::varchar ELSE name END,
          description = CASE WHEN $4::boolean THEN $5::text ELSE description END,
          status = CASE WHEN $6::boolean THEN $7::varchar ELSE status END,
          updated_at = now()
        WHERE id = $1
        RETURNING id, name, slug, description, status
      `,
      [
        input.organizationId,
        shouldUpdateName,
        shouldUpdateName ? normalizeText(input.name, 'Organization name', 128) : null,
        shouldUpdateDescription,
        shouldUpdateDescription ? normalizeOptionalText(input.description, 2000) : null,
        shouldUpdateStatus,
        shouldUpdateStatus ? normalizeText(input.status, 'Organization status', 20) : null,
      ],
    );
    const organization = result.rows[0];
    if (!organization) {
      throw new OrganizationManagementValidationError('Organization not found');
    }

    await writeAuditEvent({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'organization.update',
      targetType: 'organization',
      targetId: input.organizationId,
      metadata: {
        updatedFields: {
          name: shouldUpdateName,
          description: shouldUpdateDescription,
          status: shouldUpdateStatus,
        },
      },
    }, client);

    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      description: organization.description,
      status: organization.status,
    };
  });
}

export async function listOrganizationMembers(organizationId: string) {
  const result = await queryPostgres<MemberRow>(
    `
      SELECT
        m.user_id,
        u.email,
        u.display_name,
        m.role,
        m.status,
        m.joined_at
      FROM organization_members m
      JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = $1
      ORDER BY m.joined_at ASC
    `,
    [organizationId],
  );

  return result.rows.map((row) => ({
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    joinedAt: toIso(row.joined_at),
  }));
}

export async function updateOrganizationMember(input: {
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  status: string;
  actorUserId: string;
}) {
  return withTransaction(async (client) => {
    const result = await client.query(
      `
        UPDATE organization_members
        SET role = $3, status = $4, updated_at = now()
        WHERE organization_id = $1 AND user_id = $2
      `,
      [input.organizationId, input.userId, input.role, input.status],
    );
    if (result.rowCount === 0) {
      throw new OrganizationManagementValidationError('Organization member not found');
    }

    await writeAuditEvent({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'organization.member.update',
      targetType: 'user',
      targetId: input.userId,
      metadata: { role: input.role, status: input.status },
    }, client);
  });
}

export async function removeOrganizationMember(input: {
  organizationId: string;
  userId: string;
  actorUserId: string;
}) {
  return withTransaction(async (client) => {
    const result = await client.query(
      'DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2',
      [input.organizationId, input.userId],
    );
    if (result.rowCount === 0) {
      throw new OrganizationManagementValidationError('Organization member not found');
    }

    await writeAuditEvent({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'organization.member.remove',
      targetType: 'user',
      targetId: input.userId,
    }, client);
  });
}

export async function listDepartments(organizationId: string, rootDepartmentId?: string | null) {
  const [departments, members] = await Promise.all([
    queryPostgres<DepartmentRow>(
      `
        WITH RECURSIVE visible_departments AS (
          SELECT id
          FROM departments
          WHERE organization_id = $1
            AND id = $2
          UNION ALL
          SELECT d.id
          FROM departments d
          JOIN visible_departments visible ON visible.id = d.parent_department_id
          WHERE d.organization_id = $1
        )
        SELECT id, organization_id, parent_department_id, name, slug, description
        FROM departments
        WHERE organization_id = $1
          AND ($2::varchar IS NULL OR id IN (SELECT id FROM visible_departments))
        ORDER BY name ASC
      `,
      [organizationId, rootDepartmentId ?? null],
    ),
    queryPostgres<DepartmentMemberRow>(
      `
        WITH RECURSIVE visible_departments AS (
          SELECT id
          FROM departments
          WHERE organization_id = $1
            AND id = $2
          UNION ALL
          SELECT d.id
          FROM departments d
          JOIN visible_departments visible ON visible.id = d.parent_department_id
          WHERE d.organization_id = $1
        )
        SELECT dm.department_id, dm.user_id, u.email, u.display_name, dm.role
        FROM department_members dm
        JOIN departments d ON d.id = dm.department_id
        JOIN users u ON u.id = dm.user_id
        WHERE d.organization_id = $1
          AND ($2::varchar IS NULL OR d.id IN (SELECT id FROM visible_departments))
        ORDER BY u.email ASC
      `,
      [organizationId, rootDepartmentId ?? null],
    ),
  ]);
  const membersByDepartment = new Map<string, DepartmentMemberRow[]>();
  for (const member of members.rows) {
    const current = membersByDepartment.get(member.department_id) ?? [];
    current.push(member);
    membersByDepartment.set(member.department_id, current);
  }

  return departments.rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    parentDepartmentId: row.parent_department_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    members: (membersByDepartment.get(row.id) ?? []).map((member) => ({
      userId: member.user_id,
      email: member.email,
      displayName: member.display_name,
      role: member.role,
    })),
  }));
}

export async function createDepartment(input: {
  organizationId: string;
  name: string;
  parentDepartmentId?: string | null;
  description?: string | null;
  actorUserId: string;
}) {
  return withTransaction(async (client) => {
    const name = normalizeText(input.name, 'Department name', 128);
    if (input.parentDepartmentId) {
      await ensureDepartment(client, input.organizationId, input.parentDepartmentId);
    }
    const slug = await makeUniqueSlug(client, 'departments', input.organizationId, name);
    const result = await client.query<{ id: string }>(
      `
        INSERT INTO departments (organization_id, parent_department_id, name, slug, description, created_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, now(), now())
        RETURNING id
      `,
      [
        input.organizationId,
        input.parentDepartmentId ?? null,
        name,
        slug,
        normalizeOptionalText(input.description, 2000),
        input.actorUserId,
      ],
    );
    const id = result.rows[0]?.id;
    if (!id) {
      throw new OrganizationManagementValidationError('Unable to create department');
    }

    await writeAuditEvent({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'department.create',
      targetType: 'department',
      targetId: id,
      metadata: { parentDepartmentId: input.parentDepartmentId ?? null },
    }, client);

    return { id };
  });
}

export async function updateDepartment(input: {
  organizationId: string;
  departmentId: string;
  name?: string | null;
  parentDepartmentId?: string | null;
  description?: string | null;
  actorUserId: string;
}) {
  const shouldUpdateName = input.name !== undefined;
  const shouldUpdateParent = input.parentDepartmentId !== undefined;
  const shouldUpdateDescription = input.description !== undefined;

  if (!shouldUpdateName && !shouldUpdateParent && !shouldUpdateDescription) {
    throw new OrganizationManagementValidationError('At least one department field is required');
  }

  return withTransaction(async (client) => {
    await ensureDepartment(client, input.organizationId, input.departmentId);
    if (shouldUpdateParent) {
      await ensureDepartmentParentCanBeSet({
        client,
        organizationId: input.organizationId,
        departmentId: input.departmentId,
        parentDepartmentId: input.parentDepartmentId ?? null,
      });
    }

    const result = await client.query(
      `
        UPDATE departments
        SET
          name = CASE WHEN $3::boolean THEN $4::varchar ELSE name END,
          parent_department_id = CASE WHEN $5::boolean THEN $6::varchar ELSE parent_department_id END,
          description = CASE WHEN $7::boolean THEN $8::text ELSE description END,
          updated_at = now()
        WHERE organization_id = $1 AND id = $2
      `,
      [
        input.organizationId,
        input.departmentId,
        shouldUpdateName,
        shouldUpdateName ? normalizeText(input.name, 'Department name', 128) : null,
        shouldUpdateParent,
        shouldUpdateParent ? input.parentDepartmentId ?? null : null,
        shouldUpdateDescription,
        shouldUpdateDescription ? normalizeOptionalText(input.description, 2000) : null,
      ],
    );
    if (result.rowCount === 0) {
      throw new OrganizationManagementValidationError('Department not found');
    }

    await writeAuditEvent({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'department.update',
      targetType: 'department',
      targetId: input.departmentId,
    }, client);
  });
}

export async function deleteDepartment(input: {
  organizationId: string;
  departmentId: string;
  actorUserId: string;
}) {
  return withTransaction(async (client) => {
    await ensureDepartmentCanBeDeleted(client, input.organizationId, input.departmentId);
    const result = await client.query(
      'DELETE FROM departments WHERE organization_id = $1 AND id = $2',
      [input.organizationId, input.departmentId],
    );
    if (result.rowCount === 0) {
      throw new OrganizationManagementValidationError('Department not found');
    }

    await writeAuditEvent({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'department.delete',
      targetType: 'department',
      targetId: input.departmentId,
    }, client);
  });
}

export async function setDepartmentMember(input: {
  organizationId: string;
  departmentId: string;
  userId: string;
  role: DepartmentRole;
  actorUserId: string;
}) {
  return withTransaction(async (client) => {
    await ensureDepartment(client, input.organizationId, input.departmentId);
    await ensureOrganizationMember(client, input.organizationId, input.userId);

    await client.query(
      `
        INSERT INTO department_members (department_id, user_id, role, joined_at)
        VALUES ($1, $2, $3, now())
        ON CONFLICT (department_id, user_id)
        DO UPDATE SET role = EXCLUDED.role
      `,
      [input.departmentId, input.userId, input.role],
    );

    await writeAuditEvent({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'department.member.set',
      targetType: 'department',
      targetId: input.departmentId,
      metadata: { userId: input.userId, role: input.role },
    }, client);
  });
}

export async function removeDepartmentMember(input: {
  organizationId: string;
  departmentId: string;
  userId: string;
  actorUserId: string;
}) {
  return withTransaction(async (client) => {
    await ensureDepartment(client, input.organizationId, input.departmentId);
    const result = await client.query(
      'DELETE FROM department_members WHERE department_id = $1 AND user_id = $2',
      [input.departmentId, input.userId],
    );
    if (result.rowCount === 0) {
      throw new OrganizationManagementValidationError('Department member not found');
    }

    await writeAuditEvent({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'department.member.remove',
      targetType: 'department',
      targetId: input.departmentId,
      metadata: { userId: input.userId },
    }, client);
  });
}

export async function listTeams(organizationId: string, teamId?: string | null) {
  const [teams, members] = await Promise.all([
    queryPostgres<TeamRow>(
      `
        SELECT id, organization_id, department_id, name, slug, description
        FROM teams
        WHERE organization_id = $1
          AND ($2::varchar IS NULL OR id = $2)
        ORDER BY name ASC
      `,
      [organizationId, teamId ?? null],
    ),
    queryPostgres<TeamMemberRow>(
      `
        SELECT tm.team_id, tm.user_id, u.email, u.display_name, tm.role
        FROM team_members tm
        JOIN teams t ON t.id = tm.team_id
        JOIN users u ON u.id = tm.user_id
        WHERE t.organization_id = $1
          AND ($2::varchar IS NULL OR t.id = $2)
        ORDER BY u.email ASC
      `,
      [organizationId, teamId ?? null],
    ),
  ]);
  const membersByTeam = new Map<string, TeamMemberRow[]>();
  for (const member of members.rows) {
    const current = membersByTeam.get(member.team_id) ?? [];
    current.push(member);
    membersByTeam.set(member.team_id, current);
  }

  return teams.rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    departmentId: row.department_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    members: (membersByTeam.get(row.id) ?? []).map((member) => ({
      userId: member.user_id,
      email: member.email,
      displayName: member.display_name,
      role: member.role,
    })),
  }));
}

export async function createTeam(input: {
  organizationId: string;
  name: string;
  departmentId?: string | null;
  description?: string | null;
  actorUserId: string;
}) {
  return withTransaction(async (client) => {
    const name = normalizeText(input.name, 'Team name', 128);
    if (input.departmentId) {
      await ensureDepartment(client, input.organizationId, input.departmentId);
    }
    const slug = await makeUniqueSlug(client, 'teams', input.organizationId, name);
    const result = await client.query<{ id: string }>(
      `
        INSERT INTO teams (organization_id, department_id, name, slug, description, created_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, now(), now())
        RETURNING id
      `,
      [
        input.organizationId,
        input.departmentId ?? null,
        name,
        slug,
        normalizeOptionalText(input.description, 2000),
        input.actorUserId,
      ],
    );
    const id = result.rows[0]?.id;
    if (!id) {
      throw new OrganizationManagementValidationError('Unable to create team');
    }

    await writeAuditEvent({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'team.create',
      targetType: 'team',
      targetId: id,
      metadata: { departmentId: input.departmentId ?? null },
    }, client);

    return { id };
  });
}

export async function updateTeam(input: {
  organizationId: string;
  teamId: string;
  name?: string | null;
  departmentId?: string | null;
  description?: string | null;
  actorUserId: string;
}) {
  const shouldUpdateName = input.name !== undefined;
  const shouldUpdateDepartment = input.departmentId !== undefined;
  const shouldUpdateDescription = input.description !== undefined;

  if (!shouldUpdateName && !shouldUpdateDepartment && !shouldUpdateDescription) {
    throw new OrganizationManagementValidationError('At least one team field is required');
  }

  return withTransaction(async (client) => {
    await ensureTeam(client, input.organizationId, input.teamId);
    if (input.departmentId) {
      await ensureDepartment(client, input.organizationId, input.departmentId);
    }

    const result = await client.query(
      `
        UPDATE teams
        SET
          name = CASE WHEN $3::boolean THEN $4::varchar ELSE name END,
          department_id = CASE WHEN $5::boolean THEN $6::varchar ELSE department_id END,
          description = CASE WHEN $7::boolean THEN $8::text ELSE description END,
          updated_at = now()
        WHERE organization_id = $1 AND id = $2
      `,
      [
        input.organizationId,
        input.teamId,
        shouldUpdateName,
        shouldUpdateName ? normalizeText(input.name, 'Team name', 128) : null,
        shouldUpdateDepartment,
        shouldUpdateDepartment ? input.departmentId ?? null : null,
        shouldUpdateDescription,
        shouldUpdateDescription ? normalizeOptionalText(input.description, 2000) : null,
      ],
    );
    if (result.rowCount === 0) {
      throw new OrganizationManagementValidationError('Team not found');
    }

    await writeAuditEvent({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'team.update',
      targetType: 'team',
      targetId: input.teamId,
    }, client);
  });
}

export async function deleteTeam(input: {
  organizationId: string;
  teamId: string;
  actorUserId: string;
}) {
  return withTransaction(async (client) => {
    await ensureTeam(client, input.organizationId, input.teamId);
    const result = await client.query(
      'DELETE FROM teams WHERE organization_id = $1 AND id = $2',
      [input.organizationId, input.teamId],
    );
    if (result.rowCount === 0) {
      throw new OrganizationManagementValidationError('Team not found');
    }

    await writeAuditEvent({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'team.delete',
      targetType: 'team',
      targetId: input.teamId,
    }, client);
  });
}

export async function setTeamMember(input: {
  organizationId: string;
  teamId: string;
  userId: string;
  role: TeamRole;
  actorUserId: string;
}) {
  return withTransaction(async (client) => {
    await ensureTeam(client, input.organizationId, input.teamId);
    await ensureOrganizationMember(client, input.organizationId, input.userId);

    await client.query(
      `
        INSERT INTO team_members (team_id, user_id, role, joined_at)
        VALUES ($1, $2, $3, now())
        ON CONFLICT (team_id, user_id)
        DO UPDATE SET role = EXCLUDED.role
      `,
      [input.teamId, input.userId, input.role],
    );

    await writeAuditEvent({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'team.member.set',
      targetType: 'team',
      targetId: input.teamId,
      metadata: { userId: input.userId, role: input.role },
    }, client);
  });
}

export async function removeTeamMember(input: {
  organizationId: string;
  teamId: string;
  userId: string;
  actorUserId: string;
}) {
  return withTransaction(async (client) => {
    await ensureTeam(client, input.organizationId, input.teamId);
    const result = await client.query(
      'DELETE FROM team_members WHERE team_id = $1 AND user_id = $2',
      [input.teamId, input.userId],
    );
    if (result.rowCount === 0) {
      throw new OrganizationManagementValidationError('Team member not found');
    }

    await writeAuditEvent({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'team.member.remove',
      targetType: 'team',
      targetId: input.teamId,
      metadata: { userId: input.userId },
    }, client);
  });
}

export async function listInvitations(organizationId: string) {
  const result = await queryPostgres<InvitationRow>(
    `
      SELECT id, email, role, expires_at, accepted_at, created_at
      FROM organization_invitations
      WHERE organization_id = $1
      ORDER BY created_at DESC
    `,
    [organizationId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    expiresAt: toIso(row.expires_at),
    acceptedAt: row.accepted_at ? toIso(row.accepted_at) : null,
    createdAt: toIso(row.created_at),
  }));
}

export async function createInvitation(input: {
  organizationId: string;
  email: string;
  role: OrganizationRole;
  departmentIds?: string[];
  teamIds?: string[];
  actorUserId: string;
}): Promise<CreateInvitationResult> {
  return withTransaction(async (client) => {
    const departmentIds = uniqueStringIds(input.departmentIds);
    const teamIds = uniqueStringIds(input.teamIds);
    await ensureDepartmentIds(client, input.organizationId, departmentIds);
    await ensureTeamIds(client, input.organizationId, teamIds);

    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
    const result = await client.query<InvitationRow>(
      `
        INSERT INTO organization_invitations (
          organization_id,
          email,
          role,
          department_ids,
          team_ids,
          token_hash,
          expires_at,
          created_by,
          created_at
        )
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, now())
        RETURNING id, email, role, expires_at, accepted_at, created_at
      `,
      [
        input.organizationId,
        normalizeEmail(input.email),
        input.role,
        JSON.stringify(departmentIds),
        JSON.stringify(teamIds),
        hashToken(token),
        expiresAt,
        input.actorUserId,
      ],
    );
    const invitation = result.rows[0];
    if (!invitation) {
      throw new OrganizationManagementValidationError('Unable to create invitation');
    }

    await writeAuditEvent({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'organization.invitation.create',
      targetType: 'organization_invitation',
      targetId: invitation.id,
      metadata: { email: invitation.email, role: invitation.role, departmentIds, teamIds },
    }, client);

    return {
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: toIso(invitation.expires_at),
      },
      token,
    };
  });
}
