import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { TOAST } from '../../constants/ElementIds';
import { Timeouts } from '../../constants/Timeouts';
import { Logger } from '../../utils/Logger';

/** A toast's two lines, as the application renders them. */
export interface ToastText {
  summary: string;
  detail: string;
}

/**
 * The application's toast notification.
 *
 * BasePage already offers `expectToastContains` for the common case of "some
 * toast mentioning X appeared". This component exists because the
 * creation-toast story asks harder questions than that: the EXACT wording of
 * both lines in both languages, whether the toast auto-dismisses on time,
 * whether it can be dismissed by hand, and whether a toast appears at all when
 * a save is refused. None of those are answerable through a contains-match.
 *
 * TWO THINGS LEARNED FROM THE LIVE APPLICATION, both of which shape the methods
 * below:
 *
 *   THE TOAST IS SLOW TO ARRIVE. It is not painted with the click - it appeared
 *   between 0.7s and 4.7s after a save in repeated probes, because it follows
 *   the server round trip. Reading it immediately returns empty, which is
 *   indistinguishable from "no toast was shown". So `waitForText` polls rather
 *   than sampling once.
 *
 *   THERE IS A SECOND HOST. `pbm-toast-notif` carries unrelated bell
 *   notifications ("There is a payer need aproval" - the application's own
 *   spelling). It is deliberately NOT read here: a case asserting the
 *   creation toast must not be satisfied by an unrelated notification that
 *   happened to be on screen.
 */
export class Toast {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  private summaryEl(): Locator {
    return this.page.locator(`#${TOAST.summary}`);
  }

  private detailEl(): Locator {
    return this.page.locator(`#${TOAST.detail}`);
  }

  private root(): Locator {
    return this.page.locator(`#${TOAST.root}`);
  }

  /** Whether a toast is on screen right now, without waiting for one. */
  async isVisible(): Promise<boolean> {
    return this.summaryEl()
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
  }

  /**
   * Waits for a toast and returns both lines.
   *
   * Polled because the toast follows the server round trip - see the class
   * comment. Fails with a clear message rather than returning empty strings, so
   * "no toast appeared" is never mistaken for "a toast appeared saying nothing".
   */
  async waitForText(): Promise<ToastText> {
    await expect(
      this.summaryEl(),
      'a toast notification should appear after the action',
    ).toBeVisible({ timeout: Timeouts.toast });

    const summary = (await this.summaryEl().innerText()).trim();
    const detail = await this.detailEl()
      .innerText()
      .then((text) => text.trim())
      .catch(() => '');
    Logger.step(`Toast: "${summary}" / "${detail}"`);
    return { summary, detail };
  }

  /** Asserts both lines match exactly - the word-for-word check. */
  async expectText(expected: ToastText): Promise<void> {
    await expect(this.summaryEl()).toHaveText(expected.summary, { timeout: Timeouts.toast });
    await expect(this.detailEl()).toHaveText(expected.detail, { timeout: Timeouts.toast });
  }

  /**
   * Asserts NO toast appears within the window.
   *
   * Used by the refused-save case, where the point is an absence. A plain
   * `isVisible()` would pass simply by being called before the toast had time
   * to arrive, so this waits out the window the toast would have used.
   */
  async expectNone(withinMs: number = Timeouts.toast): Promise<void> {
    await expect(
      this.summaryEl(),
      'no toast should appear when the save was refused',
    ).toBeHidden({ timeout: withinMs });
  }

  /**
   * Asserts the toast is STILL on screen after `ms` have passed.
   *
   * The "not yet dismissed" check with the wait folded in, so a spec never
   * has to reach for the page to sleep. Measured from now - the caller is
   * expected to have waited for the toast to appear first, because the toast
   * follows the server round trip and charging that delay against its
   * lifetime makes a correct five-second toast look like a two-second one.
   */
  async expectVisibleFor(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
    await expect(
      this.summaryEl(),
      `the toast should still be on screen ${ms}ms after it appeared`,
    ).toBeVisible({ timeout: Timeouts.short });
  }

  /** Asserts a toast is still on screen - the "not yet dismissed" check. */
  async expectStillVisible(): Promise<void> {
    await expect(this.summaryEl()).toBeVisible({ timeout: Timeouts.short });
  }

  /**
   * Asserts the toast has gone within `withinMs`.
   *
   * The auto-dismiss check. Measured from when the toast became visible, not
   * from the click - the delay before it appears would otherwise be counted
   * against its lifetime and make a correct five-second toast look like a
   * two-second one.
   */
  async expectDismissedWithin(withinMs: number): Promise<void> {
    await expect(
      this.summaryEl(),
      `the toast should auto-dismiss within ${withinMs}ms of appearing`,
    ).toBeHidden({ timeout: withinMs });
  }

  /**
   * The toast's own dismiss control, if it has one.
   *
   * Returns a count rather than a boolean so a failure message can say "zero
   * controls" instead of just "false". VERIFIED: the application renders none,
   * which is why the manual-dismiss case fails.
   */
  async countCloseControls(): Promise<number> {
    const present = await this.isVisible();
    if (!present) return 0;
    // locator-exception: the close control carries no id of its own - the toast
    // host does, and this counts buttons inside it. Scoped to `#pbm-toast`, so
    // it cannot drift onto another component's buttons.
    return this.root().locator('button').count();
  }

  /** Dismisses the toast by its own control. */
  async dismiss(): Promise<void> {
    Logger.step('Dismissing the toast');
    // locator-exception: see countCloseControls - no id on the control itself.
    await this.root().locator('button').first().click();
    await expect(this.summaryEl()).toBeHidden({ timeout: Timeouts.short });
  }
}
