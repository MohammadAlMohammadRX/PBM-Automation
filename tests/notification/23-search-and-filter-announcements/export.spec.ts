import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { ListAnswer, NcExport, NotificationCenterPage } from '../../../pages/notification/NotificationCenterPage';
import {
  AUDIENCE,
  CASES,
  COMBINED_SEEDS,
  EMPTY_STATE,
  EXPORT_HEADERS,
  NO_MATCH,
  STATUS,
  XLSX,
} from '../../../data/notification/searchAndFilterAnnouncements.data';
import {
  allNames,
  daysAhead,
  describeExport,
  ensurePublishedListed,
  exportNames,
  exportStatuses,
  normalise,
  sortNameAscending,
  sortPublishAtOldestFirst,
  stampWord,
} from '../../../utils/notification/writerDHelpers';

/** Step 1: the Notification Center, Announcements tab. */
async function openModule(steps: TestSteps, center: NotificationCenterPage): Promise<void> {
  await steps.critical('Navigate to the Notification Center Management module - the dashboard loads', async () => {
    await center.open('announcements');
    await expect(center.tabButton('announcements'), 'the Announcements tab').toBeVisible();
  });
}

/**
 * User story 21011: Search and Filter Announcements - Selected Export / Export
 * All Data. The export's Publish At is UTC (foundation notes), so files are
 * compared with the screen / GetAnnouncements by name and status. See the data
 * file for the readings.
 */
test.describe('US 21011 - Search and Filter Announcements (export)', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.selectedExport.azureId}: should export only the announcements matching the current filter with Selected Export`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncements,
    suiteAnnouncements,
  }) => {
    let exp: NcExport | null = null;
    await steps.critical('Precondition: Published announcements are listed (looked up first; one is published only when none exists)', async () => {
      expect(await ensurePublishedListed(page, steps, suiteAnnouncements)).toBeGreaterThan(0);
    });
    await openModule(steps, ncCenter);

    await steps.step(`Apply the Status filter (${STATUS.published}) so the list is narrowed - the filtered subset is displayed`, async () => {
      const unfiltered = (await allNames(page)).totalRows;
      const answer = await ncAnnouncements.filter({ status: STATUS.published });
      expect(answer?.totalRows ?? 0, `filtered vs unfiltered ${unfiltered}`).toBeLessThan(unfiltered);
      expect([...new Set(await ncAnnouncements.column('status'))]).toEqual([STATUS.published]);
    });

    await steps.step('Click Export and choose "Selected Export" - an Excel file downloads', async () => {
      exp = await ncAnnouncements.export('selected');
      expect({ file: XLSX.test(exp.filename), workbook: exp.sheet !== null }, describeExport(exp)).toEqual({ file: true, workbook: true });
    });

    await steps.step('Open the file - it holds only the announcements matching the current filter', async () => {
      const expected = await allNames(page, { status: STATUS.published });
      expect([...new Set(exportStatuses(exp))], describeExport(exp)).toEqual([STATUS.published]);
      expect(exportNames(exp).sort(), describeExport(exp)).toEqual([...expected.names].sort());
    });
  });

  test(`TC-${CASES.exportAll.azureId}: should export every announcement with Export All Data whatever the current filter`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncements,
    suiteAnnouncements,
  }) => {
    let exp: NcExport | null = null;
    let filtered = 0;
    await steps.critical('Precondition: Published announcements are listed (looked up first; one is published only when none exists)', async () => {
      expect(await ensurePublishedListed(page, steps, suiteAnnouncements)).toBeGreaterThan(0);
    });
    await openModule(steps, ncCenter);

    await steps.step(`Apply the Status filter (${STATUS.published}) so the list is narrowed - the filtered subset is displayed`, async () => {
      const answer = await ncAnnouncements.filter({ status: STATUS.published });
      filtered = answer?.totalRows ?? 0;
      expect([...new Set(await ncAnnouncements.column('status'))]).toEqual([STATUS.published]);
      expect(filtered, 'filtered total').toBeLessThan((await allNames(page)).totalRows);
    });

    await steps.step('Click Export and choose "Export All Data" - an Excel file downloads', async () => {
      exp = await ncAnnouncements.export('all');
      expect({ file: XLSX.test(exp.filename), workbook: exp.sheet !== null }, describeExport(exp)).toEqual({ file: true, workbook: true });
    });

    await steps.step('Open the file - it holds every announcement, not just the filtered subset', async () => {
      const all = await allNames(page);
      const statuses = exportStatuses(exp);
      expect({ rows: statuses.length, otherStatuses: statuses.some((s) => s !== STATUS.published) }, `${describeExport(exp)}; filtered total ${filtered}`)
        .toEqual({ rows: all.totalRows, otherStatuses: true });
    });
  });

  test(`TC-${CASES.exportColumns.azureId}: should export the Name, Status, Publish At, Published On and Audiences columns`, async ({
    steps,
    ncCenter,
    ncAnnouncements,
  }) => {
    let exp: NcExport | null = null;
    await openModule(steps, ncCenter);

    await steps.step('Click Export and choose an export option (Export All Data) - an Excel file downloads', async () => {
      exp = await ncAnnouncements.export('all');
      expect({ file: XLSX.test(exp.filename), workbook: exp.sheet !== null }, describeExport(exp)).toEqual({ file: true, workbook: true });
    });

    await steps.step('Open the file and inspect its headers - Name, Status, Publish At, Published On and Audiences are all present', async () => {
      expect((exp?.sheet?.headers ?? []).map(normalise), describeExport(exp)).toEqual(expect.arrayContaining([...EXPORT_HEADERS]));
    });
  });

  test(`TC-${CASES.emptyExport.azureId}: should export a header-only file, without error, when the search matches nothing`, async ({
    steps,
    ncCenter,
    ncAnnouncements,
  }) => {
    const term = `${NO_MATCH}${stampWord('')}`;
    let exp: NcExport | null = null;
    await openModule(steps, ncCenter);

    await steps.step(`Apply a search that matches no announcement ("${NO_MATCH}" + run stamp) - the list shows no rows`, async () => {
      const answer = await ncAnnouncements.search(term);
      expect(answer?.totalRows, 'GetAnnouncements total').toBe(0);
      await expect(ncAnnouncements.emptyState()).toHaveText(EMPTY_STATE);
    });

    await steps.step('Click Export and choose "Selected Export" - no error, an Excel file downloads', async () => {
      exp = await ncAnnouncements.export('selected');
      expect({ file: XLSX.test(exp.filename), workbook: exp.sheet !== null }, describeExport(exp)).toEqual({ file: true, workbook: true });
      expect(await ncAnnouncements.toastText(1_500), 'a toast after the export').not.toMatch(/error|fail/i);
    });

    await steps.step('Open the file - the expected column headers and no data rows', async () => {
      expect({ headers: (exp?.sheet?.headers ?? []).map(normalise), rows: exp?.sheet?.rows.length ?? -1 }, describeExport(exp))
        .toEqual({ headers: expect.arrayContaining([...EXPORT_HEADERS]), rows: 0 });
    });
  });

  test(`TC-${CASES.combined.azureId}: should keep the list and the Selected Export consistent through combined search, filter and sort`, async ({
    steps,
    ncCenter,
    ncAnnouncements,
    suiteAnnouncements,
  }) => {
    const word = stampWord('cmb');
    const seeds: string[] = [];
    let first: ListAnswer | null = null;
    let screenNames: string[] = [];
    await steps.critical('Precondition: suite Scheduled announcements carrying a run word, with different names and publish dates', async () => {
      for (const s of COMBINED_SEEDS) seeds.push((await suiteAnnouncements.create({ name: suiteAnnouncements.newName(`${word} ${s.label}`), publishAt: daysAhead(s.days) })).name);
      expect(seeds).toHaveLength(COMBINED_SEEDS.length);
    });
    await openModule(steps, ncCenter);

    await steps.step('Apply a Status filter, then a Search term, then sort by Publish at oldest first - the list stays consistent with every criterion', async () => {
      await ncAnnouncements.filter({ status: STATUS.scheduled });
      await ncAnnouncements.search(word);
      first = await sortPublishAtOldestFirst(ncAnnouncements);
      screenNames = await ncAnnouncements.column('name');
      expect({ status: first?.request.status, search: first?.request.searchText, sortBy: String(first?.request.sortBy ?? '').toLowerCase() }, 'the list request')
        .toEqual({ status: STATUS.scheduled, search: word, sortBy: 'publishat asc' });
      expect(screenNames, 'names on screen (oldest Publish at first)').toEqual((first?.items ?? []).map((i) => normalise(String(i.name))));
      expect([...screenNames].sort()).toEqual([...seeds].sort());
      expect([...new Set(await ncAnnouncements.column('status'))]).toEqual([STATUS.scheduled]);
    });

    await steps.step('Export using Selected Export - the file matches exactly what is displayed', async () => {
      const exp = await ncAnnouncements.export('selected');
      expect({ names: exportNames(exp), statuses: [...new Set(exportStatuses(exp))] }, describeExport(exp)).toEqual({ names: screenNames, statuses: [STATUS.scheduled] });
    });

    await steps.step('Clear all filters and search, repeat with another combination (Audiences Users + search + Name ascending) - the list and the export stay consistent', async () => {
      await ncAnnouncements.removeChip('status');
      await ncAnnouncements.removeChip('search');
      expect(await ncAnnouncements.chips(), 'chips after clearing').toEqual({});
      await ncAnnouncements.filter({ audiencetypeid: AUDIENCE.users });
      await ncAnnouncements.search(word);
      const second = await sortNameAscending(ncAnnouncements);
      const names = await ncAnnouncements.column('name');
      expect(String(second?.request.sortBy ?? '').toLowerCase(), 'the sort sent').toBe('name asc');
      expect(names, 'names on screen (Name ascending)').toEqual([...seeds].sort((a, b) => a.localeCompare(b)));
      const exp = await ncAnnouncements.export('selected');
      expect(exportNames(exp), describeExport(exp)).toEqual(names);
    });
  });
});
