import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { NETWORK_INACTIVATE_DIALOG, TOAST, buttonSelector } from '../../constants/ElementIds';
import { Timeouts } from '../../constants/Timeouts';
import { Logger } from '../../utils/Logger';

/**
 * The Inactivate Network drawer.
 *
 * A component of its own for the same reason PayerInactivateDialog is: the two
 * DIRECTIONS of a network's status change use different surfaces, and only one
 * of them is the shared confirmation dialog.
 *
 *   ACTIVATE   raises `#pbm-dialog` - a plain "Are you sure you want to
 *              activate X?" with Cancel and Confirm.
 *   INACTIVATE opens THIS drawer, which requires a reason for the audit
 *              history and offers an optional details field.
 *
 * Discovered the hard way: driving deactivation through the shared dialog waits
 * out the full timeout on a dialog that is never coming, and the failure reads
 * as "the confirmation did not appear" - which looks like an application defect
 * and is not one.
 *
 * Its ids are also NOT the payer drawer's with a different prefix - the reason
 * select is `-reason-id-select` here against `-reason-select` there, and the
 * affirmative action is `-save-button` against `-confirm-button` - so the two
 * cannot share a component even though they look alike on screen.
 */
export class NetworkInactivateDialog {
  constructor(private readonly page: Page) {}

  /**
   * The drawer's TITLE is the readiness signal, not its root: the host is a
   * `p-drawer` wrapper that can report no box of its own while the panel it
   * renders is a child. Same trap as the payer drawer.
   */
  private title(): Locator {
    return this.page.locator(`#${NETWORK_INACTIVATE_DIALOG.title}`);
  }

  async waitForOpen(): Promise<void> {
    await expect(this.title(), 'the network inactivation drawer should open').toBeVisible({
      timeout: Timeouts.default,
    });
  }

  async isOpen(): Promise<boolean> {
    return this.title()
      .waitFor({ state: 'visible', timeout: Timeouts.short })
      .then(() => true)
      .catch(() => false);
  }

  async getTitleText(): Promise<string> {
    await this.waitForOpen();
    return (await this.title().innerText()).trim();
  }

  /**
   * The drawer's whole explanation, as one string.
   *
   * The warning has no element of its own here - unlike the payer drawer's
   * `-warning` - so it is read from the drawer body. Scoped to the drawer root,
   * which is an id, so it cannot drift onto another component's text.
   */
  async getExplanation(): Promise<string> {
    await this.waitForOpen();
    return (await this.page.locator(`#${NETWORK_INACTIVATE_DIALOG.root}`).innerText()).trim();
  }

  /**
   * Picks the first inactivation reason offered.
   *
   * The reason is a required GATE rather than the thing under test, and the
   * options come from a configurable lookup an administrator can rename or
   * reorder at any time - naming one would make this fail for a reason
   * unrelated to what it checks.
   */
  async selectFirstReason(): Promise<void> {
    const select = this.page.locator(`#${NETWORK_INACTIVATE_DIALOG.reasonSelect}`);
    await expect(select, 'the drawer should ask for a reason').toBeVisible({
      timeout: Timeouts.default,
    });
    await select.click();
    const option = this.page.getByRole('option').filter({ visible: true }).first();
    await expect(option).toBeVisible({ timeout: Timeouts.default });
    await option.click();
  }

  async fillDetails(text: string): Promise<void> {
    const input = this.page.locator(`#${NETWORK_INACTIVATE_DIALOG.detailsInput}`);
    if ((await input.count()) === 0) return;
    await input.fill(text);
  }

  /**
   * Confirms the inactivation.
   *
   * Only STAGES it: like every other change in this application the drawer
   * saves a draft, and the network keeps its status until a checker approves.
   */
  async confirm(): Promise<void> {
    Logger.step('Confirming the network inactivation');
    await this.page.locator(buttonSelector(NETWORK_INACTIVATE_DIALOG.save)).first().click();

    // A refused save leaves the drawer open and reports the reason in a toast -
    // "Only an active network can be inactivated." is the one this suite met,
    // raised on a network whose Status column read Active because a
    // deactivation was already staged and awaiting approval. A bare
    // `toBeHidden` failure said only that the drawer had not closed, which sent
    // the investigation to the locator instead of to the message. So the
    // message is read and reported.
    const closed = await this.title()
      .waitFor({ state: 'hidden', timeout: Timeouts.default })
      .then(() => true)
      .catch(() => false);
    if (!closed) {
      const toast = await this.page
        .locator(`#${TOAST.summary}`)
        .innerText()
        .then((text) => text.trim())
        .catch(() => '');
      throw new Error(
        '[NetworkInactivateDialog] The drawer stayed open after Save, so the inactivation was '
        + `refused. The application said: "${toast || '(no message)'}"`,
      );
    }
  }

  async cancel(): Promise<void> {
    await this.page.locator(buttonSelector(NETWORK_INACTIVATE_DIALOG.cancel)).first().click();
    await expect(this.title()).toBeHidden({ timeout: Timeouts.default });
  }

  /** The whole staging flow: reason, details, confirm. */
  async inactivateWithFirstReason(details = 'Staged by automated test'): Promise<void> {
    await this.waitForOpen();
    await this.selectFirstReason();
    await this.fillDetails(details);
    await this.confirm();
  }
}
