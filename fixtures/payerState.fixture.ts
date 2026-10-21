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
  /**
   * Publishes a payer built from `overrides` and hands it back live.
   *
   * For the cases whose live payer needs PARTICULAR data - a licence full of
   * special characters for the export, an effective date in the future for the
   * activation job, an expiry of tomorrow for the expiry job. `publishedPayer`
   * cannot express any of those, and each spec re-walking create → send →
   * approve is the duplication this factory removes. Every payer published
   * through it is purged at teardown.
   */
  publishPayer: (overrides?: Partial<PayerData>) => Promise<PayerData>;
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
/**
 * Clean-up after a case has run: given its OWN time, bounded, and never the
 * case's verdict (2026-10-11).
 *
 * Teardown time counts against the test's timeout in Playwright, so a case
 * whose steps all passed was being reported FAILED by its own clean-up -
 * "Tearing down publishedPayer exceeded the test timeout" - in 15274, 15282,
 * 15285, 14599, 15611 and 15575, every step green. The budget is extended for
 * the clean-up, the clean-up is capped, and a clean-up that cannot finish is
 * logged and left for the next sweep rather than failing a passed case.
 */
const CLEANUP_LIMIT_MS = 110_000;
export async function cleanUpAfterCase(
  testInfo: { timeout: number; setTimeout: (ms: number) => void },
  what: string,
  work: () => Promise<void>,
): Promise<void> {
  testInfo.setTimeout(testInfo.timeout + CLEANUP_LIMIT_MS + 10_000);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), CLEANUP_LIMIT_MS); });
  const outcome = await Promise.race([work().then(() => 'done' as const, (e: Error) => e), limit]);
  if (timer) clearTimeout(timer);
  if (outcome === 'timeout') Logger.warn(`[fixture] clean-up of ${what} did not finish within ${CLEANUP_LIMIT_MS / 1000} s - left for the next sweep`);
  else if (outcome instanceof Error) Logger.warn(`[fixture] clean-up of ${what} failed: ${outcome.message.split(/\r?\n/)[0]}`);
}

export async function purgePayer(
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
/**
 * Gives a freshly created payer a network, which approval now requires.
 *
 * Since 2026-09-27 the server refuses to approve a payer holding none:
 * "A payer must have at least one assigned network before this change can be
 * approved." Every provisioning path below ends in an approval, so without
 * this step they all fail - and they fail at the approval, which reads as the
 * application refusing a legitimate change rather than a missing precondition.
 *
 * RELOADS FIRST, and that is not incidental. The payer scope switcher fetches
 * its list when the page loads, so a payer created moments ago is not in it
 * yet; without the reload the row cannot be brought into view at all and the
 * assignment cannot even be attempted. Verified 2026-09-28.
 *
 * The network comes from the seeded pool (npm run seed:networks). A network
 * cannot be shared between payers, so a run consumes one per provisioning and
 * an exhausted pool surfaces here as "no network was offered".
 */
export async function assignANetwork(payerPage: PayerManagementPage, payerName: string): Promise<void> {
  await payerPage.reopen();
  await payerPage.scopeTo(payerName);
  await payerPage.search(payerName);

  const detail = await payerPage.openDetails(payerName);

  // assignNetwork opens the tab AND the drawer itself, then takes the first
  // network on offer. Opening either of them here first left the assign button
  // sitting under an already-open drawer, and the click timed out - which
  // surfaced as every provisioning reporting BLOCKED.
  const assigned = await detail.assignNetwork().catch((error: Error) => {
    throw new Error(
      `could not give "${payerName}" a network, and approval now requires one. The seeded pool `
      + 'may be exhausted - run "npm run seed:networks" and try again. Underlying failure: '
      + error.message.split('\n')[0],
    );
  });

  Logger.step(`[fixture] Assigned "${assigned}" to "${payerName}"`);
  await payerPage.open();
  await payerPage.search(payerName);
}

export async function provisionPublishedPayer(
  payerPage: PayerManagementPage,
  approvalPage: ApprovalManagementPage,
  data: PayerData,
  testInfo: Parameters<typeof blockedByPrecondition>[0],
): Promise<string> {
  try {
    await createDraft(payerPage, data);
    await assignANetwork(payerPage, data.nameEn);
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
    await cleanUpAfterCase(testInfo, `payer ${data.nameEn}`, () => purgePayer(payerPage, approvalPage, data.nameEn));
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
    await cleanUpAfterCase(testInfo, 'payer ' + data.nameEn, () => purgePayer(payerPage, approvalPage, code.trim() || data.nameEn));
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

    await cleanUpAfterCase(testInfo, 'payer ' + data.nameEn, () => purgePayer(payerPage, approvalPage, code.trim() || data.nameEn));
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
      // Approval now requires a network - see assignANetwork.
      await assignANetwork(payerPage, data.nameEn);
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

    await cleanUpAfterCase(testInfo, 'payer ' + data.nameEn, () => purgePayer(payerPage, approvalPage, code.trim() || data.nameEn));
  },

  publishPayer: async ({ page }, use, testInfo) => {
    const payerPage = new PayerManagementPage(page);
    const approvalPage = new ApprovalManagementPage(page);
    const published: Array<{ code: string; data: PayerData }> = [];

    await use(async (overrides: Partial<PayerData> = {}) => {
      const data = buildUniquePayer({ effectiveDate: DateUtils.pastDate(30), ...overrides });
      Logger.step(`[fixture] Publishing payer "${data.nameEn}"`);
      const code = await provisionPublishedPayer(payerPage, approvalPage, data, testInfo);
      published.push({ code: code.trim(), data });
      return data;
    });

    for (const { code, data } of published) {
      await cleanUpAfterCase(testInfo, `payer ${data.nameEn}`, () => purgePayer(payerPage, approvalPage, code || data.nameEn));
    }
  },
});
