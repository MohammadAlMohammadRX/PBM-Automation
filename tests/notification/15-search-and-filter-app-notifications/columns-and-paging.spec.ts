import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { DefinitionsTab } from '../../../pages/notification/NotificationCenterPage';
import { DEF_ACTION, DEF_MODULE } from '../../../constants/notification/writerCIds';
import {
  ACTIONS_COLUMN_KEY,
  CASES,
  COLUMN_HEADERS,
  COUNT_ACTIONS_COLUMN,
  EXPLORE_ACTIVE_NETWORK,
  EXPLORE_NETWORK_COUNT,
  FILTER_KEY,
  MODULE_LABEL,
  PAGE_TEST_COUNT,
  ROWS_PER_PAGE,
  STORY,
  YES,
} from '../../../data/notification/searchAndFilterAppNotifications.data';
import { headerTexts, idsOf, makeSuiteDefinitions } from '../../../utils/notification/writerCHelpers';

/** Step 1 of every case: the App Notification tab of the Notification Center. */
async function openList(steps: TestSteps, tab: DefinitionsTab): Promise<void> {
  await steps.critical('Navigate to the Notification Center Management module - the App Notification list screen loads', async () => {
    const answer = await tab.open();
    expect(answer?.status, 'GetDefinitions should answer the App Notification tab').toBe(200);
  });
}

/**
 * User story 20999: Search and Filter App Notifications - the list's columns,
 * ten rows a page, and a scripted exploration of search + filters + chips +
 * paging. The paging cases page over the case's OWN suite definitions (one
 * stamp, found by search). See the data file for the readings.
 */
test.describe(`US ${STORY.id} - ${STORY.title} (columns and paging)`, () => {
  test.describe.configure({ timeout: 8 * 60_000 });

  test(`TC-${CASES.columns.azureId}: should display exactly the Name, Module, Action and Active columns`, async ({ page, steps, ncDefinitions }) => {
    await openList(steps, ncDefinitions);

    await steps.step('Inspect the list column headers - the headers show Name, Module, Action and Active', async () => {
      const headers = await headerTexts(page);
      const dataColumns = Object.entries(headers).filter(([key]) => COUNT_ACTIONS_COLUMN || key !== ACTIONS_COLUMN_KEY).map(([, text]) => text);
      expect(dataColumns, `headers shown: ${JSON.stringify(headers)}`).toEqual([...COLUMN_HEADERS]);
      expect(await ncDefinitions.rowIds(), 'at least one notification is listed under them').not.toHaveLength(0);
    });
  });

  test(`TC-${CASES.tenPerPage.azureId}: should show ten notifications on page 1 and the eleventh alone on page 2`, async ({ page, steps, suiteDefinitions, ncDefinitions }) => {
    const base = suiteDefinitions.newName('paging');
    const made = await makeSuiteDefinitions(page, suiteDefinitions, base, Array.from({ length: PAGE_TEST_COUNT }, () => ({ moduleId: DEF_MODULE.networkManagement, actionId: DEF_ACTION.networkInactive })));
    // Newest first: the FIRST one created is the 11th row.
    const eleventh = made[0];
    await openList(steps, ncDefinitions);

    await steps.step(`Count the records shown on page 1 (the ${PAGE_TEST_COUNT} suite notifications, found by their shared name) - exactly ${ROWS_PER_PAGE} are listed`, async () => {
      const answer = await ncDefinitions.search(base);
      expect(answer?.totalRows, `GetDefinitions found ${answer?.totalRows} for "${base}"`).toBe(PAGE_TEST_COUNT);
      await expect(ncDefinitions.rows()).toHaveCount(ROWS_PER_PAGE);
      expect(answer?.request.rowsPerPage, 'the list asks for ten rows a page').toBe(ROWS_PER_PAGE);
    });

    await steps.step('Navigate to page 2 - the 11th notification is shown alone', async () => {
      const answer = await ncDefinitions.goToPage(2);
      expect(answer?.request.pageNumber, 'page 2 is requested').toBe(2);
      expect(await ncDefinitions.rowIds(), `page 2 should hold only "${eleventh.name}"`).toEqual([eleventh.id]);
    });
  });

  test(`TC-${CASES.exploratory.azureId}: should keep search, filter chips and paging consistent and free of stale or duplicated rows when combined`, async ({ page, steps, suiteDefinitions, ncDefinitions }) => {
    const base = suiteDefinitions.newName('explore');
    const specs = [
      ...Array.from({ length: EXPLORE_NETWORK_COUNT }, (_, i) => ({ moduleId: DEF_MODULE.networkManagement, actionId: DEF_ACTION.networkInactive, isActive: i < EXPLORE_ACTIVE_NETWORK })),
      { moduleId: DEF_MODULE.planManagement, actionId: DEF_ACTION.planInactive, isActive: true },
    ];
    const made = await makeSuiteDefinitions(page, suiteDefinitions, base, specs);
    const network = made.slice(0, EXPLORE_NETWORK_COUNT);
    const activeNetwork = network.slice(0, EXPLORE_ACTIVE_NETWORK);
    await openList(steps, ncDefinitions);

    await steps.step('Enter a search term, add two advanced filters, remove one chip, then page through the results - the list updates correctly at each step with no stale or duplicated data', async () => {
      // 1. search
      const searched = await ncDefinitions.search(base);
      expect(searched?.totalRows, 'search: every suite record of the stamp').toBe(made.length);
      expect(await ncDefinitions.rowIds(), 'search: page 1 is the answer').toEqual(idsOf(searched?.items ?? []));

      // 2. two filters on top of the search
      const filtered = await ncDefinitions.filter({ [FILTER_KEY.module]: MODULE_LABEL.network, [FILTER_KEY.active]: YES });
      expect(filtered?.request.searchText, 'filters keep the search text').toBe(base);
      expect([...(await ncDefinitions.rowIds())].sort(), 'search + Network + Active: exactly the active Network records').toEqual(activeNetwork.map((d) => d.id).sort());
      expect(await ncDefinitions.rowIds(), 'filtered page is the answer').toEqual(idsOf(filtered?.items ?? []));

      // 3. remove the Active chip
      const widened = await ncDefinitions.removeChip(FILTER_KEY.active);
      expect(widened?.totalRows, 'search + Network: every Network record of the stamp').toBe(network.length);
      expect(Object.keys(await ncDefinitions.chips()), 'the Active chip is gone, the Module chip stays').toEqual(expect.arrayContaining([FILTER_KEY.module]));
      expect(Object.keys(await ncDefinitions.chips()), 'no stale Active chip').not.toContain(FILTER_KEY.active);
      const page1 = await ncDefinitions.rowIds();
      expect(page1, 'page 1 after removing the chip is the answer').toEqual(idsOf(widened?.items ?? []));

      // 4. page through
      const second = await ncDefinitions.goToPage(2);
      const page2 = await ncDefinitions.rowIds();
      expect(page2, 'page 2 is its answer').toEqual(idsOf(second?.items ?? []));
      expect(page1.filter((id) => page2.includes(id)), 'rows repeated across pages').toEqual([]);
      expect([...page1, ...page2].sort(), 'pages 1 + 2 hold every Network record exactly once').toEqual(network.map((d) => d.id).sort());
    });
  });
});
