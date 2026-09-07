import type { PayerSelectSurface } from '../../constants/ElementIds';
import type { StatusFilterOption } from './filterPayer.data';

/**
 * Test data for the user story: Return Only Active Payers with Status in
 * Cross-Module Payer Selection.
 *
 * Verified against the live application:
 *   - The shared interface is `GET /api/Payers/GetPayersDropdown`, and every
 *     payload entry is `{ id, payerNameEn, payerNameAr, statusId }` - so the
 *     status IS carried alongside the identifying fields, as the criteria
 *     require, even though the rendered option label shows only the name.
 *   - The Active-only rule holds: sampling one payer of each non-Active status
 *     from the payer list, none of them appeared in the dropdown, while every
 *     sampled Active payer did.
 *   - `GET /api/Lookups/Items/payerStatus` maps a status `code` to the `id` the
 *     payload reports, which is why no GUID is hard-coded below.
 *
 * ONE OBSERVATION WORTH A DEFECT REPORT: the dropdown offered 219 payers while
 * the payer list's own "Active Payers" counter read 255 at the same moment.
 * Both cannot be right. The assertions below deliberately check the RULE (every
 * option is Active; no non-Active payer is offered) rather than a count
 * equality, because the rule is what the story specifies - but the discrepancy
 * is real and is called out in the spec's comments so it is not lost.
 */

/** The status whose payers the dropdown must offer. */
export const ELIGIBLE_STATUS = 'Active' as const;

/** The `code` of the eligible status in the payerStatus lookup. */
export const ELIGIBLE_STATUS_CODE = 'active';

/**
 * The status label the payer list DISPLAYS for each lifecycle state.
 *
 * This is not the same vocabulary the acceptance criteria use, and the
 * difference is load-bearing. Verified live: the Status column only ever shows
 * Active, Inactive, Expired or "Not Live" - a payer in the PENDING state is
 * rendered as "Not Live", and the word "Pending" never appears in that column.
 *
 * Tests therefore sample and assert on the DISPLAYED label, because that is
 * what a row actually carries; mapping the criteria's "Pending" onto "Not Live"
 * here keeps the specs readable without pretending a label exists that does not.
 */
export const DISPLAYED_STATUS = {
  active: 'Active',
  /** The criteria's "Pending". */
  pending: 'Not Live',
  inactive: 'Inactive',
  expired: 'Expired',
} as const;

/**
 * The statuses that must be excluded, each an equivalence class of its own.
 * Each is kept with the list filter that brings such a payer on screen, so a
 * test never assumes one happens to be on page one.
 */
export interface ExcludedStatusCase {
  id: string;
  /** The status as the acceptance criteria name it. */
  status: string;
  /** The status as the payer list displays it. */
  displayed: string;
  filter: StatusFilterOption;
  /** The lookup `code` for this status. */
  code: string;
}

export const EXCLUDED_STATUS_CASES: readonly ExcludedStatusCase[] = [
  {
    id: 'pending',
    status: 'Pending',
    displayed: DISPLAYED_STATUS.pending,
    filter: 'Pending',
    code: 'pending',
  },
  {
    id: 'inactive',
    status: 'Inactive',
    displayed: DISPLAYED_STATUS.inactive,
    filter: 'Inactive',
    code: 'inactive',
  },
  {
    id: 'expired',
    status: 'Expired',
    displayed: DISPLAYED_STATUS.expired,
    filter: 'Expired',
    code: 'expired',
  },
] as const;

/**
 * The full decision table: which statuses the dropdown includes and excludes.
 * Drives the decision-table case directly, so the expected outcome is data
 * rather than a run of hand-written assertions.
 */
export interface DropdownDecisionRow {
  status: string;
  displayed: string;
  filter: StatusFilterOption;
  included: boolean;
}

export const DROPDOWN_DECISION_TABLE: readonly DropdownDecisionRow[] = [
  {
    status: 'Active',
    displayed: DISPLAYED_STATUS.active,
    filter: 'Active',
    included: true,
  },
  {
    status: 'Pending',
    displayed: DISPLAYED_STATUS.pending,
    filter: 'Pending',
    included: false,
  },
  {
    status: 'Inactive',
    displayed: DISPLAYED_STATUS.inactive,
    filter: 'Inactive',
    included: false,
  },
  {
    status: 'Expired',
    displayed: DISPLAYED_STATUS.expired,
    filter: 'Expired',
    included: false,
  },
] as const;

/**
 * The consuming surfaces compared by the cross-module consistency case.
 *
 * Two INDEPENDENT modules, which is the point: if both return the same set, the
 * Active-only filter lives in the shared interface rather than being
 * re-implemented (and re-broken) per module.
 */
export interface ConsumingSurface {
  id: string;
  surface: PayerSelectSurface;
  moduleName: string;
}

export const CONSUMING_SURFACES: readonly ConsumingSurface[] = [
  { id: 'plans-filter', surface: 'planListFilter', moduleName: 'Plans' },
  { id: 'networks-filter', surface: 'networkListFilter', moduleName: 'Networks' },
] as const;

/** The shape of one entry in the shared interface's payload. */
export interface PayerDropdownEntry {
  id: string;
  payerNameEn: string;
  payerNameAr: string;
  statusId: string;
}

/** The application's standard response envelope. */
export interface ApiEnvelope<T> {
  status: number;
  payload: T;
  successMessage?: string;
}

/** One entry of the payerStatus lookup. */
export interface StatusLookupItem {
  id: string;
  code: string;
  englishName: string;
  arabicName: string;
}

/** Fields every dropdown payload entry must carry. */
export const REQUIRED_ENTRY_FIELDS = [
  'id',
  'payerNameEn',
  'statusId',
] as const satisfies readonly (keyof PayerDropdownEntry)[];

/** How many payers to sample per status - enough to be convincing, cheap to run. */
export const SAMPLE_SIZE = 3;
