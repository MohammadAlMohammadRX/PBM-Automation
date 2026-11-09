import { test, expect } from '../../../fixtures';
import { openListCapturing, orderedBy, sortByEach, type SortOutcome } from '../../../utils/user/writerDHelpers';
import { CASES, DEFAULT_SORT_BY, OLDEST_SORT_BY, SORT_LABELS, SORT_OPTIONS } from '../../../data/user/sortAndExportInvitations.data';

/**
 * User story 20417: Sort and Export Invitations - the sort cases.
 * Every Sort By option, the default newest-first order, and reversing it.
 * See the data file for how the cases map onto the live list.
 */
test.describe('US 20417 - Sort and Export Invitations', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.sortOptions.azureId}: should reorder the invitations list by each Sort By option when each is selected in turn`, async ({
    invitationListPage: list,
    suiteInvitation,
    steps,
  }) => {
    await suiteInvitation();
    await suiteInvitation();
    let outcomes: SortOutcome[] = [];

    await steps.critical('Navigate to the User Management module - the Invitations list loads with existing invitations', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(1);
    });

    await steps.step('Open the Sort By control - the available sort options are displayed', async () => {
      const options = await list.getSortOptions();
      expect(options, options.join(' | ')).toEqual(expect.arrayContaining([...SORT_LABELS]));
    });

    await steps.step('Select each available sort option in turn (date, e-mail, role, expiration, status, last modified) - the list reorders by the selected option each time', async () => {
      outcomes = await sortByEach(list, SORT_OPTIONS);
      const wrong = outcomes.filter((o) => !(o.fieldAsExpected && o.ordered && o.rowsFollowAnswer));
      expect({ tried: outcomes.length, wrong }, JSON.stringify(outcomes)).toEqual({ tried: SORT_OPTIONS.length, wrong: [] });
    });
  });

  test(`TC-${CASES.defaultNewest.azureId}: should list the newest invitations first when the list opens without any sort applied`, async ({
    invitationListPage: list,
    suiteInvitation,
    steps,
  }) => {
    await suiteInvitation();
    let opened: Awaited<ReturnType<typeof openListCapturing>> | null = null;

    await steps.critical('Navigate to the User Management module - the Invitations list loads', async () => {
      opened = await openListCapturing(list);
      await list.switchToTable();
      expect(opened.answer.totalRows).toBeGreaterThan(1);
    });

    await steps.step('Observe the order without applying any sort - newest to oldest by creation date', async () => {
      const got = opened as unknown as Awaited<ReturnType<typeof openListCapturing>>;
      expect({
        sortBy: got.request.sortBy,
        label: await list.readSortLabel(),
        newestFirst: orderedBy(got.answer.items, DEFAULT_SORT_BY),
        rowsFollowAnswer: (await list.rowIdsOnScreen()).join(',') === got.answer.items.map((i) => i.id).join(','),
      }, got.answer.items.map((i) => i.createdOn).join(' > ')).toEqual({ sortBy: DEFAULT_SORT_BY, label: expect.stringMatching(/newest/i), newestFirst: true, rowsFollowAnswer: true });
    });
  });

  test(`TC-${CASES.reverseSort.azureId}: should switch between newest-first and oldest-first when the sort order is reversed and toggled back`, async ({
    invitationListPage: list,
    suiteInvitation,
    steps,
  }) => {
    await suiteInvitation();
    let firstIds: string[] = [];

    await steps.critical('Navigate to the User Management module - the Invitations list loads in the default newest-to-oldest order', async () => {
      const { request, answer } = await openListCapturing(list);
      await list.switchToTable();
      firstIds = await list.rowIdsOnScreen();
      expect({ sortBy: request.sortBy, newestFirst: orderedBy(answer.items, DEFAULT_SORT_BY), rows: firstIds.length > 1 }).toEqual({ sortBy: DEFAULT_SORT_BY, newestFirst: true, rows: true });
    });

    await steps.step('Apply Sort By to switch the order to oldest-to-newest - the oldest invitation shows first', async () => {
      const { request, answer } = await list.sortByOption('oldest');
      expect({
        sortBy: request.sortBy,
        oldestFirst: orderedBy(answer.items, OLDEST_SORT_BY),
        rowsFollowAnswer: (await list.rowIdsOnScreen()).join(',') === answer.items.map((i) => i.id).join(','),
      }, answer.items.map((i) => i.createdOn).join(' < ')).toEqual({ sortBy: OLDEST_SORT_BY, oldestFirst: true, rowsFollowAnswer: true });
    });

    await steps.step('Toggle the sort back to newest-to-oldest - the list returns to the original default order', async () => {
      const { request } = await list.reverseSort();
      expect({ sortBy: request.sortBy, rows: await list.rowIdsOnScreen() }).toEqual({ sortBy: DEFAULT_SORT_BY, rows: firstIds });
    });
  });
});
