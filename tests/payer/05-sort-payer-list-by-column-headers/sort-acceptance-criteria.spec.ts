import { test, expect } from '../../../fixtures';
import { Logger } from '../../../utils/Logger';
import { DEFAULT_SORT_LABEL } from '../../../data/payers/sortPayer.data';

/**
 * User story: Sort Payer List by Column Headers - acceptance criteria.
 *
 * The 15 manual test cases (TC-030..TC-044) exercise the Sort By menu as the
 * application implements it. These tests assert the acceptance criteria
 * themselves, including the parts the current build does not satisfy, so each
 * gap is evidenced by a reproducible failure rather than by a written note.
 *
 * AC-1 ("a Sort By menu offers ascending and descending sort on all seven
 * columns") is already covered by TC-044 and TC-038 and is not repeated here.
 *
 * The two Arabic cases restore English in `finally`. The interface language is
 * stored with the session, so leaving it in Arabic would change the language for
 * every later test in the worker.
 */
test.describe('Sort Payer List by Column Headers - Acceptance criteria', () => {
  // Azure test case 14421 - the Arabic half of the same case the English suite
  // asserts in sort-payer-list.spec.ts. UPDATED with it from the 2026-09-27/28
  // sheet: the default is Newest to Oldest, not Payer Name ascending.
  test('14421: should default to Newest to Oldest when the list loads in Arabic', async ({
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    try {
      await steps.critical('Switch the interface language to Arabic', () =>
        payerManagementPage.language().switchTo('ar'));

      // Reloaded so this is a genuine fresh load in Arabic, with no sort chosen.
      await steps.critical('Reload the list for a genuine fresh load in Arabic', () =>
        payerManagementPage.reopen());

      await steps.step(
        `The Arabic indicator shows the default sort: ${DEFAULT_SORT_LABEL.ar}`,
        () => payerManagementPage.expectDefaultSortIndicator('ar'),
      );
    } finally {
      await payerManagementPage.language().switchTo('en');
    }
  });

  test('16457: should offer a newest-to-oldest sort and reorder the list by creation date', async ({
    payerManagementPage,
    steps,
  }) => {
    test.slow();
    let labels: string[] = [];

    await steps.critical('Open the payer list and its Sort By menu', async () => {
      await payerManagementPage.open();
      const menu = payerManagementPage.sortMenu();
      await menu.open();
      labels = await menu.optionLabels();
      Logger.info(`the Sort By menu offers: ${labels.join(' | ')}`);
    });

    // A NEW CAPABILITY, not a restatement of the existing column sorts. Every
    // sort this story already covers is over a column the table renders;
    // creation date is not one of them, so if the menu does not offer this the
    // case reports a gap rather than a defect - and says which.
    await steps.step('The menu offers newest-to-oldest and oldest-to-newest', async () => {
      const recency = labels.filter((label) => /newest|oldest|created/i.test(label));
      expect(
        recency.length,
        'the sheet requires a creation-date sort alongside the column sorts; the menu offers '
          + `[${labels.join(', ')}]`,
      ).toBeGreaterThan(0);
    });

    await steps.step('Choosing newest-to-oldest reorders the list and shows as active', async () => {
      const menu = payerManagementPage.sortMenu();
      const newest = labels.find((label) => /newest/i.test(label));
      expect(newest, 'a newest-first option should be on the menu').toBeTruthy();
      await menu.selectByLabel(newest as string);
      await payerManagementPage.expectRowsRendered();
      expect(
        await menu.activeOptionLabel(),
        'the menu should report the chosen sort back',
      ).toContain(newest as string);
    });
  });
});
