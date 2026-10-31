import { test, expect } from '../../../fixtures';
import { MESSAGE } from '../../../data/terminology/terminology.data';
import { CASES, OVERVIEW_FIELDS, OVERVIEW_LABELS, SHEET_TABS } from '../../../data/terminology/terminologyDetails.data';

/**
 * User story 17435: View Terminology Details.
 * The details page's Overview, Fields, Upload Errors and Audit History tabs:
 * what each shows, how missing values and empty tabs are presented, that the
 * terminology's context holds across tabs and entry points, that the actions
 * match the viewer's permissions, and a removed terminology's stale link.
 */
test.describe('US 17435 - View Terminology Details', () => {
  test(`TC-${CASES.overview.azureId}: should show the Arabic Name, English Name, City and Actions when the Overview tab is opened`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyIn,
    steps,
  }) => {
    const record = CASES.overview.record;
    const terminology = await terminologyIn({ fields: OVERVIEW_FIELDS, records: [record] });

    await steps.critical('Navigate to the Terminology Management module - the terminology list is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('View opens the details page with Overview, Fields, Upload Errors and Audit History tabs', async () => {
      await terminologyManagementPage.openDetails(terminology.name);
      const tabs = await terminologyDetailPage.getTabLabels();
      for (const tab of SHEET_TABS) expect(tabs.some((t) => tab.test(t)), `${tab} among ${tabs.join(', ')}`).toBe(true);
    });

    await steps.step('The Overview tab shows the Arabic Name, English Name, City and the available Actions', async () => {
      expect(await terminologyDetailPage.hasTab('overview'), 'an Overview tab').toBe(true);
      await terminologyDetailPage.openTab('overview');
      const text = await terminologyDetailPage.getScreenText();
      for (const label of OVERVIEW_LABELS) expect(text).toMatch(label);
      for (const value of Object.values(record)) expect(text).toContain(value);
    });
  });

  test(`TC-${CASES.fields.azureId}: should list every configured field when the Fields tab is opened`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyIn,
    steps,
  }) => {
    const terminology = await terminologyIn({ fields: CASES.fields.fields });

    await steps.critical('View opens the details page', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
    });

    await steps.step('The Fields tab lists every configured field', async () => {
      expect((await terminologyDetailPage.readFields()).map((f) => f.name).sort()).toEqual([...CASES.fields.expected].sort());
    });
  });

  test(`TC-${CASES.uploadErrors.azureId}: should list each failed upload with its error details when the Upload Errors tab is opened`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyIn,
    completedImport,
    steps,
  }) => {
    const data = CASES.uploadErrors;
    const terminology = await terminologyIn();
    const job = await completedImport(terminology.id, data.headers, data.rows);

    await steps.critical('View opens the details page of the terminology with a failed upload', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
    });

    await steps.step('The Upload Errors tab lists each failed upload with its error details', async () => {
      const rows = await terminologyDetailPage.readErrorRows();
      expect(rows).toHaveLength(job.failedRows);
      expect(rows.filter((r) => r.errors.join('').trim() === ''), 'rows without error details').toEqual([]);
    });
  });

  test(`TC-${CASES.auditHistory.azureId}: should show actions, users, timestamps and old and new values when the Audit History tab is opened`, async ({
    terminologyDetailPage,
    terminologyWithHistory,
    steps,
  }) => {
    const data = CASES.auditHistory;
    const terminology = await terminologyWithHistory({}, [{ description: data.before }, { description: data.after }]);

    await steps.critical('View opens the details page of the terminology with prior changes', async () => {
      await terminologyDetailPage.open(terminology.id);
    });

    await steps.step('The Audit History tab shows the actions, users, timestamps and old / new values', async () => {
      await terminologyDetailPage.audit().open();
      const [latest] = await terminologyDetailPage.audit().readEntries();
      expect(latest.action).not.toBe('');
      expect(latest.by).not.toBe('');
      expect(latest.when).toMatch(/\d{2}\/\d{2}\/\d{4}/);
      const entry = await terminologyDetailPage.audit().openEntry(0);
      await terminologyDetailPage.audit().closeEntry();
      expect(entry.changes.map((c) => ({ before: c.before, after: c.after }))).toContainEqual({ before: data.before, after: data.after });
    });
  });

  test(`TC-${CASES.blankArabic.azureId}: should show the field empty or with a placeholder without breaking the page when the Arabic name is blank`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    languageSwitcher,
    terminologyIn,
    cleanup,
    steps,
  }) => {
    const terminology = await terminologyIn({ fields: OVERVIEW_FIELDS, records: [CASES.blankArabic.record] });
    cleanup.register(() => languageSwitcher.switchTo('en'));

    await steps.critical('Navigate to the Terminology Management module - the terminology list is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.critical('In Arabic, View opens the details page of the terminology with a blank Arabic name', async () => {
      await languageSwitcher.switchTo('ar');
      await terminologyDetailPage.open(terminology.id);
    });

    await steps.step('The Overview tab shows the Arabic Name as empty or with a clear placeholder, with no error or broken layout', async () => {
      expect(await terminologyDetailPage.hasTab('overview'), 'an Overview tab').toBe(true);
      await terminologyDetailPage.openTab('overview');
      expect(await terminologyDetailPage.waitForVisibleMessages(), 'no error should be shown').toEqual([]);
    });
  });

  test(`TC-${CASES.blankEnglish.azureId}: should show the field empty or with a placeholder without breaking the page when the English name is blank`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyIn,
    steps,
  }) => {
    const fields = OVERVIEW_FIELDS.map((f) => ({ ...f, required: false, unique: false }));
    const terminology = await terminologyIn({ fields, records: [CASES.blankEnglish.record] });

    await steps.critical('View opens the details page of the terminology with a blank English name', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
    });

    await steps.step('The Overview tab shows the English Name as empty or with a clear placeholder, with no error or broken layout', async () => {
      expect(await terminologyDetailPage.hasTab('overview'), 'an Overview tab').toBe(true);
      await terminologyDetailPage.openTab('overview');
      expect(await terminologyDetailPage.waitForVisibleMessages(), 'no error should be shown').toEqual([]);
    });
  });

  test(`TC-${CASES.tabContext.azureId}: should keep showing the same terminology when the user moves between its detail tabs`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyIn,
    steps,
  }) => {
    const terminology = await terminologyIn({ records: [{ Code: 'CONTEXT-1' }] });

    await steps.critical('View opens the details page on the Overview tab', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
      expect(await terminologyDetailPage.getActiveTab(), 'the tab the details page opens on').toBe('overview');
    });

    await steps.step('Fields, Upload Errors and Audit History in turn each load data for the same terminology', async () => {
      const names: string[] = [];
      for (const tab of CASES.tabContext.tabs) {
        await terminologyDetailPage.openTab(tab);
        names.push(await terminologyDetailPage.getName());
      }
      expect(names).toEqual(CASES.tabContext.tabs.map(() => terminology.name));
    });

    await steps.step('Returning to the first tab still shows the original terminology\'s details', async () => {
      expect((await terminologyDetailPage.readRecords()).map((r) => r.cells.Code)).toEqual(['CONTEXT-1']);
    });
  });

  test(`TC-${CASES.noUploadErrors.azureId}: should show a clear empty state on the Upload Errors tab when the last upload had no errors`, async ({
    terminologyDetailPage,
    terminologyIn,
    completedImport,
    steps,
  }) => {
    const terminology = await terminologyIn();
    await completedImport(terminology.id, ['Code', 'Is Active'], [['CLEAN-1', 'true']]);

    await steps.critical('View opens the details page of the terminology with a fully successful upload', async () => {
      await terminologyDetailPage.open(terminology.id);
    });

    await steps.step('The Upload Errors tab shows a clear empty state indicating no upload errors', async () => {
      expect(await terminologyDetailPage.readErrorRows()).toEqual([]);
      expect(await terminologyDetailPage.getGridPanelText('errors')).toMatch(CASES.noUploadErrors.empty);
    });
  });

  test(`TC-${CASES.actionsByPermission.azureId}: should show only the actions the viewer's permission allows when users with different permissions open the Overview`, async ({
    terminologyDetailPage,
    terminologyIn,
    shapedNonAdmin,
    requireListAccess,
    steps,
  }) => {
    const terminology = await terminologyIn();
    const session = await shapedNonAdmin(CASES.actionsByPermission.granted);
    await requireListAccess(session);

    await steps.critical('Navigate to the Terminology Management module as the view-only user', async () => {
      await session.terminologyDetail.openExpectingFailure(terminology.id);
      expect(await session.terminologyDetail.isLoaded()).toBe(true);
    });

    await steps.step('As the view-only user the Actions area shows no edit or delete option', async () => {
      const actions = await session.terminologyDetail.readActionStates();
      expect({ edit: actions.edit.availability, delete: actions.delete.availability }).toEqual({ edit: expect.not.stringMatching(/^available$/), delete: expect.not.stringMatching(/^available$/) });
    });

    await steps.step('As the user with full rights the Actions area shows edit and delete alongside view', async () => {
      await terminologyDetailPage.open(terminology.id);
      const actions = await terminologyDetailPage.readActionStates();
      expect({ edit: actions.edit.availability, delete: actions.delete.availability }).toEqual({ edit: 'available', delete: 'available' });
    });
  });

  test(`TC-${CASES.deleted.azureId}: should show a clear not-found message when a removed terminology's details are opened`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyIn,
    steps,
  }) => {
    const terminology = await terminologyIn();

    await steps.critical('Navigate to the Terminology Management module - the terminology list is displayed', async () => {
      await terminologyManagementPage.open();
      expect((await terminologyManagementPage.sendDelete(terminology.id)).status).toBe(200);
    });

    await steps.step('Opening the removed terminology from a stale link shows a clear "not found" message, not a broken or blank page', async () => {
      await terminologyDetailPage.openExpectingFailure(terminology.id);
      const said = [...(await terminologyDetailPage.waitForVisibleMessages()), await terminologyManagementPage.getPageText()].join(' | ');
      expect(said, 'a not-found message').toMatch(MESSAGE.notFound);
    });
  });

  test(`TC-${CASES.fieldConstraints.azureId}: should show each field's data type, required status and format when the Fields tab is opened`, async ({
    terminologyDetailPage,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.fieldConstraints;
    const terminology = await terminologyIn({ fields: data.fields });

    await steps.critical('View opens the details page of the terminology with varied fields', async () => {
      await terminologyDetailPage.open(terminology.id);
    });

    await steps.step('Every field\'s name, type, required status and format match its configuration', async () => {
      const fields = await terminologyDetailPage.readFields();
      for (const expected of data.expected) {
        const shown = fields.find((f) => f.name === expected.name);
        expect(shown?.type, `${expected.name} type`).toMatch(expected.type);
        expect(shown?.required, `${expected.name} required`).toMatch(expected.required);
      }
      expect(fields.find((f) => f.name === 'Effective Date')?.restriction).toMatch(/Date Only/i);
    });
  });

  test(`TC-${CASES.consistency.azureId}: should load the correct data on every tab when terminologies are opened from different entry points`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyIn,
    steps,
  }) => {
    const plain = await terminologyIn();
    const withData = await terminologyIn({ records: [{ Code: 'CONSISTENT-1' }] });

    await steps.critical('Navigate to the Terminology Management module - the terminology list is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('Several terminologies browsed across every tab, rapidly and revisited, each load their own data', async () => {
      for (const t of [plain, withData, plain]) {
        await terminologyDetailPage.open(t.id);
        for (const tab of ['schema', 'errors', 'audit', 'data'] as const) await terminologyDetailPage.openTab(tab);
        expect(await terminologyDetailPage.getName()).toBe(t.name);
      }
      expect((await terminologyDetailPage.readRecords()).length).toBe(0);
    });

    await steps.step('Opened from a search result the details page behaves the same as from the main list', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(withData.name);
      const fromSearch = (await terminologyDetailPage.readRecords()).map((r) => r.cells.Code);
      await terminologyDetailPage.open(withData.id);
      expect((await terminologyDetailPage.readRecords()).map((r) => r.cells.Code)).toEqual(fromSearch);
    });
  });

  test(`TC-${CASES.city.azureId}: should show each terminology's own city when their Overview tabs are opened`, async ({
    terminologyDetailPage,
    terminologyIn,
    steps,
  }) => {
    const [cityA, cityB] = CASES.city.cities;
    const first = await terminologyIn({ fields: OVERVIEW_FIELDS, records: [{ 'Arabic Name': 'جدة', 'English Name': 'First', City: cityA }] });
    const second = await terminologyIn({ fields: OVERVIEW_FIELDS, records: [{ 'Arabic Name': 'الدمام', 'English Name': 'Second', City: cityB }] });

    await steps.critical('View opens the details page of the terminology associated with the first city', async () => {
      await terminologyDetailPage.open(first.id);
    });

    await steps.step(`The Overview tab shows ${cityA}`, async () => {
      expect(await terminologyDetailPage.hasTab('overview'), 'an Overview tab').toBe(true);
      await terminologyDetailPage.openTab('overview');
      expect(await terminologyDetailPage.getScreenText()).toContain(cityA);
    });

    await steps.step(`The other terminology's Overview tab shows ${cityB}`, async () => {
      await terminologyDetailPage.open(second.id);
      await terminologyDetailPage.openTab('overview');
      expect(await terminologyDetailPage.getScreenText()).toContain(cityB);
    });
  });
});
