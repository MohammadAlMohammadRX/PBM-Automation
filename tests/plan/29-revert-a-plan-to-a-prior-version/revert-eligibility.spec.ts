import { test, expect } from '../../../fixtures';
import type { PlanVersionRecord } from '../../../pages/plan/PlanVersionHistoryTab';
import { PLAN_VERSION_STATUS } from '../../../data/plans/plan.data';
import {
  AUTHORISATION_REFUSALS,
  BLOCKED_CASES,
  CASE,
  MESSAGE,
  PERMISSION_CASE_TIMEOUT_MS,
  REVERT_CASE_TIMEOUT_MS,
  REVERT_PERMISSION,
  SCOPED_PAYER,
  VERSION,
  neverPublishedVersion,
  newestVersion,
  v,
  versionNumbered,
} from '../../../data/plans/revertPlanVersion.data';

/**
 * User story 14345: Revert a plan to a prior version.
 * Who may revert to which version: only versions that were published, only
 * with the Revert Plan Version permission, and not while another change awaits
 * approval. Refusals the screen cannot express are sent directly by version id
 * (PlanVersionHistoryTab.revertViaApi), as in the network twin (US 14321).
 */

test.describe('US 14345 - Which versions may be reverted to, and by whom', () => {
  test(`TC-${CASE.refuseNeverPublished}: should refuse the revert when the chosen version was never published`, async ({
    planIn,
    planDetailPage,
    steps,
  }) => {
    test.setTimeout(REVERT_CASE_TIMEOUT_MS);
    const plan = await planIn('Rejected');
    const tab = planDetailPage.versions();
    let target: PlanVersionRecord | undefined;

    await steps.critical('Navigate to the Plans Management module - the plan opens', async () => {
      await planDetailPage.open(plan.id);
      expect(await planDetailPage.getName()).toBe(plan.name);
    });

    await steps.critical('The version history lists a version that was never published', async () => {
      await tab.open();
      target = neverPublishedVersion(await tab.readVersionsViaApi(plan.id));
      expect(target, 'the rejected creation should be a never-published version').toBeDefined();
      expect((await tab.readRows()).map((row) => row.version)).toContain(v(target?.version ?? VERSION.neverPublished));
    });

    await steps.step('Selecting the never-published version shows its details', async () => {
      expect(await tab.viewVersionText(v(target?.version ?? VERSION.neverPublished))).toContain(plan.name);
    });

    await steps.step('Revert is unavailable for it, and a direct revert is rejected', async () => {
      expect(await tab.offersRevert(v(target?.version ?? VERSION.neverPublished)), 'a never-published version must not offer Revert').toBe(false);
      const answer = await tab.revertViaApi(plan.id, target?.id ?? '');
      expect(answer.status, `RevertPlanVersion answered ${answer.status}: ${answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
      expect(answer.text, 'the refusal should say only published versions qualify').toMatch(MESSAGE.onlyPublished);
    });
  });

  test(`TC-${CASE.decisionTable}: should allow a revert only when the version was published and the user holds Revert Plan Version`, async ({
    planIn,
    payerFormulary,
    planDetailPage,
    shapedNonAdmin,
    steps,
  }) => {
    test.setTimeout(PERMISSION_CASE_TIMEOUT_MS);
    const published = await planIn('Inactive');
    const unpublished = await planIn('Rejected');
    const formulary = await payerFormulary(SCOPED_PAYER);
    const scopedPlan = await planIn('Inactive', { payerName: SCOPED_PAYER, formularyId: formulary.id });
    const tab = planDetailPage.versions();

    await steps.critical('Navigate to the Plans Management module - the plans open', async () => {
      await planDetailPage.open(published.id);
      expect(await planDetailPage.getName()).toBe(published.name);
    });

    await steps.step('Authorised user + published version: the revert is allowed', async () => {
      const target = versionNumbered(await tab.readVersionsViaApi(published.id), VERSION.created);
      const answer = await tab.revertViaApi(published.id, target?.id ?? '');
      expect(answer.status, `RevertPlanVersion answered ${answer.status}: ${answer.text.slice(0, 200)}`).toBeLessThan(300);
    });

    await steps.step('Authorised user + never-published version: the revert is blocked', async () => {
      const target = neverPublishedVersion(await tab.readVersionsViaApi(unpublished.id));
      expect(target, 'the rejected creation should be a never-published version').toBeDefined();
      const answer = await tab.revertViaApi(unpublished.id, target?.id ?? '');
      expect(answer.status, `RevertPlanVersion answered ${answer.status}: ${answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
    });

    await steps.step('Unauthorised user + published version: the revert is blocked for the missing permission', async () => {
      const target = versionNumbered(await tab.readVersionsViaApi(scopedPlan.id), VERSION.created);
      const session = await shapedNonAdmin({ without: [REVERT_PERMISSION] });
      expect(session.removed.length, 'the permission should have been withdrawn').toBeGreaterThan(0);
      const answer = await session.planDetail.versions().revertViaApi(scopedPlan.id, target?.id ?? '');
      expect(AUTHORISATION_REFUSALS, `RevertPlanVersion answered ${answer.status}: ${answer.text.slice(0, 200)}`).toContain(answer.status);
    });
  });

  test(`TC-${CASE.noPermission}: should hide or deny Revert on a published version when the user lacks the Revert Plan Version permission`, async ({
    planIn,
    payerFormulary,
    planDetailPage,
    shapedNonAdmin,
    requireBaseline,
    steps,
  }) => {
    test.setTimeout(PERMISSION_CASE_TIMEOUT_MS);
    const formulary = await payerFormulary(SCOPED_PAYER);
    const plan = await planIn('Inactive', { payerName: SCOPED_PAYER, formularyId: formulary.id });
    const target = versionNumbered(await planDetailPage.versions().readVersionsViaApi(plan.id), VERSION.created);
    let before = 0;

    // Baseline: the same role HOLDING the right is offered Revert on this version.
    const holder = await shapedNonAdmin({ with: [REVERT_PERMISSION] });
    await holder.planDetail.open(plan.id);
    await holder.planDetail.versions().open();
    requireBaseline(await holder.planDetail.versions().offersRevert(v(VERSION.created)), 'Revert on a published version for a session holding RevertPlanVersion');
    const viewer = await shapedNonAdmin({ without: [REVERT_PERMISSION] });

    await steps.critical('Navigate to the Plans Management module as the user without the permission - the plan opens', async () => {
      expect(viewer.removed.length, 'the permission should have been withdrawn').toBeGreaterThan(0);
      await viewer.planDetail.open(plan.id);
      expect(await viewer.planDetail.getName()).toBe(plan.name);
    });

    await steps.critical('The user opens the plan\'s version history - the versions are listed', async () => {
      await viewer.planDetail.versions().open();
      const rows = await viewer.planDetail.versions().readRows();
      before = rows.length;
      expect(rows.map((row) => row.version)).toContain(v(VERSION.created));
    });

    await steps.step('Revert is not offered on the published version, and a direct attempt is denied', async () => {
      expect(await viewer.planDetail.versions().offersRevert(v(VERSION.created)), 'Revert must not be offered without the permission').toBe(false);
      const answer = await viewer.planDetail.versions().revertViaApi(plan.id, target?.id ?? '');
      expect(AUTHORISATION_REFUSALS, `RevertPlanVersion answered ${answer.status}: ${answer.text.slice(0, 200)}`).toContain(answer.status);
      expect((await planDetailPage.versions().readVersionsViaApi(plan.id)).length, 'no version may have been added').toBe(before);
    });
  });

  test(`TC-${CASE.pendingConflict}: should block the revert under the single-pending-change rule when another change already awaits approval`, async ({
    planIn,
    stagePlanActivation,
    planDetailPage,
    steps,
  }) => {
    test.setTimeout(REVERT_CASE_TIMEOUT_MS);
    const plan = await planIn('Inactive');
    await stagePlanActivation(plan, 'submit');
    const tab = planDetailPage.versions();

    await steps.critical('Navigate to the Plans Management module - the plan opens', async () => {
      await planDetailPage.open(plan.id);
      expect(await planDetailPage.getName()).toBe(plan.name);
    });

    await steps.critical('The plan shows a change Pending Approval', async () => {
      expect(await planDetailPage.getNotice(), 'the header should say a change awaits approval').toMatch(MESSAGE.awaitingApproval);
      expect(newestVersion(await tab.readVersionsViaApi(plan.id))?.versionStatusEn).toBe(PLAN_VERSION_STATUS.pendingApproval);
    });

    await steps.step('Reverting to the published v1 is blocked with the single-pending-change message', async () => {
      const versions = await tab.readVersionsViaApi(plan.id);
      const target = versionNumbered(versions, VERSION.created);
      const answer = await tab.revertViaApi(plan.id, target?.id ?? '');
      expect(answer.status, `RevertPlanVersion answered ${answer.status}: ${answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
      expect(answer.text, 'the refusal should cite the change already pending').toMatch(MESSAGE.pendingConflict);
      expect((await tab.readVersionsViaApi(plan.id)).length, 'no second request may have been created').toBe(versions.length);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
