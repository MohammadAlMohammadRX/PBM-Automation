import { test, expect, type FormularySession } from '../../../utils/formulary/writerCHelpers';
import { CASES } from '../../../data/formulary/editFormulary.data';

/**
 * User story 15196: Edit Formulary - who may edit.
 * "Only users with the required permissions can edit a formulary": the Payer
 * Admin role is shaped without UpdateFormulary and the tier / trade write
 * rights (fixture `formularyRole`, utils/formulary/writerCHelpers.ts), on a
 * draft of a payer in that account's scope - so only the permission can
 * explain what it is offered.
 */
test.describe('US 15196 - Edit Formulary - permission', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.editPermission.azureId}: should hide the edit actions on metadata, tiers and trades when the user lacks the edit permissions`, async ({
    formularyDetailPage,
    formularyTradesTab,
    formularyIn,
    formularyRole,
    requireFormularyListAccess,
    requireBaseline,
    steps,
  }) => {
    const data = CASES.editPermission;
    const formulary = await formularyIn('Draft', { payerName: data.payerName, tiers: 1, trades: 1 });
    const tierId = formulary.tiers[0].id;
    const tradeId = formulary.trades[0].id;
    let session!: FormularySession;

    await steps.critical('Navigate to the Formulary Management module as the user without edit permission - the module loads', async () => {
      await formularyDetailPage.open(formulary.id);
      requireBaseline((await formularyDetailPage.getActionAvailability('edit')) === 'available', 'Edit Metadata on the draft');
      session = await formularyRole.signIn(data.shape);
      await requireFormularyListAccess(session);
      await session.formularies.open();
      expect(await session.formularies.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Access the edit actions of the draft\'s metadata and tiers - they are unavailable (hidden)', async () => {
      await session.detail.open(formulary.id);
      expect(await session.detail.getActionAvailability('edit'), 'Edit Metadata').not.toBe('available');
      await session.tiers.open();
      const tiers = {
        add: await session.tiers.isAddOffered(),
        edit: await session.tiers.getCardActionAvailability(tierId, 'edit'),
        delete: await session.tiers.getCardActionAvailability(tierId, 'delete'),
      };
      expect(tiers).toEqual({ add: expect.not.stringMatching(/^available$/), edit: expect.not.stringMatching(/^available$/), delete: expect.not.stringMatching(/^available$/) });
    });

    await steps.step('Access the edit actions of the draft\'s trades - they are unavailable (hidden)', async () => {
      await formularyDetailPage.open(formulary.id);
      await formularyTradesTab.open();
      requireBaseline((await formularyTradesTab.isAddOffered()) === 'available', 'Add Trade for a session holding the rights');
      await session.trades.open();
      const trades = {
        add: await session.trades.isAddOffered(),
        status: await session.trades.getCardActionAvailability(tradeId, 'toggleStatus'),
        benefit: await session.trades.getCardActionAvailability(tradeId, 'benefitConfig'),
        remove: await session.trades.getCardActionAvailability(tradeId, 'remove'),
      };
      expect(trades).toEqual({
        add: expect.not.stringMatching(/^available$/),
        status: expect.not.stringMatching(/^available$/),
        benefit: expect.not.stringMatching(/^available$/),
        remove: expect.not.stringMatching(/^available$/),
      });
    });
  });
});
