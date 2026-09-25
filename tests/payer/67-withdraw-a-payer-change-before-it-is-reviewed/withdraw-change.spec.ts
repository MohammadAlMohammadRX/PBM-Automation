import { test, expect } from '../../../fixtures';
import { azureOrCase } from '../../../data/azureTestIds.data';
import type { PayerManagementPage } from '../../../pages/payer/PayerManagementPage';
import { APPROVAL_STATE, WITHDRAWAL_WARNING } from '../../../data/payers/withdrawApproval.data';
import { UNMODIFIED_INDICATORS } from '../../../data/payers/overviewMetadata.data';
import {
  BLOCKED_CASES,
  DECIDED_STATUS,
  RAPID_WITHDRAW_CLICKS,
  WITHDRAW_EDIT,
  WITHDRAWAL_AUDIT_HINT,
} from '../../../data/payers/withdrawChange.data';

/**
 * User story: Withdraw a Payer Change Before It Is Reviewed.
 *
 * Withdrawal here is an EDIT of the pending payer: the save raises "Return
 * this payer to draft?" and confirming it withdraws the request (see
 * withdrawChange.data.ts). "Withdrawn" is therefore asserted as the request
 * leaving the queue, the payer reading Draft, and no reviewer decision on the
 * version. Role and corrupted-data cases are BLOCKED.
 */
/** A reviewer cell reads blank or one of the app's unmodified dashes when nobody decided. */
const noReviewer = (value: string): boolean =>
  value.trim() === '' || UNMODIFIED_INDICATORS.includes(value.trim() as (typeof UNMODIFIED_INDICATORS)[number]);

async function stagePendingChange(payerManagementPage: PayerManagementPage, name: string): Promise<void> {
  await payerManagementPage.open();
  await payerManagementPage.editTextFieldAndSave(name, WITHDRAW_EDIT.label, WITHDRAW_EDIT.staged);
  await payerManagementPage.open();
  await payerManagementPage.sendForApproval(name);
}

async function withdrawViaEdit(payerManagementPage: PayerManagementPage, name: string): Promise<void> {
  await payerManagementPage.open();
  const form = await payerManagementPage.openEditForm(name);
  await form.setFieldValue(WITHDRAW_EDIT.label, WITHDRAW_EDIT.withdrawing, 'text');
  expect(await form.saveAndReportDialog(), 'the withdrawal warning should appear').toBe(true);
  expect(await payerManagementPage.dialog().getTitle()).toContain(WITHDRAWAL_WARNING.title);
  await payerManagementPage.form().confirmWithdrawal();
  await payerManagementPage.open();
  await payerManagementPage.search(name);
  await payerManagementPage.expectApprovalStatusContains(name, APPROVAL_STATE.draft);
}

test.describe('Withdraw a pending payer change', () => {
  // Azure test case 15712
  test('15712: should withdraw the maker\'s own pending request and return the payer to draft', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module and stage a pending change', async () => {
      await stagePendingChange(payerManagementPage, publishedPayer.nameEn);
    });

    await steps.step('The maker withdraws it and the payer reads Draft', async () => {
      await withdrawViaEdit(payerManagementPage, publishedPayer.nameEn);
    });

    await steps.step('The request is gone from the queue', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectNotInQueue(publishedPayer.nameEn);
    });
  });

  // Azure test case 15713
  test('15713: should record no reviewer decision on a withdrawn request', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module, stage a change and withdraw it', async () => {
      await stagePendingChange(payerManagementPage, publishedPayer.nameEn);
      await withdrawViaEdit(payerManagementPage, publishedPayer.nameEn);
    });

    await steps.step('The withdrawn version carries no approver, rejecter or decision', async () => {
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const history = detail.versionHistory();
      await history.open();
      const draft = (await history.getEntries()).find((entry) => /draft/i.test(entry.status));
      expect(draft, 'the withdrawn version should be listed as a draft').not.toBe(undefined);
      expect(noReviewer(draft?.reviewedBy ?? ''), `no reviewer should be recorded; it reads "${draft?.reviewedBy}"`).toBe(true);
      expect(DECIDED_STATUS.test(draft?.status ?? ''), 'no decision should be recorded').toBe(false);
    });
  });

  // Azure test case 15714
  test('15714: should remove the withdrawn request from the reviewer\'s queue', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module, stage a change and see it queued', async () => {
      await stagePendingChange(payerManagementPage, publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
    });

    await steps.step('After withdrawal the queue no longer lists it', async () => {
      await withdrawViaEdit(payerManagementPage, publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectNotInQueue(publishedPayer.nameEn);
    });
  });

  // Azure test case 15715
  test('15715: should exclude the withdrawn request from the pending count', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module and stage a change - the pending count is one', async () => {
      await stagePendingChange(payerManagementPage, publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
      expect(await approvalManagementPage.countQueuedRequests(publishedPayer.nameEn)).toBe(1);
    });

    await steps.step('After withdrawal the pending count is zero', async () => {
      await withdrawViaEdit(payerManagementPage, publishedPayer.nameEn);
      await approvalManagementPage.open();
      expect(await approvalManagementPage.countQueuedRequests(publishedPayer.nameEn)).toBe(0);
    });
  });

  // Azure test case 15716
  test('15716: should not count a withdrawal as a rejection', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module, stage a change and withdraw it', async () => {
      await stagePendingChange(payerManagementPage, publishedPayer.nameEn);
      await withdrawViaEdit(payerManagementPage, publishedPayer.nameEn);
    });

    await steps.step('No version of the payer reads Rejected', async () => {
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const history = detail.versionHistory();
      await history.open();
      const statuses = await history.getListedStatuses();
      expect(statuses.some((status) => /rejected/i.test(status)), `a withdrawal is not a rejection; statuses: ${statuses.join(', ')}`).toBe(false);
    });
  });

  // Azure test case 15718
  test('15718: should offer no withdrawal for a request that has already been approved', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module, stage a change and have it approved', async () => {
      await stagePendingChange(payerManagementPage, publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.approve(publishedPayer.nameEn);
    });

    await steps.step('Editing the payer now raises no withdrawal - there is nothing pending to withdraw', async () => {
      await payerManagementPage.open();
      const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
      await form.setFieldValue(WITHDRAW_EDIT.label, WITHDRAW_EDIT.again, 'text');
      expect(await form.saveAndReportDialog(), 'an approved request cannot be withdrawn').toBe(false);
      await form.closeAndDiscard();
    });
  });

  // Azure test case 15720
  test('15720: should offer no withdrawal for a request that has already been rejected', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module, stage a change and have it rejected', async () => {
      await stagePendingChange(payerManagementPage, publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.reject(publishedPayer.nameEn);
    });

    await steps.step('Editing the payer now raises no withdrawal', async () => {
      await payerManagementPage.open();
      const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
      await form.setFieldValue(WITHDRAW_EDIT.label, WITHDRAW_EDIT.again, 'text');
      expect(await form.saveAndReportDialog(), 'a rejected request cannot be withdrawn').toBe(false);
      await form.closeAndDiscard();
    });
  });

  // Azure test case 15721
  test('15721: should offer no second withdrawal once a request has been withdrawn', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module, stage a change and withdraw it', async () => {
      await stagePendingChange(payerManagementPage, publishedPayer.nameEn);
      await withdrawViaEdit(payerManagementPage, publishedPayer.nameEn);
    });

    await steps.step('A further edit raises no withdrawal warning', async () => {
      await payerManagementPage.open();
      const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
      await form.setFieldValue(WITHDRAW_EDIT.label, WITHDRAW_EDIT.again, 'text');
      expect(await form.saveAndReportDialog(), 'nothing is pending, so nothing can be withdrawn again').toBe(false);
      await form.closeAndDiscard();
    });
  });

  // Azure test case 15723
  test('15723: should settle on one consistent state when a withdrawal races a reviewer decision', async ({
    payerManagementPage,
    approvalManagementPage,
    staleSession,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module, stage a change and open it for withdrawal', async () => {
      await stagePendingChange(payerManagementPage, publishedPayer.nameEn);
      const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
      await form.setFieldValue(WITHDRAW_EDIT.label, WITHDRAW_EDIT.withdrawing, 'text');
      expect(await form.isOpen()).toBe(true);
    });

    await steps.step('A reviewer approves it in another session first', async () => {
      await staleSession.approvalPage.open();
      await staleSession.approvalPage.approve(publishedPayer.nameEn);
    });

    await steps.step('The maker\'s withdrawal attempt does not leave the payer in two states', async () => {
      await payerManagementPage.form().saveAndReportDialog();
      await payerManagementPage.dialog().acknowledgeIfPresent();
      await payerManagementPage.form().closeAndDiscard();
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      const label = await payerManagementPage.getVersionLabel(publishedPayer.nameEn);
      expect(label, `the payer must not still read pending after a decision; it reads "${label}"`).not.toMatch(/pending/i);
      await approvalManagementPage.open();
      expect(await approvalManagementPage.countQueuedRequests(publishedPayer.nameEn)).toBe(0);
    });
  });

  // Azure test case 15724
  test('15724: should record a single withdrawal when Withdraw is pressed repeatedly', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();
    let versionsBefore = 0;

    await steps.critical('Navigate to the module and stage a pending change', async () => {
      await stagePendingChange(payerManagementPage, publishedPayer.nameEn);
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const history = detail.versionHistory();
      await history.open();
      versionsBefore = await history.getEntryCount();
      expect(versionsBefore).toBeGreaterThan(0);
    });

    await steps.step('The withdrawal confirmation is pressed several times', async () => {
      await payerManagementPage.open();
      const form = await payerManagementPage.openEditForm(publishedPayer.nameEn);
      await form.setFieldValue(WITHDRAW_EDIT.label, WITHDRAW_EDIT.withdrawing, 'text');
      expect(await form.saveAndReportDialog()).toBe(true);
      await payerManagementPage.dialog().confirmRepeatedly(RAPID_WITHDRAW_CLICKS);
      await payerManagementPage.form().closeAndDiscard();
    });

    await steps.step('Exactly one withdrawal happened', async () => {
      await approvalManagementPage.open();
      expect(await approvalManagementPage.countQueuedRequests(publishedPayer.nameEn)).toBe(0);
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const history = detail.versionHistory();
      await history.open();
      const labels = await history.getVersionLabels();
      expect(new Set(labels).size, `no version should be duplicated; listed: ${labels.join(', ')}`).toBe(labels.length);
      expect(await history.getEntryCount()).toBeLessThanOrEqual(versionsBefore + 1);
    });
  });

  // Azure test case 15726
  test('15726: should record the withdrawal in the audit trail with the maker and no reviewer', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module, stage a change and withdraw it', async () => {
      await stagePendingChange(payerManagementPage, publishedPayer.nameEn);
      await withdrawViaEdit(payerManagementPage, publishedPayer.nameEn);
    });

    await steps.step('The audit trail records the withdrawal', async () => {
      // Polled: the timeline loads after the tab activates, and a single
      // instantaneous read came back empty on a slow environment.
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.openAuditHistory();
      await detail.expectAuditEntryMatching(WITHDRAWAL_AUDIT_HINT, 'the withdrawal of the pending change');
    });

    await steps.step('And the version carries no reviewer', async () => {
      const history = payerManagementPage.detail().versionHistory();
      await history.open();
      const draft = (await history.getEntries()).find((entry) => /draft/i.test(entry.status));
      expect(noReviewer(draft?.reviewedBy ?? ''), `the withdrawn version should name no reviewer; it reads "${draft?.reviewedBy}"`).toBe(true);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    // Azure test cases - one per generated case:
    //   TC-006 = 15717,  TC-007 = 15719,  TC-011 = 15722
    //   TC-015 = 15725,  TC-016 = 15727
    test(`${azureOrCase('67', 'TC-' + blocked.id)}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
