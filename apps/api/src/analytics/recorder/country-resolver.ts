/** Turns an IP address into a country without the address leaving the process. */
export abstract class CountryResolver {
  /** ISO 3166-1 alpha-2, or `ZZ` when unknown. Synchronous; never throws. */
  abstract resolve(ip: string): string;
}
