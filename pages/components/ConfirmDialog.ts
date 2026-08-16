import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';
import { Logger } from '../../utils/Logger';

/**
 * Reusable wrapper around PBM's custom confirmation modal (`pbm-dialog`,
 * rendered as a PrimeNG `.p-dialog`). This single component covers every
 * confirm/acknowledge modal in the app, e.g.:
 *   - "Send for approval?"        (Cancel / Send for Approval)
 *   - "Approve this request"      (requires an acknowledgement checkbox)
 *   - "Unsaved Changes"           (Keep Editing / Discard Changes)
 *   - Delete confirmation
 *
 * Verified structure:
 *   .p-dialog
 *     h2.pbm-dialog__title
 *     p.pbm-dialog__message
 *     label.pbm-dialog__ack > input[type=checkbox]   (only on Approve)
 *     .pbm-dialog__actions button                    (action buttons)
 */
export class ConfirmDialog {
  constructor(private readonly page: Page) {}

  private root(): Locator {
    return this.page.locator('.p-dialog').last();
  }

  async waitForVisible(): Promise<void> {
    await expect(this.root()).toBeVisible({ timeout: Timeouts.default });
  }

  async waitForHidden(): Promise<void> {
    await expect(this.root()).toBeHidden({ timeout: Timeouts.default });
  }

  async getTitle(): Promise<string> {
    return (await this.root().locator('.pbm-dialog__title').innerText()).trim();
  }

  async getMessage(): Promise<string> {
    return (await this.root().locator('.pbm-dialog__message').innerText()).trim();
  }

  private ackCheckbox(): Locator {
    return this.root().locator('.pbm-dialog__ack input[type="checkbox"]');
  }

  /**
   * Ticks the "I confirm that I have reviewed..." acknowledgement, which the
   * Approve dialog requires before its primary button becomes enabled. The
   * native checkbox is visually hidden, so the label is clicked instead.
   */
  async acknowledgeIfPresent(): Promise<void> {
    const checkbox = this.ackCheckbox();
    if ((await checkbox.count()) > 0 && !(await checkbox.first().isChecked())) {
      await this.root().locator('.pbm-dialog__ack').click();
      await expect(checkbox.first()).toBeChecked();
    }
  }

  /**
   * Selects a reason from a dropdown when the dialog exposes one (e.g. the
   * "Rejection Reason" select on the reviewer's Reject dialog). The options
   * overlay is portalled to the body, so it is matched at page scope.
   */
  async selectReasonIfPresent(reason: string): Promise<void> {
    const combo = this.root().locator('[role="combobox"]');
    if ((await combo.count()) > 0) {
      await combo.first().click();
      await this.page.getByRole('option', { name: reason, exact: true }).click();
    }
  }

  private actionButton(label: string): Locator {
    return this.root().locator('.pbm-dialog__actions button', { hasText: label });
  }

  /**
   * Confirms the dialog by clicking the action button whose label matches,
   * ticking the acknowledgement checkbox first if one is present.
   */
  async confirm(actionLabel: string): Promise<void> {
    Logger.step(`Confirming dialog action "${actionLabel}"`);
    await this.waitForVisible();
    await this.acknowledgeIfPresent();
    await this.actionButton(actionLabel).click();
    await this.waitForHidden();
  }

  /** Dismisses the dialog via its cancel/secondary action. */
  async cancel(cancelLabel = 'Cancel'): Promise<void> {
    await this.actionButton(cancelLabel).click();
    await this.waitForHidden();
  }
}
