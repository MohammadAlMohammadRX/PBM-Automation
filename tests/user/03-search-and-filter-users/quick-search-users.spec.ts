import { test, expect } from '../../../fixtures';
import type { Page } from '@playwright/test';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { IdentityListAnswer } from '../../../pages/user/IdentityListPage';
import type { UserListPage } from '../../../pages/user/UserListPage';
import { CASES, ERROR_ON_PAGE, ERROR_TOAST, NO_RESULTS, OPTION } from '../../../data/user/searchAndFilterUsers.data';
import { USER_LOOKUP, listUsers, type ProvisionedUser, type UserListItem } from '../../../utils/UserProvisioning';
import { advancedOptionLike, clearAllChips, matchesTerm } from '../../../utils/user/writerAHelpers';

/**
 * User story 20409: Search and Filter Users - Quick Search (name in English or
 * Arabic, document ID, e-mail), no match, unusual input, moving between quick /
 * advance / no filter, and the exploratory sequence. Each case searches for a
 * suite user built for it. See the data file.
 */

/** Steps 1-2 of every case: the module, then the default (unfiltered) list. */
async function openDefaultList(steps: TestSteps, list: UserListPage): Promise<void> {
  await steps.critical('Navigate to the User Management module - the module landing page is displayed', async () => {
    await list.openTable();
    await list.expectToolbar();
  });
  await steps.step('Open the Users Administration list - the default user list is displayed', async () => {
    expect({ rows: (await list.countRows()) > 0, search: await list.readSearchValue(), chips: await list.getChips() })
      .toEqual({ rows: true, search: '', chips: [] });
  });
}

/** 20492-20495: Quick Search for one suite user's value -> only that user. */
async function findOne(
  { steps, list, user }: { steps: TestSteps; list: UserListPage; user: ProvisionedUser },
  term: string,
  enterStep: string,
): Promise<void> {
  let answer!: IdentityListAnswer<UserListItem>;
  await openDefaultList(steps, list);

  await steps.step(`Enter "${term}" into the Quick Search field - ${enterStep}`, async () => {
    answer = await list.searchFor(term);
    expect(answer.totalRows, 'the search answered for this term').toBeGreaterThanOrEqual(0);
  });

  await steps.step('Review the results - the list shows only the matching user record', async () => {
    const shown = await list.rowIdsOnScreen().catch(() => [] as string[]);
    expect({ answered: answer.items.map((i) => i.id), shown, notMatching: answer.items.filter((i) => !matchesTerm(i, term)).map((i) => i.fullEnglishName) })
      .toEqual({ answered: [user.id], shown: [user.id], notMatching: [] });
  });
}

/** Whether the screen's answer equals GetUsers for the same criteria (count and first page). */
async function sameAsRegister(page: Page, answer: IdentityListAnswer<UserListItem>, criteria: Record<string, unknown>): Promise<string> {
  const api = await listUsers(page, criteria, 10);
  const screen = answer.items.map((i) => i.id).join(',');
  const register = api.items.map((i) => i.id).join(',');
  return api.totalRows === answer.totalRows && screen === register ? '' : `${JSON.stringify(criteria)}: screen ${answer.totalRows} [${screen.slice(0, 120)}] vs GetUsers ${api.totalRows} [${register.slice(0, 120)}]`;
}

test.describe('US 20409 - Search and Filter Users (Quick Search)', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.englishName.azureId}: should find a user when the Quick Search holds the user's English name`, async ({ steps, userIn, userListPage: list }) => {
    const user = await userIn('Active');
    await findOne({ steps, list, user }, user.displayNameEn, 'matching results begin filtering as text is entered');
  });

  test(`TC-${CASES.arabicName.azureId}: should find a user when the Quick Search holds the user's Arabic name`, async ({ steps, userIn, userListPage: list }) => {
    const user = await userIn('Active');
    await findOne({ steps, list, user }, user.record.fullArabicName.replace(/\s+/g, ' ').trim(), 'matching results begin filtering as text is entered');
  });

  test(`TC-${CASES.documentId.azureId}: should find a user when the Quick Search holds the user's document ID`, async ({ steps, userIn, userListPage: list }) => {
    const user = await userIn('Active');
    await findOne({ steps, list, user }, user.documentId, 'the search executes against the entered Document ID');
  });

  test(`TC-${CASES.email.azureId}: should find a user when the Quick Search holds the user's e-mail address`, async ({ steps, userIn, userListPage: list }) => {
    const user = await userIn('Active');
    await findOne({ steps, list, user }, user.email, 'the search executes against the entered e-mail');
  });

  test(`TC-${CASES.noMatch.azureId}: should show an empty state with a no-results message when no user matches the search`, async ({ steps, userListPage: list }) => {
    let answer!: IdentityListAnswer<UserListItem>;
    await openDefaultList(steps, list);

    await steps.step(`Enter "${CASES.noMatch.term}" into the Quick Search field - the search executes`, async () => {
      answer = await list.searchFor(CASES.noMatch.term);
      expect(answer.totalRows, 'the search answered').toBeGreaterThanOrEqual(0);
    });

    await steps.step('Review the results - the list displays an empty state with a "no results found" message', async () => {
      const empty = await list.getEmptyStateText();
      expect({ totalRows: answer.totalRows, message: NO_RESULTS.test(empty) }, `empty state: "${empty}"`).toEqual({ totalRows: 0, message: true });
    });
  });

  test(`TC-${CASES.unusualInput.azureId}: should handle special characters and an injection-style string without an error or unauthorized data`, async ({
    page,
    steps,
    userListPage: list,
  }) => {
    const term = CASES.unusualInput.term;
    let unfiltered = -1;
    let quick!: IdentityListAnswer<UserListItem>;
    let advanced!: IdentityListAnswer<UserListItem>;

    await steps.critical('Navigate to the User Management module - the module landing page is displayed', async () => {
      await list.openTable();
      await list.expectToolbar();
      unfiltered = (await listUsers(page, {}, 1)).totalRows;
    });

    await steps.step(`Enter "${term}" into the Quick Search field - the search executes without a system error`, async () => {
      quick = await list.searchFor(term);
      const toasts = await list.readToasts();
      expect({ answered: quick.totalRows >= 0, errorToasts: toasts.filter((t) => ERROR_TOAST.test(t)) }).toEqual({ answered: true, errorToasts: [] });
    });

    await steps.step('Enter the same input into the Advance Search Name and Document ID fields - the search executes without a system error', async () => {
      await list.searchFor('');
      const applied = await list.advancedSearch({ name: term, documentId: term });
      advanced = applied.answer;
      const toasts = await list.readToasts();
      expect({ answered: advanced.totalRows >= 0, nameSent: applied.request.name, errorToasts: toasts.filter((t) => ERROR_TOAST.test(t)) })
        .toEqual({ answered: true, nameSent: term, errorToasts: [] });
    });

    await steps.step('Review the results - no matching or only legitimately matching data, no unauthorized records and no application error', async () => {
      const pageText = await list.getPageText();
      expect({
        quickIllegitimate: quick.items.filter((i) => !matchesTerm(i, term)).length,
        advancedIllegitimate: advanced.items.filter((i) => !matchesTerm(i, term)).length,
        everythingReturned: quick.totalRows === unfiltered || advanced.totalRows === unfiltered,
        errorOnPage: ERROR_ON_PAGE.test(pageText),
      }).toEqual({ quickIllegitimate: 0, advancedIllegitimate: 0, everythingReturned: false, errorOnPage: false });
    });
  });

  test(`TC-${CASES.transitions.azureId}: should move cleanly between Quick Search, Advance Search and the unfiltered list`, async ({
    page,
    steps,
    userIn,
    userListPage: list,
  }) => {
    const user = await userIn('Active');
    const term = user.lastName;
    let quickIds: string[] = [];

    await steps.critical('Navigate to the User Management module - the module landing page is displayed', async () => {
      await list.openTable();
      await list.expectToolbar();
    });

    await steps.step(`Enter a Quick Search term ("${term}") - the list shows only the Quick Search matches`, async () => {
      const answer = await list.searchFor(term);
      quickIds = answer.items.map((i) => i.id);
      expect({ ids: quickIds, shown: await list.rowIdsOnScreen().catch(() => [] as string[]) }).toEqual({ ids: [user.id], shown: [user.id] });
    });

    await steps.step('Clear the Quick Search term and apply an Advance Search filter (Status = Active) instead - the list moves to the Advance Search results', async () => {
      await list.searchFor('');
      await list.openAdvancedSearch();
      await list.fillAdvanced({ status: await advancedOptionLike(list, 'status', OPTION.active) });
      const { request, answer } = await list.applyAdvanced();
      const shown = await list.rowIdsOnScreen().catch(() => [] as string[]);
      expect({
        searchTextKept: 'searchText' in request,
        statusFilter: request.isActive,
        onlyActive: answer.items.every((i) => i.isActive),
        residual: shown.length === quickIds.length && shown.every((id) => quickIds.includes(id)),
        totalRows: answer.totalRows,
      }).toEqual({ searchTextKept: false, statusFilter: true, onlyActive: true, residual: false, totalRows: (await listUsers(page, { isActive: true }, 1)).totalRows });
    });

    await steps.step('Clear the Advance Search filter - the list returns to the default unfiltered view', async () => {
      const answer = await clearAllChips(list, page);
      expect({ chips: await list.getChips(), totalRows: answer?.totalRows ?? -1 }).toEqual({ chips: [], totalRows: (await listUsers(page, {}, 1)).totalRows });
    });
  });

  test(`TC-${CASES.exploratory.azureId}: should stay accurate under varied combinations of partial names, languages, dropdown filters and rapid clearing`, async ({
    page,
    steps,
    userIn,
    userListPage: list,
  }) => {
    const user = await userIn('Active', { gender: 'male' });
    const partialEnglish = user.lastName.slice(0, -3);
    const partialArabic = user.record.arabicLastName.trim().split(/\s+/).pop()?.slice(0, -2) ?? '';
    const mismatches: string[] = [];

    await steps.critical('Navigate to the User Management module - the module landing page is displayed', async () => {
      await list.openTable();
      await list.expectToolbar();
    });

    await steps.step('Combine partial names, switch between English and Arabic, toggle a dropdown filter and rapidly clear / re-apply the search - the list updates accurately after each change', async () => {
      const english = await list.searchFor(partialEnglish);
      mismatches.push(await sameAsRegister(page, english, { searchText: partialEnglish }));
      const arabic = await list.searchFor(partialArabic);
      mismatches.push(await sameAsRegister(page, arabic, { searchText: partialArabic }));
      await list.searchFor('');
      await list.openAdvancedSearch();
      await list.fillAdvanced({ gender: await advancedOptionLike(list, 'gender', OPTION.male) });
      const male = await list.applyAdvanced();
      mismatches.push(await sameAsRegister(page, male.answer, { genderId: USER_LOOKUP.gender.male }));
      const off = await clearAllChips(list, page);
      if (off) mismatches.push(await sameAsRegister(page, off, {}));
      await list.searchFor(partialEnglish);
      await list.searchFor('');
      const again = await list.searchFor(partialEnglish);
      mismatches.push(await sameAsRegister(page, again, { searchText: partialEnglish }));
      const shown = await list.rowIdsOnScreen().catch(() => [] as string[]);
      expect({ englishFound: english.items.some((i) => i.id === user.id), arabicFound: arabic.items.some((i) => i.id === user.id), screenMatchesAnswer: shown.join() === again.items.map((i) => i.id).join() })
        .toEqual({ englishFound: true, arabicFound: true, screenMatchesAnswer: true });
    });

    await steps.step('Note any unexpected results, lag, stale data or mismatched counts - none is observed', async () => {
      expect(mismatches.filter(Boolean)).toEqual([]);
    });
  });
});
