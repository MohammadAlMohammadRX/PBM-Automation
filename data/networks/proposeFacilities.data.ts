import type { NetworkBlockedCase } from './network.data';
import { FACILITY } from './facilities.data';

/**
 * Test data for US 14131 "Propose pharmacy facility assignments for approval".
 *
 * "Propose Facility Assignment" is the detail screen's Assign Facilities
 * drawer (Facility Assignment tab). A proposal is a maker-checker draft:
 * AssignFacilitiesToNetwork answers "The network has been saved as a draft"
 * and the row reads Draft Assignment until it is sent and approved (verified
 * 2026-10-21). The sheet's PHM-xx facilities are played by the environment's
 * three (see facilities.data.ts).
 */
export const CASE = {
  pool: '17905',
  partitions: '17906',
  nonPharmacy: '17907',
  alreadyAssigned: '17911',
  decisionTable: '17908',
  approvedApplied: '17909',
  rejected: '17910',
  coordinatorOnly: '17916',
  approverOnly: '17915',
  draftNotLive: '17917',
  concurrent: '17918',
  revert: '17919',
} as const;

/** The facility a case's network starts with, and the ones it proposes. */
export const MEMBERSHIP = {
  existing: FACILITY.pharmacyC,
  proposed: [FACILITY.pharmacyA, FACILITY.pharmacyB],
  /** The single facility the reject / draft / concurrency cases propose. */
  single: FACILITY.pharmacyA,
} as const;

/** What a refusal of an ineligible facility should say. */
export const REFUSAL = {
  nonPharmacy: /pharmac/i,
  alreadyAssigned: /already/i,
  inactive: /inactive|not active|no longer active/i,
} as const;

export const BLOCKED_CASES: NetworkBlockedCase[] = [
  {
    azureId: '17914',
    title: 'should accept and record all 100 facilities when a proposal selects a large batch',
    reason:
      'Needs an assignable pool of 100 eligible active pharmacy facilities. The environment offers exactly three '
      + '(FCL-000009, FCL-000025, FCL-000026, FCL-000027 on 2026-10-24). Seed 100 active pharmacies in Facility Mgmt to unblock.',
  },
  {
    azureId: '17921',
    title: 'should re-validate and reject a selected facility when it becomes inactive before the proposal is submitted',
    reason:
      'Needs a facility that may be deactivated mid-case. The environment has only three facilities and every network and '
      + 'payer suite depends on them, so deactivating one would break other cases. Provide a dedicated disposable pharmacy '
      + 'facility (and the right to inactivate it) to unblock.',
  },
];
