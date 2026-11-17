import { test, expect, WriterDLookups, normalise, predefinedItem, suiteNames } from '../../../utils/lookup/writerDHelpers';
import type { LookupItem } from '../../../utils/lookup/lookupApi';
import type { LookupItemLink } from '../../../utils/lookup/lookupInUse';
import { CASES, HOME_LIST, MESSAGE } from '../../../data/lookup/editLookupItem.data';

/**
 * User story 20858: Edit Lookup Item - when Edit is NOT allowed: a predefined
 * value (disabled, with the tooltip), a value in use by a record, and a role
 * without the edit right. The predefined row is only inspected and hovered;
 * the in-use item is a suite item held by a suite record (linkLookupItem).
 */
test.describe('US 20858 - Edit Lookup Item', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.predefinedLocked.azureId}: should disable Edit and explain why when the value is predefined`, async ({ page, steps, lookupRegister }) => {
    const view = new WriterDLookups(page);
    let predefined!: LookupItem;

    await steps.critical('Navigate to the Lookups Management module - the list of lookups is displayed', async () => {
      predefined = await predefinedItem(page, HOME_LIST);
      await lookupRegister.open();
      await expect(lookupRegister.control('searchInput'), 'the Lookups register search').toBeVisible();
    });

    await steps.step('Locate a predefined item - its Edit button/control is disabled', async () => {
      await view.openList(HOME_LIST);
      await view.revealItem(HOME_LIST, predefined);
      await expect(view.items.predefinedBadge(predefined.id), `the Predefined badge of ${predefined.code}`).toHaveText('Yes');
      await expect(view.items.rowAction(predefined.id, 'edit'), `Edit on the predefined ${predefined.code}`).toBeDisabled();
    });

    await steps.step('Point at (hover) the disabled Edit control - a tooltip reads "Predefined values are part of the system and cannot be edited or deleted." and the item cannot be edited', async () => {
      const tip = await view.tooltipOf(view.items.rowAction(predefined.id, 'edit'));
      expect.soft(tip, `the tooltip on the disabled Edit of ${predefined.code}`).toBe(normalise(MESSAGE.predefinedLocked));
      await expect(view.items.rowAction(predefined.id, 'edit'), 'Edit after pointing at it').toBeDisabled();
    });
  });

  test(`TC-${CASES.inUseRefused.azureId}: should refuse to edit an admin-added item when it is already used by a record`, async ({ page, steps, suiteLookupItems, linkLookupItem, lookupRegister }) => {
    const view = new WriterDLookups(page);
    let item!: LookupItem;
    let link!: LookupItemLink;

    await steps.critical('Navigate to the Lookups Management module - the list of lookups is displayed (a non-predefined suite item is held by a suite record)', async () => {
      item = await suiteLookupItems.create(HOME_LIST, suiteNames());
      link = await linkLookupItem(HOME_LIST, item);
      await lookupRegister.open();
      await expect(lookupRegister.control('searchInput'), 'the Lookups register search').toBeVisible();
    });

    await steps.step('Locate the non-predefined, in-use item and attempt to Edit it - the system refuses the edit because the item is already used by records', async () => {
      await view.openList(HOME_LIST);
      await view.revealItem(HOME_LIST, item);
      await expect(view.items.predefinedBadge(item.id), `the Predefined badge of ${item.code}`).toHaveText('No');
      const attempt = await view.attemptEdit(HOME_LIST, item, CASES.inUseRefused.englishName, MESSAGE.discardChanges);
      const shown = `Edit ${attempt.editState}; save ${attempt.save ? `UpdateLookupItem ${attempt.save.status ?? 'not sent'} ${attempt.save.answer.slice(0, 160)}, toast "${attempt.save.toast}", errors ${JSON.stringify(attempt.save.errors)}` : 'not made'}; stored English name "${attempt.stored?.englishName}"; held by ${link.description}`;
      expect(attempt.refused, `the edit of an in-use item (${shown})`).toBe(true);
    });
  });

  test(`TC-${CASES.editPermission.azureId}: should offer no Edit action when the user is not a System Administrator`, async ({ page, steps, suiteLookupItems, userRole, requireShapeApplied }) => {
    const admin = new WriterDLookups(page);
    let item!: LookupItem;

    await steps.critical('Baseline: the administrator is offered an enabled Edit on a suite item', async () => {
      item = await suiteLookupItems.create(HOME_LIST, suiteNames());
      await admin.openList(HOME_LIST);
      await admin.revealItem(HOME_LIST, item);
      await expect(admin.items.rowAction(item.id, 'edit'), `Edit on ${item.code} for the administrator`).toBeEnabled();
    });

    const s = await userRole.signIn({ with: [...CASES.editPermission.rights] });
    requireShapeApplied(s);
    const view = new WriterDLookups(s.page);
    let reach!: Awaited<ReturnType<WriterDLookups['editReach']>>;

    await steps.step('Navigate to the Lookups Management module - the module is inaccessible or shown without edit controls for this role', async () => {
      reach = await view.editReach(HOME_LIST, item);
      expect(reach.listShown && reach.enabledEdits > 0, `for "${s.role.name}" (${s.rights.join(', ')}): items screen ${reach.listShown ? 'shown' : 'not shown'} at ${reach.url}, ${reach.enabledEdits} enabled Edit button(s)`).toBe(false);
    });

    await steps.step('Look for the Edit action on any lookup item - Edit is not available to users who are not System Administrators', async () => {
      expect(reach.editState, `Edit on ${item.code} for "${s.role.name}" (listed: ${reach.listed})`).not.toBe('available');
    });
  });
});
