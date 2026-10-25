import { test, expect } from '../../../fixtures';
import type { NetworkFormDialog, SaveReport } from '../../../pages/network/NetworkFormDialog';
import { NETWORK_LIFECYCLE, NETWORK_MESSAGE } from '../../../data/networks/network.data';
import { MESSAGE, buildNetwork, named } from '../../../data/networks/networkForm.data';
import { ARABIC_NAME_LABEL, MOJIBAKE, REGISTER } from '../../../data/networks/registerNetwork.data';

/**
 * User story 14122: Register a new network with bilingual information.
 * Field-level rules of the registration form: the Arabic name, the
 * description limits, the required names, the bilingual label, and English
 * name uniqueness per payer.
 *
 * "Payer A" is the top-bar scope payer - the only payer the form registers
 * under. The existing same-name networks are provisioned under it (or under a
 * payer the case publishes, for "Payer B") by `networkIn`.
 */
test.describe('US 14122 - Registration field rules', () => {
  test(`TC-${REGISTER.arabicAccepted.azureId}: should accept and keep an Arabic-script name when one is entered in the Arabic name field`, async ({
    networkManagementPage,
    networkDetailPage,
    steps,
    cleanup,
  }) => {
    const data = REGISTER.arabicAccepted.build();
    let form!: NetworkFormDialog;

    await steps.critical('Navigate to the Network Management module - Add Network is offered', async () => {
      await networkManagementPage.openList();
      expect(await networkManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical(`The Arabic name field is labelled "${ARABIC_NAME_LABEL}"`, async () => {
      form = await networkManagementPage.openAddForm();
      expect(await form.getFieldLabel('nameAr')).toBe(ARABIC_NAME_LABEL);
    });

    await steps.step('An Arabic-only name is accepted without a validation error', async () => {
      await form.fillBasicInformation(data);
      expect(await form.readFieldError('nameAr')).toBe('');
    });

    await steps.step('The draft saves with the Arabic name intact', async () => {
      const report = await form.attemptNewSave(data);
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.created, report.text).toBe(true);
      await networkDetailPage.open(form.createdId(report.outcome));
      expect(await networkDetailPage.readOverviewField('nameAr')).toBe(data.nameAr);
    });
  });

  test(`TC-${REGISTER.arabicRejected.azureId}: should reject Latin and mixed-script input when it is entered in the Arabic name field`, async ({
    networkManagementPage,
    steps,
    cleanup,
  }) => {
    const [latin, mixed] = REGISTER.arabicRejected.invalid;
    const data = buildNetwork({ nameAr: latin });
    let form!: NetworkFormDialog;

    await steps.critical(`Navigate to the module and open the form - the "${ARABIC_NAME_LABEL}" field is shown`, async () => {
      await networkManagementPage.openList();
      form = await networkManagementPage.openAddForm();
      expect(await form.getFieldLabel('nameAr')).toBe(ARABIC_NAME_LABEL);
    });

    await steps.step(`"${latin}" raises an error saying Arabic script is required`, async () => {
      await form.fillBasicInformation(data);
      expect(await form.readFieldError('nameAr'), 'an inline Arabic-only error').toMatch(MESSAGE.arabicOnly);
    });

    await steps.step(`"${mixed}" raises the same error`, async () => {
      await form.editField('nameAr', mixed);
      expect(await form.readFieldError('nameAr'), 'an inline Arabic-only error').toMatch(MESSAGE.arabicOnly);
    });

    await steps.step('Saving is blocked while the field holds non-Arabic text', async () => {
      const report = await form.attemptNewSave(data);
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.refused, `a mixed-script Arabic name must not save: ${report.text}`).toBe(true);
      expect(report.messages.join(' | ')).toMatch(MESSAGE.arabicOnly);
    });
  });

  test(`TC-${REGISTER.descriptionsAtLimit.azureId}: should accept both descriptions when each holds exactly 1,000 characters`, async ({
    networkManagementPage,
    steps,
    cleanup,
  }) => {
    const limits = REGISTER.descriptionsAtLimit;
    const data = buildNetwork();
    let form!: NetworkFormDialog;

    await steps.critical('Navigate to the module and enter valid names', async () => {
      await networkManagementPage.openList();
      form = await networkManagementPage.openAddForm();
      await form.fillBasicInformation(data);
      expect(await form.readFieldError('nameEn')).toBe('');
    });

    await steps.step('A 1,000-character English description is kept in full', async () => {
      expect((await form.insertInto('descriptionEn', limits.english)).length).toBe(limits.limit);
    });

    await steps.step('A 1,000-character Arabic description is kept in full', async () => {
      expect((await form.insertInto('descriptionAr', limits.arabic)).length).toBe(limits.limit);
    });

    await steps.step('The draft saves with both descriptions intact', async () => {
      const report = await form.attemptNewSave(data);
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.created, report.text).toBe(true);
      const record = await form.readCreated(report.outcome);
      expect(record?.descriptionEn?.length, 'stored English description').toBe(limits.limit);
      expect(record?.descriptionAr?.length, 'stored Arabic description').toBe(limits.limit);
    });
  });

  test(`TC-${REGISTER.descriptionsOverLimit.azureId}: should stop or refuse a description when it exceeds 1,000 characters`, async ({
    networkManagementPage,
    steps,
    cleanup,
  }) => {
    const limits = REGISTER.descriptionsOverLimit;
    const data = buildNetwork();
    let form!: NetworkFormDialog;
    let heldEn = '';
    let heldAr = '';

    await steps.critical('Navigate to the module and enter valid names', async () => {
      await networkManagementPage.openList();
      form = await networkManagementPage.openAddForm();
      await form.fillBasicInformation(data);
      expect(await form.readFieldError('nameEn')).toBe('');
    });

    await steps.step('A 1,001-character English description is entered', async () => {
      heldEn = await form.insertInto('descriptionEn', limits.english);
      expect(heldEn.length).toBeGreaterThan(0);
    });

    await steps.step('A 1,001-character Arabic description is entered', async () => {
      heldAr = await form.insertInto('descriptionAr', limits.arabic);
      expect(heldAr.length).toBeGreaterThan(0);
    });

    await steps.step('Each field stops at 1,000 characters, or the save is refused with a limit error', async () => {
      const report = await form.attemptNewSave(data);
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(heldEn.length <= limits.limit || report.refused, `English description held ${heldEn.length}; ${report.text}`).toBe(true);
      expect(heldAr.length <= limits.limit || report.refused, `Arabic description held ${heldAr.length}; ${report.text}`).toBe(true);
      const record = await form.readCreated(report.outcome);
      expect(record?.descriptionEn?.length ?? 0, 'no over-limit English description may be stored').toBeLessThanOrEqual(limits.limit);
      expect(record?.descriptionAr?.length ?? 0, 'no over-limit Arabic description may be stored').toBeLessThanOrEqual(limits.limit);
    });
  });

  test(`TC-${REGISTER.duplicateSamePayer.azureId}: should block a duplicate English name when an Active network with it exists under the same payer`, async ({
    networkManagementPage,
    networkIn,
    steps,
    cleanup,
  }) => {
    test.setTimeout(15 * 60_000);
    const name = named(REGISTER.duplicateSamePayer.sheetName);
    let payer = '';
    let report!: SaveReport;

    await steps.critical('Navigate to the module - the form registers under the scope payer', async () => {
      await networkManagementPage.openList();
      const form = await networkManagementPage.openAddForm();
      payer = await form.getPayerTag();
      await form.closeAndDiscard();
      expect(payer).not.toBe('');
    });

    await steps.critical(`An Active network named "${name}" exists under that payer`, async () => {
      const existing = await networkIn('Active', { nameEn: name, payerName: payer });
      expect(await networkManagementPage.readStatus(existing.name)).toBe(NETWORK_LIFECYCLE.active);
    });

    await steps.step('Registering the same English name under the same payer is validated on save', async () => {
      const form = await networkManagementPage.openAddForm();
      await form.fill(buildNetwork({ nameEn: name }));
      report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.refused, `a duplicate Active name under the same payer must be refused: ${report.text}`).toBe(true);
    });

    await steps.step('The error says the name is already used by an Active network under this payer', async () => {
      expect(report.messages.join(' | ')).toMatch(MESSAGE.duplicateName);
    });
  });

  test(`TC-${REGISTER.sameNameOtherPayer.azureId}: should allow the same English name when it is registered under a different payer`, async ({
    networkManagementPage,
    networkIn,
    publishedPayer,
    steps,
    cleanup,
  }) => {
    test.setTimeout(20 * 60_000);
    const name = named(REGISTER.sameNameOtherPayer.sheetName);

    await steps.critical('Navigate to the module', async () => {
      await networkManagementPage.openList();
      expect(await networkManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical(`An Active network named "${name}" exists under another payer`, async () => {
      const existing = await networkIn('Active', { nameEn: name, payerName: publishedPayer.nameEn });
      expect(existing.stage).toBe('approved');
    });

    await steps.step('Registering the same name under the scope payer raises no uniqueness error and saves', async () => {
      await networkManagementPage.openList();
      const form = await networkManagementPage.openAddForm();
      await form.fill(buildNetwork({ nameEn: name }));
      const report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.created, `the same name under a different payer should save: ${report.text}`).toBe(true);
      expect(report.messages.join(' | ')).not.toMatch(MESSAGE.duplicateName);
    });
  });

  test(`TC-${REGISTER.reuseAfterExpiry.azureId}: should allow an English name again when the same-payer network carrying it has expired`, async ({
    networkManagementPage,
    networkIn,
    steps,
    cleanup,
  }) => {
    test.setTimeout(20 * 60_000);
    const name = named(REGISTER.reuseAfterExpiry.sheetName);
    let payer = '';

    await steps.critical('Navigate to the module - the form registers under the scope payer', async () => {
      await networkManagementPage.openList();
      const form = await networkManagementPage.openAddForm();
      payer = await form.getPayerTag();
      await form.closeAndDiscard();
      expect(payer).not.toBe('');
    });

    await steps.critical(`A network named "${name}" under that payer has expired`, async () => {
      const existing = await networkIn('Expired', { nameEn: name, payerName: payer });
      expect(await networkManagementPage.readStatus(existing.name)).toBe(NETWORK_LIFECYCLE.expired);
    });

    await steps.step('Registering the name again passes the uniqueness check and saves', async () => {
      await networkManagementPage.openList();
      const form = await networkManagementPage.openAddForm();
      await form.fill(buildNetwork({ nameEn: name }));
      const report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.created, `the name of an expired network should be reusable: ${report.text}`).toBe(true);
    });
  });

  for (const missing of [REGISTER.missingEnglish, REGISTER.missingArabic]) {
    test(`TC-${missing.azureId}: should block registration with a required-field error when the ${missing.label} name is left blank`, async ({
      networkManagementPage,
      steps,
    }) => {
      let form!: NetworkFormDialog;

      await steps.critical('Navigate to the module - Add Network is offered', async () => {
        await networkManagementPage.openList();
        expect(await networkManagementPage.isAddOffered()).toBe(true);
      });

      await steps.step(`The ${missing.label} name stays blank while the rest is filled`, async () => {
        form = await networkManagementPage.openAddForm();
        await form.fillBasicInformation(buildNetwork(), missing.key);
        expect(await form.readField(missing.key)).toBe('');
      });

      await steps.step('Trying to continue shows the required-field error and goes no further', async () => {
        await form.next();
        expect(await form.readFieldError(missing.key)).toBe(NETWORK_MESSAGE.required);
        expect(await form.currentStep(), 'the wizard must stay on Basic Information').toBe(1);
        await form.closeAndDiscard();
      });
    });
  }

  test(`TC-${REGISTER.labelBothLanguages.azureId}: should label the Arabic name field "${ARABIC_NAME_LABEL}" when the interface is English or Arabic`, async ({
    networkManagementPage,
    languageSwitcher,
    steps,
    cleanup,
  }) => {
    cleanup.register(() => languageSwitcher.switchTo('en'));
    const seen: string[] = [];

    await steps.critical('Navigate to the module - Add Network is offered', async () => {
      await networkManagementPage.openList();
      expect(await networkManagementPage.isAddOffered()).toBe(true);
    });

    await steps.step(`In English the field is labelled "${ARABIC_NAME_LABEL}"`, async () => {
      await languageSwitcher.switchTo('en');
      const form = await networkManagementPage.openAddForm();
      seen.push(await form.getFieldLabel('nameAr'));
      await form.closeAndDiscard();
      expect(seen[0]).toBe(ARABIC_NAME_LABEL);
    });

    await steps.step(`In Arabic the same field is still labelled "${ARABIC_NAME_LABEL}"`, async () => {
      await languageSwitcher.switchTo('ar');
      await networkManagementPage.openList();
      const form = await networkManagementPage.openAddForm();
      seen.push(await form.getFieldLabel('nameAr'));
      await form.closeAndDiscard();
      expect(seen[1]).toBe(ARABIC_NAME_LABEL);
    });

    await steps.step('The label renders fully and legibly in both languages', async () => {
      expect(seen.filter((label) => MOJIBAKE.test(label) || label.endsWith('…')), 'garbled or truncated labels').toEqual([]);
    });
  });
});
