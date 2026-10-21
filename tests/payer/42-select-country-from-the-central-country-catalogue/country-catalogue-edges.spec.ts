import { test, expect } from '../../../fixtures';
import type { PayerFormDialog } from '../../../pages/payer/PayerFormDialog';
import { env } from '../../../constants/EnvironmentConfig';
import { buildUniquePayer } from '../../../data/payers/payer.data';
import {
  CATALOGUE_ROLE_REQUIREMENT,
  COUNTRY_SEARCH,
} from '../../../data/payers/countryCatalogue.data';

/**
 * User story: Select Country from the Central Country Catalogue.
 * Resilience, usability and permission.
 *
 * TC-007 is the case worth reading. It breaks the catalogue service and asks
 * what the field then shows. An empty dropdown with no explanation is the
 * failure mode it is written against, because the user cannot tell "there are
 * no countries" from "the list could not be loaded" - and this module has a
 * documented history of exactly that shape of silence.
 */
test.describe('Country catalogue - Edges', () => {

  // Azure test case 14867
  test('14867: should narrow the list to the matching country when a partial name is typed', async ({
    payerManagementPage,
    steps,
  }) => {
    const payer = buildUniquePayer();
    let form!: PayerFormDialog;
    let filtered: string[] = [];

    await steps.critical('Navigate to the module and open the creation form', async () => {
      await payerManagementPage.open();
      form = await payerManagementPage.openCreateForm();
      await form.fillBasicInformation(payer);
      await form.clickNext();
    });

    await steps.step(`Typing "${COUNTRY_SEARCH.query}" narrows the list`, async () => {
      filtered = await form.filterDropdownOptions('Country', COUNTRY_SEARCH.query);
      expect(
        filtered,
        `the search should return matches for "${COUNTRY_SEARCH.query}"`,
      ).not.toEqual([]);
    });

    await steps.step('Every remaining entry matches what was typed', async () => {
      // The half that makes the filter worth having: a control that shows
      // everything regardless of the query has not filtered anything.
      const unmatched = filtered.filter(
        (country) => !country.toLowerCase().includes(COUNTRY_SEARCH.query.toLowerCase()),
      );
      expect(
        unmatched,
        `the filtered list should hold only matches; it held: ${filtered.join(', ')}`,
      ).toEqual([]);
    });

    await steps.step('And the filtered result can be selected', async () => {
      await form.selectDropdownOption('Country', filtered[0]);
      expect(
        await form.getDropdownValue('Country'),
        'selecting from a filtered list should apply the country',
      ).toContain(filtered[0]);
      await form.closeAndDiscard();
    });
  });
});

/** The permission half, signed out of the shared administrator session. */
test.describe('Country catalogue - Permission', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // Azure test case 14866
  test('14866: should let a payer administrator select a country but not maintain the catalogue', async ({
    requireNonAdmin,
    loginPage,
    payerManagementPage,
    steps,
  }) => {
    // BLOCKED (not FAIL) when the configured non-admin account cannot serve this
    // case - see data/accounts/nonAdminAccount.data.ts for what it holds.
    requireNonAdmin({ holding: ['editPayer'], lacking: ['systemSettings'] });

    let form!: PayerFormDialog;

    await steps.critical('Sign in as the restricted user and open the payer module', async () => {
      await loginPage.open();
      await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
      await payerManagementPage.navigate();
      await payerManagementPage.expectRowsRendered();
    });

    await steps.step('Country remains selectable for this role', async () => {
      const payer = buildUniquePayer();
      form = await payerManagementPage.openCreateForm();
      await form.fillBasicInformation(payer);
      await form.clickNext();
      const offered = await form.getDropdownOptions('Country');
      expect(offered, 'a payer administrator should still be able to choose a country').not.toEqual(
        [],
      );
    });

    await steps.step('But the catalogue itself is not theirs to change', async () => {
      // Asserted where this role would have to go to change it. The payer form
      // offers no catalogue-editing control at all, so the meaningful check is
      // that Terminology Management is closed to this account.
      await form.closeAndDiscard();
      expect(
        await payerManagementPage.isTerminologyManagementOffered(),
        'catalogue maintenance should be withheld from a role without those rights',
      ).toBe(false);
    });
  });
});
