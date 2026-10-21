import { test, expect } from '../../../fixtures';

/**
 * User story: Define Bilingual Names for All Payer Module Permissions.
 * The maker-checker rule these permissions are supposed to enforce.
 *
 * TC-014 is the one enforcement case this environment CAN observe. The rest
 * need additional accounts and live in permission-access.spec.ts: with a single
 * administrator credential, "Role A sees this but not that" cannot be
 * distinguished from "the administrator sees everything".
 *
 * What makes TC-014 different is that it does not need a second role at all -
 * the rule is that a SUBMITTER cannot decide their own request, which one
 * account can demonstrate by submitting and then trying to approve. The
 * application even exposes the switch that governs it, as
 * `role-form-drawer-can-approve-own-requests-checkbox`, so the role's
 * configuration can be read alongside the behaviour rather than assumed.
 */
test.describe('Define Bilingual Names for All Payer Module Permissions - Enforcement', () => {
  // Azure test case 15390
  test('15390: should refuse the decision when the submitter tries to approve their own payer request', async ({
    payerManagementPage,
    approvalManagementPage,
    roleAdministrationPage,
    uniquePayer,
    steps,
  }) => {
    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.critical('Submit a payer change as the current user', async () => {
      await payerManagementPage.createDraftPayer(uniquePayer);
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(uniquePayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        uniquePayer.nameEn,
        'Pending Approval',
      );
    });

    await steps.step('The submitted request is awaiting approval', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(uniquePayer.nameEn);
    });

    // The role's own configuration, read rather than assumed. If this switch is
    // ON the rule does not apply to this role, and the next step's expectation
    // would be wrong - so reading it makes the case interpretable either way.
    await steps.step('The submitting role is not permitted to approve its own requests', async () => {
      await roleAdministrationPage.open();
      const [roleName] = await roleAdministrationPage.getRoleNames();
      await roleAdministrationPage.openEditDrawer(roleName);
      const selfApproval = await roleAdministrationPage.canApproveOwnRequests();
      expect(
        selfApproval,
        'This role may approve its own requests, so the maker-checker rule under test does '
          + 'not apply to it. Re-run with a role whose "Can a user approve their own '
          + 'requests?" switch is off.',
      ).toBe(false);
      await roleAdministrationPage.closeDrawer();
    });

    await steps.step('The Approve and Reject controls are refused to the submitter', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectSelfApprovalPrevented(uniquePayer.nameEn);
    });

    await steps.step('The request is still Pending Approval afterwards', async () => {
      await payerManagementPage.open();
      await payerManagementPage.expectApprovalStatusContains(
        uniquePayer.nameEn,
        'Pending Approval',
      );
    });
  });
});
