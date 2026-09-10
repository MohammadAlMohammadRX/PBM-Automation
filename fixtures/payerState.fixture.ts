import { test as base } from '@playwright/test';
import { PayerManagementPage } from '../pages/payer/PayerManagementPage';
import { ApprovalManagementPage } from '../pages/approval/ApprovalManagementPage';
import { PayerInactivateDialog } from '../pages/payer/PayerInactivateDialog';
import { buildUniquePayer } from '../data/payers/payer.data';
import type { PayerData } from '../data/payers/payerTypes';
import { DateUtils } from '../utils/DateUtils';
import { Logger } from '../utils/Logger';
import { PAYER_COLUMN } from '../constants/ElementIds';
import { blockedByPrecondition } from './testStatus.fixture';
import { LIFECYCLE_STATUS } from '../data/payers/statusTransition.data';

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
  /** A second live/published payer, for the cases that need two. */
  secondPublishedPayer: PayerData;
  /** A live payer whose status has been moved to Inactive and approved. */
  inactivePayer: PayerData;
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

/**
 * Creates a payer, sends it for approval and approves it - the whole route to
 * a LIVE payer - and returns its immutable Payer Code.
 *
 * Shared by `publishedPayer` and `secondPublishedPayer` so the two cannot
 * drift apart. The code is captured here rather than by the caller because it
 * is issued at publish time and the NAME is not stable: several edit cases
 * rename their payer, which would leave a name-based cleanup unable to find the
 * record afterwards.
 */
async function provisionPublishedPayer(
  payerPage: PayerManagementPage,
  approvalPage: ApprovalManagementPage,
  data: PayerData,
  testInfo: Parameters<typeof blockedByPrecondition>[0],
): Promise<string> {
  try {
    await createDraft(payerPage, data);
    await payerPage.sendForApproval(data.nameEn);
    await approvalPage.open();
    await approvalPage.approve(data.nameEn);
    await payerPage.open().catch(() => undefined);
    return await payerPage.getPayerCode(data.nameEn).catch(() => '');
  } catch (error) {
    // Clean up the half-published record before reporting BLOCKED.
    await purgePayer(payerPage, approvalPage, data.nameEn).catch(() => undefined);
    blockedByPrecondition(testInfo, `a published payer ("${data.nameEn}")`, error);
  }
  return '';
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

    const code = await provisionPublishedPayer(payerPage, approvalPage, data, testInfo);

    await use(data);

    // The record is live at v1, so the maker's delete only stages a Delete
    // change - purgePayer approves it so the payer really leaves the module.
    await purgePayer(payerPage, approvalPage, code.trim() || data.nameEn);
  },
  /**
   * A payer that is live and INACTIVE, provisioned rather than sampled.
   *
   * The activation cases need an inactive payer they may actually activate, and
   * the environment's inactive payers cannot be used for that: activating one
   * takes it out of the pool every other status-dependent case draws from, and
   * the change is permanent once approved.
   *
   * Getting there costs two maker-checker round trips - publish the payer, then
   * stage and approve its inactivation - because confirming the drawer only
   * saves a draft. That is the whole reason this is a fixture: the cost is paid
   * once per test that needs it, in a place where a failure reports BLOCKED
   * (the precondition could not be built) rather than a spurious FAIL.
   */
  /**
   * A SECOND published payer, for the cases that need two.
   *
   * The network-assignment story turns on one network and two payers competing
   * for it - "assign it here, then approve it there, and watch the first
   * request fail" - which cannot be expressed with a single fixture instance.
   *
   * Provisioned by the same helper as `publishedPayer`, so the two cannot drift
   * apart, and torn down the same way.
   */
  secondPublishedPayer: async ({ page }, use, testInfo) => {
    const payerPage = new PayerManagementPage(page);
    const approvalPage = new ApprovalManagementPage(page);
    const data = buildUniquePayer({ effectiveDate: DateUtils.pastDate(30) });

    Logger.step(`[fixture] Provisioning a second published payer "${data.nameEn}"`);
    const code = await provisionPublishedPayer(payerPage, approvalPage, data, testInfo);

    await use(data);

    await purgePayer(payerPage, approvalPage, code.trim() || data.nameEn);
  },

  inactivePayer: async ({ page }, use, testInfo) => {
    const payerPage = new PayerManagementPage(page);
    const approvalPage = new ApprovalManagementPage(page);
    const inactivateDialog = new PayerInactivateDialog(page);
    const data = buildUniquePayer({ effectiveDate: DateUtils.pastDate(30) });

    Logger.step(`[fixture] Provisioning inactive payer "${data.nameEn}"`);

    let code = '';
    try {
      await createDraft(payerPage, data);
      await payerPage.sendForApproval(data.nameEn);
      await approvalPage.open();
      await approvalPage.approve(data.nameEn);

      await payerPage.open();
      code = await payerPage.getPayerCode(data.nameEn).catch(() => '');

      // Stage the inactivation, then approve it - the status does not move until
      // a checker has.
      await payerPage.findAndInactivateRow(data.nameEn);
      await inactivateDialog.inactivateWithFirstReason('Inactivated to provision a fixture.');
      await payerPage.open();
      await payerPage.sendForApproval(data.nameEn);
      await approvalPage.open();
      await approvalPage.expectInQueue(data.nameEn);
      await approvalPage.approve(data.nameEn);

      // Confirm the precondition actually holds. Without this a fixture that
      // silently failed to move the status would hand the test an ACTIVE payer,
      // and the test would report "activation was refused" - true, but for the
      // wrong reason entirely.
      await payerPage.open();
      await payerPage.search(data.nameEn);
      await payerPage.expectLifecycleStatus(data.nameEn, LIFECYCLE_STATUS.inactive.en);
    } catch (error) {
      await purgePayer(payerPage, approvalPage, code.trim() || data.nameEn).catch(() => undefined);
      blockedByPrecondition(testInfo, `a live payer in the Inactive state ("${data.nameEn}")`, error);
    }

    await use(data);

    await purgePayer(payerPage, approvalPage, code.trim() || data.nameEn);
  },
});
