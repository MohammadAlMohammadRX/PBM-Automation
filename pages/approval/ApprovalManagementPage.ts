import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AppRoutes } from '../../constants/AppRoutes';
import { Timeouts } from '../../constants/Timeouts';
import { Logger } from '../../utils/Logger';
import type { RejectionReason } from '../../data/payers/payerTypes';

/**
 * Page Object for the Approval Management module (`/approval-management`) - the
 * reviewer/checker queue of the maker-checker workflow.
 *
 * Verified: the queue is searchable and paginated, so a specific request is
 * located by searching its payer name first. Each row's Actions cell exposes
 * Review / Reject / Approve. Both Approve and Reject open an acknowledgement
 * dialog whose primary button stays disabled until the "I confirm..." checkbox
 * is ticked; Reject additionally requires a Rejection Reason to be selected.
 */
export class ApprovalManagementPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async open(): Promise<void> {
    await this.goto(AppRoutes.approvalManagement);
    // The approval queue shares the module-wide Table/Cards view preference.
    await this.ensureTableView();
  }

  private searchInput(): Locator {
    // The application's own class, not the localized accessible name.
    return this.page.locator('input.pbm-search__input').first();
  }

  /**
   * Filters the queue to a single request so pagination never hides it.
   *
   * Types real keystrokes. `locator.fill()` sets the value without raising the
   * key events this application listens for, so the queue was never actually
   * filtered - it only appeared to work while the backlog was short enough for
   * the wanted row to sit on page one. With a 16-page queue that silently broke
   * every isInQueue() check.
   */
  async search(payerName: string): Promise<void> {
    Logger.step(`Searching approval queue for "${payerName}"`);
    const input = this.searchInput();
    await input.click();
    await input.press('ControlOrMeta+a');
    await input.press('Delete');
    await input.pressSequentially(payerName);
    await this.waitForPageReady();
  }

  private row(payerName: string): Locator {
    return this.page.getByRole('row').filter({ hasText: payerName }).first();
  }

  /**
   * Whether a request for this payer is pending, WAITING for the queue to render.
   * `locator.isVisible()` is avoided on purpose: it ignores its timeout and
   * reports the state before the search results arrive.
   */
  async isInQueue(payerName: string): Promise<boolean> {
    await this.search(payerName);
    return this.row(payerName)
      .waitFor({ state: 'visible', timeout: Timeouts.default })
      .then(() => true)
      .catch(() => false);
  }

  /**
   * Waits for a request to appear in the queue, re-running the search each time.
   *
   * A single search is not enough: the filter is debounced and a change that was
   * only just submitted can take a moment to reach the queue, so checking once
   * asks the question before the answer exists.
   */
  async expectInQueue(payerName: string): Promise<void> {
    await expect
      .poll(
        async () => {
          await this.search(payerName);
          return this.row(payerName)
            .waitFor({ state: 'visible', timeout: Timeouts.short })
            .then(() => true)
            .catch(() => false);
        },
        { timeout: Timeouts.default },
      )
      .toBe(true);
  }

  async expectActionsAvailable(payerName: string): Promise<void> {
    const row = this.row(payerName);
    await expect(row.locator('button[title="Approve"]')).toBeVisible();
    await expect(row.locator('button[title="Reject"]')).toBeVisible();
  }

  /**
   * Asserts the queued request is of the expected change type. The queue's
   * "Change Type" column reports Create / Update / Delete, which is how a
   * staged deletion is distinguished from an edit.
   */
  async expectChangeType(payerName: string, changeType: string): Promise<void> {
    await this.search(payerName);
    await expect(this.row(payerName).getByRole('cell').nth(1)).toHaveText(changeType, {
      timeout: Timeouts.default,
    });
  }

  /** Number of queued requests matching a payer name - proves no duplicates. */
  async countQueuedRequests(payerName: string): Promise<number> {
    await this.search(payerName);
    return this.page.getByRole('row').filter({ hasText: payerName }).count();
  }

  /** Asserts the payer has exactly one pending request (double-submission guard). */
  async expectSingleQueuedRequest(payerName: string): Promise<void> {
    await this.search(payerName);
    await expect(this.page.getByRole('row').filter({ hasText: payerName })).toHaveCount(1, {
      timeout: Timeouts.default,
    });
  }

  async expectNotInQueue(payerName: string): Promise<void> {
    await this.search(payerName);
    await expect(this.row(payerName)).toHaveCount(0, { timeout: Timeouts.default });
  }

  /**
   * Segregation of duties: a request submitted by the signed-in user must not
   * be approvable by that same user. Satisfied either by the request being
   * absent from their queue, or by the Approve action being unavailable.
   */
  async expectSelfApprovalPrevented(payerName: string): Promise<void> {
    await this.search(payerName);
    if ((await this.row(payerName).count()) === 0) {
      return; // Excluded from the submitter's own queue.
    }
    await expect(this.row(payerName).locator('button[title="Approve"]')).toHaveCount(0, {
      timeout: Timeouts.default,
    });
  }

  /** Approves a queued request (ticks the acknowledgement, then confirms). */
  async approve(payerName: string): Promise<void> {
    Logger.step(`Approving "${payerName}"`);
    await this.expectInQueue(payerName);
    await this.row(payerName).locator('button[title="Approve"]').click();
    await new ConfirmDialog(this.page).confirm('Approve');
    await this.waitForDecisionProcessed(payerName);
  }

  /** Rejects a queued request: picks a Rejection Reason, acknowledges, confirms. */
  async reject(payerName: string, reason: RejectionReason = 'Other'): Promise<void> {
    Logger.step(`Rejecting "${payerName}" (${reason})`);
    await this.expectInQueue(payerName);
    await this.row(payerName).locator('button[title="Reject"]').click();
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    await dialog.selectReasonIfPresent(reason);
    await dialog.confirm('Reject');
    await this.waitForDecisionProcessed(payerName);
  }

  /**
   * Waits until the decided request has left the pending queue. This confirms
   * the decision persisted server-side before the caller navigates away (which
   * would otherwise cancel the in-flight approve/reject request).
   */
  private async waitForDecisionProcessed(payerName: string): Promise<void> {
    await this.search(payerName);
    await expect(this.row(payerName)).toHaveCount(0, { timeout: Timeouts.default });
  }

  /** Applies an Approve/Reject decision - keeps the branch out of the spec. */
  async applyDecision(payerName: string, decision: 'Approve' | 'Reject'): Promise<void> {
    if (decision === 'Approve') {
      await this.approve(payerName);
    } else {
      await this.reject(payerName);
    }
  }
}
