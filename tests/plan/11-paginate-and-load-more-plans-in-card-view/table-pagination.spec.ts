import { test, expect } from '../../../fixtures';
import { PLAN_COLUMN } from '../../../constants/ElementIds';
import { duplicates } from '../../../utils/SortUtils';
import { CASES, PAGE_SIZE, pagerDataset } from '../../../data/plans/planPagination.data';

/**
 * User story 14160: Paginate and load more plans in card view.
 * The TABLE pager and server-side paging - pages of ten that replace each
 * other, paging in both views with and without a filter, the request each page
 * sends, the empty and the 25-plan boundaries, latest-version scoping, and who
 * may see the list at all.
 */
test.describe('US 14160 - Table pagination and server-side paging', () => {
  test(`TC-${CASES.tablePages.azureId}: should replace the ten rows with the next ten when the table moves between pages`, async ({
    planManagementPage,
    steps,
  }) => {
    let pageOne: string[] = [];

    await steps.critical('Navigate to the module in table view - page 1 shows 10 plans', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
      await planManagementPage.expectCurrentPage(1);
      pageOne = await planManagementPage.readCodesOnPage();
      expect(pageOne).toHaveLength(PAGE_SIZE);
    });

    await steps.step('Page 2 replaces page 1 with the next 10 plans', async () => {
      await planManagementPage.goToNextPage();
      await planManagementPage.expectCurrentPage(2);
      const pageTwo = await planManagementPage.readCodesOnPage();
      expect(pageTwo).toHaveLength(PAGE_SIZE);
      expect(pageTwo.filter((code) => pageOne.includes(code)), 'page 1 rows still shown on page 2').toEqual([]);
    });

    await steps.step('Back on page 1 the original first 10 plans show again', async () => {
      await planManagementPage.goToPreviousPage();
      await planManagementPage.expectCurrentPage(1);
      expect(await planManagementPage.readCodesOnPage()).toEqual(pageOne);
    });
  });

  test(`TC-${CASES.viewAndFilter.azureId}: should serve the right next page in both views when a filter is and is not applied`, async ({
    planManagementPage,
    cleanup,
    steps,
  }) => {
    const data = CASES.viewAndFilter;
    cleanup.register(() => planManagementPage.switchToTableView());

    await steps.critical('Navigate to the module - plans show in the default view', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.step('Card view without a filter: Load More appends the next 10 plans', async () => {
      await planManagementPage.switchToCardsView();
      const first = await planManagementPage.getCardIds();
      await planManagementPage.loadMoreCards();
      const ids = await planManagementPage.getCardIds();
      expect(ids).toHaveLength(first.length + PAGE_SIZE);
      expect(ids.slice(0, first.length)).toEqual(first);
    });

    await steps.step(`Card view filtered by ${data.status}: Load More appends the next 10 ${data.status} plans`, async () => {
      await planManagementPage.applyQuickFilter('status', data.status);
      const first = await planManagementPage.getCardIds();
      await planManagementPage.loadMoreCards();
      const ids = await planManagementPage.getCardIds();
      expect(ids).toHaveLength(first.length + PAGE_SIZE);
      expect((await planManagementPage.getCardStatuses()).filter((status) => status !== data.status), 'appended cards outside the filter').toEqual([]);
    });

    await steps.step('Table view without a filter: page 2 replaces page 1 with the next 10 plans', async () => {
      await planManagementPage.openList();
      expect(await planManagementPage.getChips(), 'a fresh list carries no filter').toEqual([]);
      const pageOne = await planManagementPage.readCodesOnPage();
      await planManagementPage.goToNextPage();
      const pageTwo = await planManagementPage.readCodesOnPage();
      expect(pageTwo).toHaveLength(PAGE_SIZE);
      expect(pageTwo.filter((code) => pageOne.includes(code))).toEqual([]);
    });

    await steps.step(`Table view filtered by ${data.status}: page 2 holds the next 10 ${data.status} plans`, async () => {
      await planManagementPage.openList();
      await planManagementPage.applyQuickFilter('status', data.status);
      await planManagementPage.goToNextPage();
      const statuses = await planManagementPage.readColumn(PLAN_COLUMN.status);
      expect(statuses).toHaveLength(PAGE_SIZE);
      expect(statuses.filter((status) => status !== data.status), 'page 2 rows outside the filter').toEqual([]);
    });
  });

  test(`TC-${CASES.empty.azureId}: should show an empty-state message and no paging controls when no plan matches`, async ({
    planManagementPage,
    steps,
  }) => {
    const data = CASES.empty;

    await steps.critical('Navigate to the Plans Management module', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.step('A search matching no plan shows an empty-state message', async () => {
      const total = await planManagementPage.captureListTotal(() => planManagementPage.search(data.term()));
      expect(total).toBe(0);
      expect(await planManagementPage.getTableBodyText()).toMatch(data.message);
    });

    await steps.step('Neither Load More nor page navigation is shown', async () => {
      await planManagementPage.expectPagerAbsent();
      expect(await planManagementPage.isLoadMoreOffered(), 'no Load More for an empty result').toBe(false);
    });
  });

  test(`TC-${CASES.latestVersion.azureId}: should show each plan once at its current version on every page when the directory is paged through`, async ({
    planManagementPage,
    steps,
  }) => {
    const codes: string[][] = [];

    await steps.critical('Navigate to the module - the first page of plans shows', async () => {
      await planManagementPage.openList();
      codes.push(await planManagementPage.readCodesOnPage());
      expect(codes[0]).toHaveLength(PAGE_SIZE);
    });

    await steps.step(`The next ${CASES.latestVersion.pages - 1} pages load successfully`, async () => {
      for (let page = 2; page <= CASES.latestVersion.pages; page += 1) {
        await planManagementPage.goToNextPage();
        await planManagementPage.expectCurrentPage(page);
        codes.push(await planManagementPage.readCodesOnPage());
      }
      expect(codes.filter((onPage) => onPage.length === 0), 'an empty page').toEqual([]);
    });

    await steps.step('No plan appears twice across the pages - only its latest version is listed', async () => {
      expect(duplicates(codes.flat()), 'plans listed more than once').toEqual([]);
    });
  });

  test(`TC-${CASES.noAccess.azureId}: should show neither the plan list nor its paging controls when the role lacks the view permission`, async ({
    planManagementPage,
    shapedNonAdmin,
    requireBaseline,
    steps,
  }) => {
    const data = CASES.noAccess;
    const session = await shapedNonAdmin({ without: data.permissions });
    let access = { table: true, kpis: true, url: '' };

    await steps.critical('The restricted user opens the Plans Management module', async () => {
      await planManagementPage.openList();
      requireBaseline(await planManagementPage.hasNextPage(), 'the plan list and its pager for a session holding the plan read rights');
      access = await session.plans.readListAccess();
      expect(access.url, 'the browser should reach the application').toMatch(data.appUrl);
    });

    await steps.step('Access to the plan directory is denied', async () => {
      expect(access.table, 'the plan list must not render').toBe(false);
      expect(access.kpis, 'the KPI tiles must not render').toBe(false);
    });

    await steps.step('No plan list, Load More or page navigation is displayed to this role', async () => {
      await session.plans.expectPagerAbsent();
      expect(await session.plans.isLoadMoreOffered()).toBe(false);
    });
  });

  test(`TC-${CASES.requestScope.azureId}: should request the next page number with the active filter and render exactly what the server returned when a filtered list is paged`, async ({
    planManagementPage,
    steps,
  }) => {
    const data = CASES.requestScope;
    let filtered: Record<string, unknown> = {};
    let next: Record<string, unknown> = {};
    let items: Record<string, unknown>[] = [];
    let pageOne: string[] = [];

    await steps.critical(`Navigate to the module filtered by ${data.status} - the first 10 matching plans show`, async () => {
      await planManagementPage.openList();
      filtered = await planManagementPage.captureQuickFilterRequest('status', data.status);
      pageOne = await planManagementPage.readCodesOnPage();
      expect(pageOne).toHaveLength(PAGE_SIZE);
    });

    await steps.step('Moving to page 2 issues a new server request', async () => {
      items = await planManagementPage.captureListItems(async () => {
        next = await planManagementPage.captureListRequest(() => planManagementPage.goToNextPage());
      });
      expect(Object.keys(next).length, 'a list request should be sent for page 2').toBeGreaterThan(0);
    });

    await steps.step('The request carries the next page number and the active filter', async () => {
      expect(Number(next[data.pageField]), 'the requested page').toBe(data.nextPage);
      const criteria = Object.keys(filtered).filter((key) => key !== data.pageField);
      expect(criteria.filter((key) => JSON.stringify(next[key]) !== JSON.stringify(filtered[key])), 'filter fields not carried to page 2').toEqual([]);
    });

    await steps.step('Only the matching plans of that page are returned and displayed - paging is server-side', async () => {
      const rows = await planManagementPage.getPlanRows();
      expect(rows.map((row) => row.name), 'the rows should be the ones the server returned').toEqual(items.map((item) => String(item.planNameEn)));
      expect(rows.filter((row) => row.status !== data.status), 'rows outside the filter').toEqual([]);
      expect((await planManagementPage.readCodesOnPage()).filter((code) => pageOne.includes(code))).toEqual([]);
    });
  });

  test(`TC-${CASES.boundaries.azureId}: should disable Previous on the first page and Next on the last when 25 plans are paged`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const data = CASES.boundaries;
    const dataset = pagerDataset(data.count);
    for (const name of dataset.names) await planIn('Draft', { nameEn: name, noFormulary: true });

    await steps.critical('Navigate to the module in table view on page 1 of 3', async () => {
      await planManagementPage.openList();
      const total = await planManagementPage.captureListTotal(() => planManagementPage.search(dataset.prefix));
      expect(total).toBe(data.count);
      await planManagementPage.expectCurrentPage(1);
    });

    await steps.step('Previous is disabled on page 1', async () => {
      await planManagementPage.expectPreviousPageDisabled();
    });

    await steps.step(`The last page (page ${data.lastPage}) shows the remaining ${data.lastPageRows} plans`, async () => {
      await planManagementPage.goToPage(data.lastPage);
      await planManagementPage.expectCurrentPage(data.lastPage);
      expect(await planManagementPage.getVisibleRowCount()).toBe(data.lastPageRows);
    });

    await steps.step('Next is disabled on the last page', async () => {
      await planManagementPage.expectNextPageDisabled();
    });
  });
});
