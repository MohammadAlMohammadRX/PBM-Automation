/**
 * Utilities for generating unique, VALID test data.
 * These generators never produce intentionally invalid data - negative tests
 * should build invalid values explicitly and locally, near the test that
 * needs them, so the intent is obvious.
 */
export class RandomDataUtils {
  private static randomAlphaNumeric(length: number): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i += 1) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /** Unique suffix suitable for appending to names/codes, e.g. "msc9f2ak1lz". */
  static uniqueSuffix(): string {
    return `${Date.now().toString(36)}${this.randomAlphaNumeric(4)}`;
  }

  /** Generates a unique, realistic payer name, e.g. "Automation Payer msc9f2ak1lz". */
  static uniquePayerName(prefix = 'Automation Payer'): string {
    return `${prefix} ${this.uniqueSuffix()}`;
  }

  /** Generates a unique, realistic network name. */
  static uniqueNetworkName(prefix = 'Automation Network'): string {
    return `${prefix} ${this.uniqueSuffix()}`;
  }

  /** Generates a unique, realistic user full name. */
  static uniqueUserName(prefix = 'Automation User'): string {
    return `${prefix} ${this.uniqueSuffix()}`;
  }

  /** Generates a unique, deliverable-looking email address. */
  static uniqueEmail(domain = 'example.com'): string {
    return `automation.${this.uniqueSuffix()}@${domain}`;
  }

  /** Generates a unique license/reference number, e.g. "LIC-AUTO-msc9f2ak1lz". */
  static uniqueLicenseNumber(): string {
    return `LIC-AUTO-${this.uniqueSuffix()}`;
  }

  /** Generates a valid-looking Saudi mobile number, e.g. "+966 512345678". */
  static validSaudiMobileNumber(): string {
    const subscriber = Math.floor(100000000 + Math.random() * 899999999);
    return `+966 5${String(subscriber).slice(0, 8)}`;
  }

  /** Picks a random element from a non-empty array. */
  static pickOne<T>(values: readonly T[]): T {
    if (values.length === 0) {
      throw new Error('[RandomDataUtils] pickOne() requires a non-empty array.');
    }
    return values[Math.floor(Math.random() * values.length)];
  }
}
