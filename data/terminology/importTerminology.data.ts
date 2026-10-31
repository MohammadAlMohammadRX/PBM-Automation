import { TERMINOLOGY_VIEW_ONLY } from '../accounts/payerAdminRole.data';
import { IS_ACTIVE_FIELD, type TerminologyBlockedCase } from './terminology.data';
import type { TerminologyFieldSpec } from '../../utils/TerminologyProvisioning';

/**
 * US 15153 "Import Terminology Records from a File" (terminology folder 08).
 *
 * The Upload Data drawer accepts Excel (.xlsx); its template's columns are the
 * terminology's field names plus Is Active (verified 2026-10-29 - there is no
 * "DB ID" column). The sheet's DB ID cases are kept: their files carry a
 * "DB ID" column holding the record's row id. Each upload is processed by a
 * background job (UploadTerminologyImport -> Pending -> Completed /
 * CompletedWithErrors).
 */

export const DB_ID = 'DB ID';

export const IMPORT_FIELDS: TerminologyFieldSpec[] = [
  { name: 'Code', type: 'text', restriction: 'none', maxLength: 50, required: true, unique: true },
  { name: 'Description', type: 'text', restriction: 'none', maxLength: 255 },
  { name: 'Effective Date', type: 'date', restriction: 'dateOnly' },
];

/** The template's own header for IMPORT_FIELDS. */
export const TEMPLATE_HEADERS = ['Code', 'Description', 'Effective Date', IS_ACTIVE_FIELD];
/** The sheet's header: the template plus DB ID first. */
export const DB_ID_HEADERS = [DB_ID, ...TEMPLATE_HEADERS];

/** A valid date in the format the import accepts. */
export const VALID_DATE = '2026-01-15';

export const row = (code: string, description = 'Imported row', date = VALID_DATE, active = 'true'): string[] => [code, description, date, active];

export const CASES = {
  template: { azureId: '20136', dbId: DB_ID, extension: /\.xlsx$/i },
  newAndUpdated: { azureId: '20137', existing: ['UPD-1', 'UPD-2', 'UPD-3', 'UPD-4', 'UPD-5'], fresh: ['NEW-1', 'NEW-2', 'NEW-3', 'NEW-4', 'NEW-5'], revised: 'Revised by import' },
  background: { azureId: '20138', rows: 5000, prefix: 'BULK', state: /processing|pending|running|completed|import/i },
  successNotification: { azureId: '20139', rows: 3, prefix: 'OK', notice: /import/i, success: /success|completed|imported/i },
  failureNotification: { azureId: '20140', valid: 3, invalid: 2, notice: /import/i, failure: /fail|error/i },
  failedRecordsFile: { azureId: '20141', missingCode: '', duplicate: 'DUP-FILE-1', badDate: 'not-a-date', reason: /required|unique|date|invalid/i },
  emptyDbId: { azureId: '20142', code: 'TERM-NEW-100' },
  existingDbId: { azureId: '20143', code: 'TERM-UPD-1001', before: 'Original description', after: 'Revised description' },
  structureMismatch: { azureId: '20144', headers: ['Description', 'Effective Date', IS_ACTIVE_FIELD], error: /column|header|structure|template|match/i },
  unsupportedType: { azureId: '20145', file: 'terminology_data.txt', content: 'Code,Description\nTXT-1,Plain text file' },
  duplicateInFile: { azureId: '20146', code: 'TERM-DUP-01', rows: 8, duplicateRows: [2, 7] },
  headerOnly: { azureId: '20148' },
  statusTransitions: { azureId: '20149', rows: 50, prefix: 'STATE', processing: /processing|pending|in progress/i, final: /^(Completed|CompletedWithErrors)$/ },
  noPermission: { azureId: '20150', granted: TERMINOLOGY_VIEW_ONLY },
} as const;

/** The duplicate-in-file case's rows: rows 2 and 7 share one Code, the rest are unique. */
export const duplicateFileRows = (): string[][] =>
  Array.from({ length: CASES.duplicateInFile.rows }, (_, i) =>
    row((CASES.duplicateInFile.duplicateRows as readonly number[]).includes(i + 1) ? CASES.duplicateInFile.code : `UNIQUE-${i + 1}`));

export const BLOCKED_CASES: TerminologyBlockedCase[] = [
  {
    azureId: '20147',
    title: 'should reject the file before processing when it is one unit over the maximum upload size',
    reason:
      'The maximum upload size is not documented anywhere the suite can read (the Upload Data drawer states only '
      + '"Accepted format: .xlsx"), so a file "max + 1 MB" cannot be built. Runnable once the limit is published '
      + '(System Settings or the story) - the case then uploads a workbook of exactly that size plus one megabyte.',
  },
];
