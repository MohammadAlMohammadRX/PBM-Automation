import { PLAN_APPROVAL_CELL, PLAN_INACTIVATION_REASONS, PLAN_LIFECYCLE } from './plan.data';

/**
 * Test data for US 14331 "Activate or deactivate a plan from the list and
 * detail screens with a mandatory reason"
 * (folder 23-activate-or-deactivate-a-plan-from-the-list-and).
 *
 * Activate ("تفعيل خطة") raises the shared confirmation prompt; Deactivate
 * ("إلغاء تفعيل خطة") opens the Inactivate Plan drawer - a Reason select
 * (lookup planInactivationReason) and optional Details. Either stages a change
 * that goes through the approval gate before it takes effect.
 * Twins: tests/network/07 (deactivate), 08 (activate), 40 (reason).
 */

export const CASE = {
  activateFromList: '19263',
  deactivateFromDetail: '19264',
  reasonRequired: '19265',
  detailsLimit: '19266',
  alreadyInactive: '19267',
  alreadyActive: '19268',
  approvalGate: '19269',
  badgeAfterApproval: '19270',
  auditReason: '19271',
  cancelDialog: '19272',
  rapidSubmit: '19273',
  reasonFromList: '19274',
} as const;

export const STATUS = PLAN_LIFECYCLE;
export const APPROVAL = PLAN_APPROVAL_CELL;

/** The maintained reason list (lookup planInactivationReason, read 2026-10-27). */
export const MAINTAINED_REASONS: readonly string[] = PLAN_INACTIVATION_REASONS;

/** 19264 - the sheet's "Payer request" and its details. */
export const PAYER_REQUEST = {
  reason: 'Payer Request',
  details: 'Temporary suspension requested by payer',
} as const;

/**
 * 19271 - the sheet's "Compliance review" is not on the maintained list; its
 * nearest maintained reason is "Regulatory Action". Details as the sheet gives them.
 */
export const COMPLIANCE = {
  reason: 'Regulatory Action',
  details: 'Pending compliance documentation',
} as const;

/** 19265 - details entered with no reason chosen. */
export const DETAILS_WITHOUT_REASON = 'Testing without reason';

/** MSG-PLN-026 - a reason is required. */
export const REASON_REQUIRED_MESSAGE = /reason.*required|required|select a reason|choose a reason/i;

/** MSG-PLN-027 - the 500-character details limit. */
export const DETAILS_LIMIT = 500;
export const LIMIT_MESSAGE = /500|too long|maximum|exceed/i;
export const detailsOfLength = (length: number): string => 'D'.repeat(length);

/** MSG-PLN-021 - only an Active plan can be deactivated; MSG-PLN-022 - only an Inactive plan can be activated. */
export const ONLY_ACTIVE_MESSAGE = /only an? active plan|must be active|not active/i;
export const ONLY_INACTIVE_MESSAGE = /only an? inactive plan|must be inactive|already active/i;

/** Details for the forced (API) attempts of 19267 / 19268. */
export const FORCED_DETAILS = 'Forced by an automated status-transition case (US 14331).';

/** The success confirmation an approval shows. */
export const SUCCESS_MESSAGE = /approved|success/i;

/** 19271 / 19273 - the audit entry a status change writes. */
export const STATUS_CHANGE_ACTION = /Status Change|Activat|Inactivat|Deactivat/i;

/** An entry's timestamp as the timeline prints it. */
export const ENTRY_TIME = /^\d{2}\/\d{2}\/\d{4} \d{1,2}:\d{2}\s?(AM|PM)?$/i;

/** 19273 - how many times the confirm button is clicked in rapid succession. */
export const RAPID_CLICKS = 3;

/** 19272 - the details entered before cancelling. */
export const CANCELLED_DETAILS = 'Entered and then cancelled (US 14331).';

/** 19274 - free text for the details field, independent of the reason. */
export const INDEPENDENT_DETAILS = 'Details typed after choosing the reason.';
