/**
 * The payer list's bulk Import (US 16218) - verified live 2026-11-24.
 *
 * The drawer is the shared bulk component (`payer-list-bulk-import`, suffixes
 * as FORMULARY_IMPORT / BULK_IMPORT_PART), its Upload history
 * `payer-list-bulk-history` (rows `-table-row-{operationId}`, cells
 * `-cell-{filename|uploadedby|uploadedon|totalrows|succeededrows|failedrows|status}`,
 * result downloads `-result-{csv|excel}-{operationId}`).
 *
 * Adding a file starts the import (POST ImportPayers, multipart `file`) - there
 * is no preview or Upload button. The drawer closes and a bottom "Upload
 * complete" panel (`bulk-upload-toast-*`) lists each operation as
 * `bulk-upload-{operationId}`: "<file> Payers Succeeded: n Failed: n".
 */
export const PAYER_IMPORT = {
  trigger: 'payer-list-import-trigger',
  drawer: 'payer-list-bulk-import',
  history: 'payer-list-bulk-history',
} as const;

/** The bottom bulk-upload panel shared by every module. */
export const BULK_UPLOAD_TOAST = {
  title: 'bulk-upload-toast-title',
  list: 'bulk-upload-toast-list',
  clear: 'bulk-upload-toast-clear',
  /** `bulk-upload-{operationId}` - one entry per operation. */
  itemPrefix: 'bulk-upload-',
  /** `bulk-upload-result-{operationId}` - the entry's result download. */
  resultPrefix: 'bulk-upload-result-',
} as const;

/** History cell keys (`-cell-{key}`). */
export const BULK_HISTORY_CELL = {
  file: 'filename',
  uploadedBy: 'uploadedby',
  uploadedOn: 'uploadedon',
  total: 'totalrows',
  succeeded: 'succeededrows',
  failed: 'failedrows',
  status: 'status',
} as const;
