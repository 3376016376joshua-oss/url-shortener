import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  BASE62_ALPHABET,
  GENERATED_CODE_LENGTH,
} from '../common/link/short-code.js';

/** Where generated short codes come from: a CSPRNG, so they cannot be guessed. */
@Injectable()
export class CodeGenerator {
  generate(): string {
    return Array.from(
      { length: GENERATED_CODE_LENGTH },
      () => BASE62_ALPHABET[randomInt(BASE62_ALPHABET.length)],
    ).join('');
  }
}
