/**
 * US 21012 "Create Announcement" (notification folder 24-create-announcement,
 * 15 cases; 21729 / 21733 / 21740 / 21743 / 21744 wait for the BA).
 *
 * How it works in this build (reports/notification/Notification-Foundation-Notes.md):
 * "Add Announcement" opens the drawer "Create" - 1 General (Name max 200,
 * English message dir=ltr, Arabic message dir=rtl, Publish at "yyyy-MM-dd HH:mm"
 * Riyadh, default now) and 2 Audiences (Add audience -> card type Users / Roles
 * -> Assign pick list). Next on an empty General shows the toast "Please fill
 * Name, English message, Arabic message and Publish date/time." and "This field
 * is required." under each field; Save without an audience shows "Add at least
 * one audience."; a good save shows "Saved successfully.".
 *
 * SAFETY: names start with "QA Automation Announcement"; `suiteAnnouncements.watch()`
 * runs before every screen create so teardown deletes (Scheduled) or cancels
 * (Published) what the case made. Audiences are only careconnect (the admin
 * session itself), maalmohammad (21741) or an EMPTY suite role ("QA Automation
 * Role ..." with no members, removed at teardown). Validation cases use a FUTURE
 * Publish at so a wrongly accepted save leaves only a deletable Scheduled record.
 *
 * Literal readings / TC-vs-AC decisions (the test case wins):
 * - TC example values are examples (lead decision 2): "Holiday Schedule Update",
 *   "Q4 Update #2" become suite names carrying those words; the TC's English /
 *   Arabic texts are kept verbatim. "1 selected user" = careconnect itself
 *   (picker name read from GetAudienceCandidates, ADMIN_PICKER_NAME as fallback);
 *   "role Managers" / "1 selected role" = an empty suite role.
 * - 21726 step 2 says the General step opens with Publish at EMPTY, its own step 6
 *   (and the AC) say it shows the current date/time: the step-2 check is Name /
 *   English / Arabic empty and Publish at holding the default within a minute of now.
 * - "Click Save" on the General step (21731, 21732, 21735): the General step has
 *   Next, not Save - the attempt presses Next and, when the Audiences step is
 *   reached, assigns careconnect and presses Save; the message may come from
 *   either press (toast, drawer text or the server's answer).
 * - 21730: TC says leave Publish at empty - it is emptied (the probe proved it can be).
 * - 21736: the form is opened at the start of a minute (the picker drops seconds),
 *   then ~45 s are spent typing and Save is pressed ~50 s after opening.
 * - 21737: "the system prevents a second Users audience" = Users not offered on
 *   the second card, or choosing it does not leave two Users cards, or Save
 *   refuses with a message. The attempt's Save uses a future Publish at.
 * - 21741: User A = maalmohammad holding ONLY a suite role (secondUser.withRights),
 *   that role = "Managers"; Users(Payer Admin) + Roles(that role), published now;
 *   exactly one inbox copy (API) and one bell row for maalmohammad.
 * - 21728: "shown as the title in the recipient's list and detail page" = the
 *   careconnect announcement bell row and /announcements/<id> title.
 */
export const CASES = {
  publishNowToUser: { azureId: '21726' },
  scheduleToRole: { azureId: '21727' },
  nameMaxLength: { azureId: '21728' },
  emptyMandatory: { azureId: '21730' },
  englishNotEnglish: { azureId: '21731' },
  arabicNotArabic: { azureId: '21732' },
  exactlyOneYear: { azureId: '21734' },
  overOneYear: { azureId: '21735' },
  fillingAllowance: { azureId: '21736' },
  sameTypeTwice: { azureId: '21737' },
  cardWithoutRecipients: { azureId: '21738' },
  noAudience: { azureId: '21739' },
  onceForSeveralAudiences: { azureId: '21741' },
  secondCard: { azureId: '21742' },
  digitsAndPunctuation: { azureId: '21745' },
} as const;

/** Literal texts (AC / TC / live screens 2026-11-11). Shared by folders 24, 25 and 27. */
export const MESSAGES = {
  saved: 'Saved successfully.',
  fillAll: 'Please fill Name, English message, Arabic message and Publish date/time.',
  required: 'This field is required.',
  englishOnly: 'English letters only.',
  arabicOnly: 'Arabic letters only.',
  past: 'Publish date/time cannot be in the past.',
  overYear: 'Publish date/time cannot be more than one year ahead.',
  addAudience: 'Add at least one audience.',
  /** Shown under Publish at on the General step. */
  publishHint: 'Leave the current date/time to publish immediately, or pick a future time to schedule.',
} as const;

/** careconnect's name in the audience picker when GetAudienceCandidates does not list it (foundation notes). */
export const ADMIN_PICKER_NAME = 'CareConnect Admin User';

/** Labels as shown. */
export const LABELS = {
  users: 'Users',
  roles: 'Roles',
  scheduled: 'Scheduled',
  published: 'Published',
} as const;

/** The TC's texts (21726). */
export const HOLIDAY = {
  label: 'Holiday Schedule Update',
  english: 'Offices will be closed on Friday.',
  arabic: 'ستُغلق المكاتب يوم الجمعة.',
} as const;

/** A valid pair for cases whose texts the TC does not give. */
export const VALID_TEXT = {
  english: 'QA automation announcement for the create story.',
  arabic: 'إعلان اختبار آلي لقصة الإنشاء.',
} as const;

/** 21731 / 21732 test data. */
export const MIXED = {
  englishWithArabic: 'مرحبا Offices closed',
  arabicWithEnglish: 'Hello مرحبا',
} as const;

/** 21731 / 21732 as one table: the field under test, its bad value, the other (valid) field and the message. */
export const LANGUAGE_CHECKS = [
  {
    azureId: CASES.englishNotEnglish.azureId,
    label: 'english language check',
    field: 'English',
    input: 'english-message-input',
    bad: MIXED.englishWithArabic,
    badFill: { english: MIXED.englishWithArabic },
    other: 'Arabic',
    validFill: { arabic: VALID_TEXT.arabic },
    message: MESSAGES.englishOnly,
  },
  {
    azureId: CASES.arabicNotArabic.azureId,
    label: 'arabic language check',
    field: 'Arabic',
    input: 'arabic-message-input',
    bad: MIXED.arabicWithEnglish,
    badFill: { arabic: MIXED.arabicWithEnglish },
    other: 'English',
    validFill: { english: VALID_TEXT.english },
    message: MESSAGES.arabicOnly,
  },
] as const;

/** 21745 test data (verbatim from the TC). */
export const PUNCTUATION = {
  label: 'Q4 Update #2',
  english: "Meeting at 3:00 PM, Room #5 - don't be late!",
  arabic: 'الاجتماع الساعة 3:00، الغرفة رقم 5 - لا تتأخر!',
} as const;

/** Days ahead for a Scheduled create (21727 "now + 3 days") and the one-year boundaries. */
export const SCHEDULE = {
  futureDays: 3,
  oneYearDays: 365,
  overOneYearDays: 366,
} as const;

/** 21736: seconds spent typing, and the moment Save is pressed (seconds after the form opened). */
export const FILLING = {
  typingSeconds: 45,
  saveAtSeconds: 50,
} as const;

/** 21728 / 21749: the maximum Name length. */
export const NAME_MAX = 200;

/** The rights of the suite role used as a Roles audience (any harmless read right; the role has no members). */
export const ROLE_AUDIENCE_RIGHTS = ['Announcement.GetAnnouncements'] as const;

/** 21741: the rights of the suite role maalmohammad holds while the case runs ("Managers"). */
export const MANAGERS_ROLE_RIGHTS = ['Announcement.GetAnnouncements', 'Announcement.GetAnnouncement'] as const;

/** How long the default Publish at may lag / lead now (picker minute precision + typing). */
export const DEFAULT_NOW_TOLERANCE_SECONDS = 90;

/** An audience card with nothing assigned (probe b59). */
export const NONE_ASSIGNED = 'None assigned yet.';
