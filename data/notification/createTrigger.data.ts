/**
 * US 20983 "Create Trigger" (notification folder 06, 21 cases) - Writer A.
 *
 * How it works in this build (foundation probe 2026-11-11, b07-b15, e01-e09,
 * e23): Add Trigger opens "Add New Trigger" on General (Name max 50, Module,
 * Action, Recipient read-only, Active ticked); Next with nothing toasts "Please
 * fill Name, Module and Action." and marks each field "This field is
 * required.". Content starts with ONE card (Language English, Channel empty);
 * SMS = a textarea, Email = Subject + a rich editor with a "Template" button.
 * Right-click a subject / body -> Insert variable (the action's placeholders);
 * the eye icon -> Preview dialog with the sample values. Save -> CreateTrigger,
 * toast "Saved successfully.".
 *
 * SAFETY: a case that SAVES (or may save when the app is wrong) calls
 * `suiteTriggers.watch()` first and saves only "QA Automation Trigger ..." names
 * on a FREE action (one no trigger uses) - teardown deletes them. Cases that
 * only look use FORM_ONLY (any action, never saved; closed with Discard).
 * 21910 needs a trigger on "Need to Approve - Payer": a foreign one if it exists,
 * else the suite makes its own ACTIVE one and deletes it straight after the save
 * (while it lives, payer submissions in the shared environment attempt e-mails).
 *
 * Literal readings / decisions:
 * - TC example values are examples (lead decision 2): "Payment Reminder" = a
 *   suite name ("QA Automation Trigger Payment Reminder <stamp>"); the second
 *   trigger with that name goes on ANOTHER free action so only the name clashes.
 * - 21902: the TC picks "User Management" + an action (FORM_ONLY.userModule and
 *   the first action it offers); "cannot be completed" = still on General.
 * - 21905: the 51st character is TYPED (keyboard), the 50 are filled; the
 *   50-character name is then saved once on a free action (how-line).
 * - 21906: "lists only PBM Engine actions" = exactly the PBM Engine actions of
 *   GetOptions; "placeholders load" = the Insert variable menu of the Content
 *   body equals GetActionVariables of the chosen action. Nothing saved.
 * - 21908: "cleared back to empty" = the Action select no longer shows the chosen
 *   action nor any action label.
 * - 21911: "one default English template ready for channel selection" = one card,
 *   Language "English", Channel empty.
 * - 21913: "the Channel field is flagged as required" = the card's error
 *   "Every message template needs a channel and a language." (live text).
 * - 21914: TC precondition "Email/English and SMS/English configured" - the suite
 *   trigger is made with both and reopened with Edit (how-line).
 * - 21917: Subject maxlength 300 - 300 filled, the 301st typed.
 * - 21918: "each of the action's placeholders" = GetActionVariables of the action
 *   (what the Insert variable menu is built from); the "branded" look is not judged.
 * - 21919 / 21369: GetOptions smsMaxMessageLength must be SMS_LIMIT, else BLOCKED.
 * - 21920 / 21921: the mixed bodies carry digits, punctuation and the required
 *   placeholders; the same body without the wrong-language letters must then save
 *   (proves those are allowed). 21921 keeps a valid English SMS card first (an
 *   English template is required).
 * - 21924 / 21925: "Sample Value" = Manage Variables' Sample value of each
 *   placeholder; "the action's placeholders" = GetActionVariables names.
 * - 21926: "confirmation prompt" = "Unsaved Changes" with its message (live text).
 */
export const CASES = {
  nameRequired: { azureId: 21902 },
  opensOnGeneral: { azureId: 21904 },
  nameMax: { azureId: 21905 },
  pbmEngineActions: { azureId: 21906, module: 'PBM Engine' },
  duplicateName: { azureId: 21907, label: 'Payment Reminder' },
  moduleClearsAction: { azureId: 21908, from: 'User Management', to: 'Approval Management' },
  duplicateAction: { azureId: 21910, module: 'Approval Management', action: 'Need to Approve - Payer', recipient: 'User' },
  nextToContent: { azureId: 21911 },
  activeByDefault: { azureId: 21912 },
  channelRequired: { azureId: 21913 },
  freePairsOnly: { azureId: 21914, expected: ['Email/Arabic', 'SMS/Arabic'] },
  englishRequired: { azureId: 21915 },
  maxFour: { azureId: 21916 },
  subjectMax: { azureId: 21917 },
  brandedTemplate: { azureId: 21918 },
  smsLimit: { azureId: 21919 },
  englishOnly: { azureId: 21920 },
  arabicOnly: { azureId: 21921 },
  preview: { azureId: 21924 },
  insertMenu: { azureId: 21925 },
  unsavedChanges: { azureId: 21926 },
} as const;

export const MESSAGE = {
  addTitle: 'Add New Trigger',
  required: 'This field is required.',
  saved: 'Saved successfully.',
  nameTaken: 'A trigger with this name already exists.',
  actionTaken: 'A trigger for this action and recipient already exists.',
  englishRequired: 'At least one English message template is required.',
  channelLanguage: 'Every message template needs a channel and a language.',
  allChannelsUsed: 'Every channel and language already has a message template.',
  englishOnly: 'English letters only.',
  arabicOnly: 'Arabic letters only.',
  smsTooLong: (max: number, length: number): string => `SMS message must not exceed ${max} characters (currently ${length}).`,
  unsavedTitle: 'Unsaved Changes',
  unsavedMessage: 'You have unsaved changes. If you leave now, your edits will be lost.',
} as const;

/** Cases that only look at the drawer (never saved): any module / action. */
export const FORM_ONLY = {
  userModule: 'User Management',
  module: 'Member Management',
  action: 'Policy Expired',
  name: 'QA Automation Trigger look only',
  /** A body naming Policy Expired's placeholders. */
  smsBody: 'QA automation SMS for {{MemberName}} policy {{PolicyNumber}}',
} as const;

export const NAME_MAX = 50;
export const SUBJECT_MAX = 300;
export const SMS_LIMIT = 500;
export const SMS_LIMIT_REASON = `GetOptions smsMaxMessageLength is not ${SMS_LIMIT}; the case needs the default SMS limit and the SMS Provider setting is not the suite's to change`;

/** Bodies (the action's required placeholders are appended at run time). */
export const BODY = {
  english: 'QA automation message',
  /** 21920: Arabic letters + digits + punctuation. */
  englishWithArabic: 'QA automation مرحبا 123, test!',
  englishClean: 'QA automation 123, test!',
  /** 21921: English letters + digits + punctuation. */
  arabicWithEnglish: 'رسالة اختبار Hello 123، !',
  arabicClean: 'رسالة اختبار 123، !',
  smsLead: 'QA automation limit check',
  subject: 'QA automation subject',
} as const;
