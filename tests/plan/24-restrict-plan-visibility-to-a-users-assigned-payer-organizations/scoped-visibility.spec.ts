import { test, expect } from '../../../fixtures';
import {
  ALL_PAYERS,
  BLOCKED_CASES,
  CASE,
  EXPORT_PAYER_HEADER,
  MESSAGE_WAIT_MS,
  NOT_FOUND,
  OUT_OF_SCOPE_PAYER,
  SCOPED_ACCOUNT,
  SCOPE_CASE_TIMEOUT_MS,
  itemsOfListAnswer,
  scopedPlanNames,
  sharedPlanTerm,
  tamperedListBody,
} from '../../../data/plans/restrictPlanVisibilityToAssignedPayers.data';

/**
 * User story 14335: Restrict plan visibility to a user's assigned payer organizations.
 * What a payer-scoped user sees of plans in the list, search and export, what a
 * direct link or a tampered filter gives away, and that a global role is not
 * restricted. The payer-scoped user is the configured non-admin account (see the
 * data file for the mapping); out-of-scope plans are the administrator's, built
 * for "Al sharq".
 */
test.describe('US 14335 - Plan visibility limited to assigned payers', () => {
  test(`TC-${CASE.listOnlyAssigned}: should list only the plans of the user's assigned payers when a payer-scoped user opens the plan list`, async ({
    planIn,
    payerFormulary,
    planDetailPage,
    nonAdminSession,
    steps,
  }) => {
    test.setTimeout(SCOPE_CASE_TIMEOUT_MS);
    const formulary = await payerFormulary(SCOPED_ACCOUNT.inScopePayer);
    const inScope = await planIn('Active', { payerName: SCOPED_ACCOUNT.inScopePayer, formularyId: formulary.id });
    const outOfScope = await planIn('Active');
    const plans = nonAdminSession.plans;

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await plans.openListFor(inScope.payerName);
      expect(await plans.isPayerScopeSelectorShown(), 'the list should render under a payer scope').toBe(true);
    });

    await steps.step('The payer-scoped user\'s session starts with an assigned payer in context', async () => {
      expect(SCOPED_ACCOUNT.ownScopes, 'the scope should be one of the account\'s own payers').toContain(await plans.getScopedPayer());
    });

    await steps.step('The plan list loads with rows', async () => {
      const rows = await plans.getPlanRows();
      expect(rows.length, 'the in-scope payer owns at least the case\'s plan').toBeGreaterThan(0);
    });

    await steps.step('Only plans of the assigned payers are listed - none of another payer', async () => {
      const payers = (await plans.getPlanRows()).map((row) => row.payer);
      expect(payers.filter((payer) => !SCOPED_ACCOUNT.payers.includes(payer)), 'rows owned by payers outside the assignment').toEqual([]);
      expect(await plans.isListed(inScope.name), `baseline: "${inScope.name}" of ${inScope.payerName} should be listed`).toBe(true);
      expect((await planDetailPage.requestPlanViaApi(outOfScope.id)).status, 'baseline: the out-of-scope plan exists').toBeLessThan(300);
      expect(await plans.isListed(outOfScope.name), `"${outOfScope.name}" of ${OUT_OF_SCOPE_PAYER} must not be listed`).toBe(false);
    });
  });

  test(`TC-${CASE.searchOnlyAssigned}: should return only the assigned payer's matching plan when a name matching plans of both payers is searched`, async ({
    planIn,
    payerFormulary,
    nonAdminSession,
    steps,
  }) => {
    test.setTimeout(SCOPE_CASE_TIMEOUT_MS);
    const term = sharedPlanTerm();
    const names = scopedPlanNames(term);
    const formulary = await payerFormulary(SCOPED_ACCOUNT.inScopePayer);
    const inScope = await planIn('Active', { nameEn: names.inScope, payerName: SCOPED_ACCOUNT.inScopePayer, formularyId: formulary.id });
    const outOfScope = await planIn('Active', { nameEn: names.outOfScope });
    const plans = nonAdminSession.plans;

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await plans.openListFor(inScope.payerName);
      expect(await plans.getScopedPayer()).toBe(inScope.payerName);
    });

    await steps.step('The payer-scoped user\'s session starts with an assigned payer in context', async () => {
      expect(SCOPED_ACCOUNT.ownScopes).toContain(await plans.getScopedPayer());
    });

    await steps.step(`Searching "${term}" - a name both payers' plans carry - executes`, async () => {
      const request = await plans.captureListRequest(() => plans.search(term));
      expect(JSON.stringify(request), 'the list request should carry the search term').toContain(term);
    });

    await steps.step('Only the assigned payer\'s matching plan is returned', async () => {
      const listed = (await plans.getPlanRows()).map((row) => row.name);
      expect(listed, `"${inScope.name}" (${inScope.payerName}) should be returned`).toContain(inScope.name);
      expect(listed, `"${outOfScope.name}" (${OUT_OF_SCOPE_PAYER}) must not be returned`).not.toContain(outOfScope.name);
    });
  });

  test(`TC-${CASE.exportOnlyAssigned}: should export only the assigned payers' plans when a payer-scoped user exports the plan list`, async ({
    planIn,
    payerFormulary,
    nonAdminSession,
    steps,
  }) => {
    test.setTimeout(SCOPE_CASE_TIMEOUT_MS);
    const formulary = await payerFormulary(SCOPED_ACCOUNT.inScopePayer);
    const inScope = await planIn('Active', { payerName: SCOPED_ACCOUNT.inScopePayer, formularyId: formulary.id });
    const outOfScope = await planIn('Active');
    const plans = nonAdminSession.plans;
    let rows: Record<string, string>[] = [];
    let headers: string[] = [];

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await plans.openListFor(inScope.payerName);
      expect(await plans.getScopedPayer()).toBe(inScope.payerName);
    });

    await steps.step('The payer-scoped user\'s session starts with an assigned payer in context', async () => {
      expect(SCOPED_ACCOUNT.ownScopes).toContain(await plans.getScopedPayer());
    });

    await steps.critical('Exporting the plan list generates a file', async () => {
      const file = await plans.exportAndParse('all', 'csv');
      rows = file.parsed.rows;
      headers = file.parsed.headers;
      expect(rows.length, `the export (${file.filename}) should carry rows`).toBeGreaterThan(0);
    });

    await steps.step('The file holds only the assigned payers\' plans', async () => {
      const payerHeader = headers.find((header) => EXPORT_PAYER_HEADER.test(header));
      expect(payerHeader, `the export should carry a payer column (headers: ${headers.join(', ')})`).toBeDefined();
      const payers = rows.map((row) => row[payerHeader ?? '']);
      expect(payers.filter((payer) => !SCOPED_ACCOUNT.payers.includes(payer)), 'exported rows of payers outside the assignment').toEqual([]);
      expect(JSON.stringify(rows), `baseline: "${inScope.name}" should be exported`).toContain(inScope.name);
      expect(JSON.stringify(rows), `"${outOfScope.name}" of ${OUT_OF_SCOPE_PAYER} must not be exported`).not.toContain(outOfScope.name);
    });
  });

  test(`TC-${CASE.outOfScopeNotFound}: should report the plan as not found rather than forbidden when a payer-scoped user opens another payer's plan directly`, async ({
    planIn,
    planDetailPage,
    nonAdminSession,
    steps,
  }) => {
    test.setTimeout(SCOPE_CASE_TIMEOUT_MS);
    const outOfScope = await planIn('Active');
    const plans = nonAdminSession.plans;
    const detail = nonAdminSession.planDetail;
    let answer = { status: 0, text: '' };

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await plans.open();
      expect(await plans.isPayerScopeSelectorShown(), 'the module should open under a payer scope').toBe(true);
    });

    await steps.step('The payer-scoped user\'s session starts with an assigned payer in context', async () => {
      expect(SCOPED_ACCOUNT.ownScopes).toContain(await plans.getScopedPayer());
    });

    await steps.critical(`Opening ${OUT_OF_SCOPE_PAYER}'s plan by its identifier in the address bar is processed`, async () => {
      expect((await planDetailPage.requestPlanViaApi(outOfScope.id)).status, 'baseline: the administrator can read the plan').toBeLessThan(300);
      await detail.openExpectingFailure(outOfScope.id);
      answer = await detail.requestPlanViaApi(outOfScope.id);
      expect(answer.status, 'the request should be answered, not left hanging').toBeGreaterThan(0);
    });

    await steps.step('The plan is reported as not found, with no hint that it exists under another payer', async () => {
      expect(await detail.isLoaded(MESSAGE_WAIT_MS), 'the out-of-scope plan\'s detail must not render').toBe(false);
      expect(answer.status, `GetPlan answered ${answer.status}: ${answer.text.slice(0, 200)}`).toBe(NOT_FOUND.status);
      expect(answer.text, 'the answer must not read as Forbidden').not.toMatch(NOT_FOUND.forbidden);
      await expect
        .poll(async () => (await detail.readMessages()).join(' '), { timeout: MESSAGE_WAIT_MS, message: 'the screen should say the plan was not found' })
        .toMatch(NOT_FOUND.wording);
      expect((await detail.readMessages()).join(' '), 'the screen must not read as Forbidden').not.toMatch(NOT_FOUND.forbidden);
    });
  });

  test(`TC-${CASE.tamperedFilter}: should keep showing only the assigned payers' plans when the Payer filter is tampered to name another payer`, async ({
    planIn,
    planDetailPage,
    nonAdminSession,
    steps,
  }) => {
    test.setTimeout(SCOPE_CASE_TIMEOUT_MS);
    const outOfScope = await planIn('Active');
    const plans = nonAdminSession.plans;
    let answer = { status: 0, text: '' };
    let foreignPayerId = '';

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await plans.open();
      expect(await plans.isPayerScopeSelectorShown(), 'the module should open under a payer scope').toBe(true);
    });

    await steps.step('The payer-scoped user\'s session starts with an assigned payer in context', async () => {
      expect(SCOPED_ACCOUNT.ownScopes).toContain(await plans.getScopedPayer());
    });

    await steps.critical(`A list request whose payer filter names ${OUT_OF_SCOPE_PAYER} is processed`, async () => {
      foreignPayerId = (await planDetailPage.readRecordViaApi(outOfScope.id)).payerId;
      expect(foreignPayerId, 'the out-of-scope payer\'s id should be known').not.toBe('');
      answer = await plans.sendListRequest(tamperedListBody(foreignPayerId));
      expect(answer.status, `GetPlans answered ${answer.status}: ${answer.text.slice(0, 200)}`).toBeLessThan(500);
    });

    await steps.step('The out-of-scope payer value is ignored or rejected - none of its plans comes back', async () => {
      const leaked = itemsOfListAnswer(answer).filter((item) => String(item.payerId) === foreignPayerId || String(item.planNameEn) === outOfScope.name);
      expect(leaked.map((item) => String(item.planNameEn)), `plans of ${OUT_OF_SCOPE_PAYER} returned to the scoped user`).toEqual([]);
      expect(await plans.isPayerScopeSelectorShown(), 'the module should still show the user\'s own scope').toBe(true);
      expect(SCOPED_ACCOUNT.ownScopes, 'the scope must not have moved to the tampered payer').toContain(await plans.getScopedPayer());
    });
  });

  test(`TC-${CASE.globalAdminSeesAll}: should show plans of every payer and open any of them when the user holds a global administrator role`, async ({
    planIn,
    payerFormulary,
    planManagementPage,
    planDetailPage,
    steps,
  }) => {
    test.setTimeout(SCOPE_CASE_TIMEOUT_MS);
    const term = sharedPlanTerm();
    const names = scopedPlanNames(term);
    const formulary = await payerFormulary(SCOPED_ACCOUNT.inScopePayer);
    const first = await planIn('Active', { nameEn: names.inScope, payerName: SCOPED_ACCOUNT.inScopePayer, formularyId: formulary.id });
    const second = await planIn('Active', { nameEn: names.outOfScope });

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openList();
      expect(await planManagementPage.isPayerScopeSelectorShown(), 'the administrator\'s list should render').toBe(true);
    });

    await steps.critical('The administrator\'s session is not restricted to a payer', async () => {
      expect(await planManagementPage.openListFor(ALL_PAYERS), `the administrator should be offered "${ALL_PAYERS}"`).toBe(true);
    });

    await steps.step('The list, a search and an export each show plans of both payers', async () => {
      await planManagementPage.search(term);
      const rows = await planManagementPage.getPlanRows();
      expect(rows.map((row) => row.name), 'the search should return both payers\' plans').toEqual(expect.arrayContaining([first.name, second.name]));
      expect(new Set(rows.map((row) => row.payer)), 'the rows should span both payers').toEqual(new Set([first.payerName, second.payerName]));
      const file = await planManagementPage.exportAndParse('all', 'csv');
      expect(JSON.stringify(file.parsed.rows), 'the export should carry both payers\' plans').toContain(first.name);
      expect(JSON.stringify(file.parsed.rows)).toContain(second.name);
    });

    await steps.step('A plan of any payer opens normally', async () => {
      await planDetailPage.open(first.id);
      expect(await planDetailPage.getName()).toBe(first.name);
      await planDetailPage.open(second.id);
      expect(await planDetailPage.getName()).toBe(second.name);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
