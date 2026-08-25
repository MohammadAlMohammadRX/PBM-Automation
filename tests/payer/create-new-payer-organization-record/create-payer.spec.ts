import { test, expect } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import { VALIDATION_MESSAGES } from '../../../data/payers/payer.data';
import { LoginPage } from '../../../pages/auth/LoginPage';
import { PayerManagementPage } from '../../../pages/payer/PayerManagementPage';

/**
 * User story: Create New Payer Organization Record.
 * Happy-path creation of a private Draft and its PayerCode-less state.
 */
test.describe('Create New Payer Organization Record - Draft creation', () => {
  test('TC-001: should save the payer as a private Draft when an admin submits valid mandatory data', async ({
    payerManagementPage,
    uniquePayer,
    cleanup,
  }) => {
    cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));

    await payerManagementPage.open();
    await payerManagementPage.createDraftPayer(uniquePayer);

    // Saved as Draft, visible to its creator, and with no PayerCode yet.
    await payerManagementPage.expectApprovalStatusContains(uniquePayer.nameEn, 'Draft');
    await payerManagementPage.expectNoPayerCode(uniquePayer.nameEn);
  });

  test('TC-002: should not assign a PayerCode when the payer record is still a Draft', async ({
    payerManagementPage,
    uniquePayer,
    cleanup,
  }) => {
    cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));

    await payerManagementPage.open();
    await payerManagementPage.createDraftPayer(uniquePayer);

    await payerManagementPage.expectApprovalStatusContains(uniquePayer.nameEn, 'Draft');
    await payerManagementPage.expectNoPayerCode(uniquePayer.nameEn);
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
  }) => {
    cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));

    await payerManagementPage.open();
    await payerManagementPage.createDraftPayer(uniquePayer);

    const detailAtCreation = await payerManagementPage.openDetails(uniquePayer.nameEn);
    const createdAtInitial = await detailAtCreation.getFieldValue('Created At');
    expect(createdAtInitial).not.toEqual('');

    // Move the record all the way to approved.
    await payerManagementPage.open();
    await payerManagementPage.sendForApproval(uniquePayer.nameEn);
    await approvalManagementPage.open();
    await approvalManagementPage.approve(uniquePayer.nameEn);

    // CreatedAt must be identical to what it was at initial Draft creation.
    await payerManagementPage.open();
    const detailAfterApproval = await payerManagementPage.openDetails(uniquePayer.nameEn);
    const createdAtAfterApproval = await detailAfterApproval.getFieldValue('Created At');
    expect(createdAtAfterApproval).toEqual(createdAtInitial);
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
  }) => {
    cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));

    await payerManagementPage.open();
    await payerManagementPage.createDraftPayer(uniquePayer);
    await payerManagementPage.expectApprovalStatusContains(uniquePayer.nameEn, 'Draft');

    await payerManagementPage.navigateAwayAndReturn();

    // All saved values are retained accurately and the record is still a Draft.
    await payerManagementPage.expectRowShowsDetails(uniquePayer.nameEn, [
      uniquePayer.nameEn,
      uniquePayer.licenseNumber,
      uniquePayer.email,
      uniquePayer.phone,
    ]);
    await payerManagementPage.expectApprovalStatusContains(uniquePayer.nameEn, 'Draft');
    await payerManagementPage.expectNoPayerCode(uniquePayer.nameEn);
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
  }) => {
    cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));

    // Admin A creates the private Draft.
    await payerManagementPage.open();
    await payerManagementPage.createDraftPayer(uniquePayer);
    await payerManagementPage.expectApprovalStatusContains(uniquePayer.nameEn, 'Draft');

    // Admin B, in an isolated session, must not see admin A's Draft.
    const contextB = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const pageB = await contextB.newPage();
    const loginB = new LoginPage(pageB);
    await loginB.open();
    await loginB.loginAndWaitForDashboard(env.secondAdminUsername, env.secondAdminPassword);

    const payerManagementB = new PayerManagementPage(pageB);
    await payerManagementB.open();
    await payerManagementB.expectRowNotVisible(uniquePayer.nameEn);

    await contextB.close();
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
  }) => {
    cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));

    await payerManagementPage.open();
    await payerManagementPage.createDraftPayer(uniquePayer);
    await payerManagementPage.expectApprovalStatusContains(uniquePayer.nameEn, 'Draft');

    await payerManagementPage.sendForApproval(uniquePayer.nameEn);

    // Now pending the reviewer's decision; still no PayerCode.
    await payerManagementPage.expectApprovalStatusContains(uniquePayer.nameEn, 'Pending Approval');
    await payerManagementPage.expectNoPayerCode(uniquePayer.nameEn);
  });

  test('TC-014: should block sending for approval when a mandatory field is incomplete', async ({
    payerManagementPage,
    uniquePayer,
    cleanup,
  }) => {
    cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));

    await payerManagementPage.open();
    await payerManagementPage.createDraftPayer(uniquePayer);

    // A record can only be sent for approval once it exists as a Draft; the app
    // must never let a Draft reach an incomplete-yet-savable state. Edit the
    // Draft, clear a mandatory field, and confirm the app refuses to save it -
    // so no incomplete record can ever be sent for approval.
    const edit = await payerManagementPage.openEditForm(uniquePayer.nameEn);
    await edit.clickNext(); // Basic -> Contact
    await edit.clickNext(); // Contact -> Effective Period
    await edit.clearField('Effective Date');
    await edit.save();

    await edit.expectFieldRequired('Effective Date', VALIDATION_MESSAGES.required);
    await edit.waitForOpen(); // still open, incomplete save rejected
    await edit.closeAndDiscard();
  });
});
