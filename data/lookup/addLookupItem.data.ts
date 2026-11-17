/**
 * US 20860 "Add Lookup Item" (lookup folder 08, 22 cases, 21186-21206 + 21208).
 *
 * How it works in this build (reports/lookup/Lookup-Foundation-Notes.md): on a
 * list's items screen (`/system-settings/lookup-management/<list code>`) "Add
 * Item" (`lookup-items-add-button`) opens the drawer `lookup-item-form-drawer`,
 * title "Add Lookup Item": Code, Name (English), الاسم (Arabic) - placeholder
 * "Enter value" - Display Order (`-index-input`, starts at "0", no placeholder)
 * and Is Active (starts ticked); Cancel / Save / close X. Save sends POST
 * /api/Lookups/CreateLookupItem. The drawer's field errors were never seen in
 * the foundation: they are read under each field (own `-error` id or the
 * id-less `small.pbm-field-error` of the field's block, as in the member / user
 * drawers).
 *
 * SAFETY: every item added goes into the home list HOME_LIST (second list
 * LIST_B for 21200) with a suite code `QA-AUTO-...` (suiteLookupItems.newCode),
 * English name "QA Automation <letters>" and an Arabic phrase; the list is
 * watched first, so teardown deletes it. Cases whose Code is blank or blank-ish
 * (21187, 21206) cannot carry the prefix: their unique "QA Automation" English
 * name is tracked instead (strayLookupNames, utils/lookup/writerEHelpers.ts) and
 * an item saved by mistake is deleted by that name.
 *
 * Literal readings / decisions (Lookup-Writers-Brief.md, lead decisions):
 *  - Defaults (21186, 21195, 21203): the lead set Display Order "0" as the
 *    default (AC "default 0"; foundation: the box starts at "0"). 21195 step 2
 *    says "Display Order blank" - the AC/lead value DEFAULT_ORDER_SHOWN is
 *    asserted instead; 21186 / 21203 "all fields empty" = Code, English and
 *    Arabic empty (Display Order shows its default).
 *  - 21186 "appears in the list with Display Order 0": the Order cell is
 *    asserted to read ORDER_ZERO_CELL ("0") literally. The foundation saw an
 *    item with index 0 shown as "—" - if so this step FAILS (finding); set
 *    ORDER_ZERO_CELL to '—' to accept the dash. The stored index is checked too.
 *  - 21204 (TC over AC): the action names Display Order among the inputs, so
 *    PLACEHOLDER_FIELDS includes `order`; the foundation saw no placeholder on
 *    it (finding). Drop `order` to read "each applicable field" narrowly.
 *  - "the form runs validation and does not submit" = no Create request
 *    succeeded (none sent, or refused with a 4xx) AND the drawer stays open AND
 *    the message is under the field AND no item was stored (GetItems).
 *  - Messages: "This field is required.", "English letters only.", "Arabic
 *    letters only." and "Item Created — The lookup item was added." are literal
 *    (dash / whitespace normalised). Max-length (21191, 21194), negative order
 *    (21197) and duplicate code (21199) quote no text: the field must show a
 *    message matching the patterns in FIELD_ERROR_PATTERN.
 *  - 21190 / 21191: a fresh suite code padded with "X" to exactly 100 / 101.
 *    21191 step 3 "the Code field shows the entered text" is asserted literally
 *    (a box that silently stops at 100 fails that step - finding).
 *  - 21196 "the existing item with Display Order 1": a suite item created
 *    through the API at SHARED_ORDER, then a second one at the same order.
 *  - 21199 "MED-01" is an example (decision 1): a suite item is created
 *    through the API and its code is repeated in the drawer.
 *  - 21200 "List A / List B": List A = HOME_LIST holds a suite item; its code
 *    is added in LIST_B. Step 1 shows both lists in the register (search).
 *  - 21198 / 21205 "every form that uses the list" (decision 9): the only
 *    consumer the suite drives for HOME_LIST is the user Deactivate drawer
 *    (Users > Inactivate on the case's own suite user, `userIn`): its
 *    Deactivation Reason drop-down is opened, read and the drawer is cancelled -
 *    nobody is deactivated. "Positioned according to its Display Order" = every
 *    offered item before the new value has an order <= CONSUMER_ORDER and every
 *    one after it >= CONSUMER_ORDER (GetItems gives the orders).
 *  - 21201 "Cancel" = the drawer's Cancel; 21202 "close icon" = the drawer's X.
 *    The dialog is the shared `#pbm-dialog` with `stay` / `discard` (or the
 *    unsaved-changes host); "Keep Editing" / "Discard Changes" literal labels.
 *  - 21208 (decision 6): a suite session whose role holds only the view rights
 *    NO_ADD_RIGHTS (no Lookups.CreateLookupItem), after the administrator
 *    baseline (Add Item offered). Step 1 "denies access or loads read-only" =
 *    the items table is absent, or shown without an enabled Add Item. Step 3
 *    "access the form directly": the drawer has no route of its own, so the
 *    direct way in is CreateLookupItem called with the session's own token -
 *    it must be refused (DENIED_STATUSES) and nothing stored.
 *
 * BLOCKED: none of the 22 needs data the environment cannot produce (suite
 * users / sessions block themselves when they cannot be built).
 */
export const CASES = {
  addSuccess: { azureId: '21186' },
  codeBlank: { azureId: '21187' },
  englishBlank: { azureId: '21188' },
  arabicBlank: { azureId: '21189' },
  codeMax: { azureId: '21190' },
  codeTooLong: { azureId: '21191' },
  englishLettersInArabic: { azureId: '21192' },
  arabicLettersInEnglish: { azureId: '21193' },
  englishTooLong: { azureId: '21194' },
  defaults: { azureId: '21195' },
  sharedOrder: { azureId: '21196' },
  negativeOrder: { azureId: '21197' },
  inactiveAtCreate: { azureId: '21198' },
  duplicateCode: { azureId: '21199' },
  codeInOtherList: { azureId: '21200' },
  cancelUnsaved: { azureId: '21201' },
  closeUnsaved: { azureId: '21202' },
  opensFromAddItem: { azureId: '21203' },
  placeholders: { azureId: '21204' },
  availableInForms: { azureId: '21205' },
  whitespaceCode: { azureId: '21206' },
  nonAdmin: { azureId: '21208' },
} as const;

/** The home list for suite items (lead default) - consumed by the user Deactivate drawer. */
export const HOME_LIST = 'userDeactivationReason';
/** List B for 21200 (the same code in another list). */
export const LIST_B = 'roleDeactivationReason';

export const DRAWER_TITLE = 'Add Lookup Item';
export const PLACEHOLDER = 'Enter value';
/** The inputs 21204 expects to carry PLACEHOLDER (see the header: `order` is the TC's literal list). */
export const PLACEHOLDER_FIELDS = ['code', 'englishName', 'arabicName', 'order'] as const;
/** The text inputs that must start empty ("all fields empty"). */
export const EMPTY_FIELDS = ['code', 'englishName', 'arabicName'] as const;
/** What Display Order shows when the drawer opens (lead default: the AC's 0). */
export const DEFAULT_ORDER_SHOWN = '0';
/** What the list's Order cell must read for an item saved at order 0 (see the header). */
export const ORDER_ZERO_CELL = '0';
export const ACTIVE_BADGE = 'Active';
export const PREDEFINED_NO = 'No';

export const MESSAGES = {
  created: 'Item Created — The lookup item was added.',
  required: 'This field is required.',
  englishOnly: 'English letters only.',
  arabicOnly: 'Arabic letters only.',
  unsaved: 'Unsaved Changes — You have unsaved changes. If you leave now, your edits will be lost.',
} as const;

/** The unsaved-changes dialog's buttons. */
export const DIALOG_LABELS = { keepEditing: 'Keep Editing', discard: 'Discard Changes' } as const;

/** Messages the cases describe without quoting them. */
export const FIELD_ERROR_PATTERN = {
  codeTooLong: /100|max|long|exceed|characters/i,
  englishTooLong: /200|max|long|exceed|characters/i,
  negativeOrder: /0|negative|whole|upward|minimum|greater|positive/i,
  duplicateCode: /exist|duplicate|unique|already|in use|taken/i,
} as const;

export const LIMITS = { codeMax: 100, englishMax: 200 } as const;

/** 21196: the order both items share. */
export const SHARED_ORDER = 1;
/** 21205: the new value's display order. */
export const CONSUMER_ORDER = 2;
/** 21197: the negative order typed. */
export const NEGATIVE_ORDER = '-1';
/** 21206: whitespace-only Code. */
export const WHITESPACE_CODE = '     ';

/** The suite's Arabic name (Arabic letters only). */
export const ARABIC_NAME = 'قيمة اختبار آلي';
/** 21192: English letters typed into the Arabic Name. */
export const ENGLISH_IN_ARABIC = 'QA Automation Text';
/** 21193: Arabic letters typed into the English Name. */
export const ARABIC_IN_ENGLISH = 'قيمة اختبار';

/** 21208: a role that may view the lookups but holds no Lookups.CreateLookupItem. */
export const NO_ADD_RIGHTS = ['Lookups.GetLookups', 'Lookups.GetLookup'] as const;
/** 21208: what a refused CreateLookupItem answers. */
export const DENIED_STATUSES = [401, 403] as const;
