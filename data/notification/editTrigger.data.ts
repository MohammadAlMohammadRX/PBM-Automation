import { PREDEFINED_TRIGGER } from '../../utils/notification/notificationApi';
import type { TemplateSpec } from '../../utils/notification/writerAHelpers';

/**
 * US 20981 "Edit Trigger" (notification folder 04, 15 cases) - Writer A.
 *
 * How it works in this build (foundation probe 2026-11-11, e14-e22): a custom
 * row's Edit opens "Edit Trigger" on General (Name / Module / Action / Active
 * enabled, Recipient read-only); a PREDEFINED row offers Edit only and opens on
 * Content, its General step locked with the notice "This is a predefined
 * trigger...". Save answers the toast "Saved successfully.".
 *
 * SAFETY: every custom trigger here is a suite trigger ("QA Automation Trigger
 * ...", on a FREE action, INACTIVE unless the case needs it active) made
 * through `suiteTriggers` and deleted at teardown. Predefined triggers are only
 * opened and closed - except 21364, whose English SMS wording is changed through
 * the screen and ALWAYS put back through the API and read back
 * (`rewordPredefined`).
 *
 * Literal readings / decisions:
 * - TC example names ("Custom Reminder", "Custom Reminder Updated") are examples
 *   (lead decision 2): the suite trigger's own name, and that name + " Updated".
 * - 21361 "modify a template field": the English SMS body gets WORD_EDIT appended
 *   (the required placeholders stay in it).
 * - 21363 "attempt to type / change / toggle": the Name is typed with force, the
 *   Module select is asked for another module, Active is clicked with force;
 *   "none accept the change" = the General step reads the same values after.
 * - 21364: "show Active status" = the row's Active cell "✓" AND GetTrigger
 *   isActive; "four templates" = the four channel/language pairs ALL_PAIRS. One
 *   wording per trigger = its English SMS body + PREDEFINED_SUFFIX, then put back.
 * - 21365: channel and language are two selects; "Email/English is not offered"
 *   = on the new card, choosing Email does not offer English (every pair the
 *   card offers is read - `offeredPairs`).
 * - 21366 / 21916: the hint text is asserted literally ("Every channel and
 *   language already has a message template.").
 * - 21367: TC data "one English SMS template and one Arabic Email template".
 * - 21368: the Arabic SMS body gets " Hello" (the TC's word); "under the body"
 *   = the drawer's inline errors (the template's content error) - checked in the
 *   drawer errors AND the toast text together.
 * - 21369: needs GetOptions smsMaxMessageLength = SMS_LIMIT (500); when it is
 *   not, the case is BLOCKED (the SMS Provider setting is not the suite's to
 *   change). Bodies of exactly 500 / 501 characters include the required
 *   placeholders.
 * - 21372: "more than ten triggers" - the suite adds its own until there are at
 *   least MIN_TRIGGERS (and at least MIN_SUITE) and compares pages 1 and 2 with
 *   GetTriggers sorted "CreatedOn desc".
 * - 21374: the predefined "Forget Password" English Email body; the caret is put
 *   at the END of the first paragraph by clicking there, then a right-click at
 *   the same point inserts {{ResetLink}}; "exactly at the cursor" = the first
 *   paragraph reads its old text + "{{ResetLink}}". Closed with Discard (nothing
 *   saved).
 * - 21375: "Sample Value" = the value shown in Manage Variables for each
 *   placeholder used by the English Email subject/body; the Preview must show
 *   each one and no "{{" left.
 * - 21378: "confirm" on Delete - the probe saw DELETE sent at once with NO
 *   dialog; the case only needs the trigger gone, so a missing dialog is not
 *   asserted here (it is in folder 05).
 * - 21380: Arabic Email subject/body + both SMS bodies are replaced with the
 *   texts below (required placeholders appended); "persisted" = GetTrigger.
 */
export const CASES = {
  editCustom: { azureId: 21361 },
  predefinedOpensContent: { azureId: 21362, predefinedId: PREDEFINED_TRIGGER.invitation },
  predefinedLocked: { azureId: 21363, predefinedId: PREDEFINED_TRIGGER.twoFactor, attemptName: 'QA attempt', attemptModule: 'Approval Management' },
  predefinedSix: { azureId: 21364 },
  pairUnique: { azureId: 21365 },
  maxFour: { azureId: 21366 },
  englishRequired: { azureId: 21367 },
  arabicLetters: { azureId: 21368, englishWord: ' Hello' },
  smsLimit: { azureId: 21369 },
  newestFirst: { azureId: 21372 },
  insertAtCursor: { azureId: 21374, predefinedId: PREDEFINED_TRIGGER.forgetPassword, placeholder: 'ResetLink' },
  preview: { azureId: 21375, predefinedId: PREDEFINED_TRIGGER.forgetPassword },
  predefinedNoToggleDelete: { azureId: 21377 },
  customLifecycle: { azureId: 21378 },
  arabicAndSms: { azureId: 21380 },
} as const;

export const MESSAGE = {
  editTitle: 'Edit Trigger',
  saved: 'Saved successfully.',
  allChannelsUsed: 'Every channel and language already has a message template.',
  englishRequired: 'At least one English message template is required.',
  arabicOnly: 'Arabic letters only.',
  /** "SMS message must not exceed {{max}} characters (currently {{length}})." */
  smsTooLong: (max: number, length: number): string => `SMS message must not exceed ${max} characters (currently ${length}).`,
  predefinedNotice: 'This is a predefined trigger. Its name, module, action, recipient and active state are fixed',
  activateLabel: 'Activate',
  deactivateLabel: 'Deactivate',
} as const;

export const ACTIVE_MARK = '✓';
export const INACTIVE_MARK = '✗';

/** The six predefined triggers (AC) and the row actions they may offer. */
export const PREDEFINED_IDS = Object.values(PREDEFINED_TRIGGER);
export const PREDEFINED_ACTIONS = ['edit'];
export const ALL_PAIRS = ['Email/Arabic', 'Email/English', 'SMS/Arabic', 'SMS/English'];

export const WORD_EDIT = ' edited';
export const RENAMED_SUFFIX = ' Updated';
export const PREDEFINED_SUFFIX = ' QA';

export const SMS_LIMIT = 500;
export const SMS_LIMIT_REASON = `GetOptions smsMaxMessageLength is not ${SMS_LIMIT}; the case needs the default SMS limit and the SMS Provider setting is not the suite's to change`;

export const MIN_TRIGGERS = 11;
export const MIN_SUITE = 3;
export const PAGE_SIZE = 10;

export const TEMPLATES = {
  smsEnglish: [{ channel: 'SMS', language: 'English' }] as TemplateSpec[],
  emailEnglish: [{ channel: 'Email', language: 'English' }] as TemplateSpec[],
  all4: [
    { channel: 'Email', language: 'English' },
    { channel: 'Email', language: 'Arabic' },
    { channel: 'SMS', language: 'English' },
    { channel: 'SMS', language: 'Arabic' },
  ] as TemplateSpec[],
  smsEnglishEmailArabic: [{ channel: 'SMS', language: 'English' }, { channel: 'Email', language: 'Arabic' }] as TemplateSpec[],
  smsEnglishArabic: [{ channel: 'SMS', language: 'English' }, { channel: 'SMS', language: 'Arabic' }] as TemplateSpec[],
};

/** 21380 - new wording (the action's required placeholders are appended at run time). */
export const ARABIC_EDIT = {
  emailSubject: 'موضوع معدل للاختبار',
  emailBody: 'نص البريد المعدل للاختبار',
  smsArabic: 'رسالة قصيرة معدلة للاختبار',
  smsEnglish: 'Edited English SMS for the test',
};

/** 21369 - the lead of the 500 / 501 character bodies. */
export const SMS_LEAD = 'QA automation limit check';

/**
 * LEAD GATE (2026-11-11): 21364 rewords the SIX live predefined triggers (2FA, Forget Password,
 * Invitation, First Activation, System Job Failed, API Client Credentials) and puts them back. While
 * it runs, a colleague's real 2FA / password e-mail would carry the test wording. Off until the
 * user approves it; the case reports BLOCKED with this reason instead of editing them.
 */
export const PREDEFINED_REWORD = {
  allowed: false,
  reason: 'Editing the live predefined triggers (2FA, Forget Password, Invitation...) needs the user\'s approval - colleagues receive these e-mails while the test runs (lead gate, data/notification/editTrigger.data.ts PREDEFINED_REWORD).',
} as const;
