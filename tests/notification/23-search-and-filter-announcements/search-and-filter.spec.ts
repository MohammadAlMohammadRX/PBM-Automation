import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { ListAnswer, NotificationCenterPage } from '../../../pages/notification/NotificationCenterPage';
import { CASES, CHIP, EMPTY_STATE, FILTER_FIELDS, NO_MATCH, SEARCH_EXAMPLE, STATUS } from '../../../data/notification/searchAndFilterAnnouncements.data';
import { WriterDAnnouncements, allNames, blockUnless, stampWord } from '../../../utils/notification/writerDHelpers';

/** Step 1: the Notification Center (its first tab). */
async function openModule(steps: TestSteps, center: NotificationCenterPage): Promise<void> {
  await steps.critical('Navigate to the Notification Center Management module - the dashboard loads', async () => {
    await center.open();
    await expect(center.tabButton('announcements'), 'the Announcements tab').toBeVisible();
  });
}

/**
 * User story 21011: Search and Filter Announcements - search, the Status
 * filter and its chip. Suite Scheduled seeds only (deleted at teardown). See the
 * data file for the readings.
 */
test.describe('US 21011 - Search and Filter Announcements', () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.statusFilterChip.azureId}: should narrow the list to the chosen Status and show it as a removable chip`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncements,
    suiteAnnouncements,
  }) => {
    const seed = await suiteAnnouncements.create();
    const screen = new WriterDAnnouncements(page);
    await steps.critical('Precondition: announcements with different statuses exist (a suite Scheduled one among them)', async () => {
      const statuses = new Set((await allNames(page)).statuses);
      blockUnless(steps, statuses.size > 1, `the shared list holds only [${[...statuses].join(', ')}] - no mix of statuses to filter`);
      expect(statuses).toContain(STATUS.scheduled);
    });
    await openModule(steps, ncCenter);

    await steps.step('Open the Announcements list and open Advanced search - the Name, Status and Published at filters are shown', async () => {
      await ncCenter.switchTo('announcements');
      await ncAnnouncements.openFilter();
      for (const key of FILTER_FIELDS) await expect(ncAnnouncements.filterField(key), `the "${key}" filter`).toBeVisible();
    });

    await steps.step(`Select Status "${STATUS.scheduled}" - only Scheduled announcements are listed and a removable "${CHIP.status(STATUS.scheduled)}" chip appears`, async () => {
      await ncAnnouncements.setFilter('status', STATUS.scheduled);
      const answer = await ncAnnouncements.applyFilter();
      expect(answer?.request.status, 'the filter sent').toBe(STATUS.scheduled);
      expect([...new Set((answer?.items ?? []).map((i) => String(i.status)))], 'statuses GetAnnouncements answered').toEqual([STATUS.scheduled]);
      expect([...new Set(await ncAnnouncements.column('status'))], 'statuses on screen').toEqual([STATUS.scheduled]);
      await expect(ncAnnouncements.row(seed.id), 'the suite Scheduled announcement').toBeVisible();
      expect((await ncAnnouncements.chips()).status).toBe(CHIP.status(STATUS.scheduled));
      await expect(screen.chipRemove('status'), 'the chip\'s remove (x)').toBeVisible();
    });
  });

  test(`TC-${CASES.noMatchSearch.azureId}: should show an empty list without error when the search matches no announcement`, async ({
    steps,
    ncCenter,
    ncAnnouncements,
  }) => {
    const term = `${NO_MATCH}${stampWord('')}`;
    await openModule(steps, ncCenter);

    await steps.step('Open the Announcements list - announcements are shown', async () => {
      const answer = await ncCenter.switchTo('announcements');
      expect(answer?.totalRows ?? 0, 'GetAnnouncements total').toBeGreaterThan(0);
      await expect(ncAnnouncements.rows().first()).toBeVisible();
    });

    await steps.step(`Type a text that matches no name ("${NO_MATCH}" + run stamp) into Search - the list shows no rows, without error`, async () => {
      const answer = await ncAnnouncements.search(term);
      expect({ status: answer?.status, total: answer?.totalRows }, 'GetAnnouncements answer').toEqual({ status: 200, total: 0 });
      await expect(ncAnnouncements.rows()).toHaveCount(0);
      await expect(ncAnnouncements.emptyState()).toHaveText(EMPTY_STATE);
      expect(await ncAnnouncements.toastText(1_500), 'a toast after the search').toBe('');
    });
  });

  test(`TC-${CASES.searchByName.azureId}: should list only the announcements whose name contains the searched text`, async ({
    steps,
    ncCenter,
    ncAnnouncements,
    suiteAnnouncements,
  }) => {
    const word = stampWord(SEARCH_EXAMPLE.toLowerCase());
    const withWordA = await suiteAnnouncements.create({ name: suiteAnnouncements.newName(`${word} A`) });
    const withWordB = await suiteAnnouncements.create({ name: suiteAnnouncements.newName(`B ${word}`) });
    const without = await suiteAnnouncements.create({ name: suiteAnnouncements.newName('without the run word') });
    await openModule(steps, ncCenter);

    await steps.step('Open the Announcements list - announcements are shown', async () => {
      const answer = await ncCenter.switchTo('announcements');
      expect(answer?.totalRows ?? 0).toBeGreaterThan(0);
      await expect(ncAnnouncements.rows().first()).toBeVisible();
    });

    await steps.step(`Type a text known in some names (the run word for "${SEARCH_EXAMPLE}") into Search - only names containing it are shown`, async () => {
      const answer = await ncAnnouncements.search(word);
      const names = await ncAnnouncements.column('name');
      expect(names.filter((n) => !n.toLowerCase().includes(word.toLowerCase())), `names shown: ${names.join(' | ')}`).toEqual([]);
      expect([...(await ncAnnouncements.rowIds())].sort(), `GetAnnouncements total ${answer?.totalRows}`).toEqual([withWordA.id, withWordB.id].sort());
      await expect(ncAnnouncements.row(without.id), 'the suite announcement without the word').toHaveCount(0);
    });
  });

  test(`TC-${CASES.removeChip.azureId}: should return the list to its unfiltered state when the filter chip is removed`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncements,
    suiteAnnouncements,
  }) => {
    await suiteAnnouncements.create();
    let unfiltered = 0;
    let afterRemove: ListAnswer | null = null;
    await steps.critical('Precondition: the unfiltered total (GetAnnouncements) and a suite Scheduled announcement', async () => {
      unfiltered = (await allNames(page)).totalRows;
      expect(unfiltered).toBeGreaterThan(0);
    });
    await openModule(steps, ncCenter);

    await steps.step(`Apply a Status filter (${STATUS.scheduled}) so the chip appears and the list is narrowed - the filtered list is shown`, async () => {
      await ncCenter.switchTo('announcements');
      const answer = await ncAnnouncements.filter({ status: STATUS.scheduled });
      expect((await ncAnnouncements.chips()).status).toBe(CHIP.status(STATUS.scheduled));
      expect(answer?.totalRows ?? 0, `filtered total vs unfiltered ${unfiltered}`).toBeLessThan(unfiltered);
    });

    await steps.step('Click the x on the filter chip - the chip disappears', async () => {
      afterRemove = await ncAnnouncements.removeChip('status');
      expect(Object.keys(await ncAnnouncements.chips()), 'chips left').not.toContain('status');
    });

    await steps.step('Observe the list - it shows all announcements again', async () => {
      expect({ status: afterRemove?.request.status, total: afterRemove?.totalRows }, 'the list request / answer after the chip was removed').toEqual({ status: undefined, total: (await allNames(page)).totalRows });
      expect(await ncAnnouncements.rowIds(), 'rows shown').toHaveLength(Math.min(10, unfiltered));
    });
  });
});
