import { test, expect, formularyShape, openScopedList } from '../../../utils/formulary/writerAHelpers';
import { CASES } from '../../../data/formulary/bulkImport.data';

/**
 * User story 15198: Formulary Bulk import (access).
 * The non-administrator is the Payer Admin account shaped to view formularies
 * without the BulkImport right (writerAHelpers.formularySession); the
 * administrator's own Import is the baseline that the control exists at all.
 */
test.describe('US 15198 - Bulk import access', () => {
  test(`TC-${CASES.noPermission.azureId}: should hide or deny the bulk import to a user without the import permission`, async ({
    formularyManagementPage,
    formularySession,
    requireBaseline,
    steps,
  }) => {
    await formularyManagementPage.open();
    requireBaseline(await formularyManagementPage.isImportOffered(), 'the formulary list\'s Import control');
    const session = await formularySession(formularyShape());

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await openScopedList(session);
      expect(await session.formularies.isListRendered()).toBe(true);
    });

    await steps.step('Log in with a non-administrator role - the module loads with restricted options', async () => {
      expect(await session.formularies.isAddOffered(), 'Add Formulary for a view-only role').toBe(false);
    });

    await steps.step('Attempting to open the Bulk Import is denied or the option is not visible', async () => {
      expect(await session.formularies.isImportOffered(), `Import offered without ${session.removed.filter((r) => /BulkImport/.test(r)).join(', ')}`).toBe(false);
    });
  });
});
