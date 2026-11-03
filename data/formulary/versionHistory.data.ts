import { ADMIN_NAME, FULL_ACCESS, SCOPED_PAYER, fullAccessWithout } from './formularyPermissions.data';
import type { FormularyBlockedCase } from './formulary.data';

/**
 * US 15214 "View Formulary - Version History" (formulary folder 17).
 *
 * Versions come from the fixture states: Future = v1 (Created, approved);
 * Active = v1 Created (Superseded) + v2 Updated (Published); Inactive adds v3
 * "Deactivated (v1)"; PendingChange adds a v3 awaiting approval; Rejected =
 * v1 Rejected. Every request is the administrator's ("CareConnect Admin
 * User"), and it is the only reviewer.
 *
 * Literal readings:
 * - The advanced-search field keys were never probed: each criterion is put
 *   into the drawer field whose key matches it (constants/formulary/writerCIds
 *   FORMULARY_VERSION_FILTER); a criterion with no such field is reported.
 * - 18812 / 18817 "Approved": the table labels approved versions Published /
 *   Superseded, so a row passes the "Approved" filter when it reads Approved,
 *   Published or Superseded, and no Pending / Draft / Rejected row is left.
 * - 18813 "versions requested by different users": the Payer Admin (shaped
 *   with the formulary rights) sends v1 and the administrator v2. If the
 *   Requested By column still shows one user, the precondition was not met and
 *   the case is BLOCKED at run time with what it showed.
 * - 18816 test data "[earliest - 1, latest + 1]" contradicts the expected "no
 *   records": the out-of-range check uses a day before the earliest and a day
 *   after the latest request, each on its own.
 * - 18822 "Reviewed By nonexistent.user": the reviewer criterion offers only
 *   real users; the no-match combination used is Approval Status "Rejected" on
 *   a formulary that has no rejected version.
 * - 18824 "Formulary Viewer": the Payer Admin role shaped without
 *   RevertFormularyVersion.
 */
export { ADMIN_NAME };

export const CASES = {
  fullHistory: { azureId: '18811' },
  // The approved option read "Published" on 2026-11-02 and "Approved" on 2026-11-03 (the filter
  // now offers only the statuses in the table): the spec takes whichever is offered.
  filterApproval: { azureId: '18812', status: /^(Approved|Published)$/ },
  filterRequester: { azureId: '18813', payerName: SCOPED_PAYER, shape: FULL_ACCESS },
  filterChangeType: { azureId: '18814', preferred: /Updat|Edit/i },
  filterRequestedOn: { azureId: '18816' },
  filterCombined: { azureId: '18817', status: /^(Approved|Published)$/, requester: ADMIN_NAME },
  newNumberedVersion: { azureId: '18818' },
  revertPublished: { azureId: '18819' },
  neverPublished: { azureId: '18820' },
  detailsReadOnly: { azureId: '18821' },
  // The status filter offers only the statuses present, so the empty combination is the
  // approved status with a requester who made none of the versions.
  noMatch: { azureId: '18822', status: /^(Approved|Published)$/, requester: 'No Such Requester' },
  revertCurrent: { azureId: '18823' },
  revertPermission: { azureId: '18824', payerName: SCOPED_PAYER, shape: fullAccessWithout('revert') },
  singleVersion: { azureId: '18825' },
  columnFormats: { azureId: '18826' },
  invalidRange: { azureId: '18827', range: '01/12/2026 - 01/01/2026' },
} as const;

/** A version row counted as "Approved". */
export const APPROVED_ROW = /Approved|Published|Superseded/i;
/** A version row that is NOT approved. */
export const NOT_APPROVED_ROW = /Pending|Draft|Rejected/i;
/** An empty table cell. */
export const EMPTY_CELL = /^(|—|-|–)$/;
/** A version label. */
export const VERSION_LABEL = /^v\d+$/;
/** A revert "already current" message. */
export const ALREADY_CURRENT = /already|current|active version|no change/i;
/** A version created by a revert. */
export const REVERT_CHANGE = /Revert|Restor/i;

/** `DD/MM/YYYY` of today shifted by `days`. */
export const dayText = (days = 0): string => {
  const d = new Date(Date.now() + days * 86_400_000);
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}`;
};

export const BLOCKED_CASES: FormularyBlockedCase[] = [
  {
    azureId: '18815',
    title: 'should list only the versions a selected reviewer reviewed when filtering by reviewer',
    reason:
      'Needs a formulary whose versions were REVIEWED by different users ("john.smith" and others). The environment has one '
      + 'account that may approve formulary changes (the administrator - the Payer Admin holds no approval right), so every '
      + 'version is reviewed by the same user and a reviewer filter cannot be shown to separate them. Runnable once a second '
      + 'approver account exists.',
  },
];
