import { NETWORK_TOAST } from './network.data';
import { CONFLICT, LOCKING_DRAFT, RELOAD_ACTION, edited } from './optimisticLocking.data';

/**
 * Test data for US 14312 "Warn users when saving a network that changed since
 * it was opened".
 *
 * The same mechanism as US 14138 (the `concurrencyStamp` on UpdateNetwork),
 * asked from the user's side: is the second saver WARNED, can they reload and
 * retry, and is there no way round the warning. The conflict vocabulary is
 * shared with that story's data file rather than restated.
 *
 * The sheet's fields that the network form does not have are mapped to ones
 * it does (verified 2026-10-21 - the form holds names, type, descriptions and
 * dates only): "Status" -> Network Type (status is not edited through the
 * form), "Contact Email" / "Address" -> Description.
 *
 * NA_UserA and NA_UserB are two windows of the same administrator
 * (`staleSession`); the Viewer row uses the shaped non-admin session.
 */
export { CONFLICT, LOCKING_DRAFT, RELOAD_ACTION, edited };

/** What a successful, conflict-free save shows. */
export const SAVED_TOAST = NETWORK_TOAST.savedAsDraft.summary;

/** Dialog actions that would save over the conflict - none may be offered. */
export const OVERWRITE_ACTIONS = /^(confirm|submit|save|overwrite|force)/i;

export const CASE = {
  noConflict: '18152',
  warned: '18153',
  stateTransition: '18154',
  apiBypass: '18156',
  offByOne: '18157',
  roleDecisionTable: '18158',
  differentFields: '18159',
  dialogChecklist: '18161',
  concurrentApi: '18162',
  reloadDiscards: '18163',
} as const;

export const CHANGES = {
  description: 'Updated description text',
  /** NA_UserB's change ("Status" on the sheet; the form's equivalent is the type). */
  otherUserType: 'EPO',
  localUnsaved: 'My unsaved change',
  reapplied: 'Description reapplied after reloading',
} as const;
