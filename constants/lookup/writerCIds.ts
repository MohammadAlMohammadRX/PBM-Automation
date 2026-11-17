import { DIALOG, DIALOG_ACTION, TOAST } from '../ElementIds';
import { LOOKUP_ITEMS } from './lookupIds';

/**
 * Writer C ids - Lookups Management folders 05 (Export Lookup Items, US 20857)
 * and 07 (Delete Lookup Item, US 20859).
 *
 * INFERRED, NOT YET VERIFIED LIVE (the foundation did not open the items
 * export menu nor a delete confirmation). The first run that sees them
 * corrects this comment:
 *  - the items export menu follows the register's verified shape
 *    (`lookup-list-export-menu` / `-selected` / `-all`) with the items
 *    namespace; `lookup-items-export` (the wrapper) and the trigger ARE verified;
 *  - the format prompt is the shared `#pbm-dialog` with `pbm-dialog-action-excel`
 *    (and `-csv` when offered) beside `-cancel`, as on every other export;
 *  - the "Do you want to delete <name>?" prompt is the shared `#pbm-dialog`
 *    with No = `cancel` and Yes = `confirm`, as "Delete Payer" (No / Yes) is.
 */
export const LOOKUP_ITEMS_EXPORT = {
  /** Verified: the wrapper `div#lookup-items-export`. */
  root: 'lookup-items-export',
  /** Verified. */
  trigger: LOOKUP_ITEMS.exportTrigger,
  /** Inferred from `lookup-list-export-menu`. */
  menu: 'lookup-items-export-menu',
  /** Inferred from `lookup-list-export-selected` ("Selected Export"). */
  selected: 'lookup-items-export-selected',
  /** Inferred from `lookup-list-export-all` ("Export All Data"). */
  all: 'lookup-items-export-all',
} as const;

/** The format prompt (shared `#pbm-dialog`) - inferred. */
export const LOOKUP_EXPORT_FORMAT = {
  root: DIALOG.root,
  actions: DIALOG.actions,
  excel: DIALOG_ACTION.excel,
  csv: DIALOG_ACTION.csv,
  cancel: DIALOG_ACTION.cancel,
  /** Action-id prefix, and the keys that dismiss rather than pick a format. */
  actionPrefix: 'pbm-dialog-action-',
  dismissive: ['cancel', 'stay', 'close'],
} as const;

/** The delete confirmation (shared `#pbm-dialog`) - inferred. */
export const LOOKUP_DELETE_DIALOG = {
  root: DIALOG.root,
  title: DIALOG.title,
  message: DIALOG.message,
  actions: DIALOG.actions,
  /** "Yes". */
  yes: DIALOG_ACTION.confirm,
  /** "No". */
  no: DIALOG_ACTION.cancel,
  actionPrefix: 'pbm-dialog-action-',
} as const;

/** Per-row ids on the items list (verified in the foundation probe). */
export const LOOKUP_ITEM_ROW = {
  /** The row's actions cell wrapper - hovered for the tooltip of a disabled button. */
  actions: (itemId: string): string => `${LOOKUP_ITEMS.screen}-table-row-${itemId}-actions`,
  /** The list's empty state (shared list shape). */
  empty: `${LOOKUP_ITEMS.screen}-table-empty`,
  table: `${LOOKUP_ITEMS.screen}-table-el`,
} as const;

/** Toast ids (shared). */
export const LOOKUP_TOAST = TOAST;

/** API fragments (from the app bundle; ExportLookupItems / DeleteLookupItem not yet seen on the wire). */
export const LOOKUP_ITEM_API = {
  items: '/api/Lookups/Items/',
  export: '/api/Lookups/ExportLookupItems',
  delete: '/api/Lookups/DeleteLookupItem',
  update: '/api/Lookups/UpdateLookupItem',
} as const;
