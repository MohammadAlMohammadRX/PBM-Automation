/**
 * US 20419 "Search and Filter Invitations" (user folder 13), 17 cases.
 *
 * How the cases map onto the live list (2026-11-08, User-Foundation-Notes.md):
 *  - "Navigate to the User Management module - the module home page loads" =
 *    Users Mgmt's first screen, Users Administration; "Open the Invitations
 *    list" = Users Mgmt > Invitations.
 *  - The records a case looks for are SUITE invitations made for it (Pending;
 *    a Paused one is a suite invitation paused through SetInvitationStatus) -
 *    other teams' invitations are only read.
 *  - Each invitation shows Email, Role, Payer, Expiration, Status and, for
 *    Pending, Pause / Resend / Delete (table) - cards carry the same fields.
 *  - Quick Search is the toolbar box (`searchText`, debounced - each search
 *    awaits ITS answer). Advance Search (Filters) offers Email, Role, Payer,
 *    Expiration, Status (request `email`, `roleId`, `status` = enum number,
 *    Pending 0); chips show what is applied and remove it one at a time.
 *  - 20660 / 20661 / 20662 payer scope: two suite invitations of a payer-scoped
 *    suite role, one for `PAYER_A` (the suite's scoped payer) and one for
 *    `PAYER_B`. The admin must see both. "Payer Admin for Payer A" (decision 8)
 *    = a payer-scoped suite session on `PAYER_A` holding
 *    Invitations.GetInvitations - never the shared Payer Admin. The foundation
 *    saw such a session list 0 invitations: 20661 expects its own payer's
 *    invitation, so it fails there (finding).
 *  - 20662 "open the Payer B invitation by URL / ID": there is NO invitation
 *    detail page or direct link - the attempt is the list route + the id
 *    (`/users-management/invitations/{id}`) in the scoped window (it must not
 *    show the record), plus the list API asked for that invitation as the
 *    scoped account (it must not answer it). Noted as decided by the lead.
 *  - 20669 "at least one registration pending approval": a pending
 *    registration needs story 20422 (MANUAL) - not producible. The case's steps
 *    (the "Approvals List (N)" button with its count, the navigation to the
 *    Registrations tab) do not depend on N, so they are asserted with the live
 *    count (0 today); the precondition is noted, not faked.
 *  - 20671 "Pause ... and confirm": the row's Pause on a SUITE invitation, then
 *    the confirmation the app asks (if any); "a confirmation message" = the
 *    dialog or a toast.
 *  - 20672 maximum length: the box's `maxlength`; when it has none, the probe
 *    length is `SEARCH_PROBE_LENGTH` (the e-mail maximum of story 20418) - the
 *    box accepting one more character is then the finding.
 */
export const CASES = {
  listDetails: { azureId: '20658' },
  cardsAndTable: { azureId: '20659' },
  adminAllPayers: { azureId: '20660' },
  payerAdminOwnPayer: { azureId: '20661', rights: ['Invitations.GetInvitations'] },
  payerAdminDirectLink: { azureId: '20662', rights: ['Invitations.GetInvitations'] },
  quickSearch: { azureId: '20663' },
  quickSearchNoMatch: { azureId: '20664', tag: 'nomatch' },
  advancedEmail: { azureId: '20665' },
  advancedRole: { azureId: '20666' },
  advancedStatus: { azureId: '20667', status: 'Pending', statusValue: 0 },
  advancedCombined: { azureId: '20668', status: 'Pending', statusValue: 0 },
  approvalsList: { azureId: '20669' },
  addInvitation: { azureId: '20670' },
  statusAfterAction: { azureId: '20671', paused: 'Paused' },
  searchMaxLength: { azureId: '20672' },
  checklist: { azureId: '20673' },
  quickAndAdvanced: { azureId: '20674' },
} as const;

/** The suite's scoped payer (decision 8) and a second payer. */
export const PAYER_A = 'Al sharq';
export const PAYER_B = 'Al Dawaa';

/** The invitation list's columns as shown. */
export const LIST_HEADERS = ['Email', 'Role', 'Payer', 'Expiration', 'Status'] as const;

/** Advance Search's fields the story names. */
export const ADVANCED_FIELDS = ['Email', 'Role', 'Status'] as const;

/** A Pending invitation's actions. */
export const PENDING_ACTIONS = ['Pause', 'Resend', 'Delete'] as const;

/** 20672: the length typed when the box declares no maxlength (story 20418's e-mail maximum). */
export const SEARCH_PROBE_LENGTH = 256;

/** "Approvals List (N)". */
export const APPROVALS_LABEL = /^Approvals List \(\d+\)$/;
