import {
  test,
  expect,
  CLEAN_OFFER,
  WriterDLookups,
  createRawSuiteItem,
  itemsOf,
  offerReport,
  readProfileField,
  readReasonOffer,
  requireCreated,
  suiteNames,
  switchAndRead,
} from '../../../utils/lookup/writerDHelpers';
import type { LookupAnswer, LookupItem } from '../../../utils/lookup/lookupApi';
import type { ProvisionedUser } from '../../../utils/UserProvisioning';
import { CASES, HOME_LIST, SUITE_USER_GENDER_EN } from '../../../data/lookup/populateDropDownsFromLookupLists.data';

/**
 * User story 20861: Populate Drop-downs From Lookup Lists - the name a form shows
 * follows the interface language, falls back to the other name when one is
 * empty (21211 / 21212: BLOCKED when the server refuses an item with an empty
 * name), and stays right while the language is switched repeatedly (21216).
 * The form is the user Deactivate drawer (home list), opened for an active
 * suite user and cancelled. The UI is switched back to English at the end.
 */
test.describe('US 20861 - Populate Drop-downs From Lookup Lists', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.englishFallback.azureId}: should show the English name in Arabic when the value's Arabic name is empty`, async ({ page, steps, suiteLookupItems, userIn, lookupRegister, languageSwitcher }) => {
    const names = suiteNames();
    const view = new WriterDLookups(page);
    let made!: { answer: LookupAnswer; item?: LookupItem };
    let user!: ProvisionedUser;

    await steps.critical('Precondition: a suite value of the home list with its English name set and its Arabic name EMPTY; a suite user to open the form for', async () => {
      made = await createRawSuiteItem(page, suiteLookupItems, HOME_LIST, { englishName: names.englishName, arabicName: '' });
      requireCreated(steps, made, CASES.englishFallback.blocked);
      user = await userIn('Active');
      expect(made.item?.englishName, `the stored English name of ${made.item?.code}`).toBe(names.englishName);
    });

    await steps.step('Navigate to the Lookups Management module - it loads showing the value with English Name set and Arabic Name empty', async () => {
      await lookupRegister.open();
      await view.openList(HOME_LIST);
      await view.revealItem(HOME_LIST, made.item as LookupItem);
      const row = await view.rowCells((made.item as LookupItem).id);
      expect({ englishName: row.englishName, arabicName: row.arabicName }, `the row of ${made.item?.code}`).toEqual({ englishName: names.englishName, arabicName: '' });
    });

    await steps.step('Switch the interface language to Arabic - the interface renders in Arabic', async () => {
      await languageSwitcher.switchTo('ar');
      expect(await languageSwitcher.currentLanguage(), 'the interface language').toBe('ar');
    });

    await steps.step('Open a form that consumes this lookup list and open its drop-down - the value displays using its English name as a fallback', async () => {
      const { offered, itemsStatus } = await readReasonOffer(page, user, HOME_LIST);
      expect(offered, `the Deactivate drawer in Arabic (Items answered ${itemsStatus})`).toContain(names.englishName);
    });

    await languageSwitcher.switchTo('en');
  });

  test(`TC-${CASES.arabicFallback.azureId}: should show the Arabic name in English when the value's English name is empty`, async ({ page, steps, suiteLookupItems, userIn, lookupRegister, languageSwitcher }) => {
    const names = suiteNames();
    const view = new WriterDLookups(page);
    let made!: { answer: LookupAnswer; item?: LookupItem };
    let user!: ProvisionedUser;

    await steps.critical('Precondition: a suite value of the home list with its Arabic name set and its English name EMPTY; a suite user to open the form for', async () => {
      made = await createRawSuiteItem(page, suiteLookupItems, HOME_LIST, { englishName: '', arabicName: names.arabicName });
      requireCreated(steps, made, CASES.arabicFallback.blocked);
      user = await userIn('Active');
      expect(made.item?.arabicName, `the stored Arabic name of ${made.item?.code}`).toBe(names.arabicName);
    });

    await steps.step('Navigate to the Lookups Management module - it loads showing the value with Arabic Name set and English Name empty', async () => {
      await lookupRegister.open();
      await view.openList(HOME_LIST);
      await view.revealItem(HOME_LIST, made.item as LookupItem);
      const row = await view.rowCells((made.item as LookupItem).id);
      expect({ englishName: row.englishName, arabicName: row.arabicName }, `the row of ${made.item?.code}`).toEqual({ englishName: '', arabicName: names.arabicName });
    });

    await steps.step('Confirm the interface language is set to English - the interface renders in English', async () => {
      await languageSwitcher.switchTo('en');
      expect(await languageSwitcher.currentLanguage(), 'the interface language').toBe('en');
    });

    await steps.step('Open a form that consumes this lookup list and open its drop-down - the value displays using its Arabic name as a fallback', async () => {
      const { offered, itemsStatus } = await readReasonOffer(page, user, HOME_LIST);
      expect(offered, `the Deactivate drawer in English (Items answered ${itemsStatus})`).toContain(names.arabicName);
    });
  });

  test(`TC-${CASES.languageSwitching.azureId}: should keep every drop-down in the selected language while the language is switched repeatedly`, async ({ page, steps, userIn, lookupRegister, languageSwitcher }) => {
    const d = CASES.languageSwitching;
    let items: LookupItem[] = [];
    let user!: ProvisionedUser;

    await steps.critical('Navigate to the Lookups Management module - the Lookups Management module loads (an active suite user to open the form for)', async () => {
      user = await userIn('Active');
      items = await itemsOf(page, HOME_LIST);
      await lookupRegister.open();
      await expect(lookupRegister.control('searchInput'), 'the Lookups register search').toBeVisible();
    });

    await steps.step('Open a form that consumes a lookup list and open its drop-down in English - the drop-down shows English names', async () => {
      await languageSwitcher.switchTo('en');
      const { offered } = await readReasonOffer(page, user, HOME_LIST);
      expect(offerReport(offered, items, 'en'), `the drop-down in English: ${offered.join(' | ')}`).toEqual(CLEAN_OFFER);
    });

    await steps.step(`Switch the interface language ${d.switches} times in quick succession while reopening the drop-down - each reopened drop-down re-renders in the language selected`, async () => {
      const reads = await switchAndRead(page, languageSwitcher, user, HOME_LIST, items, d.switches);
      expect(
        reads.map((r) => ({ lang: r.lang, report: r.report })),
        `the drop-downs: ${reads.map((r) => `${r.lang}: ${r.offered.join(' | ')}`).join(' / ')}`,
      ).toEqual(reads.map((r) => ({ lang: r.lang, report: CLEAN_OFFER })));
    });

    await steps.step('Switch back to English and recheck the same drop-down and the previously opened record - names show in English with no stale, mismatched or blank entries', async () => {
      await languageSwitcher.switchTo('en');
      const { offered } = await readReasonOffer(page, user, HOME_LIST);
      expect.soft(offerReport(offered, items, 'en'), `the drop-down back in English: ${offered.join(' | ')}`).toEqual(CLEAN_OFFER);
      expect(await readProfileField(page, user.id, 'personal', 'Gender'), `the profile of ${user.displayNameEn} back in English`).toBe(SUITE_USER_GENDER_EN);
    });

    await languageSwitcher.switchTo('en');
  });
});
