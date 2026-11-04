import { test, expect } from '../../../fixtures';
import type { FacilityDetailPage } from '../../../pages/facility/FacilityDetailPage';
import { env } from '../../../constants/EnvironmentConfig';
import { CASES, EMPTY_VALUE, NO_DEACTIVATED_EDITOR, OLD_FACILITY_DAYS } from '../../../data/facility/creationModificationHistory.data';
import {
  facilityDayText,
  facilityStamp,
  findFacilityByName,
  listFacilityRegister,
  readFacility,
  riyadhDay,
  suiteFacilityArabicName,
  suiteFacilityEmail,
  suiteFacilityName,
  updateFacilityFields,
  type FacilityRecord,
} from '../../../utils/FacilityProvisioning';
import { OVERVIEW_DATE_TIME, minutesApart, riyadhDayOf } from '../../../utils/facility/writerBHelpers';

/** The Overview's Record section. */
async function readRecordSection(detail: FacilityDetailPage): Promise<{ createdOn: string; createdBy: string; modifiedOn: string; modifiedBy: string }> {
  return {
    createdOn: await detail.readOverviewField('createdOn'),
    createdBy: await detail.readOverviewField('createdBy'),
    modifiedOn: await detail.readOverviewField('modifiedOn'),
    modifiedBy: await detail.readOverviewField('modifiedBy'),
  };
}

/** Opens the facility and its Overview tab; returns the Facility Code it shows (the caller checks it is the facility's). */
async function openOverview(detail: FacilityDetailPage, id: string): Promise<string> {
  await detail.open(id);
  await detail.openTab('overview');
  return detail.readOverviewField('facilityCode');
}

/** One Edit-drawer save that changes the Building Name. */
async function editBuilding(detail: FacilityDetailPage, id: string, building: string): Promise<void> {
  await detail.open(id);
  const drawer = await detail.openEditDrawer();
  expect(await drawer.next(), 'the Edit drawer should reach step 2').toBe(true);
  await drawer.type('buildingName', building);
  await drawer.save();
}

/** Created On / By of the Overview against the stored record. */
const creationAgainst = (shown: { createdOn: string; createdBy: string }, record: FacilityRecord): Record<string, unknown> => ({
  createdOnFormat: OVERVIEW_DATE_TIME.test(shown.createdOn),
  createdOnMatches: minutesApart(shown.createdOn, record.createdOn) <= 1,
  createdBy: shown.createdBy,
});

/**
 * User story 15138: View facility creation and modification history. The
 * administrator plays the Compliance Officer; each facility is the case's own
 * suite facility (17546's "several months old" one is only looked at). The
 * Payer Admin cases live in creation-modification-history-access.spec.ts.
 */
test.describe('US 15138 - View facility creation and modification history', () => {
  test.describe.configure({ timeout: 8 * 60_000 });

  test(`TC-${CASES.createdOnBy.azureId}: should show who created the facility and when`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityIn,
    steps,
  }) => {
    const facility = await facilityIn('Active');
    const record = await readFacility(page, facility.id);

    await steps.critical('Navigate to the Facility Management module - the module loads with the facility list', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open an existing facility record - the facility detail page opens', async () => {
      await facilityDetailPage.open(facility.id);
      expect(await facilityDetailPage.getName()).toBe(facility.nameEn);
    });

    await steps.critical('Open the Overview tab - it displays the facility details', async () => {
      expect(await openOverview(facilityDetailPage, facility.id)).toBe(facility.code);
    });

    await steps.step('Locate the Created On and Created By information - creation date and the creating user\'s name are shown', async () => {
      const shown = await readRecordSection(facilityDetailPage);
      expect(creationAgainst(shown, record)).toEqual({ createdOnFormat: true, createdOnMatches: true, createdBy: record.createdByName });
      expect(shown.createdBy).not.toBe(EMPTY_VALUE);
    });
  });

  test(`TC-${CASES.modifiedOnBy.azureId}: should show who last modified the facility and when`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityIn,
    steps,
  }) => {
    const facility = await facilityIn('Active');
    const edited = await updateFacilityFields(page, facility.id, { buildingName: CASES.modifiedOnBy.building });
    if (edited.status >= 300) steps.blocked(`the precondition edit of "${facility.nameEn}" was refused: ${edited.status} ${edited.text.slice(0, 200)}`);
    const record = await readFacility(page, facility.id);

    await steps.critical('Navigate to the Facility Management module - the module loads with the facility list', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open a facility that has previously been edited - the facility detail page opens', async () => {
      await facilityDetailPage.open(facility.id);
      expect(await facilityDetailPage.getName()).toBe(facility.nameEn);
    });

    await steps.critical('Open the Overview tab - it displays the facility details', async () => {
      expect(await openOverview(facilityDetailPage, facility.id)).toBe(facility.code);
    });

    await steps.step('Locate the Modified On and Modified By information - the time of the last edit and the user who made it', async () => {
      const shown = await readRecordSection(facilityDetailPage);
      expect({
        modifiedOnFormat: OVERVIEW_DATE_TIME.test(shown.modifiedOn),
        modifiedOnMatches: minutesApart(shown.modifiedOn, record.modifiedOn) <= 1,
        modifiedBy: shown.modifiedBy,
      }).toEqual({ modifiedOnFormat: true, modifiedOnMatches: true, modifiedBy: record.modifiedByName });
      expect(shown.modifiedBy).not.toBe(EMPTY_VALUE);
    });
  });

  test(`TC-${CASES.creationNeverChanges.azureId}: should never change the creation record when the facility is edited`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityIn,
    steps,
  }) => {
    const data = CASES.creationNeverChanges;
    const facility = await facilityIn('Active');
    let original = { createdOn: '', createdBy: '' };

    await steps.critical('Navigate to the Facility Management module - the module loads with the facility list', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open an existing facility and record the Created On and Created By values - the original values are visible', async () => {
      expect(await openOverview(facilityDetailPage, facility.id)).toBe(facility.code);
      const shown = await readRecordSection(facilityDetailPage);
      original = { createdOn: shown.createdOn, createdBy: shown.createdBy };
      expect(OVERVIEW_DATE_TIME.test(original.createdOn) && original.createdBy !== '' && original.createdBy !== EMPTY_VALUE, JSON.stringify(original)).toBe(true);
    });

    await steps.critical('Edit the facility multiple times and save each change - each save is confirmed', async () => {
      for (const building of data.edits) await editBuilding(facilityDetailPage, facility.id, building);
      expect((await readFacility(page, facility.id)).buildingName).toBe(data.edits[data.edits.length - 1]);
    });

    await steps.step('Return to the Overview tab after the final save - it displays updated modification details', async () => {
      expect(await openOverview(facilityDetailPage, facility.id)).toBe(facility.code);
      const shown = await readRecordSection(facilityDetailPage);
      expect({ modifiedOnFormat: OVERVIEW_DATE_TIME.test(shown.modifiedOn), modifiedByShown: shown.modifiedBy !== '' && shown.modifiedBy !== EMPTY_VALUE })
        .toEqual({ modifiedOnFormat: true, modifiedByShown: true });
    });

    await steps.step('Compare the creation details to the originally recorded values - Created On and Created By are identical to step 2', async () => {
      const shown = await readRecordSection(facilityDetailPage);
      expect({ createdOn: shown.createdOn, createdBy: shown.createdBy }).toEqual(original);
    });
  });

  test(`TC-${CASES.firstSave.azureId}: should show identical creation and modification details right after a facility is first created`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    discardFacilityNamed,
    steps,
  }) => {
    const nameEn = suiteFacilityName(CASES.firstSave.label);
    discardFacilityNamed(nameEn);
    let id = '';
    let code = '';

    await steps.critical('Navigate to the Facility Management module - the module loads with the facility list', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical('Create a new facility and save it - the facility is created and saved', async () => {
      const drawer = await facilityManagementPage.openAddForm();
      const stamp = facilityStamp();
      const answer = await drawer.create(
        { nameEn, nameAr: suiteFacilityArabicName(), type: 'Pharmacy', providerType: 'Both' },
        { email: suiteFacilityEmail(stamp), licenseNo: `QA-SUN-${stamp}`.toUpperCase(), licenseStart: facilityDayText(riyadhDay(-1)), licenseExpiry: facilityDayText(riyadhDay(365)) },
      );
      expect(answer.status, answer.messages.join(' | ')).toBeLessThan(300);
      const created = await findFacilityByName(page, nameEn);
      expect(created).not.toBeNull();
      id = created!.id;
      code = created!.facilityCode;
    });

    await steps.critical('Open the Overview tab of the newly created facility - it displays the facility details', async () => {
      expect(await openOverview(facilityDetailPage, id)).toBe(code);
    });

    await steps.step('Compare the creation and modification details - Created On equals Modified On and Created By equals Modified By', async () => {
      const shown = await readRecordSection(facilityDetailPage);
      expect({ modifiedOn: shown.modifiedOn, modifiedBy: shown.modifiedBy }).toEqual({ modifiedOn: shown.createdOn, modifiedBy: shown.createdBy });
    });
  });

  test(`TC-${CASES.creatorByRole.azureId}: should show the creating user whatever their role`, async ({ page, steps }) => {
    const data = CASES.creatorByRole;
    const missing = data.creators.filter((role) => !(data.available as readonly string[]).includes(role));
    if (missing.length > 0) {
      steps.blocked(`facilities created by ${missing.join(' and ')} users cannot be produced: this environment has no ${missing.join(' / ')} account `
        + '(only the administrator and the Payer Admin, which holds no Facilities.CreateFacility right) - each creator role needs its own signed-in user');
    }
    await page.goto(env.baseUrl);
    await steps.step('Open a facility created by each role - Created By shows the creating user', async () => {
      expect(missing).toEqual([]);
    });
  });

  test(`TC-${CASES.deactivatedEditor.azureId}: should keep the last editor's name after that user's account is deactivated`, async ({ steps }) => {
    steps.blocked(NO_DEACTIVATED_EDITOR);
  });

  test(`TC-${CASES.rapidEdits.azureId}: should show only the most recent of two quick edits`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityIn,
    steps,
  }) => {
    const data = CASES.rapidEdits;
    const facility = await facilityIn('Active');
    let first = null as FacilityRecord | null;

    await steps.critical('Navigate to the Facility Management module - the module loads with the facility list', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open a facility, make a small edit, then save - the save succeeds and the modification details update to the first edit', async () => {
      await editBuilding(facilityDetailPage, facility.id, data.edits[0]);
      first = await readFacility(page, facility.id);
      expect({ building: first.buildingName, modified: first.modifiedOn !== null }).toEqual({ building: data.edits[0], modified: true });
    });

    await steps.critical('Immediately make a second edit and save again - the save succeeds', async () => {
      await editBuilding(facilityDetailPage, facility.id, data.edits[1]);
      expect((await readFacility(page, facility.id)).buildingName).toBe(data.edits[1]);
    });

    await steps.step('Reload the Overview tab - it refreshes with the latest data', async () => {
      expect(await openOverview(facilityDetailPage, facility.id)).toBe(facility.code);
      await facilityDetailPage.reload();
      await facilityDetailPage.waitForLoaded();
      expect(await facilityDetailPage.readOverviewField('buildingName')).toBe(data.edits[1]);
    });

    await steps.step('Check the modification details - only the second edit\'s time and user are shown', async () => {
      const latest = await readFacility(page, facility.id);
      const shown = await readRecordSection(facilityDetailPage);
      expect({
        modifiedOnIsLatest: minutesApart(shown.modifiedOn, latest.modifiedOn) <= 1,
        latestAfterFirst: Date.parse(String(latest.modifiedOn)) > Date.parse(String(first?.modifiedOn)),
        modifiedBy: shown.modifiedBy,
      }).toEqual({ modifiedOnIsLatest: true, latestAfterFirst: true, modifiedBy: latest.modifiedByName });
    });
  });

  test(`TC-${CASES.dateFormats.azureId}: should show creation and modification dates in one consistent, readable format`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityIn,
    steps,
  }) => {
    const fresh = await facilityIn('Active');
    await page.goto(env.baseUrl);
    const oldestItem = (await listFacilityRegister(page, { sortBy: 'CreatedOn asc' }, 1)).items[0];
    const oldest = oldestItem ? await readFacility(page, oldestItem.id) : null;
    const ageDays = oldest ? (Date.now() - Date.parse(oldest.createdOn)) / 86_400_000 : 0;
    if (!oldest || ageDays < OLD_FACILITY_DAYS) {
      steps.blocked(`no facility in the register was created ${OLD_FACILITY_DAYS}+ days ago (the oldest: ${oldest ? `${oldest.facilityCode}, ${Math.floor(ageDays)} days` : 'none'})`);
    }
    const old = oldest!;
    let createdFormat = '';

    await steps.critical('Navigate to the Facility Management module - the module loads with the facility list', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(fresh.nameEn)).toBe(true);
    });

    await steps.step('Open a facility created today - Created On shows today\'s date and time in the standard system format', async () => {
      expect(await openOverview(facilityDetailPage, fresh.id)).toBe(fresh.code);
      createdFormat = (await readRecordSection(facilityDetailPage)).createdOn;
      expect({ format: OVERVIEW_DATE_TIME.test(createdFormat), day: createdFormat.slice(0, 10) }).toEqual({ format: true, day: facilityDayText(riyadhDay(0)) });
    });

    await steps.step(`Open a facility created several months ago (${old.facilityCode}) - Created On shows the historical date correctly formatted`, async () => {
      expect(await openOverview(facilityDetailPage, old.id)).toBe(old.facilityCode);
      const shown = (await readRecordSection(facilityDetailPage)).createdOn;
      expect({ format: OVERVIEW_DATE_TIME.test(shown), day: shown.slice(0, 10), matches: minutesApart(shown, old.createdOn) <= 1 })
        .toEqual({ format: true, day: facilityDayText(riyadhDayOf(old.createdOn)), matches: true });
    });

    await steps.step('Open a facility modified just now - Modified On shows a current timestamp in the same format as Created On', async () => {
      await editBuilding(facilityDetailPage, fresh.id, CASES.dateFormats.building);
      expect(await openOverview(facilityDetailPage, fresh.id)).toBe(fresh.code);
      const record = await readFacility(page, fresh.id);
      const shown = (await readRecordSection(facilityDetailPage)).modifiedOn;
      expect({ format: OVERVIEW_DATE_TIME.test(shown), sameShapeAsCreated: shown.replace(/\d/g, '0').replace(/[AP]M/i, 'XM') === createdFormat.replace(/\d/g, '0').replace(/[AP]M/i, 'XM'), current: minutesApart(shown, record.modifiedOn) <= 1 })
        .toEqual({ format: true, sameShapeAsCreated: true, current: true });
    });
  });
});
