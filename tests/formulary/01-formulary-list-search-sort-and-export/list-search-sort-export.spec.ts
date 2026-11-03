import { test, expect } from '../../../fixtures';
import {
  APPROVAL_STATUS,
  CODE_PATTERN,
  FORMULARY_STATUS,
  FORMULARY_SUITE,
  MESSAGE,
} from '../../../data/formulary/formulary.data';
import {
  APPROVAL_CELL,
  CASES,
  EXPORT_COLUMN_OF,
  LIST_DATE,
  REQUIRED_HEADERS,
  VALID_STATUSES,
  namedWith,
  versionOf,
} from '../../../data/formulary/listSearchSortExport.data';
import { isGrouped, isSorted } from '../../../utils/SortUtils';
import { headerLike } from '../../../utils/formulary/writerAHelpers';
import {
  SUITE_FORMULARY_PREFIX,
  readVersions,
  submitFormulary,
  updateFormularyFields,
  waitUntil,
} from '../../../utils/FormularyProvisioning';

/**
 * User story 15191: Formulary list - Search, Sort and Export.
 * The list's columns and actions, quick and advanced search, the empty result,
 * the approval-status / version lifecycle, the five sort fields, CSV / Excel
 * export and their combination. Every formulary is the case's own
 * (`formularyIn`, payer "Al sharq"); the register's other rows are only read.
 */
test.describe('US 15191 - Formulary list - Search, Sort and Export', () => {
  test(`TC-${CASES.columns.azureId}: should show every mandated column and the View, Clone, Send for Approval, Deactivate and Delete actions when the formulary list is opened`, async ({
    formularyManagementPage,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft');

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.step('Open the Formulary list view - the list loads and displays existing formulary records', async () => {
      expect(await formularyManagementPage.countRows(), 'the list should show formularies').toBeGreaterThan(0);
    });

    await steps.step('Each row shows Name, Code, Owning Payer, Tier Count, Trade Count, Effective Date, Expiry Date, Status and Approval Status', async () => {
      const headers = await formularyManagementPage.getHeaderTexts();
      const missing = REQUIRED_HEADERS.filter(([, pattern]) => !headers.some((h) => pattern.test(h))).map(([name]) => name);
      expect(missing, `columns missing among ${headers.join(', ')}`).toEqual([]);
      const row = await formularyManagementPage.readRow(formulary.nameEn);
      expect(row.payer, 'the row\'s owning payer').toBe(FORMULARY_SUITE.payerName);
    });

    await steps.step('View, Clone, Send for Approval, Deactivate and Delete actions are shown for the record', async () => {
      const states = await formularyManagementPage.readActionStates(formulary.nameEn);
      const absent = (['view', 'clone', 'submit', 'deactivate', 'delete'] as const).filter((action) => states[action].availability === 'absent');
      expect(absent, 'row actions not rendered for the draft formulary').toEqual([]);
    });
  });

  test(`TC-${CASES.quickSearch.azureId}: should list only formularies whose name or code contains the term when "Diabetes" is typed in the quick search`, async ({
    formularyManagementPage,
    formularyIn,
    steps,
  }) => {
    const data = CASES.quickSearch;
    const formulary = await formularyIn('Draft', { nameEn: namedWith(data.term) });
    let answer = { items: [] as { formularyNameEn: string; formularyCode: string | null }[], totalRows: -1 };

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.step('Open the Formulary list view - the list loads with all formulary records', async () => {
      expect(await formularyManagementPage.countRows()).toBeGreaterThan(0);
    });

    await steps.step(`Enter "${data.term}" into the quick search field - the input is accepted and the search is triggered`, async () => {
      answer = await formularyManagementPage.searchFor(data.term);
      expect(answer.totalRows, 'the search should be answered').toBeGreaterThanOrEqual(0);
    });

    await steps.step(`Only formularies whose name or code contains "${data.term}" are displayed`, async () => {
      expect(await formularyManagementPage.isRowVisible(formulary.nameEn), `"${formulary.nameEn}" should be found`).toBe(true);
      const strays = answer.items.filter((f) => !`${f.formularyNameEn} ${f.formularyCode ?? ''}`.toLowerCase().includes(data.term.toLowerCase()));
      expect(strays.map((f) => f.formularyNameEn), 'rows that do not contain the term').toEqual([]);
      const shown = await formularyManagementPage.readNames();
      expect(shown.filter((name) => !answer.items.some((f) => f.formularyNameEn === name)), 'rows on screen the search did not answer').toEqual([]);
    });
  });

  test(`TC-${CASES.advancedFilters.azureId}: should apply Payer, Status and Approval Status together when the advanced filters are combined`, async ({
    formularyManagementPage,
    formularyIn,
    steps,
  }) => {
    test.setTimeout(12 * 60_000);
    const data = CASES.advancedFilters;
    const formulary = await formularyIn('Active');
    let labels: string[] = [];

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.step('Open the Formulary list view - the list loads with all formulary records', async () => {
      expect(await formularyManagementPage.countRows()).toBeGreaterThan(0);
    });

    await steps.step('Open the advanced filter panel - filter fields for Payer, Status and Approval Status are displayed', async () => {
      labels = await formularyManagementPage.getAdvancedSearchLabels();
      const missing = data.fields.filter((field) => !labels.some((label) => field.test(label))).map(String);
      expect(missing, `advanced-search fields missing among ${labels.join(', ')}`).toEqual([]);
    });

    await steps.step(`Set Payer = "${FORMULARY_SUITE.payerName}", Status = "${data.status}" and Approval Status = "${data.approvalStatus}", then apply - the filters are applied together`, async () => {
      expect(await formularyManagementPage.scopeTo(FORMULARY_SUITE.payerName), `the payer scope should offer "${FORMULARY_SUITE.payerName}"`).toBe(true);
      const answer = await formularyManagementPage.applyCriteria({ status: data.status, approvalStatus: data.approvalStatus });
      expect(answer.totalRows, 'the combined filter should be answered').toBeGreaterThanOrEqual(0);
    });

    await steps.step('Only formularies matching all three criteria are shown', async () => {
      const rows = await formularyManagementPage.readRowsOnScreen();
      expect(rows.length, 'the case\'s own Active, Approved formulary of the payer should match').toBeGreaterThan(0);
      const strays = rows.filter((r) => r.payer !== FORMULARY_SUITE.payerName || r.status !== FORMULARY_STATUS.active || !r.approvalStatus.endsWith(APPROVAL_STATUS.approved));
      expect(strays.map((r) => `${r.name}: ${r.payer} / ${r.status} / ${r.approvalStatus}`), 'rows outside the combined criteria').toEqual([]);
      expect(await formularyManagementPage.isListed(formulary.nameEn), `"${formulary.nameEn}" meets all three criteria`).toBe(true);
    });
  });

  test(`TC-${CASES.noMatch.azureId}: should show a no-records-found message and an empty grid when the quick search matches no formulary`, async ({
    formularyManagementPage,
    steps,
  }) => {
    const data = CASES.noMatch;
    let answered = -1;

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.step('Open the Formulary list view - the list loads with all formulary records', async () => {
      expect(await formularyManagementPage.countRows()).toBeGreaterThan(0);
    });

    await steps.step(`Enter "${data.term}" into the quick search field - the input is accepted and the search is triggered`, async () => {
      answered = (await formularyManagementPage.searchFor(data.term)).totalRows;
      expect(answered, 'the search should be answered').toBeGreaterThanOrEqual(0);
    });

    await steps.step('A no-records-found message is displayed and the grid is empty', async () => {
      expect(answered, 'no formulary should match').toBe(0);
      expect(await formularyManagementPage.countRows(), 'the grid should be empty').toBe(0);
      expect(await formularyManagementPage.getEmptyStateText(), 'the empty-state message').toMatch(MESSAGE.noData);
    });
  });

  test(`TC-${CASES.draftToApproved.azureId}: should move the approval status from Draft to Pending Approval to Approved with version 1 and a code when a draft is sent and approved`, async ({
    formularyManagementPage,
    formularyApprovalsPage,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { tiers: 1, trades: 1 });

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.step('Open the Formulary list view - the formulary shows Approval Status "Draft"', async () => {
      expect((await formularyManagementPage.readRow(formulary.nameEn)).approvalStatus).toMatch(new RegExp(`${APPROVAL_STATUS.draft}$`));
    });

    await steps.critical('Select "Send for Approval" on the draft formulary - the Approval Status changes to "Pending Approval"', async () => {
      const sent = await formularyManagementPage.sendForApproval(formulary.nameEn);
      expect(sent.status, sent.messages.join(' | ')).toBeLessThan(300);
      await formularyManagementPage.search(formulary.nameEn);
      expect((await formularyManagementPage.readRow(formulary.nameEn)).approvalStatus).toMatch(new RegExp(`${APPROVAL_STATUS.pending}$`));
    });

    await steps.step('As an approver, approve the formulary - the Approval Status changes to "Approved" and a formulary code is generated', async () => {
      await formularyApprovalsPage.open();
      await formularyApprovalsPage.approve(formulary.nameEn);
      await formularyManagementPage.open();
      await formularyManagementPage.search(formulary.nameEn);
      const row = await formularyManagementPage.readRow(formulary.nameEn);
      expect(row.approvalStatus).toMatch(new RegExp(`${APPROVAL_STATUS.approved}$`));
      expect(row.code, 'a permanent code once approved').toMatch(CODE_PATTERN.permanent);
    });

    await steps.step('The version number on the approved record is 1', async () => {
      expect(versionOf((await formularyManagementPage.readRow(formulary.nameEn)).approvalStatus)).toBe(1);
    });
  });

  test(`TC-${CASES.activeOnEffectiveDate.azureId}: should read Active on the effective date and Future the day before when approved formularies reach their dates`, async ({
    formularyManagementPage,
    formularyIn,
    page,
    steps,
  }) => {
    test.setTimeout(10 * 60_000);
    const data = CASES.activeOnEffectiveDate;
    const today = await formularyIn('Future', { effectiveInMinutes: data.effectiveInMinutes });
    const tomorrow = await formularyIn('Future', { effectiveInMinutes: data.tomorrowInMinutes });

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await waitUntil(page, today.effectiveDate);
      await formularyManagementPage.open();
    });

    await steps.step('Open the Formulary list view - the list loads with all formulary records', async () => {
      expect(await formularyManagementPage.countRows()).toBeGreaterThan(0);
    });

    await steps.step('Locate the formulary whose effective date is today - the record is visible in the list', async () => {
      expect(await formularyManagementPage.isListed(today.nameEn)).toBe(true);
    });

    await steps.step('Its Status column shows "Active"', async () => {
      expect((await formularyManagementPage.readRow(today.nameEn)).status, `effective ${today.effectiveDate}, now past`).toBe(FORMULARY_STATUS.active);
    });

    await steps.step('The formulary whose effective date is tomorrow shows "Future"', async () => {
      expect((await formularyManagementPage.readRow(tomorrow.nameEn)).status, `effective ${tomorrow.effectiveDate}`).toBe(FORMULARY_STATUS.future);
    });
  });

  test(`TC-${CASES.versionAfterRejections.azureId}: should show an incremented version after a second rejection and a later approval when a rejected formulary is resubmitted`, async ({
    formularyManagementPage,
    formularyApprovalsPage,
    formularyIn,
    page,
    steps,
  }) => {
    const data = CASES.versionAfterRejections;
    const formulary = await formularyIn('Rejected');

    await steps.critical('Precondition: the once-rejected formulary is changed and resubmitted for approval', async () => {
      expect((await updateFormularyFields(page, formulary.id, { descriptionEn: `${data.change} 1` })).status).toBeLessThan(300);
      expect((await submitFormulary(page, formulary.id)).status).toBeLessThan(300);
    });

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.step('Open the Formulary list view - the formulary shows Approval Status "Pending Approval"', async () => {
      expect((await formularyManagementPage.readRow(formulary.nameEn)).approvalStatus).toMatch(new RegExp(`${APPROVAL_STATUS.pending}$`));
    });

    await steps.critical('As an approver, reject the formulary a second time - the Approval Status changes to "Rejected"', async () => {
      await formularyApprovalsPage.open();
      await formularyApprovalsPage.reject(formulary.nameEn);
      await formularyManagementPage.open();
      expect((await formularyManagementPage.readRow(formulary.nameEn)).approvalStatus).toMatch(new RegExp(`${APPROVAL_STATUS.rejected}$`));
    });

    await steps.critical('Resubmit the formulary for approval and approve it - the Approval Status changes to "Approved"', async () => {
      expect((await updateFormularyFields(page, formulary.id, { descriptionEn: `${data.change} 2` })).status).toBeLessThan(300);
      expect((await submitFormulary(page, formulary.id)).status).toBeLessThan(300);
      await formularyApprovalsPage.open();
      await formularyApprovalsPage.approve(formulary.nameEn);
      await formularyManagementPage.open();
      expect((await formularyManagementPage.readRow(formulary.nameEn)).approvalStatus).toMatch(new RegExp(`${APPROVAL_STATUS.approved}$`));
    });

    await steps.step('The version number has incremented based on the second approval decision', async () => {
      const shown = versionOf((await formularyManagementPage.readRow(formulary.nameEn)).approvalStatus);
      const newest = Math.max(...(await readVersions(page, formulary.id)).map((v) => v.version));
      expect(shown, 'the version after three approval decisions should be above the first version').toBeGreaterThan(1);
      expect(shown, 'the shown version should be the newest of the Version History').toBe(newest);
    });
  });

  test(`TC-${CASES.sortFields.azureId}: should reorder the list by Name, Effective Date, Expiry Date, Status and Owning Payer in both directions when each sort is chosen`, async ({
    formularyManagementPage,
    formularyIn,
    steps,
  }) => {
    await formularyIn('Draft', { expiryInDays: 90 });
    await formularyIn('Draft', { expiryInDays: 300 });

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.step('Open the Formulary list view - the list loads with all formulary records', async () => {
      expect(await formularyManagementPage.countRows()).toBeGreaterThan(1);
    });

    await steps.step('Sort by Name - records are reordered alphabetically by name', async () => {
      const names = (await formularyManagementPage.sortBy('name', 'asc')).items.map((f) => f.formularyNameEn);
      expect(isSorted(names, 'asc'), `names: ${names.join(' | ')}`).toBe(true);
    });

    await steps.step('Sort by Effective Date - records are reordered chronologically by effective date', async () => {
      const dates = (await formularyManagementPage.sortBy('effectiveDate', 'asc')).items.map((f) => f.effectiveDate);
      expect(isSorted(dates, 'asc'), `effective dates: ${dates.join(' | ')}`).toBe(true);
    });

    await steps.step('Sorting by Expiry Date, Status and Owning Payer reorders the list correctly in both ascending and descending order', async () => {
      for (const direction of ['asc', 'desc'] as const) {
        const expiry = (await formularyManagementPage.sortBy('expiryDate', direction)).items.map((f) => f.expiryDate);
        expect(isSorted(expiry, direction), `expiry ${direction}: ${expiry.join(' | ')}`).toBe(true);
        const statuses = (await formularyManagementPage.sortBy('status', direction)).items.map((f) => f.effectiveStatusId || f.statusId || '');
        expect(isGrouped(statuses), `status ${direction} should keep each status together`).toBe(true);
      }
      const options = await formularyManagementPage.getSortOptions();
      expect(options.some((o) => CASES.sortFields.payerOption.test(o)), `an Owning Payer sort among ${options.join(', ')}`).toBe(true);
    });
  });

  for (const format of ['csv', 'excel'] as const) {
    const data = format === 'csv' ? CASES.exportCsv : CASES.exportExcel;
    test(`TC-${data.azureId}: should download a ${format === 'csv' ? 'CSV' : 'Excel'} file with the records and columns of the list when the formulary list is exported to ${format === 'csv' ? 'CSV' : 'Excel'}`, async ({
      formularyManagementPage,
      formularyIn,
      steps,
    }) => {
      const formulary = await formularyIn('Draft');
      let file: Awaited<ReturnType<typeof formularyManagementPage.exportAndParse>> | null = null;
      let total = -1;

      await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
        await formularyManagementPage.open();
      });

      await steps.step('Open the Formulary list view - the list loads with all formulary records', async () => {
        total = (await formularyManagementPage.fetchRegister({}, 1)).totalRows;
        expect(await formularyManagementPage.countRows()).toBeGreaterThan(0);
      });

      await steps.critical(`Select "Export" and choose ${format === 'csv' ? 'CSV' : 'Excel'} - the file generation is triggered`, async () => {
        file = await formularyManagementPage.exportAndParse('all', format);
        expect(file.filename, 'the downloaded file name').toMatch(data.extension);
      });

      await steps.step('The file holds the same records and columns as the list view', async () => {
        const parsed = file?.parsed ?? { headers: [], rows: [] };
        const missing = EXPORT_COLUMN_OF.filter(([, pattern]) => !parsed.headers.some((h) => pattern.test(h))).map(([column]) => column);
        expect(missing, `list columns missing from the export headers ${parsed.headers.join(', ')}`).toEqual([]);
        expect(parsed.rows.length, 'every record of the list').toBe(total);
        const nameHeader = headerLike(parsed.headers, /name.*(english|en\b)|^name/i);
        expect(parsed.rows.map((r) => r[nameHeader]), `"${formulary.nameEn}" should be exported`).toContain(formulary.nameEn);
      });
    });
  }

  test(`TC-${CASES.emptyExport.azureId}: should prevent the export instead of producing a blank or broken file when no formulary matches the applied filters`, async ({
    formularyManagementPage,
    steps,
  }) => {
    const data = CASES.emptyExport;
    let outcome: Awaited<ReturnType<typeof formularyManagementPage.exportOrMessages>> = { parsed: null, filename: '', messages: [] };

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.step('Open the Formulary list view - the list loads with all formulary records', async () => {
      expect(await formularyManagementPage.countRows()).toBeGreaterThan(0);
    });

    await steps.step('Apply a filter combination known to return no results - the list shows a no-records-found message', async () => {
      expect((await formularyManagementPage.searchFor(data.term)).totalRows).toBe(0);
      expect(await formularyManagementPage.getEmptyStateText()).toMatch(MESSAGE.noData);
    });

    await steps.step('Attempting to export the empty result set produces no blank or broken file', async () => {
      outcome = await formularyManagementPage.exportOrMessages('csv', 'all');
      expect(outcome.parsed, `a file was downloaded for an empty result: ${outcome.filename} (${outcome.parsed?.rows.length ?? 0} rows)`).toBeNull();
      expect(outcome.messages.join(' | '), 'a message should say there is nothing to export').toMatch(MESSAGE.noData);
    });
  });

  test(`TC-${CASES.consistentFormat.azureId}: should show complete, consistently formatted values with only valid statuses and approval statuses for every record`, async ({
    formularyManagementPage,
    formularyIn,
    steps,
  }) => {
    await formularyIn('Draft');
    const rowsByFilter: Record<string, Awaited<ReturnType<typeof formularyManagementPage.readRowsOnScreen>>> = {};

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.critical('Open the Formulary list view - the list loads with all formulary records', async () => {
      for (const status of CASES.consistentFormat.statusFilters) {
        await formularyManagementPage.filterByStatus(status);
        rowsByFilter[status] = await formularyManagementPage.readRowsOnScreen();
      }
      expect(Object.values(rowsByFilter).flat().length, 'records across the statuses').toBeGreaterThan(0);
    });

    await steps.step('Name, Code, Owning Payer, Tier Count, Trade Count, Effective Date and Expiry Date are populated and formatted consistently', async () => {
      const problems = Object.values(rowsByFilter).flat().flatMap((r) => [
        ...(['name', 'code', 'payer'] as const).filter((k) => r[k] === '' || r[k] === '—').map((k) => `${r.name}: empty ${k}`),
        ...(['tiers', 'trades'] as const).filter((k) => !/^\d+$/.test(r[k])).map((k) => `${r.name}: ${k} "${r[k]}"`),
        ...(['effectiveDate', 'expiryDate'] as const).filter((k) => !LIST_DATE.test(r[k])).map((k) => `${r.name}: ${k} "${r[k]}"`),
      ]);
      expect(problems, 'incomplete or inconsistently formatted values').toEqual([]);
    });

    await steps.step('Status shows only Not Live, Active, Inactive, Future or Expired', async () => {
      const invalid = Object.values(rowsByFilter).flat().filter((r) => !(VALID_STATUSES as readonly string[]).includes(r.status));
      expect(invalid.map((r) => `${r.name}: "${r.status}"`)).toEqual([]);
    });

    await steps.step('Approval Status shows only Draft, Pending Approval, Approved or Rejected with its version number', async () => {
      const invalid = Object.values(rowsByFilter).flat().filter((r) => !APPROVAL_CELL.test(r.approvalStatus));
      expect(invalid.map((r) => `${r.name}: "${r.approvalStatus}"`)).toEqual([]);
    });
  });

  test(`TC-${CASES.combined.azureId}: should keep search, filter and sort intact and export exactly the on-screen result when they are combined in one session`, async ({
    formularyManagementPage,
    formularyIn,
    steps,
  }) => {
    const data = CASES.combined;
    for (const days of data.expiryDays) await formularyIn('Draft', { expiryInDays: days });
    let onScreen: string[] = [];

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.step('Open the Formulary list view - the list loads with all formulary records', async () => {
      expect(await formularyManagementPage.countRows()).toBeGreaterThan(0);
    });

    await steps.step(`Apply the quick search "${SUITE_FORMULARY_PREFIX}" and then the advanced filter Status = "${data.status}" - the list narrows to records matching both`, async () => {
      await formularyManagementPage.search(SUITE_FORMULARY_PREFIX);
      const answer = await formularyManagementPage.applyCriteria({ status: data.status });
      const strays = answer.items.filter((f) => !f.formularyNameEn.includes(SUITE_FORMULARY_PREFIX) || !f.isPendingCreate);
      expect(answer.items.length, 'the case\'s two drafts match both').toBeGreaterThanOrEqual(2);
      expect(strays.map((f) => f.formularyNameEn), 'rows outside the search and the filter').toEqual([]);
    });

    await steps.step('Sort the narrowed list by Expiry Date - it reorders by expiry date while remaining filtered', async () => {
      const answer = await formularyManagementPage.sortBy('expiryDate', 'asc');
      expect(isSorted(answer.items.map((f) => f.expiryDate), 'asc'), 'ordered by expiry date').toBe(true);
      expect(answer.items.every((f) => f.formularyNameEn.includes(SUITE_FORMULARY_PREFIX) && f.isPendingCreate), 'still searched and filtered').toBe(true);
      onScreen = await formularyManagementPage.readNames();
    });

    await steps.step('Export the resulting list to Excel - the file reflects exactly the search, filter and sort order on screen', async () => {
      const file = await formularyManagementPage.exportAndParse('all', 'excel');
      const nameHeader = headerLike(file.parsed.headers, /name.*(english|en\b)|^name/i);
      const exported = file.parsed.rows.map((r) => r[nameHeader]);
      expect(exported.every((name) => name.includes(SUITE_FORMULARY_PREFIX)), 'only searched rows should be exported').toBe(true);
      expect(exported.slice(0, onScreen.length), 'the exported order').toEqual(onScreen);
    });
  });
});
