import { test, expect } from '../../../fixtures';
import type { ParsedXlsx } from '../../../utils/XlsxUtils';
import {
  CASES,
  COMBINATIONS,
  EXPORT_COLUMN,
  READABLE_STATUS,
  SCOPE,
  dataHeaders,
  exportColumn,
  sameHeader,
  versionNumber,
} from '../../../data/plans/exportPlanDirectory.data';

/**
 * User story 14158: Export plan directory to CSV or Excel.
 * What the FILE holds - every table column, one row per plan at its latest
 * version, the Version column after a revision, localized names and readable
 * statuses - and a free exploration across filters.
 *
 * The Arabic case restores English in cleanup: the language is a remembered
 * per-user preference.
 */
test.describe('US 14158 - Export content', () => {
  test(`TC-${CASES.exploration.azureId}: should export well-formed files matching the screen for every format and scope when filters are combined`, async ({
    planManagementPage,
    steps,
  }) => {
    const data = CASES.exploration;
    const files: { label: string; scope: string; parsed: ParsedXlsx }[] = [];
    let codesOnScreen: string[] = [];

    await steps.critical('Navigate to the module - a diverse set of plans is listed', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.critical(`Searching "${data.term}" with Status ${data.status} and exporting both formats in both scopes completes every export`, async () => {
      await planManagementPage.search(data.term);
      await planManagementPage.applyQuickFilter('status', data.status);
      codesOnScreen = await planManagementPage.readCodesOnPage();
      for (const combo of COMBINATIONS) {
        const file = await planManagementPage.exportAndParse(combo.scope, combo.format);
        expect(file.filename.endsWith(combo.extension), `${combo.label} should complete as ${combo.extension}`).toBe(true);
        files.push({ label: combo.label, scope: combo.scope, parsed: file.parsed });
      }
      expect(files.length).toBe(COMBINATIONS.length);
    });

    await steps.step('Every file is complete, consistent and matches what the screen showed', async () => {
      const headers = files[0].parsed.headers;
      for (const file of files) {
        expect(file.parsed.headers, `${file.label} headers`).toEqual(headers);
        expect(file.parsed.rows.length, `${file.label} should hold rows`).toBeGreaterThan(0);
      }
      const status = exportColumn(headers, EXPORT_COLUMN.status);
      const code = exportColumn(headers, EXPORT_COLUMN.code);
      for (const file of files.filter((f) => f.scope === SCOPE.filteredResults)) {
        expect(file.parsed.rows.filter((row) => row[status] !== data.status).length, `${file.label}: rows that are not ${data.status}`).toBe(0);
        const exported = file.parsed.rows.map((row) => row[code]);
        expect(codesOnScreen.filter((c) => !exported.includes(c)), `${file.label}: plans on screen missing from the file`).toEqual([]);
      }
    });
  });

  test(`TC-${CASES.columns.azureId}: should carry exactly the on-screen table columns in both the CSV and the Excel file when all plans are exported`, async ({
    planManagementPage,
    steps,
  }) => {
    let screen: string[] = [];
    let csv!: ParsedXlsx;

    await steps.critical('Navigate to the module - the table view shows its full set of columns', async () => {
      await planManagementPage.openList();
      await planManagementPage.expectRowsRendered();
    });

    await steps.critical('The on-screen columns are recorded', async () => {
      screen = dataHeaders(await planManagementPage.getHeaderTexts());
      expect(screen.length, 'the table should show its columns').toBeGreaterThan(0);
    });

    await steps.step('The CSV file contains every on-screen column', async () => {
      csv = (await planManagementPage.exportAndParse(SCOPE.allPlans, 'csv')).parsed;
      expect(screen.filter((header) => !csv.headers.some((h) => sameHeader(h, header))), 'columns missing from the CSV').toEqual([]);
    });

    await steps.step('The Excel file contains every on-screen column too, with no missing or extra fields', async () => {
      const excel = (await planManagementPage.exportAndParse(SCOPE.allPlans, 'excel')).parsed;
      expect(screen.filter((header) => !excel.headers.some((h) => sameHeader(h, header))), 'columns missing from the Excel file').toEqual([]);
      expect(excel.headers.filter((header) => !screen.some((s) => sameHeader(s, header))), 'fields in the file that the table does not show').toEqual([]);
      expect(excel.headers, 'both formats should carry the same columns').toEqual(csv.headers);
    });
  });

  test(`TC-${CASES.latestVersion.azureId}: should export exactly one row per plan at its latest version when a plan has several versions`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const data = CASES.latestVersion;
    const plan = await planIn('Inactive');
    let code = '';
    let shownVersion = -1;

    await steps.critical('Navigate to the module - the plan directory is shown', async () => {
      await planManagementPage.openList();
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('The multi-version plan shows its latest version number in the table', async () => {
      code = await planManagementPage.readCode(plan.name);
      shownVersion = versionNumber(await planManagementPage.getApprovalCell(plan.name));
      expect(shownVersion, 'the table should show the current version').toBe(data.currentVersion);
    });

    let rows: Record<string, string>[] = [];
    let headers: string[] = [];
    await steps.step('The exported CSV holds exactly one row for that plan', async () => {
      await planManagementPage.openList();
      const file = await planManagementPage.exportAndParse(SCOPE.allPlans, 'csv');
      headers = file.parsed.headers;
      rows = file.parsed.rows.filter((row) => row[exportColumn(headers, EXPORT_COLUMN.code)] === code);
      expect(rows.length, `${code} should appear once`).toBe(1);
    });

    await steps.step('The exported row matches the latest version exactly', async () => {
      const version = exportColumn(headers, EXPORT_COLUMN.version);
      expect(version, 'the file should carry a Version column').not.toBe('');
      expect(versionNumber(rows[0][version]), 'the exported version').toBe(shownVersion);
      expect(rows[0][exportColumn(headers, EXPORT_COLUMN.status)], 'the exported status').toBe(data.status);
      expect(Object.values(rows[0]), 'the exported name').toContain(plan.name);
    });
  });

  test(`TC-${CASES.localized.azureId}: should export intact localized names and readable status text when the export runs in each interface language`, async ({
    planManagementPage,
    languageSwitcher,
    planIn,
    cleanup,
    steps,
  }) => {
    const plan = await planIn('Draft');
    cleanup.register(() => languageSwitcher.switchTo('en'));
    let code = '';
    let english!: ParsedXlsx;

    await steps.critical('Navigate to the module in Arabic - localized names and statuses are shown', async () => {
      await languageSwitcher.switchTo('ar');
      await planManagementPage.openList();
      await languageSwitcher.expectRightToLeft();
      code = await planManagementPage.readCode(plan.nameAr);
      expect(await planManagementPage.isListed(plan.nameAr), 'the Arabic name should be shown').toBe(true);
    });

    await steps.step('A CSV exported in Arabic carries the Arabic plan name without garbled characters', async () => {
      await planManagementPage.openList();
      const file = await planManagementPage.exportAndParse(SCOPE.allPlans, 'csv');
      const row = file.parsed.rows.find((r) => Object.values(r).includes(code));
      expect(row, `${code} should be exported`).toBeDefined();
      expect(Object.values(row!), 'the Arabic name, byte for byte').toContain(plan.nameAr);
    });

    await steps.step('A CSV exported in English carries the English plan name without garbled characters', async () => {
      await languageSwitcher.switchTo('en');
      await planManagementPage.openList();
      english = (await planManagementPage.exportAndParse(SCOPE.allPlans, 'csv')).parsed;
      const row = english.rows.find((r) => Object.values(r).includes(code));
      expect(row, `${code} should be exported`).toBeDefined();
      expect(Object.values(row!)).toContain(plan.name);
    });

    await steps.step('The Status column holds readable text rather than codes', async () => {
      const status = exportColumn(english.headers, EXPORT_COLUMN.status);
      expect(status, 'the file should carry a Status column').not.toBe('');
      const unreadable = [...new Set(english.rows.map((row) => row[status]))].filter((value) => !READABLE_STATUS.test(value ?? ''));
      expect(unreadable, 'status values that are not readable text').toEqual([]);
    });
  });

  test(`TC-${CASES.versionColumn.azureId}: should export the new version number and no older row when a plan is revised to version 2`, async ({
    planManagementPage,
    planApprovalsPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const data = CASES.versionColumn;
    const plan = await planIn('Active');
    let code = '';

    const exportedRows = async (): Promise<{ rows: Record<string, string>[]; version: string }> => {
      await planManagementPage.openList();
      const parsed = (await planManagementPage.exportAndParse(SCOPE.allPlans, 'csv')).parsed;
      const codeColumn = exportColumn(parsed.headers, EXPORT_COLUMN.code);
      return { rows: parsed.rows.filter((row) => row[codeColumn] === code), version: exportColumn(parsed.headers, EXPORT_COLUMN.version) };
    };

    await steps.critical('Navigate to the module - the plan shows version 1', async () => {
      await planManagementPage.openList();
      code = await planManagementPage.readCode(plan.name);
      expect(versionNumber(await planManagementPage.getApprovalCell(plan.name))).toBe(data.before);
    });

    await steps.step('The exported CSV shows Version 1 for the plan', async () => {
      const exported = await exportedRows();
      expect(exported.version, 'the file should carry a Version column').not.toBe('');
      expect(exported.rows.map((row) => versionNumber(row[exported.version]))).toEqual([data.before]);
    });

    await steps.critical('Revising the plan and approving the revision makes the directory show version 2', async () => {
      await planManagementPage.stageAndSubmit(plan.name, 'inactivate');
      await planApprovalsPage.open();
      await planApprovalsPage.approve(plan.name);
      await planManagementPage.expectApprovalCell(plan.name, data.afterCell);
      expect(versionNumber(await planManagementPage.getApprovalCell(plan.name))).toBe(data.after);
    });

    await steps.step('A new export shows Version 2 for the plan and no row for version 1', async () => {
      const exported = await exportedRows();
      expect(exported.rows.map((row) => versionNumber(row[exported.version])), `${code} rows by version`).toEqual([data.after]);
    });
  });
});
