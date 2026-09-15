import { test, expect } from '../../../fixtures';
import type { PayerManagementPage } from '../../../pages/payer/PayerManagementPage';
import type { PayerInactivateDialog } from '../../../pages/payer/PayerInactivateDialog';
import type { ApprovalManagementPage } from '../../../pages/approval/ApprovalManagementPage';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import { PRIMARY_REASON } from '../../../data/payers/inactivationDecisions.data';
import { CHANGE_TYPE } from '../../../data/payers/versionHistory.data';
import {
  BLOCKED_CASES,
  PUBLISHED_VERSION,
  TRANSITIONS_IN_A_CYCLE,
} from '../../../data/payers/historicalConfiguration.data';

/**
 * User story: Reconstruct a Payer's Historical Configuration.
 *
 * No point-in-time lookup exists in this build, so every dated case is
 * BLOCKED. What runs is the ledger a reconstruction would read: today's
 * configuration is the latest published version, a never-edited payer has
 * exactly its registration version, and a status cycle leaves each transition
 * as a version.
 */
async function inactivateAndApprove(
  payerManagementPage: PayerManagementPage,
  payerInactivateDialog: PayerInactivateDialog,
  approvalManagementPage: ApprovalManagementPage,
  name: string,
): Promise<void> {
  await payerManagementPage.open();
  await payerManagementPage.search(name);
  await payerManagementPage.waitForRowVisible(name);
  await payerManagementPage.inactivateRow(name);
  await payerInactivateDialog.selectReason(PRIMARY_REASON);
  await payerInactivateDialog.confirm();
  await payerManagementPage.open();
  await payerManagementPage.sendForApproval(name);
  await approvalManagementPage.open();
  await approvalManagementPage.approve(name);
  await payerManagementPage.open();
  await payerManagementPage.search(name);
  await payerManagementPage.expectLifecycleStatus(name, LIFECYCLE_STATUS.inactive.en);
}

async function reactivateAndApprove(
  payerManagementPage: PayerManagementPage,
  approvalManagementPage: ApprovalManagementPage,
  name: string,
): Promise<void> {
  await payerManagementPage.open();
  await payerManagementPage.search(name);
  await payerManagementPage.waitForRowVisible(name);
  const prompt = await payerManagementPage.openActivationPrompt(name);
  await prompt.confirm();
  await payerManagementPage.open();
  await payerManagementPage.sendForApproval(name);
  await approvalManagementPage.open();
  await approvalManagementPage.approve(name);
  await payerManagementPage.open();
  await payerManagementPage.search(name);
  await payerManagementPage.expectLifecycleStatus(name, LIFECYCLE_STATUS.active.en);
}

test.describe('Historical configuration ledger', () => {
  test('TC-004: should match the current configuration when the history is read for today', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and open the payer\'s Version History', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.versionHistory().open();
      await detail.versionHistory().expectTableVisible();
    });

    await steps.step('The latest published version is the one the payer shows as live', async () => {
      const detail = payerManagementPage.detail();
      const entries = await detail.versionHistory().getEntries();
      const published = entries.filter((entry) => PUBLISHED_VERSION.test(entry.status));
      expect(published.length, 'a published payer should list a published version').toBeGreaterThan(0);
      const live = await detail.getVersionLabel();
      expect(live, `the live badge "${live}" should name the latest published version`).toContain(published[0].version);
    });
  });

  test('TC-008: should reflect an Active, Inactive and Active again history as published versions', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();
    let before = 0;

    await steps.critical('Navigate to the module and count the payer\'s versions', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.versionHistory().open();
      before = await detail.versionHistory().getEntryCount();
      expect(before).toBeGreaterThan(0);
    });

    await steps.step('The payer is inactivated and reactivated, each through approval', async () => {
      await inactivateAndApprove(payerManagementPage, payerInactivateDialog, approvalManagementPage, publishedPayer.nameEn);
      await reactivateAndApprove(payerManagementPage, approvalManagementPage, publishedPayer.nameEn);
    });

    await steps.step('Each transition is a published version and the latest state is Active', async () => {
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const history = detail.versionHistory();
      await history.open();
      expect(await history.getEntryCount(), 'both transitions should be recorded').toBeGreaterThanOrEqual(before + TRANSITIONS_IN_A_CYCLE);
      const entries = await history.getEntries();
      expect(PUBLISHED_VERSION.test(entries[0].status), `the newest version should be published; it reads "${entries[0].status}"`).toBe(true);
    });
  });

  test('TC-014: should return the original registration when a payer has never been edited', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and open a never-edited payer\'s Version History', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.versionHistory().open();
      await detail.versionHistory().expectTableVisible();
    });

    await steps.step('History holds exactly the registration version', async () => {
      const entries = await payerManagementPage.detail().versionHistory().getEntries();
      expect(entries.length, `a never-edited payer should have one version; it has ${entries.length}`).toBe(1);
      expect(entries[0].changeType, 'that version should be the registration').toBe(CHANGE_TYPE.create);
      expect(PUBLISHED_VERSION.test(entries[0].status), 'and it should be published').toBe(true);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.id}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
