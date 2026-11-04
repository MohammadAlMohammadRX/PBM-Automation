import type { Page } from '@playwright/test';
import { test, expect } from '../../../fixtures';
import { AppRoutes } from '../../../constants/AppRoutes';
import { POLICY_IMPORT } from '../../../constants/ElementIds';
import { POLICY_BULK_STATUS, POLICY_HISTORY_PART, POLICY_IMPORT_ENTITY } from '../../../constants/policy/writerAIds';
import { CASES, IMPORT_MESSAGE, INVALID_ROWS, batchNames } from '../../../data/policy/bulkImport.data';
import type { PolicyImportDialog } from '../../../pages/policy/PolicyImportDialog';
import type { PolicyDetailPage } from '../../../pages/policy/PolicyDetailPage';
import type { PolicyMembersTab } from '../../../pages/policy/PolicyMembersTab';
import { daysFromNow, readOperation, waitForOperation, type BulkOperation } from '../../../utils/formulary/writerAHelpers';
import {
  SUITE_POLICY_PREFIX,
  findPolicyByName,
  listPolicyRegister,
  memberCandidates,
  policyStamp,
  readPolicyMembers,
  readPolicyNetworks,
  type MemberCandidate,
  type PolicyUploadFile,
} from '../../../utils/PolicyProvisioning';
import {
  controlAvailability,
  csvUpload,
  downloadHistoryResult,
  downloadPolicyImportResult,
  exportNames,
  historyRowIdFor,
  memberImportRow,
  nameHeaderOf,
  networkImportRow,
  paddedCsv,
  policyImportKit,
  policyImportRow,
  readHistoryRow,
  readPolicyImportHistory,
  resultReason,
  resultRowsWith,
  startPolicyImport,
  xlsxUpload,
  type PolicyImportKit,
} from '../../../utils/policy/writerAHelpers';

/** What one upload produced: the drawer's answer and, when it started one, the finished operation. */
interface Outcome {
  started: Awaited<ReturnType<typeof startPolicyImport>>;
  operation: BulkOperation | null;
  seen: string[];
}

/** Adds the file in the drawer and, when an operation started, waits for it to finish. */
async function importFile(dialog: PolicyImportDialog, page: Page, file: PolicyUploadFile): Promise<Outcome> {
  const started = await startPolicyImport(dialog, file);
  if (started.status >= 300 || started.operationId === '') return { started, operation: null, seen: [] };
  const { operation, seen } = await waitForOperation(page, started.operationId);
  return { started, operation, seen };
}

/** An outcome in words, for failure messages. */
const told = (outcome: Outcome): string => `${outcome.started.endpoint || 'no Import* request'} ${outcome.started.status} ${outcome.started.text.slice(0, 160)} | `
  + `${outcome.operation ? `${outcome.operation.status}: ${outcome.operation.succeededRows} succeeded, ${outcome.operation.failedRows} failed ${outcome.operation.errorMessage ?? ''}` : 'no operation'} | ${outcome.started.messages.join(' | ')}`;

/** The Members tab's template headers for a policy (its Export Template). */
async function memberTemplate(detail: PolicyDetailPage, members: PolicyMembersTab, policyId: string): Promise<string[]> {
  await detail.open(policyId);
  await members.open();
  return (await members.exportFile('template', 'csv')).parsed?.headers ?? [];
}

/** Members the picker offers that the policy does not hold yet. */
async function freshMembers(page: Page, policyId: string, count: number): Promise<MemberCandidate[]> {
  const held = new Set((await readPolicyMembers(page, policyId)).map((m) => m.memberId));
  return (await memberCandidates(page, policyId, 'a')).filter((c) => !held.has(c.id)).slice(0, count);
}

/** The common part of a batch's names (all but the running number). */
const batchOf = (names: string[]): string => names[0].replace(/ \d+$/, '');

/**
 * User story 15176: Policy Bulk Import.
 * Policies (the list's Import), members and network assignments (a policy's
 * tabs) imported from CSV / Excel; file type and size checks; row-level errors,
 * the member limit, duplicates and empty files; the job's lifecycle, the
 * report and the error file. Files are built from the screens' own templates -
 * see the data file.
 */
test.describe('US 15176 - Policy Bulk Import', () => {
  test.describe.configure({ timeout: 12 * 60_000 });

  test(`TC-${CASES.validCsv.azureId}: should import every row of a valid policies CSV and report all rows succeeded`, async ({
    policyManagementPage: list,
    discardPolicyNamed,
    page,
    steps,
  }) => {
    const names = batchNames('Bulk', CASES.validCsv.rows);
    names.forEach((name) => discardPolicyNamed(name));
    let kit!: PolicyImportKit;
    let outcome!: Outcome;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
      kit = await policyImportKit(page, list);
      expect(kit.headers.length, 'the policy template\'s columns').toBeGreaterThan(0);
    });

    await steps.step(`Open Bulk Import, select the valid CSV of ${names.length} policies and upload it - the file is accepted and processing begins in the background`, async () => {
      await list.openTable();
      outcome = await importFile(await list.openImport(), page, csvUpload(kit.headers, names.map((nameEn) => policyImportRow(kit, { nameEn })), 'policies_valid.csv'));
      expect({ accepted: outcome.started.status < 300, operation: outcome.started.operationId !== '' }, told(outcome)).toEqual({ accepted: true, operation: true });
    });

    await steps.step('Wait for processing to complete and open the import report - every row is reported imported as a new or updated policy', async () => {
      expect({ status: outcome.operation?.status, succeeded: outcome.operation?.succeededRows, failed: outcome.operation?.failedRows }, told(outcome))
        .toEqual({ status: POLICY_BULK_STATUS.completed, succeeded: names.length, failed: 0 });
      const report = (await readPolicyImportHistory(page, POLICY_IMPORT_ENTITY.policy)).find((op) => op.operationId === outcome.started.operationId);
      expect(report?.succeededRows, 'the report\'s succeeded rows').toBe(names.length);
      const { items } = await listPolicyRegister(page, { searchText: batchOf(names) }, 50);
      expect(items.map((p) => p.policyNameEn).sort(), 'the imported policies in the register').toEqual([...names].sort());
    });
  });

  test(`TC-${CASES.excelMembers.azureId}: should import every row of a valid Excel file and report them all processed`, async ({
    policyManagementPage: list,
    policyDetailPage,
    policyMembersTab,
    policyIn,
    requireBaseline,
    page,
    steps,
  }) => {
    const rows = CASES.excelMembers.rows;
    const policy = await policyIn('Draft', { type: 'individual', members: 0 });
    let headers: string[] = [];
    let pool: MemberCandidate[] = [];
    let outcome!: Outcome;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
      headers = await memberTemplate(policyDetailPage, policyMembersTab, policy.id);
      expect(headers.length, 'the members template\'s columns').toBeGreaterThan(0);
      pool = await freshMembers(page, policy.id, rows);
      requireBaseline(pool.length === rows, `${rows} members the picker offers for the file`);
    });

    await steps.step(`Open Bulk Import, select the valid Excel file of ${rows} members and upload it - the file is accepted and background processing starts`, async () => {
      outcome = await importFile(await policyMembersTab.openImport(), page, xlsxUpload(headers, pool.map((m) => memberImportRow(headers, m)), 'members_valid.xlsx'));
      expect({ accepted: outcome.started.status < 300, operation: outcome.started.operationId !== '' }, told(outcome)).toEqual({ accepted: true, operation: true });
    });

    await steps.step('Wait for processing to complete and check the import report - every row was processed and imported', async () => {
      expect({ status: outcome.operation?.status, succeeded: outcome.operation?.succeededRows, failed: outcome.operation?.failedRows }, told(outcome))
        .toEqual({ status: POLICY_BULK_STATUS.completed, succeeded: rows, failed: 0 });
      const enrolled = (await readPolicyMembers(page, policy.id)).map((m) => m.memberCode).sort();
      expect(enrolled, 'the policy\'s members').toEqual(pool.map((m) => m.memberCode).sort());
    });
  });

  test(`TC-${CASES.unsupported.azureId}: should reject a .txt file before any import starts, saying only CSV or Excel is supported`, async ({
    policyManagementPage: list,
    steps,
  }) => {
    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
    });

    await steps.step(`Open Bulk Import and attempt to upload ${CASES.unsupported.fileName} - the file is rejected with a message that only CSV or Excel files are supported`, async () => {
      const dialog = await list.openImport();
      const accept = await dialog.getAccept();
      const answer = await dialog.addFile({ name: CASES.unsupported.fileName, mimeType: 'text/plain', buffer: Buffer.from('Policy Name,Plan\nText import,PLN-0001\n') });
      const said = [await dialog.getFileError(), ...answer.messages].join(' | ');
      expect({ rejected: answer.status === -1 || answer.status >= 400, message: IMPORT_MESSAGE.wrongType.test(said) }, `accept="${accept}"; ${answer.endpoint} ${answer.status}; said: ${said}`)
        .toEqual({ rejected: true, message: true });
    });
  });

  test(`TC-${CASES.sizeLimit.azureId}: should accept a file of exactly 5 MB and reject one just over it with a size message`, async ({
    policyManagementPage: list,
    page,
    steps,
  }) => {
    const limit = CASES.sizeLimit.limitBytes;
    let kit!: PolicyImportKit;
    let padHeader = '';

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
      kit = await policyImportKit(page, list);
      padHeader = nameHeaderOf(kit.headers);
      expect(padHeader, `a name column to pad (headers ${kit.headers.join(', ')})`).not.toBe('');
    });

    await steps.step('Open Bulk Import and upload a file of exactly 5 MB - the file is accepted and processing begins', async () => {
      const file = paddedCsv(kit.headers, [], padHeader, limit, 'import_5MB.csv');
      await list.openTable();
      const outcome = await importFile(await list.openImport(), page, file);
      expect({ size: file.buffer.length, accepted: outcome.started.status < 300 && outcome.started.operationId !== '' }, told(outcome)).toEqual({ size: limit, accepted: true });
    });

    await steps.step('Attempt to upload a file just over 5 MB - the upload is rejected with a file-size-exceeded message', async () => {
      const file = paddedCsv(kit.headers, [], padHeader, limit + 1, 'import_5MB_plus.csv');
      await list.openTable();
      const dialog = await list.openImport();
      const outcome = await importFile(dialog, page, file);
      const said = [await dialog.getFileError(), ...outcome.started.messages].join(' | ');
      expect({ rejected: outcome.started.status === -1 || outcome.started.status >= 400, message: IMPORT_MESSAGE.tooLarge.test(said) }, `${told(outcome)}; said: ${said}`)
        .toEqual({ rejected: true, message: true });
    });
  });

  test(`TC-${CASES.invalidRows.azureId}: should list every invalid row with a specific error naming its problem`, async ({
    policyManagementPage: list,
    discardPolicyNamed,
    page,
    steps,
  }) => {
    const valid = batchNames('Mixed', CASES.invalidRows.valid);
    const stamp = policyStamp();
    const invalid = INVALID_ROWS.map((_, i) => `${SUITE_POLICY_PREFIX} Invalid ${stamp} ${i + 1}`);
    [...valid, ...invalid].forEach((name) => discardPolicyNamed(name));
    let kit!: PolicyImportKit;
    let outcome!: Outcome;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
      kit = await policyImportKit(page, list);
    });

    await steps.step(`Upload the mixed-validity CSV (${valid.length} valid rows, ${invalid.length} invalid of different kinds) - the file is accepted and pre-validation begins`, async () => {
      const rows = [
        ...valid.map((nameEn) => policyImportRow(kit, { nameEn })),
        ...INVALID_ROWS.map((row, i) => policyImportRow(kit, {
          nameEn: invalid[i],
          type: row.type,
          nameAr: row.nameAr,
          planCode: row.planCode,
          effective: row.effective ?? (row.effectiveDays !== undefined ? daysFromNow(row.effectiveDays) : undefined),
          expiry: row.expiryDays !== undefined ? daysFromNow(row.expiryDays) : undefined,
        })),
      ];
      await list.openTable();
      outcome = await importFile(await list.openImport(), page, csvUpload(kit.headers, rows, 'mixed_validity.csv'));
      expect({ accepted: outcome.started.status < 300, operation: outcome.operation !== null }, told(outcome)).toEqual({ accepted: true, operation: true });
    });

    await steps.step('Review the pre-validation results and the final report - each invalid row is listed with a specific, clear error message', async () => {
      const result = await downloadPolicyImportResult(page, outcome.started.operationId);
      const problems = INVALID_ROWS.map((row, i) => {
        const reported = resultRowsWith(result.parsed, invalid[i])[0];
        if (!reported) return `${row.kind}: not in the report`;
        const reason = resultReason(result.parsed, reported);
        return row.reason.test(reason) ? '' : `${row.kind}: "${reason}"`;
      }).filter((p) => p !== '');
      expect({ succeeded: outcome.operation?.succeededRows, failed: outcome.operation?.failedRows, problems }, `report columns: ${result.parsed.headers.join(', ')}`)
        .toEqual({ succeeded: valid.length, failed: invalid.length, problems: [] });
    });
  });

  test(`TC-${CASES.memberLimit.azureId}: should add only the members that fit the policy's member limit and report the rest as not added`, async ({
    policyManagementPage: list,
    policyDetailPage,
    policyMembersTab,
    policyIn,
    requireBaseline,
    page,
    steps,
  }) => {
    const data = CASES.memberLimit;
    const policy = await policyIn('Draft', { type: 'individual', members: data.current, maxMembers: data.limit });
    let headers: string[] = [];
    let pool: MemberCandidate[] = [];
    let outcome!: Outcome;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
      headers = await memberTemplate(policyDetailPage, policyMembersTab, policy.id);
      pool = await freshMembers(page, policy.id, data.rows);
      requireBaseline(pool.length === data.rows, `${data.rows} members not yet on the policy`);
    });

    await steps.step(`Upload the member file of ${data.rows} new rows for the policy with ${data.limit - data.current} slots left - the file is accepted and processing begins`, async () => {
      outcome = await importFile(await policyMembersTab.openImport(), page, csvUpload(headers, pool.map((m) => memberImportRow(headers, m)), 'members_over_limit.csv'));
      expect({ accepted: outcome.started.status < 300, operation: outcome.operation !== null }, told(outcome)).toEqual({ accepted: true, operation: true });
    });

    await steps.step(`Review the final import report - exactly ${data.added} rows are added and ${data.rows - data.added} reported not added for the member limit`, async () => {
      const result = await downloadPolicyImportResult(page, outcome.started.operationId);
      const overLimit = result.parsed.rows.filter((row) => IMPORT_MESSAGE.memberLimit.test(resultReason(result.parsed, row))).length;
      expect({ succeeded: outcome.operation?.succeededRows, failed: outcome.operation?.failedRows, overLimit, members: (await readPolicyMembers(page, policy.id)).length }, told(outcome))
        .toEqual({ succeeded: data.added, failed: data.rows - data.added, overLimit: data.rows - data.added, members: data.limit });
    });
  });

  test(`TC-${CASES.lifecycle.azureId}: should run an import in the background from upload through processing to Completed with the report available`, async ({
    policyManagementPage: list,
    discardPolicyNamed,
    page,
    steps,
  }) => {
    const names = batchNames('Lifecycle', CASES.lifecycle.rows);
    names.forEach((name) => discardPolicyNamed(name));
    const fileName = `bulk_import_large_${policyStamp()}.csv`;
    let kit!: PolicyImportKit;
    let operationId = '';

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
      kit = await policyImportKit(page, list);
    });

    await steps.step('Upload the import file - the import status shows Uploaded and then Processing as background validation and import begin', async () => {
      await list.openTable();
      const started = await startPolicyImport(await list.openImport(), csvUpload(kit.headers, names.map((nameEn) => policyImportRow(kit, { nameEn })), fileName));
      expect(started.status, `${started.endpoint} ${started.text.slice(0, 200)}`).toBeLessThan(300);
      operationId = started.operationId;
      const first = await readOperation(page, operationId);
      // A small file can finish before the first read; the notices shown at the upload are then the evidence.
      expect([first?.status ?? '', ...started.messages].join(' | '), 'the job\'s first status and the notices at the upload').toMatch(IMPORT_MESSAGE.inFlight);
    });

    await steps.step('Navigate away to another module while processing continues - processing continues in the background without blocking the screen', async () => {
      await list.goto(AppRoutes.planManagement);
      const op = await readOperation(page, operationId);
      expect({ navigated: page.url().includes(AppRoutes.planManagement), failed: op?.status === POLICY_BULK_STATUS.failed }, `job ${op?.status ?? 'unreadable'}`)
        .toEqual({ navigated: true, failed: false });
    });

    await steps.step('Return to the Bulk Import section once processing finishes - the status shows Completed and the final report is available', async () => {
      const { operation, seen } = await waitForOperation(page, operationId);
      await list.openTable();
      const dialog = await list.openImport();
      await dialog.openHistory();
      const rowId = await historyRowIdFor(page, POLICY_IMPORT.listHistory, fileName);
      const row = rowId === '' ? {} as Record<string, string> : await readHistoryRow(page, POLICY_IMPORT.listHistory, rowId);
      expect({ status: operation.status, history: row.status ?? '(not in Upload history)', total: row.totalrows }, `statuses seen: ${seen.join(' -> ')}`)
        .toEqual({ status: POLICY_BULK_STATUS.completed, history: expect.stringMatching(CASES.lifecycle.final), total: String(names.length) });
    });
  });

  test(`TC-${CASES.mixedOutcome.azureId}: should separate the successful rows from the failed ones and give each failure its reason`, async ({
    policyManagementPage: list,
    policyDetailPage,
    policyMembersTab,
    policyIn,
    requireBaseline,
    page,
    steps,
  }) => {
    const data = CASES.mixedOutcome;
    const policy = await policyIn('Draft', { type: 'individual', members: 0, maxMembers: data.limit });
    let headers: string[] = [];
    let pool: MemberCandidate[] = [];
    let outcome!: Outcome;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
      headers = await memberTemplate(policyDetailPage, policyMembersTab, policy.id);
      pool = await freshMembers(page, policy.id, data.limit + data.beyondLimit);
      requireBaseline(pool.length === data.limit + data.beyondLimit, `${data.limit + data.beyondLimit} members for the file`);
    });

    await steps.step('Upload the mixed-outcome file (valid rows, an unknown member and rows beyond the member limit) - processing begins in the background', async () => {
      const rows = [
        ...pool.slice(0, data.limit).map((m) => memberImportRow(headers, m)),
        memberImportRow(headers, { memberCode: data.unknownCode, documentId: '0000000000' }),
        ...pool.slice(data.limit).map((m) => memberImportRow(headers, m)),
      ];
      outcome = await importFile(await policyMembersTab.openImport(), page, csvUpload(headers, rows, 'mixed_outcomes.csv'));
      expect({ accepted: outcome.started.status < 300, operation: outcome.operation !== null }, told(outcome)).toEqual({ accepted: true, operation: true });
    });

    await steps.step('Open the final import report once processing completes - rows are labelled successful or failed, each failure with its reason', async () => {
      const result = await downloadPolicyImportResult(page, outcome.started.operationId);
      const unknownReason = resultReason(result.parsed, resultRowsWith(result.parsed, data.unknownCode)[0]);
      const limitReasons = pool.slice(data.limit).map((m) => resultReason(result.parsed, resultRowsWith(result.parsed, m.memberCode)[0]));
      expect({
        succeeded: outcome.operation?.succeededRows,
        failed: outcome.operation?.failedRows,
        unknownMember: IMPORT_MESSAGE.unknownMember.test(unknownReason),
        overLimit: limitReasons.filter((r) => IMPORT_MESSAGE.memberLimit.test(r)).length,
      }, `unknown member: "${unknownReason}"; beyond the limit: ${limitReasons.map((r) => `"${r}"`).join(', ')}; columns ${result.parsed.headers.join(', ')}`)
        .toEqual({ succeeded: data.limit, failed: 1 + data.beyondLimit, unknownMember: true, overLimit: data.beyondLimit });
    });
  });

  test(`TC-${CASES.errorFile.azureId}: should offer an error file holding only the failed rows with their reasons`, async ({
    policyManagementPage: list,
    discardPolicyNamed,
    page,
    steps,
  }) => {
    const data = CASES.errorFile;
    const valid = batchNames('ErrFile', data.valid);
    const invalid = batchNames('ErrFile Invalid', data.invalid);
    [...valid, ...invalid].forEach((name) => discardPolicyNamed(name));
    const fileName = `error_file_${policyStamp()}.csv`;
    const history = POLICY_IMPORT.listHistory;
    let rowId = '';

    await steps.critical(`Navigate to the Policy Management module - a completed import with ${data.invalid} failed rows of ${data.valid + data.invalid} exists`, async () => {
      await list.openTable();
      const kit = await policyImportKit(page, list);
      const rows = [
        ...valid.map((nameEn) => policyImportRow(kit, { nameEn })),
        ...invalid.map((nameEn) => policyImportRow(kit, { nameEn, effective: 'not-a-date' })),
      ];
      await list.openTable();
      const outcome = await importFile(await list.openImport(), page, csvUpload(kit.headers, rows, fileName));
      expect(outcome.operation?.failedRows, told(outcome)).toBe(data.invalid);
    });

    await steps.step('Open the import report of the completed job with failures - a link or button to download the error file is available', async () => {
      await list.openTable();
      await (await list.openImport()).openHistory();
      rowId = await historyRowIdFor(page, history, fileName);
      const row = rowId === '' ? {} as Record<string, string> : await readHistoryRow(page, history, rowId);
      const download = rowId === '' ? 'absent' : await controlAvailability(page, `${history}-${POLICY_HISTORY_PART.resultCsv}${rowId}`);
      expect({ inHistory: rowId !== '', failed: row.failedrows, download }).toEqual({ inHistory: true, failed: String(data.invalid), download: 'available' });
    });

    await steps.step('Click to download the error file - it downloads holding only the failed rows with their specific error reasons', async () => {
      const file = await downloadHistoryResult(page, history, rowId, 'csv');
      const names = exportNames(file.parsed).sort();
      const reasons = file.parsed.rows.map((r) => resultReason(file.parsed, r));
      expect({ file: file.filename !== '', rows: names, withoutReason: reasons.filter((r) => r === '').length }, `columns ${file.parsed.headers.join(', ')}`)
        .toEqual({ file: true, rows: [...invalid].sort(), withoutReason: 0 });
    });
  });

  test(`TC-${CASES.empty.azureId}: should report a header-only file as having no importable rows instead of a successful empty import`, async ({
    policyManagementPage: list,
    page,
    steps,
  }) => {
    let kit!: PolicyImportKit;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
      kit = await policyImportKit(page, list);
    });

    await steps.step('Upload the empty file (headers only) - the system detects no data and shows that the file has no importable rows', async () => {
      await list.openTable();
      const dialog = await list.openImport();
      const outcome = await importFile(dialog, page, csvUpload(kit.headers, [], 'empty_template.csv'));
      const said = [await dialog.getFileError(), ...outcome.started.messages, outcome.operation?.errorMessage ?? ''].join(' | ');
      expect({ message: IMPORT_MESSAGE.empty.test(said), misleadingSuccess: outcome.operation?.status === POLICY_BULK_STATUS.completed }, `${told(outcome)}; said: ${said}`)
        .toEqual({ message: true, misleadingSuccess: false });
    });
  });

  test(`TC-${CASES.duplicates.azureId}: should flag a duplicate row of the same file and import only its first occurrence`, async ({
    policyManagementPage: list,
    discardPolicyNamed,
    page,
    steps,
  }) => {
    const [name] = batchNames('Duplicate', 1);
    discardPolicyNamed(name);
    let kit!: PolicyImportKit;
    let outcome!: Outcome;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
      kit = await policyImportKit(page, list);
    });

    await steps.step(`Upload the file holding "${name}" twice - pre-validation runs across all rows`, async () => {
      await list.openTable();
      outcome = await importFile(await list.openImport(), page, csvUpload(kit.headers, [policyImportRow(kit, { nameEn: name }), policyImportRow(kit, { nameEn: name })], 'duplicate_policy.csv'));
      expect({ accepted: outcome.started.status < 300, operation: outcome.operation !== null }, told(outcome)).toEqual({ accepted: true, operation: true });
    });

    await steps.step('Review the import report - the duplicate row is flagged with an error explaining the duplication and the first occurrence is processed', async () => {
      const result = await downloadPolicyImportResult(page, outcome.started.operationId);
      const reasons = resultRowsWith(result.parsed, name).map((r) => resultReason(result.parsed, r));
      const imported = (await listPolicyRegister(page, { searchText: name }, 10)).items.filter((p) => p.policyNameEn === name).length;
      expect({ succeeded: outcome.operation?.succeededRows, failed: outcome.operation?.failedRows, duplicateFlagged: reasons.some((r) => IMPORT_MESSAGE.duplicate.test(r)), imported }, `reasons: ${reasons.join(' | ')}`)
        .toEqual({ succeeded: 1, failed: 1, duplicateFlagged: true, imported: 1 });
    });
  });

  test(`TC-${CASES.allTypes.azureId}: should bulk import policies, members and network assignments, each from its own file`, async ({
    policyManagementPage: list,
    policyDetailPage,
    policyMembersTab,
    policyNetworksTab,
    policyIn,
    discardPolicyNamed,
    requireBaseline,
    page,
    steps,
  }) => {
    const [policyName] = batchNames('AllTypes', 1);
    discardPolicyNamed(policyName);
    const source = await policyIn('Draft');
    const target = await policyIn('Draft', { type: 'individual', members: 0, networks: 0 });
    const networkCode = source.networks[0]?.networkCode ?? '';
    let kit!: PolicyImportKit;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
      kit = await policyImportKit(page, list);
      requireBaseline(networkCode !== '', 'an active network of the suite payer to assign');
    });

    await steps.step('Upload a valid Policy import file - the policies are added', async () => {
      await list.openTable();
      const outcome = await importFile(await list.openImport(), page, csvUpload(kit.headers, [policyImportRow(kit, { nameEn: policyName })], 'policy_import.csv'));
      expect({ status: outcome.operation?.status, succeeded: outcome.operation?.succeededRows, found: (await findPolicyByName(page, policyName)) !== null }, told(outcome))
        .toEqual({ status: POLICY_BULK_STATUS.completed, succeeded: 1, found: true });
    });

    await steps.step(`Upload a valid Member import file (${CASES.allTypes.members} members) - the members are added`, async () => {
      const headers = await memberTemplate(policyDetailPage, policyMembersTab, target.id);
      const pool = await freshMembers(page, target.id, CASES.allTypes.members);
      const outcome = await importFile(await policyMembersTab.openImport(), page, csvUpload(headers, pool.map((m) => memberImportRow(headers, m)), 'member_import.csv'));
      const enrolled = (await readPolicyMembers(page, target.id)).map((m) => m.memberCode).sort();
      expect({ status: outcome.operation?.status, enrolled }, told(outcome)).toEqual({ status: POLICY_BULK_STATUS.completed, enrolled: pool.map((m) => m.memberCode).sort() });
    });

    await steps.step(`Upload a valid Network Assignment import file (${networkCode}) - the network assignment is added`, async () => {
      await policyDetailPage.open(target.id);
      await policyNetworksTab.open();
      const headers = (await policyNetworksTab.exportFile('template', 'csv')).parsed?.headers ?? [];
      const outcome = await importFile(await policyNetworksTab.openImport(), page, csvUpload(headers, [networkImportRow(headers, networkCode)], 'network_import.csv'));
      const assigned = (await readPolicyNetworks(page, target.id)).map((n) => n.networkCode);
      expect({ status: outcome.operation?.status, assigned }, `${told(outcome)}; template ${headers.join(', ')}`).toEqual({ status: POLICY_BULK_STATUS.completed, assigned: [networkCode] });
    });
  });

  test(`TC-${CASES.nearLimit.azureId}: should stay stable and classify every row consistently in report and error file for a large mixed file near the size limit`, async ({
    policyManagementPage: list,
    discardPolicyNamed,
    page,
    steps,
  }) => {
    const data = CASES.nearLimit;
    const valid = batchNames('Large', data.valid);
    const invalid = batchNames('Large Invalid', 2);
    [...valid, ...invalid].forEach((name) => discardPolicyNamed(name));
    let kit!: PolicyImportKit;
    let operationId = '';
    let fileRows = 0;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
      kit = await policyImportKit(page, list);
    });

    await steps.step('Upload the large mixed-content file close to the size limit - the file is accepted and background processing starts', async () => {
      const rows = [
        ...valid.map((nameEn) => policyImportRow(kit, { nameEn })),
        policyImportRow(kit, { nameEn: invalid[0], effective: 'not-a-date' }),
        policyImportRow(kit, { nameEn: invalid[1], type: 'Platinum' }),
        policyImportRow(kit, { nameEn: valid[0] }),
      ];
      fileRows = rows.length + 1;
      const file = paddedCsv(kit.headers, rows, nameHeaderOf(kit.headers), data.bytes, 'large_mixed_near_5MB.csv');
      await list.openTable();
      const started = await startPolicyImport(await list.openImport(), file);
      operationId = started.operationId;
      expect({ accepted: started.status < 300, operation: operationId !== '' }, `${started.endpoint} ${started.status} ${started.text.slice(0, 200)} ${started.messages.join(' | ')}`)
        .toEqual({ accepted: true, operation: true });
    });

    await steps.step('Explore during processing (Upload history, the list, a second upload) and review the final report and error file - the system stays stable, every row is classified and the report and error file agree', async () => {
      const history = await (await list.openImport()).openHistory();
      await list.openTable();
      const second = await startPolicyImport(await list.openImport(), csvUpload(kit.headers, [policyImportRow(kit, { nameEn: `${invalid[0]} Second`, effective: 'not-a-date' })], 'second_upload.csv'));
      discardPolicyNamed(`${invalid[0]} Second`);
      if (second.operationId !== '') await waitForOperation(page, second.operationId);
      const { operation } = await waitForOperation(page, operationId);
      const result = await downloadPolicyImportResult(page, operationId);
      await list.openTable();
      const stable = await list.isKpiBandVisible();
      expect({
        stable,
        total: operation.totalRows,
        succeeded: operation.succeededRows,
        failed: operation.failedRows,
        errorFileRows: result.parsed.rows.length,
      }, `Upload history while running: ${history.slice(0, 200)}; second upload ${second.status} ${second.messages.join(' | ')}`)
        .toEqual({ stable: true, total: fileRows, succeeded: data.valid, failed: fileRows - data.valid, errorFileRows: fileRows - data.valid });
    });
  });
});
