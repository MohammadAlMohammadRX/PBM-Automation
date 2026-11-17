/**
 * US 21003 "Delete App Notification" (notification folder 19, 7 cases written of 10; 21607, 21610
 * and 21611 wait for the BA).
 *
 * How it works in this build: every App Notification row carries Delete
 * (`nc-definitions-table-row-<id>-delete`) -> DELETE /api/NotificationDefinition/DeleteDefinition/<id>.
 * NOTE: on the Triggers tab the probe saw Delete sent AT ONCE with no confirmation; the full run of
 * 2026-11-12 saw the same here (DeleteDefinition sent by the Delete click, toast "Saved
 * successfully.", no dialog). The cases assert the TC ("a confirmation dialog appears") - a delete
 * without a dialog is a FINDING (the record is then already gone). `clickDelete` reports what the
 * click did; a later step that needs the dialog (Confirm / Cancel / read it) fails with "there was
 * no confirmation dialog on screen" instead of a 15 s locator timeout.
 *
 * SAFETY: every record deleted is the case's own suite definition (`suiteDefinitions.create`,
 * INACTIVE unless the case needs an active one, audience careconnect); teardown deletes whatever
 * is left. The "user without the right" is maalmohammad holding ONLY a suite role without
 * NotificationDefinition.DeleteDefinition (secondUser.withRights, restored).
 *
 * Literal readings / TC-vs-AC decisions (the test case wins):
 * - "Welcome Message" (TC example name) -> suite name carrying it.
 * - 21605 "matches the required wording": the AC quotes no text; the dialog must ask about deleting
 *   (DELETE_WORDING) and name the notification, with Confirm / Cancel (ids `confirm` / `cancel`).
 * - "removed from the list" = not in the list after a search for its name AND GetDefinition finds
 *   nothing.
 * - 21612 "a single delete request" = exactly one DeleteDefinition request for the double-click, no
 *   error toast, the list still usable (searchable).
 * - 21613 "disabled, hidden or blocked": Delete not offered / disabled, or the attempt answers
 *   >= 400; plus the server refuses DeleteDefinition from that user. Baseline: careconnect is
 *   offered Delete on the same row.
 */

export const STORY = { id: '21003', title: 'Delete App Notification' } as const;

export const CASES = {
  deleteConfirmed: { azureId: '21604' },
  confirmWording: { azureId: '21605' },
  cancelKeeps: { azureId: '21606' },
  anyStatus: { azureId: '21608' },
  activeAndInactive: { azureId: '21609' },
  doubleConfirm: { azureId: '21612' },
  noPermission: { azureId: '21613' },
} as const;

export const WELCOME_LABEL = 'Welcome Message';

/** The confirmation must speak of deleting (title or message). */
export const DELETE_WORDING = /delete/i;

export const ACTIVE_MARK = '✓';
export const INACTIVE_MARK = '✗';

/** The rights of the suite role the second user holds in 21613 - everything of the area but DeleteDefinition. */
export const RIGHTS_WITHOUT_DELETE = [
  'NotificationDefinition.GetDefinitions',
  'NotificationDefinition.GetDefinition',
  'NotificationDefinition.GetActionVariables',
  'NotificationDefinition.GetAudienceCandidates',
  'NotificationDefinition.CreateDefinition',
  'NotificationDefinition.UpdateDefinition',
  'NotificationDefinition.ToggleDefinitionActivation',
  'NotificationDefinition.ExportDefinitions',
  'SystemSettings.GetSystemSettings',
] as const;
