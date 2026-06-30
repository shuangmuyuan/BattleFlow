import type { PoolClient, QueryResultRow } from 'pg';
import { getPostgresPool, hasPostgresDatabaseConfig } from '@/storage/database/postgres-client';
import { assertPasswordAllowed, hashPassword, verifyPassword } from './password';
import { createSessionExpiration, createSessionToken, hashToken } from './session';
import { builtInSuperAdminPrincipal } from './super-admins';
import { AuthConfigError, type AuthUser } from './types';

const MAX_FAILED_ATTEMPTS = 8;
const LOCK_MINUTES = 15;
const BUILT_IN_SUPER_ADMIN_PASSWORD = 'BattleFlow@2026.uuid64';
const DEFAULT_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_ORGANIZATION_NAME = 'Default Organization';
const DEFAULT_ORGANIZATION_SLUG = 'default';

export class AuthInputError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = 'AuthInputError';
  }
}

export class InvalidCredentialsError extends Error {
  readonly status = 401;

  constructor() {
    super('Invalid email or password');
    this.name = 'InvalidCredentialsError';
  }
}

interface UserRow extends QueryResultRow {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  status: string;
}

interface CredentialRow extends QueryResultRow {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  status: string;
  password_hash: string;
  failed_attempt_count: number;
  locked_until: Date | string | null;
}

interface AuthSessionIssue {
  token: string;
  expiresAt: Date;
}

export interface AuthFlowResult {
  user: AuthUser;
  session: AuthSessionIssue;
  activeOrganizationId: string | null;
}

export interface RegisterAccountInput {
  email: string;
  password: string;
  displayName?: string | null;
  organizationName?: string | null;
  organizationSlug?: string | null;
}

export interface LoginAccountInput {
  email: string;
  password: string;
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!normalized || normalized.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new AuthInputError('Valid email is required');
  }
  return normalized;
}

function normalizeOptionalText(value: string | null | undefined, maxLength: number): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, maxLength);
}

function displayNameFromEmail(email: string): string {
  return email.split('@')[0]?.slice(0, 128) || 'BattleFlow User';
}

function isBuiltInSuperAdminIdentifier(identifier: string): boolean {
  const normalized = identifier.trim().toLowerCase();
  return normalized === builtInSuperAdminPrincipal.username
    || normalized === builtInSuperAdminPrincipal.email;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'organization';
}

function toDate(value: Date | string | null): Date | null {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value : new Date(value);
}

function mapUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    status: row.status,
  };
}

async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!hasPostgresDatabaseConfig()) {
    throw new AuthConfigError();
  }

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

async function makeUniqueOrganizationSlug(
  client: PoolClient,
  organizationName: string,
  preferredSlug?: string | null,
): Promise<string> {
  const base = slugify(preferredSlug || organizationName);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = attempt === 0 ? '' : `-${attempt + 1}`;
    const candidate = `${base}${suffix}`.slice(0, 64);
    const existing = await client.query('SELECT 1 FROM organizations WHERE slug = $1 LIMIT 1', [candidate]);
    if (existing.rowCount === 0) {
      return candidate;
    }
  }

  throw new AuthInputError('Unable to create a unique organization slug');
}

async function createSessionWithClient(client: PoolClient, userId: string): Promise<AuthSessionIssue> {
  const token = createSessionToken();
  const expiresAt = createSessionExpiration();

  await client.query(
    `
      INSERT INTO user_sessions (user_id, session_token_hash, expires_at, created_at, last_seen_at)
      VALUES ($1, $2, $3, now(), now())
    `,
    [userId, hashToken(token), expiresAt],
  );

  return {
    token,
    expiresAt,
  };
}

async function createOwnedOrganizationWithClient(
  client: PoolClient,
  userId: string,
  organizationName: string,
  organizationSlug?: string | null,
): Promise<string> {
  const name = normalizeOptionalText(organizationName, 128);
  if (!name) {
    throw new AuthInputError('Organization name is required');
  }

  const slug = await makeUniqueOrganizationSlug(client, name, organizationSlug);
  const organizationResult = await client.query<{ id: string }>(
    `
      INSERT INTO organizations (name, slug, status, settings, created_by, created_at, updated_at)
      VALUES ($1, $2, 'active', '{}'::jsonb, $3, now(), now())
      RETURNING id
    `,
    [name, slug, userId],
  );
  const organizationId = organizationResult.rows[0]?.id;
  if (!organizationId) {
    throw new AuthInputError('Unable to create organization');
  }

  await client.query(
    `
      INSERT INTO organization_members (organization_id, user_id, role, status, joined_at, updated_at)
      VALUES ($1, $2, 'org_owner', 'active', now(), now())
      ON CONFLICT (organization_id, user_id)
      DO UPDATE SET role = 'org_owner', status = 'active', updated_at = now()
    `,
    [organizationId, userId],
  );

  return organizationId;
}

async function ensureBuiltInSuperAdminOrganization(client: PoolClient, userId: string): Promise<string> {
  const existing = await client.query<{ id: string }>(
    `
      SELECT id
      FROM organizations
      WHERE id = $1 OR slug = $2
      ORDER BY CASE WHEN id = $1 THEN 0 ELSE 1 END
      LIMIT 1
    `,
    [DEFAULT_ORGANIZATION_ID, DEFAULT_ORGANIZATION_SLUG],
  );

  const organizationId = existing.rows[0]?.id ?? DEFAULT_ORGANIZATION_ID;
  if (existing.rowCount && existing.rowCount > 0) {
    await client.query(
      `
        UPDATE organizations
        SET status = 'active',
            settings = COALESCE(settings, '{}'::jsonb),
            updated_at = now()
        WHERE id = $1
      `,
      [organizationId],
    );
  } else {
    await client.query(
      `
        INSERT INTO organizations (id, name, slug, description, status, settings, created_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 'active', '{}'::jsonb, $5, now(), now())
      `,
      [
        organizationId,
        DEFAULT_ORGANIZATION_NAME,
        DEFAULT_ORGANIZATION_SLUG,
        'Default BattleFlow organization for built-in platform administration.',
        userId,
      ],
    );
  }

  await client.query(
    `
      INSERT INTO organization_members (organization_id, user_id, role, status, joined_at, updated_at)
      VALUES ($1, $2, 'org_owner', 'active', now(), now())
      ON CONFLICT (organization_id, user_id)
      DO UPDATE SET role = 'org_owner', status = 'active', updated_at = now()
    `,
    [organizationId, userId],
  );

  return organizationId;
}

async function fetchFirstMembershipOrganizationId(client: PoolClient, userId: string): Promise<string | null> {
  const result = await client.query<{ organization_id: string }>(
    `
      SELECT m.organization_id
      FROM organization_members m
      JOIN organizations o ON o.id = m.organization_id
      WHERE m.user_id = $1
        AND m.status = 'active'
        AND o.status = 'active'
      ORDER BY m.joined_at ASC
      LIMIT 1
    `,
    [userId],
  );

  return result.rows[0]?.organization_id ?? null;
}

export async function registerAccount(input: RegisterAccountInput): Promise<AuthFlowResult> {
  const email = normalizeEmail(input.email);
  assertPasswordAllowed(input.password);
  const displayName = normalizeOptionalText(input.displayName, 128) || displayNameFromEmail(email);
  const organizationName = normalizeOptionalText(input.organizationName, 128);

  if (!organizationName) {
    throw new AuthInputError('Organization name is required');
  }

  return withTransaction(async (client) => {
    const existing = await client.query('SELECT 1 FROM users WHERE email = $1 LIMIT 1', [email]);
    if (existing.rowCount && existing.rowCount > 0) {
      throw new AuthInputError('Unable to create account');
    }

    const passwordHash = await hashPassword(input.password);
    const userResult = await client.query<UserRow>(
      `
        INSERT INTO users (email, display_name, status, created_at, updated_at)
        VALUES ($1, $2, 'active', now(), now())
        RETURNING id, email, display_name, avatar_url, status
      `,
      [email, displayName],
    );
    const user = userResult.rows[0];
    if (!user) {
      throw new AuthInputError('Unable to create account');
    }

    await client.query(
      `
        INSERT INTO user_password_credentials (user_id, password_hash, password_updated_at, created_at, updated_at)
        VALUES ($1, $2, now(), now(), now())
      `,
      [user.id, passwordHash],
    );

    const activeOrganizationId = await createOwnedOrganizationWithClient(
      client,
      user.id,
      organizationName,
      input.organizationSlug,
    );

    return {
      user: mapUser(user),
      session: await createSessionWithClient(client, user.id),
      activeOrganizationId,
    };
  });
}

async function recordFailedLogin(client: PoolClient, userId: string, failedAttemptCount: number): Promise<void> {
  const nextCount = failedAttemptCount + 1;
  const shouldLock = nextCount >= MAX_FAILED_ATTEMPTS;

  await client.query(
    `
      UPDATE user_password_credentials
      SET
        failed_attempt_count = $2,
        locked_until = CASE WHEN $3 THEN now() + ($4::text || ' minutes')::interval ELSE locked_until END,
        updated_at = now()
      WHERE user_id = $1
    `,
    [userId, nextCount, shouldLock, LOCK_MINUTES],
  );
}

async function loginBuiltInSuperAdmin(): Promise<AuthFlowResult> {
  return withTransaction(async (client) => {
    const passwordHash = await hashPassword(BUILT_IN_SUPER_ADMIN_PASSWORD);
    const userResult = await client.query<UserRow>(
      `
        INSERT INTO users (id, email, display_name, status, created_at, updated_at)
        VALUES ($1, $2, $3, 'active', now(), now())
        ON CONFLICT (id)
        DO UPDATE SET
          email = EXCLUDED.email,
          display_name = EXCLUDED.display_name,
          status = 'active',
          updated_at = now()
        RETURNING id, email, display_name, avatar_url, status
      `,
      [
        builtInSuperAdminPrincipal.userId,
        builtInSuperAdminPrincipal.email,
        builtInSuperAdminPrincipal.displayName,
      ],
    );
    const user = userResult.rows[0];
    if (!user) {
      throw new AuthInputError('Unable to create account');
    }

    await client.query(
      `
        INSERT INTO user_password_credentials (
          user_id,
          password_hash,
          password_updated_at,
          failed_attempt_count,
          locked_until,
          created_at,
          updated_at
        )
        VALUES ($1, $2, now(), 0, null, now(), now())
        ON CONFLICT (user_id)
        DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          password_updated_at = now(),
          failed_attempt_count = 0,
          locked_until = null,
          updated_at = now()
      `,
      [user.id, passwordHash],
    );

    return {
      user: mapUser(user),
      session: await createSessionWithClient(client, user.id),
      activeOrganizationId: await ensureBuiltInSuperAdminOrganization(client, user.id),
    };
  });
}

export async function loginAccount(input: LoginAccountInput): Promise<AuthFlowResult> {
  if (isBuiltInSuperAdminIdentifier(input.email)) {
    if (input.password !== BUILT_IN_SUPER_ADMIN_PASSWORD) {
      throw new InvalidCredentialsError();
    }
    return loginBuiltInSuperAdmin();
  }

  const email = normalizeEmail(input.email);

  return withTransaction(async (client) => {
    const credentialResult = await client.query<CredentialRow>(
      `
        SELECT
          u.id,
          u.email,
          u.display_name,
          u.avatar_url,
          u.status,
          c.password_hash,
          c.failed_attempt_count,
          c.locked_until
        FROM users u
        JOIN user_password_credentials c ON c.user_id = u.id
        WHERE u.email = $1
        LIMIT 1
      `,
      [email],
    );
    const row = credentialResult.rows[0];

    if (!row || row.status !== 'active') {
      throw new InvalidCredentialsError();
    }

    const lockedUntil = toDate(row.locked_until);
    if (lockedUntil && lockedUntil > new Date()) {
      throw new InvalidCredentialsError();
    }

    const passwordMatches = await verifyPassword(input.password, row.password_hash);
    if (!passwordMatches) {
      await recordFailedLogin(client, row.id, row.failed_attempt_count);
      throw new InvalidCredentialsError();
    }

    await client.query(
      `
        UPDATE user_password_credentials
        SET failed_attempt_count = 0, locked_until = NULL, updated_at = now()
        WHERE user_id = $1
      `,
      [row.id],
    );

    return {
      user: mapUser(row),
      session: await createSessionWithClient(client, row.id),
      activeOrganizationId: await fetchFirstMembershipOrganizationId(client, row.id),
    };
  });
}

export async function createOrganizationForUser(input: {
  userId: string;
  organizationName: string;
  organizationSlug?: string | null;
}): Promise<string> {
  return withTransaction((client) => (
    createOwnedOrganizationWithClient(client, input.userId, input.organizationName, input.organizationSlug)
  ));
}

export async function revokeSessionToken(sessionToken: string): Promise<void> {
  if (!hasPostgresDatabaseConfig()) {
    throw new AuthConfigError();
  }

  await getPostgresPool().query(
    `
      UPDATE user_sessions
      SET revoked_at = now()
      WHERE session_token_hash = $1
        AND revoked_at IS NULL
    `,
    [hashToken(sessionToken)],
  );
}
