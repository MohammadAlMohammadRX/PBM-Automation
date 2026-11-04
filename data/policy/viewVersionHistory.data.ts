import { VERSION_STATUS_LABEL } from './policy.data';

/**
 * US 15185 "View Policy - Version History" (policy folder 14).
 *
 * The tab (verified live 2026-11-03): rows newest first - Version (v1 ...), Approval
 * Status (Approved / Superseded / Draft / Pending Approval / Rejected), Change (Created,
 * Updated, Activated, Deactivated, Deleted, Reverted), Networks, Requested By / On,
 * Reviewed By / On, Actions (View; "Revert to this" on a published or superseded row
 * that is not current). There is NO Members column (19613 asserts the case's columns).
 *
 * How the cases' wording maps onto the application:
 *  - "Published" is the application's "Approved"; a once-published version reads
 *    "Superseded" when a newer one is approved. 19606's "version 2 (Published)" on a policy
 *    at version 3 is therefore the Superseded v2 - the case asserts Revert is offered on
 *    it, not its label. 19609 filters on "Approved".
 *  - A revert is STAGED as a draft of the next version and needs approval (like every
 *    published change); 19606 / 19607 / 19616 send and approve it before reading the
 *    "current configuration", which is the version's Status (business status) - the only
 *    field a published policy's versions can differ in here (a published policy has no
 *    Edit: its name, plan and dates are fixed after the first approval).
 *  - Versions are built by the case: documents published (v2, v3 ...), or Inactive
 *    (v1 Created, v2 Deactivated) then Activate approved (v3 Activated).
 *  - The environment has one administrator, so 19611's "J. Smith" / "A. Noor" are that
 *    administrator (requested and reviewed by), and 19611's "Network Update" is the change
 *    label the case's own update shows ("Updated"); the AND logic is still exercised by
 *    the change type (v1 "Created" shares the user and the day).
 *  - 19615's "Data Entry" user is the Payer Admin without GetPolicyVersions and
 *    RevertPolicyVersion; its policy is built for NUPCO so that account can open it.
 */

/** The administrator as the Version History names it (requested / reviewed by). */
export const ADMIN_NAME = 'CareConnect Admin User';

/** The columns 19613 requires (case wording -> header pattern). */
export const VERSION_COLUMNS: ReadonlyArray<[string, RegExp]> = [
  ['Version', /^version$/i],
  ['Change Type', /^change( type)?$/i],
  ['Members', /^members$/i],
  ['Networks', /^networks$/i],
  ['Approval Status', /^approval status$/i],
  ['Requested By', /^requested by$/i],
  ['Requested On', /^requested on$/i],
  ['Reviewed By', /^reviewed by$/i],
  ['Reviewed On', /^reviewed on$/i],
  ['Actions', /^actions$/i],
];

/** A cell that shows nothing ('' or a dash). */
export const EMPTY_CELL = /^\s*[—–-]?\s*$/;

export const CASES = {
  numbered: { azureId: '19603', changes: 2 },
  requesterReviewer: { azureId: '19604' },
  readOnlyDetail: { azureId: '19605', changes: 1 },
  revertPublished: { azureId: '19606', target: 'v2' },
  revertSuperseded: { azureId: '19607', superseded: VERSION_STATUS_LABEL.superseded },
  neverApproved: { azureId: '19608', pending: VERSION_STATUS_LABEL.pending },
  filterStatus: { azureId: '19609', status: VERSION_STATUS_LABEL.published },
  detailFields: { azureId: '19610', gracePeriodDays: 5 },
  combinedFilters: { azureId: '19611' },
  emptyFilter: { azureId: '19612', requestedBy: 'nonexistent.user' },
  columns: { azureId: '19613' },
  sequential: { azureId: '19614' },
  noPermission: { azureId: '19615' },
  preservesHistory: { azureId: '19616', target: 'v1' },
  currentVersion: { azureId: '19617', current: 'v1' },
} as const;
