import { test, expect } from '../../../fixtures';
import { ACTION_LABEL, IS_ACTIVE_FIELD, LOCKED_LABEL, MESSAGE } from '../../../data/terminology/terminology.data';
import { CASES, LOCKED_TEXT } from '../../../data/terminology/lockTerminology.data';
import { IMPORT_FIELDS, IMPORT_HEADERS, largeFile } from '../../../data/terminology/singleActiveImport.data';

/**
 * User story 15158: Lock a Terminology to Prevent Changes.
 * Locking freezes a terminology's definition and its records until it is
 * unlocked; the state is visible on the list and the detail screen; only the
 * Compliance Officer may lock; and locking behaves consistently with an import
 * running, when repeated, and for every status and record count.
 */
test.describe('US 15158 - Lock a Terminology to Prevent Changes', () => {
  test(`TC-${CASES.lock.azureId}: should freeze the definition and data when the Compliance Officer locks an unlocked terminology`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyIn,
    steps,
  }) => {
    const terminology = await terminologyIn({ name: CASES.lock.name(), records: [...CASES.lock.records] });

    await steps.critical('Navigate to the Terminology Management module - the module home page is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('The detail screen shows the terminology unlocked with a lock control available', async () => {
      await terminologyManagementPage.openDetails(terminology.name);
      expect(await terminologyDetailPage.getScreenText()).not.toMatch(/\bLocked\b/);
      expect(await terminologyDetailPage.getScreenText(), 'a lock control on the detail screen').toMatch(/\bLock\b/);
    });

    await steps.step('Selecting lock and confirming changes the status to "Locked" and saves it', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.toggleLock(terminology.name);
      expect((await terminologyManagementPage.readRow(terminology.name)).locked).toBe(LOCKED_LABEL);
      expect((await terminologyManagementPage.fetchTerminology(terminology.id))?.isLocked).toBe(true);
    });
  });

  test(`TC-${CASES.definitionLocked.azureId}: should refuse every definition change when the terminology is locked`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.definitionLocked;
    const terminology = await terminologyIn({ name: data.name(), locked: true });

    await steps.critical('Navigate to the Terminology Management module - the module home page is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('The definition\'s edit controls are disabled on the locked terminology', async () => {
      expect((await terminologyManagementPage.readActionStates(terminology.name)).edit.availability, 'Edit on the list row').not.toBe('available');
      await terminologyManagementPage.openDetails(terminology.name);
      expect((await terminologyDetailPage.getActionState('edit')).availability, 'Edit on the detail screen').not.toBe('available');
    });

    await steps.step('A forced save of a definition change is rejected with a terminology-locked message', async () => {
      const answer = await terminologyManagementPage.sendUpdate(terminology.id, { description: data.changed });
      expect(answer.status, `the server answered ${answer.status}`).toBeGreaterThanOrEqual(400);
      expect(`${answer.validationErrors.join(' ')} ${answer.text}`).toMatch(MESSAGE.locked);
      expect((await terminologyManagementPage.fetchTerminology(terminology.id))?.description).not.toBe(data.changed);
    });
  });

  test(`TC-${CASES.recordsLocked.azureId}: should block adding, editing and deleting records when the terminology is locked`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.recordsLocked;
    const terminology = await terminologyIn({ name: data.name(), records: [{ Code: data.code }], locked: true });

    await steps.critical('Opening the locked terminology\'s records shows edit and delete disabled', async () => {
      await terminologyDetailPage.open(terminology.id);
      const edit = await terminologyDetailPage.getRecordActionState(data.code, 'edit');
      const del = await terminologyDetailPage.getRecordActionState(data.code, 'delete');
      expect(Object.entries({ Edit: edit, Delete: del }).filter(([, state]) => state.availability === 'available').map(([name]) => name), 'record actions still enabled on a locked terminology').toEqual([]);
    });

    await steps.step('Adding a new record is rejected with a terminology-locked message', async () => {
      const answer = await terminologyManagementPage.sendUpsertRecord(terminology.id, { Code: data.added, [IS_ACTIVE_FIELD]: 'true' });
      expect(answer.status, `the add was answered ${answer.status}`).toBeGreaterThanOrEqual(400);
      expect(`${answer.validationErrors.join(' ')} ${answer.text}`).toMatch(MESSAGE.locked);
    });

    await steps.step('Editing an existing record is rejected with a terminology-locked message', async () => {
      const answer = await terminologyManagementPage.sendUpsertRecord(terminology.id, { Code: `${data.code}X` }, terminology.recordIds[0]);
      expect(answer.status, `the edit was answered ${answer.status}`).toBeGreaterThanOrEqual(400);
      expect(`${answer.validationErrors.join(' ')} ${answer.text}`).toMatch(MESSAGE.locked);
    });

    await steps.step('Deleting an existing record is rejected with a terminology-locked message', async () => {
      const answer = await terminologyManagementPage.sendDeleteRecord(terminology.id, terminology.recordIds[0]);
      expect(answer.status, `the delete was answered ${answer.status}`).toBeGreaterThanOrEqual(400);
      expect(`${answer.validationErrors.join(' ')} ${answer.text}`).toMatch(MESSAGE.locked);
      expect((await terminologyManagementPage.fetchRecords(terminology.id)).map((r) => r.cells.Code)).toEqual([data.code]);
    });
  });

  test(`TC-${CASES.listIndicator.azureId}: should show a locked indicator only on locked terminologies when the list is viewed`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const locked = await terminologyIn({ name: CASES.listIndicator.name(), locked: true });
    const unlocked = await terminologyIn();

    await steps.critical('Navigate to the Terminology Management module - the module home page is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('The locked terminology shows a locked indicator while an unlocked one shows none', async () => {
      expect((await terminologyManagementPage.readRow(locked.name)).locked).toBe(LOCKED_LABEL);
      expect((await terminologyManagementPage.readRow(unlocked.name)).locked).not.toMatch(LOCKED_TEXT);
    });
  });

  test(`TC-${CASES.detailIndicator.azureId}: should show a locked label or icon when a locked terminology's detail screen is opened`, async ({
    terminologyDetailPage,
    terminologyIn,
    steps,
  }) => {
    const terminology = await terminologyIn({ name: CASES.detailIndicator.name(), locked: true });

    await steps.step('The detail screen clearly displays a locked status label or icon', async () => {
      await terminologyDetailPage.open(terminology.id);
      expect(await terminologyDetailPage.getScreenText(), 'a locked indicator on the detail screen').toMatch(/\bLocked\b/);
    });
  });

  test(`TC-${CASES.unlock.azureId}: should accept and save changes again when a locked terminology is unlocked`, async ({
    terminologyManagementPage,
    terminologyFormDrawer,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.unlock;
    const terminology = await terminologyIn({ name: data.name(), locked: true });

    await steps.critical('Unlocking the locked terminology changes its status to unlocked', async () => {
      await terminologyManagementPage.open();
      expect((await terminologyManagementPage.readActionStates(terminology.name)).toggleLocked.label).toBe(ACTION_LABEL.unlock);
      await terminologyManagementPage.toggleLock(terminology.name);
      expect((await terminologyManagementPage.readRow(terminology.name)).locked).not.toBe(LOCKED_LABEL);
    });

    await steps.step('Editing the definition is accepted and saved', async () => {
      await terminologyManagementPage.openEditForm(terminology.name);
      await terminologyFormDrawer.fillDescription(data.changed);
      await terminologyFormDrawer.next();
      expect((await terminologyFormDrawer.save()).status).toBe(200);
      expect((await terminologyManagementPage.fetchTerminology(terminology.id))?.description).toBe(data.changed);
    });
  });

  test(`TC-${CASES.noPermission.azureId}: should withhold locking and unlocking when the user is not a Compliance Officer`, async ({
    terminologyManagementPage,
    terminologyIn,
    shapedNonAdmin,
    requireListAccess,
    steps,
  }) => {
    const terminology = await terminologyIn({ name: CASES.noPermission.name() });
    const session = await shapedNonAdmin(CASES.noPermission.granted);
    await requireListAccess(session);

    await steps.critical('Navigate to the Terminology Management module - the module home page is displayed', async () => {
      await session.terminologies.openExpectingDenial();
      expect(await session.terminologies.getPageText(), 'the module should render for the user').not.toBe('');
    });

    await steps.step('The lock control is disabled or not visible for this user', async () => {
      expect((await session.terminologies.getActionStateIfListed(terminology.name, 'toggleLocked')).availability).not.toBe('available');
    });

    await steps.step('Locking directly is denied with an insufficient-permissions answer', async () => {
      const answer = await session.terminologies.sendSetLocked(terminology.id, true);
      expect(answer.status, `the server answered ${answer.status}`).toBeGreaterThanOrEqual(400);
      expect((await terminologyManagementPage.fetchTerminology(terminology.id))?.isLocked).toBe(false);
    });
  });

  test(`TC-${CASES.duringImport.azureId}: should leave the lock and a running import in consistent, uncorrupted states when locking during the import`, async ({
    terminologyManagementPage,
    terminologyIn,
    runningImport,
    steps,
  }) => {
    const terminology = await terminologyIn({ name: CASES.duringImport.name(), fields: IMPORT_FIELDS });
    await runningImport(terminology.id, IMPORT_HEADERS, largeFile('LOCKRUN'));
    let messages: string[] = [];

    await steps.critical('Locking while the import runs either locks and says how the import is handled, or says to wait', async () => {
      await terminologyManagementPage.open();
      messages = await terminologyManagementPage.toggleLock(terminology.name);
      expect(messages.join(' | '), 'the screen should say what happened').toMatch(CASES.duringImport.explained);
    });

    await steps.step('The lock and import states are both reported consistently with no corruption', async () => {
      const job = await terminologyManagementPage.waitForImportToFinish(terminology.id);
      const stored = await terminologyManagementPage.fetchTerminology(terminology.id);
      const row = await terminologyManagementPage.readRow(terminology.name);
      expect(row.locked === LOCKED_LABEL, 'the list and the server agree on the lock').toBe(stored?.isLocked);
      expect(job.processedRows, 'the import processed every row it took').toBe(job.totalRows);
    });
  });

  test(`TC-${CASES.alreadyLocked.azureId}: should keep a single consistent Locked state when an already locked terminology is locked again`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const terminology = await terminologyIn({ name: CASES.alreadyLocked.name(), locked: true });

    await steps.critical('On the locked terminology the lock control shows as already active, with Unlock offered instead', async () => {
      await terminologyManagementPage.open();
      expect((await terminologyManagementPage.readActionStates(terminology.name)).toggleLocked.label).toBe(ACTION_LABEL.unlock);
    });

    await steps.step('Refreshing and resubmitting the lock through another path creates no duplicate and no error', async () => {
      await terminologyManagementPage.reload();
      const again = await terminologyManagementPage.sendSetLocked(terminology.id, true);
      expect(again.status, `a repeated lock was answered ${again.status}`).toBeLessThan(500);
      await terminologyManagementPage.open();
      expect((await terminologyManagementPage.readRow(terminology.name)).locked).toBe(LOCKED_LABEL);
      expect((await terminologyManagementPage.fetchRegister()).items.filter((t) => t.id === terminology.id)).toHaveLength(1);
    });
  });

  test(`TC-${CASES.activeAndInactive.azureId}: should lock the terminology when it is active and when it is inactive`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.activeAndInactive;
    const active = await terminologyIn({ name: data.active() });
    const inactive = await terminologyIn({ name: data.inactive(), active: false });

    await steps.critical('Navigate to the Terminology Management module - the module home page is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('Locking the active terminology locks it', async () => {
      await terminologyManagementPage.toggleLock(active.name);
      expect((await terminologyManagementPage.readRow(active.name)).locked).toBe(LOCKED_LABEL);
    });

    await steps.step('Locking the inactive terminology locks it', async () => {
      await terminologyManagementPage.toggleLock(inactive.name);
      expect((await terminologyManagementPage.readRow(inactive.name)).locked).toBe(LOCKED_LABEL);
    });
  });

  test(`TC-${CASES.zeroAndPopulated.azureId}: should lock the terminology when it holds no records and when it holds records`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.zeroAndPopulated;
    const empty = await terminologyIn({ name: data.empty() });
    const populated = await terminologyIn({ name: data.populated(), records: [...data.records] });

    await steps.critical('Navigate to the Terminology Management module - the module home page is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('The terminology with zero records is locked', async () => {
      await terminologyManagementPage.toggleLock(empty.name);
      expect((await terminologyManagementPage.readRow(empty.name)).locked).toBe(LOCKED_LABEL);
    });

    await steps.step('The terminology with records is locked as well', async () => {
      await terminologyManagementPage.toggleLock(populated.name);
      expect((await terminologyManagementPage.readRow(populated.name)).locked).toBe(LOCKED_LABEL);
    });
  });
});
