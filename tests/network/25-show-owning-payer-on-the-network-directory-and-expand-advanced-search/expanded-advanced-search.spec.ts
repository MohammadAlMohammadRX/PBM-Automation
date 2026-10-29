import { test, expect } from '../../../fixtures';
import { NETWORK_COLUMN } from '../../../constants/ElementIds';
import { duplicates } from '../../../utils/SortUtils';
import { NETWORK_MESSAGE } from '../../../data/networks/network.data';
import {
  CASES,
  EXPECTED_APPROVAL_STATES,
  FIELD,
  NO_MATCH_TERM,
} from '../../../data/networks/owningPayerDirectory.data';

/**
 * User story 14302: Show owning payer on the network directory and expand
 * advanced search.
 * The advanced search drawer's Approval Status criterion, and a search with no match.
 */
test.describe('US 14302 - Expanded advanced search', () => {
  test(`TC-${CASES.approvalStates.azureId}: should list each valid approval status once and filter by each when the Approval Status dropdown is used`, async ({
    networkManagementPage,
    steps,
  }) => {
    let offered: string[] = [];

    await steps.critical('Navigate to the module and open Advanced Search - the drawer opens', async () => {
      await networkManagementPage.openList();
      const drawer = await networkManagementPage.openAdvancedSearch();
      offered = await drawer.getOptions(FIELD.approvalStatus);
      await drawer.cancel();
    });

    await steps.step('The dropdown lists every approval status once, with no invalid entry', async () => {
      expect(duplicates(offered), 'duplicated approval statuses').toEqual([]);
      expect(offered, 'the approval statuses the story expects').toEqual(expect.arrayContaining([...EXPECTED_APPROVAL_STATES]));
    });

    for (const state of EXPECTED_APPROVAL_STATES) {
      await steps.step(`Approval Status "${state}" returns only networks in that state`, async () => {
        await networkManagementPage.openList();
        await networkManagementPage.advancedSearchFor({ approvalStatus: state });
        const approvals = await networkManagementPage.readColumn(NETWORK_COLUMN.approvalStatus);
        expect(approvals.filter((cell) => !cell.includes(state)), `rows not in ${state}`).toEqual([]);
      });
    }
  });

  test(`TC-${CASES.noResults.azureId}: should show a clear no-results message when the criteria match no network`, async ({
    networkManagementPage,
    steps,
  }) => {
    await steps.critical('Navigate to the module and open Advanced Search - the drawer opens', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.openAdvancedSearch();
    });

    await steps.step('The criteria show the entered values', async () => {
      const drawer = networkManagementPage.advancedSearch();
      await drawer.typeText(FIELD.nameOrCode, NO_MATCH_TERM);
      expect(await drawer.getValue(FIELD.nameOrCode)).toBe(NO_MATCH_TERM);
    });

    await steps.step('Searching shows a no-results message instead of an empty or broken grid', async () => {
      const total = await networkManagementPage.captureListTotal(() => networkManagementPage.advancedSearch().submit());
      expect(total).toBe(0);
      expect(await networkManagementPage.getTableBodyText()).toContain(NETWORK_MESSAGE.noNetworksFound);
    });
  });
});
