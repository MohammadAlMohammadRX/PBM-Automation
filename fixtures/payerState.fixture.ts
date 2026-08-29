import { test as base } from '@playwright/test';
import { PayerManagementPage } from '../pages/payer/PayerManagementPage';
import { ApprovalManagementPage } from '../pages/approval/ApprovalManagementPage';
import { buildUniquePayer } from '../data/payers/payer.data';
import type { PayerData } from '../data/payers/payerTypes';
import { DateUtils } from '../utils/DateUtils';
import { Logger } from '../utils/Logger';
import { PAYER_COLUMN } from '../constants/ElementIds';
import { blockedByPrecondition } from './testStatus.fixture';

/**
 * Payer-state fixtures.
 *
 * Several user stories start from a payer that is already in a particular
 * state ("a draft exists", "a live/published payer exists"). Rather than each
 * spec re-walking the UI to build that state, these fixtures provision it once
 * and hand the spec the resulting record - which is what the "preconditions via
 * fixtures" rule asks for. Every fixture builds its own unique payer, so tests
 * stay independent.
 */
export interface PayerStateFixtures {
  /** A payer saved as a private Draft (v0, never approved). */
  draftPayer: PayerData;
  /** A payer taken all the way through approval - live/published at v1. */
  publishedPayer: PayerData;
}

async function createDraft(page: PayerManagementPage, data: PayerData): Promise<void> {
  await page.open();
  await page.createDraftPayer(data);
}

/**
 * Removes a provisioned payer for good.
 *
 * Deleting a PUBLISHED payer is a maker-checker operation: the maker's delete is
 * only staged, and the record survives in the module until a checker approves
 * the Delete change. Without that second step every `publishedPayer` leaks a
 * record that can never be removed - roughly 20 per full-module run - and the
 * accumulating data changes which rows land on page one of the list. That is how
 * three Status-sorting assertions ended up passing vacuously for weeks.
 *
 * A draft discards outright and queues nothing, so the approval step is a no-op
 * for `draftPayer`. Every step is best-effort: a cleanup problem must never fail
 * a test that already passed.
 */
async function purgePayer(
  payerPage: PayerManagementPage,
  approvalPage: ApprovalManagementPage,
  identifier: string,
): Promise<void> {
  // Removing a payer can take more than one maker-checker round trip. If the
  // record already carries a pending change (an edit awaiting approval), the
  // queued request found after deleting is that EDIT, not the deletion - so the
  // first pass approves the edit and the next pass performs the deletion. Each
  // pass exits early once the record is gone.
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await payerPage.open().catch(() => undefined);
    const present = await payerPage.isRowVisibleAfterSearch(identifier).catch(() => false);
    if (!present) {
      if (attempt > 1) Logger.cleanup(`"${identifier}" removed`);
      else Logger.cleanup(`Could not find "${identifier}" to clean up - nothing removed`);
      return;
    }

    // The approval queue lists payers by NAME and has no Payer Code column, so
    // the current name is read before deleting - a test may have renamed it.
    const currentName = (await payerPage
      .getCellValue(identifier, PAYER_COLUMN.payerName)
      .catch(() => '')).trim();

    // Deleting a live payer does not remove it: the record becomes a DRAFT
    // carrying the pending deletion, which the maker must then send for
    // approval. Only once a checker approves does the payer leave the list.
    await payerPage.deletePayer(identifier).catch(() => undefined);

    const queueKey = currentName || identifier;

    // A payer holding a dependency is refused - the dependency tests create one
    // deliberately. Release the link first: leaving it in place would keep the
    // record undeletable AND keep the network consumed, draining the pool of
    // assignable networks until those tests can no longer run at all.
    if (await payerPage.wasDeletionBlockedByDependency().catch(() => false)) {
      Logger.cleanup(`"${identifier}" has dependencies - releasing them so it can be removed`);
      const detail = await payerPage.openDetails(identifier).catch(() => null);
      if (detail) {
        await detail.unassignAllNetworks().catch(() => undefined);
        await payerPage.open().catch(() => undefined);
        await payerPage.sendForApproval(identifier).catch(() => undefined);
        await approvalPage.open().catch(() => undefined);
        if (await approvalPage.isInQueue(queueKey).catch(() => false)) {
          Logger.cleanup(`Approving the network release for "${queueKey}"`);
          await approvalPage.approve(queueKey).catch(() => undefined);
        }
      }
      continue; // next pass retries the deletion, now unblocked
    }

    await payerPage.sendForApproval(identifier).catch(() => undefined);

    await approvalPage.open().catch(() => undefined);
    const queued = await approvalPage.isInQueue(queueKey).catch(() => false);
    if (queued) {
      Logger.cleanup(`Approving queued change for "${queueKey}" (pass ${attempt})`);
      await approvalPage.approve(queueKey).catch(() => undefined);
    }
  }

  Logger.cleanup(`"${identifier}" still present after 4 passes - record left behind`);
}

export const test = base.extend<PayerStateFixtures>({
  draftPayer: async ({ page }, use, testInfo) => {
    const payerPage = new PayerManagementPage(page);
    const approvalPage = new ApprovalManagementPage(page);
    const data = buildUniquePayer();
    Logger.step(`[fixture] Provisioning draft payer "${data.nameEn}"`);

    try {
      await createDraft(payerPage, data);
    } catch (error) {
      // Clean up whatever was half-created before reporting BLOCKED.
      await purgePayer(payerPage, approvalPage, data.nameEn).catch(() => undefined);
      blockedByPrecondition(testInfo, `a draft payer ("${data.nameEn}")`, error);
    }

    await use(data);

    // Teardown: remove the record if the test left it behind. A test may have
    // sent this draft for approval, so the queue is checked too.
    await purgePayer(payerPage, approvalPage, data.nameEn);
  },

  publishedPayer: async ({ page }, use, testInfo) => {
    const payerPage = new PayerManagementPage(page);
    const approvalPage = new ApprovalManagementPage(page);
    // Effective in the past so the approved payer is immediately live/Active.
    const data = buildUniquePayer({ effectiveDate: DateUtils.pastDate(30) });

    Logger.step(`[fixture] Provisioning published payer "${data.nameEn}"`);

    let code = '';
    try {
      await createDraft(payerPage, data);
      await payerPage.sendForApproval(data.nameEn);
      await approvalPage.open();
      await approvalPage.approve(data.nameEn);

      // Capture the Payer Code now: it is issued at publish time and is
      // immutable, whereas the NAME is not - several edit tests rename the
      // payer, which would leave a name-based cleanup unable to find the record
      // afterwards.
      await payerPage.open().catch(() => undefined);
      code = await payerPage.getPayerCode(data.nameEn).catch(() => '');
    } catch (error) {
      // Clean up the half-published record before reporting BLOCKED.
      await purgePayer(payerPage, approvalPage, data.nameEn).catch(() => undefined);
      blockedByPrecondition(testInfo, `a published payer ("${data.nameEn}")`, error);
    }

    await use(data);

    // The record is live at v1, so the maker's delete only stages a Delete
    // change - purgePayer approves it so the payer really leaves the module.
    await purgePayer(payerPage, approvalPage, code.trim() || data.nameEn);
  },
});
