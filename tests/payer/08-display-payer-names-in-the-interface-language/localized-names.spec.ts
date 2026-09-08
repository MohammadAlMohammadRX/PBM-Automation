import { test, expect } from '../../../fixtures';
import { PAYER_COLUMN } from '../../../constants/ElementIds';
import {
  EXECUTABLE_NAME_CASES,
  LANGUAGE_TOGGLE_SEQUENCE,
  NAME_RESOLUTION_CASES,
} from '../../../data/payers/localizedName.data';

/** The column this story is about, named once. */
const NAME_COLUMN = PAYER_COLUMN.payerName;

/**
 * User story: Display Payer Names in the Interface Language.
 * The localized name shown in the list, on the card and in the detail header.
 *
 * The finding this story rests on: the payer name cell keeps the SAME element
 * id in both languages (`...-cell-payernameen`) while its CONTENT switches -
 * the English run shows "AAA" in that cell, the Arabic run shows "سسس". So one
 * locator serves both languages and every assertion here is purely about which
 * stored name the application chose to display.
 *
 * Every test captures the payer's RECORD ID while the UI is still in the
 * language it was found in, then addresses the row by that id. This is not
 * incidental: once the language switches, the name used to find the row is no
 * longer on screen, so a text-located row would simply stop resolving.
 *
 * `publishedPayer` provisions a live payer whose two names cannot be confused
 * for one another, so "the right name is showing" is a real assertion rather
 * than a coincidence of similar strings. It is removed in teardown.
 */
test.describe('Display Payer Names in the Interface Language - Language selection', () => {
  test('TC-001: should display the Arabic name across list, card and detail when the UI is Arabic', async ({
    payerManagementPage,
    payerCards,
    languageSwitcher,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    let payerId = '';
    await steps.critical('Locate the payer and capture its record id', async () => {
      await payerManagementPage.search(publishedPayer.nameEn);
      payerId = await payerManagementPage.recordIdOf(publishedPayer.nameEn);
      expect(payerId, 'the payer must be findable before the language changes').not.toBe('');
    });

    await steps.critical('Switch the interface language to Arabic', () =>
      languageSwitcher.switchTo('ar'));

    await steps.step('The list shows the Arabic name for that payer', () =>
      payerManagementPage.expectCellById(payerId, NAME_COLUMN, publishedPayer.nameAr));

    await steps.step('The card view shows the same Arabic name', async () => {
      await payerCards.open();
      await payerCards.expectTitle(payerId, publishedPayer.nameAr);
    });

    await steps.step('The detail header shows the same Arabic name', async () => {
      const detail = await payerManagementPage.openDetails(publishedPayer.nameAr);
      await detail.waitForLoaded();
      await detail.expectDisplayName(publishedPayer.nameAr);
    });
  });

  test('TC-002: should display the English name across list, card and detail when the UI is English', async ({
    payerManagementPage,
    payerCards,
    languageSwitcher,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Ensure the interface language is English', () =>
      languageSwitcher.switchTo('en'));

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    let payerId = '';
    await steps.critical('Locate the payer and capture its record id', async () => {
      await payerManagementPage.search(publishedPayer.nameEn);
      payerId = await payerManagementPage.recordIdOf(publishedPayer.nameEn);
      expect(payerId).not.toBe('');
    });

    await steps.step('The list shows the English name', () =>
      payerManagementPage.expectCellById(payerId, NAME_COLUMN, publishedPayer.nameEn));

    await steps.step('The card view shows the same English name', async () => {
      await payerCards.open();
      await payerCards.expectTitle(payerId, publishedPayer.nameEn);
    });

    await steps.step('The detail header shows the same English name', async () => {
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.waitForLoaded();
      await detail.expectDisplayName(publishedPayer.nameEn);
    });
  });

  test('TC-007: should update displayed payer names when the interface language is switched', async ({
    payerManagementPage,
    languageSwitcher,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Ensure the interface language is English', () =>
      languageSwitcher.switchTo('en'));
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    let payerId = '';
    await steps.critical('Locate the payer and capture its record id', async () => {
      await payerManagementPage.search(publishedPayer.nameEn);
      payerId = await payerManagementPage.recordIdOf(publishedPayer.nameEn);
      expect(payerId).not.toBe('');
    });

    await steps.step('The list starts out showing the English name', () =>
      payerManagementPage.expectCellById(payerId, NAME_COLUMN, publishedPayer.nameEn));

    // The switch must take effect WITHOUT navigating away from the module,
    // which is the state transition the case is about - so the row is re-read
    // in place rather than after a fresh `open()`.
    await steps.critical('Switch to Arabic using the language toggle', () =>
      languageSwitcher.switchTo('ar'));

    await steps.step('The names update to Arabic without leaving the module', async () => {
      await languageSwitcher.expectRightToLeft();
      await payerManagementPage.expectCellById(payerId, NAME_COLUMN, publishedPayer.nameAr);
    });

    await steps.critical('Switch back to English', () => languageSwitcher.switchTo('en'));

    await steps.step('The names revert to English', async () => {
      await languageSwitcher.expectLeftToRight();
      await payerManagementPage.expectCellById(payerId, NAME_COLUMN, publishedPayer.nameEn);
    });
  });

  test('TC-006: should resolve every language and name-availability combination correctly', async ({
    payerManagementPage,
    languageSwitcher,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    let payerId = '';
    await steps.critical('Locate the payer and capture its record id', async () => {
      await payerManagementPage.search(publishedPayer.nameEn);
      payerId = await payerManagementPage.recordIdOf(publishedPayer.nameEn);
      expect(payerId).not.toBe('');
    });

    // Only the decision-table rows whose precondition the application can
    // actually create are executed here. The blank-name rows need a payer with
    // one name missing, and the Add Payer wizard makes both mandatory - they
    // are covered by the dedicated fallback cases, which report BLOCKED with
    // that reason rather than being faked with a record that does not
    // represent the scenario.
    for (const row of EXECUTABLE_NAME_CASES) {
      const expected =
        row.expects === 'arabic' ? publishedPayer.nameAr : publishedPayer.nameEn;
      await steps.step(
        `${row.id}: the ${row.language.toUpperCase()} UI shows the ${row.expects} name`,
        async () => {
          await languageSwitcher.switchTo(row.language);
          await payerManagementPage.expectCellById(payerId, NAME_COLUMN, expected);
        },
      );
    }

    // The sheet lists a step per payer in the decision table (A, B, C, D). The
    // two rows that need a payer with a blank name get a step of their own here
    // rather than being folded into a summary, so the report shows all four
    // rows and says which could not be exercised - matching the sheet's shape
    // instead of quietly covering half of it.
    for (const row of NAME_RESOLUTION_CASES.filter((r) => r.blockedBecause)) {
      await steps.step(
        `${row.id}: the ${row.language.toUpperCase()} UI should show the ${row.expects} name`
          + ' - precondition not creatable',
        async () => {
          expect(
            row.blockedBecause,
            'this decision-table row needs a payer with a blank name, which the Add Payer '
              + 'wizard cannot create; it is covered as BLOCKED by '
              + 'localized-names-fallback.spec.ts',
          ).toBeTruthy();
        },
      );
    }

    await steps.step('The rows that could not be executed are named, not assumed', async () => {
      const blocked = NAME_RESOLUTION_CASES.filter((row) => row.blockedBecause).map(
        (row) => row.id,
      );
      expect(
        blocked,
        'these decision-table rows need a payer with a blank name, which the Add Payer '
          + 'wizard cannot create; they are covered as BLOCKED by '
          + 'localized-names-fallback.spec.ts',
      ).toEqual(['ar-ui-arabic-blank', 'en-ui-english-blank']);
    });
  });

  test('TC-009: should show the same localized name in the list, the card and the detail header', async ({
    payerManagementPage,
    payerCards,
    languageSwitcher,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Switch the interface language to Arabic', () =>
      languageSwitcher.switchTo('ar'));
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    let payerId = '';
    await steps.critical('Locate the payer and capture its record id', async () => {
      // Searched by the ARABIC name, because that is what the Arabic list
      // renders - which itself proves the Arabic name is the display name.
      await payerManagementPage.search(publishedPayer.nameAr);
      payerId = await payerManagementPage.recordIdOf(publishedPayer.nameAr);
      expect(payerId).not.toBe('');
    });

    // All three surfaces are read and then compared TOGETHER. Three separate
    // "equals the Arabic name" assertions would pass even if one surface were
    // rendering a stale copy of a different record's name.
    let listName = '';
    let cardName = '';
    let headerName = '';

    await steps.critical('Read the name from all three surfaces', async () => {
      listName = await payerManagementPage.getCellValueById(payerId, NAME_COLUMN);
      await payerCards.open();
      cardName = await payerCards.getTitleById(payerId);
      const detail = await payerManagementPage.openDetails(publishedPayer.nameAr);
      await detail.waitForLoaded();
      headerName = await detail.getName();
    });

    await steps.step('All three surfaces show the stored Arabic name', async () => {
      expect({ listName, cardName, headerName }).toEqual({
        listName: publishedPayer.nameAr,
        cardName: publishedPayer.nameAr,
        headerName: publishedPayer.nameAr,
      });
    });
  });

  test('TC-008: should render Arabic right-to-left and English left-to-right without corruption', async ({
    payerManagementPage,
    languageSwitcher,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    let payerId = '';
    await steps.critical('Locate the payer and capture its record id', async () => {
      await payerManagementPage.search(publishedPayer.nameEn);
      payerId = await payerManagementPage.recordIdOf(publishedPayer.nameEn);
      expect(payerId).not.toBe('');
    });

    await steps.critical('Switch the interface language to Arabic', () =>
      languageSwitcher.switchTo('ar'));

    await steps.step('The page is laid out right-to-left', () =>
      languageSwitcher.expectRightToLeft());

    // "No mojibake or reversed text" is checkable as an exact,
    // character-for-character match against what was stored: a mis-decoded
    // string would not compare equal, and neither would a reversed one.
    // Comparing rendered pixels is not something a functional test can do, and
    // "contains Arabic characters" would pass on corrupted text.
    await steps.step('The Arabic name renders exactly as stored', async () => {
      const rendered = await payerManagementPage.getCellValueById(payerId, NAME_COLUMN);
      expect(rendered, 'the stored Arabic name must render character for character').toBe(
        publishedPayer.nameAr,
      );
      expect(rendered, 'the rendered name must not be reversed').not.toBe(
        [...publishedPayer.nameAr].reverse().join(''),
      );
    });

    await steps.critical('Switch back to English', () => languageSwitcher.switchTo('en'));

    await steps.step('The English name renders left-to-right, in full', async () => {
      await languageSwitcher.expectLeftToRight();
      const rendered = await payerManagementPage.getCellValueById(payerId, NAME_COLUMN);
      expect(rendered, 'the English name must render in full').toBe(publishedPayer.nameEn);
    });
  });

  test('TC-012: should stay consistent across repeated language toggling', async ({
    payerManagementPage,
    languageSwitcher,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    let payerId = '';
    await steps.critical('Locate the payer and capture its record id', async () => {
      await payerManagementPage.search(publishedPayer.nameEn);
      payerId = await payerManagementPage.recordIdOf(publishedPayer.nameEn);
      expect(payerId).not.toBe('');
    });

    // Repeated toggling is where a stale render shows up: the first switch is
    // usually right, and it is the third or fourth that reveals a cached name.
    // Each hop is its own step, so the report names the toggle that broke.
    for (const [index, language] of LANGUAGE_TOGGLE_SEQUENCE.entries()) {
      const expected = language === 'ar' ? publishedPayer.nameAr : publishedPayer.nameEn;
      await steps.step(
        `Toggle ${index + 1} to ${language.toUpperCase()} shows the ${language} name`,
        async () => {
          await languageSwitcher.switchTo(language);
          await payerManagementPage.expectCellById(payerId, NAME_COLUMN, expected);
        },
      );
    }
  });
});
