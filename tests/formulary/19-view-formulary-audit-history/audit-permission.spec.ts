import { test, expect, type FormularySession } from '../../../utils/formulary/writerCHelpers';
import { CASES, GENERAL_TABS } from '../../../data/formulary/auditHistory.data';

/**
 * User story 15216: View Formulary - Audit History - the dedicated permission.
 * The Payer Admin role is shaped with or without GetFormularyAuditTrail
 * (fixture `formularyRole`); the formulary belongs to a payer in its scope and
 * is published (Future), so it has audit entries to show or withhold.
 */
test.describe('US 15216 - View Formulary - Audit History - permission', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.permissionGate.azureId}: should open the audit trail only for the user holding the Audit History permission`, async ({
    formularyDetailPage,
    formularyAuditTab,
    formularyIn,
    formularyRole,
    requireFormularyListAccess,
    requireBaseline,
    steps,
  }) => {
    const data = CASES.permissionGate;
    const formulary = await formularyIn('Future', { payerName: data.payerName });
    let session!: FormularySession;

    await steps.critical('Navigate to the Formulary Management module - it loads', async () => {
      await formularyDetailPage.open(formulary.id);
      await formularyAuditTab.open();
      requireBaseline((await formularyAuditTab.readEntries()).length > 0, 'audit entries on the formulary');
      session = await formularyRole.signIn(data.without);
      await requireFormularyListAccess(session);
      await session.formularies.open();
      expect(await session.formularies.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Log in as a user without the Audit History permission and open a formulary - the details page opens', async () => {
      await session.detail.open(formulary.id);
      expect(await session.detail.getName()).toBe(formulary.nameEn);
    });

    await steps.step('Attempt to select the Audit History tab - it is hidden, or access is denied', async () => {
      const offered = await session.detail.hasTab('audit');
      if (offered) await session.audit.open().catch(() => undefined);
      const shown = offered ? (await session.audit.readEntries()).length : 0;
      expect({ entriesShown: shown, trailReadable: await session.audit.canReadTrail(formulary.id) }).toEqual({ entriesShown: 0, trailReadable: false });
    });

    await steps.critical('Log in as a user with the Audit History permission and open the same formulary - the details page opens', async () => {
      session = await formularyRole.signIn(data.with);
      await session.detail.open(formulary.id);
      expect(await session.detail.getName()).toBe(formulary.nameEn);
    });

    await steps.step('Select the Audit History tab - it is accessible and the audit list is displayed', async () => {
      expect(await session.detail.hasTab('audit')).toBe(true);
      await session.audit.open();
      expect((await session.audit.readEntries()).length).toBeGreaterThan(0);
    });
  });

  test(`TC-${CASES.directUrl.azureId}: should expose no audit data when a user without the permission opens the audit history directly`, async ({
    formularyIn,
    formularyRole,
    requireFormularyListAccess,
    steps,
  }) => {
    const data = CASES.directUrl;
    const formulary = await formularyIn('Future', { payerName: data.payerName });
    let session!: FormularySession;

    await steps.critical('Navigate to the Formulary Management module - it loads', async () => {
      session = await formularyRole.signIn(data.shape);
      await requireFormularyListAccess(session);
      await session.formularies.open();
      expect(await session.formularies.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Open the Audit History page directly by its link without the permission - access is blocked', async () => {
      await session.detail.openExpectingFailure(formulary.id);
      const offered = await session.detail.hasTab('audit');
      if (offered) await session.audit.open().catch(() => undefined);
      expect(offered ? (await session.audit.readEntries()).length : 0, 'audit entries shown').toBe(0);
    });

    await steps.step('Observe the response - access is denied or redirected and no audit data is exposed', async () => {
      expect(await session.audit.canReadTrail(formulary.id), 'the audit trail answered this user').toBe(false);
    });
  });

  test(`TC-${CASES.noAuditTab.azureId}: should hide the Audit History tab from a role holding the other formulary rights but not the audit permission`, async ({
    formularyDetailPage,
    formularyIn,
    formularyRole,
    requireFormularyListAccess,
    requireBaseline,
    steps,
  }) => {
    const data = CASES.noAuditTab;
    const formulary = await formularyIn('Future', { payerName: data.payerName });
    let session!: FormularySession;

    await steps.critical('Navigate to the Formulary Management module - it loads', async () => {
      await formularyDetailPage.open(formulary.id);
      requireBaseline(await formularyDetailPage.hasTab('audit'), 'the Audit History tab');
      session = await formularyRole.signIn(data.shape);
      await requireFormularyListAccess(session);
      expect(session.removed).toContain('GetFormularyAuditTrail');
    });

    await steps.critical('Log in as the Admin user without the Audit History permission - the module loads', async () => {
      await session.formularies.open();
      expect(await session.formularies.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Open any formulary\'s details page - it shows Overview, Tiers, Trades & Pricing and Version History', async () => {
      await session.detail.open(formulary.id);
      const tabs = await session.detail.readOfferedTabs();
      expect(tabs).toEqual(expect.arrayContaining([...GENERAL_TABS]));
    });

    await steps.step('Check for the Audit History tab - it is not visible or disabled', async () => {
      expect(await session.detail.hasTab('audit')).toBe(false);
    });
  });
});
