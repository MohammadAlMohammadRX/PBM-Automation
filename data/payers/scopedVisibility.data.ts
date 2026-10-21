
import { NON_ADMIN_PROFILE } from '../accounts/nonAdminAccount.data';

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

/**
 * The request that loads one payer's record - matched exactly, because its
 * name is a prefix of GetPayers, GetPayerNetworks and GetPayerLinkedPolicies.
 */
export const DETAIL_REQUEST = /\/api\/Payers\/GetPayer(\?|$)/;
