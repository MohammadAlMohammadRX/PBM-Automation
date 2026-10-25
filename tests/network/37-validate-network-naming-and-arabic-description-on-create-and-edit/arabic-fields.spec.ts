import { test, expect } from '../../../fixtures';
import type { NetworkFormDialog, SaveReport } from '../../../pages/network/NetworkFormDialog';
import { NETWORK_MESSAGE } from '../../../data/networks/network.data';
import { MESSAGE, buildNetwork } from '../../../data/networks/networkForm.data';
import { NAMING, ODD_CHARACTERS } from '../../../data/networks/namingValidation.data';

/**
 * User story 14316: Validate network naming and Arabic description on create
 * and edit - the Arabic name and the Arabic description.
 *
 * The Arabic name is required, limited to 255 characters and Arabic-only; the
 * Arabic description is Arabic-only. Server refusals show only in the save
 * response and the toast, so each case asserts on both (SaveReport).
 */
test.describe('US 14316 - Arabic name and description', () => {
  test(`TC-${NAMING.arabicRequired.azureId}: should block the save with "Arabic name is required" when the Arabic name is left blank`, async ({
    networkManagementPage,
    steps,
  }) => {
    let form!: NetworkFormDialog;

    await steps.critical('Navigate to the module - the Create Network form opens', async () => {
      await networkManagementPage.openList();
      form = await networkManagementPage.openAddForm();
      expect(await form.readField('nameAr')).toBe('');
    });

    await steps.step('Everything but the Arabic name is filled; the Arabic name stays empty', async () => {
      await form.fillBasicInformation(buildNetwork(), 'nameAr');
      expect(await form.readField('nameAr')).toBe('');
    });

    await steps.step('Saving is blocked with a required-field error on the Arabic name', async () => {
      const report = await form.attemptNewSave();
      expect(report.refused, report.text).toBe(true);
      expect(await form.readFieldError('nameAr')).toBe(NETWORK_MESSAGE.required);
      await form.closeAndDiscard();
    });
  });

  test(`TC-${NAMING.arabicAt255.azureId}: should accept and store the full Arabic name when it is exactly 255 characters`, async ({
    networkManagementPage,
    steps,
    cleanup,
  }) => {
    const value = NAMING.arabicAt255.value();
    let form!: NetworkFormDialog;

    await steps.critical('Navigate to the module - the Create Network form opens', async () => {
      await networkManagementPage.openList();
      form = await networkManagementPage.openAddForm();
      expect(await form.readField('nameAr')).toBe('');
    });

    await steps.step('255 Arabic characters are kept in full with no error', async () => {
      const data = buildNetwork();
      await form.fillBasicInformation(data);
      expect((await form.insertInto('nameAr', value)).length).toBe(NAMING.arabicAt255.length);
      expect(await form.readFieldError('nameAr')).toBe('');
    });

    await steps.step('The network saves with the full 255-character Arabic name stored', async () => {
      const report = await form.attemptNewSave(buildNetwork());
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.created, report.text).toBe(true);
      expect((await form.readCreated(report.outcome))?.networkNameAr).toBe(value);
    });
  });

  test(`TC-${NAMING.arabicOver255.azureId}: should refuse an Arabic name when it exceeds 255 characters`, async ({
    networkManagementPage,
    steps,
    cleanup,
  }) => {
    const value = NAMING.arabicOver255.value();
    let form!: NetworkFormDialog;
    let held = '';
    let report!: SaveReport;

    await steps.critical('Navigate to the module - the Create Network form opens', async () => {
      await networkManagementPage.openList();
      form = await networkManagementPage.openAddForm();
      expect(await form.readField('nameAr')).toBe('');
    });

    await steps.step('256 Arabic characters are entered (blocked at 255, or held pending validation)', async () => {
      await form.fillBasicInformation(buildNetwork());
      held = await form.insertInto('nameAr', value);
      expect(held.length).toBeGreaterThan(0);
    });

    await steps.step('Saving is blocked with a 255-character limit error, or the field never held more than 255', async () => {
      report = await form.attemptNewSave(buildNetwork());
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(held.length <= NAMING.arabicOver255.limit || report.refused, `held ${held.length}; ${report.text}`).toBe(true);
      expect((await form.readCreated(report.outcome))?.networkNameAr.length ?? 0, 'no over-limit Arabic name may be stored')
        .toBeLessThanOrEqual(NAMING.arabicOver255.limit);
    });
  });

  for (const invalid of [
    { ...NAMING.arabicNameLatin, field: 'nameAr' as const, fieldLabel: 'Arabic name', rule: 'Arabic name must contain Arabic characters only' },
    { ...NAMING.arabicNameMixed, field: 'nameAr' as const, fieldLabel: 'Arabic name', rule: 'mixed Arabic and digits are still not Arabic-only' },
    { ...NAMING.arabicDescriptionLatin, field: 'descriptionAr' as const, fieldLabel: 'Arabic description', rule: 'Arabic description must contain Arabic characters only' },
  ]) {
    test(`TC-${invalid.azureId}: should block the save with an Arabic-only error when "${invalid.value}" is entered in the ${invalid.fieldLabel}`, async ({
      networkManagementPage,
      steps,
      cleanup,
    }) => {
      const data = buildNetwork({ [invalid.field]: invalid.value });
      let form!: NetworkFormDialog;
      let report!: SaveReport;

      await steps.critical('Navigate to the module - the Create Network form opens', async () => {
        await networkManagementPage.openList();
        form = await networkManagementPage.openAddForm();
        expect(await form.readField(invalid.field)).toBe('');
      });

      await steps.step('The field takes the keystrokes', async () => {
        await form.fillBasicInformation(data);
        expect(await form.readField(invalid.field)).toBe(invalid.value);
      });

      await steps.step(`Saving is blocked: ${invalid.rule}`, async () => {
        report = await form.attemptNewSave(data);
        cleanup.register(() => form.discardCreated(report.outcome));
        expect(report.refused, `"${invalid.value}" must not save: ${report.text}`).toBe(true);
        expect(report.messages.join(' | ')).toMatch(MESSAGE.arabicOnly);
      });
    });
  }

  test(`TC-${NAMING.arabicDescriptionValid.azureId}: should save and store the Arabic description when it holds Arabic text only`, async ({
    networkManagementPage,
    steps,
    cleanup,
  }) => {
    const data = buildNetwork({ descriptionAr: NAMING.arabicDescriptionValid.value });
    let form!: NetworkFormDialog;

    await steps.critical('Navigate to the module - the Create Network form opens', async () => {
      await networkManagementPage.openList();
      form = await networkManagementPage.openAddForm();
      expect(await form.readField('descriptionAr')).toBe('');
    });

    await steps.step('The Arabic-only description is accepted without error', async () => {
      await form.fillBasicInformation(data);
      expect(await form.readField('descriptionAr')).toBe(NAMING.arabicDescriptionValid.value);
      expect(await form.readFieldError('descriptionAr')).toBe('');
    });

    await steps.step('The network saves with the Arabic description stored as entered', async () => {
      const report = await form.attemptNewSave(data);
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.created, report.text).toBe(true);
      expect((await form.readCreated(report.outcome))?.descriptionAr).toBe(NAMING.arabicDescriptionValid.value);
    });
  });

  test(`TC-${NAMING.pastedOddities.azureId}: should refuse or strip emoji and bidi control characters when they are pasted into the Arabic fields`, async ({
    networkManagementPage,
    steps,
    cleanup,
  }) => {
    const data = buildNetwork();
    let form!: NetworkFormDialog;
    let report!: SaveReport;

    await steps.critical('Navigate to the module - the Create Network form opens', async () => {
      await networkManagementPage.openList();
      form = await networkManagementPage.openAddForm();
      expect(await form.readField('nameAr')).toBe('');
    });

    await steps.step('The pasted emoji and control characters land in the Arabic name and description', async () => {
      await form.fillBasicInformation(data);
      expect((await form.insertInto('nameAr', NAMING.pastedOddities.nameAr)).length).toBeGreaterThan(0);
      expect((await form.insertInto('descriptionAr', NAMING.pastedOddities.descriptionAr)).length).toBeGreaterThan(0);
    });

    await steps.step('Saving reports the non-Arabic content, or stores nothing corrupted', async () => {
      report = await form.attemptNewSave(data);
      cleanup.register(() => form.discardCreated(report.outcome));
      const stored = await form.readCreated(report.outcome);
      expect(report.refused || !ODD_CHARACTERS.test(stored?.networkNameAr ?? ''), `Arabic name stored as "${stored?.networkNameAr}"`).toBe(true);
      expect(report.refused || !ODD_CHARACTERS.test(stored?.descriptionAr ?? ''), `Arabic description stored as "${stored?.descriptionAr}"`).toBe(true);
    });
  });
});
