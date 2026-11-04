import { OPTIONS } from './policy.data';
import { SUITE_POLICY_PREFIX, policyStamp } from '../../utils/PolicyProvisioning';

/**
 * US 15166 "Policy List - Search, Sort and Export policies" (policy folder 02).
 * 19478 (status changing by itself on the effective date) is Manual and not automated.
 *
 * How the cases map onto the live list (2026-11-03, SCREEN-MAP.md / Foundation notes):
 *  - There is NO advanced search: the Filters button beside the search box opens nothing.
 *    Every case that opens it asserts it opens (the finding) and then searches with the
 *    list's search box, so the search itself is still exercised.
 *  - Quick filters: Status, Type, Plan, Approval - no Payer (19469 / 19470 assert one).
 *    19469 then puts its payer in the app's top-bar payer scope (the screen's only payer
 *    control) so its results check covers the three criteria (2026-11-04).
 *    The plan filter's options read "<plan> (PLN-nnnn)". A status cell may carry the
 *    "In Grace" tag beside its status badge; the badge alone is compared.
 *  - Sort is a "Sort By" menu, not column headers: the case's "sort control on the
 *    column" is the menu entry for that field, its indicator the menu's CHECKED option
 *    (the trigger always reads "Sort By"). Members is not offered (19473 asserts it).
 *  - Export: Export Template / Selected Export / Export All Data, then CSV or Excel. The
 *    case's "export-filtered-results scope" (19476, and 19479's current view) is Selected
 *    Export: with a filter or search on it sends scope "Filtered" (bundle, 2026-11-04);
 *    Export All Data always sends "All".
 *  - Test data the register cannot hold as written is replaced by the case's own policy:
 *    "POL-10045" -> the case's draft's number, "Gold Health Plan" -> its own names,
 *    "Al Faisal Trading Co." -> a holder the application offers (Globex Corporation),
 *    "5,000+ policies" (19480) -> the whole register, whatever its size.
 *  - Template (19477): an import template's headers are the policy's own fields; checked
 *    against the list's data columns (computed ones - number, members, status, approval -
 *    are not entered in a template).
 *  - 19481: the case expects the rejected second change to show "Rejected" with a NEW
 *    version number (v2); the version badge is read on the list row.
 */

/** A searchable shared name for a case's two policies: `QA Automation Policy Combo <stamp>`. */
export const comboTerm = (): string => `${SUITE_POLICY_PREFIX} Combo ${policyStamp()}`;

/** A name carrying a comma and a quotation mark (19480). */
export const specialName = (): string => `${SUITE_POLICY_PREFIX} Comma, "Quote" ${policyStamp()}`;

/** Quick filter "no filter" options. */
export const NO_FILTER = {
  status: OPTIONS.statusFilter[0],
  type: OPTIONS.typeFilter[0],
  plan: 'All Plans',
  approval: OPTIONS.approvalFilter[0],
} as const;

/** List columns and the export header carrying the same data (19475). */
export const EXPORT_COLUMN_OF: ReadonlyArray<['number' | 'type' | 'plan' | 'payer' | 'holder' | 'status', RegExp]> = [
  ['number', /number/i],
  ['type', /type/i],
  ['plan', /plan/i],
  ['payer', /payer/i],
  ['holder', /holder/i],
  ['status', /^status$/i],
];

/** The policy fields a template must carry (19477). */
export const TEMPLATE_FIELDS: ReadonlyArray<[string, RegExp]> = [
  ['Policy name', /name/i],
  ['Policy type', /type/i],
  ['Plan', /plan/i],
  ['Policy holder', /holder/i],
  ['Effective date', /effective/i],
  ['Expiry date', /expiry|expir/i],
];

export const CASES = {
  byNumber: { azureId: '19466' },
  byName: { azureId: '19467' },
  byHolder: { azureId: '19468', holder: 'Globex Corporation' },
  /** Type Group + Status Active + Payer "Al sharq", then Status Future (the case's own Group policy). */
  combined: { azureId: '19469', type: 'Group', status: 'Active', changedStatus: 'Future' },
  quickFilters: { azureId: '19470', type: 'Individual', status: 'Future', approval: 'Draft' },
  defaultSort: { azureId: '19471', indicator: /Newest to Oldest/i, sortBy: /^createdon\s+desc$/i },
  termLength: { azureId: '19472', single: 'Q', maxLength: 100 },
  sortColumns: { azureId: '19473' },
  noMatch: { azureId: '19474', number: 'POL-99999' },
  exportCsv: { azureId: '19475' },
  exportFilteredExcel: { azureId: '19476', status: 'Active' },
  template: { azureId: '19477' },
  combinedExport: { azureId: '19479' },
  /** "Within an acceptable time": the full Excel export within 60 s. */
  specialChars: { azureId: '19480', maxExportSeconds: 60 },
  approvalVersion: { azureId: '19481' },
} as const;
