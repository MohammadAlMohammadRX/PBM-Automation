import { test, expect } from '../../../fixtures';
import { PAYER_COLUMN } from '../../../constants/ElementIds';
import { env } from '../../../constants/EnvironmentConfig';
import { buildUniquePayer } from '../../../data/payers/payer.data';
import type { PayerFormDialog } from '../../../pages/payer/PayerFormDialog';
import {
  DUPLICATE_EMAIL_RESPONSE,
  RESTRICTED_ROLE_REQUIREMENT,
} from '../../../data/payers/payerEmailUniqueness.data';

/**
 * User story: Enforce Payer Email Uniqueness Across the Register.
 * Role-based access, and the exploratory hunt for a path around the check.
 */
test.describe('Enforce Payer Email Uniqueness - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('TC-009: should withhold the create and edit controls when the module is opened by a restricted role', async ({
    loginPage,
    payerManagementPage,
    steps,
  }) => {
    // BLOCKED, not FAIL: without a restricted account the withholding this case
    // exists to prove can never be exercised, so nothing would be learned about
    // the application.
    if (!env.nonAdminUsername || !env.nonAdminPassword) {
      steps.blocked(
        `NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD are not configured in .env. ${
          RESTRICTED_ROLE_REQUIREMENT.reason
        } Set them to an account holding the "${RESTRICTED_ROLE_REQUIREMENT.role}" role, then `
          + 're-run this case.',
      );
    }

    await steps.critical('Navigate to the Payer Management module', async () => {
      await loginPage.open();
      await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
      await payerManagementPage.navigate();
    });

    await steps.step('The list opens read-only for this role', () =>
      payerManagementPage.expectSearchAccessRestricted());

    await steps.step('The Add New Payer control is withheld', () =>
      payerManagementPage.expectCreateActionDenied());

    await steps.step('The Edit control is withheld on every row', () =>
      payerManagementPage.expectEditActionDenied());
  });
});

test.describe('Enforce Payer Email Uniqueness - Bypass exploration', () => {
  test('TC-010: should enforce the check on every creation path when alternative routes are explored', async ({
    payerManagementPage,
    uniquePayer,
    steps,
  }) => {
    // EXPLORATORY, as the sheet frames it: look for any path that bypasses the
    // uniqueness check. What is asserted is the invariant that must hold on
    // whichever path is taken - exactly one payer ends up holding the address.
    //
    // The sheet's "different branch/unit" dimension does not exist here: payers
    // carry no branch or unit field, so there is no second scope in which the
    // same address could legitimately be reused. The routes explored are the
    // ones the application actually offers.
    const duplicate = buildUniquePayer({ email: uniquePayer.email });
    let form!: PayerFormDialog;

    await steps.critical('Navigate to the module with an existing payer on record', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
    });

    await steps.step('The wizard path refuses the reused address', async () => {
      await payerManagementPage.open();
      form = await payerManagementPage.openCreateForm();
      await form.fillBasicInformation(duplicate);
      await form.clickNext();
      await form.fillContactInformation(duplicate);
      await form.clickNext();
      await form.fillEffectivePeriod(duplicate);
      const outcome = await form.saveNewAndCaptureOutcome();
      expect(outcome!.status).toBe(DUPLICATE_EMAIL_RESPONSE.status);
      await form.closeAndDiscard();
    });

    // By NAME rather than by searching the address: the keyword search's
    // behaviour for an email was never verified, and it returns more than one
    // row - which would say nothing about how many payers hold the address.
    await steps.step('The refused attempt left no second record behind', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(duplicate.nameEn);
      await payerManagementPage.expectEmptyState();
    });

    await steps.step('The edit path also refuses to point a second payer at the address', async () => {
      const other = buildUniquePayer();
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(other);
      const editForm = await payerManagementPage.openEditForm(other.nameEn);
      await editForm.setFieldValue('Email Address', uniquePayer.email, 'text');
      const outcome = await editForm.saveAndCaptureOutcome();
      expect(outcome!.status).toBe(DUPLICATE_EMAIL_RESPONSE.status);
      await editForm.closeAndDiscard();
    });

    await steps.step('Exactly one payer holds the address after every attempt', async () => {
      await payerManagementPage.open();
      await payerManagementPage.expectRowCellEquals(
        uniquePayer.nameEn,
        PAYER_COLUMN.email,
        uniquePayer.email,
      );
    });
  });
});
