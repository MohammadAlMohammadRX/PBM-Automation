import { nonAdminBlockReason } from '../accounts/nonAdminAccount.data';
import type { BlockedCase } from './payerTypes';

/**
 * Test data for "Cascade Inactivation to Plans and Policies on Inactivation or
 * Expiry, Restore on Reactivation".
 *
 * The cascade itself is exercised through the `payerWithActiveDependents`
 * fixture, which DISCOVERS a payer holding active plans or policies and
 * reports BLOCKED when the register has none - plans and policies are created
 * in their own modules, outside this framework. The cases that need no
 * children (a payer with nothing to cascade completes cleanly; a full
 * inactivate/reactivate cycle leaves one consistent state) run on the
 * suite's own published payer.
 *
 * The expiry-driven cascade is the scheduled job; the "tagged by the payer"
 * marker, the independent-inactivation exclusion, the same-day boundary and
 * the failure-injection case each need data or hooks this environment does
 * not offer. Those are listed in BLOCKED_CASES.
 */

/** The account the access-control case needs. */
export const CASCADE_ROLE_REQUIREMENT = {
  role: 'a restricted role without inactivate/reactivate rights',
  reason:
    'The case proves only authorised roles can inactivate or reactivate a payer. The shared '
    + 'administrator can do both, so it cannot show the refusal.',
} as const;

const NEEDS_PLAN_CONTROL =
  'This case needs plans and policies created and manipulated to order under one payer - in the '
  + 'Plans and Policies modules, outside this framework. Provide the records the case names and re-run.';

/** The sheet's cases this environment cannot exercise, in renumbered order. */
export const BLOCKED_CASES: readonly BlockedCase[] = [
  {
    id: '002',
    title: 'should cascade to the payer\'s active plans and policies when the payer expires automatically',
    reason:
      'The expiry is performed by the scheduled lifecycle job at its CRON time; this environment '
      + 'cannot trigger it or move the clock. Trigger the job against a payer whose end date has passed and re-run.',
  },
  {
    id: '003',
    title: 'should tag each cascaded plan and policy as inactivated by the payer that triggered it',
    reason: `${NEEDS_PLAN_CONTROL} It also needs the plan/policy screens to expose an "inactivated by" marker, which no reader here has observed.`,
  },
  {
    id: '006',
    title: 'should not restore a plan that was inactivated independently of the payer',
    reason: `${NEEDS_PLAN_CONTROL} Plan B must be inactivated manually in the Plans module before the payer is reactivated.`,
  },
  {
    id: '007',
    title: 'should cascade correctly when the plan and policy end dates coincide with the payer\'s',
    reason: `${NEEDS_PLAN_CONTROL} The boundary also depends on the scheduled job evaluating "today".`,
  },
  {
    id: '009',
    title: 'should leave no plan in an ambiguous state when the cascade fails on one of them',
    reason: 'Failure injection on one plan\'s cascade needs a locked record or a downstream fault the environment does not expose.',
  },
  {
    id: '010',
    title: 'should let only authorised roles inactivate or reactivate a payer',
    reason: `${nonAdminBlockReason({ lacking: ['changePayerStatus'] })} ${CASCADE_ROLE_REQUIREMENT.reason}`,
  },
  {
    id: '011',
    title: 'should keep claim references intact when a payer with cascaded records is reactivated',
    reason: 'This case needs an integrated Claims module holding a claim against the cascaded policy - outside this framework.',
  },
  {
    id: '013',
    title: 'should cascade to every plan type linked to the payer',
    reason: `${NEEDS_PLAN_CONTROL} It needs Individual, Group and Corporate plans under one payer.`,
  },
  {
    id: '014',
    title: 'should leave plans that were already Inactive untouched and not re-tag them as cascaded',
    reason: `${NEEDS_PLAN_CONTROL} Plan B must be Inactive for an unrelated reason before the payer is inactivated.`,
  },
];
