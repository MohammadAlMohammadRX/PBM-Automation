import { test, expect, isListedFor, type FormularySession } from '../../../utils/formulary/writerCHelpers';
import { CASES } from '../../../data/formulary/formularyOverview.data';

/**
 * User story 15218: View Formulary - Overview - who may see it. The user
 * without formulary access is the Payer Admin role shaped with no formulary
 * right (fixture `formularyRole`); the formulary belongs to a payer in that
 * account's scope, so only the permission can hide it. The user WITH the view
 * permission is the administrator.
 */
test.describe('US 15218 - View Formulary - Overview - permission', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.viewPermission.azureId}: should show the formulary details only to a user holding the view permission`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyIn,
    formularyRole,
    steps,
  }) => {
    const data = CASES.viewPermission;
    const formulary = await formularyIn('Draft', { payerName: data.payerName });
    let session!: FormularySession;

    await steps.critical('Navigate to the Formulary Management module - it loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
      session = await formularyRole.signIn(data.shape);
      expect(session.removed).toContain('GetFormulary');
    });

    await steps.step('Log in as a user without formulary view permission and open the formulary - it is not listed, or access is denied', async () => {
      const listed = await isListedFor(session, formulary.nameEn);
      await session.detail.openExpectingFailure(formulary.id);
      expect({ listed, overviewShown: await session.detail.isOverviewShown() }).toEqual({ listed: false, overviewShown: false });
    });

    await steps.step('Log in as a user with formulary view permission and open the same formulary - the Overview loads with full details', async () => {
      await formularyDetailPage.open(formulary.id);
      expect(await formularyDetailPage.isOverviewShown()).toBe(true);
      expect(await formularyDetailPage.readOverviewField('code')).not.toBe('');
    });
  });

  test(`TC-${CASES.noRoleNoView.azureId}: should keep a user without a formulary role from finding or opening a formulary`, async ({
    formularyManagementPage,
    formularyIn,
    formularyRole,
    steps,
  }) => {
    const data = CASES.noRoleNoView;
    const formulary = await formularyIn('Draft', { payerName: data.payerName });
    let session!: FormularySession;

    await steps.critical('Navigate to the Formulary Management module - it loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
      session = await formularyRole.signIn(data.shape);
      expect(session.removed.length).toBeGreaterThan(0);
    });

    await steps.step('Log in as the non-admin user and search for and open the formulary - it is not listed, or access is denied', async () => {
      const listed = await isListedFor(session, formulary.nameEn);
      await session.detail.openExpectingFailure(formulary.id);
      expect({ listed, overviewShown: await session.detail.isOverviewShown() }).toEqual({ listed: false, overviewShown: false });
    });
  });
});
