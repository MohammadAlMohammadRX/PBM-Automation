/**
 * US 20859 "Delete Lookup Item" (lookup folder 07, 6 cases 21180-21185).
 *
 * How it works in this build (reports/lookup/Lookup-Foundation-Notes.md): every
 * items row has Edit and Delete (`lookup-items-table-row-<id>-delete`), both
 * DISABLED on predefined rows. The confirmation is inferred to be the shared
 * `#pbm-dialog` (No = cancel, Yes = confirm) - constants/lookup/writerCIds.ts.
 * DELETE /api/Lookups/DeleteLookupItem/<id>.
 *
 * SAFETY: every item deleted, refused or retired is the case's OWN suite item
 * (`suiteLookupItems.create(HOME_LIST)`, code `QA-AUTO-...`). Predefined items
 * are only read and hovered (21184 step 4), never clicked. "In use" is made by
 * the `linkLookupItem` fixture (Writer D) BEFORE the steps, so a link that
 * cannot be made BLOCKS the case before anything could fail; the fixture undoes
 * the link at teardown, and the suite item is then deleted (or, when still
 * refused, left inactive and reported).
 *
 * Literal readings / TC-vs-AC decisions (the test case wins):
 * - 21180's "Region A" is the TC's example: the suite item's English name is
 *   used, and the prompt must read exactly DELETE_PROMPT(<English name>) with
 *   the buttons PROMPT_BUTTONS (title or message, whitespace normalised).
 * - Toasts are asserted literally (lead decision 2): DELETED / UPDATED as
 *   "summary - detail" with whitespace and the dash normalised.
 * - "Delete is refused" for an in-use item (21184 step 3, 21185 step 2): the
 *   AC quotes no message. Refused = the Delete button is disabled, or Yes is
 *   answered with an error (DeleteLookupItem >= 400 / no request) AND the item
 *   is still in the list (GET Items). The message shown is reported.
 * - 21184 step 2 "enabled and functional": Delete on an unused suite item is
 *   enabled and Yes removes it.
 * - 21184 step 4: the predefined item is the list's predefined item with the
 *   lowest Display Order (read only); the tooltip must read PREDEFINED_TOOLTIP.
 * - 21185 "no longer offered for new selections": asserted as the item stored
 *   inactive (GET Items isActive false) - the consumer drop-downs are folder 09's.
 */

/** The suite's home list for its own items (lead default). */
export const HOME_LIST = 'userDeactivationReason';
/** The second list, when a case needs one (not used by folder 07). */
export const SECOND_LIST = 'roleDeactivationReason';

export const CASES = {
  promptNamesItem: { azureId: '21180' },
  deleteUnused: { azureId: '21181' },
  cancelKeeps: { azureId: '21182' },
  confirmRemoves: { azureId: '21183' },
  availabilityMatrix: { azureId: '21184' },
  retireInUse: { azureId: '21185' },
} as const;

/** "Do you want to delete <name>?" */
export const DELETE_PROMPT = (name: string): string => `Do you want to delete ${name}?`;

/** The prompt's buttons, in any order. */
export const PROMPT_BUTTONS = ['No', 'Yes'] as const;

export const DELETED = 'Item Deleted — The lookup item was removed.';
export const UPDATED = 'Item Updated — The lookup item was updated.';
export const PREDEFINED_TOOLTIP = 'Predefined values are part of the system and cannot be edited or deleted.';

export const NO_PREDEFINED_BLOCK = `the home list "${HOME_LIST}" holds no predefined item to inspect (GET /api/Lookups/Items)`;
