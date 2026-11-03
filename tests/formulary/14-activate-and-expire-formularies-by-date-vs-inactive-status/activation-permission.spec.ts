import { test, expect, type FormularySession } from '../../../utils/formulary/writerCHelpers';
import { FORMULARY_STATUS } from '../../../data/formulary/formulary.data';
import { CASES } from '../../../data/formulary/activateExpire.data';

/**
 * User story 15209: Activate and expire formularies - who may change the
 * status. "Only a Formulary Administrator can set a formulary to Inactive or
 * activate it": the Payer Admin role shaped without SetFormularyActive (the
 * one right behind both Deactivate and Activate) stands in for the Claims
 * Processor, on formularies of a payer in its scope.
 */
test.describe('US 15209 - Activate and expire formularies - permission', () => {
  test.describe.configure({ timeout: 25 * 60_000 });

  test(`TC-${CASES.onlyAdministrator.azureId}: should offer neither Set Inactive nor Activate to a role without the formulary administrator right`, async ({
    formularyDetailPage,
    formularyIn,
    formularyRole,
    requireFormularyListAccess,
    requireBaseline,
    steps,
  }) => {
    const data = CASES.onlyAdministrator;
    const active = await formularyIn('Active', { payerName: data.payerName });
    const inactive = await formularyIn('Inactive', { payerName: data.payerName });
    let session!: FormularySession;

    await steps.critical('Navigate to the Formulary Management module - the formulary list is shown', async () => {
      await formularyDetailPage.open(active.id);
      requireBaseline((await formularyDetailPage.getActionAvailability('setActive')) === 'available', 'Deactivate on an Active formulary');
      await formularyDetailPage.open(inactive.id);
      requireBaseline((await formularyDetailPage.getActionAvailability('activate')) === 'available', 'Activate on an Inactive formulary');
      session = await formularyRole.signIn(data.shape);
      await requireFormularyListAccess(session);
      await session.formularies.open();
      expect(await session.formularies.isListed(active.nameEn)).toBe(true);
    });

    await steps.critical('Log in as the restricted role and open the Active formulary - the detail page loads', async () => {
      await session.detail.open(active.id);
      expect(await session.detail.getStatus()).toBe(FORMULARY_STATUS.active);
    });

    await steps.step('Check for the Set Inactive action - it is not available for this role', async () => {
      expect(await session.detail.getActionAvailability('setActive')).not.toBe('available');
    });

    await steps.step('Open the Inactive formulary and check for Activate - it is not available for this role', async () => {
      await session.detail.open(inactive.id);
      expect(await session.detail.getStatus()).toBe(FORMULARY_STATUS.inactive);
      expect(await session.detail.getActionAvailability('activate')).not.toBe('available');
    });
  });
});
