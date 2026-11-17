import { test, expect, lookupPagesFor } from '../../../utils/lookup/writerBHelpers';
import { CASES, HOME_LIST, VIEW_ONLY_RIGHTS } from '../../../data/lookup/viewLookupItemList.data';

/**
 * User story 20854: View Lookup Item List - Add Item, Edit and Delete are hidden
 * from a user without the matching permission (lead decision 6): baseline with
 * the administrator first, then a suite session whose role holds only
 * VIEW_ONLY_RIGHTS, in a second window. Nothing is changed.
 */
test.describe('US 20854 - View Lookup Item List (permissions)', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.noPermission.azureId}: should hide Add Item, Edit and Delete from a user without the lookup item permissions`, async ({
    steps,
    suiteLookupItems,
    suiteSession,
    itemsView,
  }) => {
    const own = await suiteLookupItems.create(HOME_LIST);
    let viewer!: ReturnType<typeof lookupPagesFor>;

    await steps.critical('Baseline: the administrator opens the list - Add Item, and Edit / Delete on an admin-added item, are offered', async () => {
      await itemsView.openList(HOME_LIST);
      expect(await itemsView.findRow(own.id), `the suite item ${own.code} on the grid`).toBe(true);
      await expect(itemsView.addItemButton(), 'Add Item for the administrator').toBeVisible();
      await expect.poll(() => itemsView.actionStates(own.id, ['edit', 'delete']), { message: `Edit / Delete on ${own.code} for the administrator` }).toEqual({ edit: 'available', delete: 'available' });
    });

    await steps.critical(`Navigate to the Lookups Management module as a user holding only ${VIEW_ONLY_RIGHTS.join(', ')} - the screen loads with view-only access`, async () => {
      const session = await suiteSession({ rights: VIEW_ONLY_RIGHTS });
      viewer = lookupPagesFor(session.page);
      await viewer.register.open();
      await expect(viewer.register.control('searchInput'), 'the Lookups register for the view-only user').toBeVisible();
    });

    await steps.critical('Open the "Lookup Items" screen - the grid lists items', async () => {
      await viewer.items.openList(HOME_LIST);
      await viewer.items.expectRowsRendered();
    });

    await steps.step('Check the toolbar and each item row for Add Item, Edit and Delete controls - Add Item, Edit and Delete are not shown anywhere on the screen', async () => {
      await viewer.items.findRow(own.id);
      await expect
        .poll(
          async () => ({
            addItem: await viewer.items.addItemButton().isVisible(),
            editButtons: await viewer.items.visibleRowActions('edit').count(),
            deleteButtons: await viewer.items.visibleRowActions('delete').count(),
          }),
          { message: 'Add Item / Edit / Delete shown to the view-only user' },
        )
        .toEqual({ addItem: false, editButtons: 0, deleteButtons: 0 });
    });
  });
});
