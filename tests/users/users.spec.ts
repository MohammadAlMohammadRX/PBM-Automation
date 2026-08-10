import { test, expect } from '../../fixtures';

test.describe('Users Administration', () => {
  test.beforeEach(async ({ usersAdministrationPage }) => {
    await usersAdministrationPage.open();
  });

  test('advances past User Information when creating a user with unique data @smoke', async ({
    usersAdministrationPage,
    uniqueUser,
  }) => {
    // See tests/payer/payer.spec.ts for the note on extending this once the
    // remaining wizard steps (Contact Information, Roles and Privileges)
    // are automated end-to-end.
    const dialog = await usersAdministrationPage.startCreateUser(uniqueUser);
    await dialog.proceedToContactInformation();

    await expect(dialog.field('Document ID')).toBeHidden();
  });

  test('searches for an existing user by name', async ({ usersAdministrationPage }) => {
    await usersAdministrationPage.searchUser('Farah Adams');

    await usersAdministrationPage.waitForRowVisible('Farah Adams');
  });

  test('verifies status and identity details for an existing user', async ({ usersAdministrationPage }) => {
    await usersAdministrationPage.searchUser('Farah Adams');

    await usersAdministrationPage.verifyUserDetails('Farah Adams', {
      Status: 'Active',
      'Identity Type': 'National ID',
      Nationality: 'Saudi (SAU)',
    });
  });

  test('search returns no results for a non-existent user', async ({ usersAdministrationPage }) => {
    await usersAdministrationPage.searchUser('Nonexistent User XYZ 12345');

    expect(await usersAdministrationPage.isRowVisible('Nonexistent User XYZ 12345')).toBe(false);
  });
});
