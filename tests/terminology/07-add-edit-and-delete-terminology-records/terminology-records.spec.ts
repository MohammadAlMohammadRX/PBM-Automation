import { test, expect } from '../../../fixtures';
import { IS_ACTIVE_FIELD, MESSAGE, TOAST_TEXT } from '../../../data/terminology/terminology.data';
import { ALPHANUMERIC_FIELDS, CASES, RECORD_FIELDS } from '../../../data/terminology/terminologyRecords.data';
import { mappingTo } from '../../../data/terminology/retireValues.data';

/**
 * User story 15152: Add, Edit, and Delete Terminology Records.
 * Record maintenance in an unlocked terminology: mandatory, unique, length and
 * format rules on save, editing, deleting (blocked while another terminology's
 * mapping uses the record), access control and rapid repeated edits.
 */
test.describe('US 15152 - Add, Edit, and Delete Terminology Records', () => {
  test(`TC-${CASES.add.azureId}: should save a new record and list it with its values when every mandatory field is completed`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyRecordDialog,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.add;
    const terminology = await terminologyIn({ fields: RECORD_FIELDS });

    await steps.critical('Navigate to the Terminology Management module - the list of terminologies is shown', async () => {
      await terminologyManagementPage.open();
    });

    await steps.critical('Opening the unlocked terminology displays its record list', async () => {
      await terminologyManagementPage.openDetails(terminology.name);
      await terminologyDetailPage.waitForGrid('data');
    });

    await steps.critical('"Add Record" opens a blank record form with mandatory fields marked', async () => {
      await terminologyDetailPage.openAddRecord();
      expect(await terminologyRecordDialog.getValue(terminology.fieldIds.Code)).toBe('');
      expect(await terminologyRecordDialog.getRequiredLabels(), 'the fields marked mandatory').toContain('Code');
    });

    await steps.step('Valid values, including a unique code, are accepted without errors', async () => {
      await terminologyRecordDialog.fill(terminology.fieldIds.Code, data.code);
      await terminologyRecordDialog.fill(terminology.fieldIds.Description, data.description);
      await terminologyRecordDialog.setActive(true);
      expect(await terminologyRecordDialog.getValue(terminology.fieldIds.Code)).toBe(data.code);
    });

    await steps.step('Save confirms the record and it appears in the records list', async () => {
      const answer = await terminologyRecordDialog.save();
      expect(answer.status).toBe(200);
      expect(answer.messages.join(' | ')).toMatch(TOAST_TEXT.recordSaved);
      const row = (await terminologyDetailPage.readRecords()).find((r) => r.cells.Code === data.code);
      expect(row?.cells.Description).toBe(data.description);
    });
  });

  test(`TC-${CASES.emptyMandatory.azureId}: should not save a record and should name the required field when the mandatory Code is empty`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyRecordDialog,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.emptyMandatory;
    const terminology = await terminologyIn({ fields: RECORD_FIELDS });

    await steps.critical('Open the unlocked terminology and click "Add Record" - a blank record form is displayed', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
      await terminologyDetailPage.openAddRecord();
    });

    await steps.step('The remaining fields accept their values while Code stays empty', async () => {
      await terminologyRecordDialog.fill(terminology.fieldIds.Description, data.description);
      expect(await terminologyRecordDialog.getValue(terminology.fieldIds.Code)).toBe('');
    });

    await steps.step('Save shows a validation message for the empty mandatory field and no record is saved', async () => {
      const answer = await terminologyRecordDialog.save();
      expect(answer.status, 'nothing should be saved').not.toBe(200);
      expect([...answer.messages, ...answer.validationErrors].join(' | ')).toMatch(MESSAGE.required);
      expect(await terminologyManagementPage.fetchRecords(terminology.id)).toEqual([]);
    });
  });

  test(`TC-${CASES.duplicate.azureId}: should reject the record and leave the original unchanged when its unique Code duplicates an existing record`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyRecordDialog,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.duplicate;
    const terminology = await terminologyIn({ fields: RECORD_FIELDS, records: [{ Code: data.code, Description: data.original }] });

    await steps.critical('Opening the terminology shows the existing record', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
      expect(await terminologyDetailPage.isGridRowShown('data', data.code)).toBe(true);
    });

    await steps.step(`"Add Record" with "${data.code}" accepts the typed values`, async () => {
      await terminologyDetailPage.openAddRecord();
      await terminologyRecordDialog.fill(terminology.fieldIds.Code, data.code);
      await terminologyRecordDialog.fill(terminology.fieldIds.Description, data.duplicate);
      expect(await terminologyRecordDialog.getValue(terminology.fieldIds.Code)).toBe(data.code);
    });

    await steps.step('Save shows that the code must be unique and no record is saved', async () => {
      const answer = await terminologyRecordDialog.save();
      expect(answer.status).not.toBe(200);
      expect([...answer.messages, ...answer.validationErrors].join(' | ')).toMatch(MESSAGE.unique);
      const records = await terminologyManagementPage.fetchRecords(terminology.id);
      expect(records.map((r) => `${r.cells.Code}|${r.cells.Description}`)).toEqual([`${data.code}|${data.original}`]);
    });
  });

  test(`TC-${CASES.minimumLength.azureId}: should save the record when its mandatory value is at the minimum length`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyRecordDialog,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.minimumLength;
    const terminology = await terminologyIn({ fields: RECORD_FIELDS });

    await steps.critical('Open the unlocked terminology and click "Add Record" - a blank record form is displayed', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
      await terminologyDetailPage.openAddRecord();
    });

    await steps.step(`The ${data.code.length}-character value is accepted with no length error`, async () => {
      await terminologyRecordDialog.fill(terminology.fieldIds.Code, data.code);
      await terminologyRecordDialog.fill(terminology.fieldIds.Description, data.description);
      expect(await terminologyRecordDialog.getValue(terminology.fieldIds.Code)).toBe(data.code);
    });

    await steps.step('Save confirms the record was saved', async () => {
      const answer = await terminologyRecordDialog.save();
      expect(answer.status).toBe(200);
      expect(answer.messages.join(' | ')).toMatch(TOAST_TEXT.recordSaved);
      expect((await terminologyManagementPage.fetchRecords(terminology.id)).map((r) => r.cells.Code)).toContain(data.code);
    });
  });

  test(`TC-${CASES.overMaximum.azureId}: should not save a record and should report the length violation when the mandatory value is one character over the maximum`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyRecordDialog,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.overMaximum;
    const code = data.code();
    const terminology = await terminologyIn({ fields: RECORD_FIELDS });

    await steps.critical('Open the unlocked terminology and click "Add Record" - a blank record form is displayed', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
      await terminologyDetailPage.openAddRecord();
    });

    await steps.step('The over-length value is flagged or held pending validation', async () => {
      await terminologyRecordDialog.type(terminology.fieldIds.Code, code);
      await terminologyRecordDialog.fill(terminology.fieldIds.Description, data.description);
      expect((await terminologyRecordDialog.getValue(terminology.fieldIds.Code)).length).toBeLessThanOrEqual(code.length);
    });

    await steps.step('Save reports that the maximum length was exceeded and no record is saved', async () => {
      const answer = await terminologyRecordDialog.save();
      expect(answer.status, 'nothing should be saved').not.toBe(200);
      expect([...answer.messages, ...answer.validationErrors].join(' | ')).toMatch(MESSAGE.maxLength);
      expect(await terminologyManagementPage.fetchRecords(terminology.id)).toEqual([]);
    });
  });

  test(`TC-${CASES.edit.azureId}: should keep the new value after reopening when an existing record is edited and saved`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyRecordDialog,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.edit;
    const terminology = await terminologyIn({ fields: RECORD_FIELDS, records: [{ Code: data.code, Description: data.before }] });

    await steps.critical('Selecting the existing record shows its current values', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
      expect((await terminologyDetailPage.readRecords()).find((r) => r.cells.Code === data.code)?.cells.Description).toBe(data.before);
    });

    await steps.step('"Edit" and a new description show the updated value in the field', async () => {
      await terminologyDetailPage.openEditRecord(data.code);
      await terminologyRecordDialog.fill(terminology.fieldIds.Description, data.after);
      expect(await terminologyRecordDialog.getValue(terminology.fieldIds.Description)).toBe(data.after);
    });

    await steps.step('Save confirms the update and the list shows the new value, which persists when reopened', async () => {
      const answer = await terminologyRecordDialog.save();
      expect(answer.status).toBe(200);
      expect((await terminologyDetailPage.readRecords()).find((r) => r.cells.Code === data.code)?.cells.Description).toBe(data.after);
      await terminologyDetailPage.openEditRecord(data.code);
      expect(await terminologyRecordDialog.getValue(terminology.fieldIds.Description)).toBe(data.after);
      await terminologyRecordDialog.cancel();
    });
  });

  test(`TC-${CASES.deleteReferenced.azureId}: should block the deletion and keep the record when another terminology's mapping references it`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyIn,
    recordIn,
    steps,
  }) => {
    const data = CASES.deleteReferenced;
    const x = await terminologyIn({ fields: RECORD_FIELDS, records: [{ Code: data.code }] });
    const y = await terminologyIn({ fields: [{ name: 'Code', type: 'text', required: true, unique: true }, mappingTo(x.id, x.fieldIds.Code)] });
    await recordIn(y.id, { Code: data.referrer, Parent: x.recordIds[0] });

    await steps.critical('Opening terminology X and record A displays its details', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(x.name);
      expect(await terminologyDetailPage.isGridRowShown('data', data.code)).toBe(true);
    });

    await steps.critical('"Delete" on record A asks for confirmation', async () => {
      const dialog = await terminologyDetailPage.requestDeleteRecord(data.code);
      expect(await dialog.getTitle()).toMatch(/delete/i);
      await dialog.cancel();
    });

    await steps.step('Confirming is blocked with a message that the record is used by another terminology\'s mapping', async () => {
      const answer = await terminologyDetailPage.deleteRecord(data.code);
      expect(answer.status, 'the deletion should be refused').not.toBe(200);
      expect(answer.messages.join(' | ')).toMatch(MESSAGE.mapped);
      expect((await terminologyManagementPage.fetchRecords(x.id)).map((r) => r.cells.Code)).toContain(data.code);
    });
  });

  test(`TC-${CASES.deleteUnreferenced.azureId}: should delete the record and remove it from the list when nothing references it`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyConfirmDialog,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.deleteUnreferenced;
    const terminology = await terminologyIn({ fields: RECORD_FIELDS, records: [{ Code: data.code }] });

    await steps.critical('Selecting record B shows its details with no reference warnings', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
      expect(await terminologyDetailPage.isGridRowShown('data', data.code)).toBe(true);
    });

    await steps.critical('"Delete" shows a confirmation dialog', async () => {
      await terminologyDetailPage.requestDeleteRecord(data.code);
      expect(await terminologyConfirmDialog.getMessage()).toMatch(/delete/i);
      await terminologyConfirmDialog.cancel();
    });

    await steps.step('Confirming shows a success message and the record is no longer listed', async () => {
      const answer = await terminologyDetailPage.deleteRecord(data.code);
      expect(answer.status).toBe(200);
      expect(answer.messages.join(' | ')).toMatch(TOAST_TEXT.recordDeleted);
      expect(await terminologyDetailPage.isGridRowGone('data', data.code), 'the deleted record should leave the list').toBe(true);
      expect(await terminologyManagementPage.fetchRecords(terminology.id)).toEqual([]);
    });
  });

  test(`TC-${CASES.invalidFormat.azureId}: should reject the record when special characters are entered in an alphanumeric field`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyRecordDialog,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.invalidFormat;
    const terminology = await terminologyIn({ fields: ALPHANUMERIC_FIELDS });

    await steps.critical('Open the unlocked terminology and click "Add Record" - a blank record form is displayed', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
      await terminologyDetailPage.openAddRecord();
    });

    await steps.step(`"${data.code}" in the Code field is rejected or flagged on input`, async () => {
      await terminologyRecordDialog.fill(terminology.fieldIds.Code, data.code);
      await terminologyRecordDialog.fill(terminology.fieldIds.Description, data.description);
      expect(await terminologyRecordDialog.getValue(terminology.fieldIds.Code)).not.toBe('');
    });

    await steps.step('Save reports the format is invalid and no record is saved', async () => {
      const answer = await terminologyRecordDialog.save();
      expect(answer.status).not.toBe(200);
      expect([...answer.messages, ...answer.validationErrors].join(' | ')).toMatch(MESSAGE.format);
      expect(await terminologyManagementPage.fetchRecords(terminology.id)).toEqual([]);
    });
  });

  test(`TC-${CASES.noPermission.azureId}: should withhold adding, editing and deleting records when the user lacks Reference Data Administrator rights`, async ({
    terminologyIn,
    shapedNonAdmin,
    requireListAccess,
    steps,
  }) => {
    const data = CASES.noPermission;
    const terminology = await terminologyIn({ fields: RECORD_FIELDS, records: [{ Code: data.code }] });
    const session = await shapedNonAdmin(data.granted);
    await requireListAccess(session);

    await steps.critical('The records list is displayed read-only or with restricted options', async () => {
      await session.terminologyDetail.openExpectingFailure(terminology.id);
      expect(await session.terminologyDetail.isLoaded()).toBe(true);
      expect(await session.terminologyDetail.isGridRowShown('data', data.code)).toBe(true);
    });

    await steps.step('"Add Record", "Edit" and "Delete" are each hidden, disabled or blocked', async () => {
      const add = await session.terminologyDetail.getToolbarState('addRecord');
      const edit = await session.terminologyDetail.getRecordActionState(data.code, 'edit');
      const del = await session.terminologyDetail.getRecordActionState(data.code, 'delete');
      expect({ add: add.availability, edit: edit.availability, delete: del.availability })
        .toEqual({ add: expect.not.stringMatching(/^available$/), edit: expect.not.stringMatching(/^available$/), delete: expect.not.stringMatching(/^available$/) });
      const write = await session.terminologies.sendUpsertRecord(terminology.id, { Code: `${data.code}-NEW`, [IS_ACTIVE_FIELD]: 'true' });
      expect(write.status, 'a direct add should be refused').toBeGreaterThanOrEqual(400);
    });
  });

  test(`TC-${CASES.rapidEdits.azureId}: should leave a record in one consistent final state with no duplicates when it is edited twice in quick succession`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyRecordDialog,
    terminologyIn,
    secondWindow,
    steps,
  }) => {
    const data = CASES.rapidEdits;
    const terminology = await terminologyIn({ fields: RECORD_FIELDS, records: [{ Code: data.code, Description: 'Initial' }] });

    await steps.critical('Selecting the existing record shows its current values', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
      expect(await terminologyDetailPage.isGridRowShown('data', data.code)).toBe(true);
    });

    const answers: number[] = [];
    await steps.step('Two quick successive edits, each changing a different field and saved, each get a response', async () => {
      const second = await secondWindow();
      await second.detail.open(terminology.id);
      await terminologyDetailPage.openEditRecord(data.code);
      await terminologyRecordDialog.fill(terminology.fieldIds.Description, data.first);
      await second.detail.openEditRecord(data.code);
      answers.push((await terminologyRecordDialog.save()).status);
      const other = await second.terminologies.sendUpsertRecord(terminology.id, { Code: data.code, Description: data.second, [IS_ACTIVE_FIELD]: 'false' }, terminology.recordIds[0]);
      answers.push(other.status);
      expect(answers.every((s) => s > 0), `responses: ${answers.join(', ')}`).toBe(true);
    });

    await steps.step('Reopened, the record shows one consistent final state and no duplicate', async () => {
      const records = await terminologyManagementPage.fetchRecords(terminology.id);
      expect(records.filter((r) => r.cells.Code === data.code)).toHaveLength(1);
      expect([data.first, data.second]).toContain(records[0].cells.Description);
    });
  });
});
