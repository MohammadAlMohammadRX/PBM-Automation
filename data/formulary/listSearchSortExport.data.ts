import { FORMULARY_STATUS } from './formulary.data';
import { SUITE_FORMULARY_PREFIX, formularyStamp } from '../../utils/FormularyProvisioning';

/**
 * US 15191 "Formulary list - Search, Sort and Export" (formulary folder 01).
 * 18580 (expiry on its exact date) is Manual and not automated.
 *
 * How the sheet maps onto the live list (2026-11-02):
 *  - "Payer" is a column and the top-bar payer scope (`app-breadcrumb-payer-select`);
 *    the advanced-search drawer offers Search / Status / Approval Status only, so
 *    18576 sets the payer through the scope and asserts the drawer's fields as written.
 *  - The Sort menu offers Name, Code, Status, Effective Date, Expiry Date, Created
 *    On and Last Modified - no Owning Payer; 18582 asserts the sheet's five fields.
 *  - Approval status is shown with its version: `v<n> · Draft|Pending Approval|Approved|Rejected`.
 *  - Status "Future" is the code `pending` ("Pending" in the filters).
 *  - Exports are the shared Export menu ("Export All Data") + CSV / Excel format dialog.
 */

/** A suite name carrying a searchable word ("Diabetes"). */
export const namedWith = (word: string): string => `${SUITE_FORMULARY_PREFIX} ${word} Care ${formularyStamp()}`;

/** The list columns the story requires (sheet wording -> live header). */
export const REQUIRED_HEADERS: ReadonlyArray<[string, RegExp]> = [
  ['Name', /^Name$/i],
  ['Code', /^Code$/i],
  ['Owning Payer', /^(Owning )?Payer$/i],
  ['Tier Count', /^Tiers?( Count)?$/i],
  ['Trade Count', /^Trades?( Count)?$/i],
  ['Effective Date', /^Effective Date$/i],
  ['Expiry Date', /^Expiry Date$/i],
  ['Status', /^Status$/i],
  ['Approval Status', /^Approval Status$/i],
];

/** Each list column and the export header that carries the same data (18583 / 18584: "the same columns"). */
export const EXPORT_COLUMN_OF: ReadonlyArray<[string, RegExp]> = [
  ['Name', /name/i],
  ['Code', /code/i],
  ['Payer', /payer/i],
  ['Tiers', /tier/i],
  ['Trades', /trade/i],
  ['Effective Date', /effective/i],
  ['Expiry Date', /expiry/i],
  ['Status', /^status$/i],
  ['Approval Status', /approval|version/i],
];

/** The values the Status column may show (US 15191 AC). */
export const VALID_STATUSES = [FORMULARY_STATUS.notLive, FORMULARY_STATUS.active, FORMULARY_STATUS.inactive, FORMULARY_STATUS.future, FORMULARY_STATUS.expired] as const;

/** `v<n> · <approval status>` - the only valid Approval Status cell. */
export const APPROVAL_CELL = /^v\d+ · (Draft|Pending Approval|Approved|Rejected)$/;

/** A list date: `DD/MM/YYYY HH:mm`. */
export const LIST_DATE = /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/;

/** The version number a `v<n> · ...` cell carries. */
export const versionOf = (cell: string): number => Number((cell.match(/^v(\d+)/) ?? ['', 'NaN'])[1]);

export const CASES = {
  columns: { azureId: '18574' },
  quickSearch: { azureId: '18575', term: 'Diabetes' },
  /** Payer A = the suite payer; Status Active; Approval Status Approved. */
  advancedFilters: { azureId: '18576', status: 'Active', approvalStatus: 'Approved', fields: [/payer/i, /status/i, /approval status/i] },
  noMatch: { azureId: '18577', term: 'ZZZNoMatch' },
  draftToApproved: { azureId: '18578' },
  /**
   * Formulary A is approved with an effective time minutes from now and read
   * once that time has passed (TODAY); Formulary B is effective tomorrow. The
   * sheet expects A to read Active on its effective date by itself - the
   * foundation probe saw a first approval read Future until the DAILY lifecycle
   * job, so A reading Future is the finding this case reports.
   */
  activeOnEffectiveDate: { azureId: '18579', effectiveInMinutes: 2, tomorrowInMinutes: 24 * 60 + 30 },
  /**
   * "Version number has incremented based on the second approval decision":
   * after reject, reject, approve the record's version must be above the first
   * version (1) and match the newest row of its Version History.
   */
  versionAfterRejections: { azureId: '18581', change: 'Changed after a rejection by the automation suite.' },
  /** The sheet's five sortable fields; Owning Payer is not offered by the Sort menu. */
  sortFields: { azureId: '18582', payerOption: /payer/i },
  exportCsv: { azureId: '18583', extension: /\.csv$/i },
  exportExcel: { azureId: '18584', extension: /\.xlsx$/i },
  /**
   * Draft v>0 = a published formulary with a staged change (DraftChange); its
   * sheet line "View, Clone, Send for Approval and Delete are Deactivate
   * enabled" is read as all five enabled. Expired is an existing Expired
   * formulary of the register, read only (Expired cannot be produced on demand).
   */
  actionsByStatus: { azureId: '18585' },
  /**
   * "Filter: Payer = Nonexistent Payer": no such payer can be put in scope, so
   * the empty result is produced with a search no formulary matches. The sheet's
   * expected line ("The system generate a blank or broken export file") is read
   * with its title: the export is PREVENTED - no blank or broken file, and a
   * clear message instead.
   */
  emptyExport: { azureId: '18586', term: 'ZZZNoMatchExport' },
  consistentFormat: { azureId: '18587', statusFilters: ['Not Live', 'Pending', 'Active', 'Inactive', 'Expired'] as const },
  /** Search on the suite prefix, then status Not Live, sorted by Expiry Date; exported to Excel. */
  combined: { azureId: '18588', status: 'Not Live', expiryDays: [120, 240] as const },
} as const;
