/**
 * US 21013 "Edit Announcement" (notification folder 25-edit-announcement, 9
 * cases; 21746 / 21747 / 21748 / 21750 / 21758 / 21759 wait for the BA).
 *
 * How it works in this build: a Scheduled row offers View / Edit / Delete; Edit
 * opens the same two-step drawer as Create, pre-filled (General: Name, English,
 * Arabic, Publish at; Audiences: the stored cards). The same validation texts
 * as Create apply (data/notification/createAnnouncement.data.ts MESSAGES).
 *
 * SAFETY: every edited announcement is the case's OWN Scheduled suite
 * announcement made through the API (`suiteAnnouncements.create`, Publish at
 * three days ahead, audience careconnect) - teardown deletes it. A 200-character
 * name keeps the "QA Automation Announcement" prefix so it stays a suite record.
 * The Roles audience of 21760 is an EMPTY suite role (no members).
 *
 * Literal readings / TC-vs-AC decisions (the test case wins):
 * - "Open the Scheduled announcement and select Edit" = the row's Edit on the
 *   Announcements tab (after searching the suite name).
 * - "Click Save": pressed where the drawer offers it - Save when shown, otherwise
 *   Next and then Save on the Audiences step (writerDHelpers.submitAnnouncement);
 *   the message may come from either press.
 * - "the edit is not saved": the save is refused (no request, or an answer >= 300)
 *   AND the stored field (GetAnnouncement) still holds the value before the edit.
 * - 21753 "one hour before now" - clearly outside the one-minute allowance.
 * - 21755: the four fields are emptied (Publish at can be emptied - probe f07).
 * - 21756: "Remove every user from the Selected list, or remove the audience card
 *   entirely" - the card is removed (the alternative the TC allows).
 * - 21757 "returns to the announcement list" = the drawer closes and the list shows.
 * - 21760: "now targeting the role instead of the original users" = the stored
 *   audiences are exactly one Roles entry for the suite role (GetAnnouncement).
 */
export const CASES = {
  nameMaxLength: { azureId: '21749' },
  englishNotEnglish: { azureId: '21751' },
  arabicNotArabic: { azureId: '21752' },
  pastPublishAt: { azureId: '21753' },
  overOneYear: { azureId: '21754' },
  allBlank: { azureId: '21755' },
  noAudienceLeft: { azureId: '21756' },
  savedConfirmation: { azureId: '21757' },
  usersToRoles: { azureId: '21760' },
} as const;

/** The TCs' test data. */
export const EDIT_DATA = {
  englishWithArabic: 'عاجل Important notice',
  arabicWithEnglish: 'Notice هام',
  /** Appended to the English message for 21757's minor valid change. */
  englishSuffix: ' (updated)',
  /** 21753: hours before now. */
  pastHours: 1,
} as const;

/** 21751 / 21752 as one table. */
export const LANGUAGE_EDITS = [
  {
    azureId: CASES.englishNotEnglish.azureId,
    field: 'English',
    input: 'english-message-input',
    bad: EDIT_DATA.englishWithArabic,
    badFill: { english: EDIT_DATA.englishWithArabic },
    stored: 'englishMessage',
    messageKey: 'englishOnly',
  },
  {
    azureId: CASES.arabicNotArabic.azureId,
    field: 'Arabic',
    input: 'arabic-message-input',
    bad: EDIT_DATA.arabicWithEnglish,
    badFill: { arabic: EDIT_DATA.arabicWithEnglish },
    stored: 'arabicMessage',
    messageKey: 'arabicOnly',
  },
] as const;

/** 21753 / 21754 as one table: hours from now typed into Publish at and the message expected. */
export const PUBLISH_AT_EDITS = [
  { azureId: CASES.pastPublishAt.azureId, what: 'one hour before now', hours: -EDIT_DATA.pastHours, messageKey: 'past' },
  { azureId: CASES.overOneYear.azureId, what: 'one year and one day from now', hours: 366 * 24, messageKey: 'overYear' },
] as const;

/** The stored announcement's texts (made through the API). */
export const SEED_TEXT = {
  english: 'QA automation announcement for the edit story.',
  arabic: 'إعلان اختبار آلي لقصة التعديل.',
} as const;
