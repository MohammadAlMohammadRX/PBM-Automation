import { test, expect } from '../../../fixtures';
import { azureOrCase } from '../../../data/azureTestIds.data';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import { BLOCKED_CASES } from '../../../data/payers/breExpiry.data';

/**
 * MOVED TO MANUAL TESTING.
 *
 * This story is verified by hand, so every case below is skipped and carries
 * [MANUAL] at its name. Nothing is deleted: the cases still record what each
 * check is, and the story returns to automation by removing the `.skip` on
 * the describes.
 *
 * WHY IT SUITS A MANUAL PASS.
 * The outcome lives in the Business Rules Engine, which this suite cannot
 * reach: the payer module shows no BRE state, and there is no screen on which
 * a validity decision can be read back. The cases also turn on an expiry
 * passing, so they need a calendar wait on top of a module we cannot see.
 *
 * A manual pass needs someone with BRE visibility, checking a payer before and
 * after its expiry date passes.
 */

/**
 * User story: Stop Payer Validity in BRE on Expiry.
 *
 * The BRE and claims halves have no interface here and are BLOCKED. The payer
 * module's own half - a payer that is not Active is not offered where records
 * are created against a payer - runs through the shared cross-module payer
 * selection, with an approved Inactive payer standing in for the Expired one
 * this environment cannot produce (see breExpiry.data.ts).
 */
test.describe.skip('Payer validity on expiry - the payer module\'s half [MANUAL]', () => {
  // Azure test case 15008
  test('15008: [MANUAL] should not offer a non-Active payer when a new record is created against a payer', async ({
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

  // Azure test case 15011
  test('15011: [MANUAL] should offer an Active payer when a new record is created against a payer', async ({
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
    // Azure test cases - one per generated case:
    //   TC-001 = 15005,  TC-002 = 15006,  TC-005 = 15013
    //   TC-007 = 15014,  TC-010 = 15016,  TC-012 = 15021
    //   TC-013 = 15022,  TC-014 = 15028,  TC-016 = 15019
    test(`${azureOrCase('61', 'TC-' + blocked.id)}: [MANUAL] ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
