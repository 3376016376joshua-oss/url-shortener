import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Injectable } from '@nestjs/common';

const deriveKey = promisify(argon2);

/** OWASP's recommended Argon2id configuration: 19 MiB, 2 passes, 1 lane. */
const MEMORY_KIB = 19_456;
const PASSES = 2;
const PARALLELISM = 1;
const SALT_BYTES = 16;
const HASH_BYTES = 32;
/** Argon2 version 1.3, the only one Node implements. */
const ARGON2_VERSION = 19;

/** The PHC string format, so the parameters travel with every hash. */
const PHC_PATTERN =
  /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

interface Argon2Cost {
  memory: number;
  passes: number;
  parallelism: number;
}

const encode = (bytes: Buffer): string =>
  bytes.toString('base64').replace(/=+$/, '');

function derive(
  password: string,
  salt: Buffer,
  cost: Argon2Cost,
  tagLength: number,
): Promise<Buffer> {
  return deriveKey('argon2id', {
    message: Buffer.from(password, 'utf8'),
    nonce: salt,
    tagLength,
    ...cost,
  });
}

/** Hashes and checks passwords with Argon2id (PRD section 6). */
@Injectable()
export class PasswordHasher {
  private decoyHash: Promise<string> | undefined;

  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const cost = {
      memory: MEMORY_KIB,
      passes: PASSES,
      parallelism: PARALLELISM,
    };
    const hash = await derive(password, salt, cost, HASH_BYTES);
    return (
      `$argon2id$v=${ARGON2_VERSION}` +
      `$m=${cost.memory},t=${cost.passes},p=${cost.parallelism}` +
      `$${encode(salt)}$${encode(hash)}`
    );
  }

  /**
   * False for a wrong password and for anything that is not one of our
   * hashes. The cost is read from the stored hash, so raising the constants
   * above never locks out an existing account.
   */
  async verify(password: string, storedHash: string): Promise<boolean> {
    const match = PHC_PATTERN.exec(storedHash);
    if (match === null) {
      return false;
    }
    const [, memory, passes, parallelism, salt, hash] = match;
    const expected = Buffer.from(hash ?? '', 'base64');
    const actual = await derive(
      password,
      Buffer.from(salt ?? '', 'base64'),
      {
        memory: Number(memory),
        passes: Number(passes),
        parallelism: Number(parallelism),
      },
      expected.length,
    );
    return timingSafeEqual(actual, expected);
  }

  /**
   * Spends the time a real check would, for an account that does not exist,
   * so the response time does not reveal which emails have accounts.
   */
  async verifyAgainstNothing(password: string): Promise<void> {
    this.decoyHash ??= this.hash(randomBytes(SALT_BYTES).toString('hex'));
    await this.verify(password, await this.decoyHash);
  }
}
