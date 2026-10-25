import type { NetworkBlockedCase } from './network.data';

/**
 * Test data for US 14301 "Require pharmacy coverage and an active payer
 * before a network can go live".
 *
 * WHAT "ACTIVATE A DRAFT" MEANS HERE (verified 2026-10-21): a never-approved
 * network reads "Not Live" and offers no Activate action - it goes live by
 * Send for Approval and an approval; the lifecycle job then makes it Active
 * once its effective time arrives (every minute here). So each "click
 * Activate" in the sheet is that go-live round trip, and a BLOCKED go-live is
 * a refusal at submission or at approval, explained to the user.
 */

/** The minimum-pharmacy cases (18033 use case, 18036 boundary) and the zero-pharmacy cases (18035, 18038). */
export const ONE_PHARMACY_CASES = ['18033', '18036'] as const;
export const NO_PHARMACY_CASES = ['18035', '18038'] as const;

/** How the refusal must explain itself. */
export const MISSING_PHARMACY = /facilit|pharmac/i;
export const INACTIVE_PAYER = /payer/i;

/** The status a network that never went live keeps. */
export const NOT_LIVE = 'Not Live';

/**
 * Minutes ahead a draft's effective time is set, so it is still in the future
 * when the case submits it (a past effective date-time is refused).
 */
export const DRAFT_EFFECTIVE_IN_MINUTES = 5;

/** Minutes ahead the "daily job" case sets its effective time, so it is still Pending when approved and the job does the activation. */
export const JOB_EFFECTIVE_IN_MINUTES = 6;

/** How long the job may take to activate an approved network. */
export const ACTIVATION_WAIT_MS = 8 * 60_000;

/** Budget per case (payer fixtures cost ~3 minutes each). */
export const GO_LIVE_TIMEOUT_MS = 25 * 60_000;

/** The reason this story inactivates an owning payer with. */
export const PAYER_INACTIVATION_DETAILS = 'Inactivated to observe its Active network.';

/** The statuses a network may legitimately show (18042 records which). */
export const LIFECYCLE_VALUES = ['Pending', 'Active', 'Inactive', 'Expired', 'Not Live'] as const;

export const BLOCKED_CASES: readonly NetworkBlockedCase[] = [
  {
    azureId: '18040',
    title: 'should offer go-live only to an authorised role when a read-only user opens a ready draft',
    reason:
      'Needs a read-only sign-in that can SEE the administrator\'s draft. Drafts are private to their author '
      + '(US 14122), so the only non-admin account (Payer Admin) is shown no draft at all and an absent "Send for '
      + 'Approval" would prove nothing (the suite\'s baseline rule); and removing SubmitNetworkForApproval from its '
      + 'role does not propagate to signed-in users in this build. Unblock with a seeded read-only account in the '
      + 'same payer scope and a shared (non-private) ready network.',
  },
];
