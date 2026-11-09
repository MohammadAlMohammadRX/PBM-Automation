import type { NetworkBlockedCase } from './network.data';
import { SEED_COMMAND } from '../../utils/jobDriven/jobSeeds';

/**
 * Test data for US 14129 "Automatically activate network on effective date"
 * (folder 09) - automated 2026-11-08 by seed-then-check (see
 * jobDrivenNetwork.data.ts and reports/manual-automation/Foundation-Notes.md).
 *
 * SEEDS. `ActivateOnEffective` = suite networks approved BEFORE their
 * effective time (they read Future), effective today a few minutes before the
 * seed run's first firing F1, which should make them Active; the second firing
 * F2 is a re-run over them the same day. `FutureEffective` = approved, effective
 * ~26 h later; neither firing may touch it. The sheets' NET-30x networks are
 * played by these seeds; "effective in the past" and "effective today" are the
 * same seed (effective earlier today).
 *
 * WHAT THE APPLICATION ALLOWS (verified 2026-11-08):
 * - Approval never makes a network Active, even past its effective time - it
 *   reads Future until the job runs. 17837 asserts the sheet ("Active
 *   immediately upon approval") and so is EXPECTED TO FAIL - a finding.
 * - A network with NO pharmacy cannot be approved (ApproveRequest 409, the
 *   go-live rule), so the sheets' "approved Pending network lacking a facility"
 *   cannot exist. 17840 / 17843 / 17841 (NET-308) assert the withholding where
 *   the application applies it - at approval - and observe the job's activation
 *   of an eligible approved network on the ActivateOnEffective seed.
 * - The "inactive owning payer" branch needs a suite payer that is inactive
 *   while the job runs; the seeder has no such purpose (17845 BLOCKED, the
 *   payer branch of 17840 is annotated as not exercised).
 */
export const CASES = {
  activatesAtApproval: { azureId: '17837' },
  approvedBeforeEffective: { azureId: '17838' },
  exactDay: { azureId: '17839' },
  ineligibleWithheld: { azureId: '17840' },
  oneRunAllEligible: { azureId: '17841' },
  tomorrowNotYet: { azureId: '17842' },
  eligibleLater: { azureId: '17843' },
  sameEffectiveDate: { azureId: '17844' },
  auditAutomatic: { azureId: '17846' },
} as const;

/** 17837: the registration's effective time, minutes ahead (the create refuses a past time). */
export const EFFECTIVE_IN_MINUTES = 2;

/** 17837: "immediately upon approval" - how long the status may take to show after the approval. */
export const IMMEDIATE_MS = 60_000;

/** 17844: how many networks share the effective date (the seeder makes 3). */
export const SAME_DATE_MINIMUM = 2;

/** How the old status of the job's activation entry may read (the sheets' Pending is the app's Future). */
export const BEFORE_ACTIVATION = /Future|Pending/i;

export const BLOCKED_CASES: NetworkBlockedCase[] = [
  {
    azureId: '17845',
    title: 'should re-check the owning payer when the job runs and activate the network only once the payer is active again',
    reason:
      'Needs an approved suite network whose OWNING PAYER is inactive at the moment the network job runs and active again '
      + 'before the next run. The seed run (`' + SEED_COMMAND.network + '`) has no such purpose: it would have to own a suite '
      + 'payer, inactivate it (approval) between its effective time and F1, and reactivate it (approval) before a third '
      + 'firing; the suite may not toggle a shared payer. Unblocked by a seed purpose "ActivateWithInactivePayer" in '
      + 'utils/jobDriven/jobSeeds.ts that builds that payer and fires the job a third time.',
  },
];
