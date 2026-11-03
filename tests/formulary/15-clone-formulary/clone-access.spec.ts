import { test, expect, formularyShape, openScopedList } from '../../../utils/formulary/writerAHelpers';
import { CASES } from '../../../data/formulary/cloneFormulary.data';

/**
 * User story 15211: Clone Formulary (who may clone).
 * The Read-Only Viewer is the Payer Admin account shaped to the formulary read
 * rights, without CloneFormulary (writerAHelpers.formularySession); the source
 * is the case's own draft of one of that account's payers, so the viewer can open it.
 */
test.describe('US 15211 - Clone Formulary access', () => {
  test(`TC-${CASES.viewerCannotClone.azureId}: should not offer Clone to a Read-Only Viewer who opens a formulary`, async ({
    formularyIn,
    formularySession,
    steps,
  }) => {
    const source = await formularyIn('Draft', { payerName: CASES.viewerCannotClone.payer });
    const session = await formularySession(formularyShape());

    await steps.critical('Navigate to the Formulary Management module - the formulary list is shown', async () => {
      await openScopedList(session);
      expect(await session.formularies.isListed(source.nameEn), `the viewer should see "${source.nameEn}"`).toBe(true);
    });

    await steps.step('As the Read-Only Viewer, open the source formulary - the detail page loads read-only', async () => {
      await session.detail.open(source.id);
      expect(await session.detail.getActionAvailability('edit'), 'Edit for a read-only viewer').not.toBe('available');
    });

    await steps.step('The Clone control is not available or is disabled for this role', async () => {
      expect(await session.detail.getActionAvailability('clone'), `Clone in the header (withheld: ${session.removed.join(', ')})`).not.toBe('available');
      await openScopedList(session);
      expect((await session.formularies.getActionState(source.nameEn, 'clone')).availability, 'Clone on the list row').not.toBe('available');
    });
  });
});
