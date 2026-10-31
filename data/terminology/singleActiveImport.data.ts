import { TERMINOLOGY_VIEW_ONLY } from '../accounts/payerAdminRole.data';
import { CODE_FIELD, codeRows, uploadHeaders } from './terminology.data';
import { stamped } from './defineTerminology.data';

/**
 * US 15157 "Limit One Active Import per Terminology" (terminology folder 11).
 *
 * "An import is currently running" needs an import that is still being
 * processed when the case looks at it; small files finish in about a second
 * here, so the precondition uploads a LARGE file (fixture `runningImport`) and
 * BLOCKS when even that finished before it could be observed running. The
 * sheet's "Country" and "Currency" terminologies are provisioned per run.
 */

export const IMPORT_HEADERS = uploadHeaders(['Code']);
export const IMPORT_FIELDS = [CODE_FIELD];

/** A file large enough to keep the background job busy for a while. */
export const LARGE_FILE_ROWS = 5000;
export const largeFile = (prefix: string): string[][] => codeRows(prefix, LARGE_FILE_ROWS);
export const smallFile = (prefix: string): string[][] => codeRows(prefix, 3);
/** Every row fails (no Code) - an import that completes as failed. */
export const failingFile = (): string[][] => [['', 'true'], ['', 'true']];

export const RUNNING = /running|processing|in progress|importing|pending/i;
export const BLOCKED_START = /already|running|in progress|wait|another import/i;

export const CASES = {
  startWhenIdle: { azureId: '20173', name: () => stamped('Country') },
  blockSecond: { azureId: '20175', name: () => stamped('Country') },
  otherTerminology: { azureId: '20176', running: () => stamped('Country'), other: () => stamped('Currency') },
  progressVisible: { azureId: '20178', name: () => stamped('Country'), startTime: /\d{1,2}[:/]\d{2}/, progress: /\d+\s*(%|\/|of)/i },
  afterCompletion: { azureId: '20177', name: () => stamped('Country'), completed: /completed/i },
  afterFailure: { azureId: '20179', name: () => stamped('Country'), failed: /^(Failed|CompletedWithErrors)$/ },
  simultaneous: { azureId: '20181', name: () => stamped('Country') },
  indicators: { azureId: '20180', name: () => stamped('Country') },
  noPermission: { azureId: '20182', name: () => stamped('Country'), granted: TERMINOLOGY_VIEW_ONLY },
  zeroToOne: { azureId: '20183', name: () => stamped('Country') },
  repeatedClicks: { azureId: '20184', name: () => stamped('Country'), clicks: 3 },
} as const;
