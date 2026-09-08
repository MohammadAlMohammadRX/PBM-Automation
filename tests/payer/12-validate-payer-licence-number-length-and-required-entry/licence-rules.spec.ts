import { test, expect } from '../../../fixtures';
import { PAYER_COLUMN } from '../../../constants/ElementIds';
import { buildUniquePayer } from '../../../data/payers/payer.data';
import type { PayerFormDialog } from '../../../pages/payer/PayerFormDialog';
import {
  LICENCE_MAX_LENGTH,
  LICENCE_MESSAGES,
  LICENCE_RULES,
  PADDED_LICENCE,
  SPECIAL_CHARACTER_LICENCES,
  TRIMMED_LICENCE,
  WHITESPACE_ONLY_LICENCE,
  licenceOfLength,
} from '../../../data/payers/licenceNumber.data';

/**
 * User story: Validate Payer Licence Number Length and Required Entry.
 * The validation rules themselves - the checklist, editing, and input handling.
 */
test.describe('Validate Payer Licence Number Length and Required Entry - Rules', () => {
  test('TC-006: should enforce every licence-number rule when each is exercised in turn', async ({
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    // One step per rule, in the sheet's order, each asserting its own outcome.
    // The outcomes differ - two rules save, two are refused - and that branch
    // lives in the Page Object (`expectLicenceRuleOutcome`), which is where this
    // framework already puts boundary branches. Keeping it out of the test body
    // is what stops a rule from quietly asserting nothing.
    for (const rule of LICENCE_RULES) {
      await steps.step(`Rule ${rule.rule}: ${rule.label}`, () =>
        payerManagementPage.expectLicenceRuleOutcome(
          rule,
          buildUniquePayer({ licenseNumber: rule.value }),
        ));
    }
  });

  test('TC-007: should block the save and keep the stored value when the licence number is cleared on an existing payer', async ({
    payerManagementPage,
    uniquePayer,
    steps,
  }) => {
    const restored = licenceOfLength(12);
    let form: PayerFormDialog;

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      // The payer this case edits is created here rather than sampled: clearing
      // a required field on a record another test relies on would leave shared
      // data mid-edit if this case failed part-way.
      await payerManagementPage.createDraftPayer(uniquePayer);
    });

    await steps.critical('Open the existing payer for edit', async () => {
      form = await payerManagementPage.openEditForm(uniquePayer.nameEn);
      await form.expectFieldValue('License Number', uniquePayer.licenseNumber);
    });

    await steps.step('The Licence Number field becomes empty when cleared', async () => {
      await form.clearField('License Number');
      await form.expectFieldValue('License Number', '');
    });

    await steps.step(
      'The save is refused, and the record keeps its previously saved licence number',
      async () => {
        await form.attemptNext();
        await form.expectFieldRequired('License Number', LICENCE_MESSAGES.required);
        await form.closeAndDiscard();

        await payerManagementPage.open();
        await payerManagementPage.search(uniquePayer.nameEn);
        await payerManagementPage.expectRowCellEquals(
          uniquePayer.nameEn,
          PAYER_COLUMN.licenseNumber,
          uniquePayer.licenseNumber,
        );
      },
    );

    await steps.step('Restoring a valid value saves and updates the record', async () => {
      await payerManagementPage.editTextFieldAndSave(
        uniquePayer.nameEn,
        'License Number',
        restored,
      );
      await payerManagementPage.open();
      await payerManagementPage.search(uniquePayer.nameEn);
      await payerManagementPage.expectRowCellEquals(
        uniquePayer.nameEn,
        PAYER_COLUMN.licenseNumber,
        restored,
      );
    });
  });

  test('TC-013: should reject a whitespace-only licence number as if the field were empty', async ({
    payerManagementPage,
    steps,
  }) => {
    const payer = buildUniquePayer({ licenseNumber: WHITESPACE_ONLY_LICENCE });
    let form: PayerFormDialog;

    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.critical('Open the payer creation form', async () => {
      form = await payerManagementPage.openCreateForm();
      await form.expectActiveStep('Basic Information');
    });

    await steps.step('The field appears to contain characters', async () => {
      await form.fillBasicInformation(payer);
      await form.clickNext();
      await form.fillContactInformation(payer);
      await form.expectFieldPresent('License Number');
      await form.expectFieldValue('License Number', WHITESPACE_ONLY_LICENCE);
    });

    await steps.step(
      'The save is refused with the required-field message, treating whitespace as empty',
      async () => {
        await form.attemptNext();
        await form.expectFieldRequired('License Number', LICENCE_MESSAGES.required);
        await form.expectActiveStep('Contact Information');
      },
    );
  });

  test('TC-014: should trim the stored licence number when it is entered with surrounding spaces', async ({
    payerManagementPage,
    steps,
  }) => {
    const payer = buildUniquePayer({ licenseNumber: PADDED_LICENCE });
    let form: PayerFormDialog;

    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.critical('Open the payer creation form', async () => {
      form = await payerManagementPage.openCreateForm();
      await form.expectActiveStep('Basic Information');
    });

    await steps.step('The field displays the entered text including its spaces', async () => {
      await form.fillBasicInformation(payer);
      await form.clickNext();
      await form.fillContactInformation(payer);
      await form.expectFieldPresent('License Number');
      await form.expectFieldValue('License Number', PADDED_LICENCE);
    });

    await steps.step('The saved value is trimmed of its leading and trailing spaces', async () => {
      await form.clickNext();
      await form.fillEffectivePeriod(payer);
      await form.save();
      await form.waitForClosed();

      await payerManagementPage.open();
      await payerManagementPage.search(payer.nameEn);
      await payerManagementPage.expectRowCellEquals(
        payer.nameEn,
        PAYER_COLUMN.licenseNumber,
        TRIMMED_LICENCE,
      );
    });
  });

  test('TC-015: should handle a licence number containing special characters consistently when it is saved and read back', async ({
    payerManagementPage,
    steps,
  }) => {
    // EXPLORATORY by design. The sheet asks to "observe whether the system
    // accepts, sanitizes, or rejects" these values and states no correct
    // answer, so this case asserts the INVARIANT that must hold whichever the
    // application chooses: whatever it stores round-trips unchanged, stays
    // inside the length limit, and never leaves the record half-saved. A test
    // that demanded acceptance would be inventing a requirement; one that
    // asserted nothing would not be a test.
    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    for (const candidate of SPECIAL_CHARACTER_LICENCES) {
      await steps.step(
        `A licence number containing ${candidate.label} round-trips exactly as stored`,
        async () => {
          const payer = buildUniquePayer({ licenseNumber: candidate.value });
          await payerManagementPage.open();
          const form = await payerManagementPage.openCreateForm();
          await form.fillBasicInformation(payer);
          await form.clickNext();
          await form.fillContactInformation(payer);

          // What the field ACCEPTED, which may already differ from what was
          // typed - that is one of the outcomes being observed.
          const accepted = await form.getFieldValue('License Number');
          expect(accepted.length).toBeLessThanOrEqual(LICENCE_MAX_LENGTH);

          await form.clickNext();
          await form.fillEffectivePeriod(payer);
          await form.save();
          await form.waitForClosed();

          await payerManagementPage.open();
          await payerManagementPage.search(payer.nameEn);
          const stored = await payerManagementPage.getCellValue(
            payer.nameEn,
            PAYER_COLUMN.licenseNumber,
          );
          // The invariant: the list shows exactly what the form accepted. A
          // silent re-encoding between the two is a real defect regardless of
          // which characters the application chooses to allow.
          expect(stored).toBe(accepted.trim());
        },
      );
    }
  });
});
