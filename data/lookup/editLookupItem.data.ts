/**
 * US 20858 "Edit Lookup Item" (lookup folder 06, 15 cases, 21165-21179) - Writer D.
 *
 * How it works in this build (reports/lookup/Lookup-Foundation-Notes.md + the
 * app bundle): a row's Edit opens the same drawer as Add (`lookup-item-form-drawer-*`)
 * titled "Edit Lookup Item"; Save sends PUT /api/Lookups/UpdateLookupItem and
 * toasts "Item Updated" / "The lookup item was updated.". Edit and Delete are
 * present but DISABLED on predefined rows; the i18n has the predefined text
 * (`lookup.items.predefinedLocked`). The screens hold NO in-use logic: any
 * "used by records" refusal can only come from the server.
 *
 * SAFETY: every item edited here is a suite item made by `suiteLookupItems`
 * (code QA-AUTO-..., English "QA Automation <letters>", Arabic phrase) in the
 * home list; the predefined row of 21168 is only hovered, never saved.
 * English names are LETTERS only (the drawer validates both names on every
 * save, and the fixture's default name carries digits).
 *
 * Literal readings / decisions:
 * - 21165: "pre-filled" = the drawer's five controls equal the stored item
 *   (GetItems), and the title reads "Edit Lookup Item" (i18n).
 * - 21166: the new code is another fresh suite code (still QA-AUTO-, so the
 *   teardown deletes it).
 * - 21167 (TC example "DUP01" = an example, lead decision 1): the case makes two
 *   suite items and gives the second the first one's code. Step 2 expects a
 *   message about the code BEFORE Save (after leaving the box); no wording is
 *   quoted, so any drawer / toast message naming the code as taken counts.
 * - 21168: the predefined item is the home list's predefined "other" (read from
 *   GetItems by `predefined: true`); the tooltip text is asserted literally.
 * - 21169: "in use" = the `linkLookupItem` fixture on the home list (a suite user
 *   deactivated with the suite reason - utils/lookup/lookupInUse.ts). "Refuses
 *   the edit action" = Edit is disabled / absent, OR a Save is refused and the
 *   stored item is unchanged.
 * - 21170 / 21171: messages from the brief: "This field is required." /
 *   "Arabic letters only." (the TC's own example value "123@@").
 * - 21172: the toast quoted in step 4 is the one Save produced in step 3 (read
 *   right after the action); "the grid and the item reflect the saved changes"
 *   = the row's cells AND the reopened drawer.
 * - 21173 / 21174: "attempt to close the panel" = the drawer's X; the dialog
 *   text is asserted literally (dash normalised).
 * - 21175: "a form elsewhere that uses this lookup list" = the user Deactivate
 *   drawer (Users Administration > row Inactivate) for an ACTIVE suite user
 *   (`userIn`), closed with Cancel. It is the only consumer of
 *   userDeactivationReason the suite can open.
 * - 21176 (CONSUMER CHOICE): the home list's consumer stores the reason but
 *   never shows it (GetUser has no reason field; the profile has no reason row),
 *   so "the record's field still displays the retired value" is checked on the
 *   RECORD_LIST `gender`: a suite user whose Gender is a suite item, opened on
 *   its profile (Personal Information > Gender); "excluded from new
 *   selections" = the Add User drawer's Gender select. The item lives only in
 *   this test (retired first, deleted at teardown).
 *   Conflict between the stories: AC 20858 refuses edits of an in-use value,
 *   while this case needs a record holding a retired one. The precondition
 *   first retires the held item through the API; if that is refused it gives a
 *   new record an item created inactive; if that is refused too, BLOCKED
 *   (by linkLookupItem, with the server's answer).
 * - 21177 ("Only a System Administrator", lead decision 6): a suite role with
 *   every Lookups right EXCEPT UpdateLookupItem; the admin baseline first shows
 *   Edit enabled on a suite item.
 * - 21178 (exploratory, scripted): one suite item in the home list and one in
 *   the second list, each edited to an Arabic name, Display Order HIGHEST_ORDER
 *   and a long mixed-case (valid) English name, then saved. "Consistent" = every
 *   edit saved the same way (2xx, the same toast, the drawer closed, the values
 *   stored).
 * - 21179 (lead decision 8, TC vs AC): the AC's lowest valid value is 0 (the
 *   TC's "e.g. 1" is its example), so step 2 saves 0 and step 3 tries -1.
 */

/** The suite's home list and the second list (lead decisions). */
export const HOME_LIST = 'userDeactivationReason';
export const SECOND_LIST = 'roleDeactivationReason';
/** The list whose value a record SHOWS (the suite user's Gender on its profile) - 21176. */
export const RECORD_LIST = 'gender';

/** The display-order range (lead decision 8). */
export const LOWEST_ORDER = 0;
export const HIGHEST_ORDER = 999999;

export const MESSAGE = {
  updated: 'Item Updated — The lookup item was updated.',
  editTitle: 'Edit Lookup Item',
  predefinedLocked: 'Predefined values are part of the system and cannot be edited or deleted.',
  required: 'This field is required.',
  arabicOnly: 'Arabic letters only.',
  englishOnly: 'English letters only.',
  unsaved: 'Unsaved Changes — You have unsaved changes. If you leave now, your edits will be lost.',
  keepEditing: 'Keep Editing',
  discardChanges: 'Discard Changes',
} as const;

/** A message naming a code as already used (21167 quotes none). */
export const DUPLICATE_CODE_MESSAGE = /unique|already|exist|duplicate|taken|in use|used/i;

/** Lookups permission keys (foundation notes). */
export const LOOKUP_RIGHT = {
  getLookups: 'Lookups.GetLookups',
  getLookup: 'Lookups.GetLookup',
  createItem: 'Lookups.CreateLookupItem',
  updateItem: 'Lookups.UpdateLookupItem',
  deleteItem: 'Lookups.DeleteLookupItem',
  exportLookups: 'Lookups.ExportLookups',
  exportItems: 'Lookups.ExportLookupItems',
} as const;

export const CASES = {
  prefilled: { azureId: '21165', order: 7 },
  changeCode: { azureId: '21166' },
  duplicateCode: { azureId: '21167' },
  predefinedLocked: { azureId: '21168' },
  inUseRefused: { azureId: '21169', englishName: 'QA Automation Renamed In Use' },
  requiredField: { azureId: '21170' },
  lettersOnly: { azureId: '21171', arabicName: '123@@' },
  validSave: { azureId: '21172', englishName: 'QA Automation Updated Value', arabicName: 'قيمة اختبار محدثة', order: '5' },
  keepEditing: { azureId: '21173', englishName: 'QA Automation Unsaved Keep' },
  discardChanges: { azureId: '21174', englishName: 'QA Automation Unsaved Discard' },
  inactiveNotOffered: { azureId: '21175' },
  /** BLOCKED (by linkLookupItem, with the server's answer) when no record can hold a retired value. */
  retiredStillShown: { azureId: '21176' },
  editPermission: {
    azureId: '21177',
    /** Every Lookups right except the one in question. */
    rights: [LOOKUP_RIGHT.getLookups, LOOKUP_RIGHT.getLookup, LOOKUP_RIGHT.createItem, LOOKUP_RIGHT.deleteItem, LOOKUP_RIGHT.exportLookups, LOOKUP_RIGHT.exportItems],
  },
  exploratory: {
    azureId: '21178',
    lists: [HOME_LIST, SECOND_LIST],
    arabicName: 'قيمة اختبار استكشافية',
    englishName: 'QA Automation Exploratory Long Mixed Case Value Name',
    order: String(HIGHEST_ORDER),
  },
  displayOrderRange: { azureId: '21179', startOrder: 3, minimum: String(LOWEST_ORDER), belowMinimum: '-1' },
} as const;
