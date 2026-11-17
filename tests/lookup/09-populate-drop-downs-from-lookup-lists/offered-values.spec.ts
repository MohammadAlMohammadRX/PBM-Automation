import {
  test,
  expect,
  CLEAN_OFFER,
  WriterDLookups,
  itemsOf,
  labelOf,
  offerReport,
  openReasonDrawer,
  readOpenReasons,
  readReasonOffer,
  storedItem,
  suiteNames,
} from '../../../utils/lookup/writerDHelpers';
import { deleteLookupItem, type LookupItem } from '../../../utils/lookup/lookupApi';
import type { ProvisionedUser } from '../../../utils/UserProvisioning';
import type { UserDeactivateDrawer } from '../../../pages/user/UserDeactivateDrawer';
import { CASES, HOME_LIST } from '../../../data/lookup/populateDropDownsFromLookupLists.data';

/**
 * User story 20861: Populate Drop-downs From Lookup Lists - what the form using
 * the home list offers (the user Deactivate drawer, opened for an active suite
 * user and cancelled): a deleted value is gone, values sharing a display order
 * both appear, and a user without any Lookups right still gets every active
 * value.
 */
test.describe('US 20861 - Populate Drop-downs From Lookup Lists', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.deletedNotOffered.azureId}: should not offer a deleted lookup value in the drop-down for a new entry`, async ({ page, steps, suiteLookupItems, userIn, lookupRegister }) => {
    const view = new WriterDLookups(page);
    let item!: LookupItem;
    let user!: ProvisionedUser;

    await steps.critical('Precondition: a suite value of the home list, then deleted; a suite user to open the form for', async () => {
      item = await suiteLookupItems.create(HOME_LIST, suiteNames());
      user = await userIn('Active');
      const del = await deleteLookupItem(page, item.id);
      expect(del.status, `DeleteLookupItem ${item.code}: ${del.errors.join('; ') || del.text.slice(0, 160)}`).toBeLessThan(300);
    });

    await steps.critical('Navigate to the Lookups Management module - the Lookups Management module loads', async () => {
      await lookupRegister.open();
      await expect(lookupRegister.control('searchInput'), 'the Lookups register search').toBeVisible();
    });

    await steps.step('Confirm the target value no longer exists in the lookup list - the value is absent from the Lookup Items screen', async () => {
      await view.openList(HOME_LIST);
      expect.soft(await view.isItemListed(HOME_LIST, item), `the row of the deleted ${item.code}`).toBe(false);
      expect(await storedItem(page, HOME_LIST, item.id), `GetItems for the deleted ${item.code}`).toBeUndefined();
    });

    await steps.step('Open a form that consumes this lookup list and open its drop-down - the deleted value is not offered for a new record', async () => {
      const { offered, itemsStatus } = await readReasonOffer(page, user, HOME_LIST);
      expect.soft(offered.length, `the Deactivate drawer's reasons (Items answered ${itemsStatus})`).toBeGreaterThan(0);
      expect(offered, `the Deactivate drawer of ${user.displayNameEn}`).not.toContain(labelOf(item, 'en'));
    });
  });

  test(`TC-${CASES.sameDisplayOrder.azureId}: should list both values among the lowest-ordered entries when they share a display order`, async ({ page, steps, suiteLookupItems, userIn, lookupRegister }) => {
    const d = CASES.sameDisplayOrder;
    const view = new WriterDLookups(page);
    const twins: LookupItem[] = [];
    let user!: ProvisionedUser;

    await steps.critical(`Precondition: two active suite values of the home list with Display Order ${d.order}; a suite user to open the form for`, async () => {
      twins.push(await suiteLookupItems.create(HOME_LIST, { ...suiteNames(), index: d.order }));
      twins.push(await suiteLookupItems.create(HOME_LIST, { ...suiteNames(), index: d.order }));
      user = await userIn('Active');
      expect(twins.map((t) => t.index), 'the stored display orders').toEqual([d.order, d.order]);
    });

    await steps.step(`Navigate to the Lookups Management module - it loads and shows both values with Display Order ${d.order}`, async () => {
      await lookupRegister.open();
      await view.openList(HOME_LIST);
      const shown: string[] = [];
      for (const twin of twins) {
        await view.revealItem(HOME_LIST, twin);
        shown.push((await view.rowCells(twin.id)).order);
      }
      expect(shown, `the Order cells of ${twins.map((t) => t.code).join(', ')}`).toEqual([d.orderShown, d.orderShown]);
    });

    await steps.step('Open a form that consumes this lookup list and open its drop-down - both values are listed among the lowest-ordered entries, neither hidden nor duplicated', async () => {
      const items = await itemsOf(page, HOME_LIST);
      const { offered } = await readReasonOffer(page, user, HOME_LIST);
      const lowest = items.filter((i) => i.isActive && i.index <= d.order).length;
      expect.soft(offerReport(offered, items, 'en'), `the drop-down: ${offered.join(' | ')}`).toEqual(CLEAN_OFFER);
      expect(offered.slice(0, lowest), `the first ${lowest} (lowest-ordered) entries`).toEqual(expect.arrayContaining(twins.map((t) => labelOf(t, 'en'))));
    });
  });

  test(`TC-${CASES.noLookupsRight.azureId}: should offer every active value on the form when the user has no Lookups permission`, async ({ page, steps, userIn, userRole, requireShapeApplied }) => {
    const d = CASES.noLookupsRight;
    let items: LookupItem[] = [];
    let target!: ProvisionedUser;

    await steps.critical('Precondition: the home list\'s values (as the administrator reads them) and an active suite user whose Deactivate drawer will be opened', async () => {
      items = await itemsOf(page, HOME_LIST);
      target = await userIn('Active');
      expect(items.filter((i) => i.isActive).length, `active values in ${HOME_LIST}`).toBeGreaterThan(0);
    });

    const s = await userRole.signIn({ with: [...d.rights] });
    requireShapeApplied(s);
    const view = new WriterDLookups(s.page);
    let drawer!: UserDeactivateDrawer;

    await steps.step('Navigate to the Lookups Management module - access to the Lookups management screens is denied or not visible for this user', async () => {
      const screen = await view.lookupsScreen();
      expect(screen.registerShown, `the Lookups register for "${s.role.name}" (${s.rights.join(', ')}; none of ${d.withheld.join(', ')}) at ${screen.url}`).toBe(false);
    });

    await steps.step('Open a form that requires a value from the lookup list - the form loads normally', async () => {
      const opened = await openReasonDrawer(s.page, target, HOME_LIST);
      drawer = opened.drawer;
      await drawer.waitForOpen();
      expect(opened.itemsStatus, `GET Items/${HOME_LIST} for "${s.role.name}"`).toBe(200);
    });

    await steps.step('Open the relevant drop-down on the form - the user can read and select from the full set of active values', async () => {
      const offered = await readOpenReasons(drawer);
      expect(offerReport(offered, items, 'en'), `the drop-down for "${s.role.name}": ${offered.join(' | ')}`).toEqual(CLEAN_OFFER);
    });
  });
});
