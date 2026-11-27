import { InitialSchema1795757960000 } from './1795757960000-initial-schema.js';
import { PlatformSchema1795762406000 } from './1795762406000-platform-schema.js';

/**
 * Every migration, oldest first. Listed explicitly rather than globbed, so the
 * same list works from TypeScript sources and from the compiled build.
 * Append new migrations; never edit one that has shipped.
 */
export const migrations = [
  InitialSchema1795757960000,
  PlatformSchema1795762406000,
];
