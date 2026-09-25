import { test, expect } from '../../../fixtures';
import { azureOrCase } from '../../../data/azureTestIds.data';
import type { PayerData } from '../../../data/payers/payerTypes';
import { buildUniquePayer } from '../../../data/payers/payer.data';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import { APPROVAL_STATE } from '../../../data/payers/withdrawApproval.data';
import { effectiveDate } from '../../../data/payers/effectiveDateRules.data';
import { expiryDate } from '../../../data/payers/expiryDateRules.data';
import { BLOCKED_CASES, EXPIRY_TOMORROW_DAYS } from '../../../data/payers/autoExpiry.data';

/**
 * MOVED TO MANUAL TESTING.
 *
 * This story is verified by hand, so every case below is skipped and carries
 * [MANUAL] at its name. Nothing is deleted: the cases still record what each
 * check is, and the story returns to automation by removing the `.skip` on
 * the describes.
 *
 * WHY IT SUITS A MANUAL PASS.
 * The same nightly job as the Active-transition story, and the same calendar
 * wait (CRON 15 0 * * * UTC). The expiry half of the job IS known to run: a
 * payer whose expiry fell on 13 September read Active on the 14th and Expired
 * by the 16th - so the scheduler works, it simply cannot be driven from here.
 *
 * `npm run seed:status` plants the records; `npm run check:status` reports on
 * them the next day.
 */

/**
 * User story: Automatically Transition Payer Status to Expired.
 *
 * The job cannot be triggered from here, so every case that needs it to run is
 * BLOCKED on a trigger. What runs is the job's negative space on the day: a
 * payer whose ExpiryDate is tomorrow is Active and stays Active today, and a
 * payer with no ExpiryDate cannot come to exist. The "expires today" boundary
 * is BLOCKED too - the form refuses an expiry of today (see autoExpiry.data).
 */
test.describe.skip('Automatic expiry - what holds before the job runs [MANUAL]', () => {
  // Azure test case 14722
  test('14722: [MANUAL] should keep an Active payer Active when its ExpiryDate is tomorrow', async ({
    payerManagementPage,
    publishPayer,
    steps,
  }) => {
    test.slow();
    let payer: PayerData | null = null;

    await steps.critical('Navigate to the module and approve a payer expiring tomorrow', async () => {
      payer = await publishPayer({ effectiveDate: effectiveDate(0), expiryDate: expiryDate(EXPIRY_TOMORROW_DAYS) });
      await payerManagementPage.open();
      await payerManagementPage.search(payer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(payer.nameEn, APPROVAL_STATE.published);
    });

    await steps.step('The payer is Active', async () => {
      await payerManagementPage.expectLifecycleStatus((payer as PayerData).nameEn, LIFECYCLE_STATUS.active.en);
    });
  });

  // Azure test case 14743
  test('14743: [MANUAL] should never expire a payer without an ExpiryDate because none can be saved', async ({
    payerManagementPage,
    steps,
  }) => {
    const payer = buildUniquePayer();

    await steps.critical('Navigate to the module and try to save a payer with no ExpiryDate', async () => {
      await payerManagementPage.open();
      const form = await payerManagementPage.openCreateForm();
      await form.fillBasicInformation(payer);
      await form.clickNext();
      await form.fillContactInformation(payer);
      await form.clickNext();
      await form.fillEffectivePeriod(payer, 'Expiry Date');
      const outcome = await form.saveNewAndCaptureOutcome();
      expect(
        outcome === null || outcome.status >= 400,
        `a payer without an ExpiryDate must be refused; the server answered ${outcome?.status ?? 'nothing'}`,
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

  for (const blocked of BLOCKED_CASES) {
    // Azure test cases - one per generated case:
    //   TC-001 = 14718,  TC-002 = 14721,  TC-004 = 14726
    //   TC-005 = 14733,  TC-007 = 14728,  TC-008 = 14730
    //   TC-011 = 14735
    test(`${azureOrCase('75', 'TC-' + blocked.id)}: [MANUAL] ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
