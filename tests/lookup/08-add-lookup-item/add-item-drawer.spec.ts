import { test, expect, described, wasSaved, englishNameFor, itemsWithCode, norm, openAddForm, pick, uniform } from '../../../utils/lookup/writerEHelpers';
import type { LookupItem } from '../../../utils/lookup/lookupApi';
import {
  ACTIVE_BADGE,
  ARABIC_NAME,
  CASES,
  DEFAULT_ORDER_SHOWN,
  DRAWER_TITLE,
  EMPTY_FIELDS,
  HOME_LIST,
  MESSAGES,
  ORDER_ZERO_CELL,
  PLACEHOLDER,
  PLACEHOLDER_FIELDS,
  PREDEFINED_NO,
} from '../../../data/lookup/addLookupItem.data';

/**
 * User story 20860: Add Lookup Item - the drawer itself, its defaults and a
 * successful add. Every item is a suite item (`QA-AUTO-` code) in the home
 * list, watched first so teardown deletes it. See the data file for the readings.
 */
test.describe('US 20860 - Add Lookup Item', () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.opensFromAddItem.azureId}: should open an empty Add Lookup Item form when Add Item is selected`, async ({ steps, addItems, addDrawer }) => {
    await steps.critical('Navigate to the Lookups Management module - the module loads and shows the lookup list', async () => {
      await addItems.open(HOME_LIST);
      await expect(addItems.control('addButton'), 'the Add Item action on the list').toBeVisible();
    });

    await steps.step('Click the "Add Item" action - the "Add Lookup Item" form opens with all fields empty and ready for input', async () => {
      await openAddForm(addItems, addDrawer);
      await expect(addDrawer.title(), 'the drawer title').toHaveText(DRAWER_TITLE);
      expect(pick(await addDrawer.values(), EMPTY_FIELDS), 'the Code / English / Arabic boxes').toEqual(uniform(EMPTY_FIELDS, ''));
      await expect(addDrawer.field('code'), 'the Code box ready for input').toBeEditable();
      await expect(addDrawer.field('order'), 'Display Order shows its default').toHaveValue(DEFAULT_ORDER_SHOWN);
    });
  });

  test(`TC-${CASES.placeholders.azureId}: should show the placeholder "Enter value" in every input when the form is empty`, async ({ steps, addItems, addDrawer }) => {
    await steps.critical('Navigate to the Lookups Management module - the module loads', async () => {
      await addItems.open(HOME_LIST);
      await expect(addItems.control('addButton'), 'the Add Item action on the list').toBeVisible();
    });

    await steps.critical('Open the "Add Lookup Item" form - the form opens', async () => {
      await openAddForm(addItems, addDrawer);
      await expect(addDrawer.title(), 'the drawer title').toHaveText(DRAWER_TITLE);
    });

    await steps.step('Inspect Code, English Name, Arabic Name and Display Order without entering data - every input shows the placeholder "Enter value"', async () => {
      expect(await addDrawer.placeholders(PLACEHOLDER_FIELDS), `placeholders (values now: ${JSON.stringify(await addDrawer.values())})`).toEqual(uniform(PLACEHOLDER_FIELDS, PLACEHOLDER));
    });
  });

  test(`TC-${CASES.addSuccess.azureId}: should save a new lookup item and list it as active and not predefined when valid values are entered`, async ({ page, steps, suiteLookupItems, addItems, addDrawer }) => {
    await suiteLookupItems.watch(HOME_LIST);
    const code = suiteLookupItems.newCode();
    const englishName = englishNameFor(code);

    await steps.critical('Navigate to the Lookups Management module - the module loads and the target lookup list is displayed', async () => {
      await addItems.open(HOME_LIST);
      await expect(addItems.control('addButton'), 'the Add Item action on the list').toBeVisible();
    });

    await steps.critical('Select "Add Item" on the lookup list - the "Add Lookup Item" form opens with all fields empty and placeholder "Enter value" shown', async () => {
      await openAddForm(addItems, addDrawer);
      await expect(addDrawer.title(), 'the drawer title').toHaveText(DRAWER_TITLE);
      expect(pick(await addDrawer.values(), EMPTY_FIELDS), 'the Code / English / Arabic boxes').toEqual(uniform(EMPTY_FIELDS, ''));
      expect(await addDrawer.placeholders(EMPTY_FIELDS), 'the placeholders').toEqual(uniform(EMPTY_FIELDS, PLACEHOLDER));
    });

    await steps.step('Enter a unique Code, a valid English Name and a valid Arabic Name, leaving Display Order and Is Active untouched - the values appear in their fields', async () => {
      await addDrawer.fill({ code, englishName, arabicName: ARABIC_NAME });
      expect(await addDrawer.values(), 'the drawer values').toEqual({ code, englishName, arabicName: ARABIC_NAME, order: DEFAULT_ORDER_SHOWN, isActive: true });
    });

    await steps.step(`Click Save - "${MESSAGES.created}" is displayed and the item is listed with Display Order 0, Active and not Predefined`, async () => {
      const outcome = await addDrawer.attemptSave();
      expect(wasSaved(outcome), `${described(outcome)}; field errors: ${(await addDrawer.fieldErrors()).join(' | ')}`).toBe(true);
      expect(norm(outcome.toast), 'the confirmation').toBe(norm(MESSAGES.created));
      const saved = await itemsWithCode(page, HOME_LIST, code);
      expect(saved.map((i) => ({ index: i.index, isActive: i.isActive, predefined: i.predefined })), `the stored item ${code}`).toEqual([{ index: 0, isActive: true, predefined: false }]);
      const made: LookupItem = saved[0];
      expect(await addItems.revealItem(made), `the row of ${code} in the list`).toBe(true);
      await expect(addItems.cellOf(made.id, 'order'), 'the Order cell').toHaveText(ORDER_ZERO_CELL);
      await expect(addItems.itemStatusBadge(made.id), 'the Active badge').toHaveText(ACTIVE_BADGE);
      await expect(addItems.predefinedBadge(made.id), 'the Predefined badge').toHaveText(PREDEFINED_NO);
    });
  });

  test(`TC-${CASES.defaults.azureId}: should apply Display Order 0, Is Active and not Predefined when only the mandatory fields are entered`, async ({ page, steps, suiteLookupItems, addItems, addDrawer }) => {
    await suiteLookupItems.watch(HOME_LIST);
    const code = suiteLookupItems.newCode();
    const englishName = englishNameFor(code);
    let made!: LookupItem;

    await steps.critical('Navigate to the Lookups Management module - the module loads', async () => {
      await addItems.open(HOME_LIST);
      await expect(addItems.control('addButton'), 'the Add Item action on the list').toBeVisible();
    });

    await steps.step('Open the "Add Lookup Item" form - an empty form is displayed with the default Display Order and Is Active ticked', async () => {
      await openAddForm(addItems, addDrawer);
      await expect(addDrawer.field('order'), 'Display Order on opening').toHaveValue(DEFAULT_ORDER_SHOWN);
      await expect(addDrawer.field('isActive'), 'Is Active on opening').toBeChecked();
    });

    await steps.step('Enter only Code, English Name and Arabic Name, leaving Display Order and Is Active untouched - the optional fields keep their defaults', async () => {
      await addDrawer.fill({ code, englishName, arabicName: ARABIC_NAME });
      expect(pick(await addDrawer.values(), ['order', 'isActive']), 'the optional fields').toEqual({ order: DEFAULT_ORDER_SHOWN, isActive: true });
    });

    await steps.critical('Click Save - the form validates and submits the entry', async () => {
      const outcome = await addDrawer.attemptSave();
      expect(wasSaved(outcome), `${described(outcome)}; field errors: ${(await addDrawer.fieldErrors()).join(' | ')}`).toBe(true);
      const saved = await itemsWithCode(page, HOME_LIST, code);
      expect(saved, `the stored item ${code}`).toHaveLength(1);
      made = saved[0];
    });

    await steps.step('Open the saved item for review - it is saved with Display Order 0, Is Active ticked and Predefined false', async () => {
      expect({ index: made.index, isActive: made.isActive, predefined: made.predefined }, 'the stored item').toEqual({ index: 0, isActive: true, predefined: false });
      expect(await addItems.revealItem(made), `the row of ${code} in the list`).toBe(true);
      await expect(addItems.predefinedBadge(made.id), 'the Predefined badge').toHaveText(PREDEFINED_NO);
      await addItems.openEdit(made);
      await addDrawer.waitForOpen();
      expect(await addDrawer.values(), 'the saved item in the drawer').toEqual({ code, englishName, arabicName: ARABIC_NAME, order: DEFAULT_ORDER_SHOWN, isActive: true });
    });
  });
});
