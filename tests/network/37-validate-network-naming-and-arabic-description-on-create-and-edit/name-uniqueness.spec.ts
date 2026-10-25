import { test, expect } from '../../../fixtures';
import type { SaveReport } from '../../../pages/network/NetworkFormDialog';
import { NETWORK_LIFECYCLE, NETWORK_MESSAGE } from '../../../data/networks/network.data';
import { MESSAGE, buildNetwork, named } from '../../../data/networks/networkForm.data';
import { NAMING } from '../../../data/networks/namingValidation.data';

/**
 * User story 14316: Validate network naming and Arabic description on create
 * and edit - the English name's uniqueness per payer.
 *
 * Uniqueness counts only ACTIVE networks of the SAME payer: an Expired,
 * Inactive or deleted namesake, or one under another payer, must not block.
 * "Payer X" is the top-bar scope payer the form creates under; it is read off
 * the form first so the existing namesake can be provisioned under it.
 */
test.describe('US 14316 - English name uniqueness', () => {
  test(`TC-${NAMING.uniqueName.azureId}: should create the network under its payer when its English name is unique there`, async ({
    networkManagementPage,
    steps,
    cleanup,
  }) => {
    const data = NAMING.uniqueName.build();
    let payer = '';
    let report!: SaveReport;

    await steps.critical('Navigate to the module - the network list is shown', async () => {
      await networkManagementPage.openList();
      expect(await networkManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical('The Create Network form opens blank', async () => {
      const form = await networkManagementPage.openAddForm();
      payer = await form.getPayerTag();
      expect(await form.readField('nameEn')).toBe('');
      await form.closeAndDiscard();
    });

    await steps.step('A unique English name, Arabic name and Arabic description are accepted for the payer', async () => {
      const form = await networkManagementPage.openAddForm();
      await form.fillBasicInformation(data);
      expect(await form.readFieldError('nameEn')).toBe('');
      expect(await form.readFieldError('nameAr')).toBe('');
      report = await form.attemptNewSave(data);
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.created, report.text).toBe(true);
    });

    await steps.step('The network is created and listed under that payer', async () => {
      const row = await networkManagementPage.readRow(data.nameEn);
      expect(row.networkName).toBe(data.nameEn);
      expect(row.payer).toBe(payer);
    });
  });

  test(`TC-${NAMING.duplicateActive.azureId}: should reject a duplicate English name when an Active network under the same payer already has it`, async ({
    networkManagementPage,
    networkIn,
    steps,
    cleanup,
  }) => {
    test.setTimeout(15 * 60_000);
    const name = named(NAMING.duplicateActive.sheetName);
    let payer = '';
    let report!: SaveReport;

    await steps.critical('Navigate to the module - the form opens for Payer X', async () => {
      await networkManagementPage.openList();
      const form = await networkManagementPage.openAddForm();
      payer = await form.getPayerTag();
      await form.closeAndDiscard();
      expect(payer).not.toBe('');
    });

    await steps.critical(`An Active "${name}" exists under Payer X`, async () => {
      const existing = await networkIn('Active', { nameEn: name, payerName: payer });
      expect(await networkManagementPage.readStatus(existing.name)).toBe(NETWORK_LIFECYCLE.active);
    });

    await steps.step('The duplicate name is entered and saving is blocked', async () => {
      const form = await networkManagementPage.openAddForm();
      await form.fill(buildNetwork({ nameEn: name }));
      expect(await form.readField('nameEn')).toBe(name);
      report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.refused, `a duplicate Active name under the same payer must not save: ${report.text}`).toBe(true);
    });

    await steps.step('The error says the name already exists for an Active network under this payer', async () => {
      expect(report.messages.join(' | ')).toMatch(MESSAGE.duplicateName);
    });
  });

  test(`TC-${NAMING.otherPayer.azureId}: should allow the same English name when it belongs to a different payer`, async ({
    networkManagementPage,
    networkIn,
    publishedPayer,
    steps,
    cleanup,
  }) => {
    test.setTimeout(20 * 60_000);
    const name = named(NAMING.otherPayer.sheetName);

    await steps.critical('Navigate to the module - the network list is shown', async () => {
      await networkManagementPage.openList();
      expect(await networkManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical(`An Active "${name}" exists under Payer Y`, async () => {
      const existing = await networkIn('Active', { nameEn: name, payerName: publishedPayer.nameEn });
      expect(existing.stage).toBe('approved');
    });

    await steps.step('The same name under Payer X raises no conflict and the network is created', async () => {
      await networkManagementPage.openList();
      const form = await networkManagementPage.openAddForm();
      await form.fill(buildNetwork({ nameEn: name }));
      const report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.created, `a name owned by another payer must not block: ${report.text}`).toBe(true);
      expect(report.messages.join(' | ')).not.toMatch(MESSAGE.duplicateName);
    });
  });

  test(`TC-${NAMING.editToDuplicate.azureId}: should reject renaming a network to the name of another Active network of the same payer`, async ({
    networkManagementPage,
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const nameA = named(NAMING.editToDuplicate.sheetNameA);
    const nameB = named(NAMING.editToDuplicate.sheetNameB);
    let payer = '';
    let networkB = '';
    let report!: SaveReport;

    await steps.critical('Navigate to the module - Payer X has Active "Network A" and "Network B"', async () => {
      await networkManagementPage.openList();
      const form = await networkManagementPage.openAddForm();
      payer = await form.getPayerTag();
      await form.closeAndDiscard();
      await networkIn('Active', { nameEn: nameA, payerName: payer });
      networkB = (await networkIn('Active', { nameEn: nameB, payerName: payer })).id;
      expect(await networkManagementPage.readStatus(nameB)).toBe(NETWORK_LIFECYCLE.active);
    });

    await steps.step('"Network B" opens for edit with its current values', async () => {
      await networkDetailPage.open(networkB);
      const form = await networkDetailPage.openEdit();
      expect(await form.readField('nameEn')).toBe(nameB);
      await form.editField('nameEn', nameA);
      report = await form.saveEditAndReport();
    });

    await steps.step('Renaming it to "Network A" is blocked with a conflict error', async () => {
      expect(report.refused, `the rename to an Active namesake must not save: ${report.text}`).toBe(true);
      expect(report.messages.join(' | ')).toMatch(MESSAGE.duplicateName);
    });
  });

  for (const reuse of [
    { ...NAMING.reuseExpired, state: 'Expired' as const, label: 'Expired' },
    { ...NAMING.reuseInactive, state: 'Inactive' as const, label: 'Inactive' },
  ]) {
    test(`TC-${reuse.azureId}: should allow the name again when the same-payer network carrying it is ${reuse.label}`, async ({
      networkManagementPage,
      networkIn,
      steps,
      cleanup,
    }) => {
      test.setTimeout(20 * 60_000);
      const name = named(reuse.sheetName);
      let payer = '';

      await steps.critical('Navigate to the module - the form opens for Payer X', async () => {
        await networkManagementPage.openList();
        const form = await networkManagementPage.openAddForm();
        payer = await form.getPayerTag();
        await form.closeAndDiscard();
        expect(payer).not.toBe('');
      });

      await steps.critical(`Payer X's "${name}" is ${reuse.label}`, async () => {
        const existing = await networkIn(reuse.state, { nameEn: name, payerName: payer });
        expect(await networkManagementPage.readStatus(existing.name)).toBe(reuse.label);
      });

      await steps.step('The same name raises no conflict and the new network is created', async () => {
        await networkManagementPage.openList();
        const form = await networkManagementPage.openAddForm();
        await form.fill(buildNetwork({ nameEn: name }));
        const report = await form.saveNewAndReport();
        cleanup.register(() => form.discardCreated(report.outcome));
        expect(report.created, `an ${reuse.label} namesake must not block: ${report.text}`).toBe(true);
      });
    });
  }

  test(`TC-${NAMING.reuseDeleted.azureId}: should allow the name again when the same-payer network carrying it was deleted`, async ({
    networkManagementPage,
    networkIn,
    steps,
    cleanup,
  }) => {
    const name = named(NAMING.reuseDeleted.sheetName);
    let payer = '';

    await steps.critical('Navigate to the module - the form opens for Payer X', async () => {
      await networkManagementPage.openList();
      const form = await networkManagementPage.openAddForm();
      payer = await form.getPayerTag();
      await form.closeAndDiscard();
      expect(payer).not.toBe('');
    });

    await steps.critical(`Payer X's "${name}" has been deleted`, async () => {
      const existing = await networkIn('Draft', { nameEn: name, payerName: payer });
      const deleted = await networkManagementPage.deleteNetwork(existing.name);
      expect(deleted?.status ?? 0, `the namesake should be deleted: ${deleted?.text.slice(0, 200)}`).toBeLessThan(300);
    });

    await steps.step('The same name raises no conflict and the new network is created', async () => {
      await networkManagementPage.openList();
      const form = await networkManagementPage.openAddForm();
      await form.fill(buildNetwork({ nameEn: name }));
      const report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.created, `a deleted namesake must not block: ${report.text}`).toBe(true);
    });
  });

  test(`TC-${NAMING.allRulesTogether.azureId}: should report every naming and description rule broken at once when a single save breaks them all`, async ({
    networkManagementPage,
    networkIn,
    steps,
    cleanup,
  }) => {
    test.setTimeout(15 * 60_000);
    const name = named(NAMING.allRulesTogether.sheetName);
    let payer = '';
    let report!: SaveReport;

    await steps.critical('Navigate to the module - an Active network with a known name exists under Payer X', async () => {
      await networkManagementPage.openList();
      const form = await networkManagementPage.openAddForm();
      payer = await form.getPayerTag();
      await form.closeAndDiscard();
      const existing = await networkIn('Active', { nameEn: name, payerName: payer });
      expect(await networkManagementPage.readStatus(existing.name)).toBe(NETWORK_LIFECYCLE.active);
    });

    await steps.step('A duplicate name, a blank Arabic name and a non-Arabic description are submitted together', async () => {
      const form = await networkManagementPage.openAddForm();
      await form.fillBasicInformation(buildNetwork({ nameEn: name, descriptionAr: NAMING.allRulesTogether.descriptionAr }), 'nameAr');
      report = await form.attemptNewSave();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.refused, report.text).toBe(true);
    });

    await steps.step('Each broken rule is reported: duplicate name, missing Arabic name, invalid Arabic description', async () => {
      const shown = report.messages.join(' | ');
      expect(shown, 'the duplicate-name error').toMatch(MESSAGE.duplicateName);
      expect(shown, 'the missing-Arabic-name error').toContain(NETWORK_MESSAGE.required);
      expect(shown, 'the Arabic-description error').toMatch(MESSAGE.arabicOnly);
    });
  });
});
