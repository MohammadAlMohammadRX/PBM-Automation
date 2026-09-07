import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';
import { PAYER_SELECT, type PayerSelectSurface } from '../../constants/ElementIds';
import { Logger } from '../../utils/Logger';

/**
 * The shared cross-module payer selection control.
 *
 * Lives in components/ rather than under any one module, for the same reason
 * LanguageSwitcher does: three different screens expose the same control, all
 * backed by one interface (`GET /api/Payers/GetPayersDropdown`). A consuming
 * module is named by its SURFACE key, so the story's tests can compare two
 * consumers without duplicating a single locator.
 *
 * The overlay's option elements get PrimeNG-generated, render-order-dependent
 * ids (`pn_id_28_0`), which the framework's locator policy explicitly exempts
 * because they are not usable as selectors - see BasePage.chooseOption. Options
 * are therefore read by role, which is the only stable handle the control
 * offers.
 */
export class PayerSelectionDropdown {
  constructor(
    private readonly page: Page,
    private readonly surface: PayerSelectSurface,
  ) {}

  /** The control's trigger, by the consuming module's own id. */
  trigger(): Locator {
    return this.page.locator(`#${PAYER_SELECT[this.surface]}`);
  }

  async isPresent(): Promise<boolean> {
    return (await this.trigger().count()) > 0;
  }

  async expectPresent(): Promise<void> {
    await expect(
      this.trigger(),
      `the ${this.surface} payer selection control should be available`,
    ).toBeVisible({ timeout: Timeouts.default });
  }

  /**
   * Opens the dropdown and waits for its overlay to settle.
   *
   * Waits for an option OR for the control's empty state, because a dropdown
   * with nothing to offer is a legitimate outcome the story asks about
   * explicitly - waiting only for an option would turn it into a timeout.
   */
  async open(): Promise<void> {
    Logger.step(`Opening the ${this.surface} payer dropdown`);
    await this.trigger().click();
    await this.page
      .getByRole('option')
      .filter({ visible: true })
      .first()
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .catch(() => undefined);
  }

  async close(): Promise<void> {
    await this.page.keyboard.press('Escape');
  }

  /** Every option currently offered, in the order the overlay lists them. */
  private options(): Locator {
    return this.page.getByRole('option').filter({ visible: true });
  }

  async getOptionCount(): Promise<number> {
    return this.options().count();
  }

  /**
   * The option labels on offer.
   *
   * A neutral "show everything" entry ("All Payers" on the list filters) is
   * dropped: it is a filter affordance, not a payer, and counting it as one
   * would corrupt every membership assertion.
   */
  async getPayerOptions(): Promise<string[]> {
    const labels = (await this.options().allInnerTexts()).map((text) => text.trim());
    return labels.filter((label) => !/^All\s|^كل\s|^جميع\s/i.test(label));
  }

  /** Whether a named payer is on offer. */
  async offersPayer(payerName: string): Promise<boolean> {
    return (await this.getPayerOptions()).includes(payerName);
  }

  /** Selects a payer by name. */
  async select(payerName: string): Promise<void> {
    await this.page
      .getByRole('option', { name: payerName, exact: true })
      .filter({ visible: true })
      .first()
      .click();
  }

  // ---- Assertions -----------------------------------------------------------

  async expectOffersPayer(payerName: string): Promise<void> {
    await expect
      .poll(() => this.offersPayer(payerName), {
        timeout: Timeouts.default,
        message: `the ${this.surface} payer dropdown should offer "${payerName}"`,
      })
      .toBe(true);
  }

  async expectExcludesPayer(payerName: string): Promise<void> {
    await expect
      .poll(() => this.offersPayer(payerName), {
        timeout: Timeouts.default,
        message:
          `the ${this.surface} payer dropdown should NOT offer "${payerName}", which is `
          + 'not Active',
      })
      .toBe(false);
  }

  /**
   * Asserts the dropdown offered something to choose from - the precondition
   * for any exclusion assertion being meaningful. An empty dropdown would
   * satisfy "excludes X" trivially and prove nothing.
   */
  async expectNotEmpty(): Promise<void> {
    // Counts PAYER options, not raw option elements.
    //
    // This is the difference between a working check and a silently broken one.
    // The list filters render a static "All Payers" entry immediately, while
    // the payers themselves arrive with the interface call - so counting raw
    // options returns 1 straight away, this assertion passes against a dropdown
    // holding no payers at all, and every membership check that follows then
    // compares against an empty set and reports payers as "missing" that are
    // there. Waiting for a real payer option is what makes the later
    // assertions mean anything.
    await expect
      .poll(async () => (await this.getPayerOptions()).length, {
        timeout: Timeouts.default,
        message:
          `the ${this.surface} payer dropdown should load its payers before they are `
          + 'inspected',
      })
      .toBeGreaterThan(0);
  }

  /**
   * Asserts the control reports "nothing available" rather than erroring.
   *
   * Satisfied either by an explicit empty message in the overlay or by the
   * overlay offering no options at all - both are graceful; a thrown error or a
   * frozen control is not.
   */
  async expectEmptyStateHandledGracefully(): Promise<void> {
    // Counts PAYER options, not every option element. The list filters render a
    // static "All Payers" entry that is present whether or not any payer was
    // returned, so counting raw options reports 1 for an empty dropdown and the
    // assertion fails for the wrong reason.
    await expect
      .poll(async () => (await this.getPayerOptions()).length, {
        timeout: Timeouts.default,
        message:
          `the ${this.surface} dropdown should offer no payer options - rather than error or `
          + 'show stale data - when its service returns nothing',
      })
      .toBe(0);
  }
}
