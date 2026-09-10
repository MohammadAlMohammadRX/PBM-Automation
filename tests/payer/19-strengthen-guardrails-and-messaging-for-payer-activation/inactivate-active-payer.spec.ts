import { test, expect } from '../../../fixtures';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import {
  DETAILS_MAX_LENGTH,
  detailsOfLength,
  EXPECTED_INACTIVATION_REQUESTS,
  INACTIVATION_REASONS,
  RAPID_CONFIRM_CLICKS,
  STAGED_TOAST,
} from '../../../data/payers/lifecycleGuardrails.data';

/**
 * User story: Strengthen Guardrails and Messaging for Payer Activation,
 * Inactivation and Reactivation.
 * The VALID transition - inactivating an active payer - and the details field's
 * boundaries.
 *
 * ONE THING SHAPES EVERY CASE HERE: INACTIVATION IS MAKER-CHECKER. Confirming
 * the drawer does not inactivate the payer, it stages a draft. The row keeps
 * its current status and its approval cell reads "v1 · Draft" until the change
 * is sent for approval and approved, at which point the status moves and the
 * cell reads "v2 · Published". Verified end to end before these were written.
 *
 * The sheet expects the status to change on Confirm. Rather than assert
 * something the module was never designed to do, the cases that must observe
 * the new status carry the approval round trip explicitly, as their own steps.
 * The alternative - asserting Inactive immediately after Confirm - would report
 * a defect against a module that is behaving exactly as every other payer
 * change does.
 *
 * Every case works on a payer this suite created, never on an environment
 * record: inactivation is a real, approved state change, and doing it to a
 * shared payer would take that payer's status away from whatever else needs it.
 */
test.describe('Payer lifecycle guardrails - Inactivating an active payer', () => {
  test('TC-001: should stage and then apply the inactivation when a valid reason and details are given', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    toast,
    publishedPayer,
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

    await steps.critical(
      'The Inactivate action opens a drawer offering a reason dropdown and a details field',
      async () => {
        await payerManagementPage.inactivateRow(publishedPayer.nameEn);
        await payerInactivateDialog.expectReasonAndDetailsOffered();
      },
    );

    await steps.step('A managed reason and details are accepted, and Confirm becomes usable', async () => {
      // Confirm starts GATED - verified: it is disabled with the drawer
      // untouched and stays disabled with details typed but no reason chosen.
      // That gate is the reason-required guardrail; see TC-009.
      await payerInactivateDialog.expectConfirmDisabled();

      expect(
        await payerInactivateDialog.getReasonOptions(),
        'the drawer should offer the managed reason list',
      ).toEqual([...INACTIVATION_REASONS]);

      await payerInactivateDialog.selectReason(INACTIVATION_REASONS[0]);
      const kept = await payerInactivateDialog.enterDetails('Contract ended at the payer request.');
      expect(kept.length, 'details within the cap should be kept as typed').toBeLessThanOrEqual(
        DETAILS_MAX_LENGTH,
      );
      await payerInactivateDialog.expectConfirmEnabled();
    });

    await steps.step('Confirming reports the change was saved', async () => {
      await payerInactivateDialog.confirm();
      // The "success confirmation" the sheet asks for, word for word. It says
      // "saved as a draft" rather than "inactivated", which is the maker-checker
      // caveat stated to the user rather than hidden from them.
      await toast.expectText(STAGED_TOAST);
    });

    await steps.step("The payer reads Inactive once the staged change is approved", async () => {
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

  test('TC-011: should keep the details intact when exactly 500 characters are entered', async ({
    page,
    payerManagementPage,
    payerInactivateDialog,
    toast,
    publishedPayer,
    steps,
  }) => {
    const details = detailsOfLength(DETAILS_MAX_LENGTH);

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.critical('The Inactivate drawer opens', async () => {
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
      await payerInactivateDialog.waitForOpen();
    });

    await steps.step('The details field accepts all 500 characters without truncating', async () => {
      await payerInactivateDialog.selectReason(INACTIVATION_REASONS[0]);
      const kept = await payerInactivateDialog.enterDetails(details);
      expect(kept.length, 'a 500-character entry must survive as 500 characters').toBe(
        DETAILS_MAX_LENGTH,
      );
      expect(kept, 'the text must be kept verbatim, not merely at length').toBe(details);
      await payerInactivateDialog.expectNoDetailsError();
    });

    await steps.step('The save carries the full 500 characters to the server', async () => {
      // Read off the REQUEST rather than the interface. The details field is
      // write-only in the UI - nothing on the detail screen, the version history
      // or the approval queue displays it - so the submitted payload is the only
      // available evidence that the text was recorded rather than trimmed.
      const body = await NetworkUtils.captureRequestBody(
        page,
        ApiEndpoints.payerInactivate,
        () => payerInactivateDialog.confirm(),
      );
      expect(body, 'the confirm should have sent an InactivatePayer request').not.toBeNull();

      const sent = JSON.parse(body!) as { inactivationDetails?: string };
      expect(sent.inactivationDetails, 'the payload should carry the details verbatim').toBe(
        details,
      );
      await toast.expectText(STAGED_TOAST);
    });
  });

  test('TC-013: should accept the inactivation when the optional details field is left empty', async ({
    page,
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    let body: string | null = null;

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.critical('The Inactivate drawer opens', async () => {
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
      await payerInactivateDialog.waitForOpen();
    });

    await steps.step('An empty details field raises no validation error', async () => {
      await payerInactivateDialog.selectReason(INACTIVATION_REASONS[1]);
      expect(await payerInactivateDialog.enterDetails(''), 'the field should be empty').toBe('');
      await payerInactivateDialog.expectNoDetailsError();
      // The details field is optional, so the reason alone must be enough to
      // release the Confirm gate. If it were not, "optional" would be untrue.
      await payerInactivateDialog.expectConfirmEnabled();
    });

    await steps.step('The inactivation is accepted with no details recorded', async () => {
      body = await NetworkUtils.captureRequestBody(
        page,
        ApiEndpoints.payerInactivate,
        () => payerInactivateDialog.confirm(),
      );
      expect(body, 'the confirm should have sent an InactivatePayer request').not.toBeNull();

      const sent = JSON.parse(body!) as { inactivationDetails?: string | null };
      expect(
        sent.inactivationDetails ?? '',
        'no details should be recorded when none were entered',
      ).toBe('');
    });

    await steps.step('The payer reads Inactive once the staged change is approved', async () => {
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

  test('TC-015: should process one inactivation when Confirm is clicked repeatedly in rapid succession', async ({
    page,
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    let requests = 0;

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.critical('The Inactivate drawer opens with a reason selected', async () => {
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
      await payerInactivateDialog.waitForOpen();
      await payerInactivateDialog.selectReason(INACTIVATION_REASONS[2]);
    });

    await steps.step('Spam-clicking Confirm sends a single inactivation request', async () => {
      requests = await NetworkUtils.countRequestsDuring(
        page,
        ApiEndpoints.payerInactivate,
        () => payerInactivateDialog.confirmRepeatedly(RAPID_CONFIRM_CLICKS),
      );
      // MEASURED: three clicks put TWO requests on the wire - the button is not
      // disabled on the first click, so a second reaches the server before the
      // drawer closes. The end state survives it (see the next step), but the
      // sheet's requirement is that one request is processed, and it is not met.
      expect(
        requests,
        `${RAPID_CONFIRM_CLICKS} rapid clicks should reach the server once, not ${requests} times`,
      ).toBe(EXPECTED_INACTIVATION_REQUESTS);
    });

    await steps.step('The record is left with exactly one pending change and no error', async () => {
      // Asserted independently of the step above, and deliberately so: this is
      // the half that decides whether the duplicate request CORRUPTED anything.
      // A single failing "one request" assertion would otherwise leave open
      // whether the record ended up with two queued inactivations.
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
