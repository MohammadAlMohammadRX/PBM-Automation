/**
 * US 21009 "Review Notification Approval Request" (notification folder 21,
 * Writer E) - 11 cases: 21657, 21658, 21659, 21660, 21662, 21666, 21667,
 * 21668, 21669, 21672, 21676 (21661, 21663-21665, 21670, 21671, 21673-21675
 * wait for the BA).
 *
 * How: a "Need to Approve" (or "Approved") notification only arrives through an
 * ACTIVE App Notification for the action, so each case saves its OWN suite
 * definition (module Approval Management, audience careconnect and/or
 * maalmohammad only; marker + every variable as "[Name={{Name}}]"). The
 * request is the submission of a suite NETWORK ("Automation Network ...",
 * effective two days out so an approval never makes it live) - created and
 * submitted through the API by the case's submitter; withdrawn after the test
 * while still pending (afterEach).
 *
 * Accounts (brief): careconnect may approve its own requests; maalmohammad
 * (`secondUser`) may NOT - it is the reviewer whose small inbox the bell cases
 * count and list (21657 / 21658 / 21659), the Arabic reviewer (21662), the
 * submitter (21666) and the submitter without self-approval (21669).
 *
 * Literal readings / TC-vs-AC decisions (the test case wins):
 * - "Navigate to the Notification Center Management module => the dashboard
 *   loads" (every case): the reviewer's dashboard (DASHBOARD_PATH) with the
 *   notification bell.
 * - The request is a NETWORK submission, not the assessment's payer: a payer
 *   needs the UI wizard (~1 min), and the live "Need to approve" definition
 *   (Need to Approve - Payer, audience of ~17 real people) would notify them
 *   for every suite payer; no live definition uses "Need to Approve - Network".
 * - 21657: the pop-up must carry NEW_NOTIFICATION_TITLE (AC 'New notification')
 *   and the request message (the definition's marker); "count increases by
 *   one" = GetUnreadCount after = before + 1 and the badge shows it ("9+"
 *   above nine).
 * - 21658 "opens on the All tab" = the All tab carries an ACTIVE_TAB class;
 *   "marked unread with an unread dot" = the row's class matches UNREAD_CLASS
 *   and the inbox item is not seen (row classes are read, not guessed - the
 *   class name itself was never probed).
 * - 21660 Requested By = one of the submitter's names (user name, full name or
 *   e-mail - the probe showed the user name); Requested On within
 *   REQUESTED_ON_TOLERANCE_MIN minutes of the submission (Riyadh
 *   "dd/MM/yyyy HH:mm").
 * - 21662 "the request message in the reviewer's language" = the inbox item's
 *   Arabic text, shown on the detail page while maalmohammad's UI is Arabic.
 * - 21666: the AC keeps Approve disabled until every change was viewed - the
 *   Changes rows are scrolled into view first. "Returns to the dashboard" =
 *   the URL path DASHBOARD_PATH.
 * - 21667: "Incomplete information" = the app's REJECTION_REASON; "flagged as
 *   required" = no RejectRequest is sent and the drawer shows a message
 *   matching REQUIRED (the exact wording was never probed).
 * - 21672 / 21676: "Reviewed By / Reviewed On / Reason" are read as the labels
 *   REVIEWED_LABELS in the page's text (no ids were probed for them); the
 *   decided request of 21672 is a REJECTED one so all three apply.
 */
export const CASES = {
  popupAndCount: { azureId: '21657' },
  newestOnTop: { azureId: '21658' },
  clickOpensDetail: { azureId: '21659' },
  requestedByOn: { azureId: '21660' },
  messageInUserLanguage: { azureId: '21662' },
  submitterNotifiedApproved: { azureId: '21666' },
  reasonRequired: { azureId: '21667' },
  rejectConfirms: { azureId: '21668' },
  noSelfApproval: { azureId: '21669' },
  decidedShowsOutcome: { azureId: '21672' },
  fieldsPerState: { azureId: '21676' },
} as const;

export const STORY = 'US 21009 - Review Notification Approval Request';

export const DASHBOARD_PATH = '/dashboard';
export const DASHBOARD_URL = /\/dashboard(\?|$|#)/;

export const NEW_NOTIFICATION_TITLE = 'New notification';
export const ACTIVE_TAB = /active|selected|current|highlight/i;
export const UNREAD_CLASS = /unread/i;

export const PENDING_LABEL = 'Pending';
export const REQUESTED_ON_TOLERANCE_MIN = 3;

export const SUBMISSION_APPROVED = 'Submission approved.';
export const SUBMISSION_REJECTED = 'Submission rejected.';
export const REJECT_TITLE = 'Reject Submission';
export const REJECTION_REASON = 'Incomplete Information';
export const REJECTION_DETAILS = 'Rejected by the Writer E review case.';
export const REQUIRED = /required/i;
export const OWN_SUBMISSION_HINT = 'You submitted this request. A different reviewer must approve or reject it.';

export const REVIEWED_LABELS = { by: 'Reviewed By', on: 'Reviewed On', reason: 'Reason' } as const;
export const REQUESTED_LABELS = { by: 'Requested By', on: 'Requested On' } as const;

/** careconnect as the audience pickers show it. */
export const ADMIN_AUDIENCE_NAME = 'CareConnect Admin User';
