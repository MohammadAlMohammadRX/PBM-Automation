import type { Page } from '@playwright/test';
import { test, expect } from '../../../fixtures';
import type { FormularyImportDialog } from '../../../pages/formulary/FormularyImportDialog';
import type { FormularyDetailPage } from '../../../pages/formulary/FormularyDetailPage';
import type { FormularyTradesTab } from '../../../pages/formulary/FormularyTradesTab';
import {
  CASES,
  EXISTING_TRADE,
  IMPORT_MESSAGE,
  NEW_TRADE,
  PDF_FILE,
  THIRD_TRADE,
  batchNames,
  maxBytesOf,
} from '../../../data/formulary/bulkImport.data';
import { buildXlsx } from '../../../utils/XlsxUtils';
import {
  SUITE_FORMULARY_PREFIX,
  findFormularyByName,
  listFormularyRegister,
  readFormulary,
  readPriceHistory,
  readTiers,
  readTrades,
} from '../../../utils/FormularyProvisioning';
import {
  buildCsv,
  downloadImportResult,
  failedResultRows,
  formularyImportFile,
  formularyImportKit,
  formularyImportRow,
  headerLike,
  readOperation,
  readWorkbook,
  resultError,
  startImport,
  tierImportFile,
  tradeImportFile,
  waitForOperation,
  type BulkOperation,
  type FormularyImportKit,
  type TradeImportRow,
} from '../../../utils/formulary/writerAHelpers';

/** The common part of a batch's names (all but the running number). */
const batchOf = (names: string[]): string => names[0].replace(/ \d+$/, '');

/** Uploads a trades file to the case's own Draft and returns the finished operation and its result file. */
async function tradesOutcome(
  deps: { formularyDetailPage: FormularyDetailPage; formularyTradesTab: FormularyTradesTab; page: Page },
  formularyId: string,
  rows: TradeImportRow[],
): Promise<{ status: number; operation: BulkOperation | null; result: Awaited<ReturnType<typeof downloadImportResult>> | null }> {
  await deps.formularyDetailPage.open(formularyId);
  await deps.formularyTradesTab.open();
  const template = (await deps.formularyTradesTab.export('template')).bytes;
  const started = await startImport(await deps.formularyTradesTab.openImport(), tradeImportFile(template, rows));
  if (started.status >= 300 || started.operationId === '') return { status: started.status, operation: null, result: null };
  const { operation } = await waitForOperation(deps.page, started.operationId);
  return { status: started.status, operation, result: await downloadImportResult(deps.page, started.operationId) };
}

/**
 * User story 15198: Formulary Bulk import.
 * Formularies (the list's Import), tiers (the Tiers tab's) and trades & pricing
 * (the Trades tab's, Excel only) added and updated from a file; the operation's
 * lifecycle and summary; row-level errors, the result file, file type / size /
 * empty checks, the templates and an approved formulary's protection.
 * Files are built at run time from the screen's own templates (see the data file).
 */
test.describe('US 15198 - Formulary Bulk import', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.validFormularies.azureId}: should create every formulary of a valid file and report the number added when it is bulk uploaded`, async ({
    formularyManagementPage,
    discardFormularyNamed,
    page,
    steps,
  }) => {
    const names = batchNames('Bulk', CASES.validFormularies.rows);
    names.forEach((name) => discardFormularyNamed(name));
    let kit: FormularyImportKit;
    let dialog: FormularyImportDialog;
    let operationId = '';

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      kit = await formularyImportKit(page, formularyManagementPage);
      expect(kit.headers.length, 'the template\'s columns').toBeGreaterThan(0);
    });

    await steps.critical('Open the Bulk Import feature - the import screen displays with an upload control', async () => {
      await formularyManagementPage.open();
      dialog = await formularyManagementPage.openImport();
      expect(await dialog.isDropZoneShown(), 'the drop zone').toBe(true);
      expect(await dialog.getAccept(), 'the file types the control takes').toMatch(/xlsx|csv/i);
    });

    await steps.critical(`Select and upload a valid file of ${names.length} new formularies - the file uploads and processing begins`, async () => {
      const started = await startImport(dialog, formularyImportFile(kit, names.map((nameEn) => formularyImportRow(kit, { nameEn }))));
      expect(started.status, `${started.endpoint} ${started.text.slice(0, 200)} ${started.messages.join(' | ')}`).toBeLessThan(300);
      operationId = started.operationId;
      expect(operationId, 'the import should start an operation').not.toBe('');
    });

    await steps.step(`When processing completes, the summary reports ${names.length} formularies added and they are in the register`, async () => {
      const { operation } = await waitForOperation(page, operationId);
      expect({ status: operation.status, created: operation.createdRows || operation.succeededRows, failed: operation.failedRows }, operation.errorMessage ?? '')
        .toEqual({ status: 'Completed', created: names.length, failed: 0 });
      const { items } = await listFormularyRegister(page, { searchText: batchOf(names) }, 50);
      expect(items.map((f) => f.formularyNameEn).sort(), 'the imported formularies').toEqual([...names].sort());
      const history = await (await formularyManagementPage.openImport()).readHistoryTable();
      expect(history.text, 'the upload history summary').toContain(String(names.length));
    });
  });

  test(`TC-${CASES.tiers.azureId}: should add new tiers and update existing ones, counting each separately, when a tiers file is uploaded`, async ({
    formularyDetailPage,
    formularyTiersTab,
    formularyIn,
    page,
    steps,
  }) => {
    const data = CASES.tiers;
    const formulary = await formularyIn('Draft', { tiers: [{ ...data.existing, nameAr: 'مستوى 1' }], trades: 0 });
    let headers: string[] = [];
    let added: BulkOperation | null = null;
    let updated: BulkOperation | null = null;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyDetailPage.open(formulary.id);
    });

    await steps.critical('Open the Bulk Import feature and select the Tiers import - the tier import screen displays', async () => {
      await formularyTiersTab.open();
      headers = (await formularyTiersTab.export('template')).parsed.headers;
      const dialog = await formularyTiersTab.openImport();
      expect(await dialog.isDropZoneShown()).toBe(true);
      expect(headers.length, 'the tiers template\'s columns').toBeGreaterThan(0);
    });

    await steps.critical(`Upload the valid tiers file (new "${data.added.nameEn}") - the file uploads and processing begins`, async () => {
      const started = await startImport(await formularyTiersTab.openImport(), tierImportFile(headers, [data.added]));
      expect(started.status, `${started.endpoint} ${started.text.slice(0, 200)} ${started.messages.join(' | ')}`).toBeLessThan(300);
      added = (await waitForOperation(page, started.operationId)).operation;
    });

    await steps.step(`Update the file ("${data.existing.nameEn}" coverage ${data.updatedCoverage}%) and upload it - the existing tier is updated`, async () => {
      const started = await startImport(await formularyTiersTab.openImport(), tierImportFile(headers, [{ ...data.existing, coverage: data.updatedCoverage }], 'tiers-update.csv'));
      expect(started.status, started.text.slice(0, 200)).toBeLessThan(300);
      updated = (await waitForOperation(page, started.operationId)).operation;
      const tiers = await readTiers(page, formulary.id);
      const tier = tiers.find((t) => t.tierNameEn === data.existing.nameEn);
      const seen = `created ${updated?.createdRows}, updated ${updated?.updatedRows}; tiers ${JSON.stringify(tiers.map((t) => [t.tierNameEn, t.defaultCoveragePercentage]))}`;
      expect(tier?.defaultCoveragePercentage, `"${data.existing.nameEn}" after the update (${seen})`).toBe(data.updatedCoverage);
    });

    await steps.step('The completion summary shows the tiers added and the tiers updated separately', async () => {
      expect({ added: added?.createdRows, updated: updated?.updatedRows }, `${added?.errorMessage ?? ''} ${updated?.errorMessage ?? ''}`).toEqual({ added: 1, updated: 1 });
      expect((await readTiers(page, formulary.id)).map((t) => t.tierNameEn)).toEqual(expect.arrayContaining([data.existing.nameEn, data.added.nameEn]));
    });
  });

  test(`TC-${CASES.trades.azureId}: should add new trades and update existing trades' pricing when a trades & pricing file is uploaded`, async ({
    formularyDetailPage,
    formularyTradesTab,
    formularyIn,
    page,
    steps,
  }) => {
    const data = CASES.trades;
    const formulary = await formularyIn('Draft', { tiers: 1, trades: 1 });
    // The template's tier column is "Tier Order *" (a whole number), not the tier's name.
      const tier = String(formulary.tiers[0].tierOrder);
    const period = { from: new Date(formulary.effectiveDate), to: new Date(formulary.expiryDate) };
    let template: Buffer = Buffer.from('');
    let added: BulkOperation | null = null;
    let updated: BulkOperation | null = null;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyDetailPage.open(formulary.id);
    });

    await steps.critical('Open the Bulk Import feature and select the Trades & Pricing import - the import screen displays', async () => {
      await formularyTradesTab.open();
      template = (await formularyTradesTab.export('template')).bytes;
      const dialog = await formularyTradesTab.openImport();
      expect(await dialog.isDropZoneShown()).toBe(true);
      expect(readWorkbook(template).length, 'the trades template\'s pages').toBeGreaterThan(0);
    });

    await steps.critical(`Upload the valid trades & pricing file (new trade ${NEW_TRADE.code}) - the file uploads and processing begins`, async () => {
      const started = await startImport(await formularyTradesTab.openImport(), tradeImportFile(template, [{ tradeCode: NEW_TRADE.code, tier, ...period }]));
      expect(started.status, `${started.endpoint} ${started.text.slice(0, 200)} ${started.messages.join(' | ')}`).toBeLessThan(300);
      added = (await waitForOperation(page, started.operationId)).operation;
    });

    await steps.step(`Update the file (${EXISTING_TRADE.code} supplier price ${data.updatedSupplierPrice}) - it is uploaded and processing begins`, async () => {
      const started = await startImport(await formularyTradesTab.openImport(), tradeImportFile(template, [{ tradeCode: EXISTING_TRADE.code, tier, supplierPrice: data.updatedSupplierPrice, ...period }], 'trades-update.xlsx'));
      expect(started.status, started.text.slice(0, 200)).toBeLessThan(300);
      updated = (await waitForOperation(page, started.operationId)).operation;
    });

    await steps.step('The completion summary confirms the trades added and updated along with their pricing', async () => {
      // The rows' own reasons, from each job's result file, when a row was not taken.
      const reasons: string[] = [];
      for (const op of [added, updated]) {
        if (!op || op.failedRows === 0) continue;
        const result = await downloadImportResult(page, op.operationId);
        reasons.push(...failedResultRows(result.parsed).map((r) => resultError(result.parsed, r)));
      }
      // The counters count every page's rows (a trade and its price: "2 of 2 rows imported").
      expect({ added: (added?.createdRows ?? 0) >= 1 && added?.failedRows === 0, updated: (updated?.updatedRows ?? 0) >= 1 && updated?.failedRows === 0 },
        `added ${JSON.stringify(added && { created: added.createdRows, updated: added.updatedRows, failed: added.failedRows })}; updated ${JSON.stringify(updated && { created: updated.createdRows, updated: updated.updatedRows, failed: updated.failedRows })}; ${added?.errorMessage ?? ''} ${updated?.errorMessage ?? ''} rows: ${reasons.join(' | ')}`).toEqual({ added: true, updated: true });
      const trades = await readTrades(page, formulary.id);
      expect(trades.map((t) => t.tradeCode)).toEqual(expect.arrayContaining([EXISTING_TRADE.code, NEW_TRADE.code]));
      const existing = trades.find((t) => t.tradeCode === EXISTING_TRADE.code);
      const prices = await readPriceHistory(page, existing?.id ?? '');
      expect(prices.map((p) => p.supplierPrice), `${EXISTING_TRADE.code}'s pricing`).toContain(data.updatedSupplierPrice);
    });
  });

  test(`TC-${CASES.invalidRow.azureId}: should show a row-level error naming the problem when a row carries an unrecognized trade code`, async ({
    formularyDetailPage,
    formularyTradesTab,
    formularyIn,
    page,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { tiers: 1, trades: 0 });
    // The template's tier column is "Tier Order *" (a whole number), not the tier's name.
      const tier = String(formulary.tiers[0].tierOrder);
    const period = { from: new Date(formulary.effectiveDate), to: new Date(formulary.expiryDate) };
    let outcome: Awaited<ReturnType<typeof tradesOutcome>>;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyDetailPage.open(formulary.id);
    });

    await steps.critical(`Open the Bulk Import and upload a file whose second row has the unknown trade code "${CASES.invalidRow.badCode}" - processing begins`, async () => {
      outcome = await tradesOutcome({ formularyDetailPage, formularyTradesTab, page }, formulary.id, [
        { tradeCode: NEW_TRADE.code, tier, ...period },
        { tradeCode: CASES.invalidRow.badCode, tier, ...period },
      ]);
      expect(outcome.status).toBeLessThan(300);
      expect(outcome.operation, 'the import operation').not.toBeNull();
    });

    await steps.step('The invalid row shows a specific, row-level message describing the issue', async () => {
      expect(outcome.operation?.failedRows, 'failed rows').toBeGreaterThanOrEqual(1);
      const parsed = outcome.result?.parsed ?? { headers: [], rows: [] };
      const bad = failedResultRows(parsed).find((r) => Object.values(r).some((v) => v.includes(CASES.invalidRow.badCode)));
      expect(bad, `a failed row for ${CASES.invalidRow.badCode} in the result (${parsed.headers.join(', ')})`).toBeDefined();
      expect(resultError(parsed, bad ?? {}), 'its reason').toMatch(IMPORT_MESSAGE.unknownTrade);
    });
  });

  test(`TC-${CASES.lifecycle.azureId}: should move the import job through uploading and processing to Completed and not reprocess a completed job`, async ({
    formularyManagementPage,
    discardFormularyNamed,
    page,
    steps,
  }) => {
    const data = CASES.lifecycle;
    const names = batchNames('Lifecycle', data.rows);
    names.forEach((name) => discardFormularyNamed(name));
    let kit: FormularyImportKit;
    let operationId = '';
    let fileName = '';

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      kit = await formularyImportKit(page, formularyManagementPage);
      expect(kit.headers.length).toBeGreaterThan(0);
    });

    await steps.step('Upload a valid file and observe the job - it shows uploading, then processing', async () => {
      await formularyManagementPage.open();
      const file = formularyImportFile(kit, names.map((nameEn) => formularyImportRow(kit, { nameEn })), `lifecycle-${Date.now()}.csv`);
      fileName = file.name;
      const started = await startImport(await formularyManagementPage.openImport(), file);
      expect(started.status, started.text.slice(0, 200)).toBeLessThan(300);
      operationId = started.operationId;
      const first = await readOperation(page, operationId);
      // A small file can finish before the first read; the in-flight notice shown at the upload is then the evidence.
      expect([first?.status ?? '', ...started.messages].join(' | '), 'the job\'s first status and the notices at the upload').toMatch(data.inFlight);
    });

    await steps.step('Wait for processing to finish - the job reads Completed or Completed with Errors', async () => {
      const { operation, seen } = await waitForOperation(page, operationId);
      expect(operation.status, `statuses seen: ${seen.join(' -> ')}`).toMatch(data.final);
    });

    await steps.step('Re-triggering processing of the completed job is not possible', async () => {
      const history = await (await formularyManagementPage.openImport()).readHistoryTable();
      expect(history.text, 'the job in the upload history').toContain(fileName);
      expect(history.controlIds.filter((id) => IMPORT_MESSAGE.reprocess.test(id)), 'controls that would re-run the job').toEqual([]);
    });
  });

  for (const key of ['mixed', 'errorFile'] as const) {
    const data = CASES[key];
    const errorFileOnly = key === 'errorFile';
    test(errorFileOnly
      ? `TC-${data.azureId}: should offer an error file listing exactly the failed rows with their reasons when an import had failed rows`
      : `TC-${data.azureId}: should count and tag every row as succeeded or failed with a reason when a file mixes valid and invalid rows`, async ({
      formularyManagementPage,
      discardFormularyNamed,
      page,
      steps,
    }) => {
      const valid = batchNames('Mixed', data.valid);
      const invalid = batchNames('Mixed Invalid', data.invalid);
      [...valid, ...invalid].forEach((name) => discardFormularyNamed(name));
      let kit: FormularyImportKit;
      let operation: BulkOperation | null = null;
      let result: Awaited<ReturnType<typeof downloadImportResult>> | null = null;
      let operationId = '';

      await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
        await formularyManagementPage.open();
        kit = await formularyImportKit(page, formularyManagementPage);
        expect(kit.headers.length).toBeGreaterThan(0);
      });

      await steps.critical(`Open the Bulk Import and upload a file of ${data.valid} valid and ${data.invalid} invalid rows - processing ${errorFileOnly ? 'completes' : 'begins'}`, async () => {
        await formularyManagementPage.open();
        const rows = [
          ...valid.map((nameEn) => formularyImportRow(kit, { nameEn })),
          ...invalid.map((nameEn) => formularyImportRow(kit, { nameEn, nameAr: '' })),
        ];
        const started = await startImport(await formularyManagementPage.openImport(), formularyImportFile(kit, rows, 'mixed_import.csv'));
        expect(started.status, started.text.slice(0, 200)).toBeLessThan(300);
        operationId = started.operationId;
        operation = (await waitForOperation(page, operationId)).operation;
      });

      if (errorFileOnly) {
        await steps.step('Click the option to download the error file - the download is triggered', async () => {
          result = await downloadImportResult(page, operationId);
          expect(result.status, 'DownloadFormularyImportResult').toBeLessThan(300);
          expect(operation?.hasResultFile, 'the job offers a result file').toBe(true);
        });

        await steps.step(`The file lists only the ${data.invalid} failed rows with their specific reasons`, async () => {
          const parsed = result?.parsed ?? { headers: [], rows: [] };
          const failed = failedResultRows(parsed);
          expect({ rows: parsed.rows.length, failed: failed.length }, `result columns: ${parsed.headers.join(', ')}`).toEqual({ rows: data.invalid, failed: data.invalid });
          expect(failed.filter((r) => resultError(parsed, r) === '').length, 'failed rows without a reason').toBe(0);
        });
      } else {
        await steps.step('The results summary separates and counts the successful and failed rows', async () => {
          expect({ succeeded: operation?.succeededRows, failed: operation?.failedRows }, operation?.errorMessage ?? '').toEqual({ succeeded: data.valid, failed: data.invalid });
        });

        await steps.step('Each row is tagged Success or Failed, the failures with their reason', async () => {
          result = await downloadImportResult(page, operationId);
          const parsed = result.parsed;
          const failed = failedResultRows(parsed);
          expect({ rows: parsed.rows.length, failed: failed.length }, `result columns: ${parsed.headers.join(', ')}`).toEqual({ rows: data.valid + data.invalid, failed: data.invalid });
          expect(failed.filter((r) => resultError(parsed, r) === '').length, 'failed rows without a reason').toBe(0);
          expect(failed.every((r) => Object.values(r).some((v) => invalid.includes(v))), 'the failed rows are the invalid ones').toBe(true);
        });
      }
    });
  }

  test(`TC-${CASES.fileType.azureId}: should refuse a .pdf with "Only .xlsx or .csv files are allowed" and accept an .xlsx file`, async ({
    formularyManagementPage,
    discardFormularyNamed,
    page,
    steps,
  }) => {
    const [name] = batchNames('Type', 1);
    discardFormularyNamed(name);
    let kit: FormularyImportKit;
    let dialog: FormularyImportDialog;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      kit = await formularyImportKit(page, formularyManagementPage);
      expect(kit.headers.length).toBeGreaterThan(0);
    });

    await steps.step('Open the Bulk Import and upload report.pdf - the file is rejected', async () => {
      await formularyManagementPage.open();
      dialog = await formularyManagementPage.openImport();
      const answer = await dialog.addFile(PDF_FILE);
      expect(answer.status, 'nothing should be sent for a .pdf').toBe(-1);
      expect(await dialog.getFileError()).toMatch(IMPORT_MESSAGE.wrongType);
    });

    await steps.step('Upload a supported .xlsx file - it is accepted and processing begins', async () => {
      const row = formularyImportRow(kit, { nameEn: name });
      const xlsx = { name: 'formularies_valid.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: buildXlsx(kit.headers, [kit.headers.map((h) => row[h] ?? '')]) };
      const started = await startImport(dialog, xlsx);
      expect(started.status, started.text.slice(0, 200)).toBeLessThan(300);
      expect(started.operationId, 'the import should start').not.toBe('');
      await waitForOperation(page, started.operationId);
    });
  });

  test(`TC-${CASES.fileSize.azureId}: should accept a file at the stated maximum size and refuse one just over it with a size message`, async ({
    formularyManagementPage,
    discardFormularyNamed,
    page,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const [name] = batchNames('Size', 1);
    discardFormularyNamed(name);
    let kit: FormularyImportKit;
    let maxBytes = NaN;
    let atMax: { name: string; mimeType: string; buffer: Buffer } = { name: '', mimeType: '', buffer: Buffer.from('') };

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      kit = await formularyImportKit(page, formularyManagementPage);
      await formularyManagementPage.open();
      const dialog = await formularyManagementPage.openImport();
      maxBytes = maxBytesOf(await dialog.getDropHint());
      expect(Number.isFinite(maxBytes), `the stated maximum ("${await dialog.getDropHint()}")`).toBe(true);
      const description = headerLike(kit.headers, /description.*(english|\(en)/i);
      expect(description, 'a description column to pad').not.toBe('');
      const base = buildCsv(kit.headers, [formularyImportRow(kit, { nameEn: name, descriptionEn: 'X' })]).length;
      atMax = { name: 'at_max.csv', mimeType: 'text/csv', buffer: buildCsv(kit.headers, [formularyImportRow(kit, { nameEn: name, descriptionEn: 'X'.repeat(maxBytes - base + 1) })]) };
      expect(atMax.buffer.length, 'the file at the maximum size').toBe(maxBytes);
      await dialog.cancel();
    });

    await steps.step('Upload a file exactly at the maximum allowed size - it is accepted and processed', async () => {
      const started = await startImport(await formularyManagementPage.openImport(), atMax);
      expect(started.status, `${started.text.slice(0, 200)} ${started.messages.join(' | ')}`).toBeLessThan(300);
      const { operation } = await waitForOperation(page, started.operationId, 8 * 60_000);
      expect(operation.status, 'the job should be processed to an end').toMatch(/Completed|CompletedWithErrors|Failed/);
    });

    await steps.step('Upload a file just over the maximum - it is rejected with a size-limit message', async () => {
      const over = { name: 'over_max.csv', mimeType: 'text/csv', buffer: Buffer.concat([atMax.buffer, Buffer.from(' ')]) };
      const dialog = await formularyManagementPage.openImport();
      const answer = await dialog.addFile(over);
      expect(answer.status, 'nothing should be sent for an oversized file').toBe(-1);
      expect(await dialog.getFileError()).toMatch(IMPORT_MESSAGE.tooLarge);
    });
  });

  test(`TC-${CASES.emptyFile.azureId}: should tell the administrator that no data rows were found instead of reporting success when the file holds only headers`, async ({
    formularyManagementPage,
    page,
    steps,
  }) => {
    let kit: FormularyImportKit;
    let started: Awaited<ReturnType<typeof startImport>>;
    let dialog: FormularyImportDialog;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      kit = await formularyImportKit(page, formularyManagementPage);
      expect(kit.headers.length).toBeGreaterThan(0);
    });

    await steps.step('Open the Bulk Import and upload the header-only file - the system processes it', async () => {
      await formularyManagementPage.open();
      dialog = await formularyManagementPage.openImport();
      started = await startImport(dialog, formularyImportFile(kit, [], 'empty_template.csv'));
      expect(started.status, 'the file should be sent to the server').toBeGreaterThan(0);
    });

    await steps.step('The result says no data rows were found and does not report success', async () => {
      if (started.status < 300 && started.operationId !== '') {
        const { operation } = await waitForOperation(page, started.operationId);
        const said = [operation.errorMessage ?? '', ...(await formularyManagementPage.waitForVisibleMessages(10_000))].join(' | ');
        expect(operation.status, 'an empty file must not complete as a success').not.toBe('Completed');
        expect(said).toMatch(IMPORT_MESSAGE.noRows);
      } else {
        expect([started.text, await dialog.getError(), ...started.messages].join(' | ')).toMatch(IMPORT_MESSAGE.noRows);
      }
    });
  });

  for (const key of ['missingField', 'duplicateTrade'] as const) {
    const data = CASES[key];
    const duplicate = key === 'duplicateTrade';
    test(duplicate
      ? `TC-${data.azureId}: should flag the repeated row with an explanatory error when one file lists the same trade code twice`
      : `TC-${data.azureId}: should fail only the row missing its trade code with a required-field message and import the valid rows`, async ({
      formularyDetailPage,
      formularyTradesTab,
      formularyIn,
      page,
      steps,
    }) => {
      const formulary = await formularyIn('Draft', { tiers: 1, trades: 0 });
      // The template's tier column is "Tier Order *" (a whole number), not the tier's name.
      const tier = String(formulary.tiers[0].tierOrder);
      const period = { from: new Date(formulary.effectiveDate), to: new Date(formulary.expiryDate) };
      const rows: TradeImportRow[] = duplicate
        ? [{ tradeCode: NEW_TRADE.code, tier, ...period }, { tradeCode: THIRD_TRADE.code, tier, ...period }, { tradeCode: NEW_TRADE.code, tier, ...period }]
        : [{ tradeCode: NEW_TRADE.code, tier, ...period }, { tradeCode: '', tier, ...period }];
      let outcome: Awaited<ReturnType<typeof tradesOutcome>>;

      await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
        await formularyDetailPage.open(formulary.id);
      });

      await steps.critical(duplicate
        ? `Upload the file listing ${NEW_TRADE.code} twice - the file uploads and processing begins`
        : 'Upload the file with a row whose Trade Code is blank - the file uploads and processing begins', async () => {
        outcome = await tradesOutcome({ formularyDetailPage, formularyTradesTab, page }, formulary.id, rows);
        expect(outcome.status).toBeLessThan(300);
        expect(outcome.operation, 'the import operation').not.toBeNull();
      });

      await steps.step(duplicate
        ? 'The duplicate occurrence is flagged with an explanatory error'
        : 'The row missing its trade code fails with a "required field missing" message and the valid rows are imported', async () => {
        const parsed = outcome.result?.parsed ?? { headers: [], rows: [] };
        const failed = failedResultRows(parsed);
        expect(failed.length, `failed rows in the result (${parsed.headers.join(', ')})`).toBe(1);
        expect(resultError(parsed, failed[0] ?? {})).toMatch(duplicate ? IMPORT_MESSAGE.duplicate : IMPORT_MESSAGE.required);
        const codes = (await readTrades(page, formulary.id)).map((t) => t.tradeCode);
        expect(codes, 'the valid rows are not blocked').toContain(NEW_TRADE.code);
        if (duplicate) expect(codes.filter((c) => c === NEW_TRADE.code).length, `${NEW_TRADE.code} applied once`).toBe(1);
      });
    });
  }

  test(`TC-${CASES.template.azureId}: should provide a template with the correct columns for formularies, tiers and trades & pricing`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyTiersTab,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.template;
    const formulary = await formularyIn('Draft', { tiers: 1, trades: 1 });

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.step('Open the Bulk Import feature - the import screen offers the template download', async () => {
      const dialog = await formularyManagementPage.openImport();
      expect(await dialog.getIntro(), 'the import screen should point to the template').toMatch(/template/i);
      await dialog.cancel();
    });

    await steps.step('Download the templates - each has the correct column headers for formularies, tiers, and trades & pricing', async () => {
      const formularies = (await formularyManagementPage.exportTemplate()).parsed.headers;
      expect(data.formularyHeaders.filter((h) => !formularies.some((x) => h.test(x))).map(String), `formulary template: ${formularies.join(', ')}`).toEqual([]);
      await formularyDetailPage.open(formulary.id);
      await formularyTiersTab.open();
      const tiers = (await formularyTiersTab.export('template')).parsed.headers;
      expect(data.tierHeaders.filter((h) => !tiers.some((x) => h.test(x))).map(String), `tiers template: ${tiers.join(', ')}`).toEqual([]);
      await formularyTradesTab.open();
      const trades = readWorkbook((await formularyTradesTab.export('template')).bytes)[0]?.headers ?? [];
      expect(data.tradeHeaders.filter((h) => !trades.some((x) => h.test(x))).map(String), `trades template: ${trades.join(', ')}`).toEqual([]);
    });
  });

  test(`TC-${CASES.exploratory.azureId}: should report the same row outcomes on the results screen and in the error file for a file of varied rows`, async ({
    formularyManagementPage,
    discardFormularyNamed,
    page,
    steps,
  }) => {
    const data = CASES.exploratory;
    // Edge-case names: "& Co" appended, or padded with spaces (the trimmed name is registered too).
    const valid = batchNames('Explore', data.valid).map((name, i) => (i % 5 === 0 ? `${name} & Co` : name));
    const invalid = batchNames('Explore Bad', data.invalid);
    const invalidName = (name: string, i: number): string => (i % 3 === 1 ? `${name} قائمة` : name);
    [...valid, ...invalid.map(invalidName)].forEach((name) => discardFormularyNamed(name));
    let kit: FormularyImportKit;
    let operation: BulkOperation | null = null;
    let operationId = '';
    let fileName = '';

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      kit = await formularyImportKit(page, formularyManagementPage);
      expect(kit.headers.length).toBeGreaterThan(0);
    });

    await steps.critical('Upload a file of valid, invalid and edge-case rows - it uploads and processing begins', async () => {
      const rows = [
        ...valid.map((nameEn, i) => formularyImportRow(kit, { nameEn: i % 5 === 1 ? `  ${nameEn}  ` : nameEn })),
        ...invalid.map((nameEn, i) => formularyImportRow(kit, i % 3 === 0
          ? { nameEn, nameAr: '' }
          : i % 3 === 1 ? { nameEn: invalidName(nameEn, i) } : { nameEn, effective: new Date(Date.now() + 10 * 86_400_000), expiry: new Date(Date.now() + 5 * 86_400_000) })),
      ];
      await formularyManagementPage.open();
      const file = formularyImportFile(kit, rows, `exploratory_mixed_${Date.now()}.csv`);
      fileName = file.name;
      const started = await startImport(await formularyManagementPage.openImport(), file);
      expect(started.status, started.text.slice(0, 200)).toBeLessThan(300);
      operationId = started.operationId;
      operation = (await waitForOperation(page, operationId)).operation;
    });

    await steps.step('The results screen and the exported error file reflect the same row outcomes', async () => {
      const total = data.valid + data.invalid;
      expect((operation?.succeededRows ?? 0) + (operation?.failedRows ?? 0), 'every row has an outcome').toBe(total);
      const result = await downloadImportResult(page, operationId);
      expect(failedResultRows(result.parsed).length, 'failed rows in the error file vs the summary').toBe(operation?.failedRows);
      const history = await (await formularyManagementPage.openImport()).readHistoryTable();
      expect(history.text, 'the job in the upload history').toContain(fileName);
      expect(history.text, 'the history shows the same failed count').toContain(String(operation?.failedRows));
      let created = 0;
      for (const batch of [batchOf(valid.map((n) => n.replace(/ & Co$/, ''))), batchOf(invalid)]) {
        created += (await listFormularyRegister(page, { searchText: batch }, 100)).items.filter((f) => f.formularyNameEn.startsWith(SUITE_FORMULARY_PREFIX)).length;
      }
      expect(created, 'formularies created vs the summary').toBe(operation?.succeededRows);
    });
  });

  test(`TC-${CASES.approvedUpdate.azureId}: should refuse to change an approved formulary through bulk import with a validation message`, async ({
    formularyManagementPage,
    discardFormularyNamed,
    formularyIn,
    page,
    steps,
  }) => {
    const formulary = await formularyIn('Future');
    const [changedName] = batchNames(CASES.approvedUpdate.changedName, 1);
    discardFormularyNamed(changedName);
    let kit: FormularyImportKit;

    await steps.critical(`Navigate to the Formulary Management module - the approved formulary ${formulary.code} is listed`, async () => {
      await formularyManagementPage.open();
      kit = await formularyImportKit(page, formularyManagementPage);
      expect(formulary.code ?? '', 'the approved formulary\'s code').not.toBe('');
    });

    await steps.step('Updating the approved formulary through bulk import is prevented with a message that it cannot be edited', async () => {
      await formularyManagementPage.open();
      const row = formularyImportRow(kit, {
        code: formulary.code ?? '',
        nameEn: changedName,
        nameAr: 'اسم معدل',
        descriptionEn: 'Changed through bulk import',
        effective: new Date(Date.now() + 5 * 86_400_000),
        expiry: new Date(Date.now() + 500 * 86_400_000),
      });
      const started = await startImport(await formularyManagementPage.openImport(), formularyImportFile(kit, [row], 'approved_update.csv'));
      let said = [started.text, ...started.messages].join(' | ');
      if (started.status < 300 && started.operationId !== '') {
        const { operation } = await waitForOperation(page, started.operationId);
        const result = await downloadImportResult(page, started.operationId);
        said = [operation.errorMessage ?? '', ...failedResultRows(result.parsed).map((r) => resultError(result.parsed, r))].join(' | ');
        const applied = await readFormulary(page, formulary.id);
        const created = await findFormularyByName(page, changedName);
        expect(operation.failedRows, `the row must not be applied (created ${operation.createdRows}, updated ${operation.updatedRows}; `
          + `${formulary.code} now "${applied.formularyNameEn}"; new formulary from the row: ${created ? 'yes' : 'no'})`).toBe(1);
      }
      expect(said).toMatch(IMPORT_MESSAGE.approvedLocked);
      const after = await readFormulary(page, formulary.id);
      expect({ nameEn: after.formularyNameEn, effectiveDate: after.effectiveDate }).toEqual({ nameEn: formulary.nameEn, effectiveDate: formulary.effectiveDate });
      expect(await findFormularyByName(page, changedName), 'no formulary may be created from the row').toBeNull();
    });
  });

  test(`TC-${CASES.selectedExport.azureId}: should export only the selected formulary's, tiers' and trades' data in the expected format`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyTiersTab,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.selectedExport;
    const formulary = await formularyIn('Draft', { tiers: data.tiers, trades: data.trades });

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.step('Export the selected formulary data - only the selected formulary is exported, as CSV', async () => {
      await formularyManagementPage.search(formulary.nameEn);
      const file = await formularyManagementPage.exportAndParse('selected', 'csv');
      const name = headerLike(file.parsed.headers, /name.*(english|en\b)|^name/i);
      expect(file.filename).toMatch(/\.csv$/i);
      expect(file.parsed.rows.map((r) => r[name]), 'the exported formularies').toEqual([formulary.nameEn]);
      expect(file.parsed.rows[0]?.[headerLike(file.parsed.headers, /payer/i)] ?? '', 'its payer').not.toBe('');
    });

    await steps.step('Export the tier data - only this formulary\'s tiers are exported in the expected format', async () => {
      await formularyDetailPage.open(formulary.id);
      await formularyTiersTab.open();
      const file = await formularyTiersTab.export('csv');
      const name = headerLike(file.parsed.headers, /name.*(english|\(en)|^tier name/i);
      expect(file.filename).toMatch(/\.csv$/i);
      expect(file.parsed.rows.map((r) => r[name]).sort()).toEqual(formulary.tiers.map((t) => t.tierNameEn).sort());
    });

    await steps.step('Export the trade data - only this formulary\'s trades are exported in the expected format', async () => {
      await formularyTradesTab.open();
      const file = await formularyTradesTab.export('excel');
      const code = headerLike(file.parsed.headers, /trade.*code|code/i);
      expect(file.filename).toMatch(/\.xlsx$/i);
      // The trade column reads "<name> - <code>" ("Amoxicillin 250mg - MED-002", 2026-11-02): the code is its last part.
      const codeOf = (cell: string): string => (cell ?? '').split(' - ').pop()?.trim() ?? '';
      expect(file.parsed.rows.map((r) => codeOf(r[code])).sort()).toEqual(formulary.trades.map((t) => t.tradeCode).sort());
    });
  });
});
