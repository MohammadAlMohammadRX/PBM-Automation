import { test as base } from '@playwright/test';
import { PayerManagementPage } from '../pages/payer/PayerManagementPage';
import { PlanManagementPage } from '../pages/plan/PlanManagementPage';
import { PolicyManagementPage } from '../pages/policy/PolicyManagementPage';
import { LIFECYCLE_STATUS } from '../data/payers/statusTransition.data';
import { Logger } from '../utils/Logger';
import { blockedByPrecondition } from './testStatus.fixture';
import { findPayers } from '../utils/PayerFinder';

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
  /**
   * `forChange: true` for a case that will APPROVE a change on the payer it is
   * given (an inactivation or reactivation). Only shared team payers own active
   * plans or policies - the suite cannot create them - so such a case reports
   * BLOCKED instead of changing one of them. Read-only cases (open a
   * confirmation, cancel) leave it unset.
   */
  payerWithActiveDependents: (payerStatus?: string, options?: { forChange?: boolean }) => Promise<CascadeCandidate>;

}

export const test = base.extend<CascadeDependentsFixtures>({
  payerWithActiveDependents: async ({ page }, use, testInfo) => {
    const payerPage = new PayerManagementPage(page);
    const planPage = new PlanManagementPage(page);
    const policyPage = new PolicyManagementPage(page);

    await use(async (payerStatus = LIFECYCLE_STATUS.active.en, options = {}) => {
      // FOUND THROUGH THE API, then READ PER PAYER (changed 2026-10-19). The
      // Plans and Policies lists show nothing until a payer is chosen in the
      // scope selector, so scanning them whole timed out ("rows never
      // rendered") and the cases FAILED instead of reporting what they found.
      // GetPayers names the payers that own policies; each one's plans and
      // policies are then read with its scope set, as 15616 does.
      const owners = (await findPayers(page, (p) => Number(p.linkedPoliciesCount) > 0, 'payers owning policies', []))
        .map((p) => p.payerNameEn);

      const rejected: string[] = [];
      for (const owner of owners) {
        const activePlans = (await planPage.plansInScopeOf(owner).catch(() => []))
          .filter((plan) => /^active$/i.test(plan.status.trim()))
          .map((plan) => plan.name);
        const activePolicies = (await policyPage.getPoliciesOfPayer(owner).catch(() => []))
          .filter((policy) => /^active$/i.test(policy.status.trim()))
          .map((policy) => policy.name);
        if (activePlans.length + activePolicies.length === 0) continue;

        await payerPage.open();
        await payerPage.search(owner);
        const status = await payerPage.getLifecycleStatus(owner).catch(() => '');
        const approval = await payerPage.getApprovalStatus(owner).catch(() => '');
        // SETTLED as well as the right status: a payer carrying a pending
        // change loses its lifecycle row actions, so the case would fail on a
        // missing control rather than on the behaviour under test.
        const settled = approval.includes('Published');
        if (status === payerStatus && settled) {
          if (options.forChange) {
            blockedByPrecondition(
              testInfo,
              `a disposable payer displaying ${payerStatus} that holds active plans or policies`,
              new Error(
                `the only payers holding active plans or policies are shared team records ("${owner}" here), and `
                + 'this case would approve an inactivation or reactivation on it. Plans and policies are created '
                + 'outside this framework, so the suite cannot make a payer of its own for this. Provide a '
                + 'disposable payer with an active plan or policy, then re-run.',
              ),
            );
          }
          Logger.step(`[fixture] "${owner}" (${status}) holds ${activePlans.length} active plan(s), ${activePolicies.length} active policy(ies)`);
          return { payerName: owner, payerStatus: status, activePlans, activePolicies };
        }
        rejected.push(`${owner} is ${status || 'unreadable'}${settled ? '' : ` with ${approval} pending`}`);
      }

      blockedByPrecondition(
        testInfo,
        `a payer displaying ${payerStatus} that holds active plans or policies`,
        new Error(
          `of ${owners.length} payer(s) owning policies, none displaying ${payerStatus} holds an active plan or policy`
          + (rejected.length > 0 ? ` (${rejected.join('; ')})` : '')
          + '. Activate a plan or policy under such a payer to exercise this case.',
        ),
      );
      throw new Error('unreachable');
    });
  },
});
