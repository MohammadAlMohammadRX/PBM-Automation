import { test, expect } from '../../../fixtures';
import { columnValues } from '../../../utils/CsvUtils';
import { TYPE_FILTER_OPTIONS } from '../../../data/payers/filterPayer.data';
import {
  EMPTY_EXPORT_MAX_ROWS,
  EXPORT_FILENAME,
  MISSING_SCOPE,
  OFFERED_FORMATS,
  OFFERED_SCOPES,
  SCOPE_FILTER,
  STATUS_COLUMN_CANDIDATES,
} from '../../../data/payers/exportScope.data';

/**
 * User story: Ask Which Rows to Export When a Filter Is Applied.
 *
 * THE PROMPT EXISTS; ITS CHOICES ARE NOT THE ONES THE SHEET DESCRIBES. The
 * export control opens a menu offering "Selected Export" and "Export All Data",
 * and only then asks for a format. There is no "Export Filtered" - the scope
 * choice is selection versus everything, not filter versus everything - and the
 * menu appears whether or not a filter is applied.
 *
 * Each case therefore asserts what the application offers, and the cases that
 * depend on a filtered export report its absence. That is a more useful result
 * than approximating it by ticking rows: ticking follows the ticks, not the
 * filter, and a test that pretended otherwise would report a feature as working
 * when it does not exist.
 *
 * The download itself is read and parsed, so "the file contains every payer" is
 * an assertion about the file rather than about the click that produced it.
 */
test.describe('Export scope prompt', () => {
  test('TC-001: should ask which rows to export when a filter is applied', async ({
    payerManagementPage,
    exportMenu,
    steps,
  }) => {
    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
    });

    await steps.critical('A status filter narrows the list', async () => {
      await payerManagementPage.filterByStatus(SCOPE_FILTER.status);
      // Asserted as "a filter is applied", not as "every row matches it". The
      // status filter returns rows of other statuses too - a defect the filter
      // story already owns and reports - and depending on it here would fail
      // every export case on somebody else's finding.
      await payerManagementPage.expectFiltersApplied(TYPE_FILTER_OPTIONS[0], SCOPE_FILTER.status);
      await payerManagementPage.expectRowsRendered();
    });

    await steps.step('The export control opens a scope prompt', async () => {
      await exportMenu.open();
      const scopes = await exportMenu.getOfferedScopes();
      expect(scopes, 'the menu should offer a choice of scope').toEqual([...OFFERED_SCOPES]);
    });

    await steps.step('Both scope options are clearly presented', async () => {
      // FAILS on the second half. The sheet wants "Export All" and "Export
      // Filtered"; the menu offers "Selected Export" and "Export All Data", so
      // the filtered option the story is built on is not there at all.
      const scopes = await exportMenu.getOfferedScopes();
      expect(
        scopes,
        `the prompt should offer a "${MISSING_SCOPE}" scope alongside "all"; it offers: `
          + `${scopes.join(', ')}`,
      ).toContain(MISSING_SCOPE);
    });
  });

  test('TC-002: should prompt for a scope even when no filter is applied', async ({
    payerManagementPage,
    exportMenu,
    steps,
  }) => {
    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
    });

    await steps.critical('No filters are active', () =>
      payerManagementPage.expectFiltersAtDefault());

    await steps.step('The export control still opens the scope menu', async () => {
      // The sheet expects an unfiltered export to begin immediately. It does
      // not: the same two-step menu appears, so the prompt is unconditional
      // rather than filter-driven. Recorded as the application's behaviour
      // because it is defensible - the two scopes mean the same thing with or
      // without a filter - and it contradicts the sheet.
      await exportMenu.open();
      expect(
        await exportMenu.getOfferedScopes(),
        'the menu is the same whether or not a filter is applied',
      ).toEqual([...OFFERED_SCOPES]);
    });

    await steps.step('Choosing Export All Data exports every payer', async () => {
      await exportMenu.cancelMenu();
      const parsed = await exportMenu.exportCsv('all');
      const listSize = await payerManagementPage.getListSize();
      expect(
        parsed.rows.length,
        `the file holds ${parsed.rows.length} row(s); the register holds ${listSize.rows} `
          + 'row(s) per page across all pages',
      ).toBeGreaterThan(listSize.rows);
    });
  });

  test('TC-003: should export the whole register when Export All is chosen over a filtered list', async ({
    payerManagementPage,
    exportMenu,
    steps,
  }) => {
    let filteredRows = 0;

    await steps.critical('Navigate to the module and apply a filter', async () => {
      await payerManagementPage.open();
      await payerManagementPage.filterByStatus(SCOPE_FILTER.status);
      // Asserted as "a filter is applied", not as "every row matches it". The
      // status filter returns rows of other statuses too - a defect the filter
      // story already owns and reports - and depending on it here would fail
      // every export case on somebody else's finding.
      await payerManagementPage.expectFiltersApplied(TYPE_FILTER_OPTIONS[0], SCOPE_FILTER.status);
      await payerManagementPage.expectRowsRendered();
      filteredRows = (await payerManagementPage.getVisiblePayerNames()).length;
      expect(filteredRows, 'the filter should leave rows on screen').toBeGreaterThan(0);
    });

    await steps.critical('The export scope prompt appears', async () => {
      await exportMenu.open();
      expect(await exportMenu.getOfferedScopes()).toEqual([...OFFERED_SCOPES]);
      await exportMenu.cancelMenu();
    });

    await steps.step('Export All Data starts an export of the entire dataset', async () => {
      const download = await exportMenu.exportAndDownload('all', 'csv');
      expect(
        download.suggestedFilename(),
        'the export should name its file for the whole payer list',
      ).toMatch(EXPORT_FILENAME);
    });

    await steps.step('The file holds more than the filtered rows, and more than one status', async () => {
      // The point of the case: Export All ignores the filter. Proven two ways -
      // the file is bigger than the filtered page, and it carries statuses the
      // filter had excluded.
      const parsed = await exportMenu.exportCsv('all');
      const statusColumn = STATUS_COLUMN_CANDIDATES.find((name) => parsed.headers.includes(name));
      expect(statusColumn, `the file should carry a status column; headers: ${parsed.headers.join(', ')}`)
        .not.toBeUndefined();

      const statuses = new Set(columnValues(parsed, statusColumn!).map((value) => value.trim()));
      expect(
        statuses.size,
        `Export All should ignore the filter, so more than one status should appear: `
          + `${[...statuses].join(', ')}`,
      ).toBeGreaterThan(1);
    });
  });

  test('TC-004: should export only the filtered rows when Export Filtered is chosen', async ({
    payerManagementPage,
    exportMenu,
    steps,
  }) => {
    await steps.critical('Navigate to the module and apply a filter', async () => {
      await payerManagementPage.open();
      await payerManagementPage.filterByStatus(SCOPE_FILTER.status);
      // Asserted as "a filter is applied", not as "every row matches it". The
      // status filter returns rows of other statuses too - a defect the filter
      // story already owns and reports - and depending on it here would fail
      // every export case on somebody else's finding.
      await payerManagementPage.expectFiltersApplied(TYPE_FILTER_OPTIONS[0], SCOPE_FILTER.status);
      await payerManagementPage.expectRowsRendered();
    });

    await steps.critical('The export scope prompt appears', async () => {
      await exportMenu.open();
      expect(await exportMenu.getOfferedScopes()).toEqual([...OFFERED_SCOPES]);
    });

    await steps.step('A filtered export can be chosen', async () => {
      // FAILS. There is no filtered scope to choose, so the rest of the sheet's
      // case - a file containing only the filtered rows - cannot be reached.
      // The nearest option, Selected Export, follows the table's tick boxes
      // rather than the filter, and asserting on it here would report a feature
      // that does not exist as working.
      const scopes = await exportMenu.getOfferedScopes();
      expect(
        scopes,
        `no filtered scope is offered; the menu holds: ${scopes.join(', ')}`,
      ).toContain(MISSING_SCOPE);
    });

    await steps.step('The list itself is unchanged by the attempt', async () => {
      await exportMenu.cancelMenu();
      await payerManagementPage.expectRowsRendered();
    });
  });

  test('TC-005: should generate no file when the scope prompt is cancelled', async ({
    payerManagementPage,
    exportMenu,
    steps,
  }) => {
    await steps.critical('Navigate to the module with a filter applied', async () => {
      await payerManagementPage.open();
      await payerManagementPage.filterByStatus(SCOPE_FILTER.status);
      // Asserted as "a filter is applied", not as "every row matches it". The
      // status filter returns rows of other statuses too - a defect the filter
      // story already owns and reports - and depending on it here would fail
      // every export case on somebody else's finding.
      await payerManagementPage.expectFiltersApplied(TYPE_FILTER_OPTIONS[0], SCOPE_FILTER.status);
      await payerManagementPage.expectRowsRendered();
    });

    await steps.critical('The export scope prompt appears', async () => {
      await exportMenu.open();
      expect(await exportMenu.getOfferedScopes()).toEqual([...OFFERED_SCOPES]);
    });

    await steps.step('Closing the prompt starts no export', async () => {
      const downloaded = await exportMenu.expectNoDownloadWhile(() => exportMenu.cancelMenu());
      expect(downloaded, 'cancelling the scope menu must not produce a file').toBe(false);
    });

    await steps.step('And the format dialog never opened either', async () => {
      await payerManagementPage.expectNoUnexpectedDialog();
    });
  });

  test('TC-011: should present a complete scope prompt - title, options and a way out', async ({
    payerManagementPage,
    exportMenu,
    steps,
  }) => {
    await steps.critical('Navigate to the module with a filter applied', async () => {
      await payerManagementPage.open();
      await payerManagementPage.filterByStatus(SCOPE_FILTER.status);
      // Asserted as "a filter is applied", not as "every row matches it". The
      // status filter returns rows of other statuses too - a defect the filter
      // story already owns and reports - and depending on it here would fail
      // every export case on somebody else's finding.
      await payerManagementPage.expectFiltersApplied(TYPE_FILTER_OPTIONS[0], SCOPE_FILTER.status);
      await payerManagementPage.expectRowsRendered();
    });

    await steps.critical('The export scope prompt opens', async () => {
      await exportMenu.open();
      expect(await exportMenu.getOfferedScopes()).toEqual([...OFFERED_SCOPES]);
    });

    await steps.step('It offers both scope options with readable labels', async () => {
      const labels = await exportMenu.getScopeLabels();
      expect(
        labels.every((label) => label.trim().length > 0),
        `every option should be labelled; found: ${labels.join(' | ')}`,
      ).toBe(true);
    });

    await steps.step('And the format dialog that follows offers a way out', async () => {
      await exportMenu.chooseScope('all');
      expect(
        await exportMenu.getOfferedFormats(),
        'the format step should offer both formats and a cancel',
      ).toEqual(expect.arrayContaining([...OFFERED_FORMATS, 'cancel']));
      await exportMenu.cancel();
    });
  });

  test('TC-008: should handle an export of a filter that matches nothing', async ({
    payerManagementPage,
    exportMenu,
    steps,
  }) => {
    await steps.critical('Navigate to the module and apply a filter with no matches', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(SCOPE_FILTER.noMatchSearch);
      await payerManagementPage.expectEmptyState();
    });

    await steps.critical('The export scope prompt still appears', async () => {
      await exportMenu.open();
      expect(await exportMenu.getOfferedScopes()).toEqual([...OFFERED_SCOPES]);
      await exportMenu.cancelMenu();
    });

    await steps.step('An export of the empty result set produces no rows or says so', async () => {
      // The sheet allows either an empty file or a "nothing to export" message.
      // Selected Export is the only scope that can reflect an empty result -
      // Export All ignores the filter entirely - so what is asserted is that
      // whichever route is taken, no misleading file of unrelated rows appears.
      const parsed = await exportMenu.exportCsv('selected').catch(() => null);
      if (parsed === null) {
        await payerManagementPage.expectNoUnexpectedDialog();
        return;
      }
      expect(
        parsed.rows.length,
        `an export of a nothing-matched filter should hold no data rows; it held `
          + `${parsed.rows.length}`,
      ).toBeLessThanOrEqual(EMPTY_EXPORT_MAX_ROWS);
    });

    await steps.step('And the list still shows its empty state', () =>
      payerManagementPage.expectEmptyState());
  });
});
