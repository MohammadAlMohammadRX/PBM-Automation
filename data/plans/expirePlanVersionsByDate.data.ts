import type { PlanBlockedCase } from './activationEligibility.data';
import { PLAN_APPROVAL_CELL, PLAN_LIFECYCLE } from './plan.data';
import { PLAN_SUITE } from './planSuite.data';

/**
 * Test data for US 14156 "Expire active plan versions automatically by date"
 * (plan folder 31), written 2026-11-08 - the story was Manual until the user
 * asked for the job stories to be automated.
 *
 * HOW THE CASES RUN (SEED-THEN-CHECK, reports/manual-automation/Foundation-Notes.md):
 * no case moves the plan job. `npm run seed:plan-jobs`, run the same Riyadh day,
 * builds suite plans ("Automation Plan JobSeed <Purpose> ...", payer "Al sharq",
 * FORM-0023 assigned read-only), fires Jobs.PlanLifecycleCron at F1 (activation)
 * and F2 (just after the expiring seeds' expiry), restores it, and records each
 * record's state before / after. A case CLAIMS a seed of its purpose and asserts
 * what the job did; no seed today -> BLOCKED naming the seed command.
 *
 * THE SHEET'S DATES. The sheet's fixed dates (ExpiryDate 2026-10-01 against
 * "today" 2026-10-08, "yesterday", "today") are kept as RELATIVE positions
 * against the job run: the application stores the expiry as a date AND time
 * (form `DD/MM/YYYY HH:mm`) and refuses a past date at create, so "expiry
 * earlier than the current date" / "yesterday" = an expiry instant that had
 * passed when the job ran (PlanVersionExpire), and "expiry equal to today, not
 * yet due" = an expiry instant still ahead when the job ran
 * (PlanActiveExpiryTomorrow). The sheet's plan codes (PLN-3001 ...) are the seeds.
 *
 * CONFLICTS NOTED FOR THE LEAD:
 *  - 19088 expects an INACTIVE version with a past expiry to stay Inactive
 *    ("never transitioned by the expiry job"). US 14330 (plan folder 32, 19255)
 *    says the opposite: an Inactive plan expires once its expiry passes. The
 *    case asserts the TEST CASE on an Inactive seed whose expiry passed before
 *    the run (InactivePlanExpire), so one of 19088 / 19255 fails by design.
 *  - 19096 asks for an audit entry "Action = Expired"; the trail may name the
 *    action "Status Change" with Expired as the new status - the case accepts
 *    the entry when its action OR its recorded change reads Expired.
 *  - 19090 asks for exact before / after KPI counts; the counts before the
 *    seed run were not recorded, so the case checks the Expired tile against
 *    the list's Expired total in the same scope and that the seed moved from
 *    Active to Expired.
 *  - 19093's "no eligible version anywhere" cannot be guaranteed in a shared
 *    register; the case asserts the run changed nothing on the suite's
 *    NOT-eligible seeds (Active / Future / Inactive with a future expiry).
 */

export const CASES = {
  expiresAfterExpiry: { azureId: '19084' },
  activeOnExpiryDay: { azureId: '19085' },
  expiresDayAfter: { azureId: '19086' },
  draftUntouched: { azureId: '19087' },
  inactiveUntouched: { azureId: '19088' },
  systemActor: { azureId: '19089' },
  kpiTiles: { azureId: '19090' },
  directoryBadge: { azureId: '19091' },
  onlyActiveToExpired: { azureId: '19092' },
  nothingEligible: { azureId: '19093' },
  utcBased: { azureId: '19094' },
  multiVersion: { azureId: '19095' },
  auditEntry: { azureId: '19096' },
  idempotentRerun: { azureId: '19097' },
} as const;

/** The payer every seed belongs to (the list is opened in its scope). */
export const SEED_PAYER = PLAN_SUITE.payerName;

/** The list / header badges. */
export const STATUS = PLAN_LIFECYCLE;
export const APPROVAL = PLAN_APPROVAL_CELL;

/** The lifecycle snapshot labels (GetPlan effectiveStatusId -> lookup englishName). */
export const SNAPSHOT = { active: 'Active', future: 'Future', inactive: 'Inactive', expired: 'Expired' } as const;

/** The actor a job-made change must name (the sheet's 'System'). */
export const SYSTEM_ACTOR = 'System';

/** The expiry recorded by an audit entry - its action, or the status it set. */
export const EXPIRED_ENTRY = /Expir/i;

/** How far an audit timestamp may sit from the observed run (the job's run time). */
export const RUN_TOLERANCE_MS = 3 * 60_000;

/** 19094 - the viewer's time zone (the sheet's UTC+10; Brisbane keeps no daylight saving). */
export const VIEWER_TIME_ZONE = 'Australia/Brisbane';
export const VIEWER_UTC_OFFSET_MINUTES = 10 * 60;

/** 19093 - the seeds the run must NOT change (purpose -> the status they keep). */
export const NOT_ELIGIBLE = [
  { purpose: 'PlanActiveExpiryTomorrow', keeps: 'Active' },
  { purpose: 'PlanFutureEffective', keeps: 'Future' },
  { purpose: 'InactivePlanFutureExpiry', keeps: 'Inactive' },
] as const;

export const BLOCKED_CASES: PlanBlockedCase[] = [
  {
    azureId: CASES.multiVersion.azureId,
    title: 'should expire only the eligible version and leave the plan\'s other versions unchanged when one plan has three versions',
    reason:
      'Needs ONE plan holding two Active versions at once (v1 past its expiry, v2 with a future expiry) plus a Draft v3. '
      + 'The application keeps one live version per plan: approving v2 supersedes v1 (Version History: Published -> '
      + 'Superseded), and a plan carries one effective / expiry period, so two concurrently Active versions with different '
      + 'expiry dates cannot be built through the screens or the API. Runnable only against seeded data with independent '
      + 'per-version periods; the single-version rule is covered by 19084 (expired), 19085 (not yet due) and 19087 (Draft).',
  },
];
