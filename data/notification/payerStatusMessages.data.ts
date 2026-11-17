/**
 * US 12941 "Configure notification messages for payer status changes"
 * (notification folder 02, Writer E) - 10 cases: 21348, 21349, 21351, 21352,
 * 21353, 21354, 21357, 21358, 21359, 21360 (21350 / 21355 / 21356 wait for
 * the BA).
 *
 * Screen: System Settings > Notification Center > App Notification, "Create"
 * drawer (1 General / 2 Content / 3 Audiences) - see the foundation notes.
 *
 * Literal readings / TC-vs-AC decisions (the test case wins):
 * - "New Notification" (21353) is the app's "Create" button; "Action = Active"
 *   is the app's "Active - Payer", "Expiring Soon" is "Expiring Soon - Payer";
 *   module "Payer Management" (live labels, GetOptions).
 * - TC names "Approved payer" / "Test notification" / "Test cancel
 *   notification" are examples: the General-step cases that never save type the
 *   TC's name (nothing is saved, so the live "Approved payer" definition is not
 *   touched); every case that saves - or could save - uses a suite name
 *   ("QA Automation Notification ...", deleted at teardown).
 * - TC messages "approved {{PayerName}}" / "{{PayerName}} مقبول" are typed as
 *   written ({{PayerName}} is the app's payer variable; the AC's {{Entity}}).
 * - 21348: "a validation error requiring the Action field" = the toast
 *   FILL_GENERAL plus exactly one inline FIELD_REQUIRED (the Action's); "does
 *   not advance" = the Content step's English message box never shows.
 * - 21351 / 21352: the field's inline FIELD_REQUIRED under the empty message
 *   (and not under the filled one); the wizard stays on Content (no Audiences
 *   "Add audience"). RTL = `dir` (or the computed direction) "rtl".
 * - 21357: the AC says all four Expiring Soon placeholders are mandatory; the
 *   messages hold every variable of "Expiring Soon - Payer" except
 *   MISSING_VARIABLE (names read from GetActionVariables at run time). Refused
 *   = Next or Save does not create the definition AND some message names
 *   MISSING_VARIABLE. The audience step is answered with careconnect when
 *   reached (the save needs one - "Add at least one audience.").
 * - 21358: the TC has no audience step but the app requires one (AC 3-step
 *   wizard, live "Add at least one audience."): careconnect is added; the
 *   definition is saved INACTIVE so it never notifies.
 * - 21353: Cancel on a filled General step may raise "Unsaved Changes"; it is
 *   answered Discard (the TC's "changes are discarded").
 */
export const CASES = {
  actionRequired: { azureId: '21348' },
  generalStepAccepted: { azureId: '21349' },
  englishRequired: { azureId: '21351' },
  arabicRequiredRtl: { azureId: '21352' },
  cancelDiscards: { azureId: '21353' },
  backKeepsGeneral: { azureId: '21354' },
  expiringSoonNeedsDaysRemaining: { azureId: '21357' },
  optionalFieldsBlank: { azureId: '21358' },
  backFromContentKeepsGeneral: { azureId: '21359' },
  backFromAudiencesKeepsMessages: { azureId: '21360' },
} as const;

export const STORY = 'US 12941 - Configure notification messages for payer status changes';

export const PAYER_MODULE = 'Payer Management';
export const ACTIVE_ACTION = 'Active - Payer';
export const EXPIRING_SOON_ACTION = 'Expiring Soon - Payer';
/** What Payer Management offers in Action (AC: Active, Inactive, Expired, Expiring Soon). */
export const PAYER_ACTIONS = ['Active - Payer', 'Inactive - Payer', 'Expired - Payer', 'Expiring Soon - Payer'] as const;

export const TC_NAME = 'Approved payer';
export const TC_DESCRIPTION = 'Notify on payer activation';
export const ENGLISH_MESSAGE = 'approved {{PayerName}}';
export const ARABIC_MESSAGE = '{{PayerName}} مقبول';

export const FILL_GENERAL = 'Please fill Name, Module and Action.';
export const FIELD_REQUIRED = 'This field is required.';
export const SAVED = 'Saved successfully.';

/** The Expiring Soon placeholder 21357 leaves out. */
export const MISSING_VARIABLE = 'DaysRemaining';

/** careconnect as the audience pickers show it. */
export const ADMIN_AUDIENCE_NAME = 'CareConnect Admin User';
