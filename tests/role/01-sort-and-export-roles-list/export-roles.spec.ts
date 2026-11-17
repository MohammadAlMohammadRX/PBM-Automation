import { test, expect } from '../../../fixtures';
import type { RoleListResult } from '../../../pages/role/RoleAdministrationPage';
import { ROLE_MESSAGES } from '../../../data/role/common.data';
import {
  CASES,
  EXCEL_EXTENSION,
  EXPECTED_FILE_COLUMNS,
  EXPORT_CHOICES,
  EXPORT_DOWNLOADED,
  EXPORT_FAILED,
  EXPORT_FORMAT,
  EXPORT_ORDER_MUST_MATCH,
  FILE_NAME_COLUMN,
  FILTER_ROLE_LABELS,
  NO_MATCH_TERM,
  SEARCH_SORT_ROLES,
  SORT_FIELD,
} from '../../../data/role/sortAndExportRolesList.data';
import { allRoles } from '../../../utils/role/roleApi';
import {
  createSuiteRoles,
  describeExport,
  emptyExportOutcome,
  exportMismatches,
  exportRoles,
  exportedColumn,
  fieldOf,
  groupToken,
  hasMessage,
  namesOf,
  normalise,
  screenNames,
  screenShows,
  sortedCopy,
  type RoleExport,
} from '../../../utils/role/writerAHelpers';

/**
 * User story 21280: Sort and Export Roles list - the export cases. Export -> Selected Export / Export All Data
 * -> the format dialog -> Excel; every file is saved under the test's output folder and read back
 * (utils/XlsxUtils) and compared with the screen / GetRoles. Suite roles only. See the data file.
 */

const NO_EXPORT: RoleExport = { menu: [], scopeEnabled: false, formatDialog: false, filename: '', savedTo: '', parsed: null, toasts: [] };

test.describe('US 21280 - Sort and Export Roles list (export)', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.exportSelectedFiltered.azureId}: should export only the filtered roles when Export Selected is chosen with a search applied`, async ({ steps, suiteRoles, roleAdmin, page }, testInfo) => {
    const group = groupToken();
    let ours: string[] = [];
    let total = 0;
    let result: RoleExport = NO_EXPORT;

    await steps.critical('Navigate to the Role Management module - the module loads (two suite roles carrying one search token exist)', async () => {
      ours = namesOf(await createSuiteRoles(suiteRoles, FILTER_ROLE_LABELS.map((label) => ({ label: `${group} ${label}` }))));
      const answer = await roleAdmin.open();
      total = answer.totalRows;
      expect(answer.status, `GetRoles answered ${answer.status}`).toBe(200);
    });

    await steps.critical(`Apply a search filter that returns a subset of roles ("${group}") - the list updates to show only roles matching the filter`, async () => {
      const searched = await roleAdmin.search(group);
      const screen = await screenShows(roleAdmin, searched);
      expect({ rows: sortedCopy(namesOf(searched.items)), narrowed: searched.totalRows < total, screenIsAnswer: screen.shown.join(',') === screen.expected.join(',') }, `${searched.totalRows} of ${total} roles`)
        .toEqual({ rows: sortedCopy(ours), narrowed: true, screenIsAnswer: true });
    });

    await steps.step(`Select the Export option - the system presents "${EXPORT_CHOICES[0]}" and "${EXPORT_CHOICES[1]}" choices`, async () => {
      const labels = await roleAdmin.exportScopes();
      expect(labels.map(normalise), `the Export menu reads [${labels.join(' | ')}]`).toEqual([...EXPORT_CHOICES]);
    });

    await steps.critical(`Choose "${EXPORT_CHOICES[0]}" (then Excel) - the system generates a downloadable file`, async () => {
      result = await exportRoles(page, testInfo, 'selected', EXPORT_FORMAT);
      expect({ file: result.parsed !== null, excel: EXCEL_EXTENSION.test(result.filename) }, describeExport(result)).toEqual({ file: true, excel: true });
    });

    await steps.step('Open the exported file - the file contains only the filtered roles shown in step 2', async () => {
      expect(sortedCopy(exportedColumn(result, FILE_NAME_COLUMN)), describeExport(result)).toEqual(sortedCopy(ours));
    });
  });

  test(`TC-${CASES.exportAllIgnoresFilter.azureId}: should export every role when Export All Data is chosen with a search applied`, async ({ steps, suiteRoles, roleAdmin, page }, testInfo) => {
    const group = groupToken();
    let ours: string[] = [];
    let total = 0;
    let result: RoleExport = NO_EXPORT;

    await steps.critical('Navigate to the Role Management module - the module loads (two suite roles carrying one search token exist)', async () => {
      ours = namesOf(await createSuiteRoles(suiteRoles, FILTER_ROLE_LABELS.map((label) => ({ label: `${group} ${label}` }))));
      const answer = await roleAdmin.open();
      total = answer.totalRows;
      expect(answer.status, `GetRoles answered ${answer.status}`).toBe(200);
    });

    await steps.critical(`Apply a search filter that returns a subset of roles ("${group}") - the list updates to show only roles matching the filter`, async () => {
      const searched = await roleAdmin.search(group);
      expect({ rows: sortedCopy(namesOf(searched.items)), narrowed: searched.totalRows < total }, `${searched.totalRows} of ${total} roles`).toEqual({ rows: sortedCopy(ours), narrowed: true });
    });

    await steps.step(`Select the Export option - the system presents "${EXPORT_CHOICES[0]}" and "${EXPORT_CHOICES[1]}" choices`, async () => {
      const labels = await roleAdmin.exportScopes();
      expect(labels.map(normalise), `the Export menu reads [${labels.join(' | ')}]`).toEqual([...EXPORT_CHOICES]);
    });

    await steps.critical(`Choose "${EXPORT_CHOICES[1]}" (then Excel) - the system generates a downloadable file`, async () => {
      result = await exportRoles(page, testInfo, 'all', EXPORT_FORMAT);
      expect({ file: result.parsed !== null, excel: EXCEL_EXTENSION.test(result.filename) }, describeExport(result)).toEqual({ file: true, excel: true });
    });

    await steps.step('Open the exported file - the file contains every role in the system, not only the filtered subset', async () => {
      const every = namesOf(await allRoles(page));
      expect(sortedCopy(exportedColumn(result, FILE_NAME_COLUMN)), `${describeExport(result)}; GetRoles lists ${every.length} roles`).toEqual(sortedCopy(every));
    });
  });

  test(`TC-${CASES.exportChoiceWithSearch.azureId}: should offer both export scopes when a search is active`, async ({ steps, suiteRoles, roleAdmin }) => {
    const group = groupToken();
    let ours: string[] = [];

    await steps.critical('Navigate to the Role Management module - the module loads (a suite role carrying a search token exists)', async () => {
      ours = namesOf(await createSuiteRoles(suiteRoles, [{ label: `${group} ${FILTER_ROLE_LABELS[0]}` }]));
      const answer = await roleAdmin.open();
      expect(answer.status, `GetRoles answered ${answer.status}`).toBe(200);
    });

    await steps.step(`Enter a search term in the roles search field ("${group}") - the list transitions to a filtered state showing matching roles only`, async () => {
      const searched = await roleAdmin.search(group);
      expect({ searchText: searched.request.searchText, rows: namesOf(searched.items) }).toEqual({ searchText: group, rows: ours });
    });

    await steps.step(`Select the Export option - an export-choice state shows both "${EXPORT_CHOICES[0]}" and "${EXPORT_CHOICES[1]}"`, async () => {
      const labels = await roleAdmin.exportScopes();
      expect(labels.map(normalise), `the Export menu reads [${labels.join(' | ')}]`).toEqual([...EXPORT_CHOICES]);
    });
  });

  test(`TC-${CASES.exportConfirmation.azureId}: should confirm a successful export with "${EXPORT_DOWNLOADED}"`, async ({ steps, roleAdmin, page }, testInfo) => {
    let result: RoleExport = NO_EXPORT;

    await steps.critical('Navigate to the Role Management module - the module loads with roles available to export', async () => {
      const answer = await roleAdmin.open();
      expect({ status: answer.status, roles: answer.totalRows > 0 }).toEqual({ status: 200, roles: true });
    });

    await steps.step(`Select the Export option and choose a scope ("${EXPORT_CHOICES[1]}", then Excel) - the system generates the export file`, async () => {
      result = await exportRoles(page, testInfo, 'all', EXPORT_FORMAT);
      expect({ file: result.parsed !== null, rows: (result.parsed?.rows.length ?? 0) > 0 }, describeExport(result)).toEqual({ file: true, rows: true });
    });

    await steps.step(`Wait for the export to complete - the system displays the message "${EXPORT_DOWNLOADED}"`, async () => {
      expect(hasMessage(result.toasts, EXPORT_DOWNLOADED), `messages shown: [${result.toasts.join(' | ')}]`).toBe(true);
    });
  });

  test(`TC-${CASES.searchSortExport.azureId}: should keep the search through two sorts and export the same filtered roles shown on screen`, async ({ steps, suiteRoles, roleAdmin, page }, testInfo) => {
    const group = groupToken();
    let ours: string[] = [];
    let shown: string[] = [];

    await steps.critical('Navigate to the Role Management module - the module loads (three suite roles with varied names and statuses exist)', async () => {
      ours = namesOf(await createSuiteRoles(suiteRoles, SEARCH_SORT_ROLES.map((r) => ({ label: `${group} ${r.label}`, isActive: r.isActive }))));
      const answer = await roleAdmin.open();
      expect(answer.status, `GetRoles answered ${answer.status}`).toBe(200);
    });

    await steps.step('Apply a search filter, then sort the filtered results by Role Name, then switch the sort to Status - the list updates after each action without losing the filter', async () => {
      const kept = (a: RoleListResult) => ({ searchText: a.request.searchText, rows: sortedCopy(namesOf(a.items)) });
      const searched = await roleAdmin.search(group);
      const byName = await roleAdmin.sortBy('rolename');
      const byStatus = await roleAdmin.sortBy('status');
      const screen = await screenShows(roleAdmin, byStatus);
      shown = await screenNames(roleAdmin);
      const want = { searchText: group, rows: sortedCopy(ours) };
      expect({ search: kept(searched), name: kept(byName), status: kept(byStatus), fields: [fieldOf(byName.request.sortBy), fieldOf(byStatus.request.sortBy)], screenIsAnswer: screen.shown.join(',') === screen.expected.join(',') },
        `asked "${String(byName.request.sortBy)}" then "${String(byStatus.request.sortBy)}"; screen: ${shown.join(' | ')}`)
        .toEqual({ search: want, name: want, status: want, fields: [SORT_FIELD.rolename, SORT_FIELD.status], screenIsAnswer: true });
    });

    await steps.step('Export the currently filtered and sorted list using Export Selected (then Excel) - the exported file reflects the same filtered set shown on screen', async () => {
      const result = await exportRoles(page, testInfo, 'selected', EXPORT_FORMAT);
      const fileNames = exportedColumn(result, FILE_NAME_COLUMN);
      expect({ file: sortedCopy(fileNames), order: EXPORT_ORDER_MUST_MATCH ? fileNames : [] },
        `${describeExport(result)}; file order: ${fileNames.join(' | ')}; screen order: ${shown.join(' | ')}`)
        .toEqual({ file: sortedCopy(ours), order: EXPORT_ORDER_MUST_MATCH ? shown : [] });
    });
  });

  test(`TC-${CASES.exportExcelColumns.azureId}: should deliver an .xlsx file whose columns are Role ID, Role Name, Description and Status matching the list`, async ({ steps, roleAdmin, page }, testInfo) => {
    let result: RoleExport = NO_EXPORT;

    await steps.critical('Navigate to the Role Management module - the module loads', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status, `GetRoles answered ${answer.status}`).toBe(200);
    });

    await steps.critical(`Select the Export option and export the roles list ("${EXPORT_CHOICES[1]}", then Excel) - the system generates and downloads a file`, async () => {
      result = await exportRoles(page, testInfo, 'all', EXPORT_FORMAT);
      expect(result.parsed !== null, describeExport(result)).toBe(true);
    });

    await steps.step('Verify the downloaded file\'s extension and format - the file is saved as an .xlsx Excel file', async () => {
      expect({ extension: EXCEL_EXTENSION.test(result.filename), readable: (result.parsed?.headers.length ?? 0) > 0 }, describeExport(result)).toEqual({ extension: true, readable: true });
    });

    await steps.step(`Open the file and compare its columns against the roles list (${EXPECTED_FILE_COLUMNS.join(', ')}) - each column is present and populated with matching data`, async () => {
      const items = await allRoles(page);
      const headers = result.parsed?.headers ?? [];
      expect({ missing: EXPECTED_FILE_COLUMNS.filter((c) => !headers.includes(c)), mismatches: exportMismatches(result, items, FILE_NAME_COLUMN), rows: result.parsed?.rows.length ?? 0 },
        `file columns: [${headers.join(', ')}]; ${result.parsed?.rows.length ?? 0} rows, GetRoles lists ${items.length}`)
        .toEqual({ missing: [], mismatches: [], rows: items.length });
    });
  });

  test(`TC-${CASES.exportNoResults.azureId}: should export an empty file or say there is nothing to export when the search finds no role`, async ({ steps, roleAdmin, page }, testInfo) => {
    await steps.critical('Navigate to the Role Management module - the module loads', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status, `GetRoles answered ${answer.status}`).toBe(200);
    });

    await steps.critical(`Enter a search term that matches no existing role ("${NO_MATCH_TERM}") - the list displays zero roles with an empty-state message`, async () => {
      const searched = await roleAdmin.search(NO_MATCH_TERM);
      await expect(roleAdmin.emptyText()).toHaveText(ROLE_MESSAGES.noRolesFound);
      expect({ total: searched.totalRows, rows: (await roleAdmin.rowIds()).length }).toEqual({ total: 0, rows: 0 });
    });

    await steps.step(`Select the Export option and choose "${EXPORT_CHOICES[0]}" (then Excel) - the request is processed: an empty file without error or a no-data message, without crashing`, async () => {
      const result = await exportRoles(page, testInfo, 'selected', EXPORT_FORMAT);
      await expect(roleAdmin.emptyText()).toHaveText(ROLE_MESSAGES.noRolesFound);
      expect(emptyExportOutcome(result, EXPORT_FAILED), describeExport(result)).toEqual({ processed: true, handled: true, failureShown: false });
    });
  });

  test(`TC-${CASES.exportSelectedNoFilter.azureId}: should export the full roles list with Export Selected when no search is applied`, async ({ steps, roleAdmin, page }, testInfo) => {
    let result: RoleExport = NO_EXPORT;

    await steps.critical('Navigate to the Role Management module - the module loads with no search or filter applied', async () => {
      const answer = await roleAdmin.open();
      expect({ status: answer.status, searchText: answer.request.searchText ?? '' }).toEqual({ status: 200, searchText: '' });
    });

    await steps.step(`Without applying any search, select the Export option - the system shows "${EXPORT_CHOICES[0]}" and "${EXPORT_CHOICES[1]}" options`, async () => {
      const labels = await roleAdmin.exportScopes();
      expect(labels.map(normalise), `the Export menu reads [${labels.join(' | ')}]`).toEqual([...EXPORT_CHOICES]);
    });

    await steps.critical(`Choose "${EXPORT_CHOICES[0]}" (then Excel) - the system generates a file`, async () => {
      result = await exportRoles(page, testInfo, 'selected', EXPORT_FORMAT);
      expect(result.parsed !== null, describeExport(result)).toBe(true);
    });

    await steps.step('Open the exported file - the file contains the full roles list since no filter was applied', async () => {
      const every = namesOf(await allRoles(page));
      expect(sortedCopy(exportedColumn(result, FILE_NAME_COLUMN)), `${describeExport(result)}; GetRoles lists ${every.length} roles`).toEqual(sortedCopy(every));
    });
  });
});
