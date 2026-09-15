import { test, expect } from '../../../fixtures';
import type { PayerData } from '../../../data/payers/payerTypes';
import { buildUniquePayer } from '../../../data/payers/payer.data';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import { APPROVAL_STATE } from '../../../data/payers/withdrawApproval.data';
import { effectiveDate } from '../../../data/payers/effectiveDateRules.data';
import { expiryDate } from '../../../data/payers/expiryDateRules.data';
import { BLOCKED_CASES, EXPIRY_TOMORROW_DAYS } from '../../../data/payers/autoExpiry.data';

/**
 * User story: Automatically Transition Payer Status to Expired.
 *
 * The job cannot be triggered from here, so every case that needs it to run is
 * BLOCKED on a trigger. What runs is the job's negative space on the day: a
 * payer whose ExpiryDate is tomorrow is Active and stays Active today, and a
 * payer with no ExpiryDate cannot come to exist. The "expires today" boundary
 * is BLOCKED too - the form refuses an expiry of today (see autoExpiry.data).
 */
test.describe('Automatic expiry - what holds before the job runs', () => {
  test('TC-003: should keep an Active payer Active when its ExpiryDate is tomorrow', async ({
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

  test('TC-013: should never expire a payer without an ExpiryDate because none can be saved', async ({
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
    test(`TC-${blocked.id}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
