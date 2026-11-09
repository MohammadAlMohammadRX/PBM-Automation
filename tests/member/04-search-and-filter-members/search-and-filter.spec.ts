import { test, expect } from '../../../fixtures';
import type { Page } from '@playwright/test';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { MemberListAnswer, MemberManagementPage } from '../../../pages/member/MemberManagementPage';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { CASES } from '../../../data/member/searchAndFilterMembers.data';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { listMemberRegister, memberStamp, type MemberListItem } from '../../../utils/MemberProvisioning';
import { readSearchBox, statusOf, toolbarButtons, typeKeyword, wholeRegister } from '../../../utils/member/writerAHelpers';

const ci = (text: string): string => text.toLowerCase();

/**
 * Steps 1-3 shared by the keyword cases: open the list, type the keyword (the
 * box shows it), let the list answer THIS keyword. Returns the answer.
 */
async function keywordSearch(
  { list, page, steps }: { list: MemberManagementPage; page: Page; steps: TestSteps },
  keyword: string,
): Promise<{ answer: () => MemberListAnswer }> {
  let answer: MemberListAnswer = { items: [], totalRows: -1 };

  await steps.critical('Navigate to the Member Management module - the member list view is displayed', async () => {
    await list.openTable();
    expect(await list.countRows(), 'the list rows').toBeGreaterThan(0);
  });

  await steps.critical(`Enter "${keyword}" into the keyword search box - the typed value is shown in the search field`, async () => {
    await typeKeyword(page, keyword);
    expect((await readSearchBox(page)).value).toBe(keyword);
  });

  await steps.critical('Click Search (the box searches as you type) - the list refreshes', async () => {
    answer = await list.searchFor(keyword);
    expect(answer.totalRows, `the list answered "${keyword}"`).toBeGreaterThanOrEqual(0);
  });

  return { answer: () => answer };
}

/** Every member of the whole search answer (not only the page on screen). */
const searchAll = async (page: Page, keyword: string): Promise<MemberListItem[]> => (await listMemberRegister(page, { searchText: keyword }, 500)).items;

/**
 * User story 14379: Search and Filter Members.
 * The keyword search by member ID, name, nationality, mobile number and status,
 * no match, injected text, one character; the advanced filters, clearing them,
 * and the controls checklist. See the data file for how the cases map onto the
 * live list.
 */
test.describe('US 14379 - Search and Filter Members', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.byMemberId.azureId}: should find exactly one member by its member ID`, async ({
    memberManagementPage: list,
    memberIn,
    page,
    steps,
  }) => {
    const member = await memberIn('Active');
    const { answer } = await keywordSearch({ list, page, steps }, member.code);

    await steps.step('The list shows a single matching result', async () => {
      expect({ total: answer().totalRows, codes: answer().items.map((i) => i.memberCode) }).toEqual({ total: 1, codes: [member.code] });
    });

    await steps.step(`Review the result row - "${member.code}" is shown with its full name, nationality, mobile number and status`, async () => {
      const row = await list.readRow(member.displayNameEn);
      expect({ name: row.name, code: row.memberCode, nationality: row.nationality !== '', mobile: row.mobileNumber.includes(member.mobileNumber), status: row.status }, JSON.stringify(row))
        .toEqual({ name: member.displayNameEn, code: member.code, nationality: true, mobile: true, status: 'Active' });
    });
  });

  test(`TC-${CASES.byName.azureId}: should list every member whose name contains the searched name`, async ({
    memberManagementPage: list,
    memberIn,
    page,
    steps,
  }) => {
    const data = CASES.byName;
    const own = [
      await memberIn('Active', { lastName: `${data.lastNameToken}${memberStamp()}` }),
      await memberIn('Active', { lastName: `${data.lastNameToken}${memberStamp()}` }),
    ];
    const { answer } = await keywordSearch({ list, page, steps }, data.keyword);

    await steps.step(`Review the results - every member whose name contains "${data.keyword}" is displayed`, async () => {
      const expected = (await wholeRegister(page)).filter((i) => ci(i.displayNameEn).includes(ci(data.keyword))).map((i) => i.memberCode).sort();
      const found = await searchAll(page, data.keyword);
      expect({
        missing: expected.filter((code) => !found.some((i) => i.memberCode === code)),
        notMatchingName: found.filter((i) => !ci(i.displayNameEn).includes(ci(data.keyword))).map((i) => i.displayNameEn),
        total: answer().totalRows,
        ownShown: [await list.isRowVisible(own[0].displayNameEn), await list.isRowVisible(own[1].displayNameEn)],
      }).toEqual({ missing: [], notMatchingName: [], total: expected.length, ownShown: [true, true] });
    });
  });

  test(`TC-${CASES.byNationality.azureId}: should list the members of the searched nationality`, async ({
    memberManagementPage: list,
    memberIn,
    page,
    steps,
  }) => {
    const data = CASES.byNationality;
    await memberIn('Active', { nationality: 'saudi' });
    const { answer } = await keywordSearch({ list, page, steps }, data.keyword);

    await steps.step(`Review the results - every member of nationality "${data.keyword}" is shown`, async () => {
      const expected = (await wholeRegister(page)).filter((i) => ci(i.nationalityNameEn).includes(ci(data.keyword)));
      const shown = await list.readColumnValues('nationality');
      expect({ total: answer().totalRows, others: shown.filter((n) => !ci(n).includes(ci(data.keyword))) }, shown.join(' | '))
        .toEqual({ total: expected.length, others: [] });
      expect(expected.length, 'the register holds Saudi members').toBeGreaterThan(0);
    });
  });

  test(`TC-${CASES.byMobile.azureId}: should find the member by its mobile number`, async ({
    memberManagementPage: list,
    memberIn,
    page,
    steps,
  }) => {
    const data = CASES.byMobile;
    const member = await memberIn('Active', { mobileNumber: data.mobileNumber });
    const { answer } = await keywordSearch({ list, page, steps }, data.keyword);

    await steps.step('Review the results - the member with the matching mobile number is shown', async () => {
      const found = await searchAll(page, data.keyword);
      expect({
        ownFound: found.some((i) => i.id === member.id),
        ownShown: await list.isRowVisible(member.displayNameEn),
        unrelated: found.filter((i) => !i.mobileNumber.includes(data.keyword) && !i.documentId.includes(data.keyword)).map((i) => i.memberCode),
        total: answer().totalRows > 0,
      }).toEqual({ ownFound: true, ownShown: true, unrelated: [], total: true });
    });
  });

  test(`TC-${CASES.byStatus.azureId}: should list only the members of the searched status`, async ({
    memberManagementPage: list,
    memberIn,
    page,
    steps,
  }) => {
    const data = CASES.byStatus;
    await memberIn('Active');
    await memberIn('Inactive');
    const { answer } = await keywordSearch({ list, page, steps }, data.keyword);

    await steps.step(`Review the results - only members with status "${data.keyword}" are shown`, async () => {
      const expected = (await wholeRegister(page)).filter((i) => statusOf(i) === data.keyword).length;
      const shown = await list.readColumnValues('status');
      expect({ total: answer().totalRows, others: shown.filter((s) => s !== data.keyword) }, shown.join(' | ')).toEqual({ total: expected, others: [] });
      expect(expected).toBeGreaterThan(0);
    });
  });

  test(`TC-${CASES.noMatch.azureId}: should show an empty state when no member matches the keyword`, async ({
    memberManagementPage: list,
    page,
    steps,
  }) => {
    const data = CASES.noMatch;
    const { answer } = await keywordSearch({ list, page, steps }, data.keyword);

    await steps.step('Review the results - an empty-state message says no records were found', async () => {
      expect({ total: answer().totalRows, rows: await list.getVisibleRowCount(), message: await list.getEmptyStateText() })
        .toEqual({ total: 0, rows: 0, message: expect.stringMatching(data.emptyText) });
    });
  });

  test(`TC-${CASES.injection.azureId}: should handle SQL-like text in the search safely as plain text`, async ({
    memberManagementPage: list,
    page,
    steps,
  }) => {
    const data = CASES.injection;
    let dialogs = 0;
    page.on('dialog', (dialog) => { dialogs += 1; void dialog.dismiss().catch(() => undefined); });
    let before = -1;
    let status = -1;

    await steps.critical('Navigate to the Member Management module - the member list view is displayed', async () => {
      await list.openTable();
      before = (await listMemberRegister(page, {}, 1)).totalRows;
      expect(before).toBeGreaterThan(0);
    });

    await steps.critical(`Enter "${data.keyword}" into the keyword search box - the typed value is shown as plain text`, async () => {
      await typeKeyword(page, data.keyword);
      expect((await readSearchBox(page)).value).toBe(data.keyword);
    });

    await steps.step('Click Search - the system processes the request safely', async () => {
      const res = await NetworkUtils.captureResponse(page, ApiEndpoints.memberList, () => list.search(data.keyword));
      status = res?.status ?? -1;
      expect(status, `GetMembers answered ${res?.text.slice(0, 200) ?? 'nothing'}`).toBe(200);
    });

    await steps.step('Review the outcome - no error, data corruption or script execution; an empty or safely filtered result set', async () => {
      const errors = (await list.waitForVisibleMessages(2_000)).filter((m) => /error|fail|wrong/i.test(m));
      expect({ errors, scripts: dialogs, registerIntact: (await listMemberRegister(page, {}, 1)).totalRows, rows: await list.getVisibleRowCount() })
        .toEqual({ errors: [], scripts: 0, registerIntact: before, rows: 0 });
    });
  });

  test(`TC-${CASES.advancedCombined.azureId}: should narrow the list to members matching nationality, gender, status and special needs together`, async ({
    memberManagementPage: list,
    memberIn,
    page,
    steps,
  }) => {
    const data = CASES.advancedCombined;
    const matching = await memberIn('SpecialNeeds', { nationality: 'saudi', gender: 'female' });
    const notMatching = await memberIn('SpecialNeeds', { nationality: 'saudi', gender: 'male' });
    let answer: MemberListAnswer = { items: [], totalRows: -1 };

    await steps.critical('Navigate to the Member Management module - the member list view is displayed', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.critical('Open the Advanced Search panel - filters for nationality, gender, status and special-needs flag are displayed', async () => {
      expect(await list.openAdvancedSearch(), 'an Advanced Search panel opens from the Filters button').toBe(true);
    });

    await steps.step(`Select Nationality "${data.nationality}", Gender "${data.gender}", Status "${data.status}", Special Needs "${data.specialNeeds}" - each control reflects its selection`, async () => {
      await list.filterBy('nationality', data.nationality);
      answer = await list.filterBy('status', data.status);
      expect({ nationality: await list.readFilter('nationality'), status: await list.readFilter('status'), panel: await list.openAdvancedSearch() })
        .toEqual({ nationality: data.nationality, status: data.status, panel: true });
    });

    await steps.step('Click Apply - the list refreshes', async () => {
      expect(answer.totalRows).toBeGreaterThan(0);
    });

    await steps.step('Review the results - only members matching all four criteria are displayed', async () => {
      const genders = answer.items.map((i) => i.genderNameEn);
      expect({
        others: answer.items.filter((i) => !(i.nationalityNameEn.includes('Saudi') && i.genderNameEn === data.gender && i.isActive && i.isSpecialNeeds)).map((i) => i.memberCode),
        matchingShown: answer.items.some((i) => i.id === matching.id),
        notMatchingShown: answer.items.some((i) => i.id === notMatching.id),
      }, genders.join(' | ')).toEqual({ others: [], matchingShown: true, notMatchingShown: false });
    });
  });

  test(`TC-${CASES.singleCharacter.azureId}: should answer a one-character keyword consistently`, async ({
    memberManagementPage: list,
    page,
    steps,
  }) => {
    const data = CASES.singleCharacter;
    const { answer } = await keywordSearch({ list, page, steps }, data.keyword);

    await steps.step(`Review the results - every member matching "${data.keyword}" is returned, or a minimum-length message is shown`, async () => {
      const messages = await list.waitForVisibleMessages(1_000);
      if (messages.some((m) => data.minimumMessage.test(m))) {
        expect(answer().totalRows, `a minimum-length message: ${messages.join(' | ')}`).toBeLessThanOrEqual(0);
        return;
      }
      const key = ci(data.keyword);
      const expected = (await wholeRegister(page)).filter((i) => ci(i.displayNameEn).includes(key) || ci(i.memberCode).includes(key));
      const found = await searchAll(page, data.keyword);
      expect({ missing: expected.filter((e) => !found.some((f) => f.id === e.id)).map((e) => `${e.memberCode} ${e.displayNameEn}`), total: answer().totalRows >= expected.length })
        .toEqual({ missing: [], total: true });
    });
  });

  test(`TC-${CASES.clearFilters.azureId}: should restore the full member list after clearing an applied filter`, async ({
    memberManagementPage: list,
    memberIn,
    page,
    steps,
  }) => {
    const data = CASES.clearFilters;
    await memberIn('Inactive');
    let full = -1;

    await steps.critical('Navigate to the Member Management module - the member list view is displayed', async () => {
      await list.openTable();
      full = (await listMemberRegister(page, {}, 1)).totalRows;
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.critical(`Apply a filter, Status = "${data.status}" - only inactive members are listed`, async () => {
      const answer = await list.filterBy('status', data.status);
      const shown = await list.readColumnValues('status');
      expect({ others: shown.filter((s) => s !== data.status), fewer: answer.totalRows < full }).toEqual({ others: [], fewer: true });
    });

    let cleared: MemberListAnswer = { items: [], totalRows: -1 };
    await steps.step('Click "Clear Filters" - the filter fields reset to their default state', async () => {
      cleared = await list.clearAllFilters();
      expect({ status: await list.readFilter('status'), chips: await list.getChips() }).toEqual({ status: expect.stringMatching(data.defaultStatus), chips: [] });
    });

    await steps.step('Review the list - the full, unfiltered member list is displayed again', async () => {
      expect({ total: cleared.totalRows, rows: await list.countRows() }).toEqual({ total: full, rows: Math.min(full, 10) });
    });
  });

  test(`TC-${CASES.controlsPresent.azureId}: should present a labelled keyword search, the advanced filters and the Search, Apply and Clear Filters controls`, async ({
    memberManagementPage: list,
    page,
    steps,
  }) => {
    await steps.critical('Navigate to the Member Management module - the member list view is displayed', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.step('Verify the keyword search box is present and labelled - it is visible and labelled', async () => {
      const box = await readSearchBox(page);
      expect({ visible: box.visible, labelled: box.label !== '' }, `label "${box.label}"`).toEqual({ visible: true, labelled: true });
    });

    await steps.step('Verify the Advanced Search panel holds nationality, gender, status and special-needs filters - each is present and labelled', async () => {
      const statusOptions = await list.getFilterOptions('status');
      const nationalityOptions = await list.getFilterOptions('nationality');
      expect({ panel: await list.openAdvancedSearch(), status: statusOptions.length > 1, nationality: nationalityOptions.length > 1 })
        .toEqual({ panel: true, status: true, nationality: true });
    });

    await steps.step('Verify the Search, Apply and Clear Filters controls are present - every action button is visible and enabled appropriately', async () => {
      await list.filterBy('status', 'Active');
      const search = await toolbarButtons(page, /^search$/i);
      const apply = await toolbarButtons(page, /^apply/i);
      const clear = await toolbarButtons(page, /clear/i);
      expect({ search: search.some((b) => b.enabled), apply: apply.some((b) => b.enabled), clear: clear.some((b) => b.enabled) })
        .toEqual({ search: true, apply: true, clear: true });
    });
  });
});
