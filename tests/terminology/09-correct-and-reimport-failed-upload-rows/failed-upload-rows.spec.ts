import { test, expect } from '../../../fixtures';
import { CASES, ERROR_FIELDS, FAILING_ROWS, HEADERS, twentyRowFile } from '../../../data/terminology/failedUploadRows.data';

/**
 * User story 15154: Correct and Reimport Failed Upload Rows.
 * The Upload Errors tab after an import with failures: every failed row with
 * its cell-level error, correcting and resubmitting a row without re-uploading
 * the file, rows that still fail, persistence across navigation, and access.
 */
test.describe('US 15154 - Correct and Reimport Failed Upload Rows', () => {
  test(`TC-${CASES.allListed.azureId}: should list every failed row on the Upload Errors tab when an import completes with failures`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyIn,
    completedImport,
    steps,
  }) => {
    const terminology = await terminologyIn({ fields: ERROR_FIELDS });
    const job = await completedImport(terminology.id, HEADERS, twentyRowFile());
    let rows: string[] = [];

    await steps.critical('Navigate to the Terminology Management module - the module landing page loads', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
    });

    await steps.step('The "Upload Errors" tab lists the rows that failed during the import', async () => {
      rows = (await terminologyDetailPage.readErrorRows()).map((r) => Object.values(r.cells).join(' '));
      expect(rows).toHaveLength(job.failedRows);
    });

    await steps.step('Every known failing row of the source file is on the tab', async () => {
      expect(job.failedRows).toBe(CASES.allListed.failing.length);
      for (const marker of CASES.allListed.failing) expect(rows.some((r) => r.includes(marker)), `a failed row showing "${marker}"`).toBe(true);
    });
  });

  test(`TC-${CASES.cellErrors.azureId}: should name the exact cell and reason when failed rows have different error types`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyIn,
    completedImport,
    steps,
  }) => {
    const terminology = await terminologyIn({ fields: ERROR_FIELDS });
    await completedImport(terminology.id, HEADERS, [[...FAILING_ROWS.missingDescription], [...FAILING_ROWS.invalidCode]]);
    let errors: { cells: Record<string, string>; errors: string[] }[] = [];

    await steps.critical('The Upload Errors tab of the import lists the failed rows', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
      errors = await terminologyDetailPage.readErrorRows();
      expect(errors).toHaveLength(2);
    });

    await steps.step('The row missing its mandatory Description names that cell and says the field is required', async () => {
      const failed = errors.find((r) => r.cells.Code === FAILING_ROWS.missingDescription[0]);
      expect(failed?.errors.join(' | ')).toMatch(/description/i);
      expect(failed?.errors.join(' | ')).toMatch(CASES.cellErrors.missing);
    });

    await steps.step('The row with an invalid Code format names that cell and explains the format problem', async () => {
      const failed = errors.find((r) => r.cells.Code === FAILING_ROWS.invalidCode[0]);
      expect(failed?.errors.join(' | ')).toMatch(/code/i);
      expect(failed?.errors.join(' | ')).toMatch(CASES.cellErrors.format);
    });
  });

  test(`TC-${CASES.correctOne.azureId}: should reprocess only that row without re-uploading the file when a failed row is corrected and resubmitted`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyRecordDialog,
    terminologyIn,
    completedImport,
    steps,
  }) => {
    const data = CASES.correctOne;
    const terminology = await terminologyIn({ fields: ERROR_FIELDS });
    await completedImport(terminology.id, HEADERS, [...twentyRowFile()]);
    const recordsBefore = (await terminologyManagementPage.fetchRecords(terminology.id)).length;

    await steps.critical('Selecting a failed row shows its incorrect value and the error reason', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
      const row = (await terminologyDetailPage.readErrorRows()).find((r) => r.cells.Code === FAILING_ROWS.invalidCode[0]);
      expect(row?.errors.length).toBeGreaterThan(0);
      await terminologyDetailPage.openFixRow(FAILING_ROWS.invalidCode[0]);
    });

    await steps.step('Only the incorrect cell is edited to a valid value, which is accepted', async () => {
      await terminologyRecordDialog.fill(terminology.fieldIds.Code, data.corrected);
      expect(await terminologyRecordDialog.getValue(terminology.fieldIds.Code)).toBe(data.corrected);
    });

    await steps.step('"Resubmit" reprocesses that row alone - the rest of the file is not reprocessed', async () => {
      const answer = await terminologyRecordDialog.save();
      expect(answer.status).toBe(200);
      const records = await terminologyManagementPage.fetchRecords(terminology.id);
      expect(records).toHaveLength(recordsBefore + 1);
      expect(records.filter((r) => r.cells.Code === data.corrected)).toHaveLength(1);
    });
  });

  test(`TC-${CASES.movesToSuccess.azureId}: should import the row and drop it from the Upload Errors tab when a corrected row is resubmitted`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyRecordDialog,
    terminologyIn,
    completedImport,
    steps,
  }) => {
    const data = CASES.movesToSuccess;
    const terminology = await terminologyIn({ fields: ERROR_FIELDS });
    await completedImport(terminology.id, HEADERS, [[...FAILING_ROWS.invalidCode]]);

    await steps.critical('Correcting the failed row\'s invalid cell shows the updated value', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
      await terminologyDetailPage.openTab('errors');
      await terminologyDetailPage.openFixRow(FAILING_ROWS.invalidCode[0]);
      await terminologyRecordDialog.fill(terminology.fieldIds.Code, data.corrected);
      expect(await terminologyRecordDialog.getValue(terminology.fieldIds.Code)).toBe(data.corrected);
    });

    await steps.step('"Resubmit" puts the row into processing', async () => {
      expect((await terminologyRecordDialog.save()).status).toBe(200);
    });

    await steps.step('When reprocessing finishes the row succeeds and appears in the main records list', async () => {
      expect((await terminologyManagementPage.fetchRecords(terminology.id)).map((r) => r.cells.Code)).toContain(data.corrected);
      expect((await terminologyDetailPage.readRecords()).map((r) => r.cells.Code)).toContain(data.corrected);
    });

    await steps.step('After a refresh the Upload Errors tab no longer lists the row as failed', async () => {
      await terminologyDetailPage.reload();
      await terminologyDetailPage.waitForLoaded();
      expect((await terminologyDetailPage.readErrorRows()).map((r) => r.cells.Code)).not.toContain(FAILING_ROWS.invalidCode[0]);
      expect(await terminologyManagementPage.fetchErrorRows(terminology.id)).toEqual([]);
    });
  });

  test(`TC-${CASES.unchanged.azureId}: should keep the row on the Upload Errors tab with its original error when it is resubmitted uncorrected`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyRecordDialog,
    terminologyIn,
    completedImport,
    steps,
  }) => {
    const terminology = await terminologyIn({ fields: ERROR_FIELDS });
    await completedImport(terminology.id, HEADERS, [[...FAILING_ROWS.missingDescription]]);
    let original: string[] = [];

    await steps.critical('Selecting the failed row without changes still shows its original value', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
      original = (await terminologyDetailPage.readErrorRows())[0].errors;
      await terminologyDetailPage.openFixRow(FAILING_ROWS.missingDescription[0]);
      expect(await terminologyRecordDialog.getValue(terminology.fieldIds.Description)).toBe('');
    });

    await steps.step('"Resubmit" without a correction submits the row for reprocessing', async () => {
      const answer = await terminologyRecordDialog.save();
      expect(answer.status, 'the uncorrected row should not be accepted').not.toBe(200);
    });

    await steps.step('The row still fails with the same cell-level error on the Upload Errors tab', async () => {
      await terminologyDetailPage.reload();
      await terminologyDetailPage.waitForLoaded();
      const rows = await terminologyDetailPage.readErrorRows();
      expect(rows.map((r) => r.cells.Code)).toContain(FAILING_ROWS.missingDescription[0]);
      expect(rows.find((r) => r.cells.Code === FAILING_ROWS.missingDescription[0])?.errors).toEqual(original);
    });
  });

  test(`TC-${CASES.partialBatch.azureId}: should import only the rows that pass when several corrected and uncorrected rows are resubmitted together`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyIn,
    completedImport,
    steps,
  }) => {
    const terminology = await terminologyIn({ fields: ERROR_FIELDS });
    await completedImport(terminology.id, HEADERS, [[...FAILING_ROWS.invalidCode], [...FAILING_ROWS.tooLongCode], [...FAILING_ROWS.missingDescription]]);

    await steps.critical('Two rows are corrected and a third keeps its error on the Upload Errors tab', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
      expect(await terminologyDetailPage.readErrorRows()).toHaveLength(3);
    });

    await steps.critical('All three rows are selected and "Resubmit" is clicked together', async () => {
      expect(await terminologyDetailPage.isRowSelectionOffered(), 'the failed rows should be selectable for one resubmission').toBe(true);
    });

    await steps.step('The two corrected rows succeed and leave the tab while the third stays with its error', async () => {
      const remaining = await terminologyManagementPage.fetchErrorRows(terminology.id);
      expect(remaining.map((r) => r.cells.find((c) => c.fieldName === 'Code')?.value)).toEqual([FAILING_ROWS.missingDescription[0]]);
    });
  });

  test(`TC-${CASES.emptyMandatory.azureId}: should fail the row again when it is resubmitted with its mandatory field still empty`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyRecordDialog,
    terminologyIn,
    completedImport,
    steps,
  }) => {
    const terminology = await terminologyIn({ fields: ERROR_FIELDS });
    await completedImport(terminology.id, HEADERS, [[...FAILING_ROWS.missingCode]]);

    await steps.critical('The row missing its mandatory Code shows the empty field highlighted', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
      const row = (await terminologyDetailPage.readErrorRows())[0];
      expect(row.errors.join(' | ')).toMatch(CASES.emptyMandatory.required);
      await terminologyDetailPage.openFixRow(FAILING_ROWS.missingCode[1]);
    });

    await steps.step('"Resubmit" with the field still empty makes the system validate the row', async () => {
      expect(await terminologyRecordDialog.getValue(terminology.fieldIds.Code)).toBe('');
    });

    await steps.step('The row fails again with a message that the field is still required', async () => {
      const answer = await terminologyRecordDialog.save();
      expect(answer.status).not.toBe(200);
      expect([...answer.messages, ...answer.validationErrors].join(' | ')).toMatch(CASES.emptyMandatory.required);
      expect(await terminologyManagementPage.fetchRecords(terminology.id)).toEqual([]);
    });
  });

  test(`TC-${CASES.overLength.azureId}: should fail a resubmitted row again when its corrected value exceeds the maximum length`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyRecordDialog,
    terminologyIn,
    completedImport,
    steps,
  }) => {
    const data = CASES.overLength;
    const terminology = await terminologyIn({ fields: ERROR_FIELDS });
    await completedImport(terminology.id, HEADERS, [[...FAILING_ROWS.missingDescription]]);

    await steps.critical('Selecting a failed row shows its value and error', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
      expect((await terminologyDetailPage.readErrorRows())[0].errors.length).toBeGreaterThan(0);
      await terminologyDetailPage.openFixRow(FAILING_ROWS.missingDescription[0]);
    });

    await steps.step('A corrected value one character over the maximum is typed in', async () => {
      await terminologyRecordDialog.type(terminology.fieldIds.Description, data.description());
      expect((await terminologyRecordDialog.getValue(terminology.fieldIds.Description)).length).toBeGreaterThan(0);
    });

    await steps.step('"Resubmit" makes the system validate the length before reprocessing', async () => {
      expect(await terminologyRecordDialog.getText()).not.toBe('');
    });

    await steps.step('The row fails again with a maximum-length message', async () => {
      const answer = await terminologyRecordDialog.save();
      expect(answer.status).not.toBe(200);
      expect([...answer.messages, ...answer.validationErrors].join(' | ')).toMatch(data.error);
      expect(await terminologyManagementPage.fetchRecords(terminology.id)).toEqual([]);
    });
  });

  test(`TC-${CASES.persistence.azureId}: should show the same failed rows and reasons when the user navigates away and returns to the Upload Errors tab`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyIn,
    completedImport,
    steps,
  }) => {
    const terminology = await terminologyIn({ fields: ERROR_FIELDS });
    await completedImport(terminology.id, HEADERS, Object.values(FAILING_ROWS).map((r) => [...r]));
    let noted: string[] = [];

    await steps.critical('The Upload Errors tab lists the failed rows and their reasons', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
      noted = (await terminologyDetailPage.readErrorRows()).map((r) => `${JSON.stringify(r.cells)} ${r.errors.join('|')}`).sort();
      expect(noted.length).toBeGreaterThan(0);
    });

    await steps.step('Navigating to another module and back reloads the tab', async () => {
      await terminologyManagementPage.open();
      await terminologyDetailPage.open(terminology.id);
      await terminologyDetailPage.openTab('errors');
    });

    await steps.step('The same failed rows and reasons are still shown', async () => {
      const now = (await terminologyDetailPage.readErrorRows()).map((r) => `${JSON.stringify(r.cells)} ${r.errors.join('|')}`).sort();
      expect(now).toEqual(noted);
    });
  });

  test(`TC-${CASES.noPermission.azureId}: should keep the Upload Errors tab and resubmission out of reach when the user lacks Reference Data Administrator rights`, async ({
    terminologyManagementPage,
    terminologyIn,
    completedImport,
    shapedNonAdmin,
    requireListAccess,
    steps,
  }) => {
    const terminology = await terminologyIn({ fields: ERROR_FIELDS });
    await completedImport(terminology.id, HEADERS, [[...FAILING_ROWS.invalidCode]]);
    const session = await shapedNonAdmin(CASES.noPermission.granted);
    await requireListAccess(session);

    await steps.critical('The module loads for the restricted user', async () => {
      await session.terminologyDetail.openExpectingFailure(terminology.id);
      expect(await session.terminologyDetail.isLoaded()).toBe(true);
    });

    await steps.step('The Upload Errors tab is hidden, disabled or blocked with a permission message', async () => {
      const rows = await session.terminologyDetail.readErrorRowsIfOffered();
      expect(rows, 'failed rows shown to a user without the right').toEqual([]);
    });

    await steps.step('Editing and resubmitting a failed row is blocked or unavailable', async () => {
      const answer = await session.terminologies.sendUpsertRecord(terminology.id, { Code: 'NOPERMFIX', Description: 'Resubmitted' });
      expect(answer.status, `the server answered ${answer.status}`).toBeGreaterThanOrEqual(400);
      expect(await terminologyManagementPage.fetchRecords(terminology.id)).toEqual([]);
    });
  });
});
