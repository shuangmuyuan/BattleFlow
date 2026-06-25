import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const PASSWORD_PREFIX = 'scrypt';
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const SCRYPT_OPTIONS = {
  N: 2 ** 15,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};

export class PasswordValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasswordValidationError';
  }
}

export function assertPasswordAllowed(password: string): void {
  if (password.length < 8) {
    throw new PasswordValidationError('Password must be at least 8 characters');
  }
}

async function derivePasswordKey(
  password: string,
  salt: string,
  options: typeof SCRYPT_OPTIONS = SCRYPT_OPTIONS,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(Buffer.from(derivedKey));
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  assertPasswordAllowed(password);

  const salt = randomBytes(SALT_BYTES).toString('base64url');
  const key = await derivePasswordKey(password, salt);
  return [
    PASSWORD_PREFIX,
    SCRYPT_OPTIONS.N,
    SCRYPT_OPTIONS.r,
    SCRYPT_OPTIONS.p,
    salt,
    key.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [prefix, nValue, rValue, pValue, salt, expectedValue] = storedHash.split('$');
  if (prefix !== PASSWORD_PREFIX || !nValue || !rValue || !pValue || !salt || !expectedValue) {
    return false;
  }

  const options = {
    N: Number.parseInt(nValue, 10),
    r: Number.parseInt(rValue, 10),
    p: Number.parseInt(pValue, 10),
    maxmem: SCRYPT_OPTIONS.maxmem,
  };

  if (!Number.isFinite(options.N) || !Number.isFinite(options.r) || !Number.isFinite(options.p)) {
    return false;
  }

  const expected = Buffer.from(expectedValue, 'base64url');
  const actual = await derivePasswordKey(password, salt, options);

  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(actual, expected);
}
