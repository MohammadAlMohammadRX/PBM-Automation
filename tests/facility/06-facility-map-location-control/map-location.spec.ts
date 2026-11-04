import { test, expect } from '../../../fixtures';
import type { FacilityManagementPage } from '../../../pages/facility/FacilityManagementPage';
import type { FacilityDetailPage } from '../../../pages/facility/FacilityDetailPage';
import type { FacilityFormDrawer } from '../../../pages/facility/FacilityFormDrawer';
import {
  CASES,
  CLICK_DECIMALS,
  COORDINATE_LABELS,
  LOCATION_REQUIRED,
  MAP_CENTRE,
  MAX_ZOOM_TOLERANCE,
  NEAR_EDGE,
} from '../../../data/facility/mapLocation.data';
import {
  facilityDayText,
  facilityStamp,
  findFacilityByName,
  readFacility,
  riyadhDay,
  suiteFacilityArabicName,
  suiteFacilityEmail,
  suiteFacilityName,
} from '../../../utils/FacilityProvisioning';
import {
  coordinate,
  decimalsOf,
  drawerMapSize,
  isMapShown,
  isMarkerInsideMap,
  mapMarkerCount,
  zoomDrawerMapInFully,
  zoomDrawerMapOutFully,
} from '../../../utils/facility/writerBHelpers';

type Coordinates = { latitude: string; longitude: string };

/** Add Facility, step 1 filled with a suite facility's identity, then Next to "Contact & License". */
async function startAdding(list: FacilityManagementPage, nameEn: string): Promise<{ drawer: FacilityFormDrawer; reachedStep2: boolean }> {
  const drawer = await list.openAddForm();
  await drawer.fillBasic({ nameEn, nameAr: suiteFacilityArabicName(), type: 'Pharmacy', providerType: 'Both' });
  return { drawer, reachedStep2: await drawer.next() };
}

/** Step 2's required fields (e-mail, licence number, a valid licence period). */
async function fillRequiredContact(drawer: FacilityFormDrawer): Promise<void> {
  const stamp = facilityStamp();
  await drawer.fillContact({
    email: suiteFacilityEmail(stamp),
    licenseNo: `QA-MAP-${stamp}`.toUpperCase(),
    licenseStart: facilityDayText(riyadhDay(-1)),
    licenseExpiry: facilityDayText(riyadhDay(365)),
  });
}

/** Edit the facility from its detail and move to step 2. */
async function openEditStep2(detail: FacilityDetailPage, id: string): Promise<{ drawer: FacilityFormDrawer; reachedStep2: boolean }> {
  await detail.open(id);
  const drawer = await detail.openEditDrawer();
  return { drawer, reachedStep2: await drawer.next() };
}

const asNumbers = (c: Coordinates): { latitude: number; longitude: number } => ({ latitude: coordinate(c.latitude), longitude: coordinate(c.longitude) });

/**
 * The same spot to within about a metre (5 decimals). The server keeps coordinates to about
 * 7 significant digits (full run 2026-11-04: 45.900879 picked -> 45.90088 stored, 24.646983 ->
 * 24.646982), so an exact match on the 6th decimal fails although the location is recorded.
 */
const sameSpot = (c: { latitude: number; longitude: number }): { latitude: unknown; longitude: unknown } => ({
  latitude: expect.closeTo(c.latitude, 5),
  longitude: expect.closeTo(c.longitude, 5),
});

const validCoordinate = (c: Coordinates): boolean => {
  const { latitude, longitude } = asNumbers(c);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
};

/**
 * User story 15137: Facility map location control. The administrator plays
 * the Facility Administrator; every facility is the suite's own (created through
 * the drawer and registered for teardown, or built by `facilityIn`).
 */
test.describe('US 15137 - Facility map location control', () => {
  test.describe.configure({ timeout: 8 * 60_000 });

  test(`TC-${CASES.placeByClick.azureId}: should place a new facility's location by clicking a point on the map`, async ({
    page,
    facilityManagementPage,
    discardFacilityNamed,
    steps,
  }) => {
    const data = CASES.placeByClick;
    const nameEn = suiteFacilityName('Map');
    discardFacilityNamed(nameEn);
    let drawer!: FacilityFormDrawer;
    let captured: Coordinates = { latitude: '', longitude: '' };

    await steps.critical('Navigate to the Facility Management module - the module loads', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical('Start creating a new facility and proceed to the Contact & License step - the step displays a map control', async () => {
      const started = await startAdding(facilityManagementPage, nameEn);
      drawer = started.drawer;
      expect({ step2: started.reachedStep2, map: await isMapShown(page, 'drawer') }).toEqual({ step2: true, map: true });
    });

    await steps.step('Click a specific point on the map - a location marker is placed at the clicked point', async () => {
      captured = await drawer.clickMap(data.click.dx, data.click.dy);
      expect(await mapMarkerCount(page, 'drawer')).toBe(1);
    });

    await steps.step('Review the latitude and longitude fields - the captured values match the clicked map location', async () => {
      const shown = await drawer.readCoordinates();
      const { latitude, longitude } = asNumbers(shown);
      expect({
        same: shown,
        northOfCentre: latitude > MAP_CENTRE.latitude,
        eastOfCentre: longitude > MAP_CENTRE.longitude,
        decimals: [decimalsOf(shown.latitude), decimalsOf(shown.longitude)],
      }).toEqual({ same: captured, northOfCentre: true, eastOfCentre: true, decimals: [CLICK_DECIMALS, CLICK_DECIMALS] });
    });

    await drawer?.close(true).catch(() => undefined);
  });

  test(`TC-${CASES.updateByClick.azureId}: should update an existing facility's location by clicking a new point on the map`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityIn,
    steps,
  }) => {
    const data = CASES.updateByClick;
    const facility = await facilityIn('Active');
    const original = { latitude: Number(facility.record.latitude), longitude: Number(facility.record.longitude) };
    let drawer!: FacilityFormDrawer;
    let moved: Coordinates = { latitude: '', longitude: '' };

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility list', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open the existing facility for editing and go to the Contact & License step - the map shows the current marker and coordinates', async () => {
      const opened = await openEditStep2(facilityDetailPage, facility.id);
      drawer = opened.drawer;
      expect({ step2: opened.reachedStep2, shown: asNumbers(await drawer.readCoordinates()), markers: await mapMarkerCount(page, 'drawer') })
        .toEqual({ step2: true, shown: original, markers: 1 });
    });

    await steps.critical('Click a different point on the map - the marker moves and the latitude/longitude fields update to the new values', async () => {
      moved = await drawer.clickMap(data.click.dx, data.click.dy);
      expect(await mapMarkerCount(page, 'drawer')).toBe(1);
      expect(asNumbers(moved)).not.toEqual(original);
    });

    await steps.step('Save the facility and reopen the Overview tab - the Overview shows the newly updated coordinates', async () => {
      await drawer.save();
      await facilityDetailPage.open(facility.id);
      await facilityDetailPage.openTab('overview');
      expect({
        latitude: coordinate(await facilityDetailPage.readOverviewField('latitude')),
        longitude: coordinate(await facilityDetailPage.readOverviewField('longitude')),
      }).toEqual(asNumbers(moved));
    });
  });

  test(`TC-${CASES.shownOnOverview.azureId}: should show the captured map location on the Overview tab after saving`, async ({
    facilityManagementPage,
    facilityDetailPage,
    facilityIn,
    steps,
  }) => {
    const data = CASES.shownOnOverview;
    const facility = await facilityIn('Active', { latitude: data.latitude, longitude: data.longitude });

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility list', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open the saved facility\'s record - the facility detail view opens', async () => {
      await facilityDetailPage.open(facility.id);
      expect(await facilityDetailPage.getName()).toBe(facility.nameEn);
    });

    await steps.step('Select the "Overview" tab - it shows the latitude and longitude captured at creation, matching the Contact & License step', async () => {
      await facilityDetailPage.openTab('overview');
      const overview = {
        latitude: coordinate(await facilityDetailPage.readOverviewField('latitude')),
        longitude: coordinate(await facilityDetailPage.readOverviewField('longitude')),
      };
      const { drawer } = await openEditStep2(facilityDetailPage, facility.id);
      const step2 = asNumbers(await drawer.readCoordinates());
      await drawer.close(true).catch(() => undefined);
      expect({ overview, step2 }).toEqual({
        overview: { latitude: data.latitude, longitude: data.longitude },
        step2: { latitude: data.latitude, longitude: data.longitude },
      });
    });
  });

  test(`TC-${CASES.extremeEdges.azureId}: should capture locations at the extreme edges of latitude and longitude without error`, async ({
    page,
    facilityManagementPage,
    discardFacilityNamed,
    steps,
  }) => {
    const nameEn = suiteFacilityName('MapEdge');
    discardFacilityNamed(nameEn);
    let drawer!: FacilityFormDrawer;

    await steps.critical('Navigate to the Facility Management module - the module loads', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical('Start creating a facility and reach the Contact & License step - the map control displays', async () => {
      const started = await startAdding(facilityManagementPage, nameEn);
      drawer = started.drawer;
      expect({ step2: started.reachedStep2, map: await isMapShown(page, 'drawer') }).toEqual({ step2: true, map: true });
    });

    await steps.step('Pan to a near-polar region and click close to the map\'s top edge - the captured latitude is near +90 and displays without error', async () => {
      await zoomDrawerMapOutFully(drawer, page);
      const { height } = await drawerMapSize(page);
      const shown = await drawer.clickMap(0, -(height / 2 - 6));
      const latitude = coordinate(shown.latitude);
      expect({ latitude: shown.latitude, nearNorthPole: latitude >= 90 - NEAR_EDGE && latitude <= 90, errors: await drawer.getFieldErrors() })
        .toEqual({ latitude: shown.latitude, nearNorthPole: true, errors: {} });
    });

    await steps.step('Pan to a near-dateline region and click close to the map\'s edge - the captured longitude is near +/-180 and displays without error', async () => {
      await zoomDrawerMapOutFully(drawer, page);
      const { width } = await drawerMapSize(page);
      const shown = await drawer.clickMap(width / 2 - 6, 0);
      const longitude = Math.abs(coordinate(shown.longitude));
      expect({ longitude: shown.longitude, nearDateline: longitude >= 180 - NEAR_EDGE && longitude <= 180, errors: await drawer.getFieldErrors() })
        .toEqual({ longitude: shown.longitude, nearDateline: true, errors: {} });
    });

    await drawer?.close(true).catch(() => undefined);
  });

  test(`TC-${CASES.anyRegion.azureId}: should capture valid coordinates from an urban and a remote region alike`, async ({
    page,
    facilityManagementPage,
    discardFacilityNamed,
    steps,
  }) => {
    const data = CASES.anyRegion;
    const nameEn = suiteFacilityName('MapRegion');
    discardFacilityNamed(nameEn);
    let drawer!: FacilityFormDrawer;

    await steps.critical('Navigate to the Facility Management module - the module loads', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical('Start creating a facility and reach the Contact & License step - the map control displays', async () => {
      const started = await startAdding(facilityManagementPage, nameEn);
      drawer = started.drawer;
      expect({ step2: started.reachedStep2, map: await isMapShown(page, 'drawer') }).toEqual({ step2: true, map: true });
    });

    await steps.step('Click a point in a densely populated urban area (Riyadh centre) - valid coordinates are captured and displayed', async () => {
      const urban = await drawer.clickMap(0, 0);
      const { latitude, longitude } = asNumbers(urban);
      expect({ valid: validCoordinate(urban), decimals: [decimalsOf(urban.latitude), decimalsOf(urban.longitude)], inRiyadh: Math.abs(latitude - MAP_CENTRE.latitude) < 0.2 && Math.abs(longitude - MAP_CENTRE.longitude) < 0.2 })
        .toEqual({ valid: true, decimals: [CLICK_DECIMALS, CLICK_DECIMALS], inRiyadh: true });
    });

    await steps.step('Click a point in a remote, sparsely populated area - valid coordinates are captured and displayed the same way', async () => {
      await drawer.zoomMap('out', 7);
      const remote = await drawer.clickMap(data.remote.dx, data.remote.dy);
      const { latitude, longitude } = asNumbers(remote);
      expect({ valid: validCoordinate(remote), decimals: [decimalsOf(remote.latitude), decimalsOf(remote.longitude)], farFromCity: latitude < MAP_CENTRE.latitude - 0.5 && longitude < MAP_CENTRE.longitude - 0.5 })
        .toEqual({ valid: true, decimals: [CLICK_DECIMALS, CLICK_DECIMALS], farFromCity: true });
    });

    await drawer?.close(true).catch(() => undefined);
  });

  test(`TC-${CASES.saveWithoutLocation.azureId}: should prompt for the location when a facility is saved without one`, async ({
    facilityManagementPage,
    discardFacilityNamed,
    steps,
  }) => {
    const nameEn = suiteFacilityName(CASES.saveWithoutLocation.label);
    discardFacilityNamed(nameEn);
    let drawer!: FacilityFormDrawer;

    await steps.critical('Navigate to the Facility Management module - the module loads', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical('Start creating a new facility, complete all other required fields without clicking the map - the latitude/longitude fields remain empty', async () => {
      const started = await startAdding(facilityManagementPage, nameEn);
      drawer = started.drawer;
      expect(started.reachedStep2).toBe(true);
      await fillRequiredContact(drawer);
      expect(await drawer.readCoordinates()).toEqual({ latitude: '', longitude: '' });
    });

    await steps.step('Attempt to save the facility - a validation message says the location must be set before saving', async () => {
      const answer = await drawer.attemptSave();
      expect({ saved: answer.status >= 200 && answer.status < 300 ? `saved (${answer.status})` : 'not saved', asksForLocation: answer.messages.some((m) => LOCATION_REQUIRED.test(m)) },
        `messages: ${answer.messages.join(' | ')}`).toEqual({ saved: 'not saved', asksForLocation: true });
    });

    if (await drawer?.isOpen().catch(() => false)) await drawer.close(true).catch(() => undefined);
  });

  test(`TC-${CASES.maxZoomPrecision.azureId}: should capture precise coordinates when the location is picked at maximum zoom`, async ({
    page,
    facilityManagementPage,
    discardFacilityNamed,
    steps,
  }) => {
    const data = CASES.maxZoomPrecision;
    const nameEn = suiteFacilityName('MapZoom');
    discardFacilityNamed(nameEn);
    let drawer!: FacilityFormDrawer;
    let shown: Coordinates = { latitude: '', longitude: '' };

    await steps.critical('Navigate to the Facility Management module - the module loads', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical('Start creating a facility and reach the Contact & License step - the map control displays', async () => {
      const started = await startAdding(facilityManagementPage, nameEn);
      drawer = started.drawer;
      expect({ step2: started.reachedStep2, map: await isMapShown(page, 'drawer') }).toEqual({ step2: true, map: true });
    });

    await steps.step('Zoom in to the maximum level and click a specific point - a marker is placed precisely at the clicked location', async () => {
      await zoomDrawerMapInFully(drawer, page);
      shown = await drawer.clickMap(data.click.dx, data.click.dy);
      const { latitude, longitude } = asNumbers(shown);
      expect({ markers: await mapMarkerCount(page, 'drawer'), nearTarget: Math.abs(latitude - MAP_CENTRE.latitude) < MAX_ZOOM_TOLERANCE && Math.abs(longitude - MAP_CENTRE.longitude) < MAX_ZOOM_TOLERANCE })
        .toEqual({ markers: 1, nearTarget: true });
    });

    await steps.step('Review the captured latitude and longitude - shown with enough decimal precision for the exact zoomed-in point', async () => {
      const values = await drawer.readCoordinates();
      expect({ same: values, decimals: Math.min(decimalsOf(values.latitude), decimalsOf(values.longitude)) >= CLICK_DECIMALS })
        .toEqual({ same: shown, decimals: true });
    });

    await drawer?.close(true).catch(() => undefined);
  });

  test(`TC-${CASES.saveCombinations.azureId}: should save the right coordinates for every create/update and location-change combination`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityIn,
    discardFacilityNamed,
    steps,
  }) => {
    const data = CASES.saveCombinations;
    const nameEn = suiteFacilityName(data.label);
    discardFacilityNamed(nameEn);
    const existing = await facilityIn('Active', { latitude: 24.65, longitude: 46.71 });

    await steps.critical('Navigate to the Facility Management module - the module loads', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isAddOffered()).toBe(true);
    });

    await steps.step('Create a new facility, set a map location and save - it saves with the new location recorded', async () => {
      const { drawer, reachedStep2 } = await startAdding(facilityManagementPage, nameEn);
      expect(reachedStep2).toBe(true);
      await fillRequiredContact(drawer);
      const picked = asNumbers(await drawer.clickMap(data.click.dx, data.click.dy));
      await drawer.save();
      const created = await findFacilityByName(page, nameEn);
      expect(created, 'the new facility should be in the register').not.toBeNull();
      const record = await readFacility(page, created!.id);
      expect({ latitude: Number(record.latitude), longitude: Number(record.longitude) }).toEqual(sameSpot(picked));
    });

    await steps.step('Edit an existing facility without changing its map location and save - it saves and the original location stays', async () => {
      const { drawer, reachedStep2 } = await openEditStep2(facilityDetailPage, existing.id);
      expect(reachedStep2).toBe(true);
      await drawer.type('buildingName', data.changedBuilding);
      await drawer.save();
      const record = await readFacility(page, existing.id);
      expect({ building: record.buildingName, latitude: Number(record.latitude), longitude: Number(record.longitude) })
        .toEqual({ building: data.changedBuilding, latitude: 24.65, longitude: 46.71 });
    });

    await steps.step('Edit an existing facility, change its map location and save - it saves with the updated location recorded', async () => {
      const { drawer, reachedStep2 } = await openEditStep2(facilityDetailPage, existing.id);
      expect(reachedStep2).toBe(true);
      const picked = asNumbers(await drawer.clickMap(data.click.dx, data.click.dy));
      await drawer.save();
      const record = await readFacility(page, existing.id);
      expect({ latitude: Number(record.latitude), longitude: Number(record.longitude) }).toEqual(sameSpot(picked));
      expect(picked).not.toEqual({ latitude: 24.65, longitude: 46.71 });
    });
  });

  test(`TC-${CASES.rapidClicks.azureId}: should keep only the most recently clicked location after several quick clicks`, async ({
    page,
    facilityManagementPage,
    discardFacilityNamed,
    steps,
  }) => {
    const data = CASES.rapidClicks;
    const nameEn = suiteFacilityName('MapRapid');
    discardFacilityNamed(nameEn);
    let drawer!: FacilityFormDrawer;
    const captured: Coordinates[] = [];

    await steps.critical('Navigate to the Facility Management module - the module loads', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical('Start creating a facility and reach the Contact & License step - the map control displays', async () => {
      const started = await startAdding(facilityManagementPage, nameEn);
      drawer = started.drawer;
      expect({ step2: started.reachedStep2, map: await isMapShown(page, 'drawer') }).toEqual({ step2: true, map: true });
    });

    await steps.step('Click several different points in quick succession - only a single marker is visible after each click, at the latest point', async () => {
      const markers: number[] = [];
      for (const click of data.clicks) {
        captured.push(await drawer.clickMap(click.dx, click.dy));
        markers.push(await mapMarkerCount(page, 'drawer'));
      }
      expect(markers).toEqual(data.clicks.map(() => 1));
    });

    await steps.step('Review the latitude/longitude fields - the values match only the last point clicked', async () => {
      const final = await drawer.readCoordinates();
      const last = captured[captured.length - 1];
      expect({ final, matchesAnEarlierClick: captured.slice(0, -1).some((c) => c.latitude === final.latitude && c.longitude === final.longitude) })
        .toEqual({ final: last, matchesAnEarlierClick: false });
    });

    await drawer?.close(true).catch(() => undefined);
  });

  test(`TC-${CASES.zoomPanThenClick.azureId}: should place the location accurately after zooming and panning the map`, async ({
    page,
    facilityManagementPage,
    discardFacilityNamed,
    steps,
  }) => {
    const data = CASES.zoomPanThenClick;
    const nameEn = suiteFacilityName('MapPan');
    discardFacilityNamed(nameEn);
    let drawer!: FacilityFormDrawer;
    let clicked: Coordinates = { latitude: '', longitude: '' };

    await steps.critical('Navigate to the Facility Management module - the module loads', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical('Start creating a facility and reach the Contact & License step - the map control displays', async () => {
      const started = await startAdding(facilityManagementPage, nameEn);
      drawer = started.drawer;
      expect({ step2: started.reachedStep2, map: await isMapShown(page, 'drawer') }).toEqual({ step2: true, map: true });
    });

    await steps.step('Freely zoom in, zoom out and pan to a target, then click that exact point - the marker is placed precisely on the target', async () => {
      await drawer.zoomMap('in', 4);
      await drawer.panMap(data.pan.dx, data.pan.dy);
      await drawer.zoomMap('out', 2);
      clicked = await drawer.clickMap(0, 0);
      expect({ markers: await mapMarkerCount(page, 'drawer'), insideMap: await isMarkerInsideMap(page), valid: validCoordinate(clicked) })
        .toEqual({ markers: 1, insideMap: true, valid: true });
    });

    await steps.step('Zoom back out and confirm the marker position - the marker stays anchored to the clicked point', async () => {
      await drawer.zoomMap('out', 3);
      expect({ values: await drawer.readCoordinates(), markers: await mapMarkerCount(page, 'drawer'), insideMap: await isMarkerInsideMap(page) })
        .toEqual({ values: clicked, markers: 1, insideMap: true });
    });

    await drawer?.close(true).catch(() => undefined);
  });

  test(`TC-${CASES.consistentDisplay.azureId}: should show the location with consistent precision and labels on the Contact & License step and the Overview`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityIn,
    steps,
  }) => {
    const data = CASES.consistentDisplay;
    const facility = await facilityIn('Active', { latitude: data.latitude, longitude: data.longitude });
    let onStep: Coordinates = { latitude: '', longitude: '' };

    await steps.critical('Navigate to the Facility Management module - the module loads', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.step('Open the facility\'s Contact & License step and check the location checklist - marker, labelled latitude and longitude, consistent decimals', async () => {
      const { drawer, reachedStep2 } = await openEditStep2(facilityDetailPage, facility.id);
      onStep = await drawer.readCoordinates();
      const text = await drawer.getText();
      const checklist = {
        step2: reachedStep2,
        marker: (await mapMarkerCount(page, 'drawer')) === 1,
        latitudeLabelled: text.includes(COORDINATE_LABELS.latitude),
        longitudeLabelled: text.includes(COORDINATE_LABELS.longitude),
        values: asNumbers(onStep),
        sameDecimals: decimalsOf(onStep.latitude) === decimalsOf(onStep.longitude),
      };
      await drawer.close(true).catch(() => undefined);
      expect(checklist).toEqual({ step2: true, marker: true, latitudeLabelled: true, longitudeLabelled: true, values: sameSpot({ latitude: data.latitude, longitude: data.longitude }), sameDecimals: true });
    });

    await steps.step('Open the same facility\'s Overview tab and check the same checklist - every item is satisfied and matches the Contact & License step exactly', async () => {
      await facilityDetailPage.open(facility.id);
      await facilityDetailPage.openTab('overview');
      const labels = await facilityDetailPage.readOverviewLabels();
      expect({
        map: await isMapShown(page, 'overview'),
        marker: (await mapMarkerCount(page, 'overview')) === 1,
        latitude: labels[COORDINATE_LABELS.latitude],
        longitude: labels[COORDINATE_LABELS.longitude],
      }).toEqual({ map: true, marker: true, latitude: onStep.latitude, longitude: onStep.longitude });
    });
  });

  test(`TC-${CASES.navigateAway.azureId}: should keep the captured coordinates unchanged after navigating away and back`, async ({
    facilityManagementPage,
    facilityDetailPage,
    facilityIn,
    steps,
  }) => {
    const data = CASES.navigateAway;
    const facility = await facilityIn('Active', { latitude: data.latitude, longitude: data.longitude });
    const expected = { latitude: data.latitude, longitude: data.longitude };
    const read = async (): Promise<{ step2: { latitude: number; longitude: number }; overview: { latitude: number; longitude: number } }> => {
      await facilityDetailPage.open(facility.id);
      await facilityDetailPage.openTab('overview');
      const overview = {
        latitude: coordinate(await facilityDetailPage.readOverviewField('latitude')),
        longitude: coordinate(await facilityDetailPage.readOverviewField('longitude')),
      };
      const { drawer } = await openEditStep2(facilityDetailPage, facility.id);
      const step2 = asNumbers(await drawer.readCoordinates());
      await drawer.close(true).catch(() => undefined);
      return { step2, overview };
    };

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility list', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.step('Open the facility and note the latitude/longitude on the Contact & License step and the Overview tab - both match', async () => {
      expect(await read()).toEqual({ step2: expected, overview: expected });
    });

    await steps.step('Navigate away to a different page, then return to the facility - both still show the exact same coordinates', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
      await facilityManagementPage.openDetails(facility.nameEn);
      expect(await read()).toEqual({ step2: expected, overview: expected });
    });
  });
});
