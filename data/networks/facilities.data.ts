import { toDisplayDate } from './network.data';

/**
 * Facility data shared by the facility-assignment stories (14, 15, 16, 27, 28,
 * 29 - US 14131, 14132, 14133, 14304, 14306, 14307).
 *
 * The cases use THREE active pharmacies: FCL-000030 "Facility Al - Tawnyah" (Nathealth, FCL-000009, until it went Inactive on 2026-10-27) and the
 * automation pharmacies FCL-000025 / FCL-000026 (FCL-000027 is a spare).
 * Every case's network is its own (fixture `networkIn`) and is given
 * facilities by code, so a case always knows which facility is which. The
 * sheets' PHM-01 / Riverside Pharmacy / Sunrise Pharmacy names do not exist
 * here; their ROLE in each case is played by these three.
 *
 * CHANGED 2026-10-24. The suite used FCL-000007 "QA Expiry Test" and
 * FCL-000008 until their licences lapsed (FCL-000007 on 2026-10-22; FCL-000008
 * left the directory). From then on the pool held one pharmacy, and 87 cases
 * of the 2026-10-24 full run reported BLOCKED or failed on it. The
 * "QA Automation Pharmacy A/B/C" records were added in Facility Management
 * that day with licences to 31/12/2029 - check those dates before relying on
 * them after that.
 *
 * Facilities are never created or deactivated by these cases: every network
 * and payer suite shares them.
 */
export const FACILITY = {
  // Ids as GetAssignableFacilities answered them (traffic, 2026-10-21) - for
  // the direct-request cases, which address a facility the pool may no
  // longer offer.
  pharmacyA: { code: 'FCL-000025', name: 'QA Automation Pharmacy A', id: '1ccb483e-f36b-1410-8e0a-00abe6b0babb' },
  pharmacyB: { code: 'FCL-000026', name: 'QA Automation Pharmacy B', id: '24cb483e-f36b-1410-8e0a-00abe6b0babb' },
  // FCL-000009 "Nathealth" was inactivated on or before 2026-10-27; its place is taken by
  // FCL-000030, an Active pharmacy (FCL-000027, the suite's spare, was inactivated too).
  pharmacyC: { code: 'FCL-000030', name: 'Facility Al - Tawnyah', id: '50a9493e-f36b-1410-8e0a-00abe6b0babb' },
} as const;

/** The three codes the cases use. */
export const ALL_FACILITY_CODES = [FACILITY.pharmacyC.code, FACILITY.pharmacyB.code, FACILITY.pharmacyA.code] as const;

/** The Assignment cell of a settled (live) assignment. */
export const SETTLED = '—';

/** The in-progress Assignment labels, as the badge renders them. */
export const ASSIGNMENT_STATE = {
  draftAssignment: 'Draft Assignment',
  pendingAssignment: 'Pending Assignment',
  draftRemoval: 'Draft Removal',
  pendingRemoval: 'Pending Removal',
} as const;

/** A facility's own status for a usable facility. */
export const FACILITY_ACTIVE = 'Active';

/** A pharmacy, by its facility-type label. */
export const PHARMACY_TYPE = /pharm/i;

/** The pool's option label "FCL-000009 — Nathealth" -> "FCL-000009". */
export const codeOfOption = (label: string): string => label.split(/\s+[—-]\s+/)[0].trim();

/** The Remove prompt, as the live application words it. */
export const REMOVE_PROMPT = {
  title: 'Delete facility',
  /** "Do you want to delete {facility}?" */
  messageFor: (facility: string): string => `Do you want to delete ${facility}?`,
} as const;

/** The table's empty state (the sheets' "no facilities assigned"). */
export const NO_FACILITIES = /no facilit/i;

/** Today as the Assigned On column prints it (DD/MM/YYYY). */
export const today = (): string => toDisplayDate(new Date());

/** A day offset from today, DD/MM/YYYY. */
export const dayFromToday = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDisplayDate(date);
};

/** Messages a refused or failed request must never expose. */
export const SERVER_ERROR_MARKERS = ['StackTrace', 'System.', 'Exception', 'SQL'] as const;

/** Time budgets: an Active network costs ~1-2 min, Inactive ~3-4 min, each approval ~30 s. */
export const BUDGET = {
  oneLiveNetwork: 15 * 60_000,
  twoLiveNetworks: 25 * 60_000,
  matrix: 40 * 60_000,
} as const;
