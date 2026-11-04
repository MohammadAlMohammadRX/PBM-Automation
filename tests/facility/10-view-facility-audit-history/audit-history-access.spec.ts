import { test, expect, tabUsable, type FacilitySession } from '../../../utils/facility/writerCHelpers';
import { CASES } from '../../../data/facility/facilityAuditHistory.data';
import { FACILITY_DETAIL } from '../../../constants/facility/facilityIds';
import { facilityStamp, updateFacilityFields } from '../../../utils/FacilityProvisioning';

/**
 * User story 15142: View Facility - Audit History - who may see it.
 * The Payer Admin role is shaped twice (fixture `facilityRole`): without the
 * audit rights (Facilities "View Audit Logs", AuditLogs GetAuditLogs /
 * GetAuditLogById) and then with them (the "Compliance Officer"). The
 * administrator is first shown the tab on the same facility.
 */
test.describe('US 15142 - View Facility - Audit History - access', () => {
  test.describe.configure({ timeout: 20 * 60_000 });

  test(`TC-${CASES.roleGate.azureId}: should show a facility's audit history only to roles allowed to view it`, async ({
    page,
    facilityIn,
    facilityManagementPage,
    facilityDetailPage,
    facilityRole,
    requireFacilityListAccess,
    requireBaseline,
    steps,
  }) => {
    const data = CASES.roleGate;
    const facility = await facilityIn('Active');
    let denied!: FacilitySession;

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility directory', async () => {
      expect((await updateFacilityFields(page, facility.id, { buildingName: `QA Audit Access ${facilityStamp()}` })).status).toBeLessThan(300);
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
      await facilityDetailPage.open(facility.id);
      requireBaseline(await facilityDetailPage.hasTab('audit'), 'the Audit History tab');
    });

    await steps.critical('Log in as a user without audit-viewing permission and open facility FAC-210 - the facility detail page opens', async () => {
      denied = await facilityRole.signIn(data.without);
      await requireFacilityListAccess(denied);
      await denied.detail.open(facility.id);
      expect(await denied.detail.getName()).toBe(facility.nameEn);
    });

    await steps.step('Look for the Audit tab - the tab is hidden or disabled for this role', async () => {
      expect(await tabUsable(denied.page, FACILITY_DETAIL.tab.audit), `the Audit tab without ${denied.removed.join(', ')}`).toBe(false);
    });

    await steps.step('Log in as Compliance Officer and repeat the steps - the Audit tab is visible and accessible', async () => {
      const officer = await facilityRole.signIn(data.withAudit);
      await requireFacilityListAccess(officer);
      await officer.detail.open(facility.id);
      expect(await tabUsable(officer.page, FACILITY_DETAIL.tab.audit), 'the Audit tab for the Compliance Officer').toBe(true);
      await officer.audit.open();
      expect((await officer.audit.readEntries()).length, 'audit entries shown to the Compliance Officer').toBeGreaterThan(0);
    });
  });
});
