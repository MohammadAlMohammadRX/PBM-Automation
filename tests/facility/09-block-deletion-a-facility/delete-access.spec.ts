import { test, expect, refused, type FacilitySession } from '../../../utils/facility/writerCHelpers';
import { CASES } from '../../../data/facility/blockDeletion.data';
import { readFacilityOrNull } from '../../../utils/FacilityProvisioning';

/**
 * User story 15141: Block deletion a facility - a user without the delete
 * permission. The Payer Admin role is shaped with every Facilities right but
 * DeleteFacility (fixture `facilityRole`); the administrator is first shown
 * Delete on the same Active facility, so only the permission explains its
 * absence.
 */
test.describe('US 15141 - Block deletion a facility - access', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.noDeletePermission.azureId}: should keep a user without the delete permission from removing a facility`, async ({
    page,
    facilityIn,
    facilityManagementPage,
    facilityRole,
    requireFacilityListAccess,
    requireBaseline,
    steps,
  }) => {
    const facility = await facilityIn('Active');
    let session!: FacilitySession;

    await steps.critical('Navigate to the Facility Management module - the list shows the existing facilities with actions restricted by role', async () => {
      await facilityManagementPage.openTable();
      requireBaseline((await facilityManagementPage.getActionState(facility.nameEn, 'delete')).availability === 'available', 'Delete on an Active facility');
      session = await facilityRole.signIn(CASES.noDeletePermission.shape);
      await requireFacilityListAccess(session);
      await session.facilities.openTable();
      expect(await session.facilities.isListed(facility.nameEn)).toBe(true);
    });

    await steps.step('Attempt to locate and click the "Delete" button next to a facility record - the Delete option is unavailable or an access-denied error is displayed', async () => {
      const offered = (await session.facilities.getActionState(facility.nameEn, 'delete')).availability;
      let blocked = offered !== 'available';
      let said = `Delete ${offered} (not attempted)`;
      if (!blocked) {
        const answer = await session.facilities.deleteFacility(facility.nameEn);
        blocked = refused(answer);
        said = `Delete offered; it answered ${answer.status} ${answer.text.slice(0, 160)} ${answer.messages.join(' | ')}`;
      }
      expect(blocked, `${said} - role without ${session.removed.join(', ')}`).toBe(true);
      expect(await readFacilityOrNull(page, facility.id), 'the facility must still exist').not.toBeNull();
    });
  });
});
