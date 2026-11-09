import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { IdentityListAnswer } from '../../../pages/user/IdentityListPage';
import type { UserListPage } from '../../../pages/user/UserListPage';
import type { UserSortOption } from '../../../constants/user/userIds';
import { AZ_FIELDS, CASES, DATE_SORTS } from '../../../data/user/sortAndExportUsers.data';
import type { UserListItem } from '../../../utils/UserProvisioning';
import { firstOutOfOrder, openCapturing, sortInDirection } from '../../../utils/user/writerAHelpers';

/**
 * User story 20412: Sort and Export Users - the Sort By control: Name A-Z /
 * Z-A, the Newest default, and every documented option both ways. See the
 * data file for how "Name (A-Z)" maps onto field + direction.
 */

async function openModule(steps: TestSteps, list: UserListPage): Promise<void> {
  await steps.critical('Navigate to the User Management module - the user list is displayed', async () => {
    await list.openTable();
    await list.expectToolbar();
  });
}

/** 20551 / 20552. */
async function sortByName(
  { steps, list }: { steps: TestSteps; list: UserListPage },
  direction: 'asc' | 'desc',
): Promise<void> {
  const label = direction === 'asc' ? 'Name (A-Z)' : 'Name (Z-A)';
  let answer!: IdentityListAnswer<UserListItem>;
  await openModule(steps, list);

  await steps.critical(`Open the Sort By control and select "${label}" - the sort option is applied`, async () => {
    const sorted = await sortInDirection(list, 'name', direction);
    answer = sorted.answer;
    expect({ sortBy: String(sorted.request.sortBy), shownField: (await list.readSortLabel()).includes(AZ_FIELDS.name.label) })
      .toEqual({ sortBy: `${AZ_FIELDS.name.sortBy} ${direction}`, shownField: true });
  });

  await steps.step(`Review the order of users in the list - users are listed in ${direction === 'asc' ? 'ascending' : 'descending'} alphabetical order by name`, async () => {
    const shown = await list.rowIdsOnScreen();
    const names = shown.map((id) => answer.items.find((u) => u.id === id)?.englishFirstName ?? '');
    const broken = firstOutOfOrder(names, direction);
    expect({ screenIsAnswer: shown.join() === answer.items.map((u) => u.id).join(), outOfOrderAt: broken }, names.join(' | ')).toEqual({ screenIsAnswer: true, outOfOrderAt: -1 });
  });
}

test.describe('US 20412 - Sort and Export Users (sorting)', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.nameAscending.azureId}: should list users A to Z by name when Name (A-Z) is selected`, async ({ steps, userListPage: list }) => {
    await sortByName({ steps, list }, 'asc');
  });

  test(`TC-${CASES.nameDescending.azureId}: should list users Z to A by name when Name (Z-A) is selected`, async ({ steps, userListPage: list }) => {
    await sortByName({ steps, list }, 'desc');
  });

  test(`TC-${CASES.newestByDefault.azureId}: should list the newest users first when no sort is selected`, async ({ steps, userIn, userListPage: list }) => {
    const newest = await userIn('Active');
    let answer!: IdentityListAnswer<UserListItem>;
    let request: Record<string, unknown> = {};

    await steps.critical('Navigate to the User Management module - the user list is displayed', async () => {
      ({ request, answer } = await openCapturing(list));
      await list.expectToolbar();
    });

    await steps.step('Observe the list order without any Sort By selection - the most recently created users come first', async () => {
      const created = answer.items.map((u) => Date.parse(u.createdOn));
      const broken = created.findIndex((t, i) => i > 0 && t > created[i - 1]);
      expect({
        sortBy: request.sortBy,
        label: (await list.readSortLabel()).includes('Newest'),
        firstIsNewest: answer.items[0]?.id === newest.id,
        outOfOrderAt: broken,
      }).toEqual({ sortBy: DATE_SORTS.newest, label: true, firstIsNewest: true, outOfOrderAt: -1 });
    });
  });

  test(`TC-${CASES.allSortOptions.azureId}: should offer every documented Sort By option in both orders`, async ({ steps, userListPage: list }) => {
    let options: string[] = [];
    await openModule(steps, list);

    await steps.step('Open the Sort By control - the full list of sort options is displayed', async () => {
      options = await list.getSortOptions();
      const wanted = [...Object.values(AZ_FIELDS).map((f) => f.label), 'Newest', 'Oldest', 'Last Modified'];
      expect(wanted.filter((w) => !options.includes(w)), options.join(' | ')).toEqual([]);
    });

    await steps.step('Verify Name, Gender, Nationality, Identity Type, Document ID and Status each in A-Z and Z-A order - all twelve are present', async () => {
      const missing: string[] = [];
      for (const [key, field] of Object.entries(AZ_FIELDS) as [UserSortOption, (typeof AZ_FIELDS)[keyof typeof AZ_FIELDS]][]) {
        const one = await list.sortByOption(key);
        const other = await list.reverseSort();
        const got = [String(one.request.sortBy), String(other.request.sortBy)].sort();
        const want = [`${field.sortBy} asc`, `${field.sortBy} desc`];
        if (got.join() !== want.join()) missing.push(`${field.label}: ${got.join(' / ')}`);
      }
      expect(missing).toEqual([]);
    });

    await steps.step('Verify Created On and Last Modified each Newest to Oldest and Oldest to Newest - all four are present', async () => {
      const newest = String((await list.sortByOption('newest')).request.sortBy);
      const oldest = String((await list.sortByOption('oldest')).request.sortBy);
      const modifiedOne = String((await list.sortByOption('lastModified')).request.sortBy);
      const modifiedOther = String((await list.reverseSort()).request.sortBy);
      expect({ newest, oldest, lastModified: [modifiedOne, modifiedOther].sort() })
        .toEqual({ newest: DATE_SORTS.newest, oldest: DATE_SORTS.oldest, lastModified: [`${DATE_SORTS.lastModified} asc`, `${DATE_SORTS.lastModified} desc`] });
    });
  });
});
