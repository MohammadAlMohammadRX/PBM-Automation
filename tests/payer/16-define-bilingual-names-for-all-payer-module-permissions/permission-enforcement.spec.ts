import { test, expect } from '../../../fixtures';
import { ROLE_REQUIREMENTS } from '../../../data/payers/payerPermissions.data';

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
  test('TC-014: should refuse the decision when the submitter tries to approve their own payer request', async ({
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

  test('TC-018: should reject the request with an authorization error when a submitter approves their own change outside the interface', async ({
    payerManagementPage,
    steps,
  }) => {
    // BLOCKED rather than attempted. This case asks for the UI to be bypassed -
    // "a saved link, replayed request, or exposed endpoint" - to prove the
    // backend enforces the rule independently.
    //
    // Two reasons it is not attempted here. It needs the SUBMITTER to be denied
    // while a different account is allowed, and this environment has one
    // credential, so a rejection could not be distinguished from the endpoint
    // simply not working. And forging an approval call against a shared
    // environment risks pushing a real payer version live if the guard is
    // missing - which is precisely the outcome under test. That is a
    // deliberately-authorized security check, not something to run
    // opportunistically inside a functional suite.
    steps.blocked(
      `bypassing the interface to test backend enforcement needs a second account and explicit `
        + `authorization to make direct approval calls against this environment. `
        + `${ROLE_REQUIREMENTS.secondReviewer.reason} Until then TC-014 covers the rule as `
        + 'far as the interface enforces it.',
    );

    await steps.step('The payer module is reachable', () => payerManagementPage.open());
  });
});
