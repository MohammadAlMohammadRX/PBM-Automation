import {
  test,
  expect,
  codeOfLength,
  described,
  englishNameFor,
  englishNameOfLength,
  itemsNamed,
  itemsWithCode,
  norm,
  openAddForm,
  pick,
  uniform,
  wasNotSubmitted,
  wasSaved,
} from '../../../utils/lookup/writerEHelpers';
import {
  ARABIC_IN_ENGLISH,
  ARABIC_NAME,
  CASES,
  EMPTY_FIELDS,
  ENGLISH_IN_ARABIC,
  FIELD_ERROR_PATTERN,
  HOME_LIST,
  LIMITS,
  MESSAGES,
  NEGATIVE_ORDER,
  WHITESPACE_CODE,
} from '../../../data/lookup/addLookupItem.data';

/**
 * User story 20860: Add Lookup Item - the drawer's validation. Each case
 * types one invalid value next to valid ones and expects Save to refuse it
 * with the message under that field (no Create accepted, drawer still open,
 * nothing stored). The home list is watched first, so anything saved by
 * mistake is deleted at teardown (blank-code cases: by their tracked name).
 */
test.describe('US 20860 - Add Lookup Item', () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.codeBlank.azureId}: should refuse to save with "This field is required." under Code when the code is left blank`, async ({ page, steps, suiteLookupItems, strayLookupNames, addItems, addDrawer }) => {
    await suiteLookupItems.watch(HOME_LIST);
    const englishName = englishNameFor(suiteLookupItems.newCode());
    strayLookupNames.track(HOME_LIST, englishName);

    await steps.critical('Navigate to the Lookups Management module - the module loads', async () => {
      await addItems.open(HOME_LIST);
      await expect(addItems.control('addButton'), 'the Add Item action on the list').toBeVisible();
    });

    await steps.critical('Open the "Add Lookup Item" form - an empty form is displayed', async () => {
      await openAddForm(addItems, addDrawer);
      expect(pick(await addDrawer.values(), EMPTY_FIELDS), 'the Code / English / Arabic boxes').toEqual(uniform(EMPTY_FIELDS, ''));
    });

    await steps.step('Leave Code empty and fill English Name and Arabic Name with valid values - Code remains blank', async () => {
      await addDrawer.fill({ englishName, arabicName: ARABIC_NAME });
      expect(pick(await addDrawer.values(), ['code', 'englishName', 'arabicName']), 'the drawer values').toEqual({ code: '', englishName, arabicName: ARABIC_NAME });
    });

    await steps.step(`Click Save - the form does not submit, "${MESSAGES.required}" shows under Code and the item is not saved`, async () => {
      const outcome = await addDrawer.attemptSave();
      const errors = (await addDrawer.fieldErrors()).join(' | ');
      expect(wasNotSubmitted(outcome), described(outcome)).toBe(true);
      expect(outcome.drawerOpen, described(outcome)).toBe(true);
      expect(norm(await addDrawer.fieldError('code')), `the message under Code (all field errors: ${errors || 'none'})`).toBe(norm(MESSAGES.required));
      expect(await itemsNamed(page, HOME_LIST, englishName), `items stored as "${englishName}"`).toEqual([]);
    });
  });

  test(`TC-${CASES.englishBlank.azureId}: should refuse to save with "This field is required." under English Name when it is left blank`, async ({ page, steps, suiteLookupItems, addItems, addDrawer }) => {
    await suiteLookupItems.watch(HOME_LIST);
    const code = suiteLookupItems.newCode();

    await steps.critical('Navigate to the Lookups Management module - the module loads', async () => {
      await addItems.open(HOME_LIST);
      await expect(addItems.control('addButton'), 'the Add Item action on the list').toBeVisible();
    });

    await steps.critical('Open the "Add Lookup Item" form - an empty form is displayed', async () => {
      await openAddForm(addItems, addDrawer);
      expect(pick(await addDrawer.values(), EMPTY_FIELDS), 'the Code / English / Arabic boxes').toEqual(uniform(EMPTY_FIELDS, ''));
    });

    await steps.step('Enter a valid Code and Arabic Name, leaving English Name blank - English Name remains blank', async () => {
      await addDrawer.fill({ code, arabicName: ARABIC_NAME });
      expect(pick(await addDrawer.values(), ['code', 'englishName', 'arabicName']), 'the drawer values').toEqual({ code, englishName: '', arabicName: ARABIC_NAME });
    });

    await steps.step(`Click Save - the form does not submit, "${MESSAGES.required}" shows under English Name and the item is not saved`, async () => {
      const outcome = await addDrawer.attemptSave();
      const errors = (await addDrawer.fieldErrors()).join(' | ');
      expect(wasNotSubmitted(outcome), described(outcome)).toBe(true);
      expect(outcome.drawerOpen, described(outcome)).toBe(true);
      expect(norm(await addDrawer.fieldError('englishName')), `the message under English Name (all field errors: ${errors || 'none'})`).toBe(norm(MESSAGES.required));
      expect(await itemsWithCode(page, HOME_LIST, code), `items stored with code ${code}`).toEqual([]);
    });
  });

  test(`TC-${CASES.arabicBlank.azureId}: should refuse to save with "This field is required." under Arabic Name when it is left blank`, async ({ page, steps, suiteLookupItems, addItems, addDrawer }) => {
    await suiteLookupItems.watch(HOME_LIST);
    const code = suiteLookupItems.newCode();
    const englishName = englishNameFor(code);

    await steps.critical('Navigate to the Lookups Management module - the module loads', async () => {
      await addItems.open(HOME_LIST);
      await expect(addItems.control('addButton'), 'the Add Item action on the list').toBeVisible();
    });

    await steps.critical('Open the "Add Lookup Item" form - an empty form is displayed', async () => {
      await openAddForm(addItems, addDrawer);
      expect(pick(await addDrawer.values(), EMPTY_FIELDS), 'the Code / English / Arabic boxes').toEqual(uniform(EMPTY_FIELDS, ''));
    });

    await steps.step('Enter a valid Code and English Name, leaving Arabic Name blank - Arabic Name remains blank', async () => {
      await addDrawer.fill({ code, englishName });
      expect(pick(await addDrawer.values(), ['code', 'englishName', 'arabicName']), 'the drawer values').toEqual({ code, englishName, arabicName: '' });
    });

    await steps.step(`Click Save - the form does not submit, "${MESSAGES.required}" shows under Arabic Name and the item is not saved`, async () => {
      const outcome = await addDrawer.attemptSave();
      const errors = (await addDrawer.fieldErrors()).join(' | ');
      expect(wasNotSubmitted(outcome), described(outcome)).toBe(true);
      expect(outcome.drawerOpen, described(outcome)).toBe(true);
      expect(norm(await addDrawer.fieldError('arabicName')), `the message under Arabic Name (all field errors: ${errors || 'none'})`).toBe(norm(MESSAGES.required));
      expect(await itemsWithCode(page, HOME_LIST, code), `items stored with code ${code}`).toEqual([]);
    });
  });

  test(`TC-${CASES.whitespaceCode.azureId}: should treat a whitespace-only code as empty and refuse to save with "This field is required."`, async ({ page, steps, suiteLookupItems, strayLookupNames, addItems, addDrawer }) => {
    await suiteLookupItems.watch(HOME_LIST);
    const englishName = englishNameFor(suiteLookupItems.newCode());
    strayLookupNames.track(HOME_LIST, englishName);

    await steps.critical('Navigate to the Lookups Management module - the module loads', async () => {
      await addItems.open(HOME_LIST);
      await expect(addItems.control('addButton'), 'the Add Item action on the list').toBeVisible();
    });

    await steps.critical('Open the "Add Lookup Item" form - an empty form is displayed', async () => {
      await openAddForm(addItems, addDrawer);
      expect(pick(await addDrawer.values(), EMPTY_FIELDS), 'the Code / English / Arabic boxes').toEqual(uniform(EMPTY_FIELDS, ''));
    });

    await steps.step('Enter only whitespace into Code and valid values into the other mandatory fields - the Code field appears to contain text', async () => {
      await addDrawer.fill({ code: WHITESPACE_CODE, englishName, arabicName: ARABIC_NAME });
      await expect(addDrawer.field('code'), 'the Code box').toHaveValue(WHITESPACE_CODE);
    });

    await steps.step(`Click Save - the form does not submit, "${MESSAGES.required}" shows under Code and the item is not saved`, async () => {
      const outcome = await addDrawer.attemptSave();
      const errors = (await addDrawer.fieldErrors()).join(' | ');
      expect(wasNotSubmitted(outcome), described(outcome)).toBe(true);
      expect(outcome.drawerOpen, described(outcome)).toBe(true);
      expect(norm(await addDrawer.fieldError('code')), `the message under Code (all field errors: ${errors || 'none'})`).toBe(norm(MESSAGES.required));
      expect(await itemsNamed(page, HOME_LIST, englishName), `items stored as "${englishName}"`).toEqual([]);
    });
  });

  test(`TC-${CASES.codeMax.azureId}: should save a code of exactly the maximum length when 100 characters are entered`, async ({ page, steps, suiteLookupItems, addItems, addDrawer }) => {
    await suiteLookupItems.watch(HOME_LIST);
    const base = suiteLookupItems.newCode();
    const code = codeOfLength(base, LIMITS.codeMax);
    const englishName = englishNameFor(base);

    await steps.critical('Navigate to the Lookups Management module - the module loads', async () => {
      await addItems.open(HOME_LIST);
      await expect(addItems.control('addButton'), 'the Add Item action on the list').toBeVisible();
    });

    await steps.critical('Open the "Add Lookup Item" form - an empty form is displayed', async () => {
      await openAddForm(addItems, addDrawer);
      expect(pick(await addDrawer.values(), EMPTY_FIELDS), 'the Code / English / Arabic boxes').toEqual(uniform(EMPTY_FIELDS, ''));
    });

    await steps.step(`Enter a Code of exactly ${LIMITS.codeMax} characters with valid English and Arabic names - the Code field shows the entered text`, async () => {
      await addDrawer.fill({ code, englishName, arabicName: ARABIC_NAME });
      await expect(addDrawer.field('code'), `the Code box (${code.length} characters typed)`).toHaveValue(code);
    });

    await steps.step(`Click Save - the item is saved and "${MESSAGES.created}" is displayed`, async () => {
      const outcome = await addDrawer.attemptSave();
      expect(wasSaved(outcome), `${described(outcome)}; field errors: ${(await addDrawer.fieldErrors()).join(' | ')}`).toBe(true);
      expect(norm(outcome.toast), 'the confirmation').toBe(norm(MESSAGES.created));
      expect((await itemsWithCode(page, HOME_LIST, code)).map((i) => i.code.length), 'the stored code length').toEqual([LIMITS.codeMax]);
    });
  });

  test(`TC-${CASES.codeTooLong.azureId}: should refuse to save with a length message under Code when the code has 101 characters`, async ({ page, steps, suiteLookupItems, addItems, addDrawer }) => {
    await suiteLookupItems.watch(HOME_LIST);
    const base = suiteLookupItems.newCode();
    const code = codeOfLength(base, LIMITS.codeMax + 1);
    const englishName = englishNameFor(base);

    await steps.critical('Navigate to the Lookups Management module - the module loads', async () => {
      await addItems.open(HOME_LIST);
      await expect(addItems.control('addButton'), 'the Add Item action on the list').toBeVisible();
    });

    await steps.critical('Open the "Add Lookup Item" form - an empty form is displayed', async () => {
      await openAddForm(addItems, addDrawer);
      expect(pick(await addDrawer.values(), EMPTY_FIELDS), 'the Code / English / Arabic boxes').toEqual(uniform(EMPTY_FIELDS, ''));
    });

    await steps.step(`Enter a Code of ${LIMITS.codeMax + 1} characters with valid English and Arabic names - the Code field shows the entered text`, async () => {
      await addDrawer.fill({ code, englishName, arabicName: ARABIC_NAME });
      await expect(addDrawer.field('code'), `the Code box (${code.length} characters typed)`).toHaveValue(code);
    });

    await steps.step('Click Save - the form does not submit, a maximum-length message shows under Code and the item is not saved', async () => {
      const outcome = await addDrawer.attemptSave();
      const errors = (await addDrawer.fieldErrors()).join(' | ');
      expect(wasNotSubmitted(outcome), described(outcome)).toBe(true);
      expect(outcome.drawerOpen, described(outcome)).toBe(true);
      expect(await addDrawer.fieldError('code'), `the message under Code (all field errors: ${errors || 'none'})`).toMatch(FIELD_ERROR_PATTERN.codeTooLong);
      expect(await itemsWithCode(page, HOME_LIST, [code, code.slice(0, LIMITS.codeMax)]), 'items stored with the long code (or its first 100 characters)').toEqual([]);
    });
  });

  test(`TC-${CASES.englishTooLong.azureId}: should refuse to save with a length message under English Name when it has 201 characters`, async ({ page, steps, suiteLookupItems, addItems, addDrawer }) => {
    await suiteLookupItems.watch(HOME_LIST);
    const code = suiteLookupItems.newCode();
    const englishName = englishNameOfLength(englishNameFor(code), LIMITS.englishMax + 1);

    await steps.critical('Navigate to the Lookups Management module - the module loads', async () => {
      await addItems.open(HOME_LIST);
      await expect(addItems.control('addButton'), 'the Add Item action on the list').toBeVisible();
    });

    await steps.critical('Open the "Add Lookup Item" form - an empty form is displayed', async () => {
      await openAddForm(addItems, addDrawer);
      expect(pick(await addDrawer.values(), EMPTY_FIELDS), 'the Code / English / Arabic boxes').toEqual(uniform(EMPTY_FIELDS, ''));
    });

    await steps.step(`Enter a valid Code, an English Name of ${LIMITS.englishMax + 1} English letters and a valid Arabic Name - the English Name field shows the entered text`, async () => {
      await addDrawer.fill({ code, englishName, arabicName: ARABIC_NAME });
      await expect(addDrawer.field('englishName'), `the English Name box (${englishName.length} characters typed)`).toHaveValue(englishName);
    });

    await steps.step('Click Save - the form does not submit, a maximum-length message shows under English Name and the item is not saved', async () => {
      const outcome = await addDrawer.attemptSave();
      const errors = (await addDrawer.fieldErrors()).join(' | ');
      expect(wasNotSubmitted(outcome), described(outcome)).toBe(true);
      expect(outcome.drawerOpen, described(outcome)).toBe(true);
      expect(await addDrawer.fieldError('englishName'), `the message under English Name (all field errors: ${errors || 'none'})`).toMatch(FIELD_ERROR_PATTERN.englishTooLong);
      expect(await itemsWithCode(page, HOME_LIST, code), `items stored with code ${code}`).toEqual([]);
    });
  });

  test(`TC-${CASES.englishLettersInArabic.azureId}: should refuse to save with "Arabic letters only." when English letters are typed in the Arabic name`, async ({ page, steps, suiteLookupItems, addItems, addDrawer }) => {
    await suiteLookupItems.watch(HOME_LIST);
    const code = suiteLookupItems.newCode();
    const englishName = englishNameFor(code);

    await steps.critical('Navigate to the Lookups Management module - the module loads', async () => {
      await addItems.open(HOME_LIST);
      await expect(addItems.control('addButton'), 'the Add Item action on the list').toBeVisible();
    });

    await steps.critical('Open the "Add Lookup Item" form - an empty form is displayed', async () => {
      await openAddForm(addItems, addDrawer);
      expect(pick(await addDrawer.values(), EMPTY_FIELDS), 'the Code / English / Arabic boxes').toEqual(uniform(EMPTY_FIELDS, ''));
    });

    await steps.step('Enter a valid Code and English Name, then type English letters into Arabic Name - the Arabic Name field shows the English text', async () => {
      await addDrawer.fill({ code, englishName, arabicName: ENGLISH_IN_ARABIC });
      await expect(addDrawer.field('arabicName'), 'the Arabic Name box').toHaveValue(ENGLISH_IN_ARABIC);
    });

    await steps.step(`Click Save - the form does not submit, "${MESSAGES.arabicOnly}" shows under Arabic Name and the item is not saved`, async () => {
      const outcome = await addDrawer.attemptSave();
      const errors = (await addDrawer.fieldErrors()).join(' | ');
      expect(wasNotSubmitted(outcome), described(outcome)).toBe(true);
      expect(outcome.drawerOpen, described(outcome)).toBe(true);
      expect(norm(await addDrawer.fieldError('arabicName')), `the message under Arabic Name (all field errors: ${errors || 'none'})`).toBe(norm(MESSAGES.arabicOnly));
      expect(await itemsWithCode(page, HOME_LIST, code), `items stored with code ${code}`).toEqual([]);
    });
  });

  test(`TC-${CASES.arabicLettersInEnglish.azureId}: should refuse to save with "English letters only." when Arabic letters are typed in the English name`, async ({ page, steps, suiteLookupItems, addItems, addDrawer }) => {
    await suiteLookupItems.watch(HOME_LIST);
    const code = suiteLookupItems.newCode();

    await steps.critical('Navigate to the Lookups Management module - the module loads', async () => {
      await addItems.open(HOME_LIST);
      await expect(addItems.control('addButton'), 'the Add Item action on the list').toBeVisible();
    });

    await steps.critical('Open the "Add Lookup Item" form - an empty form is displayed', async () => {
      await openAddForm(addItems, addDrawer);
      expect(pick(await addDrawer.values(), EMPTY_FIELDS), 'the Code / English / Arabic boxes').toEqual(uniform(EMPTY_FIELDS, ''));
    });

    await steps.step('Enter a valid Code, type Arabic letters into English Name and enter a valid Arabic Name - the English Name field shows the Arabic text', async () => {
      await addDrawer.fill({ code, englishName: ARABIC_IN_ENGLISH, arabicName: ARABIC_NAME });
      await expect(addDrawer.field('englishName'), 'the English Name box').toHaveValue(ARABIC_IN_ENGLISH);
    });

    await steps.step(`Click Save - the form does not submit, "${MESSAGES.englishOnly}" shows under English Name and the item is not saved`, async () => {
      const outcome = await addDrawer.attemptSave();
      const errors = (await addDrawer.fieldErrors()).join(' | ');
      expect(wasNotSubmitted(outcome), described(outcome)).toBe(true);
      expect(outcome.drawerOpen, described(outcome)).toBe(true);
      expect(norm(await addDrawer.fieldError('englishName')), `the message under English Name (all field errors: ${errors || 'none'})`).toBe(norm(MESSAGES.englishOnly));
      expect(await itemsWithCode(page, HOME_LIST, code), `items stored with code ${code}`).toEqual([]);
    });
  });

  test(`TC-${CASES.negativeOrder.azureId}: should refuse to save with a whole-number message under Display Order when the order is negative`, async ({ page, steps, suiteLookupItems, addItems, addDrawer }) => {
    await suiteLookupItems.watch(HOME_LIST);
    const code = suiteLookupItems.newCode();
    const englishName = englishNameFor(code);

    await steps.critical('Navigate to the Lookups Management module - the module loads', async () => {
      await addItems.open(HOME_LIST);
      await expect(addItems.control('addButton'), 'the Add Item action on the list').toBeVisible();
    });

    await steps.critical('Open the "Add Lookup Item" form - an empty form is displayed', async () => {
      await openAddForm(addItems, addDrawer);
      expect(pick(await addDrawer.values(), EMPTY_FIELDS), 'the Code / English / Arabic boxes').toEqual(uniform(EMPTY_FIELDS, ''));
    });

    await steps.step(`Enter a valid Code, English Name and Arabic Name and set Display Order to ${NEGATIVE_ORDER} - the Display Order field shows ${NEGATIVE_ORDER}`, async () => {
      await addDrawer.fill({ code, englishName, arabicName: ARABIC_NAME, order: NEGATIVE_ORDER });
      await expect(addDrawer.field('order'), 'the Display Order box').toHaveValue(NEGATIVE_ORDER);
    });

    await steps.step('Click Save - the form does not submit, a "whole numbers from 0 upward" message shows under Display Order and the item is not saved', async () => {
      const outcome = await addDrawer.attemptSave();
      const errors = (await addDrawer.fieldErrors()).join(' | ');
      expect(wasNotSubmitted(outcome), described(outcome)).toBe(true);
      expect(outcome.drawerOpen, described(outcome)).toBe(true);
      expect(await addDrawer.fieldError('order'), `the message under Display Order (all field errors: ${errors || 'none'})`).toMatch(FIELD_ERROR_PATTERN.negativeOrder);
      expect(await itemsWithCode(page, HOME_LIST, code), `items stored with code ${code}`).toEqual([]);
    });
  });
});
