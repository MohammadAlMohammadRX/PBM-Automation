import { test, expect } from '../../../fixtures';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { duplicates } from '../../../utils/SortUtils';
import { CASES, PAGE_SIZE, pagerDataset } from '../../../data/plans/planPagination.data';

/**
 * User story 14160: Paginate and load more plans in card view.
 * The CARD view - Load More batches of ten that accumulate, the control at the
 * exact page boundaries (10 and 11 plans of the case's own), rapid clicks, a
 * failed batch, the spinner, and switching views.
 *
 * Every case leaves the list in Table view again: the view preference is
 * stored per user, and every other case expects the table.
 */
test.describe('US 14160 - Card view Load More', () => {
  test.beforeEach(async ({ planManagementPage, cleanup }) => {
    cleanup.register(() => planManagementPage.switchToTableView());
  });

  test(`TC-${CASES.loadMore.azureId}: should append the next ten plans to the cards when Load More is clicked`, async ({
    planManagementPage,
    steps,
  }) => {
    let first: string[] = [];
    let second: string[] = [];

    await steps.critical('Navigate to the module in card view - the first 10 plans show', async () => {
      await planManagementPage.openList();
      await planManagementPage.switchToCardsView();
      first = await planManagementPage.getCardIds();
      expect(first).toHaveLength(PAGE_SIZE);
    });

    await steps.step('Clicking Load More shows a loading spinner while more plans are fetched', async () => {
      expect(await planManagementPage.observeLoadingDuring(() => planManagementPage.loadMoreCards()), 'a spinner during the load').toBe(true);
    });

    await steps.step('Ten more plans are appended below the first ten - 20 in all', async () => {
      second = await planManagementPage.getCardIds();
      expect(second).toHaveLength(2 * PAGE_SIZE);
      expect(second.slice(0, PAGE_SIZE), 'the first batch should stay in place').toEqual(first);
    });

    await steps.step('Load More again appends a further batch of up to ten, accumulating', async () => {
      await planManagementPage.loadMoreCards();
      const third = await planManagementPage.getCardIds();
      expect(third.length).toBeGreaterThan(second.length);
      expect(third.length).toBeLessThanOrEqual(second.length + PAGE_SIZE);
      expect(third.slice(0, second.length), 'earlier cards should not be replaced').toEqual(second);
      expect(duplicates(third), 'cards loaded twice').toEqual([]);
    });
  });

  test(`TC-${CASES.exactlyTen.azureId}: should offer no active Load More when exactly one full page of plans exists`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(10 * 60_000);
    const dataset = pagerDataset(CASES.exactlyTen.count);
    for (const name of dataset.names) await planIn('Draft', { nameEn: name, noFormulary: true });

    await steps.critical('Navigate to the module in card view showing exactly 10 plans', async () => {
      await planManagementPage.openList();
      const total = await planManagementPage.captureListTotal(() => planManagementPage.search(dataset.prefix));
      expect(total).toBe(CASES.exactlyTen.count);
      await planManagementPage.switchToCardsView();
      expect(await planManagementPage.getCardIds()).toHaveLength(CASES.exactlyTen.count);
    });

    await steps.step('Load More is hidden or disabled - there is nothing more to load', async () => {
      expect(await planManagementPage.isLoadMoreEnabled(), 'Load More must not be active for exactly one page').toBe(false);
    });
  });

  test(`TC-${CASES.exactlyEleven.azureId}: should load the single eleventh plan and retire Load More when the results are just past a full page`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(10 * 60_000);
    const dataset = pagerDataset(CASES.exactlyEleven.count);
    for (const name of dataset.names) await planIn('Draft', { nameEn: name, noFormulary: true });

    await steps.critical('Navigate to the module in card view - 10 plans and an active Load More', async () => {
      await planManagementPage.openList();
      const total = await planManagementPage.captureListTotal(() => planManagementPage.search(dataset.prefix));
      expect(total).toBe(CASES.exactlyEleven.count);
      await planManagementPage.switchToCardsView();
      expect(await planManagementPage.getCardIds()).toHaveLength(PAGE_SIZE);
      expect(await planManagementPage.isLoadMoreEnabled(), 'Load More should be active').toBe(true);
    });

    await steps.step('Clicking Load More shows a spinner while the next batch loads', async () => {
      expect(await planManagementPage.observeLoadingDuring(() => planManagementPage.loadMoreCards())).toBe(true);
    });

    await steps.step('Exactly one plan is appended - 11 in all - and Load More retires', async () => {
      expect(await planManagementPage.getCardIds()).toHaveLength(CASES.exactlyEleven.count);
      expect(await planManagementPage.isLoadMoreEnabled(), 'Load More should be gone or disabled once all plans show').toBe(false);
    });
  });

  test(`TC-${CASES.viewSwitch.azureId}: should start from page one in table view and the first batch in card view when the views are switched`, async ({
    planManagementPage,
    steps,
  }) => {
    const loads = CASES.viewSwitch.loads;

    await steps.critical('Navigate to the module in card view - the first 10 plans show', async () => {
      await planManagementPage.openList();
      await planManagementPage.switchToCardsView();
      expect(await planManagementPage.getCardIds()).toHaveLength(PAGE_SIZE);
    });

    await steps.critical(`Load More ${loads} times accumulates ${PAGE_SIZE * (loads + 1)} cards`, async () => {
      for (let i = 0; i < loads; i += 1) await planManagementPage.loadMoreCards();
      expect(await planManagementPage.getCardIds()).toHaveLength(PAGE_SIZE * (loads + 1));
    });

    await steps.step('Switching to table view shows page 1 - the first 10 plans - with page navigation', async () => {
      await planManagementPage.switchToTableView();
      await planManagementPage.expectCurrentPage(1);
      expect(await planManagementPage.getVisibleRowCount()).toBe(PAGE_SIZE);
      await planManagementPage.expectPagerVisible();
    });

    await steps.step('Switching back to card view restarts from the first batch of 10 with Load More', async () => {
      await planManagementPage.switchToCardsView();
      expect(await planManagementPage.getCardIds()).toHaveLength(PAGE_SIZE);
      expect(await planManagementPage.isLoadMoreEnabled()).toBe(true);
    });
  });

  test(`TC-${CASES.rapidClicks.azureId}: should load each plan exactly once in order when Load More is clicked rapidly`, async ({
    planManagementPage,
    steps,
  }) => {
    const data = CASES.rapidClicks;
    let initial: string[] = [];
    let fired = -1;

    await steps.critical('Navigate to the module in card view - the first 10 plans show', async () => {
      await planManagementPage.openList();
      await planManagementPage.switchToCardsView();
      initial = await planManagementPage.getCardIds();
      expect(initial).toHaveLength(PAGE_SIZE);
    });

    // Each click may send its own request - only duplicates or gaps would be a bug (QA lead, 2026-11-01).
    await steps.step('Each rapid click on Load More is answered without an error', async () => {
      fired = await planManagementPage.loadMoreRapidly(data.clicks);
      expect(fired, `${data.clicks} rapid clicks should load at least one more batch`).toBeGreaterThan(0);
      expect(fired, 'no more requests than clicks').toBeLessThanOrEqual(data.clicks);
    });

    await steps.step('Once settled, every plan appears exactly once, in order, with no gaps', async () => {
      const ids = await planManagementPage.getCardIds();
      expect(duplicates(ids), 'cards loaded twice').toEqual([]);
      expect(ids.slice(0, PAGE_SIZE), 'the first batch should stay in place').toEqual(initial);
      expect(ids.length, 'one batch per request, no gaps').toBe(PAGE_SIZE * (fired + 1));
    });
  });

  test(`TC-${CASES.exploration.azureId}: should keep the list accurate and de-duplicated when batches, filters and views change`, async ({
    planManagementPage,
    steps,
  }) => {
    const data = CASES.exploration;
    const counts: number[] = [];

    await steps.critical('Navigate to the module - plans are visible', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.step('Batches, a mid-way filter, table paging and card view again each complete without error', async () => {
      await planManagementPage.switchToCardsView();
      await planManagementPage.loadMoreCards();
      counts.push((await planManagementPage.getCardIds()).length);
      await planManagementPage.applyQuickFilter('status', data.status);
      await planManagementPage.loadMoreCards();
      counts.push((await planManagementPage.getCardIds()).length);
      await planManagementPage.switchToTableView();
      await planManagementPage.goToNextPage();
      counts.push(await planManagementPage.getVisibleRowCount());
      await planManagementPage.switchToCardsView();
      counts.push((await planManagementPage.getCardIds()).length);
      expect(counts.filter((count) => count === 0), `a step showed nothing: ${counts.join(', ')}`).toEqual([]);
    });

    await steps.step('The list remains accurate and de-duplicated, honouring the filter throughout', async () => {
      const ids = await planManagementPage.getCardIds();
      expect(duplicates(ids), 'cards listed twice').toEqual([]);
      expect((await planManagementPage.getCardStatuses()).filter((status) => status !== data.status), 'cards outside the filter').toEqual([]);
      expect((await planManagementPage.getChips()).join(' | ')).toContain(data.status);
    });
  });

  test(`TC-${CASES.pageSizeAndSpinner.azureId}: should use ten plans per page and show a spinner on every load when browsing in card and table views`, async ({
    planManagementPage,
    steps,
  }) => {
    await steps.critical('Navigate to the module in card view', async () => {
      await planManagementPage.openList();
      await planManagementPage.switchToCardsView();
      expect((await planManagementPage.getCardIds()).length).toBeGreaterThan(0);
    });

    await steps.step('Exactly 10 plans are displayed initially', async () => {
      expect(await planManagementPage.getCardIds()).toHaveLength(PAGE_SIZE);
    });

    await steps.step('Load More shows a spinner until the next batch of 10 arrives', async () => {
      expect(await planManagementPage.observeLoadingDuring(() => planManagementPage.loadMoreCards()), 'a spinner during Load More').toBe(true);
      expect(await planManagementPage.getCardIds()).toHaveLength(2 * PAGE_SIZE);
    });

    await steps.step('Table view shows 10 plans a page, with a spinner while navigating pages', async () => {
      await planManagementPage.switchToTableView();
      expect(await planManagementPage.getVisibleRowCount()).toBe(PAGE_SIZE);
      expect(await planManagementPage.observeLoadingDuring(() => planManagementPage.goToNextPage()), 'a spinner while paging').toBe(true);
      expect(await planManagementPage.getVisibleRowCount()).toBe(PAGE_SIZE);
    });
  });

  test(`TC-${CASES.loadMoreFailure.azureId}: should keep the loaded plans, report the error and recover on retry when a Load More request fails`, async ({
    page,
    planManagementPage,
    cleanup,
    steps,
  }) => {
    cleanup.register(() => NetworkUtils.restore(page));
    let initial: string[] = [];

    await steps.critical('Navigate to the module in card view - the first 10 plans show', async () => {
      await planManagementPage.openList();
      await planManagementPage.switchToCardsView();
      initial = await planManagementPage.getCardIds();
      expect(initial).toHaveLength(PAGE_SIZE);
    });

    await steps.step('Load More while the service is unavailable shows an error indication', async () => {
      await NetworkUtils.failEndpoint(page, ApiEndpoints.planList);
      await planManagementPage.loadMoreCards();
      const messages = await planManagementPage.waitForVisibleMessages();
      expect(messages, `the failure should be reported; the screen showed: ${messages.join(' | ') || '(nothing)'}`).not.toEqual([]);
    });

    await steps.step('The 10 plans already loaded remain visible and intact', async () => {
      expect(await planManagementPage.getCardIds()).toEqual(initial);
    });

    await steps.step('Load More once the service is restored appends the next batch', async () => {
      await NetworkUtils.restore(page);
      await planManagementPage.loadMoreCards();
      const ids = await planManagementPage.getCardIds();
      expect(ids).toHaveLength(2 * PAGE_SIZE);
      expect(ids.slice(0, PAGE_SIZE)).toEqual(initial);
    });
  });
});
