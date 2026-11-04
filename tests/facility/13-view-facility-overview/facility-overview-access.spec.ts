import { facilityRoleTest as test, expect, type FacilitySession } from '../../../utils/facility/writerBHelpers';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { CASES } from '../../../data/facility/facilityOverview.data';
import { updateFacilityFields } from '../../../utils/FacilityProvisioning';

/**
 * User story 17434: View Facility - Overview - a user without the audit
 * permission. "RestrictedViewer01" is the Payer Admin role shaped with the
 * list, view and Network Assignment rights (fixture `facilityRole`); it holds
 * no audit right (see the data file). The facility is the case's own, edited
 * once so its trail has an entry to withhold.
 */
test.describe('US 17434 - View Facility - Overview - access', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.noAuditPermission.azureId}: should not show the Audit History to a user without the audit permission`, async ({
    page,
    facilityDetailPage,
    facilityAuditTab,
    facilityIn,
    facilityRole,
    requireBaseline,
    requireFacilityListAccess,
    steps,
  }) => {
    const data = CASES.noAuditPermission;
    const facility = await facilityIn('Active');
    const edited = await updateFacilityFields(page, facility.id, { buildingName: 'Edited so the trail holds an entry (17584)' });
    if (edited.status >= 300) steps.blocked(`the precondition edit was refused: ${edited.status} ${edited.text.slice(0, 200)}`);
    let session!: FacilitySession;

    await steps.critical('Navigate to the Facility Management module - the facility list is displayed', async () => {
      await facilityDetailPage.open(facility.id);
      requireBaseline(await facilityDetailPage.hasTab('audit'), 'the Audit History tab for a user holding the audit rights');
      await facilityAuditTab.open();
      requireBaseline((await facilityAuditTab.readEntries()).length > 0, 'an audit entry on the facility for a user holding the audit rights');
      session = await facilityRole.signIn(data.shape);
      await requireFacilityListAccess(session);
      await session.facilities.openTable();
      expect(await session.facilities.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open a facility record - the Overview tab is displayed and the Network Assignment tab is accessible', async () => {
      await session.detail.open(facility.id);
      expect({ code: await session.detail.readOverviewField('facilityCode'), networks: await session.detail.hasTab('networks') })
        .toEqual({ code: facility.code, networks: true });
    });

    await steps.step('Attempt to select the Audit History tab - it is not shown or access is denied, and no audit data is revealed', async () => {
      const offered = await session.detail.hasTab('audit');
      if (offered) await session.detail.openTab('audit').catch(() => undefined);
      const entries = offered ? await session.audit.readEntries().catch(() => []) : [];
      const api = await NetworkUtils.postAsSession(session.page, ApiEndpoints.auditLogList, {
        entityType: 'Facility', entityId: facility.id, actionType: null, pageNumber: 1, rowsPerPage: 10,
      });
      expect({ tabOffered: offered, entriesShown: entries.length, api: api.status >= 400 ? 'refused' : `answered ${api.status}` }, `held: ${session.granted.join(', ')}`)
        .toEqual({ tabOffered: false, entriesShown: 0, api: 'refused' });
    });
  });
});
