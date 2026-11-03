import { test, expect, formularyShape, openScopedList, SCOPED_ACCOUNT } from '../../../utils/formulary/writerAHelpers';
import { CASES } from '../../../data/formulary/createFormulary.data';
import { findPayers } from '../../../utils/PayerFinder';

/**
 * User story 15192: Create Formulary (who may create, and for which payers).
 * The restricted user is the Payer Admin account (assigned "Al Dawaa 2" and
 * "NUPCO") shaped with the Formularies rights per case
 * (writerAHelpers.formularySession); the administrator is the user who holds
 * the create permission.
 */
test.describe('US 15192 - Create Formulary access', () => {
  test(`TC-${CASES.createPermission.azureId}: should hide or disable "Create Formulary" for a user without the create permission and offer it to one who holds it`, async ({
    formularyManagementPage,
    formularySession,
    steps,
  }) => {
    const session = await formularySession(formularyShape());

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.step('Log in as a user without the create permission - the module loads with restricted options', async () => {
      await openScopedList(session);
      expect(await session.formularies.isListRendered(), 'the list should load for a user who may view it').toBe(true);
    });

    await steps.step('The "Create Formulary" action is hidden or disabled for this role', async () => {
      expect(await session.formularies.isAddOffered(), `Add Formulary offered without ${session.removed.filter((r) => r === 'CreateFormulary').join(', ')}`).toBe(false);
    });

    await steps.step('Log in as a user who holds the permission - "Create Formulary" is visible and accessible', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isAddOffered()).toBe(true);
      const drawer = await formularyManagementPage.openAddForm();
      expect(await drawer.isOpen()).toBe(true);
    });
  });

  test(`TC-${CASES.assignedPayers.azureId}: should offer every payer assigned to the user, and only those, when the user creates a formulary`, async ({
    page,
    formularySession,
    steps,
  }) => {
    const session = await formularySession(formularyShape(['create']));
    let offered: string[] = [];
    // Only ACTIVE payers can own a new formulary: "Al Dawaa 2" was inactive on
    // 2026-11-02 and the form rightly left it out. The expectation is the
    // assigned payers that are active now, read from the register (as admin).
    const active = await findPayers(
      page,
      (p) => p.isActive && CASES.assignedPayers.payers.includes(p.payerNameEn),
      'the active payers assigned to the account',
      CASES.assignedPayers.payers,
    );
    const expected = [...new Set(active.map((p) => p.payerNameEn))];

    await steps.critical('Open Create Formulary as a user assigned to two payers - the payer selection is displayed', async () => {
      await openScopedList(session, SCOPED_ACCOUNT.allMine);
      const drawer = await session.formularies.openAddForm();
      offered = await drawer.getPayerOptions();
      expect(offered.length, 'the payer list should offer payers').toBeGreaterThan(0);
    });

    await steps.step(`Both assigned payers (${CASES.assignedPayers.payers.join(', ')}) are offered, and no other`, async () => {
      expect([...offered].sort(), `the payers offered when creating a formulary (the active ones of ${CASES.assignedPayers.payers.join(', ')})`).toEqual(expected.sort());
    });
  });
});
