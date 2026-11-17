import { test, expect } from '../../../fixtures';
import { listTriggers, type TriggerRecord } from '../../../utils/notification/notificationApi';
import { WriterATriggers, makeSuiteTrigger } from '../../../utils/notification/writerAHelpers';
import type { ListAnswer } from '../../../pages/notification/NotificationCenterPage';
import { ACTIVE_MARK, CASES, CHIP, DENIED_STATUSES, EMPTY_TEXT, FILTER_FIELDS, LIST_KEYS, LONG_TEXT, VIEWER_RIGHTS, YES } from '../../../data/notification/searchAndFilterTriggers.data';

/**
 * User story 20985: Search and Filter Triggers - the search box, the filter
 * drawer and its chips, Clear All, and a user without the list right. Triggers
 * are only read, plus the suite's own triggers made for the case on free
 * actions (deleted at teardown).
 */
test.describe('US 20985 - Search and Filter Triggers', () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.searchPart.azureId}: should list only the triggers whose name contains the searched text`, async ({ page, steps, suiteTriggers }) => {
    const d = CASES.searchPart;
    const view = new WriterATriggers(page);
    const made: TriggerRecord[] = [];
    let answer: ListAnswer | null = null;

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the trigger list is displayed', async () => {
      for (const label of d.labels) made.push(await makeSuiteTrigger(page, suiteTriggers, { label }));
      await view.tab.open();
      await expect(view.tab.searchInput(), 'the search box').toBeVisible();
    });

    await steps.step('Enter "Order" into the Search field - the search executes', async () => {
      answer = await view.tab.search(d.term);
      expect({ status: answer?.status, searchText: answer?.request.searchText }, 'GetTriggers for the search').toEqual({ status: 200, searchText: d.term });
    });

    await steps.step('Review the results list - only triggers containing "Order" in their name are displayed', async () => {
      const names = await view.tab.column('name');
      const ids = await view.tab.rowIds();
      expect(names.filter((n) => !n.toLowerCase().includes(d.term.toLowerCase())), `rows without "${d.term}" (${JSON.stringify(names)})`).toEqual([]);
      expect({ order1: ids.includes(made[0].id), order2: ids.includes(made[1].id), payment: ids.includes(made[2].id) }, 'the suite triggers among the results')
        .toEqual({ order1: true, order2: true, payment: false });
    });
  });

  test(`TC-${CASES.searchNoMatch.azureId}: should show an empty list with the no-records message when no trigger name matches`, async ({ page, steps }) => {
    const view = new WriterATriggers(page);
    let answer: ListAnswer | null = null;

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the trigger list is displayed', async () => {
      await view.tab.open();
      await expect(view.tab.searchInput(), 'the search box').toBeVisible();
    });

    await steps.step('Enter "Zyxqq" into the Search field - search executes', async () => {
      answer = await view.tab.search(CASES.searchNoMatch.term);
      expect(answer?.status, 'GetTriggers for the search').toBe(200);
    });

    await steps.step('Review results - an empty results list with a "no results found" message is displayed', async () => {
      expect({ rows: await view.tab.rowIds(), total: answer?.totalRows }, 'the results').toEqual({ rows: [], total: 0 });
      await expect(view.tab.emptyState(), 'the empty state').toHaveText(EMPTY_TEXT);
    });
  });

  test(`TC-${CASES.searchLong.azureId}: should accept a 255-character search text and answer with an empty list without errors`, async ({ page, steps }) => {
    const view = new WriterATriggers(page);
    let answer: ListAnswer | null = null;
    let toast = '';

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the trigger list is displayed', async () => {
      await view.tab.open();
      await expect(view.tab.searchInput(), 'the search box').toBeVisible();
    });

    await steps.step('Enter a 255-character text string into Search - input is accepted without a truncation error', async () => {
      answer = await view.tab.search(LONG_TEXT);
      toast = await view.tab.toastText(2_500);
      await expect(view.tab.searchInput(), 'the search box').toHaveValue(LONG_TEXT);
      expect(LONG_TEXT.length, 'the TC text length').toBe(CASES.searchLong.length);
    });

    await steps.step('Review results - an empty results list is displayed without any system error', async () => {
      expect({ status: answer?.status, toast, rows: await view.tab.rowIds() }, 'GetTriggers, the toast and the rows').toEqual({ status: 200, toast: '', rows: [] });
      await expect(view.tab.emptyState(), 'the empty state').toHaveText(EMPTY_TEXT);
    });
  });

  test(`TC-${CASES.filterName.azureId}: should filter the list to the trigger named in the Name filter and show its chip`, async ({ page, steps, suiteTriggers }) => {
    const view = new WriterATriggers(page);
    let trigger!: TriggerRecord;

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the trigger list is displayed', async () => {
      await makeSuiteTrigger(page, suiteTriggers);
      trigger = await makeSuiteTrigger(page, suiteTriggers, { label: CASES.filterName.label });
      await view.tab.open();
      await expect(view.tab.searchInput(), 'the search box').toBeVisible();
    });

    await steps.step('Open Advanced Search - the filter panel shows Name, Module, Action, Recipient, Predefined and Active', async () => {
      await view.tab.openFilter();
      const shown: Record<string, boolean> = {};
      for (const key of FILTER_FIELDS) shown[key] = await view.tab.filterField(key).isVisible();
      expect(shown, 'the filter fields').toEqual(Object.fromEntries(FILTER_FIELDS.map((k) => [k, true])));
    });

    await steps.step('Enter the name in the Name filter and apply - only the matching trigger is listed and a chip with the name appears', async () => {
      await view.tab.setFilter('name', trigger.name);
      const answer = await view.tab.applyFilter();
      expect(await view.tab.rowIds(), `the rows (GetTriggers ${answer?.status}, ${JSON.stringify(answer?.request)})`).toEqual([trigger.id]);
      const chips = await view.tab.chips();
      expect(Object.values(chips).some((c) => c.includes(trigger.name)), `a chip with "${trigger.name}" (chips ${JSON.stringify(chips)})`).toBe(true);
    });
  });

  test(`TC-${CASES.filterPredefined.azureId}: should list only the predefined triggers with a "Predefined: Yes" chip`, async ({ page, steps }) => {
    const view = new WriterATriggers(page);
    let answer: ListAnswer | null = null;

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the trigger list is displayed', async () => {
      await view.tab.open();
      await expect(view.tab.searchInput(), 'the search box').toBeVisible();
    });

    await steps.step('Open Advanced Search and set Predefined = "Yes" - the filter is applied', async () => {
      answer = await view.tab.filter({ ispredefined: YES });
      expect(answer?.status, 'GetTriggers for the filter').toBe(200);
    });

    await steps.step('Review results - only predefined triggers with a lock badge are shown and a "Predefined: Yes" chip is displayed', async () => {
      const ids = await view.tab.rowIds();
      const badges: string[] = [];
      for (const id of ids) badges.push((await view.tab.predefinedBadge(id).isVisible()) ? 'badge' : `no badge ${id}`);
      const expected = (await listTriggers(page)).items.filter((t) => t.isPredefined).length;
      expect({ badges: badges.filter((b) => b !== 'badge'), count: ids.length }, 'rows without the predefined badge, and the row count').toEqual({ badges: [], count: expected });
      expect((await view.tab.chips()).ispredefined, 'the chip').toBe(CHIP.predefinedYes);
    });
  });

  test(`TC-${CASES.filterActive.azureId}: should list only the active triggers with an "Active" chip`, async ({ page, steps, suiteTriggers }) => {
    const view = new WriterATriggers(page);
    const own = { active: null as TriggerRecord | null, inactive: null as TriggerRecord | null };
    let answer: ListAnswer | null = null;

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the trigger list is displayed (active and inactive triggers exist)', async () => {
      own.active = await makeSuiteTrigger(page, suiteTriggers, { isActive: true });
      own.inactive = await makeSuiteTrigger(page, suiteTriggers, { isActive: false });
      await view.tab.open();
      await expect(view.tab.searchInput(), 'the search box').toBeVisible();
    });

    await steps.step('Open Advanced Search and set Active = "Active" (Yes) - the filter is applied', async () => {
      answer = await view.tab.filter({ isactive: YES });
      expect(answer?.status, 'GetTriggers for the filter').toBe(200);
    });

    await steps.step('Review results - only triggers with Active status are shown and an "Active" chip is displayed', async () => {
      const marks = await view.tab.column('active');
      const answered = (answer?.items ?? []).map((i) => ({ id: String(i.id), isActive: i.isActive === true }));
      expect({ inactiveRows: marks.filter((m) => m !== ACTIVE_MARK).length, inactiveAnswered: answered.filter((i) => !i.isActive).length }, `the Active cells (${JSON.stringify(marks)})`)
        .toEqual({ inactiveRows: 0, inactiveAnswered: 0 });
      expect(answered.some((i) => i.id === own.inactive?.id), 'the inactive suite trigger among the results').toBe(false);
      expect((await view.tab.chips()).isactive, 'the chip').toBe(CHIP.activeYes);
    });
  });

  test(`TC-${CASES.clearAll.azureId}: should remove every chip and restore the full list when Clear All is clicked`, async ({ page, steps }) => {
    const view = new WriterATriggers(page);
    let total = 0;
    let cleared: ListAnswer | null = null;

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the trigger list is displayed (several filters applied as chips)', async () => {
      total = (await listTriggers(page)).totalRows;
      await view.tab.open();
      await view.tab.filter({ ispredefined: YES, isactive: YES });
      const chips = await view.tab.chips();
      expect(Object.keys(chips).sort(), 'the chips').toEqual(['isactive', 'ispredefined']);
    });

    await steps.step('With several chips displayed, click Clear All - all chips are removed', async () => {
      cleared = await view.clearAll();
      expect({ status: cleared?.status, chips: await view.tab.chips() }, 'GetTriggers and the chips after Clear All').toEqual({ status: 200, chips: {} });
    });

    await steps.step('Review the results list - the full, unfiltered trigger list is restored', async () => {
      const shown = await view.tab.rowIds();
      expect({ rowsOnPage: shown.length, total: cleared?.totalRows, criteria: Object.entries(cleared?.request ?? {}).filter(([k, v]) => !LIST_KEYS.includes(k) && v !== null && v !== undefined && v !== '').map(([k]) => k) }, `the list after Clear All (GetTriggers with no criteria: ${total})`)
        .toEqual({ rowsOnPage: Math.min(total, 10), total, criteria: [] });
    });
  });

  test(`TC-${CASES.searchAndFilter.azureId}: should apply the search text and the Active filter together`, async ({ page, steps, suiteTriggers }) => {
    const d = CASES.searchAndFilter;
    const view = new WriterATriggers(page);
    const own = { active: null as TriggerRecord | null, inactive: null as TriggerRecord | null };
    let answer: ListAnswer | null = null;

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the trigger list is displayed', async () => {
      own.active = await makeSuiteTrigger(page, suiteTriggers, { label: d.activeLabel, isActive: true });
      own.inactive = await makeSuiteTrigger(page, suiteTriggers, { label: d.inactiveLabel, isActive: false });
      await view.tab.open();
      await expect(view.tab.searchInput(), 'the search box').toBeVisible();
    });

    await steps.step('Enter "Order" in the Search box, then apply Active = "Active" (Yes) - both the text search and the filter chip are applied', async () => {
      await view.tab.search(d.term);
      answer = await view.tab.filter({ isactive: YES });
      const chips = await view.tab.chips();
      expect({ searchText: answer?.request.searchText, activeChip: chips.isactive, searchChip: Object.keys(chips).includes('search') }, `the request and chips (${JSON.stringify(chips)})`)
        .toEqual({ searchText: d.term, activeChip: CHIP.activeYes, searchChip: true });
    });

    await steps.step('Review results - only active triggers whose name contains "Order" are displayed', async () => {
      const rows = await view.tab.readRows(['name', 'active']);
      expect(rows.filter((r) => !r.name.toLowerCase().includes(d.term.toLowerCase()) || r.active !== ACTIVE_MARK), `rows breaking either rule (${JSON.stringify(rows)})`).toEqual([]);
      expect({ active: rows.some((r) => r.id === own.active?.id), inactive: rows.some((r) => r.id === own.inactive?.id) }, 'the suite triggers among the results').toEqual({ active: true, inactive: false });
    });
  });

  test(`TC-${CASES.noPermission.azureId}: should deny trigger search and filter to a user without the trigger list right`, async ({ page, steps, secondUser }) => {
    const view = new WriterATriggers(page);

    await steps.critical('Baseline: careconnect (Admin) has the trigger search box and the filter button', async () => {
      const admin = await view.probeTriggersTab();
      expect({ status: admin.listStatus, search: admin.searchVisible, filter: admin.filterVisible }, 'the administrator\'s Triggers tab').toEqual({ status: 200, search: true, filter: true });
    });

    await steps.step('Navigate to the Notification Center Management module as the restricted user - the module loads if accessible, or access is denied per role', async () => {
      await secondUser.withRights(VIEWER_RIGHTS);
      const restricted = await new WriterATriggers(secondUser.page).probeTriggersTab();
      expect(restricted.listStatus === 200 && restricted.tableVisible, `the restricted user's Triggers list (${JSON.stringify(restricted)})`).toBe(false);
    });

    await steps.step('Attempt to use the Search field or open Advanced Search - the fields are disabled, hidden, or access is denied', async () => {
      const restricted = await new WriterATriggers(secondUser.page).probeTriggersTab();
      const blocked = DENIED_STATUSES.includes(restricted.listStatus) || (!(restricted.searchVisible && restricted.searchEnabled) && !restricted.filterVisible);
      expect(blocked, `search / filter for the user without TriggersConfiguration.GetTriggers (${JSON.stringify(restricted)})`).toBe(true);
    });
  });
});
