/**
 * US 21002 "Activate and Deactivate App Notification" (notification folder 18, 11 cases written of
 * 14; 21597, 21598 and 21601 wait for the BA).
 *
 * How it works in this build: every App Notification row carries Edit / toggle / Delete; the toggle
 * (`nc-definitions-table-row-<id>-toggle-active`) reads "Activate" on an inactive row and
 * "Deactivate" on an active one (probe 12 / 21). The trigger tab's toggle asks through the shared
 * `pbm-dialog` ("Are you sure you want to activate <name>?", No = cancel / Yes = confirm); the
 * definition dialog texts were not probed - the cases assert the AC wording. Confirm sends POST
 * ToggleDefinitionActivation { id, isActive }. The Active cell shows "✓" / "✗".
 *
 * SAFETY: every record toggled is the case's own suite definition (`suiteDefinitions.create`,
 * audience careconnect only) - an activated one can only notify careconnect; teardown deletes it.
 * The "user without the right" is maalmohammad holding ONLY a suite role without
 * NotificationDefinition.ToggleDefinitionActivation (secondUser.withRights, restored).
 *
 * Literal readings / TC-vs-AC decisions (the test case wins):
 * - "Order Shipped" (TC example name) -> suite name carrying it; the dialog must read exactly
 *   "Are you sure you want to activate <that name>?" (DIALOG_MESSAGE).
 * - "Confirm and Cancel options": the dialog's confirm / cancel actions (labelled "Yes" / "No" on
 *   the trigger dialog) - asserted by their ids, the labels reported.
 * - "status shows Active / Inactive" = the Active cell "✓" / "✗" and GetDefinition isActive.
 * - 21596 "only the relevant action": the toggle is ONE control whose label is the relevant action
 *   (Activate on inactive, Deactivate on active).
 * - 21600 "a single status change" = exactly one ToggleDefinitionActivation request, carrying
 *   isActive true, for the double-click; final state active; no error toast.
 * - 21602 "consistently Active / Inactive": every row on every page shows "✓" or "✗" and it agrees
 *   with GetDefinitions isActive.
 * - 21603: 11 suite definitions under one stamp (the target, inactive, created FIRST so it sorts
 *   last); searching the stamp puts it alone on page 2.
 */

export const STORY = { id: '21002', title: 'Activate and Deactivate App Notification' } as const;

export const CASES = {
  activate: { azureId: '21590' },
  deactivate: { azureId: '21591' },
  activateWording: { azureId: '21592' },
  deactivateWording: { azureId: '21593' },
  cancelKeeps: { azureId: '21594' },
  lastActionWins: { azureId: '21595' },
  relevantActionOnly: { azureId: '21596' },
  noPermission: { azureId: '21599' },
  doubleConfirm: { azureId: '21600' },
  consistentStates: { azureId: '21602' },
  lastPage: { azureId: '21603' },
} as const;

export const ORDER_SHIPPED_LABEL = 'Order Shipped';

export const DIALOG_MESSAGE = {
  activate: (name: string): string => `Are you sure you want to activate ${name}?`,
  deactivate: (name: string): string => `Are you sure you want to deactivate ${name}?`,
} as const;

export const TOGGLE_LABEL = { activate: 'Activate', deactivate: 'Deactivate' } as const;
export const ACTIVE_MARK = '✓';
export const INACTIVE_MARK = '✗';

/** 21603: records under one stamp. */
export const LONG_LIST_COUNT = 11;

/** The rights of the suite role the second user holds in 21599 - everything of the area but ToggleDefinitionActivation. */
export const RIGHTS_WITHOUT_TOGGLE = [
  'NotificationDefinition.GetDefinitions',
  'NotificationDefinition.GetDefinition',
  'NotificationDefinition.GetActionVariables',
  'NotificationDefinition.GetAudienceCandidates',
  'NotificationDefinition.CreateDefinition',
  'NotificationDefinition.UpdateDefinition',
  'NotificationDefinition.DeleteDefinition',
  'NotificationDefinition.ExportDefinitions',
  'SystemSettings.GetSystemSettings',
] as const;
