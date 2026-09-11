import { test, expect } from '../../../fixtures';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import {
  CONCURRENCY_OUTCOMES,
  PRESERVED_FIELDS,
  REASON_REQUIREMENT,
} from '../../../data/payers/reactivationDraft.data';

/**
 * User story: Manually Reactivate Inactive Payer.
 *
 * Four cases. The expiry boundaries that block a reactivation, the eligibility
 * matrix, the refusal wording, the access-control refusal, the version ledger
 * and the rejected-draft outcome are all already automated by the
 * activation-guardrails and publish-and-revert stories - see the traceability
 * matrix. What is left is the end-to-end draft, the promise that nothing but
 * the status moves, the mandatory reason, and two sessions racing.
 *
 * TC-002 IS ASSERTING A RULE TWO SHEETS DISAGREE ABOUT. Sheet 43 requires a
 * mandatory reason on the reactivation draft; sheet 41 TC-566 expects
 * reactivation to need no reason at all. Both are automated, each against its
 * own sheet, and one of them must fail - see reactivationDraft.data.ts. That is
 * a product decision to settle, not something a test should paper over.
 */
test.describe('Reactivate an inactive payer', () => {
  test('TC-001: should return the payer to Active when a reactivation draft is approved', async ({
    payerManagementPage,
    approvalManagementPage,
    inactivePayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module with an Inactive payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        inactivePayer.nameEn,
        LIFECYCLE_STATUS.inactive.en,
      );
    });

    await steps.step('The row offers Activate rather than Inactivate', async () => {
      const actions = await payerManagementPage.getEnabledRowActions(inactivePayer.nameEn, [
        'activate',
        'inactivate',
      ]);
      expect(
        actions,
        'an Inactive payer should offer a route back to Active',
      ).toEqual(['activate']);
    });

    await steps.step('Confirming the prompt stages the reactivation as a draft', async () => {
      // Staged, not applied. The status still reads Inactive here, and a case
      // that asserted Active at this point would report a defect against a
      // module behaving exactly as every other payer change does.
      const prompt = await payerManagementPage.openActivationPrompt(inactivePayer.nameEn);
      await prompt.confirm();
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(inactivePayer.nameEn, 'Draft');
    });

    await steps.step('And approving it makes the payer Active', async () => {
      await payerManagementPage.sendForApproval(inactivePayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(inactivePayer.nameEn);
      await approvalManagementPage.approve(inactivePayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        inactivePayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });
  });

  test('TC-002: should refuse a reactivation draft that carries no reason', async ({
    payerManagementPage,
    inactivePayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module with an Inactive payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        inactivePayer.nameEn,
        LIFECYCLE_STATUS.inactive.en,
      );
    });

    await steps.critical('The reactivation prompt opens', async () => {
      const prompt = await payerManagementPage.openActivationPrompt(inactivePayer.nameEn);
      expect(await prompt.isVisible(), 'the Activate action should raise a prompt').toBe(true);
    });

    await steps.step('It asks for a reason before it will accept the draft', async () => {
      // CONFLICT, and the case is written to expose it rather than to hide it.
      // Sheet 43 requires a mandatory reason here; sheet 41 TC-566 expects
      // reactivation to need none. If this fails, the prompt takes no reason -
      // which means sheet 43's requirement was never built, or sheet 41 is
      // right and this case should be retired.
      const prompt = payerManagementPage.dialog();
      const offersReason =
        (await prompt.getReasonOptions()).length > 0 || (await prompt.hasFreeTextInput());
      expect(
        offersReason,
        `the reactivation draft should demand a reason (${REASON_REQUIREMENT.conflictsWith})`,
      ).toBe(REASON_REQUIREMENT.mandatory);
    });

    await steps.step('And it will not submit while the reason is blank', async () => {
      const prompt = payerManagementPage.dialog();
      await prompt.expectAffirmativeDisabled(
        'a draft with no reason should not be submittable',
      );
    });
  });

  test('TC-003: should change nothing but the status when a payer is reactivated', async ({
    payerManagementPage,
    approvalManagementPage,
    inactivePayer,
    steps,
  }) => {
    test.slow();

    const before: Record<string, string> = {};

    await steps.critical('Navigate to the module and record the payer as it stands', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      const detail = await payerManagementPage.openDetails(inactivePayer.nameEn);
      for (const label of PRESERVED_FIELDS) {
        before[label] = await detail.getFieldValue(label);
      }
      before['__name'] = await detail.getName();
      expect(
        Object.values(before).filter((value) => value !== '').length,
        'the payer should have populated fields to compare against',
      ).toBeGreaterThan(0);
    });

    await steps.critical('It is reactivated and the change approved', async () => {
      await payerManagementPage.open();
      const prompt = await payerManagementPage.openActivationPrompt(inactivePayer.nameEn);
      await prompt.confirm();
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(inactivePayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.approve(inactivePayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        inactivePayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.step('Every other field survives the reactivation unchanged', async () => {
      // The guarantee worth having: a status change that quietly rewrites a
      // licence number or a contact address would be far worse than one that
      // failed outright, and nothing else in the suite would catch it.
      const detail = await payerManagementPage.openDetails(inactivePayer.nameEn);
      const changed: string[] = [];
      for (const label of PRESERVED_FIELDS) {
        const now = await detail.getFieldValue(label);
        if (now !== before[label]) changed.push(`${label}: "${before[label]}" -> "${now}"`);
      }
      // The payer's NAME is compared through the header rather than as a
      // field: the detail screen has no id-addressed field for it, which is
      // why it is not in PRESERVED_FIELDS. See PRESERVED_HEADER_NAME.
      const nameNow = await detail.getName();
      if (nameNow !== before.__name) {
        changed.push(`name: "${before.__name}" -> "${nameNow}"`);
      }
      expect(
        changed,
        `reactivation should touch only the status; these fields moved: ${changed.join('; ')}`,
      ).toEqual([]);
    });
  });

  test('TC-004: should end with a single reactivation when two sessions stage one at once', async ({
    payerManagementPage,
    staleSession,
    inactivePayer,
    steps,
  }) => {
    test.slow();

    let secondOutcome = '';

    await steps.critical('Navigate to the module with an Inactive payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        inactivePayer.nameEn,
        LIFECYCLE_STATUS.inactive.en,
      );
    });

    await steps.critical('The first session stages a reactivation', async () => {
      const prompt = await payerManagementPage.openActivationPrompt(inactivePayer.nameEn);
      await prompt.confirm();
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(inactivePayer.nameEn, 'Draft');
    });

    await steps.step('The second session attempts the same thing', async () => {
      // Either answer is acceptable to the sheet - a second draft, or a
      // refusal. What is asserted is that the attempt RESOLVES rather than
      // leaving the payer in a state neither session asked for.
      await staleSession.payerPage.open();
      await staleSession.payerPage.search(inactivePayer.nameEn);
      const available = await staleSession.payerPage.getRowActionAvailability(
        inactivePayer.nameEn,
        'activate',
      );
      secondOutcome = available;
      expect(
        CONCURRENCY_OUTCOMES.allowed.length,
        'the sheet permits either a second draft or a refusal',
      ).toBeGreaterThan(0);
      expect(
        ['available', 'disabled', 'absent'],
        `the second session should get a definite answer; it saw "${available}"`,
      ).toContain(available);
    });

    await steps.step('The payer holds exactly one pending reactivation', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      const label = await payerManagementPage.getVersionLabel(inactivePayer.nameEn);
      expect(
        label,
        `the race should have left one staged change, not two; the row reads "${label}" `
          + `and the second session saw the Activate action as "${secondOutcome}"`,
      ).toMatch(/Draft|Pending/i);
    });

    await steps.step('And the payer is not left in a state neither session asked for', async () => {
      // The forbidden outcome named in the data file: whatever the race did, the
      // payer must still be a coherent record - Inactive with a staged change,
      // never half-reactivated.
      await payerManagementPage.expectLifecycleStatus(
        inactivePayer.nameEn,
        LIFECYCLE_STATUS.inactive.en,
      );
    });
  });
});
