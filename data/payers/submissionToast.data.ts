/**
 * Test data for "Confirm a Submission with a Bilingual Toast".
 *
 * THE CANONICAL SUBMISSION TOAST LIVES HERE, in both languages, read off the
 * live application. `creationToast.data.ts` re-exports it under the name that
 * story already used, so there is one source of truth for the wording rather
 * than two that can drift.
 *
 * WHAT WAS FOUND, and it shapes three of these cases:
 *
 *   THE TOAST ITSELF IS CORRECT, and correct in both languages - summary and
 *   detail, fully translated, stating both that the change was submitted and
 *   that it takes effect on approval.
 *
 *   THE SEND PROMPT IS ALSO BILINGUAL, and says something the withdrawal story
 *   cares about: "You can still edit it afterwards, but doing so returns it to
 *   draft."
 *
 *   THERE IS NO CLOSE CONTROL ON THE TOAST. Zero buttons inside `#pbm-toast`,
 *   verified in both languages while writing the creation-toast story. So the
 *   sheet's "toast is dismissible" checklist item cannot be satisfied.
 *
 *   RAPID CLICKS ARE NOT GUARDED. Three clicks on Send for Approval put THREE
 *   requests on the wire, though only one toast appeared and only one request
 *   reached the queue.
 */

/** The submission toast, exactly as rendered, per language. */
export const SUBMISSION_TOAST = {
  en: {
    summary: 'Submitted for approval',
    detail:
      'Your change was submitted for approval. It will take effect once a reviewer approves it.',
  },
  ar: {
    summary: 'تم الإرسال للموافقة',
    detail: 'تم إرسال التغيير للموافقة. سيصبح ساري المفعول بمجرد موافقة المراجع عليه.',
  },
} as const;

/** The Send for Approval prompt, per language. */
export const SEND_PROMPT = {
  en: {
    title: 'Send for approval?',
    message:
      'This payer and all of its draft changes will be sent to a reviewer. You can still edit '
      + 'it afterwards, but doing so returns it to draft.',
  },
  ar: {
    title: 'إرسال للموافقة؟',
    message:
      'سيتم إرسال هذه جهة التغطية وجميع تغييرات مسودتها إلى المراجع. يمكنك تعديلها لاحقًا، لكن '
      + 'ذلك سيعيدها إلى مسودة.',
  },
} as const;

/** Approval-cell text before and after a submission, per language. */
export const APPROVAL_CELL = {
  en: { draft: 'Draft', pending: 'Pending Approval' },
  ar: { draft: 'مسودة', pending: 'قيد الموافقة' },
} as const;

/**
 * The toast's lifetime, measured from when it APPEARS.
 *
 * Measured from visibility rather than from the click, for the reason the
 * creation-toast story documents: the toast follows the server round trip, and
 * charging that delay against its lifetime makes a correct five-second toast
 * look like a two-second one.
 */
export const TOAST_STILL_VISIBLE_AT_MS = 3_500;
export const TOAST_GONE_BY_MS = 9_000;

/** How many times the duplicate-submission case clicks Send. */
export const RAPID_CLICKS = 3;

/** How many requests those clicks should put on the wire. */
export const EXPECTED_SUBMIT_REQUESTS = 1;

/** The endpoint a submission calls, for counting and for fault injection. */
export const SUBMIT_ENDPOINT_FRAGMENT = '/api/Payers/';

/** The account the restricted-role case needs. */
export const RESTRICTED_ROLE_REQUIREMENT = {
  role: 'a payer role without submission rights',
  reason:
    'The case exists to prove Send for Approval is withheld from a user who may view a payer '
    + 'but not submit it. The shared administrator session holds every permission, so running '
    + 'it as the administrator would assert nothing.',
} as const;
