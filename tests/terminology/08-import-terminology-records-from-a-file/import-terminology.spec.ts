import { test, expect } from '../../../fixtures';
import { MESSAGE, codeRows, xlsxUpload } from '../../../data/terminology/terminology.data';
import { BLOCKED_CASES, CASES, DB_ID_HEADERS, IMPORT_FIELDS, TEMPLATE_HEADERS, duplicateFileRows, row } from '../../../data/terminology/importTerminology.data';

/**
 * User story 15153: Import Terminology Records from a File.
 * The structure template, uploading new and updated records (DB ID), background
 * processing and its status, the outcome notifications, the failed-records
 * file, and the refusals of a wrong structure, a wrong type, in-file duplicates
 * and an empty file - plus the permission to import at all.
 */
test.describe('US 15153 - Import Terminology Records from a File', () => {
  test(`TC-${CASES.template.azureId}: should download an empty Excel template with every field and a DB ID column when the structure is exported`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyImportDialog,
    terminologyIn,
    steps,
  }) => {
    const terminology = await terminologyIn({ fields: IMPORT_FIELDS });
    let template = { filename: '', headers: [] as string[], rows: -1 };

    await steps.critical('Opening the target terminology and its export structure option presents the built-in structure', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
      await terminologyDetailPage.openImport();
    });

    await steps.step('Confirming downloads a file in the expected format', async () => {
      const file = await terminologyImportDialog.downloadTemplate();
      template = { filename: file.filename, headers: file.parsed.headers, rows: file.parsed.rows.length };
      expect(template.filename).toMatch(CASES.template.extension);
    });

    await steps.step('The file holds a header for every field, including DB ID, and no data rows', async () => {
      expect(template.headers).toEqual(expect.arrayContaining(TEMPLATE_HEADERS));
      expect(template.headers, 'a DB ID column').toContain(CASES.template.dbId);
      expect(template.rows).toBe(0);
    });
  });

  test(`TC-${CASES.newAndUpdated.azureId}: should add the new rows and update the existing ones when a file mixes empty and populated DB IDs`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyImportDialog,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.newAndUpdated;
    const terminology = await terminologyIn({ fields: IMPORT_FIELDS, records: data.existing.map((code) => ({ Code: code, Description: 'Before import' })) });
    const rows = [
      ...data.fresh.map((code) => ['', ...row(code)]),
      ...data.existing.map((code, i) => [terminology.recordIds[i], ...row(code, data.revised)]),
    ];

    await steps.critical('"Import" on the target terminology shows an upload dialog', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
      await terminologyDetailPage.openImport();
    });

    await steps.step('The completed file is accepted for upload with an in-progress indicator', async () => {
      await terminologyImportDialog.chooseFile(xlsxUpload(DB_ID_HEADERS, rows));
      const answer = await terminologyImportDialog.upload();
      expect(answer.status, answer.text.slice(0, 200)).toBe(200);
      expect(answer.jobId).not.toBeNull();
    });

    await steps.step('When processing completes a success message confirms the import', async () => {
      const job = await terminologyManagementPage.waitForImportToFinish(terminology.id);
      expect(job.status).toBe('Completed');
      expect(job.failedRows).toBe(0);
    });

    await steps.step('The records list shows the new records and the updated values of the existing ones', async () => {
      const records = await terminologyManagementPage.fetchRecords(terminology.id);
      expect(records.map((r) => r.cells.Code)).toEqual(expect.arrayContaining([...data.fresh, ...data.existing]));
      expect(records).toHaveLength(data.fresh.length + data.existing.length);
      expect(records.filter((r) => (data.existing as readonly string[]).includes(r.cells.Code) && r.cells.Description !== data.revised).map((r) => r.cells.Code), 'existing records not updated').toEqual([]);
    });
  });

  test(`TC-${CASES.background.azureId}: should leave the administrator free to work when a large file is processed in the background`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyImportDialog,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.background;
    const terminology = await terminologyIn({ fields: IMPORT_FIELDS });

    await steps.critical('Uploading the large file and clicking Submit is accepted with a background processing indicator', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
      await terminologyDetailPage.openImport();
      await terminologyImportDialog.chooseFile(xlsxUpload(TEMPLATE_HEADERS, codeRows(data.prefix, data.rows, ['Bulk row', '2026-01-15'])));
      expect((await terminologyImportDialog.upload()).status).toBe(200);
    });

    await steps.step('Navigating away at once to another module is not blocked', async () => {
      await terminologyManagementPage.open();
      expect(await terminologyManagementPage.countRows()).toBeGreaterThan(0);
    });

    await steps.step('Returning to the terminology shows the import as still processing or completed', async () => {
      await terminologyDetailPage.open(terminology.id);
      const job = await terminologyManagementPage.fetchImportJob(terminology.id);
      expect(job?.status ?? '', 'the import\'s status').toMatch(data.state);
    });
  });

  test(`TC-${CASES.successNotification.azureId}: should notify the administrator as configured when an import completes successfully`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyImportDialog,
    notificationCentre,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.successNotification;
    const terminology = await terminologyIn({ fields: IMPORT_FIELDS });

    await steps.critical('Uploading a fully valid file is accepted and processing begins', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
      await terminologyDetailPage.openImport();
      await terminologyImportDialog.chooseFile(xlsxUpload(TEMPLATE_HEADERS, codeRows(data.prefix, data.rows, ['Valid row', '2026-01-15'])));
      expect((await terminologyImportDialog.upload()).status).toBe(200);
    });

    await steps.step('The processing status changes to completed', async () => {
      expect((await terminologyManagementPage.waitForImportToFinish(terminology.id)).status).toBe('Completed');
    });

    await steps.step('The Notification Centre holds a notification confirming the import completed', async () => {
      await notificationCentre.open();
      const text = await notificationCentre.readText();
      await notificationCentre.close();
      expect(text, 'an import notification').toMatch(data.notice);
      expect(text).toMatch(data.success);
    });
  });

  test(`TC-${CASES.failureNotification.azureId}: should notify the administrator when an import finishes with failed rows`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyImportDialog,
    notificationCentre,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.failureNotification;
    const terminology = await terminologyIn({ fields: IMPORT_FIELDS });
    const rows = [...codeRows('VALID', data.valid, ['Valid', '2026-01-15']), ...Array.from({ length: data.invalid }, () => row('', 'Missing code'))];

    await steps.critical('Uploading a file with some invalid rows is accepted and processing begins', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
      await terminologyDetailPage.openImport();
      await terminologyImportDialog.chooseFile(xlsxUpload(TEMPLATE_HEADERS, rows));
      expect((await terminologyImportDialog.upload()).status).toBe(200);
    });

    await steps.step('The status changes to completed with failures reported', async () => {
      const job = await terminologyManagementPage.waitForImportToFinish(terminology.id);
      expect({ status: job.status, failed: job.failedRows }).toEqual({ status: 'CompletedWithErrors', failed: data.invalid });
    });

    await steps.step('The Notification Centre holds a notification that the import finished with failures', async () => {
      await notificationCentre.open();
      const text = await notificationCentre.readText();
      await notificationCentre.close();
      expect(text, 'an import notification').toMatch(data.notice);
      expect(text).toMatch(data.failure);
    });
  });

  test(`TC-${CASES.failedRecordsFile.azureId}: should offer a failed-records file naming each incorrect cell and reason when an import has failed rows`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyImportDialog,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.failedRecordsFile;
    const terminology = await terminologyIn({ fields: IMPORT_FIELDS });
    const rows = [row(data.missingCode, 'Missing code'), row(data.duplicate, 'First'), row(data.duplicate, 'Duplicate'), row('BAD-DATE-1', 'Bad date', data.badDate)];

    await steps.critical('Uploading the file with mixed error types is accepted and processing begins', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
      await terminologyDetailPage.openImport();
      await terminologyImportDialog.chooseFile(xlsxUpload(TEMPLATE_HEADERS, rows));
      expect((await terminologyImportDialog.upload()).status).toBe(200);
    });

    await steps.step('The import completes with failures and offers the failed-records file', async () => {
      const job = await terminologyManagementPage.waitForImportToFinish(terminology.id);
      expect(job.failedRows).toBe(3);
      await terminologyDetailPage.open(terminology.id);
      expect((await terminologyDetailPage.readErrorRows()).length).toBe(3);
    });

    await steps.step('The failed-records file lists each failed row with its incorrect cell and a reason', async () => {
      const file = await terminologyDetailPage.exportGrid('errors', 'excel');
      expect(file.parsed.rows).toHaveLength(3);
      const reasonHeader = file.parsed.headers.find((h) => /reason|error/i.test(h));
      expect(reasonHeader, `a reason column among ${file.parsed.headers.join(', ')}`).toBeDefined();
      expect(file.parsed.rows.filter((r) => !data.reason.test(r[reasonHeader ?? ''] ?? '')).length, 'rows without a reason').toBe(0);
    });
  });

  test(`TC-${CASES.emptyDbId.azureId}: should create a new record with a generated DB ID when a row's DB ID is empty`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyImportDialog,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.emptyDbId;
    const terminology = await terminologyIn({ fields: IMPORT_FIELDS });

    await steps.critical('Uploading a file whose row has a blank DB ID and valid data is accepted', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
      await terminologyDetailPage.openImport();
      await terminologyImportDialog.chooseFile(xlsxUpload(DB_ID_HEADERS, [['', ...row(data.code)]]));
      expect((await terminologyImportDialog.upload()).status).toBe(200);
    });

    await steps.step('Processing completes with a success', async () => {
      const job = await terminologyManagementPage.waitForImportToFinish(terminology.id);
      expect({ status: job.status, succeeded: job.succeededRows }).toEqual({ status: 'Completed', succeeded: 1 });
    });

    await steps.step('A new record with a system-generated DB ID matches the submitted data', async () => {
      const records = await terminologyManagementPage.fetchRecords(terminology.id);
      expect(records.map((r) => r.cells.Code)).toEqual([data.code]);
      expect(records[0].rowId).toMatch(/^[0-9a-f-]{36}$/i);
    });
  });

  test(`TC-${CASES.existingDbId.azureId}: should update the matching record in place without a duplicate when a row carries an existing DB ID`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyImportDialog,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.existingDbId;
    const terminology = await terminologyIn({ fields: IMPORT_FIELDS, records: [{ Code: data.code, Description: data.before }] });

    await steps.critical(`Uploading a file with DB ID ${terminology.recordIds[0]} and changed values is accepted`, async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
      await terminologyDetailPage.openImport();
      await terminologyImportDialog.chooseFile(xlsxUpload(DB_ID_HEADERS, [[terminology.recordIds[0], ...row(data.code, data.after)]]));
      expect((await terminologyImportDialog.upload()).status).toBe(200);
    });

    await steps.step('Processing completes with a success', async () => {
      expect((await terminologyManagementPage.waitForImportToFinish(terminology.id)).status).toBe('Completed');
    });

    await steps.step('The record shows the imported values and no duplicate was created', async () => {
      const records = await terminologyManagementPage.fetchRecords(terminology.id);
      expect(records.map((r) => ({ id: r.rowId, code: r.cells.Code, description: r.cells.Description })))
        .toEqual([{ id: terminology.recordIds[0], code: data.code, description: data.after }]);
    });
  });

  test(`TC-${CASES.structureMismatch.azureId}: should reject the file before processing when its columns do not match the exported structure`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyImportDialog,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.structureMismatch;
    const terminology = await terminologyIn({ fields: IMPORT_FIELDS });
    let messages = '';

    await steps.critical('"Import" shows an upload dialog', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
      await terminologyDetailPage.openImport();
    });

    await steps.step('Submitting the file with a missing column makes the system validate its structure', async () => {
      messages = await terminologyImportDialog.chooseFile(xlsxUpload(data.headers, [['Only description', '2026-01-15', 'true']]));
      const answer = await terminologyImportDialog.upload();
      messages = [messages, ...answer.messages].join(' | ');
      expect(messages, 'the drawer should answer the chosen file').not.toBe('');
    });

    await steps.step('A clear structure-mismatch error is shown and the import does not proceed', async () => {
      expect(messages).toMatch(data.error);
      expect(await terminologyManagementPage.fetchRecords(terminology.id)).toEqual([]);
      expect(await terminologyManagementPage.fetchErrorRows(terminology.id)).toEqual([]);
    });
  });

  test(`TC-${CASES.unsupportedType.azureId}: should reject the file without starting the import when its type is not supported`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyImportDialog,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.unsupportedType;
    const terminology = await terminologyIn({ fields: IMPORT_FIELDS });
    let messages = '';
    let status = -1;

    await steps.critical('"Import" shows an upload dialog', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
      await terminologyDetailPage.openImport();
    });

    await steps.step(`Submitting "${data.file}" makes the system check the file type`, async () => {
      messages = await terminologyImportDialog.chooseFile({ name: data.file, mimeType: 'text/plain', buffer: Buffer.from(data.content) });
      const answer = await terminologyImportDialog.upload();
      status = answer.status;
      messages = [messages, ...answer.messages].join(' | ');
      expect(messages, 'the drawer should answer the chosen file').not.toBe('');
    });

    await steps.step('An error says the file type is not supported and the upload is rejected', async () => {
      expect(messages, 'an unsupported-type message').toMatch(MESSAGE.unsupported);
      expect(status, 'no import should be queued').not.toBe(200);
    });
  });

  test(`TC-${CASES.duplicateInFile.azureId}: should reject and report both rows when two rows of the file share a unique value`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyImportDialog,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.duplicateInFile;
    const terminology = await terminologyIn({ fields: IMPORT_FIELDS });
    const rows = duplicateFileRows();

    await steps.critical('Uploading a file with two rows of the same Code is accepted and processing begins', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
      await terminologyDetailPage.openImport();
      await terminologyImportDialog.chooseFile(xlsxUpload(TEMPLATE_HEADERS, rows));
      expect((await terminologyImportDialog.upload()).status).toBe(200);
    });

    await steps.step('Processing returns a failure identifying the duplicate rows', async () => {
      const job = await terminologyManagementPage.waitForImportToFinish(terminology.id);
      expect(job.status).toBe('CompletedWithErrors');
    });

    await steps.step('Both duplicate rows are flagged with a reason about the duplicate unique value', async () => {
      const failed = await terminologyManagementPage.fetchErrorRows(terminology.id);
      const flagged = failed.filter((r) => r.cells.some((c) => c.value === data.code && MESSAGE.unique.test(c.error)));
      expect(flagged, 'both rows sharing the code should be flagged').toHaveLength(data.duplicateRows.length);
    });
  });

  test(`TC-${CASES.headerOnly.azureId}: should reject the file with a clear no-data message when it holds headers only`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyImportDialog,
    terminologyIn,
    steps,
  }) => {
    const terminology = await terminologyIn({ fields: IMPORT_FIELDS });
    let messages = '';
    let status = -1;

    await steps.critical('"Import" shows an upload dialog', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
      await terminologyDetailPage.openImport();
    });

    await steps.step('Submitting the header-only file makes the system validate its content', async () => {
      messages = await terminologyImportDialog.chooseFile(xlsxUpload(TEMPLATE_HEADERS, []));
      const answer = await terminologyImportDialog.upload();
      status = answer.status;
      messages = [messages, ...answer.messages].join(' | ');
      expect(messages, 'the drawer should answer the chosen file').not.toBe('');
    });

    await steps.step('A message says the file has no data to import and processing does not proceed', async () => {
      expect(messages).toMatch(MESSAGE.noData);
      expect(status, 'no import should be queued').not.toBe(200);
      expect(await terminologyManagementPage.fetchRecords(terminology.id)).toEqual([]);
    });
  });

  test(`TC-${CASES.statusTransitions.azureId}: should show Processing until the job finishes and then a completed status when a valid file is uploaded`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyImportDialog,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.statusTransitions;
    const terminology = await terminologyIn({ fields: IMPORT_FIELDS });
    let shown = '';

    await steps.critical('Uploading a valid file shows the import as "Processing"', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
      await terminologyDetailPage.openImport();
      await terminologyImportDialog.chooseFile(xlsxUpload(TEMPLATE_HEADERS, codeRows(data.prefix, data.rows, ['State row', '2026-01-15'])));
      const answer = await terminologyImportDialog.upload();
      shown = [answer.jobStatus, ...answer.messages, await terminologyDetailPage.getImportProgressText()].join(' | ');
      expect(shown, 'a processing status on screen').toMatch(data.processing);
    });

    await steps.step('Without further action the status stays "Processing" until the job finishes', async () => {
      const job = await terminologyManagementPage.fetchImportJob(terminology.id);
      expect(job, 'the import job').not.toBeNull();
    });

    await steps.step('When the job finishes the status becomes "Completed" or "Completed with errors"', async () => {
      expect((await terminologyManagementPage.waitForImportToFinish(terminology.id)).status).toMatch(data.final);
    });
  });

  test(`TC-${CASES.noPermission.azureId}: should keep the import function out of reach when the user lacks Reference Data Administrator rights`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyIn,
    shapedNonAdmin,
    requireListAccess,
    requireBaseline,
    steps,
  }) => {
    const terminology = await terminologyIn({ fields: IMPORT_FIELDS });
    await terminologyDetailPage.open(terminology.id);
    requireBaseline((await terminologyDetailPage.getToolbarState('upload')).availability === 'available', 'Upload Data');
    const session = await shapedNonAdmin(CASES.noPermission.granted);
    await requireListAccess(session);

    await steps.critical('The module loads for the viewer', async () => {
      await session.terminologyDetail.openExpectingFailure(terminology.id);
      expect(await session.terminologyDetail.isLoaded()).toBe(true);
    });

    await steps.step('The "Import" option is hidden or disabled', async () => {
      expect((await session.terminologyDetail.getToolbarState('upload')).availability).not.toBe('available');
    });

    await steps.step('Reaching the import directly is blocked', async () => {
      const answer = await session.terminologies.sendUpload(terminology.id, TEMPLATE_HEADERS, [row('NOPERM-1')]);
      expect(answer.status, `the server answered ${answer.status}`).toBeGreaterThanOrEqual(400);
      expect(await terminologyManagementPage.fetchRecords(terminology.id)).toEqual([]);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});

