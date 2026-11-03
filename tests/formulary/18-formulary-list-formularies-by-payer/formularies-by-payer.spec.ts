import {
  test,
  expect,
  attemptDetailDelete,
  formularyShape,
  openScopedList,
  sendFormularyListRequest,
  type FormularySession,
} from '../../../utils/formulary/writerAHelpers';
import { attemptEditSave, decisionOfferedTo } from '../../../utils/formulary/writerCHelpers';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { APPROVAL_STATUS } from '../../../data/formulary/formulary.data';
import { BLOCKED_CASES, CASES, DENIED, OUT_OF_SCOPE, SCOPE, sharedTerm } from '../../../data/formulary/formulariesByPayer.data';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { readFormularyOrNull } from '../../../utils/FormularyProvisioning';

/** The payers of the rows the scoped list answers for a search. */
async function payersFound(session: FormularySession, term: string): Promise<{ names: string[]; payers: string[] }> {
  const answer = await session.formularies.searchFor(term);
  return { names: answer.items.map((f) => f.formularyNameEn), payers: [...new Set(answer.items.map((f) => f.payerNameEn))] };
}

/**
 * User story 15215: Formulary list - Formularies by Payer.
 * A payer-scoped user sees only its assigned payers' formularies - in the
 * list, a search, a filter and a direct link - while the system administrator
 * sees every payer's; each formulary action has its own permission. See the
 * data file for who plays which user.
 */
test.describe('US 15215 - Formulary list - Formularies by Payer', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.onlyAssigned.azureId}: should list only the assigned payers' formularies to a payer-scoped user`, async ({
    formularyIn,
    formularySession,
    steps,
  }) => {
    const inScope = await formularyIn('Draft', { payerName: SCOPE.payerA });
    const outOfScope = await formularyIn('Draft');
    const session = await formularySession(formularyShape());

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await openScopedList(session, SCOPE.allMine);
      expect(await session.formularies.isListRendered()).toBe(true);
    });

    await steps.step(`Only formularies of the assigned payers (${SCOPE.assigned.join(', ')}) are displayed`, async () => {
      const shown = (await session.formularies.readRowsOnScreen()).map((r) => r.payer);
      expect(shown.filter((payer) => !SCOPE.assigned.includes(payer)), 'rows of other payers').toEqual([]);
      expect(await session.formularies.isListed(inScope.nameEn), `"${inScope.nameEn}" (${SCOPE.payerA})`).toBe(true);
      expect(await session.formularies.isListed(outOfScope.nameEn), `"${outOfScope.nameEn}" (${SCOPE.outside})`).toBe(false);
    });
  });

  test(`TC-${CASES.otherPayerHidden.azureId}: should return nothing of another payer whether it is searched for by name or used as a filter`, async ({
    formularyIn,
    formularySession,
    steps,
  }) => {
    const outOfScope = await formularyIn('Draft');
    const session = await formularySession(formularyShape());

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await openScopedList(session, SCOPE.allMine);
      expect(await session.formularies.isListRendered()).toBe(true);
    });

    await steps.step(`Search for "${outOfScope.nameEn}" of ${SCOPE.outside} - no matching result is shown`, async () => {
      const found = await payersFound(session, outOfScope.nameEn);
      expect(found.names, 'the out-of-scope formulary').toEqual([]);
    });

    await steps.step(`Filter on ${SCOPE.outside} - no result is returned for the out-of-scope payer`, async () => {
      expect(await session.formularies.scopeTo(SCOPE.outside), `the payer filter must not offer "${SCOPE.outside}"`).toBe(false);
      const tampered = await sendFormularyListRequest(session.page, { payerId: outOfScope.payerId, payerIds: [outOfScope.payerId] });
      expect(tampered.items.filter((f) => f.payerId === outOfScope.payerId).map((f) => f.formularyNameEn), `formularies of ${SCOPE.outside} returned`).toEqual([]);
    });
  });

  test(`TC-${CASES.adminSeesAll.azureId}: should show formularies of every payer to the system administrator`, async ({
    formularyManagementPage,
    formularyIn,
    steps,
  }) => {
    const term = sharedTerm();
    const built = [
      await formularyIn('Draft', { nameEn: `${term} A`, payerName: SCOPE.payerA }),
      await formularyIn('Draft', { nameEn: `${term} B`, payerName: SCOPE.payerB }),
      await formularyIn('Draft', { nameEn: `${term} C` }),
    ];

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await formularyManagementPage.open();
      await formularyManagementPage.scopeTo(SCOPE.allPayers);
    });

    await steps.step('Formularies of all payers in the system are displayed', async () => {
      const answer = await formularyManagementPage.searchFor(term);
      expect(answer.items.map((f) => f.formularyNameEn).sort(), 'the three payers\' formularies').toEqual(built.map((f) => f.nameEn).sort());
      expect(new Set(answer.items.map((f) => f.payerNameEn)), 'their payers').toEqual(new Set([SCOPE.payerA, SCOPE.payerB, SCOPE.outside]));
      expect((await formularyManagementPage.fetchRegister({}, 200)).items.some((f) => !SCOPE.assigned.includes(f.payerNameEn) && f.payerNameEn !== SCOPE.outside), 'other payers\' formularies in the register').toBe(true);
    });
  });

  test(`TC-${CASES.severalPayers.azureId}: should combine the formularies of every assigned payer and exclude the others`, async ({
    formularyIn,
    formularySession,
    steps,
  }) => {
    const term = sharedTerm();
    const a = await formularyIn('Draft', { nameEn: `${term} A`, payerName: SCOPE.payerA });
    const b = await formularyIn('Draft', { nameEn: `${term} B`, payerName: SCOPE.payerB });
    const c = await formularyIn('Draft', { nameEn: `${term} C` });
    const session = await formularySession(formularyShape());

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await openScopedList(session, SCOPE.allMine);
      expect(await session.formularies.isListRendered()).toBe(true);
    });

    await steps.step(`Formularies of both ${SCOPE.payerA} and ${SCOPE.payerB} are displayed and those of ${SCOPE.outside} are excluded`, async () => {
      const found = await payersFound(session, term);
      expect(found.names.sort()).toEqual([a.nameEn, b.nameEn].sort());
      expect(found.names, `"${c.nameEn}" (${SCOPE.outside})`).not.toContain(c.nameEn);
    });
  });

  test(`TC-${CASES.viewNotEdit.azureId}: should show a formulary read-only with no Edit or Delete when the user holds only the view permission`, async ({
    formularyIn,
    formularySession,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { payerName: SCOPE.payerA });
    const session = await formularySession(formularyShape());

    await steps.critical('Navigate to the Formulary Management module - the list shows the assigned payers\' formularies', async () => {
      await openScopedList(session, SCOPE.allMine);
      const payers = (await session.formularies.readRowsOnScreen()).map((r) => r.payer);
      expect(payers.filter((p) => !SCOPE.assigned.includes(p))).toEqual([]);
    });

    await steps.step('Open a formulary record - its details are displayed read-only', async () => {
      await session.detail.open(formulary.id);
      expect(await session.detail.getName()).toBe(formulary.nameEn);
    });

    await steps.step('Edit and Delete are both hidden or disabled', async () => {
      const edit = await session.detail.getActionAvailability('edit');
      const del = await session.detail.getActionAvailability('delete');
      expect({ edit: edit === 'available', delete: del === 'available' }, `withheld: ${session.removed.join(', ')}`).toEqual({ edit: false, delete: false });
    });
  });

  test(`TC-${CASES.approveSeparate.azureId}: should save an editor's change as pending approval without offering that user Approve`, async ({
    formularyIn,
    formularySession,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { payerName: SCOPE.payerA, tiers: 1, trades: 1 });
    const session = await formularySession(formularyShape(['update', 'submit']));

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await openScopedList(session, SCOPE.allMine);
      expect(await session.formularies.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Open a formulary of the assigned payer and submit a change - it is saved as pending approval', async () => {
      await session.detail.open(formulary.id);
      const drawer = await session.detail.openEditDrawer();
      await drawer.type('descriptionEn', CASES.approveSeparate.change);
      // The edit drawer is two steps; Save is on the second (attemptEditSave moves on first).
      expect((await attemptEditSave(drawer)).status, 'the change should save').toBeLessThan(300);
      expect((await session.detail.sendForApproval()).status, 'the change should be sent for approval').toBeLessThan(300);
      await session.detail.open(formulary.id);
      expect(await session.detail.getVersionBadge()).toMatch(new RegExp(`${APPROVAL_STATUS.pending}$`));
    });

    await steps.step('No Approve action is available to this user on the pending change', async () => {
      // A session without the formulary approval right is not offered the Formulary tab at all.
      const offered = await decisionOfferedTo(session.approvals, formulary.nameEn);
      expect(offered.approve, `Approve for a user without the approve permission (Formulary tab offered: ${offered.tab})`).toBe(false);
    });
  });

  test(`TC-${CASES.deleteSeparate.azureId}: should offer and carry out Delete when the user explicitly holds the delete permission`, async ({
    formularyIn,
    formularySession,
    page,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { payerName: SCOPE.payerA });
    const session = await formularySession(formularyShape(['delete']));

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await openScopedList(session, SCOPE.allMine);
      expect(await session.formularies.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Open a formulary of the assigned payer - its details are displayed', async () => {
      await session.detail.open(formulary.id);
      expect(await session.detail.getName()).toBe(formulary.nameEn);
    });

    await steps.step('The Delete action is available and can be invoked', async () => {
      const attempt = await attemptDetailDelete(session.detail);
      expect(attempt.availability).toBe('available');
      expect(attempt.status, attempt.said).toBeLessThan(300);
      expect(attempt.status).toBeGreaterThanOrEqual(200);
      expect(await readFormularyOrNull(page, formulary.id), 'the v0 draft is discarded').toBeNull();
    });
  });

  test(`TC-${CASES.directLink.azureId}: should deny a payer-scoped user another payer's formulary opened by a direct link`, async ({
    formularyIn,
    formularySession,
    steps,
  }) => {
    const outOfScope = await formularyIn('Draft');
    const session = await formularySession(formularyShape());
    let answer = { status: 0, text: '' };

    await steps.critical('Navigate to the Formulary Management module - the list shows only the assigned payers\' formularies', async () => {
      await openScopedList(session, SCOPE.allMine);
      const payers = (await session.formularies.readRowsOnScreen()).map((r) => r.payer);
      expect(payers.filter((p) => !SCOPE.assigned.includes(p))).toEqual([]);
    });

    await steps.step(`Paste a direct link to ${SCOPE.outside}'s formulary - it is detected as outside the user's scope`, async () => {
      answer = await NetworkUtils.postAsSession(session.page, ApiEndpoints.formularyGet, { id: outOfScope.id });
      expect(answer.status, `GetFormulary answered ${answer.status}: ${answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
    });

    await steps.step('Access is denied with a restriction message instead of the formulary details', async () => {
      await session.detail.openExpectingFailure(outOfScope.id);
      expect(await session.detail.isLoaded(), 'the details must not render').toBe(false);
      expect([answer.text, ...(await session.detail.waitForMessages())].join(' | ')).toMatch(OUT_OF_SCOPE);
    });
  });

  test(`TC-${CASES.searchRestricted.azureId}: should keep search, filter and sort results within the assigned payers`, async ({
    formularyIn,
    formularySession,
    steps,
  }) => {
    const term = sharedTerm();
    const inScope = await formularyIn('Draft', { nameEn: `${term} A`, payerName: SCOPE.payerA });
    const outOfScope = await formularyIn('Draft', { nameEn: `${term} B` });
    const session = await formularySession(formularyShape());

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await openScopedList(session, SCOPE.allMine);
      expect(await session.formularies.isListRendered()).toBe(true);
    });

    await steps.step(`Search for "${term}", which matches formularies of both payers - only the assigned payer's appears`, async () => {
      const found = await payersFound(session, term);
      expect(found.names).toEqual([inScope.nameEn]);
      expect(found.names, `"${outOfScope.nameEn}" (${SCOPE.outside})`).not.toContain(outOfScope.nameEn);
    });

    await steps.step('Further filters and sorting keep every result within the assigned payers', async () => {
      const filtered = await session.formularies.filterByStatus(CASES.searchRestricted.status);
      expect([...new Set(filtered.items.map((f) => f.payerNameEn))].filter((p) => !SCOPE.assigned.includes(p)), 'filtered rows of other payers').toEqual([]);
      const sorted = await session.formularies.sortBy('name', 'asc');
      expect([...new Set(sorted.items.map((f) => f.payerNameEn))].filter((p) => !SCOPE.assigned.includes(p)), 'sorted rows of other payers').toEqual([]);
      const criteria = await session.formularies.applyCriteria({ text: term });
      expect(criteria.items.map((f) => f.formularyNameEn), 'the advanced search').not.toContain(outOfScope.nameEn);
    });
  });

  test(`TC-${CASES.mixedPermissions.azureId}: should match each action control to the permissions granted and refuse a withheld action triggered directly`, async ({
    formularyIn,
    formularySession,
    page,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { payerName: SCOPE.payerA });
    const session = await formularySession(formularyShape(['update']));

    await steps.critical('Navigate to the Formulary Management module - the list shows the assigned payer\'s formularies', async () => {
      await openScopedList(session, SCOPE.allMine);
      expect(await session.formularies.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Open a formulary - View and Edit are enabled; Delete and Approve are hidden or disabled', async () => {
      expect((await session.formularies.getActionState(formulary.nameEn, 'view')).availability, 'View').toBe('available');
      expect((await session.formularies.getActionState(formulary.nameEn, 'delete')).availability, 'Delete on the row').not.toBe('available');
      await session.detail.open(formulary.id);
      expect(await session.detail.getActionAvailability('edit'), 'Edit').toBe('available');
      expect(await session.detail.getActionAvailability('delete'), 'Delete').not.toBe('available');
      await session.approvals.open();
      expect((await session.approvals.getDecisionAvailability(formulary.nameEn)).approve, 'Approve').toBe(false);
    });

    await steps.step('Triggering the withheld Delete directly is blocked with a permissions error', async () => {
      const answer = await NetworkUtils.requestAsSession(session.page, 'DELETE', `${ApiEndpoints.formularyDelete}/${formulary.id}`);
      expect(answer.status, `DeleteFormulary answered ${answer.status}: ${answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
      expect(answer.text).toMatch(DENIED);
      expect(await readFormularyOrNull(page, formulary.id)).not.toBeNull();
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
