import type { Page } from '@playwright/test';
import {
  test,
  expect,
  WriterDLookups,
  asShown,
  labelOf,
  normalise,
  openReasonDrawer,
  openSecondTab,
  readGenderOffer,
  readHeldValue,
  readOpenReasons,
  readReasonOffer,
  storedItem,
  suiteNames,
  type SaveReport,
} from '../../../utils/lookup/writerDHelpers';
import { readLookupItems, type LookupItem } from '../../../utils/lookup/lookupApi';
import type { LookupItemLink } from '../../../utils/lookup/lookupInUse';
import type { ProvisionedUser } from '../../../utils/UserProvisioning';
import type { UserDeactivateDrawer } from '../../../pages/user/UserDeactivateDrawer';
import { CASES, HOME_LIST, MESSAGE, RECORD_LIST } from '../../../data/lookup/populateDropDownsFromLookupLists.data';

/**
 * User story 20861: Populate Drop-downs From Lookup Lists - a retired value
 * stays on the record holding it but leaves new drop-downs (21210, on the
 * suite user's Gender - see the data file), and a value added on the Lookup
 * Items screen reaches every form using the list the next time it opens (21213).
 */
test.describe('US 20861 - Populate Drop-downs From Lookup Lists', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.retiredKeptOnRecord.azureId}: should keep showing the retired value on the existing record while new records no longer offer it`, async ({ page, steps, suiteLookupItems, linkLookupItem, lookupRegister }) => {
    const view = new WriterDLookups(page);
    let item!: LookupItem;
    let link!: LookupItemLink;
    let held = '';

    await steps.critical(`Precondition: a suite record holds an active suite value of "${RECORD_LIST}"; navigate to the Lookups Management module - the module loads`, async () => {
      item = await suiteLookupItems.create(RECORD_LIST, suiteNames());
      link = await linkLookupItem(RECORD_LIST, item);
      await lookupRegister.open();
      await expect(lookupRegister.control('searchInput'), 'the Lookups register search').toBeVisible();
    });

    await steps.step('Set the lookup value held by the existing record to Is Active = false (retire it) and save - the value shows as inactive in the Lookup Items screen', async () => {
      await view.openList(RECORD_LIST);
      const save: SaveReport = await view.retireOnScreen(RECORD_LIST, item);
      const shown = `UpdateLookupItem ${save.status ?? 'not sent'} ${save.answer.slice(0, 200)}; toast "${save.toast}"; errors ${JSON.stringify(save.errors)}; held by ${link.description}`;
      expect.soft((await storedItem(page, RECORD_LIST, item.id))?.isActive, `the stored Is Active (${shown})`).toBe(false);
      await view.openList(RECORD_LIST);
      await view.revealItem(RECORD_LIST, item);
      await expect(view.items.itemStatusBadge(item.id), `the Active badge of ${item.code} (${shown})`).toHaveText('Inactive');
    });

    await steps.step('Open the existing record that holds this value - the record loads with its saved field data', async () => {
      held = await readHeldValue(page, link, RECORD_LIST);
      expect(held, `the record: ${link.description}`).toBe(labelOf(item, 'en'));
    });

    await steps.step('Open a new record and view the same field\'s drop-down - the existing record still displays the retired value, while the drop-down for a new record no longer offers it', async () => {
      const offered = await readGenderOffer(page);
      expect.soft(offered.length, 'the Add User drawer\'s Gender options').toBeGreaterThan(0);
      expect.soft(offered, 'the Add User drawer\'s Gender options').not.toContain(labelOf(item, 'en'));
      expect(await readHeldValue(page, link, RECORD_LIST), `the existing record again: ${link.description}`).toBe(labelOf(item, 'en'));
    });
  });

  test(`TC-${CASES.changeSeenNextOpen.azureId}: should show a value added on the Lookup Items screen in every form the next time it is opened`, async ({ page, steps, suiteLookupItems, userIn, lookupRegister }) => {
    const view = new WriterDLookups(page);
    const names = suiteNames();
    const code = suiteLookupItems.newCode();
    let first!: ProvisionedUser;
    let second!: ProvisionedUser;
    let tab!: Page;
    let openForm!: UserDeactivateDrawer;
    let added: LookupItem | undefined;

    await steps.critical('Navigate to the Lookups Management module - the Lookups Management module loads (two active suite users to open the form for)', async () => {
      first = await userIn('Active');
      second = await userIn('Active');
      await suiteLookupItems.watch(HOME_LIST);
      await lookupRegister.open();
      await expect(lookupRegister.control('searchInput'), 'the Lookups register search').toBeVisible();
    });

    await steps.step('While a form using the list is open elsewhere, add a new active value to the list and save - "Item Created — The lookup item was added." is displayed', async () => {
      tab = await openSecondTab(page);
      openForm = (await openReasonDrawer(tab, first, HOME_LIST)).drawer;
      await view.openList(HOME_LIST);
      await view.items.control('addButton').click();
      await expect(view.drawer.field('title'), 'the Add Lookup Item drawer').toBeVisible();
      await view.drawer.fill({ code, englishName: names.englishName, arabicName: names.arabicName });
      const save = await view.save();
      added = (await readLookupItems(page, HOME_LIST)).find((i) => i.code === code);
      expect.soft(normalise(save.toast), `the toast (CreateLookupItem ${save.status ?? 'not sent'} ${save.answer.slice(0, 160)}; errors ${JSON.stringify(save.errors)})`).toContain(asShown(MESSAGE.created));
      expect(added?.isActive, `the stored new value ${code}`).toBe(true);
    });

    await steps.step('Without restarting the application, reopen the already-open form and check its drop-down - the drop-down list is displayed with the new value', async () => {
      await openForm.cancel();
      const reopened = await openReasonDrawer(tab, first, HOME_LIST, false);
      const offered = await readOpenReasons(reopened.drawer);
      expect(offered, `the reopened form in the other tab (Items answered ${reopened.itemsStatus})`).toContain(names.englishName);
    });

    await steps.step('Open a second, different form that also consumes the same list and check its drop-down - the new value appears with no restart or wait', async () => {
      const { offered, itemsStatus } = await readReasonOffer(page, second, HOME_LIST);
      expect(offered, `the Deactivate drawer of ${second.displayNameEn} (Items answered ${itemsStatus})`).toContain(names.englishName);
      await tab.close();
    });
  });
});
