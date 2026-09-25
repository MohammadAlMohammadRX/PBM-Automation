import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { PAYER_SCOPE_DIALOG } from '../../constants/ElementIds';
import { Timeouts } from '../../constants/Timeouts';
import { Logger } from '../../utils/Logger';

/**
 * The "Select a Payer" gate.
 *
 * WHAT IT IS. On or before 21 September 2026 the application began asking a
 * scoped user which payer they are working with before any payer screen will
 * show data: "Payer, network, plan, policy, formulary and member screens show
 * the data of one payer at a time." Until a payer is chosen the list renders no
 * rows at all.
 *
 * WHY IT MATTERS TO THE SUITE. It is a gate, not a filter, and it is easy to
 * mistake for a defect. Nine permission cases failed with "the list should
 * render at least one row" and were read as the application over-restricting a
 * role; the account had simply never been asked to pick a payer. The
 * administrator does not see this dialog, so it only appears on the scoped
 * sessions the fixtures create.
 *
 * VERIFIED: the dialog offers exactly the payers the account is assigned - two
 * for the configured Payer Admin, Al Dawaa and NUPCO - and the list renders as
 * soon as one is confirmed.
 */
export class PayerScopeDialog {
  constructor(private readonly page: Page) {}

  private select(): Locator {
    return this.page.locator(`#${PAYER_SCOPE_DIALOG.select}`);
  }

  /** Whether the gate is currently asking for a payer. */
  async isShown(): Promise<boolean> {
    return this.select()
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
  }

  /**
   * Whether the gate is on screen RIGHT NOW, without waiting for it.
   *
   * For the navigation path, which runs on every payer-screen visit in the
   * suite. An administrator never meets this dialog, so a waiting check would
   * spend its timeout thousands of times over to answer "no" - this costs a
   * single DOM query instead. Callers that have just navigated and settled can
   * rely on it; a caller that wants to wait for the gate should use `isShown`.
   */
  async isShowingNow(): Promise<boolean> {
    return (await this.select().count()) > 0;
  }

  /** The payers this account may work with, as the gate offers them. */
  async getOfferedPayers(): Promise<string[]> {
    await this.select().click();
    const options = this.page.getByRole('option').filter({ visible: true });
    await options.first().waitFor({ state: 'visible', timeout: Timeouts.default });
    return (await options.allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim());
  }

  /**
   * Chooses a payer and confirms, leaving the module usable.
   *
   * Names the payer when the caller cares which one, and otherwise takes the
   * first on offer - most cases only need A payer in scope, and which one it is
   * would be an arbitrary detail to hard-code.
   *
   * locator-exception: the gate's option list and its Continue button carry no
   * ids; both are addressed by role and accessible name, scoped to the dialog.
   */
  async choose(payerName?: string): Promise<string> {
    const offered = await this.getOfferedPayers();
    expect(
      offered.length,
      'the payer gate should offer at least one payer to a scoped account',
    ).toBeGreaterThan(0);

    const wanted = payerName ?? offered[0];
    Logger.step(`Selecting "${wanted}" in the payer scope gate`);
    await this.page
      .getByRole('option', { name: wanted, exact: true })
      .filter({ visible: true })
      .first()
      .click();
    // locator-exception: the gate's Continue button carries no id; addressed by role and name.
    await this.page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(this.select(), 'the payer gate should close once a payer is confirmed')
      .toBeHidden({ timeout: Timeouts.default });
    return wanted;
  }

  /**
   * Answers the gate if it is asking, and says nothing if it is not.
   *
   * The administrator never sees it, and a scoped session sees it once, so a
   * caller cannot know in advance whether it is there - which is exactly why
   * this is separate from `choose`.
   */
  async chooseIfAsked(payerName?: string): Promise<string | null> {
    if (!(await this.isShown())) return null;
    return this.choose(payerName);
  }

  /**
   * The same, but without waiting for a gate that is probably not there.
   *
   * What the payer screens call after navigating: the page has already settled,
   * so the gate is either rendered or was never coming.
   */
  async chooseIfShowingNow(payerName?: string): Promise<string | null> {
    if (!(await this.isShowingNow())) return null;
    return this.choose(payerName);
  }
}
