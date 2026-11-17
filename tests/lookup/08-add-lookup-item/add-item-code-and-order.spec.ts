import {
  test,
  expect,
  described,
  englishNameFor,
  itemsWithCode,
  norm,
  openAddForm,
  pick,
  registerRowOf,
  uniform,
  wasNotSubmitted,
  wasSaved,
} from '../../../utils/lookup/writerEHelpers';
import type { LookupItem } from '../../../utils/lookup/lookupApi';
import { ARABIC_NAME, CASES, EMPTY_FIELDS, FIELD_ERROR_PATTERN, HOME_LIST, LIST_B, MESSAGES, SHARED_ORDER } from '../../../data/lookup/addLookupItem.data';

/**
 * User story 20860: Add Lookup Item - code uniqueness (per list) and a shared
 * display order. The "existing" item of each case is a suite item created
 * through the API first (the cases' "MED-01" / "order 1" are examples);
 * every list touched is watched, so teardown deletes the suite items.
 */
test.describe('US 20860 - Add Lookup Item', () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.duplicateCode.azureId}: should refuse to save with a message under Code when the code already exists in the same list`, async ({ page, steps, suiteLookupItems, addItems, addDrawer }) => {
    const existingCode = suiteLookupItems.newCode();
    const existing = await suiteLookupItems.create(HOME_LIST, { code: existingCode, englishName: englishNameFor(existingCode), arabicName: ARABIC_NAME });
    const englishName = englishNameFor(suiteLookupItems.newCode());

    await steps.critical(`Navigate to the Lookups Management module - the module loads and shows the existing item with Code "${existingCode}"`, async () => {
      await addItems.open(HOME_LIST);
      expect(await addItems.revealItem(existing), `the row of ${existingCode}`).toBe(true);
      await expect(addItems.cellOf(existing.id, 'code'), 'the existing item\'s Code').toHaveText(existingCode);
    });

    await steps.critical('Open the "Add Lookup Item" form on the same list - an empty form is displayed', async () => {
      await openAddForm(addItems, addDrawer);
      expect(pick(await addDrawer.values(), EMPTY_FIELDS), 'the Code / English / Arabic boxes').toEqual(uniform(EMPTY_FIELDS, ''));
    });

    await steps.step(`Enter "${existingCode}" as the Code with valid English and Arabic names - the Code field shows the duplicate value`, async () => {
      await addDrawer.fill({ code: existingCode, englishName, arabicName: ARABIC_NAME });
      await expect(addDrawer.field('code'), 'the Code box').toHaveValue(existingCode);
    });

    await steps.step('Click Save - the form does not submit, a "code already exists" message shows below Code and the item is not saved', async () => {
      const outcome = await addDrawer.attemptSave();
      const errors = (await addDrawer.fieldErrors()).join(' | ');
      expect(wasNotSubmitted(outcome), described(outcome)).toBe(true);
      expect(outcome.drawerOpen, described(outcome)).toBe(true);
      expect(await addDrawer.fieldError('code'), `the message under Code (all field errors: ${errors || 'none'}; ${described(outcome)})`).toMatch(FIELD_ERROR_PATTERN.duplicateCode);
      expect((await itemsWithCode(page, HOME_LIST, existingCode)).map((i) => i.id), `items with code ${existingCode}`).toEqual([existing.id]);
    });
  });

  test(`TC-${CASES.codeInOtherList.azureId}: should save an item in another list when its code already exists in a different list`, async ({ page, steps, suiteLookupItems, lookupRegister, addItems, addDrawer }) => {
    const code = suiteLookupItems.newCode();
    const inListA = await suiteLookupItems.create(HOME_LIST, { code, englishName: englishNameFor(code), arabicName: ARABIC_NAME });
    await suiteLookupItems.watch(LIST_B);

    await steps.critical(`Navigate to the Lookups Management module - the module loads showing both List A (${HOME_LIST}) and List B (${LIST_B})`, async () => {
      await lookupRegister.open();
      await expect(await registerRowOf(lookupRegister, page, HOME_LIST), `List A ${HOME_LIST} in the register`).toBeVisible();
      await expect(await registerRowOf(lookupRegister, page, LIST_B), `List B ${LIST_B} in the register`).toBeVisible();
    });

    await steps.critical('Open the "Add Lookup Item" form on List B - an empty form is displayed', async () => {
      await addItems.open(LIST_B);
      await openAddForm(addItems, addDrawer);
      expect(pick(await addDrawer.values(), EMPTY_FIELDS), 'the Code / English / Arabic boxes').toEqual(uniform(EMPTY_FIELDS, ''));
    });

    await steps.step(`Enter "${code}" (already used in List A) as the Code with valid English and Arabic names - the Code field shows the value`, async () => {
      await addDrawer.fill({ code, englishName: englishNameFor(code), arabicName: ARABIC_NAME });
      await expect(addDrawer.field('code'), 'the Code box').toHaveValue(code);
    });

    await steps.step('Click Save - the item is saved in List B, the uniqueness rule applying only within one list', async () => {
      const outcome = await addDrawer.attemptSave();
      expect(wasSaved(outcome), `${described(outcome)}; field errors: ${(await addDrawer.fieldErrors()).join(' | ')}`).toBe(true);
      expect(norm(outcome.toast), 'the confirmation').toBe(norm(MESSAGES.created));
      expect((await itemsWithCode(page, LIST_B, code)).length, `items with code ${code} in List B`).toBe(1);
      expect((await itemsWithCode(page, HOME_LIST, code)).map((i) => i.id), `List A still holds its item ${code}`).toEqual([inListA.id]);
    });
  });

  test(`TC-${CASES.sharedOrder.azureId}: should save a second item with the same display order when another item already uses it`, async ({ page, steps, suiteLookupItems, addItems, addDrawer }) => {
    const existingCode = suiteLookupItems.newCode();
    const existing = await suiteLookupItems.create(HOME_LIST, { code: existingCode, englishName: englishNameFor(existingCode), arabicName: ARABIC_NAME, index: SHARED_ORDER });
    const code = suiteLookupItems.newCode();

    await steps.critical(`Navigate to the Lookups Management module - the module loads and shows the existing item with Display Order ${SHARED_ORDER}`, async () => {
      await addItems.open(HOME_LIST);
      expect(await addItems.revealItem(existing), `the row of ${existingCode}`).toBe(true);
      await expect(addItems.cellOf(existing.id, 'order'), 'the existing item\'s Order').toHaveText(String(SHARED_ORDER));
    });

    await steps.critical('Open the "Add Lookup Item" form - an empty form is displayed', async () => {
      await openAddForm(addItems, addDrawer);
      expect(pick(await addDrawer.values(), EMPTY_FIELDS), 'the Code / English / Arabic boxes').toEqual(uniform(EMPTY_FIELDS, ''));
    });

    await steps.step(`Enter a unique Code, valid names and Display Order ${SHARED_ORDER} (as the existing item) - the Display Order field accepts ${SHARED_ORDER}`, async () => {
      await addDrawer.fill({ code, englishName: englishNameFor(code), arabicName: ARABIC_NAME, order: String(SHARED_ORDER) });
      await expect(addDrawer.field('order'), 'the Display Order box').toHaveValue(String(SHARED_ORDER));
    });

    await steps.step(`Click Save - the item is saved with Display Order ${SHARED_ORDER} and both items co-exist in the list without a validation error`, async () => {
      const outcome = await addDrawer.attemptSave();
      const errors = await addDrawer.fieldErrors();
      expect(wasSaved(outcome), `${described(outcome)}; field errors: ${errors.join(' | ')}`).toBe(true);
      expect(errors, 'validation errors').toEqual([]);
      expect(norm(outcome.toast), 'the confirmation').toBe(norm(MESSAGES.created));
      const saved = await itemsWithCode(page, HOME_LIST, code);
      expect(saved.map((i) => i.index), `the stored order of ${code}`).toEqual([SHARED_ORDER]);
      const made: LookupItem = saved[0];
      expect((await itemsWithCode(page, HOME_LIST, [existingCode, code])).map((i) => i.index), 'the stored orders of both items').toEqual([SHARED_ORDER, SHARED_ORDER]);
      expect(await addItems.revealItem(made), `the row of ${code}`).toBe(true);
      await expect(addItems.cellOf(made.id, 'order'), 'the new item\'s Order').toHaveText(String(SHARED_ORDER));
      expect(await addItems.revealItem(existing), `the row of ${existingCode}`).toBe(true);
      await expect(addItems.cellOf(existing.id, 'order'), 'the existing item\'s Order').toHaveText(String(SHARED_ORDER));
    });
  });
});
