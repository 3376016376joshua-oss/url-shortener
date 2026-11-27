import { z } from 'zod';

/** Decorator options for a path parameter that must be a UUID (else 400). */
export const UUID_PARAM = { schema: z.uuid() };
