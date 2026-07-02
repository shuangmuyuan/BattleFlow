import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class PasswordValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'PasswordValidationError';
    }
  }

  class AuthInputError extends Error {
    status = 400;
  }

  class InvalidCredentialsError extends Error {
    status = 401;
  }

  class AuthError extends Error {
    status = 401;
  }

  return {
    PasswordValidationError,
    AuthInputError,
    InvalidCredentialsError,
    AuthError,
  };
});

vi.mock('@/lib/auth/account-service', () => ({
  AuthInputError: mocks.AuthInputError,
  InvalidCredentialsError: mocks.InvalidCredentialsError,
}));

vi.mock('@/lib/auth/password', () => ({
  PasswordValidationError: mocks.PasswordValidationError,
}));

vi.mock('@/lib/auth/redirect', () => ({
  safeRedirectPath: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  activeOrganizationCookieOptions: vi.fn(),
  authCookieNames: vi.fn(() => ({ session: 'battleflow_session', activeOrganization: 'battleflow_active_org' })),
  expiredCookieOptions: vi.fn(),
  sessionCookieOptions: vi.fn(),
}));

vi.mock('@/lib/auth/types', () => ({
  AuthError: mocks.AuthError,
}));

import { authErrorResponse } from './_shared';

describe('authErrorResponse', () => {
  it('returns a client error for password validation failures', async () => {
    const response = authErrorResponse(new mocks.PasswordValidationError('Password must be at least 8 characters'));

    await expect(response.json()).resolves.toEqual({
      error: 'Password must be at least 8 characters',
    });
    expect(response.status).toBe(400);
  });
});
