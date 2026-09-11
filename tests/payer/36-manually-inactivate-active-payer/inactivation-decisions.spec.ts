import { test, expect } from '../../../fixtures';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import {
  AUDIT_EXPECTATION,
  PRIMARY_REASON,
  REASON_CHANGE,
  VALID_DETAILS,
} from '../../../data/payers/inactivationDecisions.data';

/**
 * User story: Manually Inactivate Active Payer.
 *
 * Only three cases, because this story is largely already automated. The
 * activation-guardrails story owns the reason requirement, the 500-character
 * boundary, the row-action matrix, the managed reason list, the
 * double-submission guard and the access-control refusal; the
 * inactivation-effects story owns the warning copy and the cascade summary.
 * Repeating them would duplicate results rather than add coverage - the
 * traceability matrix maps every sheet case to wherever it already lives.
 *
 * What is left is the part no existing case covers: the combination table, what
 * happens when the reviewer changes their mind before submitting, and the full
 * Active -> Inactive -> Active round trip and the trail it leaves.
 *
 * INACTIVATION STAGES A DRAFT. Confirm does not change the status; it creates a
 * change that has to be approved, like every other payer edit. Each case that
 * needs to observe "Inactive" carries that approval as its own step.
 */
test.describe('Manually inactivate an active payer', () => {
  test('TC-001: should accept an inactivation only when a reason is chosen, with or without details', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    // Three staged inactivations and an approval; more round trips than the
    // default budget allows.
    test.slow();

    await steps.critical('Navigate to the module with an Active payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.step('With no reason chosen the drawer refuses to submit', async () => {
      // The row of the table that must be blocked, checked first so the payer
      // is still Active for the rows that follow.
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
      await payerInactivateDialog.expectReasonAndDetailsOffered();
      await payerInactivateDialog.expectConfirmDisabled();
    });

    await steps.step('A reason alone releases it - details are optional', async () => {
      await payerInactivateDialog.selectReason(PRIMARY_REASON);
      await payerInactivateDialog.expectConfirmEnabled();
    });

    await steps.step('Adding valid details keeps it acceptable', async () => {
      await payerInactivateDialog.enterDetails(VALID_DETAILS);
      await payerInactivateDialog.expectConfirmEnabled();
      await payerInactivateDialog.confirm();
    });

    await steps.step('And once approved the payer reads Inactive', async () => {
      // The approval round trip, explicit rather than assumed: Confirm staged a
      // draft, and the status the table shows is the published version's.
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
      await approvalManagementPage.approve(publishedPayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.inactive.en,
      );
    });
  });

  test('TC-002: should record only the last reason chosen when the selection is changed before submitting', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module with an Active payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.critical('The drawer opens and a first reason is chosen', async () => {
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
      await payerInactivateDialog.selectReason(REASON_CHANGE.first);
      await payerInactivateDialog.expectConfirmEnabled();
    });

    await steps.step('Changing the choice replaces it rather than adding to it', async () => {
      await payerInactivateDialog.selectReason(REASON_CHANGE.final);
      const offered = await payerInactivateDialog.getReasonOptions();
      expect(
        offered,
        `both reasons should exist in the managed list; it offered: ${offered.join(', ')}`,
      ).toEqual(expect.arrayContaining([REASON_CHANGE.first, REASON_CHANGE.final]));
    });

    await steps.step('The inactivation submits and is approved', async () => {
      await payerInactivateDialog.confirm();
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
      await approvalManagementPage.approve(publishedPayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.inactive.en,
      );
    });

    await steps.step('And the trail carries the final reason, not the abandoned one', async () => {
      // The point of the case. If the first selection is what gets stored, the
      // record misstates why the payer was taken offline - and nobody would
      // notice, because the dropdown showed the right value at submission.
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.openAuditHistory();
      const entries = await detail.getAuditEntryTexts();
      const trail = entries.join(' | ');
      expect(
        trail.includes(REASON_CHANGE.final),
        `the trail should record "${REASON_CHANGE.final}"; it holds: ${trail || '(nothing)'}`,
      ).toBe(true);
      expect(
        trail.includes(REASON_CHANGE.first),
        `the abandoned reason "${REASON_CHANGE.first}" must not have been stored`,
      ).toBe(false);
    });
  });

  test('TC-003: should leave two distinct audit entries when a payer is inactivated and then reactivated', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    // Two full lifecycle changes, each through approval.
    test.slow();

    await steps.critical('Navigate to the module with an Active payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.critical('The payer is inactivated and the change approved', async () => {
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
      await payerInactivateDialog.selectReason(PRIMARY_REASON);
      await payerInactivateDialog.enterDetails(VALID_DETAILS);
      await payerInactivateDialog.confirm();
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.approve(publishedPayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.inactive.en,
      );
    });

    await steps.step('Activate now stands where Inactivate stood', async () => {
      // The row offers one or the other, never both - the guardrails story pins
      // that matrix. Read here as the precondition for reactivating.
      const actions = await payerManagementPage.getEnabledRowActions(publishedPayer.nameEn, [
        'activate',
        'inactivate',
      ]);
      expect(
        actions,
        'an Inactive payer should offer Activate and not Inactivate',
      ).toEqual(['activate']);
    });

    await steps.step('Reactivating asks for no reason and returns the payer to Active', async () => {
      const prompt = await payerManagementPage.openActivationPrompt(publishedPayer.nameEn);
      expect(
        await prompt.hasFreeTextInput(),
        'reactivation should not demand a reason the way inactivation does',
      ).toBe(false);
      await prompt.confirm();
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.approve(publishedPayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.step('And both events survive as separate entries in the trail', async () => {
      // The reason this case exists rather than two shorter ones: a trail that
      // keeps only the latest status change cannot answer "why was this payer
      // ever taken offline?", and that question is the whole purpose of
      // recording a reason.
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.openAuditHistory();
      const entries = await detail.getAuditEntryTexts();
      expect(
        entries.length,
        `two status changes should leave ${AUDIT_EXPECTATION.distinctEntries} entries; the `
          + `trail holds ${entries.length}: ${entries.slice(0, 4).join(' | ') || '(nothing)'}`,
      ).toBeGreaterThanOrEqual(AUDIT_EXPECTATION.distinctEntries);
      const trail = entries.join(' | ');
      expect(
        AUDIT_EXPECTATION.inactivated.test(trail),
        `the inactivation should still be recorded; trail: ${trail || '(nothing)'}`,
      ).toBe(true);
    });
  });
});
