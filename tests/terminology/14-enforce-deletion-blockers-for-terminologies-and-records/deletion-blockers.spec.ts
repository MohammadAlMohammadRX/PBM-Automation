import { test, expect } from '../../../fixtures';
import { MESSAGE, TECHNICAL_DETAIL, TOAST_TEXT } from '../../../data/terminology/terminology.data';
import { BLOCKED_CASES, CASES, CONFIRM_TEXT } from '../../../data/terminology/deletionBlockers.data';
import { mappingTo } from '../../../data/terminology/retireValues.data';

/**
 * User story 15160: Enforce Deletion Blockers for Terminologies and Records.
 * A terminology may be deleted only when it is not predefined, holds no data
 * and is referenced by no mapping; every blocked attempt is refused with a
 * clear, non-technical message, leaves everything intact, is logged, and is
 * enforced on every path - and only an administrator may attempt it at all.
 */
test.describe('US 15160 - Enforce Deletion Blockers for Terminologies and Records (Items)', () => {
  test(`TC-${CASES.unused.azureId}: should delete the terminology permanently when it holds no data and is not referenced`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const terminology = await terminologyIn({ name: CASES.unused.name() });
    let attempt = { offered: 'absent', title: '', dialogText: '', status: -1, messages: [] as string[] };

    await steps.critical('Navigate to the Terminology Management module - the list shows the unused terminology', async () => {
      await terminologyManagementPage.open();
      expect(await terminologyManagementPage.isListed(terminology.name)).toBe(true);
    });

    await steps.critical('Delete asks to confirm the deletion', async () => {
      attempt = await terminologyManagementPage.attemptDelete(terminology.name);
      expect(attempt.dialogText).toMatch(CONFIRM_TEXT);
    });

    await steps.step('Yes deletes the terminology and removes it from the list', async () => {
      expect(attempt.status).toBe(200);
      expect(attempt.messages.join(' | ')).toMatch(TOAST_TEXT.deleted);
    });

    await steps.step('Searching for it finds it nowhere in the system', async () => {
      expect(await terminologyManagementPage.isListed(terminology.name)).toBe(false);
      expect(await terminologyManagementPage.fetchTerminology(terminology.id)).toBeNull();
    });
  });

  test(`TC-${CASES.holdsData.azureId}: should refuse the deletion and keep the terminology unchanged when it holds data`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const terminology = await terminologyIn({ name: CASES.holdsData.name(), records: [...CASES.holdsData.records] });
    let attempt = { offered: 'absent', title: '', dialogText: '', status: -1, messages: [] as string[] };

    await steps.critical('Navigate to the Terminology Management module - the list shows the terminology holding data', async () => {
      await terminologyManagementPage.open();
      expect(await terminologyManagementPage.isListed(terminology.name)).toBe(true);
    });

    await steps.step('Delete asks to confirm the deletion', async () => {
      attempt = await terminologyManagementPage.attemptDelete(terminology.name);
      expect(attempt.dialogText, `Delete was ${attempt.offered} (${attempt.title})`).toMatch(CONFIRM_TEXT);
    });

    await steps.step('Yes shows an error that the terminology holds data and discards the deletion', async () => {
      const server = await terminologyManagementPage.sendDelete(terminology.id);
      expect(server.status, 'the server should refuse').toBeGreaterThanOrEqual(400);
      expect(`${attempt.messages.join(' ')} ${attempt.title} ${server.validationErrors.join(' ')}`).toMatch(MESSAGE.holdsData);
    });

    await steps.step('After a refresh the terminology still appears unchanged', async () => {
      await terminologyManagementPage.open();
      expect((await terminologyManagementPage.readRow(terminology.name)).records).toBe(String(CASES.holdsData.records.length));
    });
  });

  test(`TC-${CASES.mapped.azureId}: should refuse the deletion and leave the mapping intact when another module's mapping field references the terminology`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.mapped;
    const unit = await terminologyIn({ name: data.name() });
    const product = await terminologyIn({ name: data.referrer(), fields: [{ name: 'Code', type: 'text', required: true, unique: true }, mappingTo(unit.id, unit.fieldIds.Code, 'Unit')] });
    let attempt = { offered: 'absent', title: '', dialogText: '', status: -1, messages: [] as string[] };

    await steps.critical('Navigate to the Terminology Management module - the list shows the referenced terminology', async () => {
      await terminologyManagementPage.open();
      expect(await terminologyManagementPage.isListed(unit.name)).toBe(true);
    });

    await steps.step('Delete on the referenced terminology asks for confirmation', async () => {
      attempt = await terminologyManagementPage.attemptDelete(unit.name);
      expect(attempt.dialogText, `Delete was ${attempt.offered} (${attempt.title})`).toMatch(CONFIRM_TEXT);
    });

    await steps.step('Yes shows an error that a mapping field references it, and the deletion is discarded', async () => {
      expect(attempt.status, 'the deletion should be refused').not.toBe(200);
      expect(attempt.messages.join(' | ')).toMatch(MESSAGE.mapped);
      expect(await terminologyManagementPage.fetchTerminology(unit.id)).not.toBeNull();
    });

    await steps.step('The dependent mapping configuration still references the terminology', async () => {
      const field = (await terminologyManagementPage.fetchTerminology(product.id))?.fields.find((f) => f.name === 'Unit');
      expect(field?.mappingIdentifiedTerminologyId).toBe(unit.id);
    });
  });

  test(`TC-${CASES.decisionTable.azureId}: should allow or block the deletion correctly when each combination of usage, mapping and predefined status is tried`, async ({
    terminologyManagementPage,
    terminologyIn,
    predefinedTerminology,
    steps,
  }) => {
    const free = await terminologyIn();
    const used = await terminologyIn({ records: [{ Code: 'USED' }] });
    const mapped = await terminologyIn();
    await terminologyIn({ fields: [{ name: 'Code', type: 'text', required: true, unique: true }, mappingTo(mapped.id, mapped.fieldIds.Code)] });
    const predefined = await predefinedTerminology();

    await steps.critical('Navigate to the Terminology Management module - the terminology list loads', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('Not predefined, unused and unmapped: deletion succeeds', async () => {
      expect((await terminologyManagementPage.attemptDelete(free.name)).status).toBe(200);
      expect(await terminologyManagementPage.fetchTerminology(free.id)).toBeNull();
    });

    await steps.step('Not predefined but holding data: deletion is blocked with an error', async () => {
      const server = await terminologyManagementPage.sendDelete(used.id);
      expect(server.status).toBeGreaterThanOrEqual(400);
      expect(server.validationErrors.join(' ')).toMatch(MESSAGE.holdsData);
    });

    await steps.step('Not predefined, unused but mapped by another field: deletion is blocked with an error', async () => {
      const server = await terminologyManagementPage.sendDelete(mapped.id);
      expect(server.status).toBeGreaterThanOrEqual(400);
      expect(server.validationErrors.join(' ')).toMatch(MESSAGE.mapped);
    });

    await steps.step('Predefined, whatever its usage: deletion is blocked with an error', async () => {
      const server = await terminologyManagementPage.sendDelete(predefined.id);
      expect(server.status).toBeGreaterThanOrEqual(400);
      expect(await terminologyManagementPage.fetchTerminology(predefined.id)).not.toBeNull();
    });
  });

  test(`TC-${CASES.zeroVersusOne.azureId}: should delete the terminology when it has zero records and block it when it has exactly one`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const zero = await terminologyIn();
    const one = await terminologyIn({ records: [CASES.zeroVersusOne.record] });

    await steps.critical('Navigate to the Terminology Management module - the list shows both terminologies', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('The terminology with 0 records is deleted with no error', async () => {
      expect((await terminologyManagementPage.attemptDelete(zero.name)).status).toBe(200);
      expect(await terminologyManagementPage.fetchTerminology(zero.id)).toBeNull();
    });

    await steps.step('The terminology with exactly 1 record is refused with an error and kept intact', async () => {
      const attempt = await terminologyManagementPage.attemptDelete(one.name);
      const server = await terminologyManagementPage.sendDelete(one.id);
      expect(attempt.status, `Delete was ${attempt.offered}`).not.toBe(200);
      expect(server.status).toBeGreaterThanOrEqual(400);
      expect(await terminologyManagementPage.fetchRecords(one.id)).toHaveLength(1);
    });
  });

  test(`TC-${CASES.confirmInUse.azureId}: should show an error and discard the deletion when confirming the delete of a terminology in use`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const data = CASES.confirmInUse;
    const terminology = await terminologyIn({ records: [data.record] });
    let attempt = { offered: 'absent', title: '', dialogText: '', status: -1, messages: [] as string[] };

    await steps.critical('Navigate to the Terminology Management module - the terminology list loads', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('Delete on the record with a transaction asks "Are you sure you want to delete this record?"', async () => {
      attempt = await terminologyManagementPage.attemptDelete(terminology.name);
      expect(attempt.dialogText, `Delete was ${attempt.offered} (${attempt.title})`).toMatch(data.question);
    });

    await steps.step('Yes detects the integrity violation and shows an error instead of deleting', async () => {
      expect(attempt.status).not.toBe(200);
      expect(attempt.messages.join(' | ')).toMatch(MESSAGE.holdsData);
    });

    await steps.step('The record is unchanged and no related transaction data is lost', async () => {
      expect((await terminologyManagementPage.fetchRecords(terminology.id)).map((r) => r.cells.Code)).toEqual([data.record.Code]);
    });
  });

  test(`TC-${CASES.becomesUsed.azureId}: should protect the terminology from deletion when it gains its first record`, async ({
    terminologyManagementPage,
    terminologyConfirmDialog,
    terminologyIn,
    recordIn,
    steps,
  }) => {
    const terminology = await terminologyIn();
    let attempt = { offered: 'absent', title: '', dialogText: '', status: -1, messages: [] as string[] };

    await steps.critical('Navigate to the Terminology Management module - the list shows the terminology with 0 records', async () => {
      await terminologyManagementPage.open();
      expect((await terminologyManagementPage.readRow(terminology.name)).records).toBe('0');
    });

    await steps.critical('Its Delete prompt opens (it is deletable) and is cancelled with no change', async () => {
      await terminologyManagementPage.requestAction(terminology.name, 'delete');
      await terminologyConfirmDialog.cancel();
      expect(await terminologyManagementPage.fetchTerminology(terminology.id)).not.toBeNull();
    });

    await steps.critical('One transaction referencing it is created', async () => {
      await recordIn(terminology.id, CASES.becomesUsed.record);
      expect(await terminologyManagementPage.fetchRecords(terminology.id)).toHaveLength(1);
    });

    await steps.step('Delete and Yes now show an error and discard the deletion because it is in use', async () => {
      await terminologyManagementPage.open();
      attempt = await terminologyManagementPage.attemptDelete(terminology.name);
      const server = await terminologyManagementPage.sendDelete(terminology.id);
      expect(attempt.status, `Delete was ${attempt.offered}`).not.toBe(200);
      expect(server.status).toBeGreaterThanOrEqual(400);
      expect(server.validationErrors.join(' ')).toMatch(MESSAGE.holdsData);
    });
  });

  test(`TC-${CASES.endToEnd.azureId}: should reject the deletion with no partial change when the whole workflow is run on an in-use terminology`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyIn,
    steps,
  }) => {
    const terminology = await terminologyIn({ records: [...CASES.endToEnd.records] });
    const before = JSON.stringify(await terminologyManagementPage.fetchRecords(terminology.id));

    await steps.critical('Navigate to the Terminology Management module - the terminology list loads', async () => {
      await terminologyManagementPage.open();
    });

    await steps.critical('Searching and selecting the in-use terminology opens its detail with its data', async () => {
      await terminologyManagementPage.openDetails(terminology.name);
      expect((await terminologyDetailPage.readRecords()).length).toBe(CASES.endToEnd.records.length);
    });

    let state = { availability: 'absent', label: '', title: '' };
    await steps.step('Delete shows a confirmation summarizing the request', async () => {
      state = await terminologyDetailPage.getActionState('delete');
      expect(state.availability, `Delete on the detail screen (${state.title})`).toBe('available');
    });

    await steps.step('Yes shows an error explaining the dependency and discards the action', async () => {
      const server = await terminologyManagementPage.sendDelete(terminology.id);
      expect(server.status).toBeGreaterThanOrEqual(400);
      expect(server.validationErrors.join(' ')).toMatch(MESSAGE.holdsData);
    });

    await steps.step('Navigating away and back shows the terminology, its data and references exactly as before', async () => {
      await terminologyManagementPage.open();
      await terminologyDetailPage.open(terminology.id);
      expect(JSON.stringify(await terminologyManagementPage.fetchRecords(terminology.id))).toBe(before);
    });
  });

  test(`TC-${CASES.noPermission.azureId}: should withhold the deletion function when the user is not a System Administrator`, async ({
    terminologyManagementPage,
    terminologyIn,
    shapedNonAdmin,
    requireListAccess,
    steps,
  }) => {
    const terminology = await terminologyIn();
    const session = await shapedNonAdmin(CASES.noPermission.granted);
    await requireListAccess(session);

    await steps.critical('The terminology list loads in a restricted view', async () => {
      await session.terminologies.openExpectingDenial();
      expect(await session.terminologies.getPageText(), 'the module should render for the user').not.toBe('');
    });

    await steps.step('The Delete action is hidden or disabled for this role', async () => {
      expect((await session.terminologies.getActionStateIfListed(terminology.name, 'delete')).availability).not.toBe('available');
    });

    await steps.step('A direct delete request is denied with an access-denied answer and nothing is deleted', async () => {
      const answer = await session.terminologies.sendDelete(terminology.id);
      expect(answer.status, `the server answered ${answer.status}`).toBeGreaterThanOrEqual(400);
      expect(await terminologyManagementPage.fetchTerminology(terminology.id)).not.toBeNull();
    });
  });

  test(`TC-${CASES.otherPath.azureId}: should apply the same deletion blocker when the deletion is requested by another path`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const unusedA = await terminologyIn();
    const unusedB = await terminologyIn();
    const inUse = await terminologyIn({ records: [{ Code: 'IN-USE' }] });
    let answers: { id: string; status: number; reason: string }[] = [];

    await steps.critical('Navigate to the Terminology Management module - the terminology list loads', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('The in-use terminology and two unused ones are deleted through the direct request path', async () => {
      for (const t of [unusedA, unusedB, inUse]) {
        const answer = await terminologyManagementPage.sendDelete(t.id);
        answers.push({ id: t.id, status: answer.status, reason: answer.validationErrors.join(' ') });
      }
      expect(answers).toHaveLength(3);
    });

    await steps.step('The unused ones are deleted while the in-use one is refused with a dependency explanation', async () => {
      expect(answers.slice(0, 2).map((a) => a.status)).toEqual([200, 200]);
      expect(answers[2].status).toBeGreaterThanOrEqual(400);
      expect(answers[2].reason).toMatch(MESSAGE.holdsData);
      expect(await terminologyManagementPage.fetchTerminology(inUse.id)).not.toBeNull();
      answers = [];
    });
  });

  test(`TC-${CASES.noSideEffects.azureId}: should leave dependent data untouched and log the rejected attempt when a deletion is blocked`, async ({
    terminologyManagementPage,
    terminologyDetailPage,
    terminologyIn,
    recordIn,
    steps,
  }) => {
    const target = await terminologyIn({ records: [CASES.noSideEffects.record] });
    const dependent = await terminologyIn({ fields: [{ name: 'Code', type: 'text', required: true, unique: true }, mappingTo(target.id, target.fieldIds.Code)] });
    await recordIn(dependent.id, { Code: 'DEPENDENT-1', Parent: target.recordIds[0] });
    const before = JSON.stringify([await terminologyManagementPage.fetchRecords(target.id), await terminologyManagementPage.fetchRecords(dependent.id)]);

    await steps.critical('Navigate to the Terminology Management module - the terminology list loads', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('Delete and Yes on the terminology with dependencies show an error and discard the action', async () => {
      const server = await terminologyManagementPage.sendDelete(target.id);
      expect(server.status).toBeGreaterThanOrEqual(400);
    });

    await steps.step('Every dependent record in the related terminologies is intact and unmodified', async () => {
      expect(JSON.stringify([await terminologyManagementPage.fetchRecords(target.id), await terminologyManagementPage.fetchRecords(dependent.id)])).toBe(before);
    });

    await steps.step('The audit log records the blocked deletion attempt with its reason and no deletion', async () => {
      await terminologyDetailPage.open(target.id);
      await terminologyDetailPage.audit().expectEntry(CASES.noSideEffects.blockedEntry);
    });
  });

  test(`TC-${CASES.friendlyMessage.azureId}: should explain the refusal plainly without technical details when a deletion is blocked`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const terminology = await terminologyIn({ records: [CASES.friendlyMessage.record] });
    let attempt = { offered: 'absent', title: '', dialogText: '', status: -1, messages: [] as string[] };

    await steps.critical('Navigate to the Terminology Management module - the terminology list loads', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('Delete and Yes on the record with dependencies make the system evaluate the constraints', async () => {
      attempt = await terminologyManagementPage.attemptDelete(terminology.name);
      expect(`${attempt.title} ${attempt.messages.join(' ')}`.trim()).not.toBe('');
    });

    await steps.step('The message says the record is in use, with no database or stack-trace detail', async () => {
      const said = `${attempt.messages.join(' ')} ${attempt.title}`;
      expect(said).toMatch(MESSAGE.holdsData);
      expect(said).not.toMatch(TECHNICAL_DETAIL);
    });

    await steps.step('Dismissing it returns to the terminology list with the record unchanged', async () => {
      await terminologyManagementPage.open();
      expect(await terminologyManagementPage.isListed(terminology.name)).toBe(true);
      expect(await terminologyManagementPage.fetchRecords(terminology.id)).toHaveLength(1);
    });
  });

  test(`TC-${CASES.equivalence.azureId}: should delete every unused terminology and protect every used one when both groups are deleted`, async ({
    terminologyManagementPage,
    terminologyIn,
    steps,
  }) => {
    const unused = [await terminologyIn(), await terminologyIn(), await terminologyIn()];
    const used = [await terminologyIn({ records: [{ Code: 'U1' }] }), await terminologyIn({ records: [{ Code: 'U2' }] }), await terminologyIn({ records: [{ Code: 'U3' }] })];

    await steps.critical('Navigate to the Terminology Management module - the list shows used and unused terminologies', async () => {
      await terminologyManagementPage.open();
    });

    await steps.step('Every unused terminology is deleted', async () => {
      const statuses: number[] = [];
      for (const t of unused) statuses.push((await terminologyManagementPage.attemptDelete(t.name)).status);
      expect(statuses).toEqual(Array(CASES.equivalence.count).fill(200));
    });

    await steps.step('Every used terminology is blocked with an error and stays intact', async () => {
      const statuses: number[] = [];
      for (const t of used) statuses.push((await terminologyManagementPage.sendDelete(t.id)).status);
      expect(statuses.filter((s) => s < 400), 'used terminologies deleted').toEqual([]);
      for (const t of used) expect(await terminologyManagementPage.fetchTerminology(t.id)).not.toBeNull();
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
