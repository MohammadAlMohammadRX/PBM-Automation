import { test, expect } from '../../../fixtures';
import { Logger } from '../../../utils/Logger';
import type { CsvRow } from '../../../utils/CsvUtils';
import type { ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';
import { purgePayer } from '../../../fixtures/payerState.fixture';
import { PayerImportDrawer, type ImportAnswer, type HistoryRow } from '../../../pages/payer/PayerImportDrawer';
import type { PayerManagementPage } from '../../../pages/payer/PayerManagementPage';
import type { ApprovalManagementPage } from '../../../pages/approval/ApprovalManagementPage';
import type { ParsedCsv } from '../../../utils/CsvUtils';
import { PAYER_COLUMN } from '../../../constants/ElementIds';
import { env } from '../../../constants/EnvironmentConfig';
import {
  findPayers,
  importTag,
  latestOperationOf,
  payerCsv,
  postPayerImport,
  resultReasonFor,
  summaryCounts,
  validPayerRow,
  waitForPayerImport,
} from '../../../utils/payer/payerImport';
import {
  APPROVED,
  AT_LIMIT_BYTES,
  AT_LIMIT_RECORDS,
  DOCUMENTED_LIMIT,
  DRAFT,
  DUPLICATE_PHONES,
  INVALID_EFFECTIVE_DATE,
  LARGE_FILE_ROWS,
  LIVE_STATES,
  MIXED,
  NEW_RECORDS,
  OVER_LIMIT_BYTES,
  PAYER_IMPORT_HEADERS,
  PAYER_EXPORT_CODE_HEADER,
  REASON,
  UPDATED_PHONE,
} from '../../../data/payers/bulkImportExport.data';

/**
 * User story: Bulk Import and Export Payer Records (Azure US 16218).
 *
 * Rewritten 2026-11-24: the import landed in the build of 14 Nov (see
 * bulkImportExport.data.ts for how it behaves). The ten cases that were
 * BLOCKED behind "there is no Bulk Import" and 16443 (no template) now run.
 *
 * Every record an import creates is registered for clean-up by its English
 * name and purged at teardown (drafts discard outright).
 */

/** What one upload produced, read off every place the app reports it. */
interface Outcome {
  answer: ImportAnswer;
  summary: string;
  /** Alerts / messages on screen once the summary arrived. */
  alerts: string[];
  counts: { succeeded: number; failed: number };
  final: Record<string, unknown>;
  history: HistoryRow;
  result: ParsedCsv | null;
}

/** Uploads through the drawer, waits for the operation, and reads summary, history and result file. */
async function upload(
  payerPage: PayerManagementPage,
  drawer: PayerImportDrawer,
  file: Parameters<PayerImportDrawer['addFile']>[0],
  { withResult = true }: { withResult?: boolean } = {},
): Promise<Outcome> {
  await payerPage.open();
  await drawer.open();
  const answer = await drawer.addFile(file);
  expect(answer.status, `ImportPayers should accept "${file.name}" and start an operation; it answered ${answer.status} ${answer.text.slice(0, 200)}`).toBe(200);
  if (!answer.operationId) {
    await expect
      .poll(async () => (answer.operationId = await latestOperationOf(payerPage.pageHandle(), file.name)), { timeout: 60_000 })
      .not.toBe('');
  }
  const summary = await drawer.summaryOf(answer.operationId);
  const alerts = await drawer.alertsShown();
  const final = await waitForPayerImport(payerPage.pageHandle(), answer.operationId);
  await payerPage.open();
  await drawer.openHistory();
  const history = await drawer.historyRow(answer.operationId);
  const result = withResult ? await drawer.downloadResult(answer.operationId).catch(() => null) : null;
  await drawer.closeAll();
  Logger.info(`import "${file.name}": summary "${summary}", history ${JSON.stringify(history)}, final status ${String(final.status)}`);
  return { answer, summary, alerts, counts: summaryCounts(summary), final, history, result };
}

/** Registers clean-up for every name an import may have created. */
function purgeLater(
  cleanup: { register: (task: () => Promise<void>) => void },
  payerPage: PayerManagementPage,
  approvalPage: ApprovalManagementPage,
  names: readonly string[],
): void {
  for (const name of names) cleanup.register(() => purgePayer(payerPage, approvalPage, name));
}

const describe = (o: Outcome): string => `summary "${o.summary}", history ${JSON.stringify(o.history)}`;

test.describe('Bulk import and export payer records - the import half', () => {
  test('16430: should add new payer records from a valid file as drafts', async ({
    payerManagementPage,
    approvalManagementPage,
    page,
    cleanup,
    steps,
  }) => {
    // Five drafts to purge at teardown - the clean-up counts against the test's time (timed out at test.slow()).
    test.setTimeout(900_000);
    const drawer = new PayerImportDrawer(page);
    const tag = importTag();
    const rows = Array.from({ length: NEW_RECORDS }, (_, i) => validPayerRow(tag, i + 1));
    purgeLater(cleanup, payerManagementPage, approvalManagementPage, rows.map((r) => r.nameEn));
    let outcome!: Outcome;

    await steps.critical('Navigate to the Payer Management module - the Payer Management landing page loads', async () => {
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
    });

    await steps.critical('Open the Bulk Import feature - the Bulk Import screen opens with a file upload control', async () => {
      await drawer.open();
      expect(await drawer.hasUploadControl(), `the Import drawer should offer a file upload control; it shows: "${await drawer.getText()}"`).toBe(true);
    });

    await steps.critical('Upload a valid file of new payer records - the file uploads and a summary of the records is displayed', async () => {
      outcome = await upload(payerManagementPage, drawer, payerCsv(`new_payers_${tag}.csv`, rows));
      expect(outcome.summary, 'the upload summary should report the records of the file').toMatch(/Succeeded:\s*\d+/i);
    });

    await steps.step('Confirm the import - the system processes the file and displays an import results summary', async () => {
      expect(outcome.counts, `all ${NEW_RECORDS} records should succeed and none fail - ${describe(outcome)}`).toEqual({ succeeded: NEW_RECORDS, failed: 0 });
      expect(outcome.history.total, `Upload history should count the ${NEW_RECORDS} records - ${describe(outcome)}`).toBe(String(NEW_RECORDS));
      expect(outcome.history.status, `Upload history should show the operation Completed - ${describe(outcome)}`).toBe('Completed');
    });

    await steps.step('Navigate to the Payer list - the imported payers appear with status Draft (pending approval)', async () => {
      const seen: string[] = [];
      for (const row of rows) {
        const present = await payerManagementPage.isRowVisibleAfterSearch(row.nameEn);
        const approval = present ? await payerManagementPage.getCellValue(row.nameEn, PAYER_COLUMN.approvalStatus).catch(() => '') : 'NOT LISTED';
        seen.push(`${row.nameEn}: ${approval}`);
      }
      expect(seen.filter((s) => !DRAFT.test(s)), `every imported payer should be listed as a Draft; the list showed: ${seen.join('; ')}`).toEqual([]);
    });
  });

  test('16432: should update existing payer records matched by Payer Code', async ({
    payerManagementPage,
    draftPayer,
    page,
    steps,
  }) => {
    test.slow();
    const drawer = new PayerImportDrawer(page);
    const tag = importTag();
    let code = '';
    let outcome!: Outcome;

    await steps.critical('Navigate to the Payer Management module - the Payer Management landing page loads', async () => {
      await payerManagementPage.open();
      code = await payerManagementPage.getPayerCode(draftPayer.nameEn);
      expect(code, `the existing payer "${draftPayer.nameEn}" should carry a code to match on`).not.toBe('');
    });

    await steps.critical('Open the Bulk Import feature - the Bulk Import screen opens', async () => {
      await payerManagementPage.open();
      await drawer.open();
    });

    await steps.critical('Upload a file of updates to existing payers matched by Payer ID - the file uploads', async () => {
      const row = validPayerRow(tag, 1, {
        code,
        nameEn: draftPayer.nameEn,
        nameAr: draftPayer.nameAr,
        type: draftPayer.type,
        email: draftPayer.email,
        phone: UPDATED_PHONE,
        licence: draftPayer.licenseNumber,
        city: draftPayer.city,
      });
      outcome = await upload(payerManagementPage, drawer, payerCsv(`update_payers_${tag}.csv`, [row], true));
    });

    await steps.step('Confirm the import - the system processes the update and displays a results summary', async () => {
      expect(outcome.counts, `the update row should succeed - ${describe(outcome)}; result: ${resultReasonFor(outcome.result, code)}`).toEqual({ succeeded: 1, failed: 0 });
    });

    await steps.step('Open the updated payer - it shows the new value from the file and is not yet approved', async () => {
      const listed = (await findPayers(page, draftPayer.nameEn)).filter((p) => p.payerNameEn === draftPayer.nameEn);
      expect(listed.length, `exactly one "${draftPayer.nameEn}" should exist after the update (not a second record)`).toBe(1);
      expect(String(listed[0].phoneNumber ?? ''), 'the phone should read the value from the import file').toContain(UPDATED_PHONE);
      const approval = await payerManagementPage.getApprovalStatus(draftPayer.nameEn);
      expect(approval, 'the updated payer should await approval (a draft change), not be live').not.toMatch(new RegExp(APPROVED, 'i'));
    });
  });

  test('16433: should accept a file at the documented size limit and refuse one beyond it', async ({
    payerManagementPage,
    approvalManagementPage,
    page,
    cleanup,
    steps,
  }) => {
    test.setTimeout(600_000);
    const drawer = new PayerImportDrawer(page);
    const tag = importTag();
    const rows = Array.from({ length: AT_LIMIT_RECORDS }, (_, i) => validPayerRow(tag, i + 1));
    purgeLater(cleanup, payerManagementPage, approvalManagementPage, rows.map((r) => r.nameEn));
    let outcome!: Outcome;

    await steps.critical('Navigate to the Payer Management module - the Payer Management landing page loads', async () => {
      await payerManagementPage.open();
      await drawer.open();
      const text = await drawer.getText();
      expect(text, 'the drawer should document the maximum it accepts').toMatch(DOCUMENTED_LIMIT);
    });

    await steps.critical('Upload a file at exactly the maximum allowed size - the file is accepted and queued for processing', async () => {
      outcome = await upload(payerManagementPage, drawer, payerCsv(`at_limit_${tag}.csv`, rows, false, AT_LIMIT_BYTES), { withResult: false });
    });

    await steps.step('Submit the import and review the results - all records at the boundary process successfully', async () => {
      expect(outcome.counts, `the ${AT_LIMIT_RECORDS} records of the at-limit file should all succeed - ${describe(outcome)}`).toEqual({ succeeded: AT_LIMIT_RECORDS, failed: 0 });
    });

    await steps.step('Upload a file one step beyond the limit - it is refused with a limit message', async () => {
      await payerManagementPage.open();
      const over = payerCsv(`over_limit_${tag}.csv`, [validPayerRow(tag, 9)], false, OVER_LIMIT_BYTES);
      const answer = await drawer.addFile(over);
      purgeLater(cleanup, payerManagementPage, approvalManagementPage, [validPayerRow(tag, 9).nameEn]);
      expect(answer.status === -1 || answer.status >= 400, `a file of ${OVER_LIMIT_BYTES} bytes should be refused; ImportPayers answered ${answer.status}`).toBe(true);
      expect(answer.messages.join(' | '), 'the refusal should name the limit').toMatch(REASON.limit);
    });
  });

  test('16434: should import the valid rows of a mixed file and report the invalid ones with reasons', async ({
    payerManagementPage,
    approvalManagementPage,
    page,
    cleanup,
    steps,
  }) => {
    test.slow();
    const drawer = new PayerImportDrawer(page);
    const tag = importTag();
    const valid = Array.from({ length: MIXED.valid }, (_, i) => validPayerRow(tag, i + 1));
    const noName = validPayerRow(tag, 7, { nameEn: '' });
    const badEmail = validPayerRow(tag, 8, { email: MIXED.badEmail });
    purgeLater(cleanup, payerManagementPage, approvalManagementPage, [...valid.map((r) => r.nameEn), badEmail.nameEn]);
    let outcome!: Outcome;

    await steps.critical('Navigate to the Payer Management module - the Payer Management landing page loads', async () => {
      await payerManagementPage.open();
    });

    await steps.critical('Open Bulk Import and upload the mixed file - the file uploads and validation begins', async () => {
      outcome = await upload(payerManagementPage, drawer, payerCsv(`mixed_${tag}.csv`, [valid[0], noName, valid[1], badEmail, valid[2]]));
    });

    await steps.step('Submit the import - the system processes the file record by record', async () => {
      expect(outcome.history.total, `all ${MIXED.valid + MIXED.invalid} rows should be processed - ${describe(outcome)}`).toBe(String(MIXED.valid + MIXED.invalid));
    });

    await steps.step('Review the import results summary - valid records succeed; invalid ones are listed separately with their reasons', async () => {
      expect(outcome.counts, `${MIXED.valid} should succeed and ${MIXED.invalid} fail - ${describe(outcome)}`).toEqual({ succeeded: MIXED.valid, failed: MIXED.invalid });
      const nameReason = resultReasonFor(outcome.result, noName.licence);
      const emailReason = resultReasonFor(outcome.result, badEmail.licence);
      expect(nameReason, `the blank-name row should be reported with its reason; result file: ${JSON.stringify(outcome.result?.rows ?? null)}`).toMatch(REASON.nameRequired);
      expect(emailReason, `the invalid-email row should be reported with its reason; result file: ${JSON.stringify(outcome.result?.rows ?? null)}`).toMatch(REASON.email);
      const listedValid = (outcome.result?.rows ?? []).filter((r) => valid.some((v) => Object.values(r).includes(v.licence)));
      expect(listedValid.length, 'the valid rows should not appear among the failures').toBe(0);
    });

    await steps.step('Navigate to the Payer list - only the valid records appear as Draft; the invalid ones are not created', async () => {
      const problems: string[] = [];
      for (const row of valid) {
        if (!(await payerManagementPage.isRowVisibleAfterSearch(row.nameEn))) { problems.push(`${row.nameEn} not listed`); continue; }
        const approval = await payerManagementPage.getCellValue(row.nameEn, PAYER_COLUMN.approvalStatus).catch(() => '');
        if (!DRAFT.test(approval)) problems.push(`${row.nameEn} shows "${approval}"`);
      }
      for (const row of [noName, badEmail]) {
        if ((await findPayers(page, row.licence)).length > 0) problems.push(`invalid row ${row.licence} was created`);
      }
      expect(problems, 'only the valid rows should become Draft payers').toEqual([]);
    });
  });

  test('16435: should reject a row with a blank mandatory field, naming the field', async ({
    payerManagementPage,
    page,
    steps,
  }) => {
    test.slow();
    const drawer = new PayerImportDrawer(page);
    const tag = importTag();
    const row = validPayerRow(tag, 1, { nameEn: '' });
    let outcome!: Outcome;

    await steps.critical('Navigate to the Payer Management module - the Payer Management landing page loads', async () => {
      await payerManagementPage.open();
    });

    await steps.critical('Open Bulk Import and upload the file with the incomplete record - the file uploads', async () => {
      outcome = await upload(payerManagementPage, drawer, payerCsv(`missing_name_${tag}.csv`, [row]));
    });

    await steps.step('Submit the import - the system validates each record', async () => {
      expect(outcome.history.total, `the row should be validated - ${describe(outcome)}`).toBe('1');
    });

    await steps.step('Review the results - the record fails with "Payer Name is required" and is not created', async () => {
      expect(outcome.counts, `the incomplete row should fail - ${describe(outcome)}`).toEqual({ succeeded: 0, failed: 1 });
      expect(resultReasonFor(outcome.result, row.licence), `the result file should name the field; it holds ${JSON.stringify(outcome.result?.rows ?? null)}`).toMatch(REASON.nameRequired);
      expect(await findPayers(page, row.licence), 'no payer should be created from the incomplete row').toEqual([]);
    });
  });

  test('16436: should take a bulk-imported payer through the same draft-to-approval workflow', async ({
    payerManagementPage,
    approvalManagementPage,
    page,
    cleanup,
    steps,
  }) => {
    test.setTimeout(600_000);
    const drawer = new PayerImportDrawer(page);
    const tag = importTag();
    const row = validPayerRow(tag, 1);
    purgeLater(cleanup, payerManagementPage, approvalManagementPage, [row.nameEn]);

    await steps.critical('Navigate to the Payer Management module - the Payer Management landing page loads', async () => {
      await payerManagementPage.open();
      const outcome = await upload(payerManagementPage, drawer, payerCsv(`workflow_${tag}.csv`, [row]), { withResult: false });
      expect(outcome.counts, `the import precondition: the record should import - ${describe(outcome)}`).toEqual({ succeeded: 1, failed: 0 });
    });

    await steps.critical('Open the Payer list and find the imported record - it shows status Draft', async () => {
      await payerManagementPage.open();
      expect(await payerManagementPage.getApprovalStatus(row.nameEn), 'the imported record should be a Draft').toMatch(DRAFT);
    });

    await steps.critical('Submit the record for approval - its status changes to Pending Approval', async () => {
      // sendForApproval gives an unpublished payer the network approval requires - as for a manual payer.
      await payerManagementPage.sendForApproval(row.nameEn);
    });

    await steps.step('Approve the record as an approver - its status changes to Approved and it goes live', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.approve(row.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.expectApprovalOutcome(row.nameEn, APPROVED, true);
      const lifecycle = await payerManagementPage.getLifecycleStatus(row.nameEn);
      expect(LIVE_STATES as readonly string[], `the approved payer should be Active or Future (effective in 2 days); it shows "${lifecycle}"`).toContain(lifecycle);
    });
  });

  test('16437: should reject a row with an invalid field format, naming the field', async ({
    payerManagementPage,
    page,
    steps,
  }) => {
    test.slow();
    const drawer = new PayerImportDrawer(page);
    const tag = importTag();
    const row = validPayerRow(tag, 1, { effective: INVALID_EFFECTIVE_DATE });
    let outcome!: Outcome;

    await steps.critical('Navigate to the Payer Management module - the Payer Management landing page loads', async () => {
      await payerManagementPage.open();
    });

    await steps.critical('Open Bulk Import and upload the file with the invalid-format record - the file uploads', async () => {
      outcome = await upload(payerManagementPage, drawer, payerCsv(`bad_date_${tag}.csv`, [row]));
    });

    await steps.step('Submit the import - the system validates each record', async () => {
      expect(outcome.history.total, `the row should be validated - ${describe(outcome)}`).toBe('1');
    });

    await steps.step('Review the results - the record fails with an invalid-format reason for "Effective Date" and is not created', async () => {
      expect(outcome.counts, `the row with Effective Date "${INVALID_EFFECTIVE_DATE}" should fail - ${describe(outcome)}`).toEqual({ succeeded: 0, failed: 1 });
      const reason = resultReasonFor(outcome.result, row.licence);
      expect(reason, `the result file should name the field; it holds ${JSON.stringify(outcome.result?.rows ?? null)}`).toMatch(REASON.dateFormat);
      expect(reason, 'the reason should say the value is invalid').toMatch(REASON.invalid);
      expect(await findPayers(page, row.licence), 'no payer should be created from the invalid row').toEqual([]);
    });
  });

  test('16439: should report two rows carrying the same Payer Code within one file', async ({
    payerManagementPage,
    draftPayer,
    page,
    steps,
  }) => {
    test.slow();
    const drawer = new PayerImportDrawer(page);
    const tag = importTag();
    let code = '';
    let outcome!: Outcome;

    await steps.critical('Navigate to the Payer Management module - the Payer Management landing page loads', async () => {
      await payerManagementPage.open();
      code = await payerManagementPage.getPayerCode(draftPayer.nameEn);
      expect(code, 'the existing payer should carry a code').not.toBe('');
    });

    await steps.critical('Open Bulk Import and upload the file with duplicate Payer ID rows - the file uploads', async () => {
      const same = {
        code, nameEn: draftPayer.nameEn, nameAr: draftPayer.nameAr, type: draftPayer.type, email: draftPayer.email,
        licence: draftPayer.licenseNumber, city: draftPayer.city,
      };
      const rows = DUPLICATE_PHONES.map((phone) => validPayerRow(tag, 1, { ...same, phone }));
      outcome = await upload(payerManagementPage, drawer, payerCsv(`duplicate_code_${tag}.csv`, rows, true));
    });

    await steps.step('Submit the import - the system validates the file', async () => {
      expect(outcome.history.total, `both rows should be validated - ${describe(outcome)}`).toBe('2');
    });

    await steps.step('Review the results - the duplicate rows are flagged with a duplicate reason and the outcome is clearly reported', async () => {
      const reasons = (outcome.result?.rows ?? []).map((r) => Object.values(r)[0] ?? '');
      expect(reasons.join(' | '), `a row should be reported as a duplicate Payer Code within the file - ${describe(outcome)}; result file: ${JSON.stringify(outcome.result?.rows ?? null)}`).toMatch(REASON.duplicate);
      const listed = (await findPayers(page, draftPayer.nameEn)).filter((p) => p.payerNameEn === draftPayer.nameEn);
      expect(listed.length, 'the payer should still be one record').toBe(1);
      expect(DUPLICATE_PHONES as readonly string[], 'the payer should hold one of the two rows\' values, not a corrupted mix').toContain(String(listed[0].phoneNumber ?? '').replace(/\D/g, '').slice(-9));
    });
  });

  test('16440: should report that a header-only file holds no records to import', async ({
    payerManagementPage,
    page,
    steps,
  }) => {
    test.slow();
    const drawer = new PayerImportDrawer(page);
    const tag = importTag();
    let outcome!: Outcome;

    await steps.critical('Navigate to the Payer Management module - the Payer Management landing page loads', async () => {
      await payerManagementPage.open();
    });

    await steps.critical('Open Bulk Import and upload the header-only file - the system detects that no data rows are present', async () => {
      outcome = await upload(payerManagementPage, drawer, payerCsv(`header_only_${tag}.csv`, []));
      expect(outcome.history.total ?? '0', `no rows should be counted - ${describe(outcome)}`).toBe('0');
    });

    await steps.step('Submit the import - a message such as "No records found to import" is shown and nothing is created', async () => {
      // What the SCREEN said - the operation's errorMessage in the API counts only if it is shown.
      const shown = [...outcome.answer.messages, outcome.summary, ...outcome.alerts, outcome.history.status ?? ''].join(' | ');
      Logger.info(`header-only: operation errorMessage (API) "${String(outcome.final.errorMessage ?? '')}"`);
      expect(shown, `the user should be told the file holds no records; the app showed: ${shown}`).toMatch(REASON.noRecords);
      expect(outcome.counts.succeeded, 'nothing should be created').toBe(0);
    });
  });

  test('16441: should refuse an unsupported or corrupted file with a message saying which', async ({
    payerManagementPage,
    page,
    steps,
  }) => {
    test.slow();
    const drawer = new PayerImportDrawer(page);
    const tag = importTag();
    let txt!: ImportAnswer;
    let corrupt!: ImportAnswer;

    await steps.critical('Navigate to the Payer Management module - the Payer Management landing page loads', async () => {
      await payerManagementPage.open();
    });

    await steps.step('Upload the unsupported and the corrupted file - the system refuses both', async () => {
      txt = await drawer.addFile({ name: `payers_${tag}.txt`, mimeType: 'text/plain', buffer: Buffer.from('Payer Name\nnot a spreadsheet\n') });
      await payerManagementPage.open();
      corrupt = await drawer.addFile({
        name: `payers_corrupt_${tag}.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: Buffer.from(`PK\u0003\u0004 not a workbook ${'x'.repeat(256)}`),
      });
      expect(txt.status === -1 || txt.status >= 400, `the .txt file should be refused; ImportPayers answered ${txt.status}`).toBe(true);
      expect(corrupt.status === -1 || corrupt.status >= 400, `the corrupted .xlsx should be refused; ImportPayers answered ${corrupt.status} ${corrupt.text.slice(0, 200)}`).toBe(true);
    });

    await steps.step('Review the error message - it says the format is unsupported or the file could not be read', async () => {
      expect(txt.messages.join(' | '), 'the .txt refusal should name the supported formats').toMatch(REASON.unsupported);
      expect(corrupt.messages.join(' | '), 'the corrupted-file refusal should say it could not be read').toMatch(REASON.unsupported);
    });
  });

  test('16442: should stay stable under a large file, a cancelled upload, a navigation away and a repeated file', async ({
    payerManagementPage,
    approvalManagementPage,
    page,
    cleanup,
    steps,
  }) => {
    test.setTimeout(600_000);
    const drawer = new PayerImportDrawer(page);
    const tag = importTag();
    const repeated = validPayerRow(tag, 1);
    purgeLater(cleanup, payerManagementPage, approvalManagementPage, [repeated.nameEn]);

    await steps.critical('Navigate to the Payer Management module - the Payer Management landing page loads', async () => {
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
    });

    await steps.step('Upload a very large file, cancel mid-upload, navigate away during processing and re-upload the same file twice - no crash, corruption or duplicate processing, with feedback shown', async () => {
      const problems: string[] = [];

      // A very large file (every row lacks its English name, so nothing is created), left by navigating away.
      const large = payerCsv(`large_${tag}.csv`, Array.from({ length: LARGE_FILE_ROWS }, (_, i) => validPayerRow(tag, 100 + i, { nameEn: '' })));
      const big = await drawer.addFile(large);
      if (big.status !== 200) problems.push(`the large file was answered ${big.status}`);
      await page.goto(`${env.baseUrl}/dashboard`).catch(() => undefined);
      await payerManagementPage.open();
      if (big.operationId) {
        const final = await waitForPayerImport(page, big.operationId, 300_000);
        if (!/Completed|Failed/i.test(String(final.status))) problems.push(`the large import never finished after navigating away (status ${String(final.status)})`);
        if (Number(final.totalRows ?? 0) !== LARGE_FILE_ROWS) problems.push(`the large import counted ${String(final.totalRows)} rows, not ${LARGE_FILE_ROWS}`);
        if (Number(final.succeededRows ?? 0) !== 0) problems.push(`${String(final.succeededRows)} rows of the all-invalid file succeeded`);
      }

      // Cancel straight after adding a file: adding starts the upload and the drawer closes by itself, so Cancel is
      // pressed only if the drawer is still open a moment later - and must then close it. The screen must stay usable.
      await payerManagementPage.open();
      await drawer.open();
      const cancelled = payerCsv(`cancelled_${tag}.csv`, [validPayerRow(tag, 50, { nameEn: '' })]);
      await drawer.fileInput().setInputFiles(cancelled);
      await page.waitForTimeout(1_500);
      if (await drawer.isOpen()) await drawer.cancel().catch(() => problems.push('Cancel did not close the drawer'));
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered().catch(() => problems.push('the payer list did not render after the cancelled upload'));

      // The same valid file twice in a row: one payer, not two.
      const file = payerCsv(`repeat_${tag}.csv`, [repeated]);
      for (const attempt of [1, 2]) {
        await payerManagementPage.open();
        const answer = await drawer.addFile(file);
        if (answer.status !== 200 || !answer.operationId) { problems.push(`upload ${attempt} of the repeated file was answered ${answer.status}`); continue; }
        await waitForPayerImport(page, answer.operationId);
      }
      const copies = (await findPayers(page, repeated.nameEn)).filter((p) => p.payerNameEn === repeated.nameEn);
      if (copies.length !== 1) problems.push(`re-uploading the same file left ${copies.length} payers named "${repeated.nameEn}"`);

      // Feedback: the bottom panel shows the upload ("Importing Payers" while running, "Succeeded: n" after).
      const panel = await drawer.panelText();
      if (!panel.includes(file.name) || !/Importing|Succeeded:\s*\d+/i.test(panel)) problems.push(`no upload progress/summary was shown (panel: "${panel}")`);

      expect(problems, 'the import should handle each scenario without crash, corruption or duplicate processing').toEqual([]);
    });
  });
});

/**
 * The export half.
 */
test.describe('Bulk import and export payer records - the export half', () => {
  test('16431: should export the payer records as a file that can be read back', async ({
    payerManagementPage,
    exportMenu,
    steps,
  }) => {
    test.slow();
    let rows: CsvRow[] = [];
    let headers: string[] = [];

    // Rewritten 2026-11-24 to the case's own steps: it asks for the import TEMPLATE format (the build of 14 Nov
    // exports exactly that - "Payer Name (English) *" ... "Expiry Date *" after "Payer Code"), not the export
    // story's column checklist, which the export no longer follows (no Status column, " *" suffixes).
    await steps.critical('Navigate to the Payer Management module - the Payer Management landing page loads', async () => {
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
    });

    await steps.critical('Open the Bulk Export feature - the Export option is displayed', async () => {
      await exportMenu.expectAvailable();
    });

    await steps.critical('Trigger the export (Export All) - the system generates a downloadable file', async () => {
      const parsed = await exportMenu.exportCsv('all');
      headers = parsed.headers;
      rows = parsed.rows;
    });

    // A file that downloads but holds nothing - a header row and no data - satisfies "a file was produced"
    // and is useless to whoever asked for it.
    await steps.step('Open the downloaded file - it holds payer records under column headers matching the bulk import template format', async () => {
      const missing = PAYER_IMPORT_HEADERS.filter((column) => !headers.includes(column));
      expect(missing, `the export should carry every import-template column; absent: ${missing.join(', ')}. The file's headers: ${headers.join(', ')}`).toEqual([]);
      const order = PAYER_IMPORT_HEADERS.map((column) => headers.indexOf(column));
      expect(order, 'the template columns should keep the template\'s order').toEqual([...order].sort((a, b) => a - b));
      expect(rows.length, 'the export should hold payer rows beneath its headers').toBeGreaterThan(0);
    });
  });

  test('16438: should withhold the import and export from a role without the rights', async ({
    payerManagementPage,
    exportMenu,
    page,
    shapedNonAdmin,
    steps,
  }) => {
    test.slow();
    let session!: ShapedSession;

    // THE CONTROL. "Not offered" proves nothing unless both are offered to somebody.
    await steps.critical('Navigate to the Payer Management module - the Payer Management landing page loads', async () => {
      await payerManagementPage.open();
      await exportMenu.expectAvailable();
      expect(await new PayerImportDrawer(page).isOffered(), 'as an administrator the Import is offered').toBe(true);
      session = await shapedNonAdmin({ without: ['exportPayers', 'importPayers'] });
      await session.payers.navigate();
      await session.payers.expectRowsRendered();
    });

    await steps.step('Attempt to locate the Bulk Import or Bulk Export option - it is hidden or disabled for the role', async () => {
      expect(await new PayerImportDrawer(session.page).isOffered(), 'the Import should not be offered to a role without the import right').toBe(false);
      await session.exportMenu.expectExportRefused();
    });

    await steps.step('Attempt to invoke the import directly - access is denied with an authorization error', async () => {
      const answer = await postPayerImport(session.page, payerCsv(`denied_${importTag()}.csv`, [validPayerRow(importTag(), 1, { nameEn: '' })]));
      expect([401, 403], `ImportPayers should refuse a role without the right; it answered ${answer.status} ${answer.text.slice(0, 200)}`).toContain(answer.status);
    });
  });

  test('16443: should export the same columns, in the same order, as the import template', async ({
    payerManagementPage,
    exportMenu,
    steps,
  }) => {
    test.slow();
    let exported: string[] = [];
    let template: string[] = [];

    await steps.critical('Navigate to the Payer Management module - the Payer Management landing page loads', async () => {
      await payerManagementPage.open();
    });

    await steps.critical('Export the payer records and note the column headers and order - they are recorded', async () => {
      await exportMenu.expectAvailable();
      exported = (await exportMenu.exportCsv('all')).headers;
      template = (await payerManagementPage.exportTemplateHeaders()).map((h) => h.trim());
      Logger.info(`export: [${exported.join(', ')}]; template: [${template.join(', ')}]`);
      expect(template, 'the template should be the one the import documents').toEqual([...PAYER_IMPORT_HEADERS]);
    });

    await steps.step('Compare against the Bulk Import template - headers and order match exactly', async () => {
      expect(
        exported,
        `the export should match the import template column for column; the export carries "${PAYER_EXPORT_CODE_HEADER}" `
          + `${exported.includes(PAYER_EXPORT_CODE_HEADER) ? '' : 'NOT '}first. Export: [${exported.join(', ')}]; template: [${template.join(', ')}]`,
      ).toEqual(template);
    });
  });
});
