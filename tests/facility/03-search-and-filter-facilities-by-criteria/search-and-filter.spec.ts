import { test, expect } from '../../../fixtures';
import type { Page } from '@playwright/test';
import type { AdvancedSearchDrawer } from '../../../pages/payer/AdvancedSearchDrawer';
import type { FacilityListAnswer } from '../../../pages/facility/FacilityManagementPage';
import { FACILITY_ADVANCED_SEARCH, FACILITY_LIST } from '../../../constants/facility/facilityIds';
import {
  ARABIC_KEYWORD,
  CASES,
  CITY_CLINIC,
  ERROR_MESSAGE,
  FIELD_KEY,
  PANEL_CHECKLIST,
} from '../../../data/facility/searchAndFilterFacilitiesByCriteria.data';
import {
  arabicLettersToken,
  facilityStamp,
  facilityStatusIds,
  suiteFacilityName,
  type FacilityListItem,
  type FacilityStatusCode,
} from '../../../utils/FacilityProvisioning';
import {
  clearListFilters,
  dayValue,
  providerLabelById,
  readSearchBox,
  typeLabelById,
  wholeRegister,
} from '../../../utils/facility/writerAHelpers';

/** The status filter's labels and the codes they stand for. */
const STATUS_CODE: Record<string, FacilityStatusCode> = { Future: 'pending', Active: 'active', Inactive: 'inactive', Expired: 'expired' };

/**
 * Asserts a search answered exactly the register's facilities that keep `rule`:
 * the same count, no listed facility breaking the rule, and the case's own
 * facilities listed.
 */
async function expectOnlyMatching(page: Page, answer: FacilityListAnswer, rule: (i: FacilityListItem) => boolean, ownIds: readonly string[], what: string): Promise<void> {
  const expected = (await wholeRegister(page)).filter(rule);
  expect({
    total: answer.totalRows,
    breaking: answer.items.filter((i) => !rule(i)).map((i) => `${i.facilityCode} "${i.facilityNameEn}"`),
    ownMissing: ownIds.filter((id) => !answer.items.some((i) => i.id === id)),
  }, what).toEqual({ total: expected.length, breaking: [], ownMissing: [] });
}

/** The keys of the advanced-search fields offered that match `pattern`. */
async function fieldKeysLike(drawer: AdvancedSearchDrawer, pattern: RegExp): Promise<{ matching: string[]; all: string[] }> {
  const all = await drawer.getFieldKeys();
  return { matching: all.filter((k) => pattern.test(k)), all };
}

/** Types a From / To licence-expiry range into whatever range fields the drawer offers (one range field or two). */
async function typeRange(drawer: AdvancedSearchDrawer, keys: readonly string[], from: string, to: string): Promise<string[]> {
  if (keys.length >= 2) {
    await drawer.typeDate(keys[0], from);
    await drawer.typeDate(keys[1], to);
    return [await drawer.getValue(keys[0]), await drawer.getValue(keys[1])];
  }
  await drawer.typeDate(keys[0], `${from} - ${to}`);
  return [await drawer.getValue(keys[0])];
}

/** Whether a register row's licence expiry falls in [from, to] (DD/MM/YYYY, inclusive). */
const expiresWithin = (i: FacilityListItem, from: string, to: string): boolean =>
  dayValue(i.licenseExpiryDate) >= dayValue(from) && dayValue(i.licenseExpiryDate) <= dayValue(to);

/** Whether any searchable text of a row holds `term` (case-insensitive): names, code, licence number, e-mail. */
const holds = (i: FacilityListItem, term: string): boolean =>
  [i.facilityNameEn, i.facilityNameAr, i.facilityCode, i.licenseNo, i.email].some((v) => String(v ?? '').toLowerCase().includes(term.trim().toLowerCase()));

/**
 * User story 15133: Search and filter facilities by criteria.
 * Advance Search by name / code, type, provider type and status; the
 * licence-number and licence-expiry criteria the AC asks for; the keyword box
 * by English / Arabic name, code and licence number; partial and spaced
 * keywords; no results; clearing; combined criteria; the panel's fields. See
 * the data file for how the cases map onto the live list.
 */
test.describe('US 15133 - Search and filter facilities by criteria', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.nameOrCode.azureId}: should find a facility by its code and by its name in Advance Search and list nothing for an unknown code or name`, async ({
    facilityManagementPage: list,
    facilityIn,
    steps,
  }) => {
    const facility = await facilityIn('Active', { type: 'clinic', nameEn: suiteFacilityName(CITY_CLINIC) });
    const unknownName = `${facility.nameEn} Unknown`;

    await steps.critical('Navigate to the Facility Management module - the module loads', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.step(`Open Advanced Search and enter the facility code ${facility.code} - the facility list shows only facilities matching the entered code`, async () => {
      const answer = await list.advancedSearch({ searchText: facility.code });
      expect({ found: answer.items.map((i) => i.facilityCode), shown: await list.readColumnValues('code') }).toEqual({ found: [facility.code], shown: [facility.code] });
    });

    await steps.step(`Open Advanced Search and enter the invalid facility code ${CASES.nameOrCode.invalidCode} - the facility list shows no results for it`, async () => {
      const answer = await list.advancedSearch({ searchText: CASES.nameOrCode.invalidCode });
      expect({ total: answer.totalRows, empty: await list.getEmptyStateText() }).toEqual({ total: 0, empty: expect.stringMatching(/no results/i) });
    });

    await steps.step(`Open Advanced Search and enter the facility name "${facility.nameEn}" - the facility list shows only facilities matching the entered name`, async () => {
      const answer = await list.advancedSearch({ searchText: facility.nameEn });
      expect({ found: answer.items.map((i) => i.id), shown: await list.readNames() }).toEqual({ found: [facility.id], shown: [facility.nameEn] });
    });

    await steps.step('Open Advanced Search and enter an invalid facility name - the facility list shows no results for it', async () => {
      const answer = await list.advancedSearch({ searchText: unknownName });
      expect({ total: answer.totalRows, empty: await list.getEmptyStateText() }).toEqual({ total: 0, empty: expect.stringMatching(/no results/i) });
    });
  });

  test(`TC-${CASES.byCode.azureId}: should list only the facility matching the code entered in Advance Search`, async ({
    facilityManagementPage: list,
    facilityIn,
    steps,
  }) => {
    const facility = await facilityIn('Active');
    let drawer!: AdvancedSearchDrawer;

    await steps.critical('Navigate to the Facility Management module - the module loads', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.critical(`Open Advanced Search and enter the facility's code ${facility.code} - the search field accepts the entered value`, async () => {
      drawer = await list.openAdvancedSearch();
      await drawer.typeText(FACILITY_ADVANCED_SEARCH.field.searchText, facility.code);
      expect(await drawer.getValue(FACILITY_ADVANCED_SEARCH.field.searchText)).toBe(facility.code);
    });

    await steps.step('Run the search - the facility list shows only the facility matching the entered code', async () => {
      const answer = await list.captureList(() => drawer.submit());
      expect({ found: answer.items.map((i) => i.facilityCode), shown: await list.readColumnValues('code') }).toEqual({ found: [facility.code], shown: [facility.code] });
    });
  });

  test(`TC-${CASES.typeAndProvider.azureId}: should return only the facilities of the selected facility type and provider type, alone and together`, async ({
    facilityManagementPage: list,
    facilityIn,
    page,
    steps,
  }) => {
    const data = CASES.typeAndProvider;
    const own = {
      Hospital: await facilityIn('Active', { type: 'hospital', providerType: 'providerPortal' }),
      Clinic: await facilityIn('Active', { type: 'clinic', providerType: 'integrationProvider' }),
      Pharmacy: await facilityIn('Active', { type: 'pharmacy', providerType: 'both' }),
    };
    const ownOfProvider: Record<string, string> = { 'Provider Portal': own.Hospital.id, 'Integration Provider': own.Clinic.id, Both: own.Pharmacy.id };
    let types: Record<string, string> = {};
    let providers: Record<string, string> = {};

    await steps.critical('Navigate to the Facility Management module - the module loads', async () => {
      await list.openTable();
      types = await typeLabelById(page);
      providers = await providerLabelById(page);
      expect(Object.keys(types).length, 'the facility type lookup').toBe(3);
    });

    await steps.step(`Open Advanced Search and select Facility Type = ${data.combined.type} and Provider Type = ${data.combined.providerType} - only facilities matching both are returned`, async () => {
      const answer = await list.advancedSearch({ type: data.combined.type, providerType: data.combined.providerType });
      expect(answer.totalRows, 'facilities found').toBeGreaterThan(0);
      await expectOnlyMatching(page, answer, (i) => types[i.typeId] === data.combined.type && providers[i.providerTypeId] === data.combined.providerType, [own.Hospital.id], 'type and provider type together');
    });

    for (const type of data.types) {
      await steps.step(`Open Advanced Search and select Facility Type = ${type} - only facilities of that facility type are returned`, async () => {
        await clearListFilters(list, page);
        const answer = await list.advancedSearch({ type });
        expect(answer.totalRows, 'facilities found').toBeGreaterThan(0);
        await expectOnlyMatching(page, answer, (i) => types[i.typeId] === type, [own[type as keyof typeof own].id], `facility type ${type}`);
      });
    }

    for (const provider of data.providers) {
      await steps.step(`Open Advanced Search and select Provider Type = ${provider} - only facilities of that provider type are returned`, async () => {
        await clearListFilters(list, page);
        const answer = await list.advancedSearch({ providerType: provider });
        expect(answer.totalRows, 'facilities found').toBeGreaterThan(0);
        await expectOnlyMatching(page, answer, (i) => providers[i.providerTypeId] === provider, [ownOfProvider[provider]], `provider type ${provider}`);
      });
    }
  });

  for (const variant of [
    { data: CASES.statusQuickFilter, how: 'the list\'s Status filter', advanced: false },
    { data: CASES.statusAdvanced, how: 'Advance Search', advanced: true },
  ]) {
    test(`TC-${variant.data.azureId}: should return only the facilities of each status - Future, Active, Inactive and Expired - through ${variant.how}`, async ({
      facilityManagementPage: list,
      facilityIn,
      page,
      steps,
    }) => {
      const own: Record<string, string> = {
        Future: (await facilityIn('Future')).id,
        Active: (await facilityIn('Active')).id,
        Inactive: (await facilityIn('Inactive')).id,
        Expired: (await facilityIn('Expired')).id,
      };
      let ids: Record<string, string> = {};

      await steps.critical('Navigate to the Facility Management module - the module loads', async () => {
        await list.openTable();
        ids = await facilityStatusIds(page);
        expect(Object.keys(ids)).toEqual(expect.arrayContaining(['pending', 'active', 'inactive', 'expired']));
      });

      for (const status of variant.data.statuses) {
        await steps.step(`Search by Status = ${status} - only facilities with status ${status} are returned`, async () => {
          const answer = variant.advanced ? await list.advancedSearch({ status }) : await list.filterBy('status', status);
          expect(answer.totalRows, 'facilities found').toBeGreaterThan(0);
          await expectOnlyMatching(page, answer, (i) => i.effectiveStatusId === ids[STATUS_CODE[status]], [own[status]], `status ${status}`);
          expect((await list.readColumnValues('status')).filter((s) => s !== status), 'rows of another status on screen').toEqual([]);
        });
      }
    });
  }

  test(`TC-${CASES.expiryRange.azureId}: should return only the facilities whose licence expires within the From - To range, boundaries included`, async ({
    facilityManagementPage: list,
    facilityIn,
    page,
    steps,
  }) => {
    const data = CASES.expiryRange;
    const inRange = await facilityIn('Active', { licenseStartDate: '2026-01-01', licenseExpiryDate: data.inRangeExpiry });
    let drawer!: AdvancedSearchDrawer;
    let rangeKeys: string[] = [];

    await steps.critical('Navigate to the Facility Management module - the module loads', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.step(`Open Advanced Search and set a licence expiry From date ${data.from} and To date ${data.to} - the date range fields accept the entered values`, async () => {
      drawer = await list.openAdvancedSearch();
      const keys = await fieldKeysLike(drawer, FIELD_KEY.expiryRange);
      rangeKeys = keys.matching;
      expect(rangeKeys, `a licence expiry range in Advance Search (fields offered: ${keys.all.join(', ')})`).not.toEqual([]);
      const shown = await typeRange(drawer, rangeKeys, data.from, data.to);
      expect(shown.join(' ')).toContain(data.from);
    });

    await steps.step('Run the search - only facilities whose licence expiry date falls within the range (inclusive) are returned', async () => {
      expect(rangeKeys.length, 'a licence expiry range to search with').toBeGreaterThan(0);
      const answer = await list.captureList(() => drawer.submit());
      expect(answer.totalRows, 'facilities found').toBeGreaterThan(0);
      await expectOnlyMatching(page, answer, (i) => expiresWithin(i, data.from, data.to), [inRange.id], `licence expiry ${data.from} - ${data.to}`);
    });

    if (await drawer?.isOpen().catch(() => false)) await drawer.cancel().catch(() => undefined);
  });

  test(`TC-${CASES.licenceAdvanced.azureId}: should list only the facility matching the licence number entered in Advance Search`, async ({
    facilityManagementPage: list,
    facilityIn,
    steps,
  }) => {
    const facility = await facilityIn('Active', { licenseNo: `QA-LIC-ADV-${facilityStamp()}`.toUpperCase() });
    let drawer!: AdvancedSearchDrawer;
    let licenceKeys: string[] = [];

    await steps.critical('Navigate to the Facility Management module - the module loads', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.step(`Open Advanced Search and enter the facility's licence number ${facility.licenseNo} - the search field accepts the entered value`, async () => {
      drawer = await list.openAdvancedSearch();
      const keys = await fieldKeysLike(drawer, FIELD_KEY.licenceNo);
      licenceKeys = keys.matching;
      expect(licenceKeys, `a licence-number field in Advance Search (fields offered: ${keys.all.join(', ')})`).not.toEqual([]);
      await drawer.typeText(licenceKeys[0], facility.licenseNo);
      expect(await drawer.getValue(licenceKeys[0])).toBe(facility.licenseNo);
    });

    await steps.step('Run the search - the facility list shows only the facility matching the entered licence number', async () => {
      expect(licenceKeys.length, 'a licence-number field to search with').toBeGreaterThan(0);
      const answer = await list.captureList(() => drawer.submit());
      expect(answer.items.map((i) => i.licenseNo)).toEqual([facility.licenseNo]);
    });

    if (await drawer?.isOpen().catch(() => false)) await drawer.cancel().catch(() => undefined);
  });

  test(`TC-${CASES.rangeReversed.azureId}: should reject an expiry date range entered the wrong way round with a clear message and run no search`, async ({
    facilityManagementPage: list,
    steps,
  }) => {
    const data = CASES.rangeReversed;
    let drawer!: AdvancedSearchDrawer;
    let rangeKeys: string[] = [];

    await steps.critical('Navigate to the Facility Management module - the module loads', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.step(`Open Advanced Search and set the expiry From date ${data.from} later than the To date ${data.to} - the date fields show the entered values`, async () => {
      drawer = await list.openAdvancedSearch();
      const keys = await fieldKeysLike(drawer, FIELD_KEY.expiryRange);
      rangeKeys = keys.matching;
      expect(rangeKeys, `a licence expiry range in Advance Search (fields offered: ${keys.all.join(', ')})`).not.toEqual([]);
      const shown = await typeRange(drawer, rangeKeys, data.from, data.to);
      expect(shown.join(' ')).toContain(data.from);
    });

    await steps.step('Run the search - a validation message indicates the date range is invalid and no search is executed', async () => {
      expect(rangeKeys.length, 'a licence expiry range to reverse').toBeGreaterThan(0);
      const sent = await list.captureListRequest(() => drawer.submit().catch(() => undefined));
      expect({ messages: (await drawer.getMessages()).join(' | '), searched: Object.keys(sent).length > 0 })
        .toEqual({ messages: expect.stringMatching(/range|from|to|date/i), searched: false });
    });

    if (await drawer?.isOpen().catch(() => false)) await drawer.cancel().catch(() => undefined);
  });

  test(`TC-${CASES.arabicKeyword.azureId}: should find a facility by its Arabic name in the keyword search`, async ({
    facilityManagementPage: list,
    facilityIn,
    page,
    steps,
  }) => {
    const facility = await facilityIn('Active', { nameAr: `${ARABIC_KEYWORD} ${arabicLettersToken()}` });
    let answer!: FacilityListAnswer;

    await steps.critical('Navigate to the Facility Management module - the module loads', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.step(`Enter "${ARABIC_KEYWORD}" into the keyword search box - the keyword field accepts the entered text`, async () => {
      answer = await list.searchFor(ARABIC_KEYWORD);
      expect(await readSearchBox(page)).toBe(ARABIC_KEYWORD);
    });

    await steps.step('Run the search - the facility list shows the facility matching the Arabic name', async () => {
      expect({ own: answer.items.some((i) => i.id === facility.id), others: answer.items.filter((i) => !holds(i, ARABIC_KEYWORD)).map((i) => i.facilityCode) }, `"${facility.nameAr}"`)
        .toEqual({ own: true, others: [] });
      expect(await list.readNames()).toContain(facility.nameEn);
    });
  });

  test(`TC-${CASES.codeOrLicence.azureId}: should find the same facility by its code and by its licence number in the keyword search`, async ({
    facilityManagementPage: list,
    facilityIn,
    steps,
  }) => {
    const facility = await facilityIn('Active', { licenseNo: `QA-LIC-KW-${facilityStamp()}`.toUpperCase() });

    await steps.critical('Navigate to the Facility Management module - the module loads', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.step(`Enter the facility's code ${facility.code} into the keyword search box and run the search - the facility matching the code is returned`, async () => {
      const answer = await list.searchFor(facility.code);
      expect(answer.items.map((i) => i.id)).toEqual([facility.id]);
    });

    await steps.step(`Clear the search, enter the facility's licence number ${facility.licenseNo} and run the search again - the same facility is returned, matched by licence number`, async () => {
      await list.search('');
      const answer = await list.searchFor(facility.licenseNo);
      expect(answer.items.map((i) => i.id), `the keyword "${facility.licenseNo}"`).toEqual([facility.id]);
    });
  });

  test(`TC-${CASES.englishKeyword.azureId}: should find a facility by its English name in the keyword search`, async ({
    facilityManagementPage: list,
    facilityIn,
    page,
    steps,
  }) => {
    const facility = await facilityIn('Active', { type: 'clinic', nameEn: suiteFacilityName(CITY_CLINIC) });
    let answer!: FacilityListAnswer;

    await steps.critical('Navigate to the Facility Management module - the module loads', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.step(`Enter "${CITY_CLINIC}" into the keyword search box - the keyword field accepts the entered text`, async () => {
      answer = await list.searchFor(CITY_CLINIC);
      expect(await readSearchBox(page)).toBe(CITY_CLINIC);
    });

    await steps.step('Run the search - the facility list shows the facility matching the English name', async () => {
      expect({ own: answer.items.some((i) => i.id === facility.id), others: answer.items.filter((i) => !holds(i, CITY_CLINIC)).map((i) => i.facilityCode) })
        .toEqual({ own: true, others: [] });
      expect(await list.readNames()).toContain(facility.nameEn);
    });
  });

  test(`TC-${CASES.clearFilters.azureId}: should clear every filter and return the list to its unfiltered state when Clear is selected`, async ({
    facilityManagementPage: list,
    page,
    steps,
  }) => {
    let fullTotal = -1;
    let filteredTotal = -1;

    await steps.critical('Navigate to the Facility Management module - the module loads', async () => {
      await list.openTable();
      fullTotal = (await list.fetchRegister({}, 1)).totalRows;
      expect(fullTotal).toBeGreaterThan(0);
    });

    await steps.critical(`Apply a search filter (Status = ${CASES.clearFilters.status}) and confirm the list is narrowed - filtered results are shown`, async () => {
      const answer = await list.filterBy('status', CASES.clearFilters.status);
      filteredTotal = answer.totalRows;
      expect({ narrowed: filteredTotal < fullTotal, chips: (await list.getChips()).length > 0 }, `${filteredTotal} of ${fullTotal}`).toEqual({ narrowed: true, chips: true });
    });

    let cleared: FacilityListAnswer | null = null;
    await steps.step('Select the Clear / Reset Filters option - all filter fields are cleared', async () => {
      cleared = await clearListFilters(list, page);
      expect(cleared, 'a Clear control while a filter is applied').not.toBeNull();
      expect({ status: await list.readFilter('status'), type: await list.readFilter('type'), chips: await list.getChips(), box: await readSearchBox(page) })
        .toEqual({ status: expect.stringMatching(/all statuses/i), type: expect.stringMatching(/all types/i), chips: [], box: '' });
    });

    await steps.step('Observe the facility list - the full, unfiltered list of facilities is displayed again', async () => {
      expect((cleared as FacilityListAnswer | null)?.totalRows, 'the list after Clear').toBe(fullTotal);
    });
  });

  test(`TC-${CASES.partialText.azureId}: should return matches for partial text and for a keyword with extra spaces without errors`, async ({
    facilityManagementPage: list,
    facilityIn,
    page,
    steps,
  }) => {
    const data = CASES.partialText;
    const facility = await facilityIn('Active', { type: 'clinic', nameEn: suiteFacilityName(CITY_CLINIC) });
    let answer!: FacilityListAnswer;

    await steps.critical('Navigate to the Facility Management module - the module loads', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.step(`Enter the partial keyword "${data.partial}" into the keyword search box - the field accepts the partial text`, async () => {
      answer = await list.searchFor(data.partial);
      expect(await readSearchBox(page)).toBe(data.partial);
    });

    await steps.step('Run the search - facilities whose name, code or licence number contain the partial text are returned', async () => {
      expect({ own: answer.items.some((i) => i.id === facility.id), notHolding: answer.items.filter((i) => !holds(i, data.partial)).map((i) => i.facilityCode) })
        .toEqual({ own: true, notHolding: [] });
    });

    await steps.step(`Repeat with extra whitespace ("${data.spaced}") - the search still returns the expected facility without errors`, async () => {
      const spaced = await list.captureList(() => list.search(data.spaced));
      const errors = (await list.waitForVisibleMessages()).filter((m) => ERROR_MESSAGE.test(m));
      expect({ own: spaced.items.some((i) => i.id === facility.id), errors }, `${spaced.totalRows} found`).toEqual({ own: true, errors: [] });
    });
  });

  test(`TC-${CASES.noResults.azureId}: should show a clear no-results message and no rows when no facility matches`, async ({
    facilityManagementPage: list,
    page,
    steps,
  }) => {
    const keyword = CASES.noResults.keyword;
    let answer!: FacilityListAnswer;

    await steps.critical('Navigate to the Facility Management module - the module loads', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.step(`Enter the keyword "${keyword}" that matches no existing facility - the search is submitted`, async () => {
      answer = await list.searchFor(keyword);
      expect({ box: await readSearchBox(page), answered: answer.totalRows >= 0 }).toEqual({ box: keyword, answered: true });
    });

    await steps.step('Review the facility list - a clear no-results message is displayed and no facility rows are shown', async () => {
      expect({ total: answer.totalRows, rows: await list.getRowCount(), message: await list.getEmptyStateText() })
        .toEqual({ total: 0, rows: 0, message: expect.stringMatching(/no results/i) });
    });
  });

  test(`TC-${CASES.combined.azureId}: should return only the facilities that satisfy type, status and licence expiry range together`, async ({
    facilityManagementPage: list,
    facilityIn,
    page,
    steps,
  }) => {
    const data = CASES.combined;
    const inside = await facilityIn('Active', { type: 'clinic', licenseExpiryDate: data.inRangeExpiry });
    const outside = await facilityIn('Active', { type: 'clinic', expiryInDays: 365 });
    let drawer!: AdvancedSearchDrawer;
    let types: Record<string, string> = {};
    let ids: Record<string, string> = {};

    await steps.critical('Navigate to the Facility Management module - the module loads', async () => {
      await list.openTable();
      types = await typeLabelById(page);
      ids = await facilityStatusIds(page);
      expect(Object.keys(types).length).toBe(3);
    });

    await steps.step(`Open Advanced Search and set Type = ${data.type}, Status = ${data.status} and a licence expiry range ${data.from} - ${data.to} together - all filter selections are retained`, async () => {
      drawer = await list.openAdvancedSearch();
      await drawer.choose(FACILITY_ADVANCED_SEARCH.field.type, data.type);
      await drawer.choose(FACILITY_ADVANCED_SEARCH.field.status, data.status);
      const keys = await fieldKeysLike(drawer, FIELD_KEY.expiryRange);
      if (keys.matching.length > 0) await typeRange(drawer, keys.matching, data.from, data.to);
      expect({
        type: await drawer.getValue(FACILITY_ADVANCED_SEARCH.field.type),
        status: await drawer.getValue(FACILITY_ADVANCED_SEARCH.field.status),
        expiryRange: keys.matching.length > 0,
      }, `fields offered: ${keys.all.join(', ')}`).toEqual({ type: expect.stringContaining(data.type), status: expect.stringContaining(data.status), expiryRange: true });
    });

    await steps.step('Run the search - only facilities satisfying all selected filter conditions simultaneously are returned', async () => {
      const answer = await list.captureList(() => drawer.submit());
      expect(answer.totalRows, 'facilities found').toBeGreaterThan(0);
      await expectOnlyMatching(page, answer,
        (i) => types[i.typeId] === data.type && i.effectiveStatusId === ids[STATUS_CODE[data.status]] && expiresWithin(i, data.from, data.to),
        [inside.id], `type ${data.type} + status ${data.status} + expiry ${data.from} - ${data.to} ("${outside.nameEn}" expires ${outside.licenseExpiryDate})`);
    });
  });

  test(`TC-${CASES.panelFields.azureId}: should offer Name, Code, Facility Type, Provider Type, Licence Number, Status, Licence Expiry range and a keyword box`, async ({
    facilityManagementPage: list,
    page,
    steps,
  }) => {
    let drawer!: AdvancedSearchDrawer;

    await steps.critical('Navigate to the Facility Management module - the module loads', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.critical('Open the Advanced Search panel - the panel is displayed', async () => {
      drawer = await list.openAdvancedSearch();
      expect(await drawer.getTitle()).toMatch(/advance/i);
    });

    await steps.step('Check the panel against the required checklist - every required search and filter field is present and usable', async () => {
      const labels = await drawer.getFieldLabels();
      await drawer.cancel().catch(() => undefined);
      const keywordBox = await page.locator(`#${FACILITY_LIST.searchInput}`).isVisible().catch(() => false);
      const missing = PANEL_CHECKLIST.filter(([, pattern]) => !labels.some((l) => pattern.test(l))).map(([name]) => name);
      if (!keywordBox) missing.push('Keyword search box');
      expect(missing, `labels offered: ${labels.join(', ')}`).toEqual([]);
    });
  });
});

