import { facilityRoleTest as test, expect, facilityStatusLabelOf, sessionRequest, type FacilitySession } from '../../../utils/facility/writerBHelpers';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { CASES, STATUS } from '../../../data/facility/licenseDateWithActivationStatus.data';
import { deactivationReasons } from '../../../utils/FacilityProvisioning';

/**
 * User story 15139: License Date with activation status - a user without the
 * activation rights. "readonly_user" is the Payer Admin role shaped with the
 * list and view rights but WITHOUT SetFacilityActive (Activate / Inactivate -
 * one right) and UpdateFacility (the Edit drawer's Is Active switch), fixture
 * `facilityRole`. The facility is the case's own Active facility.
 */
test.describe('US 15139 - License Date with activation status - permission', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.activationPermission.azureId}: should let only authorised users change a facility's active status`, async ({
    page,
    facilityDetailPage,
    facilityIn,
    facilityRole,
    requireBaseline,
    requireFacilityListAccess,
    steps,
  }) => {
    const data = CASES.activationPermission;
    const facility = await facilityIn('Active');
    let session!: FacilitySession;

    await steps.critical('Navigate to the Facility Management module - the module loads with a limited view for the restricted user', async () => {
      await facilityDetailPage.open(facility.id);
      requireBaseline((await facilityDetailPage.getActionAvailability('inactivate')) === 'available', 'the Inactivate action for a user holding SetFacilityActive');
      session = await facilityRole.signIn(data.shape);
      await requireFacilityListAccess(session);
      await session.facilities.openTable();
      expect(await session.facilities.isListed(facility.nameEn)).toBe(true);
    });

    await steps.step('Open a facility record as the restricted user - the details are visible but the activation control is read-only or hidden', async () => {
      await session.detail.open(facility.id);
      const states = await session.detail.readActionStates();
      expect({
        details: await session.detail.getName(),
        inactivate: states.inactivate.availability === 'available',
        activate: states.activate.availability === 'available',
        edit: states.edit.availability === 'available',
      }, `without ${session.removed.join(', ')}`).toEqual({ details: facility.nameEn, inactivate: false, activate: false, edit: false });
    });

    await steps.step('Attempt to change the facility\'s active status - the system prevents the change and/or shows a permission error', async () => {
      const reason = (await deactivationReasons(page)).find((r) => r.code === 'other');
      const attempt = await sessionRequest(session, 'POST', ApiEndpoints.facilitySetActive, {
        id: facility.id,
        isActive: false,
        inactivationReasonId: reason?.id ?? null,
        inactivationDetails: 'Attempted by a user without the activation right (17559).',
      });
      expect({ change: attempt.status >= 400 ? 'refused' : `accepted (${attempt.status})`, status: await facilityStatusLabelOf(page, facility.id) })
        .toEqual({ change: 'refused', status: STATUS.active });
    });
  });
});
