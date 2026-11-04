import { facilityRoleTest as test, expect, anchorOrBlocked, type FacilitySession } from '../../../utils/facility/writerBHelpers';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { CASES } from '../../../data/facility/networkAssignment.data';

/**
 * User story 15136: View Facility - Network Assignment tab - a user without the
 * tab's right. The restricted user is the Payer Admin role shaped with the list
 * and view rights but WITHOUT Facilities.GetFacilityNetworks (fixture
 * `facilityRole`), asked for the suite's anchor facility, which is in a network -
 * so only the permission can explain a refusal.
 */
test.describe('US 15136 - View Facility - Network Assignment tab - access', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.noPermission.azureId}: should not expose a facility's network memberships to a user without the network view permission`, async ({
    page,
    facilityDetailPage,
    facilityRole,
    requireBaseline,
    requireFacilityListAccess,
    steps,
  }, testInfo) => {
    const data = CASES.noPermission;
    const anchor = await anchorOrBlocked(page, testInfo, { kind: 'single' });
    let session!: FacilitySession;

    await steps.critical('Navigate to the Facility Management module - the module loads using the restricted user\'s permissions', async () => {
      await facilityDetailPage.open(anchor.facility.id);
      requireBaseline(await facilityDetailPage.hasTab('networks'), 'the Network Assignment tab for a user holding GetFacilityNetworks');
      session = await facilityRole.signIn(data.shape);
      await requireFacilityListAccess(session);
      await session.facilities.openTable();
      expect(await session.facilities.isListed(anchor.facility.nameEn)).toBe(true);
    });

    await steps.critical('Open a facility record - the facility detail view opens', async () => {
      await session.detail.open(anchor.facility.id);
      expect(await session.detail.getName()).toBe(anchor.facility.nameEn);
    });

    await steps.step('Attempt to access the "Network Assignment" tab - it is hidden, disabled or denied, and no membership is exposed', async () => {
      const offered = await session.detail.hasTab('networks');
      if (offered) await session.detail.openTab('networks').catch(() => undefined);
      const text = await session.detail.getPageText().catch(() => '');
      const exposed = anchor.networks.map((n) => n.code).filter((code) => text.includes(code));
      const api = await NetworkUtils.postAsSession(session.page, ApiEndpoints.facilityNetworks, { facilityId: anchor.facility.id, pageNumber: 1, rowsPerPage: 10 });
      expect({ tabOffered: offered, exposed, api: api.status >= 400 ? 'refused' : `answered ${api.status}` }, `without ${session.removed.join(', ')}`)
        .toEqual({ tabOffered: false, exposed: [], api: 'refused' });
    });
  });
});
