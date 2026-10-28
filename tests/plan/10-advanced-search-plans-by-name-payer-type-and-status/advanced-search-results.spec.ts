import { test, expect } from '../../../fixtures';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { CASES } from '../../../data/plans/planAdvancedSearch.data';

/**
 * User story 14159: Advanced search plans by name, payer, type, and status.
 * The RESULTS - chips for every criterion with Clear All and single removal,
 * a free exploration, results across pages and views, a failing search
 * service, and who may search at all.
 *
 * The card-view case leaves the list in Table view again (a per-user setting).
 */
test.describe('US 14159 - Advanced search results and chips', () => {
  test(`TC-${CASES.chipsClearAll.azureId}: should show a chip for every criterion and restore the full list when Clear All is used`, async ({
    planManagementPage,
    steps,
  }) => {
    const criteria = CASES.chipsClearAll.criteria;
    const values = Object.values(criteria);
    let unfiltered = -1;

    await steps.critical('Navigate to the Plans Management module - no filter chips are shown', async () => {
      unfiltered = await planManagementPage.captureListTotal(() => planManagementPage.openList());
      expect(await planManagementPage.getChips()).toEqual([]);
    });

    await steps.critical('All five criteria are set and submitted - the drawer closes and the results refresh', async () => {
      await planManagementPage.advancedSearchFor(criteria);
      expect(await planManagementPage.advancedSearch().isOpen()).toBe(false);
    });

    await steps.step('A chip is shown for each applied criterion, Plan Name and Approval Status included', async () => {
      const chips = await planManagementPage.getChips();
      expect(values.filter((value) => !chips.join(' | ').includes(value)), `criteria without a chip in [${chips.join(' | ')}]`).toEqual([]);
      expect(chips).toHaveLength(values.length);
    });

    await steps.step('Clear all removes every chip and restores the full plan directory', async () => {
      const total = await planManagementPage.captureListTotal(() => planManagementPage.clearAllChips());
      expect(await planManagementPage.getChips()).toEqual([]);
      expect(total).toBe(unfiltered);
    });
  });

  test(`TC-${CASES.exploration.azureId}: should keep results and chips true to the exact criteria when searches mixing name and selections are tried in turn`, async ({
    planManagementPage,
    steps,
  }) => {
    const searches = CASES.exploration.searches;
    const outcomes: { criteria: (typeof searches)[number]; total: number; chips: string; rows: { name: string; payer: string; status: string }[] }[] = [];

    await steps.critical('Navigate to the Plans Management module - the full directory loads', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.step('Each ad hoc search, changing one field at a time, executes and updates the results', async () => {
      for (const criteria of searches) {
        await planManagementPage.openList();
        const total = await planManagementPage.captureListTotal(() => planManagementPage.advancedSearchFor(criteria));
        expect(total, `${JSON.stringify(criteria)} should be answered`).toBeGreaterThanOrEqual(0);
        outcomes.push({ criteria, total, chips: (await planManagementPage.getChips()).join(' | '), rows: await planManagementPage.getPlanRows() });
      }
      expect(outcomes).toHaveLength(searches.length);
    });

    await steps.step('Chips and results consistently reflect the exact combination entered', async () => {
      for (const outcome of outcomes) {
        const { criteria, chips, rows } = outcome;
        const label = JSON.stringify(criteria);
        expect(Object.values(criteria).filter((value) => !chips.includes(value)), `${label}: criteria without a chip`).toEqual([]);
        expect(rows.filter((row) => criteria.status !== undefined && row.status !== criteria.status), `${label}: rows of another status`).toEqual([]);
        expect(rows.filter((row) => criteria.payer !== undefined && row.payer !== criteria.payer), `${label}: rows of another payer`).toEqual([]);
        expect(
          rows.filter((row) => criteria.nameOrCode !== undefined && !row.name.toLowerCase().includes(criteria.nameOrCode.toLowerCase())),
          `${label}: rows not matching the name`,
        ).toEqual([]);
      }
    });
  });

  test(`TC-${CASES.removeChip.azureId}: should re-apply the remaining criteria only when one filter chip is removed`, async ({
    planManagementPage,
    steps,
  }) => {
    const data = CASES.removeChip;
    let before = -1;

    await steps.critical('Navigate to the module with Plan Name, Payer and Status applied as chips', async () => {
      await planManagementPage.openList();
      before = await planManagementPage.captureListTotal(() =>
        planManagementPage.advancedSearchFor({ nameOrCode: data.name, payer: data.payer, status: data.status }));
      expect(before, 'the three criteria should match plans').toBeGreaterThan(0);
    });

    await steps.step('Chips for Plan Name, Payer and Status are shown with the result count', async () => {
      const chips = (await planManagementPage.getChips()).join(' | ');
      for (const value of [data.name, data.payer, data.status]) expect(chips, `the ${value} chip`).toContain(value);
    });

    let after = -1;
    await steps.step('Removing only the Payer chip leaves the Plan Name and Status chips', async () => {
      after = await planManagementPage.captureListTotal(() => planManagementPage.removeChip(data.payer));
      const chips = (await planManagementPage.getChips()).join(' | ');
      expect(chips, 'the Payer chip should be gone').not.toContain(data.payer);
      expect(chips).toContain(data.name);
      expect(chips).toContain(data.status);
    });

    await steps.step('The results follow Plan Name and Status only, no longer constrained by Payer', async () => {
      expect(after, 'dropping the payer cannot narrow the results').toBeGreaterThanOrEqual(before);
      const rows = await planManagementPage.getPlanRows();
      expect(rows.filter((row) => row.status !== data.status || !row.name.toLowerCase().includes(data.name.toLowerCase())), 'rows outside name and status').toEqual([]);
    });
  });

  test(`TC-${CASES.permission.azureId}: should withhold the advanced search when the user's role lacks plan administration permissions`, async ({
    planManagementPage,
    shapedNonAdmin,
    requireBaseline,
    steps,
  }) => {
    const session = await shapedNonAdmin({ without: CASES.permission.permissions });

    await steps.critical('Navigate to the module as the restricted user - access is limited', async () => {
      await planManagementPage.openList();
      requireBaseline(await planManagementPage.isAdvancedSearchOffered(), 'the advanced search for a session holding the plan read rights');
      const access = await session.plans.readListAccess();
      expect(access.kpis, 'the restricted role should not get the full directory').toBe(false);
    });

    await steps.step('The advanced search entry point is hidden or disabled for this role', async () => {
      expect(await session.plans.isAdvancedSearchOffered(), 'advanced search must not be offered').toBe(false);
    });

    await steps.step('A direct search request from this role is refused', async () => {
      const answer = await session.plans.sendListRequest({ pageNumber: 1, rowsPerPage: 10, searchText: CASES.removeChip.name });
      expect(answer.status, `the search should be refused; it answered ${answer.status} ${answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
    });
  });

  test(`TC-${CASES.serviceFailure.azureId}: should show a clear error and keep a stable list when the search service fails`, async ({
    page,
    planManagementPage,
    cleanup,
    steps,
  }) => {
    cleanup.register(() => NetworkUtils.restore(page));
    let before: { name: string; payer: string; status: string }[] = [];

    await steps.critical('Navigate to the Plans Management module - plans are visible', async () => {
      await planManagementPage.openList();
      before = await planManagementPage.getPlanRows();
      expect(before.length).toBeGreaterThan(0);
    });

    await steps.step('Valid criteria submitted while the search service fails send their request', async () => {
      await NetworkUtils.failEndpoint(page, ApiEndpoints.planList);
      const fired = await planManagementPage.countListRequests(() => planManagementPage.advancedSearchFor({ nameOrCode: CASES.serviceFailure.name }));
      expect(fired, 'the search should reach the server').toBeGreaterThan(0);
    });

    await steps.step('A clear error is shown and the previous results are not silently corrupted', async () => {
      const messages = await planManagementPage.waitForVisibleMessages();
      const after = await planManagementPage.getPlanRows().catch(() => []);
      expect(messages, `the failure should be reported; the screen showed: ${messages.join(' | ') || '(nothing)'}`).not.toEqual([]);
      expect(after.length === 0 || JSON.stringify(after) === JSON.stringify(before), 'rows must be either cleared or the untouched previous results').toBe(true);
      await NetworkUtils.restore(page);
    });
  });

  test(`TC-${CASES.paging.azureId}: should keep the search criteria across pages and in both views when the results span several pages`, async ({
    planManagementPage,
    cleanup,
    steps,
  }) => {
    const data = CASES.paging;
    const matches = (name: string): boolean => name.toLowerCase().includes(data.name.toLowerCase());
    cleanup.register(() => planManagementPage.switchToTableView());

    await steps.critical('Navigate to the Plans Management module in table view', async () => {
      await planManagementPage.openList();
      expect(await planManagementPage.isTableViewActive()).toBe(true);
    });

    await steps.critical(`Criteria matching more than ${data.moreThan} plans refresh the results under the chips`, async () => {
      const total = await planManagementPage.captureListTotal(() => planManagementPage.advancedSearchFor({ nameOrCode: data.name }));
      expect(total).toBeGreaterThan(data.moreThan);
      expect((await planManagementPage.getChips()).join(' | ')).toContain(data.name);
    });

    await steps.step('The next page loads more matching plans, still honouring the criteria', async () => {
      await planManagementPage.goToNextPage();
      await planManagementPage.expectCurrentPage(2);
      const names = (await planManagementPage.getPlanRows()).map((row) => row.name);
      expect(names.length).toBeGreaterThan(0);
      expect(names.filter((name) => !matches(name)), 'page 2 rows outside the criteria').toEqual([]);
    });

    await steps.step('Card and table views show the same filtered result set', async () => {
      await planManagementPage.switchToCardsView();
      const titles = await planManagementPage.getCardTitles();
      expect(titles.length).toBeGreaterThan(0);
      expect(titles.filter((title) => !matches(title)), 'cards outside the criteria').toEqual([]);
      expect((await planManagementPage.getChips()).join(' | '), 'the criteria should survive the switch').toContain(data.name);
      await planManagementPage.switchToTableView();
      const names = (await planManagementPage.getPlanRows()).map((row) => row.name);
      expect(names.filter((name) => !matches(name)), 'table rows outside the criteria').toEqual([]);
    });
  });
});
