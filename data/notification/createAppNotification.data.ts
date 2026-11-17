/**
 * US 21000 "Create App Notification" (notification folder 16, 23 cases written of 34; the 11 in
 * the folder map's `waiting` list wait for the BA and are not written).
 *
 * How it works in this build (foundation probe b32-b42, f01-f05): the Create drawer has three steps
 * - 1 General (Name maxlength 200, Module, Action, Description maxlength 1000, Active ticked) with
 * Cancel / Next; 2 Content (English textarea dir=ltr, Arabic dir=rtl, Notes, Preview eye, Manage
 * Variables, right-click "Insert variable") with Back / Next; 3 Audiences ("Add audience" cards of
 * type Users / Roles + Assign window) with Back / SAVE. Save exists ONLY on step 3. Next with
 * General incomplete -> toast "Please fill Name, Module and Action." + "This field is required."
 * under each empty field; Next with Content empty -> "English message and Arabic message are
 * required."; Save with no audience -> "Add at least one audience.". A dirty drawer's X asks
 * "Unsaved Changes" (Keep Editing / Discard Changes).
 *
 * SAFETY: names start with "QA Automation Notification" and `suiteDefinitions.watch()` runs before
 * any Save through the screen, so teardown deletes whatever the case created. Audiences are only
 * careconnect ("CareConnect Admin User"), maalmohammad (secondUser.displayName) or a suite role.
 * Delivery cases raise events on the suite's OWN records (an "Automation Network ..." it creates):
 * submitting it ("Need to Approve - Network"), approving it ("Approved - Network"), inactivating an
 * Active one ("Inactive - Network", Active after a network-job move through `jobClock`, restored).
 *
 * Literal readings / TC-vs-AC decisions (the test case wins):
 * - "Click Save" on General / Content: Save is not rendered there; the attempt is made from the step
 *   the case names by `saveFromHere` (Save when shown, else Next - the gate the app puts in front of
 *   Save). 21335 ("click Save from any step") also tries the stepper's step-3 bullet and then reads
 *   the General step's errors. The message asserted is the case's.
 * - Name max: the AC/TC say 100, the input carries maxlength 200 - 21305 asserts the TC (blocked at
 *   100 or flagged); 21303 asserts 100 is accepted whole.
 * - Bilingual messages (21306 / 21307 / 21310 / 21323 / 21335): the English text in the English UI,
 *   then the same attempt in the Arabic UI (lead decision 4) with the Arabic text the case quotes.
 * - 21308 "displays the placeholders available for that event": the General step shows no list; the
 *   placeholders are offered by the right-click Insert-variable menu on the Content step - compared
 *   with GetActionVariables of the action. "Need to Approve" is "Need to Approve - Payer".
 * - 21309: after the module change the Action is empty and the variables then offered are the new
 *   action's (no stale Policy variables) - the case cannot reach Content with no Action.
 * - 21317 TC values ("Policy Expiry Alert", Policy Management / Expiring Soon - Policy) are used as
 *   given (name prefixed); nothing is saved.
 * - 21320: the event is "Need to Approve - Network" raised by SUBMITTING a suite network (no
 *   approval needed); the recipient is careconnect (an approver). The TC: "the delivered notification
 *   SHOWS only the message and no Notes" = the bell row and the notification opened from it (the
 *   Notification Detail page) show no Notes text, and the delivered messages carry none. The inbox
 *   API answer's own `notes` field (GetMyNotifications; the full run of 2026-11-12 saw the Notes
 *   there) is displayed nowhere - it is reported as an "info" annotation, not judged.
 * - 21322: "Approved - Network"; maalmohammad (the second user) creates and submits the suite network
 *   and careconnect approves it; only maalmohammad may receive it (careconnect - the approver - not).
 * - 21326 / 21330 use "Inactive - Network" (TC example events replaced by one the suite can raise on
 *   its own record, lead decision 2); 21326's role is a suite role held only by maalmohammad.
 * - 21330: Audience A = careconnect, Audience B = maalmohammad.
 * - 21333 uses "Expiring Soon - Network" with the global reminder settings as they are
 *   (7 days, Every day): both records are made Active by a network-job run, then the reminder process
 *   (the network job - no separate reminder job is listed) runs ONCE MORE with both Active and in the
 *   window, and each must have one reminder; then record A (expiring in REMINDER_A_DAYS) is
 *   inactivated and record B (REMINDER_B_MINUTES after creation) expires; a later network-job run
 *   must remind neither. With the daily cadence a second same-day run would not remind anyway - the
 *   case still asserts what it asks. (Network / policy folders 11-12 never saw an Expiring Soon sent
 *   in this environment; if none arrives here either, it is the same finding.)
 * - 21314 checks what the TC asks (saved, Active = No); "the drawer closes" is 21335's, not 21314's.
 * - 21324 compares names with spaces collapsed (maalmohammad's stored name "Payer  Admin" has a
 *   double space; the card shows one).
 * - 21334 exploratory: exactly the listed actions; "no errors" = no 5xx API answer, no uncaught page
 *   error, values kept, no stale action/placeholders. The header language toggle is tried while the
 *   drawer is open; a modal drawer that refuses the click is reported (annotation), not failed.
 * - Toasts are asserted as "contains" on the normalised text (stacked toasts share one id).
 */

export const STORY = { id: '21000', title: 'Create App Notification' } as const;

export const CASES = {
  name100: { azureId: '21303' },
  name101: { azureId: '21305' },
  noName: { azureId: '21306' },
  noAction: { azureId: '21307' },
  actionsByModule: { azureId: '21308' },
  moduleResetsAction: { azureId: '21309' },
  noModule: { azureId: '21310' },
  description1000: { azureId: '21311' },
  description1001: { azureId: '21312' },
  activeByDefault: { azureId: '21313' },
  createInactive: { azureId: '21314' },
  stepsKeepData: { azureId: '21317' },
  preview: { azureId: '21319' },
  notesHidden: { azureId: '21320' },
  approvedToSubmitter: { azureId: '21322' },
  audienceRequired: { azureId: '21323' },
  assignAudiences: { azureId: '21324' },
  onceOnly: { azureId: '21326' },
  sameEventAll: { azureId: '21330' },
  remindersStop: { azureId: '21333' },
  exploratory: { azureId: '21334' },
  saveChecksAllSteps: { azureId: '21335' },
  discardConfirm: { azureId: '21336' },
} as const;

/** Texts the app shows, English / Arabic (AC + live probe). */
export const TEXT = {
  fillNameModuleAction: { en: 'Please fill Name, Module and Action.', ar: 'يرجى تعبئة الاسم والوحدة والإجراء.' },
  fieldRequired: { en: 'This field is required.', ar: 'هذا الحقل مطلوب.' },
  messagesRequired: { en: 'English message and Arabic message are required.' },
  addAudience: { en: 'Add at least one audience.', ar: 'أضف جمهورًا واحدًا على الأقل.' },
  saved: { en: 'Saved successfully.', ar: 'تم الحفظ بنجاح.' },
  unsaved: { title: 'Unsaved Changes', message: 'You have unsaved changes. If you leave now, your edits will be lost.' },
} as const;

export const STEP_LABELS = ['General', 'Content', 'Audiences'] as const;

export const NAME_MAX = 100;
export const DESCRIPTION_MAX = 1000;
/** Characters of a long name / description: the suite prefix padded with "x". */
export const LONG_TEXT = (prefix: string, length: number): string => `${prefix} `.padEnd(length, 'x').slice(0, length);

/** Audience picker display names (foundation notes). */
export const ADMIN_DISPLAY = 'CareConnect Admin User';
export const USERS = 'Users';
export const ROLES = 'Roles';

/** Error-id fragments (`<field>-error`) of the General / Content fields. */
export const ERROR_FIELD = { name: 'name', module: 'module', action: 'action', english: 'english-message', arabic: 'arabic-message' } as const;

/** 21317: the TC's values. */
export const STEPS_CASE = { nameLabel: 'Policy Expiry Alert', module: 'Policy Management', action: 'Expiring Soon - Policy' } as const;

/** 21308 / 21309. */
export const APPROVAL_MODULE = 'Approval Management';
export const NEED_TO_APPROVE_PAYER = 'Need to Approve - Payer';
export const POLICY_MODULE = 'Policy Management';
export const POLICY_EXPIRING = 'Expiring Soon - Policy';
export const PLAN_MODULE = 'Plan Management';
export const PLAN_INACTIVE = 'Inactive - Plan';

/** Labels used across the delivery / validation cases. */
export const NETWORK_MODULE = 'Network Management';
export const NETWORK_INACTIVE = 'Inactive - Network';
export const NETWORK_NEED_APPROVE = 'Need to Approve - Network';
export const NETWORK_APPROVED = 'Approved - Network';
export const NETWORK_EXPIRING = 'Expiring Soon - Network';

/** 21320. */
export const NOTES_TEXT = 'Internal reminder: confirm with compliance before next review.';
/** 21320: the annotation type that reports (does not judge) the inbox API's `notes` field. */
export const NOTES_API_ANNOTATION = 'info';

/** Delivery waits. */
export const DELIVERY_WAIT_MS = 3 * 60_000;
/** After the first item arrived, how long a duplicate is given to appear (21326). */
export const DUPLICATE_GRACE_MS = 45_000;
/** 21333: record A expires in this many days (inside the 7-day window); record B a few minutes after creation. */
export const REMINDER_A_DAYS = 3;
export const REMINDER_B_MINUTES = 15;

/** 21334: the long paste. */
export const LONG_PASTE_LENGTH = 1500;

/** A suite role's rights for the second user in 21326 (it only needs to read its own inbox). */
export const INBOX_ONLY_RIGHTS = ['NotificationDefinition.GetDefinitions'] as const;
