import { PAYER_EXPORT_COLUMN } from '../../constants/ElementIds';
import { MISSING_SCOPE, SCOPE_FILTER } from './exportScope.data';
import { nonAdminBlockReason } from '../accounts/nonAdminAccount.data';
import type { BlockedCase } from './payerTypes';

/**
 * Test data for "Export Payer List to CSV and Excel".
 *
 * The export menu, its scope prompt and CSV parsing are owned by the
 * export-scope story (folder 28) and reused whole. This sheet's own ground is
 * the FILE: both formats, the column checklist, the naming convention and its
 * timestamp, encoding of Arabic and special characters, the empty and full
 * register, service failure, and whether sort and search carry into the file.
 *
 * TWO SHEET CONFLICTS ARE ASSERTED AS WRITTEN AND REPORTED. This sheet expects
 * a "filtered results" scope and NO prompt when no filter is applied; the
 * application offers "selected"/"all" and prompts every time - which the
 * export-scope sheet (23) expects. Each case asserts its own sheet, so the
 * disagreement surfaces as findings rather than being resolved silently.
 */

/** Columns the checklist requires in the file (the visible ones plus the extra four). */
export const REQUIRED_EXPORT_COLUMNS = [
  PAYER_EXPORT_COLUMN.code,
  PAYER_EXPORT_COLUMN.nameEn,
  PAYER_EXPORT_COLUMN.nameAr,
  PAYER_EXPORT_COLUMN.payerType,
  PAYER_EXPORT_COLUMN.email,
  PAYER_EXPORT_COLUMN.dialCode,
  PAYER_EXPORT_COLUMN.phone,
  PAYER_EXPORT_COLUMN.licenseNumber,
  PAYER_EXPORT_COLUMN.status,
] as const;

/** The naming convention, per format, with the timestamp captured. */
export const EXPORT_FILE_NAME = {
  csv: /^PayerList_(\d{8})_(\d{6})\.csv$/,
  excel: /^PayerList_(\d{8})_(\d{6})\.xlsx?$/,
} as const;

/** How far the embedded timestamp may sit from the moment of export. */
export const TIMESTAMP_TOLERANCE_MS = 3 * 60_000;

/** An .xlsx is a zip: its first two bytes are "PK". */
export const XLSX_MAGIC = 'PK';

/** The scope this sheet expects and the app does not offer. */
export const FILTERED_SCOPE = MISSING_SCOPE;

/** A search that matches no payer - the export-scope story's. */
export const NO_MATCH_SEARCH = SCOPE_FILTER.noMatchSearch;

/** A licence carrying the characters the encoding case names. */
export const SPECIAL_LICENCE = 'LIC-&%,"Q"-EXP1';

/** How many on-screen rows to compare against the file's order. */
export const ORDER_SAMPLE = 5;

/**
 * Parses "PayerList_YYYYMMDD_HHMMSS" into a Date, or null.
 *
 * VERIFIED: the server stamps the file in UTC - an export at 17:52 Riyadh
 * time is named `_145222` - so the digits are read as UTC. Read as local time
 * they sat a flat three hours from the export moment.
 */
export const parseExportTimestamp = (filename: string): Date | null => {
  const match = /PayerList_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/.exec(filename);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match.map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s));
};

/** The account the access-control case needs. */
export const EXPORT_ROLE_REQUIREMENT = {
  role: 'a read-only role without Export Payers',
  reason: 'The case proves the Export control is withheld from a role without the permission; the shared administrator cannot show the refusal.',
} as const;

/** The sheet's cases this environment cannot exercise, in renumbered order. */
export const BLOCKED_CASES: readonly BlockedCase[] = [
  {
    id: '015',
    title: 'should behave consistently across combined filters, sorting and column configurations',
    reason: 'An exploratory session across filter, sort and column combinations is a manual activity; its deterministic parts (scope, order, search) are the cases here.',
  },
];
