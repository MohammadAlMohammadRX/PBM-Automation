import { test, expect } from '../../../fixtures';
import type { Page } from '@playwright/test';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { IdentityListAnswer } from '../../../pages/user/IdentityListPage';
import type { UserListPage } from '../../../pages/user/UserListPage';
import { clickDialogAction, type UserExportResult } from '../../../pages/user/userCommon';
import {
  CASES,
  ERROR_TOAST,
  EXPORT_FILE,
  EXPORT_HEADERS,
  NO_MATCH_TERM,
  SCOPED_EXPORT_RIGHTS,
  SCOPE_CHOICES,
  SCOPE_PAYER,
} from '../../../data/user/sortAndExportUsers.data';
import { OPTION } from '../../../data/user/searchAndFilterUsers.data';
import { USER_LOOKUP, listUsers, type ProvisionedUser, type UserListItem } from '../../../utils/UserProvisioning';
import { advancedOptionLike, clearAllChips, exportedUserNames, otherPayer, tryExport } from '../../../utils/user/writerAHelpers';

/**
 * User story 20412: Sort and Export Users - Export Users as CSV / Excel, the
 * All / Filtered choice, a filtered export, a payer-scoped administrator's
 * Export All Data, and the exploratory sequence. Files are parsed and compared
 * with GetUsers for the same criteria. See the data file.
 */

async function openModule(steps: TestSteps, list: UserListPage): Promise<void> {
  await steps.critical('Navigate to the User Management module - the user list is displayed', async () => {
    await list.openTable();
    await list.expectToolbar();
  });
}

/** 20554 / 20556: Export All Data in one format. */
async function exportWhole(
  { steps, list, page, user }: { steps: TestSteps; list: UserListPage; page: Page; user: ProvisionedUser },
  format: 'csv' | 'excel',
): Promise<void> {
  const name = format === 'csv' ? 'CSV' : 'Excel';
  let file!: UserExportResult;
  await openModule(steps, list);

  await steps.step('Click "Export Users" - the export format options are displayed', async () => {
    const dialog = await list.chooseExport('all');
    expect({ csv: dialog.actions.some((a) => /CSV/i.test(a)), excel: dialog.actions.some((a) => /Excel/i.test(a)) }, `${dialog.title} / ${dialog.message} / ${dialog.actions.join(' | ')}`)
      .toEqual({ csv: true, excel: true });
    await clickDialogAction(page, 'cancel');
  });

  await steps.critical(`Select "${name}" - the export is generated`, async () => {
    file = await list.exportAndParse('all', format);
    expect({ format: file.request.format, filename: EXPORT_FILE[format].test(file.filename), bytes: file.bytes.length > 0 }, file.filename)
      .toEqual({ format: format === 'csv' ? 1 : 2, filename: true, bytes: true });
  });

  await steps.step(`Open the downloaded file - it is a valid ${name} file holding the user list`, async () => {
    const register = await listUsers(page, {}, 1);
    expect({
      missingColumns: EXPORT_HEADERS.filter((h) => !file.parsed.headers.includes(h)),
      rows: file.parsed.rows.length,
      suiteUserIn: exportedUserNames(file).includes(user.documentId),
    }, file.parsed.headers.join(' | ')).toEqual({ missingColumns: [], rows: register.totalRows, suiteUserIn: true });
  });
}

test.describe('US 20412 - Sort and Export Users (export)', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.exportCsv.azureId}: should download the user list as a CSV file`, async ({ page, steps, userIn, userListPage: list }) => {
    const user = await userIn('Active');
    await exportWhole({ steps, list, page, user }, 'csv');
  });

  test(`TC-${CASES.exportExcel.azureId}: should download the user list as an Excel workbook`, async ({ page, steps, userIn, userListPage: list }) => {
    const user = await userIn('Active');
    await exportWhole({ steps, list, page, user }, 'excel');
  });

  test(`TC-${CASES.scopeQuestion.azureId}: should ask whether to export all users or only the filtered results when a search is applied`, async ({
    page,
    steps,
    userIn,
    userListPage: list,
  }) => {
    await userIn('Active');
    await openModule(steps, list);

    await steps.critical('Apply a search filter that narrows the visible users (Status = Active) - the filtered subset is displayed', async () => {
      await list.openAdvancedSearch();
      await list.fillAdvanced({ status: await advancedOptionLike(list, 'status', OPTION.active) });
      const { request, answer } = await list.applyAdvanced();
      expect({ filter: request.isActive, narrowed: answer.totalRows < (await listUsers(page, {}, 1)).totalRows, onlyActive: answer.items.every((u) => u.isActive) })
        .toEqual({ filter: true, narrowed: true, onlyActive: true });
    });

    await steps.step('Click "Export Users" - the administrator is asked to choose between "All Users" and "Filtered Results"', async () => {
      const menu = await list.getExportOptions();
      const dialog = await list.chooseExport('selected');
      const offered = [dialog.title, dialog.message, ...dialog.actions].join(' | ');
      await clickDialogAction(page, 'cancel').catch(() => undefined);
      expect({ allUsers: SCOPE_CHOICES.all.test(offered), filteredResults: SCOPE_CHOICES.filtered.test(offered) },
        `Export menu: [${menu.join(' | ')}]; after "Selected Export" the dialog shows: ${offered}`)
        .toEqual({ allUsers: true, filteredResults: true });
    });
  });

  test(`TC-${CASES.filteredExport.azureId}: should export only the users matching the active filter`, async ({
    page,
    steps,
    userIn,
    userListPage: list,
  }) => {
    const user = await userIn('Active', { nationality: 'saudi' });
    let filtered!: IdentityListAnswer<UserListItem>;
    let file!: UserExportResult;
    await openModule(steps, list);

    await steps.critical('Apply a search filter (Nationality = Saudi Arabia) - the list shows only matching users', async () => {
      await list.openAdvancedSearch();
      await list.fillAdvanced({ nationality: await advancedOptionLike(list, 'nationality', OPTION.saudi) });
      const applied = await list.applyAdvanced();
      filtered = applied.answer;
      expect({ filter: applied.request.nationalityId, others: filtered.items.filter((u) => u.nationalityId !== USER_LOOKUP.nationality.saudi).length })
        .toEqual({ filter: USER_LOOKUP.nationality.saudi, others: 0 });
    });

    await steps.critical('Click "Export Users", choose "Filtered Results" and a format - the export is generated', async () => {
      file = await list.exportAndParse('selected', 'csv');
      expect({ filter: file.request.nationalityId, filename: EXPORT_FILE.csv.test(file.filename) }, file.filename).toEqual({ filter: USER_LOOKUP.nationality.saudi, filename: true });
    });

    await steps.step('Open the downloaded file and compare it with the on-screen filtered list - it holds only the filtered users', async () => {
      const expected = (await listUsers(page, { nationalityId: USER_LOOKUP.nationality.saudi }, Math.max(filtered.totalRows, 10))).items.map((u) => u.userName).sort();
      const exported = exportedUserNames(file).sort();
      expect({
        rows: exported.length,
        outsideFilter: exported.filter((n) => !expected.includes(n)),
        nonSaudi: file.parsed.rows.filter((r) => !/^Saudi/i.test(String(r.Nationality ?? ''))).length,
        suiteUserIn: exported.includes(user.documentId),
      }).toEqual({ rows: filtered.totalRows, outsideFilter: [], nonSaudi: 0, suiteUserIn: true });
    });
  });

  test(`TC-${CASES.scopedExportAll.azureId}: should export only the users of the payer-scoped administrator's own payers`, async ({
    page,
    steps,
    suiteRole,
    suiteSession,
    userIn,
  }) => {
    const payerB = await otherPayer(page, SCOPE_PAYER);
    const scopedRole = await suiteRole({ hasAssignedPayers: true });
    const payerBUser = await userIn('Active', { roles: [{ roleId: scopedRole.id, payerIds: [payerB.id] }] });
    const s = await suiteSession({ rights: SCOPED_EXPORT_RIGHTS, payers: [SCOPE_PAYER] });
    let visible: string[] = [];
    let file!: UserExportResult;

    await steps.critical(`Navigate to the User Management module as the administrator scoped to "${SCOPE_PAYER}" - the list shows only that payer's users`, async () => {
      await s.users.openTable();
      await s.users.expectToolbar();
      const scoped = await listUsers(s.page, {}, 200);
      visible = scoped.items.map((u) => u.userName);
      expect({ self: visible.includes(s.user.documentId), payerBUser: visible.includes(payerBUser.documentId) }).toEqual({ self: true, payerBUser: false });
    });

    await steps.critical('Click "Export Users" and select "All Users" (Export All Data) and a format - the export is generated', async () => {
      file = await s.users.exportAndParse('all', 'csv');
      expect(EXPORT_FILE.csv.test(file.filename), file.filename).toBe(true);
    });

    await steps.step(`Open the downloaded file - only users of "${SCOPE_PAYER}" are present, none of "${payerB.name}"`, async () => {
      const exported = exportedUserNames(file);
      expect({ outsideScope: exported.filter((n) => !visible.includes(n)), payerBUser: exported.includes(payerBUser.documentId), rows: exported.length })
        .toEqual({ outsideScope: [], payerBUser: false, rows: visible.length });
    });
  });

  test(`TC-${CASES.exploratory.azureId}: should stay consistent across combined sorting, filtering, view switching and exporting`, async ({
    page,
    steps,
    userIn,
    userListPage: list,
  }) => {
    await userIn('Active');
    await openModule(steps, list);

    await steps.step('Apply a sort, then a search filter, switch between card and table view, then export - each action is reflected consistently in the list and the export', async () => {
      const sorted = await list.sortByOption('name');
      await list.openAdvancedSearch();
      await list.fillAdvanced({ status: await advancedOptionLike(list, 'status', OPTION.active) });
      const filtered = await list.applyAdvanced();
      await list.switchToCards();
      const cards = await list.cardIdsOnScreen();
      await list.switchToTable();
      const rows = await list.rowIdsOnScreen();
      const exported = await list.exportAndParse('selected', 'csv');
      expect({
        sortKept: filtered.request.sortBy === sorted.request.sortBy,
        cardsAreRows: cards.slice(0, rows.length).join() === rows.join(),
        exportFiltered: exported.request.isActive,
        exportRows: exported.parsed.rows.length,
        exportOnlyActive: exported.parsed.rows.every((r) => /^Active$/i.test(String(r.Active ?? ''))),
      }).toEqual({ sortKept: true, cardsAreRows: true, exportFiltered: true, exportRows: filtered.answer.totalRows, exportOnlyActive: true });
    });

    await steps.step('Clear the filter and sort in different combinations, including an export of an empty filtered result - no error and no inconsistent data', async () => {
      const cleared = await clearAllChips(list, page);
      await list.sortByOption('newest');
      const empty = await list.searchFor(NO_MATCH_TERM);
      const attempt = await tryExport(list, 'selected', 'csv');
      const restored = await list.searchFor('');
      const unfiltered = (await listUsers(page, {}, 1)).totalRows;
      expect({
        clearedToAll: cleared?.totalRows ?? unfiltered,
        emptyResult: empty.totalRows,
        emptyExportRows: attempt.result ? attempt.result.parsed.rows.length : 0,
        errorToasts: attempt.toasts.filter((t) => ERROR_TOAST.test(t)),
        restored: restored.totalRows,
      }, attempt.error).toEqual({ clearedToAll: unfiltered, emptyResult: 0, emptyExportRows: 0, errorToasts: [], restored: unfiltered });
    });
  });
});
