import { POLICY_DETAIL, POLICY_DOCUMENT_DRAWER } from '../ElementIds';

/**
 * Ids (and the two paths) Writer B's policy folders (03, 04, 05, 06, 07, 08, 12,
 * 13) need beyond constants/ElementIds.ts. Kept apart so the three writers
 * never edit the same file (reports/policy/Policy-Writers-Brief.md).
 */

/** Every Overview value is `policy-detail-overview-{key}` - the read-only cases check each of them. */
export const POLICY_OVERVIEW_PREFIX = 'policy-detail-overview-';

/** The Overview values the story lists (POLICY_DETAIL.overview keys, the inactivation / termination ones left out). */
export const OVERVIEW_STORY_FIELDS = [
  'number', 'nameAr', 'type', 'plan', 'payer', 'holder', 'status', 'members', 'effectiveDate', 'expiryDate',
  'gracePeriod', 'maxMembers', 'deductible', 'coinsurance', 'outOfPocket', 'sublimit', 'benefitYear',
] as const satisfies ReadonlyArray<keyof typeof POLICY_DETAIL.overview>;

/**
 * A "full edit form" reached by URL, bypassing the view page (19492). No such
 * route is known - `/policy-management/{id}/edit` is the one a user would try;
 * the case asserts it does NOT open an editable form.
 */
export const POLICY_EDIT_ROUTE_SUFFIX = 'edit';

/** The policy selection dropdown the other modules use (bundle: GetPoliciesDropdown) - 19601. */
export const POLICY_DROPDOWN_PATH = '/api/Policies/GetPoliciesDropdown';

/**
 * One audit entry with its before / after values (POST `{ id }`; the entry
 * drawer's own request) - 19587 reads what an UPDATE entry changed.
 */
export const AUDIT_LOG_BY_ID_PATH = '/api/AuditLogs/GetAuditLogById';

/** The file a document's attachment is downloaded from (`/api/FileUpload/Download/{guid}`) - 19518 / 19526. */
export const FILE_DOWNLOAD_PATH = '/api/FileUpload/Download/';

/** The Add Documentation drawer's attachment row: the chosen file's name shows beside Remove (`endorsement-form-drawer-clear-file-button`). */
export const DOCUMENT_DRAWER_FILE = {
  root: POLICY_DOCUMENT_DRAWER.root,
  clear: POLICY_DOCUMENT_DRAWER.clearFile,
  input: POLICY_DOCUMENT_DRAWER.attachment,
} as const;
