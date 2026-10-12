import { test, expect } from '../../../fixtures';
import type { ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';
import { PAYER_PERMISSION } from '../../../data/accounts/payerAdminRole.data';

/**
 * User story: Create New Payer Organization Record.
 * Only System Administrators may create a payer. This spec logs in as a NON-admin
 * (Standard User / Reviewer) and asserts the Create action is denied.
 *
 * Requires NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD in .env. This test opts out of
 * the shared admin session so it can authenticate as the lower-privilege user.
 */
test.describe('Create New Payer Organization Record - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // Azure test case 14520
  // THE ROLE IS SHAPED EXPLICITLY (changed 2026-10-11, QA-lead note N-024)
  // rather than relying on the account happening to lack the right. The
  // scenario, as the QA lead set it out: the administrator opens System
  // Settings > Role Administration, edits "Payer Admin", unticks CreatePayer
  // and saves; the non-admin then signs in. The control appearing is a defect.
  test('14520: should deny the Create New Payer action when the user lacks the System Administrator role', async ({
    shapedNonAdmin,
    steps,
  }) => {
    let session!: ShapedSession;

    await steps.critical(
      'Administrator unticks CreatePayer on the "Payer Admin" role and saves; the non-admin signs in',
      async () => {
        session = await shapedNonAdmin({ without: ['createPayer'] });
        expect(session.removed, 'CreatePayer should have been taken off the role').toContain(PAYER_PERMISSION.createPayer);
      },
    );

    await steps.critical('The non-admin opens the payer module', () => session.payers.navigate());

    // The Create action must not be offered to a role without CreatePayer.
    await steps.step('The Create New Payer action is not offered', () =>
      session.payers.expectCreateActionDenied());
  });
});
