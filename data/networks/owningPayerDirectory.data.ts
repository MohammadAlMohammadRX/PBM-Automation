import { NETWORK_ADVANCED_SEARCH_FIELD } from '../../constants/ElementIds';
import { NON_ADMIN_PROFILE } from '../accounts/nonAdminAccount.data';
import { networkStamp } from '../../utils/NetworkProvisioning';
import { NETWORK_APPROVAL_STATE, NETWORK_LIFECYCLE, repeatTo, type NetworkBlockedCase } from './network.data';

/**
 * Test data for US 14302 "Show owning payer on the network directory and
 * expand advanced search".
 *
 * WHERE THE "PAYER QUICK FILTER" LIVES (2026-10-21): the Network module is
 * scoped by the top-bar payer selector (`app-breadcrumb-payer-select`), which
 * shows one payer at a time - that selector IS the quick filter this story
 * describes. The administrator meets it too; the configured non-admin account
 * ("Payer Admin", two assigned payers) is the multi-payer admin of the sheet.
 *
 * The list's advanced search offers Name / Code, Type, Status and Approval
 * Status - NO payer criterion; the cases that need one assert it is offered
 * (and fail on that) before exercising what the drawer does have.
 *
 * Sheet values that do not exist here are mapped: Type "Retail" -> HMO,
 * Approval Status "Approved" -> "Published".
 */

export const FIELD = NETWORK_ADVANCED_SEARCH_FIELD;

/** The payer column's header, and the dash an unowned network shows. */
export const PAYER_HEADER = 'Payer';
export const NO_OWNER = '—';

/** The non-admin account's two payers - the sheet's payeradmin1. */
export const MULTI_PAYER_ACCOUNT = {
  payers: NON_ADMIN_PROFILE.scopedPayers,
  /** "Payer B" of the sheet: the account's second payer. */
  payerB: NON_ADMIN_PROFILE.scopedPayers[1],
} as const;

/** The criteria the drawer should offer (18048), by drawer key. */
export const REQUIRED_CRITERIA = [FIELD.payer, FIELD.nameOrCode, FIELD.approvalStatus, FIELD.networkType, FIELD.status] as const;

/** 18049 - the sheet's combination, mapped onto the live lookups. */
export const COMBINED = { type: 'HMO', status: NETWORK_LIFECYCLE.active, approvalStatus: NETWORK_APPROVAL_STATE.published } as const;

/** 18050 - the sheet's example maximum of 50. */
export const NAME_CODE_LIMIT = { maximum: 50, minimum: 'A', beyond: repeatTo('P', 51) } as const;

/** 18051 - the approval statuses the story expects to filter by. */
export const EXPECTED_APPROVAL_STATES = [
  NETWORK_APPROVAL_STATE.draft,
  NETWORK_APPROVAL_STATE.pendingApproval,
  NETWORK_APPROVAL_STATE.published,
  NETWORK_APPROVAL_STATE.rejected,
] as const;

/** 18053 - criteria nothing matches. */
export const NO_MATCH_TERM = `NONEXISTENT999 ${networkStamp()}`;

/** The permissions a role without network VIEW rights is stripped of (18052). */
export const VIEW_PERMISSIONS = ['viewNetworksDashboard', 'viewNetworkDetails', 'viewNetworksDropdown'] as const;

/** 18054 - the term applied before the payer is switched. */
export const RAPID_TERM = 'Automation Network';

/** 18055 - a Sort By option that sorts by payer, as the sheet requires. */
export const PAYER_SORT_WORD = 'Payer';

export const CASES = {
  payerColumn: { azureId: '18041' },
  quickFilterShown: { azureId: '18045' },
  narrowsToPayer: { azureId: '18046' },
  criteria: { azureId: '18048' },
  combined: { azureId: '18049' },
  boundary: { azureId: '18050' },
  approvalStates: { azureId: '18051' },
  noViewPermission: { azureId: '18052' },
  noResults: { azureId: '18053' },
  rapidSwitching: { azureId: '18054' },
  payerColumnPaging: { azureId: '18055' },
} as const;

export const BLOCKED_CASES: NetworkBlockedCase[] = [
  {
    azureId: '18044',
    title: 'should load the list directly without a payer quick filter when the Payer Admin is assigned to one payer',
    reason:
      'Needs a Payer Admin account assigned to exactly ONE payer. The only non-admin account configured '
      + '(NON_ADMIN_USERNAME, "Payer Admin") is assigned to two (Al Dawaa 2, NUPCO), and a user\'s payer '
      + 'assignments cannot be changed through the UI in this build. Runnable once a single-payer account is configured.',
  },
  {
    azureId: '18047',
    title: 'should keep the network list blocked until a payer is chosen when a multi-payer admin opens the directory',
    reason:
      'Needs a signed-in multi-payer session that has NOT yet answered the "Select a Payer" gate. Every session '
      + 'fixture (nonAdminSession, shapedNonAdmin) answers the gate during sign-in, so the unanswered state is '
      + 'never observable. Runnable with a session fixture variant that stops at the gate.',
  },
  {
    azureId: '18056',
    title: 'should show an empty directory with a no-networks message when the selected payer owns no networks',
    reason:
      'Needs a live payer that owns ZERO networks. Approval refuses a payer without an assigned network '
      + '("A payer must have at least one assigned network"), so no such payer can be selected in the top-bar '
      + 'scope. Runnable once a payer with no networks exists (e.g. after its last network is unassigned).',
  },
];
