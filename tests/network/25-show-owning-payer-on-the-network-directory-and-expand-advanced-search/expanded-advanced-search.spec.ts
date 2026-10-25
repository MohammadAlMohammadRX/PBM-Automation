import { test, expect } from '../../../fixtures';
import { NETWORK_COLUMN } from '../../../constants/ElementIds';
import { duplicates } from '../../../utils/SortUtils';
import { NETWORK_MESSAGE } from '../../../data/networks/network.data';
import {
  CASES,
  COMBINED,
  EXPECTED_APPROVAL_STATES,
  FIELD,
  NAME_CODE_LIMIT,
  NO_MATCH_TERM,
  REQUIRED_CRITERIA,
} from '../../../data/networks/owningPayerDirectory.data';

/**
 * User story 14302: Show owning payer on the network directory and expand
 * advanced search.
 * The advanced search drawer's criteria - Payer, Name/Code, Type, Status and
 * Approval Status - alone, combined, at their boundaries, and with no match.
 */
test.describe('US 14302 - Expanded advanced search', () => {
  test(`TC-${CASES.criteria.azureId}: should offer Payer, Name/Code, Approval Status, Type and Status when the advanced search drawer is opened`, async ({
    networkManagementPage,
    steps,
  }) => {
    await steps.critical('Navigate to the module and open Advanced Search - the drawer opens', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.openAdvancedSearch();
    });

    await steps.step('All five criteria are present in the drawer', async () => {
      const keys = await networkManagementPage.advancedSearch().getFieldKeys();
      expect(REQUIRED_CRITERIA.filter((key) => !keys.includes(key)), 'criteria the drawer does not offer').toEqual([]);
      await networkManagementPage.advancedSearch().cancel();
    });
  });

  test(`TC-${CASES.combined.azureId}: should list only networks meeting every criterion when payer, type, status and approval status are combined`, async ({
    networkManagementPage,
    steps,
  }) => {
    await steps.critical('Navigate to the module and open Advanced Search - the drawer opens', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.openAdvancedSearch();
    });

    await steps.step('The drawer offers a Payer criterion to set', async () => {
      expect(await networkManagementPage.advancedSearch().hasField(FIELD.payer), 'a Payer criterion').toBe(true);
    });

    await steps.step('Type, Status and Approval Status show the selected values', async () => {
      const drawer = networkManagementPage.advancedSearch();
      await drawer.choose(FIELD.networkType, COMBINED.type);
      await drawer.choose(FIELD.status, COMBINED.status);
      await drawer.choose(FIELD.approvalStatus, COMBINED.approvalStatus);
      expect(await drawer.getValue(FIELD.networkType)).toBe(COMBINED.type);
      expect(await drawer.getValue(FIELD.status)).toBe(COMBINED.status);
      expect(await drawer.getValue(FIELD.approvalStatus)).toBe(COMBINED.approvalStatus);
      await drawer.submit();
    });

    await steps.step('Only networks matching every chosen criterion are listed', async () => {
      await networkManagementPage.expectRowsRendered();
      const types = await networkManagementPage.readColumn(NETWORK_COLUMN.networkType);
      const statuses = await networkManagementPage.readColumn(NETWORK_COLUMN.status);
      const approvals = await networkManagementPage.readColumn(NETWORK_COLUMN.approvalStatus);
      expect(types.filter((t) => t !== COMBINED.type)).toEqual([]);
      expect(statuses.filter((s) => s !== COMBINED.status)).toEqual([]);
      expect(approvals.filter((a) => !a.includes(COMBINED.approvalStatus))).toEqual([]);
    });
  });

  test(`TC-${CASES.boundary.azureId}: should accept one character and stop at the maximum when Network Name/Code is filled at its boundaries`, async ({
    networkManagementPage,
    steps,
  }) => {
    const data = NAME_CODE_LIMIT;

    await steps.critical('Navigate to the module and open Advanced Search - the drawer opens', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.openAdvancedSearch();
    });

    await steps.step('A one-character value is accepted', async () => {
      const drawer = networkManagementPage.advancedSearch();
      await drawer.typeText(FIELD.nameOrCode, data.minimum);
      expect(await drawer.getValue(FIELD.nameOrCode)).toBe(data.minimum);
    });

    await steps.step(`Input stops at ${data.maximum} characters`, async () => {
      const drawer = networkManagementPage.advancedSearch();
      await drawer.clearText(FIELD.nameOrCode);
      await drawer.typeText(FIELD.nameOrCode, data.beyond);
      expect(await drawer.getMaxLength(FIELD.nameOrCode), `a declared maximum of ${data.maximum}`).toBe(data.maximum);
      expect((await drawer.getValue(FIELD.nameOrCode)).length).toBe(data.maximum);
      await drawer.cancel();
    });
  });

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
