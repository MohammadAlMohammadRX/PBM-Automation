import type { NetworkSpec } from '../../utils/NetworkProvisioning';
import type { RejectionReason } from '../payers/payerTypes';
import { NETWORK_TOAST } from './network.data';
import { edited } from './optimisticLocking.data';

/**
 * Test data for US 14313 "Submit network changes for approval before they go
 * live".
 *
 * The workflow, as the application runs it (verified 2026-10-21): a save on a
 * live network stages a DRAFT ("Saved as draft", the approval cell reads
 * `vN · Draft`); the row then offers Send for Approval, whose confirmation
 * moves the cell to `vN · Pending Approval` and puts a request in the
 * Approval Management > Network queue; approving publishes it.
 *
 * The sheet's fields the form does not have map onto ones it does: "address"
 * and "Contact Phone" -> the two descriptions. "Discard Draft" is looked for
 * among the detail header's actions by name. The reviewer is the same
 * administrator who submitted: the environment has one account that may
 * approve (self-approval is itself asserted by 18174).
 *
 * The "clean live network with no blocking dependencies" the deletion cases
 * need is an APPROVED network with no facility (Pending - effective two days
 * out): a live Active network always holds a pharmacy, and a facility blocks
 * deletion.
 */
export { edited };

/** An approved network with nothing attached - deletable. */
export const UNATTACHED_LIVE: NetworkSpec = { facilities: 0 };

/** Approval-cell states, as patterns over "vN · <state>". */
export const APPROVAL_CELL = {
  draft: /Draft/,
  pending: /Pending Approval/,
  published: /Published/,
  /** The sheet says both "back to Rejected" (steps) and "reverts to Draft" (expected) - either is accepted. */
  afterRejection: /Rejected|Draft/,
} as const;

/** The detail header's version badge while a change is pending. */
export const PENDING_BADGE = /Pending Approval/;

/** Toasts / answers. */
export const SAVED_TOAST = NETWORK_TOAST.savedAsDraft.summary;
export const NO_CHANGES_TOAST = NETWORK_TOAST.noChanges.summary;

/** What a refused "nothing to send" submission must say. */
export const NOTHING_TO_SUBMIT = /no (draft|changes?)|nothing to submit|no pending/i;

/** What a refused second submission must say. */
export const ALREADY_PENDING = /already|pending|one (pending|change)/i;

/** The change types the queue shows. */
export const CHANGE_TYPE = { update: 'Update', delete: 'Delete' } as const;

/** A header action that discards a draft. */
export const DISCARD_ACTION = /discard/i;

/** The managed rejection reason standing in for the sheet's "Incorrect address format". */
export const REJECTION_REASON: RejectionReason = 'Incorrect Data';

/** How many near-simultaneous submissions the race case fires. */
export const DUPLICATE_SUBMITS = 2;

export const CASE = {
  saveAndSend: '18165',
  approveTakesEffect: '18164',
  rejectKeepsLive: '18166',
  noDraftBlocked: '18167',
  noChangeBlocked: '18168',
  secondPendingBlocked: '18169',
  editWithdraws: '18170',
  deleteWithdraws: '18171',
  discardDraft: '18172',
  availabilityMatrix: '18173',
  noSelfApproval: '18174',
  duplicateSubmits: '18175',
  deletionNeedsApproval: '18176',
  overlappingEditDelete: '18177',
} as const;

export const CHANGES = {
  address: 'Address changed by the maker',
  contactPhone: 'Contact phone changed while pending',
  further: 'A further edit while the first is pending',
  discarded: 'A draft change to be discarded',
} as const;
