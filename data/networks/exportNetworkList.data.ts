import { NETWORK_EXPORT_FILE, NETWORK_EXPORT_HEADERS, NETWORK_LIFECYCLE, uniqueArabic } from './network.data';
import { networkStamp } from '../../utils/NetworkProvisioning';

/**
 * Test data for US 14121 "Export network list to CSV or Excel".
 *
 * The live flow (verified 2026-10-21): Export opens a MENU - Export Template /
 * Selected Export / Export All Data - and choosing a scope raises a dialog
 * "Export - Choose the record type and the file format." with Cancel /
 * CSV (.csv) / Excel (.xlsx). The sheet's two scopes map onto the menu as:
 *
 *   'All Networks'     -> "Export All Data"  (scope 'all')
 *   'Filtered Results' -> "Selected Export"  (scope 'selected')
 *
 * VERIFIED: "Selected Export" writes the CURRENT PAGE only (10 rows), so the
 * cases that expect every filtered record across pages fail - that is the
 * finding, asserted as the sheet states it.
 */

export const SCOPE = { allNetworks: 'all', filteredResults: 'selected' } as const;

/** The scope labels the sheet expects the prompt to offer. */
export const SHEET_SCOPE_LABELS = ['All Networks', 'Filtered Results'] as const;

export const EXPORT_HEADERS = [...NETWORK_EXPORT_HEADERS];
export const EXPORT_FILE = NETWORK_EXPORT_FILE;

/** An Excel workbook is a zip: its first two bytes are "PK". */
export const XLSX_SIGNATURE = 'PK';

/** The sheet's "Network Type = Pharmacy" has no equivalent; HMO is the type used. */
export const TYPE_FILTER = 'HMO';
export const STATUS_FILTER = NETWORK_LIFECYCLE.active;

export const CASES = {
  allCsv: { azureId: '17761' },
  allExcel: { azureId: '17762' },
  filteredCsv: { azureId: '17765', status: STATUS_FILTER },
  filteredExcel: { azureId: '17763', type: TYPE_FILTER },
  acrossPages: { azureId: '17764', status: STATUS_FILTER },
  zeroMatch: { azureId: '17766', term: `NONEXISTENT ${networkStamp()}` },
  combinations: { azureId: '17767', status: STATUS_FILTER },
  states: { azureId: '17768' },
  analystFlow: { azureId: '17769', status: STATUS_FILTER, type: TYPE_FILTER },
  cancel: { azureId: '17770' },
  repeated: { azureId: '17771', clicks: 3 },
  integrity: { azureId: '17775', nameArPrefix: 'شبكة الرعاية' },
  noSelection: { azureId: '17772' },
  permission: { azureId: '17773' },
} as const;

/** The four scope x format combinations (17767). */
export const COMBINATIONS = [
  { scope: SCOPE.allNetworks, format: 'csv', extension: '.csv' },
  { scope: SCOPE.allNetworks, format: 'excel', extension: '.xlsx' },
  { scope: SCOPE.filteredResults, format: 'csv', extension: '.csv' },
  { scope: SCOPE.filteredResults, format: 'excel', extension: '.xlsx' },
] as const;

/** A unique Arabic name for the integrity case's own network. */
export const integrityArabicName = (): string => uniqueArabic(CASES.integrity.nameArPrefix);

/** "2026-10-20 12:01" (export) -> "20/10/2026 12:01" (list), for comparing a row with its export. */
export const exportDateToList = (value: string): string => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}:\d{2}))?/);
  return match ? `${match[3]}/${match[2]}/${match[1]}${match[4] ? ` ${match[4]}` : ''}` : value;
};
