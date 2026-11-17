import {
  test,
  expect,
  WriterDLookups,
  asShown,
  heldRetiredValue,
  labelOf,
  normalise,
  readGenderOffer,
  readHeldValue,
  readReasonOffer,
  storedItem,
  suiteNames,
} from '../../../utils/lookup/writerDHelpers';
import type { LookupItem } from '../../../utils/lookup/lookupApi';
import type { LookupItemLink } from '../../../utils/lookup/lookupInUse';
import type { ProvisionedUser } from '../../../utils/UserProvisioning';
import { CASES, HOME_LIST, MESSAGE, RECORD_LIST } from '../../../data/lookup/editLookupItem.data';

/**
 * User story 20858: Edit Lookup Item - Is Active cleared: the value is no longer
 * offered by the form that uses the list (21175: the user Deactivate drawer,
 * opened for an active suite user and cancelled), while a record already
 * holding a retired value still shows it (21176: the suite user's Gender on its
 * profile - see the data file for why that list).
 */
test.describe('US 20858 - Edit Lookup Item', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.inactiveNotOffered.azureId}: should stop offering the value in the form using the list when Is Active is cleared`, async ({ page, steps, suiteLookupItems, userIn, lookupRegister }) => {
    const view = new WriterDLookups(page);
    let item!: LookupItem;
    let user!: ProvisionedUser;

    await steps.critical('Precondition: an active suite value in the home list is offered by the user Deactivate drawer', async () => {
      item = await suiteLookupItems.create(HOME_LIST, suiteNames());
      user = await userIn('Active');
      const before = await readReasonOffer(page, user, HOME_LIST);
      expect(before.offered, `the Deactivate drawer of ${user.displayNameEn} before the edit`).toContain(labelOf(item, 'en'));
    });

    await steps.critical('Navigate to the Lookups Management module - the list of lookups is displayed', async () => {
      await lookupRegister.open();
      await expect(lookupRegister.control('searchInput'), 'the Lookups register search').toBeVisible();
    });

    await steps.step('Open Edit on the item, clear Is Active and save - the system shows "Item Updated — The lookup item was updated."', async () => {
      await view.openList(HOME_LIST);
      const save = await view.retireOnScreen(HOME_LIST, item);
      const shown = `UpdateLookupItem ${save.status ?? 'not sent'} ${save.answer.slice(0, 160)}; errors ${JSON.stringify(save.errors)}`;
      expect.soft(normalise(save.toast), `the toast (${shown})`).toContain(asShown(MESSAGE.updated));
      expect((await storedItem(page, HOME_LIST, item.id))?.isActive, `the stored Is Active (${shown})`).toBe(false);
    });

    await steps.step('Open a form elsewhere that uses this lookup list - the deactivated value is no longer offered in the drop-down', async () => {
      const after = await readReasonOffer(page, user, HOME_LIST);
      expect(after.offered.length, `the Deactivate drawer's reasons (Items answered ${after.itemsStatus})`).toBeGreaterThan(0);
      expect(after.offered, `the Deactivate drawer of ${user.displayNameEn} after the edit`).not.toContain(labelOf(item, 'en'));
    });
  });

  test(`TC-${CASES.retiredStillShown.azureId}: should keep showing a retired value on the record that already holds it`, async ({ page, steps, suiteLookupItems, linkLookupItem, lookupRegister }) => {
    const view = new WriterDLookups(page);
    let held!: { item: LookupItem; link: LookupItemLink; how: string };

    await steps.critical(`Precondition: a record holds a suite value of "${RECORD_LIST}" that is retired; navigate to the Lookups Management module - the list of lookups is displayed`, async () => {
      held = await heldRetiredValue(page, suiteLookupItems, linkLookupItem, RECORD_LIST);
      await lookupRegister.open();
      await expect(lookupRegister.control('searchInput'), 'the Lookups register search').toBeVisible();
    });

    await steps.step('Confirm the value\'s Is Active status is No - the value is excluded from new selections', async () => {
      await view.openList(RECORD_LIST);
      await view.revealItem(RECORD_LIST, held.item);
      await expect(view.items.itemStatusBadge(held.item.id), `the Active badge of ${held.item.code}`).toHaveText('Inactive');
      const offered = await readGenderOffer(page);
      expect(offered, `the Add User drawer's Gender options (${held.how})`).not.toContain(labelOf(held.item, 'en'));
    });

    await steps.step('Open the existing record that holds this retired value - the record\'s field still displays the retired value', async () => {
      const value = await readHeldValue(page, held.link, RECORD_LIST);
      expect(value, `the record (${held.how})`).toBe(labelOf(held.item, 'en'));
    });
  });
});
