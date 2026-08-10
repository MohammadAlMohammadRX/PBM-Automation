import { test, expect } from '../../fixtures';

test.describe('Network Management', () => {
  test.beforeEach(async ({ networkManagementPage }) => {
    await networkManagementPage.open();
  });

  test('advances past Basic Info when creating a network with unique data @smoke', async ({
    networkManagementPage,
    uniqueNetwork,
  }) => {
    // See tests/payer/payer.spec.ts for the note on extending this once the
    // remaining wizard steps are automated.
    const dialog = await networkManagementPage.startCreateNetwork(uniqueNetwork);
    await dialog.proceedFromBasicInfo();

    await expect(dialog.field('Network Name')).toBeHidden();
  });

  test('searches for existing networks by name fragment', async ({ networkManagementPage }) => {
    await networkManagementPage.searchNetwork('Automation Network');

    await networkManagementPage.verifyTableContainsText('Automation Network');
  });

  test('search returns no results for a non-existent network', async ({ networkManagementPage }) => {
    await networkManagementPage.searchNetwork('Nonexistent Network XYZ 12345');

    expect(await networkManagementPage.isRowVisible('Nonexistent Network XYZ 12345')).toBe(false);
  });
});
