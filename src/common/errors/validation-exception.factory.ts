import { HttpStatus } from '@nestjs/common';
import { ApiException } from './api-exception.js';
import { ErrorCode } from './error-code.js';

type PathSegment = PropertyKey | { readonly key: PropertyKey };

export interface ValidationIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PathSegment> | undefined;
}

function formatIssue(issue: ValidationIssue): string {
  const path = (issue.path ?? [])
    .map((segment) => (typeof segment === 'object' ? segment.key : segment))
    .map(String)
    .join('.');
  return path === '' ? issue.message : `${path}: ${issue.message}`;
}

/** Turns schema validation issues into the API's 400 error body. */
export function createValidationException(
  issues: ReadonlyArray<ValidationIssue>,
): ApiException {
  return new ApiException(
    HttpStatus.BAD_REQUEST,
    ErrorCode.ValidationFailed,
    issues.map(formatIssue).join('; '),
  );
}
