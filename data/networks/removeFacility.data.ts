import type { NetworkBlockedCase } from './network.data';
import { FACILITY } from './facilities.data';

/**
 * Test data for US 14132 "Remove pharmacy facility from network".
 *
 * Verified 2026-10-21: Remove asks "Delete facility - Do you want to delete
 * {facility}?" (No / Remove) and calls UnassignFacilityFromNetwork. On a
 * never-approved network the draft row simply goes; on a live network the
 * removal is a maker-checker change (Draft Removal -> Pending Removal ->
 * gone), so a case that must observe the facility GONE from a live network
 * sends the change for approval and approves it - the convention every status
 * case in this suite follows.
 *
 * Networks keep TWO facilities where the removal must succeed on a live
 * network, because US 14304 forbids removing an Active network's last pharmacy.
 */
export const CASE = {
  confirmRemoves: '17920',
  decisionCancelConfirm: '17922',
  cancelKeeps: '17923',
  roleRestricted: '17928',
  lastFacility: '17929',
  pendingUnrelated: '17931',
  refreshesInPlace: '17932',
} as const;

/** The pair a case's network holds: the facility removed and the one kept. */
export const PAIR = { removed: FACILITY.pharmacyC, kept: FACILITY.pharmacyB } as const;

/** The facility an unrelated pending proposal adds (17931). */
export const UNRELATED_ADDITION = FACILITY.pharmacyA;

export const BLOCKED_CASES: NetworkBlockedCase[] = [
  {
    azureId: '17924',
    title: 'should soft-delete the facility junction record rather than delete it when an assignment is removed',
    reason:
      'Needs read access to the network-facility junction table (its state / deleted flag). The application exposes no '
      + 'view of junction rows - the Facility Assignment tab drops removed facilities and the audit history records events, '
      + 'not junction states. Provide a DB read account or an admin data view of the junction table to unblock.',
  },
  {
    azureId: '17925',
    title: 'should keep the removed assignment row in the data store with a soft-delete marker when a facility is removed',
    reason:
      'Needs database or admin-export access to the junction data for the network/facility pair (step 3 queries the row '
      + 'and its deleted flag/timestamp). No such view or export exists in the UI. Provide DB read access to unblock.',
  },
];
