import { test, expect } from '../../../fixtures';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import {
  DETAILS_MAX_LENGTH,
  DETAILS_OVER_LENGTH,
  detailsOfLength,
  INACTIVATION_REASONS,
  UNMANAGED_REASON,
} from '../../../data/payers/lifecycleGuardrails.data';

/**
 * User story: Strengthen Guardrails and Messaging for Payer Activation,
 * Inactivation and Reactivation.
 * What the inactivation drawer will and will not accept.
 *
 * THE DRAWER ENFORCES ITS RULES BY PREVENTION, NOT BY MESSAGES - which is how
 * it differs from the sheet in all three cases here:
 *
 *   NO REASON. Confirm is DISABLED until a reason is chosen. Verified with the
 *   drawer untouched and again with details typed and the reason left blank.
 *   The sheet expects the click to be blocked and a bilingual message to state
 *   that a reason is required; the click cannot happen at all, so nothing
 *   states anything.
 *
 *   OVER-LENGTH DETAILS. The field carries `maxlength="500"`, so a 501-character
 *   entry arrives as 500 characters. The invalid state cannot be reached, so
 *   the "cannot exceed 500 characters" message the sheet expects has nothing to
 *   report on. This is the sheet's own first alternative ("the field either
 *   blocks further input or accepts it pending validation") - it blocks.
 *
 *   AN UNMANAGED REASON. The UI offers a dropdown only, so this can only be
 *   reached by sending the request directly - which the sheet explicitly allows.
 *   The server does validate it, and rejects it.
 *
 * In each case the guardrail HOLDS and the messaging does not, so the two are
 * asserted as separate steps.
 */
test.describe('Payer lifecycle guardrails - Reason and details validation', () => {
  test('TC-009: should refuse to confirm the inactivation when no reason is selected', async ({
    payerManagementPage,
    payerInactivateDialog,
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

    await steps.critical('The Inactivate drawer opens with no reason preselected', async () => {
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
      await payerInactivateDialog.expectReasonAndDetailsOffered();
      // "an empty reason dropdown" in the sheet's words: nothing is chosen for
      // the user, so no inactivation can be recorded against a reason the user
      // never picked.
      await payerInactivateDialog.expectConfirmDisabled();
    });

    await steps.step('The details field accepts text while the reason stays blank', async () => {
      const kept = await payerInactivateDialog.enterDetails(
        'The payer asked for this account to be closed.',
      );
      expect(kept, 'the optional details should be accepted on their own').not.toBe('');
      await payerInactivateDialog.expectNoDetailsError();
    });

    await steps.step('Confirming is blocked and the requirement is stated', async () => {
      const outcome = await payerInactivateDialog.attemptConfirm();

      // The half that HOLDS: the confirm is refused, and the drawer stays open
      // with the change unstaged.
      expect(outcome.wasGated, 'Confirm should be gated while no reason is chosen').toBe(true);
      expect(outcome.stillOpen, 'the drawer should stay open on a refused confirm').toBe(true);

      // The half that does NOT: the refusal is silent. Confirm is simply
      // disabled, so no message ever tells the user that a valid reason must be
      // selected. The drawer does render a reason-error element, but only a
      // reachable confirm could populate it.
      expect(
        await payerInactivateDialog.getReasonError(),
        'the refusal should state that a valid reason must be selected',
      ).not.toBe('');
    });

    await steps.step('The payer is left Active with no change staged', async () => {
      await payerInactivateDialog.cancel();
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });
  });

  test('TC-010: should reject the inactivation when the reason is not on the managed list', async ({
    payerManagementPage,
    payerInactivateDialog,
    publishedPayer,
    steps,
  }) => {
    let payerId!: string;

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      payerId = await payerManagementPage.getPayerId(publishedPayer.nameEn);
    });

    await steps.critical('The drawer offers the managed reason list and nothing else', async () => {
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
      await payerInactivateDialog.expectReasonAndDetailsOffered();
      expect(
        await payerInactivateDialog.getReasonOptions(),
        'the dropdown should be the only way in, and should hold exactly the managed list',
      ).toEqual([...INACTIVATION_REASONS]);
      await payerInactivateDialog.cancel();
    });

    await steps.step('A reason outside the managed list reaches the system', async () => {
      // Sent as a request because the UI cannot express it - which is the
      // route the sheet names. The target is this suite's own payer, so a
      // request that were wrongly ACCEPTED would damage nothing shared.
      const rejection = await payerManagementPage.submitInactivationRequest(
        payerId,
        UNMANAGED_REASON.unknownId,
        'Submitted with an unmanaged reason id.',
      );
      expect(
        rejection.status,
        'an unmanaged reason should be refused, not recorded',
      ).toBe(UNMANAGED_REASON.expectedRejection.status);
      expect(
        rejection.validationErrors,
        'the rejection should name the reason as the problem',
      ).toContain(UNMANAGED_REASON.expectedRejection.reason);
    });

    await steps.step('A malformed reason is refused without leaking internals', async () => {
      const rejection = await payerManagementPage.submitInactivationRequest(
        payerId,
        UNMANAGED_REASON.malformedId,
        'Submitted with a reason that is not an id at all.',
      );
      // FAILS, and this is the more serious of the two findings. A reason that
      // is not a well-formed id produces 500 "Operation Failed" carrying a raw
      // .NET ArgumentNullException, framework frames and a source path
      // (`/src/src/PBM.Endpoints/Controllers/PayersController.cs:line 138`).
      // An unmanaged value should be a validation rejection like the one above,
      // and an error shown to a client should never carry a stack trace.
      expect(
        rejection.status,
        'a malformed reason should be a validation rejection, not an unhandled server error',
      ).toBe(UNMANAGED_REASON.expectedRejection.status);
      for (const marker of UNMANAGED_REASON.leakMarkers) {
        expect(
          rejection.text,
          `the error body should not expose "${marker}" to the client`,
        ).not.toContain(marker);
      }
    });

    await steps.step('The payer is untouched by either rejected request', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });
  });

  test('TC-012: should keep the details within 500 characters when a longer entry is attempted', async ({
    payerManagementPage,
    payerInactivateDialog,
    publishedPayer,
    steps,
  }) => {
    const overLength = detailsOfLength(DETAILS_OVER_LENGTH);

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
      await payerInactivateDialog.selectReason(INACTIVATION_REASONS[3]);
    });

    await steps.step('The field blocks input past 500 characters', async () => {
      expect(
        await payerInactivateDialog.getDetailsMaxLength(),
        'the field should declare its own cap rather than rely on a server check',
      ).toBe(DETAILS_MAX_LENGTH);

      const kept = await payerInactivateDialog.enterDetails(overLength);
      expect(
        kept.length,
        `a ${DETAILS_OVER_LENGTH}-character entry should be held at ${DETAILS_MAX_LENGTH}`,
      ).toBe(DETAILS_MAX_LENGTH);
      expect(kept, 'the kept text should be the leading 500 characters').toBe(
        overLength.slice(0, DETAILS_MAX_LENGTH),
      );
    });

    await steps.step('The over-length entry is reported to the user', async () => {
      // FAILS. The cap is enforced silently: the 501st character never lands,
      // so the drawer shows no error and Confirm stays available. The record is
      // protected - which is what matters most - but a user who pasted 600
      // characters is not told that 100 of them were dropped.
      await payerInactivateDialog.expectConfirmEnabled();
      expect(
        await payerInactivateDialog.getValidationMessages(),
        'the drawer should state that the details cannot exceed 500 characters',
      ).not.toEqual([]);
    });

    await steps.step('The payer is left Active with no change staged', async () => {
      await payerInactivateDialog.cancel();
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });
  });
});
