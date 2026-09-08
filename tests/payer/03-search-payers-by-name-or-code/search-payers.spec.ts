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
 *
 * Steps are recorded through the `steps` fixture so the report names the exact
 * step that failed. The split is deliberate:
 *
 *   steps.critical(...)  setup and the action under test. If typing the search
 *                        term never happened, every verification after it is
 *                        meaningless, so the rest is recorded NOT EXECUTED.
 *   steps.step(...)      one verification. These are independent, so a failing
 *                        one must not hide the result of the next.
 */
test.describe('Search Payers by Name or Code - Real-time search', () => {
  test('TC-015: should filter the list in real time when a partial English payer name is typed', async ({
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical(`Type the partial name "${KNOWN_PAYER.namePartial}"`, () =>
      payerManagementPage.typeInSearch(KNOWN_PAYER.namePartial));

    // Every remaining row matches the typed substring - no Enter was needed.
    await steps.step('Every listed name contains the typed substring', () =>
      payerManagementPage.expectAllNamesContain(KNOWN_PAYER.namePartial));

    await steps.step(`The known payer "${KNOWN_PAYER.name}" is among the results`, () =>
      payerManagementPage.expectResultsInclude(KNOWN_PAYER.name));
  });

  test('TC-016: should filter the list when a partial Arabic payer name is typed', async ({
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Type the partial Arabic name', () =>
      payerManagementPage.typeInSearch(KNOWN_PAYER.nameArabic));

    // The Arabic name is matched even though the list shows English names.
    await steps.step('The search returns results', () =>
      payerManagementPage.expectResultsFound());

    await steps.step(`The known payer "${KNOWN_PAYER.name}" is among them`, () =>
      payerManagementPage.expectResultsInclude(KNOWN_PAYER.name));
  });

  test('TC-017: should filter the list to the matching payer when a Payer Code is entered', async ({
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical(`Search the full code "${KNOWN_PAYER.code}"`, () =>
      payerManagementPage.typeInSearch(KNOWN_PAYER.code));

    await steps.step('Every row carries exactly that code', () =>
      payerManagementPage.expectAllPayerCodes(KNOWN_PAYER.code));

    // A partial code matches too. Non-critical: if the full-code search above
    // failed, this is still worth attempting and reporting on its own.
    await steps.step(`Search the partial code "${KNOWN_PAYER.codePartial}"`, () =>
      payerManagementPage.typeInSearch(KNOWN_PAYER.codePartial));

    await steps.step('A partial code returns the same payer', () =>
      payerManagementPage.expectAllPayerCodes(KNOWN_PAYER.code));
  });

  test('TC-021: should perform real-time matching from a single typed character', async ({
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical(`Type a single character "${SINGLE_CHARACTER_TERM}"`, () =>
      payerManagementPage.typeInSearch(SINGLE_CHARACTER_TERM));

    // Partial matching applies even at the minimum input length.
    await steps.step('The search returns results', () =>
      payerManagementPage.expectResultsFound());

    await steps.step('At least one name is listed', async () => {
      const names = await payerManagementPage.getVisiblePayerNames();
      expect(names.length, 'a single character should still return matches').toBeGreaterThan(0);
    });
  });
});

/**
 * User story: Search Payers by Name or Code.
 * Clearing the search, and how the box handles boundary inputs.
 */
test.describe('Search Payers by Name or Code - Clearing & boundaries', () => {
  test('TC-020: should restore the full unfiltered list when the search input is cleared', async ({
    payerManagementPage,
    steps,
  }) => {
    let unfilteredPages = 0;

    await steps.critical('Open the payer list and record its size', async () => {
      await payerManagementPage.open();
      unfilteredPages = await payerManagementPage.getPageCount();
    });

    await steps.critical('Search for a partial name', () =>
      payerManagementPage.typeInSearch(KNOWN_PAYER.namePartial));

    await steps.step('The list narrows to matching names', () =>
      payerManagementPage.expectAllNamesContain(KNOWN_PAYER.namePartial));

    // Clearing is what this case exists to check, so a failure here invalidates
    // the two verifications that follow.
    await steps.critical('Clear the search box', () => payerManagementPage.clearSearchBox());

    await steps.step('The full page count is restored', () =>
      payerManagementPage.expectPageCount(unfilteredPages));

    await steps.step('The unfiltered list shows mixed payer types', () =>
      payerManagementPage.expectMixedPayerTypes());
  });

  test('TC-022: should handle an excessively long search term without error', async ({
    payerManagementPage,
    steps,
  }) => {
    const term = longSearchTerm();

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Type an excessively long term', () =>
      payerManagementPage.typeInSearch(term));

    // Either the input is truncated or the term simply matches nothing - but the
    // page keeps working and shows a normal empty state.
    await steps.step('The list shows its empty state, not an error', () =>
      payerManagementPage.expectEmptyState());

    await steps.step('The search box did not exceed the term length', async () => {
      const entered = await payerManagementPage.getSearchBoxValue();
      expect(
        entered.length,
        'the search box should not exceed the term length',
      ).toBeLessThanOrEqual(term.length);
    });

    // And the list recovers once the term is cleared.
    await steps.critical('Clear the search box', () => payerManagementPage.clearSearchBox());

    await steps.step('The list recovers and returns results', () =>
      payerManagementPage.expectResultsFound());
  });

  test('TC-023: should show a no-matching-results message when the search term matches nothing', async ({
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Search for a term that matches nothing', () =>
      payerManagementPage.typeInSearch(NO_MATCH_TERM));

    // A clear empty state, not an error or a stale list.
    await steps.step('A no-results empty state is shown', () =>
      payerManagementPage.expectEmptyState());
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
      steps,
    }) => {
      await steps.critical('Open the payer list', () => payerManagementPage.open());

      await steps.critical(`Type the ${unsafe.label}`, () =>
        payerManagementPage.typeInSearch(unsafe.term));

      // The list still works and no script ran - the page simply reports the
      // outcome of a literal, non-matching search.
      await steps.step('No unexpected dialog was raised', () =>
        payerManagementPage.expectNoUnexpectedDialog());

      await steps.critical('Clear the search box', () => payerManagementPage.clearSearchBox());

      await steps.step('The list recovers and returns results', () =>
        payerManagementPage.expectResultsFound());
    });
  }

  // TC-026: mixed-language input, and terms with surrounding whitespace.
  for (const loose of LOOSE_SEARCH_CASES) {
    test(`TC-026: should handle a search term with ${loose.label}`, async ({
      payerManagementPage,
      steps,
    }) => {
      await steps.critical('Open the payer list', () => payerManagementPage.open());

      await steps.critical(`Type a term with ${loose.label}`, () =>
        payerManagementPage.typeInSearch(loose.term));

      // A trimmed term still matches; a mixed-language term simply finds nothing.
      await steps.step(
        loose.expectsMatch ? 'The term still matches' : 'The term matches nothing',
        () => payerManagementPage.expectSearchOutcome(loose.expectsMatch, loose.term),
      );
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
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    // Narrow by filter first...
    await steps.critical('Filter by Payer Type = Private', () =>
      payerManagementPage.filterByType('Private'));

    await steps.critical('Filter by Status = Active', () =>
      payerManagementPage.filterByStatus('Active'));

    // ...then search within that filtered set.
    await steps.critical('Search within the filtered set', () =>
      payerManagementPage.typeInSearch(KNOWN_PAYER.namePartial));

    // Results must satisfy the filter AND the search term simultaneously. Kept
    // as separate steps so a failure on one is reported without hiding the other
    // - which is the whole question this case asks.
    await steps.step('Every listed name matches the search term', () =>
      payerManagementPage.expectAllNamesContain(KNOWN_PAYER.namePartial));

    await steps.step('Every listed row is still of type Private', () =>
      payerManagementPage.expectAllRowsOfType('Private'));
  });
});
