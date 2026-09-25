import { test, expect } from '../../../fixtures';
import { azureOrCase } from '../../../data/azureTestIds.data';
import type { PayerManagementPage } from '../../../pages/payer/PayerManagementPage';
import type { PayerData } from '../../../data/payers/payerTypes';
import { buildUniquePayer } from '../../../data/payers/payer.data';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import { APPROVAL_STATE } from '../../../data/payers/withdrawApproval.data';
import { effectiveDate } from '../../../data/payers/effectiveDateRules.data';
import { expiryDate } from '../../../data/payers/expiryDateRules.data';
import {
/**
 * MOVED TO MANUAL TESTING.
 *
 * This story is verified by hand, so every case below is skipped and carries
 * [MANUAL] at its name. Nothing is deleted: the cases still record what each
 * check is, and the story returns to automation by removing the `.skip` on
 * the describes.
 *
 * WHY IT SUITS A MANUAL PASS.
 * The transition is performed by the nightly lifecycle job (CRON 15 0 * * *
 * UTC). This suite can neither trigger it nor move the clock, so a record has
 * to be created today and read tomorrow - a calendar wait rather than a test
 * step. The application also exposes no job-run log, so "it did not run" and
 * "it ran and did nothing" look identical on screen.
 *
 * `npm run seed:status` plants payers whose dates lapse within a day and
 * `npm run check:status` reports what became of them. Seed today, read
 * tomorrow.
 */

  BLOCKED_CASES,
  FUTURE_EFFECTIVE_DAYS,
  SAFE_EXPIRY_DAYS,
  TRANSITION_ENTRY,
} from '../../../data/payers/autoActivation.data';

/**
 * User story: Automatically Transition Payer Status to Active.
 *
 * The job cannot be triggered from here, so every case that needs it to run is
 * BLOCKED on a trigger. What runs is the job's precondition and negative space:
 * a future-dated payer is Pending and stays Pending before the job, and a payer
 * with no EffectiveDate cannot come to exist.
 */
type Publish = (overrides?: Partial<PayerData>) => Promise<PayerData>;

/** Publishes a payer whose EffectiveDate has not arrived and confirms it is live. */
async function publishFutureDatedPayer(
  publishPayer: Publish,
  payerManagementPage: PayerManagementPage,
): Promise<PayerData> {
  const payer = await publishPayer({
    effectiveDate: effectiveDate(FUTURE_EFFECTIVE_DAYS),
    expiryDate: expiryDate(SAFE_EXPIRY_DAYS),
  });
  await payerManagementPage.open();
  await payerManagementPage.search(payer.nameEn);
  await payerManagementPage.expectApprovalStatusContains(payer.nameEn, APPROVAL_STATE.published);
  return payer;
}

test.describe.skip('Automatic activation - what holds before the job runs [MANUAL]', () => {
  // Azure test case 14668
  test('14668: [MANUAL] should keep a Pending payer Pending when its EffectiveDate is still in the future', async ({
    payerManagementPage,
    publishPayer,
    steps,
  }) => {
    test.slow();
    let payer: PayerData | null = null;

    await steps.critical('Navigate to the module and approve a payer effective tomorrow', async () => {
      payer = await publishFutureDatedPayer(publishPayer, payerManagementPage);
    });

    await steps.step('The payer is Pending, not Active', async () => {
      await payerManagementPage.expectLifecycleStatus((payer as PayerData).nameEn, LIFECYCLE_STATUS.pending.en);
    });

    await steps.step('No status-change entry has been written', async () => {
      const detail = await payerManagementPage.openDetails((payer as PayerData).nameEn);
      const audit = detail.auditHistory();
      await audit.open();
      const transitions = (await audit.getEntries()).filter((entry) => TRANSITION_ENTRY.test(entry.action));
      expect(transitions, 'a future-dated payer must not have been transitioned').toEqual([]);
    });
  });

  test('TC-011: [MANUAL] should never activate a payer without an EffectiveDate because none can be saved', async ({
    payerManagementPage,
    steps,
  }) => {
    const payer = buildUniquePayer();

    await steps.critical('Navigate to the module and try to save a payer with no EffectiveDate', async () => {
      await payerManagementPage.open();
      const form = await payerManagementPage.openCreateForm();
      await form.fillBasicInformation(payer);
      await form.clickNext();
      await form.fillContactInformation(payer);
      await form.clickNext();
      await form.fillEffectivePeriod(payer, 'Effective Date');
      const outcome = await form.saveNewAndCaptureOutcome();
      // Refused client-side (no request) or by the server (4xx): either way
      // the null-EffectiveDate payer the sheet worries about cannot exist.
      expect(
        outcome === null || outcome.status >= 400,
        `a payer without an EffectiveDate must be refused; the server answered ${outcome?.status ?? 'nothing'}`,
      ).toBe(true);
      expect(await form.isOpen(), 'the form should hold the save').toBe(true);
      await form.closeAndDiscard();
    });

    await steps.step('No such payer exists on the register', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(payer.nameEn);
      await payerManagementPage.expectRowNotVisible(payer.nameEn);
    });
  });

  test('TC-013: [MANUAL] should show a Pending status in the interface until the automated job actually runs', async ({
    payerManagementPage,
    publishPayer,
    steps,
  }) => {
    test.slow();
    let payer: PayerData | null = null;

    await steps.critical('Navigate to the module and approve a payer whose effective date has not arrived', async () => {
      payer = await publishFutureDatedPayer(publishPayer, payerManagementPage);
    });

    await steps.step('The list and the details both read Pending', async () => {
      const name = (payer as PayerData).nameEn;
      await payerManagementPage.expectLifecycleStatus(name, LIFECYCLE_STATUS.pending.en);
      const detail = await payerManagementPage.openDetails(name);
      expect(await detail.getStatusTone(), 'the detail badge should not read as active').not.toBe('active');
    });
  });

  for (const blocked of BLOCKED_CASES) {
    // Azure test cases - one per generated case:
    //   TC-001 = 14662,  TC-002 = 14665,  TC-004 = 14673
    //   TC-006 = 14677,  TC-008 = 14674,  TC-009 = 14678
    //   TC-010 = 14681,  TC-012 = 14688
    test(`${azureOrCase('74', 'TC-' + blocked.id)}: [MANUAL] ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
