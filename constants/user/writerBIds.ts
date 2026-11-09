import { USER_FORM } from './userIds';

/**
 * Writer B (user folders 05 Create User, 09 Edit User) - the few ids the
 * foundation's USER_FORM does not name. Read off the live Assign Payers picker
 * on 2026-11-08 (reports/user/probe/foundation-2026-11-08/p10-assign-picker.ids.txt).
 */
export const USER_PAYER_PICKER = {
  root: `${USER_FORM.root}-assign-payers-picklist`,
  /** "Move all up": every Selected payer back to Available. */
  moveAllToSource: `${USER_FORM.root}-assign-payers-picklist-move-all-to-source`,
  /** "Move selected up". */
  moveSelectedToSource: `${USER_FORM.root}-assign-payers-picklist-move-selected-to-source`,
  /** "No results found." in the Selected Payers list. */
  targetEmpty: `${USER_FORM.root}-assign-payers-picklist-target-empty`,
} as const;
