import { ROLE_FORM_IDS } from './roleIds';

/**
 * Role Management - Writer B (folders 09 Create Role, 10 View Role, 11 Edit Role).
 *
 * Every id here is one the lead's `roleIds.ts` already reads off the live drawer (2026-11-14), grouped the
 * way Writer B's checks need them; nothing new was probed. What the TCs expect but the screen has NO id for
 * is listed so the helpers can say so in a failure message instead of guessing a selector:
 *  - a payer picker inside the role drawer (22088): none rendered - any id in the drawer that contains
 *    `payerControlFragment` other than the Has Assigned Payers? checkbox counts as one;
 *  - a stepper / Next / Back inside View Role (22094, 22099): View Role is one page; the Add / Edit stepper ids
 *    are reused to look for them.
 */
export const WRITER_B_IDS = {
  /** An id fragment a payer selection control in the role drawer would carry. */
  payerControlFragment: 'payer',
  /** Ids that belong to the Has Assigned Payers? checkbox itself (never a payer picker). */
  hasAssignedPayersIds: [ROLE_FORM_IDS.hasAssignedPayers, `${ROLE_FORM_IDS.hasAssignedPayers}-label`],

  /** Step-1 text inputs that View Role must not offer for typing. */
  textInputs: [ROLE_FORM_IDS.englishName, ROLE_FORM_IDS.arabicName, ROLE_FORM_IDS.englishDescription, ROLE_FORM_IDS.arabicDescription],
  /** Step-1 checkboxes + the Allowed To Assign By multiselect that View Role must not offer for changing. */
  choiceInputs: [ROLE_FORM_IDS.isActive, ROLE_FORM_IDS.hasAssignedPayers, ROLE_FORM_IDS.canApproveOwnRequests, ROLE_FORM_IDS.assignableRoles],

  /** Ways a drawer moves between its two steps (Add / Edit; looked for in View too). */
  stepNavigation: {
    stepper: ROLE_FORM_IDS.stepper,
    step1Label: ROLE_FORM_IDS.stepLabel(1),
    step2Label: ROLE_FORM_IDS.stepLabel(2),
    step1Bullet: ROLE_FORM_IDS.stepBullet(1),
    step2Bullet: ROLE_FORM_IDS.stepBullet(2),
    next: ROLE_FORM_IDS.nextButton,
    back: ROLE_FORM_IDS.backButton,
  },

  /** Button ids that would write from a drawer (none may exist in View Role). */
  writeButtons: [ROLE_FORM_IDS.saveButton, ROLE_FORM_IDS.nextButton],
  /** Any button id fragment that reads as saving / applying. */
  writeButtonFragments: ['save', 'apply', 'submit'],
} as const;
