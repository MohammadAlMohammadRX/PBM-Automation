/**
 * US 20982 "Delete Trigger" (notification folder 05, 3 cases) - Writer A.
 *
 * How it works in this build: the foundation probe (e17, 2026-11-11) saw a custom
 * row's Delete send DELETE /TriggersConfiguration/DeleteTrigger/{id} AT ONCE,
 * with NO confirmation dialog. The AC and both cases expect a confirmation
 * ("removes it immediately after the user confirms") - asserted as written, so
 * a missing dialog stays a FINDING (21965 step 2, 21967 steps 2-4: without a
 * dialog there is no Cancel, and the trigger is gone).
 *
 * SAFETY: each trigger deleted is a suite trigger made in the test on a free
 * action (TC example "Custom Payer Reminder" = an example, lead decision 2 -
 * the suite name carries it, shortened to the 50-character limit).
 *
 * Literal readings / decisions:
 * - "a confirmation dialog appears" = the shared `pbm-dialog` (title + message)
 *   shows after Delete, BEFORE any DELETE request.
 * - 21971 "Standard User (non-administrator)" = the second user holding ONLY a
 *   suite role with every Triggers right EXCEPT TriggersConfiguration.DeleteTrigger
 *   (NO_DELETE_RIGHTS). Baseline first: careconnect sees Delete on the same row.
 *   "Hidden or disabled" = Delete not visible, or disabled; the delete API is
 *   also called in that session and must be refused (401/403). When the
 *   restricted session cannot even list the triggers, the case is BLOCKED
 *   (NO_LIST_REASON) - the role is then not the one the case describes.
 */
export const CASES = {
  confirmDelete: { azureId: 21965, label: 'Custom Payer Reminder' },
  cancelDelete: { azureId: 21967, label: 'Custom Payer Reminder' },
  noPermission: { azureId: 21971, label: 'Custom Payer Reminder' },
} as const;

/** Every Triggers right except DeleteTrigger, plus what the Notification Center page reads. */
export const NO_DELETE_RIGHTS = [
  'TriggersConfiguration',
  'TriggersConfiguration.GetTriggers',
  'TriggersConfiguration.GetTrigger',
  'TriggersConfiguration.CreateTrigger',
  'TriggersConfiguration.UpdateTrigger',
  'TriggersConfiguration.ToggleTriggerActivation',
  'TriggersConfiguration.ExportTriggers',
  'NotificationDefinition.GetActionVariables',
  'SystemSettings',
  'SystemSettings.GetSystemSettings',
] as const;

export const DENIED_STATUSES = [401, 403];

export const NO_LIST_REASON = 'the second user with every Triggers right except DeleteTrigger could not list the triggers (GetTriggers was not answered 200), so "a user who sees the trigger but may not delete it" could not be set up';
