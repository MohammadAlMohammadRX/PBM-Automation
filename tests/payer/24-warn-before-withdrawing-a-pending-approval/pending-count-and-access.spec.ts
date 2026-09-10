import { test, expect } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import {
  APPROVAL_STATE,
  EDITED_FIELD,
  MAX_PENDING_REQUESTS,
  RESTRICTED_ROLE_REQUIREMENT,
} from '../../../data/payers/withdrawApproval.data';

/**
 * User story: Warn Before an Edit or Delete Withdraws a Pending Approval.
 * The pending-request ceiling, and access control.
 *
 * TC-005 asks the same question as TC-002 from the other side: not "is the
 * second submission refused" but "does the pending count stay at one". It is
 * kept separate because a build could fail one and pass the other - an action
 * that was offered and then silently created a second request would satisfy
 * TC-002's first step and break this.
 */
test.describe('Withdraw a pending approval - Pending-request ceiling', () => {
  test('TC-005: should hold the pending count at one when a second submission is attempted', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module with a payer holding a draft change', async () => {
      await payerManagementPage.open();
      await payerManagementPage.editTextFieldAndSave(
        publishedPayer.nameEn,
        EDITED_FIELD.label,
        EDITED_FIELD.first,
      );
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        APPROVAL_STATE.draft,
      );
    });

    await steps.step('The first submission succeeds and the count moves to one', async () => {
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
      // The POLLING helper, not a bare count: the queue's search is debounced,
      // so a count taken the instant after a submission can read the previous
      // result set. That is how this assertion failed once with the request
      // plainly in the queue.
      await approvalManagementPage.expectSingleQueuedRequest(publishedPayer.nameEn);
    });

    await steps.step('A second submission cannot be attempted', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectRowActionUnavailable(
        publishedPayer.nameEn,
        'submit-for-approval',
      );
    });

    await steps.step('The pending count is still exactly one', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectSingleQueuedRequest(publishedPayer.nameEn);
      expect(
        MAX_PENDING_REQUESTS,
        'the ceiling this story asserts is one pending request per payer',
      ).toBe(1);
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        APPROVAL_STATE.pending,
      );
    });
  });
});

/**
 * Access control, in its own describe because it signs out of the shared
 * administrator session.
 */
test.describe('Withdraw a pending approval - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('TC-011: should withhold edit and delete on a pending payer from an unauthorized user', async ({
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

    await steps.critical('A payer awaiting approval is on screen', async () => {
      const found = await payerManagementPage.findPayerWithApprovalStatus(APPROVAL_STATE.pending);
      payerName = found.name;
      expect(payerName, 'the queue should hold at least one pending payer to look at').not.toBe(
        '',
      );
    });

    await steps.step('The edit option is withheld from this role', () =>
      payerManagementPage
        .expectRowActionUnavailable(payerName, 'edit')
        .then((refusal) => {
          expect(refusal, 'edit should be absent or disabled, not usable').not.toBe('available');
        }));

    await steps.step('The delete option is withheld too', () =>
      payerManagementPage
        .expectRowActionUnavailable(payerName, 'delete')
        .then((refusal) => {
          expect(refusal, 'delete should be absent or disabled, not usable').not.toBe('available');
        }));
  });
});
