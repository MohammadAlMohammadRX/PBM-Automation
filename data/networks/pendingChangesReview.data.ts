import type { RejectionReason } from '../payers/payerTypes';
import type { NetworkSpec } from '../../utils/NetworkProvisioning';
import { repeatTo } from './network.data';
import { edited } from './optimisticLocking.data';

/**
 * Test data for US 14320 "Review and approve or reject pending network
 * changes" - the Approval Management > Network queue as a whole.
 *
 * Every pending request is the case's own, built through the application:
 * a registration is a submitted draft (`networkIn('PendingApproval')`), an
 * edit a proposed description change, an activation / deactivation a staged
 * status change sent for approval, a facility change a staged assignment, a
 * deletion a staged delete on an approved network with nothing attached.
 *
 * The sheet's "facility deletion" and "Riverside Clinic" are a NETWORK
 * deletion here: facility records are not deleted through this queue.
 * "Published" after approval is read off the network's version history.
 */
export { edited };

/** An approved network with nothing attached - deletable. */
export const UNATTACHED_LIVE: NetworkSpec = { facilities: 0 };

/** How each change type must be labelled in the queue (sheet: "clearly labeled with its type"). */
export const CHANGE_TYPE_LABEL = {
  registration: /Create|Registration/i,
  edit: /Update|Edit/i,
  activation: /Activat/i,
  deactivation: /Deactivat|Inactivat/i,
  facility: /Facilit/i,
  deletion: /Delet/i,
} as const;

/** The queue's change-type filter options the sheet names. */
export const CHANGE_TYPE_FILTER = { activation: 'Activation', deactivation: 'Deactivation', deletion: 'Delete' } as const;

/** The managed reason standing in for the sheet's "Incorrect facility tax ID". */
export const REJECTION_REASON: RejectionReason = 'Incorrect Data';

/** The sheet's exact refusal for a request that is no longer pending (18269). */
export const NO_LONGER_PENDING = /This request is no longer pending approval/i;

/** A refusal for approving over a network changed since the request was loaded (18272). */
export const RELOAD_NEEDED = /reload|modified|changed since|no longer current|try again/i;

/** A failed apply must tell the user. */
export const PUBLISH_FAILED = /fail|error|could not|unable/i;

/** A request without the reviewer right. */
export const FORBIDDEN_STATUS = 403;

/** States. */
export const VERSION_STATUS = { published: /Published/, rejected: /Rejected/ } as const;
export const APPROVAL_CELL = { published: /Published/, rejected: /Rejected|Draft/ } as const;
export const QUEUE_STATUS = /Pending/;

/** A code the approval generates (drafts read NET-D-...). */
export const PUBLISHED_CODE = /^NET-\d+$/;

/** Lifecycle labels after the status changes are approved. */
export const LIFECYCLE = { active: 'Active', inactive: 'Inactive' } as const;

/** What a rejection notification must mention. */
export const REJECTED_NOTICE = /reject/i;

/** What a deletion review must show (18274). */
export const DELETION_DETAILS = { reason: /reason/i, impact: /impact|affect/i } as const;

/** Reason lengths (18268). */
export const REASON_LENGTH = { min: 'r', max: 500, atMax: repeatTo('r', 500), overMax: repeatTo('r', 501) } as const;

export const CASE = {
  allChangeTypes: '18264',
  approveRegistration: '18265',
  rejectWithReason: '18266',
  rejectWithoutReason: '18267',
  reasonLength: '18268',
  noLongerPending: '18269',
  facilityLifecycle: '18270',
  applyFailure: '18271',
  modifiedSinceLoaded: '18272',
  nonReviewer: '18295',
  activationDeactivation: '18275',
  exploratory: '18273',
  deletionDetails: '18274',
} as const;

export const CHANGES = {
  edit: 'Edited for the review queue',
  concurrent: 'Edited by another user after the request was loaded',
} as const;
