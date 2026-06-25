import { describe, expect, it } from 'vitest';
import { hashPassword, PasswordValidationError, verifyPassword } from './password';

describe('password hashing', () => {
  it('hashes passwords without storing plaintext and verifies matches', async () => {
    const password = 'correct horse battery staple';
    const hash = await hashPassword(password);

    expect(hash).not.toContain(password);
    expect(hash.startsWith('scrypt$')).toBe(true);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong password', hash)).resolves.toBe(false);
  });

  it('rejects short passwords', async () => {
    await expect(hashPassword('short')).rejects.toBeInstanceOf(PasswordValidationError);
  });
});
