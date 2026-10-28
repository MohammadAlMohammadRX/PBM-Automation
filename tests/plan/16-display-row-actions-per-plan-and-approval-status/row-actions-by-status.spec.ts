import { test, expect } from '../../../fixtures';
import {
  APPROVAL,
  CASE,
  EXPIRED_LOCKED_ACTIONS,
  EXPIRY_WAIT_MS,
  LIFECYCLE_ACTIONS,
  LIFECYCLE_STAGES,
  NON_DRAFT_STATES,
  SHORT_LIVED,
  STAGED_CHANGE_DETAILS,
  STATUS,
  VIEW_STATES,
} from '../../../data/plans/planRowActions.data';

/**
 * User story 14168: Display row actions per plan and approval status.
 * Which row actions the Plans list offers in each status - View always, Edit
 * until the first version is published, nothing lifecycle-related once
 * Expired, Send for Approval for a staged change, Delete for drafts only - and
 * how the set follows one plan through its lifecycle.
 * Twins: tests/network/39 (status prerequisites) and 36 (per-action permissions).
 */
test.describe('US 14168 - Row actions by plan status', () => {
  test(`TC-${CASE.viewAlways}: should offer a working View action when plans are Draft, Pending Approval, Active and Expired`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(30 * 60_000);
    const plans = {
      Draft: await planIn('Draft'),
      PendingApproval: await planIn('PendingApproval'),
      Active: await planIn('Active'),
      Expired: await planIn('Expired'),
    };

    await steps.critical('Navigate to the Plans Management module - the list loads', async () => {
      await planManagementPage.openListFor(plans.Draft.payerName);
      expect(await planManagementPage.isListed(plans.Draft.name)).toBe(true);
    });

    await steps.step('Each plan row, in every status, displays a View action', async () => {
      for (const state of VIEW_STATES) {
        await planManagementPage.search(plans[state].name);
        await planManagementPage.waitForRowVisible(plans[state].name);
        expect(await planManagementPage.getRowActionAvailability(plans[state].name, 'view'), `${state}: View`).toBe('available');
      }
    });

    await steps.step('Selecting View opens the plan details for every status', async () => {
      for (const state of VIEW_STATES) {
        await planManagementPage.openListFor(plans[state].payerName);
        const detail = await planManagementPage.openDetails(plans[state].name);
        expect(await detail.getName(), `${state}: the detail should open`).toBe(plans[state].name);
      }
      expect(await planDetailPage.isLoaded()).toBe(true);
    });
  });

  test(`TC-${CASE.editBeforePublish}: should offer an enabled Edit that opens the form when a plan has never been published`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft');

    await steps.critical('Navigate to the Plans Management module - the list loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Locate the never-published plan - its row shows an enabled Edit icon', async () => {
      expect(await planManagementPage.getRowActionAvailability(plan.name, 'edit')).toBe('available');
    });

    await steps.step('Selecting Edit opens the plan in an editable form', async () => {
      const form = await planManagementPage.openEditForm(plan.name);
      expect((await form.readAll()).nameEn, 'the form should be populated with the plan').toBe(plan.name);
      expect(await form.isFieldEditable('nameEn'), 'the form should be editable').toBe(true);
    });
  });

  test(`TC-${CASE.editDisabledOnPublish}: should disable Edit when the plan's first version is published`, async ({
    planManagementPage,
    planApprovalsPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(12 * 60_000);
    const plan = await planIn('PendingApproval');

    await steps.critical('Navigate to the Plans Management module - the list loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('View the plan just before its first version is published - Edit is enabled', async () => {
      expect(await planManagementPage.getRowActionAvailability(plan.name, 'edit')).toBe('available');
    });

    await steps.critical('Publish the plan\'s first version - the plan reflects publication', async () => {
      await planApprovalsPage.open();
      await planApprovalsPage.approve(plan.name);
      await planManagementPage.openListFor(plan.payerName);
      await planManagementPage.expectApprovalCell(plan.name, APPROVAL.approved);
    });

    await steps.step('Viewed again right after publishing, Edit is disabled', async () => {
      await planManagementPage.search(plan.name);
      await planManagementPage.expectRowActionUnavailable(plan.name, 'edit');
    });
  });

  test(`TC-${CASE.expiredLocked}: should offer no usable Edit, Activate or Deactivate when a plan is Expired`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const plan = await planIn('Expired');

    await steps.critical('Navigate to the Plans Management module - the list loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Locate the Expired plan - the row shows Expired', async () => {
      await planManagementPage.expectStatusText(plan.name, STATUS.expired);
    });

    await steps.step('Edit, Activate and Deactivate are all disabled or unavailable', async () => {
      for (const action of EXPIRED_LOCKED_ACTIONS) {
        await planManagementPage.expectRowActionUnavailable(plan.name, action);
      }
    });
  });

  test(`TC-${CASE.sendForApproval}: should offer Send for Approval and submit the change when a published plan has an unsubmitted draft change`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(12 * 60_000);
    const plan = await planIn('Active');

    await steps.critical('Navigate to the Plans Management module with a draft change staged on the published plan - the list loads', async () => {
      const staged = await planDetailPage.requestInactivationViaApi(plan.id, STAGED_CHANGE_DETAILS);
      expect(staged.status, `the draft change should be staged: ${staged.text.slice(0, 200)}`).toBeLessThan(300);
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Locate the plan - its row shows a Send for Approval action', async () => {
      expect(await planManagementPage.getRowActionAvailability(plan.name, 'submit-for-approval')).toBe('available');
    });

    await steps.step('Selecting Send for Approval moves the change into Pending Approval', async () => {
      await planManagementPage.submitForApproval(plan.name);
      await planManagementPage.expectApprovalCell(plan.name, APPROVAL.pendingApproval);
    });
  });

  test(`TC-${CASE.expiredNoLifecycle}: should never offer Activate or Deactivate when a plan has reached Expired`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const plan = await planIn('Expired');

    await steps.critical('Navigate to the Plans Management module - the list loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Locate the Expired plan - the row shows Expired', async () => {
      await planManagementPage.expectStatusText(plan.name, STATUS.expired);
    });

    await steps.step('Neither Activate nor Deactivate is available', async () => {
      for (const action of LIFECYCLE_ACTIONS) {
        await planManagementPage.expectRowActionUnavailable(plan.name, action);
      }
    });
  });

  test(`TC-${CASE.deleteDraftOnly}: should offer Delete only when the plan is in Draft status`, async ({
    planManagementPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(30 * 60_000);
    const plans = {
      Draft: await planIn('Draft'),
      PendingApproval: await planIn('PendingApproval'),
      Active: await planIn('Active'),
      Expired: await planIn('Expired'),
    };

    await steps.critical('Navigate to the Plans Management module - the list loads', async () => {
      await planManagementPage.openListFor(plans.Draft.payerName);
      expect(await planManagementPage.isListed(plans.Draft.name)).toBe(true);
    });

    await steps.step('The Draft plan\'s row shows an available Delete action', async () => {
      expect(await planManagementPage.getRowActionAvailability(plans.Draft.name, 'delete')).toBe('available');
    });

    await steps.step('No Pending Approval, Active or Expired row shows an available Delete action', async () => {
      for (const state of NON_DRAFT_STATES) {
        await planManagementPage.search(plans[state].name);
        await planManagementPage.waitForRowVisible(plans[state].name);
        await planManagementPage.expectRowActionUnavailable(plans[state].name, 'delete');
      }
    });
  });

  test(`TC-${CASE.lifecycleActions}: should update the row actions at every stage when one plan moves from Draft to Expired`, async ({
    planManagementPage,
    planDetailPage,
    planApprovalsPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(35 * 60_000);
    const plan = await planIn('Draft', SHORT_LIVED);

    await steps.critical('Navigate to the Plans Management module - the list loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.step('In Draft, View, Edit, Send for Approval and Delete are available', async () => {
      for (const action of LIFECYCLE_STAGES.draft.available) {
        expect(await planManagementPage.getRowActionAvailability(plan.name, action), `Draft: ${action}`).toBe('available');
      }
    });

    await steps.critical('Submitted for approval, Recall appears for the submitter and Edit / Delete are no longer available', async () => {
      await planManagementPage.submitForApproval(plan.name);
      await planManagementPage.expectApprovalCell(plan.name, APPROVAL.pendingApproval);
      // The Approver half (Approve / Reject to an approver who did not submit) needs a second approver account - see 19174.
      expect(await planManagementPage.getDecisionActionAvailability(plan.name, 'recall'), 'Pending: Recall for the submitter').toBe('available');
      for (const action of LIFECYCLE_STAGES.pending.unavailable) {
        await planManagementPage.expectRowActionUnavailable(plan.name, action);
      }
    });

    await steps.step('Approved and published, Deactivate is available and Edit / Delete are not', async () => {
      await planApprovalsPage.open();
      await planApprovalsPage.approve(plan.name);
      await planDetailPage.open(plan.id);
      await planDetailPage.expectStatusEventually(STATUS.active);
      await planManagementPage.openListFor(plan.payerName);
      await planManagementPage.search(plan.name);
      for (const action of LIFECYCLE_STAGES.active.available) {
        expect(await planManagementPage.getRowActionAvailability(plan.name, action), `Active: ${action}`).toBe('available');
      }
      for (const action of LIFECYCLE_STAGES.active.unavailable) {
        await planManagementPage.expectRowActionUnavailable(plan.name, action);
      }
    });

    await steps.step('Once Expired, only View remains - Edit, Activate, Deactivate and Delete are unavailable', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.expectStatusEventually(STATUS.expired, EXPIRY_WAIT_MS);
      await planManagementPage.openListFor(plan.payerName);
      await planManagementPage.search(plan.name);
      for (const action of LIFECYCLE_STAGES.expired.available) {
        expect(await planManagementPage.getRowActionAvailability(plan.name, action), `Expired: ${action}`).toBe('available');
      }
      for (const action of LIFECYCLE_STAGES.expired.unavailable) {
        await planManagementPage.expectRowActionUnavailable(plan.name, action);
      }
    });
  });
});
