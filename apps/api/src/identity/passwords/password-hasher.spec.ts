import { describe, expect, it } from 'vitest';
import { PasswordHasher } from './password-hasher.js';

const PASSWORD = 'correct horse battery';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('produces an Argon2id PHC string that carries its own parameters', async () => {
    const hash = await hasher.hash(PASSWORD);

    expect(hash).toMatch(
      /^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/,
    );
  });

  it('salts every hash', async () => {
    expect(await hasher.hash(PASSWORD)).not.toBe(await hasher.hash(PASSWORD));
  });

  it('verifies the right password and refuses a wrong one', async () => {
    const hash = await hasher.hash(PASSWORD);

    expect(await hasher.verify(PASSWORD, hash)).toBe(true);
    expect(await hasher.verify(`${PASSWORD}!`, hash)).toBe(false);
  });

  it('verifies a hash made with other cost parameters', async () => {
    // "password" under m=8 KiB, t=1, p=1: cheaper than what we issue today.
    const weaker =
      '$argon2id$v=19$m=8,t=1,p=1$c29tZXNhbHRzb21lc2FsdA$' +
      (await cheapHash());

    expect(await hasher.verify('password', weaker)).toBe(true);
    expect(await hasher.verify('passw0rd', weaker)).toBe(false);
  });

  it.each(['', 'not-a-real-hash', '$argon2i$v=19$m=8,t=1,p=1$c2FsdA$aGFzaA'])(
    'refuses %j, which is not one of its hashes',
    async (stored) => {
      expect(await hasher.verify(PASSWORD, stored)).toBe(false);
    },
  );

  it('checks a password against nothing without throwing', async () => {
    await expect(
      hasher.verifyAgainstNothing(PASSWORD),
    ).resolves.toBeUndefined();
  });
});

async function cheapHash(): Promise<string> {
  const { argon2Sync } = await import('node:crypto');
  return argon2Sync('argon2id', {
    message: Buffer.from('password'),
    nonce: Buffer.from('c29tZXNhbHRzb21lc2FsdA', 'base64'),
    parallelism: 1,
    tagLength: 32,
    memory: 8,
    passes: 1,
  })
    .toString('base64')
    .replace(/=+$/, '');
}
