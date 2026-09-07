import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';
import { PAYER_INACTIVATE_DIALOG, buttonSelector } from '../../constants/ElementIds';
import { Logger } from '../../utils/Logger';

/**
 * The Inactivate Payer drawer.
 *
 * A component of its own because inactivation does NOT use the application's
 * shared confirmation dialog, contrary to what ConfirmDialog's own notes claim
 * about every confirmation in the app. Verified live: the row action opens
 * `payer-inactivate-dialog`, a right-hand drawer with its own reason select,
 * details field, impact summary and cancel/confirm buttons. `#pbm-dialog` never
 * renders for it, so driving this through ConfirmDialog waits out a full
 * timeout on a dialog that is not coming - which is exactly how the
 * status-transition test failed before this existed.
 *
 * Scope note: this covers only what the cross-module story needs - stage an
 * inactivation so the payer's status can change. The impact preview and the
 * reason/details validation are their own user stories, and their assertions
 * belong with them, not here.
 */
export class PayerInactivateDialog {
  constructor(private readonly page: Page) {}

  private root(): Locator {
    return this.page.locator(`#${PAYER_INACTIVATE_DIALOG.root}`);
  }

  /**
   * The drawer's TITLE is the readiness signal, not its root.
   *
   * Same trap as the version drawer: the host is a `p-drawer` wrapper that can
   * report no box of its own, while the panel it renders is a child. The title
   * appears exactly when the drawer does.
   */
  private title(): Locator {
    return this.page.locator(`#${PAYER_INACTIVATE_DIALOG.title}`);
  }

  async waitForOpen(): Promise<void> {
    await expect(this.title()).toBeVisible({ timeout: Timeouts.default });
  }

  /** The impact preview the drawer shows before the change is staged. */
  impactSummary(): Locator {
    return this.page.locator(`#${PAYER_INACTIVATE_DIALOG.impactSummary}`);
  }

  /**
   * Picks the first inactivation reason offered.
   *
   * The reason is a required GATE here rather than the thing under test, and
   * the options come from the configurable `payerInactivationReason` lookup -
   * which an administrator can rename or reorder at any time. Naming one would
   * make this fail for a reason unrelated to what it checks.
   */
  async selectFirstReason(): Promise<void> {
    const select = this.page.locator(`#${PAYER_INACTIVATE_DIALOG.reasonSelect}`);
    if ((await select.count()) === 0) return;
    await select.click();
    const option = this.page.getByRole('option').filter({ visible: true }).first();
    await expect(option).toBeVisible({ timeout: Timeouts.default });
    await option.click();
  }

  /** Fills the free-text details field, when the drawer offers one. */
  async fillDetails(text: string): Promise<void> {
    const input = this.page.locator(`#${PAYER_INACTIVATE_DIALOG.detailsInput}`);
    if ((await input.count()) === 0) return;
    await input.fill(text);
  }

  /**
   * Confirms the inactivation.
   *
   * This only STAGES the change - inactivation is maker-checker like every
   * other payer edit, so the payer keeps its current status until a checker
   * approves. A caller that needs the status to actually move must send the
   * record for approval and have it approved.
   */
  async confirm(): Promise<void> {
    Logger.step('Confirming the payer inactivation');
    await this.page.locator(buttonSelector(PAYER_INACTIVATE_DIALOG.confirm)).first().click();
    await expect(this.title()).toBeHidden({ timeout: Timeouts.default });
  }

  async cancel(): Promise<void> {
    await this.page.locator(buttonSelector(PAYER_INACTIVATE_DIALOG.cancel)).first().click();
    await expect(this.title()).toBeHidden({ timeout: Timeouts.default });
  }

  /**
   * The whole staging flow: reason, details, confirm.
   *
   * Kept here rather than in the spec so the test reads as one intent, and so
   * the next story that needs to inactivate a payer reuses this instead of
   * re-deriving the drawer's requirements.
   */
  async inactivateWithFirstReason(details = 'Staged by automated test'): Promise<void> {
    await this.waitForOpen();
    await this.selectFirstReason();
    await this.fillDetails(details);
    await this.confirm();
  }
}
