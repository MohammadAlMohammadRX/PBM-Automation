import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { IdentityListAnswer } from '../../../pages/user/IdentityListPage';
import type { UserListPage } from '../../../pages/user/UserListPage';
import type { UserAdvancedField } from '../../../constants/user/userIds';
import { ADVANCED_FIELDS, CASES, OPTION } from '../../../data/user/searchAndFilterUsers.data';
import { USER_LOOKUP, listUsers, type UserListItem } from '../../../utils/UserProvisioning';
import { advancedFieldKinds, advancedOptionLike, clearAllChips, readAdvancedValue } from '../../../utils/user/writerAHelpers';

/**
 * User story 20409: Search and Filter Users - Advance Search: the seven fields,
 * each dropdown (Gender, Nationality, Identity Type, Status), the text fields
 * (Document ID + Mobile Number), a combination, and clearing. A suite user with
 * the filtered values is built per case so the result is never empty. See the
 * data file.
 */

const ALL_LABELS = Object.values(ADVANCED_FIELDS).map((f) => f.label);

async function openModule(steps: TestSteps, list: UserListPage): Promise<void> {
  await steps.critical('Navigate to the User Management module - the module landing page is displayed', async () => {
    await list.openTable();
    await list.expectToolbar();
  });
}

/** 20498-20500, 20503: one dropdown filter -> only rows with that value. */
async function oneDropdown(
  { steps, list }: { steps: TestSteps; list: UserListPage },
  field: UserAdvancedField,
  option: RegExp,
  requestKey: string,
  requestValue: unknown,
  matches: (u: UserListItem) => boolean,
  suiteUserId: string,
  screen?: { column: 'nationality' | 'identityType' | 'status'; value: RegExp },
): Promise<void> {
  const label = ADVANCED_FIELDS[field].label;
  let chosen = '';
  let answer!: IdentityListAnswer<UserListItem>;
  let request: Record<string, unknown> = {};
  await openModule(steps, list);

  await steps.critical(`Open the Advance Search panel - the ${label} dropdown is displayed with valid options`, async () => {
    expect(await list.openAdvancedSearch(), 'the Advance Search panel opens').toBe(true);
    const options = await list.getAdvancedOptions(field);
    chosen = options.find((o) => option.test(o)) ?? '';
    expect(chosen, `${label} options: ${options.join(' | ')}`).not.toBe('');
  });

  await steps.step(`Select "${chosen || option.source}" from the ${label} dropdown and apply the filter - the search executes`, async () => {
    await list.fillAdvanced({ [field]: chosen });
    ({ request, answer } = await list.applyAdvanced());
    expect({ sent: request[requestKey], answered: answer.totalRows >= 0 }).toEqual({ sent: requestValue, answered: true });
  });

  await steps.step(`Review the results - the list shows only users with ${label} = ${chosen || option.source}`, async () => {
    const shown = screen ? (await list.readColumn(screen.column)).filter((v) => !screen.value.test(v)) : [];
    expect({
      others: answer.items.filter((u) => !matches(u)).map((u) => u.fullEnglishName),
      otherOnScreen: shown,
      suiteUserListed: answer.items.some((u) => u.id === suiteUserId),
    }).toEqual({ others: [], otherOnScreen: [], suiteUserListed: true });
  });
}

test.describe('US 20409 - Search and Filter Users (Advance Search)', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.combined.azureId}: should list only users matching every Advance Search filter combined`, async ({
    page,
    steps,
    userIn,
    userListPage: list,
  }) => {
    const user = await userIn('Active', { gender: 'female', nationality: 'saudi' });
    const chosen: Record<string, string> = {};
    let answer!: IdentityListAnswer<UserListItem>;
    let request: Record<string, unknown> = {};
    await openModule(steps, list);

    await steps.critical('Open the Advance Search panel - Name, Gender, Nationality, Identity Type, Document ID, Mobile Number and Status are displayed', async () => {
      expect(await list.openAdvancedSearch(), 'the Advance Search panel opens').toBe(true);
      const labels = await list.readAdvancedFieldLabels();
      expect(ALL_LABELS.filter((l) => !labels.includes(l)), labels.join(' | ')).toEqual([]);
    });

    await steps.step('Set Gender = Female, Nationality = Saudi and Status = Active together - the criteria are applied simultaneously', async () => {
      chosen.gender = await advancedOptionLike(list, 'gender', OPTION.female);
      chosen.nationality = await advancedOptionLike(list, 'nationality', OPTION.saudi);
      chosen.status = await advancedOptionLike(list, 'status', OPTION.active);
      await list.fillAdvanced(chosen);
      expect({
        gender: await readAdvancedValue(page, 'gender'),
        nationality: await readAdvancedValue(page, 'nationality'),
        status: await readAdvancedValue(page, 'status'),
      }).toEqual({ gender: chosen.gender, nationality: chosen.nationality, status: chosen.status });
    });

    await steps.step('Click Search - the list shows only users matching all three criteria together', async () => {
      ({ request, answer } = await list.applyAdvanced());
      const statuses = await list.readColumn('status');
      expect({
        sent: { genderId: request.genderId, nationalityId: request.nationalityId, isActive: request.isActive },
        others: answer.items.filter((u) => !(u.genderId === USER_LOOKUP.gender.female && u.nationalityId === USER_LOOKUP.nationality.saudi && u.isActive)).length,
        otherStatusOnScreen: statuses.filter((s) => s !== 'Active'),
        suiteUserListed: answer.items.some((u) => u.id === user.id),
      }).toEqual({
        sent: { genderId: USER_LOOKUP.gender.female, nationalityId: USER_LOOKUP.nationality.saudi, isActive: true },
        others: 0,
        otherStatusOnScreen: [],
        suiteUserListed: true,
      });
    });
  });

  test(`TC-${CASES.gender.azureId}: should list only male users when the Gender filter is Male`, async ({ steps, userIn, userListPage: list }) => {
    const user = await userIn('Active', { gender: 'male' });
    await oneDropdown({ steps, list }, 'gender', OPTION.male, 'genderId', USER_LOOKUP.gender.male, (u) => u.genderId === USER_LOOKUP.gender.male, user.id);
  });

  test(`TC-${CASES.nationality.azureId}: should list only Saudi users when the Nationality filter is Saudi`, async ({ steps, userIn, userListPage: list }) => {
    const user = await userIn('Active', { nationality: 'saudi' });
    await oneDropdown({ steps, list }, 'nationality', OPTION.saudi, 'nationalityId', USER_LOOKUP.nationality.saudi, (u) => u.nationalityId === USER_LOOKUP.nationality.saudi, user.id,
      { column: 'nationality', value: /^Saudi/i });
  });

  test(`TC-${CASES.identityType.azureId}: should list only Iqama holders when the Identity Type filter is Iqama`, async ({ steps, userIn, userListPage: list }) => {
    const user = await userIn('Active', { nationality: 'emirati', identityType: 'iqama' });
    await oneDropdown({ steps, list }, 'identityType', OPTION.iqama, 'identityTypeId', USER_LOOKUP.identityType.iqama, (u) => u.identityTypeId === USER_LOOKUP.identityType.iqama, user.id,
      { column: 'identityType', value: /Iqama/i });
  });

  test(`TC-${CASES.status.azureId}: should list only inactive users when the Status filter is Inactive`, async ({ steps, userIn, userListPage: list }) => {
    const user = await userIn('Deactivated');
    await oneDropdown({ steps, list }, 'status', OPTION.inactive, 'isActive', false, (u) => !u.isActive, user.id, { column: 'status', value: /^Inactive$/ });
  });

  test(`TC-${CASES.documentAndMobile.azureId}: should list only the user matching both the Document ID and the Mobile Number`, async ({
    page,
    steps,
    userIn,
    userListPage: list,
  }) => {
    const user = await userIn('Active');
    const mobile = user.record.phoneNumber;
    let answer!: IdentityListAnswer<UserListItem>;
    let request: Record<string, unknown> = {};
    await openModule(steps, list);

    await steps.critical('Open the Advance Search panel - the Document ID and Mobile Number text fields are displayed', async () => {
      expect(await list.openAdvancedSearch(), 'the Advance Search panel opens').toBe(true);
      const kinds = await advancedFieldKinds(page);
      expect({ documentId: kinds.documentId, mobileNumber: kinds.mobileNumber }).toEqual({ documentId: 'text', mobileNumber: 'text' });
    });

    await steps.step(`Enter "${user.documentId}" in Document ID and "${mobile}" in Mobile Number, then apply the filter - the search uses both values`, async () => {
      await list.fillAdvanced({ documentId: user.documentId, mobileNumber: mobile });
      ({ request, answer } = await list.applyAdvanced());
      expect({ documentId: request.documentId, mobileNumber: request.mobileNumber }).toEqual({ documentId: user.documentId, mobileNumber: mobile });
    });

    await steps.step('Review the results - the list shows only the user matching both values', async () => {
      expect({ answered: answer.items.map((u) => u.id), shown: await list.rowIdsOnScreen().catch(() => [] as string[]) }).toEqual({ answered: [user.id], shown: [user.id] });
    });
  });

  test(`TC-${CASES.allFields.azureId}: should offer all seven Advance Search fields with the right controls and restore the list when cleared`, async ({
    page,
    steps,
    userListPage: list,
  }) => {
    await openModule(steps, list);

    await steps.critical('Open the Advance Search panel - Name, Gender, Nationality, Identity Type, Document ID, Mobile Number and Status are displayed', async () => {
      expect(await list.openAdvancedSearch(), 'the Advance Search panel opens').toBe(true);
      const labels = await list.readAdvancedFieldLabels();
      expect(ALL_LABELS.filter((l) => !labels.includes(l)), labels.join(' | ')).toEqual([]);
    });

    await steps.step('Check each field against the checklist - Name, Document ID and Mobile Number are free text; Gender, Nationality, Identity Type and Status are dropdowns', async () => {
      const kinds = await advancedFieldKinds(page);
      const expected = Object.fromEntries(Object.entries(ADVANCED_FIELDS).map(([k, f]) => [k, f.kind]));
      expect(kinds).toEqual(expected);
    });

    await steps.step('Clear all filters - the list returns to the unfiltered, scope-limited view', async () => {
      await list.fillAdvanced({ status: await advancedOptionLike(list, 'status', OPTION.active) });
      const filtered = await list.applyAdvanced();
      const cleared = await clearAllChips(list, page);
      expect({ filteredApplied: filtered.request.isActive, chips: await list.getChips(), totalRows: cleared?.totalRows ?? -1 })
        .toEqual({ filteredApplied: true, chips: [], totalRows: (await listUsers(page, {}, 1)).totalRows });
    });
  });
});
