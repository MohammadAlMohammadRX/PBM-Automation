/**
 * US 20416 "Activate and Deactivate User" (user folder 10).
 *
 * How it works in this build (User-Foundation-Notes.md, "Profile, Deactivate /
 * Activate, Delete"; pages/user/UserDeactivateDrawer.ts): row "Inactivate"
 * (`-toggle-activation`, gated by Users.ToggleUserActivation - ONE right for
 * both directions) -> drawer "Deactivate User?" with the warning "Deactivate
 * {name}? They will not be able to sign in. No other record is changed.",
 * Deactivation Reason (test, Left Organisation, Role Changed, Extended Leave,
 * Security Incident, Policy Violation, Prolonged Inactivity, Other), Details
 * (maxlength 500), Cancel / Deactivate. Other + empty details -> 'Details are
 * required when the reason is "Other".'. Deactivate -> ToggleUserActivation
 * `{ id, isActive: false, inactivationReasonId, inactivationDetails }` -> toast
 * "User deactivated / The user is now inactive.". Row "Activate" -> `#pbm-dialog`
 * "Activate User? / Do you want to make {name} active?" -> "User activated / The
 * user is now active.". A deactivated user's sign-in -> "Your account is
 * inactive. Please contact your administrator."; re-activation keeps the
 * existing password (verified).
 *
 * Literal readings / decisions:
 * - "System Administrator" = the suite admin; every user deactivated or
 *   activated is the case's own suite user.
 * - "the reason is recorded": the reason id ToggleUserActivation was sent with
 *   (the profile shows no reason); the user record's isActive.
 * - 20613 S3 "the Details field becomes mandatory": observed as a Deactivate
 *   with empty details being refused with the Other message once Other is
 *   chosen (nothing is sent), then the case's details are typed.
 * - 20616 / 20617 "credentials": a suite user whose password the suite set
 *   through the reset flow (`userWithPassword`); the deactivation precondition
 *   is made through the API; the sign-in runs in a window with no session.
 *   "an access-denied message": the sign-in banner says the account is
 *   inactive / access is denied.
 * - 20619: the case's seven names are asserted exactly (live: "Left
 *   Organisation" spelled with an s, plus a stray "test" - expected to FAIL,
 *   finding). "Details remains optional" for each non-Other reason: the user is
 *   deactivated with that reason and EMPTY details (then re-activated through
 *   the API) - every reason the drawer offers is proved; a reason it does not
 *   offer is reported missing.
 * - 20620: 501 characters are typed; the box must hold 500 at most (maxlength)
 *   or show a length error, and Deactivate must never send more than 500.
 * - 20621 "Activate or Deactivate option": the row toggle on an ACTIVE and on an
 *   INACTIVE suite user, for a suite account holding every user right except
 *   Users.ToggleUserActivation (decision 7), after the admin baseline; "a user
 *   holding the permission" = the admin.
 * - 20623 "rapidly select Confirm": Deactivate clicked three times in one
 *   synchronous burst - exactly ONE ToggleUserActivation request and at most one
 *   "User deactivated"; "the user's history": System Settings > Audit Logs
 *   (entity ApplicationUser) - at most one Active -> Inactive entry.
 * - 20625 (exploratory): Other + details -> Policy Violation -> back to Other
 *   WITHOUT re-entering details -> Deactivate must show the Other message (the
 *   case expects the rule re-enforced; if the typed text is kept, Deactivate
 *   goes through and the step FAILS - the user is then re-activated through
 *   the API before the reopen check). "browser back or outside click": a click
 *   on the mask outside the drawer, then Back if it is still open.
 * - 20626 "Confirm button": the drawer's affirmative button (labelled
 *   "Deactivate" live - accepted as /confirm|deactivate/); "Cancel button".
 */
export const CASES = {
  deactivateRoleChanged: { azureId: '20612', reason: 'Role Changed' },
  deactivateOther: { azureId: '20613', reason: 'Other', details: 'Contract ended early' },
  otherNeedsDetails: { azureId: '20614', reason: 'Other' },
  cancelDrawer: { azureId: '20615', reason: 'Extended Leave', details: 'Testing cancel' },
  deactivatedCannotSignIn: { azureId: '20616' },
  reactivatedSignsIn: { azureId: '20617' },
  details500: { azureId: '20618', reason: 'Security Incident', length: 500 },
  reasonList: { azureId: '20619' },
  details501: { azureId: '20620', reason: 'Policy Violation', length: 501 },
  toggleHiddenWithoutPermission: { azureId: '20621', shape: { full: true, without: ['Users.ToggleUserActivation'] } },
  activationNeedsYes: { azureId: '20622' },
  rapidConfirm: { azureId: '20623', reason: 'Prolonged Inactivity', clicks: 3 },
  listAndTilesRefresh: { azureId: '20624', reason: 'Extended Leave' },
  exploratoryReasons: { azureId: '20625', details: 'Exploratory details typed under Other' },
  drawerChecklist: { azureId: '20626' },
} as const;

/** The maintained reasons the story names, in its order. */
export const REASONS = ['Left Organization', 'Role Changed', 'Extended Leave', 'Security Incident', 'Policy Violation', 'Prolonged Inactivity', 'Other'] as const;

/** The reason ids ToggleUserActivation sends (USER_LOOKUP.deactivationReason) by label. */
export const REASON_KEY = {
  'Role Changed': 'roleChanged',
  'Extended Leave': 'extendedLeave',
  'Security Incident': 'securityIncident',
  'Policy Violation': 'policyViolation',
  'Prolonged Inactivity': 'prolongedInactivity',
  Other: 'other',
} as const;

/** The drawer's warning for a user shown as `name`. */
export const warningFor = (name: string): string => `Deactivate ${name}? They will not be able to sign in. No other record is changed.`;

/** Texts and patterns. */
export const MESSAGES = {
  otherNeedsDetails: 'Details are required when the reason is "Other".',
  deactivated: /User deactivated/i,
  activated: /User activated/i,
  accessDenied: /inactive|access denied|not (allowed|permitted)|deactivated|disabled/i,
  activatePrompt: /activate/i,
  lengthError: /500|too long|maximum|at most/i,
} as const;
