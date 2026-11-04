import { test, expect } from '../../../fixtures';
import type { FacilityDetailPage } from '../../../pages/facility/FacilityDetailPage';
import type { FacilityManagementPage } from '../../../pages/facility/FacilityManagementPage';
import { env } from '../../../constants/EnvironmentConfig';
import { CASES, STATUS } from '../../../data/facility/licenseDateWithActivationStatus.data';
import {
  facilityDayText,
  facilityStamp,
  findFacilityByName,
  readFacility,
  readFacilityDashboard,
  riyadhDay,
  setLicenceDates,
  suiteFacilityArabicName,
  suiteFacilityEmail,
  suiteFacilityName,
  type ProvisionedFacility,
} from '../../../utils/FacilityProvisioning';
import { asIsoDay, claimFacilitySeed, facilityStatusLabelOf, noSeedReason } from '../../../utils/facility/writerBHelpers';

/** "Turn activation on / off and save": the Edit drawer's Is Active checkbox, then Save. */
async function setActivationAndSave(detail: FacilityDetailPage, id: string, on: boolean): Promise<void> {
  await detail.open(id);
  const drawer = await detail.openEditDrawer();
  await drawer.setActive(on);
  expect(await drawer.isActiveTicked()).toBe(on);
  await drawer.save();
}

/** The Overview's status after opening the facility afresh. */
async function overviewStatus(detail: FacilityDetailPage, id: string): Promise<string> {
  await detail.open(id);
  return detail.getStatus();
}

/** The Overview's licence dates as `YYYY-MM-DD`. */
async function overviewLicence(detail: FacilityDetailPage, id: string): Promise<{ start: string; expiry: string }> {
  await detail.open(id);
  await detail.openTab('overview');
  return { start: asIsoDay(await detail.readOverviewField('licenseStart')), expiry: asIsoDay(await detail.readOverviewField('licenseExpiry')) };
}

/** The list row's status. */
async function listStatus(list: FacilityManagementPage, name: string): Promise<string> {
  await list.openTable();
  return (await list.readRow(name)).status;
}

/**
 * User story 15139: License Date with activation status. The administrator
 * plays the Compliance Officer; every facility is the suite's own. The cases
 * where a date must ARRIVE claim the seeds of `npm run seed:facility` (see the
 * data file); 17559 lives in license-date-activation-permission.spec.ts.
 */
test.describe('US 15139 - License Date with activation status', () => {
  test.describe.configure({ timeout: 8 * 60_000 });

  test(`TC-${CASES.activateInsideLicence.azureId}: should become Active only when activation is turned on inside a valid licence period`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityIn,
    steps,
  }) => {
    const facility = await facilityIn('Inactive');

    await steps.critical('Navigate to the Facility Management module - the module loads with the facility list', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open the facility and confirm the licence start date has passed and the expiry date is in the future - valid, non-expired dates', async () => {
      const { start, expiry } = await overviewLicence(facilityDetailPage, facility.id);
      const today = riyadhDay(0);
      expect({ startPassed: start < today, expiryAhead: expiry > today, status: await facilityDetailPage.getStatus() })
        .toEqual({ startPassed: true, expiryAhead: true, status: STATUS.inactive });
    });

    await steps.critical('Turn facility activation on and save - the save is confirmed', async () => {
      await setActivationAndSave(facilityDetailPage, facility.id, true);
      expect((await readFacility(page, facility.id)).isActive).toBe(true);
    });

    await steps.step('Check the facility status - it changes to Active', async () => {
      expect({ overview: await overviewStatus(facilityDetailPage, facility.id), list: await listStatus(facilityManagementPage, facility.nameEn) })
        .toEqual({ overview: STATUS.active, list: STATUS.active });
    });
  });

  test(`TC-${CASES.startArrivesNotActivated.azureId}: should stay Inactive when the licence start date arrives without activation`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    discardFacilityId,
    steps,
  }) => {
    await page.goto(env.baseUrl);
    const today = riyadhDay(0);
    const claimed = await claimFacilitySeed(page, 'StartArrives', (s) => s.createdDay < s.start && s.start <= today && !s.record.isActive);
    if (!claimed) steps.blocked(noSeedReason('whose licence start date has arrived since it was made, not activated (StartArrives)'));
    const { seed, facility } = claimed!;
    discardFacilityId(facility.id);

    await steps.critical('Navigate to the Facility Management module - the module loads with the facility list', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open an Inactive facility whose licence start date is today - the details show the start date reached and activation OFF', async () => {
      const { start } = await overviewLicence(facilityDetailPage, facility.id);
      expect({ start: start <= today, activation: (await readFacility(page, facility.id)).isActive }).toEqual({ start: true, activation: false });
    });

    await steps.step('Allow the licence start date to pass without changing activation - the date has passed with no manual action', async () => {
      const record = await readFacility(page, facility.id);
      expect({ madeBeforeItsStart: seed.createdDay < seed.start, startArrived: String(record.licenseStartDate).slice(0, 10) <= today, activation: record.isActive })
        .toEqual({ madeBeforeItsStart: true, startArrived: true, activation: false });
    });

    await steps.step('Check the facility status - it remains Inactive', async () => {
      expect({ overview: await overviewStatus(facilityDetailPage, facility.id), list: await listStatus(facilityManagementPage, facility.nameEn) })
        .toEqual({ overview: STATUS.inactive, list: STATUS.inactive });
    });
  });

  test(`TC-${CASES.extendExpired.azureId}: should become Active when an expired licence's expiry date is extended`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityIn,
    steps,
  }) => {
    const facility = await facilityIn('Expired');
    const newExpiry = CASES.extendExpired.newExpiry > riyadhDay(0) ? CASES.extendExpired.newExpiry : riyadhDay(365);

    await steps.critical('Navigate to the Facility Management module - the module loads with the facility list', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open a facility that is expired due to an expired licence - its status shows Expired', async () => {
      expect(await overviewStatus(facilityDetailPage, facility.id)).toBe(STATUS.expired);
    });

    await steps.critical(`Extend the licence expiry date to a future date (${newExpiry}) and save - the save is confirmed and the new expiry recorded`, async () => {
      const drawer = await facilityDetailPage.openEditDrawer();
      expect(await drawer.next()).toBe(true);
      await drawer.type('licenseExpiry', facilityDayText(newExpiry));
      await drawer.save();
      expect(String((await readFacility(page, facility.id)).licenseExpiryDate).slice(0, 10)).toBe(newExpiry);
    });

    await steps.step('Check the facility status immediately after saving - it shows Active', async () => {
      expect(await overviewStatus(facilityDetailPage, facility.id)).toBe(STATUS.active);
    });
  });

  test(`TC-${CASES.activeOnExpiryDay.azureId}: should be Active on its licence expiry date and Expired once that day has ended`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityIn,
    discardFacilityId,
    steps,
  }) => {
    await page.goto(env.baseUrl);
    const today = riyadhDay(0);
    const ended = await claimFacilitySeed(page, ['ExpiryPasses', 'ExpiryArrives'], (s) => s.expiry < today && s.createdDay <= s.expiry && s.record.isActive);
    if (!ended) steps.blocked(noSeedReason('that was Active and whose licence expiry day has ended since it was made (ExpiryPasses)'));
    discardFacilityId(ended!.facility.id);
    const onDay = await claimFacilitySeed(page, 'ExpiryArrives', (s) => s.expiry === today && s.createdDay < today && s.record.isActive);
    if (onDay) discardFacilityId(onDay.facility.id);
    const subject: ProvisionedFacility = onDay?.facility ?? await facilityIn('ExpiresToday');

    await steps.critical('Navigate to the Facility Management module - the module loads with the facility list', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(subject.nameEn)).toBe(true);
    });

    await steps.critical('Open an Active facility with License Expiry Date = today - the status shows Active and the expiry date is today', async () => {
      const { expiry } = await overviewLicence(facilityDetailPage, subject.id);
      expect({ expiry, status: await facilityDetailPage.getStatus() }).toEqual({ expiry: today, status: STATUS.active });
    });

    await steps.step('Check the status on the exact expiry date - Active, and Expired once the end of the expiry day has passed', async () => {
      const onExpiryDay = await overviewStatus(facilityDetailPage, subject.id);
      const afterTheDay = await overviewStatus(facilityDetailPage, ended!.facility.id);
      expect({ onExpiryDay, afterTheDay, endedSeedExpiry: ended!.seed.expiry < today })
        .toEqual({ onExpiryDay: STATUS.active, afterTheDay: STATUS.expired, endedSeedExpiry: true });
    });
  });

  test(`TC-${CASES.noActivationBeforeStart.azureId}: should stay Future when activated before the licence start date`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityIn,
    steps,
  }) => {
    const facility = await facilityIn('FutureInactive', { startInDays: CASES.noActivationBeforeStart.startInDays });

    await steps.critical('Navigate to the Facility Management module - the module loads with the facility list', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open a facility whose licence start date is in the future - the details show a future start date', async () => {
      expect((await overviewLicence(facilityDetailPage, facility.id)).start > riyadhDay(0)).toBe(true);
    });

    await steps.critical('Turn activation on and save - the save is attempted', async () => {
      await setActivationAndSave(facilityDetailPage, facility.id, true);
      expect((await readFacility(page, facility.id)).isActive).toBe(true);
    });

    await steps.step('Check the facility status - it remains Future although activation is on', async () => {
      expect(await overviewStatus(facilityDetailPage, facility.id)).toBe(STATUS.future);
    });
  });

  test(`TC-${CASES.startDayNotAutoActivated.azureId}: should not auto-activate on its licence start date, but activate when turned on`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    discardFacilityId,
    steps,
  }) => {
    await page.goto(env.baseUrl);
    const today = riyadhDay(0);
    const claimed = await claimFacilitySeed(page, 'StartArrives', (s) => s.start === today && s.createdDay < today && !s.record.isActive);
    if (!claimed) steps.blocked(noSeedReason('whose licence start date is TODAY, made on an earlier day and not activated (StartArrives, made yesterday)'));
    const facility = claimed!.facility;
    discardFacilityId(facility.id);

    await steps.critical('Navigate to the Facility Management module - the module loads with the facility list', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open a facility with License Start Date = today and activation OFF - the details display today as the start date', async () => {
      const { start } = await overviewLicence(facilityDetailPage, facility.id);
      expect({ start, activation: (await readFacility(page, facility.id)).isActive }).toEqual({ start: today, activation: false });
    });

    await steps.step('Check the facility status on the exact start date - it remains inactive', async () => {
      expect(await overviewStatus(facilityDetailPage, facility.id)).toBe(STATUS.inactive);
    });

    await steps.step('Turn activation on and save - the status changes to Active', async () => {
      await setActivationAndSave(facilityDetailPage, facility.id, true);
      expect(await overviewStatus(facilityDetailPage, facility.id)).toBe(STATUS.active);
    });
  });

  test(`TC-${CASES.decisionTable.azureId}: should give the right status for every licence and activation combination`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityIn,
    steps,
  }) => {
    const a = await facilityIn('FutureInactive');
    const bOff = await facilityIn('FutureInactive');
    const bOn = await facilityIn('Future');
    const c = await facilityIn('Active');
    const dOff = await facilityIn('ExpiredInactive');
    const dOn = await facilityIn('Expired');
    const e = await facilityIn('Expired');
    const extended = await setLicenceDates(page, e.id, { expiryInDays: 365 });
    if (extended.status >= 300) steps.blocked(`facility E's expiry extension was refused: ${extended.status} ${extended.text.slice(0, 200)}`);

    await steps.critical('Navigate to the Facility Management module - the module loads with the facility list', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(a.nameEn)).toBe(true);
    });

    await steps.step('Open facility A: start date not reached, activation OFF - status is Inactive', async () => {
      expect(await overviewStatus(facilityDetailPage, a.id)).toBe(STATUS.inactive);
    });

    await steps.step('Open facility B: start date not reached, expiry not reached, activation OFF - status is Inactive', async () => {
      expect(await overviewStatus(facilityDetailPage, bOff.id)).toBe(STATUS.inactive);
    });

    await steps.step('Open facility B: start date not reached, expiry not reached, activation ON - status is Future', async () => {
      expect(await overviewStatus(facilityDetailPage, bOn.id)).toBe(STATUS.future);
    });

    await steps.step('Open facility C: start date reached, expiry not reached, activation ON - status is Active', async () => {
      expect(await overviewStatus(facilityDetailPage, c.id)).toBe(STATUS.active);
    });

    await steps.step('Open facility D: expiry date passed, activation OFF - status is Expired', async () => {
      expect(await overviewStatus(facilityDetailPage, dOff.id)).toBe(STATUS.expired);
    });

    await steps.step('Open facility D: expiry date passed, activation ON - status is Expired', async () => {
      expect(await overviewStatus(facilityDetailPage, dOn.id)).toBe(STATUS.expired);
    });

    await steps.step('Open facility E: expiry date passed then extended, activation still ON - status is Active', async () => {
      expect({ activation: (await readFacility(page, e.id)).isActive, status: await overviewStatus(facilityDetailPage, e.id) })
        .toEqual({ activation: true, status: STATUS.active });
    });
  });

  test(`TC-${CASES.expiryBeforeStart.azureId}: should refuse to save a licence expiry date earlier than the start date`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityIn,
    steps,
  }) => {
    const data = CASES.expiryBeforeStart;
    const facility = await facilityIn('Active');
    const before = await readFacility(page, facility.id);
    let drawer!: Awaited<ReturnType<FacilityDetailPage['openEditDrawer']>>;

    await steps.critical('Navigate to the Facility Management module - the module loads with the facility list', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open a facility and enter a licence expiry date earlier than the start date - the form displays the entered dates', async () => {
      await facilityDetailPage.open(facility.id);
      drawer = await facilityDetailPage.openEditDrawer();
      expect(await drawer.next()).toBe(true);
      await drawer.type('licenseStart', data.start);
      await drawer.type('licenseExpiry', data.expiry);
      expect({ start: await drawer.getValue('licenseStart'), expiry: await drawer.getValue('licenseExpiry') }).toEqual({ start: data.start, expiry: data.expiry });
    });

    await steps.step('Attempt to save - a validation error is displayed and the save is blocked', async () => {
      const answer = await drawer.attemptSave();
      const after = await readFacility(page, facility.id);
      expect({
        sent: answer.status === -1 ? 'blocked' : `sent (${answer.status})`,
        message: answer.messages.includes(data.message),
        dates: [String(after.licenseStartDate).slice(0, 10), String(after.licenseExpiryDate).slice(0, 10)],
      }, answer.messages.join(' | ')).toEqual({
        sent: 'blocked',
        message: true,
        dates: [String(before.licenseStartDate).slice(0, 10), String(before.licenseExpiryDate).slice(0, 10)],
      });
    });

    if (await drawer?.isOpen().catch(() => false)) await drawer.close(true).catch(() => undefined);
  });

  test(`TC-${CASES.oneDayLicence.azureId}: should handle a one-day licence (start = expiry) predictably`, async ({
    page,
    facilityManagementPage,
    discardFacilityNamed,
    steps,
  }) => {
    const nameEn = suiteFacilityName(CASES.oneDayLicence.label);
    discardFacilityNamed(nameEn);
    const day = facilityDayText(riyadhDay(0));
    let drawer!: Awaited<ReturnType<FacilityManagementPage['openAddForm']>>;

    await steps.critical('Navigate to the Facility Management module - the module loads with the facility list', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical('Create a facility and set the licence start date equal to the expiry date - the form accepts or flags the identical dates', async () => {
      drawer = await facilityManagementPage.openAddForm();
      await drawer.fillBasic({ nameEn, nameAr: suiteFacilityArabicName(), type: 'Pharmacy', providerType: 'Both' });
      expect(await drawer.next()).toBe(true);
      const stamp = facilityStamp();
      await drawer.fillContact({ email: suiteFacilityEmail(stamp), licenseNo: `QA-ONE-${stamp}`.toUpperCase(), licenseStart: day, licenseExpiry: day });
      expect({ start: await drawer.getValue('licenseStart'), expiry: await drawer.getValue('licenseExpiry') }).toEqual({ start: day, expiry: day });
    });

    await steps.step('Save and check the status - either a clear rejection message, or the licence is valid for its single day (Active)', async () => {
      const answer = await drawer.attemptSave();
      const saved = answer.status >= 200 && answer.status < 300;
      const created = saved ? await findFacilityByName(page, nameEn) : null;
      const status = created ? await facilityStatusLabelOf(page, created.id) : '';
      const predictable = saved ? status === STATUS.active : answer.messages.length > 0;
      expect(predictable, `saved: ${saved} (${answer.status}), status "${status}", messages: ${answer.messages.join(' | ')}`).toBe(true);
    });

    if (await drawer?.isOpen().catch(() => false)) await drawer.close(true).catch(() => undefined);
  });

  test(`TC-${CASES.deactivateValidLicence.azureId}: should leave Active when activation is turned off even with a valid licence`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityIn,
    steps,
  }) => {
    const facility = await facilityIn('Active');

    await steps.critical('Navigate to the Facility Management module - the module loads with the facility list', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open a currently Active facility - status Active, activation ON', async () => {
      expect({ status: await overviewStatus(facilityDetailPage, facility.id), activation: (await readFacility(page, facility.id)).isActive })
        .toEqual({ status: STATUS.active, activation: true });
    });

    await steps.critical('Turn activation off and save - the save is confirmed', async () => {
      await setActivationAndSave(facilityDetailPage, facility.id, false);
      expect((await readFacility(page, facility.id)).isActive).toBe(false);
    });

    await steps.step('Check the facility status - it changes away from Active although the licence is still valid', async () => {
      const status = await overviewStatus(facilityDetailPage, facility.id);
      expect({ status, notActive: status !== STATUS.active }).toEqual({ status: STATUS.inactive, notActive: true });
    });
  });

  test(`TC-${CASES.listDetailConsistent.azureId}: should show the same status in the list and the detail after each licence or activation change`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityIn,
    steps,
  }) => {
    const data = CASES.listDetailConsistent;
    const facility = await facilityIn('ExpiredInactive');
    const extended = await setLicenceDates(page, facility.id, { expiryInDays: 30 });
    if (extended.status >= 300) steps.blocked(`the precondition extension (an expired licence extended, not yet activated) was refused: ${extended.status} ${extended.text.slice(0, 200)}`);
    const newExpiry = riyadhDay(data.extendInDays);
    let detailStatus = '';

    await steps.critical('Navigate to the Facility Management module - the list shows a status column', async () => {
      await facilityManagementPage.openTable();
      expect({ statusColumn: (await facilityManagementPage.getHeaderTexts()).includes('Status'), listed: await facilityManagementPage.isListed(facility.nameEn) })
        .toEqual({ statusColumn: true, listed: true });
    });

    await steps.step('Note the facility\'s status in the list view - the Status column shows Pending', async () => {
      expect((await facilityManagementPage.readRow(facility.nameEn)).status).toBe(data.pendingLabel);
    });

    await steps.critical('Open the facility, extend the expiry date, turn activation on and save - the save is confirmed and the detail shows Active', async () => {
      await facilityDetailPage.open(facility.id);
      const drawer = await facilityDetailPage.openEditDrawer();
      await drawer.setActive(true);
      expect(await drawer.next()).toBe(true);
      await drawer.type('licenseExpiry', facilityDayText(newExpiry));
      await drawer.save();
      detailStatus = await overviewStatus(facilityDetailPage, facility.id);
      expect(detailStatus).toBe(STATUS.active);
    });

    await steps.step('Return to the facility list view - the list refreshes', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.step('Check the status column for the same facility - the list shows Active, matching the detail page', async () => {
      expect({ list: (await facilityManagementPage.readRow(facility.nameEn)).status, detail: detailStatus }).toEqual({ list: STATUS.active, detail: STATUS.active });
    });
  });

  test(`TC-${CASES.statusEverywhere.azureId}: should reflect a status change everywhere the facility status is shown`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityIn,
    steps,
  }) => {
    const facility = await facilityIn('Future');
    const before = await readFacilityDashboard(page);

    await steps.critical('Navigate to the Facility Management module - the module loads with the facility list', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Change the facility\'s status by updating its licence start date to today and save - the Overview records the new status', async () => {
      await facilityDetailPage.open(facility.id);
      expect(await facilityDetailPage.getStatus()).toBe(STATUS.future);
      const drawer = await facilityDetailPage.openEditDrawer();
      expect(await drawer.next()).toBe(true);
      await drawer.type('licenseStart', facilityDayText(riyadhDay(0)));
      await drawer.save();
      expect(await overviewStatus(facilityDetailPage, facility.id)).toBe(STATUS.active);
    });

    await steps.step('Check the other screens that show the status (list, cards, dashboard tiles) - all reflect the new status without mismatch', async () => {
      const list = await listStatus(facilityManagementPage, facility.nameEn);
      await facilityManagementPage.switchToCards();
      const shown = await facilityManagementPage.loadCardsUntilShown(facility.nameEn);
      const card = shown ? (await facilityManagementPage.readCard(facility.nameEn)).status : '(no card)';
      await facilityManagementPage.switchToTable();
      const after = await readFacilityDashboard(page);
      expect({ list, card, activeTile: after.active - before.active, futureTile: after.pending - before.pending })
        .toEqual({ list: STATUS.active, card: STATUS.active, activeTile: 1, futureTile: -1 });
    });
  });
});
