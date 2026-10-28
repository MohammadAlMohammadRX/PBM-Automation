import { test, expect } from '../../../fixtures';
import { PLAN_LIFECYCLE } from '../../../data/plans/plan.data';
import {
  AUTHORISATION_REFUSALS,
  BLOCKED_CASES,
  CASE,
  INACTIVATION_DETAILS,
  ISOLATION_CASE_TIMEOUT_MS,
  LONG_CASE_TIMEOUT_MS,
  SCOPED_PAYER,
  STAGED_TOAST,
  STATUS_CODE,
  STATUS_PERMISSIONS,
  STATUS_WAIT_MS,
} from '../../../data/plans/isolatePlanStatusChanges.data';

/**
 * User story 16775: Keep activation and deactivation changes isolated to the plan itself.
 * A plan's activation or deactivation, approved end to end, must leave its
 * linked formulary's own status as it was; and a role without the plan status
 * rights cannot make the change at all. The policy half of the story is BLOCKED
 * (see the data file) - the suite cannot link a policy to a plan of its own.
 */
test.describe('US 16775 - Plan status changes stay with the plan', () => {
  test(`TC-${CASE.activateKeepsFormulary}: should leave the linked Active formulary Active when an Inactive plan is activated`, async ({
    planIn,
    planFormulary,
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    steps,
  }) => {
    test.setTimeout(ISOLATION_CASE_TIMEOUT_MS);
    const formulary = await planFormulary();
    const plan = await planIn('Inactive', { formularyId: formulary.id });
    const linked = planDetailPage.formulary();

    await steps.critical('Navigate to the Plans Management module - the plan list loads with the plan', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name), `"${plan.name}" should be listed`).toBe(true);
    });

    await steps.critical('The Inactive plan opens showing its status and the linked formulary', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.expectStatus(PLAN_LIFECYCLE.inactive);
      await linked.open();
      expect(await linked.getPanelText(), 'the formulary reference').toContain(formulary.formularyCode ?? formulary.formularyNameEn);
    });

    await steps.critical('The linked formulary is Active in the Formulary register', async () => {
      expect(await linked.readFormularyStatusViaApi(formulary.id)).toBe(STATUS_CODE.active);
    });

    await steps.critical('Choosing Activate presents a confirmation prompt', async () => {
      const prompt = await planManagementPage.openActivationPrompt(plan.name);
      expect(await prompt.getTitle(), 'the activation prompt should have a title').not.toBe('');
    });

    await steps.critical('Confirming the activation succeeds and, once approved, the plan is Active', async () => {
      await planManagementPage.dialog().confirm('activate');
      await expect.poll(() => planDetailPage.readToast(), { message: 'a success message should be displayed' }).toMatch(STAGED_TOAST);
      await planManagementPage.submitForApproval(plan.name);
      await planApprovalsPage.open();
      await planApprovalsPage.approve(plan.name);
      await planDetailPage.open(plan.id);
      await planDetailPage.expectStatusEventually(PLAN_LIFECYCLE.active, STATUS_WAIT_MS);
    });

    await steps.step('The previously linked formulary is still Active', async () => {
      expect(await linked.readFormularyStatusViaApi(formulary.id), 'the formulary must keep its own status').toBe(STATUS_CODE.active);
    });
  });

  test(`TC-${CASE.deactivateKeepsFormulary}: should leave the linked Active formulary Active when an Active plan is deactivated`, async ({
    planIn,
    planFormulary,
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    planInactivateDialog,
    steps,
  }) => {
    test.setTimeout(ISOLATION_CASE_TIMEOUT_MS);
    const formulary = await planFormulary();
    const plan = await planIn('Active', { formularyId: formulary.id });
    const linked = planDetailPage.formulary();

    await steps.critical('Navigate to the Plans Management module - the plan list loads with the plan', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name), `"${plan.name}" should be listed`).toBe(true);
    });

    await steps.critical('The Active plan opens showing its status and the linked formulary', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.expectStatus(PLAN_LIFECYCLE.active);
      await linked.open();
      expect(await linked.getPanelText(), 'the formulary reference').toContain(formulary.formularyCode ?? formulary.formularyNameEn);
      expect(await linked.readFormularyStatusViaApi(formulary.id), 'the formulary starts Active').toBe(STATUS_CODE.active);
    });

    await steps.critical('Choosing Inactivate presents the deactivation prompt', async () => {
      const drawer = await planManagementPage.openDeactivationDrawer(plan.name);
      expect(await drawer.getTitleText(), 'the deactivation prompt should have a title').not.toBe('');
    });

    await steps.critical('Confirming the deactivation succeeds and, once approved, the plan is Inactive', async () => {
      await planInactivateDialog.inactivateWithFirstReason(INACTIVATION_DETAILS);
      await expect.poll(() => planDetailPage.readToast(), { message: 'a success message should be displayed' }).toMatch(STAGED_TOAST);
      await planManagementPage.submitForApproval(plan.name);
      await planApprovalsPage.open();
      await planApprovalsPage.approve(plan.name);
      await planDetailPage.open(plan.id);
      await planDetailPage.expectStatusEventually(PLAN_LIFECYCLE.inactive, STATUS_WAIT_MS);
    });

    await steps.step('The previously linked formulary is still Active', async () => {
      expect(await linked.readFormularyStatusViaApi(formulary.id), 'the formulary must keep its own status').toBe(STATUS_CODE.active);
    });
  });

  test(`TC-${CASE.activateWithInactiveFormulary}: should leave an Inactive linked formulary Inactive when the plan is activated`, async ({
    disposableFormulary,
    deactivatedFormulary,
    planIn,
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    steps,
  }) => {
    test.setTimeout(LONG_CASE_TIMEOUT_MS);
    const formulary = await disposableFormulary();
    const plan = await planIn('Inactive', { formularyId: formulary.id });
    await deactivatedFormulary(formulary);
    const linked = planDetailPage.formulary();

    await steps.critical('Navigate to the Plans Management module - the plan list loads with the plan', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name), `"${plan.name}" should be listed`).toBe(true);
    });

    await steps.critical('The Inactive plan opens showing its status and the linked (Inactive) formulary', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.expectStatus(PLAN_LIFECYCLE.inactive);
      await linked.open();
      expect(await linked.getPanelText(), 'the formulary reference').toContain(formulary.formularyCode ?? formulary.formularyNameEn);
      expect(await linked.readFormularyStatusViaApi(formulary.id), 'the formulary starts Inactive').toBe(STATUS_CODE.inactive);
    });

    await steps.critical('Activating and confirming succeeds and, once approved, the plan is Active', async () => {
      await planManagementPage.stageStatusChange(plan.name, 'activate');
      await expect.poll(() => planDetailPage.readToast(), { message: 'a success message should be displayed' }).toMatch(STAGED_TOAST);
      await planManagementPage.submitForApproval(plan.name);
      await planApprovalsPage.open();
      await planApprovalsPage.approve(plan.name);
      await planDetailPage.open(plan.id);
      await planDetailPage.expectStatusEventually(PLAN_LIFECYCLE.active, STATUS_WAIT_MS);
    });

    await steps.step('The linked formulary is still Inactive - it does not follow the plan', async () => {
      expect(await linked.readFormularyStatusViaApi(formulary.id), 'the formulary must keep its own status').toBe(STATUS_CODE.inactive);
    });
  });

  test(`TC-${CASE.deactivateWithoutPolicies}: should deactivate without errors and leave the formulary unchanged when the plan has no linked policies`, async ({
    planIn,
    planFormulary,
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    policyManagementPage,
    steps,
  }) => {
    test.setTimeout(ISOLATION_CASE_TIMEOUT_MS);
    const formulary = await planFormulary();
    const plan = await planIn('Active', { formularyId: formulary.id });
    const linked = planDetailPage.formulary();

    await steps.critical('Navigate to the Plans Management module - the plan list loads with the plan', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name), `"${plan.name}" should be listed`).toBe(true);
    });

    await steps.critical('The Active plan opens - and no policy is linked to it', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.expectStatus(PLAN_LIFECYCLE.active);
      expect(await policyManagementPage.getPoliciesOfPlan(plan.payerName, plan.name), 'linked policies').toEqual([]);
    });

    await steps.critical('Deactivating and confirming succeeds without errors and, once approved, the plan is Inactive', async () => {
      await planManagementPage.stageStatusChange(plan.name, 'inactivate', INACTIVATION_DETAILS);
      await expect.poll(() => planDetailPage.readToast(), { message: 'a success message should be displayed' }).toMatch(STAGED_TOAST);
      await planManagementPage.submitForApproval(plan.name);
      await planApprovalsPage.open();
      await planApprovalsPage.approve(plan.name);
      await planDetailPage.open(plan.id);
      await planDetailPage.expectStatusEventually(PLAN_LIFECYCLE.inactive, STATUS_WAIT_MS);
    });

    await steps.step('The linked formulary\'s status is unchanged', async () => {
      expect(await linked.readFormularyStatusViaApi(formulary.id), 'the formulary must keep its own status').toBe(STATUS_CODE.active);
    });
  });

  test(`TC-${CASE.noPlanAdminRights}: should neither offer nor allow a status change when the user lacks the plan administrator rights`, async ({
    planIn,
    payerFormulary,
    planDetailPage,
    shapedNonAdmin,
    requireBaseline,
    steps,
  }) => {
    test.setTimeout(LONG_CASE_TIMEOUT_MS);
    const formulary = await payerFormulary(SCOPED_PAYER);
    const plan = await planIn('Active', { payerName: SCOPED_PAYER, formularyId: formulary.id });

    // Baseline: the same role HOLDING the rights is offered Inactivate on this plan.
    const holder = await shapedNonAdmin({ with: [...STATUS_PERMISSIONS] });
    await holder.planDetail.open(plan.id);
    requireBaseline((await holder.planDetail.getActionAvailability('inactivate')) === 'available', 'the Inactivate action for a session holding InactivatePlan');
    const viewer = await shapedNonAdmin({ without: [...STATUS_PERMISSIONS] });

    await steps.critical('Navigate to the Plans Management module - the list loads in a read-only context', async () => {
      expect(viewer.removed.length, 'the rights should have been withdrawn').toBeGreaterThan(0);
      await viewer.plans.openListFor(plan.payerName);
      expect(await viewer.plans.isListed(plan.name), `"${plan.name}" should be listed`).toBe(true);
    });

    await steps.critical('The plan detail opens showing status Active', async () => {
      await viewer.planDetail.open(plan.id);
      await viewer.planDetail.expectStatus(PLAN_LIFECYCLE.active);
    });

    await steps.step('The activate / deactivate controls are disabled or not shown', async () => {
      expect(await viewer.planDetail.getActionAvailability('inactivate'), 'Inactivate must not be usable').not.toBe('available');
      expect(await viewer.planDetail.getActionAvailability('activate'), 'Activate must not be usable').not.toBe('available');
    });

    await steps.step('A direct status change is refused and nothing changes - plan and formulary keep their status', async () => {
      const answer = await viewer.planDetail.requestInactivationViaApi(plan.id, INACTIVATION_DETAILS);
      expect(AUTHORISATION_REFUSALS, `InactivatePlan answered ${answer.status}: ${answer.text.slice(0, 200)}`).toContain(answer.status);
      expect(await planDetailPage.readStatusCodeViaApi(plan.id), 'the plan keeps its status').toBe(STATUS_CODE.active);
      expect(await planDetailPage.formulary().readFormularyStatusViaApi(formulary.id), 'the formulary keeps its status').toBe(STATUS_CODE.active);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
