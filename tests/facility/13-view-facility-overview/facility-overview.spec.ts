import { test, expect } from '../../../fixtures';
import { FACILITY_DETAIL, FACILITY_NETWORKS } from '../../../constants/facility/facilityIds';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { CASES, BLANK_VALUES, OVERVIEW_CHECKLIST, TECHNICAL_PLACEHOLDER } from '../../../data/facility/facilityOverview.data';
import { NO_NETWORKS } from '../../../data/facility/networkAssignment.data';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import {
  AUTHORITY_CODE,
  arabicLettersToken,
  readFacility,
  readFacilityNetworks,
  riyadhDay,
  type FacilityRecord,
} from '../../../utils/FacilityProvisioning';
import {
  OVERVIEW_DATE_TIME,
  anchorOrBlocked,
  asIsoDay,
  coordinate,
  headerNameDirection,
  minutesApart,
  overlappingOverviewValues,
  overviewDateTimeMs,
  overviewDirection,
  overviewOverflows,
  readAllNetworkRows,
  refreshAnchorRecord,
} from '../../../utils/facility/writerBHelpers';

/** The values the Overview should show for a stored record (licence dates as `YYYY-MM-DD`, coordinates as numbers). */
function expectedOverview(record: FacilityRecord, providerType: string, status: string): Record<string, unknown> {
  return {
    facilityCode: record.facilityCode,
    nameAr: record.facilityNameAr,
    authorityCode: String(record.authorityCode ?? AUTHORITY_CODE.pharmacy),
    providerType,
    status,
    nationalCode: record.nationalCode,
    licenseStart: String(record.licenseStartDate).slice(0, 10),
    licenseExpiry: String(record.licenseExpiryDate).slice(0, 10),
    phone: record.phoneNumber,
    mobile: record.mobileNumber,
    buildingName: record.buildingName,
    unitNumber: record.unitNumber,
    zipCode: record.zipCode,
    additionalAddressEn: record.additionalAddressEnglish,
    additionalAddressAr: record.additionalAddressArabic,
    longitude: Number(record.longitude),
    latitude: Number(record.latitude),
  };
}

/** The Overview read in the same shape as expectedOverview. */
function normalisedOverview(shown: Record<string, string>): Record<string, unknown> {
  return {
    facilityCode: shown.facilityCode,
    nameAr: shown.nameAr,
    authorityCode: shown.authorityCode,
    providerType: shown.providerType,
    status: shown.status,
    nationalCode: shown.nationalCode,
    licenseStart: asIsoDay(shown.licenseStart),
    licenseExpiry: asIsoDay(shown.licenseExpiry),
    phone: shown.phone,
    mobile: shown.mobile,
    buildingName: shown.buildingName,
    unitNumber: shown.unitNumber,
    zipCode: shown.zipCode,
    additionalAddressEn: shown.additionalAddressEn,
    additionalAddressAr: shown.additionalAddressAr,
    longitude: coordinate(shown.longitude),
    latitude: coordinate(shown.latitude),
  };
}

/**
 * User story 17434: View Facility - Overview. The administrator views the
 * suite's own facilities; "a fully populated facility in a network" is the
 * suite's long-lived network anchor (see the data file). 17586's editor is the
 * Payer Admin (shapedNonAdmin, unshaped - it holds UpdateFacility); 17584 lives
 * in facility-overview-access.spec.ts.
 */
test.describe('US 17434 - View Facility - Overview', () => {
  test.describe.configure({ timeout: 8 * 60_000 });

  test(`TC-${CASES.allTabs.azureId}: should show the complete facility details across the Overview, Network Assignment and Audit History tabs`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityNetworksTab,
    facilityAuditTab,
    steps,
  }, testInfo) => {
    const anchor = await anchorOrBlocked(page, testInfo, { kind: 'single' });
    const record = await refreshAnchorRecord(page, anchor).catch((error: unknown) => steps.blocked(`the anchor's record could not be filled: ${String(error)}`));

    await steps.critical('Navigate to the Facility Management module - the facility list is displayed', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(anchor.facility.nameEn)).toBe(true);
    });

    await steps.critical('Search for and open the facility record - the details page opens on the Overview tab', async () => {
      await facilityManagementPage.openDetails(anchor.facility.nameEn);
      await facilityDetailPage.waitForLoaded();
      expect(await facilityDetailPage.readOverviewField('facilityCode')).toBe(record.facilityCode);
    });

    await steps.step('Review the Overview tab - Basic Information, License, Contact, Address, Geo-coordinates and record fields show the facility\'s data', async () => {
      const shown = await facilityDetailPage.readOverview();
      expect(normalisedOverview(shown)).toEqual(expectedOverview(record, 'Both', 'Active'));
      expect({
        createdOn: OVERVIEW_DATE_TIME.test(shown.createdOn),
        createdBy: shown.createdBy,
        modifiedOn: minutesApart(shown.modifiedOn, record.modifiedOn) <= 1,
        modifiedBy: shown.modifiedBy,
      }).toEqual({ createdOn: true, createdBy: record.createdByName, modifiedOn: true, modifiedBy: record.modifiedByName });
    });

    await steps.step('Select the Network Assignment tab - it shows the facility\'s assigned network details', async () => {
      await facilityNetworksTab.open();
      expect((await readAllNetworkRows(page, facilityNetworksTab)).map((r) => r.code).sort()).toEqual(anchor.networks.map((n) => n.code).sort());
    });

    await steps.step('Select the Audit History tab - it shows a chronological history of changes to the facility', async () => {
      await facilityAuditTab.open();
      const entries = await facilityAuditTab.readEntries();
      const times = entries.map((e) => overviewDateTimeMs(e.when));
      const chronological = times.every((t, i) => !Number.isNaN(t) && (i === 0 || t <= times[i - 1]));
      expect({ entries: entries.length > 0, chronological }, JSON.stringify(entries.slice(0, 5))).toEqual({ entries: true, chronological: true });
    });
  });

  test(`TC-${CASES.bilingualName.azureId}: should display the facility name correctly in Arabic and English`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityIn,
    steps,
  }) => {
    const nameAr = `${CASES.bilingualName.nameAr} ${arabicLettersToken()}`;
    const facility = await facilityIn('Active', { nameAr });

    await steps.critical('Navigate to the Facility Management module - the facility list is displayed', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open the facility record - the Overview tab is displayed', async () => {
      await facilityDetailPage.open(facility.id);
      expect(await facilityDetailPage.readOverviewField('facilityCode')).toBe(facility.code);
    });

    await steps.step('Locate the facility name fields - the English name reads left-to-right and اسم المنشأة right-to-left, uncorrupted', async () => {
      expect({
        english: await facilityDetailPage.getName(),
        englishDirection: await headerNameDirection(page),
        arabic: await facilityDetailPage.readOverviewField('nameAr'),
        arabicDirection: await overviewDirection(page, 'nameAr'),
      }).toEqual({ english: facility.nameEn, englishDirection: 'ltr', arabic: nameAr, arabicDirection: 'rtl' });
    });
  });

  test(`TC-${CASES.noNetworkMessage.azureId}: should say clearly when a facility has no assigned network`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityNetworksTab,
    facilityIn,
    steps,
  }, testInfo) => {
    const withNetwork = await anchorOrBlocked(page, testInfo, { kind: 'single' });
    const withoutNetwork = await facilityIn('Active');

    await steps.critical('Navigate to the Facility Management module - the facility list is displayed', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(withoutNetwork.nameEn)).toBe(true);
    });

    await steps.step('Open the facility that has an assigned network and select the Network Assignment tab - it lists the assigned network details', async () => {
      await facilityDetailPage.open(withNetwork.facility.id);
      await facilityNetworksTab.open();
      expect((await readAllNetworkRows(page, facilityNetworksTab)).map((r) => r.code)).toEqual(withNetwork.networks.map((n) => n.code));
    });

    await steps.step('Open the facility that has no assigned network and select the Network Assignment tab - a clear "no network assigned" message, not an empty or broken table', async () => {
      await facilityDetailPage.open(withoutNetwork.id);
      await facilityNetworksTab.open();
      expect({ rows: await facilityNetworksTab.countRows(), message: await facilityNetworksTab.getEmptyText() })
        .toEqual({ rows: 0, message: expect.stringMatching(NO_NETWORKS) });
    });
  });

  test(`TC-${CASES.statusFollowsLifecycle.azureId}: should keep the Overview status in line with the facility's lifecycle state`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityIn,
    steps,
  }) => {
    const facility = await facilityIn('Active');

    await steps.critical('Navigate to the Facility Management module - the facility list is displayed', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open a facility currently in Active status - the Overview Status field shows Active', async () => {
      await facilityDetailPage.open(facility.id);
      expect(await facilityDetailPage.getStatus()).toBe('Active');
    });

    await steps.critical('Deactivate the facility through the standard workflow - its status is updated to Inactive', async () => {
      const drawer = await facilityDetailPage.openInactivate();
      const answer = await drawer.inactivate(CASES.statusFollowsLifecycle.details);
      expect(answer.status, answer.messages.join(' | ')).toBeLessThan(300);
      expect((await readFacility(page, facility.id)).isActive).toBe(false);
    });

    await steps.step('Reopen the facility\'s Overview tab - the Status field now shows Inactive', async () => {
      await facilityDetailPage.open(facility.id);
      await facilityDetailPage.openTab('overview');
      expect(await facilityDetailPage.getStatus()).toBe('Inactive');
    });
  });

  test(`TC-${CASES.expiresToday.azureId}: should display a licence expiring today correctly, without error`, async ({
    facilityManagementPage,
    facilityDetailPage,
    facilityIn,
    steps,
  }) => {
    const facility = await facilityIn('ExpiresToday');

    await steps.critical('Navigate to the Facility Management module - the facility list is displayed', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open the facility with a licence expiring today - the Overview tab opens', async () => {
      await facilityDetailPage.open(facility.id);
      expect(await facilityDetailPage.readOverviewField('facilityCode')).toBe(facility.code);
    });

    await steps.step('Review the License section - start and expiry dates are shown, the expiry equal to today, no error or blank value', async () => {
      expect({
        start: asIsoDay(await facilityDetailPage.readOverviewField('licenseStart')),
        expiry: asIsoDay(await facilityDetailPage.readOverviewField('licenseExpiry')),
        errors: (await facilityDetailPage.readMessages()).filter((m) => /error|fail|invalid/i.test(m)),
      }).toEqual({ start: facility.licenseStartDate.slice(0, 10), expiry: riyadhDay(0), errors: [] });
    });
  });

  test(`TC-${CASES.extremeCoordinates.azureId}: should display geo-coordinates at the extreme valid values exactly`, async ({
    facilityManagementPage,
    facilityDetailPage,
    facilityIn,
    steps,
  }) => {
    const data = CASES.extremeCoordinates;
    const north = await facilityIn('Active', { latitude: data.north.latitude, longitude: data.north.longitude });
    const south = await facilityIn('Active', { latitude: data.south.latitude, longitude: data.south.longitude });
    const read = async (id: string): Promise<{ latitude: number; longitude: number }> => {
      await facilityDetailPage.open(id);
      await facilityDetailPage.openTab('overview');
      return { latitude: coordinate(await facilityDetailPage.readOverviewField('latitude')), longitude: coordinate(await facilityDetailPage.readOverviewField('longitude')) };
    };

    await steps.critical('Navigate to the Facility Management module - the facility list is displayed', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(north.nameEn)).toBe(true);
    });

    await steps.step('Open a facility with Latitude = 90 and Longitude = 180 - the Geo-coordinates section shows 90 and 180 exactly', async () => {
      expect(await read(north.id)).toEqual(data.north);
    });

    await steps.step('Open a facility with Latitude = -90 and Longitude = -180 - the Geo-coordinates section shows -90 and -180 exactly', async () => {
      expect(await read(south.id)).toEqual(data.south);
    });
  });

  test(`TC-${CASES.zipCodes.azureId}: should display zip codes of every accepted length in full`, async ({
    facilityManagementPage,
    facilityDetailPage,
    facilityIn,
    steps,
  }) => {
    const data = CASES.zipCodes;
    const short = await facilityIn('Active', { zipCode: data.short });
    const long = await facilityIn('Active', { zipCode: data.long });
    const zipOf = async (id: string): Promise<string> => {
      await facilityDetailPage.open(id);
      await facilityDetailPage.openTab('overview');
      return facilityDetailPage.readOverviewField('zipCode');
    };

    await steps.critical('Navigate to the Facility Management module - the facility list is displayed', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(short.nameEn)).toBe(true);
    });

    await steps.step('Open a facility with a standard zip code - the Address section shows the Zip Code exactly as stored', async () => {
      expect(await zipOf(short.id)).toBe(data.short);
    });

    await steps.step('Open the facilities with the shortest and the longest valid zip code - both display completely, without truncation', async () => {
      expect({ short: await zipOf(short.id), long: await zipOf(long.id) }).toEqual({ short: data.short, long: data.long });
    });
  });

  test(`TC-${CASES.unusualAddress.azureId}: should display unusual or lengthy address text cleanly without breaking the layout`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityIn,
    steps,
  }) => {
    const data = CASES.unusualAddress;
    const addressEn = data.addressEn.padEnd(180, '.').slice(0, 180);
    const facility = await facilityIn('Active', { buildingName: data.building, additionalAddressEnglish: addressEn, additionalAddressArabic: data.addressAr });

    await steps.critical('Navigate to the Facility Management module - the facility list is displayed', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open the facility record with special characters and diacritics in its Building Name and Additional Address - the Overview tab opens', async () => {
      await facilityDetailPage.open(facility.id);
      expect(await facilityDetailPage.readOverviewField('facilityCode')).toBe(facility.code);
    });

    await steps.step('Review the Address section - special characters render correctly and the long value wraps or truncates without overlapping or breaking the layout', async () => {
      expect({
        building: await facilityDetailPage.readOverviewField('buildingName'),
        addressEn: await facilityDetailPage.readOverviewField('additionalAddressEn'),
        addressAr: await facilityDetailPage.readOverviewField('additionalAddressAr'),
        overlapping: await overlappingOverviewValues(page),
        overflow: await overviewOverflows(page, 'additionalAddressEn'),
      }).toEqual({ building: data.building, addressEn, addressAr: data.addressAr, overlapping: [], overflow: false });
    });
  });

  test(`TC-${CASES.optionalBlank.azureId}: should show empty optional fields gracefully`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityIn,
    steps,
  }) => {
    const facility = await facilityIn('Active', { phoneNumber: '+966112345678', buildingName: 'Blank Fields Building', mobileNumber: null, additionalAddressArabic: null, unitNumber: null });

    await steps.critical('Navigate to the Facility Management module - the facility list is displayed', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open the facility record with missing optional fields - the Overview tab opens without error', async () => {
      await facilityDetailPage.open(facility.id);
      expect({ code: await facilityDetailPage.readOverviewField('facilityCode'), errors: (await facilityDetailPage.readMessages()).filter((m) => /error|fail/i.test(m)) })
        .toEqual({ code: facility.code, errors: [] });
    });

    await steps.step('Review the Contact and Address sections - empty fields show a blank or a placeholder such as "-", never an error or "null"', async () => {
      const blanks = {
        mobile: await facilityDetailPage.readOverviewField('mobile'),
        unitNumber: await facilityDetailPage.readOverviewField('unitNumber'),
        additionalAddressAr: await facilityDetailPage.readOverviewField('additionalAddressAr'),
      };
      const text = await page.locator(`#${FACILITY_DETAIL.root}`).innerText();
      expect({ blanks: Object.values(blanks).every((v) => BLANK_VALUES.includes(v)), technical: TECHNICAL_PLACEHOLDER.test(text) }, JSON.stringify(blanks))
        .toEqual({ blanks: true, technical: false });
    });
  });

  test(`TC-${CASES.fieldChecklist.azureId}: should present every documented Overview field, correctly labelled and grouped`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    steps,
  }, testInfo) => {
    const anchor = await anchorOrBlocked(page, testInfo, { kind: 'single' });

    await steps.critical('Navigate to the Facility Management module - the facility list is displayed', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(anchor.facility.nameEn)).toBe(true);
    });

    await steps.critical('Open a fully populated facility record\'s Overview tab - the page renders completely', async () => {
      await facilityDetailPage.open(anchor.facility.id);
      await facilityDetailPage.openTab('overview');
      expect(await facilityDetailPage.readOverviewField('facilityCode')).toBe(anchor.facility.code);
    });

    await steps.step('Go through the documented field checklist - each field is present, correctly labelled and under the right section', async () => {
      const labels = Object.keys(await facilityDetailPage.readOverviewLabels());
      const text = await facilityDetailPage.getPageText();
      const sections = Object.keys(OVERVIEW_CHECKLIST);
      const starts: number[] = [];
      for (const title of sections) starts.push(text.indexOf(title, starts.length ? starts[starts.length - 1] + 1 : 0));
      const missing: string[] = [];
      const misplaced: string[] = [];
      sections.forEach((title, i) => {
        const from = starts[i];
        const to = starts.slice(i + 1).find((s) => s > from) ?? text.length;
        for (const label of OVERVIEW_CHECKLIST[title]) {
          const at = from < 0 ? -1 : text.indexOf(label, from);
          const inSection = at >= 0 && at < to;
          // Status is a badge with its label beside it, not a label/value pair the label
          // reader collects (full run 2026-11-04): the label on screen in its section counts.
          if (!labels.includes(label) && !inSection) missing.push(label);
          if (!inSection) misplaced.push(`${label} (expected under ${title})`);
        }
      });
      expect({ missingSections: sections.filter((_, i) => starts[i] < 0), missing, misplaced }).toEqual({ missingSections: [], missing: [], misplaced: [] });
    });
  });

  test(`TC-${CASES.tabSwitching.azureId}: should show current, accurate data while switching repeatedly between the three tabs`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityNetworksTab,
    facilityAuditTab,
    steps,
  }, testInfo) => {
    const anchor = await anchorOrBlocked(page, testInfo, { kind: 'single' });
    const record = await refreshAnchorRecord(page, anchor).catch((error: unknown) => steps.blocked(`the anchor's record could not be filled: ${String(error)}`));
    const codes = (await readFacilityNetworks(page, anchor.facility.id, 100)).items.map((n) => n.networkCode).sort();
    const visible = (id: string): Promise<boolean> => page.locator(`#${id}`).first().isVisible().catch(() => false);

    await steps.critical('Navigate to the Facility Management module - the facility list is displayed', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(anchor.facility.nameEn)).toBe(true);
    });

    await steps.step('Open the facility and switch repeatedly between Overview, Network Assignment and Audit History, refreshing mid-way - each tab shows its own correct content', async () => {
      await facilityDetailPage.open(anchor.facility.id);
      const problems: string[] = [];
      for (let round = 1; round <= CASES.tabSwitching.rounds; round += 1) {
        await facilityDetailPage.openTab('overview');
        if ((await facilityDetailPage.readOverviewField('facilityCode')) !== record.facilityCode) problems.push(`round ${round}: Overview code`);
        if (await visible(FACILITY_NETWORKS.table)) problems.push(`round ${round}: the network table shows on the Overview`);
        await facilityNetworksTab.open();
        const shown = (await facilityNetworksTab.readRows()).map((r) => r.code).sort();
        if (JSON.stringify(shown) !== JSON.stringify(codes.slice(0, 10))) problems.push(`round ${round}: networks ${JSON.stringify(shown)}`);
        if (await visible(FACILITY_DETAIL.overview.facilityCode)) problems.push(`round ${round}: Overview values show on the Network tab`);
        if (round === 2) {
          await page.reload();
          await facilityDetailPage.waitForLoaded();
        }
        await facilityAuditTab.open();
        if ((await facilityAuditTab.readEntries()).length === 0) problems.push(`round ${round}: no audit entries`);
        if (await visible(FACILITY_NETWORKS.table)) problems.push(`round ${round}: the network table shows on the Audit tab`);
      }
      expect(problems).toEqual([]);
    });

    await steps.step('Navigate away to the facility list and return to the same facility - the Overview tab is shown by default with current data', async () => {
      await facilityManagementPage.openTable();
      await facilityManagementPage.openDetails(anchor.facility.nameEn);
      await facilityDetailPage.waitForLoaded();
      expect({
        overviewShown: await visible(FACILITY_DETAIL.overview.facilityCode),
        code: await facilityDetailPage.readOverviewField('facilityCode'),
        additionalAddressEn: await facilityDetailPage.readOverviewField('additionalAddressEn'),
      }).toEqual({ overviewShown: true, code: record.facilityCode, additionalAddressEn: record.additionalAddressEnglish });
    });
  });

  test(`TC-${CASES.creatorAndEditor.azureId}: should show the real users who created and last changed the facility`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityIn,
    shapedNonAdmin,
    steps,
  }) => {
    const facility = await facilityIn('Active');
    const other = await shapedNonAdmin({});
    const current = await readFacility(page, facility.id);
    const edit = await NetworkUtils.requestAsSession(other.page, 'PUT', ApiEndpoints.facilityUpdate, {
      ...current,
      id: facility.id,
      concurrencyStamp: current.concurrencyStamp,
      buildingName: CASES.creatorAndEditor.building,
    });
    if (edit.status >= 300) {
      steps.blocked(`the Payer Admin (holding Facilities.UpdateFacility) could not modify the facility, so a facility "created by one user and modified by another" `
        + `cannot be produced: UpdateFacility answered ${edit.status} ${edit.text.slice(0, 200)}`);
    }
    const record = await readFacility(page, facility.id);

    await steps.critical('Navigate to the Facility Management module - the facility list is displayed', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open the facility record - the Overview tab opens', async () => {
      await facilityDetailPage.open(facility.id);
      expect(await facilityDetailPage.readOverviewField('facilityCode')).toBe(facility.code);
    });

    await steps.step('Review the record metadata section - Created On and Created By show the original creator and creation time', async () => {
      expect({
        createdOn: minutesApart(await facilityDetailPage.readOverviewField('createdOn'), record.createdOn) <= 1,
        createdBy: await facilityDetailPage.readOverviewField('createdBy'),
      }).toEqual({ createdOn: true, createdBy: record.createdByName });
    });

    await steps.step('Confirm the Modified On and Modified By fields - they show the most recent editor and the time of the last update', async () => {
      const modifiedBy = await facilityDetailPage.readOverviewField('modifiedBy');
      expect({
        modifiedOn: minutesApart(await facilityDetailPage.readOverviewField('modifiedOn'), record.modifiedOn) <= 1,
        modifiedBy,
        anotherUser: modifiedBy !== record.createdByName,
        // The screen collapses runs of spaces; the account's name is stored "Payer  Admin"
        // (full run 2026-11-04) - compared as displayed text.
      }).toEqual({ modifiedOn: true, modifiedBy: String(record.modifiedByName ?? '').replace(/\s+/g, ' ').trim(), anotherUser: true });
    });
  });
});
