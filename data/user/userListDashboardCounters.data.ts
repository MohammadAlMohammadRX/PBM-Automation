/**
 * US 20408 "User List - Dashboard Counters" (user folder 02), 11 cases.
 *
 * How the cases map onto the live list (2026-11-08, User-Foundation-Notes.md):
 *  - The "dashboard" is the tile band of Users Administration: Total Users,
 *    Active, Inactive (buttons - a click re-queries GetUsers with `isActive`
 *    true / false / none) and Pending Approval (an article with no button,
 *    caption "Awaiting approval — decided in Approval Management"). Values count
 *    up from 0 - read settled. The "System Administrator" is the admin account.
 *  - The cases' fixed numbers (50 / 20 / 70, 5 pending) cannot be seeded on the
 *    shared register: tiles are compared with what the register holds at the
 *    moment (GetUsers / GetUsersDashboard), the case's own suite users (Active,
 *    Inactive) added first so both statuses are present and on page 1.
 *  - PENDING REGISTRATIONS cannot be produced: a registration is only made
 *    through story 20422 "Register via Invitation Link" (MANUAL, never
 *    automated), and deciding someone else's registration is not allowed.
 *    So (foundation table (e)): 20486 and 20487 are BLOCKED; 20483 asserts the
 *    tile and caption and is BLOCKED when the tile reads 0 (nothing pending to
 *    show); 20491's approval part is BLOCKED after its deactivation part ran.
 *    The reason is ONE constant (PENDING_REGISTRATION_BLOCKED) so it can be
 *    switched when a pending registration becomes available.
 *  - 20485's precondition "a non-zero count" does not hold (0 pending); the
 *    not-clickable behaviour does not depend on the count and is asserted.
 *  - 20488 (tiles at 0): only reachable in a payer-scoped session (decision item
 *    8) - a suite administrator scoped to "Al sharq" (it sees its own payer's
 *    users, all active on 2026-11-08). When that scope holds an inactive user,
 *    the case is data-driven BLOCKED (the precondition "zero inactive users"
 *    does not hold).
 *  - 20491 "without unrelated navigation": the tiles are read right after the
 *    deactivation (no reload), then again after a reload (step 4).
 */
export const CASES = {
  totalTile: { azureId: '20481' },
  activeTile: { azureId: '20482' },
  pendingCaption: { azureId: '20483' },
  inactiveTile: { azureId: '20484' },
  pendingNotClickable: { azureId: '20485' },
  pendingNeverListed: { azureId: '20486' },
  approvalManagementOnly: { azureId: '20487' },
  zeroTiles: { azureId: '20488' },
  allTilesChecklist: { azureId: '20489' },
  totalBothPartitions: { azureId: '20490' },
  countersRefresh: { azureId: '20491' },
} as const;

/** The tile labels, as the AC names them. */
export const TILE_LABELS = { total: /^Total Users$/i, active: /^Active$/i, inactive: /^Inactive$/i, pendingApproval: /^Pending Approval$/i } as const;

/** The Pending Approval caption (AC, exact). */
export const PENDING_CAPTION = 'Awaiting approval — decided in Approval Management';

/** The payer of the payer-scoped session of 20488. */
export const SCOPE_PAYER = 'Al sharq';

/** The empty state of a list with no rows. */
export const EMPTY_STATE = /no users found|no results|no records/i;

/** Every pending-registration part: the suite cannot produce one (story 20422 is MANUAL). */
export const PENDING_REGISTRATION_BLOCKED =
  'a registration pending approval that the suite created: registrations are made only through story 20422 "Register via Invitation Link" '
  + '(MANUAL - never automated), and the suite may not decide or rely on a registration it did not create (foundation table (e))';

/** The deactivation reason details typed by 20491. */
export const DEACTIVATION_DETAILS = 'Deactivated by the automation suite (dashboard counters case).';
