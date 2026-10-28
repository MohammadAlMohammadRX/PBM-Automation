import { test, expect } from '../../../fixtures';
import type { PlanVersionRecord } from '../../../pages/plan/PlanVersionHistoryTab';
import { PLAN_LIFECYCLE, PLAN_VERSION_STATUS } from '../../../data/plans/plan.data';
import {
  ADMIN_ACTOR,
  AUDIT_TIME_PATTERN,
  CASE,
  MESSAGE,
  PUBLISHED_STATES,
  PUBLISH_WAIT_MS,
  RAPID_CONFIRMS,
  REVERT_CASE_TIMEOUT_MS,
  REVERT_CHANGE,
  VERSION,
  newestVersion,
  revertedAttributes,
  v,
  versionNumbered,
} from '../../../data/plans/revertPlanVersion.data';

/**
 * User story 14345: Revert a plan to a prior version.
 * Reverting to a previously published version: the confirmation, the staged
 * change awaiting approval, what approval restores (attributes and formulary),
 * the success message and audit trail, and repeated submission.
 *
 * Every plan is the case's own: `planIn('Inactive')` gives v1 (published, then
 * superseded) and v2 (the inactivation, current) - see the data file.
 */
test.describe('US 14345 - Reverting a plan to a published version', () => {
  test(`TC-${CASE.revertPublished}: should accept the revert and stage the version's values for approval when a previously published version is reverted to`, async ({
    planIn,
    planDetailPage,
    steps,
  }) => {
    test.setTimeout(REVERT_CASE_TIMEOUT_MS);
    const plan = await planIn('Inactive');
    const tab = planDetailPage.versions();
    let target: PlanVersionRecord | undefined;

    await steps.critical('Navigate to the Plans Management module - the plan opens', async () => {
      await planDetailPage.open(plan.id);
      expect(await planDetailPage.getName()).toBe(plan.name);
    });

    await steps.critical('The version history lists the versions with their statuses', async () => {
      await tab.open();
      const rows = await tab.readRows();
      expect(rows.map((row) => row.version)).toEqual(expect.arrayContaining([v(VERSION.created), v(VERSION.current)]));
      expect(rows.find((row) => row.version === v(VERSION.created))?.status, 'v1 was published').toMatch(PUBLISHED_STATES);
      target = versionNumbered(await tab.readVersionsViaApi(plan.id), VERSION.created);
      expect(target, 'v1 should be readable').toBeDefined();
    });

    await steps.critical('Choosing Revert on the previously published version presents a confirmation', async () => {
      const dialog = await tab.openRevertPrompt(v(VERSION.created));
      expect(await dialog.isVisible(), 'the revert confirmation should be on screen').toBe(true);
    });

    await steps.step('Confirming is accepted with a success message, staging v1\'s attributes and formulary for approval', async () => {
      const outcome = await tab.confirmRevertPrompt();
      expect(outcome?.status, `RevertPlanVersion: ${outcome?.text.slice(0, 200)}`).toBeLessThan(300);
      await expect.poll(() => planDetailPage.readToast(), { message: 'a success message should be displayed' }).toMatch(MESSAGE.revertAccepted);
      const staged = newestVersion(await tab.readVersionsViaApi(plan.id));
      expect(staged?.versionStatusEn, 'the revert should await review and approval').toBe(PLAN_VERSION_STATUS.pendingApproval);
      expect(revertedAttributes(staged ?? {}, target), 'the staged version should carry v1\'s values').toEqual(revertedAttributes(target ?? {}));
    });
  });

  test(`TC-${CASE.bothBoundaries}: should accept a revert to the oldest and to the most recent prior published version when both are tried in turn`, async ({
    planIn,
    planDetailPage,
    planApprovalsPage,
    steps,
  }) => {
    test.setTimeout(REVERT_CASE_TIMEOUT_MS);
    const plan = await planIn('Inactive');
    const tab = planDetailPage.versions();

    await steps.critical('Navigate to the Plans Management module - the plan opens', async () => {
      await planDetailPage.open(plan.id);
      expect(await planDetailPage.getName()).toBe(plan.name);
    });

    await steps.critical('Reverting to the oldest published version (v1) is accepted', async () => {
      await tab.open();
      expect(await tab.offersRevert(v(VERSION.created)), 'v1 should offer Revert').toBe(true);
      const outcome = await tab.revertTo(v(VERSION.created));
      expect(outcome?.status, `RevertPlanVersion: ${outcome?.text.slice(0, 200)}`).toBeLessThan(300);
      // The single-pending-change rule: the first revert is approved before the second is asked for.
      await planApprovalsPage.open();
      await planApprovalsPage.approve(plan.name);
      await expect
        .poll(async () => newestVersion(await tab.readVersionsViaApi(plan.id))?.versionStatusEn, { timeout: PUBLISH_WAIT_MS })
        .toBe(PLAN_VERSION_STATUS.published);
    });

    await steps.step('Reverting to the most recent published version before the current one (v2) is accepted', async () => {
      await planDetailPage.open(plan.id);
      await tab.open();
      expect(await tab.offersRevert(v(VERSION.current)), 'v2 - now the last version before the current one - should offer Revert').toBe(true);
      const outcome = await tab.revertTo(v(VERSION.current));
      expect(outcome?.status, `RevertPlanVersion: ${outcome?.text.slice(0, 200)}`).toBeLessThan(300);
    });
  });

  test(`TC-${CASE.entersReview}: should leave the current configuration in place and await approval when a revert is submitted`, async ({
    planIn,
    planDetailPage,
    steps,
  }) => {
    test.setTimeout(REVERT_CASE_TIMEOUT_MS);
    const plan = await planIn('Inactive');
    const tab = planDetailPage.versions();

    await steps.critical('Navigate to the Plans Management module - the plan opens', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.expectStatus(PLAN_LIFECYCLE.inactive);
    });

    await steps.critical('Initiating Revert on a published prior version creates a revert request', async () => {
      await tab.open();
      const dialog = await tab.openRevertPrompt(v(VERSION.created));
      expect(await dialog.isVisible(), 'the revert confirmation should be on screen').toBe(true);
    });

    await steps.critical('Confirming completes the revert submission', async () => {
      const outcome = await tab.confirmRevertPrompt();
      expect(outcome?.status, `RevertPlanVersion: ${outcome?.text.slice(0, 200)}`).toBeLessThan(300);
    });

    await steps.step('The plan still shows its current configuration and reads as awaiting approval', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.expectStatus(PLAN_LIFECYCLE.inactive);
      expect(await planDetailPage.getNotice(), 'the header should say a change awaits approval').toMatch(MESSAGE.awaitingApproval);
      expect(newestVersion(await tab.readVersionsViaApi(plan.id))?.versionStatusEn).toBe(PLAN_VERSION_STATUS.pendingApproval);
    });
  });

  test(`TC-${CASE.restoredOnApproval}: should restore the reverted version's attributes and formulary when the revert request is approved`, async ({
    planIn,
    pendingRevert,
    planDetailPage,
    planApprovalsPage,
    steps,
  }) => {
    test.setTimeout(REVERT_CASE_TIMEOUT_MS);
    const plan = await planIn('Inactive');
    const target = versionNumbered(await planDetailPage.versions().readVersionsViaApi(plan.id), VERSION.created);
    await pendingRevert(plan, VERSION.created);

    await steps.critical('Navigate to the Plans Management module - the revert awaits approval', async () => {
      await planApprovalsPage.open();
      await planApprovalsPage.expectInQueue(plan.name);
    });

    await steps.critical('The approver opens the pending revert - its details show the version\'s values', async () => {
      const changes = await planApprovalsPage.openReview(plan.name);
      expect(changes.length, 'the review should list what the revert changes').toBeGreaterThan(0);
      await planApprovalsPage.closeReview();
    });

    await steps.critical('Approving the revert is recorded', async () => {
      await planApprovalsPage.approve(plan.name);
      await expect
        .poll(async () => newestVersion(await planDetailPage.versions().readVersionsViaApi(plan.id))?.versionStatusEn, { timeout: PUBLISH_WAIT_MS })
        .toBe(PLAN_VERSION_STATUS.published);
    });

    await steps.step('The plan now carries the reverted version\'s attributes and formulary', async () => {
      await planDetailPage.open(plan.id);
      const record = await planDetailPage.readRecordViaApi(plan.id);
      expect(target, 'v1 should have been readable').toBeDefined();
      expect(revertedAttributes(record, target), 'the plan should match v1').toEqual(revertedAttributes(target ?? {}));
    });
  });

  test(`TC-${CASE.successAndAudit}: should show a success message and record the revert with actor, date and version when a revert is confirmed`, async ({
    planIn,
    planDetailPage,
    steps,
  }) => {
    test.setTimeout(REVERT_CASE_TIMEOUT_MS);
    const plan = await planIn('Inactive');
    const tab = planDetailPage.versions();
    let before = 0;

    await steps.critical('Navigate to the Plans Management module - the plan opens', async () => {
      await planDetailPage.open(plan.id);
      expect(await planDetailPage.getName()).toBe(plan.name);
    });

    await steps.critical('Reverting to the published v1 and confirming creates a revert request', async () => {
      await tab.open();
      before = (await tab.readRows()).length;
      const outcome = await tab.revertTo(v(VERSION.created));
      expect(outcome?.status, `RevertPlanVersion: ${outcome?.text.slice(0, 200)}`).toBeLessThan(300);
    });

    await steps.step('A clear success message is displayed', async () => {
      await expect.poll(() => planDetailPage.readToast(), { message: 'a success message should be displayed' }).toMatch(MESSAGE.revertAccepted);
    });

    await steps.step('The version history and the audit trail each gain an entry for the revert', async () => {
      await planDetailPage.open(plan.id);
      await tab.open();
      const rows = await tab.readRows();
      expect(rows.length, 'the revert should add a version').toBe(before + 1);
      expect(rows[0].change, 'the newest version should be the revert').toMatch(REVERT_CHANGE);
      await planDetailPage.audit().open();
      expect((await planDetailPage.audit().readEntries()).length, 'the audit trail should list entries').toBeGreaterThan(0);
    });

    await steps.step('The audit entry records the actor, the date and time, and the version reverted to', async () => {
      const [entry] = await planDetailPage.audit().readEntries();
      expect(entry.by, 'the actor').toBe(ADMIN_ACTOR);
      expect(entry.when, 'the date and time').toMatch(AUDIT_TIME_PATTERN);
      const detail = await planDetailPage.audit().openEntry(0);
      expect(JSON.stringify(detail), 'the entry should say it is a revert').toMatch(REVERT_CHANGE);
      expect(JSON.stringify(detail), 'the entry should name the version reverted to').toContain(v(VERSION.created));
      await planDetailPage.audit().closeEntry();
    });
  });

  test(`TC-${CASE.noDuplicates}: should create exactly one pending revert when the revert is confirmed repeatedly in quick succession`, async ({
    planIn,
    planDetailPage,
    steps,
  }) => {
    test.setTimeout(REVERT_CASE_TIMEOUT_MS);
    const plan = await planIn('Inactive');
    const tab = planDetailPage.versions();
    let before = 0;

    await steps.critical('Navigate to the Plans Management module - the plan opens', async () => {
      await planDetailPage.open(plan.id);
      await tab.open();
      before = (await tab.readVersionsViaApi(plan.id)).length;
      expect(before, 'the plan should have its two published versions').toBeGreaterThanOrEqual(2);
    });

    await steps.critical(`Confirming the revert ${RAPID_CONFIRMS} times before it completes is accepted once`, async () => {
      const fired = await tab.revertRepeatedly(v(VERSION.created), RAPID_CONFIRMS);
      expect(fired, 'the screen should have sent the revert').toBeGreaterThan(0);
    });

    await steps.step('Exactly one revert request exists in the pending change and the version history', async () => {
      const versions = await tab.readVersionsViaApi(plan.id);
      expect(versions.length, 'exactly one version should have been added').toBe(before + 1);
      expect(versions.filter((record) => record.versionStatusEn === PLAN_VERSION_STATUS.pendingApproval), 'pending revert requests').toHaveLength(1);
    });
  });

  test(`TC-${CASE.formularyRestored}: should restore exactly the formulary the reverted version carried when the plan's formulary has changed since`, async ({
    suitePayerFormularies,
    planWithFormularyHistory,
    planDetailPage,
    planApprovalsPage,
    steps,
  }) => {
    test.setTimeout(REVERT_CASE_TIMEOUT_MS);
    const [original, replacement] = await suitePayerFormularies(2);
    const plan = await planWithFormularyHistory([original, replacement]);
    const formulary = planDetailPage.formulary();

    await steps.critical('Navigate to the Plans Management module - the plan opens', async () => {
      await planDetailPage.open(plan.id);
      expect(await planDetailPage.getName()).toBe(plan.name);
    });

    await steps.critical('The plan\'s current formulary is the replacement (FRM-A of the sheet)', async () => {
      expect(await formulary.readAssignedFormularyIdViaApi(plan.id)).toBe(replacement.id);
    });

    await steps.critical('Reverting to v1 - which carried the original formulary (FRM-B) - is approved', async () => {
      const tab = planDetailPage.versions();
      await tab.open();
      const outcome = await tab.revertTo(v(VERSION.created));
      expect(outcome?.status, `RevertPlanVersion: ${outcome?.text.slice(0, 200)}`).toBeLessThan(300);
      await planApprovalsPage.open();
      await planApprovalsPage.approve(plan.name);
      await expect
        .poll(async () => newestVersion(await tab.readVersionsViaApi(plan.id))?.versionStatusEn, { timeout: PUBLISH_WAIT_MS })
        .toBe(PLAN_VERSION_STATUS.published);
    });

    await steps.step('The plan\'s formulary is exactly v1\'s', async () => {
      await planDetailPage.open(plan.id);
      await formulary.open();
      expect(await formulary.readAssignedFormularyIdViaApi(plan.id), `the formulary should be ${original.formularyCode} again`).toBe(original.id);
      expect(await formulary.getPanelText(), 'the tab should show the restored formulary').toContain(original.formularyCode ?? original.formularyNameEn);
    });
  });
});
