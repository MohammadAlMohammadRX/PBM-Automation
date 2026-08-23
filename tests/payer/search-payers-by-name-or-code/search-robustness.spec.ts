import { test } from '../../../fixtures';
import {
  LOOSE_SEARCH_CASES,
  UNSAFE_SEARCH_CASES,
} from '../../../data/payers/searchPayer.data';

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
