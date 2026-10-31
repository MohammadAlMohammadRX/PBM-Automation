import { ALL_TERMINOLOGY_PERMISSIONS } from '../accounts/payerAdminRole.data';
import { CODE_FIELD, DESCRIPTION_FIELD } from './terminology.data';
import type { TerminologyFieldSpec } from '../../utils/TerminologyProvisioning';

/**
 * US 15149 "View Terminology list with Usage Details" (terminology folder 01).
 *
 * The sheet's columns map onto the live list as: Terminology Name -> Name,
 * Terminology Description -> Description, Count of Fields -> Fields, Count of
 * Values -> Records, Status, Locked (verified 2026-10-29). The Fields count is
 * compared with the fields the server holds for the terminology (GetTerminology).
 */

/** The column headers the story requires, as the list labels them (sheet wording in comments). */
export const REQUIRED_COLUMNS = [
  /^Description$/i, // Terminology Description
  /^Name$/i, // Terminology Name
  /^Fields$/i, // Count of Fields
  /^Records$/i, // Count of Values
  /^Status$/i,
  /^Locked$/i,
];

/** The five actions a row offers (sheet step 4), by key, and the labels each may carry. */
export const ROW_ACTIONS = ['view', 'edit', 'toggleActive', 'toggleLocked', 'delete'] as const;

/** Many fields for the "maximum" end of the counts case. */
export const MANY_FIELDS: TerminologyFieldSpec[] = [
  CODE_FIELD,
  DESCRIPTION_FIELD,
  { name: 'Category', type: 'text', restriction: 'none' },
  { name: 'Weight', type: 'number' },
  { name: 'Effective Date', type: 'date', restriction: 'dateOnly' },
  { name: 'Billable', type: 'boolean' },
];

export const CASES = {
  columns: { azureId: '20053' },
  predefinedMarked: { azureId: '20052', marker: /predefined/i },
  lockedNoEditDelete: { azureId: '20050' },
  unlock: { azureId: '20051' },
  actionMatrix: { azureId: '20054' },
  emptyState: { azureId: '20055', empty: /no terminolog|no records|no results|no data|nothing/i },
  counts: {
    azureId: '20056',
    /** Only the default field (one custom field + the automatic Is Active), no values. */
    minimum: { fields: [CODE_FIELD], expectedRecords: '0' },
    /** Many fields (six custom + Is Active) and three values. */
    maximum: { fields: MANY_FIELDS, records: [{ Code: 'MAX-1' }, { Code: 'MAX-2' }, { Code: 'MAX-3' }], expectedRecords: '3' },
  },
  noAccess: { azureId: '20057', withdrawn: ALL_TERMINOLOGY_PERMISSIONS },
  predefinedBypass: { azureId: '20058' },
  sortAndFilter: { azureId: '20059' },
  viewReadOnly: { azureId: '20060' },
} as const;
