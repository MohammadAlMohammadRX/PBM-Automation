import { test, expect } from '../../../fixtures';
import { PAYER_COLUMN } from '../../../constants/ElementIds';
import { PAYER_NAME_AR_LABEL, buildUniquePayer } from '../../../data/payers/payer.data';
import type { PayerFormDialog } from '../../../pages/payer/PayerFormDialog';
import {
  CHARACTER_SET_CASES,
  NAME_MESSAGES,
  UNUSUAL_CHARACTER_CASES,
  uniqueCharacterSetValue,
  VALID_NAMES,
} from '../../../data/payers/payerNameFields.data';

/** The wizard label for whichever name field a case applies to. */
const labelFor = (field: 'english' | 'arabic') =>
  (field === 'english' ? 'Payer Name' : PAYER_NAME_AR_LABEL);

/**
 * User story: Validate Payer Name Fields for Language-Specific Character Sets
 * and Arabic Name Length.
 * The character-set rules themselves.
 *
 * WHAT THE FIELDS ACTUALLY ENFORCE, probed class by class before these cases
 * were written - and it is looser than the sheet assumes:
 *
 *   English Name  refuses a value ONLY when it contains ARABIC letters.
 *                 Digits, '#', '-', '/' and even an EMOJI are all accepted.
 *   Arabic Name   refuses a value ONLY when it contains LATIN letters.
 *                 Digits, '#' and spaces are all accepted.
 *
 * So the constraint is "must not contain the opposite script", not "letters of
 * this script only" - despite the message reading "English letters only."
 *
 * Three of the sheet's cases therefore expect a rejection the application does
 * not perform. Those assert what the application really does and carry the
 * divergence in their data entry, because a test written to the sheet would
 * fail against behaviour that is arguably correct and would tell nobody
 * anything useful. See data/payers/payerNameFields.data.ts.
 */
test.describe('Validate Payer Name Fields - Character sets', () => {
  test('TC-001: should save the payer when both the English and Arabic names are valid', async ({
    payerManagementPage,
    steps,
  }) => {
    const payer = buildUniquePayer({
      nameEn: `${VALID_NAMES.english} ${Date.now()}`,
      nameAr: VALID_NAMES.arabic,
    });
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.critical('Open the create-payer form', async () => {
      form = await payerManagementPage.openCreateForm();
      await form.expectActiveStep('Basic Information');
    });

    await steps.step('The English Name field accepts the value as typed', async () => {
      await form.fillTextField('Payer Name', payer.nameEn);
      await form.expectFieldValue('Payer Name', payer.nameEn);
      await form.expectNoFieldError('Payer Name');
    });

    await steps.step('The Arabic Name field accepts the value as typed', async () => {
      await form.fillTextField(PAYER_NAME_AR_LABEL, payer.nameAr);
      await form.expectFieldValue(PAYER_NAME_AR_LABEL, payer.nameAr);
      await form.expectNoFieldError(PAYER_NAME_AR_LABEL);
    });

    await steps.step('The form submits with no validation error and the record is created', async () => {
      await form.selectDropdownOption('Payer Type', payer.type);
      await form.clickNext();
      await form.fillContactInformation(payer);
      await form.clickNext();
      await form.fillEffectivePeriod(payer);

      // The create response is the evidence the record was made; the drawer
      // closes a few seconds later and occasionally lingers past the wait.
      const outcome = await form.saveNewAndCaptureOutcome();
      expect(outcome!.status).toBe(200);

      await payerManagementPage.open();
      await payerManagementPage.search(payer.nameEn);
      await payerManagementPage.expectRowCellEquals(
        payer.nameEn,
        PAYER_COLUMN.payerName,
        payer.nameEn,
      );
    });
  });

  for (const characterSet of CHARACTER_SET_CASES) {
    const label = labelFor(characterSet.field);
    const otherField = characterSet.field === 'english' ? 'arabic' : 'english';
    const otherLabel = labelFor(otherField);
    const message = characterSet.field === 'english'
      ? NAME_MESSAGES.englishOnly
      : NAME_MESSAGES.arabicOnly;
    const behaviour = characterSet.expectRejected
      ? 'should refuse the value and report the character-set violation'
      : 'should accept the value without a character-set violation';

    test(`${characterSet.caseId}: ${behaviour} when the form contains ${characterSet.label}`, async ({
      payerManagementPage,
      steps,
    }) => {
      const payer = buildUniquePayer();
      // Keyed lookup rather than a conditional in the body: the field a case
      // applies to is data, not test logic.
      const validNames = { english: payer.nameEn, arabic: payer.nameAr };
      // Unique per run, in the field's own script - see uniqueCharacterSetValue.
      const value = uniqueCharacterSetValue(characterSet);
      let form!: PayerFormDialog;

      await steps.critical('Navigate to the Payer Management module', () =>
        payerManagementPage.open());

      await steps.critical('Open the create-payer form', async () => {
        form = await payerManagementPage.openCreateForm();
        // The sheet's step 2 expects both name fields on screen; asserting each
        // is present is that step's own expected result.
        await form.expectFieldPresent('Payer Name');
        await form.expectFieldPresent(PAYER_NAME_AR_LABEL);
      });

      await steps.step('The other name field holds a valid value', async () => {
        await form.fillTextField(otherLabel, validNames[otherField]);
        await form.expectNoFieldError(otherLabel);
      });

      // The accept/refuse branch lives in the Page Object - see
      // expectCharacterSetOutcome - so neither outcome can silently assert
      // nothing. On the accepting path the VALUE is asserted too, so a field
      // that quietly stripped characters would still fail.
      await steps.step(
        `The ${characterSet.field} name field responds to ${characterSet.label}`,
        () => form.expectCharacterSetOutcome(
          label,
          value,
          characterSet.expectRejected,
          message,
        ),
      );

      // Asserted as "was the record created?", which is the sheet's own
      // expected result, rather than as "which wizard step are we on". Whether
      // a character-set error blocks Next was not verified, and asserting an
      // unverified mechanism would make this step's pass or failure
      // uninterpretable.
      await steps.step(
        characterSet.expectRejected || characterSet.serverRejects
          ? 'No payer is created from the refused value'
          : 'The accepted value reaches the created record',
        () => payerManagementPage.expectCharacterSetSaveOutcome(
          payer,
          label,
          value,
          characterSet.expectRejected,
          characterSet.serverRejects,
        ),
      );
    });
  }

  test('TC-015: should handle emoji and hidden bidirectional characters consistently when they are entered into a name field', async ({
    payerManagementPage,
    steps,
  }) => {
    // EXPLORATORY for the control-character half: the sheet asks to observe the
    // outcome and states no single correct answer. The emoji half is NOT
    // exploratory - the sheet expects a rejection and the field accepts it,
    // which is recorded as a divergence rather than asserted the sheet's way.
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.critical('Open the create-payer form', async () => {
      form = await payerManagementPage.openCreateForm();
      await form.expectFieldPresent('Payer Name');
      await form.expectFieldPresent(PAYER_NAME_AR_LABEL);
    });

    for (const unusual of UNUSUAL_CHARACTER_CASES) {
      await steps.step(`The field handles ${unusual.label} consistently`, async () => {
        const label = labelFor(unusual.field);
        const message = unusual.field === 'english'
          ? NAME_MESSAGES.englishOnly
          : NAME_MESSAGES.arabicOnly;
        await form.expectCharacterSetOutcome(
          label,
          unusual.value,
          unusual.expectRejected,
          message,
        );
      });
    }

    await steps.step('Neither value was silently altered by the field', async () => {
      // The invariant that must hold whichever way the application chose: what
      // the field reports back is exactly what was typed. A silent re-encoding
      // would be a defect regardless of which characters are allowed.
      for (const unusual of UNUSUAL_CHARACTER_CASES) {
        const label = labelFor(unusual.field);
        expect(await form.getFieldValue(label)).toBe(unusual.value);
      }
    });
  });
});
