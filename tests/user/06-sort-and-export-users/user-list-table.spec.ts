import { test, expect } from '../../../fixtures';
import { CASES, PAGE_SIZE, TABLE_COLUMNS, WITH_COUNTRY_CODE } from '../../../data/user/sortAndExportUsers.data';
import { USER_COLUMN } from '../../../constants/user/userIds';
import { listUsers } from '../../../utils/UserProvisioning';

/**
 * User story 20412: Sort and Export Users - the table: 10 records a page, the
 * next / previous controls, and the columns the AC lists. See the data file.
 */
test.describe('US 20412 - Sort and Export Users (table and pages)', () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.tenPerPage.azureId}: should show exactly ten records on a page and the eleventh on the next page`, async ({
    page,
    steps,
    userIn,
    userListPage: list,
  }) => {
    await userIn('Active');
    let eleventh = '';

    await steps.critical('Navigate to the User Management module - the user list is displayed', async () => {
      await list.openTable();
      await list.expectToolbar();
      const register = await listUsers(page, {}, PAGE_SIZE + 1);
      expect(register.totalRows, 'more than 10 users exist (precondition)').toBeGreaterThan(PAGE_SIZE);
      eleventh = register.items[PAGE_SIZE].id;
    });

    await steps.step('Count the records shown on the first page - exactly 10 are displayed', async () => {
      expect(await list.countRows()).toBe(PAGE_SIZE);
    });

    await steps.step('Navigate to the next page - the 11th record and beyond are displayed on page 2', async () => {
      const request = await list.goToPage('next');
      const shown = await list.rowIdsOnScreen();
      expect({ pageNumber: request.pageNumber, firstOnPage2: shown[0] }).toEqual({ pageNumber: 2, firstOnPage2: eleventh });
    });
  });

  test(`TC-${CASES.nextPrevious.azureId}: should move between pages with the next and previous controls`, async ({ steps, userListPage: list }) => {
    let pageOne: string[] = [];

    await steps.critical('Navigate to the User Management module - the user list is displayed on page 1', async () => {
      await list.openTable();
      await list.expectToolbar();
      pageOne = await list.rowIdsOnScreen();
      await list.expectCurrentPage(1);
      expect(await list.isPagerButtonEnabled('next'), 'the list spans several pages (precondition)').toBe(true);
    });

    await steps.step('Click the next page control - page 2 is displayed with the next records and the page indicator updates', async () => {
      const request = await list.goToPage('next');
      const shown = await list.rowIdsOnScreen();
      await list.expectCurrentPage(2);
      expect({ pageNumber: request.pageNumber, overlap: shown.filter((id) => pageOne.includes(id)) }).toEqual({ pageNumber: 2, overlap: [] });
    });

    await steps.step('Click the previous page control - page 1 is displayed again with the original records', async () => {
      const request = await list.goToPage('prev');
      await list.expectCurrentPage(1);
      expect({ pageNumber: request.pageNumber, rows: await list.rowIdsOnScreen() }).toEqual({ pageNumber: 1, rows: pageOne });
    });
  });

  test(`TC-${CASES.tableColumns.azureId}: should show every required column populated in the table view`, async ({ steps, userIn, userListPage: list }) => {
    await userIn('Active');

    await steps.critical('Navigate to the User Management module - the user list is displayed', async () => {
      await list.open();
      await list.expectToolbar();
    });

    await steps.critical('Switch the list display to table view - the table layout is shown', async () => {
      await list.switchToTable();
      expect({ view: await list.readView(), rows: (await list.countRows()) > 0 }).toEqual({ view: 'table', rows: true });
    });

    await steps.step('Review the column headers - Name, Document ID, Identity Type, Nationality (Country Code), Gender, Mobile Number, Status and Actions are present and populated', async () => {
      const headers = await list.getHeaderTexts();
      const rows = await list.readRows();
      const empty = rows.flatMap((r) => (Object.keys(USER_COLUMN) as (keyof typeof USER_COLUMN)[]).filter((k) => r[k] === '').map((k) => `${r.name || r.id}: ${k}`));
      const actionless: string[] = [];
      for (const r of rows) if ((await list.readRowActions(r.id)).length === 0) actionless.push(r.name);
      expect({
        missingColumns: TABLE_COLUMNS.filter((c) => !headers.some((h) => h.replace(/\s+/g, ' ').trim().startsWith(c))),
        emptyCells: empty,
        rowsWithoutActions: actionless,
        nationalityWithoutCode: rows.filter((r) => !WITH_COUNTRY_CODE.test(r.nationality)).map((r) => r.nationality),
      }, headers.join(' | ')).toEqual({ missingColumns: [], emptyCells: [], rowsWithoutActions: [], nationalityWithoutCode: [] });
    });
  });
});
