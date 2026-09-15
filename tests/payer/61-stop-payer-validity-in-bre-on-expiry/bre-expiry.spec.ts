import { test, expect } from '../../../fixtures';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import { BLOCKED_CASES } from '../../../data/payers/breExpiry.data';

/**
 * User story: Stop Payer Validity in BRE on Expiry.
 *
 * The BRE and claims halves have no interface here and are BLOCKED. The payer
 * module's own half - a payer that is not Active is not offered where records
 * are created against a payer - runs through the shared cross-module payer
 * selection, with an approved Inactive payer standing in for the Expired one
 * this environment cannot produce (see breExpiry.data.ts).
 */
test.describe('Payer validity on expiry - the payer module\'s half', () => {
  test('TC-003: should not offer a non-Active payer when a new record is created against a payer', async ({
    payerManagementPage,
    planManagementPage,
    inactivePayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and confirm the payer is not Active', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        inactivePayer.nameEn,
        LIFECYCLE_STATUS.inactive.en,
      );
    });

    await steps.step('The create form\'s payer selection does not offer it', async () => {
      // The blocked-creation rule, at the point where creation starts: a
      // payer that is not live cannot even be chosen for a new record.
      await planManagementPage.openList();
      const dropdown = await planManagementPage.openCreateFormPayerField();
      await dropdown.expectExcludesPayerWhenFiltered(inactivePayer.nameEn);
      await dropdown.close();
    });
  });

  test('TC-004: should offer an Active payer when a new record is created against a payer', async ({
    payerManagementPage,
    planManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and confirm the payer is Active', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.step('The create form\'s payer selection offers it', async () => {
      await planManagementPage.openList();
      const dropdown = await planManagementPage.openCreateFormPayerField();
      await dropdown.expectOffersPayerWhenFiltered(publishedPayer.nameEn);
      await dropdown.close();
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.id}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
