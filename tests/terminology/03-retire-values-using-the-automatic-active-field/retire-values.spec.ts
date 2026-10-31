import { test, expect } from '../../../fixtures';
import { IS_ACTIVE_FIELD, MESSAGE } from '../../../data/terminology/terminology.data';
import { CASES, FIELD_MIXES, IS_ACTIVE_SHOWN, mappingTo } from '../../../data/terminology/retireValues.data';

/**
 * User story 15151: Retire Values Using the Automatic Active Field.
 * Every terminology carries an automatic Is Active field; a value is retired
 * by switching it off (never by deleting the record), retired values stop
 * being offered where the terminology is consumed, and the field itself can
 * neither be re-used by name nor removed.
 */
test.describe('US 15151 - Retire Values Using the Automatic Active Field', () => {
  test(`TC-${CASES.automatic.azureId}: should add an Is Active field automatically when a new terminology is created`, async ({
    terminologyManagementPage,
    terminologyFormDrawer,
    terminologyDetailPage,
    discardTerminologyNamed,
    steps,
  }) => {
    const data = CASES.automatic;
    const name = data.name();
    discardTerminologyNamed(name);

    await steps.critical('Navigate to the Terminology Management module - the module landing page loads', async () => {
      await terminologyManagementPage.open();
    });

    await steps.critical('A terminology with a name, description and one custom field is saved', async () => {
      await terminologyManagementPage.openAddForm();
      await terminologyFormDrawer.fillDetails({ name, description: data.description });
      await terminologyFormDrawer.next();
      await terminologyFormDrawer.addConfiguredField({ name: data.field });
      expect((await terminologyFormDrawer.save()).status).toBe(200);
    });

    await steps.step('Its field list holds an Is Active field the administrator never added', async () => {
      await terminologyManagementPage.openDetails(name);
      const fields = (await terminologyDetailPage.readFields()).map((f) => f.name);
      expect(fields).toEqual(expect.arrayContaining([data.field, IS_ACTIVE_FIELD]));
    });
  });

  test(`TC-${CASES.reserved.azureId}: should refuse the field as a reserved name when a custom field is named Is Active`, async ({
    terminologyManagementPage,
    terminologyFormDrawer,
    discardTerminologyNamed,
    steps,
  }) => {
    const data = CASES.reserved;
    const name = data.name();
    discardTerminologyNamed(name);

    await steps.critical('Adding a new custom field shows the field configuration panel', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openAddForm();
      await terminologyFormDrawer.fillDetails({ name, description: data.description });
      await terminologyFormDrawer.next();
      await terminologyFormDrawer.addField();
    });

    await steps.step(`The name "${data.field}" is entered as typed`, async () => {
      await terminologyFormDrawer.setFieldName(0, data.field);
      expect(await terminologyFormDrawer.getFieldNames()).toEqual([data.field]);
    });

    await steps.step('Saving shows that the name is reserved and the field is not saved', async () => {
      const answer = await terminologyFormDrawer.save();
      expect(answer.status, 'the reserved name should be refused').not.toBe(200);
      expect([...answer.messages, ...answer.validationErrors].join(' | ')).toMatch(MESSAGE.reserved);
      expect((await terminologyManagementPage.fetchRegister()).items.map((t) => t.name)).not.toContain(name);
    });
  });

  test(`TC-${CASES.deactivate.azureId}: should keep the record and only change its status when an active value is deactivated`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyRecordDialog,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.deactivate;
    const terminology = await terminologyIn({ records: [{ Code: data.code, [IS_ACTIVE_FIELD]: 'true' }] });

    await steps.critical('Navigate to the Terminology Management module and open the terminology', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
    });

    await steps.step('The value is listed with Is Active set to true', async () => {
      const row = (await terminologyDetailPage.readRecords()).find((r) => r.cells.Code === data.code);
      expect(row?.cells[IS_ACTIVE_FIELD]).toMatch(IS_ACTIVE_SHOWN.active);
    });

    await steps.critical('Deactivating it through its Is Active field changes Is Active to false', async () => {
      await terminologyDetailPage.openEditRecord(data.code);
      await terminologyRecordDialog.setActive(false);
      expect((await terminologyRecordDialog.save()).status).toBe(200);
      const row = (await terminologyDetailPage.readRecords()).find((r) => r.cells.Code === data.code);
      expect(row?.cells[IS_ACTIVE_FIELD]).toMatch(IS_ACTIVE_SHOWN.inactive);
    });

    await steps.step('Searching the value list still finds the record - only its status changed', async () => {
      await terminologyDetailPage.searchGrid('data', data.code);
      expect(await terminologyDetailPage.isGridRowShown('data', data.code)).toBe(true);
      expect((await terminologyManagementPage.fetchRecords(terminology.id)).map((r) => r.cells.Code)).toContain(data.code);
    });
  });

  test(`TC-${CASES.reactivate.azureId}: should return a deactivated value to active when it is reactivated`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyRecordDialog,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.reactivate;
    const terminology = await terminologyIn({ records: [{ Code: data.code, [IS_ACTIVE_FIELD]: 'false' }] });

    await steps.critical('Navigate to the Terminology Management module and open the terminology', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
    });

    await steps.step('The deactivated value is listed with Is Active set to false', async () => {
      const row = (await terminologyDetailPage.readRecords()).find((r) => r.cells.Code === data.code);
      expect(row?.cells[IS_ACTIVE_FIELD]).toMatch(IS_ACTIVE_SHOWN.inactive);
    });

    await steps.step('Reactivating it changes Is Active to true', async () => {
      await terminologyDetailPage.openEditRecord(data.code);
      await terminologyRecordDialog.setActive(true);
      expect((await terminologyRecordDialog.save()).status).toBe(200);
      const row = (await terminologyDetailPage.readRecords()).find((r) => r.cells.Code === data.code);
      expect(row?.cells[IS_ACTIVE_FIELD]).toMatch(IS_ACTIVE_SHOWN.active);
    });
  });

  test(`TC-${CASES.notOffered.azureId}: should offer only active values for selection and keep retired ones in the records when a terminology has active and deactivated values`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyRecordDialog,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.notOffered;
    const parent = await terminologyIn({ records: [{ Code: data.active, [IS_ACTIVE_FIELD]: 'true' }, { Code: data.retired, [IS_ACTIVE_FIELD]: 'false' }] });
    const child = await terminologyIn({ fields: [{ name: 'Child Code', type: 'text', required: true, unique: true }, mappingTo(parent.id, parent.fieldIds.Code)] });

    await steps.critical('Navigate to the Terminology Management module - the module landing page loads', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('A screen consuming the terminology\'s values offers only the active value', async () => {
      await terminologyManagementPage.openDetails(child.name);
      await terminologyDetailPage.openAddRecord();
      const offered = await terminologyRecordDialog.getOptions(child.fieldIds.Parent);
      await terminologyRecordDialog.cancel();
      expect(offered, 'the active value should be offered').toContain(data.active);
      expect(offered, 'the retired value must not be offered').not.toContain(data.retired);
    });

    await steps.step('The terminology\'s own value list shows both values with their statuses', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(parent.name);
      const rows = await terminologyDetailPage.readRecords();
      expect(rows.find((r) => r.cells.Code === data.active)?.cells[IS_ACTIVE_FIELD]).toMatch(IS_ACTIVE_SHOWN.active);
      expect(rows.find((r) => r.cells.Code === data.retired)?.cells[IS_ACTIVE_FIELD]).toMatch(IS_ACTIVE_SHOWN.inactive);
    });
  });

  test(`TC-${CASES.isActiveNotDeletable.azureId}: should offer no usable delete when the automatic Is Active field of a terminology is about to be removed`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyFormDrawer,
    terminologyIn,
    steps,
  }) => {
    const terminology = await terminologyIn();

    await steps.critical('Navigate to the Terminology Management module and open the terminology', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
    });

    await steps.step('The field list shows the Is Active field', async () => {
      expect((await terminologyDetailPage.readFields()).map((f) => f.name)).toContain(IS_ACTIVE_FIELD);
    });

    await steps.step('No usable delete is offered for the Is Active field', async () => {
      await terminologyDetailPage.openEditForm();
      await terminologyFormDrawer.next();
      expect(await terminologyFormDrawer.getRemoveAvailabilityOf(IS_ACTIVE_FIELD), 'removing Is Active').not.toBe('available');
      await terminologyFormDrawer.close();
      expect((await terminologyManagementPage.fetchTerminology(terminology.id))?.fields.map((f) => f.name)).toContain(IS_ACTIVE_FIELD);
    });
  });

  test(`TC-${CASES.consistent.azureId}: should carry the same Is Active field when terminologies have different field combinations`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyIn,
    steps,
  }) => {
    const plain = await terminologyIn({ fields: FIELD_MIXES[0] });
    const terminologies = [
      plain,
      await terminologyIn({ fields: FIELD_MIXES[1] }),
      await terminologyIn({ fields: FIELD_MIXES[2] }),
      await terminologyIn({ fields: [{ name: 'Code', type: 'text', required: true, unique: true }, mappingTo(plain.id, plain.fieldIds.Code)] }),
    ];
    const seen: string[] = [];

    await steps.critical('Navigate to the Terminology Management module - the module landing page loads', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('Each terminology with Text, Number, Date, Boolean and Mapping Identifier mixes shows its field list', async () => {
      for (const terminology of terminologies) {
        await terminologyManagementPage.open();
        await terminologyManagementPage.openDetails(terminology.name);
        const isActive = (await terminologyDetailPage.readFields()).find((f) => f.name === IS_ACTIVE_FIELD);
        seen.push(JSON.stringify({ type: isActive?.type, restriction: isActive?.restriction, required: isActive?.required, unique: isActive?.unique, showInTable: isActive?.showInTable }));
      }
      expect(seen).toHaveLength(terminologies.length);
    });

    await steps.step('Is Active is present and configured the same way in every terminology', async () => {
      expect(seen.filter((s) => s === JSON.stringify({})), 'terminologies without Is Active').toEqual([]);
      expect(new Set(seen).size, `Is Active configurations seen: ${[...new Set(seen)].join(' / ')}`).toBe(1);
      expect(JSON.parse(seen[0]).type).toMatch(CASES.consistent.type);
    });
  });

  test(`TC-${CASES.referenced.azureId}: should keep showing the value in the records that reference it when a referenced value is deactivated`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyRecordDialog,
    terminologyIn,
    recordIn,
    steps,
  }) => {
    const data = CASES.referenced;
    const parent = await terminologyIn({ records: [{ Code: data.parentCode, [IS_ACTIVE_FIELD]: 'true' }] });
    const child = await terminologyIn({ fields: [{ name: 'Code', type: 'text', required: true, unique: true }, mappingTo(parent.id, parent.fieldIds.Code)] });
    await recordIn(child.id, { Code: data.childCode, Parent: parent.recordIds[0] });

    await steps.critical('Navigate to the Terminology Management module and open the referenced terminology', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(parent.name);
    });

    await steps.critical('Deactivating the value used by an existing record changes its status to inactive', async () => {
      await terminologyDetailPage.openEditRecord(data.parentCode);
      await terminologyRecordDialog.setActive(false);
      expect((await terminologyRecordDialog.save()).status).toBe(200);
      const row = (await terminologyDetailPage.readRecords()).find((r) => r.cells.Code === data.parentCode);
      expect(row?.cells[IS_ACTIVE_FIELD]).toMatch(IS_ACTIVE_SHOWN.inactive);
    });

    await steps.step('The record that references it still shows the value it selected, with no loss or error', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(child.name);
      const row = (await terminologyDetailPage.readRecords()).find((r) => r.cells.Code === data.childCode);
      expect(row?.cells.Parent, 'the referencing record\'s Parent value').toBe(data.parentCode);
      expect(await terminologyDetailPage.waitForVisibleMessages(), 'no error should be shown').toEqual([]);
    });
  });

  test(`TC-${CASES.noPermission.azureId}: should withhold the Is Active change when the user's role cannot modify terminology values`, async ({
    terminologyManagementPage,
    terminologyIn,
    shapedNonAdmin,
    requireListAccess,
    steps,
  }) => {
    const data = CASES.noPermission;
    const terminology = await terminologyIn({ records: [{ Code: data.code, [IS_ACTIVE_FIELD]: 'true' }] });
    const session = await shapedNonAdmin(data.granted);
    await requireListAccess(session);

    await steps.critical('Navigate to the Terminology Management module - the terminology list loads', async () => {
      await session.terminologyDetail.openExpectingFailure(terminology.id);
      expect(await session.terminologyDetail.isLoaded(), 'the view-only user should reach the terminology').toBe(true);
    });

    await steps.step('Changing the value\'s Is Active is disabled or denied with a permission error', async () => {
      const edit = await session.terminologyDetail.getRecordActionState(data.code, 'edit');
      expect(edit.availability, 'the record Edit control').not.toBe('available');
      const answer = await session.terminologies.sendUpsertRecord(terminology.id, { Code: data.code, [IS_ACTIVE_FIELD]: 'false' }, terminology.recordIds[0]);
      expect(answer.status, `the server answered ${answer.status}`).toBeGreaterThanOrEqual(400);
      expect((await terminologyManagementPage.fetchRecords(terminology.id))[0]?.cells[IS_ACTIVE_FIELD]).toBe('true');
    });
  });
});
