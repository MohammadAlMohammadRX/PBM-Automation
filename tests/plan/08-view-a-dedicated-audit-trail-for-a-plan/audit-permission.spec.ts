import { test, expect } from '../../../fixtures';
import type { ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';
import { PLAN_PERMISSION } from '../../../data/accounts/payerAdminRole.data';
import {
  AUDIT_ONLY,
  CASE,
  GENERAL_TABS,
  SCOPED_PAYER,
  WITH_GENERAL,
  WITHOUT_AUDIT,
} from '../../../data/plans/planAuditTrail.data';

/**
 * User story 14157: View a dedicated audit trail for a plan.
 * "Viewing the audit trail requires its own dedicated permission, separate from
 * other plan permissions" - both halves: general rights without it, and it
 * without the general rights. The non-administrator's role is shaped for the
 * case (fixture `shapedNonAdmin`); the plan belongs to a payer in that
 * account's scope, so only the permission can explain what it is offered.
 */
test.describe('US 14157 - Plan audit trail permission', () => {
  test(`TC-${CASE.noAuditPermission}: should hide or deny Audit History when a user holds the general plan permissions but not the audit permission`, async ({
    planDetailPage,
    planIn,
    shapedNonAdmin,
    requireBaseline,
    steps,
  }) => {
    test.setTimeout(10 * 60_000);
    const plan = await planIn('PendingApproval', { payerName: SCOPED_PAYER, noFormulary: true });
    let session: ShapedSession | null = null;

    await steps.critical('Navigate to the Plans Management module as a Plan Editor - the list reflects the general permissions', async () => {
      await planDetailPage.open(plan.id);
      requireBaseline(await planDetailPage.hasTab('audit'), 'the Audit History tab');
      session = await shapedNonAdmin({ without: WITHOUT_AUDIT, with: WITH_GENERAL });
      expect(session.removed, 'the role should have lost the audit permission').toContain(PLAN_PERMISSION.viewPlanAuditTrail);
      await session.plans.openListFor(SCOPED_PAYER);
      expect(await session.plans.isListed(plan.name), 'the Plan Editor should see the plan').toBe(true);
    });

    await steps.critical('Open the plan\'s detail page - Overview, Formulary Assignment and Version History are accessible', async () => {
      await session!.planDetail.open(plan.id);
      for (const tab of GENERAL_TABS) {
        expect(await session!.planDetail.hasTab(tab), `the "${tab}" tab should be offered`).toBe(true);
      }
    });

    await steps.step('The Audit History tab is hidden, or access to it is denied', async () => {
      expect(await session!.planDetail.readAuditTabAccess(), 'the audit trail must not be shown without its permission').not.toBe('shown');
    });
  });

  test(`TC-${CASE.auditPermissionOnly}: should show the audit trail when a user holds only the audit permission`, async ({
    planDetailPage,
    planIn,
    shapedNonAdmin,
    requireBaseline,
    steps,
  }) => {
    test.setTimeout(10 * 60_000);
    const plan = await planIn('PendingApproval', { payerName: SCOPED_PAYER, noFormulary: true });
    let session: ShapedSession | null = null;

    await steps.critical('Navigate to the Plans Management module as an Auditor - access is restricted by the role', async () => {
      await planDetailPage.open(plan.id);
      await planDetailPage.audit().open();
      requireBaseline((await planDetailPage.audit().readEntries()).length > 0, 'audit entries on the plan');
      session = await shapedNonAdmin(AUDIT_ONLY);
      expect(session.removed, 'the role should have lost the general plan permissions').toContain(PLAN_PERMISSION.viewPlanDetails);
      expect(session.granted, 'the role should hold the audit permission').toContain(PLAN_PERMISSION.viewPlanAuditTrail);
    });

    await steps.critical('Open the plan\'s detail page - it loads, with the other tabs restricted', async () => {
      await session!.planDetail.openExpectingFailure(plan.id);
      expect(await session!.planDetail.isLoaded(), 'the audit permission alone should open the plan for its audit trail').toBe(true);
    });

    await steps.step('Select the Audit History tab - it opens and lists the plan\'s audit entries', async () => {
      expect(await session!.planDetail.readAuditTabAccess(), 'the Audit History tab').toBe('shown');
      expect((await session!.planDetail.audit().readEntries()).length, 'the plan\'s entries').toBeGreaterThan(0);
    });
  });
});
