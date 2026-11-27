/**
 * Shares one run of a load between every caller that asks for the same key
 * while it is in progress, so a burst of requests for one uncached link costs
 * one database read instead of one each. Nothing is kept once a load settles.
 */
export class SingleFlight<T> {
  private readonly inFlight = new Map<string, Promise<T>>();

  run(key: string, load: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const flight = load().finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, flight);
    return flight;
  }
}
