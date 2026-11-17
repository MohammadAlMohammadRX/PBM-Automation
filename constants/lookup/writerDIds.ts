/**
 * Ids Writer D (lookup folders 06 + 09) needs beyond constants/lookup/lookupIds.ts.
 * Both hosts were seen on the Lookup Items screen in the foundation probe
 * (reports/lookup/probe/foundation-2026-11-09/p4-add-form.ids.txt); their inner
 * dialogs were never rendered there.
 */
export const WRITER_D_IDS = {
  /** The unsaved-changes dialog host on the Lookup Items screen. */
  unsavedHost: 'pbm-unsaved-changes-dialog-host',
  /** The shared dialog; the leave choices are `pbm-dialog-action-stay` / `-discard` (constants/ElementIds DIALOG_ACTION). */
  sharedDialog: 'pbm-dialog',
  /** The register table - rendered only for a session allowed to see the Lookups screen. */
  registerTable: 'lookup-list-table-el',
} as const;
