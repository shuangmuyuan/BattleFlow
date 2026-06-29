import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canRevokeSuperAdmin,
  isConfiguredSuperAdminPrincipal,
  parseConfiguredSuperAdmins,
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
      emails: ['94399@sangfor.com', 'superadmin@battleflow.local', 'owner@example.com', 'platform@example.com'],
      userIds: ['94399', 'superadmin', 'user-1', 'user-2'],
    });
  });

  it('includes the production SSO and built-in super admin principals', () => {
    const config = parseConfiguredSuperAdmins({});

    expect(config).toEqual({
      emails: ['94399@sangfor.com', 'superadmin@battleflow.local'],
      userIds: ['94399', 'superadmin'],
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

  it('matches SSO principals by the default email, username, or SSO ID', () => {
    vi.stubEnv('BATTLEFLOW_SUPER_ADMIN_EMAILS', '');
    vi.stubEnv('BATTLEFLOW_SUPER_ADMIN_USER_IDS', '');

    expect(isConfiguredSuperAdminPrincipal({ email: '94399@SANGFOR.com' })).toBe(true);
    expect(isConfiguredSuperAdminPrincipal({ username: '94399' })).toBe(true);
    expect(isConfiguredSuperAdminPrincipal({ ssoId: '94399' })).toBe(true);
    expect(isConfiguredSuperAdminPrincipal({ username: 'superadmin' })).toBe(true);
    expect(isConfiguredSuperAdminPrincipal({ email: 'superadmin@battleflow.local' })).toBe(true);
    expect(isConfiguredSuperAdminPrincipal({ email: 'member@sangfor.com', username: '10001' })).toBe(false);
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
});
