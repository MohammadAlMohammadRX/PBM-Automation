import { test, expect } from '../../../fixtures';
import {
  KNOWN_PAYER,
  SINGLE_CHARACTER_TERM,
  NO_MATCH_TERM,
  longSearchTerm,
  LOOSE_SEARCH_CASES,
  UNSAFE_SEARCH_CASES,
} from '../../../data/payers/searchPayer.data';

/**
 * User story: Search Payers by Name or Code.
 * The toolbar search box filters the list in real time as the user types.
 */
test.describe('Search Payers by Name or Code - Real-time search', () => {
  test('TC-015: should filter the list in real time when a partial English payer name is typed', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    await payerManagementPage.typeInSearch(KNOWN_PAYER.namePartial);

    // Every remaining row matches the typed substring - no Enter was needed.
    await payerManagementPage.expectAllNamesContain(KNOWN_PAYER.namePartial);
    await payerManagementPage.expectResultsInclude(KNOWN_PAYER.name);
  });

  test('TC-016: should filter the list when a partial Arabic payer name is typed', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    await payerManagementPage.typeInSearch(KNOWN_PAYER.nameArabic);

    // The Arabic name is matched even though the list shows English names.
    await payerManagementPage.expectResultsFound();
    await payerManagementPage.expectResultsInclude(KNOWN_PAYER.name);
  });

  test('TC-017: should filter the list to the matching payer when a Payer Code is entered', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    // Every row returned carries exactly the searched code.
    await payerManagementPage.typeInSearch(KNOWN_PAYER.code);
    await payerManagementPage.expectAllPayerCodes(KNOWN_PAYER.code);

    // A partial code matches too.
    await payerManagementPage.typeInSearch(KNOWN_PAYER.codePartial);
    await payerManagementPage.expectAllPayerCodes(KNOWN_PAYER.code);
  });

  test('TC-021: should perform real-time matching from a single typed character', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    await payerManagementPage.typeInSearch(SINGLE_CHARACTER_TERM);

    // Partial matching applies even at the minimum input length.
    await payerManagementPage.expectResultsFound();
    const names = await payerManagementPage.getVisiblePayerNames();
    expect(names.length, 'a single character should still return matches').toBeGreaterThan(0);
  });
});

/**
 * User story: Search Payers by Name or Code.
 * Clearing the search, and how the box handles boundary inputs.
 */
test.describe('Search Payers by Name or Code - Clearing & boundaries', () => {
  test('TC-020: should restore the full unfiltered list when the search input is cleared', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();
    const unfilteredPages = await payerManagementPage.getPageCount();

    await payerManagementPage.typeInSearch(KNOWN_PAYER.namePartial);
    await payerManagementPage.expectAllNamesContain(KNOWN_PAYER.namePartial);

    await payerManagementPage.clearSearchBox();

    // The complete list is back.
    await payerManagementPage.expectPageCount(unfilteredPages);
    await payerManagementPage.expectMixedPayerTypes();
  });

  test('TC-022: should handle an excessively long search term without error', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();
    const term = longSearchTerm();

    await payerManagementPage.typeInSearch(term);

    // Either the input is truncated or the term simply matches nothing - but the
    // page keeps working and shows a normal empty state.
    await payerManagementPage.expectEmptyState();
    const entered = await payerManagementPage.getSearchBoxValue();
    expect(entered.length, 'the search box should not exceed the term length').toBeLessThanOrEqual(
      term.length,
    );

    // And the list recovers once the term is cleared.
    await payerManagementPage.clearSearchBox();
    await payerManagementPage.expectResultsFound();
  });

  test('TC-023: should show a no-matching-results message when the search term matches nothing', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    await payerManagementPage.typeInSearch(NO_MATCH_TERM);

    // A clear empty state, not an error or a stale list.
    await payerManagementPage.expectEmptyState();
  });
});

/**
 * User story: Search Payers by Name or Code.
 * The search box must treat unusual input as literal text and never break.
 */
test.describe('Search Payers by Name or Code - Robustness', () => {
  // TC-025: special and injection-style input, one iteration per term.
  for (const unsafe of UNSAFE_SEARCH_CASES) {
    test(`TC-025: should treat the search term as literal text when it contains ${unsafe.label}`, async ({
      payerManagementPage,
    }) => {
      await payerManagementPage.open();

      await payerManagementPage.typeInSearch(unsafe.term);

      // The list still works and no script ran - the page simply reports the
      // outcome of a literal, non-matching search.
      await payerManagementPage.expectNoUnexpectedDialog();
      await payerManagementPage.clearSearchBox();
      await payerManagementPage.expectResultsFound();
    });
  }

  // TC-026: mixed-language input, and terms with surrounding whitespace.
  for (const loose of LOOSE_SEARCH_CASES) {
    test(`TC-026: should handle a search term with ${loose.label}`, async ({
      payerManagementPage,
    }) => {
      await payerManagementPage.open();

      await payerManagementPage.typeInSearch(loose.term);

      // A trimmed term still matches; a mixed-language term simply finds nothing.
      await payerManagementPage.expectSearchOutcome(loose.expectsMatch, loose.term);
    });
  }
});

/**
 * User story: Search Payers by Name or Code.
 * Search must combine with an active Type/Status filter, not replace it.
 */
test.describe('Search Payers by Name or Code - Combined with filters', () => {
  test('TC-029: should apply the search term together with an active Type and Status filter', async ({
    payerManagementPage,
  }) => {
    await payerManagementPage.open();

    // Narrow by filter first...
    await payerManagementPage.filterByType('Private');
    await payerManagementPage.filterByStatus('Active');

    // ...then search within that filtered set.
    await payerManagementPage.typeInSearch(KNOWN_PAYER.namePartial);

    // Results must satisfy the filter AND the search term simultaneously.
    await payerManagementPage.expectAllNamesContain(KNOWN_PAYER.namePartial);
    await payerManagementPage.expectAllRowsOfType('Private');
  });
});
