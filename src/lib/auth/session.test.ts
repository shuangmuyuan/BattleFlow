import { describe, expect, it } from 'vitest';
import { activeOrganizationCookieOptions, createSessionToken, hashToken, sessionCookieOptions } from './session';

describe('session helpers', () => {
  it('creates non-plaintext token hashes', () => {
    const token = createSessionToken();
    const hash = hashToken(token);

    expect(token).not.toHaveLength(0);
    expect(hash).toHaveLength(64);
    expect(hash).not.toBe(token);
  });

  it('sets auth cookies as HttpOnly SameSite Lax cookies', () => {
    const expires = new Date('2030-01-01T00:00:00Z');

    expect(sessionCookieOptions(expires)).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      expires,
    });
    expect(activeOrganizationCookieOptions(expires)).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      expires,
    });
  });
});
