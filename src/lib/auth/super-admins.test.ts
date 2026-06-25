import { describe, expect, it } from 'vitest';
import {
  canRevokeSuperAdmin,
  parseConfiguredSuperAdmins,
  userMatchesConfiguredSuperAdmin,
} from './super-admins';

describe('super admin management helpers', () => {
  it('parses configured bootstrap principals without leaking raw environment strings', () => {
    const config = parseConfiguredSuperAdmins({
      BATTLEFLOW_SUPER_ADMIN_EMAILS: ' Owner@Example.com,owner@example.com, platform@example.com ',
      BATTLEFLOW_SUPER_ADMIN_USER_IDS: 'user-1,user-2,user-1',
    });

    expect(config).toEqual({
      emails: ['owner@example.com', 'platform@example.com'],
      userIds: ['user-1', 'user-2'],
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
