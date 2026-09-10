import { test, expect } from '../../../fixtures';
import { PAYER_COLUMN } from '../../../constants/ElementIds';
import { PAYER_NAME_AR_LABEL, buildUniquePayer } from '../../../data/payers/payer.data';
import type { PayerFormDialog } from '../../../pages/payer/PayerFormDialog';
import {
  ARABIC_NAME_MAX_LENGTH,
  NAME_ACCEPTED_STATUS,
  NAME_LENGTH_REJECTION,
  SINGLE_ARABIC_LETTER,
  uniqueArabicNameOfLength,
} from '../../../data/payers/payerNameFields.data';

/**
 * User story: Validate Payer Name Fields for Language-Specific Character Sets
 * and Arabic Name Length.
 * The Arabic name's length boundary.
 *
 * THE LIMIT IS ENTIRELY SERVER-SIDE, verified before these cases were written,
 * and that shapes all three of them:
 *
 *   - There is NO `maxlength` on either name input. 256 characters type in
 *     fully, and step-1 validation stays silent.
 *   - The limit appears only on save: 255 -> HTTP 200 "saved as a draft",
 *     256 -> HTTP 422 "Form Validation Failure".
 *   - On that 422 the interface shows NOTHING. No toast, no inline error, and
 *     the drawer stays open exactly as if the click had not landed.
 *
 * So the boundary cannot be observed on the form at all, which is why these
 * cases assert the RESPONSE. The 422 proves the record was refused; the missing
 * message is asserted as its own step and fails, because the sheet asks for an
 * inline message the application does not produce. Splitting them keeps the
 * working half (the record really is not created) reporting as a pass right
 * next to the broken half.
 *
 * This also settles a disagreement inside the framework: editPayer.data.ts
 * declares the name maximum as 100 and localizedName.data.ts declares 255. The
 * live limit is 255.
 */
test.describe('Validate Payer Name Fields - Arabic name length', () => {
  test(`TC-005: should save the payer when the Arabic name is exactly ${ARABIC_NAME_MAX_LENGTH} characters long`, async ({
    payerManagementPage,
    steps,
  }) => {
    const arabicName = uniqueArabicNameOfLength(ARABIC_NAME_MAX_LENGTH);
    const payer = buildUniquePayer({ nameAr: arabicName });
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.critical('Open the create-payer form', async () => {
      form = await payerManagementPage.openCreateForm();
      await form.expectFieldPresent(PAYER_NAME_AR_LABEL);
    });

    await steps.step('The English Name field accepts a valid value', async () => {
      await form.fillTextField('Payer Name', payer.nameEn);
      await form.expectNoFieldError('Payer Name');
    });

    await steps.step(
      `The Arabic Name field holds all ${ARABIC_NAME_MAX_LENGTH} characters without truncating`,
      async () => {
        await form.fillTextField(PAYER_NAME_AR_LABEL, arabicName);
        await form.expectFieldValueLength(PAYER_NAME_AR_LABEL, ARABIC_NAME_MAX_LENGTH);
        await form.expectNoFieldError(PAYER_NAME_AR_LABEL);
      },
    );

    await steps.step('The form saves with no length-related validation error', async () => {
      await form.selectDropdownOption('Payer Type', payer.type);
      await form.clickNext();
      await form.fillContactInformation(payer);
      await form.clickNext();
      await form.fillEffectivePeriod(payer);

      const outcome = await form.saveNewAndCaptureOutcome();
      expect(outcome, 'the create should have reached the server').not.toBeNull();
      expect(outcome!.status).toBe(NAME_ACCEPTED_STATUS);

      await payerManagementPage.open();
      await payerManagementPage.search(payer.nameEn);
      await payerManagementPage.expectRowCellEquals(
        payer.nameEn,
        PAYER_COLUMN.payerName,
        payer.nameEn,
      );
    });
  });

  test(`TC-006: should refuse the payer when the Arabic name is ${ARABIC_NAME_MAX_LENGTH + 1} characters long`, async ({
    payerManagementPage,
    steps,
  }) => {
    const oversized = uniqueArabicNameOfLength(ARABIC_NAME_MAX_LENGTH + 1);
    const payer = buildUniquePayer({ nameAr: oversized });
    let form!: PayerFormDialog;
    let outcome!: Awaited<ReturnType<PayerFormDialog['saveNewAndCaptureOutcome']>>;

    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.critical('Open the create-payer form', async () => {
      form = await payerManagementPage.openCreateForm();
      await form.expectFieldPresent(PAYER_NAME_AR_LABEL);
    });

    await steps.step('The English Name field accepts a valid value', async () => {
      await form.fillTextField('Payer Name', payer.nameEn);
      await form.expectNoFieldError('Payer Name');
    });

    // The sheet expects the over-length value to be caught here. It is not:
    // there is no client-side cap at all, so the field holds every character
    // and reports nothing. Asserting that honestly is what makes the next
    // step's 422 meaningful.
    await steps.step(
      `The Arabic Name field accepts all ${ARABIC_NAME_MAX_LENGTH + 1} characters, with no client-side limit`,
      async () => {
        await form.fillTextField(PAYER_NAME_AR_LABEL, oversized);
        await form.expectFieldValueLength(PAYER_NAME_AR_LABEL, ARABIC_NAME_MAX_LENGTH + 1);
        await form.expectNoFieldError(PAYER_NAME_AR_LABEL);
      },
    );

    await steps.step('The save is refused by the server as a validation failure', async () => {
      await form.selectDropdownOption('Payer Type', payer.type);
      await form.clickNext();
      await form.fillContactInformation(payer);
      await form.clickNext();
      await form.fillEffectivePeriod(payer);

      outcome = await form.saveNewAndCaptureOutcome();
      expect(outcome, 'the create should have reached the server').not.toBeNull();
      expect(outcome!.status).toBe(NAME_LENGTH_REJECTION.status);
      expect(outcome!.text).toContain(NAME_LENGTH_REJECTION.title);
    });

    // The step this case fails on. The rejection above is correct and the
    // record really is not created; what is missing is any sign of it on
    // screen. Kept separate so the working half still reports as a pass.
    await steps.step('An inline message identifies the length violation', async () => {
      const messages = await form.waitForVisibleMessages();
      expect(
        messages,
        'A refused save must tell the user something. The application shows no toast, no '
          + 'inline error and no dialog on a 422 - the drawer simply stays open, which is '
          + 'indistinguishable from a click that never landed.',
      ).not.toEqual([]);
    });

    await steps.step('No payer was created from the over-length name', async () => {
      await form.closeAndDiscard();
      await payerManagementPage.open();
      await payerManagementPage.search(payer.nameEn);
      await payerManagementPage.expectEmptyState();
    });
  });

  test('TC-007: should save the payer when the Arabic name is a single Arabic letter', async ({
    payerManagementPage,
    steps,
  }) => {
    const payer = buildUniquePayer({ nameAr: SINGLE_ARABIC_LETTER });
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.critical('Open the create-payer form', async () => {
      form = await payerManagementPage.openCreateForm();
      await form.expectFieldPresent(PAYER_NAME_AR_LABEL);
    });

    await steps.step('The English Name field accepts a valid value', async () => {
      await form.fillTextField('Payer Name', payer.nameEn);
      await form.expectNoFieldError('Payer Name');
    });

    await steps.step('The Arabic Name field accepts the single character', async () => {
      await form.fillTextField(PAYER_NAME_AR_LABEL, SINGLE_ARABIC_LETTER);
      await form.expectFieldValue(PAYER_NAME_AR_LABEL, SINGLE_ARABIC_LETTER);
      await form.expectNoFieldError(PAYER_NAME_AR_LABEL);
    });

    await steps.step('The form saves with no validation error on the Arabic name', async () => {
      await form.selectDropdownOption('Payer Type', payer.type);
      await form.clickNext();
      await form.fillContactInformation(payer);
      await form.clickNext();
      await form.fillEffectivePeriod(payer);

      const outcome = await form.saveNewAndCaptureOutcome();
      expect(outcome!.status).toBe(NAME_ACCEPTED_STATUS);

      await payerManagementPage.open();
      await payerManagementPage.search(payer.nameEn);
      await payerManagementPage.waitForRowVisible(payer.nameEn);
    });
  });
});
