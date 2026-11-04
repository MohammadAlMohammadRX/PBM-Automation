import type { FacilityShape } from '../../utils/facility/writerBHelpers';

/**
 * US 15139 "License Date with activation status" (facility folder 08).
 *
 * STATUS RULES (measured 2026-11-04, foundation notes): the status is computed
 * when the facility is saved - Future before the start date, Active inside the
 * licence period, Expired after the expiry date (the expiry day itself is still
 * Active) - and the DISPLAYED status is Inactive whenever Is Active is off,
 * except Expired, which wins over everything. A facility job at ~00:00 Riyadh
 * moves the status when a date passes; it is NOT in System Settings, so no
 * case can make a date ARRIVE while it runs: those parts claim SEEDS made the
 * day before (`npm run seed:facility`, utils/facility/writerBHelpers) and are
 * BLOCKED, naming the seeder, when none is available. Parts checkable at save
 * (start already passed, expiry today, expiry yesterday) are asserted directly.
 *
 * "Turn activation on / off and save" = the Is Active checkbox of the Edit
 * drawer, then Save (UpdateFacility).
 *
 * Literal readings / TC-vs-AC notes:
 * - 17547 "Facility is Pending, start passed, expiry future": a facility inside
 *   its licence period with Is Active OFF (displayed Inactive); the AC's
 *   "Pending" is the not-yet-activated state.
 * - 17548: a StartArrives seed (start = the day after it was made, Is Active
 *   off) whose start date has now arrived overnight -> must read Inactive.
 * - 17550 "TC: Active at once" vs AC "Pending until explicitly activated": the
 *   TEST CASE is asserted (Active) - the AC disagrees (decision item). The new
 *   expiry is the case's 2027-06-01.
 * - 17552: "Active on the expiry day" on an ExpiryArrives seed whose expiry day
 *   came overnight (falls back to a facility saved today with expiry = today),
 *   and "Expired at the end of the day" on a seed whose expiry day has PASSED
 *   since it was made Active (ExpiryPasses / ExpiryArrives) -> must read Expired.
 * - 17553: start in the future, Is Active turned on and saved -> stays Future.
 * - 17554: a StartArrives seed whose start date is TODAY (made yesterday, so the
 *   start date arrived with the nightly job): still Inactive, then activated.
 * - 17555 decision table: one suite facility per row (A..E); E = expired, then
 *   its expiry extended with Is Active still on.
 * - 17556: start 01/06/2026, expiry 01/05/2026 typed in the Edit drawer.
 * - 17557 "accepts or rejects": the case's either/or is asserted (a clear
 *   message, or Active for its single day); start = expiry = TODAY so the single
 *   day is the run day (the sheet's 2026-11-01 is in the past).
 * - 17559 "readonly_user": the Payer Admin shaped with list + view but WITHOUT
 *   SetFacilityActive (Activate / Inactivate - one right) and UpdateFacility
 *   (the Edit drawer's Is Active switch). Baseline: the administrator is offered
 *   Inactivate.
 * - 17560 "currently Pending": built as the AC defines Pending - an expired
 *   licence extended but not yet activated (Is Active off). The list must say
 *   "Pending" (the application has no such label - it shows Inactive / Future:
 *   finding); the extension + activation then has to read Active in both views.
 * - 17561 "Pending -> Active": a Future facility (start date ahead) whose start
 *   date is moved to today; "every other screen" = the list row, the card, the
 *   KPI tiles (Active count) and the network Assign Facilities pool (active
 *   pharmacies only - read-only, on the suite's anchor network).
 */
export const CASES = {
  activateInsideLicence: { azureId: '17547' },
  startArrivesNotActivated: { azureId: '17548' },
  extendExpired: { azureId: '17550', newExpiry: '2027-06-01' },
  activeOnExpiryDay: { azureId: '17552' },
  noActivationBeforeStart: { azureId: '17553', startInDays: 10 },
  startDayNotAutoActivated: { azureId: '17554' },
  decisionTable: { azureId: '17555' },
  expiryBeforeStart: { azureId: '17556', start: '01/06/2026', expiry: '01/05/2026', message: 'End date must be after start date.' },
  oneDayLicence: { azureId: '17557', label: 'OneDay' },
  deactivateValidLicence: { azureId: '17558' },
  activationPermission: { azureId: '17559', shape: { with: ['list', 'view'], without: ['setActive', 'edit'] } satisfies FacilityShape },
  listDetailConsistent: { azureId: '17560', pendingLabel: 'Pending', extendInDays: 400 },
  statusEverywhere: { azureId: '17561' },
} as const;

/** The labels the screens show. */
export const STATUS = { future: 'Future', active: 'Active', inactive: 'Inactive', expired: 'Expired' } as const;
