import { test, expect } from '../../../fixtures';
import { buildUniquePayer } from '../../../data/payers/payer.data';
import {
  CONCURRENT_FIELD_MATRIX,
  CONFLICT_MESSAGE_PATTERNS,
  CONFLICT_RESPONSE,
} from '../../../data/payers/concurrentEdit.data';

/**
 * User story: Detect and Prevent Overwriting Concurrent Payer Edits.
 * The field-category checklist.
 *
 * One step per field SHAPE - masked numeric, validated email, length-limited
 * text - because the conflict check is meant to be a property of the record
 * rather than of any particular field. Running the whole matrix in one case is
 * what the sheet asks for, and each step asserts its own field so a category
 * that behaved differently is named rather than averaged away.
 *
 * A FRESH PAYER PER FIELD. Reusing one record would mean the second field's
 * check ran against a record already carrying a staged draft from the first,
 * so a conflict could be raised by the leftover draft rather than by the field
 * under test - the case would pass while proving nothing.
 */
test.describe('Detect and Prevent Overwriting Concurrent Payer Edits - Field categories', () => {
  test('TC-010: should raise the same conflict for every field category when each is edited concurrently', async ({
    payerManagementPage,
    staleSession,
    steps,
  }) => {
    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    for (const field of CONCURRENT_FIELD_MATRIX) {
      await steps.step(
        `A concurrent edit of ${field.label} (${field.category}) is refused`,
        async () => {
          const payer = buildUniquePayer();
          await payerManagementPage.open();
          await payerManagementPage.createDraftPayer(payer);

          // The stale copy is taken BEFORE the first session's save - that
          // ordering is the whole precondition.
          const staleForm = await staleSession.openEditForm(payer.nameEn);
          await payerManagementPage.editTextFieldAndSave(
            payer.nameEn,
            field.label,
            field.firstValue(),
          );

          await staleForm.setFieldValue(field.label, field.secondValue(), 'text');
          const outcome = await staleForm.saveAndCaptureOutcome();
          expect(outcome, `the stale save of ${field.label} should reach the server`).not.toBeNull();
          staleForm.expectStaleSaveRejected(outcome, CONFLICT_RESPONSE);
          await staleForm.expectConflictReported(CONFLICT_MESSAGE_PATTERNS.en);
        },
      );
    }

    await steps.step('Every field category behaved the same way', async () => {
      // The steps above each asserted their own field; this records the
      // checklist's own expected result - that the set was exhausted, not that
      // one representative field happened to work.
      expect(CONCURRENT_FIELD_MATRIX.length).toBeGreaterThan(1);
    });
  });
});
