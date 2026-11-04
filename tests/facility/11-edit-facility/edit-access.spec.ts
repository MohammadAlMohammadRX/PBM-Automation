import { test, expect, refused, submitForm, toContactStep, type FacilitySession } from '../../../utils/facility/writerCHelpers';
import { CASES } from '../../../data/facility/editFacility.data';
import { facilityStamp, readFacility } from '../../../utils/FacilityProvisioning';

/**
 * User story 15143: Edit facility - a user without the edit permission.
 * The Payer Admin role is shaped with every Facilities right but
 * UpdateFacility (fixture `facilityRole`); the administrator is first shown
 * Edit on the same facility, so only the permission explains its absence.
 */
test.describe('US 15143 - Edit facility - access', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.noEditPermission.azureId}: should keep a user without the edit permission from modifying a facility`, async ({
    page,
    facilityIn,
    facilityManagementPage,
    facilityRole,
    requireFacilityListAccess,
    requireBaseline,
    steps,
  }) => {
    const facility = await facilityIn('Active', { buildingName: 'QA Edit Access Building' });
    let session!: FacilitySession;

    await steps.critical('Navigate to the Facility Management module - the list shows the existing facilities with actions restricted by role', async () => {
      await facilityManagementPage.openTable();
      requireBaseline((await facilityManagementPage.getActionState(facility.nameEn, 'edit')).availability === 'available', 'Edit on an Active facility');
      session = await facilityRole.signIn(CASES.noEditPermission.shape);
      await requireFacilityListAccess(session);
      await session.facilities.openTable();
      expect(await session.facilities.isListed(facility.nameEn)).toBe(true);
    });

    await steps.step('Attempt to locate and click "Edit" next to a facility record, or reach the edit form from the record - the Edit option is unavailable or an access-denied error is displayed', async () => {
      const row = (await session.facilities.getActionState(facility.nameEn, 'edit')).availability;
      await session.detail.open(facility.id);
      const header = await session.detail.getActionAvailability('edit');
      let blocked = row !== 'available' && header !== 'available';
      let said = `Edit on the row: ${row}, on the record: ${header}`;
      if (!blocked) {
        const drawer = await session.detail.openEditDrawer();
        await toContactStep(drawer);
        await drawer.type('buildingName', `QA Edit Without Right ${facilityStamp()}`);
        const answer = await submitForm(session.page, drawer);
        blocked = answer.status === -1 || refused(answer);
        said += `; the edit was offered and its save answered ${answer.status} ${answer.text.slice(0, 160)} ${answer.messages.join(' | ')}`;
      }
      expect(blocked, `${said} - role without ${session.removed.join(', ')}`).toBe(true);
      expect((await readFacility(page, facility.id)).buildingName, 'the stored Building Name').toBe('QA Edit Access Building');
    });
  });
});
