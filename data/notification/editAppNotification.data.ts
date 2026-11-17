/**
 * US 21001 "Edit App Notification" (notification folder 17, 13 cases written of 15; 21579 and 21581
 * wait for the BA).
 *
 * How it works in this build: a row's Edit (`nc-definitions-table-row-<id>-edit`) opens the same
 * 3-step drawer pre-filled from GetDefinition; Save is only on the Audiences step (as on create),
 * UpdateDefinition carries the record + concurrencyStamp; a dirty drawer's X asks "Unsaved Changes"
 * (Keep Editing / Discard Changes); an untouched one closes at once (probe e22 on triggers).
 *
 * SAFETY: every record edited is the case's own suite definition (`suiteDefinitions.create`,
 * INACTIVE, audience careconnect) - teardown deletes it. The "user without the right" is
 * maalmohammad holding ONLY a suite role without NotificationDefinition.UpdateDefinition
 * (`secondUser.withRights`, restored and read back by the fixture).
 *
 * Literal readings / TC-vs-AC decisions (the test case wins):
 * - 21577 "Password Reset Reminder" (TC example name) -> suite name carrying it; the General step
 *   shows name / module / action / description / active, Content the two messages + Notes, Audiences
 *   the careconnect user chip.
 * - 21576 Event A / B = "Inactive - Network" -> "Inactive - Plan"; Audience X / Y = careconnect ->
 *   maalmohammad (users the suite may target - a real role would notify real people).
 * - 21578 "required-field validation message appears" when Name is cleared: "This field is
 *   required." under Name (on blur or on the Save attempt); the Save attempt shows the creation rule
 *   "Please fill Name, Module and Action." and nothing is sent.
 * - 21580 "only the Content step is flagged" = the Content field errors / message toast appear and
 *   no General error; "only the Audiences step is flagged" = "Add at least one audience." and no
 *   Content error.
 * - 21589 step 3 asks for a validation message as soon as every audience is removed (AUDIENCE_REQUIRED_HINT);
 *   step 4 the Save refusal "Add at least one audience.".
 * - 21586 "a single save request" = exactly one UpdateDefinition request for the double-click.
 * - 21587 Back with a dirty drawer: either the browser leaves or a warning (browser prompt or the
 *   app's Unsaved Changes) appears; the stored record must be unchanged either way.
 * - 21588 "disabled, hidden or blocked": Edit not offered / disabled, or clicking it opens no drawer;
 *   plus the server refuses UpdateDefinition from that user (>= 400). Baseline first: careconnect
 *   is offered Edit on the same row.
 */

export const STORY = { id: '21001', title: 'Edit App Notification' } as const;

export const CASES = {
  updateWording: { azureId: '21575' },
  changeEventAudience: { azureId: '21576' },
  prefilled: { azureId: '21577' },
  blankName: { azureId: '21578' },
  allStepsValid: { azureId: '21580' },
  closeUntouched: { azureId: '21582' },
  confirmDiscard: { azureId: '21583' },
  discardKeepsSaved: { azureId: '21584' },
  cancelKeepsEdits: { azureId: '21585' },
  doubleSave: { azureId: '21586' },
  navigateAway: { azureId: '21587' },
  noPermission: { azureId: '21588' },
  noAudience: { azureId: '21589' },
} as const;

/** 21575: the TC's new wording (English only letters - the Arabic stays). */
export const NEW_WORDING = 'Your request has been processed.';
/** 21577: the TC's notification name and the saved description / notes the suite gives it. */
export const PREFILLED_LABEL = 'Password Reset Reminder';
export const PREFILLED_DESCRIPTION = 'QA automation description for the edit drawer';
export const PREFILLED_NOTES = 'QA automation internal notes';

/** Changes typed in the discard / double-save cases. */
export const CHANGED_ENGLISH = 'QA automation changed wording';

export const EVENT_A = { module: 'Network Management', action: 'Inactive - Network' } as const;
export const EVENT_B = { module: 'Plan Management', action: 'Inactive - Plan' } as const;
export const ADMIN_DISPLAY = 'CareConnect Admin User';
export const USERS = 'Users';

/**
 * 21589 step 3 "zero audiences selected AND a validation message appears" (before Save): any toast,
 * field error or drawer text about the missing audience - "Add at least one audience." (the Save
 * message) or a "... audience ... required" line. Triage 2026-11-12: the step used to pass on the
 * zero count alone.
 */
export const AUDIENCE_REQUIRED_HINT = /at least one audience|audience[^.]*required|required[^.]*audience/i;

/** The rights of the suite role the second user holds in 21588 - everything of the area but UpdateDefinition. */
export const RIGHTS_WITHOUT_UPDATE = [
  'NotificationDefinition.GetDefinitions',
  'NotificationDefinition.GetDefinition',
  'NotificationDefinition.GetActionVariables',
  'NotificationDefinition.GetAudienceCandidates',
  'NotificationDefinition.CreateDefinition',
  'NotificationDefinition.DeleteDefinition',
  'NotificationDefinition.ToggleDefinitionActivation',
  'NotificationDefinition.ExportDefinitions',
  'SystemSettings.GetSystemSettings',
] as const;
