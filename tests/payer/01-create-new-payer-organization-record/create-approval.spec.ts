import { test } from '../../../fixtures';
import { buildUniquePayer, approvalScenarios } from '../../../data/payers/payer.data';
import { DateUtils } from '../../../utils/DateUtils';

/**
 * User story: Create New Payer Organization Record.
 * Reviewer decision outcomes: PayerCode generation, rejection, and the
 * Effective-Date-driven lifecycle status. In this environment the System
 * Administrator also holds checker rights, so the reviewer step runs in the
 * same session (see traceability notes for the true multi-role limitation).
 *
 * Every case here walks a record through create -> submit -> decide. Those
 * transitions are `critical`: each one is the precondition for the next, so a
 * failure part-way through records the rest as NOT EXECUTED instead of producing
 * a cascade of failures that all describe the same root cause.
 */
test.describe('Create New Payer Organization Record - Approval outcomes', () => {
  test('TC-004: should generate and assign a PayerCode only after the reviewer approves the request', async ({
    payerManagementPage,
    approvalManagementPage,
    cleanup,
    steps,
  }) => {
    const data = buildUniquePayer({ effectiveDate: DateUtils.pastDate(30) });
    cleanup.register(() => payerManagementPage.deletePayer(data.nameEn));

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Create the payer as a Draft', () =>
      payerManagementPage.createDraftPayer(data));

    // No PayerCode exists while the record is unapproved - checked at both
    // unapproved stages, each reported on its own.
    await steps.step('No PayerCode exists while the record is a Draft', () =>
      payerManagementPage.expectNoPayerCode(data.nameEn));

    await steps.critical('Send the payer for approval', () =>
      payerManagementPage.sendForApproval(data.nameEn));

    await steps.step('Still no PayerCode while the record is Pending Approval', () =>
      payerManagementPage.expectNoPayerCode(data.nameEn));

    await steps.critical('Open the approval queue', () => approvalManagementPage.open());

    await steps.critical('Approve the request as the reviewer', () =>
      approvalManagementPage.approve(data.nameEn));

    await steps.critical('Return to the payer list', () => payerManagementPage.open());

    await steps.step('The payer is Published and a PayerCode is now assigned', () =>
      payerManagementPage.expectApprovalOutcome(data.nameEn, 'Published', true));
  });

  test('TC-005: should not consume a PayerCode when the reviewer rejects the request', async ({
    payerManagementPage,
    approvalManagementPage,
    cleanup,
    steps,
  }) => {
    const data = buildUniquePayer();
    cleanup.register(() => payerManagementPage.deletePayer(data.nameEn));

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Create the payer as a Draft', () =>
      payerManagementPage.createDraftPayer(data));

    await steps.critical('Send the payer for approval', () =>
      payerManagementPage.sendForApproval(data.nameEn));

    await steps.critical('Open the approval queue', () => approvalManagementPage.open());

    await steps.critical('Reject the request with reason "Incorrect Data"', () =>
      approvalManagementPage.reject(data.nameEn, 'Incorrect Data'));

    await steps.critical('Return to the payer list', () => payerManagementPage.open());

    await steps.step('The payer is Rejected and no PayerCode was consumed', () =>
      payerManagementPage.expectApprovalOutcome(data.nameEn, 'Rejected', false));
  });

  test('TC-006: should set the payer status to Active when the Effective Date equals today upon approval', async ({
    payerManagementPage,
    approvalManagementPage,
    cleanup,
    steps,
  }) => {
    const data = buildUniquePayer({ effectiveDate: DateUtils.todayFormatted() });
    cleanup.register(() => payerManagementPage.deletePayer(data.nameEn));

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical("Create the payer with an Effective Date of today", () =>
      payerManagementPage.createDraftPayer(data));

    await steps.critical('Send the payer for approval', () =>
      payerManagementPage.sendForApproval(data.nameEn));

    await steps.critical('Open the approval queue', () => approvalManagementPage.open());

    await steps.critical('Approve the request as the reviewer', () =>
      approvalManagementPage.approve(data.nameEn));

    await steps.critical('Return to the payer list', () => payerManagementPage.open());

    await steps.step('The payer is Published with lifecycle status Active', () =>
      payerManagementPage.expectPublishedWithStatus(data.nameEn, 'Active'));
  });

  test('TC-007: should set the payer status to Pending when the Effective Date is one day in the future upon approval', async ({
    payerManagementPage,
    approvalManagementPage,
    cleanup,
    steps,
  }) => {
    const data = buildUniquePayer({ effectiveDate: DateUtils.futureDate(1) });
    cleanup.register(() => payerManagementPage.deletePayer(data.nameEn));

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Create the payer with an Effective Date of tomorrow', () =>
      payerManagementPage.createDraftPayer(data));

    await steps.critical('Send the payer for approval', () =>
      payerManagementPage.sendForApproval(data.nameEn));

    await steps.critical('Open the approval queue', () => approvalManagementPage.open());

    await steps.critical('Approve the request as the reviewer', () =>
      approvalManagementPage.approve(data.nameEn));

    await steps.critical('Return to the payer list', () => payerManagementPage.open());

    await steps.step('The payer is Published with lifecycle status Pending', () =>
      payerManagementPage.expectPublishedWithStatus(data.nameEn, 'Pending'));
  });

  test('TC-008: should set the payer status to Active when the Effective Date is in the past upon approval', async ({
    payerManagementPage,
    approvalManagementPage,
    cleanup,
    steps,
  }) => {
    const data = buildUniquePayer({ effectiveDate: DateUtils.pastDate(200) });
    cleanup.register(() => payerManagementPage.deletePayer(data.nameEn));

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Create the payer with an Effective Date in the past', () =>
      payerManagementPage.createDraftPayer(data));

    await steps.critical('Send the payer for approval', () =>
      payerManagementPage.sendForApproval(data.nameEn));

    await steps.critical('Open the approval queue', () => approvalManagementPage.open());

    await steps.critical('Approve the request as the reviewer', () =>
      approvalManagementPage.approve(data.nameEn));

    await steps.critical('Return to the payer list', () => payerManagementPage.open());

    await steps.step('The payer is Published with lifecycle status Active', () =>
      payerManagementPage.expectPublishedWithStatus(data.nameEn, 'Active'));
  });

  test('TC-019: should surface the submitted payer in the reviewer approval queue with actionable controls', async ({
    payerManagementPage,
    approvalManagementPage,
    cleanup,
    steps,
  }) => {
    const data = buildUniquePayer();
    cleanup.register(() => payerManagementPage.deletePayer(data.nameEn));

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Create the payer as a Draft', () =>
      payerManagementPage.createDraftPayer(data));

    await steps.critical('Send the payer for approval', () =>
      payerManagementPage.sendForApproval(data.nameEn));

    await steps.critical('Open the reviewer approval queue', () => approvalManagementPage.open());

    // Two independent questions about the queue entry: is it there, and can the
    // reviewer act on it. Reported separately.
    await steps.step('The submitted payer appears in the approval queue', () =>
      approvalManagementPage.expectInQueue(data.nameEn));

    await steps.step('Approve and Reject controls are available to the reviewer', () =>
      approvalManagementPage.expectActionsAvailable(data.nameEn));
  });

  // TC-018: decision-table roll-up of approve/reject x Effective Date.
  for (const scenario of approvalScenarios()) {
    test(`TC-018: should resolve status to ${scenario.expectedLifecycleStatus} when the decision is ${scenario.decision} with an Effective Date of ${scenario.effectiveLabel}`, async ({
      payerManagementPage,
      approvalManagementPage,
      cleanup,
      steps,
    }) => {
      const data = buildUniquePayer({ effectiveDate: scenario.effectiveDate });
      cleanup.register(() => payerManagementPage.deletePayer(data.nameEn));

      await steps.critical('Open the payer list', () => payerManagementPage.open());

      await steps.critical(
        `Create the payer with an Effective Date of ${scenario.effectiveLabel}`,
        () => payerManagementPage.createDraftPayer(data),
      );

      await steps.critical('Send the payer for approval', () =>
        payerManagementPage.sendForApproval(data.nameEn));

      await steps.critical('Open the approval queue', () => approvalManagementPage.open());

      await steps.critical(`Apply the reviewer decision "${scenario.decision}"`, () =>
        approvalManagementPage.applyDecision(data.nameEn, scenario.decision));

      await steps.critical('Return to the payer list', () => payerManagementPage.open());

      await steps.step(
        `The approval status is ${scenario.expectedApprovalStatus} and a PayerCode is `
          + `${scenario.expectPayerCode ? 'assigned' : 'not assigned'}`,
        () =>
          payerManagementPage.expectApprovalOutcome(
            data.nameEn,
            scenario.expectedApprovalStatus,
            scenario.expectPayerCode,
          ),
      );
    });
  }
});
