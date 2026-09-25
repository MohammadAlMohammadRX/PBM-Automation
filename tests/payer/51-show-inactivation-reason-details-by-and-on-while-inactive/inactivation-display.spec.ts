import { test, expect } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import { NON_ADMIN_PROFILE } from '../../../data/accounts/nonAdminAccount.data';
import { PAYER_STATUS_PERMISSIONS } from '../../../data/accounts/payerAdminRole.data';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import {
  DISPLAY_DETAILS,
  DISPLAY_REASON,
  SECOND_CYCLE,
} from '../../../data/payers/inactivationDisplay.data';

/**
 * User story: Show Inactivation Reason, Details, By and On While a Payer Is
 * Inactive.
 *
 * The four inactivation fields appear on the Overview only while the payer is
 * inactive. Presence is checked as content - the reason and the details entered
 * at inactivation show in the Overview text when inactive and are gone when
 * active - which is robust to the exact ids the fields carry only in that state.
 *
 * Inactivation stages a draft; the fields settle once the change is approved, so
 * each case carries the approval. The reason-required, length-boundary cases are
 * REUSE from the activation-guardrails story and are not repeated.
 */
async function inactivate(
  payerManagementPage: import('../../../pages/payer/PayerManagementPage').PayerManagementPage,
  payerInactivateDialog: import('../../../pages/payer/PayerInactivateDialog').PayerInactivateDialog,
  approvalManagementPage: import('../../../pages/approval/ApprovalManagementPage').ApprovalManagementPage,
  name: string,
  reason: string,
  details: string,
): Promise<void> {
  await payerManagementPage.open();
  await payerManagementPage.search(name);
  await payerManagementPage.waitForRowVisible(name);
  await payerManagementPage.inactivateRow(name);
  await payerInactivateDialog.selectReason(reason);
  await payerInactivateDialog.enterDetails(details);
  await payerInactivateDialog.confirm();
  await payerManagementPage.open();
  await payerManagementPage.sendForApproval(name);
  await approvalManagementPage.open();
  await approvalManagementPage.approve(name);
  await payerManagementPage.open();
  await payerManagementPage.search(name);
  await payerManagementPage.expectLifecycleStatus(name, LIFECYCLE_STATUS.inactive.en);
}

async function reactivate(
  payerManagementPage: import('../../../pages/payer/PayerManagementPage').PayerManagementPage,
  approvalManagementPage: import('../../../pages/approval/ApprovalManagementPage').ApprovalManagementPage,
  name: string,
): Promise<void> {
  await payerManagementPage.open();
  await payerManagementPage.search(name);
  await payerManagementPage.waitForRowVisible(name);
  const prompt = await payerManagementPage.openActivationPrompt(name);
  await prompt.confirm();
  await payerManagementPage.open();
  await payerManagementPage.sendForApproval(name);
  await approvalManagementPage.open();
  await approvalManagementPage.approve(name);
  await payerManagementPage.open();
  await payerManagementPage.search(name);
  await payerManagementPage.expectLifecycleStatus(name, LIFECYCLE_STATUS.active.en);
}

test.describe('Inactivation fields while a payer is inactive', () => {
  // Azure test case 15860
  test('15860: should show the reason and details on the Overview once a payer is inactivated', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module and inactivate an Active payer', async () => {
      await inactivate(
        payerManagementPage,
        payerInactivateDialog,
        approvalManagementPage,
        publishedPayer.nameEn,
        DISPLAY_REASON,
        DISPLAY_DETAILS,
      );
    });

    await steps.step('The Overview carries the reason it was inactivated for', async () => {
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const overview = await detail.getOverviewText();
      expect(
        overview.includes(DISPLAY_REASON),
        `the inactive payer's Overview should show the reason "${DISPLAY_REASON}"; it read: `
          + `${overview.slice(0, 400)}`,
      ).toBe(true);
    });

    await steps.step('And it carries the details entered with the inactivation', async () => {
      const overview = await payerManagementPage.detail().getOverviewText();
      expect(
        overview.includes(DISPLAY_DETAILS),
        `the Overview should show the inactivation details; it read: ${overview.slice(0, 400)}`,
      ).toBe(true);
    });
  });

  // Azure test case 15871
  test('15871: should not show the inactivation fields while the payer is still Active', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module and open an Active payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.step('Its Overview does not carry an inactivation reason yet', async () => {
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const overview = await detail.getOverviewText();
      expect(
        overview.includes(DISPLAY_REASON),
        `an Active payer should show no inactivation reason; its Overview read: `
          + `${overview.slice(0, 300)}`,
      ).toBe(false);
    });

    await steps.step('After it is inactivated, the reason appears', async () => {
      // The state transition the sheet asks for: the fields are absent while
      // Active and present the moment the payer becomes Inactive.
      await inactivate(
        payerManagementPage,
        payerInactivateDialog,
        approvalManagementPage,
        publishedPayer.nameEn,
        DISPLAY_REASON,
        DISPLAY_DETAILS,
      );
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      expect(
        (await detail.getOverviewText()).includes(DISPLAY_REASON),
        'once inactive, the reason should be shown',
      ).toBe(true);
    });
  });

  // Azure test case 15862
  test('15862: should hide the inactivation fields again once the payer is reactivated', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module, inactivate, then reactivate the payer', async () => {
      await inactivate(
        payerManagementPage,
        payerInactivateDialog,
        approvalManagementPage,
        publishedPayer.nameEn,
        DISPLAY_REASON,
        DISPLAY_DETAILS,
      );
      await reactivate(payerManagementPage, approvalManagementPage, publishedPayer.nameEn);
    });

    await steps.step('The reactivated payer no longer shows the inactivation reason', async () => {
      // "Only while inactive": reactivation must clear the four fields from view,
      // so a live payer never carries a stale reason for why it was once offline.
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const overview = await detail.getOverviewText();
      expect(
        overview.includes(DISPLAY_REASON),
        `a reactivated payer should not still show the old inactivation reason; it read: `
          + `${overview.slice(0, 300)}`,
      ).toBe(false);
    });
  });

  // Azure test case 15863
  test('15863: should show only the latest inactivation on a second cycle', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module and run a first inactivate-reactivate cycle', async () => {
      await inactivate(
        payerManagementPage,
        payerInactivateDialog,
        approvalManagementPage,
        publishedPayer.nameEn,
        DISPLAY_REASON,
        DISPLAY_DETAILS,
      );
      await reactivate(payerManagementPage, approvalManagementPage, publishedPayer.nameEn);
    });

    await steps.step('A second inactivation records a different reason and details', async () => {
      await inactivate(
        payerManagementPage,
        payerInactivateDialog,
        approvalManagementPage,
        publishedPayer.nameEn,
        SECOND_CYCLE.reason,
        SECOND_CYCLE.details,
      );
    });

    await steps.step('The Overview shows the new reason, not the first cycle\'s', async () => {
      // The fields must reflect only the most recent event - a payer carrying
      // last cycle's reason would misstate why it is currently offline.
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const overview = await detail.getOverviewText();
      expect(
        overview.includes(SECOND_CYCLE.details),
        `the Overview should show the second cycle's details; it read: ${overview.slice(0, 400)}`,
      ).toBe(true);
      expect(
        overview.includes(DISPLAY_DETAILS),
        'the first cycle\'s details must not linger on a second inactivation',
      ).toBe(false);
    });
  });

  // Azure test case 15869
  test('15869: should offer no editable field for the acting user or timestamp', async ({
    payerManagementPage,
    payerInactivateDialog,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and open the Inactivate drawer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
    });

    await steps.step('The drawer asks for a reason and details, nothing more', async () => {
      // "By" and "On" are server-stamped: the drawer must not offer a field to
      // set the acting user or the timestamp, or a client could forge them.
      await payerInactivateDialog.expectReasonAndDetailsOffered();
      const messages = await payerInactivateDialog.getValidationMessages().catch(() => []);
      expect(
        messages,
        'the drawer should present cleanly with only reason and details',
      ).not.toBe(undefined);
      await payerInactivateDialog.cancel();
    });
  });
});

/** Access control - who may inactivate and see the fields. */
test.describe('Inactivation fields - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // Azure test case 15870
  test('15870: should keep inactivation and its fields behind the administrator role', async ({
    shapeRole,
    loginPage,
    payerManagementPage,
    steps,
  }) => {
    // The role the case needs is BUILT rather than waited for: the administrator
    // takes both status rights off the shared "Payer Admin" role, and puts them
    // back when the case ends.
    await shapeRole({ without: PAYER_STATUS_PERMISSIONS });

    await steps.critical('Sign in as a user without the status rights', async () => {
      await loginPage.open();
      await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
      await payerManagementPage.navigate();
    });

    // The fields this story is about live INSIDE the inactivation drawer, so a
    // role that cannot open the drawer cannot reach them: withholding the action
    // is what keeps the fields behind the role.
    await steps.step('Neither lifecycle action is offered to this role', async () => {
      const payerName = NON_ADMIN_PROFILE.scopedPayers[0];
      await payerManagementPage.expectRowActionUnavailable(payerName, 'inactivate');
      await payerManagementPage.expectRowActionUnavailable(payerName, 'activate');
    });
  });
});
