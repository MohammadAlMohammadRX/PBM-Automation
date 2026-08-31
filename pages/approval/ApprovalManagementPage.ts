import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AppRoutes } from '../../constants/AppRoutes';
import { Timeouts } from '../../constants/Timeouts';
import {
  APPROVALS_COLUMN,
  SCREEN,
  buttonSelector,
  type ApprovalsRowAction,
} from '../../constants/ElementIds';
import { Logger } from '../../utils/Logger';
import type { RejectionReason } from '../../data/payers/payerTypes';

/**
 * Page Object for the Approval Management module (`/approval-management`) - the
 * reviewer/checker queue of the maker-checker workflow.
 *
 * The hub is a tab strip (`approvals-hub-tab-{module}`) over one reusable tab
 * component per module, and every id folds in the module name - so this class
 * works entirely inside the `approvals-payer` namespace:
 *
 *   approvals-payer-search-input
 *   approvals-payer-table-row-{approvalId}
 *   approvals-payer-table-row-{approvalId}-cell-{columnKey}
 *   approvals-payer-table-row-{approvalId}-{review|reject|approve}
 *
 * Rows are keyed on the APPROVAL request's id, not the payer's - a payer can
 * have several requests over its lifetime - so a row is still located by the
 * payer name it shows, and its id read off it for the actions.
 *
 * Both Approve and Reject open the shared confirmation dialog, whose confirm
 * button stays disabled until the acknowledgement is ticked; Reject additionally
 * requires a Rejection Reason.
 */
export class ApprovalManagementPage extends BasePage {
  private readonly screen = SCREEN.approvalsPayer;

  constructor(page: Page) {
    super(page);
  }

  async open(): Promise<void> {
    await this.goto(AppRoutes.approvalManagement);
    // The approval queue shares the module-wide Table/Cards view preference.
    await this.ensureTableView(this.screen);
    // Post-condition: the list is genuinely on screen. Without it `open()` can
    // return on a page that never rendered its table - the cards-view case - and
    // the failure then surfaces several steps later against a row locator,
    // pointing at the wrong thing entirely. Asserting here fails at "Open the
    // approval queue", which is where the problem actually is.
    await expect(this.tableFor(this.screen)).toBeVisible({ timeout: Timeouts.default });
  }

  /** The Payer tab of the hub, in case another tab is active. */
  async openPayerTab(): Promise<void> {
    await this.btn('approvals-hub-tab-payer').click();
    await expect(this.byId(this.screen)).toBeVisible({ timeout: Timeouts.default });
  }

  private searchInput(): Locator {
    return this.byId(`${this.screen}-search-input`);
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

  /** All queued rows currently rendered. */
  private rows(): Locator {
    return this.page.locator(`tr[id^="${this.screen}-table-row-"]`);
  }

  private row(payerName: string): Locator {
    return this.rows().filter({ hasText: payerName }).first();
  }

  /** The approval request's id, i.e. the namespace its actions hang off. */
  private async rowId(payerName: string): Promise<string> {
    const row = this.row(payerName);
    await expect(row).toBeVisible({ timeout: Timeouts.default });
    const id = await row.getAttribute('id');
    if (!id) {
      throw new Error(`[ApprovalManagementPage] Queue row for "${payerName}" carries no id.`);
    }
    return id;
  }

  /**
   * A row action button, by its logical key. Language independent - the previous
   * implementation matched the localized `title` attribute
   * (`button[title="Approve"]`), which only ever worked in English.
   */
  private async rowAction(payerName: string, action: ApprovalsRowAction): Promise<Locator> {
    const id = await this.rowId(payerName);
    return this.page.locator(buttonSelector(`${id}-${action}`)).first();
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
          // A brief probe, deliberately. The queue re-queries only when a new
          // search is issued, so waiting long here cannot rescue a search that
          // already returned nothing - the budget belongs to the NEXT search.
          return this.row(payerName)
            .waitFor({ state: 'visible', timeout: 2_000 })
            .then(() => true)
            .catch(() => false);
        },
        {
          timeout: Timeouts.queuePropagation,
          intervals: [500, 1_000, 2_000],
          message:
            `The approval queue should list "${payerName}" after it was submitted. `
            + 'The queue was re-searched repeatedly and never returned it, which means the '
            + 'submission did not reach the queue.',
        },
      )
      .toBe(true);
  }

  async expectActionsAvailable(payerName: string): Promise<void> {
    await expect(await this.rowAction(payerName, 'approve')).toBeVisible();
    await expect(await this.rowAction(payerName, 'reject')).toBeVisible();
  }

  /**
   * Asserts the queued request is of the expected change type. The queue's
   * "Change Type" column reports Create / Update / Delete, which is how a staged
   * deletion is distinguished from an edit. Read by column key rather than by
   * cell position.
   */
  async expectChangeType(payerName: string, changeType: string): Promise<void> {
    await this.search(payerName);
    const id = await this.rowId(payerName);
    await expect(this.byId(`${id}-cell-${APPROVALS_COLUMN.changeType}`)).toHaveText(changeType, {
      timeout: Timeouts.default,
    });
  }

  /** Number of queued requests matching a payer name - proves no duplicates. */
  async countQueuedRequests(payerName: string): Promise<number> {
    await this.search(payerName);
    return this.rows().filter({ hasText: payerName }).count();
  }

  /** Asserts the payer has exactly one pending request (double-submission guard). */
  async expectSingleQueuedRequest(payerName: string): Promise<void> {
    await this.search(payerName);
    await expect(this.rows().filter({ hasText: payerName })).toHaveCount(1, {
      timeout: Timeouts.default,
    });
  }

  async expectNotInQueue(payerName: string): Promise<void> {
    await this.search(payerName);
    await expect(this.row(payerName)).toHaveCount(0, { timeout: Timeouts.default });
  }

  /**
   * Segregation of duties: a request submitted by the signed-in user must not be
   * approvable by that same user. Satisfied either by the request being absent
   * from their queue, or by the Approve action being unavailable.
   */
  async expectSelfApprovalPrevented(payerName: string): Promise<void> {
    await this.search(payerName);
    if ((await this.row(payerName).count()) === 0) {
      return; // Excluded from the submitter's own queue.
    }
    await expect(await this.rowAction(payerName, 'approve')).toHaveCount(0, {
      timeout: Timeouts.default,
    });
  }

  /** Approves a queued request (ticks the acknowledgement, then confirms). */
  async approve(payerName: string): Promise<void> {
    Logger.step(`Approving "${payerName}"`);
    await this.expectInQueue(payerName);
    await (await this.rowAction(payerName, 'approve')).click();
    await new ConfirmDialog(this.page).confirm('Approve');
    await this.waitForDecisionProcessed(payerName);
  }

  /** Rejects a queued request: picks a Rejection Reason, acknowledges, confirms. */
  async reject(payerName: string, reason: RejectionReason = 'Other'): Promise<void> {
    Logger.step(`Rejecting "${payerName}" (${reason})`);
    await this.expectInQueue(payerName);
    await (await this.rowAction(payerName, 'reject')).click();
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
