/**
 * US 15133 "Search and filter facilities by criteria" (facility folder 03), 16 cases.
 *
 * How the cases map onto the live list (2026-11-04, Facility-Foundation-Notes.md):
 *  - Advance Search (the Filters button) offers ONLY "Facility Name / Code" (one text
 *    field, the same `searchText` as the keyword box), Facility Type, Status and
 *    Provider Type. There is NO licence-number field and NO licence-expiry date range
 *    (both in the AC): 17514, 17515, 17516, 17523 and 17529 look for them by the
 *    drawer's own field ids and fail when they are missing (the findings); nothing is
 *    typed elsewhere instead.
 *  - The keyword box matches English / Arabic name, code and e-mail - NOT the licence
 *    number (17518's licence half - the finding). It searches as you type (debounced),
 *    so "enter" and "run the search" are one action whose answer is awaited.
 *  - "Search by Status" (17513) is the list's quick Status filter; 19399 is the same
 *    check through Advance Search. Statuses offered: Future (the AC's "Pending"),
 *    Active, Inactive, Expired - matched against the DISPLAYED status
 *    (effectiveStatusId).
 *  - Every "only matching facilities" check compares the answer with the register read
 *    through the API (every row) filtered by the same rule: the count must match and
 *    no listed facility may break the rule; the case's own facility must be listed.
 *  - Test data the register cannot hold as written is replaced by the case's own suite
 *    facilities: "City Clinic" / "FCL-000030" / "FAC00123" / "LIC-1001" -> the case's
 *    own facility (named "QA Automation Facility City Clinic <stamp>"), its code and
 *    licence number; "عيادة المدينة" is the case's own facility's Arabic name prefix.
 *  - DATA DEFECTS in the cases (decision items): 17512 searches "Provider Type =
 *    Hospital" and 17523 "Provider Type = Clinic"; the provider types are Both,
 *    Integration Provider and Provider Portal (AC of 15132 and the screen). 17512 uses
 *    Facility Type Hospital with Provider Type "Provider Portal" (its own hospital's);
 *    17523's "Clinic" is read as the FACILITY type (its precondition speaks of "varied
 *    type").
 */

/** A searchable shared label for a case's own facility. */
export const CITY_CLINIC = 'City Clinic';

/** The Arabic keyword of 17517 - the case's facility's Arabic name starts with it. */
export const ARABIC_KEYWORD = 'عيادة المدينة';

/** Patterns of the advanced-search field ids a range / licence field would carry. */
export const FIELD_KEY = {
  expiryRange: /expir|licen[cs]e.*date|daterange|from|to$/i,
  licenceNo: /licen[cs]e(no|number)?$|licen[cs]eno|licen[cs]enumber/i,
} as const;

/** 17529's checklist (case wording -> label pattern). */
export const PANEL_CHECKLIST: ReadonlyArray<[string, RegExp]> = [
  ['Name', /name/i],
  ['Code', /code/i],
  ['Facility Type', /facility type|^type$/i],
  ['Provider Type', /provider/i],
  ['Licence Number', /licen[cs]e (number|no)/i],
  ['Status', /status/i],
  ['Licence Expiry Date range', /expir/i],
];

/** Errors a search must not raise. */
export const ERROR_MESSAGE = /error|failed|went wrong|exception/i;

export const CASES = {
  nameOrCode: { azureId: '17510', invalidCode: 'SAL-000030' },
  byCode: { azureId: '17511' },
  typeAndProvider: {
    azureId: '17512',
    /** Step 2: Facility Type Hospital + (the case's "Hospital") Provider Portal. */
    combined: { type: 'Hospital', providerType: 'Provider Portal' },
    types: ['Hospital', 'Pharmacy', 'Clinic'],
    providers: ['Both', 'Provider Portal', 'Integration Provider'],
  },
  statusQuickFilter: { azureId: '17513', statuses: ['Future', 'Active', 'Inactive', 'Expired'] },
  expiryRange: { azureId: '17514', from: '01/01/2026', to: '31/12/2026', inRangeExpiry: '2026-06-30' },
  licenceAdvanced: { azureId: '17515' },
  rangeReversed: { azureId: '17516', from: '31/12/2026', to: '01/01/2026' },
  arabicKeyword: { azureId: '17517' },
  codeOrLicence: { azureId: '17518' },
  englishKeyword: { azureId: '17519' },
  clearFilters: { azureId: '17520', status: 'Active' },
  partialText: { azureId: '17521', partial: 'Cli', spaced: ' City Clinic ' },
  noResults: { azureId: '17522', keyword: 'NonExistentFacilityXYZ' },
  combined: { azureId: '17523', type: 'Clinic', status: 'Active', from: '01/01/2026', to: '31/12/2026', inRangeExpiry: '2026-12-15' },
  panelFields: { azureId: '17529' },
  statusAdvanced: { azureId: '19399', statuses: ['Future', 'Active', 'Inactive', 'Expired'] },
} as const;
