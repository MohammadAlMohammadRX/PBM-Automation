import { test, expect } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import {
  APPROVAL_CELL,
  RESTRICTED_ROLE_REQUIREMENT,
  SUBMISSION_TOAST,
} from '../../../data/payers/submissionToast.data';

/**
 * User story: Confirm a Submission with a Bilingual Toast.
 * The cases where a toast must NOT appear.
 *
 * A confirmation that shows up when nothing was confirmed is worse than one
 * that never shows up at all, so these three matter as much as the happy path:
 * a payer that is already pending, a submission the server refuses, and a user
 * who is not allowed to submit.
 */
test.describe('Bilingual submission toast - No false confirmations', () => {
  test('TC-002: should show no success toast when the payer cannot be submitted', async ({
    payerManagementPage,
    toast,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and submit a draft change', async () => {
      await payerManagementPage.open();
      await payerManagementPage.editTextFieldAndSave(
        publishedPayer.nameEn,
        'License Number',
        'LIC-NOFALSE',
      );
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.sendRowForApproval(publishedPayer.nameEn);
      await payerManagementPage.dialog().confirm('Send for Approval');
      await toast.expectText(SUBMISSION_TOAST.en);
    });

    await steps.critical('The payer is now Pending Approval', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        APPROVAL_CELL.en.pending,
      );
    });

    await steps.step('A second submission cannot be started', async () => {
      // Blocked by withholding the action, so the "pending approval exists"
      // message the sheet expects has nowhere to appear - the same pattern the
      // withdrawal story reports. What matters HERE is the consequence: no
      // second confirmation toast, because there is no second submission.
      await payerManagementPage.expectRowActionUnavailable(
        publishedPayer.nameEn,
        'submit-for-approval',
      );
    });

    await steps.step('And no success toast is shown for a submission that never happened', async () => {
      await toast.expectNone();
    });
  });

  test('TC-006: should report an error and leave the payer in Draft when the submission fails', async ({
    page,
    payerManagementPage,
    toast,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module with a payer holding a draft change', async () => {
      await payerManagementPage.open();
      await payerManagementPage.editTextFieldAndSave(
        publishedPayer.nameEn,
        'License Number',
        'LIC-FAILPATH',
      );
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        APPROVAL_CELL.en.draft,
      );
    });

    await steps.critical('A server failure is armed for the next submission', async () => {
      // Fault injection on ONE endpoint, not on everything: blanket-failing
      // requests would break the navigation that reaches the row and prove
      // nothing about the submission's own error handling.
      await NetworkUtils.failEndpoint(page, ApiEndpoints.payerSubmit);
    });

    await steps.step('The submission fails and no success confirmation is shown', async () => {
      await payerManagementPage.sendRowForApproval(publishedPayer.nameEn);
      await payerManagementPage.dialog().confirm('Send for Approval').catch(() => undefined);
      const text = await toast.waitForText().catch(() => null);
      expect(
        text?.summary ?? '',
        'a failed submission must not report success',
      ).not.toBe(SUBMISSION_TOAST.en.summary);
    });

    await steps.step('An error is reported to the user instead', async () => {
      const text = await toast.waitForText().catch(() => null);
      expect(
        text,
        'the user should be told the submission failed, not left guessing',
      ).not.toBeNull();
    });

    await steps.step('The payer is still a Draft, with nothing submitted', async () => {
      await NetworkUtils.restore(page);
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        APPROVAL_CELL.en.draft,
      );
    });
  });
});

/** Access control, signed out of the shared administrator session. */
test.describe('Bilingual submission toast - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('TC-009: should withhold Send for Approval from a user without submission rights', async ({
    loginPage,
    payerManagementPage,
    steps,
  }) => {
    if (!env.nonAdminUsername || !env.nonAdminPassword) {
      steps.blocked(
        `NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD are not configured in .env. ${
          RESTRICTED_ROLE_REQUIREMENT.reason
        } Set them to an account holding ${RESTRICTED_ROLE_REQUIREMENT.role}, then re-run this `
          + 'case.',
      );
    }

    let payerName!: string;

    await steps.critical('Open the payer list as the restricted user', async () => {
      await loginPage.open();
      await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
      await payerManagementPage.navigate();
      await payerManagementPage.expectRowsRendered();
    });

    await steps.critical('A payer with a draft change is on screen', async () => {
      const found = await payerManagementPage.findPayerWithApprovalStatus(APPROVAL_CELL.en.draft);
      payerName = found.name;
      expect(payerName, 'the list should hold a draft payer to look at').not.toBe('');
    });

    await steps.step('Send for Approval is withheld from this role', () =>
      payerManagementPage
        .expectRowActionUnavailable(payerName, 'submit-for-approval')
        .then((refusal) => {
          expect(refusal, 'the action should be absent or disabled, not usable').not.toBe(
            'available',
          );
        }));
  });
});
