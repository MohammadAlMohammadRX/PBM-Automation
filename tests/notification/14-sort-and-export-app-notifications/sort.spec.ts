import { test, expect } from '../../../fixtures';
import type { ListAnswer } from '../../../pages/notification/NotificationCenterPage';
import { WriterADefinitions, definitionsPage, directionOf, firstOutOfOrder, isGrouped, pause } from '../../../utils/notification/writerAHelpers';
import { CASES, CREATED_APART_MS, DEFAULT_SORT, OLDEST_SORT_BY, SORT_KEY, SORT_LABELS, SUITE_DEFINITION } from '../../../data/notification/sortAndExportAppNotifications.data';

/**
 * User story 20998: Sort and Export App Notifications - the Sort By options.
 * Definitions are only read, plus two suite App Notifications made in the test
 * (Network Management, audience careconnect; deleted at teardown).
 */
test.describe('US 20998 - Sort and Export App Notifications', () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.newestDefault.azureId}: should show the most recently created notification first when no sort is chosen`, async ({ page, steps, suiteDefinitions }) => {
    const list = new WriterADefinitions(page);
    const made = { older: { id: '', name: '' }, newer: { id: '', name: '' } };
    let answer: ListAnswer | null = null;

    await steps.critical('Navigate to the Notification Center Management module - the App Notification list screen loads', async () => {
      made.older = await suiteDefinitions.create({ moduleId: SUITE_DEFINITION.moduleId, actionId: SUITE_DEFINITION.olderAction, name: suiteDefinitions.newName('older') });
      await pause(CREATED_APART_MS);
      made.newer = await suiteDefinitions.create({ moduleId: SUITE_DEFINITION.moduleId, actionId: SUITE_DEFINITION.newerAction, name: suiteDefinitions.newName('newer') });
      answer = await list.open();
      expect(answer?.status, 'GetDefinitions').toBe(200);
    });

    await steps.step('Observe the list order without selecting any Sort By option - notifications are ordered by creation date', async () => {
      expect({ label: await list.sortLabel(), sortBy: answer?.request.sortBy }, 'the default sort').toEqual(DEFAULT_SORT);
    });

    await steps.step('Compare the top record against the others - the most recently created notification appears first', async () => {
      const ids = await list.rowIds();
      expect({ first: ids[0], newerAboveOlder: ids.indexOf(made.newer.id) >= 0 && ids.indexOf(made.newer.id) < ids.indexOf(made.older.id) }, `page 1 (${made.newer.name} made after ${made.older.name})`)
        .toEqual({ first: made.newer.id, newerAboveOlder: true });
    });
  });

  test(`TC-${CASES.sortName.azureId}: should offer the sort options and reorder the list alphabetically by Name`, async ({ page, steps, suiteDefinitions }) => {
    const list = new WriterADefinitions(page);

    await steps.critical('Navigate to the Notification Center Management module - the App Notification list screen loads showing existing notifications', async () => {
      await suiteDefinitions.create({ moduleId: SUITE_DEFINITION.moduleId, actionId: SUITE_DEFINITION.olderAction, name: suiteDefinitions.newName('alpha') });
      await suiteDefinitions.create({ moduleId: SUITE_DEFINITION.moduleId, actionId: SUITE_DEFINITION.newerAction, name: suiteDefinitions.newName('beta') });
      await list.open();
      expect((await list.rowIds()).length, 'rows on page 1').toBeGreaterThan(1);
    });

    await steps.step('Open the Sort By dropdown - options Name, Module, Action, Active status, Date created (Newest/Oldest) are displayed', async () => {
      const labels = await list.sortOptionLabelsClosed();
      expect(SORT_LABELS.filter((l) => !labels.includes(l)), `sort options missing (offered ${JSON.stringify(labels)})`).toEqual([]);
    });

    await steps.step('Select "Name" - the list refreshes and notifications are reordered alphabetically by Name', async () => {
      const answer = await list.sortBy(SORT_KEY.name);
      const names = await list.column('name');
      expect({ status: answer?.status, sortBy: String(answer?.request.sortBy ?? '').split(' ')[0] }, 'GetDefinitions for the sort').toEqual({ status: 200, sortBy: 'Name' });
      expect(firstOutOfOrder(names, directionOf(answer?.request ?? {})), `the Name column (${directionOf(answer?.request ?? {}) || 'asc'}) ${JSON.stringify(names)}`).toBe(-1);
    });
  });

  test(`TC-${CASES.sortModule.azureId}: should reorder the list grouping notifications by Module`, async ({ page, steps }) => {
    const list = new WriterADefinitions(page);

    await steps.critical('Navigate to the Notification Center Management module - the App Notification list screen loads', async () => {
      await list.open();
      expect((await list.rowIds()).length, 'rows on page 1').toBeGreaterThan(1);
    });

    await steps.step('Open the Sort By dropdown and select "Module" - the list reorders grouping notifications by Module value', async () => {
      const answer = await list.sortBy(SORT_KEY.module);
      const modules = await list.column('module');
      expect({ status: answer?.status, ordered: firstOutOfOrder(modules, directionOf(answer?.request ?? {})), grouped: isGrouped(modules) }, `the Module column (sortBy "${String(answer?.request.sortBy)}") ${JSON.stringify(modules)}`)
        .toEqual({ status: 200, ordered: -1, grouped: true });
    });
  });

  test(`TC-${CASES.sortAction.azureId}: should reorder the list by Action`, async ({ page, steps }) => {
    const list = new WriterADefinitions(page);

    await steps.critical('Navigate to the Notification Center Management module - the App Notification list screen loads', async () => {
      await list.open();
      expect((await list.rowIds()).length, 'rows on page 1').toBeGreaterThan(1);
    });

    await steps.step('Open the Sort By dropdown and select "Action" - the list reorders by Action value', async () => {
      const answer = await list.sortBy(SORT_KEY.action);
      const actions = await list.column('action');
      expect({ status: answer?.status, ordered: firstOutOfOrder(actions, directionOf(answer?.request ?? {})) }, `the Action column (sortBy "${String(answer?.request.sortBy)}") ${JSON.stringify(actions)}`)
        .toEqual({ status: 200, ordered: -1 });
    });
  });

  test(`TC-${CASES.sortActive.azureId}: should group active and inactive notifications when sorted by Active status`, async ({ page, steps, suiteDefinitions }) => {
    const list = new WriterADefinitions(page);

    await steps.critical('Navigate to the Notification Center Management module - the App Notification list screen loads (active and inactive notifications exist)', async () => {
      await suiteDefinitions.create({ moduleId: SUITE_DEFINITION.moduleId, actionId: SUITE_DEFINITION.olderAction, name: suiteDefinitions.newName('inactive'), isActive: false });
      await suiteDefinitions.create({ moduleId: SUITE_DEFINITION.moduleId, actionId: SUITE_DEFINITION.newerAction, name: suiteDefinitions.newName('active'), isActive: true });
      await list.open();
      expect((await list.rowIds()).length, 'rows on page 1').toBeGreaterThan(1);
    });

    await steps.step('Open the Sort By dropdown and select "Active status" - the list reorders grouping active and inactive notifications together', async () => {
      const answer = await list.sortBy(SORT_KEY.active);
      const marks = await list.column('active');
      const answered = (answer?.items ?? []).map((i) => String(i.isActive));
      // The whole list in the same order (page 1 alone may hold one state only - then grouping proves nothing).
      const whole = (await definitionsPage(page, { ...(answer?.request ?? {}) })).items.map((i) => String(i.isActive));
      expect({ status: answer?.status, screenGrouped: isGrouped(marks), answerGrouped: isGrouped(answered), wholeListGrouped: isGrouped(whole), bothStates: new Set(whole).size },
        `the Active column (sortBy "${String(answer?.request.sortBy)}") page 1 ${JSON.stringify(marks)}; whole list ${JSON.stringify(whole)}`)
        .toEqual({ status: 200, screenGrouped: true, answerGrouped: true, wholeListGrouped: true, bothStates: 2 });
    });
  });

  test(`TC-${CASES.sortOldest.azureId}: should show the oldest notification first when "Oldest" is chosen`, async ({ page, steps, suiteDefinitions }) => {
    const list = new WriterADefinitions(page);
    const made = { older: { id: '', name: '' }, newer: { id: '', name: '' } };
    let answer: ListAnswer | null = null;

    await steps.critical('Navigate to the Notification Center Management module - the App Notification list screen loads with newest first by default', async () => {
      made.older = await suiteDefinitions.create({ moduleId: SUITE_DEFINITION.moduleId, actionId: SUITE_DEFINITION.olderAction, name: suiteDefinitions.newName('older') });
      await pause(CREATED_APART_MS);
      made.newer = await suiteDefinitions.create({ moduleId: SUITE_DEFINITION.moduleId, actionId: SUITE_DEFINITION.newerAction, name: suiteDefinitions.newName('newer') });
      await list.open();
      expect(await list.sortLabel(), 'the default sort').toBe(DEFAULT_SORT.label);
    });

    await steps.step('Open the Sort By dropdown and select "Date created - Oldest" - the list refreshes', async () => {
      answer = await list.sortBy(SORT_KEY.oldest);
      expect({ status: answer?.status, sortBy: answer?.request.sortBy }, 'GetDefinitions for Oldest').toEqual({ status: 200, sortBy: OLDEST_SORT_BY });
    });

    await steps.step('Verify the top record - the oldest notification by creation date now appears first', async () => {
      const ascending = (await definitionsPage(page, { sortBy: OLDEST_SORT_BY })).items.map((i) => i.id);
      const ids = await list.rowIds();
      expect({ page1: ids, olderBeforeNewer: ascending.indexOf(made.older.id) < ascending.indexOf(made.newer.id), suiteNotFirst: ![made.older.id, made.newer.id].includes(ids[0]) }, 'page 1 against GetDefinitions "CreatedOn asc"')
        .toEqual({ page1: ascending.slice(0, ids.length), olderBeforeNewer: true, suiteNotFirst: true });
    });
  });
});
