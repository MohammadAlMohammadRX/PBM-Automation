import { TERMINOLOGY_VIEW_ONLY } from '../accounts/payerAdminRole.data';
import { stamped } from './defineTerminology.data';
import { textOfLength } from '../../utils/TerminologyProvisioning';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import type { TerminologyBlockedCase } from './terminology.data';

/**
 * US 15147 "Export Terminology list to File" (terminology folder 05).
 *
 * The list's Export opens Selected Export / Export All Data, then the shared
 * format dialog (CSV / Excel). The register holds more terminologies than one
 * page (10 rows), so "all records regardless of pagination" is checked against
 * the register's own total. The sheet's 2000-character description cannot be
 * stored (the description is capped at 250, US 15150), so the long-text case
 * uses the longest description the application accepts.
 */

/** An .xlsx file is a zip archive - it starts "PK". */
export const XLSX_SIGNATURE = 'PK';

/** The name column of the export, by whatever the header calls it. */
export const NAME_HEADER = /name/i;

export const CASES = {
  csv: { azureId: '20101', extension: /\.csv$/i },
  excel: { azureId: '20102', extension: /\.xlsx$/i },
  allRecords: { azureId: '20103', pageSize: 10 },
  emptyResult: { azureId: '20105', term: 'zzznomatch', nothing: /nothing|no (records|data|results|terminolog)|empty/i },
  formats: { azureId: '20106', csv: /\.csv$/i, excel: /\.xlsx$/i },
  progress: { azureId: '20107', inProgress: /in progress|exporting|processing|preparing/i, completed: /completed|ready/i },
  noPermission: { azureId: '20108', granted: TERMINOLOGY_VIEW_ONLY },
  failure: { azureId: '20109', endpoint: ApiEndpoints.terminologyExport, error: /error|failed|could not|unable|went wrong/i },
  readable: { azureId: '20111', sample: 3 },
  specialCharacters: {
    azureId: '20110',
    name: () => `${stamped('Codes, "Quoted"')} & <Symbols>`,
    description: () => textOfLength(250, 'Long, "quoted"; text & more '),
  },
} as const;

export const BLOCKED_CASES: TerminologyBlockedCase[] = [
  {
    azureId: '20104',
    title: 'should complete the export with every record correctly formatted when the catalogue holds 10,000 or more terminologies',
    reason:
      'Needs a terminology catalogue of 10,000+ terminologies; the QC register holds about a dozen, and building '
      + 'ten thousand terminologies (each with its own fields) for one case would flood the shared environment. '
      + 'Runnable against a volume-test environment seeded to that size.',
  },
];
