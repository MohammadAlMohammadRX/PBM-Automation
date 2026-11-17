/**
 * US 21010 "Notifications bell" (Notification Center folder 22, 23 cases
 * 21677-21707 written; 21682 / 21683 / 21687 / 21695 / 21698 / 21700 / 21701 /
 * 21708 wait for the BA and are NOT here).
 *
 * WHO. Every case runs in the SECOND USER's session (maalmohammad, `secondUser`):
 * careconnect's inbox holds ~10,000 items, so counting / listing / reading /
 * archiving there is meaningless (lead brief). "User A / B" (21699) = maalmohammad /
 * careconnect.
 *
 * WHERE THE NOTIFICATIONS COME FROM (utils/notification/writerFHelpers.ts `bellFeed`).
 * The assessment's "submit suite payers with a Need to Approve - Payer definition"
 * is NOT used: a colleague's live definition "Need to approve" already sits on
 * that action, so a suite payer submission would notify real people. Instead the
 * suite creates ACTIVE suite App Notifications on "Need to Approve - Network"
 * (module Approval Management - no live definition uses it) aimed ONLY at
 * maalmohammad (careconnect too in 21699), then submits a suite network for
 * approval from the admin session ("another session"). Each definition yields one
 * notification per submission, so N definitions + one submission = N items (the
 * feed submits again when the app turns out to send one per event). Each batch's
 * definitions are deactivated once its items arrived; teardown rejects the
 * network's request, deletes the network, and the suiteDefinitions fixture deletes
 * the definitions. Every message carries a unique run word, so the bell is
 * searched by it and the items are told apart from colleagues' traffic.
 *
 * ARCHIVING cannot be undone: only suite-produced items are archived (the
 * assessment's "maalmohammad archives its own notifications" for 21702 is
 * replaced - see LOAD_MORE_15 below).
 *
 * Readings / TC-vs-AC choices (the test case wins - lead decision 1):
 * - 21677 (HOW: "as the automation admin") runs as maalmohammad (brief: every bell
 *   case that counts). It makes sure one unread item exists, then compares the
 *   badge with GetUnreadCount, shown as BADGE(n) ("9+" above nine).
 * - 21678 / 21679 / 21691 / 21704: "Mark all as read" first (allowed on this account),
 *   then exactly the TC's counts are produced. Colleagues' approvals can still reach
 *   the account between the batch and the read (assessment note) - a finding would
 *   name the API count beside the badge.
 * - 21680 / 21681 / 21705 / 21707 "another session" = the admin page submitting the
 *   suite network; "without refresh" = a window marker set before the event is still
 *   there after it (no reload).
 * - 21681 pop-up: the AC quotes "New notification"; the pop-up host is `pbm-toast-notif`
 *   (foundation notes). Pages = POPUP_ROUTES (dashboard + two unrelated modules).
 * - 21688 test data "approval" matches hundreds of real messages: the unique run word
 *   is searched instead, and the shown rows must be exactly the inbox items whose
 *   English or Arabic message contains it; NO_MATCH_WORD must give "no results".
 * - 21689 the Arabic keyword is not given: a unique Arabic word (from the run stamp)
 *   is put ONLY in the Arabic message, the English word ONLY in the English one.
 * - 21696 TC data "25 notifications": the account's All tab is topped up to at least
 *   PAGING_MINIMUM items when it holds fewer; 10, 20, then min(30, total).
 * - 21702 "user has 15 notifications in total": the account cannot be emptied (archive
 *   is permanent and only suite items may be archived), so 15 suite items are produced
 *   and the bell is SEARCHED by their word - the list then holds exactly 15:
 *   10 + Load more, 15 and no Load more.
 * - 21697 "unread dot": the row's class list is read (InboxBells); the unread row must
 *   carry a class the read row of the same panel does not. "How long ago" must match
 *   TIME_AGO ("now", "5 hours ago", "22 Sept 2026" - foundation notes).
 * - 21699 step 4 "altering an identifier" = careconnect calling MarkAsRead / ArchiveForMe
 *   with maalmohammad's inbox item id; maalmohammad's item must stay unread and listed
 *   (the answers are reported).
 * - 21706 the panel data without a session = GetMyNotifications / GetUnreadCount with
 *   no token: REJECTED_STATUSES and no payload.
 * - Empty texts: AC "You're all caught up." (main tabs) and "No archived notifications."
 */

export const CASES = {
  badgeForEveryUser: { azureId: '21677' },
  exactUpToNine: { azureId: '21678' },
  ninePlus: { azureId: '21679' },
  liveArrival: { azureId: '21680' },
  popupAnyPage: { azureId: '21681' },
  markAllRead: { azureId: '21684' },
  markAllReadDisabled: { azureId: '21685' },
  archiveMarksRead: { azureId: '21686' },
  searchKeyword: { azureId: '21688' },
  searchBothLanguages: { azureId: '21689' },
  panelLayout: { azureId: '21690' },
  titleCount: { azureId: '21691' },
  archiveAvailability: { azureId: '21692' },
  unreadToRead: { azureId: '21694' },
  loadMoreTens: { azureId: '21696' },
  rowAnatomy: { azureId: '21697' },
  ownNotificationsOnly: { azureId: '21699' },
  loadMoreDisappears: { azureId: '21702' },
  tabDecisionTable: { azureId: '21703' },
  stepDown: { azureId: '21704' },
  newestFirst: { azureId: '21705' },
  signedOut: { azureId: '21706' },
  unreadLabelSync: { azureId: '21707' },
} as const;

/** The bell badge for an unread count: nothing at 0, the number up to nine, "9+" above (AC). */
export const BADGE = (n: number): string => (n <= 0 ? '' : n > 9 ? '9+' : String(n));

/** The Unread tab label for an unread count: the number, or nothing / "0" at zero. */
export const UNREAD_LABEL = (n: number): RegExp => (n <= 0 ? /^0?$/ : new RegExp(`^${n}$`));

/** The panel title count, e.g. "3 new" (AC / TC 21691). */
export const HEADER_COUNT = (n: number): string => `${n} new`;

export const TEXT = {
  panelTitle: 'Notifications',
  caughtUp: "You're all caught up.",
  noArchived: 'No archived notifications.',
  /** AC: "A 'New notification' pop-up shows the message of an arriving notification". */
  popupTitle: 'New notification',
} as const;

/** TC 21678 test data: the unread counts checked in turn. */
export const EXACT_COUNTS = [1, 5, 9] as const;

/** TC 21679: 9, then one more. */
export const NINE = 9;

/** TC 21691 / 21704 test data: three unread. */
export const THREE = 3;

/** TC 21684: "several unread notifications". */
export const SEVERAL = 3;

/** TC 21702 test data: 15 notifications (searched by their word - see the header). */
export const LOAD_MORE_15 = 15;

/** The bell's page size (AC: "Ten notifications load at a time"). */
export const PAGE_SIZE = 10;

/** TC 21696 test data "Total notifications: 25" - the All tab is topped up to this when smaller. */
export const PAGING_MINIMUM = 25;

/** TC 21690: Load more is only offered above one page - the All tab is topped up to this. */
export const LAYOUT_MINIMUM = 11;

/** TC 21681 "Repeat on two or three other pages": the pages visited (AppRoutes keys). */
export const POPUP_ROUTES = ['dashboard', 'approvalManagement', 'lookupManagement'] as const;

/** A word no notification message contains (21688 step 4). */
export const NO_MATCH_WORD = 'qanomatchzzqx';

/** "How long ago" as the bell writes it (foundation notes: "now", "5 hours ago", "22 Sept 2026"). */
export const TIME_AGO = /^(now|just now|an? (second|minute|hour|day|week|month|year) ago|\d+ (seconds?|minutes?|hours?|days?|weeks?|months?|years?) ago|\d{1,2} [A-Za-z]+ \d{4})$/i;

/** Answers a request without a session must give (21706). */
export const REJECTED_STATUSES = [401, 403] as const;

/** Id fragments a restore / unarchive / move-back control would carry (21692). */
export const RESTORE_ID_FRAGMENTS = ['restore', 'unarchive', 'move-back', 'moveback'] as const;

/** How long a live arrival (badge, label, list top, pop-up) may take. */
export const LIVE_TIMEOUT_MS = 120_000;
