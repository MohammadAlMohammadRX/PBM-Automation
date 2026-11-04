import { facilityRoleTest as test, expect, coordinate, sessionRequest, type FacilitySession } from '../../../utils/facility/writerBHelpers';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { CASES } from '../../../data/facility/mapLocation.data';
import { readFacility } from '../../../utils/FacilityProvisioning';

/**
 * User story 15137: Facility map location control - a user without the edit
 * right. The restricted user is the Payer Admin role shaped with the list and
 * view rights but WITHOUT Facilities.UpdateFacility (fixture `facilityRole`); the
 * facility is the case's own, with a saved location. See the data file for how
 * "the Contact & License step" reads for a user who cannot edit.
 */
test.describe('US 15137 - Facility map location control - access', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.noEditPermission.azureId}: should not let a user without the facility edit permission change the map location`, async ({
    page,
    facilityDetailPage,
    facilityIn,
    facilityRole,
    requireBaseline,
    requireFacilityListAccess,
    steps,
  }) => {
    const data = CASES.noEditPermission;
    const facility = await facilityIn('Active');
    const saved = { latitude: Number(facility.record.latitude), longitude: Number(facility.record.longitude) };
    let session!: FacilitySession;

    await steps.critical('Navigate to the Facility Management module - the module loads using the restricted user\'s permissions', async () => {
      await facilityDetailPage.open(facility.id);
      requireBaseline((await facilityDetailPage.getActionAvailability('edit')) === 'available', 'the Edit action for a user holding UpdateFacility');
      session = await facilityRole.signIn(data.shape);
      await requireFacilityListAccess(session);
      await session.facilities.openTable();
      expect(await session.facilities.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open an existing facility and go to its Contact & License details - the facility\'s location is displayed', async () => {
      await session.detail.open(facility.id);
      await session.detail.openTab('overview');
      expect({
        latitude: coordinate(await session.detail.readOverviewField('latitude')),
        longitude: coordinate(await session.detail.readOverviewField('longitude')),
      }).toEqual(saved);
    });

    await steps.step('Attempt to change the location - the map is read-only or disabled for this user and no location change is accepted', async () => {
      const edit = await session.detail.getActionAvailability('edit');
      const current = await readFacility(page, facility.id);
      const attempt = await sessionRequest(session, 'PUT', ApiEndpoints.facilityUpdate, {
        ...current,
        id: facility.id,
        concurrencyStamp: current.concurrencyStamp,
        latitude: data.newLatitude,
        longitude: data.newLongitude,
      });
      const after = await readFacility(page, facility.id);
      expect({
        editOffered: edit === 'available',
        update: attempt.status >= 400 ? 'refused' : `accepted (${attempt.status})`,
        stored: { latitude: Number(after.latitude), longitude: Number(after.longitude) },
      }, `without ${session.removed.join(', ')}`).toEqual({ editOffered: false, update: 'refused', stored: saved });
    });
  });
});
