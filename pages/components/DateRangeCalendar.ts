import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';

/**
 * Clicks the days of a date range in the calendar that opens from `input` - a TYPED range is ignored by these
 * filters (Formulary lesson, 2026-11-03).
 *
 * Two calendars exist:
 *  - the build of 14 Nov 2026's own `pbm-datepicker` (VERIFIED 23 Nov 2026 on the policy Audit History advanced
 *    search): `.pbm-datepicker__panel` with "Previous Month" / "Next Month" buttons and day cells
 *    `td.pbm-datepicker__day-cell[aria-label="<day>"]`, the other month's days marked `--other-month`;
 *  - the earlier PrimeNG one (`.p-datepicker-panel`), still used where a screen was not rebuilt.
 * Waiting for only the PrimeNG panel left 19611, 19630 and 19640 at "the date picker should open" (23 Nov 2026).
 *
 * locator-exception: neither calendar gives its panel or day cells ids; they are read inside the open panel,
 * which is reached from the field.
 */
export async function clickDateRange(page: Page, input: Locator, days: readonly Date[]): Promise<void> {
  await input.click();
  const panel = page.locator('.pbm-datepicker__panel, .p-datepicker-panel, .p-datepicker').filter({ visible: true }).first();
  await expect(panel, 'the date picker should open').toBeVisible({ timeout: Timeouts.default });
  const pbm = await panel.evaluate((el) => el.classList.contains('pbm-datepicker__panel'));
  let shown = new Date();
  for (const day of days) {
    const months = (day.getFullYear() - shown.getFullYear()) * 12 + day.getMonth() - shown.getMonth();
    for (let i = 0; i < Math.abs(months); i += 1) {
      const arrow = pbm
        ? panel.locator(`button[aria-label="${months > 0 ? 'Next Month' : 'Previous Month'}"]`)
        : panel.locator(months > 0 ? '.p-datepicker-next, .p-datepicker-next-button' : '.p-datepicker-prev, .p-datepicker-prev-button');
      await arrow.first().click();
    }
    shown = day;
    const cell = pbm
      ? panel.locator(`td.pbm-datepicker__day-cell:not(.pbm-datepicker__day-cell--other-month)[aria-label="${day.getDate()}"]`)
      : panel.locator('td:not(.p-datepicker-other-month) span').filter({ hasText: new RegExp(`^\\s*${day.getDate()}\\s*$`) });
    await cell.first().click();
  }
  if (await panel.isVisible().catch(() => false)) await input.click();
}
