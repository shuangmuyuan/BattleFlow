import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canRevokeSuperAdmin,
  isConfiguredSuperAdminPrincipal,
  parseConfiguredSuperAdmins,
  shouldBootstrapConfiguredSuperAdmin,
  userMatchesConfiguredSuperAdmin,
} from './super-admins';

describe('super admin management helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('parses configured bootstrap principals without leaking raw environment strings', () => {
    const config = parseConfiguredSuperAdmins({
      BATTLEFLOW_SUPER_ADMIN_EMAILS: ' Owner@Example.com,owner@example.com, platform@example.com ',
      BATTLEFLOW_SUPER_ADMIN_USER_IDS: 'user-1,user-2,user-1',
    });

    expect(config).toEqual({
      emails: ['superadmin@battleflow.local', 'owner@example.com', 'platform@example.com'],
      userIds: ['superadmin', 'user-1', 'user-2'],
    });
  });

  it('includes only the built-in super admin principal by default', () => {
    const config = parseConfiguredSuperAdmins({});

    expect(config).toEqual({
      emails: ['superadmin@battleflow.local'],
      userIds: ['superadmin'],
    });
  });

  it('matches configured users by normalized email or exact user ID', () => {
    const config = parseConfiguredSuperAdmins({
      BATTLEFLOW_SUPER_ADMIN_EMAILS: 'owner@example.com',
      BATTLEFLOW_SUPER_ADMIN_USER_IDS: 'user-2',
    });

    expect(userMatchesConfiguredSuperAdmin({
      id: 'user-1',
      email: 'OWNER@example.com',
    }, config)).toEqual({
      matchedByEmail: true,
      matchedByUserId: false,
    });

    expect(userMatchesConfiguredSuperAdmin({
      id: 'user-2',
      email: 'member@example.com',
    }, config)).toEqual({
      matchedByEmail: false,
      matchedByUserId: true,
    });
  });

  it('matches configured SSO principals by email, username, or SSO ID', () => {
    vi.stubEnv('BATTLEFLOW_SUPER_ADMIN_EMAILS', '94399@sangfor.com');
    vi.stubEnv('BATTLEFLOW_SUPER_ADMIN_USER_IDS', '94399');

    expect(isConfiguredSuperAdminPrincipal({ email: '94399@SANGFOR.com' })).toBe(true);
    expect(isConfiguredSuperAdminPrincipal({ username: '94399' })).toBe(true);
    expect(isConfiguredSuperAdminPrincipal({ ssoId: '94399' })).toBe(true);
    expect(isConfiguredSuperAdminPrincipal({ email: 'member@sangfor.com', username: '10001' })).toBe(false);
  });

  it('matches the built-in super admin principal by default', () => {
    vi.stubEnv('BATTLEFLOW_SUPER_ADMIN_EMAILS', '');
    vi.stubEnv('BATTLEFLOW_SUPER_ADMIN_USER_IDS', '');

    expect(isConfiguredSuperAdminPrincipal({ username: 'superadmin' })).toBe(true);
    expect(isConfiguredSuperAdminPrincipal({ email: 'superadmin@battleflow.local' })).toBe(true);
    expect(isConfiguredSuperAdminPrincipal({ username: '94399' })).toBe(false);
  });

  it('prevents revoking the last enabled super admin', () => {
    expect(canRevokeSuperAdmin({
      enabledSuperAdminCount: 1,
      targetEnabled: true,
    })).toBe(false);

    expect(canRevokeSuperAdmin({
      enabledSuperAdminCount: 2,
      targetEnabled: true,
    })).toBe(true);

    expect(canRevokeSuperAdmin({
      enabledSuperAdminCount: 1,
      targetEnabled: false,
    })).toBe(true);
  });

  it('does not bootstrap a configured super admin after explicit revoke', () => {
    expect(shouldBootstrapConfiguredSuperAdmin(null)).toBe(true);
    expect(shouldBootstrapConfiguredSuperAdmin({ enabled: true, revoked_at: null })).toBe(false);
    expect(shouldBootstrapConfiguredSuperAdmin({ enabled: false, revoked_at: null })).toBe(true);
    expect(shouldBootstrapConfiguredSuperAdmin({ enabled: false, revoked_at: new Date() })).toBe(false);
  });
});
