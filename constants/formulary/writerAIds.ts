/**
 * Ids and endpoints the Formulary folders 01 / 02 / 04 / 08 / 15 / 16 / 18
 * need beyond constants/ElementIds.ts and constants/ApiEndpoints.ts (writer A,
 * 2026-11-02). Read off the application bundle
 * (reports/formulary/probe/bundle/chunk-VMD4MUM4.js - the shared bulk import /
 * history components - and chunk-DKMKJIP5.js - the bulk-operation tracker);
 * NOT yet verified live.
 */

/** The shared bulk-operation service the import tracker polls (chunk-DKMKJIP5). */
export const BULK_OPERATION_ENDPOINT = {
  /** POST `{ ids: [operationId] }` -> the operations' progress (status, totalRows, succeededRows, failedRows, createdRows, updatedRows, errorMessage). */
  status: '/api/BulkOperations/GetBulkOperationsStatus',
  /** POST `{}` -> the signed-in user's running imports. */
  myActive: '/api/BulkOperations/GetMyActiveBulkOperations',
} as const;

/** The final states of a bulk operation (the tracker's terminal list). */
export const BULK_FINAL_STATUS = ['Completed', 'CompletedWithErrors', 'Failed'] as const;

/**
 * The bulk Import drawer's parts not in FORMULARY_IMPORT (`{namespace}-{suffix}`):
 * the file-type / size error under the drop zone, the server error box, the
 * "Uploading ..." file name and the running-import lock notice.
 */
export const BULK_IMPORT_PART = {
  fileError: 'file-error',
  error: 'error',
  fileName: 'file-name',
  lock: 'lock',
} as const;

/**
 * The Upload history drawer (`{list|detail}-bulk-history`): its table
 * (`-table`, the shared table: rows `-table-row-{id}`) and the per-row result
 * downloads (`-result-csv`, `-result-excel`). Columns: File, Entity, Record,
 * Uploaded By, Uploaded On, Total, Succeeded, Failed, Status.
 */
export const BULK_HISTORY_PART = {
  title: 'title',
  table: 'table',
  resultCsv: 'result-csv',
  resultExcel: 'result-excel',
} as const;
