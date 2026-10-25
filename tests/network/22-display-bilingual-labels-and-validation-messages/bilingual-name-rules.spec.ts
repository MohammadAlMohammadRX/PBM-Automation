import { test, expect } from '../../../fixtures';
import type { NetworkFormDialog, SaveReport } from '../../../pages/network/NetworkFormDialog';
import { NETWORK_FIELD } from '../../../pages/network/NetworkFormDialog';
import { NETWORK_MESSAGE } from '../../../data/networks/network.data';
import { MESSAGE, buildNetwork } from '../../../data/networks/networkForm.data';
import { BILINGUAL, DECISION_TABLE } from '../../../data/networks/bilingualLabels.data';

/**
 * User story 14141: Display bilingual labels and validation messages.
 * The character-set and length rules of the two name fields, in either
 * interface language.
 */
test.describe('US 14141 - Bilingual name rules', () => {
  for (const accepted of [
    { ...BILINGUAL.englishAccepted, field: 'nameEn' as const, label: 'English' },
    { ...BILINGUAL.arabicAccepted, field: 'nameAr' as const, label: 'Arabic' },
  ]) {
    test(`TC-${accepted.azureId}: should accept a valid ${accepted.label} name and save the network when one is entered`, async ({
      networkManagementPage,
      steps,
      cleanup,
    }) => {
      const data = accepted.build();
      let form!: NetworkFormDialog;

      await steps.critical('Navigate to the module and open Add Network - both name fields are shown', async () => {
        await networkManagementPage.openList();
        form = await networkManagementPage.openAddForm();
        expect(await form.isFieldEditable(NETWORK_FIELD.nameEn)).toBe(true);
        expect(await form.isFieldEditable(NETWORK_FIELD.nameAr)).toBe(true);
      });

      await steps.step(`The ${accepted.label} name is accepted without an inline error`, async () => {
        await form.fillBasicInformation(data);
        expect(await form.readField(accepted.field)).toBe(data[accepted.field]);
        expect(await form.readFieldError(accepted.field)).toBe('');
      });

      await steps.step('With the rest completed, the network saves with no error on that field', async () => {
        const report = await form.attemptNewSave(data);
        cleanup.register(() => form.discardCreated(report.outcome));
        expect(report.created, report.text).toBe(true);
      });
    });
  }

  for (const rejected of [
    { ...BILINGUAL.englishRejectsArabic, field: 'nameEn' as const, message: MESSAGE.englishOnly, label: 'English' },
    { ...BILINGUAL.arabicRejectsEnglish, field: 'nameAr' as const, message: MESSAGE.arabicOnly, label: 'Arabic' },
  ]) {
    test(`TC-${rejected.azureId}: should block the save with a character-set error when the ${rejected.label} name holds the other script`, async ({
      networkManagementPage,
      steps,
      cleanup,
    }) => {
      const data = buildNetwork({ [rejected.field]: rejected.value });
      let form!: NetworkFormDialog;
      let report!: SaveReport;

      await steps.critical('Navigate to the module and open Add Network', async () => {
        await networkManagementPage.openList();
        form = await networkManagementPage.openAddForm();
        expect(await form.isFieldEditable(NETWORK_FIELD[rejected.field])).toBe(true);
      });

      await steps.step(`The field shows the entered text "${rejected.value}"`, async () => {
        await form.fillBasicInformation(data);
        expect(await form.readField(rejected.field)).toBe(rejected.value);
      });

      await steps.step(`Save is blocked with a message that the ${rejected.label} name must use its own script`, async () => {
        report = await form.attemptNewSave(data);
        cleanup.register(() => form.discardCreated(report.outcome));
        expect(report.refused, `the wrong script must not save: ${report.text}`).toBe(true);
        expect(report.messages.join(' | ')).toMatch(rejected.message);
      });
    });
  }

  test(`TC-${BILINGUAL.nameLength.azureId}: should accept 1 to 100 characters and reject 0 or 101 when the English name length is varied`, async ({
    networkManagementPage,
    networkDetailPage,
    steps,
    cleanup,
  }) => {
    const limits = BILINGUAL.nameLength;
    let networkId = '';

    await steps.critical('Navigate to the module and open Add Network', async () => {
      await networkManagementPage.openList();
      expect(await networkManagementPage.isAddOffered()).toBe(true);
    });

    await steps.step('A one-character English name saves', async () => {
      const form = await networkManagementPage.openAddForm();
      await form.fill(buildNetwork({ nameEn: limits.minimum() }));
      const report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      networkId = form.createdId(report.outcome);
      expect(report.created, report.text).toBe(true);
    });

    await steps.step('Edited to exactly 100 characters, the name saves', async () => {
      await networkDetailPage.open(networkId);
      const form = await networkDetailPage.openEdit();
      const held = await form.insertInto('nameEn', limits.atMax());
      expect(held.length).toBe(limits.max);
      const report = await form.saveEditAndReport();
      expect(report.created, report.text).toBe(true);
    });

    await steps.step('101 characters are refused with a maximum-length message (or capped at 100)', async () => {
      await networkDetailPage.open(networkId);
      const form = await networkDetailPage.openEdit();
      const held = await form.insertInto('nameEn', limits.overMax());
      const report = await form.saveEditAndReport();
      expect(held.length <= limits.max || report.refused, `held ${held.length} characters; ${report.text}`).toBe(true);
      await form.closeAndDiscard();
      await networkDetailPage.open(networkId);
      expect((await networkDetailPage.getName()).length, 'no over-limit name may be stored').toBeLessThanOrEqual(limits.max);
    });

    await steps.step('An empty name is refused as required', async () => {
      await networkDetailPage.open(networkId);
      const form = await networkDetailPage.openEdit();
      await form.clearField(NETWORK_FIELD.nameEn);
      const report = await form.attemptEditSave();
      expect(report.refused, report.text).toBe(true);
      expect(await form.readFieldError('nameEn')).toBe(NETWORK_MESSAGE.required);
      await form.closeAndDiscard();
    });
  });

  test(`TC-${BILINGUAL.decisionTable.azureId}: should save or refuse exactly as the decision table says for every language and name combination`, async ({
    networkManagementPage,
    languageSwitcher,
    steps,
    cleanup,
  }) => {
    cleanup.register(() => languageSwitcher.switchTo('en'));

    await steps.critical('Navigate to the Network Management module', async () => {
      await networkManagementPage.openList();
      expect(await networkManagementPage.isAddOffered()).toBe(true);
    });

    for (const row of DECISION_TABLE) {
      await steps.step(`${row.row}: ${row.outcome}`, async () => {
        await languageSwitcher.switchTo(row.language);
        await networkManagementPage.openList();
        const form = await networkManagementPage.openAddForm();
        const data = row.build();
        await form.fillBasicInformation(data);
        // A refused step 1 IS the refusal (2026-10-24) - see attemptNewSave.
        const report = await form.attemptNewSave(data);
        cleanup.register(() => form.discardCreated(report.outcome));
        expect(report.created, `${row.row}: ${report.text}`).toBe(row.saves);
        await form.closeAndDiscard();
      });
    }
  });

  test(`TC-${BILINGUAL.specialCharacters.azureId}: should reject digits, special characters and mixed scripts when they are entered in the name fields`, async ({
    networkManagementPage,
    steps,
    cleanup,
  }) => {
    const values = BILINGUAL.specialCharacters;

    await steps.critical('Navigate to the module and open Add Network', async () => {
      await networkManagementPage.openList();
      expect(await networkManagementPage.isAddOffered()).toBe(true);
    });

    await steps.step(`"${values.english}" in the English name is refused: English letters only`, async () => {
      const form = await networkManagementPage.openAddForm();
      await form.fill(buildNetwork({ nameEn: values.english }));
      const report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.refused, `digits and symbols must not save: ${report.text}`).toBe(true);
      expect(report.messages.join(' | ')).toMatch(MESSAGE.englishOnly);
      await form.closeAndDiscard();
    });

    await steps.step(`"${values.arabic}" in the Arabic name is refused: Arabic letters only`, async () => {
      await networkManagementPage.openList();
      const form = await networkManagementPage.openAddForm();
      await form.fill(buildNetwork({ nameAr: values.arabic }));
      const report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.refused, `mixed script must not save: ${report.text}`).toBe(true);
      expect(report.messages.join(' | ')).toMatch(MESSAGE.arabicOnly);
      await form.closeAndDiscard();
    });
  });
});
