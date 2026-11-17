/**
 * US 20854 "View Lookup Item List" (lookup folder 02), 13 cases (21118-21130).
 *
 * How the cases map onto the live screen (2026-11-09, Lookup-Foundation-Notes.md):
 *  - "Navigate to the Lookups Management module" = System Settings > Lookups (the
 *    register). "Select a lookup list" = search the register for the list's code
 *    and press its View (21118, 21130); "Open the Lookup Items screen" opens the
 *    list's route directly.
 *  - The list used is the home list HOME_LIST. Suite items (QA-AUTO-...) are made
 *    per case through suiteLookupItems.create (Active, Inactive, different
 *    orders); its predefined items are only READ. The screen paginates, so a row
 *    is looked for on every page.
 *  - Badges (lead decision 2): "Active (نشط)" / "Inactive (غير نشط)" / "Yes (نعم)"
 *    / "No (لا)" are asserted in English, then in Arabic after switching the UI
 *    (LanguageSwitcher); every such step switches back to English itself.
 *  - 21118: the TC names the columns "Display Order" and "Active/Inactive status",
 *    the AC "Order" and "Active status"; the live headers read "Order" / "Active".
 *    The case is about what the grid SHOWS for the item, so the columns are
 *    asserted by their keys and the item's cell values, not by header wording.
 *  - 21121: "Predefined values are part of the system and cannot be edited or
 *    deleted." is looked for on the screen, on the disabled Edit / Delete buttons
 *    (title) and in their tooltip. The foundation saw it nowhere.
 *  - 21124 (lead decision 6): a suite session whose role holds only VIEW_ONLY_RIGHTS
 *    (no Lookups.CreateLookupItem / UpdateLookupItem / DeleteLookupItem), after a
 *    baseline that the administrator gets all three.
 *  - 21125: the screen's title is the app header title (`app-header-title`); the
 *    foundation saw no other heading on the screen.
 *  - 21127 (AC: Activate / Inactivate on admin-added rows): the foundation saw NO
 *    such row action. The case's expectation is asserted (ACTIVATION_SUFFIXES);
 *    using it on the suite item (inactivate) is what "usable" means.
 *  - 21128: an empty list is looked for at run time through the API (every list
 *    of the register, GET Items); none means BLOCKED (EMPTY_LIST_BLOCKED).
 *  - 21129 (lead decision 8): the lowest valid order is 0 (AC "whole number from
 *    0 upward"), the highest is ORDER_BOUNDARY.highest. The foundation saw an
 *    item at 0 shown as "—": the case wants the value shown, so "0" is asserted.
 *  - 21130: "the values available to forms" = every item of HOME_LIST (consumed by
 *    the user Deactivate drawer) with its Active status, compared with GET Items.
 */
export const CASES = {
  allDetails: { azureId: '21118' },
  predefinedLabel: { azureId: '21119' },
  statusBadge: { azureId: '21120' },
  predefinedLocked: { azureId: '21121' },
  editDeleteOwn: { azureId: '21122' },
  linkedDelete: { azureId: '21123' },
  noPermission: { azureId: '21124' },
  title: { azureId: '21125' },
  breadcrumbLanguage: { azureId: '21126' },
  activation: { azureId: '21127' },
  emptyList: { azureId: '21128' },
  orderBoundaries: { azureId: '21129' },
  formValues: { azureId: '21130' },
} as const;

/** The home list for suite items (lead default) and the second list (only used by folder 08). */
export const HOME_LIST = 'userDeactivationReason';
export const SECOND_LIST = 'roleDeactivationReason';

/** The screen title the case and AC quote. */
export const SCREEN_TITLE = 'Lookup Items';

/** The guidance the case and AC quote. */
export const PREDEFINED_GUIDANCE = 'Predefined values are part of the system and cannot be edited or deleted.';

/** Badge texts per language (AC: "Active (نشط)", "Inactive (غير نشط)", "Yes (نعم)", "No (لا)"). */
export const BADGE = {
  active: { en: 'Active', ar: 'نشط' },
  inactive: { en: 'Inactive', ar: 'غير نشط' },
  yes: { en: 'Yes', ar: 'نعم' },
  no: { en: 'No', ar: 'لا' },
} as const;

/** The six columns the case lists, by their column keys (lookupIds LOOKUP_ITEMS.column). */
export const GRID_COLUMNS = ['code', 'englishName', 'arabicName', 'order', 'status', 'predefined'] as const;

/** Display order of the 21118 item (not 0, which the screen draws as "—"). */
export const VIEW_ITEM_ORDER = 7;

/** 21129 boundaries (lead decision 8). */
export const ORDER_BOUNDARY = { lowest: 0, highest: 999999 } as const;

/** 21124: a role that can open the lists and their items, and nothing else. */
export const VIEW_ONLY_RIGHTS = ['Lookups.GetLookups', 'Lookups.GetLookup'] as const;

/** 21127: the row-action suffixes an Activate / Inactivate control could carry (`{row}-{suffix}`). */
export const ACTIVATION_SUFFIXES = ['activate', 'inactivate', 'toggle-active', 'toggle-activation'] as const;

/** 21123: a message that says the value is in use. */
export const IN_USE_MESSAGE = /in use|linked|used by|referenced|cannot be deleted|can't be deleted|associated/i;

/** 21128: a "clear empty-state message". */
export const EMPTY_STATE_MESSAGE = /no .*(found|items|values|records|data|results)|empty/i;

/** A toast / page text that reports an application error. */
export const ERROR_TEXT = /error|exception|went wrong|failed/i;

/** BLOCKED reasons (lead decision 7). */
export const EMPTY_LIST_BLOCKED = 'No lookup list of the register has zero items (GET /api/Lookups/Items for each of the lists), and the suite must not empty a shared list - the empty state cannot be observed in this environment.';
export const NO_PREDEFINED_BLOCKED = `The home list "${HOME_LIST}" holds no predefined (system-provided) item (GET /api/Lookups/Items), so a predefined row cannot be inspected.`;
