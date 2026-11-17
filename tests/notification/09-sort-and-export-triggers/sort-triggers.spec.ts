import { test, expect } from '../../../fixtures';
import type { ListAnswer } from '../../../pages/notification/NotificationCenterPage';
import { PREDEFINED_TRIGGER, readTrigger } from '../../../utils/notification/notificationApi';
import { TriggerListView, answerIds, directionOf, firstOutOfOrder, splitGroups, triggerIdsSorted } from '../../../utils/notification/writerBHelpers';
import {
  ACTIVE_MARK,
  CASES,
  CUSTOM_PREDEFINED_TEXT,
  PREDEFINED_TEXT,
  SORT,
  SORT_BY,
  SORT_EXPORT_STORY,
} from '../../../data/notification/sortAndExportTriggers.data';

/**
 * US 20986 - Sort and Export Triggers: the Sort By menu (newest / oldest and the
 * columns) and the predefined lock badge. Every sort waits for the list's OWN
 * answer and the screen order is compared with it; column sorts are read in
 * ascending order (see the data file for the readings).
 */
test.describe(`US ${SORT_EXPORT_STORY.id} - ${SORT_EXPORT_STORY.title}`, () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.defaultNewest.azureId}: should list the most recently created trigger first when the list opens without a sort`, async ({ steps, page, suiteTriggers }) => {
    const list = new TriggerListView(page);
    const made = { first: '', second: '' };
    let opened: ListAnswer | null = null;

    await steps.critical('Precondition: two suite triggers are created one after the other', async () => {
      made.first = (await suiteTriggers.create()).id;
      made.second = (await suiteTriggers.create()).id;
      expect(made.second, 'two distinct triggers').not.toBe(made.first);
    });

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the trigger list is displayed', async () => {
      opened = await list.open();
      await expect(list.rows().first(), 'the trigger list rows').toBeVisible();
    });

    await steps.step('Observe the default order without applying any Sort By option - the most recently created trigger is listed first (newest first by default)', async () => {
      const ids = await list.rowIds();
      expect.soft(String(opened?.request.sortBy), 'the order the list asked for when it opened').toBe(SORT_BY.newest);
      expect.soft(ids, 'the screen order equals the list answer').toEqual(answerIds(opened));
      expect.soft(ids, 'the screen order equals every trigger sorted by creation, newest first (API)').toEqual((await triggerIdsSorted(page, SORT_BY.newest)).slice(0, ids.length));
      expect(ids.slice(0, 2), 'the later suite trigger first, then the earlier one').toEqual([made.second, made.first]);
    });
  });

  test(`TC-${CASES.sortName.azureId}: should list the triggers alphabetically by Name when Sort By Name is chosen`, async ({ steps, page }) => {
    const list = new TriggerListView(page);
    let sorted: ListAnswer | null = null;

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the trigger list is displayed', async () => {
      await list.open();
      await expect(list.rows().first(), 'the trigger list rows').toBeVisible();
    });

    await steps.step('Open Sort By and select "Name" - the sort option is applied', async () => {
      sorted = await list.sortAscending(SORT.name.key);
      expect.soft(sorted?.status, 'the sorted list answer').toBe(200);
      expect.soft(directionOf(sorted), `the direction asked (sortBy "${String(sorted?.request.sortBy)}")`).toBe('asc');
      expect(await list.sortLabel(), 'the Sort By control').toContain(SORT.name.label);
    });

    await steps.step('Review the list order - triggers are listed alphabetically by Name', async () => {
      const names = await list.column(SORT.name.column);
      expect.soft(await list.rowIds(), 'the screen order equals the sorted answer').toEqual(answerIds(sorted));
      expect(firstOutOfOrder(names), `names on the page: ${names.join(' | ')}`).toBeNull();
    });
  });

  test(`TC-${CASES.sortModule.azureId}: should group the triggers by Module when Sort By Module is chosen`, async ({ steps, page }) => {
    const list = new TriggerListView(page);
    let sorted: ListAnswer | null = null;

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the trigger list is displayed', async () => {
      await list.open();
      await expect(list.rows().first(), 'the trigger list rows').toBeVisible();
    });

    await steps.step('Open Sort By and select "Module" - the sort option is applied', async () => {
      sorted = await list.sortAscending(SORT.module.key);
      expect.soft(sorted?.status, 'the sorted list answer').toBe(200);
      expect(await list.sortLabel(), 'the Sort By control').toContain(SORT.module.label);
    });

    await steps.step('Review the list order - triggers are grouped / ordered by Module value', async () => {
      const modules = await list.column(SORT.module.column);
      expect.soft(await list.rowIds(), 'the screen order equals the sorted answer').toEqual(answerIds(sorted));
      expect(splitGroups(modules), `modules on the page: ${modules.join(' | ')} - a module listed in more than one run`).toEqual([]);
    });
  });

  test(`TC-${CASES.sortRecipient.azureId}: should order the triggers by Recipient when Sort By Recipient is chosen`, async ({ steps, page }) => {
    const list = new TriggerListView(page);
    let sorted: ListAnswer | null = null;

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the trigger list is displayed', async () => {
      await list.open();
      await expect(list.rows().first(), 'the trigger list rows').toBeVisible();
    });

    await steps.step('Open Sort By and select "Recipient" - the sort option is applied', async () => {
      sorted = await list.sortAscending(SORT.recipient.key);
      expect.soft(sorted?.status, 'the sorted list answer').toBe(200);
      expect(await list.sortLabel(), 'the Sort By control').toContain(SORT.recipient.label);
    });

    await steps.step('Review the list order - triggers are ordered by Recipient value', async () => {
      const recipients = await list.column(SORT.recipient.column);
      expect.soft(await list.rowIds(), 'the screen order equals the sorted answer').toEqual(answerIds(sorted));
      expect(firstOutOfOrder(recipients), `recipients on the page: ${recipients.join(' | ')}`).toBeNull();
    });
  });

  test(`TC-${CASES.sortAction.azureId}: should order the triggers by Action when Sort By Action is chosen`, async ({ steps, page }) => {
    const list = new TriggerListView(page);
    let sorted: ListAnswer | null = null;

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the trigger list is displayed', async () => {
      await list.open();
      await expect(list.rows().first(), 'the trigger list rows').toBeVisible();
    });

    await steps.step('Open Sort By and select "Action" - the sort option is applied', async () => {
      sorted = await list.sortAscending(SORT.action.key);
      expect.soft(sorted?.status, 'the sorted list answer').toBe(200);
      expect(await list.sortLabel(), 'the Sort By control').toContain(SORT.action.label);
    });

    await steps.step('Review the list order - triggers are ordered by Action value', async () => {
      const actions = await list.column(SORT.action.column);
      expect.soft(await list.rowIds(), 'the screen order equals the sorted answer').toEqual(answerIds(sorted));
      expect(firstOutOfOrder(actions), `actions on the page: ${actions.join(' | ')}`).toBeNull();
    });
  });

  test(`TC-${CASES.sortActive.azureId}: should group active and inactive triggers together when Sort By Active is chosen`, async ({ steps, page, suiteTriggers }) => {
    const list = new TriggerListView(page);
    let sorted: ListAnswer | null = null;

    await steps.critical('Precondition: an inactive suite trigger exists beside the active ones', async () => {
      const inactive = await suiteTriggers.create({ isActive: false });
      expect(inactive.isActive, 'the suite trigger is inactive').toBe(false);
    });

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the trigger list is displayed', async () => {
      await list.open();
      await expect(list.rows().first(), 'the trigger list rows').toBeVisible();
    });

    await steps.step('Open Sort By and select "Active" - the sort option is applied', async () => {
      sorted = await list.sortAscending(SORT.active.key);
      expect.soft(sorted?.status, 'the sorted list answer').toBe(200);
      expect(await list.sortLabel(), 'the Sort By control').toContain(SORT.active.label);
    });

    await steps.step('Review the list order - triggers are grouped / ordered by Active status', async () => {
      const marks = await list.column(SORT.active.column);
      expect.soft(await list.rowIds(), 'the screen order equals the sorted answer').toEqual(answerIds(sorted));
      expect.soft(marks, 'both states are on the page').toEqual(expect.arrayContaining([ACTIVE_MARK.yes, ACTIVE_MARK.no]));
      expect(splitGroups(marks), `Active cells on the page: ${marks.join(' ')} - a state listed in more than one run`).toEqual([]);
    });
  });

  test(`TC-${CASES.newestOldest.azureId}: should switch the list between oldest-first and newest-first when Sort By changes`, async ({ steps, page, suiteTriggers }) => {
    const list = new TriggerListView(page);
    const made = { first: '', second: '' };
    let opened: ListAnswer | null = null;
    let oldest: ListAnswer | null = null;

    await steps.critical('Precondition: two suite triggers are created one after the other', async () => {
      made.first = (await suiteTriggers.create()).id;
      made.second = (await suiteTriggers.create()).id;
      expect(made.second, 'two distinct triggers').not.toBe(made.first);
    });

    await steps.critical('Navigate to the Notification Center Management module - the module loads showing the default newest-first order', async () => {
      opened = await list.open();
      expect.soft(String(opened?.request.sortBy), 'the order the list asked for').toBe(SORT_BY.newest);
      expect((await list.rowIds()).slice(0, 2), 'the later suite trigger first').toEqual([made.second, made.first]);
    });

    await steps.step('Open Sort By and select "Oldest" - the sort order switches', async () => {
      oldest = await list.sortBy(SORT.oldest.key);
      expect.soft(await list.sortLabel(), 'the Sort By control').toContain(SORT.oldest.label);
      expect(String(oldest?.request.sortBy), 'the order the list asked for').toBe(SORT_BY.oldest);
    });

    await steps.step('Review the list - triggers are now ordered oldest first', async () => {
      const ids = await list.rowIds();
      const all = await triggerIdsSorted(page, SORT_BY.oldest);
      expect.soft(ids, 'the screen order equals the oldest-first answer').toEqual(answerIds(oldest));
      expect.soft(ids, 'the page equals every trigger sorted by creation, oldest first (API)').toEqual(all.slice(0, ids.length));
      expect(all.indexOf(made.first), 'the earlier suite trigger comes before the later one').toBeLessThan(all.indexOf(made.second));
    });

    await steps.step('Switch Sort By back to "Newest" - the list returns to newest-first order', async () => {
      const newest = await list.sortBy(SORT.newest.key);
      expect.soft(String(newest?.request.sortBy), 'the order the list asked for').toBe(SORT_BY.newest);
      expect((await list.rowIds()).slice(0, 2), 'the later suite trigger first again').toEqual([made.second, made.first]);
    });
  });

  test(`TC-${CASES.sortPredefined.azureId}: should group the predefined (locked) triggers together when Sort By Predefined is chosen`, async ({ steps, page, suiteTriggers }) => {
    const list = new TriggerListView(page);
    let sorted: ListAnswer | null = null;

    await steps.critical('Precondition: a custom suite trigger exists beside the predefined ones', async () => {
      const custom = await suiteTriggers.create();
      expect(custom.isPredefined, 'the suite trigger is custom').toBe(false);
    });

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the trigger list is displayed', async () => {
      await list.open();
      await expect(list.rows().first(), 'the trigger list rows').toBeVisible();
    });

    await steps.step('Open Sort By and select "Predefined" - the sort option is applied', async () => {
      sorted = await list.sortAscending(SORT.predefined.key);
      expect.soft(sorted?.status, 'the sorted list answer').toBe(200);
      expect(await list.sortLabel(), 'the Sort By control').toContain(SORT.predefined.label);
    });

    await steps.step('Review the list order - triggers are grouped by Predefined status with the locked triggers together', async () => {
      const cells = await list.column(SORT.predefined.column);
      expect.soft(await list.rowIds(), 'the screen order equals the sorted answer').toEqual(answerIds(sorted));
      expect.soft(cells, 'both kinds are on the page').toEqual(expect.arrayContaining([PREDEFINED_TEXT, CUSTOM_PREDEFINED_TEXT]));
      expect(splitGroups(cells), `Predefined cells on the page: ${cells.join(' | ')} - a kind listed in more than one run`).toEqual([]);
    });
  });

  test(`TC-${CASES.lockBadge.azureId}: should show the lock badge on a predefined trigger and none on a custom trigger`, async ({ steps, page, suiteTriggers }) => {
    const list = new TriggerListView(page);
    const custom = { id: '', name: '' };

    await steps.critical('Precondition: a custom suite trigger exists beside the predefined ones', async () => {
      const t = await suiteTriggers.create();
      custom.id = t.id;
      custom.name = t.name;
      expect(t.isPredefined, 'the suite trigger is custom').toBe(false);
    });

    await steps.critical('Navigate to the Notification Center Management module - the module loads and the trigger list is displayed', async () => {
      await list.open();
      await expect(list.rows().first(), 'the trigger list rows').toBeVisible();
    });

    await steps.step('Locate a predefined trigger in the Predefined column - a lock badge is shown', async () => {
      const name = (await readTrigger(page, PREDEFINED_TRIGGER.forgetPassword))?.name ?? '';
      await list.search(name);
      await expect.soft(list.predefinedNone(PREDEFINED_TRIGGER.forgetPassword), 'no "—" on a predefined row').toHaveCount(0);
      expect.soft((await readTrigger(page, PREDEFINED_TRIGGER.forgetPassword))?.isPredefined, 'the API flag').toBe(true);
      await expect(list.predefinedBadge(PREDEFINED_TRIGGER.forgetPassword), `the predefined badge on "${name}"`).toHaveText(PREDEFINED_TEXT);
    });

    await steps.step('Locate a custom, non-predefined trigger in the Predefined column - no lock badge is shown', async () => {
      await list.search(custom.name);
      await expect.soft(list.predefinedNone(custom.id), 'the custom row shows "—"').toHaveText(CUSTOM_PREDEFINED_TEXT);
      expect.soft((await readTrigger(page, custom.id))?.isPredefined, 'the API flag').toBe(false);
      await expect(list.predefinedBadge(custom.id), 'no predefined badge on the custom row').toHaveCount(0);
    });
  });
});
