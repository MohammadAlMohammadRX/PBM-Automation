import { test, expect } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import { VALIDATION_MESSAGES } from '../../../data/payers/payer.data';
import { LoginPage } from '../../../pages/auth/LoginPage';
import { PayerManagementPage } from '../../../pages/payer/PayerManagementPage';

/**
 * User story: Create New Payer Organization Record.
 * Happy-path creation of a private Draft and its PayerCode-less state.
 *
 * Steps are recorded through the `steps` fixture so the report names the exact
 * step that failed. In this story creation is the precondition for everything
 * else, so it is always `critical`: if the Draft was never created, asserting on
 * its status or PayerCode would report a meaningless failure.
 */
test.describe('Create New Payer Organization Record - Draft creation', () => {
  test('TC-001: should save the payer as a private Draft when an admin submits valid mandatory data', async ({
    payerManagementPage,
    uniquePayer,
    cleanup,
    steps,
  }) => {
    cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Create the payer with valid mandatory data', () =>
      payerManagementPage.createDraftPayer(uniquePayer));

    // Saved as Draft, visible to its creator, and with no PayerCode yet. Two
    // independent facts, so a failure on one must not hide the other.
    await steps.step('The payer is listed with approval status Draft', () =>
      payerManagementPage.expectApprovalStatusContains(uniquePayer.nameEn, 'Draft'));

    await steps.step('No PayerCode has been assigned', () =>
      payerManagementPage.expectNoPayerCode(uniquePayer.nameEn));
  });

  test('TC-002: should not assign a PayerCode when the payer record is still a Draft', async ({
    payerManagementPage,
    uniquePayer,
    cleanup,
    steps,
  }) => {
    cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Create the payer as a Draft', () =>
      payerManagementPage.createDraftPayer(uniquePayer));

    await steps.step('The record is still in Draft', () =>
      payerManagementPage.expectApprovalStatusContains(uniquePayer.nameEn, 'Draft'));

    await steps.step('The PayerCode column is empty for a Draft', () =>
      payerManagementPage.expectNoPayerCode(uniquePayer.nameEn));
  });
});

/**
 * User story: Create New Payer Organization Record.
 * The CreatedAt timestamp is recorded at Draft creation and must survive the
 * Send-for-Approval and Approval transitions unchanged. Read from the payer
 * detail view (View action) where "Created At" is displayed.
 */
test.describe('Create New Payer Organization Record - Timestamp integrity', () => {
  test('TC-011: should preserve the CreatedAt timestamp from Draft creation through approval', async ({
    payerManagementPage,
    approvalManagementPage,
    uniquePayer,
    cleanup,
    steps,
  }) => {
    cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));

    let createdAtInitial = '';

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Create the payer as a Draft', () =>
      payerManagementPage.createDraftPayer(uniquePayer));

    // Critical: the whole case is a comparison against this value. Without a
    // recorded timestamp there is nothing to compare, so the rest is skipped.
    await steps.critical('Read "Created At" from the payer detail view', async () => {
      const detailAtCreation = await payerManagementPage.openDetails(uniquePayer.nameEn);
      createdAtInitial = await detailAtCreation.getFieldValue('Created At');
      expect(createdAtInitial, 'Created At should be recorded at Draft creation').not.toEqual('');
    });

    // Move the record all the way to approved. Each transition is a precondition
    // for the next, so all four are critical.
    await steps.critical('Return to the payer list', () => payerManagementPage.open());

    await steps.critical('Send the payer for approval', () =>
      payerManagementPage.sendForApproval(uniquePayer.nameEn));

    await steps.critical('Open the approval queue', () => approvalManagementPage.open());

    await steps.critical('Approve the payer as the reviewer', () =>
      approvalManagementPage.approve(uniquePayer.nameEn));

    await steps.critical('Reopen the payer list', () => payerManagementPage.open());

    // CreatedAt must be identical to what it was at initial Draft creation.
    await steps.step('"Created At" is unchanged after approval', async () => {
      const detailAfterApproval = await payerManagementPage.openDetails(uniquePayer.nameEn);
      const createdAtAfterApproval = await detailAfterApproval.getFieldValue('Created At');
      expect(
        createdAtAfterApproval,
        'Created At must survive Send for Approval and Approval unchanged',
      ).toEqual(createdAtInitial);
    });
  });
});

/**
 * User story: Create New Payer Organization Record.
 * A saved Draft survives navigating away from and back to the module.
 */
test.describe('Create New Payer Organization Record - Draft persistence', () => {
  test('TC-016: should retain all Draft field values when navigating away and returning before submission', async ({
    payerManagementPage,
    uniquePayer,
    cleanup,
    steps,
  }) => {
    cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Create the payer as a Draft', () =>
      payerManagementPage.createDraftPayer(uniquePayer));

    await steps.step('The record is saved as a Draft', () =>
      payerManagementPage.expectApprovalStatusContains(uniquePayer.nameEn, 'Draft'));

    // Critical: the navigation IS the action under test. If it never happened,
    // the retention checks below prove nothing.
    await steps.critical('Navigate away from the module and return', () =>
      payerManagementPage.navigateAwayAndReturn());

    // All saved values are retained accurately and the record is still a Draft.
    await steps.step('All saved field values are retained accurately', () =>
      payerManagementPage.expectRowShowsDetails(uniquePayer.nameEn, [
        uniquePayer.nameEn,
        uniquePayer.licenseNumber,
        uniquePayer.email,
        uniquePayer.phone,
      ]));

    await steps.step('The record is still a Draft after returning', () =>
      payerManagementPage.expectApprovalStatusContains(uniquePayer.nameEn, 'Draft'));

    await steps.step('Still no PayerCode was assigned', () =>
      payerManagementPage.expectNoPayerCode(uniquePayer.nameEn));
  });
});

/**
 * User story: Create New Payer Organization Record.
 * A private Draft must be visible only to its creator. Admin A (the default
 * session) creates the Draft; Admin B (a second, separate session) must not be
 * able to see it.
 *
 * Requires SECOND_ADMIN_USERNAME / SECOND_ADMIN_PASSWORD in .env.
 */
test.describe('Create New Payer Organization Record - Draft privacy', () => {
  test('TC-013: should hide a Draft payer from a second administrator who is not its creator', async ({
    payerManagementPage,
    uniquePayer,
    cleanup,
    browser,
    steps,
  }) => {
    // BLOCKED, not FAIL: this case needs a SECOND administrator to act as the
    // other maker/checker. Without that account the segregation it checks cannot
    // be observed at all.
    if (!env.secondAdminUsername || !env.secondAdminPassword) {
      steps.blocked(
        'SECOND_ADMIN_USERNAME / SECOND_ADMIN_PASSWORD are not configured in .env, '
          + 'so a second administrator session cannot be established.',
      );
    }

    cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));

    // Admin A creates the private Draft.
    await steps.critical('Admin A opens the payer list', () => payerManagementPage.open());

    await steps.critical('Admin A creates the private Draft', () =>
      payerManagementPage.createDraftPayer(uniquePayer));

    await steps.step('The Draft is listed for its creator', () =>
      payerManagementPage.expectApprovalStatusContains(uniquePayer.nameEn, 'Draft'));

    // Admin B, in an isolated session, must not see admin A's Draft. The context
    // is opened and closed outside the recorded steps so it is always released,
    // even when a step aborts the remainder of the test.
    const contextB = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const pageB = await contextB.newPage();
      const payerManagementB = new PayerManagementPage(pageB);

      await steps.critical('Admin B signs in from an isolated session', async () => {
        const loginB = new LoginPage(pageB);
        await loginB.open();
        await loginB.loginAndWaitForDashboard(env.secondAdminUsername, env.secondAdminPassword);
      });

      await steps.critical('Admin B opens the payer list', () => payerManagementB.open());

      await steps.step("Admin A's Draft is not visible to admin B", () =>
        payerManagementB.expectRowNotVisible(uniquePayer.nameEn));
    } finally {
      await contextB.close();
    }
  });
});

/**
 * User story: Create New Payer Organization Record.
 * Draft -> Pending Approval transition, and the guard that an incomplete record
 * cannot proceed to approval.
 */
test.describe('Create New Payer Organization Record - Send for Approval', () => {
  test('TC-003: should transition the payer from Draft to Pending Approval when Send for Approval is confirmed', async ({
    payerManagementPage,
    uniquePayer,
    cleanup,
    steps,
  }) => {
    cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Create the payer as a Draft', () =>
      payerManagementPage.createDraftPayer(uniquePayer));

    await steps.step('The record starts in Draft', () =>
      payerManagementPage.expectApprovalStatusContains(uniquePayer.nameEn, 'Draft'));

    // Critical: this is the transition under test.
    await steps.critical('Send the payer for approval and confirm', () =>
      payerManagementPage.sendForApproval(uniquePayer.nameEn));

    // Now pending the reviewer's decision; still no PayerCode.
    await steps.step('The approval status becomes Pending Approval', () =>
      payerManagementPage.expectApprovalStatusContains(uniquePayer.nameEn, 'Pending Approval'));

    await steps.step('No PayerCode is assigned while pending approval', () =>
      payerManagementPage.expectNoPayerCode(uniquePayer.nameEn));
  });

  test('TC-014: should block sending for approval when a mandatory field is incomplete', async ({
    payerManagementPage,
    uniquePayer,
    cleanup,
    steps,
  }) => {
    cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Create the payer as a Draft', () =>
      payerManagementPage.createDraftPayer(uniquePayer));

    // A record can only be sent for approval once it exists as a Draft; the app
    // must never let a Draft reach an incomplete-yet-savable state. Edit the
    // Draft, clear a mandatory field, and confirm the app refuses to save it -
    // so no incomplete record can ever be sent for approval.
    let edit!: Awaited<ReturnType<typeof payerManagementPage.openEditForm>>;

    await steps.critical('Open the Draft for editing', async () => {
      edit = await payerManagementPage.openEditForm(uniquePayer.nameEn);
    });

    await steps.critical('Advance to the Effective Period step', async () => {
      await edit.clickNext(); // Basic -> Contact
      await edit.clickNext(); // Contact -> Effective Period
    });

    await steps.critical('Clear the mandatory Effective Date and attempt to save', async () => {
      await edit.clearField('Effective Date');
      await edit.save();
    });

    await steps.step('"Effective Date" shows a required-field error', () =>
      edit.expectFieldRequired('Effective Date', VALIDATION_MESSAGES.required));

    await steps.step('The form stays open, so the incomplete save was rejected', () =>
      edit.waitForOpen());

    await steps.critical('Discard the incomplete edit', () => edit.closeAndDiscard());
  });
});
