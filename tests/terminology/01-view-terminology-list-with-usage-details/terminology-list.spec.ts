import { test, expect } from '../../../fixtures';
import { TERMINOLOGY_COLUMN } from '../../../constants/ElementIds';
import { ACTION_LABEL, LOCKED_LABEL, MESSAGE, TERMINOLOGY_STATUS } from '../../../data/terminology/terminology.data';
import { CASES, REQUIRED_COLUMNS, ROW_ACTIONS } from '../../../data/terminology/viewTerminologyList.data';

/**
 * User story 15149: View Terminology list with Usage Details.
 * The list's columns and usage counts, the actions each row offers by status
 * and lock state, predefined and locked protection, the empty state, access
 * control, sorting / filtering and the read-only View screen.
 */
test.describe('US 15149 - View Terminology list with Usage Details', () => {
  test(`TC-${CASES.columns.azureId}: should list every terminology with its name, description, field and value counts, status, lock state and row actions when the module is opened`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const terminology = await terminologyIn({ records: [{ Code: 'USAGE-1' }] });

    await steps.critical('Navigate to the Terminology Management module - the module landing page loads', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('A list of terminologies is shown', async () => {
      expect(await terminologyManagementPage.countRows(), 'the list should show terminologies').toBeGreaterThan(0);
    });

    await steps.step('Description, Name, Fields (count of fields), Records (count of values), Status and Locked columns are all visible', async () => {
      const headers = await terminologyManagementPage.getHeaderTexts();
      for (const column of REQUIRED_COLUMNS) expect(headers.some((h) => column.test(h)), `a column matching ${column} among ${headers.join(', ')}`).toBe(true);
    });

    await steps.step('The usage counts shown match each terminology\'s configuration', async () => {
      const register = await terminologyManagementPage.fetchRegister();
      const names = await terminologyManagementPage.readNames();
      const fields = await terminologyManagementPage.readColumn(TERMINOLOGY_COLUMN.fields);
      const records = await terminologyManagementPage.readColumn(TERMINOLOGY_COLUMN.records);
      const mismatches = names
        .map((name, i) => ({ name, shown: `${fields[i]}/${records[i]}`, item: register.items.find((t) => t.name === name) }))
        .filter((row) => row.item !== undefined && row.shown !== `${row.item.fieldCount}/${row.item.recordCount}`)
        .map((row) => `${row.name}: shows ${row.shown}, holds ${row.item?.fieldCount}/${row.item?.recordCount}`);
      expect(mismatches, 'every row\'s Fields / Records should match the terminology').toEqual([]);
    });

    await steps.step('Selecting a row shows View, Edit, Inactivate/Activate, Lock/Unlock and Delete in its Actions', async () => {
      const states = await terminologyManagementPage.readActionStates(terminology.name);
      for (const action of ROW_ACTIONS) expect(states[action].availability, `the ${action} action`).not.toBe('absent');
      expect(states.toggleActive.label).toMatch(new RegExp(`^(${ACTION_LABEL.inactivate}|${ACTION_LABEL.activate})$`));
      expect(states.toggleLocked.label).toMatch(new RegExp(`^(${ACTION_LABEL.lock}|${ACTION_LABEL.unlock})$`));
    });
  });

  test(`TC-${CASES.predefinedMarked.azureId}: should mark a predefined terminology as predefined and withhold its Delete action when the list is shown`, async ({
    terminologyManagementPage,
    predefinedTerminology,
    steps,
  }) => {
    const predefined = await predefinedTerminology();

    await steps.critical('Navigate to the Terminology Management module - the terminology list loads', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step(`The predefined terminology "${predefined.name}" is visibly marked as predefined`, async () => {
      expect(await terminologyManagementPage.getRowText(predefined.name), 'the row should carry a predefined marker').toMatch(CASES.predefinedMarked.marker);
    });

    await steps.step('Its Delete action is disabled or hidden', async () => {
      const del = await terminologyManagementPage.getActionState(predefined.name, 'delete');
      expect(del.availability, 'Delete on a predefined terminology').not.toBe('available');
    });
  });

  test(`TC-${CASES.lockedNoEditDelete.azureId}: should withhold Edit and Delete from a locked terminology in both the table and the cards view when it is locked`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const locked = await terminologyIn({ locked: true });

    await steps.critical('Navigate to the Terminology Management module - the terminology list loads', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('The terminology shows the Locked indicator', async () => {
      expect((await terminologyManagementPage.readRow(locked.name)).locked).toBe(LOCKED_LABEL);
    });

    await steps.step('Its Edit action is disabled or blocked', async () => {
      expect((await terminologyManagementPage.getActionState(locked.name, 'edit')).availability).not.toBe('available');
    });

    await steps.step('Its Delete action is disabled or blocked', async () => {
      expect((await terminologyManagementPage.getActionState(locked.name, 'delete')).availability).not.toBe('available');
    });

    await steps.step('In the cards view the same terminology still shows it is locked, with Edit and Delete disabled or hidden', async () => {
      await terminologyManagementPage.switchToCards();
      expect(await terminologyManagementPage.isCardShown(locked.name), `a card for "${locked.name}"`).toBe(true);
      expect((await terminologyManagementPage.readCard(locked.name)).locked, 'the card\'s Locked value').toMatch(/yes|locked/i);
      expect((await terminologyManagementPage.getCardActionState(locked.name, 'edit')).availability).not.toBe('available');
      expect((await terminologyManagementPage.getCardActionState(locked.name, 'delete')).availability).not.toBe('available');
      await terminologyManagementPage.switchToTable();
    });
  });

  test(`TC-${CASES.unlock.azureId}: should restore Edit to a terminology when it is unlocked through the confirmation prompt`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const locked = await terminologyIn({ locked: true });

    await steps.critical('Navigate to the Terminology Management module - the terminology list loads', async () => {
      await terminologyManagementPage.open();
    });

    await steps.critical('Selecting Unlock on the locked terminology shows a confirmation prompt', async () => {
      const dialog = await terminologyManagementPage.requestAction(locked.name, 'toggleLocked');
      expect(await dialog.getTitle()).toMatch(/unlock/i);
      await dialog.confirm();
    });

    await steps.step('Confirming changes its Locked status to unlocked', async () => {
      expect((await terminologyManagementPage.readRow(locked.name)).locked).not.toBe(LOCKED_LABEL);
      expect((await terminologyManagementPage.fetchTerminology(locked.id))?.isLocked, 'the server should hold it unlocked').toBe(false);
    });

    await steps.step('The Edit screen opens on the now-unlocked terminology', async () => {
      const drawer = await terminologyManagementPage.openEditForm(locked.name);
      expect(await drawer.getNameValue()).toBe(locked.name);
      await drawer.close();
    });
  });

  test(`TC-${CASES.actionMatrix.azureId}: should offer the actions matching each status and lock combination when Active, Inactive and Locked terminologies are listed`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const active = await terminologyIn();
    const inactive = await terminologyIn({ active: false });
    const locked = await terminologyIn({ locked: true });

    await steps.critical('Navigate to the Terminology Management module - the terminology list loads', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('An Active, unlocked terminology offers View, Edit, Inactivate, Lock and Delete', async () => {
      const s = await terminologyManagementPage.readActionStates(active.name);
      expect([s.view, s.edit, s.toggleActive, s.toggleLocked, s.delete].map((a) => a.availability)).toEqual(Array(5).fill('available'));
      expect([s.toggleActive.label, s.toggleLocked.label]).toEqual([ACTION_LABEL.inactivate, ACTION_LABEL.lock]);
    });

    await steps.step('An Inactive, unlocked terminology offers View, Edit, Activate, Lock and Delete', async () => {
      const s = await terminologyManagementPage.readActionStates(inactive.name);
      expect([s.view, s.edit, s.toggleActive, s.toggleLocked, s.delete].map((a) => a.availability)).toEqual(Array(5).fill('available'));
      expect([s.toggleActive.label, s.toggleLocked.label]).toEqual([ACTION_LABEL.activate, ACTION_LABEL.lock]);
    });

    await steps.step('A Locked terminology offers only View and Unlock - Edit, Delete and Activate/Inactivate are disabled', async () => {
      const s = await terminologyManagementPage.readActionStates(locked.name);
      expect({ view: s.view.availability, unlock: s.toggleLocked.availability }).toEqual({ view: 'available', unlock: 'available' });
      expect(s.toggleLocked.label).toBe(ACTION_LABEL.unlock);
      const withheld = { Edit: s.edit, Delete: s.delete, [s.toggleActive.label || 'Activate/Inactivate']: s.toggleActive };
      expect(Object.entries(withheld).filter(([, state]) => state.availability === 'available').map(([name]) => name), 'actions a locked terminology must withhold, still enabled').toEqual([]);
    });
  });

  test(`TC-${CASES.emptyState.azureId}: should show a clear empty-state message instead of an error when no terminology exists`, async ({
    terminologyManagementPage,
    cleanup,
    steps,
  }) => {
    // The register always holds the six predefined terminologies, so "none
    // exist" is presented to the screen by answering its list request empty.
    cleanup.register(() => terminologyManagementPage.restoreEndpoints());
    await terminologyManagementPage.simulateEmptyRegister();

    await steps.critical('Navigate to the Terminology Management module - the module landing page loads', async () => {
      await terminologyManagementPage.openExpectingEmpty();
      expect(await terminologyManagementPage.getPageText(), 'the landing page should render').not.toBe('');
    });

    await steps.step('The list area shows an empty-state message saying no terminologies exist', async () => {
      expect(await terminologyManagementPage.getRowCount()).toBe(0);
      expect(await terminologyManagementPage.getEmptyStateText(), 'the empty-state message').toMatch(CASES.emptyState.empty);
      expect(await terminologyManagementPage.waitForVisibleMessages(), 'no error should be reported').toEqual([]);
    });
  });

  test(`TC-${CASES.counts.azureId}: should show accurate field and value counts when a terminology has only the default field and another has many fields and values`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.counts;
    const minimum = await terminologyIn({ fields: [...data.minimum.fields] });
    const maximum = await terminologyIn({ fields: [...data.maximum.fields], records: [...data.maximum.records] });

    await steps.critical('Navigate to the Terminology Management module - the terminology list loads', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('The terminology with only the default field and no values shows the minimum counts', async () => {
      const row = await terminologyManagementPage.readRow(minimum.name);
      const held = (await terminologyManagementPage.fetchTerminology(minimum.id))?.fields.length;
      expect({ fields: row.fields, records: row.records }).toEqual({ fields: String(held), records: data.minimum.expectedRecords });
    });

    await steps.step('The terminology with many fields and values shows counts matching its configuration', async () => {
      const row = await terminologyManagementPage.readRow(maximum.name);
      const held = (await terminologyManagementPage.fetchTerminology(maximum.id))?.fields.length;
      expect({ fields: row.fields, records: row.records }).toEqual({ fields: String(held), records: data.maximum.expectedRecords });
    });
  });

  test(`TC-${CASES.noAccess.azureId}: should deny the terminology list when the user's role holds no Terminology Management permission`, async ({
    terminologyManagementPage,
    shapedNonAdmin,
    requireBaseline,
    steps,
  }) => {
    await terminologyManagementPage.open();
    requireBaseline(await terminologyManagementPage.isModuleOffered(), 'the Terminology Mgmt menu entry');
    const session = await shapedNonAdmin({ without: CASES.noAccess.withdrawn });

    await steps.step('Navigating to the module is denied or the menu option is not visible, and no terminology list is displayed', async () => {
      expect(await session.terminologies.isModuleOffered(), 'the menu entry should be withheld').toBe(false);
      await session.terminologies.openExpectingDenial();
      expect(await session.terminologies.isListRendered(), 'no terminology list should render').toBe(false);
    });

    await steps.step('Reaching the list through another path stays blocked with a permission-denied message', async () => {
      await session.terminologies.openExpectingDenial();
      expect(await session.terminologies.getPageText(), 'a permission-denied message').toMatch(MESSAGE.denied);
    });
  });

  test(`TC-${CASES.predefinedBypass.azureId}: should reject deleting a predefined terminology when the request bypasses the disabled control`, async ({
    terminologyManagementPage,
    predefinedTerminology,
    steps,
  }) => {
    const predefined = await predefinedTerminology({ records: 'most' });

    await steps.critical('Navigate to the Terminology Management module - the terminology list loads', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('A delete sent directly for the predefined terminology is rejected and it remains in the list', async () => {
      const answer = await terminologyManagementPage.sendDelete(predefined.id);
      expect(answer.status, `the server answered ${answer.status} ${answer.text.slice(0, 160)}`).toBeGreaterThanOrEqual(400);
      expect(await terminologyManagementPage.isListed(predefined.name), `"${predefined.name}" should remain listed`).toBe(true);
    });
  });

  test(`TC-${CASES.sortAndFilter.azureId}: should sort by name and filter by status without losing rows when the controls are applied and cleared`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    await terminologyIn({ active: false });
    let total = -1;

    await steps.critical('Navigate to the Terminology Management module - the terminology list loads', async () => {
      total = (await terminologyManagementPage.captureList(() => terminologyManagementPage.open())).totalRows;
      expect(total).toBeGreaterThan(0);
    });

    await steps.step('Sorting by Terminology Name reorders the list alphabetically', async () => {
      const answer = await terminologyManagementPage.sortBy('name', 'asc');
      const names = answer.items.map((t) => t.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
      expect(await terminologyManagementPage.readNames()).toEqual(names);
    });

    await steps.step('Filtering by Status shows only terminologies of the selected status', async () => {
      const answer = await terminologyManagementPage.applyCriteria({ active: true });
      expect(answer.items.length).toBeGreaterThan(0);
      expect(answer.items.filter((t) => !t.isActive).map((t) => t.name), 'inactive rows under an Active filter').toEqual([]);
      const statuses = await terminologyManagementPage.readColumn(TERMINOLOGY_COLUMN.status);
      expect(statuses.filter((s) => s !== TERMINOLOGY_STATUS.active)).toEqual([]);
    });

    await steps.step('Clearing the filter restores the full list', async () => {
      const answer = await terminologyManagementPage.clearAllFilters();
      expect(answer.totalRows, 'the unfiltered total').toBe(total);
    });
  });

  test(`TC-${CASES.viewReadOnly.azureId}: should show the terminology's fields and configuration read-only when its View action is used`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyIn,
    steps,
  }) => {
    const terminology = await terminologyIn({ records: [{ Code: 'VIEW-1' }] });

    await steps.critical('Navigate to the Terminology Management module - the terminology list loads', async () => {
      await terminologyManagementPage.open();
    });

    await steps.critical('The View action opens a read-only detail screen showing the terminology\'s fields and configuration', async () => {
      await terminologyManagementPage.openDetails(terminology.name);
      expect(await terminologyDetailPage.getName()).toBe(terminology.name);
      const fields = await terminologyDetailPage.readFields();
      expect(fields.map((f) => f.name)).toEqual(expect.arrayContaining(Object.keys(terminology.fieldIds)));
    });

    await steps.step('The definition fields on the View screen are not editable', async () => {
      expect(await terminologyDetailPage.countDefinitionInputs(), 'editable name / description inputs on the View screen').toBe(0);
    });
  });
});

