import { test, expect } from '../../../fixtures';
import { IS_ACTIVE_FIELD, MESSAGE, TOAST_TEXT } from '../../../data/terminology/terminology.data';
import { BLOCKED_CASES, CASES, SIX } from '../../../data/terminology/predefinedTerminologies.data';
import { mappingTo } from '../../../data/terminology/retireValues.data';

/**
 * User story 17436: Predefined Terminologies.
 * The six predefined lists (Street, District, City, Country, Policy Holder,
 * Trades): imported on setup, their values maintained by a privileged user
 * (add, edit, delete, activate, deactivate) under the value rules, each list
 * independent, the categories themselves fixed, and everything read-only to a
 * non-privileged user.
 */
test.describe('US 17436 - Predefined Terminologies', () => {
  test(`TC-${CASES.importedOnSetup.azureId}: should list all six predefined categories with their imported values when the system is freshly provisioned`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    steps,
  }) => {
    let register: { id: string; name: string; recordCount: number; isPredefined: boolean }[] = [];

    await steps.critical('Navigate to the Terminology Management module - the six predefined lists are shown with their values', async () => {
      await terminologyManagementPage.open();
      register = (await terminologyManagementPage.fetchRegister()).items;
    });

    await steps.step('The overview shows all six predefined categories: Street, District, City, Country, Policy Holder and Trades', async () => {
      const predefined = register.filter((t) => t.isPredefined).map((t) => t.name);
      expect(predefined.sort()).toEqual([...SIX].sort());
    });

    await steps.step('Each category shows its imported values with no missing or blank entries', async () => {
      const blank: string[] = [];
      for (const name of SIX) {
        const t = register.find((r) => r.name === name);
        await terminologyDetailPage.open(t?.id ?? '');
        const rows = await terminologyDetailPage.readGrid('data');
        blank.push(...rows.filter((r) => Object.values(r.cells).filter((v) => v !== '').length === 0).map(() => name));
        expect(rows.length, `${name} values`).toBeGreaterThan(0);
      }
      expect(blank, 'categories with blank entries').toEqual([]);
    });

    await steps.step('The values match the back-end source in name and count', async () => {
      for (const name of SIX) {
        const t = register.find((r) => r.name === name);
        expect((await terminologyManagementPage.fetchRecords(t?.id ?? '')).length, `${name} count`).toBe(t?.recordCount);
      }
    });
  });

  test(`TC-${CASES.add.azureId}: should add the value as active and keep it when a privileged user adds a value to the City list`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    predefinedTerminology,
    sampleRecordFor,
    discardRecordShowing,
    steps,
  }) => {
    const data = CASES.add;
    const city = await predefinedTerminology({ name: data.list, unlocked: true });
    const sample = await sampleRecordFor(city.id, data.value());
    discardRecordShowing(city.id, sample.labelValue);

    await steps.critical(`View on "${data.list}" shows its existing values`, async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(city.name);
      expect((await terminologyDetailPage.readGrid('data')).length).toBeGreaterThan(0);
    });

    await steps.step(`"Add" accepts "${sample.labelValue}" and saving confirms it`, async () => {
      const answer = await terminologyDetailPage.addRecordFrom(sample);
      expect(answer.status, answer.validationErrors.join('; ')).toBe(200);
      expect(answer.messages.join(' | ')).toMatch(TOAST_TEXT.recordSaved);
    });

    await steps.step('Reopened, the list shows the new value as active', async () => {
      const row = (await terminologyManagementPage.fetchRecords(city.id)).find((r) => r.cells[sample.labelField] === sample.labelValue);
      expect(row?.cells[IS_ACTIVE_FIELD]).toBe('true');
    });
  });

  test(`TC-${CASES.edit.azureId}: should keep the new name when a privileged user edits a District value`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyRecordDialog,
    predefinedTerminology,
    sampleRecordFor,
    recordIn,
    steps,
  }) => {
    const data = CASES.edit;
    const district = await predefinedTerminology({ name: data.list, unlocked: true });
    const sample = await sampleRecordFor(district.id, data.original());
    await recordIn(district.id, sample.cells);
    const updated = `${sample.labelValue}${data.updated}`.slice(0, sample.labelMaxLength || undefined);

    await steps.critical(`View on "${data.list}" shows the existing values`, async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(district.name);
      expect(await terminologyDetailPage.isGridRowShown('data', sample.labelValue)).toBe(true);
    });

    await steps.step('"Edit" makes the value editable', async () => {
      await terminologyDetailPage.openEditRecord(sample.labelValue);
      expect(await terminologyRecordDialog.getValue(sample.labelFieldId)).toBe(sample.labelValue);
    });

    await steps.step('A valid new name is saved with a confirmation', async () => {
      await terminologyRecordDialog.type(sample.labelFieldId, updated);
      const answer = await terminologyRecordDialog.save();
      expect(answer.status).toBe(200);
    });

    await steps.step('Reopened, the value shows the updated name', async () => {
      expect((await terminologyManagementPage.fetchRecords(district.id)).map((r) => r.cells[sample.labelField])).toContain(updated);
    });
  });

  test(`TC-${CASES.deleteUnused.azureId}: should remove the value from the list when a privileged user deletes an unused Trades value`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    predefinedTerminology,
    sampleRecordFor,
    recordIn,
    steps,
  }) => {
    const data = CASES.deleteUnused;
    const trades = await predefinedTerminology({ name: data.list, unlocked: true });
    const sample = await sampleRecordFor(trades.id, data.value());
    await recordIn(trades.id, sample.cells);

    await steps.critical(`View on "${data.list}" shows its values`, async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(trades.name);
      await terminologyDetailPage.searchGrid('data', sample.labelValue);
      expect(await terminologyDetailPage.isGridRowShown('data', sample.labelValue)).toBe(true);
    });

    await steps.step('"Delete" on the unused value asks for confirmation', async () => {
      const dialog = await terminologyDetailPage.requestDeleteRecord(sample.labelValue);
      expect(await dialog.getMessage()).toMatch(/delete/i);
      await dialog.cancel();
    });

    await steps.step('Confirming shows a success message and removes the value', async () => {
      const answer = await terminologyDetailPage.deleteRecord(sample.labelValue);
      expect(answer.status).toBe(200);
      expect(answer.messages.join(' | ')).toMatch(TOAST_TEXT.recordDeleted);
    });

    await steps.step('Reopened, the deleted value no longer appears', async () => {
      expect((await terminologyManagementPage.fetchRecords(trades.id)).map((r) => r.cells[sample.labelField])).not.toContain(sample.labelValue);
    });
  });

  test(`TC-${CASES.deactivate.azureId}: should make a Country value Inactive and no longer selectable in other modules when it is deactivated`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyRecordDialog,
    predefinedTerminology,
    sampleRecordFor,
    recordIn,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.deactivate;
    const country = await predefinedTerminology({ name: data.list, unlocked: true });
    const sample = await sampleRecordFor(country.id, data.value());
    await recordIn(country.id, { ...sample.cells, [IS_ACTIVE_FIELD]: 'true' });
    const unique = (await terminologyManagementPage.fetchTerminology(country.id))?.fields.find((f) => f.isUnique) ?? { id: sample.labelFieldId, name: sample.labelField };
    const consumer = await terminologyIn({ fields: [{ name: 'Code', type: 'text', required: true, unique: true }, mappingTo(country.id, unique.id, 'Country')] });

    await steps.critical(`View on "${data.list}" shows values with their Active / Inactive status`, async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(country.name);
      await terminologyDetailPage.searchGrid('data', sample.labelValue);
      expect(await terminologyDetailPage.isGridRowShown('data', sample.labelValue)).toBe(true);
    });

    await steps.step('"Deactivate" on the active value asks for confirmation', async () => {
      expect((await terminologyDetailPage.getRecordRowControls(sample.labelValue)).join(' | '), 'a Deactivate control on the value').toMatch(data.control);
    });

    await steps.critical('Confirming changes the value to "Inactive" with a success message', async () => {
      const answer = await terminologyDetailPage.setRecordActive(sample.labelValue, false);
      expect(answer.status).toBe(200);
      const row = (await terminologyManagementPage.fetchRecords(country.id)).find((r) => r.cells[sample.labelField] === sample.labelValue);
      expect(row?.cells[IS_ACTIVE_FIELD]).toBe('false');
    });

    await steps.step('Another module consuming the Country list no longer offers the value', async () => {
      await terminologyDetailPage.open(consumer.id);
      await terminologyDetailPage.openAddRecord();
      const offered = await terminologyRecordDialog.getOptions(consumer.fieldIds.Country);
      await terminologyRecordDialog.cancel();
      expect(offered.join(' | ')).not.toContain(sample.cells[unique.name] ?? sample.labelValue);
    });
  });

  test(`TC-${CASES.reactivate.azureId}: should return an inactive Street value to Active and selectable in other modules when it is activated`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyRecordDialog,
    predefinedTerminology,
    sampleRecordFor,
    recordIn,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.reactivate;
    const street = await predefinedTerminology({ name: data.list, unlocked: true });
    const sample = await sampleRecordFor(street.id, data.value());
    await recordIn(street.id, { ...sample.cells, [IS_ACTIVE_FIELD]: 'false' });
    const unique = (await terminologyManagementPage.fetchTerminology(street.id))?.fields.find((f) => f.isUnique) ?? { id: sample.labelFieldId, name: sample.labelField };
    const consumer = await terminologyIn({ fields: [{ name: 'Code', type: 'text', required: true, unique: true }, mappingTo(street.id, unique.id, 'Street')] });

    await steps.critical(`View on "${data.list}" shows the value with status "Inactive"`, async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(street.name);
      await terminologyDetailPage.searchGrid('data', sample.labelValue);
      expect(await terminologyDetailPage.isGridRowShown('data', sample.labelValue)).toBe(true);
    });

    await steps.step('"Activate" on the inactive value asks for confirmation', async () => {
      expect((await terminologyDetailPage.getRecordRowControls(sample.labelValue)).join(' | '), 'an Activate control on the value').toMatch(data.control);
    });

    await steps.critical('Confirming changes the value to "Active" with a success message', async () => {
      expect((await terminologyDetailPage.setRecordActive(sample.labelValue, true)).status).toBe(200);
      const row = (await terminologyManagementPage.fetchRecords(street.id)).find((r) => r.cells[sample.labelField] === sample.labelValue);
      expect(row?.cells[IS_ACTIVE_FIELD]).toBe('true');
    });

    await steps.step('Another module consuming the Street list offers the value again', async () => {
      await terminologyDetailPage.open(consumer.id);
      await terminologyDetailPage.openAddRecord();
      const offered = await terminologyRecordDialog.getOptions(consumer.fieldIds.Street);
      await terminologyRecordDialog.cancel();
      expect(offered.join(' | ')).toContain(sample.cells[unique.name] ?? sample.labelValue);
    });
  });

  test(`TC-${CASES.blank.azureId}: should reject it with a required-field message when a blank value is saved`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    predefinedTerminology,
    sampleRecordFor,
    steps,
  }) => {
    const city = await predefinedTerminology({ name: CASES.blank.list, unlocked: true });
    const sample = await sampleRecordFor(city.id, 'Blank');
    let before = -1;

    await steps.critical('Selecting the City list and clicking "Add" shows an empty input', async () => {
      before = (await terminologyManagementPage.fetchRecords(city.id)).length;
      await terminologyDetailPage.open(city.id);
    });

    await steps.step('Saving with the value blank shows a required-field message', async () => {
      const answer = await terminologyDetailPage.addRecordFrom(sample, '');
      expect(answer.status).not.toBe(200);
      expect([...answer.messages, ...answer.validationErrors].join(' | ')).toMatch(MESSAGE.required);
    });

    await steps.step('No new record is created and the list is unchanged', async () => {
      expect((await terminologyManagementPage.fetchRecords(city.id)).length).toBe(before);
    });
  });

  test(`TC-${CASES.maxLength.azureId}: should accept the maximum length and reject one character more when Trades values are saved at and over the limit`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    predefinedTerminology,
    sampleRecordFor,
    discardRecordShowing,
    steps,
  }) => {
    const data = CASES.maxLength;
    const trades = await predefinedTerminology({ name: data.list, unlocked: true });
    const sample = await sampleRecordFor(trades.id, 'MAXLEN');
    const max = sample.labelMaxLength || data.fallbackMax;
    const atMax = `MAXLEN${'X'.repeat(max)}`.slice(0, max);
    const overMax = `OVERLEN${'Y'.repeat(max + 1)}`.slice(0, max + 1);
    discardRecordShowing(trades.id, 'MAXLEN');
    discardRecordShowing(trades.id, 'OVERLEN');

    await steps.critical('Selecting the Trades list and clicking "Add" shows an empty input', async () => {
      await terminologyDetailPage.open(trades.id);
    });

    await steps.step(`A value of exactly ${max} characters is accepted and saved`, async () => {
      expect((await terminologyDetailPage.addRecordFrom(sample, atMax)).status).toBe(200);
    });

    await steps.step(`A value of ${max + 1} characters is refused with a message, or cut to the limit`, async () => {
      const answer = await terminologyDetailPage.addRecordFrom(sample, overMax);
      const stored = (await terminologyManagementPage.fetchRecords(trades.id)).map((r) => r.cells[sample.labelField]);
      expect(stored, 'the over-length value stored in full').not.toContain(overMax);
      expect(answer.status !== 200 || stored.every((v) => v.length <= max), 'refused, or truncated to the limit').toBe(true);
    });
  });

  test(`TC-${CASES.duplicate.azureId}: should refuse the value and keep a single instance when a District value duplicates an existing one`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    predefinedTerminology,
    sampleRecordFor,
    steps,
  }) => {
    const district = await predefinedTerminology({ name: CASES.duplicate.list, unlocked: true });
    const sample = await sampleRecordFor(district.id, 'DUPLICATE');
    const existing = (await terminologyManagementPage.fetchRecords(district.id))[0]?.cells[sample.labelField] ?? '';

    await steps.critical('Selecting the District list and clicking "Add" shows an empty input', async () => {
      await terminologyDetailPage.open(district.id);
    });

    await steps.step(`Saving "${existing}", identical to an existing value, says it already exists`, async () => {
      const answer = await terminologyDetailPage.addRecordFrom(sample, existing);
      expect(answer.status).not.toBe(200);
      expect([...answer.messages, ...answer.validationErrors].join(' | ')).toMatch(MESSAGE.unique);
    });

    await steps.step('The list still shows only one instance of the value', async () => {
      expect((await terminologyManagementPage.fetchRecords(district.id)).filter((r) => r.cells[sample.labelField] === existing)).toHaveLength(1);
    });
  });

  test(`TC-${CASES.categoriesLocked.azureId}: should offer no way to delete, rename or add a category when the predefined categories are managed`, async ({
    terminologyManagementPage,
    steps,
  }) => {
    await steps.critical('Navigate to the Terminology Management module - the predefined categories are displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('None of the six categories offers a "Delete Category" or "Rename Category" option', async () => {
      const offered: string[] = [];
      for (const name of SIX) {
        const states = await terminologyManagementPage.readActionStates(name);
        offered.push(...(['delete', 'edit'] as const).filter((a) => states[a].availability === 'available').map((a) => `${name}: ${a}`));
      }
      expect(offered, 'category-level delete / rename offered').toEqual([]);
    });

    await steps.step('The category list stays exactly the original locked set and no new category can be added', async () => {
      await terminologyManagementPage.open();
      expect((await terminologyManagementPage.fetchRegister()).items.filter((t) => t.isPredefined).map((t) => t.name).sort()).toEqual([...SIX].sort());
      expect(await terminologyManagementPage.isAddOffered(), 'Add Terminology (a new category)').toBe(false);
    });
  });

  test(`TC-${CASES.nonPrivileged.azureId}: should show the lists read-only when a standard user opens the predefined terminologies`, async ({
    predefinedTerminology,
    shapedNonAdmin,
    requireListAccess,
    steps,
  }) => {
    const list = await predefinedTerminology();
    const session = await shapedNonAdmin(CASES.nonPrivileged.granted);
    await requireListAccess(session);

    await steps.critical('The module opens read-only with management controls disabled or hidden', async () => {
      await session.terminologyDetail.openExpectingFailure(list.id);
      expect(await session.terminologyDetail.isLoaded()).toBe(true);
    });

    await steps.step('Add, Edit, Delete, Activate and Deactivate are all disabled, hidden or denied', async () => {
      const add = await session.terminologyDetail.getToolbarState('addRecord');
      const header = await session.terminologyDetail.readActionStates();
      const first = (await session.terminologyDetail.readGrid('data'))[0];
      const firstText = Object.values(first?.cells ?? {}).find((v) => v !== '') ?? '';
      const edit = await session.terminologyDetail.getRecordActionState(firstText, 'edit');
      const del = await session.terminologyDetail.getRecordActionState(firstText, 'delete');
      const offered = { add: add.availability, edit: edit.availability, delete: del.availability, status: header.toggleActive.availability };
      expect(Object.entries(offered).filter(([, a]) => a === 'available').map(([k]) => k), 'management actions offered').toEqual([]);
    });

    await steps.step('The list of values is still visible for reference', async () => {
      expect((await session.terminologyDetail.readGrid('data')).length).toBeGreaterThan(0);
    });
  });

  test(`TC-${CASES.independentLists.azureId}: should keep the value out of every other list when a value is added to Policy Holder`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    predefinedTerminology,
    sampleRecordFor,
    discardRecordShowing,
    steps,
  }) => {
    const data = CASES.independentLists;
    const holder = await predefinedTerminology({ name: data.list, unlocked: true });
    const sample = await sampleRecordFor(holder.id, data.value());
    discardRecordShowing(holder.id, sample.labelValue);
    let register: { id: string; name: string }[] = [];

    await steps.critical('The module shows the six lists as separate, independently selectable sections', async () => {
      await terminologyManagementPage.open();
      register = (await terminologyManagementPage.fetchRegister()).items.filter((t) => (SIX as readonly string[]).includes(t.name));
      expect(register).toHaveLength(SIX.length);
    });

    await steps.step(`Adding "${sample.labelValue}" to Policy Holder shows it only there`, async () => {
      await terminologyDetailPage.open(holder.id);
      expect((await terminologyDetailPage.addRecordFrom(sample)).status).toBe(200);
      expect(JSON.stringify(await terminologyManagementPage.fetchRecords(holder.id))).toContain(sample.labelValue);
    });

    await steps.step('Trades, Street, District, City and Country each hold only their own values', async () => {
      for (const t of register.filter((r) => r.id !== holder.id)) {
        expect(JSON.stringify(await terminologyManagementPage.fetchRecords(t.id)), `${t.name} values`).not.toContain(sample.labelValue);
      }
    });
  });

  test(`TC-${CASES.invalidFormat.azureId}: should reject the value and create nothing when a City value holds special characters or script content`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    predefinedTerminology,
    sampleRecordFor,
    discardRecordShowing,
    steps,
  }) => {
    const data = CASES.invalidFormat;
    const city = await predefinedTerminology({ name: data.list, unlocked: true });
    const sample = await sampleRecordFor(city.id, 'INVALID');
    for (const value of data.invalid) discardRecordShowing(city.id, value);
    let before = -1;

    await steps.critical('Selecting the City list and clicking "Add" shows an empty input', async () => {
      before = (await terminologyManagementPage.fetchRecords(city.id)).length;
      await terminologyDetailPage.open(city.id);
    });

    await steps.step('Values with invalid characters or script tags are rejected with a format message', async () => {
      for (const value of data.invalid) {
        const answer = await terminologyDetailPage.addRecordFrom(sample, value);
        expect(answer.status, `"${value}" was answered ${answer.status}`).not.toBe(200);
        expect([...answer.messages, ...answer.validationErrors].join(' | ')).toMatch(MESSAGE.format);
      }
    });

    await steps.step('No record is created with the invalid values and the list is unchanged', async () => {
      expect((await terminologyManagementPage.fetchRecords(city.id)).length).toBe(before);
    });
  });

  test(`TC-${CASES.filterAndSearch.azureId}: should narrow the Country values when a status filter and a partial-name search are applied`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    predefinedTerminology,
    steps,
  }) => {
    const data = CASES.filterAndSearch;
    const country = await predefinedTerminology({ name: data.list });
    let isActiveId = '';

    await steps.critical('The module shows the list with search and status filter controls', async () => {
      isActiveId = (await terminologyManagementPage.fetchTerminology(country.id))?.fields.find((f) => f.name === IS_ACTIVE_FIELD)?.id ?? '';
      await terminologyDetailPage.open(country.id);
    });

    await steps.step('The Country list shows all values regardless of status', async () => {
      expect((await terminologyDetailPage.readGrid('data')).length).toBe(country.recordCount);
    });

    await steps.step('Filtering for Active shows only active values', async () => {
      expect(isActiveId, `${data.list} should carry the automatic Is Active field to filter its values by status`).not.toBe('');
      await terminologyDetailPage.filterRecords({ [isActiveId]: true });
      const shown = (await terminologyDetailPage.readGrid('data')).map((r) => r.cells[IS_ACTIVE_FIELD]);
      expect(shown.filter((v) => !/^(yes|true)$/i.test(v))).toEqual([]);
    });

    await steps.step('Filtering for Inactive shows only inactive values', async () => {
      expect(isActiveId, `${data.list} should carry the automatic Is Active field to filter its values by status`).not.toBe('');
      await terminologyDetailPage.open(country.id);
      await terminologyDetailPage.filterRecords({ [isActiveId]: false });
      const shown = (await terminologyDetailPage.readGrid('data')).map((r) => r.cells[IS_ACTIVE_FIELD]);
      expect(shown.filter((v) => /^(yes|true)$/i.test(v)), 'active values under an Inactive filter').toEqual([]);
    });

    await steps.step(`Searching "${data.search}" shows the matching value`, async () => {
      await terminologyDetailPage.open(country.id);
      await terminologyDetailPage.searchGrid('data', data.search);
      const rows = await terminologyDetailPage.readGrid('data');
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.filter((r) => !data.match.test(Object.values(r.cells).join(' '))), 'rows not matching the search').toEqual([]);
    });
  });

  test(`TC-${CASES.saveFailure.azureId}: should show a clear error when saving a value fails and save it on retry once the service recovers`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    predefinedTerminology,
    sampleRecordFor,
    discardRecordShowing,
    cleanup,
    steps,
  }) => {
    const data = CASES.saveFailure;
    const street = await predefinedTerminology({ name: data.list, unlocked: true });
    const sample = await sampleRecordFor(street.id, data.value());
    discardRecordShowing(street.id, sample.labelValue);
    cleanup.register(() => terminologyManagementPage.restoreEndpoints());

    await steps.critical('Selecting the Street list and clicking "Add" shows an empty input', async () => {
      await terminologyDetailPage.open(street.id);
    });

    await steps.step('Saving a valid value while the back-end is interrupted shows a clear error', async () => {
      await terminologyManagementPage.simulateFailure('UpsertTerminologyRow');
      const answer = await terminologyDetailPage.addRecordFrom(sample);
      expect(answer.messages.join(' | '), 'a save-failed message').toMatch(data.error);
    });

    await steps.step('After the connection is restored, retrying saves the value and it appears in the list', async () => {
      await terminologyManagementPage.restoreEndpoints();
      const answer = await terminologyDetailPage.addRecordFrom(sample);
      expect(answer.status).toBe(200);
      expect(JSON.stringify(await terminologyManagementPage.fetchRecords(street.id))).toContain(sample.labelValue);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
