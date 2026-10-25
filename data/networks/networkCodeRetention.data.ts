import type { NetworkBlockedCase } from './network.data';

/**
 * Test data for US 14142 "Retain network codes permanently without reuse".
 *
 * Verified 2026-10-21: codes are system-generated - a never-approved draft
 * carries `NET-D-nnnn`, a published network `NET-nnnnnn` - and neither the Add
 * nor the Edit wizard offers a code field. A draft's deletion answers "The
 * draft network has been discarded."; a published network's deletion is
 * staged and applied through the approval queue.
 *
 * "Soft-deleted" networks are the case's own: drafts discarded, or published
 * networks whose deletion the case staged and approved. Codes are compared
 * among themselves; no shared network is deleted.
 */

export const CASE = {
  generated: '18021',
  distinct: '18023',
  neverReassigned: '18022',
  decisionTable: '18025',
  unchangedOnDelete: '18026',
  fieldsRetained: '18027',
  notEditable: '18028',
  adminOnlyAudit: '18029',
  concurrent: '18031',
  repeatedCycles: '18032',
  auditSearch: '18034',
} as const;

/** A generated code: `NET-D-nnnn` (draft) or `NET-nnnnnn` (published). */
export const NETWORK_CODE_PATTERN = /^NET-(D-)?\d+$/;

/** A code an API caller might try to force onto an existing network (18028). */
export const FORCED_CODE = 'NET-999999';

/** The status the sheet expects a soft-deleted record to show. */
export const DELETED_STATUS = /Deleted/i;

/** The audit action a deletion leaves. */
export const DELETE_AUDIT_ACTION = /delet/i;

/** How many create / delete cycles 18032 runs. */
export const CYCLES = 15;

export const BLOCKED_CASES: NetworkBlockedCase[] = [
  {
    azureId: '18024',
    title: 'should extend or roll the code format without collision when the code sequence reaches its maximum',
    reason:
      'Needs the network code sequence seeded one below its configured maximum - a database-level change in a test '
      + 'environment. The shared QC environment is at NET-0006xx and cannot be re-seeded by the suite. Unblocked by an '
      + 'environment whose sequence is set near its limit.',
  },
  {
    azureId: '18030',
    title: 'should reject an imported record whose code matches a used or soft-deleted code while importing the valid rows',
    reason:
      'Needs a bulk-import file with one previously used code and two new records, and the network Import flow '
      + '(Import button, upload drawer, results). The import upload and its results view are not modelled in this framework '
      + 'yet. Unblocked by an import page object and a prepared import file built from the export template.',
  },
];
