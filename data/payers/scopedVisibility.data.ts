import { PAYER_EXPORT_COLUMN } from '../../constants/ElementIds';
import { NON_ADMIN_PROFILE } from '../accounts/nonAdminAccount.data';
import { SCOPE_FILTER } from './exportScope.data';
import type { BlockedCase } from './payerTypes';

/**
 * Test data for "Restrict Payer Visibility to a User's Assigned Scope".
 *
 * The scoped user is the configured non-admin account - a Payer Admin
 * assigned to two payers (see nonAdminAccount.data). VERIFIED as that account:
 * the list holds exactly its two payers while the register holds ~950; a
 * direct link to any other payer answers 404 with "Unable to load the
 * requested payer."; the API answers 404 with an empty body; a search for an
 * out-of-scope name matches nothing. The PARTIAL-scope column of the sheet is
 * therefore real. The FULL-scope column is the administrator's paginated-list
 * story (folder 07); the ZERO-payer and ONE-payer columns, the scope-change
 * case and the matrix need accounts this environment does not have and stay
 * BLOCKED with that stated.
 */

/** The payers the scoped user is assigned - the whole of what it may see. */
export const SCOPED_PAYERS: readonly string[] = NON_ADMIN_PROFILE.scopedPayers;

/** The payer the in-scope open-and-edit case works on. */
export const IN_SCOPE_PAYER = NON_ADMIN_PROFILE.scopedPayers[0];

/** The field read back from the edit form to prove it opened on the right record. */
export const IN_SCOPE_FORM_FIELD = 'Payer Name';

/** The export column holding the payer's name. */
export const EXPORT_NAME_COLUMN = PAYER_EXPORT_COLUMN.nameEn;

/** A status filter the scoped payers both satisfy (both are Active). */
export const SCOPE_STATUS_FILTER = SCOPE_FILTER.status;

/**
 * The request that loads one payer's record - matched exactly, because its
 * name is a prefix of GetPayers, GetPayerNetworks and GetPayerLinkedPolicies.
 */
export const DETAIL_REQUEST = /\/api\/Payers\/GetPayer(\?|$)/;

/** How many network-list pages the network case reads (13 x 10 covers the ~112 networks). */
export const NETWORK_PAGES = 13;

/** The sheet's cases this environment cannot exercise, in renumbered order. */
export const BLOCKED_CASES: readonly BlockedCase[] = [
  {
    id: '006',
    title: 'should apply the right visibility and action outcome for each scope assignment and attempted action',
    reason:
      `The matrix needs Full, Partial and No-scope users in one run. Only the Partial column exists here (the ${NON_ADMIN_PROFILE.role}, two payers); `
      + 'its rows are the real cases of this story. Provide a zero-payer account and re-run for the matrix as a whole.',
  },
  {
    id: '007',
    title: 'should update the visible payers when a user\'s assigned scope is changed',
    reason:
      `This case changes the ${NON_ADMIN_PROFILE.role}'s scope from User and Access Management mid-run. That account is shared by every `
      + 'role case in the suite, so its assignment is not altered here. Provide a disposable scoped account and re-run.',
  },
  {
    id: '008',
    title: 'should show exactly one payer when a user is assigned exactly one',
    // Not a PERMISSION problem, and so not one the role shaping can solve: which
    // payers an account is assigned is set in User and Access Management, not in
    // the permission catalogue.
    reason: `This case needs an account assigned to exactly ONE payer; the ${NON_ADMIN_PROFILE.role} is assigned two. Taking permissions off the role cannot change which payers it is assigned, so provide a one-payer account and re-run.`,
  },
  {
    id: '009',
    title: 'should show an empty payer list but still show unassigned networks for a user with zero payers',
    reason: `This case needs an account assigned to NO payer; the ${NON_ADMIN_PROFILE.role} is assigned two. Provide a zero-payer account and re-run.`,
  },
  {
    id: '012',
    title: 'should enforce scope when a scoped integration account requests payer data',
    reason:
      'This case needs an integration or service account with a limited scope and an integration '
      + 'endpoint to call. Neither is available to this suite.',
  },
  {
    id: '013',
    title: 'should fail safely rather than expose every payer when a scope configuration is missing or corrupted',
    reason:
      'This case needs a user\'s scope record deliberately deleted or corrupted - a data-layer '
      + 'action no interface in this suite can perform. It is a manual, DBA-assisted check.',
  },
];
