import { facilityRoleTest as test, expect, minutesApart, OVERVIEW_DATE_TIME, type FacilitySession } from '../../../utils/facility/writerBHelpers';
import { FACILITY_NAV_LINK } from '../../../constants/facility/writerBIds';
import { CASES, DENIED, EMPTY_VALUE } from '../../../data/facility/creationModificationHistory.data';
import { readFacility } from '../../../utils/FacilityProvisioning';

/**
 * User story 15138: View facility creation and modification history - the
 * cases signed in as the Payer Admin (fixture `facilityRole`): 17539 edits as a
 * user other than the creator (the administrator); 17541 has no facility access
 * at all. See the data file.
 */
test.describe('US 15138 - View facility creation and modification history - other users', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.editorAfterSave.azureId}: should show the current user and time as the last modification right after a save`, async ({
    page,
    facilityIn,
    facilityRole,
    requireFacilityListAccess,
    steps,
  }) => {
    const data = CASES.editorAfterSave;
    const facility = await facilityIn('Active');
    const creator = (await readFacility(page, facility.id)).createdByName;
    let session!: FacilitySession;
    let savedAt = 0;

    await steps.critical('Navigate to the Facility Management module - the module loads with the facility list', async () => {
      session = await facilityRole.signIn(data.shape);
      await requireFacilityListAccess(session);
      await session.facilities.openTable();
      expect(await session.facilities.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open an existing facility and note the current modification details - Modified On and Modified By are displayed', async () => {
      await session.detail.open(facility.id);
      await session.detail.openTab('overview');
      expect({ modifiedOn: await session.detail.readOverviewField('modifiedOn'), modifiedBy: await session.detail.readOverviewField('modifiedBy') })
        .toEqual({ modifiedOn: expect.any(String), modifiedBy: expect.any(String) });
    });

    await steps.critical('Edit a facility field (the address) and save - the save is confirmed and the change persisted', async () => {
      const drawer = await session.detail.openEditDrawer();
      expect(await drawer.next()).toBe(true);
      await drawer.type('buildingName', data.building);
      savedAt = Date.now();
      await drawer.save();
      expect((await readFacility(page, facility.id)).buildingName).toBe(data.building);
    });

    await steps.step('Reopen the Overview tab - it reloads with the updated details', async () => {
      await session.detail.open(facility.id);
      await session.detail.openTab('overview');
      expect(await session.detail.readOverviewField('buildingName')).toBe(data.building);
    });

    await steps.step('Check the modification details - Modified On is the save just made and Modified By is the current (non-creator) user', async () => {
      const record = await readFacility(page, facility.id);
      const modifiedOn = await session.detail.readOverviewField('modifiedOn');
      const modifiedBy = await session.detail.readOverviewField('modifiedBy');
      expect({
        modifiedOnFormat: OVERVIEW_DATE_TIME.test(modifiedOn),
        isTheSave: minutesApart(modifiedOn, new Date(savedAt).toISOString()) <= 1,
        modifiedBy,
        notTheCreator: modifiedBy !== creator && modifiedBy !== EMPTY_VALUE,
      }).toEqual({ modifiedOnFormat: true, isTheSave: true, modifiedBy: record.modifiedByName, notTheCreator: true });
    });
  });

  test(`TC-${CASES.noAccess.azureId}: should not show a facility's creation or modification history to a user without facility access`, async ({
    page,
    facilityDetailPage,
    facilityIn,
    facilityRole,
    requireBaseline,
    steps,
  }) => {
    const data = CASES.noAccess;
    const facility = await facilityIn('Active');
    const record = await readFacility(page, facility.id);
    let session!: FacilitySession;

    await steps.critical('Navigate to the Facility Management module - access is denied or the module is not visible to the restricted user', async () => {
      await facilityDetailPage.open(facility.id);
      requireBaseline(await facilityDetailPage.isLoaded(), 'the facility record for a user holding GetFacilities / GetFacility');
      session = await facilityRole.signIn(data.shape);
      await session.facilities.open().catch(() => undefined);
      const navShown = await session.page.locator(`#${FACILITY_NAV_LINK}`).isVisible().catch(() => false);
      expect({ navShown, canList: await session.facilities.canListFacilities() }, `without ${session.removed.join(', ')}`).toEqual({ navShown: false, canList: false });
    });

    await steps.step('Attempt to open a facility record directly via its link - the system blocks access and shows a permission error', async () => {
      await session.detail.openExpectingFailure(facility.id);
      const text = await session.detail.getScreenText();
      expect({
        loaded: await session.detail.isLoaded(),
        permissionError: DENIED.test(text),
        revealed: [facility.nameEn, facility.code, record.createdByName ?? ''].filter((v) => v !== '' && text.includes(v)),
      }).toEqual({ loaded: false, permissionError: true, revealed: [] });
    });
  });
});
