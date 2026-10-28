import type { NetworkBlockedCase } from '../networks/network.data';
import { networkStamp } from '../../utils/NetworkProvisioning';
import { DISPOSABLE_PLAN_PREFIX } from '../../utils/PlanProvisioning';
import { PLAN_LIFECYCLE, PLAN_MESSAGE } from './plan.data';
import { PLAN_SUITE } from './planSuite.data';

/**
 * Test data for US 14158 "Export plan directory to CSV or Excel" (plan folder
 * 09; network twin: tests/network/04 + data/networks/exportNetworkList.data.ts).
 *
 * The flow is the network list's (same component): Export opens a MENU
 * (Selected Export / Export All Data) and choosing one raises the format dialog
 * (Cancel / CSV / Excel). So the sheet asks for format then scope, and the
 * screen asks scope then format - each case walks the screen's order and
 * asserts each of the sheet's expectations where the screen meets it. The
 * sheet's scopes map onto the menu as:
 *
 *   'All plans'                -> "Export All Data" (scope 'all')
 *   'Current filtered results' -> "Selected Export" (scope 'selected')
 *
 * The export's column headers are not read off a live file yet, so columns are
 * found by pattern (exportColumn) rather than by an exact header list.
 */

export type PlanBlockedCase = NetworkBlockedCase;

export const SCOPE = { allPlans: 'all', filteredResults: 'selected' } as const;

/** "Plans_yyyyMMdd_HHmmss.{ext}" - the AC's file name, zero-padded. */
export const EXPORT_FILENAME = {
  csv: /^Plans_\d{8}_\d{6}\.csv$/,
  excel: /^Plans_\d{8}_\d{6}\.xlsx$/,
} as const;

/** An Excel workbook is a zip: its first two bytes are "PK". */
export const XLSX_SIGNATURE = 'PK';

/** How far the file's timestamp may sit from the test machine's clock (time zones included). */
export const FILENAME_CLOCK_WINDOW_MS = 15 * 60 * 60_000;

/** The timestamp a "Plans_yyyyMMdd_HHmmss" name carries, or null when it carries no valid one. */
export const filenameTimestamp = (filename: string): Date | null => {
  const m = filename.match(/_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\./);
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1).map(Number);
  const date = new Date(year, month - 1, day, hour, minute, second);
  const valid = date.getMonth() === month - 1 && date.getDate() === day && hour < 24 && minute < 60 && second < 60;
  return valid ? date : null;
};

/** Export columns, found by header pattern (the live headers are not pinned yet). */
export const EXPORT_COLUMN = {
  code: /code/i,
  payer: /payer/i,
  status: /^status$/i,
  version: /^(current )?version( (no\.?|number))?$/i,
} as const;

/** The header of a column matching `pattern` ('' when the file has none). */
export const exportColumn = (headers: string[], pattern: RegExp): string => headers.find((header) => pattern.test(header.trim())) ?? '';

/** The on-screen headers a file must carry - the Actions column is not data. */
export const dataHeaders = (headers: string[]): string[] =>
  headers.map((header) => header.replace(/\s+/g, ' ').trim()).filter((header) => header !== '' && !/^actions?$/i.test(header));

/** Case-insensitive header comparison. */
export const sameHeader = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The version number a cell holds ("2", "v2", "Version 2"); -1 when none. */
export const versionNumber = (cell: string | undefined): number => Number(((cell ?? '').match(/\d+/) ?? ['-1'])[0]);

/** A status a reader can understand: words, not a GUID or a number. */
export const READABLE_STATUS = /^\p{L}[\p{L} ]*$/u;

/** The four format x scope combinations (19029), each with the status its rows must all carry (null = any). */
export const COMBINATIONS = [
  { scope: SCOPE.allPlans, format: 'csv', extension: '.csv', label: 'CSV + All plans', onlyStatus: null },
  { scope: SCOPE.filteredResults, format: 'csv', extension: '.csv', label: 'CSV + Current filtered results', onlyStatus: PLAN_LIFECYCLE.active },
  { scope: SCOPE.allPlans, format: 'excel', extension: '.xlsx', label: 'Excel + All plans', onlyStatus: null },
  { scope: SCOPE.filteredResults, format: 'excel', extension: '.xlsx', label: 'Excel + Current filtered results', onlyStatus: PLAN_LIFECYCLE.active },
] as const;

export const CASES = {
  allCsv: { azureId: '19026', minimumPlans: 5 },
  // The sheet's "Payer = Bupa Arabia" is not a payer of this environment; the suite payer is used.
  filteredExcel: { azureId: '19027', payer: PLAN_SUITE.payerName },
  zeroRecords: { azureId: '19028', term: (): string => `NOSUCHPLAN ${networkStamp()}`, empty: PLAN_MESSAGE.noPlansFound },
  combinations: { azureId: '19029', status: PLAN_LIFECYCLE.active },
  cancel: { azureId: '19030' },
  exploration: { azureId: '19032', term: DISPOSABLE_PLAN_PREFIX, status: PLAN_LIFECYCLE.active },
  columns: { azureId: '19033' },
  latestVersion: { azureId: '19034', currentVersion: 2, status: PLAN_LIFECYCLE.inactive },
  localized: { azureId: '19035' },
  // The sheet's 23:59:59 boundary needs a settable clock on the server that names
  // the file; the pattern and zero-padding are asserted on every export instead.
  filename: { azureId: '19036' },
  permission: { azureId: '19037', permission: 'exportPlans' as const },
  /**
   * A published plan offers no Edit (live fact, 2026-10-27), so the "edit and
   * save" that makes version 2 is the one change a published plan accepts: an
   * inactivation, sent and approved (v1 -> v2).
   */
  versionColumn: { azureId: '19038', before: 1, after: 2, afterCell: /^v2\b/ },
  serviceDown: { azureId: '19039', exportRequest: /export/i },
} as const;

export const BLOCKED_CASES: PlanBlockedCase[] = [
  {
    azureId: '19031',
    title: 'should produce a consistent, uncorrupted file when a plan is saved by another user while the export runs',
    reason:
      'Needs a SECOND signed-in user saving a new version of a plan inside the window in which the server builds the '
      + 'export file. The suite has one administrator session, and a published plan offers no Edit, so a concurrent '
      + 'save cannot be aligned with the export request. Runnable with a second plan-editor account and a hook that '
      + 'holds the export request open while that account saves.',
  },
];
