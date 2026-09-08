import { test, expect } from '../../../fixtures';
import type { PayerFormDialog } from '../../../pages/payer/PayerFormDialog';
import {
  CONCURRENT_FIELDS,
  CONFLICT_MESSAGE_PATTERNS,
  CONFLICT_RESPONSE,
  REPEATED_SAVE_ATTEMPTS,
} from '../../../data/payers/concurrentEdit.data';

/**
 * User story: Detect and Prevent Overwriting Concurrent Payer Edits.
 *
 * WHAT THESE CASES FOUND, verified before they were written. The application
 * gets the important half right and the visible half wrong:
 *
 *   - A stale save IS rejected. `PUT /api/Payers/UpdatePayer` answers 409
 *     "Conflict Detected" with the reason "This payer has been modified since it
 *     was loaded. Please refresh and try again.", and the record keeps only the
 *     first session's change. The data is genuinely protected.
 *   - The user is told NOTHING. No toast, no inline error, no dialog - the
 *     drawer simply stays open, which is pixel-for-pixel what a save that never
 *     fired looks like.
 *
 * So each case asserts the two halves as SEPARATE steps: the block, then the
 * message. That is why the failures here are useful rather than noisy - the
 * report names the message step, and the protection step passes right next to
 * it. A single combined assertion would have reported "concurrency is broken",
 * which is the opposite of what is true.
 *
 * TWO SESSIONS, ONE ACCOUNT. `staleSession` is a second TAB of the same browser
 * context, not a second login. A second context built from the saved session
 * lands on the login page because the refresh token rotates, and the
 * environment has one set of credentials. Two tabs reproduce the condition
 * exactly - the 409 comes from comparing the submitted record's version against
 * the stored one, which is indifferent to which tab sent it. The one thing this
 * cannot cover is two different ROLES; that case is BLOCKED in
 * concurrent-access.spec.ts rather than approximated here.
 *
 * NO VERSION MARKER ON THE FORM. The sheet expects the edit form to show a
 * version or last-modified indicator. It does not - verified, the drawer
 * exposes no such element - so the version is asserted where the application
 * does surface it: the list's Approval Status cell. Recorded as a divergence.
 */
test.describe('Detect and Prevent Overwriting Concurrent Payer Edits - Conflict detection', () => {
  test('TC-001: should save without any conflict warning when a single user edits a payer alone', async ({
    payerManagementPage,
    uniquePayer,
    steps,
  }) => {
    const secondEmail = CONCURRENT_FIELDS.second.value();
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
    });

    await steps.critical('Open the existing payer for edit', async () => {
      form = await payerManagementPage.openEditForm(uniquePayer.nameEn);
      // The form loads with the record's current values. The version indicator
      // the sheet also expects here does not exist on this drawer - see the
      // file comment - so the version is asserted from the list below.
      await form.expectFieldValue('Payer Name', uniquePayer.nameEn);
    });

    await steps.step('The edit saves successfully with no conflict reported', async () => {
      await form.setFieldValue(
        CONCURRENT_FIELDS.first.label,
        CONCURRENT_FIELDS.first.value,
        'text',
      );
      const outcome = await form.saveAndCaptureOutcome();
      expect(outcome, 'the save should have reached the server').not.toBeNull();
      expect(outcome!.status).toBe(200);
      await form.waitForClosed();
    });

    await steps.step('Reopening the record shows the updated value persisted', async () => {
      await payerManagementPage.open();
      const reopened = await payerManagementPage.openEditForm(uniquePayer.nameEn);
      await reopened.expectFieldValue(
        CONCURRENT_FIELDS.first.label,
        CONCURRENT_FIELDS.first.value,
      );
      await reopened.closeAndDiscard();
    });
  });

  test('TC-002: should update the record for the first saver when two sessions hold the same version', async ({
    payerManagementPage,
    staleSession,
    uniquePayer,
    steps,
  }) => {
    const secondEmail = CONCURRENT_FIELDS.second.value();
    let firstForm!: PayerFormDialog;
    let versionBefore!: string;

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
      await payerManagementPage.open();
      await payerManagementPage.search(uniquePayer.nameEn);
      versionBefore = await payerManagementPage.getVersionLabel(uniquePayer.nameEn);
    });

    await steps.critical('The first session opens the payer for edit', async () => {
      firstForm = await payerManagementPage.openEditForm(uniquePayer.nameEn);
      await firstForm.expectFieldValue('Payer Name', uniquePayer.nameEn);
    });

    await steps.step('The second session opens the same record at the same version', async () => {
      const secondForm = await staleSession.openEditForm(uniquePayer.nameEn);
      await secondForm.expectFieldValue('Payer Name', uniquePayer.nameEn);
      await staleSession.payerPage.search(uniquePayer.nameEn);
      // Both sessions are looking at the same version - the precondition every
      // later case depends on, asserted rather than assumed.
      expect(await staleSession.payerPage.getVersionLabel(uniquePayer.nameEn)).toBe(versionBefore);
    });

    await steps.step('The first session saves successfully and the record moves on', async () => {
      await firstForm.setFieldValue(
        CONCURRENT_FIELDS.first.label,
        CONCURRENT_FIELDS.first.value,
        'text',
      );
      const outcome = await firstForm.saveAndCaptureOutcome();
      expect(outcome!.status).toBe(200);
      await firstForm.waitForClosed();
      await payerManagementPage.open();
      await payerManagementPage.expectApprovalStatusContains(uniquePayer.nameEn, 'Draft');
    });
  });

  test('TC-003: should block the save and warn the user when a stale copy is submitted', async ({
    payerManagementPage,
    staleSession,
    uniquePayer,
    steps,
  }) => {
    // Generated once per test: payer email is unique across the register, and a
    // reused address is refused with the SAME 409 status as a stale save.
    const secondEmail = CONCURRENT_FIELDS.second.value();
    let staleForm!: PayerFormDialog;
    let outcome!: Awaited<ReturnType<PayerFormDialog['saveAndCaptureOutcome']>>;

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
    });

    await steps.critical('A second session is holding an unsaved copy of the record', async () => {
      staleForm = await staleSession.openEditForm(uniquePayer.nameEn);
      await staleForm.expectFieldValue('Payer Name', uniquePayer.nameEn);
    });

    await steps.critical('The first session saves a change, making that copy stale', async () => {
      await payerManagementPage.editTextFieldAndSave(
        uniquePayer.nameEn,
        CONCURRENT_FIELDS.first.label,
        CONCURRENT_FIELDS.first.value,
      );
    });

    await steps.step('The system detects the record changed since it was loaded', async () => {
      await staleForm.setFieldValue(
        CONCURRENT_FIELDS.second.label,
        secondEmail,
        'text',
      );
      outcome = await staleForm.saveAndCaptureOutcome();
      expect(outcome, 'the stale save should have reached the server').not.toBeNull();
      staleForm.expectStaleSaveRejected(outcome, CONFLICT_RESPONSE);
    });

    // The step this story fails on. The rejection above is correct; what is
    // missing is any sign of it in the interface.
    await steps.step('A message tells the user to refresh before saving', () =>
      staleForm.expectConflictReported(CONFLICT_MESSAGE_PATTERNS.en));

    await steps.step('The record still reflects only the first session\'s change', async () => {
      await payerManagementPage.open();
      const reopened = await payerManagementPage.openEditForm(uniquePayer.nameEn);
      await reopened.expectFieldValue(
        CONCURRENT_FIELDS.first.label,
        CONCURRENT_FIELDS.first.value,
      );
      await reopened.expectFieldValue(CONCURRENT_FIELDS.second.label, uniquePayer.email);
      await reopened.closeAndDiscard();
    });
  });

  test('TC-004: should report the conflict before writing anything when the stale save follows immediately', async ({
    payerManagementPage,
    staleSession,
    uniquePayer,
    steps,
  }) => {
    // Generated once per test: payer email is unique across the register, and a
    // reused address is refused with the SAME 409 status as a stale save.
    const secondEmail = CONCURRENT_FIELDS.second.value();
    let staleForm!: PayerFormDialog;

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
      staleForm = await staleSession.openEditForm(uniquePayer.nameEn);
      await staleForm.setFieldValue(
        CONCURRENT_FIELDS.second.label,
        secondEmail,
        'text',
      );
      await payerManagementPage.editTextFieldAndSave(
        uniquePayer.nameEn,
        CONCURRENT_FIELDS.first.label,
        CONCURRENT_FIELDS.first.value,
      );
    });

    await steps.step(
      'The stale save is refused straight away, and the conflict is reported',
      async () => {
        const outcome = await staleForm.saveAndCaptureOutcome();
        staleForm.expectStaleSaveRejected(outcome, CONFLICT_RESPONSE);
        // Asserted immediately after the rejection, with no reload in between:
        // the sheet's point is that the user learns of the conflict before any
        // write happens, not afterwards.
        await staleForm.expectConflictReported(CONFLICT_MESSAGE_PATTERNS.en);
      },
    );

    await steps.step('None of the stale session\'s values reached the record', async () => {
      await payerManagementPage.open();
      const reopened = await payerManagementPage.openEditForm(uniquePayer.nameEn);
      await reopened.expectFieldValue(
        CONCURRENT_FIELDS.first.label,
        CONCURRENT_FIELDS.first.value,
      );
      await reopened.expectFieldValue(CONCURRENT_FIELDS.second.label, uniquePayer.email);
      await reopened.closeAndDiscard();
    });
  });

  test('TC-005: should save successfully when the stale session refreshes and reapplies its change', async ({
    payerManagementPage,
    staleSession,
    uniquePayer,
    steps,
  }) => {
    const secondEmail = CONCURRENT_FIELDS.second.value();
    let refreshed!: PayerFormDialog;

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
      const staleForm = await staleSession.openEditForm(uniquePayer.nameEn);
      await payerManagementPage.editTextFieldAndSave(
        uniquePayer.nameEn,
        CONCURRENT_FIELDS.first.label,
        CONCURRENT_FIELDS.first.value,
      );
      await staleForm.setFieldValue(
        CONCURRENT_FIELDS.second.label,
        secondEmail,
        'text',
      );
      const refused = await staleForm.saveAndCaptureOutcome();
      staleForm.expectStaleSaveRejected(refused, CONFLICT_RESPONSE);
    });

    await steps.step(
      'Refreshing reloads the record at its latest version, clearing the stale state',
      async () => {
        refreshed = await staleSession.openEditForm(uniquePayer.nameEn);
        // Proof the reload actually took: the form now carries the FIRST
        // session's change, which the stale copy never had.
        await refreshed.expectFieldValue(
          CONCURRENT_FIELDS.first.label,
          CONCURRENT_FIELDS.first.value,
        );
      },
    );

    await steps.step('Reapplying the intended change now saves', async () => {
      await refreshed.setFieldValue(
        CONCURRENT_FIELDS.second.label,
        secondEmail,
        'text',
      );
      const outcome = await refreshed.saveAndCaptureOutcome();
      expect(outcome!.status).toBe(200);
      await refreshed.waitForClosed();
    });

    await steps.step('Both sessions\' changes are present on the record', async () => {
      await payerManagementPage.open();
      const reopened = await payerManagementPage.openEditForm(uniquePayer.nameEn);
      await reopened.expectFieldValue(
        CONCURRENT_FIELDS.first.label,
        CONCURRENT_FIELDS.first.value,
      );
      await reopened.expectFieldValue(
        CONCURRENT_FIELDS.second.label,
        secondEmail,
      );
      await reopened.closeAndDiscard();
    });
  });

  test('TC-006: should let the second user recover their change when they refresh after the conflict', async ({
    payerManagementPage,
    staleSession,
    uniquePayer,
    steps,
  }) => {
    // Generated once per test: payer email is unique across the register, and a
    // reused address is refused with the SAME 409 status as a stale save.
    const secondEmail = CONCURRENT_FIELDS.second.value();
    let staleForm!: PayerFormDialog;

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
    });

    await steps.step('Both sessions open the same record and see identical data', async () => {
      staleForm = await staleSession.openEditForm(uniquePayer.nameEn);
      await staleForm.expectFieldValue(CONCURRENT_FIELDS.first.label, uniquePayer.phone);
      const firstView = await payerManagementPage.openEditForm(uniquePayer.nameEn);
      await firstView.expectFieldValue(CONCURRENT_FIELDS.first.label, uniquePayer.phone);
      await firstView.closeAndDiscard();
    });

    await steps.step('The first session edits a field and saves, with confirmation', async () => {
      await payerManagementPage.editTextFieldAndSave(
        uniquePayer.nameEn,
        CONCURRENT_FIELDS.first.label,
        CONCURRENT_FIELDS.first.value,
      );
      await payerManagementPage.open();
      await payerManagementPage.expectApprovalStatusContains(uniquePayer.nameEn, 'Draft');
    });

    await steps.step(
      'The second session\'s save is blocked and it is told to refresh',
      async () => {
        await staleForm.setFieldValue(
          CONCURRENT_FIELDS.second.label,
          secondEmail,
          'text',
        );
        const outcome = await staleForm.saveAndCaptureOutcome();
        staleForm.expectStaleSaveRejected(outcome, CONFLICT_RESPONSE);
        await staleForm.expectConflictReported(CONFLICT_MESSAGE_PATTERNS.en);
      },
    );

    await steps.step('After refreshing and reapplying, both changes are reflected', async () => {
      const refreshed = await staleSession.openEditForm(uniquePayer.nameEn);
      await refreshed.setFieldValue(
        CONCURRENT_FIELDS.second.label,
        secondEmail,
        'text',
      );
      expect((await refreshed.saveAndCaptureOutcome())!.status).toBe(200);
      await refreshed.waitForClosed();

      await payerManagementPage.open();
      const reopened = await payerManagementPage.openEditForm(uniquePayer.nameEn);
      await reopened.expectFieldValue(
        CONCURRENT_FIELDS.first.label,
        CONCURRENT_FIELDS.first.value,
      );
      await reopened.expectFieldValue(
        CONCURRENT_FIELDS.second.label,
        secondEmail,
      );
      await reopened.closeAndDiscard();
    });
  });

  test('TC-007: should still report a conflict when the two sessions edited different fields', async ({
    payerManagementPage,
    staleSession,
    uniquePayer,
    steps,
  }) => {
    // Generated once per test: payer email is unique across the register, and a
    // reused address is refused with the SAME 409 status as a stale save.
    const secondEmail = CONCURRENT_FIELDS.second.value();
    let staleForm!: PayerFormDialog;

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
      staleForm = await staleSession.openEditForm(uniquePayer.nameEn);
    });

    await steps.step('The first session changes one field and saves', async () => {
      await payerManagementPage.editTextFieldAndSave(
        uniquePayer.nameEn,
        CONCURRENT_FIELDS.first.label,
        CONCURRENT_FIELDS.first.value,
      );
      await payerManagementPage.open();
      await payerManagementPage.expectApprovalStatusContains(uniquePayer.nameEn, 'Draft');
    });

    // The point of the case: a field-level merge would have let this through.
    // The conflict is a property of the RECORD's version, not of overlapping
    // fields, and this is what proves it.
    await steps.step(
      'The stale session\'s save of an unrelated field is refused all the same',
      async () => {
        await staleForm.setFieldValue(
          CONCURRENT_FIELDS.second.label,
          secondEmail,
          'text',
        );
        const outcome = await staleForm.saveAndCaptureOutcome();
        staleForm.expectStaleSaveRejected(outcome, CONFLICT_RESPONSE);
        await staleForm.expectConflictReported(CONFLICT_MESSAGE_PATTERNS.en);
      },
    );
  });

  test('TC-008: should keep blocking the save when the stale form is submitted repeatedly without refreshing', async ({
    payerManagementPage,
    staleSession,
    uniquePayer,
    steps,
  }) => {
    // Generated once per test: payer email is unique across the register, and a
    // reused address is refused with the SAME 409 status as a stale save.
    const secondEmail = CONCURRENT_FIELDS.second.value();
    let staleForm!: PayerFormDialog;

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
      staleForm = await staleSession.openEditForm(uniquePayer.nameEn);
      await payerManagementPage.editTextFieldAndSave(
        uniquePayer.nameEn,
        CONCURRENT_FIELDS.first.label,
        CONCURRENT_FIELDS.first.value,
      );
      await staleForm.setFieldValue(
        CONCURRENT_FIELDS.second.label,
        secondEmail,
        'text',
      );
    });

    // Every attempt asserted individually rather than only the last: the
    // failure mode this case guards against is a guard that fires once and then
    // lets the second attempt through, which a final-state check would miss.
    for (let attempt = 1; attempt <= REPEATED_SAVE_ATTEMPTS; attempt += 1) {
      await steps.step(
        `Save attempt ${attempt} of ${REPEATED_SAVE_ATTEMPTS} is blocked, and reported`,
        async () => {
          const outcome = await staleForm.saveAndCaptureOutcome();
          staleForm.expectStaleSaveRejected(outcome, CONFLICT_RESPONSE);
          expect(await staleForm.isOpen()).toBe(true);
          await staleForm.expectConflictReported(CONFLICT_MESSAGE_PATTERNS.en);
        },
      );
    }
  });

  test('TC-009: should report the same conflict when the stale copy belongs to the same user in another tab', async ({
    payerManagementPage,
    staleSession,
    uniquePayer,
    steps,
  }) => {
    const secondEmail = CONCURRENT_FIELDS.second.value();
    let secondTabForm!: PayerFormDialog;

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
    });

    await steps.step('The record is open for edit in two tabs showing identical data', async () => {
      secondTabForm = await staleSession.openEditForm(uniquePayer.nameEn);
      await secondTabForm.expectFieldValue(CONCURRENT_FIELDS.first.label, uniquePayer.phone);
      const firstTab = await payerManagementPage.openEditForm(uniquePayer.nameEn);
      await firstTab.expectFieldValue(CONCURRENT_FIELDS.first.label, uniquePayer.phone);
      await firstTab.closeAndDiscard();
    });

    await steps.step('The first tab saves its change', async () => {
      await payerManagementPage.editTextFieldAndSave(
        uniquePayer.nameEn,
        CONCURRENT_FIELDS.first.label,
        CONCURRENT_FIELDS.first.value,
      );
      await payerManagementPage.open();
      await payerManagementPage.expectApprovalStatusContains(uniquePayer.nameEn, 'Draft');
    });

    // Same USER, same session, different tab - and the conflict still applies,
    // which confirms the check is on the record's version rather than on who is
    // holding it. This is also the case that justifies implementing the whole
    // story with two tabs: it is the sheet's own same-user scenario.
    await steps.step(
      'The second tab\'s stale save is refused exactly as a second user\'s would be',
      async () => {
        await secondTabForm.setFieldValue(
          CONCURRENT_FIELDS.second.label,
          secondEmail,
          'text',
        );
        const outcome = await secondTabForm.saveAndCaptureOutcome();
        secondTabForm.expectStaleSaveRejected(outcome, CONFLICT_RESPONSE);
      },
    );
  });

  // Uses a PUBLISHED payer, not a fresh draft. Editing a v0 draft stages the
  // change back onto v0, so its version label never moves - which made the
  // 'the version advanced' assertion false against an application that was
  // behaving correctly. A published record genuinely advances a version when a
  // change is staged against it, which is the condition this case is about.
  test('TC-011: should detect the version mismatch and block the save when the held version is out of date', async ({
    payerManagementPage,
    staleSession,
    publishedPayer,
    steps,
  }) => {
    // Generated once per test: payer email is unique across the register, and a
    // reused address is refused with the SAME 409 status as a stale save.
    const secondEmail = CONCURRENT_FIELDS.second.value();
    let staleForm!: PayerFormDialog;
    let versionBefore!: string;

    // The payer is provisioned already published by the fixture - no creation
    // step here, because a v0 draft is the one thing this case cannot use.
    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    // The sheet reads this version off the edit form. That form carries no
    // version indicator - verified - so it is read from the list's Approval
    // Status cell, which is where the application does publish it.
    await steps.step('The record\'s current version is noted', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      versionBefore = await payerManagementPage.getVersionLabel(publishedPayer.nameEn);
      expect(versionBefore).not.toBe('');
      staleForm = await staleSession.openEditForm(publishedPayer.nameEn);
      await staleForm.expectFieldValue('Payer Name', publishedPayer.nameEn);
    });

    await steps.step('Another session saves a change, moving the version on', async () => {
      await payerManagementPage.editTextFieldAndSave(
        publishedPayer.nameEn,
        CONCURRENT_FIELDS.first.label,
        CONCURRENT_FIELDS.first.value,
      );
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await expect
        .poll(() => payerManagementPage.getVersionLabel(publishedPayer.nameEn), {
          message: 'the record\'s version label should change once a change is staged',
        })
        .not.toBe(versionBefore);
    });

    await steps.step('Saving from the original session is blocked on the version mismatch', async () => {
      await staleForm.setFieldValue(
        CONCURRENT_FIELDS.second.label,
        secondEmail,
        'text',
      );
      const outcome = await staleForm.saveAndCaptureOutcome();
      staleForm.expectStaleSaveRejected(outcome, CONFLICT_RESPONSE);
      // The server names the comparison it made, which is the evidence that
      // the block was a version check and not an unrelated rejection.
      expect(outcome!.text).toContain(CONFLICT_RESPONSE.reason);
    });

    // Split from the step above on purpose, as in every other case here: the
    // block and the message are separate criteria with opposite outcomes, and
    // combining them would report the working half as broken too.
    await steps.step('The conflict is reported to the user', () =>
      staleForm.expectConflictReported(CONFLICT_MESSAGE_PATTERNS.en));
  });
});
