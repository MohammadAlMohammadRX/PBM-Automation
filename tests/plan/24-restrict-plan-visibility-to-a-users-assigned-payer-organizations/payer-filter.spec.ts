import { test, expect } from '../../../fixtures';
import {
  CASE,
  EXPORT_PAYER_HEADER,
  OUT_OF_SCOPE_PAYER,
  SCOPED_ACCOUNT,
  SCOPE_CASE_TIMEOUT_MS,
} from '../../../data/plans/restrictPlanVisibilityToAssignedPayers.data';

/**
 * User story 14335: Restrict plan visibility to a user's assigned payer organizations.
 * The Payer filter a multi-payer scoped user gets - the top-bar payer selector
 * (see the data file) - what it offers, what choosing a payer does to the list,
 * and what an export taken under it carries.
 */
test.describe('US 14335 - The Payer filter of a multi-payer scoped user', () => {
  test(`TC-${CASE.payerFilterShown}: should offer a Payer filter of only the assigned payers that narrows the list when a user with several payers opens the directory`, async ({
    planIn,
    payerFormulary,
    nonAdminSession,
    steps,
  }) => {
    test.setTimeout(SCOPE_CASE_TIMEOUT_MS);
    const formulary = await payerFormulary(SCOPED_ACCOUNT.inScopePayer);
    const plan = await planIn('Active', { payerName: SCOPED_ACCOUNT.inScopePayer, formularyId: formulary.id });
    const plans = nonAdminSession.plans;

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await plans.open();
      expect(await plans.getScopedPayer(), 'the module should open under a payer').not.toBe('');
    });

    await steps.step('The multi-payer user\'s session starts with an assigned payer in context', async () => {
      expect(SCOPED_ACCOUNT.ownScopes).toContain(await plans.getScopedPayer());
    });

    await steps.step('The directory offers a Payer filter', async () => {
      expect(await plans.isPayerScopeSelectorShown(), 'the Payer filter should be displayed').toBe(true);
    });

    await steps.step('The Payer filter lists only the user\'s assigned payers', async () => {
      expect([...(await plans.getScopeOptions())].sort()).toEqual([...SCOPED_ACCOUNT.payers].sort());
    });

    await steps.step(`Selecting "${plan.payerName}" narrows the list to that payer's plans`, async () => {
      expect(await plans.openListFor(plan.payerName), `the filter should accept "${plan.payerName}"`).toBe(true);
      const payers = (await plans.getPlanRows()).map((row) => row.payer);
      expect(payers.filter((payer) => payer !== plan.payerName), `rows not owned by ${plan.payerName}`).toEqual([]);
      expect(await plans.isListed(plan.name), `"${plan.name}" should be listed under its payer`).toBe(true);
    });
  });

  test(`TC-${CASE.payerFilterOptions}: should list exactly the assigned payers in the Payer filter on the directory, search and export when other payers exist`, async ({
    planIn,
    payerFormulary,
    planManagementPage,
    nonAdminSession,
    steps,
  }) => {
    test.setTimeout(SCOPE_CASE_TIMEOUT_MS);
    // An in-scope plan, so the list renders a table to search and export from.
    const formulary = await payerFormulary(SCOPED_ACCOUNT.inScopePayer);
    const plan = await planIn('Active', { payerName: SCOPED_ACCOUNT.inScopePayer, formularyId: formulary.id });
    const plans = nonAdminSession.plans;
    const offered: Record<'directory' | 'search' | 'export', string[]> = { directory: [], search: [], export: [] };

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await plans.openListFor(plan.payerName);
      expect(await plans.isPayerScopeSelectorShown()).toBe(true);
    });

    await steps.step('The multi-payer user\'s session starts with an assigned payer in context', async () => {
      expect(SCOPED_ACCOUNT.ownScopes).toContain(await plans.getScopedPayer());
    });

    await steps.step('Opening the Payer filter on the directory lists its options', async () => {
      offered.directory = await plans.getScopeOptions();
      expect(offered.directory.length, 'the filter should offer payers').toBeGreaterThan(0);
    });

    await steps.step('The filter lists its options on the search and the export screens too', async () => {
      await plans.search(plan.name);
      offered.search = await plans.getScopeOptions();
      await plans.openListFor(plan.payerName);
      const file = await plans.exportAndParse('all', 'csv');
      expect(file.parsed.headers.length, 'the export should have produced a file').toBeGreaterThan(0);
      offered.export = await plans.getScopeOptions();
      expect(offered.search.length).toBeGreaterThan(0);
      expect(offered.export.length).toBeGreaterThan(0);
    });

    await steps.step('Every screen lists exactly the assigned payers and nothing more', async () => {
      await planManagementPage.openList();
      expect(await planManagementPage.scopeTo(OUT_OF_SCOPE_PAYER), `baseline: "${OUT_OF_SCOPE_PAYER}" exists and the administrator can choose it`).toBe(true);
      const assigned = [...SCOPED_ACCOUNT.payers].sort();
      expect([...offered.directory].sort(), 'directory').toEqual(assigned);
      expect([...offered.search].sort(), 'search').toEqual(assigned);
      expect([...offered.export].sort(), 'export').toEqual(assigned);
    });
  });

  test(`TC-${CASE.exportFiltered}: should export only the selected payer's plans when a multi-payer user exports with the Payer filter applied`, async ({
    planIn,
    payerFormulary,
    nonAdminSession,
    steps,
  }) => {
    test.setTimeout(SCOPE_CASE_TIMEOUT_MS);
    const formulary = await payerFormulary(SCOPED_ACCOUNT.inScopePayer);
    const plan = await planIn('Active', { payerName: SCOPED_ACCOUNT.inScopePayer, formularyId: formulary.id });
    const plans = nonAdminSession.plans;
    let rows: Record<string, string>[] = [];
    let headers: string[] = [];

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await plans.open();
      expect(await plans.isPayerScopeSelectorShown(), 'the module should open under a payer scope').toBe(true);
    });

    await steps.step('The multi-payer user\'s session starts with an assigned payer in context', async () => {
      expect(SCOPED_ACCOUNT.ownScopes).toContain(await plans.getScopedPayer());
    });

    await steps.critical(`Applying the Payer filter "${plan.payerName}" narrows the on-screen list`, async () => {
      expect(await plans.openListFor(plan.payerName)).toBe(true);
      const payers = (await plans.getPlanRows()).map((row) => row.payer);
      expect(payers.filter((payer) => payer !== plan.payerName), `rows not owned by ${plan.payerName}`).toEqual([]);
    });

    await steps.critical('Exporting with the filter applied generates a file', async () => {
      const file = await plans.exportAndParse('all', 'csv');
      rows = file.parsed.rows;
      headers = file.parsed.headers;
      expect(rows.length, `the export (${file.filename}) should carry rows`).toBeGreaterThan(0);
    });

    await steps.step(`The file holds only "${plan.payerName}"'s plans`, async () => {
      const payerHeader = headers.find((header) => EXPORT_PAYER_HEADER.test(header));
      expect(payerHeader, `the export should carry a payer column (headers: ${headers.join(', ')})`).toBeDefined();
      const payers = rows.map((row) => row[payerHeader ?? '']);
      expect(payers.filter((payer) => payer !== plan.payerName), `exported rows not owned by ${plan.payerName}`).toEqual([]);
      expect(JSON.stringify(rows), `"${plan.name}" should be exported`).toContain(plan.name);
    });
  });
});
