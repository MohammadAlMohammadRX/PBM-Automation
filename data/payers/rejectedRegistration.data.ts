import { REJECTION_DIALOG_REASONS, REJECTED_STATUS } from './rejectionReason.data';

/**
 * Test data for "Keep a Rejected Payer Registration Visible and Editable".
 *
 * The subject is what happens to a registration AFTER a reviewer rejects it -
 * not the rejection itself, which the require-a-reason story already owns
 * (including that a rejection needs a reason: that case is REUSE, not rewritten
 * here). What is new: the rejected record stays visible at version 0, carries
 * its reviewer reason, remains editable, and editing it returns it to Draft
 * without minting a new version until it is resubmitted.
 *
 * VERSION 0 IS THE THROUGH-LINE. A registration awaiting its first approval sits
 * at v0; rejecting it must leave it at v0, and editing it must keep it at v0 -
 * a new version is only cut when the edited draft is resubmitted and approved.
 * So every case that touches the version asserts it is still 0.
 *
 * THE EDIT-PERMISSION CASE is BLOCKED for the non-admin account.
 */

/** The status a rejected registration must show. */
export const REJECTED = REJECTED_STATUS;

/** The status editing a rejected registration must return it to. */
export const DRAFT_STATUS = 'Draft';

/** The reason the reviewer records, chosen from the managed list. */
export const REJECTION_REASON = REJECTION_DIALOG_REASONS[0];

/** The version a first-approval registration holds, before and after rejection. */
export const FIRST_VERSION = 0;

/** The field an edit of the rejected registration moves. */
export const RESUBMIT_EDIT = {
  label: 'License Number',
  value: 'LIC-REJECTED-EDIT',
  kind: 'text' as const,
};

/** The account the edit-permission case needs. */
export const EDIT_ROLE_REQUIREMENT = {
  role: 'a user with payer-edit permission and one without',
  reason:
    'The case proves edit access to a rejected registration follows permission. The shared '
    + 'administrator holds every permission, so it cannot show the withheld half.',
} as const;
