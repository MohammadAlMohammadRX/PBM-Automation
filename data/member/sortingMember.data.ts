/**
 * US 14378 "Sorting Member" (member folder 03), 9 cases.
 *
 * How the cases map onto the live list (2026-11-05, Member-Foundation-Notes.md):
 *  - Sort is the "Sort By" MENU (`member-list-sort-*`), not column headers: a
 *    case's "click the Member ID sort control once / again" is "Member ID (A-Z)"
 *    then "(Z-A)", "reverse the direction" the opposite entry. The request sends
 *    `sortBy` (MemberCode / MemberNameEn / MobileNumber / NationalityEn / Status
 *    asc|desc); the default is "Created On (Newest to Oldest)" (`CreatedOn desc`).
 *  - Order is checked on what the sort ANSWERED (the page the screen renders) and
 *    on the rows on screen; text order is case-insensitive (the database's CI
 *    collation). Mobile numbers are stored as text and compared as text.
 *  - 19795 newest first: the case's two members are built one after the other;
 *    the newer must lead the list on a fresh open.
 *  - 19801 Status: Active / Inactive are grouped and the grouping reverses with
 *    the direction (the register holds both statuses; the case adds one of each).
 *  - 19802 "a payer scope containing exactly one member record": the visible
 *    scope is narrowed to ONE record by a keyword search on the case's own
 *    member (no payer holds exactly one member the suite can rely on - see
 *    folder 01's 19780); every sort option is then applied to it.
 *  - 19804 payer scope: Payer A = the suite payer "Al sharq" chosen in the
 *    breadcrumb select, its member enrolled in a NEW suite policy, next to a
 *    suite member enrolled nowhere.
 */
export const CASES = {
  defaultNewest: { azureId: '19795', sortLabel: /created on.*newest/i, sortBy: 'CreatedOn desc' },
  byMemberId: { azureId: '19796', label: /member id/i },
  byName: { azureId: '19797', label: /name/i },
  byMobile: { azureId: '19798', label: /mobile/i },
  byNationality: { azureId: '19799', label: /nationality/i },
  keptAcrossViews: { azureId: '19800', label: /member id.*(a-z|asc)/i },
  byStatus: { azureId: '19801', label: /status/i },
  singleRecord: { azureId: '19802' },
  payerScope: { azureId: '19804' },
} as const;
