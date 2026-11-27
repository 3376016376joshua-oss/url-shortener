import type { ParameterDecoratorOptions } from '@nestjs/common';
import { z } from 'zod';

/**
 * For path parameters that are ids: `@Param('workspaceId', uuidParam)`.
 * Anything else is a 400 before it can reach a query.
 */
export const uuidParam: ParameterDecoratorOptions = { schema: z.uuid() };
