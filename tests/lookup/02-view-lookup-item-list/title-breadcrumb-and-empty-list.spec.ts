import { test, expect, languageOf, readInBothLanguages, requireEmptyList } from '../../../utils/lookup/writerBHelpers';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { LookupRegisterPage } from '../../../pages/lookup/LookupPages';
import { lookupByCode, type LookupRow } from '../../../utils/lookup/lookupApi';
import {
  CASES,
  EMPTY_LIST_BLOCKED,
  EMPTY_STATE_MESSAGE,
  ERROR_TEXT,
  HOME_LIST,
  SCREEN_TITLE,
} from '../../../data/lookup/viewLookupItemList.data';

/**
 * User story 20854: View Lookup Item List - the screen title, the breadcrumb in
 * the interface language, and an empty list. Read-only.
 */

async function navigate(steps: TestSteps, register: LookupRegisterPage, expected: string): Promise<void> {
  await steps.critical(`Navigate to the Lookups Management module - ${expected}`, async () => {
    await register.open();
    await expect(register.control('searchInput'), 'the Lookups register toolbar').toBeVisible();
  });
}

test.describe('US 20854 - View Lookup Item List (title, breadcrumb, empty list)', () => {
  test.describe.configure({ timeout: 4 * 60_000 });

  test(`TC-${CASES.title.azureId}: should title the items screen exactly "Lookup Items"`, async ({ steps, lookupRegister, itemsView }) => {
    await navigate(steps, lookupRegister, 'the screen loads');

    await steps.critical('Open any lookup list\'s items screen - the screen opens', async () => {
      await itemsView.openList(HOME_LIST);
      await expect(itemsView.table(), 'the Lookup Items grid').toBeVisible();
    });

    await steps.step(`Check the page title at the top of the screen - the title reads exactly "${SCREEN_TITLE}"`, async () => {
      await expect(itemsView.headerTitle(), 'the screen title').toHaveText(SCREEN_TITLE);
    });
  });

  test(`TC-${CASES.breadcrumbLanguage.azureId}: should show the list's name in the breadcrumb in the active interface language`, async ({
    page,
    steps,
    lookupRegister,
    itemsView,
  }) => {
    let list!: LookupRow;
    await steps.critical('Navigate to the Lookups Management module - the screen loads in English', async () => {
      await lookupRegister.open();
      await languageOf(page).switchTo('en');
      await languageOf(page).expectLanguage('en');
      await expect(lookupRegister.control('searchInput'), 'the Lookups register toolbar').toBeVisible();
    });

    await steps.step('Open a lookup list\'s items screen - the breadcrumb shows the list\'s English name', async () => {
      list = await lookupByCode(page, HOME_LIST);
      await itemsView.openList(HOME_LIST);
      await expect(itemsView.breadcrumbName(), 'the last crumb').toHaveText(list.englishName);
    });

    await steps.step('Switch the interface language to Arabic and reopen the same list - the breadcrumb shows the list\'s Arabic name (then back to English)', async () => {
      const shown = await readInBothLanguages(page, itemsView, HOME_LIST, () => itemsView.breadcrumbText());
      expect(shown, `the breadcrumb of ${HOME_LIST} in English / Arabic`).toEqual({ en: list.englishName, ar: list.arabicName });
    });
  });

  test(`TC-${CASES.emptyList.azureId}: should show a clear empty state without errors when a lookup list has no items`, async ({ page, steps, lookupRegister, itemsView }) => {
    let status: number | null = null;
    await navigate(steps, lookupRegister, 'the screen loads');
    const empty = await requireEmptyList(steps, page, EMPTY_LIST_BLOCKED);
    const code = empty?.code ?? '';

    await steps.critical(`Open the items screen for the empty lookup list (${code}) - the screen loads without error`, async () => {
      status = await itemsView.openList(code);
      const toasts = await itemsView.readToasts();
      expect({ itemsAnswer: status, errorToasts: toasts.filter((t) => ERROR_TEXT.test(t)) }, `GET Items/${code} and the toasts`).toEqual({ itemsAnswer: 200, errorToasts: [] });
    });

    await steps.step('Review the grid area - the grid shows a clear empty-state message instead of a broken table or error', async () => {
      await expect(itemsView.emptyBlock(), `the empty state of ${code}`).toBeVisible();
      await expect(itemsView.emptyBlock(), 'the empty-state message').toHaveText(EMPTY_STATE_MESSAGE);
      expect(await itemsView.getRowCount(), 'rows drawn for an empty list').toBe(0);
    });
  });
});
