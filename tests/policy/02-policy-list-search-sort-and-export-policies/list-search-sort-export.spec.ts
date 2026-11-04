import { test, expect } from '../../../fixtures';
import { POLICY_LIST_EXPECTED } from '../../../constants/policy/writerAIds';
import { APPROVAL_LABEL, NOTICE, POLICY_SUITE_PAYER, textOfLength, versionBadge } from '../../../data/policy/policy.data';
import {
  CASES,
  EXPORT_COLUMN_OF,
  NO_FILTER,
  TEMPLATE_FIELDS,
  comboTerm,
  specialName,
} from '../../../data/policy/listSearchSortExport.data';
import { headerLike } from '../../../utils/formulary/writerAHelpers';
import {
  approvePolicy,
  rejectPolicy,
  stageTrivialChange,
  submitPolicy,
  waitForPolicy,
} from '../../../utils/PolicyProvisioning';
import {
  ERROR_MESSAGE,
  byText,
  dateValue,
  exportNames,
  exportRowNamed,
  isOrdered,
  isRendered,
  nameHeaderOf,
  planFilterLabel,
  primaryStatus,
  readScreenList,
  searchAnswer,
  searchMaxLength,
  visibleMessages,
} from '../../../utils/policy/writerAHelpers';

/**
 * User story 15166: Policy List - Search, Sort and Export policies.
 * Search by number, bilingual name and holder; quick filters; the default and
 * chosen sort with its indicator; empty results; CSV / Excel / template
 * exports; and the approval status with its version through submit, approve
 * and reject. The list has no advanced search - see the data file.
 */
test.describe('US 15166 - Policy List - Search, Sort and Export policies', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.byNumber.azureId}: should return exactly the matching policy when its policy number is searched`, async ({
    policyManagementPage: list,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('Draft');

    await steps.critical('Navigate to the Policy Management module - the module loads showing the policy list', async () => {
      await list.openTable();
    });

    await steps.step('Open the advanced search panel - the panel displays the available search fields', async () => {
      expect(await list.tryOpenAdvancedSearch(), 'an advanced search panel opened by the Filters button').toBe(true);
    });

    await steps.step(`Enter the policy number ${policy.policyNumber} and run the search - the results show only the matching policy`, async () => {
      const answer = await list.searchFor(policy.policyNumber);
      expect(answer.items.map((p) => p.policyNumber), 'the search answer').toEqual([policy.policyNumber]);
      expect(await list.readColumnValues('number'), 'the rows shown').toEqual([policy.policyNumber]);
    });
  });

  test(`TC-${CASES.byName.azureId}: should return the same policy when it is searched by its English and by its Arabic name`, async ({
    policyManagementPage: list,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Draft');

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
    });

    await steps.step(`Open advanced search and enter the English name "${policy.nameEn}" - the matching policy is returned`, async () => {
      const opened = await list.tryOpenAdvancedSearch();
      const answer = await searchAnswer(list, page, policy.nameEn);
      expect({ advancedSearch: opened, found: answer.items.map((p) => p.id) }).toEqual({ advancedSearch: true, found: [policy.id] });
    });

    await steps.step(`Clear the search and enter the Arabic name "${policy.nameAr}" - the same policy is returned`, async () => {
      await list.search('');
      const answer = await searchAnswer(list, page, policy.nameAr);
      expect(answer.items.map((p) => p.id), 'the Arabic-name search').toEqual([policy.id]);
    });
  });

  test(`TC-${CASES.byHolder.azureId}: should list all and only the policies of a policyholder when the holder's name is searched`, async ({
    policyManagementPage: list,
    policyIn,
    page,
    steps,
  }) => {
    const holder = CASES.byHolder.holder;
    const policy = await policyIn('Draft', { holderName: holder });
    let answer = { status: 0, items: [] as { id: string; policyHolderNames: string }[], totalRows: 0 };

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
    });

    await steps.step(`Open advanced search and enter the policyholder "${holder}" - the search runs`, async () => {
      const opened = await list.tryOpenAdvancedSearch();
      answer = await searchAnswer(list, page, holder);
      expect({ advancedSearch: opened, status: answer.status }).toEqual({ advancedSearch: true, status: 200 });
    });

    await steps.step(`Review the results - only policies belonging to "${holder}" are listed`, async () => {
      expect(answer.items.map((p) => p.id), `"${policy.nameEn}" of ${holder}`).toContain(policy.id);
      expect(answer.items.filter((p) => !p.policyHolderNames.includes(holder)).map((p) => `${p.id}: ${p.policyHolderNames}`), 'policies of other holders').toEqual([]);
    });
  });

  test(`TC-${CASES.combined.azureId}: should return only the policies matching type, status and payer together, and follow a changed status`, async ({
    policyManagementPage: list,
    policyIn,
    page,
    steps,
  }) => {
    const data = CASES.combined;
    const policy = await policyIn('Future');

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
    });

    await steps.step(`Open advanced search and set Policy Type ${data.type}, Status ${data.status} and Payer ${POLICY_SUITE_PAYER} together - all three are applied`, async () => {
      const opened = await list.tryOpenAdvancedSearch();
      const payerCriterion = await isRendered(page, POLICY_LIST_EXPECTED.payerFilter);
      // The list has no payer criterion (asserted below); the payer is put in the
      // app's top-bar payer scope - the screen's only payer control - so steps 3-4
      // check the three criteria together instead of reporting other payers' rows
      // (2026-11-04: every "Al - tawnya" row was reported as a mismatch).
      await list.captureList(async () => { await list.scopeTo(POLICY_SUITE_PAYER); });
      await list.filterBy('type', data.type);
      await list.filterBy('status', data.status);
      expect({ advancedSearch: opened, payerCriterion, type: await list.readFilter('type'), status: await list.readFilter('status') })
        .toEqual({ advancedSearch: true, payerCriterion: true, type: data.type, status: data.status });
    });

    await steps.step('Run the search - the results list only policies matching all three criteria at once', async () => {
      const rows = await list.readRowsOnScreen().catch(() => []);
      const off = rows.filter((r) => r.type !== data.type || primaryStatus(r.status) !== data.status || r.payer !== POLICY_SUITE_PAYER).map((r) => `${r.name}: ${r.type} / ${r.status} / ${r.payer}`);
      expect(off, 'rows not matching every criterion').toEqual([]);
    });

    await steps.step(`Change the Status to ${data.changedStatus}, keeping the others - the results show only the new combination`, async () => {
      const answer = await list.filterBy('status', data.changedStatus);
      const rows = await list.readRowsOnScreen();
      expect(answer.items.map((p) => p.id), `"${policy.nameEn}" (${data.type}, ${data.changedStatus})`).toContain(policy.id);
      expect(rows.filter((r) => r.type !== data.type || primaryStatus(r.status) !== data.changedStatus || r.payer !== POLICY_SUITE_PAYER).map((r) => `${r.name}: ${r.type} / ${r.status} / ${r.payer}`)).toEqual([]);
    });
  });

  test(`TC-${CASES.quickFilters.azureId}: should narrow the list correctly with each quick filter - payer, plan, type, status and approval status`, async ({
    policyManagementPage: list,
    policyIn,
    page,
    steps,
  }) => {
    const data = CASES.quickFilters;
    const policy = await policyIn('Draft');

    await steps.critical('Navigate to the Policy Management module - the module loads showing all policies', async () => {
      await list.openTable();
    });

    await steps.step('Apply the quick filter for Payer - the list shows only the selected payer\'s policies', async () => {
      expect(await isRendered(page, POLICY_LIST_EXPECTED.payerFilter), `a Payer quick filter (offered: status, type, plan, approval)`).toBe(true);
    });

    await steps.step(`Apply the quick filter for Plan "${policy.planName}" - the list narrows to that plan`, async () => {
      const answer = await list.filterBy('plan', await planFilterLabel(page, policy.payerName, policy.planId, policy.planName));
      expect(answer.items.map((p) => p.id), `"${policy.nameEn}"`).toContain(policy.id);
      expect((await list.readColumnValues('plan')).filter((p) => p !== policy.planName), 'rows of other plans').toEqual([]);
    });

    await steps.step(`Reset the filters, then apply Type ${data.type}, Status ${data.status} and Approval ${data.approval} one at a time - each shows only matching policies`, async () => {
      await list.filterBy('plan', NO_FILTER.plan);
      const off: string[] = [];
      await list.filterBy('type', data.type);
      off.push(...(await list.readColumnValues('type')).filter((t) => t !== data.type).map((t) => `type filter: ${t}`));
      await list.filterBy('type', NO_FILTER.type);
      await list.filterBy('status', data.status);
      off.push(...(await list.readColumnValues('status')).filter((s) => primaryStatus(s) !== data.status).map((s) => `status filter: ${s}`));
      await list.filterBy('status', NO_FILTER.status);
      await list.filterBy('approval', data.approval);
      off.push(...(await list.readColumnValues('approvalStatus')).filter((a) => !a.endsWith(`· ${data.approval}`)).map((a) => `approval filter: ${a}`));
      expect(off, 'rows not matching the filter applied').toEqual([]);
    });
  });

  test(`TC-${CASES.defaultSort.azureId}: should open the list sorted newest to oldest with the indicator showing Newest to Oldest`, async ({
    policyManagementPage: list,
    policyIn,
    steps,
  }) => {
    const older = await policyIn('Draft');
    const newer = await policyIn('Draft');
    let request: Record<string, unknown> = {};

    await steps.critical('Navigate to the Policy Management module - the module loads with no sort manually applied', async () => {
      request = await list.captureListRequest(() => list.open());
      await list.waitForRowsRendered();
    });

    await steps.step('Observe the order of policies and the sort indicator - newest created first, the indicator shows Newest to Oldest', async () => {
      const names = await list.readNames();
      const indicator = await list.readSortLabel();
      expect({ newerFirst: names.indexOf(newer.nameEn) > -1 && names.indexOf(newer.nameEn) < names.indexOf(older.nameEn), sortBy: String(request.sortBy ?? '') }, `names ${names.slice(0, 5).join(' | ')}`)
        .toEqual({ newerFirst: true, sortBy: expect.stringMatching(CASES.defaultSort.sortBy) });
      expect(indicator, 'the sort indicator').toMatch(CASES.defaultSort.indicator);
    });
  });

  test(`TC-${CASES.termLength.azureId}: should search without error with a single-character and with a maximum-length term`, async ({
    policyManagementPage: list,
    policyIn,
    page,
    steps,
  }) => {
    const data = CASES.termLength;
    const policy = await policyIn('Draft');

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
    });

    await steps.step(`Enter the single character "${data.single}" and run the search - policies whose name contains it are returned`, async () => {
      const answer = await searchAnswer(list, page, data.single);
      expect(answer.status).toBe(200);
      expect(answer.totalRows, `"${policy.nameEn}" starts with "${data.single}"`).toBeGreaterThan(0);
      expect(answer.items.filter((p) => !p.policyNameEn.toLowerCase().includes(data.single.toLowerCase())).map((p) => p.policyNameEn), 'returned names without the character').toEqual([]);
    });

    await steps.step('Enter a term at the maximum allowed length and run the search - it runs without error and returns results or an empty state', async () => {
      const max = (await searchMaxLength(page)) ?? data.maxLength;
      const answer = await searchAnswer(list, page, textOfLength(max));
      const errors = (await visibleMessages(page)).filter((m) => ERROR_MESSAGE.test(m));
      const shown = answer.totalRows === 0 ? (await list.getEmptyStateText()) !== '' : (await list.countRows()) > 0;
      expect({ status: answer.status, errors, resultOrEmptyState: shown }, `a ${max}-character term`).toEqual({ status: 200, errors: [], resultOrEmptyState: true });
    });
  });

  test(`TC-${CASES.sortColumns.azureId}: should sort by each supported field in both directions with the indicator on the active field`, async ({
    policyManagementPage: list,
    steps,
  }) => {
    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
    });

    await steps.step('Click the sort control for Policy Name - the list sorts alphabetically and the indicator shows Policy Name', async () => {
      await list.sortBy('name', 'asc');
      const names = await list.readNames();
      expect({ ordered: isOrdered(names, byText), indicator: await list.readSortLabel() }, names.join(' | '))
        .toEqual({ ordered: true, indicator: expect.stringMatching(/Policy Name.*A-Z/i) });
    });

    await steps.step('Click again to reverse the direction - the list re-sorts descending and the indicator flips', async () => {
      await list.sortBy('name', 'desc');
      const names = await list.readNames();
      expect({ ordered: isOrdered(names, (a, b) => byText(b, a)), indicator: await list.readSortLabel() }, names.join(' | '))
        .toEqual({ ordered: true, indicator: expect.stringMatching(/Policy Name.*Z-A/i) });
    });

    await steps.step('Repeat on Policy Number, Effective Date and Members - each re-orders correctly with the indicator on the active field', async () => {
      const problems: string[] = [];
      await list.sortBy('number', 'asc');
      const numbers = await list.readColumnValues('number');
      if (!isOrdered(numbers, byText)) problems.push(`Policy Number not ascending: ${numbers.join(' | ')}`);
      if (!/Policy Number/i.test(await list.readSortLabel())) problems.push(`indicator after Policy Number: "${await list.readSortLabel()}"`);
      await list.sortBy('effectiveDate', 'asc');
      const dates = await list.readColumnValues('effectiveDate');
      if (!isOrdered(dates, (a, b) => dateValue(a) - dateValue(b))) problems.push(`Effective Date not ascending: ${dates.join(' | ')}`);
      if (!/Effective Date/i.test(await list.readSortLabel())) problems.push(`indicator after Effective Date: "${await list.readSortLabel()}"`);
      const options = await list.getSortOptions();
      if (!options.some((o) => /members/i.test(o))) problems.push(`no Members sort (offered: ${options.join(', ')})`);
      expect(problems).toEqual([]);
    });
  });

  test(`TC-${CASES.noMatch.azureId}: should show a clear empty state and no stale rows when no policy matches the searched number`, async ({
    policyManagementPage: list,
    page,
    steps,
  }) => {
    const data = CASES.noMatch;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
    });

    await steps.step(`Open advanced search and enter the non-existent number ${data.number} - the search runs`, async () => {
      const opened = await list.tryOpenAdvancedSearch();
      const answer = await searchAnswer(list, page, data.number);
      expect({ advancedSearch: opened, status: answer.status, found: answer.totalRows }).toEqual({ advancedSearch: true, status: 200, found: 0 });
    });

    await steps.step('Observe the results area - an empty-state message says no policy matched, with no stale results', async () => {
      expect({ rows: await list.getRowCount(), message: await list.getEmptyStateText() }).toEqual({ rows: 0, message: NOTICE.emptyList });
    });
  });

  test(`TC-${CASES.exportCsv.azureId}: should export every policy to a valid CSV whose data matches the list`, async ({
    policyManagementPage: list,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('Draft');
    let total = 0;
    let file!: Awaited<ReturnType<typeof list.exportAndParse>>;

    await steps.critical('Navigate to the Policy Management module - the module loads showing the full policy list', async () => {
      await list.openTable();
      total = (await readScreenList(list)).totalRows;
    });

    await steps.step('Select Export, the CSV format and the export-all scope - the export is initiated', async () => {
      file = await list.exportAndParse('all', 'csv');
      expect(file.filename, 'the downloaded file').toMatch(/\.csv$/i);
    });

    await steps.step('Open the generated file once the download completes - it opens in CSV format', async () => {
      expect(file.bytes.subarray(0, 2).toString('latin1'), 'a CSV, not a workbook').not.toBe('PK');
      expect(file.parsed.headers.length, 'the CSV header row').toBeGreaterThan(0);
    });

    await steps.step('Compare the file content against the on-screen list - the CSV holds every policy with data matching the list', async () => {
      expect(file.parsed.rows.length, 'rows exported against the list\'s total').toBe(total);
      const exported = exportRowNamed(file.parsed, policy.nameEn);
      expect(exported, `"${policy.nameEn}" in the CSV (headers ${file.parsed.headers.join(', ')})`).toBeDefined();
      const shown = await list.readRow(policy.nameEn);
      const mismatches = EXPORT_COLUMN_OF
        .map(([column, header]) => ({ column, header: headerLike(file.parsed.headers, header) }))
        .filter(({ column, header }) => (exported?.[header] ?? '').trim() !== shown[column])
        .map(({ column, header }) => `${column}: list "${shown[column]}", CSV ${header || '(no column)'} "${exported?.[header] ?? ''}"`);
      expect(mismatches).toEqual([]);
    });
  });

  test(`TC-${CASES.exportFilteredExcel.azureId}: should export only the filtered policies to a valid Excel file`, async ({
    policyManagementPage: list,
    steps,
  }) => {
    const status = CASES.exportFilteredExcel.status;
    let filtered = 0;
    let file!: Awaited<ReturnType<typeof list.exportAndParse>>;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
    });

    await steps.step(`Apply the filter Status = ${status} - the list shows only ${status} policies`, async () => {
      filtered = (await list.filterBy('status', status)).totalRows;
      expect(filtered, `${status} policies in the register`).toBeGreaterThan(0);
      expect((await list.readColumnValues('status')).filter((s) => primaryStatus(s) !== status), 'rows of another status').toEqual([]);
    });

    await steps.step('Select Export, the Excel format and the filtered-results scope - the export is initiated', async () => {
      // "Selected Export" is the filtered-results scope: with a filter on the screen
      // sends scope "Filtered" (bundle onExport, 2026-11-04); "Export All Data" sends "All".
      file = await list.exportAndParse('selected', 'excel');
      expect(file.filename, 'the downloaded file').toMatch(/\.xlsx$/i);
    });

    await steps.step('Open the generated Excel file - it opens correctly in Excel format', async () => {
      expect(file.bytes.subarray(0, 2).toString('latin1'), 'an .xlsx workbook').toBe('PK');
      expect(file.parsed.headers.length).toBeGreaterThan(0);
    });

    await steps.step('Compare the exported rows against the filtered list - the file holds exactly the filtered subset', async () => {
      const statusHeader = headerLike(file.parsed.headers, /^status$/i);
      const statuses = file.parsed.rows.map((r) => (r[statusHeader] ?? '').trim());
      expect({ rows: file.parsed.rows.length, otherStatuses: [...new Set(statuses.filter((s) => s !== status))] }, `status column "${statusHeader}" of headers ${file.parsed.headers.join(', ')}`)
        .toEqual({ rows: filtered, otherStatuses: [] });
    });
  });

  test(`TC-${CASES.template.azureId}: should download a template holding only the policy column headers and no data rows`, async ({
    policyManagementPage: list,
    steps,
  }) => {
    let file!: Awaited<ReturnType<typeof list.exportTemplate>>;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
    });

    await steps.step('Select Export and choose the template option - the template download is initiated', async () => {
      file = await list.exportTemplate('csv');
      expect(file.filename, 'the template file').not.toBe('');
    });

    await steps.step('Open the downloaded file - it shows only column headers matching the policy structure, with no data rows', async () => {
      const missing = TEMPLATE_FIELDS.filter(([, field]) => !file.parsed.headers.some((h) => field.test(h))).map(([name]) => name);
      expect({ missing, dataRows: file.parsed.rows.length }, `headers: ${file.parsed.headers.join(', ')}`).toEqual({ missing: [], dataRows: 0 });
    });
  });

  test(`TC-${CASES.combinedExport.azureId}: should apply filter, search, sort and export together and return to the default list when they are cleared`, async ({
    policyManagementPage: list,
    policyIn,
    steps,
  }) => {
    const term = comboTerm();
    const a = await policyIn('Draft', { nameEn: `${term} A` });
    const b = await policyIn('Draft', { nameEn: `${term} B` });
    let total = 0;
    let shown: string[] = [];

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
      total = (await readScreenList(list)).totalRows;
    });

    await steps.step(`Apply the Approval filter Draft, search "${term}" within it and sort by Policy Name Z-A - the list reflects all three`, async () => {
      await list.filterBy('approval', 'Draft');
      await list.search(term);
      await list.sortBy('name', 'desc');
      shown = await list.readNames();
      const approvals = await list.readColumnValues('approvalStatus');
      expect({ names: shown, draftOnly: approvals.every((s) => s.endsWith(`· ${APPROVAL_LABEL.draft}`)) }).toEqual({ names: [b.nameEn, a.nameEn], draftOnly: true });
    });

    await steps.step('Export the current filtered and sorted view to Excel - the file matches exactly what is shown', async () => {
      // The current view = "Selected Export" (scope "Filtered" with a filter / search on); "Export All Data" is the whole register.
      const file = await list.exportAndParse('selected', 'excel');
      expect(exportNames(file.parsed), `the exported names (name column "${nameHeaderOf(file.parsed.headers)}")`).toEqual(shown);
    });

    await steps.step('Clear the filter, the search and the sort in turn - the list returns to its unfiltered state, sorted Newest to Oldest', async () => {
      await list.filterBy('approval', NO_FILTER.approval);
      await list.search('');
      const request = await list.captureListRequest(async () => { await list.sortBy('createdOn', 'desc'); });
      const answer = await readScreenList(list);
      expect({ total: answer.totalRows, sortBy: String(request.sortBy ?? ''), indicator: await list.readSortLabel() })
        .toEqual({ total, sortBy: expect.stringMatching(CASES.defaultSort.sortBy), indicator: expect.stringMatching(CASES.defaultSort.indicator) });
    });
  });

  test(`TC-${CASES.specialChars.azureId}: should keep a name with a comma and quotation mark intact in a CSV export and export the whole register to Excel`, async ({
    policyManagementPage: list,
    policyIn,
    page,
    steps,
  }) => {
    const name = specialName();
    const policy = await policyIn('Draft', { nameEn: name });
    let csv!: Awaited<ReturnType<typeof list.exportAndParse>>;
    let total = 0;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
      total = (await readScreenList(list)).totalRows;
    });

    await steps.step(`Locate the policy whose name holds a comma and a quotation mark (${name}) - it is visible in the list`, async () => {
      expect(await list.isListed(name)).toBe(true);
    });

    await steps.step('Export all policies to CSV - the export completes without error', async () => {
      await list.search('');
      csv = await list.exportAndParse('all', 'csv');
      expect({ file: csv.filename, errors: (await visibleMessages(page)).filter((m) => ERROR_MESSAGE.test(m)) }).toEqual({ file: expect.stringMatching(/\.csv$/i), errors: [] });
    });

    await steps.step('Open the CSV and inspect the special-character policy\'s row - its characters are preserved and its data stays in the correct columns', async () => {
      const row = exportRowNamed(csv.parsed, name);
      const numberHeader = headerLike(csv.parsed.headers, /number/i);
      expect({ found: row !== undefined, number: (row?.[numberHeader] ?? '').trim(), columns: Object.keys(row ?? {}).length }, `names exported: ${exportNames(csv.parsed).filter((n) => n.includes('Comma')).join(' | ')}`)
        .toEqual({ found: true, number: policy.policyNumber, columns: csv.parsed.headers.length });
    });

    await steps.step('Export the full dataset to Excel - it completes within an acceptable time without truncating rows', async () => {
      const started = Date.now();
      const xlsx = await list.exportAndParse('all', 'excel');
      const seconds = Math.round((Date.now() - started) / 1000);
      expect({ rows: xlsx.parsed.rows.length, withinTime: seconds <= CASES.specialChars.maxExportSeconds }, `${seconds} s for ${xlsx.parsed.rows.length} rows`)
        .toEqual({ rows: total, withinTime: true });
    });
  });

  test(`TC-${CASES.approvalVersion.azureId}: should move the approval status through Draft, Pending Approval, Approved and Rejected with the version number following each decision`, async ({
    policyManagementPage: list,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Draft');
    const approvalOf = async (): Promise<string> => {
      await list.openTable();
      return (await list.readRow(policy.nameEn)).approvalStatus;
    };

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
    });

    await steps.step('Observe the newly created policy\'s approval status - it shows Draft at version v0', async () => {
      expect(await approvalOf()).toBe(versionBadge(0, APPROVAL_LABEL.draft));
    });

    await steps.step('Submit the policy for approval - the approval status changes to Pending Approval', async () => {
      const sent = await list.sendForApproval(policy.nameEn);
      expect(sent.status, `${sent.text.slice(0, 200)} ${sent.messages.join(' | ')}`).toBeLessThan(300);
      expect(await approvalOf()).toBe(versionBadge(0, APPROVAL_LABEL.pending));
    });

    await steps.step('Approve the policy as a reviewer - the approval status changes to Approved and the version number increments', async () => {
      await approvePolicy(page, policy.nameEn);
      await waitForPolicy(page, policy.id, (p) => !p.isPendingCreate && p.currentVersion >= 1, 'approved (v1)');
      expect(await approvalOf()).toBe(versionBadge(1, APPROVAL_LABEL.approved));
    });

    await steps.step('Make a further change, resubmit it and reject it as a reviewer - Rejected is shown with a new version number', async () => {
      await stageTrivialChange(page, policy.id, policy.nameEn);
      expect((await submitPolicy(page, policy.id)).status, 'the change submitted').toBeLessThan(300);
      expect((await rejectPolicy(page, policy.nameEn)).status, 'the change rejected').toBeLessThan(300);
      expect(await approvalOf()).toBe(versionBadge(2, APPROVAL_LABEL.rejected));
    });
  });
});
