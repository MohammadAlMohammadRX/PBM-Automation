import { test, expect } from '../../../fixtures';
import type { PlanFormDialog } from '../../../pages/plan/PlanFormDialog';
import type { PlanRecord } from '../../../utils/PlanProvisioning';
import {
  CASE,
  CHANGES,
  CONCURRENCY_PLAN,
  CONFLICT,
  DOUBLE_SAVE_CLICKS,
  STAMP_REFUSAL_STATUSES,
  edited,
} from '../../../data/plans/optimisticConcurrency.data';

/**
 * User story 14166: Guard against concurrent edits with optimistic concurrency.
 * The SAVE itself: a matching stamp saves and moves on, a stale one is refused
 * (first conflict or later), the stamp is per save, a missing / tampered one is
 * an error, and a double click is handled safely.
 * User A = the second window (`staleSession`), User B = the main window.
 * Twins: tests/network/19-prevent-concurrent-edits-with-optimistic-locking,
 * 33-warn-users-when-saving-a-network-that-changed-since-it-was-opened.
 */
test.describe('US 14166 - Plan saves and the concurrency stamp', () => {
  test(`TC-${CASE.matchingStamp}: should save and issue a new concurrency stamp when nobody else changed the plan`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft', CONCURRENCY_PLAN);
    const newName = `${plan.name} ${CHANGES.renamedSuffix}`;
    let stampOpened = '';
    let form!: PlanFormDialog;

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the plan for editing - it opens and its current stamp is captured', async () => {
      stampOpened = String((await planManagementPage.readPlanRecord(plan.id)).concurrencyStamp ?? '');
      form = await planManagementPage.openEditForm(plan.name);
      expect(stampOpened, 'GetPlan should hand the drawer a concurrency stamp').not.toBe('');
      expect(await form.readField('nameEn')).toBe(plan.name);
    });

    await steps.step('The plan name field shows the new value', async () => {
      await form.editField('nameEn', newName);
      expect(await form.readField('nameEn')).toBe(newName);
    });

    await steps.step('The save completes and a new stamp is stored for the plan', async () => {
      const report = await form.saveEditAndReport();
      expect(report.outcome?.status ?? 0, `a save with the current stamp should be accepted: ${report.text}`).toBeLessThan(300);
      const after = await planManagementPage.readPlanRecord(plan.id);
      expect(after.planNameEn, 'the new name is saved').toBe(newName);
      expect(String(after.concurrencyStamp ?? ''), 'a successful save should issue a new stamp').not.toBe(stampOpened);
    });
  });

  test(`TC-${CASE.staleBlocked}: should reject User A's save with a conflict error when User B saved the plan first`, async ({
    planManagementPage,
    planIn,
    staleSession,
    steps,
  }) => {
    const plan = await planIn('Draft', CONCURRENCY_PLAN);
    const valueB = edited(CHANGES.userB);
    const valueA = edited(CHANGES.userA);
    let formA!: PlanFormDialog;

    await steps.critical('Navigate to the Plans Management module - the plan list loads in both windows', async () => {
      await planManagementPage.openListFor(plan.payerName);
      await staleSession.plans.openListFor(plan.payerName);
      expect(await staleSession.plans.isListed(plan.name)).toBe(true);
    });

    await steps.critical('User A holds the plan open while User B has already saved a change, moving the stamp on', async () => {
      formA = await staleSession.plans.openEditForm(plan.name);
      const record = await planManagementPage.readPlanRecord(plan.id);
      const saved = await planManagementPage.updateWithStamp(record, { descriptionEn: valueB }, record.concurrencyStamp);
      expect(saved.status, `User B's save should be accepted: ${saved.text.slice(0, 200)}`).toBeLessThan(300);
    });

    await steps.step('As User A, the modified field shows the new value', async () => {
      await formA.editField('descriptionEn', valueA);
      expect(await formA.readField('descriptionEn')).toBe(valueA);
    });

    await steps.step('User A\'s save is rejected with a conflict error saying the plan has changed', async () => {
      const report = await formA.saveEditAndReport();
      expect(report.outcome?.status, `the stale save must be refused: ${report.text}`).toBe(CONFLICT.status);
      expect(report.messages.join(' | '), 'User A should be told the plan changed').toMatch(CONFLICT.message);
      expect((await planManagementPage.readPlanRecord(plan.id)).descriptionEn, 'User B\'s change is not overwritten').toBe(valueB);
    });
  });

  test(`TC-${CASE.firstConflict}: should reject the second save as a conflict even when it follows the first one at once`, async ({
    planManagementPage,
    planIn,
    staleSession,
    steps,
  }) => {
    const plan = await planIn('Draft', CONCURRENCY_PLAN);
    let stampOpened = '';

    await steps.critical('Navigate to the Plans Management module - the plan list loads in both windows', async () => {
      await planManagementPage.openListFor(plan.payerName);
      await staleSession.plans.openListFor(plan.payerName);
      expect(await staleSession.plans.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Both users open the plan at the same moment', async () => {
      stampOpened = String((await planManagementPage.readPlanRecord(plan.id)).concurrencyStamp ?? '');
      await staleSession.plans.openEditForm(plan.name);
      await planManagementPage.openEditForm(plan.name);
      expect(stampOpened).not.toBe('');
    });

    await steps.critical('User A saves straight after opening - the save completes and the stamp changes', async () => {
      const formA = planManagementPage.editForm();
      await formA.editField('descriptionEn', edited(CHANGES.userA));
      const report = await formA.saveEditAndReport();
      expect(report.outcome?.status ?? 0, `the first save should be accepted: ${report.text}`).toBeLessThan(300);
      expect(String((await planManagementPage.readPlanRecord(plan.id)).concurrencyStamp ?? '')).not.toBe(stampOpened);
    });

    await steps.step('User B\'s immediate save of the plan opened at the same instant is rejected as a conflict', async () => {
      const formB = staleSession.plans.editForm();
      await formB.editField('descriptionEn', edited(CHANGES.userB));
      const report = await formB.saveEditAndReport();
      expect(report.outcome?.status, `even the earliest second save must be detected: ${report.text}`).toBe(CONFLICT.status);
    });
  });

  test(`TC-${CASE.decisionTable}: should allow the save only when the client's stamp matches the stored one`, async ({
    planManagementPage,
    planIn,
    staleSession,
    steps,
  }) => {
    test.setTimeout(8 * 60_000);
    const untouched = await planIn('Draft', CONCURRENCY_PLAN);
    const contested = await planIn('Draft', CONCURRENCY_PLAN);

    await steps.critical('Navigate to the Plans Management module - the plan list loads in both windows', async () => {
      await planManagementPage.openListFor(contested.payerName);
      await staleSession.plans.openListFor(contested.payerName);
      expect(await staleSession.plans.isListed(contested.name)).toBe(true);
    });

    await steps.step('Case 1 - stamp unchanged: User A opens the first plan and saves - accepted', async () => {
      const report = await staleSession.plans.stageEdit(untouched.name, 'descriptionEn', edited(CHANGES.userA));
      expect(report.outcome?.status ?? 0, `an untouched stamp should allow the save: ${report.text}`).toBeLessThan(300);
    });

    await steps.step('Case 2 - stamp changed: User B saves the second plan first, then User A\'s save is rejected', async () => {
      const formA = await staleSession.plans.reopenEditForm(contested.name, contested.payerName);
      const record = await planManagementPage.readPlanRecord(contested.id);
      const saved = await planManagementPage.updateWithStamp(record, { descriptionEn: edited(CHANGES.userB) }, record.concurrencyStamp);
      expect(saved.status, `User B's save: ${saved.text.slice(0, 200)}`).toBeLessThan(300);
      await formA.editField('descriptionEn', edited(CHANGES.userA));
      const report = await formA.saveEditAndReport();
      expect(report.outcome?.status, `a changed stamp must reject the save: ${report.text}`).toBe(CONFLICT.status);
    });

    await steps.step('Case 3 - stamp refreshed: after reloading, User A\'s save of the second plan is accepted', async () => {
      const formA = await staleSession.plans.reopenEditForm(contested.name, contested.payerName);
      await formA.editField('descriptionEn', edited(CHANGES.retried));
      const report = await formA.saveEditAndReport();
      expect(report.outcome?.status ?? 0, `a refreshed stamp should allow the save: ${report.text}`).toBeLessThan(300);
    });
  });

  test(`TC-${CASE.stampPerSave}: should issue a distinct new stamp when the plan is saved several times in succession`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft', CONCURRENCY_PLAN);
    const stamps: string[] = [];

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      stamps.push(String((await planManagementPage.readPlanRecord(plan.id)).concurrencyStamp ?? ''));
      expect(stamps[0], 'the plan should carry a stamp').not.toBe('');
    });

    await steps.critical('A first change is saved - a new stamp is generated', async () => {
      const report = await planManagementPage.stageEdit(plan.name, 'descriptionEn', edited(CHANGES.first));
      expect(report.outcome?.status ?? 0, report.text).toBeLessThan(300);
      stamps.push(String((await planManagementPage.readPlanRecord(plan.id)).concurrencyStamp ?? ''));
      expect(stamps[1]).not.toBe(stamps[0]);
    });

    await steps.critical('Reopened, a second change is saved - another new stamp, different from the first', async () => {
      const form = await planManagementPage.reopenEditForm(plan.name, plan.payerName);
      await form.editField('descriptionEn', edited(CHANGES.second));
      const report = await form.saveEditAndReport();
      expect(report.outcome?.status ?? 0, report.text).toBeLessThan(300);
      stamps.push(String((await planManagementPage.readPlanRecord(plan.id)).concurrencyStamp ?? ''));
      expect(stamps[2]).not.toBe(stamps[1]);
    });

    await steps.step('Every save produced a distinct stamp value, none reused', async () => {
      expect(new Set(stamps).size, `stamps seen: ${stamps.join(', ')}`).toBe(stamps.length);
    });
  });

  test(`TC-${CASE.missingStamp}: should reject the save when its concurrency stamp is missing or tampered with`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft', CONCURRENCY_PLAN);
    let record!: PlanRecord;

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the plan for editing - it opens and a stamp is captured', async () => {
      const form = await planManagementPage.openEditForm(plan.name);
      record = await planManagementPage.readPlanRecord(plan.id);
      expect(await form.readField('nameEn')).toBe(plan.name);
      expect(String(record.concurrencyStamp ?? ''), 'a stamp to tamper with').not.toBe('');
      await form.closeAndDiscard();
    });

    await steps.step('A save with the stamp cleared or left out is rejected with an error, not silently accepted', async () => {
      const blank = await planManagementPage.updateWithStamp(record, { descriptionEn: edited(CHANGES.tampered) }, '');
      const omitted = await planManagementPage.updateWithStamp(record, { descriptionEn: edited(CHANGES.tampered) }, undefined);
      expect(STAMP_REFUSAL_STATUSES as readonly number[], `a blank stamp answered ${blank.status} ${blank.text.slice(0, 200)}`).toContain(blank.status);
      expect(STAMP_REFUSAL_STATUSES as readonly number[], `an omitted stamp answered ${omitted.status} ${omitted.text.slice(0, 200)}`).toContain(omitted.status);
      expect((await planManagementPage.readPlanRecord(plan.id)).descriptionEn, 'nothing may have been saved').toBe(record.descriptionEn);
    });
  });

  test(`TC-${CASE.doubleSave}: should save once without data loss or a misleading conflict when Save is double-clicked`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft', CONCURRENCY_PLAN);
    const value = edited(CHANGES.doubleSave);
    let form!: PlanFormDialog;
    let saves!: Awaited<ReturnType<PlanFormDialog['saveRapidlyAndCaptureAll']>>;

    await steps.critical('Navigate to the Plans Management module - the plan list loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the plan for editing and make a change - the field shows it', async () => {
      form = await planManagementPage.openEditForm(plan.name);
      await form.editField('descriptionEn', value);
      expect(await form.readField('descriptionEn')).toBe(value);
    });

    await steps.step('Save clicked twice in rapid succession - the first save request completes successfully', async () => {
      saves = await form.saveRapidlyAndCaptureAll(DOUBLE_SAVE_CLICKS);
      expect(saves.statuses.length, 'at least one save request should be sent').toBeGreaterThan(0);
      expect(saves.statuses[0], `the first save: ${saves.texts[0]?.slice(0, 200)}`).toBeLessThan(300);
    });

    await steps.step('The near-simultaneous second request completes or is refused with a reload message, and nothing is lost', async () => {
      const others = saves.statuses.slice(1);
      expect(others.every((status) => status < 300 || status === CONFLICT.status), `second answers: ${others.join(', ')}`).toBe(true);
      expect(!others.includes(CONFLICT.status) || CONFLICT.message.test(saves.messages.join(' | ')), 'a refused duplicate must tell the user to reload').toBe(true);
      expect((await planManagementPage.readPlanRecord(plan.id)).descriptionEn, 'the change must be kept').toBe(value);
    });
  });
});
