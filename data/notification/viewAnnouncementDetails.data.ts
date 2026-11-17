/**
 * US 21017 "View Announcement Details" (notification folder 28-view-
 * announcement-details, 6 cases; 21800 / 21802-21804 wait for the BA).
 *
 * How it works in this build (probe b71): every row offers View, which opens
 * "Announcement details" (`nc-announcements-view-drawer`): Name, Status, Publish
 * at, Published on ("—" until published), ENGLISH MESSAGE, ARABIC MESSAGE,
 * AUDIENCES ("Users:<name>"), Close. The values carry no ids - they are read by
 * label (AnnouncementViewDrawer.read). Dates show as "dd/MM/yyyy, HH:mm:ss" in
 * the browser's time zone (Riyadh on the suite machines) - compared with the
 * API instants formatted the same way.
 *
 * SAFETY: suite announcements only; Published ones are sent to careconnect and
 * cancelled at teardown. 21797 (Cancelled, read only) reuses the newest Cancelled
 * suite announcement already listed (REUSE_CANCELLED - set false to make one).
 *
 * Literal readings (the test case wins):
 * - "published on" for a Cancelled announcement (21797): the API clears
 *   `publishedOn` when an announcement is cancelled (probe 2026-11-11), so the
 *   check is that the panel SHOWS the Published on field and that its value
 *   equals the stored one ("—" when none).
 * - 21798 "correctly rendered in their respective language/script" = both texts
 *   in full, the Arabic one rendered right-to-left (dir="rtl" or computed
 *   direction rtl) and the English one left-to-right.
 * - 21801 "blank or marked not applicable" = '', "—", "-" or "N/A"; "the actual
 *   date/time it was published" = the stored publishedOn as the screen formats it.
 * - "audiences" = the AUDIENCES value names every stored audience
 *   ("Users:<name>" / "Roles:<name>").
 */
export const CASES = {
  published: { azureId: '21795' },
  scheduled: { azureId: '21796' },
  cancelled: { azureId: '21797' },
  bothLanguages: { azureId: '21798' },
  checklist: { azureId: '21799' },
  publishedOnOnlyWhenPublished: { azureId: '21801' },
} as const;

export const REUSE_CANCELLED = true;

export const TITLE = 'Announcement details';

/** The panel's labels as shown (probe b71). */
export const FIELD = {
  name: 'Name',
  status: 'Status',
  publishAt: 'Publish at',
  publishedOn: 'Published on',
  english: 'ENGLISH MESSAGE',
  arabic: 'ARABIC MESSAGE',
  audiences: 'AUDIENCES',
} as const;

/** Every label the checklist (21799) expects, in panel order. */
export const CHECKLIST = [FIELD.name, FIELD.status, FIELD.publishAt, FIELD.publishedOn, FIELD.english, FIELD.arabic, FIELD.audiences] as const;

export const STATUS = {
  scheduled: 'Scheduled',
  published: 'Published',
  cancelled: 'Cancelled',
} as const;

/** What "not published yet" may read as. */
export const NOT_PUBLISHED_MARKS = ['', '—', '-', 'N/A'] as const;

/** Distinct texts so each block is recognisable (21795 / 21798 / 21799). */
export const TEXTS = {
  english: 'QA automation details check: the office opens at 9:00.',
  arabic: 'تحقق آلي من التفاصيل: يفتح المكتب الساعة 9:00.',
} as const;

/** "Users:<name>" as the panel prints an audience. */
export const AUDIENCE_LINE = (type: 'Users' | 'Roles', name: string): string => `${type}:${name}`;

export const ADMIN_PICKER_NAME = 'CareConnect Admin User';
