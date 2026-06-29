import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isConfiguredSuperAdminPrincipal } from './auth/super-admins';
import { queryPostgres } from '../storage/database/postgres-client';

const stateMaxAgeSeconds = 600;
const defaultTokenMaxAgeSeconds = 24 * 60 * 60;

export const battleflowAuthCookieName = 'battleflow_access_token';

export interface BattleFlowUser {
  id: string;
  sso_id: string;
  username: string;
  display_name?: string | null;
  email?: string | null;
  department?: string | null;
  department_id?: string | null;
  title?: string | null;
  mobile?: string | null;
  is_active: boolean;
  is_admin: boolean;
  created_at?: string;
  updated_at?: string | null;
}

interface StatePayload {
  nonce: string;
  redirectUri: string;
  nextPath?: string;
  iat: number;
}

interface JwtPayload {
  sub: string;
  iat: number;
  exp: number;
}

function getSecret() {
  return process.env.BATTLEFLOW_AUTH_SECRET || process.env.SECRET_KEY || 'battleflow-local-auth-secret-change-me';
}

function base64UrlEncode(value: Buffer | string) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlJson(value: unknown) {
  return base64UrlEncode(JSON.stringify(value));
}

function hmac(value: string) {
  return createHmac('sha256', getSecret()).update(value).digest('base64url');
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function parseJsonPart<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

export function createSsoState(redirectUri: string, nextPath?: string) {
  const payload: StatePayload = {
    nonce: randomBytes(16).toString('base64url'),
    redirectUri,
    ...(nextPath ? { nextPath } : {}),
    iat: Math.floor(Date.now() / 1000),
  };
  const body = base64UrlJson(payload);
  return `${body}.${hmac(body)}`;
}

export function verifySsoState(state: string): StatePayload | null {
  const [body, signature] = state.split('.');
  if (!body || !signature || !safeEqual(hmac(body), signature)) return null;
  const payload = parseJsonPart<StatePayload>(body);
  if (!payload?.redirectUri || !payload.iat) return null;
  if (Math.floor(Date.now() / 1000) - payload.iat > stateMaxAgeSeconds) return null;
  return payload;
}

export function getTokenMaxAgeSeconds() {
  const configured = Number.parseInt(process.env.BATTLEFLOW_AUTH_TOKEN_MAX_AGE_SECONDS || '', 10);
  return Number.isFinite(configured) && configured > 0 ? configured : defaultTokenMaxAgeSeconds;
}

export function createSessionToken(userId: string) {
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    sub: userId,
    iat: now,
    exp: now + getTokenMaxAgeSeconds(),
  };
  const header = base64UrlJson({ alg: 'HS256', typ: 'JWT' });
  const body = base64UrlJson(payload);
  return `${header}.${body}.${hmac(`${header}.${body}`)}`;
}

export function verifySessionToken(token: string): JwtPayload | null {
  const [header, body, signature] = token.split('.');
  if (!header || !body || !signature || !safeEqual(hmac(`${header}.${body}`), signature)) return null;
  const payload = parseJsonPart<JwtPayload>(body);
  if (!payload?.sub || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function getString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function normalizeIdTrustUser(raw: unknown) {
  const record = toRecord(raw);
  const rawProfile = toRecord(record.raw_profile);
  const profileRecord = Object.keys(rawProfile).length > 0 ? { ...record, ...rawProfile } : record;
  const storedRawProfile = Object.keys(rawProfile).length > 0 ? rawProfile : record;
  const ssoId = getString(profileRecord, [
    'sub_account',
    'subAccount',
    'sso_id',
    'ssoId',
    'name',
    'id',
    'user_id',
    'userid',
    'uid',
    'account',
    'username',
    'login_name',
    'employee_id',
  ]);
  const displayName = getString(profileRecord, [
    'display_name',
    'displayName',
    'real_name',
    'realName',
    'nick_name',
    'nickname',
    'cn',
    'name',
  ]);
  const username = getString(profileRecord, [
    'sub_account',
    'subAccount',
    'username',
    'account',
    'login_name',
    'loginName',
    'name',
  ]) || ssoId || displayName;
  const email = getString(profileRecord, ['email', 'mail', 'user_email', 'email_address']);
  const department = getString(profileRecord, ['dept', 'dept_name', 'deptName', 'department', 'department_name', 'departmentName', 'org_name', 'organization']);
  const departmentId = getString(profileRecord, ['department_id', 'departmentId', 'dept_id', 'deptId', 'org_id', 'organization_id']);
  const title = getString(profileRecord, ['title', 'job_title', 'jobTitle', 'position']);
  const mobile = getString(profileRecord, ['mobile', 'phone', 'telephone', 'phone_number']);

  return {
    ssoId,
    username,
    displayName,
    email,
    department,
    departmentId,
    title,
    mobile,
    rawProfile: storedRawProfile,
  };
}

export async function upsertSsoUser(profile: ReturnType<typeof normalizeIdTrustUser>): Promise<BattleFlowUser> {
  if (!profile.ssoId) {
    throw new Error('SSO user profile is missing a stable user id');
  }

  const isAdmin = isConfiguredSuperAdminPrincipal({
    email: profile.email,
    username: profile.username,
    ssoId: profile.ssoId,
    userId: profile.ssoId,
  });

  const result = await queryPostgres<BattleFlowUser>(`
    INSERT INTO battleflow_users (
      sso_id,
      username,
      display_name,
      email,
      department,
      department_id,
      title,
      mobile,
      raw_profile,
      is_admin,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, now(), now())
    ON CONFLICT (sso_id) DO UPDATE SET
      username = EXCLUDED.username,
      display_name = EXCLUDED.display_name,
      email = EXCLUDED.email,
      department = EXCLUDED.department,
      department_id = EXCLUDED.department_id,
      title = EXCLUDED.title,
      mobile = EXCLUDED.mobile,
      raw_profile = EXCLUDED.raw_profile,
      is_admin = battleflow_users.is_admin OR EXCLUDED.is_admin,
      updated_at = now()
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
      created_at::text,
      updated_at::text
  `, [
    profile.ssoId,
    profile.username,
    profile.displayName || null,
    profile.email || null,
    profile.department || null,
    profile.departmentId || null,
    profile.title || null,
    profile.mobile || null,
    JSON.stringify(profile.rawProfile),
    isAdmin,
  ]);

  return result.rows[0];
}

export async function getUserBySessionToken(token: string): Promise<BattleFlowUser | null> {
  const payload = token ? verifySessionToken(token) : null;
  if (!payload?.sub) {
    return null;
  }

  return getUserById(payload.sub);
}

export async function getUserById(id: string): Promise<BattleFlowUser | null> {
  const result = await queryPostgres<BattleFlowUser>(`
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
      created_at::text,
      updated_at::text
    FROM battleflow_users
    WHERE id = $1
    LIMIT 1
  `, [id]);
  return result.rows[0] || null;
}

export function publicUser(user: BattleFlowUser) {
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    email: user.email,
    department: user.department,
    department_id: user.department_id,
    title: user.title,
    mobile: user.mobile,
    is_admin: user.is_admin,
  };
}
