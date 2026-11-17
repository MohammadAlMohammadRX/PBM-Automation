import { test, expect, itemsOf, labelOf, normalise, openReasonDrawer } from '../../../utils/lookup/writerDHelpers';
import type { LookupItem } from '../../../utils/lookup/lookupApi';
import type { ProvisionedUser } from '../../../utils/UserProvisioning';
import type { UserDeactivateDrawer } from '../../../pages/user/UserDeactivateDrawer';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { CASES, HOME_LIST, MESSAGE } from '../../../data/lookup/populateDropDownsFromLookupLists.data';

/**
 * User story 20861: Populate Drop-downs From Lookup Lists - the list a form
 * needs fails to load (lead decision 4: GET Items/<home list> answers 500 in
 * this test's browser only). The form is the user Deactivate drawer for an
 * active suite user; its required Deactivation Reason must stop an empty
 * "save" (Deactivate) - nobody is deactivated, the drawer is cancelled.
 */
test.describe('US 20861 - Populate Drop-downs From Lookup Lists', () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.listLoadFails.azureId}: should leave the drop-down empty and block an empty save when the lookup list cannot be loaded`, async ({ page, steps, userIn, lookupRegister }) => {
    const d = CASES.listLoadFails;
    const failing = `/api/Lookups/Items/${HOME_LIST}`;
    let user!: ProvisionedUser;
    let items: LookupItem[] = [];
    let drawer!: UserDeactivateDrawer;

    await steps.critical('Navigate to the Lookups Management module - the Lookups Management module loads (an active suite user to open the form for)', async () => {
      user = await userIn('Active');
      items = await itemsOf(page, HOME_LIST);
      await lookupRegister.open();
      await expect(lookupRegister.control('searchInput'), 'the Lookups register search').toBeVisible();
    });

    await steps.step(`Open a form whose lookup list fails to load (GET ${failing} answers ${d.status}) - the form loads without blocking the screen`, async () => {
      await NetworkUtils.failEndpoint(page, failing, d.status);
      const opened = await openReasonDrawer(page, user, HOME_LIST);
      drawer = opened.drawer;
      await drawer.waitForOpen();
      expect(opened.itemsStatus, `the form's request for ${HOME_LIST}`).toBe(d.status);
    });

    await steps.step('Inspect the affected drop-down - it is displayed empty rather than causing a screen error', async () => {
      const offered = (await drawer.getReasonOptions()).map(normalise);
      const values = items.map((i) => labelOf(i, 'en'));
      expect(offered.filter((label) => values.includes(label)), `list values offered although the list failed to load (all options: ${offered.join(' | ') || 'none'})`).toEqual([]);
      expect(await drawer.isOpen(), 'the Deactivate drawer stays on screen').toBe(true);
    });

    await steps.step('Attempt to save the form without selecting a value in the required field - the required-field validation stops the save, showing "This field is required."', async () => {
      const attempt = await drawer.attemptConfirm();
      const shown = `ToggleUserActivation ${attempt.status === -1 ? 'not sent' : `${attempt.status} ${attempt.text.slice(0, 160)}`}; errors ${JSON.stringify(attempt.errors)}; toasts ${JSON.stringify(attempt.messages)}`;
      expect.soft(attempt.status, `the save with no reason (${shown})`).toBe(-1);
      expect(attempt.errors.map(normalise), `the required-field message (${shown})`).toContain(MESSAGE.required);
    });

    await NetworkUtils.restoreEndpoint(page, failing);
  });
});
