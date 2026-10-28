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
  /**
   * Converts the wizard's `DD/MM/YYYY` into the ISO `YYYY-MM-DD` the DETAIL
   * screen renders.
   *
   * The two surfaces disagree, which is easy to miss and produced four
   * identical failures before it was spotted: the Add/Edit wizard both accepts
   * and displays `10/09/2026`, while the payer's Overview tab shows the same
   * date as `2026-09-10`. So a test that sets a date through the form and reads
   * it back from the detail screen has to convert, or it compares two correct
   * values and calls them different.
   *
   * Deliberately strict: an input that is not `DD/MM/YYYY` throws rather than
   * silently returning something plausible, because a quietly mangled date
   * would turn into a confusing assertion failure somewhere else entirely.
   */
  static toIsoDate(ddmmyyyy: string): string {
    const match = ddmmyyyy.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) {
      throw new Error(
        `[DateUtils] Expected a DD/MM/YYYY date, got "${ddmmyyyy}". The wizard uses that `
          + 'format; the detail screen uses YYYY-MM-DD.',
      );
    }
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
  }

  /**
   * Any date the screens show, as "DD/MM/YYYY". The payer detail screen showed
   * "YYYY-MM-DD" until it began showing "DD/MM/YYYY HH:mm" (on or before
   * 2026-10-27); both, and a bare "DD/MM/YYYY", are accepted so a case compares
   * the calendar day only.
   */
  static toDisplayDate(value: string): string {
    const text = value.trim();
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    const display = text.match(/^(\d{2}\/\d{2}\/\d{4})/);
    if (display) return display[1];
    throw new Error(`[DateUtils] Expected a YYYY-MM-DD or DD/MM/YYYY date, got "${value}".`);
  }

  static timestampForFilename(date: Date = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_` +
      `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
    );
  }
}
