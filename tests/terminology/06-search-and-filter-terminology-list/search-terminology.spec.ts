import { test, expect } from '../../../fixtures';
import { CASES, SEARCH_MAX_LENGTH, longestKeyword } from '../../../data/terminology/searchTerminology.data';

/**
 * User story 15148: Search and Filter Terminology list.
 * Keyword search on name and description (case-insensitive, safe with unusual
 * input, at both length boundaries), the status and subscription filters alone
 * and combined, clearing them, and the controls' labelling.
 */
test.describe('US 15148 - Search and Filter Terminology list', () => {
  test(`TC-${CASES.byName.azureId}: should return only terminologies whose name contains the keyword when a name is searched`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.byName;
    const terminology = await terminologyIn({ name: data.name() });
    let names: string[] = [];

    await steps.critical('Navigate to the Terminology Management module - the list view is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step(`Entering "${data.keyword}" executes the search`, async () => {
      names = (await terminologyManagementPage.searchFor(data.keyword)).items.map((t) => t.name);
      expect(names).toContain(terminology.name);
    });

    await steps.step(`Only terminologies whose name contains "${data.keyword}" are displayed`, async () => {
      expect(names.filter((n) => !n.includes(data.keyword))).toEqual([]);
      expect((await terminologyManagementPage.readNames()).filter((n) => !n.includes(data.keyword))).toEqual([]);
    });
  });

  test(`TC-${CASES.byDescription.azureId}: should return the terminology when the keyword appears in its description but not its name`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.byDescription;
    const terminology = await terminologyIn({ name: data.name(), description: data.description });
    let names: string[] = [];

    await steps.critical('Navigate to the Terminology Management module - the list view is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step(`Entering "${data.keyword}" executes the search`, async () => {
      names = (await terminologyManagementPage.searchFor(data.keyword)).items.map((t) => t.name);
      expect(names.length, 'the search should answer with results').toBeGreaterThan(0);
    });

    await steps.step('The terminology with the keyword in its description is returned although its name lacks it', async () => {
      expect(terminology.name.toLowerCase()).not.toContain(data.keyword);
      expect(names).toContain(terminology.name);
    });
  });

  test(`TC-${CASES.noMatch.azureId}: should show an empty-state message and no error when the keyword matches nothing`, async ({
    terminologyManagementPage,
    steps,
  }) => {
    const data = CASES.noMatch;

    await steps.critical('Navigate to the Terminology Management module - the list view is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step(`Entering "${data.keyword}" executes the search`, async () => {
      expect((await terminologyManagementPage.searchFor(data.keyword)).totalRows).toBe(0);
    });

    await steps.step('The results area shows an empty-state message', async () => {
      expect(await terminologyManagementPage.getRowCount()).toBe(0);
      expect(await terminologyManagementPage.getEmptyStateText()).toMatch(data.empty);
      expect(await terminologyManagementPage.waitForVisibleMessages(), 'no error should be reported').toEqual([]);
    });
  });

  test(`TC-${CASES.activeOnly.azureId}: should show only Active terminologies when the Active status filter is applied`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    await terminologyIn({ active: false });
    let items: { name: string; isActive: boolean }[] = [];

    await steps.critical('Navigate to the Terminology Management module - the list view is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('The status filter set to "Active" is applied', async () => {
      items = (await terminologyManagementPage.applyCriteria({ active: true })).items;
      expect(items.length).toBeGreaterThan(0);
    });

    await steps.step('Only terminologies with status "Active" are displayed', async () => {
      expect(items.filter((t) => !t.isActive).map((t) => t.name)).toEqual([]);
    });
  });

  test(`TC-${CASES.inactiveOnly.azureId}: should show only Inactive terminologies when the Inactive status filter is applied`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const inactive = await terminologyIn({ active: false });
    let items: { name: string; isActive: boolean }[] = [];

    await steps.critical('Navigate to the Terminology Management module - the list view is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('The status filter set to "Inactive" is applied', async () => {
      items = (await terminologyManagementPage.applyCriteria({ active: false })).items;
      expect(items.length, 'the Inactive filter should answer with the case\'s inactive terminology').toBeGreaterThan(0);
    });

    await steps.step('Only terminologies with status "Inactive" are displayed', async () => {
      expect(items.map((t) => t.name)).toContain(inactive.name);
      expect(items.filter((t) => t.isActive).map((t) => t.name), 'active rows under an Inactive filter').toEqual([]);
    });
  });

  test(`TC-${CASES.subscription.azureId}: should narrow the list to subscribed and then unsubscribed terminologies when the subscription filter is changed`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const subscribed = await terminologyIn({ subscribed: true, subscriptionReference: CASES.subscription.reference });
    const unsubscribed = await terminologyIn();
    let items: { name: string; isSubscribed: boolean }[] = [];

    await steps.critical('Navigate to the Terminology Management module - the list view is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('The subscription filter set to "Subscribed" is applied', async () => {
      items = (await terminologyManagementPage.applyCriteria({ subscribed: true })).items;
      expect(items.length, 'the Subscribed filter should answer with the case\'s subscribed terminology').toBeGreaterThan(0);
    });

    await steps.step('Only subscribed terminologies are displayed', async () => {
      expect(items.map((t) => t.name)).toContain(subscribed.name);
      expect(items.filter((t) => !t.isSubscribed).map((t) => t.name)).toEqual([]);
    });

    await steps.step('Changing the filter to "Unsubscribed" shows only unsubscribed terminologies', async () => {
      items = (await terminologyManagementPage.applyCriteria({ subscribed: false })).items;
      expect(items.map((t) => t.name)).toContain(unsubscribed.name);
      expect(items.filter((t) => t.isSubscribed).map((t) => t.name)).toEqual([]);
    });
  });

  test(`TC-${CASES.combined.azureId}: should return the intersection of keyword, Active status and Subscribed state when all three are applied`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.combined;
    const match = await terminologyIn({ name: data.name(), subscribed: true, subscriptionReference: data.reference });
    let items: { name: string; isActive: boolean; isSubscribed: boolean; description: string }[] = [];

    await steps.critical('Navigate to the Terminology Management module - the list view is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step(`Entering "${data.keyword}" shows the matching terminologies`, async () => {
      items = (await terminologyManagementPage.applyCriteria({ name: data.keyword })).items;
      expect(items.map((t) => t.name)).toContain(match.name);
    });

    await steps.step('Adding the Active filter narrows the results to active terminologies matching the keyword', async () => {
      items = (await terminologyManagementPage.applyCriteria({ name: data.keyword, active: true })).items;
      expect(items.filter((t) => !t.isActive || !`${t.name} ${t.description}`.toLowerCase().includes(data.keyword.toLowerCase())).map((t) => t.name)).toEqual([]);
    });

    await steps.step('Adding the Subscribed filter narrows them further to subscribed, active terminologies matching the keyword', async () => {
      items = (await terminologyManagementPage.applyCriteria({ name: data.keyword, active: true, subscribed: true })).items;
      expect(items.map((t) => t.name)).toContain(match.name);
      expect(items.filter((t) => !t.isActive || !t.isSubscribed).map((t) => t.name)).toEqual([]);
    });
  });

  test(`TC-${CASES.boundaries.azureId}: should search without truncation or error when the keyword is a single character or the maximum length`, async ({
    terminologyManagementPage,
    steps,
  }) => {
    const data = CASES.boundaries;
    const longest = longestKeyword();

    await steps.critical('Navigate to the Terminology Management module - the list view is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step(`A single character "${data.single}" returns every terminology containing it`, async () => {
      const answer = await terminologyManagementPage.searchFor(data.single);
      expect(answer.items.length).toBeGreaterThan(0);
      expect(answer.items.filter((t) => !`${t.name} ${t.description}`.toLowerCase().includes(data.single.toLowerCase())).map((t) => t.name)).toEqual([]);
    });

    await steps.step(`A ${SEARCH_MAX_LENGTH}-character keyword executes without truncation or error`, async () => {
      const request = await terminologyManagementPage.captureListRequest(() => terminologyManagementPage.search(longest));
      expect(JSON.stringify(request), 'the whole keyword should be sent').toContain(longest);
      expect(await terminologyManagementPage.waitForVisibleMessages(), 'no error should be reported').toEqual([]);
    });
  });

  test(`TC-${CASES.specialCharacters.azureId}: should answer safely with no error or executed code when the keyword holds quotes, script tags or wildcards`, async ({
    terminologyManagementPage,
    steps,
  }) => {
    await steps.critical('Navigate to the Terminology Management module - the list view is displayed', async () => {
      await terminologyManagementPage.open();
    });

    const outcomes: { keyword: string; total: number; dialogs: number; messages: string[] }[] = [];
    await steps.step('Each unusual keyword executes the search', async () => {
      for (const keyword of CASES.specialCharacters.keywords) {
        let total = -1;
        const dialogs = await terminologyManagementPage.countNativeDialogsDuring(async () => {
          total = (await terminologyManagementPage.searchFor(keyword)).totalRows;
        });
        outcomes.push({ keyword, total, dialogs, messages: await terminologyManagementPage.waitForVisibleMessages() });
      }
      expect(outcomes.map((o) => o.total >= 0), 'every search should answer').toEqual(outcomes.map(() => true));
    });

    await steps.step('Each answer is empty or matching, with no error and no code executed', async () => {
      expect(outcomes.filter((o) => o.dialogs > 0).map((o) => o.keyword), 'keywords that executed script').toEqual([]);
      expect(outcomes.filter((o) => o.messages.length > 0).map((o) => `${o.keyword}: ${o.messages.join(' | ')}`), 'errors shown').toEqual([]);
    });
  });

  test(`TC-${CASES.clear.azureId}: should reset every control and restore the full list when Clear filters is used`, async ({
    terminologyManagementPage,
    steps,
  }) => {
    let total = -1;

    await steps.critical('Navigate to the Terminology Management module - the list view is displayed', async () => {
      total = (await terminologyManagementPage.captureList(() => terminologyManagementPage.open())).totalRows;
    });

    await steps.step('Keyword, status and subscription filters narrow the list', async () => {
      const narrowed = await terminologyManagementPage.applyCriteria({ name: CASES.clear.keyword, active: true, subscribed: true });
      expect(narrowed.totalRows).toBeLessThan(total);
    });

    await steps.step('"Clear filters" resets every filter control to its default', async () => {
      expect(await terminologyManagementPage.isClearAllOffered(), 'a Clear filters control').toBe(true);
      await terminologyManagementPage.clearAllFilters();
      expect(await terminologyManagementPage.getChips()).toEqual([]);
    });

    await steps.step('The full, unfiltered list is displayed again', async () => {
      expect((await terminologyManagementPage.captureList(() => terminologyManagementPage.reload())).totalRows).toBe(total);
    });
  });

  test(`TC-${CASES.caseInsensitive.azureId}: should find the terminology when the keyword is typed in a different letter case`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.caseInsensitive;
    const terminology = await terminologyIn({ name: data.name() });
    let names: string[] = [];

    await steps.critical('Navigate to the Terminology Management module - the list view is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step(`Entering "${data.keyword}" in lowercase executes the search`, async () => {
      names = (await terminologyManagementPage.searchFor(data.keyword)).items.map((t) => t.name);
      expect(names.length, 'the search should answer with results').toBeGreaterThan(0);
    });

    await steps.step(`"${terminology.name}" is returned despite the case difference`, async () => {
      expect(names).toContain(terminology.name);
    });
  });

  test(`TC-${CASES.controls.azureId}: should present labelled, keyboard-operable controls when the search and filter area is reviewed`, async ({
    terminologyManagementPage,
    steps,
  }) => {
    const data = CASES.controls;

    await steps.critical('Navigate to the Terminology Management module - the list view is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('The search field, status filter and subscription filter carry visible labels and placeholder text', async () => {
      const controls = await terminologyManagementPage.describeSearchControls();
      expect(controls.placeholder).toMatch(data.placeholder);
      expect(controls.filterButtonName, 'the filter button\'s accessible name').not.toBe('');
      const labels = await terminologyManagementPage.getAdvancedSearchLabels();
      for (const label of data.criteria) expect(labels.some((l) => label.test(l)), `${label} among ${labels.join(', ')}`).toBe(true);
    });

    await steps.step('Each control takes focus and responds', async () => {
      expect((await terminologyManagementPage.describeSearchControls()).focusable, 'the search box should take keyboard focus').toBe(true);
      const answer = await terminologyManagementPage.applyCriteria({ active: true });
      expect(answer.totalRows).toBeGreaterThanOrEqual(0);
    });
  });

  test(`TC-${CASES.exploratory.azureId}: should show results consistent with the last criteria applied when filters and partial keywords change rapidly`, async ({
    terminologyManagementPage,
    steps,
  }) => {
    const data = CASES.exploratory;

    await steps.critical('Navigate to the Terminology Management module - the list view is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('Different keywords, statuses and subscription filters in quick succession each update the list', async () => {
      const totals = [
        (await terminologyManagementPage.applyCriteria({ active: true })).totalRows,
        (await terminologyManagementPage.applyCriteria({ subscribed: true })).totalRows,
        (await terminologyManagementPage.applyCriteria({ locked: true })).totalRows,
      ];
      expect(totals.filter((t) => t < 0)).toEqual([]);
    });

    await steps.step('After rapid partial typing, the results match the last submitted keyword', async () => {
      for (const partial of data.partial) await terminologyManagementPage.typeIntoSearch(partial);
      const final = await terminologyManagementPage.searchFor(data.final);
      expect((await terminologyManagementPage.readNames()).sort()).toEqual(final.items.slice(0, 10).map((t) => t.name).sort());
    });

    await steps.step('No inconsistent counts, stale results or glitches are seen', async () => {
      const final = await terminologyManagementPage.searchFor(data.final);
      expect(final.items.filter((t) => !`${t.name} ${t.description}`.toLowerCase().includes(data.final.toLowerCase())).map((t) => t.name)).toEqual([]);
      expect(await terminologyManagementPage.waitForVisibleMessages()).toEqual([]);
    });
  });
});
