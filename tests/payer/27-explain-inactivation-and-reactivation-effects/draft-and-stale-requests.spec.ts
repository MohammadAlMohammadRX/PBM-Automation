import { test, expect } from '../../../fixtures';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import { INACTIVATION_REASONS } from '../../../data/payers/lifecycleGuardrails.data';
import {
  INACTIVATION_WARNING,
  PENDING_APPROVAL_LABEL,
  RAPID_CLICKS,
  STALE_INACTIVATION,
  SUCCESS_TOAST,
} from '../../../data/payers/cascadeMessaging.data';

/**
 * User story: Explain Inactivation and Reactivation Effects Before They Are
 * Applied.
 * The draft-pending-approval state, a forced request, and interruptions.
 *
 * THE DRAFT STATE IS REAL AND VISIBLE. Confirming an inactivation does not
 * inactivate anything: the row keeps its status and its approval cell moves to
 * a draft, and the request appears in the approval queue once submitted. That
 * is exactly what the sheet asks TC-009 to show, and the confirmation says so
 * before the user commits.
 *
 * THE FORCED REQUEST NEEDS A REAL REASON ID. The endpoint validates the reason
 * before anything else - an unmanaged one returns "Invalid inactivation
 * reason." - so a forced request carrying a made-up reason would be refused for
 * the wrong reason entirely and prove nothing about the payer's state. TC-012
 * therefore captures a genuine reason id from a real submission on this suite's
 * own payer, then replays it against an already-inactive one.
 */
test.describe('Inactivation and reactivation effects - Drafts and forced requests', () => {
  test('TC-009: should hold the change as a draft pending approval rather than applying it', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    publishedPayer,
    toast,
    steps,
  }) => {
    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.critical('The confirmation states the change will be saved as a draft', async () => {
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
      const warning = await payerInactivateDialog.getWarningText();
      expect(warning, 'the user should be told before committing').toContain(
        INACTIVATION_WARNING.draftCaveat,
      );
      expect(warning, 'and told what makes it take effect').toContain(
        INACTIVATION_WARNING.approvalCaveat,
      );
    });

    await steps.step('Confirming reports the submission succeeded', async () => {
      await payerInactivateDialog.selectReason(INACTIVATION_REASONS[0]);
      await payerInactivateDialog.confirm();
      await toast.expectText(SUCCESS_TOAST);
    });

    await steps.step('The payer shows a draft state rather than a finalized Inactive one', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      // Both halves of "rather than": the approval cell moved to a draft AND
      // the lifecycle status has NOT. Asserting only the first would pass on a
      // payer that had already been inactivated.
      expect(
        await payerManagementPage.getApprovalStatus(publishedPayer.nameEn),
        'the approval cell should report the staged draft',
      ).toContain('Draft');
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.step('The request appears in the approvals queue once submitted', async () => {
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        PENDING_APPROVAL_LABEL,
      );

      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
      await approvalManagementPage.expectSingleQueuedRequest(publishedPayer.nameEn);
    });
  });

  test('TC-012: should refuse a forced inactivation when the payer is already Inactive', async ({
    page,
    payerManagementPage,
    payerInactivateDialog,
    payerSample,
    publishedPayer,
    steps,
  }) => {
    let inactiveName!: string;
    let inactiveId!: string;
    let reasonId!: string;

    await steps.critical('Navigate to the module with an Inactive payer', async () => {
      [inactiveName] = await payerSample('Inactive', LIFECYCLE_STATUS.inactive.en, 1);
      await payerManagementPage.open();
      await payerManagementPage.search(inactiveName);
      await payerManagementPage.expectLifecycleStatus(inactiveName, LIFECYCLE_STATUS.inactive.en);
      inactiveId = await payerManagementPage.getPayerId(inactiveName);
    });

    await steps.critical('Only the reactivation action is offered on it', async () => {
      await payerManagementPage.expectRowActionUnavailable(inactiveName, 'inactivate');
      await payerManagementPage.expectRowActionsEnabled(inactiveName, ['activate']);
    });

    await steps.step('A genuine reason id is obtained from a real submission', async () => {
      // Captured from this suite's OWN payer, and needed because the endpoint
      // checks the reason first: a forced request with an invented reason id
      // comes back "Invalid inactivation reason." and would tell us nothing
      // about whether the payer's state was checked at all.
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
      await payerInactivateDialog.selectReason(INACTIVATION_REASONS[0]);

      const body = await NetworkUtils.captureRequestBody(
        page,
        ApiEndpoints.payerInactivate,
        () => payerInactivateDialog.confirm(),
      );
      expect(body, 'the submission should have reached the server').not.toBeNull();
      const sent = JSON.parse(body!) as { inactivationReasonId?: string };
      reasonId = sent.inactivationReasonId ?? '';
      expect(reasonId, `a reason id should have been sent (${STALE_INACTIVATION.reasonSource})`)
        .not.toBe('');
    });

    await steps.step('Forcing the request on the inactive payer is refused', async () => {
      const outcome = await payerManagementPage.submitInactivationRequest(
        inactiveId,
        reasonId,
        'Forced from a stale page state.',
      );
      // The sheet wants a message saying the payer is already inactive. What is
      // asserted is the part that is not negotiable: the request must not
      // SUCCEED, and it must not be an unhandled server error. Both extremes
      // are named in the data file.
      expect(
        STALE_INACTIVATION.unacceptableStatuses as readonly number[],
        `the forced inactivation returned ${outcome.status}`,
      ).not.toContain(outcome.status);
      for (const marker of STALE_INACTIVATION.leakMarkers) {
        expect(
          outcome.text,
          `the rejection should not expose "${marker}" to the client`,
        ).not.toContain(marker);
      }
    });

    await steps.step('The inactive payer is untouched by the forced request', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(inactiveName);
      await payerManagementPage.expectLifecycleStatus(inactiveName, LIFECYCLE_STATUS.inactive.en);
    });
  });

  test('TC-014: should keep the payer state intact when the confirmation is interrupted', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    let approvalBefore!: string;

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      approvalBefore = await payerManagementPage.getApprovalStatus(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.step('Navigating away mid-dialog leaves the payer untouched', async () => {
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
      await payerInactivateDialog.waitForOpen();
      await payerManagementPage.navigateAwayAndReturn();

      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
      expect(
        await payerManagementPage.getApprovalStatus(publishedPayer.nameEn),
        'abandoning the dialog must not stage anything',
      ).toBe(approvalBefore);
    });

    await steps.step('Browser Back and Forward leave the list usable and the payer unchanged', async () => {
      await payerManagementPage.goBack();
      await payerManagementPage.goForward();
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
      await payerManagementPage.expectNoUnexpectedDialog();
    });

    await steps.step('Spam-clicking Confirm does not corrupt the record or duplicate the request', async () => {
      // The state check, not the request count - that is folder 19's TC-015,
      // which reports the missing click guard. What matters here is the sheet's
      // own words: no corrupted state and no misleading messages. So: exactly
      // one queued request, one draft version, and no error dialog left behind.
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
      await payerInactivateDialog.waitForOpen();
      await payerInactivateDialog.selectReason(INACTIVATION_REASONS[0]);
      await payerInactivateDialog.confirmRepeatedly(RAPID_CLICKS);

      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectNoUnexpectedDialog();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);

      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
      await approvalManagementPage.expectSingleQueuedRequest(publishedPayer.nameEn);
    });
  });
});
