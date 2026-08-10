/**
 * Reusable date helpers for test data generation and assertions.
 * Kept intentionally small - only what the framework actually needs.
 */
export class DateUtils {
  /** Returns today's date formatted as DD/MM/YYYY (matches PBM UI date format). */
  static todayFormatted(): string {
    return DateUtils.formatDate(new Date());
  }

  static formatDate(date: Date): string {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  /** Returns a date `days` in the future, formatted as DD/MM/YYYY. */
  static futureDate(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return DateUtils.formatDate(date);
  }

  /** Returns a date `days` in the past, formatted as DD/MM/YYYY. */
  static pastDate(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return DateUtils.formatDate(date);
  }

  /** Returns a filesystem-safe timestamp, e.g. 2026-08-10_09-30-00. */
  static timestampForFilename(date: Date = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_` +
      `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
    );
  }
}
