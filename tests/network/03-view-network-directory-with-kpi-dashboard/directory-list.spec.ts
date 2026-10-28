import { test, expect } from '../../../fixtures';
import { NETWORK_COLUMN } from '../../../constants/ElementIds';
import { duplicates } from '../../../utils/SortUtils';
import {
  CASES,
  COUNT_CELL,
  DATE_CELL,
  KPI_LABELS,
  PAGE_SIZE,
  REQUIRED_HEADERS,
  pagerDataset,
} from '../../../data/networks/directoryKpis.data';

/**
 * User story 14120: View network directory with KPI dashboard.
 * The directory itself - default table view, columns and formats, the
 * 10-row pager at its boundaries, live counts, and the card view.
 *
 * The card-view cases leave the list in Table view again: the view preference
 * is stored per user on the server, and every other case expects the table.
 */
test.describe('US 14120 - Network directory list', () => {
  test(`TC-${CASES.defaultView.azureId}: should show five KPI tiles and the table view with every column when the module loads`, async ({
    networkManagementPage,
    steps,
  }) => {
    await steps.critical('Navigate to the Network Management module - the directory loads', async () => {
      await networkManagementPage.openList();
    });

    await steps.step('Five KPI tiles - Total, Active, Pending, Inactive, Expired - each show a count', async () => {
      expect(await networkManagementPage.getKpiLabels()).toEqual(KPI_LABELS);
      const tiles = await networkManagementPage.readKpis();
      expect(Object.values(tiles).every((value) => Number.isInteger(value) && value >= 0)).toBe(true);
    });

    await steps.step('The list is in table view with name, code, type, status, dates and both counts', async () => {
      await networkManagementPage.expectRowsRendered();
      expect(await networkManagementPage.getHeaderTexts()).toEqual(expect.arrayContaining(REQUIRED_HEADERS));
      expect(await networkManagementPage.getVisibleRowCount()).toBeLessThanOrEqual(PAGE_SIZE);
    });
  });

  test(`TC-${CASES.columns.azureId}: should present every required column with consistent dates and numeric counts when the table loads`, async ({
    networkManagementPage,
    steps,
  }) => {
    await steps.critical('Navigate to the module - the table view loads', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.expectRowsRendered();
    });

    await steps.step('Every required column is present and labelled', async () => {
      expect(await networkManagementPage.getHeaderTexts()).toEqual(expect.arrayContaining(REQUIRED_HEADERS));
    });

    await steps.step('Dates render as DD/MM/YYYY HH:mm and counts as whole numbers', async () => {
      const effective = await networkManagementPage.readColumn(NETWORK_COLUMN.effectiveDate);
      const expiry = await networkManagementPage.readColumn(NETWORK_COLUMN.expiryDate);
      const facilities = await networkManagementPage.readColumn(NETWORK_COLUMN.facilities);
      const policies = await networkManagementPage.readColumn(NETWORK_COLUMN.linkedPolicies);
      expect([...effective, ...expiry].filter((cell) => !DATE_CELL.test(cell)), 'badly formatted dates').toEqual([]);
      expect([...facilities, ...policies].filter((cell) => !COUNT_CELL.test(cell)), 'non-numeric counts').toEqual([]);
    });
  });

  test(`TC-${CASES.pagination.azureId}: should page at ten rows with no pager for 0 or 10 records and a second page for the 11th record`, async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.skip(true, CASES.pagination.skipReason);
    test.setTimeout(15 * 60_000);
    const dataset = pagerDataset();
    for (const name of dataset.names) await networkIn('Draft', { nameEn: name, facilities: 0 });

    await steps.critical('Navigate to the module with a search matching exactly 0 networks - an empty state, no pages', async () => {
      await networkManagementPage.openList();
      const total = await networkManagementPage.captureListTotal(() => networkManagementPage.search(dataset.none));
      expect(total).toBe(0);
      expect(await networkManagementPage.hasNextPage(), 'there must be no next page').toBe(false);
    });

    await steps.step('Exactly 10 networks show on one page with no second page', async () => {
      await networkManagementPage.openList();
      const total = await networkManagementPage.captureListTotal(() => networkManagementPage.search(dataset.ten));
      expect(total).toBe(10);
      expect(await networkManagementPage.getVisibleRowCount()).toBe(10);
      expect(await networkManagementPage.hasNextPage(), '10 records must fit one page').toBe(false);
    });

    await steps.step('11 networks show 10 on page one and the 11th on page two', async () => {
      await networkManagementPage.openList();
      const total = await networkManagementPage.captureListTotal(() => networkManagementPage.search(dataset.prefix));
      expect(total).toBe(11);
      expect(await networkManagementPage.getVisibleRowCount()).toBe(10);
      expect(await networkManagementPage.hasNextPage(), 'the 11th record needs a second page').toBe(true);
      await networkManagementPage.goToNextPage();
      expect(await networkManagementPage.getVisibleRowCount()).toBe(1);
    });
  });

  test(`TC-${CASES.viewToggle.azureId}: should keep the Active filter and reset to page one when switching between table and card views`, async ({
    networkManagementPage,
    steps,
  }) => {
    const data = CASES.viewToggle;

    await steps.critical('Navigate to the module and filter by Status Active in table view', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.applyQuickFilter('status', data.status);
      const statuses = await networkManagementPage.readColumn(NETWORK_COLUMN.status);
      expect(statuses.filter((s) => s !== data.status)).toEqual([]);
    });

    await steps.step('Card view shows the same Active-filtered networks', async () => {
      await networkManagementPage.switchToCardsView();
      expect((await networkManagementPage.getCardTitles()).length, 'cards should render').toBeGreaterThan(0);
      expect(await networkManagementPage.getChips(), 'the filter should survive the switch').toContain(data.status);
    });

    await steps.step('After Load More and back to table: page 1, Active filter still applied', async () => {
      await networkManagementPage.loadMoreCards();
      await networkManagementPage.switchToTableView();
      await networkManagementPage.expectCurrentPage(1);
      expect(await networkManagementPage.getQuickFilterValue('status')).toBe(data.status);
      const statuses = await networkManagementPage.readColumn(NETWORK_COLUMN.status);
      expect(statuses.filter((s) => s !== data.status), 'rows that are not Active').toEqual([]);
    });
  });

  test(`TC-${CASES.liveCounts.azureId}: should show updated facility and policy counts when the list is reloaded after a change`, async ({
    networkManagementPage,
    networkDetailPage,
    networkApprovalsPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const network = await networkIn('Active', { facilities: 1 });

    await steps.critical('Navigate to the module and note the network\'s counts - one facility', async () => {
      await networkManagementPage.openList();
      expect((await networkManagementPage.readRow(network.name)).facilities).toBe('1');
    });

    await steps.critical('A facility is added to the network and the change approved', async () => {
      await networkDetailPage.open(network.id);
      const tab = networkDetailPage.facilities();
      await tab.open();
      await tab.openAssignDrawer();
      const pool = await tab.getAssignableOptions();
      expect(pool.length, 'another facility should be assignable').toBeGreaterThan(0);
      await tab.selectFacilities([pool[0]]);
      const answer = await tab.confirmAssign();
      expect(answer?.status ?? 0, 'the assignment should be accepted').toBeLessThan(300);
      await networkDetailPage.open(network.id);
      await networkDetailPage.submitForApproval();
      await networkApprovalsPage.open();
      await networkApprovalsPage.approve(network.name);
    });

    await steps.step('Reloading the list shows two facilities and the live policy count', async () => {
      await networkManagementPage.openList();
      const row = await networkManagementPage.readRow(network.name);
      expect(row.facilities, 'the facility count should be recalculated at read time').toBe('2');
      await networkDetailPage.open(network.id);
      expect(Number(row.linkedPolicies), 'the list\'s policy count should match the detail screen').toBe(
        await networkDetailPage.getTabCount('policies'),
      );
    });
  });

  test(`TC-${CASES.loadMore.azureId}: should add cards without duplicates or gaps when Load More is clicked rapidly`, async ({
    networkManagementPage,
    steps,
  }) => {
    const data = CASES.loadMore;
    let initial: string[] = [];

    await steps.critical('Navigate to the module and switch to card view - the first batch shows', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.switchToCardsView();
      initial = await networkManagementPage.getCardTitles();
      expect(initial.length).toBeGreaterThan(0);
    });

    await steps.step('Rapid Load More clicks add cards incrementally', async () => {
      await networkManagementPage.loadMoreRapidly(data.clicks);
      expect((await networkManagementPage.getCardTitles()).length, 'more cards should be loaded').toBeGreaterThan(initial.length);
    });

    await steps.step('The loaded cards hold no duplicates and keep the first batch in place', async () => {
      const titles = await networkManagementPage.getCardTitles();
      expect(titles.slice(0, initial.length), 'the first batch should stay where it was').toEqual(initial);
      expect(duplicates(titles), 'cards loaded twice').toEqual([]);
      await networkManagementPage.switchToTableView();
    });
  });
});
