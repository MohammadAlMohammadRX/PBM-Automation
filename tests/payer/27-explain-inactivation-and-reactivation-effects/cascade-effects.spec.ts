import { test, expect } from '../../../fixtures';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import { INACTIVATION_REASONS } from '../../../data/payers/lifecycleGuardrails.data';
import {
  IMPACT_SUMMARY_PATTERN,
  INACTIVATION_WARNING,
  REACTIVATION_MESSAGE,
  SUCCESS_TOAST,
  NO_CASCADE_REQUIREMENT,
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
  // Azure test case 15519
  // UPDATED from change sheet 2026-09-27: the confirmation must now state that
  // plans and policies are NOT affected. See NO_CASCADE_REQUIREMENT.
  test('15519: should confirm the inactivation as a draft and promise no cascade to plans and policies', async ({
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

    await steps.step('It states the draft caveat and promises no cascade', async () => {
      const warning = await payerInactivateDialog.getWarningText();

      // Still required: the reader must know the change is only staged.
      expect(warning, 'the draft caveat').toContain(INACTIVATION_WARNING.draftCaveat);

      // WITHDRAWN. The sheet removed the cascade story outright and rewrote
      // this case to require the opposite promise, so a confirmation that
      // still offers to take the payer's plans and policies down with it is
      // now describing behaviour the product no longer claims to have. If this
      // fails, the message and the specification disagree - see
      // NO_CASCADE_REQUIREMENT for which is likely to be behind.
      const stillPromised = NO_CASCADE_REQUIREMENT.withdrawnPromises.filter((sentence) =>
        warning.includes(sentence));
      expect(
        stillPromised,
        `${NO_CASCADE_REQUIREMENT.why} The drawer still reads: "${warning}"`,
      ).toEqual([]);
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

  // Azure test case 15521
  test('15521: should confirm the reactivation as a draft without promising a restoration', async ({
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

    // UPDATED from change sheet 2026-09-27: the confirmation must explain the
    // status change and the draft, and must no longer promise to restore
    // cascaded records - the cascade story was removed outright.
    await steps.step('The Reactivate confirmation states the draft, not a restoration', async () => {
      const dialog = await payerManagementPage.openActivationPrompt(candidate.payerName);
      const message = await dialog.getMessage();
      expect(message, 'the draft caveat').toContain(REACTIVATION_MESSAGE.draftCaveat);
      const stillPromised = NO_CASCADE_REQUIREMENT.withdrawnPromises.filter((sentence) =>
        message.includes(sentence));
      expect(
        stillPromised,
        `${NO_CASCADE_REQUIREMENT.why} The dialog still reads: "${message}"`,
      ).toEqual([]);
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

  // Azure test case 15524
  test('15524: should inactivate the linked plans and policies when the payer is inactivated', async ({
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

  // Azure test case 15525
  test('15525: should restore the cascaded plans and policies when the payer is reactivated', async ({
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

  // Azure test case 15527
  test('15527: should carry the payer through the full cycle without cascading at any stage', async ({
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

/**
 * Added by change sheet 2026-09-27, and the positive statement of the same
 * change the updated confirmation cases make: the cascade is gone, so a payer's
 * plans and policies must survive its inactivation untouched.
 */
test.describe('Inactivation and reactivation effects - plans and policies are left alone', () => {
  test('16461: should leave every linked plan and policy Active when the payer is inactivated', async ({
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
    let plansBefore: { name: string; status: string }[] = [];
    let policiesBefore: { name: string; status: string }[] = [];

    await steps.critical('Find an Active payer holding active plans and policies', async () => {
      candidate = await payerWithActiveDependents();
      plansBefore = await planManagementPage.getPlansOfPayer(candidate.payerName);
      policiesBefore = await policyManagementPage.getPoliciesOfPayer(candidate.payerName);
      expect(
        plansBefore.length + policiesBefore.length,
        'the case needs a payer with something that COULD cascade, or it proves nothing',
      ).toBeGreaterThan(0);
    });

    await steps.critical('Inactivate the payer, through approval', async () => {
      await payerManagementPage.open();
      await payerManagementPage.inactivateRow(candidate.payerName);
      await payerInactivateDialog.inactivateWithFirstReason('Checking nothing cascades.');
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(candidate.payerName);
      await approvalManagementPage.open();
      await approvalManagementPage.approve(candidate.payerName);
      await payerManagementPage.open();
      await payerManagementPage.search(candidate.payerName);
      await payerManagementPage.expectLifecycleStatus(
        candidate.payerName,
        LIFECYCLE_STATUS.inactive.en,
      );
    });

    // THE WHOLE POINT. Until this sheet the opposite was required - the payer's
    // records were supposed to go down with it, and story 14213 existed to say
    // so. That story is now Removed and this case states the replacement rule.
    // A failure here means the cascade is still wired up in the product.
    await steps.step('Every plan it held is still Active', async () => {
      const after = await planManagementPage.getPlansOfPayer(candidate.payerName);
      const moved = after
        .filter((plan) => plan.status !== LIFECYCLE_STATUS.active.en)
        .map((plan) => `${plan.name} -> ${plan.status}`);
      expect(
        moved,
        `inactivating "${candidate.payerName}" must not touch its plans; these moved: `
          + `${moved.join('; ')}`,
      ).toEqual([]);
    });

    await steps.step('And every policy it held is still Active', async () => {
      const after = await policyManagementPage.getPoliciesOfPayer(candidate.payerName);
      const moved = after
        .filter((policy) => policy.status !== LIFECYCLE_STATUS.active.en)
        .map((policy) => `${policy.name} -> ${policy.status}`);
      expect(
        moved,
        `inactivating "${candidate.payerName}" must not touch its policies; these moved: `
          + `${moved.join('; ')}`,
      ).toEqual([]);
    });
  });
});
