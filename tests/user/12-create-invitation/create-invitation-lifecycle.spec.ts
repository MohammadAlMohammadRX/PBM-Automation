import { test, expect } from '../../../fixtures';
import { BLOCKED_CASES, CASES, REGISTRATION_BLOCKED } from '../../../data/user/createInvitation.data';
import { blockRest } from '../../../utils/user/writerDHelpers';

/**
 * User story 20418: Create Invitation - what happens after the invitation.
 * Registering through the invitation link and approving that registration are
 * story 20422 (MANUAL): 20653 asserts the suite invitation is Pending and is
 * BLOCKED at the registration; 20654 needs an invitation already in Pending
 * Approval and is BLOCKED outright (data-driven). See the data file.
 */
test.describe('US 20418 - Create Invitation', () => {
  test(`TC-${CASES.pendingApprovalAfterRegistration.azureId}: should move the invitation to Pending Approval when the invited colleague completes registration`, async ({
    invitationListPage: list,
    suiteInvitation,
    steps,
  }) => {
    const inv = await suiteInvitation();

    await steps.critical('Navigate to the User Management module - the Invitations list shows the invitation with status Pending', async () => {
      await list.openTable();
      await list.revealRow(inv.email);
      expect((await list.readRowById(inv.id)).status).toBe('Pending');
    });

    await steps.step('Complete the registration as the invited colleague using the invitation link - registration is submitted', async () => {
      expect(inv.item.statusName, 'the invitation is still Pending before the registration').toBe('Pending');
      blockRest(steps, REGISTRATION_BLOCKED);
    });

    await steps.step('Return to the Invitations list and locate the same invitation - its status shows Pending Approval', async () => {
      await list.revealRow(inv.email);
      expect((await list.readRowById(inv.id)).status).toBe('Pending Approval');
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
