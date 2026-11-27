const MS_PER_DAY = 86_400_000;
const DAY_LENGTH = 'YYYY-MM-DD'.length;

/** The UTC calendar day of an instant, as `YYYY-MM-DD`. Analytics days are UTC. */
export function utcDay(instant: Date): string {
  return instant.toISOString().slice(0, DAY_LENGTH);
}

/** The first instant of a UTC day. */
export function startOfUtcDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

export function addDays(day: string, days: number): string {
  return utcDay(new Date(startOfUtcDay(day).getTime() + days * MS_PER_DAY));
}

/** How many days a range spans, counting both ends. */
export function daysInRange(from: string, to: string): number {
  const span = startOfUtcDay(to).getTime() - startOfUtcDay(from).getTime();
  return Math.round(span / MS_PER_DAY) + 1;
}

/** Every day from `from` to `to`, both included, oldest first. */
export function eachDay(from: string, to: string): string[] {
  const length = Math.max(daysInRange(from, to), 0);
  return Array.from({ length }, (_unused, index) => addDays(from, index));
}
