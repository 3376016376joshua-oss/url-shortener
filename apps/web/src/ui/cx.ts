/** Joins class names, skipping the ones a condition switched off. */
export function cx(
  ...parts: ReadonlyArray<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(' ');
}
