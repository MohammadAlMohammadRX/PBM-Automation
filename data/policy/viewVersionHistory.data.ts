import { VERSION_STATUS_LABEL } from './policy.data';

/**
 * US 15185 "View Policy - Version History" (policy folder 14).
 *
 * AMENDED 18 Nov 2026 (test cases updated 22 Nov): only an APPROVED change becomes a version
 * (Approval Status always "Approved"); a rejected change and a new policy's first draft are not
 * versions; the table shows Approved By / Approved On (was Reviewed By / On) and a Members
 * column; View Details also shows Policy Type, Policy Holder, Members and Documents in this
 * version, Requested By / On and Approved By / On. Cases 19604, 19607, 19608, 19609, 19610 and
 * 19613 were rewritten; 22395 and 22397 were added.
 *
 * The tab (verified live 2026-11-23, build of 14 Nov): rows newest first - Version (v1 ...),
 * Approval Status, Change (Created, Updated, Activated, Deactivated, Deleted, Reverted),
 * Networks, Requested By / On, Approved By / On (ids still `reviewedby` / `reviewedon`),
 * Actions (View; "Revert to this" on an earlier approved row). There is still NO Members
 * column, and the advanced search has NO Approval Status field (Change, Requested By, Approved
 * By, Requested On) - 19613 and 19609 assert the cases and report both.
 *
 * How the cases' wording maps onto the application:
 *  - "Published" is the application's "Approved". 19606's "version 2 (Published)" on a policy
 *    at version 3 is the earlier v2 - the case asserts Revert is offered on it, not its label.
 *  - 19607 (22 Nov) contradicts itself: its title, its final expected result and the story
 *    ("A previously published version can be reverted") say an earlier approved version CAN
 *    be reverted to; its steps 2-3 say Revert is disabled and blocked. The case asserts the
 *    title and the story - an earlier approved version is reverted to - and says so.
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

/** The administrator as the Version History names it (requested / approved by). */
export const ADMIN_NAME = 'CareConnect Admin User';

/** The only approval status a version has (only approved changes become versions, amended 18 Nov 2026). */
export const APPROVED = 'Approved';

/** The columns 19613 requires (case wording -> header pattern); Approved By / On replace Reviewed By / On (22 Nov 2026). */
export const VERSION_COLUMNS: ReadonlyArray<[string, RegExp]> = [
  ['Version', /^version$/i],
  ['Change Type', /^change( type)?$/i],
  ['Members', /^members$/i],
  ['Networks', /^networks$/i],
  ['Approval Status', /^approval status$/i],
  ['Requested By', /^requested by$/i],
  ['Requested On', /^requested on$/i],
  ['Approved By', /^approved by$/i],
  ['Approved On', /^approved on$/i],
  ['Actions', /^actions$/i],
];

/** 19611's reviewer filter: labelled "Approved By" since the build of 14 Nov 2026 (the case, not updated, says "Reviewed By"). */
export const REVIEWER_FILTER_LABEL = /(reviewed|approved) by/i;

/** A date and time as the version cells and drawer show them ("18/11/2026 16:21"). */
export const DATE_TIME = /\d{2}\/\d{2}\/\d{4}/;

/** A cell that shows nothing ('' or a dash). */
export const EMPTY_CELL = /^\s*[—–-]?\s*$/;

export const CASES = {
  numbered: { azureId: '19603', changes: 2 },
  requesterReviewer: { azureId: '19604' },
  readOnlyDetail: { azureId: '19605', changes: 1 },
  revertPublished: { azureId: '19606', target: 'v2' },
  revertEarlierApproved: { azureId: '19607' },
  rejectedExcluded: { azureId: '19608', rejected: VERSION_STATUS_LABEL.rejected },
  filterStatus: { azureId: '19609', status: VERSION_STATUS_LABEL.published },
  detailFields: { azureId: '19610', gracePeriodDays: 5 },
  combinedFilters: { azureId: '19611' },
  emptyFilter: { azureId: '19612', requestedBy: 'nonexistent.user' },
  columns: { azureId: '19613' },
  sequential: { azureId: '19614' },
  noPermission: { azureId: '19615' },
  preservesHistory: { azureId: '19616', target: 'v1' },
  currentVersion: { azureId: '19617', current: 'v1' },
  firstDraftNotCounted: { azureId: '22395' },
  versionOnlyOnApproval: { azureId: '22397' },
} as const;
