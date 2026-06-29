import type { PoolClient, QueryResultRow } from 'pg';
import { writeAuditEvent } from '../organization-management';
import { getPostgresPool, queryPostgres } from '../../storage/database/postgres-client';
import { AuthError, type AuthUser } from './types';

export class SuperAdminManagementError extends AuthError {
  constructor(message: string, status = 400) {
    super(message, status);
    this.name = 'SuperAdminManagementError';
  }
}

interface PlatformAdminRow extends QueryResultRow {
  user_id: string;
  email: string;
  display_name: string | null;
  role: 'super_admin';
  enabled: boolean;
  granted_by: string | null;
  granted_at: Date | string;
  revoked_by: string | null;
  revoked_at: Date | string | null;
}

interface PlatformUserRow extends QueryResultRow {
  id: string;
  sso_id: string;
  username: string;
  display_name: string | null;
  email: string | null;
  department: string | null;
  department_id: string | null;
  title: string | null;
  mobile: string | null;
  is_active: boolean;
  is_admin: boolean;
  created_at: Date | string | null;
  updated_at: Date | string | null;
}

export interface ConfiguredSuperAdmins {
  emails: string[];
  userIds: string[];
}

export const builtInSuperAdminPrincipal = {
  userId: 'superadmin',
  username: 'superadmin',
  email: 'superadmin@battleflow.local',
  displayName: 'Built-in Super Admin',
} as const;

export const defaultSuperAdminEmails = ['94399@sangfor.com', builtInSuperAdminPrincipal.email] as const;
export const defaultSuperAdminUserIds = ['94399', builtInSuperAdminPrincipal.userId] as const;

function splitEnvList(value: string | undefined): string[] {
  return [...new Set((value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean))];
}

function uniqueList(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export function parseConfiguredSuperAdmins(
  env: Partial<Record<string, string | undefined>> = process.env,
): ConfiguredSuperAdmins {
  return {
    emails: uniqueList([
      ...defaultSuperAdminEmails,
      ...splitEnvList(env.BATTLEFLOW_SUPER_ADMIN_EMAILS),
    ].map((email) => email.toLowerCase())),
    userIds: uniqueList([
      ...defaultSuperAdminUserIds,
      ...splitEnvList(env.BATTLEFLOW_SUPER_ADMIN_USER_IDS),
    ]),
  };
}

export function userMatchesConfiguredSuperAdmin(user: Pick<AuthUser, 'id' | 'email'>, config: ConfiguredSuperAdmins): {
  matchedByEmail: boolean;
  matchedByUserId: boolean;
} {
  return {
    matchedByEmail: config.emails.includes(user.email.toLowerCase()),
    matchedByUserId: config.userIds.includes(user.id),
  };
}

export function isConfiguredSuperAdminPrincipal(input: {
  email?: string | null;
  userId?: string | null;
  username?: string | null;
  ssoId?: string | null;
}): boolean {
  const config = parseConfiguredSuperAdmins();
  const email = input.email?.trim().toLowerCase();
  const identifiers = [
    input.userId,
    input.username,
    input.ssoId,
  ].map((value) => value?.trim()).filter((value): value is string => Boolean(value));

  return Boolean(
    (email && config.emails.includes(email))
    || identifiers.some((identifier) => config.userIds.includes(identifier)),
  );
}

export function canRevokeSuperAdmin(input: {
  enabledSuperAdminCount: number;
  targetEnabled: boolean;
}): boolean {
  return !(input.targetEnabled && input.enabledSuperAdminCount <= 1);
}

function mapPlatformAdmin(row: PlatformAdminRow) {
  return {
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    enabled: row.enabled,
    grantedBy: row.granted_by,
    grantedAt: toIso(row.granted_at),
    revokedBy: row.revoked_by,
    revokedAt: toIso(row.revoked_at),
  };
}

function mapPlatformUser(row: PlatformUserRow) {
  return {
    id: row.id,
    ssoId: row.sso_id,
    username: row.username,
    displayName: row.display_name,
    email: row.email,
    department: row.department,
    departmentId: row.department_id,
    title: row.title,
    mobile: row.mobile,
    isActive: row.is_active,
    isAdmin: row.is_admin,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

async function countEnabledSuperAdmins(client: PoolClient): Promise<number> {
  const result = await client.query<{ user_id: string }>(
    `
      SELECT user_id
      FROM platform_admins
      WHERE role = 'super_admin'
        AND enabled = true
        AND revoked_at IS NULL
      FOR UPDATE
    `,
  );
  return result.rowCount ?? 0;
}

async function writePlatformAudit(input: {
  actorUserId: string | null;
  action: string;
  targetUserId: string;
  metadata?: Record<string, unknown>;
}, client: PoolClient): Promise<void> {
  await writeAuditEvent({
    organizationId: null,
    actorUserId: input.actorUserId,
    action: input.action,
    targetType: 'platform_admin',
    targetId: input.targetUserId,
    metadata: input.metadata,
  }, client);
}

export async function bootstrapConfiguredSuperAdminForUser(user: AuthUser): Promise<void> {
  const config = parseConfiguredSuperAdmins();
  const match = userMatchesConfiguredSuperAdmin(user, config);
  if (!match.matchedByEmail && !match.matchedByUserId) {
    return;
  }

  const client = await getPostgresPool().connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query<{ enabled: boolean; revoked_at: Date | string | null }>(
      `
        SELECT enabled, revoked_at
        FROM platform_admins
        WHERE user_id = $1
        LIMIT 1
      `,
      [user.id],
    );
    const current = existing.rows[0];
    if (current?.enabled && !current.revoked_at) {
      await client.query('COMMIT');
      return;
    }

    await client.query(
      `
        INSERT INTO platform_admins (user_id, role, enabled, granted_by, granted_at, revoked_by, revoked_at)
        VALUES ($1, 'super_admin', true, null, now(), null, null)
        ON CONFLICT (user_id)
        DO UPDATE SET
          role = 'super_admin',
          enabled = true,
          granted_by = null,
          granted_at = now(),
          revoked_by = null,
          revoked_at = null
      `,
      [user.id],
    );

    await writePlatformAudit({
      actorUserId: null,
      action: 'platform.super_admin.bootstrap',
      targetUserId: user.id,
      metadata: {
        matchedByEmail: match.matchedByEmail,
        matchedByUserId: match.matchedByUserId,
      },
    }, client);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function listSuperAdmins() {
  const result = await queryPostgres<PlatformAdminRow>(
    `
      SELECT
        p.user_id,
        u.email,
        u.display_name,
        p.role,
        p.enabled,
        p.granted_by,
        p.granted_at,
        p.revoked_by,
        p.revoked_at
      FROM platform_admins p
      JOIN users u ON u.id = p.user_id
      WHERE p.role = 'super_admin'
      ORDER BY p.enabled DESC, p.granted_at ASC
    `,
  );

  return result.rows.map(mapPlatformAdmin);
}

export async function listPlatformUsers() {
  const result = await queryPostgres<PlatformUserRow>(
    `
      SELECT
        id,
        sso_id,
        username,
        display_name,
        email,
        department,
        department_id,
        title,
        mobile,
        is_active,
        is_admin,
        created_at,
        updated_at
      FROM battleflow_users
      ORDER BY updated_at DESC NULLS LAST,
               created_at DESC NULLS LAST,
               display_name ASC NULLS LAST,
               email ASC NULLS LAST
    `,
  );

  return result.rows.map(mapPlatformUser);
}

export async function updatePlatformUserAdmin(input: {
  actorUserId: string | null;
  targetUserId: string;
  isAdmin: boolean;
}) {
  const targetUserId = input.targetUserId.trim();
  if (!targetUserId) {
    throw new SuperAdminManagementError('Target user ID is required');
  }

  const client = await getPostgresPool().connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<PlatformUserRow>(
      `
        UPDATE battleflow_users
        SET is_admin = $2, updated_at = now()
        WHERE id = $1
        RETURNING
          id,
          sso_id,
          username,
          display_name,
          email,
          department,
          department_id,
          title,
          mobile,
          is_active,
          is_admin,
          created_at,
          updated_at
      `,
      [targetUserId, input.isAdmin],
    );
    const user = result.rows[0];
    if (!user) {
      throw new SuperAdminManagementError('Target user not found', 404);
    }

    await writePlatformAudit({
      actorUserId: input.actorUserId,
      action: input.isAdmin ? 'platform.sso_user_admin.grant' : 'platform.sso_user_admin.revoke',
      targetUserId,
      metadata: {
        targetEmail: user.email,
        targetUsername: user.username,
        targetSsoId: user.sso_id,
      },
    }, client);

    await client.query('COMMIT');
    return mapPlatformUser(user);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function grantSuperAdmin(input: {
  actorUserId: string;
  targetEmail?: string | null;
  targetUserId?: string | null;
}) {
  const targetEmail = input.targetEmail?.trim().toLowerCase() || null;
  const targetUserId = input.targetUserId?.trim() || null;
  if (!targetEmail && !targetUserId) {
    throw new SuperAdminManagementError('Target email or user ID is required');
  }

  const client = await getPostgresPool().connect();
  try {
    await client.query('BEGIN');
    const userResult = await client.query<{ id: string; email: string }>(
      `
        SELECT id, email
        FROM users
        WHERE ($1::varchar IS NOT NULL AND id = $1)
           OR ($2::varchar IS NOT NULL AND lower(email) = $2)
        LIMIT 1
      `,
      [targetUserId, targetEmail],
    );
    const user = userResult.rows[0];
    if (!user) {
      throw new SuperAdminManagementError('Target user not found');
    }

    await client.query(
      `
        INSERT INTO platform_admins (user_id, role, enabled, granted_by, granted_at, revoked_by, revoked_at)
        VALUES ($1, 'super_admin', true, $2, now(), null, null)
        ON CONFLICT (user_id)
        DO UPDATE SET
          role = 'super_admin',
          enabled = true,
          granted_by = $2,
          granted_at = now(),
          revoked_by = null,
          revoked_at = null
      `,
      [user.id, input.actorUserId],
    );

    await writePlatformAudit({
      actorUserId: input.actorUserId,
      action: 'platform.super_admin.grant',
      targetUserId: user.id,
      metadata: { targetEmailProvided: Boolean(targetEmail), targetUserIdProvided: Boolean(targetUserId) },
    }, client);

    await client.query('COMMIT');
    return { userId: user.id, email: user.email };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeSuperAdmin(input: {
  actorUserId: string;
  targetUserId: string;
}) {
  const client = await getPostgresPool().connect();
  try {
    await client.query('BEGIN');
    const target = await client.query<{ enabled: boolean }>(
      `
        SELECT enabled
        FROM platform_admins
        WHERE user_id = $1
          AND role = 'super_admin'
        LIMIT 1
        FOR UPDATE
      `,
      [input.targetUserId],
    );
    const targetRow = target.rows[0];
    if (!targetRow) {
      throw new SuperAdminManagementError('Super admin not found');
    }

    const enabledCount = await countEnabledSuperAdmins(client);
    if (!canRevokeSuperAdmin({ enabledSuperAdminCount: enabledCount, targetEnabled: targetRow.enabled })) {
      throw new SuperAdminManagementError('Cannot revoke the last enabled super admin');
    }

    await client.query(
      `
        UPDATE platform_admins
        SET enabled = false, revoked_by = $2, revoked_at = now()
        WHERE user_id = $1
          AND role = 'super_admin'
      `,
      [input.targetUserId, input.actorUserId],
    );

    await writePlatformAudit({
      actorUserId: input.actorUserId,
      action: 'platform.super_admin.revoke',
      targetUserId: input.targetUserId,
    }, client);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
