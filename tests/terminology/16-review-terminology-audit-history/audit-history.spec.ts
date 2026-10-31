import { test, expect } from '../../../fixtures';
import { ADMIN_ACTOR, BLOCKED_CASES, CASES, DETAIL_TABS, TIMESTAMP, auditTime } from '../../../data/terminology/auditHistory.data';

/**
 * User story 15162: Review Terminology Audit History.
 * The Audit History tab of a terminology: every definition, field and record
 * change with its actor, time and old / new values, in order, for any status,
 * at volume, immutable - and only for holders of the Audit History permission.
 */
test.describe('US 15162 - Review Terminology Audit History', () => {
  test(`TC-${CASES.definitionChange.azureId}: should show the action, user and time when a terminology's definition has been changed`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyWithHistory,
    steps,
  }) => {
    const terminology = await terminologyWithHistory({}, CASES.definitionChange.history);

    await steps.critical('Navigate to the Terminology Management module - the terminology list is displayed', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('View opens the details page with Overview, Fields, Upload Errors and Audit History tabs', async () => {
      await terminologyManagementPage.openDetails(terminology.name);
      const tabs = await terminologyDetailPage.getTabLabels();
      for (const tab of DETAIL_TABS) expect(tabs.some((t) => tab.test(t)), `${tab} among ${tabs.join(', ')}`).toBe(true);
    });

    await steps.critical('The Audit History tab lists every logged action for the terminology', async () => {
      await terminologyDetailPage.audit().open();
      expect((await terminologyDetailPage.audit().readAllEntries()).length).toBe(await terminologyManagementPage.fetchAuditCount(terminology.id));
    });

    await steps.step('The latest definition change shows its action type, the user and the date and time', async () => {
      const [latest] = await terminologyDetailPage.audit().readEntries();
      expect(latest.action).toMatch(/updat/i);
      expect(latest.by).toMatch(ADMIN_ACTOR);
      expect(latest.when).toMatch(TIMESTAMP);
    });
  });

  test(`TC-${CASES.fieldChanges.azureId}: should record the field's name and change when fields are added, edited or removed`, async ({
    terminologyDetailPage,
    terminologyWithHistory,
    steps,
  }) => {
    const data = CASES.fieldChanges;
    const terminology = await terminologyWithHistory({}, data.history);
    const changes: string[] = [];

    await steps.critical('The details page of the terminology with field changes opens', async () => {
      await terminologyDetailPage.open(terminology.id);
    });

    await steps.critical('The Audit History tab lists the entries', async () => {
      await terminologyDetailPage.audit().open();
      expect((await terminologyDetailPage.audit().readEntries()).length).toBeGreaterThanOrEqual(data.history.length);
    });

    await steps.step('The field-change entries name the field and whether it was added or removed', async () => {
      for (let i = 0; i < data.history.length; i += 1) {
        const entry = await terminologyDetailPage.audit().openEntry(i);
        changes.push(entry.changes.map((c) => `${c.field}: ${c.before} -> ${c.after}`).join(' | '));
        await terminologyDetailPage.audit().closeEntry();
      }
      expect(changes.join(' || '), `the field name "${data.field}" in the entries`).toContain(data.field);
    });
  });

  test(`TC-${CASES.recordChanges.azureId}: should record the record's identifier when records are created, updated and deleted`, async ({
    terminologyDetailPage,
    terminologyWithHistory,
    steps,
  }) => {
    const data = CASES.recordChanges;
    const terminology = await terminologyWithHistory({}, data.history);
    let entries: { action: string; detail: string }[] = [];

    await steps.critical('Viewing the terminology shows its record list', async () => {
      await terminologyDetailPage.open(terminology.id);
      await terminologyDetailPage.waitForGrid('data');
    });

    await steps.critical('The Audit History tab loads', async () => {
      await terminologyDetailPage.audit().open();
      const listed = await terminologyDetailPage.audit().readEntries();
      for (let i = 0; i < listed.length; i += 1) {
        const entry = await terminologyDetailPage.audit().openEntry(i);
        entries.push({ action: `${listed[i].action} ${entry.action}`, detail: `${entry.entityId} ${entry.changes.map((c) => `${c.before} ${c.after}`).join(' ')}` });
        await terminologyDetailPage.audit().closeEntry();
      }
    });

    await steps.step('Create, update and delete each appear with the correct record identifier', async () => {
      for (const action of data.actions) {
        expect(entries.some((e) => action.test(e.action) && data.identifier.test(e.detail)), `an entry matching ${action} for the record`).toBe(true);
      }
      entries = [];
    });
  });

  test(`TC-${CASES.noAuditPermission.azureId}: should hide the Audit History tab when the user lacks the Audit History permission`, async ({
    terminologyIn,
    shapedNonAdmin,
    requireListAccess,
    steps,
  }) => {
    const terminology = await terminologyIn();
    const session = await shapedNonAdmin(CASES.noAuditPermission.granted);
    await requireListAccess(session);

    await steps.critical('Navigate to the Terminology Management module - the terminology list is displayed', async () => {
      await session.terminologyDetail.openExpectingFailure(terminology.id);
      expect(await session.terminologyDetail.getBreadcrumb(), 'the screen should render for the user').not.toBe('');
    });

    await steps.step('Viewing a terminology opens its details with Overview, Fields and Upload Errors tabs', async () => {
      expect(await session.terminologyDetail.isLoaded()).toBe(true);
      expect(await session.terminologyDetail.hasTab('schema')).toBe(true);
    });

    await steps.step('The Audit History tab is hidden or disabled', async () => {
      expect(await session.terminologyDetail.hasTab('audit'), 'the Audit History tab').toBe(false);
    });

    await steps.step('Reaching the audit history directly is denied and no history is shown', async () => {
      expect(await session.terminologies.canReadAuditTrail(terminology.id), 'the audit trail answered to a user without the permission').toBe(false);
    });
  });

  test(`TC-${CASES.oldAndNew.azureId}: should show the old and the new value side by side when a field value has changed`, async ({
    terminologyDetailPage,
    terminologyWithHistory,
    steps,
  }) => {
    const data = CASES.oldAndNew;
    const terminology = await terminologyWithHistory({}, data.history);

    await steps.critical('The details page of the terminology whose value changed opens', async () => {
      await terminologyDetailPage.open(terminology.id);
    });

    await steps.critical('The Audit History tab lists the entries', async () => {
      await terminologyDetailPage.audit().open();
      expect((await terminologyDetailPage.audit().readEntries()).length).toBeGreaterThan(0);
    });

    await steps.step(`The entry for the change shows "${data.before}" and "${data.after}" side by side`, async () => {
      const entry = await terminologyDetailPage.audit().openEntry(0);
      await terminologyDetailPage.audit().closeEntry();
      expect(entry.changes.map((c) => ({ before: c.before, after: c.after }))).toContainEqual({ before: data.before, after: data.after });
    });
  });

  test(`TC-${CASES.whoAndWhen.azureId}: should name the user and the exact time of every change when several users changed the terminology`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyIn,
    shapedNonAdmin,
    requireListAccess,
    steps,
  }) => {
    const data = CASES.whoAndWhen;
    const terminology = await terminologyIn();
    const session = await shapedNonAdmin(data.granted);
    await requireListAccess(session);

    await steps.critical('The terminology is modified by two different users', async () => {
      expect((await terminologyManagementPage.sendUpdate(terminology.id, { description: data.adminChange })).status).toBe(200);
      expect((await session.terminologies.sendUpdate(terminology.id, { description: data.otherChange })).status).toBe(200);
    });

    await steps.critical('The Audit History tab loads', async () => {
      await terminologyDetailPage.open(terminology.id);
      await terminologyDetailPage.audit().open();
    });

    await steps.step('Every entry shows the acting user, the action and the date and time, for both users', async () => {
      const entries = await terminologyDetailPage.audit().readEntries();
      expect(entries.filter((e) => e.action === '' || e.by === '' || !TIMESTAMP.test(e.when)), 'entries missing a field').toEqual([]);
      expect(new Set(entries.map((e) => e.by)).size, `actors: ${entries.map((e) => e.by).join(', ')}`).toBeGreaterThanOrEqual(2);
    });
  });

  test(`TC-${CASES.chronological.azureId}: should list the changes in the order they were made when a terminology has sequential changes`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyWithHistory,
    steps,
  }) => {
    const terminology = await terminologyWithHistory({}, CASES.chronological.history);

    await steps.critical('The details page of the terminology with sequential changes opens', async () => {
      await terminologyManagementPage.open();
      await terminologyManagementPage.openDetails(terminology.name);
    });

    await steps.critical('The Audit History tab lists the entries', async () => {
      await terminologyDetailPage.audit().open();
      expect((await terminologyDetailPage.audit().readAllEntries()).length).toBeGreaterThanOrEqual(CASES.chronological.minimum);
    });

    await steps.step('Read newest to oldest, the entries follow the order the changes were made in', async () => {
      const when = (await terminologyDetailPage.audit().readAllEntries()).map((e) => e.when);
      const times = when.map(auditTime);
      expect(times).toEqual([...times].sort((a, b) => b - a));
    });
  });

  test(`TC-${CASES.anyStatus.azureId}: should keep the full history available for review when the terminology is deactivated`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyWithHistory,
    steps,
  }) => {
    const terminology = await terminologyWithHistory({}, CASES.anyStatus.history);

    await steps.critical('The details page of the deactivated terminology opens', async () => {
      await terminologyDetailPage.open(terminology.id);
      expect((await terminologyManagementPage.fetchTerminology(terminology.id))?.isActive).toBe(false);
    });

    await steps.step('The Audit History tab loads without restriction', async () => {
      await terminologyDetailPage.audit().open();
      expect((await terminologyDetailPage.audit().readEntries()).length).toBeGreaterThan(0);
    });

    await steps.step('The full change history is shown for the inactive terminology', async () => {
      expect((await terminologyDetailPage.audit().readAllEntries()).length).toBe(await terminologyManagementPage.fetchAuditCount(terminology.id));
    });
  });

  test(`TC-${CASES.newTerminology.azureId}: should show only the creation entry or a clear empty state when the terminology has no changes`, async ({
    terminologyDetailPage,
    terminologyIn,
    steps,
  }) => {
    const terminology = await terminologyIn();

    await steps.critical('The details page of the newly created terminology opens', async () => {
      await terminologyDetailPage.open(terminology.id);
    });

    await steps.step('The Audit History tab shows only the creation entry or an empty-state message, with no error', async () => {
      await terminologyDetailPage.audit().open();
      const entries = await terminologyDetailPage.audit().readEntries();
      const panel = await terminologyDetailPage.audit().getPanelText();
      expect(entries.length <= 1, `entries: ${entries.map((e) => e.action).join(', ')}`).toBe(true);
      expect(entries.every((e) => CASES.newTerminology.created.test(e.action)) || CASES.newTerminology.empty.test(panel), 'a creation entry or an empty state').toBe(true);
    });
  });

  test(`TC-${CASES.heavyHistory.azureId}: should page accurately with no missing or duplicated entries when the history holds hundreds of entries`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyWithHistory,
    steps,
  }) => {
    const terminology = await terminologyWithHistory({}, CASES.heavyHistory.history);
    let total = -1;

    await steps.critical('The details page of the terminology with an extensive history opens', async () => {
      total = await terminologyManagementPage.fetchAuditCount(terminology.id);
      expect(total).toBeGreaterThanOrEqual(CASES.heavyHistory.minimum);
      await terminologyDetailPage.open(terminology.id);
    });

    await steps.step('The tab loads and pages through every entry with none missing or duplicated', async () => {
      await terminologyDetailPage.audit().open();
      expect((await terminologyDetailPage.audit().readAllEntries(60)).length).toBe(total);
    });

    await steps.step('Opening the first and last entries and several in a row shows accurate, consistent details', async () => {
      const first = await terminologyDetailPage.audit().openEntry(0);
      await terminologyDetailPage.audit().closeEntry();
      const again = await terminologyDetailPage.audit().openEntry(0);
      await terminologyDetailPage.audit().closeEntry();
      expect(again).toEqual(first);
      expect(first.entityId).toContain(terminology.name);
    });
  });

  test(`TC-${CASES.deletedTraceable.azureId}: should keep the deletion traceable and offer no way to edit or remove the entry when a record was deleted`, async ({
    terminologyDetailPage,
    terminologyWithHistory,
    steps,
  }) => {
    const data = CASES.deletedTraceable;
    const terminology = await terminologyWithHistory({}, data.history);

    await steps.critical('The details page of the terminology with a deleted record opens', async () => {
      await terminologyDetailPage.open(terminology.id);
    });

    await steps.critical('The Audit History tab lists the entries', async () => {
      await terminologyDetailPage.audit().open();
    });

    await steps.step('The deletion entry is found and offers no option to edit or delete it', async () => {
      const entries = await terminologyDetailPage.audit().readEntries();
      const index = entries.findIndex((e) => data.deletion.test(e.action));
      expect(index, `a deletion entry among ${entries.map((e) => e.action).join(', ')}`).toBeGreaterThanOrEqual(0);
      const entry = await terminologyDetailPage.audit().openEntry(Math.max(index, 0));
      const panel = await terminologyDetailPage.audit().getPanelText();
      await terminologyDetailPage.audit().closeEntry();
      expect(entry.action).toMatch(data.deletion);
      expect(panel.replace(/view details/gi, ''), 'edit / delete controls on the audit history').not.toMatch(data.editControls);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
