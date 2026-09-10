import { test, expect } from '../../../fixtures';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import { INACTIVATION_REASONS } from '../../../data/payers/lifecycleGuardrails.data';
import {
  IMPACT_SUMMARY_PATTERN,
  INACTIVATION_WARNING,
  REACTIVATION_MESSAGE,
  SUCCESS_TOAST,
} from '../../../data/payers/cascadeMessaging.data';

/**
 * User story: Explain Inactivation and Reactivation Effects Before They Are
 * Applied.
 * The cascade itself - what happens to a payer's plans and policies.
 *
 * EVERY CASE HERE DEPENDS ON A PAYER WHOSE INACTIVATION WOULD ACTUALLY CASCADE,
 * and the environment currently offers none. The scan behind
 * `payerWithActiveDependents` found one Active plan in the whole Plans module -
 * "Plan A", belonging to payer NUPCO - and NUPCO's own status is EXPIRED, so its
 * row carries no Inactivate action at all. Every other plan reads Expired.
 *
 * So these cases report BLOCKED with the counts the scan found, rather than
 * failing. The distinction matters: a failure would claim the cascade is
 * broken, and nothing here has been observed either way. The precondition is
 * discovered on every run, so the day a plan is activated under an active payer
 * these become real tests without a line changing.
 *
 * WHAT IS ALREADY KNOWN, and is asserted by the cases that CAN run (see
 * inactivation-messaging.spec.ts and reactivation-messaging.spec.ts): the
 * confirmation states the cascade, the restoration and the draft caveat, and it
 * previews the affected counts - even for a payer with nothing to cascade.
 */
test.describe('Inactivation and reactivation effects - Cascade to plans and policies', () => {
  test('TC-002: should explain the cascade before applying it when the payer has linked plans and policies', async ({
    payerManagementPage,
    payerInactivateDialog,
    payerWithActiveDependents,
    steps,
  }) => {
    let candidate!: Awaited<ReturnType<typeof payerWithActiveDependents>>;

    await steps.critical('Navigate to the module and find a payer with active dependents', async () => {
      candidate = await payerWithActiveDependents();
      await payerManagementPage.open();
      await payerManagementPage.search(candidate.payerName);
      await payerManagementPage.expectLifecycleStatus(
        candidate.payerName,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.critical('The payer shows its associated plans and policies', async () => {
      expect(
        candidate.activePlans.length + candidate.activePolicies.length,
        'the candidate should hold at least one active dependent',
      ).toBeGreaterThan(0);
    });

    await steps.step('The Inactivate action opens a confirmation before anything is applied', async () => {
      await payerManagementPage.inactivateRow(candidate.payerName);
      await payerInactivateDialog.expectReasonAndDetailsOffered();
    });

    await steps.step('It states the cascade, the restoration and the draft caveat', async () => {
      const warning = await payerInactivateDialog.getWarningText();
      expect(warning, 'the cascade').toContain(INACTIVATION_WARNING.cascade);
      expect(warning, 'the restoration promise').toContain(INACTIVATION_WARNING.restoration);
      expect(warning, 'the draft caveat').toContain(INACTIVATION_WARNING.draftCaveat);

      // And the preview counts what would actually move - the part the sheet
      // does not ask for and the application volunteers.
      const impact = await payerInactivateDialog.getImpactSummaryText();
      const counts = impact.match(IMPACT_SUMMARY_PATTERN);
      expect(counts, `the impact preview read "${impact}"`).not.toBeNull();
      expect(
        Number(counts![1]) + Number(counts![2]),
        'the preview should count the dependents the scan found',
      ).toBeGreaterThan(0);
    });

    await steps.step('Cancel leaves the payer Active with nothing applied', async () => {
      await payerInactivateDialog.cancel();
      await payerManagementPage.open();
      await payerManagementPage.search(candidate.payerName);
      await payerManagementPage.expectLifecycleStatus(
        candidate.payerName,
        LIFECYCLE_STATUS.active.en,
      );
    });
  });

  test('TC-003: should explain the restoration before applying it when an inactive payer has cascaded records', async ({
    payerManagementPage,
    payerWithActiveDependents,
    steps,
  }) => {
    let candidate!: Awaited<ReturnType<typeof payerWithActiveDependents>>;

    await steps.critical('Navigate to the module and find an inactive payer with cascaded records', async () => {
      // The mirror of TC-002's precondition: a payer that is Inactive AND whose
      // plans and policies were carried down with it. Asked for as Inactive so
      // the case cannot quietly run against an active payer.
      candidate = await payerWithActiveDependents(LIFECYCLE_STATUS.inactive.en);
      await payerManagementPage.open();
      await payerManagementPage.search(candidate.payerName);
      await payerManagementPage.expectLifecycleStatus(
        candidate.payerName,
        LIFECYCLE_STATUS.inactive.en,
      );
    });

    await steps.critical('The payer detail shows the cascaded records', async () => {
      expect(
        candidate.activePlans.length + candidate.activePolicies.length,
        'the candidate should hold dependents to restore',
      ).toBeGreaterThan(0);
    });

    await steps.step('The Reactivate action opens a confirmation promising restoration', async () => {
      const dialog = await payerManagementPage.openActivationPrompt(candidate.payerName);
      expect(await dialog.getMessage(), 'the restoration promise').toContain(
        REACTIVATION_MESSAGE.restoration,
      );
    });

    await steps.step('Cancel leaves the payer Inactive with nothing restored', async () => {
      await payerManagementPage.dialog().cancel();
      await payerManagementPage.open();
      await payerManagementPage.search(candidate.payerName);
      await payerManagementPage.expectLifecycleStatus(
        candidate.payerName,
        LIFECYCLE_STATUS.inactive.en,
      );
    });
  });

  test('TC-007: should inactivate the linked plans and policies when the payer is inactivated', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    planManagementPage,
    policyManagementPage,
    payerWithActiveDependents,
    toast,
    steps,
  }) => {
    let candidate!: Awaited<ReturnType<typeof payerWithActiveDependents>>;

    await steps.critical('Navigate to the module and find a payer with active dependents', async () => {
      candidate = await payerWithActiveDependents();
      await payerManagementPage.open();
      await payerManagementPage.search(candidate.payerName);
      await payerManagementPage.expectLifecycleStatus(
        candidate.payerName,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.critical('Its linked plans and policies are Active', async () => {
      const plans = await planManagementPage.getPlansOfPayer(candidate.payerName);
      const policies = await policyManagementPage.getPoliciesOfPayer(candidate.payerName);
      expect(
        [...plans, ...policies].filter((record) => record.status === LIFECYCLE_STATUS.active.en),
        'the dependents the cascade should move',
      ).not.toEqual([]);
    });

    await steps.step('Inactivating the payer is accepted', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(candidate.payerName);
      await payerManagementPage.inactivateRow(candidate.payerName);
      await payerInactivateDialog.selectReason(INACTIVATION_REASONS[0]);
      await payerInactivateDialog.confirm();
      await toast.expectText(SUCCESS_TOAST);

      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(candidate.payerName);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(candidate.payerName);
      await approvalManagementPage.approve(candidate.payerName);

      await payerManagementPage.open();
      await payerManagementPage.search(candidate.payerName);
      await payerManagementPage.expectLifecycleStatus(
        candidate.payerName,
        LIFECYCLE_STATUS.inactive.en,
      );
    });

    await steps.step('Its previously active plans now read Inactive', async () => {
      const plans = await planManagementPage.getPlansOfPayer(candidate.payerName);
      for (const planName of candidate.activePlans) {
        const plan = plans.find((row) => row.name === planName);
        expect(plan, `plan "${planName}" should still be listed`).not.toBeUndefined();
        expect(plan!.status, `plan "${planName}" should have been carried down`).toBe(
          LIFECYCLE_STATUS.inactive.en,
        );
      }
    });

    await steps.step('Its previously active policies now read Inactive', async () => {
      const policies = await policyManagementPage.getPoliciesOfPayer(candidate.payerName);
      for (const policyName of candidate.activePolicies) {
        const policy = policies.find((row) => row.name === policyName);
        expect(policy, `policy "${policyName}" should still be listed`).not.toBeUndefined();
        expect(policy!.status, `policy "${policyName}" should have been carried down`).toBe(
          LIFECYCLE_STATUS.inactive.en,
        );
      }
    });

    await steps.step('The payer is restored to Active so the environment is left as found', async () => {
      // Not part of the sheet - housekeeping. This case changes a shared record
      // that it did not create, so it puts it back. Asserted rather than
      // best-effort, because a restoration that silently failed would leave the
      // next case with a precondition it cannot see is missing.
      const dialog = await payerManagementPage.openActivationPrompt(candidate.payerName);
      await dialog.confirm('Activate');
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(candidate.payerName);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(candidate.payerName);
      await approvalManagementPage.approve(candidate.payerName);

      await payerManagementPage.open();
      await payerManagementPage.search(candidate.payerName);
      await payerManagementPage.expectLifecycleStatus(
        candidate.payerName,
        LIFECYCLE_STATUS.active.en,
      );
    });
  });

  test('TC-008: should restore the cascaded plans and policies when the payer is reactivated', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    planManagementPage,
    policyManagementPage,
    payerWithActiveDependents,
    toast,
    steps,
  }) => {
    let candidate!: Awaited<ReturnType<typeof payerWithActiveDependents>>;

    await steps.critical('Navigate to the module and find a payer with active dependents', async () => {
      candidate = await payerWithActiveDependents();
      await payerManagementPage.open();
      await payerManagementPage.search(candidate.payerName);
      await payerManagementPage.expectLifecycleStatus(
        candidate.payerName,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.critical('The payer is inactivated so its records are cascaded down', async () => {
      // The setup, not the assertion: TC-007 proves the cascade DOWN. This case
      // needs it to have happened so it can prove the cascade back UP, and it
      // does its own setup rather than depending on TC-007 having run first.
      await payerManagementPage.inactivateRow(candidate.payerName);
      await payerInactivateDialog.selectReason(INACTIVATION_REASONS[0]);
      await payerInactivateDialog.confirm();
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(candidate.payerName);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(candidate.payerName);
      await approvalManagementPage.approve(candidate.payerName);

      await payerManagementPage.open();
      await payerManagementPage.search(candidate.payerName);
      await payerManagementPage.expectLifecycleStatus(
        candidate.payerName,
        LIFECYCLE_STATUS.inactive.en,
      );
    });

    await steps.step('Reactivating the payer is accepted', async () => {
      const dialog = await payerManagementPage.openActivationPrompt(candidate.payerName);
      await dialog.confirm('Activate');
      await toast.expectText(SUCCESS_TOAST);

      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(candidate.payerName);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(candidate.payerName);
      await approvalManagementPage.approve(candidate.payerName);

      await payerManagementPage.open();
      await payerManagementPage.search(candidate.payerName);
      await payerManagementPage.expectLifecycleStatus(
        candidate.payerName,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.step('The cascaded plans read Active again', async () => {
      const plans = await planManagementPage.getPlansOfPayer(candidate.payerName);
      for (const planName of candidate.activePlans) {
        const plan = plans.find((row) => row.name === planName);
        expect(plan, `plan "${planName}" should still be listed`).not.toBeUndefined();
        expect(plan!.status, `plan "${planName}" should have been restored`).toBe(
          LIFECYCLE_STATUS.active.en,
        );
      }
    });

    await steps.step('The cascaded policies read Active again', async () => {
      const policies = await policyManagementPage.getPoliciesOfPayer(candidate.payerName);
      for (const policyName of candidate.activePolicies) {
        const policy = policies.find((row) => row.name === policyName);
        expect(policy, `policy "${policyName}" should still be listed`).not.toBeUndefined();
        expect(policy!.status, `policy "${policyName}" should have been restored`).toBe(
          LIFECYCLE_STATUS.active.en,
        );
      }
    });
  });

  test('TC-010: should carry the payer and its records down and back up across a full cycle', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    planManagementPage,
    payerWithActiveDependents,
    toast,
    steps,
  }) => {
    let candidate!: Awaited<ReturnType<typeof payerWithActiveDependents>>;

    await steps.critical('Navigate to the module and find a payer with active dependents', async () => {
      candidate = await payerWithActiveDependents();
      await payerManagementPage.open();
      await payerManagementPage.search(candidate.payerName);
      await payerManagementPage.expectLifecycleStatus(
        candidate.payerName,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.step('Inactivating the payer stages a draft pending approval', async () => {
      await payerManagementPage.inactivateRow(candidate.payerName);
      await payerInactivateDialog.selectReason(INACTIVATION_REASONS[0]);
      await payerInactivateDialog.confirm();
      await toast.expectText(SUCCESS_TOAST);

      await payerManagementPage.open();
      await payerManagementPage.search(candidate.payerName);
      expect(
        await payerManagementPage.getApprovalStatus(candidate.payerName),
        'the change should be held as a draft, not applied',
      ).toContain('Draft');
    });

    await steps.step('Approving it makes the payer Inactive and its plans Inactive', async () => {
      await payerManagementPage.sendForApproval(candidate.payerName);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(candidate.payerName);
      await approvalManagementPage.approve(candidate.payerName);

      await payerManagementPage.open();
      await payerManagementPage.search(candidate.payerName);
      await payerManagementPage.expectLifecycleStatus(
        candidate.payerName,
        LIFECYCLE_STATUS.inactive.en,
      );

      const plans = await planManagementPage.getPlansOfPayer(candidate.payerName);
      for (const planName of candidate.activePlans) {
        expect(
          plans.find((row) => row.name === planName)?.status,
          `plan "${planName}" should have followed the payer down`,
        ).toBe(LIFECYCLE_STATUS.inactive.en);
      }
    });

    await steps.step('Reactivating and approving brings the payer back to Active', async () => {
      const dialog = await payerManagementPage.openActivationPrompt(candidate.payerName);
      await dialog.confirm('Activate');
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(candidate.payerName);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(candidate.payerName);
      await approvalManagementPage.approve(candidate.payerName);

      await payerManagementPage.open();
      await payerManagementPage.search(candidate.payerName);
      await payerManagementPage.expectLifecycleStatus(
        candidate.payerName,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.step('And its plans read Active again, closing the cycle', async () => {
      const plans = await planManagementPage.getPlansOfPayer(candidate.payerName);
      for (const planName of candidate.activePlans) {
        expect(
          plans.find((row) => row.name === planName)?.status,
          `plan "${planName}" should have followed the payer back up`,
        ).toBe(LIFECYCLE_STATUS.active.en);
      }
    });
  });
});
