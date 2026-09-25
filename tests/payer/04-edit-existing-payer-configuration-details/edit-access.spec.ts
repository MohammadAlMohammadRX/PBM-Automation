import { test, expect } from '../../../fixtures';
import type { ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';
import { PAYER_PERMISSION } from '../../../data/accounts/payerAdminRole.data';

/**
 * User story: Edit Existing Payer Configuration Details.
 * Only roles with payer-edit permission may reach the Edit action.
 *
 * HOW THE RESTRICTED USER IS OBTAINED. This case used to report BLOCKED: the
 * only non-administrator credential in this environment is a Payer Admin, and
 * it HOLDS Edit Payer, so the refusal could never be observed from it.
 *
 * It is now built rather than waited for. `shapedNonAdmin` signs in as the
 * administrator, takes Edit Payer off the Payer Admin role, saves, and then
 * signs a second window in as that account - which is exactly what a person
 * would do by hand. The permission is put back when the case ends, whether it
 * passed or failed, because the role is shared.
 */
test.describe('Edit Existing Payer Configuration Details - Access control', () => {
  // Azure test case 14370
  test('14370: should deny the Edit action when the user lacks payer-edit permission', async ({
    shapedNonAdmin,
    steps,
  }) => {
    let session!: ShapedSession;

    await steps.critical('Sign in as a user without payer-edit permission', async () => {
      session = await shapedNonAdmin({ without: ['editPayer'] });
      expect(
        session.removed,
        'the role should have been stripped of the edit permission before signing in',
      ).toContain(PAYER_PERMISSION.editPayer);
    });

    await steps.critical('Navigate to the payer module', () => session.payers.navigate());

    await steps.step('The Edit action is not offered', () =>
      session.payers.expectEditActionDenied());
  });
});
