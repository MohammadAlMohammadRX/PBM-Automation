import type { InvitationSortOption } from '../../constants/user/userIds';

/**
 * US 20417 "Sort and Export Invitations" (user folder 11), 10 cases.
 *
 * How the cases map onto the live list (2026-11-08, User-Foundation-Notes.md):
 *  - "Navigate to the User Management module - the Invitations list loads" =
 *    Users Mgmt > Invitations (`/users-management/invitations`).
 *  - Sort By is a menu: Newest (default, `CreatedOn desc`), Oldest
 *    (`CreatedOn asc`), Email, Role, Expiration, Status, Last Modified; a field
 *    option KEEPS the current direction, the direction button flips it. Each
 *    option is checked through ITS request (`sortBy`) and the order of the
 *    answer it got; the rows on screen must follow that answer. Text order is
 *    accepted under any usual collation (the server's is not ours); Status in
 *    the enum's order or by name.
 *  - Export is a menu (Selected Export = the current search / sort, Export All
 *    Data) then the format dialog (CSV / Excel). The file holds the WHOLE
 *    matching set (Email, Role Name, Status, Payer Id, Expires On, Accepted On,
 *    Created On) - "matching the list on screen" = as many rows as the list's
 *    total, and every row on screen found in the file with the same role and
 *    status.
 *  - 20631 "no invitations currently exist": the list is shared with other
 *    teams, so it cannot be emptied - a search that matches nothing makes the
 *    list show zero invitations, then Selected Export (decision; noted).
 *  - 20633 "payer" column: the export carries "Payer Id" (a GUID), the list the
 *    payer NAME - the case expects matching data, so it fails (finding,
 *    foundation notes). Checked on a suite invitation for a payer-scoped suite
 *    role and the payer `PAYER_A`.
 *  - 20634 "large number ... special characters": `VOLUME` suite invitations
 *    (more than one page) for a suite role whose name carries a comma, an
 *    accented letter and Arabic script, with a "+" in each address; nothing
 *    else in the list is touched.
 *  - 20635 "rapidly click Export": Export > Export All Data > CSV `BURST` times
 *    without waiting for the files. "One correct, complete file" = every file
 *    produced is complete (the list's total) and they are identical (the
 *    duplicates were ignored or queued, never conflicting).
 *  - Statuses other than Pending in the list are other teams' records, read only.
 */
export const CASES = {
  sortOptions: { azureId: '20627' },
  defaultNewest: { azureId: '20628' },
  exportCsv: { azureId: '20629' },
  exportExcel: { azureId: '20630' },
  exportEmpty: { azureId: '20631', keyword: 'qa.automation.inv.zz-no-such-invitation' },
  reverseSort: { azureId: '20632' },
  exportColumns: { azureId: '20633' },
  exportLargeSpecial: { azureId: '20634', volume: 12, roleSuffix: ', café عربي', addressTag: '+qa' },
  rapidExport: { azureId: '20635', burst: 3 },
  exportKeepsSort: { azureId: '20636' },
} as const;

/** The Sort By menu as shown (foundation notes / page object). */
export const SORT_LABELS = ['Newest', 'Oldest', 'Email', 'Role', 'Expiration', 'Status', 'Last Modified'] as const;

/** The default order the list opens in. */
export const DEFAULT_SORT_BY = 'CreatedOn desc';
export const OLDEST_SORT_BY = 'CreatedOn asc';

/** The options 20627 picks (Oldest first, then menu order). */
// "oldest" first: the list OPENS on Newest, and picking the option already selected sends no request
// (full run 20627: newest -> sortBy ""), so Newest is chosen after moving away from it.
export const SORT_OPTIONS: readonly InvitationSortOption[] = ['oldest', 'newest', 'email', 'role', 'expiration', 'status', 'lastModified'];

/** The suite's payer for invitations of a payer-scoped role (decision 8 payer). */
export const PAYER_A = 'Al sharq';

/** The export's `format` value per choice (verified 2026-11-08). */
export const EXPORT_FORMAT = { csv: 1, excel: 2 } as const;

/** 20633's checklist: the list's columns and the export header that should carry each. */
export const EXPORT_CHECKLIST: ReadonlyArray<[string, RegExp]> = [
  ['email', /^e-?mail/i],
  ['role', /^role/i],
  ['payer', /^payer/i],
  ['status', /^status/i],
  ['date', /^(expir|created)/i],
];
