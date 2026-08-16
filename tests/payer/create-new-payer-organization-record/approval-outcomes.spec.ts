import { test } from '../../../fixtures';
import { buildUniquePayer, approvalScenarios } from '../../../data/payers/payer.data';
import { DateUtils } from '../../../utils/DateUtils';

/**
 * User story: Create New Payer Organization Record.
 * Reviewer decision outcomes: PayerCode generation, rejection, and the
 * Effective-Date-driven lifecycle status. In this environment the System
 * Administrator also holds checker rights, so the reviewer step runs in the
 * same session (see traceability notes for the true multi-role limitation).
 */
test.describe('Create New Payer Organization Record - Approval outcomes', () => {
  test('TC-004: should generate and assign a PayerCode only after the reviewer approves the request', async ({
    payerManagementPage,
    approvalManagementPage,
    cleanup,
  }) => {
    const data = buildUniquePayer({ effectiveDate: DateUtils.pastDate(30) });
    cleanup.register(() => payerManagementPage.deletePayer(data.nameEn));

    await payerManagementPage.open();
    await payerManagementPage.createDraftPayer(data);
    // No PayerCode exists while the record is unapproved.
    await payerManagementPage.expectNoPayerCode(data.nameEn);
    await payerManagementPage.sendForApproval(data.nameEn);
    await payerManagementPage.expectNoPayerCode(data.nameEn);

    await approvalManagementPage.open();
    await approvalManagementPage.approve(data.nameEn);

    await payerManagementPage.open();
    await payerManagementPage.expectApprovalOutcome(data.nameEn, 'Published', true);
  });

  test('TC-005: should not consume a PayerCode when the reviewer rejects the request', async ({
    payerManagementPage,
    approvalManagementPage,
    cleanup,
  }) => {
    const data = buildUniquePayer();
    cleanup.register(() => payerManagementPage.deletePayer(data.nameEn));

    await payerManagementPage.open();
    await payerManagementPage.createDraftPayer(data);
    await payerManagementPage.sendForApproval(data.nameEn);

    await approvalManagementPage.open();
    await approvalManagementPage.reject(data.nameEn, 'Incorrect Data');

    await payerManagementPage.open();
    await payerManagementPage.expectApprovalOutcome(data.nameEn, 'Rejected', false);
  });

  test('TC-006: should set the payer status to Active when the Effective Date equals today upon approval', async ({
    payerManagementPage,
    approvalManagementPage,
    cleanup,
  }) => {
    const data = buildUniquePayer({ effectiveDate: DateUtils.todayFormatted() });
    cleanup.register(() => payerManagementPage.deletePayer(data.nameEn));

    await payerManagementPage.open();
    await payerManagementPage.createDraftPayer(data);
    await payerManagementPage.sendForApproval(data.nameEn);

    await approvalManagementPage.open();
    await approvalManagementPage.approve(data.nameEn);

    await payerManagementPage.open();
    await payerManagementPage.expectPublishedWithStatus(data.nameEn, 'Active');
  });

  test('TC-007: should set the payer status to Pending when the Effective Date is one day in the future upon approval', async ({
    payerManagementPage,
    approvalManagementPage,
    cleanup,
  }) => {
    const data = buildUniquePayer({ effectiveDate: DateUtils.futureDate(1) });
    cleanup.register(() => payerManagementPage.deletePayer(data.nameEn));

    await payerManagementPage.open();
    await payerManagementPage.createDraftPayer(data);
    await payerManagementPage.sendForApproval(data.nameEn);

    await approvalManagementPage.open();
    await approvalManagementPage.approve(data.nameEn);

    await payerManagementPage.open();
    await payerManagementPage.expectPublishedWithStatus(data.nameEn, 'Pending');
  });

  test('TC-008: should set the payer status to Active when the Effective Date is in the past upon approval', async ({
    payerManagementPage,
    approvalManagementPage,
    cleanup,
  }) => {
    const data = buildUniquePayer({ effectiveDate: DateUtils.pastDate(200) });
    cleanup.register(() => payerManagementPage.deletePayer(data.nameEn));

    await payerManagementPage.open();
    await payerManagementPage.createDraftPayer(data);
    await payerManagementPage.sendForApproval(data.nameEn);

    await approvalManagementPage.open();
    await approvalManagementPage.approve(data.nameEn);

    await payerManagementPage.open();
    await payerManagementPage.expectPublishedWithStatus(data.nameEn, 'Active');
  });

  test('TC-019: should surface the submitted payer in the reviewer approval queue with actionable controls', async ({
    payerManagementPage,
    approvalManagementPage,
    cleanup,
  }) => {
    const data = buildUniquePayer();
    cleanup.register(() => payerManagementPage.deletePayer(data.nameEn));

    await payerManagementPage.open();
    await payerManagementPage.createDraftPayer(data);
    await payerManagementPage.sendForApproval(data.nameEn);

    await approvalManagementPage.open();
    await approvalManagementPage.expectInQueue(data.nameEn);
    await approvalManagementPage.expectActionsAvailable(data.nameEn);
  });

  // TC-018: decision-table roll-up of approve/reject x Effective Date.
  for (const scenario of approvalScenarios()) {
    test(`TC-018: should resolve status to ${scenario.expectedLifecycleStatus} when the decision is ${scenario.decision} with an Effective Date of ${scenario.effectiveLabel}`, async ({
      payerManagementPage,
      approvalManagementPage,
      cleanup,
    }) => {
      const data = buildUniquePayer({ effectiveDate: scenario.effectiveDate });
      cleanup.register(() => payerManagementPage.deletePayer(data.nameEn));

      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(data);
      await payerManagementPage.sendForApproval(data.nameEn);

      await approvalManagementPage.open();
      await approvalManagementPage.applyDecision(data.nameEn, scenario.decision);

      await payerManagementPage.open();
      await payerManagementPage.expectApprovalOutcome(
        data.nameEn,
        scenario.expectedApprovalStatus,
        scenario.expectPayerCode,
      );
    });
  }
});
