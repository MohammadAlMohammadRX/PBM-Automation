import { test, expect, type FacilitySession } from '../../../utils/facility/writerAHelpers';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { CASES } from '../../../data/facility/facilityListAndDashboardTiles.data';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { readFacilityOrNull } from '../../../utils/FacilityProvisioning';

/**
 * User story 15131: Facility list and dashboard tiles - who may delete. The
 * "read-only" role is the Payer Admin shaped by the `facilityRole` fixture
 * (utils/facility/writerAHelpers.ts): given the list (GetFacilities), without
 * DeleteFacility. The administrator's own row is the baseline (Delete offered).
 */
test.describe('US 15131 - Facility list and dashboard tiles - delete permission', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.deleteDenied.azureId}: should hide Delete from a role without delete permission and refuse a direct delete request`, async ({
    facilityManagementPage: list,
    facilityIn,
    facilityRole,
    requireFacilityListAccess,
    requireBaseline,
    page,
    steps,
  }) => {
    const facility = await facilityIn('Active');
    let session!: FacilitySession;

    await steps.critical('Navigate to the Facility Management module as the user without delete permission - the module loads', async () => {
      await list.openTable();
      requireBaseline((await list.getActionState(facility.nameEn, 'delete')).availability === 'available', 'Delete on a facility row for a user holding DeleteFacility');
      session = await facilityRole.signIn(CASES.deleteDenied.shape);
      await requireFacilityListAccess(session);
      await session.facilities.openTable();
      if (!(await session.facilities.isListed(facility.nameEn))) {
        steps.blocked(`the shaped Payer Admin is not shown the suite facility "${facility.nameEn}" in its list`);
      }
      expect(await session.facilities.countRows(), 'the shaped account\'s list').toBeGreaterThan(0);
    });

    await steps.step('Open the facility list and review the Actions column for a facility row - the Delete action is hidden or disabled for this role', async () => {
      const state = await session.facilities.getActionState(facility.nameEn, 'delete');
      const stillTold = session.stillHeld.length > 0 ? ` - the signed-in account is still told it holds ${session.stillHeld.join(', ')}` : '';
      expect(state.availability, `Delete offered to the role without ${session.removed.join(', ')}${stillTold}`).not.toBe('available');
    });

    await steps.step('Attempt to trigger the delete action directly (a direct request) - the action is refused and the facility remains unchanged', async () => {
      const res = await NetworkUtils.requestAsSession(session.page, 'DELETE', `${ApiEndpoints.facilityDelete}/${facility.id}`);
      const after = await readFacilityOrNull(page, facility.id);
      expect({ refused: res.status >= 400, unchanged: after !== null && after.facilityNameEn === facility.nameEn }, `DELETE DeleteFacility/${facility.id} answered ${res.status} ${res.text.slice(0, 200)}`)
        .toEqual({ refused: true, unchanged: true });
    });
  });
});
