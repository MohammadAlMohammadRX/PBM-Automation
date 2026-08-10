import { test, expect } from '../../fixtures';

test.describe('Payer Management', () => {
  test.beforeEach(async ({ payerManagementPage }) => {
    await payerManagementPage.open();
  });

  test('advances past Basic Info when creating a payer with unique data @smoke', async ({
    payerManagementPage,
    uniquePayer,
  }) => {
    // NOTE: only the "Basic Info" step is automated end-to-end today (see
    // PayerCreateDialog). Once the remaining wizard steps are implemented,
    // this test should be extended to submit the full form and register a
    // `cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn))`
    // task so the created record doesn't leak into the shared QA environment.
    const dialog = await payerManagementPage.startCreatePayer(uniquePayer);
    await dialog.proceedFromBasicInfo();

    // Confirms the Basic Info step accepted the unique payer name (no
    // validation error kept the wizard on step 1) and moved on.
    await expect(dialog.field('Payer Name')).toBeHidden();
  });

  test('searches for an existing payer by name', async ({ payerManagementPage }) => {
    await payerManagementPage.searchPayer('Al Dawaa');

    await payerManagementPage.waitForRowVisible('Al Dawaa');
  });

  test('search returns no results for a non-existent payer', async ({ payerManagementPage }) => {
    await payerManagementPage.searchPayer('Nonexistent Payer XYZ 12345');

    expect(await payerManagementPage.isRowVisible('Nonexistent Payer XYZ 12345')).toBe(false);
  });
});
