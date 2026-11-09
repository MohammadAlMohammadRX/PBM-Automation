import { test, expect } from '../../../utils/member/writerAHelpers';
import type { Page } from '@playwright/test';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { MemberManagementPage } from '../../../pages/member/MemberManagementPage';
import type { MemberImportDrawer } from '../../../pages/member/MemberImportDrawer';
import type { ParsedCsv } from '../../../utils/CsvUtils';
import { MEMBER_LIST } from '../../../constants/member/memberIds';
import { CASES, ERROR_TEXT, UPDATE_CHANGES } from '../../../data/member/memberBulkImport.data';
import {
  findMemberByDocumentId,
  listMemberRegister,
  memberStamp,
  readImportHistory,
  readMember,
  suiteImportRow,
  suiteMobileNumber,
  type ProvisionedMember,
} from '../../../utils/MemberProvisioning';
import {
  addImportFile,
  cellOf,
  csvUpload,
  documentIdsOf,
  errorOf,
  finishImport,
  historyRowFor,
  importRows,
  importedName,
  membersWithDocumentId,
  opNumber,
  operationStatusOf,
  resultRowFor,
  resultRows,
  watchImport,
  type ImportRow,
} from '../../../utils/member/writerAHelpers';

const STARTED = /^(pending|queued|running|processing)$/i;
const fileName = (label: string): string => `qa-member-${label}-${memberStamp()}.csv`;

/** An update row for one of the case's members: same identity, a new mobile number and building number. */
async function updateRowFor(page: Page, member: ProvisionedMember, mobileNumber: string): Promise<ImportRow> {
  return suiteImportRow(page, {
    'Member Code': member.code,
    'Last Name (English) *': member.lastName,
    'Last Name (Arabic) *': String(member.record.arabicLastName ?? ''),
    'Document ID *': member.documentId,
    'Email *': member.email,
    'Date of Birth *': String(member.record.dateOfBirth ?? '').slice(0, 10),
    'Hijri Date of Birth': String(member.record.hijriDateOfBirth ?? ''),
    'Mobile Number *': mobileNumber,
    'Building Number': UPDATE_CHANGES.buildingNumber,
  });
}

/** Steps 1-2 of every case: the module, then the Import drawer. */
async function openImportSteps({ list, steps }: { list: MemberManagementPage; steps: TestSteps }): Promise<{ drawer: () => MemberImportDrawer }> {
  let drawer!: MemberImportDrawer;
  await steps.critical('Navigate to the Member Management module - the module home page loads with the member list and import options', async () => {
    await list.openTable();
    expect(await list.isImportOffered(), 'the Import button').toBe(true);
  });
  await steps.critical('Select the "Bulk Import Members" option (Import) - the file upload dialog opens', async () => {
    drawer = await list.openImport();
    expect(await drawer.getAccept(), 'the file input accepts').toMatch(/csv/i);
  });
  return { drawer: () => drawer };
}

/** Upload history row + result (error) file of an import, read through the screen. */
async function readResults(list: MemberManagementPage, drawer: MemberImportDrawer, name: string): Promise<{ row: Record<string, string> | null; text: string; result: ParsedCsv | null }> {
  const { row, text } = await historyRowFor(list, drawer, name);
  let result: ParsedCsv | null = null;
  if (row) {
    const file = await drawer.downloadResult(row.rowId, 'csv').catch(() => null);
    result = file ? resultRows(file.bytes) : null;
  }
  return { row, text, result };
}

/**
 * User story 17727: Member Bulk import.
 * Adding and updating members from a file, mixed files, row errors (invalid
 * data, missing fields, formats, duplicates, age rules), telling successful from
 * failed rows, the error file, empty and unsupported files, and the import's
 * states. The permission case is in bulk-import-permission.spec.ts. See the data
 * file for how the cases map onto the live screen.
 */
test.describe('US 17727 - Member Bulk import', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.updateExisting.azureId}: should update every matched member from a valid file with zero failures`, async ({
    memberManagementPage: list,
    memberDetailPage: detail,
    memberIn,
    page,
    steps,
  }) => {
    const members: ProvisionedMember[] = [];
    for (let i = 0; i < CASES.updateExisting.rows; i += 1) members.push(await memberIn('Active'));
    const mobiles = members.map(() => suiteMobileNumber());
    const rows: ImportRow[] = [];
    for (let i = 0; i < members.length; i += 1) rows.push(await updateRowFor(page, members[i], mobiles[i]));
    const name = fileName('update');
    const { drawer } = await openImportSteps({ list, steps });
    let operationId: string | null = null;

    await steps.critical('Upload the file with updated data for existing members (matched by member ID) - the file is accepted and processing begins', async () => {
      const answer = await addImportFile(drawer(), csvUpload(name, rows));
      operationId = answer.operationId;
      expect({ status: answer.status, operation: operationId !== null, state: operationStatusOf(answer.text) }, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`)
        .toEqual({ status: 200, operation: true, state: expect.stringMatching(STARTED) });
    });

    await steps.step(`Wait for processing to complete - the summary shows ${rows.length} rows updated with zero failures`, async () => {
      const op = await finishImport(page, operationId);
      const { row } = await historyRowFor(list, drawer(), name);
      expect({ status: String(op.status), updated: opNumber(op, 'updatedRows'), failed: opNumber(op, 'failedRows'), historyFailed: cellOf(row, /fail/i) }, JSON.stringify(op))
        .toEqual({ status: 'Completed', updated: rows.length, failed: 0, historyFailed: '0' });
    });

    await steps.step(`Open one of the updated members ("${members[0].displayNameEn}") - the record shows the new values from the file`, async () => {
      await detail.open(members[0].id);
      const strip = await detail.readHeaderStrip();
      const record = await readMember(page, members[0].id);
      expect({ mobile: strip.mobileNumber.replace(/\D/g, '').endsWith(mobiles[0]), building: record.buildingNumber })
        .toEqual({ mobile: true, building: UPDATE_CHANGES.buildingNumber });
    });
  });

  test(`TC-${CASES.addNew.azureId}: should create every new member of a valid file and list it with the uploaded details`, async ({
    memberManagementPage: list,
    importCleanup,
    page,
    steps,
  }) => {
    const rows = await importRows(page, CASES.addNew.rows);
    importCleanup(documentIdsOf(rows));
    const name = fileName('add');
    const { drawer } = await openImportSteps({ list, steps });
    let operationId: string | null = null;

    await steps.critical('Choose a valid file of new members (adding it starts the upload) - the file is accepted and a progress indicator is shown', async () => {
      const banner = page.locator(`#${MEMBER_LIST.bulkLock}`).waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
      const answer = await addImportFile(drawer(), csvUpload(name, rows));
      operationId = answer.operationId;
      expect({ status: answer.status, state: operationStatusOf(answer.text), progressShown: await banner }, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`)
        .toEqual({ status: 200, state: expect.stringMatching(STARTED), progressShown: true });
    });

    await steps.step(`Wait for processing to complete - the summary shows ${rows.length} rows processed, ${rows.length} added and zero failures`, async () => {
      const op = await finishImport(page, operationId);
      const { row } = await historyRowFor(list, drawer(), name);
      expect({ total: opNumber(op, 'totalRows'), added: opNumber(op, 'createdRows'), failed: opNumber(op, 'failedRows'), history: [cellOf(row, /total/i), cellOf(row, /succe/i), cellOf(row, /fail/i)] }, JSON.stringify(op))
        .toEqual({ total: rows.length, added: rows.length, failed: 0, history: [String(rows.length), String(rows.length), '0'] });
    });

    await steps.step('Open the member list and search for one of the imported members - it is listed with the details of the file', async () => {
      await list.openTable();
      const row = rows[0];
      const shown = await list.readRow(importedName(row));
      expect({ documentId: shown.documentId, mobile: shown.mobileNumber.replace(/\D/g, '').endsWith(row['Mobile Number *']), status: shown.status })
        .toEqual({ documentId: row['Document ID *'], mobile: true, status: 'Active' });
    });
  });

  test(`TC-${CASES.mixed.azureId}: should add the new rows and update the existing ones of one file, reporting added and updated separately`, async ({
    memberManagementPage: list,
    memberImportDrawer: importDrawer,
    memberIn,
    importCleanup,
    page,
    steps,
  }) => {
    const data = CASES.mixed;
    const existing: ProvisionedMember[] = [];
    for (let i = 0; i < data.updated; i += 1) existing.push(await memberIn('Active'));
    const mobile = suiteMobileNumber();
    const fresh = await importRows(page, data.added);
    importCleanup(documentIdsOf(fresh));
    const rows: ImportRow[] = [...fresh];
    for (const member of existing) rows.push(await updateRowFor(page, member, member === existing[0] ? mobile : member.mobileNumber));
    const name = fileName('mixed');
    let operationId: string | null = null;

    await steps.critical('Navigate to the Member Management module - the module home page loads', async () => {
      await list.openTable();
      expect(await list.isImportOffered()).toBe(true);
    });

    await steps.critical(`Select "Bulk Import Members" and upload a file of ${data.added} new rows and ${data.updated} existing-member rows - the file is accepted`, async () => {
      const drawer = await list.openImport();
      const answer = await addImportFile(drawer, csvUpload(name, rows));
      operationId = answer.operationId;
      expect({ status: answer.status, operation: operationId !== null }, answer.text.slice(0, 200)).toEqual({ status: 200, operation: true });
    });

    await steps.step('Wait for processing to complete - the summary reports the Added and Updated counts separately', async () => {
      const op = await finishImport(page, operationId);
      const { text } = await historyRowFor(list, importDrawer, name);
      expect({ added: opNumber(op, 'createdRows'), updated: opNumber(op, 'updatedRows'), screenAdded: /\b(added|created)\b/i.test(text), screenUpdated: /\bupdated\b/i.test(text) }, `${JSON.stringify(op)} - screen: ${text.slice(0, 300)}`)
        .toEqual({ added: data.added, updated: data.updated, screenAdded: true, screenUpdated: true });
    });

    await steps.step('Verify a new member of the file - it was created as a new member', async () => {
      const found = await findMemberByDocumentId(page, fresh[0]['Document ID *']);
      expect({ created: found?.displayNameEn ?? null }).toEqual({ created: importedName(fresh[0]) });
    });

    await steps.step(`Verify an existing member targeted for update ("${existing[0].displayNameEn}") - it shows the updated values and no duplicate was created`, async () => {
      const record = await readMember(page, existing[0].id);
      const holders = await membersWithDocumentId(page, existing[0].documentId);
      expect({ mobile: record.mobileNumber, building: record.buildingNumber, records: holders.length }).toEqual({ mobile, building: UPDATE_CHANGES.buildingNumber, records: 1 });
    });
  });

  test(`TC-${CASES.invalidData.azureId}: should describe each invalid row's error and still process the valid rows`, async ({
    memberManagementPage: list,
    importCleanup,
    page,
    steps,
  }) => {
    const data = CASES.invalidData;
    const rows = await importRows(page, data.rows, (i) => (
      i + 1 === data.badDateRow ? { 'Date of Birth *': data.badDate, 'Hijri Date of Birth': '' }
        : i + 1 === data.badGenderRow ? { 'Gender *': data.badGender } : {}));
    importCleanup(documentIdsOf(rows));
    const bad = [rows[data.badDateRow - 1], rows[data.badGenderRow - 1]];
    const valid = rows.filter((r) => !bad.includes(r));
    const name = fileName('invalid');
    const { drawer } = await openImportSteps({ list, steps });
    let operationId: string | null = null;
    let result: ParsedCsv | null = null;

    await steps.critical(`Upload the file whose row ${data.badDateRow} has Date of Birth "${data.badDate}" and row ${data.badGenderRow} Gender "${data.badGender}" - the file is accepted and processing starts`, async () => {
      const answer = await addImportFile(drawer(), csvUpload(name, rows));
      operationId = answer.operationId;
      expect({ status: answer.status, operation: operationId !== null }, answer.text.slice(0, 200)).toEqual({ status: 200, operation: true });
    });

    await steps.step('Wait for processing to complete - the summary shows the failed rows alongside the successful ones', async () => {
      const op = await finishImport(page, operationId);
      const read = await readResults(list, drawer(), name);
      result = read.result;
      expect({ failed: opNumber(op, 'failedRows'), succeeded: opNumber(op, 'succeededRows'), historyFailed: cellOf(read.row, /fail/i) }, JSON.stringify(op))
        .toEqual({ failed: bad.length, succeeded: valid.length, historyFailed: String(bad.length) });
    });

    await steps.step('Review the error details of the failed rows - a clear, row-specific message explains each failure', async () => {
      const dateError = errorOf(result ? resultRowFor(result, bad[0]['Document ID *']) : undefined);
      const genderError = errorOf(result ? resultRowFor(result, bad[1]['Document ID *']) : undefined);
      expect({ dateRow: ERROR_TEXT.dateOfBirth.test(dateError), genderRow: ERROR_TEXT.gender.test(genderError) }, `row ${data.badDateRow}: "${dateError}" - row ${data.badGenderRow}: "${genderError}"`)
        .toEqual({ dateRow: true, genderRow: true });
    });

    await steps.step('Confirm the valid rows of the same file - they were processed successfully, independent of the failed rows', async () => {
      const created: boolean[] = [];
      for (const row of valid) created.push((await findMemberByDocumentId(page, row['Document ID *'])) !== null);
      expect(created).toEqual(valid.map(() => true));
    });
  });

  test(`TC-${CASES.distinguishRows.azureId}: should mark every row of an import as successful or failed and match the summary`, async ({
    memberManagementPage: list,
    memberImportDrawer: importDrawer,
    importCleanup,
    page,
    steps,
  }) => {
    const data = CASES.distinguishRows;
    const invalid = [{ 'Email *': 'not-an-email' }, { 'Document ID *': 'ABC' }, { 'Date of Birth *': '2030-01-01', 'Hijri Date of Birth': '' }];
    const rows = await importRows(page, data.valid + data.invalid, (i) => (i >= data.valid ? invalid[i - data.valid] : {}));
    importCleanup(documentIdsOf(rows));
    const name = fileName('mixed-outcome');
    let operationId: string | null = null;
    let result: ParsedCsv | null = null;
    let row: Record<string, string> | null = null;

    await steps.critical('Navigate to the Member Management module - the module home page loads', async () => {
      await list.openTable();
      expect(await list.isImportOffered()).toBe(true);
    });

    await steps.critical(`Upload a file of ${data.valid} valid and ${data.invalid} invalid rows - the file is accepted`, async () => {
      const drawer = await list.openImport();
      const answer = await addImportFile(drawer, csvUpload(name, rows));
      operationId = answer.operationId;
      expect({ status: answer.status, operation: operationId !== null }, answer.text.slice(0, 200)).toEqual({ status: 200, operation: true });
    });

    await steps.step('Wait for processing to complete - the results show a Success / Failed status for every row of the file', async () => {
      await finishImport(page, operationId);
      const read = await readResults(list, importDrawer, name);
      result = read.result;
      row = read.row;
      const statusHeader = (result?.headers ?? []).find((h) => /status|result|outcome/i.test(h)) ?? '';
      expect({ listed: result?.rows.length ?? 0, statusColumn: statusHeader !== '' }, `result headers: ${(result?.headers ?? []).join(', ')}`)
        .toEqual({ listed: rows.length, statusColumn: true });
    });

    await steps.step('Filter or sort the results by status - successful and failed rows are grouped and each is identifiable by its row number', async () => {
      const rowHeader = (result?.headers ?? []).find((h) => /^row( number| #|no\.?)?$/i.test(h.trim())) ?? '';
      expect({ rowNumbers: rowHeader !== '' }, `result headers: ${(result?.headers ?? []).join(', ')}`).toEqual({ rowNumbers: true });
    });

    await steps.step(`Cross-check the summary with the detailed rows - ${data.valid} successful and ${data.invalid} failed match exactly`, async () => {
      const failedListed = (result?.rows ?? []).filter((r) => errorOf(r) !== '').length;
      expect({ succeeded: cellOf(row, /succe/i), failed: cellOf(row, /fail/i), failedListed })
        .toEqual({ succeeded: String(data.valid), failed: String(data.invalid), failedListed: data.invalid });
    });
  });

  test(`TC-${CASES.errorFile.azureId}: should offer an error file listing exactly the failed rows with their reasons`, async ({
    memberManagementPage: list,
    importCleanup,
    page,
    steps,
  }) => {
    const data = CASES.errorFile;
    const invalid = [{ 'Email *': 'not-an-email' }, { 'Document ID *': 'ABC' }];
    const rows = await importRows(page, data.valid + data.invalid, (i) => (i >= data.valid ? invalid[i - data.valid] : {}));
    importCleanup(documentIdsOf(rows));
    const failedDocs = rows.slice(data.valid).map((r) => r['Document ID *']);
    const name = fileName('error-file');
    const { drawer } = await openImportSteps({ list, steps });
    let operationId: string | null = null;
    let historyRow: Record<string, string> | null = null;
    let result: ParsedCsv | null = null;

    await steps.critical('Upload a file of valid and invalid rows - the file is accepted and processed', async () => {
      const answer = await addImportFile(drawer(), csvUpload(name, rows));
      operationId = answer.operationId;
      expect({ status: answer.status, operation: operationId !== null }, answer.text.slice(0, 200)).toEqual({ status: 200, operation: true });
    });

    await steps.critical('Wait for processing to complete - the results show a "Download Error File" option, enabled', async () => {
      await finishImport(page, operationId);
      historyRow = (await historyRowFor(list, drawer(), name)).row;
      const run = (await readImportHistory(page, 50)).items.find((r) => r.fileName === name);
      expect({ row: historyRow !== null, downloadable: run?.canDownloadResult === true && run.hasResultFile }).toEqual({ row: true, downloadable: true });
    });

    await steps.step('Click "Download Error File" - an error file downloads with only the failed rows and their reasons', async () => {
      const file = await drawer().downloadResult((historyRow as unknown as Record<string, string>).rowId, 'csv');
      result = resultRows(file.bytes);
      const docs = result.rows.map((r) => r[result?.headers.find((h) => /^document id/i.test(h)) ?? ''] ?? '');
      expect({ name: file.filename, rows: result.rows.length, docs: docs.sort() }, `headers: ${result.headers.join(', ')}`)
        .toEqual({ name: expect.stringMatching(/\.csv$/i), rows: data.invalid, docs: [...failedDocs].sort() });
    });

    await steps.step('Open the downloaded error file - each failed row is listed with a description of why it failed', async () => {
      const reasons = (result?.rows ?? []).map((r) => errorOf(r));
      expect({ rows: reasons.length, described: reasons.every((r) => r.length > 5) }, reasons.join(' || ')).toEqual({ rows: data.invalid, described: true });
    });
  });

  test(`TC-${CASES.emptyFile.azureId}: should import nothing and say so when the file has headers only`, async ({
    memberManagementPage: list,
    page,
    steps,
  }) => {
    const data = CASES.emptyFile;
    const name = fileName('empty');
    const { drawer } = await openImportSteps({ list, steps });
    let before = -1;
    let said = '';
    let total = -1;

    await steps.critical('Upload a file with a header row and no data rows - the file is accepted for upload', async () => {
      before = (await listMemberRegister(page, {}, 1)).totalRows;
      const answer = await addImportFile(drawer(), csvUpload(name, []));
      said = `${answer.text} ${answer.messages.join(' | ')}`;
      if (answer.operationId) {
        const op = await finishImport(page, answer.operationId);
        total = opNumber(op, 'totalRows');
        said += ` ${String(op.errorMessage ?? op.ErrorMessage ?? '')} ${String(op.status)}`;
      }
      expect(answer.status, said.slice(0, 300)).not.toBe(-1);
    });

    await steps.step('Submit the file for processing - the system detects there are no data rows', async () => {
      expect({ noRows: total <= 0 }, said.slice(0, 300)).toEqual({ noRows: true });
    });

    await steps.step('Review the result message - it states that no member records were found and nothing was imported', async () => {
      const messages = await drawer().getMessages();
      const text = `${said} ${messages.join(' | ')}`;
      expect({ message: data.message.test(text), unchanged: (await listMemberRegister(page, {}, 1)).totalRows }, text.slice(0, 400))
        .toEqual({ message: true, unchanged: before });
    });
  });

  test(`TC-${CASES.missingMandatory.azureId}: should reject each row missing a mandatory field with a field-specific message`, async ({
    memberManagementPage: list,
    importCleanup,
    page,
    steps,
  }) => {
    const data = CASES.missingMandatory;
    const rows = await importRows(page, data.rows, (i) => (
      i + 1 === data.blankNameRow ? { 'Last Name (English) *': '' }
        : i + 1 === data.blankDobRow ? { 'Date of Birth *': '', 'Hijri Date of Birth': '' } : {}));
    importCleanup(documentIdsOf(rows));
    const name = fileName('missing');
    const { drawer } = await openImportSteps({ list, steps });
    let operationId: string | null = null;
    let result: ParsedCsv | null = null;

    await steps.critical(`Upload a file whose row ${data.blankNameRow} has a blank Member Name and row ${data.blankDobRow} a blank Date of Birth - the file is accepted`, async () => {
      const answer = await addImportFile(drawer(), csvUpload(name, rows));
      operationId = answer.operationId;
      expect({ status: answer.status, operation: operationId !== null }, answer.text.slice(0, 200)).toEqual({ status: 200, operation: true });
    });

    await steps.step('Wait for processing to complete - the summary reports 2 failed rows', async () => {
      const op = await finishImport(page, operationId);
      const read = await readResults(list, drawer(), name);
      result = read.result;
      expect({ failed: opNumber(op, 'failedRows'), historyFailed: cellOf(read.row, /fail/i) }, JSON.stringify(op)).toEqual({ failed: 2, historyFailed: '2' });
    });

    await steps.step(`Review the error of row ${data.blankNameRow} - it says the Member Name is required`, async () => {
      const error = errorOf(result ? resultRowFor(result, rows[data.blankNameRow - 1]['Document ID *']) : undefined);
      expect({ field: ERROR_TEXT.lastName.test(error), required: ERROR_TEXT.required.test(error) }, `"${error}"`).toEqual({ field: true, required: true });
    });

    await steps.step(`Review the error of row ${data.blankDobRow} - it says the Date of Birth is required`, async () => {
      const error = errorOf(result ? resultRowFor(result, rows[data.blankDobRow - 1]['Document ID *']) : undefined);
      expect({ field: ERROR_TEXT.dateOfBirth.test(error), required: ERROR_TEXT.required.test(error) }, `"${error}"`).toEqual({ field: true, required: true });
    });
  });

  test(`TC-${CASES.badFormats.azureId}: should reject rows with a malformed e-mail or phone number with format-specific messages`, async ({
    memberManagementPage: list,
    importCleanup,
    page,
    steps,
  }) => {
    const data = CASES.badFormats;
    const rows = await importRows(page, data.rows, (i) => (
      i + 1 === data.badEmailRow ? { 'Email *': data.badEmail }
        : i + 1 === data.badPhoneRow ? { 'Mobile Number *': data.badPhone } : {}));
    importCleanup(documentIdsOf(rows));
    const name = fileName('formats');
    const { drawer } = await openImportSteps({ list, steps });
    let operationId: string | null = null;
    let result: ParsedCsv | null = null;

    await steps.critical(`Upload a file whose row ${data.badEmailRow} has e-mail "${data.badEmail}" and row ${data.badPhoneRow} phone "${data.badPhone}" - the file is accepted`, async () => {
      const answer = await addImportFile(drawer(), csvUpload(name, rows));
      operationId = answer.operationId;
      expect({ status: answer.status, operation: operationId !== null }, answer.text.slice(0, 200)).toEqual({ status: 200, operation: true });
    });

    await steps.step(`Wait for processing to complete - the summary reports failures for rows ${data.badEmailRow} and ${data.badPhoneRow}`, async () => {
      const op = await finishImport(page, operationId);
      result = (await readResults(list, drawer(), name)).result;
      const failedDocs = (result?.rows ?? []).map((r) => r[result?.headers.find((h) => /^document id/i.test(h)) ?? ''] ?? '');
      expect({ failed: opNumber(op, 'failedRows'), emailRow: failedDocs.includes(rows[data.badEmailRow - 1]['Document ID *']), phoneRow: failedDocs.includes(rows[data.badPhoneRow - 1]['Document ID *']) }, JSON.stringify(op))
        .toEqual({ failed: 2, emailRow: true, phoneRow: true });
    });

    await steps.step(`Review the error of row ${data.badEmailRow} - it states the e-mail format is invalid`, async () => {
      const error = errorOf(result ? resultRowFor(result, rows[data.badEmailRow - 1]['Document ID *']) : undefined);
      expect({ field: ERROR_TEXT.email.test(error), invalid: ERROR_TEXT.invalid.test(error) }, `"${error}"`).toEqual({ field: true, invalid: true });
    });

    await steps.step(`Review the error of row ${data.badPhoneRow} - it states the phone number format is invalid`, async () => {
      const error = errorOf(result ? resultRowFor(result, rows[data.badPhoneRow - 1]['Document ID *']) : undefined);
      expect({ field: ERROR_TEXT.phone.test(error), invalid: ERROR_TEXT.invalid.test(error) }, `"${error}"`).toEqual({ field: true, invalid: true });
    });
  });

  test(`TC-${CASES.duplicateInFile.azureId}: should create only one member when two rows of a file share an identifier`, async ({
    memberManagementPage: list,
    importCleanup,
    page,
    steps,
  }) => {
    const data = CASES.duplicateInFile;
    const rows = await importRows(page, data.rows);
    rows[data.secondRow - 1]['Document ID *'] = rows[data.firstRow - 1]['Document ID *'];
    const duplicate = rows[data.firstRow - 1]['Document ID *'];
    importCleanup(documentIdsOf(rows));
    const name = fileName('duplicate');
    const { drawer } = await openImportSteps({ list, steps });
    let operationId: string | null = null;
    let result: ParsedCsv | null = null;

    await steps.critical(`Upload a file whose rows ${data.firstRow} and ${data.secondRow} share the Document ID ${duplicate} - the file is accepted`, async () => {
      const answer = await addImportFile(drawer(), csvUpload(name, rows));
      operationId = answer.operationId;
      expect({ status: answer.status, operation: operationId !== null }, answer.text.slice(0, 200)).toEqual({ status: 200, operation: true });
    });

    await steps.step('Wait for processing to complete - the summary reports one of the duplicate rows as failed', async () => {
      const op = await finishImport(page, operationId);
      result = (await readResults(list, drawer(), name)).result;
      expect({ failed: opNumber(op, 'failedRows'), inErrorFile: result ? resultRowFor(result, duplicate) !== undefined : false }, JSON.stringify(op))
        .toEqual({ failed: 1, inErrorFile: true });
    });

    await steps.step('Review the error of the failed duplicate row - it was rejected for duplicating another row\'s identifier in the file', async () => {
      const error = errorOf(result ? resultRowFor(result, duplicate) : undefined);
      expect(error).toMatch(ERROR_TEXT.duplicate);
    });

    await steps.step('Verify the member list - only one member holds that identifier', async () => {
      expect((await membersWithDocumentId(page, duplicate)).length).toBe(1);
    });
  });

  test(`TC-${CASES.unsupportedType.azureId}: should reject PDF and EXE files before processing and name the supported types`, async ({
    memberManagementPage: list,
    page,
    steps,
  }) => {
    const data = CASES.unsupportedType;
    const pdf = { name: `member_list-${memberStamp()}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% QA automation - not a member file\n%%EOF\n') };
    const exe = { name: `script-${memberStamp()}.exe`, mimeType: 'application/octet-stream', buffer: Buffer.from('MZ QA automation placeholder - not an executable') };
    const { drawer } = await openImportSteps({ list, steps });
    let pdfMessages: string[] = [];

    await steps.step('Attempt to upload a .pdf file - the file is rejected before or right after selection', async () => {
      const answer = await addImportFile(drawer(), pdf);
      pdfMessages = [...answer.messages, await drawer().getFileError()].filter((m) => m !== '');
      expect({ refused: answer.status === -1 || answer.status >= 400 }, `ImportMembers ${answer.status} ${answer.text.slice(0, 200)}`).toEqual({ refused: true });
    });

    await steps.step('Review the message - it states only the supported file types (.csv, .xlsx) are accepted', async () => {
      expect(pdfMessages.some((m) => data.typeMessage.test(m)), pdfMessages.join(' | ')).toBe(true);
    });

    await steps.step('Attempt to upload a .exe file - it is rejected with the same type message', async () => {
      if (!(await drawer().isOpen())) await list.openImport();
      const answer = await addImportFile(drawer(), exe);
      const messages = [...answer.messages, await drawer().getFileError()].filter((m) => m !== '');
      expect({ refused: answer.status === -1 || answer.status >= 400, message: messages.some((m) => data.typeMessage.test(m)) }, messages.join(' | '))
        .toEqual({ refused: true, message: true });
    });

    await steps.step('Confirm no processing summary appears - the upload screen stays and no member data is affected', async () => {
      const runs = (await readImportHistory(page, 50)).items.filter((r) => r.fileName === pdf.name || r.fileName === exe.name);
      expect({ drawerOpen: await drawer().isOpen(), runs: runs.length }).toEqual({ drawerOpen: true, runs: 0 });
    });
  });

  test(`TC-${CASES.stateFlow.azureId}: should move an import through uploading, processing and completed, then allow a fresh import`, async ({
    memberManagementPage: list,
    importCleanup,
    page,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const data = CASES.stateFlow;
    const rows = await importRows(page, data.rows);
    const second = await importRows(page, data.secondRows);
    importCleanup([...documentIdsOf(rows), ...documentIdsOf(second)]);
    const name = fileName('states');
    const { drawer } = await openImportSteps({ list, steps });
    let operationId: string | null = null;
    let watched: { seen: string[]; last: Record<string, unknown> } = { seen: [], last: {} };

    await steps.critical(`Upload the valid ${data.rows}-row file - the import enters an uploading state with a progress indicator`, async () => {
      const banner = page.locator(`#${MEMBER_LIST.bulkLock}`).waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
      const answer = await addImportFile(drawer(), csvUpload(name, rows));
      operationId = answer.operationId;
      expect({ status: answer.status, state: operationStatusOf(answer.text), progressShown: await banner }, answer.text.slice(0, 200))
        .toEqual({ status: 200, state: expect.stringMatching(STARTED), progressShown: true });
    });

    await steps.step('Observe the state once the upload completes - the import moves to a processing state', async () => {
      watched = await watchImport(page, operationId as unknown as string);
      expect(watched.seen.some((s) => /running|processing/i.test(s)), `states seen: ${watched.seen.join(' -> ')}`).toBe(true);
    });

    await steps.step('Wait for processing to finish - the import is Completed with its summary of added / updated / failed rows', async () => {
      const { row } = await historyRowFor(list, drawer(), name);
      expect({ status: String(watched.last.status), added: opNumber(watched.last, 'createdRows'), failed: opNumber(watched.last, 'failedRows'), history: cellOf(row, /status/i) }, JSON.stringify(watched.last))
        .toEqual({ status: 'Completed', added: data.rows, failed: 0, history: expect.stringMatching(/completed/i) });
    });

    await steps.step('Upload a new file while the completed import is shown - a fresh import cycle starts at uploading', async () => {
      await list.openTable();
      const again = await list.openImport();
      const answer = await addImportFile(again, csvUpload(fileName('states-again'), second));
      const op = answer.operationId ? await finishImport(page, answer.operationId) : {};
      expect({ status: answer.status, fresh: answer.operationId !== null && answer.operationId !== operationId, state: operationStatusOf(answer.text), final: String(op.status ?? '') })
        .toEqual({ status: 200, fresh: true, state: expect.stringMatching(STARTED), final: 'Completed' });
    });
  });

  test(`TC-${CASES.ageRules.azureId}: should reject rows with a future birth date or an impossible age with business-rule messages`, async ({
    memberManagementPage: list,
    importCleanup,
    page,
    steps,
  }) => {
    const data = CASES.ageRules;
    const rows = await importRows(page, data.rows, (i) => (
      i + 1 === data.futureRow ? { 'Date of Birth *': data.futureDob, 'Hijri Date of Birth': '' }
        : i + 1 === data.oldRow ? { 'Date of Birth *': data.oldDob, 'Hijri Date of Birth': '' } : {}));
    importCleanup(documentIdsOf(rows));
    const future = rows[data.futureRow - 1];
    const old = rows[data.oldRow - 1];
    const name = fileName('age');
    const { drawer } = await openImportSteps({ list, steps });
    let operationId: string | null = null;
    let result: ParsedCsv | null = null;

    await steps.critical(`Upload a file whose row ${data.futureRow} is born ${data.futureDob} and row ${data.oldRow} ${data.oldDob} - the file is accepted`, async () => {
      const answer = await addImportFile(drawer(), csvUpload(name, rows));
      operationId = answer.operationId;
      expect({ status: answer.status, operation: operationId !== null }, answer.text.slice(0, 200)).toEqual({ status: 200, operation: true });
    });

    await steps.step(`Wait for processing to complete - the summary reports rows ${data.futureRow} and ${data.oldRow} as failed`, async () => {
      const op = await finishImport(page, operationId);
      result = (await readResults(list, drawer(), name)).result;
      expect({
        failed: opNumber(op, 'failedRows'),
        futureRow: result ? resultRowFor(result, future['Document ID *']) !== undefined : false,
        oldRow: result ? resultRowFor(result, old['Document ID *']) !== undefined : false,
      }, JSON.stringify(op)).toEqual({ failed: 2, futureRow: true, oldRow: true });
    });

    await steps.step(`Review the error of row ${data.futureRow} - the date of birth cannot be in the future`, async () => {
      const error = errorOf(result ? resultRowFor(result, future['Document ID *']) : undefined);
      expect(error).toMatch(ERROR_TEXT.future);
    });

    await steps.step(`Review the error of row ${data.oldRow} - the resulting age exceeds the maximum permitted`, async () => {
      const error = errorOf(result ? resultRowFor(result, old['Document ID *']) : undefined);
      const created = await findMemberByDocumentId(page, old['Document ID *']);
      expect({ error: ERROR_TEXT.age.test(error), created: created !== null }, `"${error}"`).toEqual({ error: true, created: false });
    });
  });
});
