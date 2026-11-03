import { test, expect, controlAvailability, tierImportFile, type FormularySession } from '../../../utils/formulary/writerCHelpers';
import { downloadImportResult, failedResultRows, resultError, startImport, tradeImportFile, waitForOperation } from '../../../utils/formulary/writerAHelpers';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { FORMULARY_TIERS, FORMULARY_TRADES } from '../../../constants/ElementIds';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { MESSAGE, TOAST_TEXT, formularyDateText } from '../../../data/formulary/formulary.data';
import { CASES, SCOPED_PAYER } from '../../../data/formulary/formularyPermissions.data';
import { readPriceHistory, readTiers, readTrades, updatePricingPeriod, updateTier } from '../../../utils/FormularyProvisioning';

/** A direct request refused for want of the right. */
const refused = (answer: { status: number; text: string }): boolean => answer.status === 401 || answer.status === 403 || (answer.status >= 400 && MESSAGE.denied.test(answer.text));
const NOT_AVAILABLE = expect.not.stringMatching(/^available$/);

/**
 * User story 18525: Formulary Permissions - the view tabs (Tiers, Trades &
 * Pricing, Version History, Audit History) and the Tiers / Trades & Pricing
 * sub-permissions (Add/Edit/Delete, Import, Export), each granted or withheld
 * on its own. The Payer Admin role is shaped per case (fixture `formularyRole`);
 * every formulary belongs to a payer in that account's scope.
 */
test.describe('US 18525 - Formulary Permissions - tabs and sub-permissions', () => {
  test.describe.configure({ timeout: 20 * 60_000 });

  test(`TC-${CASES.tiersTabOnly.azureId}: should show only the Tiers tab when it is the only tab permission granted`, async ({
    formularyIn,
    formularyRole,
    requireFormularyListAccess,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { payerName: SCOPED_PAYER, tiers: 1, trades: 1 });
    let session!: FormularySession;

    await steps.critical('Navigate to the Formulary Management module - the landing page loads', async () => {
      session = await formularyRole.signIn(CASES.tiersTabOnly.shape);
      await requireFormularyListAccess(session);
      await session.formularies.open();
      expect(await session.formularies.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open an existing formulary record - the detail page loads', async () => {
      await session.detail.open(formulary.id);
      expect(await session.detail.getName()).toBe(formulary.nameEn);
    });

    await steps.step('Review the tabs - only Tiers is displayed; Trades & Pricing, Version History and Audit History are not', async () => {
      expect((await session.detail.readOfferedTabs()).filter((tab) => tab !== 'overview')).toEqual(['tiers']);
    });

    await steps.step('Select the Tiers tab - its content loads', async () => {
      await session.tiers.open();
      expect(await session.tiers.countCards()).toBe(formulary.tiers.length);
    });
  });

  test(`TC-${CASES.tradesNotVersions.azureId}: should show Trades & Pricing but not Version History when only the former is granted`, async ({
    formularyIn,
    formularyRole,
    requireFormularyListAccess,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { payerName: SCOPED_PAYER, tiers: 1, trades: 1 });
    let session!: FormularySession;

    await steps.critical('Navigate to the Formulary Management module - the landing page loads', async () => {
      session = await formularyRole.signIn(CASES.tradesNotVersions.shape);
      await requireFormularyListAccess(session);
      await session.formularies.open();
      expect(await session.formularies.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open an existing formulary record - the detail page loads', async () => {
      await session.detail.open(formulary.id);
      expect(await session.detail.getName()).toBe(formulary.nameEn);
    });

    await steps.step('Review the tabs - Trades & Pricing is visible, Version History is not', async () => {
      expect({ trades: await session.detail.hasTab('trades'), versions: await session.detail.hasTab('versions') }).toEqual({ trades: true, versions: false });
    });

    await steps.step('Reach Version History by a direct link - access is denied and its content is not displayed', async () => {
      const readable = await session.versions.fetchVersions(formulary.id).then(() => true, () => false);
      expect(readable, 'the version history answered this user').toBe(false);
    });
  });

  test(`TC-${CASES.tierManagement.azureId}: should let a user with the Tiers Add/Edit/Delete permission add, edit and delete tiers`, async ({
    page,
    formularyIn,
    formularyRole,
    requireFormularyListAccess,
    steps,
  }) => {
    const data = CASES.tierManagement;
    const formulary = await formularyIn('Draft', { payerName: SCOPED_PAYER, tiers: 1, trades: 1 });
    let session!: FormularySession;
    let tierId = '';

    await steps.critical('Navigate to the Formulary Management module - the landing page loads', async () => {
      session = await formularyRole.signIn(data.shape);
      await requireFormularyListAccess(session);
      await session.formularies.open();
      expect(await session.formularies.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the formulary and select the Tiers tab - the tiers show with Add, Edit and Delete enabled', async () => {
      await session.detail.open(formulary.id);
      await session.tiers.open();
      const existing = formulary.tiers[0].id;
      expect({
        add: await session.tiers.isAddOffered(),
        edit: await session.tiers.getCardActionAvailability(existing, 'edit'),
        delete: await session.tiers.getCardActionAvailability(existing, 'delete'),
      }).toEqual({ add: 'available', edit: 'available', delete: 'available' });
    });

    await steps.critical('Add a new tier with valid details and save - it appears with a success confirmation', async () => {
      const drawer = await session.tiers.openAdd();
      await drawer.fill(data.newTier);
      const answer = await drawer.attemptSave();
      expect(answer.status, answer.messages.join(' | ')).toBe(200);
      expect(answer.messages.join(' | ')).toMatch(TOAST_TEXT.tierCreated);
      tierId = await session.tiers.tierIdByName(data.newTier.nameEn);
      expect(tierId).not.toBe('');
    });

    await steps.step('Edit the new tier\'s coverage and save - the updated value is shown', async () => {
      const drawer = await session.tiers.openEdit(tierId);
      await drawer.type('coverage', data.editedCoverage);
      expect((await drawer.attemptSave()).status).toBe(200);
      expect((await readTiers(page, formulary.id)).find((t) => t.id === tierId)?.defaultCoveragePercentage).toBe(data.editedCoverage);
      expect((await session.tiers.readCard(tierId)).coverage).toContain(String(data.editedCoverage));
    });

    await steps.step('Delete the new tier and confirm - it is removed with a success confirmation', async () => {
      const outcome = await session.tiers.deleteTier(tierId);
      expect(outcome.status, outcome.text.slice(0, 200)).toBe(200);
      // The create / update toasts were still up when the messages were first read (2026-11-03): wait for the delete one.
      const said = outcome.messages.join(' | ');
      await expect.poll(async () => `${said} | ${(await session.tiers.waitForMessages()).join(' | ')}`, { message: 'the deletion confirmation' }).toMatch(TOAST_TEXT.tierDeleted);
      expect((await readTiers(page, formulary.id)).map((t) => t.id)).not.toContain(tierId);
    });
  });

  test(`TC-${CASES.auditTabOnly.azureId}: should show only the Audit History tab when it is the only tab permission granted`, async ({
    formularyIn,
    formularyRole,
    requireFormularyListAccess,
    steps,
  }) => {
    const formulary = await formularyIn('Future', { payerName: SCOPED_PAYER });
    let session!: FormularySession;

    await steps.critical('Navigate to the Formulary Management module - the landing page loads', async () => {
      session = await formularyRole.signIn(CASES.auditTabOnly.shape);
      await requireFormularyListAccess(session);
      await session.formularies.open();
      expect(await session.formularies.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open an existing formulary record - the detail page loads', async () => {
      await session.detail.open(formulary.id);
      expect(await session.detail.getName()).toBe(formulary.nameEn);
    });

    await steps.step('Review the tabs - only Audit History is shown; Tiers, Trades & Pricing and Version History are absent', async () => {
      expect((await session.detail.readOfferedTabs()).filter((tab) => tab !== 'overview')).toEqual(['audit']);
    });

    await steps.step('Select the Audit History tab - the formulary\'s audit entries are displayed', async () => {
      await session.audit.open();
      expect((await session.audit.readEntries()).length).toBeGreaterThan(0);
    });
  });

  test(`TC-${CASES.tiersReadOnly.azureId}: should keep tiers read-only and reject a direct edit when the Tiers Add/Edit/Delete permission is withheld`, async ({
    page,
    formularyIn,
    formularyRole,
    requireFormularyListAccess,
    steps,
  }) => {
    const data = CASES.tiersReadOnly;
    const formulary = await formularyIn('Draft', { payerName: SCOPED_PAYER, tiers: 1, trades: 1 });
    const tier = formulary.tiers[0];
    let session!: FormularySession;

    await steps.critical('Navigate to the Formulary Management module - the landing page loads', async () => {
      session = await formularyRole.signIn(data.shape);
      await requireFormularyListAccess(session);
      await session.formularies.open();
      expect(await session.formularies.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the formulary and select the Tiers tab - the existing tiers show read-only', async () => {
      await session.detail.open(formulary.id);
      await session.tiers.open();
      expect(await session.tiers.countCards()).toBe(1);
    });

    await steps.step('Verify the Add, Edit and Delete controls - they are hidden or disabled', async () => {
      expect({
        add: await session.tiers.isAddOffered(),
        edit: await session.tiers.getCardActionAvailability(tier.id, 'edit'),
        delete: await session.tiers.getCardActionAvailability(tier.id, 'delete'),
      }).toEqual({ add: NOT_AVAILABLE, edit: NOT_AVAILABLE, delete: NOT_AVAILABLE });
    });

    await steps.step('Submit an edit directly, bypassing the screen - it is rejected and the tier is unchanged', async () => {
      const answer = await updateTier(session.page, formulary.id, tier.id, { coverage: data.editedCoverage });
      expect(refused(answer), `answered ${answer.status} ${answer.text.slice(0, 200)}`).toBe(true);
      expect((await readTiers(page, formulary.id)).find((t) => t.id === tier.id)?.defaultCoveragePercentage).toBe(tier.defaultCoveragePercentage);
    });
  });

  test(`TC-${CASES.tierExport.azureId}: should offer the tiers Export according to the Tiers Export permission alone`, async ({
    formularyIn,
    formularyRole,
    requireFormularyListAccess,
    steps,
  }) => {
    const data = CASES.tierExport;
    const formulary = await formularyIn('Draft', { payerName: SCOPED_PAYER, tiers: 1, trades: 1 });
    let session!: FormularySession;

    await steps.critical('Navigate to the Formulary Management module - the landing page loads', async () => {
      session = await formularyRole.signIn(data.without);
      await requireFormularyListAccess(session);
      await session.formularies.open();
      expect(await session.formularies.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the formulary and select the Tiers tab - the existing tiers are shown', async () => {
      await session.detail.open(formulary.id);
      await session.tiers.open();
      expect(await session.tiers.countCards()).toBe(1);
    });

    await steps.step('Check for an Export control on the Tiers tab - it is hidden or disabled', async () => {
      expect(await controlAvailability(session.page, FORMULARY_TIERS.export.trigger)).not.toBe('available');
    });

    await steps.critical('Grant the Tiers Export permission, log back in and reopen the Tiers tab - Export is visible and enabled', async () => {
      session = await formularyRole.signIn(data.withExport);
      await session.detail.open(formulary.id);
      await session.tiers.open();
      expect(await controlAvailability(session.page, FORMULARY_TIERS.export.trigger)).toBe('available');
    });

    await steps.step('Trigger the export - a tier data file is generated', async () => {
      const file = await session.tiers.export('csv');
      expect(file.filename).not.toBe('');
      expect(file.parsed.rows.length).toBeGreaterThanOrEqual(1);
    });
  });

  test(`TC-${CASES.tierImport.azureId}: should offer the tiers Import according to the import permission and import a valid file once granted`, async ({
    page,
    formularyIn,
    formularyRole,
    requireFormularyListAccess,
    steps,
  }) => {
    const data = CASES.tierImport;
    const formulary = await formularyIn('Draft', { payerName: SCOPED_PAYER, tiers: 1, trades: 1 });
    let session!: FormularySession;

    await steps.critical('Navigate to the Formulary Management module - the landing page loads', async () => {
      session = await formularyRole.signIn(data.without);
      await requireFormularyListAccess(session);
      await session.formularies.open();
      expect(await session.formularies.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the formulary and select the Tiers tab - the existing tiers are shown', async () => {
      await session.detail.open(formulary.id);
      await session.tiers.open();
      expect(await session.tiers.countCards()).toBe(1);
    });

    await steps.step('Check for an Import control on the Tiers tab - it is hidden or disabled', async () => {
      expect(await controlAvailability(session.page, FORMULARY_TIERS.importTrigger)).not.toBe('available');
    });

    await steps.critical('Grant the Import permission, log back in and reopen the Tiers tab - Import is visible and enabled', async () => {
      session = await formularyRole.signIn(data.withImport);
      await session.detail.open(formulary.id);
      await session.tiers.open();
      expect(await controlAvailability(session.page, FORMULARY_TIERS.importTrigger)).toBe('available');
    });

    await steps.step('Import a valid tier file - the tiers are imported and a confirmation is shown', async () => {
      const dialog = await session.tiers.openImport();
      const answer = await dialog.addFile(tierImportFile([data.importedTier]));
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
      expect(answer.messages.length, 'a confirmation message').toBeGreaterThan(0);
      expect((await readTiers(page, formulary.id)).map((t) => t.tierNameEn)).toContain(data.importedTier[0]);
    });
  });

  test(`TC-${CASES.tradeManagement.azureId}: should let a user with the Trades & Pricing Add/Edit/Delete permission add, reprice and remove trades`, async ({
    page,
    formularyIn,
    formularyRole,
    requireFormularyListAccess,
    steps,
  }) => {
    const data = CASES.tradeManagement;
    const formulary = await formularyIn('Draft', { payerName: SCOPED_PAYER, tiers: 1, trades: 1 });
    const existing = formulary.trades[0].id;
    let session!: FormularySession;
    let added = '';

    await steps.critical('Navigate to the Formulary Management module - the landing page loads', async () => {
      session = await formularyRole.signIn(data.shape);
      await requireFormularyListAccess(session);
      await session.formularies.open();
      expect(await session.formularies.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the formulary and select the Trades & Pricing tab - the records show with Add, Edit and Delete enabled', async () => {
      await session.detail.open(formulary.id);
      await session.trades.open();
      expect({
        add: await session.trades.isAddOffered(),
        price: await session.trades.getCardActionAvailability(existing, 'priceHistory'),
        remove: await session.trades.getCardActionAvailability(existing, 'remove'),
      }).toEqual({ add: 'available', price: 'available', remove: 'available' });
    });

    await steps.critical('Add a new trade / pricing record with valid details and save - it appears with a success confirmation', async () => {
      const drawer = await session.trades.openAdd();
      await drawer.fill({
        trade: data.addedTrade,
        tier: formulary.tiers[0].tierNameEn,
        supplierPrice: 9,
        vat: 0,
        effectiveFrom: formularyDateText(formulary.effectiveDate),
        effectiveTo: formularyDateText(formulary.expiryDate),
      });
      const answer = await drawer.attemptSave();
      expect(answer.status, answer.messages.join(' | ')).toBe(200);
      expect(answer.messages.join(' | ')).toMatch(TOAST_TEXT.tradeAdded);
      added = (await readTrades(page, formulary.id)).find((t) => t.tradeCode === data.addedTrade)?.id ?? '';
      expect(added).not.toBe('');
    });

    await steps.step('Edit the price of the new record and save - the updated value is shown', async () => {
      const period = (await readPriceHistory(page, added))[0];
      await session.detail.open(formulary.id);
      await session.trades.open();
      const drawer = await session.trades.openPriceHistory(added);
      await drawer.openEditRecord(period.id);
      await drawer.typeRecord('supplierPrice', data.editedSupplierPrice);
      expect((await drawer.attemptSave()).status).toBe(200);
      expect((await readPriceHistory(page, added)).find((p) => p.id === period.id)?.supplierPrice).toBe(data.editedSupplierPrice);
    });

    await steps.step('Delete the new record and confirm - it is removed with a success confirmation', async () => {
      await session.detail.open(formulary.id);
      await session.trades.open();
      const outcome = await session.trades.removeTrade(added);
      expect(outcome.status, outcome.text.slice(0, 200)).toBe(200);
      expect(outcome.messages.join(' | ')).toMatch(TOAST_TEXT.tradeRemoved);
      expect((await readTrades(page, formulary.id)).map((t) => t.id)).not.toContain(added);
    });
  });

  test(`TC-${CASES.tradesReadOnly.azureId}: should keep trades read-only and reject a direct edit when the Trades & Pricing Add/Edit/Delete permission is withheld`, async ({
    page,
    formularyIn,
    formularyRole,
    requireFormularyListAccess,
    steps,
  }) => {
    const data = CASES.tradesReadOnly;
    const formulary = await formularyIn('Draft', { payerName: SCOPED_PAYER, tiers: 1, trades: 1 });
    const tradeId = formulary.trades[0].id;
    let session!: FormularySession;

    await steps.critical('Navigate to the Formulary Management module - the landing page loads', async () => {
      session = await formularyRole.signIn(data.shape);
      await requireFormularyListAccess(session);
      await session.formularies.open();
      expect(await session.formularies.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the formulary and select the Trades & Pricing tab - the records show read-only', async () => {
      await session.detail.open(formulary.id);
      await session.trades.open();
      expect(await session.trades.countCards()).toBe(1);
    });

    await steps.step('Verify the Add, Edit and Delete controls - they are hidden or disabled', async () => {
      expect({
        add: await session.trades.isAddOffered(),
        status: await session.trades.getCardActionAvailability(tradeId, 'toggleStatus'),
        remove: await session.trades.getCardActionAvailability(tradeId, 'remove'),
      }).toEqual({ add: NOT_AVAILABLE, status: NOT_AVAILABLE, remove: NOT_AVAILABLE });
    });

    await steps.step('Submit an edit directly, bypassing the screen - it is rejected and the record is unchanged', async () => {
      const period = (await readPriceHistory(page, tradeId))[0];
      const answer = await updatePricingPeriod(session.page, tradeId, period.id, { supplierPrice: data.editedSupplierPrice });
      expect(refused(answer), `answered ${answer.status} ${answer.text.slice(0, 200)}`).toBe(true);
      expect((await readPriceHistory(page, tradeId)).find((p) => p.id === period.id)?.supplierPrice).toBe(period.supplierPrice);
    });
  });

  test(`TC-${CASES.tradeImportNotExport.azureId}: should let Trades & Pricing Import and Export follow their own permissions`, async ({
    page,
    formularyDetailPage,
    formularyTradesTab,
    formularyIn,
    formularyRole,
    requireFormularyListAccess,
    steps,
  }) => {
    const data = CASES.tradeImportNotExport;
    const formulary = await formularyIn('Draft', { payerName: SCOPED_PAYER, tiers: 1, trades: 1 });
    let session!: FormularySession;
    let template: Buffer = Buffer.alloc(0);

    await steps.critical('Navigate to the Formulary Management module - the landing page loads', async () => {
      await formularyDetailPage.open(formulary.id);
      await formularyTradesTab.open();
      template = (await formularyTradesTab.export('template')).bytes;
      session = await formularyRole.signIn(data.shape);
      await requireFormularyListAccess(session);
      await session.formularies.open();
      expect(await session.formularies.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the formulary and select the Trades & Pricing tab - the existing records are shown', async () => {
      await session.detail.open(formulary.id);
      await session.trades.open();
      expect(await session.trades.countCards()).toBe(1);
    });

    await steps.step('Check the Import control - it is visible and enabled, and importing a valid file succeeds with a confirmation', async () => {
      expect(await controlAvailability(session.page, FORMULARY_TRADES.importTrigger)).toBe('available');
      const dialog = await session.trades.openImport();
      // On the template's own pages (Trades & Pricing, Price History, Benefit
      // Configurations): a one-sheet file was refused for its "Sheet1" (2026-11-03).
      const file = tradeImportFile(template, [{ tradeCode: data.importedTrade, tier: String(formulary.tiers[0].tierOrder), from: new Date(formulary.effectiveDate), to: new Date(formulary.expiryDate) }]);
      const answer = await startImport(dialog, file);
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
      // The import runs in the background: its job is waited for, and a refused row says why.
      const { operation } = await waitForOperation(session.page, answer.operationId);
      const result = operation.failedRows > 0 ? await downloadImportResult(session.page, answer.operationId) : null;
      const reasons = result ? failedResultRows(result.parsed).map((r) => resultError(result.parsed, r)) : [];
      expect((await readTrades(page, formulary.id)).map((t) => t.tradeCode), `job ${operation.status}; rows: ${reasons.join(' | ')}`).toContain(data.importedTrade);
    });

    await steps.step('Check the Export control - it is hidden or disabled, and a direct export is rejected', async () => {
      await session.detail.open(formulary.id);
      await session.trades.open();
      expect(await controlAvailability(session.page, FORMULARY_TRADES.export.trigger)).not.toBe('available');
      const answer = await NetworkUtils.postAsSession(session.page, ApiEndpoints.formularyExportTrades, { formularyId: formulary.id });
      expect(refused(answer), `answered ${answer.status} ${answer.text.slice(0, 200)}`).toBe(true);
    });
  });
});
