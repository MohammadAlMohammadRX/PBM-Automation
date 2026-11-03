import { test, expect, type FormularySession } from '../../../utils/formulary/writerCHelpers';
import { MESSAGE } from '../../../data/formulary/formulary.data';
import { ADMIN_NAME, CASES } from '../../../data/formulary/versionHistory.data';
import { approveFormulary, publishFormularyChange, stageTrivialChange } from '../../../utils/FormularyProvisioning';

/**
 * User story 15214: View Formulary - Version History - the cases that need a
 * second account: versions requested by two users (the Payer Admin shaped with
 * the formulary rights sends v1, the administrator v2), and a role without the
 * revert right (the Payer Admin shaped without RevertFormularyVersion). The
 * formularies belong to a payer in the Payer Admin's scope.
 */
test.describe('US 15214 - View Formulary - Version History - roles', () => {
  test.describe.configure({ timeout: 20 * 60_000 });

  test(`TC-${CASES.filterRequester.azureId}: should return only the versions requested by the selected user`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyVersionHistoryTab,
    formularyIn,
    formularyRole,
    requireFormularyListAccess,
    steps,
  }) => {
    const data = CASES.filterRequester;
    const formulary = await formularyIn('Draft', { payerName: data.payerName, tiers: 1, trades: 1 });
    let requester = '';

    await steps.critical('Precondition: versions requested by two users - the Payer Admin sends v1, the administrator v2', async () => {
      const userA = await formularyRole.signIn(data.shape);
      await requireFormularyListAccess(userA);
      await userA.detail.open(formulary.id);
      expect((await userA.detail.sendForApproval()).status).toBe(200);
      await approveFormulary(page, formulary.nameEn);
      await stageTrivialChange(page, formulary.id, formulary.nameEn);
      await publishFormularyChange(page, formulary.id, formulary.nameEn);
      await formularyDetailPage.open(formulary.id);
      await formularyVersionHistoryTab.open();
      const requesters = [...new Set((await formularyVersionHistoryTab.readRows()).map((r) => r.requestedBy))];
      if (requesters.length < 2) {
        steps.blocked(`Needs versions requested by different users; after the Payer Admin sent v1 and the administrator v2 the Requested By `
          + `column still shows only ${JSON.stringify(requesters)} - the version records the creator, not the submitter.`);
      }
      requester = requesters.find((r) => r !== ADMIN_NAME) ?? requesters[0];
      expect(requester).not.toBe('');
    });

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Version History advanced search - its filters include Requested By', async () => {
      await formularyDetailPage.open(formulary.id);
      await formularyVersionHistoryTab.open();
      expect((await formularyVersionHistoryTab.readFilterFields()).keys.some((k) => /request.*by|requester/i.test(k)), 'a Requested By field').toBe(true);
    });

    await steps.step('Select a specific requester and search - only the versions that user requested are listed', async () => {
      const result = await formularyVersionHistoryTab.applyFilter({ requestedBy: requester });
      expect(result.unplaced).toEqual([]);
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows.filter((r) => r.requestedBy !== requester).map((r) => `${r.version} ${r.requestedBy}`)).toEqual([]);
    });
  });

  test(`TC-${CASES.revertPermission.azureId}: should hide Revert and deny a direct revert when the user lacks the revert permission`, async ({
    formularyDetailPage,
    formularyVersionHistoryTab,
    formularyIn,
    formularyRole,
    requireFormularyListAccess,
    requireBaseline,
    steps,
  }) => {
    const data = CASES.revertPermission;
    const formulary = await formularyIn('Active', { payerName: data.payerName });
    let session!: FormularySession;

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await formularyDetailPage.open(formulary.id);
      await formularyVersionHistoryTab.open();
      requireBaseline((await formularyVersionHistoryTab.getRevertAvailability('v1')) === 'available', 'Revert on the superseded v1');
      session = await formularyRole.signIn(data.shape);
      await requireFormularyListAccess(session);
      await session.formularies.open();
      expect(await session.formularies.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Open the Version History tab as the unauthorized user - the table is visible, Revert hidden or disabled on every row', async () => {
      await session.detail.open(formulary.id);
      await session.versions.open();
      const rows = await session.versions.readRows();
      expect(rows.length).toBeGreaterThanOrEqual(2);
      const offered: string[] = [];
      for (const row of rows) if ((await session.versions.getRevertAvailability(row.version)) === 'available') offered.push(row.version);
      expect(offered, 'rows offering Revert').toEqual([]);
    });

    await steps.step('Trigger the revert directly - the system denies it with a permissions error', async () => {
      const answer = await session.versions.revertViaApi(formulary.id, 1);
      expect(answer.status, answer.text.slice(0, 200)).toBeGreaterThanOrEqual(400);
      expect(answer.status === 403 || MESSAGE.denied.test(answer.text), `a permissions error, not ${answer.status} ${answer.text.slice(0, 120)}`).toBe(true);
      expect((await formularyDetailPage.readViaApi(formulary.id)).hasDraft, 'nothing staged').not.toBe(true);
    });
  });
});
