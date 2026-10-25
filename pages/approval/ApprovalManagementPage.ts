import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AppRoutes } from '../../constants/AppRoutes';
import { Timeouts } from '../../constants/Timeouts';
import {
  APPROVALS_COLUMN,
  APPROVALS_HUB,
  SCREEN,
  buttonSelector,
  type ApprovalsRowAction,
} from '../../constants/ElementIds';
import { Logger } from '../../utils/Logger';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { pendingRequestId } from '../../utils/NetworkProvisioning';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import type { RejectionReason } from '../../data/payers/payerTypes';

/**
 * Which tab of the hub a page instance drives.
 *
 * The hub is one component per module under a module-named id namespace, so a
 * scope is all that separates a payer queue from a network one. Added when the
 * network-activation story needed to approve a NETWORK status change; without
 * it that story would have needed a second, near-identical Page Object.
 */
export type ApprovalScope = 'payer' | 'network';

const APPROVAL_SCREEN: Record<ApprovalScope, string> = {
  payer: SCREEN.approvalsPayer,
  network: SCREEN.approvalsNetwork,
};

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
  private readonly screen: string;

  private readonly approvalScope: ApprovalScope;

  constructor(page: Page, scope: ApprovalScope = 'payer') {
    super(page);
    this.approvalScope = scope;
    this.screen = APPROVAL_SCREEN[scope];
  }

  async open(): Promise<void> {
    await this.goto(AppRoutes.approvalManagement);
    // The hub opens on the Payer tab. A non-payer scope has to select its own
    // tab BEFORE anything reads the table, or every read lands on the payer
    // queue - which would not fail loudly, it would quietly answer the wrong
    // question. The payer scope skips the click: its tab is already active, and
    // not touching it keeps the long-standing payer flows untouched.
    if (this.approvalScope !== 'payer') {
      await this.openTab(this.approvalScope);
    }
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
    await this.openTab('payer');
  }

  /**
   * Selects one tab of the hub and waits for its own panel.
   *
   * Waits on the panel rather than the tab's selected state: the tabs are
   * always present, so a click that failed to switch panels would still leave
   * the tab looking fine while every subsequent read came from the previous
   * module's queue.
   */
  async openTab(scope: ApprovalScope): Promise<void> {
    Logger.step(`Opening the ${scope} approvals tab`);
    await this.btn(`${APPROVALS_HUB.tabPrefix}${scope}`).click();
    await expect(this.byId(APPROVAL_SCREEN[scope])).toBeVisible({ timeout: Timeouts.default });
  }

  /**
   * Opens the hub without assuming which tab it lands on - for a session that
   * may not be offered the payer queue at all. `open()` asserts the payer
   * table, which for such a session would report the refusal as a page fault.
   */
  async openHub(): Promise<void> {
    Logger.step('Opening the approvals hub');
    await this.goto(AppRoutes.approvalManagement);
    await expect(this.byId(APPROVALS_HUB.tabs), 'the approvals hub should render').toBeVisible({
      timeout: Timeouts.default,
    });
  }

  /** The module tabs the hub offers this session, by id suffix, e.g. ["payer", "network"]. */
  async getOfferedTabs(): Promise<string[]> {
    const ids = await this.page
      .locator(`[id^="${APPROVALS_HUB.tabPrefix}"]`)
      .evaluateAll((elements) => elements.map((element) => (element as HTMLElement).id));
    return Array.from(new Set(ids.map((id) => id.slice(APPROVALS_HUB.tabPrefix.length).split('-')[0])));
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
    // Opens the queue first when the browser is somewhere else. Several cases
    // legitimately end on the payer list and then ask the queue a question -
    // "is this request still decidable?" - and the search box they need is not
    // on that screen: the click timed out after 15 seconds inside an assertion
    // step, reported as though the queue had refused to answer. Navigating only
    // when the input is genuinely absent leaves an already-open queue, and any
    // filters on it, untouched.
    if ((await input.count()) === 0) await this.open();
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
   * Opens a queued request's Review panel and reads its change table - one row
   * per field, with the value before and after (2026-10-18, for 15622).
   *
   * VERIFIED live: the panel is "approvals-payer-review-drawer" and each field
   * row is "...-diff-row-<key>" with "-field", "-before" and "-after" cells. The
   * panel lists every field, changed or not; the caller decides which changed.
   */
  async openReview(payerName: string): Promise<{ field: string; before: string; after: string }[]> {
    // The scope's own namespace (2026-10-21): `approvals-payer-review-drawer`
    // for payers, `approvals-network-review-drawer` for networks.
    const prefix = `${this.screen}-review-drawer`;
    await this.search(payerName);
    await this.expectInQueue(payerName);
    await (await this.rowAction(payerName, 'review')).click();
    await expect(this.page.locator(`#${prefix}-title`), 'the Review panel should open').toBeVisible({ timeout: Timeouts.default });
    await expect(this.page.locator(`[id^="${prefix}-diff-row-"][id$="-field"]`).first(), 'the Review panel should list the changed fields')
      .toBeVisible({ timeout: Timeouts.default });
    const keys = await this.page
      .locator(`[id^="${prefix}-diff-row-"][id$="-field"]`)
      .evaluateAll((els, p) => els.map((e) => (e as HTMLElement).id.slice(`${p}-diff-row-`.length).replace(/-field$/, '')), prefix);
    const read = async (id: string): Promise<string> => {
      const el = this.page.locator(`#${id}`);
      return (await el.count()) ? (await el.first().innerText()).replace(/\s+/g, ' ').trim() : '';
    };
    const rows: { field: string; before: string; after: string }[] = [];
    for (const key of keys) {
      rows.push({
        field: await read(`${prefix}-diff-row-${key}-field`),
        before: await read(`${prefix}-diff-row-${key}-before`),
        after: await read(`${prefix}-diff-row-${key}-after`),
      });
    }
    return rows;
  }

  /** Closes the Review panel. */
  async closeReview(): Promise<void> {
    await this.page.locator(buttonSelector(`${this.screen}-review-drawer-close`)).first().click();
    await expect(this.page.locator(`#${this.screen}-review-drawer-title`)).toBeHidden({ timeout: Timeouts.default });
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

  /**
   * Asserts no approve or reject control is offered anywhere in the queue.
   *
   * Queue-wide rather than per-row, and deliberately so: a role without the
   * approval permission may not see the queued requests at all, in which case
   * there is no row to address. Both outcomes satisfy the rule - the controls
   * are hidden, or the requests are - so the assertion is that the decision
   * controls do not exist on this screen for this user.
   */
  async expectApprovalActionsDenied(): Promise<void> {
    for (const action of ['approve', 'reject'] as const) {
      await expect(
        this.page.locator(`[id^="${this.screen}-"][id$="-${action}"]`),
        `A user without the approval permission should be offered no ${action} control`,
      ).toHaveCount(0, { timeout: Timeouts.default });
    }
  }

  /**
   * The action keys a queued request actually offers, e.g. `['review',
   * 'reject', 'approve']`.
   *
   * Reads what is THERE rather than probing for one action at a time, so a case
   * asking "is a Withdraw action offered?" can fail with the list of actions
   * that do exist. "The withdraw button was not found" and "this hub offers
   * review, reject and approve, and nothing else" are the same result reported
   * with very different usefulness.
   */
  async getRowActionKeys(payerName: string): Promise<string[]> {
    await this.expectInQueue(payerName);
    const id = await this.rowId(payerName);
    return this.page
      .locator(`[id^="${id}-"]`)
      .evaluateAll(
        (elements, rowId) =>
          elements
            .filter((element) => {
              const tag = element.tagName.toLowerCase();
              return tag === 'button' || tag === 'p-button';
            })
            .map((element) => (element as HTMLElement).id.replace(`${rowId}-`, ''))
            .map((key) => key.replace(/-button$/, '')),
        id,
      );
  }

  /**
   * Approves a queued request only IF one is queued, and reports whether it did.
   *
   * Written for the seeding flows, where a change may or may not need review and
   * either answer is acceptable. Inactivating a payer is the case in point: it
   * is a maker-checker change like any other, so it may arrive here as a pending
   * version or may take effect immediately, and a seeder that assumed one would
   * break the day the other became true. The caller asserts the END STATE, which
   * is correct either way.
   *
   * Deliberately NOT for use in a test that is checking the approval workflow -
   * a case asserting a request reaches the queue should call `expectInQueue` and
   * fail when it does not, rather than silently doing nothing.
   */
  async approveIfPending(payerName: string): Promise<boolean> {
    if (!(await this.isInQueue(payerName))) {
      Logger.step(`No pending request for "${payerName}" - nothing to approve`);
      return false;
    }
    await this.approve(payerName);
    return true;
  }

  /** Approves a queued request (ticks the acknowledgement, then confirms). */
  async approve(payerName: string): Promise<void> {
    Logger.step(`Approving "${payerName}"`);
    await this.expectInQueue(payerName);
    await (await this.rowAction(payerName, 'approve')).click();
    const answer = this.watchDecisionAnswer();
    await new ConfirmDialog(this.page).confirm('Approve');
    this.lastDecisionAnswer = await answer;
    await this.waitForDecisionProcessed(payerName);
  }

  /** What the server answered to the last approve/reject this page sent. */
  private lastDecisionAnswer = '';

  /**
   * Captures the server's answer to the decision about to be confirmed
   * (2026-10-11). Batch 5 (15813) saw an approved request stay in the queue
   * with nothing on screen; without the answer, "the product ignored it" and
   * "our click never sent it" look the same. Locating only - never asserted.
   */
  private watchDecisionAnswer(): Promise<string> {
    return this.page
      .waitForResponse((r) => /\/api\/Approvals\/\w*(Approve|Reject)\w*/i.test(r.url()) && r.request().method() === 'POST', { timeout: Timeouts.default })
      .then(async (r) => {
        const text = await r.text().catch(() => '');
        // The REASON fields, not the first 240 characters: batch 6 cut a 409 at
        // "InnerExcept", exactly where the cause was (2026-10-11).
        let reason = text.replace(/\s+/g, ' ').slice(0, 240);
        try {
          const body = JSON.parse(text) as Record<string, unknown>;
          const pick = (k: string) => (body[k] === undefined || body[k] === null ? '' : `${k}: ${JSON.stringify(body[k]).slice(0, 400)}`);
          const fields = ['Title', 'ErrorMessage', 'InnerException', 'Detail', 'ValidationErrors'].map(pick).filter(Boolean);
          if (fields.length > 0) reason = fields.join('; ');
        } catch { /* not JSON - keep the raw text */ }
        return `${r.request().url().replace(/^https?:\/\/[^/]+/, '')} answered ${r.status()}: ${reason}`;
      })
      .catch(() => 'no approve/reject request was seen after confirming');
  }

  /**
   * Opens the Reject dialog and leaves it open.
   *
   * `reject()` below decides the request outright, which is right for a story
   * that needs a rejected record. The rejection-reason story needs the dialog
   * ITSELF - what it offers, what it gates - and several of its cases must
   * read it and then cancel without deciding anything.
   */
  async openRejectDialog(payerName: string): Promise<ConfirmDialog> {
    await this.search(payerName);
    await this.expectInQueue(payerName);
    await (await this.rowAction(payerName, 'reject')).click();
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    return dialog;
  }

  /** Rejects a queued request: picks a Rejection Reason, acknowledges, confirms. */
  async reject(payerName: string, reason: RejectionReason = 'Other'): Promise<void> {
    Logger.step(`Rejecting "${payerName}" (${reason})`);
    await this.expectInQueue(payerName);
    await (await this.rowAction(payerName, 'reject')).click();
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    await dialog.selectReasonIfPresent(reason);
    const answer = this.watchDecisionAnswer();
    await dialog.confirm('Reject');
    this.lastDecisionAnswer = await answer;
    await this.waitForDecisionProcessed(payerName);
  }

  /**
   * Waits until the decided request has left the pending queue. This confirms
   * the decision persisted server-side before the caller navigates away (which
   * would otherwise cancel the in-flight approve/reject request).
   */
  async waitForDecisionProcessed(payerName: string): Promise<void> {
    // RE-SEARCHES ON EVERY POLL, and that is the whole point.
    //
    // This used to issue ONE search and then wait 30 s for the row to vanish
    // from what that search returned. It cannot vanish: the queue re-queries
    // only when a NEW search is issued - the same caveat `expectInQueue` above
    // already documents for a record arriving - so the wait was staring at a
    // stale result and always spent its full budget before failing.
    //
    // The cost of that was not a slow test but a wrong one. Every provisioning
    // fixture approves something, so each burnt 30 s here and then reported
    // "the payer could not be provisioned", which reads as an application
    // fault. On 2026-09-28 it was taking folder 44 past a four-minute test
    // timeout with the application behaving perfectly.
    await expect
      .poll(
        async () => {
          await this.search(payerName);
          return this.row(payerName).count();
        },
        {
          timeout: Timeouts.default,
          intervals: [500, 1_000, 2_000],
          message:
            `"${payerName}" should leave the approval queue once its request is decided. `
            + 'The queue was re-searched repeatedly and kept returning it, which means the '
            + 'decision did not take effect. Server answer to the decision: '
            + `${this.lastDecisionAnswer || '(not captured - decided outside approve()/reject())'}.`,
        },
      )
      .toBe(0);
  }

  // ---- story 24 additions (network go-live prerequisites) ----

  /**
   * Approves a queued request and reports what the server answered, WITHOUT
   * insisting that the request leaves the queue - for the cases whose subject
   * is an approval the server refuses (a network with no facility, an inactive
   * owning payer). `approve()` treats a refusal as a failure and is the right
   * call everywhere else.
   */
  async attemptApprove(entityName: string): Promise<{ answer: string; stillQueued: boolean }> {
    Logger.step(`Attempting to approve "${entityName}"`);
    await this.expectInQueue(entityName);
    await (await this.rowAction(entityName, 'approve')).click();
    const answer = this.watchDecisionAnswer();
    await new ConfirmDialog(this.page).confirm('Approve');
    this.lastDecisionAnswer = await answer;
    await this.page.waitForLoadState('domcontentloaded');
    // An ACCEPTED approval is given time to leave the queue (2026-10-24). One
    // search straight after the 200 still returned the request - the queue
    // re-queries only on a new search - and 18033 failed with "approval
    // accepted ... answered 200" and stillQueued true at once. A refused one
    // stays, so a single read answers that.
    const accepted = /answered 2\d\d/.test(this.lastDecisionAnswer);
    const stillQueued = accepted
      ? await this.waitForDecisionProcessed(entityName).then(() => false, () => true)
      : await this.isInQueue(entityName);
    return { answer: this.lastDecisionAnswer, stillQueued };
  }

  /** Applies an Approve/Reject decision - keeps the branch out of the spec. */
  async applyDecision(payerName: string, decision: 'Approve' | 'Reject'): Promise<void> {
    if (decision === 'Approve') {
      await this.approve(payerName);
    } else {
      await this.reject(payerName);
    }
  }

  // ---- story 34 / 35 / 41 additions (network change review) ----

  /**
   * The Change Type tag of a queued request ("Create", "Update", "Delete", ...).
   * Read from the row's `-change-type-tag` (verified on the Network tab,
   * 2026-10-21), falling back to the change-type cell the payer queue uses.
   */
  async getChangeType(entityName: string): Promise<string> {
    await this.expectInQueue(entityName);
    const id = await this.rowId(entityName);
    const tag = this.byId(`${id}-change-type-tag`).or(this.byId(`${id}-cell-${APPROVALS_COLUMN.changeType}`)).first();
    return (await tag.innerText()).trim();
  }

  /** The change types of EVERY queued request for an entity - proves what is pending, and that nothing is duplicated. */
  async getQueuedChangeTypes(entityName: string): Promise<string[]> {
    await this.search(entityName);
    await this.waitForPageReady();
    const ids = await this.rows()
      .filter({ hasText: entityName })
      .evaluateAll((rows) => rows.map((row) => (row as HTMLElement).id));
    const types: string[] = [];
    for (const id of ids) {
      types.push((await this.byId(`${id}-change-type-tag`).innerText().catch(() => '')).trim());
    }
    return types;
  }

  /** A queued request's cells (name, change type, status, requested by/on), keyed by column. */
  async readQueuedRow(entityName: string): Promise<Record<string, string>> {
    await this.expectInQueue(entityName);
    const id = await this.rowId(entityName);
    return this.byId(id).evaluate((row) => {
      const out: Record<string, string> = {};
      row.querySelectorAll('[id*="-cell-"]').forEach((cell) => {
        out[cell.id.split('-cell-').pop() ?? ''] = (cell as HTMLElement).innerText.trim();
      });
      out.text = (row as HTMLElement).innerText.replace(/\s+/g, ' ').trim();
      return out;
    });
  }

  /** Opens the Approve confirmation for a queued request and leaves it open. */
  async openApproveDialog(entityName: string): Promise<ConfirmDialog> {
    await this.expectInQueue(entityName);
    await (await this.rowAction(entityName, 'approve')).click();
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    return dialog;
  }

  /** absent / disabled / available for one action on a queued request. */
  async getRowActionAvailability(entityName: string, action: ApprovalsRowAction): Promise<'absent' | 'disabled' | 'available'> {
    await this.expectInQueue(entityName);
    const button = await this.rowAction(entityName, action);
    if ((await button.count()) === 0) return 'absent';
    return (await button.isEnabled()) ? 'available' : 'disabled';
  }

  /**
   * Decides the row ALREADY ON SCREEN, without re-searching - for the cases
   * where the queue was loaded before something changed (another reviewer
   * decided it, the network was edited). Reports the server's answer and
   * whether the request is still queued afterwards; a refused decision leaves
   * the dialog open, so it is dismissed here.
   */
  async attemptDecisionOnLoadedRow(
    entityName: string,
    decision: 'approve' | 'reject',
    reason: RejectionReason = 'Other',
  ): Promise<{ answer: string; dialogStayedOpen: boolean; messages: string }> {
    const button = await this.rowAction(entityName, decision);
    await button.click();
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    if (decision === 'reject') await dialog.selectReasonIfPresent(reason);
    await dialog.acknowledgeIfPresent();
    const answer = this.watchDecisionAnswer();
    await dialog.clickAction('confirm');
    this.lastDecisionAnswer = await answer;
    const messages = await this.getToastMessage(Timeouts.short).catch(() => '');
    const dialogStayedOpen = await dialog.isVisible();
    if (dialogStayedOpen) await dialog.cancel().catch(() => undefined);
    return { answer: this.lastDecisionAnswer, dialogStayedOpen, messages };
  }

  /** The pending request's id for an entity (the approval request, not the network). */
  async getPendingRequestId(entityName: string): Promise<string> {
    const id = await pendingRequestId(this.page, entityName);
    expect(id, `"${entityName}" should have a pending approval request`).not.toBe('');
    return id;
  }

  /**
   * Approves a request by id DIRECTLY - the sheet's "direct API approve" and
   * "stale reference" cases. Sent as the signed-in user of this page.
   */
  async approveRequestViaApi(requestId: string): Promise<{ status: number; text: string; validationErrors: string[] }> {
    return NetworkUtils.postAsSession(this.page, ApiEndpoints.approvalApprove, { id: requestId });
  }

  /** Rejects a request by id DIRECTLY, with a free-text reason. */
  async rejectRequestViaApi(requestId: string, reason: string): Promise<{ status: number; text: string; validationErrors: string[] }> {
    return NetworkUtils.postAsSession(this.page, ApiEndpoints.approvalReject, { id: requestId, reason });
  }

  /**
   * Approves while the approval call is FORCED to fail (a 500 on
   * ApproveRequest), then restores it - the "publish service outage" case.
   * Reports what the user was shown and whether the request is still queued.
   */
  async approveWithFailingService(entityName: string): Promise<{ messages: string; stillQueued: boolean }> {
    await this.expectInQueue(entityName);
    await NetworkUtils.failEndpoint(this.page, ApiEndpoints.approvalApprove, 500);
    let messages = '';
    try {
      await (await this.rowAction(entityName, 'approve')).click();
      const dialog = new ConfirmDialog(this.page);
      await dialog.waitForVisible();
      await dialog.acknowledgeIfPresent();
      await dialog.clickAction('confirm');
      messages = await this.getToastMessage(Timeouts.toast).catch(() => '');
      if (await dialog.isVisible()) await dialog.cancel().catch(() => undefined);
    } finally {
      await NetworkUtils.restoreEndpoint(this.page, ApiEndpoints.approvalApprove);
    }
    return { messages, stillQueued: await this.isInQueue(entityName) };
  }

  /**
   * The queue's change-type filter ("All Change Types"), by its own id -
   * `approvals-<tab>-filter-change-type-multiselect`, read live 2026-10-25. The
   * old "first combobox in the toolbar" resolved to the search input (18275).
   */
  private changeTypeFilter(): Locator {
    return this.byId(`${this.screen}-filter-change-type-multiselect`);
  }

  /** The change types the filter offers. */
  async getChangeTypeOptions(): Promise<string[]> {
    await this.changeTypeFilter().click();
    const options = this.page.getByRole('option').filter({ visible: true });
    await expect(options.first()).toBeVisible({ timeout: Timeouts.default });
    const texts = (await options.allInnerTexts()).map((t) => t.trim()).filter((t) => t !== '');
    await this.changeTypeFilter().click();
    return texts;
  }

  /** Filters the queue to one change type and waits for it to settle. */
  async filterByChangeType(option: string): Promise<void> {
    Logger.step(`Filtering the ${this.approvalScope} queue to change type "${option}"`);
    await this.changeTypeFilter().click();
    await this.page.getByRole('option', { name: option, exact: true }).filter({ visible: true }).first().click();
    await expect(this.changeTypeFilter()).toContainText(option, { timeout: Timeouts.short });
    await this.waitForPageReady();
  }

  /** The change-type tags of every row on the current page. */
  async readVisibleChangeTypes(): Promise<string[]> {
    return (await this.page.locator(`[id^="${this.screen}-table-row-"][id$="-change-type-tag"]`).allInnerTexts()).map((t) =>
      t.trim(),
    );
  }

  /** Sorts the queue by the Sort By menu's first option, returning its label. */
  async sortByFirstOption(): Promise<string> {
    await this.btn(`${this.screen}-sort-trigger`).click();
    const option = this.page.locator(`[id^="${this.screen}-sort-option-"]`).first();
    await expect(option).toBeVisible({ timeout: Timeouts.default });
    const label = (await option.innerText()).trim();
    await option.click();
    await this.waitForPageReady();
    return label;
  }

  /** How many requests the current page of the queue shows. */
  async countVisibleRows(): Promise<number> {
    return this.rows().count();
  }

  /** Opens the Approve dialog and navigates away (to the dashboard) WITHOUT confirming - the exploratory case. */
  async abandonApproval(entityName: string): Promise<void> {
    await this.openApproveDialog(entityName);
    await this.goto(AppRoutes.dashboard);
  }

  /**
   * The signed-in user's latest notifications, each as one line of text - for
   * "the requester is notified". Read from GetMyNotifications (the bell's own
   * feed).
   */
  async readMyNotifications(): Promise<string[]> {
    const res = await NetworkUtils.postAsSession(this.page, ApiEndpoints.myNotifications, {
      pageNumber: 1,
      rowsPerPage: 30,
      unreadOnly: false,
    });
    expect(res.status, 'the notification feed should answer').toBe(200);
    const items = (JSON.parse(res.text) as { payload?: { notifications?: { items?: unknown[] } } }).payload?.notifications?.items ?? [];
    return items.map((item) => JSON.stringify(item));
  }

  // ---- story 14 additions (facility proposals) ----

  /**
   * Opens a queued request's Review panel and returns its WHOLE text, for the
   * cases asking whether the reviewer sees the proposed facility membership.
   * The panel is located by the scope's own namespace
   * (`{screen}-review-drawer`, the pattern the payer panel follows); its
   * facility section has no ids of its own to read field by field.
   */
  async readReviewText(entityName: string): Promise<string> {
    const prefix = `${this.screen}-review-drawer`;
    await this.search(entityName);
    await this.expectInQueue(entityName);
    await (await this.rowAction(entityName, 'review')).click();
    const title = this.page.locator(`#${prefix}-title`);
    await expect(title, 'the Review panel should open').toBeVisible({ timeout: Timeouts.default });
    const panel = title.locator('xpath=ancestor::*[contains(@class,"drawer")][1]');
    const text = (await panel.innerText().catch(async () => this.page.locator(`[id^="${prefix}"]`).allInnerTexts().then((t) => t.join('\n')))).trim();
    await this.page.locator(buttonSelector(`${prefix}-close`)).first().click().catch(() => undefined);
    return text;
  }

  // ---- story 18 additions (network deletion approval) ----

  /**
   * What this session is offered for an entity's request: whether the request
   * is in its queue at all, and whether Approve / Reject are usable on it.
   * Never throws - "not in my queue" is an answer here, not a failure.
   */
  async getDecisionAvailability(entityName: string): Promise<{ inQueue: boolean; approve: boolean; reject: boolean }> {
    const inQueue = await this.isInQueue(entityName);
    if (!inQueue) return { inQueue, approve: false, reject: false };
    const usable = async (action: ApprovalsRowAction): Promise<boolean> => {
      const button = await this.rowAction(entityName, action);
      return (await button.count()) > 0 && (await button.isEnabled());
    };
    return { inQueue, approve: await usable('approve'), reject: await usable('reject') };
  }
}
