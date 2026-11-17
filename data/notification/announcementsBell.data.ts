/**
 * US 21018 "Announcements bell" (Notification Center folder 29, 25 cases
 * 21805-21835 written; 21812 / 21813 / 21816 / 21818 / 21822 / 21832 wait for the
 * BA and are NOT here).
 *
 * WHO. Every case that counts, lists, reads or archives runs in the SECOND USER's
 * session (maalmohammad, `secondUser`, small inbox). "User A / B" (21825) =
 * maalmohammad / careconnect; "User C, not a recipient" (21835) = maalmohammad
 * with the announcement published to careconnect only (no third user can sign in).
 *
 * WHERE THE ANNOUNCEMENTS COME FROM (utils/notification/writerFHelpers.ts `bellFeed`):
 * suite announcements ("QA Automation Announcement bell ...") with Publish at = now,
 * audience maalmohammad (careconnect where the case needs it); the publishing job
 * (about every minute) delivers them, and the feed waits until they are in the
 * recipient's inbox. Teardown (suiteAnnouncements) CANCELS them - they stay listed
 * as Cancelled. Every English message carries a unique run word, so the bell is
 * searched by it and the suite rows are told apart from real ones.
 *
 * ARCHIVING cannot be undone: only suite-produced items are archived.
 *
 * Readings / TC-vs-AC choices (the test case wins - lead decision 1):
 * - 21805 / 21806 / 21827: "Mark all as read" first (allowed on this account), then
 *   exactly the TC's counts are published to the account.
 * - 21807 "visually highlighted": the row's class list (InboxBells) - the unread row
 *   must carry a class the read row of the same panel does not.
 * - 21808 "a user with no roles or permissions beyond basic sign-in" = maalmohammad
 *   holding only a suite role with NO rights (`secondUser.withRights([])`, restored
 *   by the fixture); the administrator = careconnect.
 * - 21809 test data "maintenance" / "صيانة" are searched as given; the English word is
 *   put ONLY in one suite announcement's English message, the Arabic word ONLY in the
 *   other's Arabic message; the rows shown must be exactly the account's announcements
 *   whose English or Arabic message contains the word.
 * - 21810 "All selected by default" = the panel's first GetMyAnnouncements asks
 *   status "all"; each tab must list the API's own items for that status, in order.
 * - 21815 "published date": the detail date must name the publish day (Riyadh time)
 *   in either DD/MM/YYYY or MM/DD/YYYY form; Arabic = the session switched to عربي
 *   (LanguageSwitcher) and back; Back must land on /dashboard (AC).
 * - 21817 "cancelled by an administrator" = the admin's Cancel (PUT CancelAnnouncement)
 *   on the suite announcement; NOT_FOUND is the AC's literal text, read anywhere on the
 *   screen's content area (writerFHelpers `screenContentText`) and the message must not
 *   be shown. (The foundation probe saw a cancelled announcement still rendered by URL;
 *   the 2026-11-12 full run showed "Announcement not found." on the page.)
 * - 21819 "network interruption" = the second user's browser context set offline
 *   (Playwright `setOffline`) AND its open live WebSocket closed (writerFHelpers
 *   `controlLiveConnection` - offline alone leaves an open WebSocket connected), new
 *   sockets refused until the network is back; "reconnects" = the app opens a new one.
 * - 21821 "online on any page" = the recipient's live connection (WebSocket answered)
 *   is up on the dashboard before the announcement is published.
 * - 21829 "a mix of unread and read announcements" = two suite announcements, one read,
 *   so Mark all as read (step 5) has something to clear.
 * - 21814 asserts what its steps say (Unread tab left empty, all moved to Read); the
 *   empty-state wording "You're all caught up." is asserted by 21827 / 21823, whose
 *   test cases quote it.
 * - 21823 the empty main tabs need an inbox with no announcement left on All. Only
 *   SUITE announcements may be archived (brief), so suite ones are archived and the
 *   case is BLOCKED at run time (NOT_EMPTIABLE) while real announcements remain.
 * - 21833 the announcement data without a session = GetMyAnnouncements /
 *   GetUnreadCount with no token: REJECTED_STATUSES and no payload.
 * - 21835 "access is denied and 'Announcement not found.' is shown" = the detail page
 *   for the announcement id shows NOT_FOUND and not the announcement's message.
 * - Pop-up: the AC quotes "New announcement" (`pbm-toast-notif` host).
 */

export const CASES = {
  exactCount: { azureId: '21805' },
  ninePlus: { azureId: '21806' },
  unreadHighlighted: { azureId: '21807' },
  everyUserHasBell: { azureId: '21808' },
  searchBothLanguages: { azureId: '21809' },
  tabsSwitch: { azureId: '21810' },
  clickOpensDetail: { azureId: '21811' },
  markAllRead: { azureId: '21814' },
  detailLanguage: { azureId: '21815' },
  cancelledNotFound: { azureId: '21817' },
  reconnectRefresh: { azureId: '21819' },
  archiveMoves: { azureId: '21820' },
  livePopup: { azureId: '21821' },
  caughtUp: { azureId: '21823' },
  markAllReadDisabled: { azureId: '21824' },
  ownAnnouncementsOnly: { azureId: '21825' },
  tabDecisionTable: { azureId: '21826' },
  stepDown: { azureId: '21827' },
  newestFirst: { azureId: '21828' },
  unreadLabelSync: { azureId: '21829' },
  archiveMarksRead: { azureId: '21830' },
  noRestore: { azureId: '21831' },
  signedOut: { azureId: '21833' },
  liveArrival: { azureId: '21834' },
  notARecipient: { azureId: '21835' },
} as const;

/** The bell badge for an unread count: nothing at 0, the number up to nine, "9+" above (AC). */
export const BADGE = (n: number): string => (n <= 0 ? '' : n > 9 ? '9+' : String(n));

/** The Unread tab label for an unread count: the number, or nothing / "0" at zero. */
export const UNREAD_LABEL = (n: number): RegExp => (n <= 0 ? /^0?$/ : new RegExp(`^${n}$`));

export const TEXT = {
  panelTitle: 'Announcements',
  caughtUp: "You're all caught up.",
  /** AC: "Announcement not found." */
  notFound: 'Announcement not found.',
  /** AC: "A 'New announcement' pop-up appears when an announcement is published while the user is online." */
  popupTitle: 'New announcement',
} as const;

/** TC 21805 test data: 5 unread. */
export const FIVE = 5;
/** TC 21806: 9, then one more. */
export const NINE = 9;
/** TC 21827: three unread. */
export const THREE = 3;

/** TC 21809 test data, searched as given. */
export const SEARCH_EN = 'maintenance';
export const SEARCH_AR = 'صيانة';

/** 21809: announcement 1 holds SEARCH_EN only in English, announcement 2 SEARCH_AR only in Arabic (both carry the run word for the wait). */
export const SEARCH_MESSAGES = {
  english: (word: string): string[] => [`QA automation ${word} ${SEARCH_EN} window`, `QA automation ${word} notice`],
  arabic: (arabicWord: string): string[] => [`إعلان ${arabicWord}`, `إعلان ${SEARCH_AR} ${arabicWord}`],
} as const;

/** Id fragments a restore / unarchive / move-back control would carry (21831). */
export const RESTORE_ID_FRAGMENTS = ['restore', 'unarchive', 'move-back', 'moveback'] as const;

/** Answers a request without a session must give (21833). */
export const REJECTED_STATUSES = [401, 403] as const;

/** The detail page's Back target (AC: "a Back button returning to the dashboard"). */
export const DASHBOARD_URL = /\/dashboard(\?|$)/;

/** The detail date form ("11/11/2026, 17:02:59" - foundation notes). */
export const DETAIL_DATE = /\d{1,2}\/\d{1,2}\/\d{4}/;

/** How long a published announcement may take to reach the inbox (job about every minute). */
export const PUBLISH_TIMEOUT_MS = 210_000;

/** How long a live arrival (badge, label, list top, pop-up) may take once published. */
export const LIVE_TIMEOUT_MS = 210_000;

/** 21823: the reason it is BLOCKED when real announcements stay on the main tabs. */
export const NOT_EMPTIABLE = (names: string[]): string =>
  `the second user's announcement inbox still lists ${names.length} announcement(s) that are not the suite's `
  + `(${names.slice(0, 5).map((n) => `"${n}"`).join(', ')}) - archiving cannot be undone and only suite-produced `
  + 'items may be archived, so the empty main tabs cannot be reached';
