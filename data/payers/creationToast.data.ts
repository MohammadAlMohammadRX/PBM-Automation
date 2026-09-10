/**
 * Test data for "Display Toast Notification on Payer Creation".
 *
 * EVERY STRING BELOW WAS READ OFF THE LIVE APPLICATION, in both languages,
 * because this story is entirely about exact wording and timing.
 *
 * WHAT WAS FOUND:
 *
 *   The creation toast appears - but NOT immediately. It follows the server
 *   round trip and turned up between 0.7s and 4.7s after Save in repeated
 *   probes. A test that reads the notification area "immediately after save",
 *   as the sheet says, finds nothing.
 *
 *   It auto-dismisses roughly five seconds after appearing, which matches the
 *   sheet.
 *
 *   IT HAS NO CLOSE CONTROL. Zero buttons inside `#pbm-toast`, verified in both
 *   languages. So the manual-dismiss case cannot pass - there is nothing to
 *   click - and it is written to assert the control exists so the gap is
 *   reported rather than skipped.
 *
 *   A SECOND, UNRELATED TOAST HOST exists: `pbm-toast-notif` carries bell
 *   notifications, and after a submission it reads "There is a payer need
 *   aproval" - the application's own spelling, not a transcription error here.
 *   It is deliberately not asserted on; a creation-toast case must not be
 *   satisfied by an unrelated notification.
 */

/** The draft-saved toast, exactly as rendered. */
export const DRAFT_SAVED_TOAST = {
  en: {
    summary: 'Saved as draft',
    detail:
      'Your changes were saved as a draft. Send the record for approval when you are ready.',
  },
  ar: {
    summary: 'تم الحفظ كمسودة',
    detail: 'تم حفظ تغييراتك كمسودة. أرسل السجل للموافقة عندما تكون جاهزًا.',
  },
} as const;

/**
 * The submitted-for-approval toast.
 *
 * RE-EXPORTED, not redefined: the submission story owns this wording and
 * carries both languages, and one string in two files is one string too many.
 * This story needs it only to prove the CREATION toast is not it.
 */
export { SUBMISSION_TOAST as SUBMITTED_TOAST } from './submissionToast.data';

/**
 * How long the toast stays once it has APPEARED.
 *
 * Measured from visibility, not from the click - the delay before it appears
 * would otherwise be charged against its lifetime and make a correct
 * five-second toast look like a two-second one.
 */
export const TOAST_LIFETIME_MS = 5_000;

/** A comfortable margin either side of the five-second mark. */
export const TOAST_STILL_VISIBLE_AT_MS = 3_500;
export const TOAST_GONE_BY_MS = 9_000;

/** How many payers the rapid-succession case creates. */
export const RAPID_CREATE_COUNT = 2;
