import { test, expect } from '../../../fixtures';
import { azureOrCase } from '../../../data/azureTestIds.data';
import type { ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';
import { NON_ADMIN_PROFILE } from '../../../data/accounts/nonAdminAccount.data';
import { PAYER_STATUS_PERMISSIONS } from '../../../data/accounts/payerAdminRole.data';
import type { PayerManagementPage } from '../../../pages/payer/PayerManagementPage';
import type { PayerInactivateDialog } from '../../../pages/payer/PayerInactivateDialog';
import type { ApprovalManagementPage } from '../../../pages/approval/ApprovalManagementPage';
import type { PlanManagementPage } from '../../../pages/plan/PlanManagementPage';
import type { PolicyManagementPage } from '../../../pages/policy/PolicyManagementPage';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import { PRIMARY_REASON } from '../../../data/payers/inactivationDecisions.data';
import { BLOCKED_CASES } from '../../../data/payers/cascadeInactivation.data';

/**
 * User story: Cascade Inactivation to Plans and Policies on Inactivation or
 * Expiry, Restore on Reactivation.
 *
 * Cascade cases DISCOVER their payer: `payerWithActiveDependents` for an
 * Active payer holding active records, `payerWithCascadedDependents` for an
 * Inactive payer whose records were cascaded (provisioned from the former when
 * none exists). Both report BLOCKED when the register cannot supply one.
 *
 * VERIFIED: the cascade is applied a few seconds AFTER the approval lands, so
 * dependents are polled rather than read once - a single read caught "NUPCO
 * Plan 1" still Active moments before it turned Inactive.
 *
 * Every case that inactivates a discovered payer puts it back, so the shared
 * register ends each run as it began. The restoration case runs first so an
 * earlier interrupted run's inactive payer is the first thing restored.
 */
const CASCADE_SETTLE_MS = 60_000;

async function inactivateAndApprove(
  payerManagementPage: PayerManagementPage,
  payerInactivateDialog: PayerInactivateDialog,
  approvalManagementPage: ApprovalManagementPage,
  name: string,
): Promise<void> {
  await payerManagementPage.open();
  await payerManagementPage.search(name);
  await payerManagementPage.waitForRowVisible(name);
  await payerManagementPage.inactivateRow(name);
  await payerInactivateDialog.selectReason(PRIMARY_REASON);
  await payerInactivateDialog.confirm();
  await payerManagementPage.open();
  await payerManagementPage.sendForApproval(name);
  await approvalManagementPage.open();
  await approvalManagementPage.approve(name);
  await payerManagementPage.open();
  await payerManagementPage.search(name);
  await payerManagementPage.expectLifecycleStatus(name, LIFECYCLE_STATUS.inactive.en);
}

async function reactivateAndApprove(
  payerManagementPage: PayerManagementPage,
  approvalManagementPage: ApprovalManagementPage,
  name: string,
): Promise<void> {
  await payerManagementPage.open();
  await payerManagementPage.search(name);
  await payerManagementPage.waitForRowVisible(name);
  const prompt = await payerManagementPage.openActivationPrompt(name);
  await prompt.confirm();
  await payerManagementPage.open();
  await payerManagementPage.sendForApproval(name);
  await approvalManagementPage.open();
  await approvalManagementPage.approve(name);
  await payerManagementPage.open();
  await payerManagementPage.search(name);
  await payerManagementPage.expectLifecycleStatus(name, LIFECYCLE_STATUS.active.en);
}

/** The current status of each NAMED plan and policy of the payer, read fresh. */
async function namedStatuses(
  planManagementPage: PlanManagementPage,
  policyManagementPage: PolicyManagementPage,
  payer: string,
  names: readonly string[],
): Promise<string[]> {
  const plans = await planManagementPage.getPlansOfPayer(payer);
  const policies = await policyManagementPage.getPoliciesOfPayer(payer);
  return [...plans, ...policies]
    .filter((record) => names.includes(record.name))
    .map((record) => `${record.name}=${record.status}`);
}

/**
 * Polls until each named dependent reads `status`.
 *
 * Only the records the fixture counted as cascade subjects are checked: a
 * payer may also own records in states the cascade never touches, and "every
 * record" would wait on those forever.
 */
async function expectDependentsSettleTo(
  planManagementPage: PlanManagementPage,
  policyManagementPage: PolicyManagementPage,
  payer: string,
  names: readonly string[],
  status: string,
): Promise<void> {
  await expect
    .poll(async () => namedStatuses(planManagementPage, policyManagementPage, payer, names), {
      timeout: CASCADE_SETTLE_MS,
      message: `${names.join(', ')} of "${payer}" should settle to ${status}`,
    })
    .toEqual(names.map((name) => `${name}=${status}`));
}

/**
 * Polls until no named dependent is left Inactive - each has been recomputed
 * from its own dates, so a record whose own end date has passed correctly
 * stays Expired rather than returning to Active. That is the sheet's own
 * restoration rule ("recomputed from their own dates").
 */
async function expectDependentsRestored(
  planManagementPage: PlanManagementPage,
  policyManagementPage: PolicyManagementPage,
  payer: string,
  names: readonly string[],
): Promise<void> {
  await expect
    .poll(async () => {
      const statuses = await namedStatuses(planManagementPage, policyManagementPage, payer, names);
      return statuses.filter((entry) => entry.endsWith(`=${LIFECYCLE_STATUS.inactive.en}`));
    }, {
      timeout: CASCADE_SETTLE_MS,
      message: `no record of "${payer}" should be left Inactive after its reactivation`,
    })
    .toEqual([]);
}

/** The payer a case borrowed from the shared register and left Inactive, if any. */
let borrowedPayer = '';

test.describe('Cascade inactivation and restoration', () => {
  test.afterEach(async ({ payerManagementPage, approvalManagementPage }) => {
    // Whatever a case did, the shared payer it borrowed goes back to Active -
    // a failed step must not leave a real record inactive for the next run.
    if (borrowedPayer === '') return;
    const name = borrowedPayer;
    borrowedPayer = '';
    await payerManagementPage.open();
    await payerManagementPage.search(name);
    const status = await payerManagementPage.getLifecycleStatus(name).catch(() => '');
    if (status !== LIFECYCLE_STATUS.inactive.en) return;
    await reactivateAndApprove(payerManagementPage, approvalManagementPage, name);
  });
  // Azure test case 15657
  test('15657: should restore the cascaded plans and policies when the payer is reactivated', async ({
    payerManagementPage,
    approvalManagementPage,
    planManagementPage,
    policyManagementPage,
    payerWithCascadedDependents,
    steps,
  }) => {
    test.slow();
    let candidate!: Awaited<ReturnType<typeof payerWithCascadedDependents>>;

    await steps.critical('Navigate to the module and find an Inactive payer with cascaded records', async () => {
      candidate = await payerWithCascadedDependents();
      borrowedPayer = candidate.payerName;
      expect(candidate.activePlans.length + candidate.activePolicies.length, 'the payer should hold records to restore').toBeGreaterThan(0);
    });

    await steps.step('The payer is reactivated and the change approved', async () => {
      await reactivateAndApprove(payerManagementPage, approvalManagementPage, candidate.payerName);
    });

    await steps.step('Its cascaded plans and policies are restored according to their own dates', async () => {
      await expectDependentsRestored(
        planManagementPage,
        policyManagementPage,
        candidate.payerName,
        [...candidate.activePlans, ...candidate.activePolicies],
      );
    });
  });

  // Azure test case 15654
  test('15654: should inactivate the payer\'s active plans and policies when the payer is inactivated', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    planManagementPage,
    policyManagementPage,
    payerWithActiveDependents,
    steps,
  }) => {
    test.slow();
    let candidate!: Awaited<ReturnType<typeof payerWithActiveDependents>>;

    await steps.critical('Navigate to the module and find an Active payer with active dependents', async () => {
      candidate = await payerWithActiveDependents();
      borrowedPayer = candidate.payerName;
      expect(candidate.activePlans.length + candidate.activePolicies.length).toBeGreaterThan(0);
    });

    await steps.step('The payer is inactivated and the change approved', async () => {
      await inactivateAndApprove(payerManagementPage, payerInactivateDialog, approvalManagementPage, candidate.payerName);
    });

    await steps.step('Every one of its active plans and policies becomes Inactive', async () => {
      await expectDependentsSettleTo(
        planManagementPage,
        policyManagementPage,
        candidate.payerName,
        [...candidate.activePlans, ...candidate.activePolicies],
        LIFECYCLE_STATUS.inactive.en,
      );
    });

    await steps.step('The payer is put back as it was found', async () => {
      // Shared register: the payer this case borrowed is returned Active, so
      // the environment ends the run as it started (afterEach covers a failure).
      await reactivateAndApprove(payerManagementPage, approvalManagementPage, candidate.payerName);
    });
  });

  // Azure test case 15658
  test('15658: should carry the payer and its records through Active, Inactive and back to Active', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    planManagementPage,
    policyManagementPage,
    payerWithActiveDependents,
    steps,
  }) => {
    test.slow();
    let candidate!: Awaited<ReturnType<typeof payerWithActiveDependents>>;

    await steps.critical('Navigate to the module and find an Active payer with active dependents', async () => {
      candidate = await payerWithActiveDependents();
      borrowedPayer = candidate.payerName;
      expect(candidate.activePlans.length + candidate.activePolicies.length).toBeGreaterThan(0);
    });

    await steps.step('Inactivation cascades down', async () => {
      await inactivateAndApprove(payerManagementPage, payerInactivateDialog, approvalManagementPage, candidate.payerName);
      await expectDependentsSettleTo(
        planManagementPage,
        policyManagementPage,
        candidate.payerName,
        [...candidate.activePlans, ...candidate.activePolicies],
        LIFECYCLE_STATUS.inactive.en,
      );
    });

    await steps.step('Reactivation restores everything according to its own dates', async () => {
      await reactivateAndApprove(payerManagementPage, approvalManagementPage, candidate.payerName);
      await expectDependentsRestored(
        planManagementPage,
        policyManagementPage,
        candidate.payerName,
        [...candidate.activePlans, ...candidate.activePolicies],
      );
    });
  });

  // Azure test case 15661
  test('15661: should complete the inactivation without error when the payer has nothing to cascade to', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module and open the Inactivate drawer of a payer with no records', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.waitForRowVisible(publishedPayer.nameEn);
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
      const summary = await payerInactivateDialog.getImpactSummaryText();
      expect(summary, 'the preview should count nothing to cascade').toMatch(/\b0\b/);
      await payerInactivateDialog.cancel();
    });

    await steps.step('The inactivation completes and the payer reads Inactive', async () => {
      await inactivateAndApprove(payerManagementPage, payerInactivateDialog, approvalManagementPage, publishedPayer.nameEn);
    });
  });

  // Azure test case 15665
  test('15665: should leave one consistent state and a full audit trail after rapid inactivate and reactivate', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module and inactivate then reactivate the payer', async () => {
      await inactivateAndApprove(payerManagementPage, payerInactivateDialog, approvalManagementPage, publishedPayer.nameEn);
      await reactivateAndApprove(payerManagementPage, approvalManagementPage, publishedPayer.nameEn);
    });

    await steps.step('The payer shows a single consistent final state', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(publishedPayer.nameEn, LIFECYCLE_STATUS.active.en);
    });

    await steps.step('And its audit trail records both transitions', async () => {
      // VERIFIED: the timeline words an approved transition "Status Change",
      // so two of them sit above the creation entry.
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.openAuditHistory();
      await detail.expectAuditEntryMatching(/status change/i, 'a status transition');
      const entries = await detail.getAuditEntryTexts();
      expect(
        entries.filter((entry) => /status change/i.test(entry)).length,
        `the audit trail should hold both transitions; it holds: ${entries.join(' | ')}`,
      ).toBeGreaterThanOrEqual(2);
    });
  });


  // ---- the withheld half, on a role shaped for this case -------------------
  // This used to report BLOCKED: the one non-administrator credential in this
  // environment HOLDS the permission whose absence the case is about. The
  // account is now BUILT - the administrator takes the permission off the
  // shared "Payer Admin" role, the case signs in as it, and the permission
  // goes back when the case ends.

  // Azure test case 15663
  test('15663: should let only authorised roles inactivate or reactivate a payer', async ({ shapedNonAdmin, steps }) => {
    let session!: ShapedSession;

    await steps.critical('Sign in as a user without either status right', async () => {
      session = await shapedNonAdmin({ without: PAYER_STATUS_PERMISSIONS });
      await session.payers.navigate();
      await session.payers.expectRowsRendered();
    });

    await steps.step('Neither lifecycle action is offered to this role', async () => {
      await session.payers.expectRowActionUnavailable(NON_ADMIN_PROFILE.scopedPayers[0], 'inactivate');
      await session.payers.expectRowActionUnavailable(NON_ADMIN_PROFILE.scopedPayers[0], 'activate');
    });
  });
  for (const blocked of BLOCKED_CASES) {
    // Azure test cases - one per generated case:
    //   TC-002 = 15656,  TC-003 = 15655,  TC-006 = 15659
    //   TC-007 = 15660,  TC-009 = 15662,  TC-011 = 15664
    //   TC-013 = 15666,  TC-014 = 15667
    test(`${azureOrCase('64', 'TC-' + blocked.id)}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
