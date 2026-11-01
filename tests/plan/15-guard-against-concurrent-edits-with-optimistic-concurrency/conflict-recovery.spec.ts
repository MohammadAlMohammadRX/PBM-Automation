import { test, expect } from '../../../fixtures';
import type { ConflictPrompt, PlanFormDialog, SaveReport } from '../../../pages/plan/PlanFormDialog';
import {
  CASE,
  CHANGED_SINCE_OPENED,
  CHANGES,
  CONCURRENCY_PLAN,
  CONFLICT,
  CONFLICT_AUDIT_ENTRY,
  OTHER_TYPE,
  RELOAD_ACTION,
  UPDATE_AUDIT_ENTRY,
  edited,
  editedAr,
} from '../../../data/plans/optimisticConcurrency.data';

/**
 * User story 14166: Guard against concurrent edits with optimistic concurrency.
 * AFTER a conflict: the message and its reload action, reload-and-retry (once
 * or repeatedly), that a reload fetches the very latest version, and that both
 * conflicts and successful saves are kept in the audit history.
 * User A = the second window (`staleSession`), User B = the main window.
 */
test.describe('US 14166 - Recovering from a plan save conflict', () => {
  test(`TC-${CASE.reloadRetry}: should let User A reload the latest version and save on top of it when a conflict is reported`, async ({
    planManagementPage,
    planIn,
    staleSession,
    steps,
  }) => {
    test.setTimeout(8 * 60_000);
    const plan = await planIn('Draft', CONCURRENCY_PLAN);
    const valueB = edited(CHANGES.userB);
    let original = '';

    await steps.critical('Navigate to the Plans Management module - the plan list loads in both windows', async () => {
      await planManagementPage.openListFor(plan.payerName);
      await staleSession.plans.openListFor(plan.payerName);
      expect(await staleSession.plans.isListed(plan.name)).toBe(true);
    });

    await steps.critical('As User A, the plan opens for editing showing its current values', async () => {
      const formA = await staleSession.plans.openEditForm(plan.name);
      original = await formA.readField('descriptionEn');
      expect(await formA.readField('nameEn')).toBe(plan.name);
    });

    await steps.critical('As User B, the same plan is edited and saved with a different value - accepted', async () => {
      const report = await planManagementPage.stageEdit(plan.name, 'descriptionEn', valueB);
      expect(report.outcome?.status ?? 0, `User B's save: ${report.text}`).toBeLessThan(300);
    });

    await steps.critical('User A\'s save of the originally opened plan is rejected and a reload is prompted', async () => {
      const formA = staleSession.plans.editForm();
      await formA.editField('type', OTHER_TYPE);
      const report = await formA.saveEditAndReport();
      expect(report.outcome?.status, `the stale save must be refused: ${report.text}`).toBe(CONFLICT.status);
      const prompt = await formA.readConflictPrompt();
      expect([...prompt.dialogActions, ...prompt.messages].join(' | '), 'User A should be prompted to reload').toMatch(RELOAD_ACTION);
    });

    await steps.step('Reloading refetches the latest version, including User B\'s change', async () => {
      const formA = await staleSession.plans.reopenEditForm(plan.name, plan.payerName);
      expect(await formA.readField('descriptionEn'), 'User B\'s change should be shown').toBe(valueB);
      expect(valueB).not.toBe(original);
    });

    await steps.step('User A\'s new edit then saves successfully without overwriting User B\'s update', async () => {
      const formA = staleSession.plans.editForm();
      await formA.editField('type', OTHER_TYPE);
      const report = await formA.saveEditAndReport();
      expect(report.outcome?.status ?? 0, `the retried save: ${report.text}`).toBeLessThan(300);
      const record = await planManagementPage.readPlanRecord(plan.id);
      expect(record.descriptionEn, 'User B\'s change survives').toBe(valueB);
      expect(record.planTypeId, 'User A\'s change is applied').toBe(await planManagementPage.planTypeIdFor(OTHER_TYPE));
    });
  });

  test(`TC-${CASE.repeatedConflicts}: should detect every new conflict and let User A save when nobody interferes any more`, async ({
    planManagementPage,
    planIn,
    staleSession,
    steps,
  }) => {
    test.setTimeout(8 * 60_000);
    const plan = await planIn('Draft', CONCURRENCY_PLAN);
    const saveAsB = async (): Promise<number> => {
      const record = await planManagementPage.readPlanRecord(plan.id);
      return (await planManagementPage.updateWithStamp(record, { descriptionEn: edited(CHANGES.userB) }, record.concurrencyStamp)).status;
    };

    await steps.critical('Navigate to the Plans Management module - the plan list loads in both windows', async () => {
      await planManagementPage.openListFor(plan.payerName);
      await staleSession.plans.openListFor(plan.payerName);
      expect(await staleSession.plans.isListed(plan.name)).toBe(true);
    });

    await steps.critical('User A opens the plan with its current stamp', async () => {
      const formA = await staleSession.plans.openEditForm(plan.name);
      expect(await formA.readField('nameEn')).toBe(plan.name);
    });

    await steps.step('User B saves a change, then User A\'s save is rejected and a reload is prompted', async () => {
      expect(await saveAsB(), 'User B\'s first save').toBeLessThan(300);
      const formA = staleSession.plans.editForm();
      await formA.editField('descriptionAr', editedAr());
      const report = await formA.saveEditAndReport();
      expect(report.outcome?.status, report.text).toBe(CONFLICT.status);
      expect([...(await formA.readConflictPrompt()).dialogActions, ...report.messages].join(' | ')).toMatch(RELOAD_ACTION);
    });

    await steps.step('After a reload, User B saves again before User A - the save is rejected again and a reload prompted', async () => {
      const formA = await staleSession.plans.reopenEditForm(plan.name, plan.payerName);
      expect(await saveAsB(), 'User B\'s second save').toBeLessThan(300);
      await formA.editField('descriptionAr', editedAr());
      const report = await formA.saveEditAndReport();
      expect(report.outcome?.status, `the second conflict must be detected too: ${report.text}`).toBe(CONFLICT.status);
      expect([...(await formA.readConflictPrompt()).dialogActions, ...report.messages].join(' | ')).toMatch(RELOAD_ACTION);
    });

    await steps.step('Reloaded once more with no interference, User A\'s save completes', async () => {
      const formA = await staleSession.plans.reopenEditForm(plan.name, plan.payerName);
      await formA.editField('descriptionAr', editedAr());
      const report = await formA.saveEditAndReport();
      expect(report.outcome?.status ?? 0, `the final save: ${report.text}`).toBeLessThan(300);
    });
  });

  // No reload action is required on the conflict message (QA lead, 2026-11-01).
  test(`TC-${CASE.conflictMessage}: should state that the plan changed when a save conflicts`, async ({
    planManagementPage,
    planIn,
    staleSession,
    steps,
  }) => {
    test.setTimeout(8 * 60_000);
    const plan = await planIn('Draft', CONCURRENCY_PLAN);
    let report!: SaveReport;
    let prompt!: ConflictPrompt;

    await steps.critical('Navigate to the Plans Management module - the plan list loads in both windows', async () => {
      await planManagementPage.openListFor(plan.payerName);
      await staleSession.plans.openListFor(plan.payerName);
      expect(await staleSession.plans.isListed(plan.name)).toBe(true);
    });

    await steps.critical('User A opens the plan, User B saves a change, and User A\'s save is rejected', async () => {
      const formA = await staleSession.plans.openEditForm(plan.name);
      const record = await planManagementPage.readPlanRecord(plan.id);
      expect((await planManagementPage.updateWithStamp(record, { descriptionEn: edited(CHANGES.userB) }, record.concurrencyStamp)).status).toBeLessThan(300);
      await formA.editField('descriptionEn', edited(CHANGES.userA));
      report = await formA.saveEditAndReport();
      prompt = await formA.readConflictPrompt();
      expect(report.outcome?.status, report.text).toBe(CONFLICT.status);
    });

    await steps.step('The message says the plan changed since it was opened', async () => {
      expect([...prompt.messages, prompt.dialogTitle].join(' | '), 'the message should say the plan has changed').toMatch(CHANGED_SINCE_OPENED);
    });
  });

  // A refused save changes nothing, so the audit history records only saved changes (QA lead, 2026-11-01).
  test(`TC-${CASE.conflictAudited}: should record only the saved change, not the refused attempt, in the plan's audit history when a conflicting save is refused`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    staleSession,
    steps,
  }) => {
    test.setTimeout(8 * 60_000);
    const plan = await planIn('Draft', CONCURRENCY_PLAN);

    await steps.critical('Navigate to the Plans Management module - the plan list loads in both windows', async () => {
      await planManagementPage.openListFor(plan.payerName);
      await staleSession.plans.openListFor(plan.payerName);
      expect(await staleSession.plans.isListed(plan.name)).toBe(true);
    });

    await steps.critical('User A opens the plan, User B saves a change, and User A\'s save is rejected', async () => {
      const formA = await staleSession.plans.openEditForm(plan.name);
      const record = await planManagementPage.readPlanRecord(plan.id);
      expect((await planManagementPage.updateWithStamp(record, { descriptionEn: edited(CHANGES.userB) }, record.concurrencyStamp)).status).toBeLessThan(300);
      await formA.editField('descriptionEn', edited(CHANGES.userA));
      const report = await formA.saveEditAndReport();
      expect(report.outcome?.status, report.text).toBe(CONFLICT.status);
    });

    await steps.step('The plan\'s audit log records User B\'s saved change and no entry for the refused attempt', async () => {
      await planDetailPage.open(plan.id);
      const audit = planDetailPage.audit();
      await audit.open();
      const entries = await audit.readEntries();
      expect(entries.length, 'User B\'s saved change should be recorded').toBeGreaterThan(0);
      expect(entries.filter((entry) => CONFLICT_AUDIT_ENTRY.test(entry.action)).map((entry) => entry.action), 'entries for the refused attempt').toEqual([]);
    });
  });

  test(`TC-${CASE.reloadLatest}: should refetch every change User B made when User A reloads, and accept the next save`, async ({
    planManagementPage,
    planIn,
    staleSession,
    steps,
  }) => {
    test.setTimeout(8 * 60_000);
    const plan = await planIn('Draft', CONCURRENCY_PLAN);
    const firstB = edited(CHANGES.userB);
    const secondB = editedAr();
    let formA!: PlanFormDialog;

    await steps.critical('Navigate to the Plans Management module - the plan list loads in both windows', async () => {
      await planManagementPage.openListFor(plan.payerName);
      await staleSession.plans.openListFor(plan.payerName);
      expect(await staleSession.plans.isListed(plan.name)).toBe(true);
    });

    await steps.critical('User A opens the plan, User B saves two successive changes, and User A\'s save is rejected with a reload prompt', async () => {
      formA = await staleSession.plans.openEditForm(plan.name);
      const before = await planManagementPage.readPlanRecord(plan.id);
      expect((await planManagementPage.updateWithStamp(before, { descriptionEn: firstB }, before.concurrencyStamp)).status, 'User B\'s first change').toBeLessThan(300);
      const between = await planManagementPage.readPlanRecord(plan.id);
      expect((await planManagementPage.updateWithStamp(between, { descriptionAr: secondB }, between.concurrencyStamp)).status, 'User B\'s second change').toBeLessThan(300);
      await formA.editField('type', OTHER_TYPE);
      const report = await formA.saveEditAndReport();
      expect(report.outcome?.status, report.text).toBe(CONFLICT.status);
      expect([...(await formA.readConflictPrompt()).dialogActions, ...report.messages].join(' | ')).toMatch(RELOAD_ACTION);
    });

    await steps.step('After reloading, the plan shows both of User B\'s changes', async () => {
      formA = await staleSession.plans.reopenEditForm(plan.name, plan.payerName);
      expect(await formA.readField('descriptionEn'), 'User B\'s first change').toBe(firstB);
      expect(await formA.readField('descriptionAr'), 'User B\'s second change').toBe(secondB);
    });

    await steps.step('The next save, without another reload, is accepted on the current stamp', async () => {
      await formA.editField('type', OTHER_TYPE);
      const report = await formA.saveEditAndReport();
      expect(report.outcome?.status ?? 0, `the save on the refreshed stamp: ${report.text}`).toBeLessThan(300);
    });
  });

  test(`TC-${CASE.successAudited}: should record the save in the audit history, distinguishable from conflict attempts, when a save succeeds`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(8 * 60_000);
    const plan = await planIn('Draft', CONCURRENCY_PLAN);

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('A change is made and saved - the save completes and a new stamp is stored', async () => {
      const stampBefore = String((await planManagementPage.readPlanRecord(plan.id)).concurrencyStamp ?? '');
      const report = await planManagementPage.stageEdit(plan.name, 'descriptionEn', edited(CHANGES.first));
      expect(report.outcome?.status ?? 0, report.text).toBeLessThan(300);
      expect(String((await planManagementPage.readPlanRecord(plan.id)).concurrencyStamp ?? '')).not.toBe(stampBefore);
    });

    await steps.step('The plan\'s audit log holds an entry for the successful save, distinct from any conflict entries', async () => {
      await planDetailPage.open(plan.id);
      const audit = planDetailPage.audit();
      await audit.open();
      const entries = await audit.readEntries();
      const saves = entries.filter((entry) => UPDATE_AUDIT_ENTRY.test(entry.action));
      expect(saves.length, `an update entry among: ${entries.map((entry) => entry.action).join(', ')}`).toBeGreaterThan(0);
      expect(saves.every((entry) => !CONFLICT_AUDIT_ENTRY.test(entry.action)), 'a successful save must read differently from a conflict').toBe(true);
    });
  });
});
