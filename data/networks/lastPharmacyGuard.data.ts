import type { NetworkBlockedCase } from './network.data';
import { NETWORK_LIFECYCLE } from './network.data';
import { FACILITY } from './facilities.data';

/**
 * Test data for US 14304 "Prevent removing a network's last pharmacy while it
 * is active".
 *
 * The rule: an ACTIVE network must keep at least one pharmacy, and a network
 * with none cannot go live. "Activating a Draft" is how this application takes
 * a never-approved network live - Send for Approval, then Approve
 * (NetworkManagementPage.attemptGoLive) - since a draft offers no Activate.
 * The sheet's NET-ACTIVE-xx / NET-DRAFT-xx networks are each case's own.
 */
export const CASE = {
  lastRefused: '18071',
  oneOfTwoAllowed: '18072',
  notActiveAllowed: '18073',
  zeroCannotGoLive: '18074',
  oneCanGoLive: '18075',
  boundaryTwoToZero: '18076',
  matrix: '18077',
  clearMessage: '18078',
  rolesOnly: '18079',
  replaceThenRemove: '18080',
  rapidToggle: '18082',
  blockedLogged: '18083',
  apiEnforced: '18084',
} as const;

/** Pharmacy X (kept last) and Pharmacy Y (the second / replacement). */
export const PHARMACY_X = FACILITY.nathealth;
export const PHARMACY_Y = FACILITY.pharmacyA;

/** What the refusal must say: the network keeps at least one pharmacy while active. */
export const LAST_PHARMACY_REFUSAL = /at least one|last (remaining )?(pharmacy|facility)|must (retain|keep|have)/i;

/** What a go-live refusal for a network with no pharmacy must mention. */
export const NO_PHARMACY_REFUSAL = /pharmac|facilit/i;

/** Technical leakage a business message must not contain. */
export const TECHNICAL_MARKERS = ['StackTrace', 'Exception', 'System.', 'status code', 'Internal Server'] as const;

/** The statuses the outcomes are read in. */
export const STATUS = NETWORK_LIFECYCLE;

/** The lifecycle job runs every minute; a network approved past its effective time is Active within a few. */
export const ACTIVATION_WAIT_MS = 5 * 60_000;

export const BLOCKED_CASES: NetworkBlockedCase[] = [
  {
    azureId: '18081',
    title: 'should never leave an Active network without a pharmacy when a bulk removal includes the last one',
    reason:
      'The precondition "a bulk-remove action is available" is unmet: the Facility Assignment tab offers only a per-row '
      + 'Remove, with no row selection or bulk action (verified 2026-10-21). Unblocked once a bulk-remove control ships.',
  },
];
