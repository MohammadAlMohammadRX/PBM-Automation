import { test as base } from '@playwright/test';
import { PayerManagementPage } from '../pages/payer/PayerManagementPage';
import { PlanManagementPage } from '../pages/plan/PlanManagementPage';
import { PolicyManagementPage } from '../pages/policy/PolicyManagementPage';
import { LIFECYCLE_STATUS } from '../data/payers/statusTransition.data';
import { Logger } from '../utils/Logger';
import { blockedByPrecondition } from './testStatus.fixture';

/** What a cascade case needs to know about its payer. */
export interface CascadeCandidate {
  payerName: string;
  /** The payer's own lifecycle status, as its row displays it. */
  payerStatus: string;
  /** Its plans and policies that are currently Active - what a cascade moves. */
  activePlans: string[];
  activePolicies: string[];
}

/**
 * The precondition the cascade cases need: a payer whose inactivation would
 * actually cascade.
 *
 * DISCOVERED, NOT ASSUMED. The sheet asks for "an active payer with linked
 * active plans and policies", and whether one exists is a property of the
 * environment that changes over time - so this scans for one rather than naming
 * a record. A case built on a hard-coded payer would go quietly wrong the day
 * that payer's status changed.
 *
 * WHAT THE SCAN FOUND when these cases were written:
 *
 *   The Plans module holds ONE plan displaying Active - "Plan A" - and it
 *   belongs to payer NUPCO, whose own status is EXPIRED. An expired payer
 *   offers no Inactivate action at all (its row carries only View, Edit,
 *   Activate and Delete), so it cannot be the subject of a cascade case.
 *
 *   The Policies module holds nine policies, one of them Active, and that one
 *   belongs to "Al Dawaa" - an ACTIVE payer. So the cascade IS exercisable,
 *   through the policy half rather than the plan half.
 *
 * A candidate must also be SETTLED. A payer carrying a pending change loses its
 * lifecycle row actions - a row reading "Pending Approval" offers only View,
 * Edit and Delete - so an otherwise perfect candidate cannot be inactivated,
 * and a case built on it would fail on a missing control rather than on the
 * cascade. That is not hypothetical: it is how the first run of these cases
 * failed.
 *
 * When nothing qualifies the cases report BLOCKED with the counts and the
 * reason each candidate was rejected, which is a more useful report than a
 * failure - and they turn into real tests the moment a qualifying payer exists.
 */
export interface CascadeDependentsFixtures {
  /**
   * A payer displaying `payerStatus` that holds at least one Active plan or
   * policy. Reports BLOCKED, with what the scan found, when there is none.
   */
  payerWithActiveDependents: (payerStatus?: string) => Promise<CascadeCandidate>;
}

export const test = base.extend<CascadeDependentsFixtures>({
  payerWithActiveDependents: async ({ page }, use, testInfo) => {
    const payerPage = new PayerManagementPage(page);
    const planPage = new PlanManagementPage(page);
    const policyPage = new PolicyManagementPage(page);

    await use(async (payerStatus = LIFECYCLE_STATUS.active.en) => {
      await planPage.openList();
      const plans = await planPage.getPlanRows();
      const activePlans = plans.filter(
        (plan) => plan.status === LIFECYCLE_STATUS.active.en && plan.payer !== '',
      );

      await policyPage.openList();
      const policies = await policyPage.getPolicyRows();
      const activePolicies = policies.filter(
        (policy) => policy.status === LIFECYCLE_STATUS.active.en && policy.payer !== '',
      );

      // Candidate payers are those owning at least one active dependent.
      const owners = Array.from(
        new Set([...activePlans, ...activePolicies].map((record) => record.payer)),
      );
      Logger.step(
        `[fixture] ${activePlans.length} active plan(s) and ${activePolicies.length} active `
        + `policy(ies) across ${owners.length} payer(s): ${owners.join(', ') || '(none)'}`,
      );

      const rejected: string[] = [];
      for (const owner of owners) {
        await payerPage.open();
        await payerPage.search(owner);
        const status = await payerPage.getLifecycleStatus(owner).catch(() => '');
        const approval = await payerPage.getApprovalStatus(owner).catch(() => '');
        // SETTLED as well as the right status. A payer carrying a pending
        // change loses its lifecycle row actions altogether - a row reading
        // "Pending Approval" offers only View, Edit and Delete - so an
        // otherwise perfect candidate cannot be inactivated at all, and the
        // case would fail on a missing control rather than on the cascade.
        const settled = approval.includes('Published');
        if (status === payerStatus && settled) {
          return {
            payerName: owner,
            payerStatus: status,
            activePlans: activePlans.filter((p) => p.payer === owner).map((p) => p.name),
            activePolicies: activePolicies.filter((p) => p.payer === owner).map((p) => p.name),
          };
        }
        rejected.push(`${owner} is ${status || 'unreadable'}${settled ? '' : ` with ${approval} pending`}`);
      }

      blockedByPrecondition(
        testInfo,
        `a payer displaying ${payerStatus} that holds active plans or policies`,
        new Error(
          `the environment holds ${activePlans.length} active plan(s) and `
          + `${activePolicies.length} active policy(ies), and none belongs to a payer displaying `
          + `${payerStatus}` + (rejected.length > 0 ? ` (${rejected.join('; ')})` : '')
          + '. Activate a plan or policy under an active payer to exercise the cascade.',
        ),
      );
    });
  },
});
