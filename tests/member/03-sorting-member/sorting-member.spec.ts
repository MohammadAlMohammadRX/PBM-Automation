import { test, expect } from '../../../fixtures';
import type { Page } from '@playwright/test';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { MemberListAnswer, MemberManagementPage } from '../../../pages/member/MemberManagementPage';
import { MEMBER_SORT_COLUMN, MEMBER_SORT_FIELD, type MemberSortField } from '../../../constants/member/memberIds';
import { CASES } from '../../../data/member/sortingMember.data';
import type { MemberListItem } from '../../../utils/MemberProvisioning';
import { compareText, groupChanges, isOrdered, listInPayerScope, readTableIds, statusOf, waitForCardIds, wholeRegister } from '../../../utils/member/writerAHelpers';

const ascending = (a: string, b: string): number => compareText(a, b);
const descending = (a: string, b: string): number => compareText(b, a);

/** The screen renders the answer's rows in the answer's order. */
async function expectScreenFollows(page: Page, answer: MemberListAnswer): Promise<void> {
  await expect.poll(async () => readTableIds(page), { message: 'the rows on screen, in order', timeout: 10_000 }).toEqual(answer.items.map((i) => i.id));
}

/**
 * Sorts by `field` one way, then the other, and checks the value `valueOf`
 * reads off each answered row is ordered, the screen follows, and the menu marks
 * the option.
 */
async function sortBothWays(
  { list, page, steps }: { list: MemberManagementPage; page: Page; steps: TestSteps },
  field: MemberSortField,
  valueOf: (item: MemberListItem) => string,
  label: RegExp,
  wording: { first: string; second: string },
): Promise<void> {
  await steps.critical('Navigate to the Member Management module - the module loads', async () => {
    await list.openTable();
    expect(await list.countRows(), 'the list rows').toBeGreaterThan(1);
  });

  await steps.step(wording.first, async () => {
    const answer = await list.sortBy(field, 'asc');
    const values = answer.items.map(valueOf);
    await expectScreenFollows(page, answer);
    expect({ ordered: isOrdered(values, ascending), indicator: await list.readSortLabel() }, values.join(' | ')).toEqual({ ordered: true, indicator: expect.stringMatching(label) });
  });

  await steps.step(wording.second, async () => {
    const answer = await list.sortBy(field, 'desc');
    const values = answer.items.map(valueOf);
    await expectScreenFollows(page, answer);
    expect({ ordered: isOrdered(values, descending), indicator: await list.readSortLabel() }, values.join(' | ')).toEqual({ ordered: true, indicator: expect.stringMatching(label) });
  });
}

/**
 * User story 14378: Sorting Member.
 * The default newest-first order, sorting by member ID, name, mobile number,
 * nationality and status both ways, the sort kept across Card and Table views, a
 * one-record list, and the payer scope. See the data file for how the cases map
 * onto the live list.
 */
test.describe('US 14378 - Sorting Member', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.defaultNewest.azureId}: should list the members from newest to oldest by creation date by default`, async ({
    memberManagementPage: list,
    memberIn,
    steps,
  }) => {
    const older = await memberIn('Active');
    const newer = await memberIn('Active');
    let sent: Record<string, unknown> = {};

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      sent = await list.captureListRequest(() => list.open());
      expect(sent.sortBy, `the first GetMembers request: ${JSON.stringify(sent)}`).toBe(CASES.defaultNewest.sortBy);
    });

    await steps.step('Open the Member List without applying any sort - the list loads', async () => {
      expect(await list.countRows()).toBeGreaterThan(1);
    });

    await steps.step('Observe the order of records - newest to oldest by creation date', async () => {
      const names = await list.readNames();
      expect({ firstTwo: names.slice(0, 2), indicator: await list.readSortLabel() })
        .toEqual({ firstTwo: [newer.displayNameEn, older.displayNameEn], indicator: expect.stringMatching(CASES.defaultNewest.sortLabel) });
    });
  });

  test(`TC-${CASES.byMemberId.azureId}: should order the list by Member ID ascending, then descending`, async ({
    memberManagementPage: list,
    page,
    steps,
  }) => {
    let codes: string[] = [];

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await list.openTable();
      codes = (await wholeRegister(page)).map((i) => i.memberCode).sort(ascending);
      expect(await list.countRows()).toBeGreaterThan(1);
    });

    await steps.step('Click the Member ID sort control once (Member ID (A-Z)) - the list reorders by Member ID ascending', async () => {
      const answer = await list.sortBy('memberCode', 'asc');
      await expectScreenFollows(page, answer);
      const shown = await list.readColumnValues('memberCode');
      expect({ ordered: isOrdered(shown, ascending), first: shown[0], indicator: await list.readSortLabel() }, shown.join(' | '))
        .toEqual({ ordered: true, first: codes[0], indicator: expect.stringMatching(CASES.byMemberId.label) });
    });

    await steps.step('Click the Member ID sort control again (Member ID (Z-A)) - the list reorders by Member ID descending', async () => {
      const answer = await list.sortBy('memberCode', 'desc');
      await expectScreenFollows(page, answer);
      const shown = await list.readColumnValues('memberCode');
      expect({ ordered: isOrdered(shown, descending), first: shown[0], indicator: await list.readSortLabel() }, shown.join(' | '))
        .toEqual({ ordered: true, first: codes[codes.length - 1], indicator: expect.stringMatching(CASES.byMemberId.label) });
    });
  });

  test(`TC-${CASES.byName.azureId}: should order the list by patient name A-Z, then Z-A`, async ({
    memberManagementPage: list,
    page,
    steps,
  }) => {
    await sortBothWays({ list, page, steps }, 'name', (i) => i.displayNameEn.replace(/\s+/g, ' ').trim(), CASES.byName.label, {
      first: 'Select sort by Patient Name (A-Z) - the list reorders alphabetically from A to Z',
      second: 'Select sort by Patient Name (Z-A) - the list reorders alphabetically from Z to A',
    });
  });

  test(`TC-${CASES.byMobile.azureId}: should order the list by mobile number in both directions`, async ({
    memberManagementPage: list,
    page,
    steps,
  }) => {
    await sortBothWays({ list, page, steps }, 'mobileNumber', (i) => i.mobileNumber, CASES.byMobile.label, {
      first: 'Select sort by Mobile Number - the list reorders by mobile number',
      second: 'Reverse the sort direction - the list order reverses',
    });
  });

  test(`TC-${CASES.byNationality.azureId}: should order the list by patient nationality in both directions`, async ({
    memberManagementPage: list,
    page,
    steps,
  }) => {
    await sortBothWays({ list, page, steps }, 'nationality', (i) => i.nationalityNameEn, CASES.byNationality.label, {
      first: 'Select sort by Nationality - the list reorders by nationality',
      second: 'Reverse the sort direction - the list order reverses',
    });
  });

  test(`TC-${CASES.keptAcrossViews.azureId}: should keep the Member ID ascending order when switching to Card View and back to Table View`, async ({
    memberManagementPage: list,
    page,
    steps,
  }) => {
    let tableIds: string[] = [];

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(1);
    });

    await steps.critical('Sort by Member ID ascending in Table View - the list reorders accordingly', async () => {
      const answer = await list.sortBy('memberCode', 'asc');
      await expectScreenFollows(page, answer);
      tableIds = await readTableIds(page);
      expect(isOrdered(answer.items.map((i) => i.memberCode), ascending)).toBe(true);
    });

    await steps.step('Switch to Card View - the cards show in the same Member ID ascending order', async () => {
      await list.switchToCards();
      const cards = await waitForCardIds(page);
      expect(cards.slice(0, tableIds.length)).toEqual(tableIds);
    });

    await steps.step('Switch back to Table View - the table keeps the same sort order', async () => {
      await list.switchToTable();
      await expect.poll(async () => readTableIds(page), { timeout: 10_000 }).toEqual(tableIds);
      expect(await list.readSortLabel()).toMatch(CASES.keptAcrossViews.label);
    });
  });

  test(`TC-${CASES.byStatus.azureId}: should group the list by status and reverse the grouping with the direction`, async ({
    memberManagementPage: list,
    memberIn,
    page,
    steps,
  }) => {
    await memberIn('Active');
    await memberIn('Inactive');
    let firstAscending = '';

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(1);
    });

    await steps.step('Select sort by Status - the records are ordered / grouped by status', async () => {
      const answer = await list.sortBy('status', 'asc');
      await expectScreenFollows(page, answer);
      const statuses = answer.items.map(statusOf);
      firstAscending = statuses[0] ?? '';
      expect({ grouped: groupChanges(statuses) <= 1, indicator: await list.readSortLabel() }, statuses.join(' | '))
        .toEqual({ grouped: true, indicator: expect.stringMatching(CASES.byStatus.label) });
    });

    await steps.step('Reverse the sort direction - the status grouping order reverses', async () => {
      const answer = await list.sortBy('status', 'desc');
      await expectScreenFollows(page, answer);
      const statuses = answer.items.map(statusOf);
      expect({ grouped: groupChanges(statuses) <= 1, firstDiffers: (statuses[0] ?? '') !== firstAscending }, `${statuses.join(' | ')} (ascending began with ${firstAscending})`)
        .toEqual({ grouped: true, firstDiffers: true });
    });
  });

  test(`TC-${CASES.singleRecord.azureId}: should keep a one-record list displayed without error under every sort option`, async ({
    memberManagementPage: list,
    memberIn,
    steps,
  }) => {
    const member = await memberIn('Active');

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.critical(`View a scope containing exactly one member (a search on "${member.lastName}") - the list shows a single record`, async () => {
      const answer = await list.searchFor(member.lastName);
      expect({ total: answer.totalRows, names: await list.readNames() }).toEqual({ total: 1, names: [member.displayNameEn] });
    });

    await steps.step('Apply each sort option - the single record stays displayed without error and the sort control responds', async () => {
      const outcomes: string[] = [];
      for (const field of Object.keys(MEMBER_SORT_FIELD) as MemberSortField[]) {
        for (const direction of ['asc', 'desc'] as const) {
          const sent = await list.captureListRequest(async () => { await list.sortBy(field, direction); });
          const names = await list.readNames();
          const errors = (await list.waitForVisibleMessages(1_000)).filter((m) => /error|fail|wrong/i.test(m));
          if (sent.sortBy !== `${MEMBER_SORT_COLUMN[field]} ${direction}` || names.join() !== member.displayNameEn || errors.length > 0) {
            outcomes.push(`${field} ${direction}: sent ${String(sent.sortBy)}, rows ${names.join(' | ')}, ${errors.join(' | ')}`);
          }
        }
      }
      expect(outcomes).toEqual([]);
    });
  });

  test(`TC-${CASES.payerScope.azureId}: should sort only the members within the selected payer's scope`, async ({
    memberManagementPage: list,
    memberEnrolled,
    memberIn,
    page,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const { member: inPayer, enrolments } = await memberEnrolled({ policies: 1 });
    const outside = await memberIn('Active');
    const payer = enrolments[0].policy;
    let sorted!: MemberListAnswer;

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.critical(`Log in as a user assigned to one payer ("${payer.payerName}", chosen in the payer select) and sort by Member ID - the list reorders`, async () => {
      const { header } = await list.selectPayerScope(payer.payerName);
      sorted = await list.sortBy('memberCode', 'asc');
      expect({ header, ordered: isOrdered(sorted.items.map((i) => i.memberCode), ascending) }).toEqual({ header: payer.payerId, ordered: true });
    });

    await steps.step('Verify the sorted records - only members within the payer scope appear, no cross-payer data', async () => {
      const scoped = await listInPayerScope(page, payer.payerId, { sortBy: `${MEMBER_SORT_COLUMN.memberCode} asc` });
      const scopedIds = scoped.items.map((i) => i.id);
      expect({
        shownOutsideScope: sorted.items.filter((i) => !scopedIds.includes(i.id)).map((i) => i.memberCode),
        total: sorted.totalRows,
        payerMemberInScope: scopedIds.includes(inPayer.id),
        otherMemberInScope: scopedIds.includes(outside.id),
        otherMemberShown: await list.isListed(outside.displayNameEn),
      }).toEqual({ shownOutsideScope: [], total: scoped.totalRows, payerMemberInScope: true, otherMemberInScope: false, otherMemberShown: false });
    });
  });
});
