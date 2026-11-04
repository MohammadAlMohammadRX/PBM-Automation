import { test, expect, type FacilitySession } from '../../../utils/facility/writerAHelpers';
import { CASES } from '../../../data/facility/createAFacility.data';
import { facilityBody, requestCreateFacility, suiteFacilityName } from '../../../utils/FacilityProvisioning';

/**
 * User story 15132: Create a facility - who may create. The non-Facility
 * Administrator is the Payer Admin shaped by the `facilityRole` fixture
 * (utils/facility/writerAHelpers.ts): given the list (GetFacilities), without
 * CreateFacility. The administrator's Add Facility is the baseline.
 */
test.describe('US 15132 - Create a facility - create permission', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.createDenied.azureId}: should keep the Create option and a direct create away from a user without Facility Administrator permissions`, async ({
    facilityManagementPage: list,
    facilityRole,
    requireFacilityListAccess,
    requireBaseline,
    discardFacilityId,
    page,
    steps,
  }) => {
    let session!: FacilitySession;

    await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities, with restricted actions based on role', async () => {
      await list.openTable();
      requireBaseline(await list.isAddOffered(), 'Add Facility for a user holding CreateFacility');
      session = await facilityRole.signIn(CASES.createDenied.shape);
      await requireFacilityListAccess(session);
      await session.facilities.openTable();
      expect(await session.facilities.countRows(), 'the shaped account\'s list').toBeGreaterThan(0);
    });

    await steps.step('Attempt to locate and click the "Create" option or access the create facility form directly - the Create option is unavailable or an authorization error is displayed', async () => {
      const offered = await session.facilities.isAddOffered();
      const body = await facilityBody(page, { nameEn: suiteFacilityName('Denied Create') });
      const direct = await requestCreateFacility(session.page, body);
      if (direct.id) discardFacilityId(direct.id);
      const stillTold = session.stillHeld.length > 0 ? ` - the signed-in account is still told it holds ${session.stillHeld.join(', ')}` : '';
      expect({ createOffered: offered, directCreateRefused: direct.status >= 400 }, `role without ${session.removed.join(', ')}${stillTold}; CreateFacility as that account answered ${direct.status} ${direct.text.slice(0, 200)}`)
        .toEqual({ createOffered: false, directCreateRefused: true });
    });
  });
});
