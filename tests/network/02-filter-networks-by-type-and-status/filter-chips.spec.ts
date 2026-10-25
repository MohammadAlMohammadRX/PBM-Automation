import { test, expect } from '../../../fixtures';
import { NETWORK_COLUMN } from '../../../constants/ElementIds';
import { CASES, FILTER_DEFAULT } from '../../../data/networks/typeStatusFilters.data';

/**
 * User story 14118: Filter networks by type and status.
 * The filter chips - removing one, removing several in any order, and Clear
 * All - and that the list follows the chips each time.
 */
test.describe('US 14118 - Filter chips', () => {
  test(`TC-${CASES.removeChip.azureId}: should drop only that criterion from the list when one of two filter chips is removed`, async ({
    networkManagementPage,
    steps,
  }) => {
    const data = CASES.removeChip;

    await steps.critical('Navigate to the module filtered by Type EPO and Status Active, with two chips', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.applyQuickFilter('type', data.type);
      await networkManagementPage.applyQuickFilter('status', data.status);
      expect(await networkManagementPage.getChips()).toEqual(expect.arrayContaining([data.type, data.status]));
    });

    await steps.step('Removing the EPO chip leaves only the Status Active chip', async () => {
      await networkManagementPage.removeChip(data.type);
      const chips = await networkManagementPage.getChips();
      expect(chips, 'the EPO chip should be gone').not.toContain(data.type);
      expect(chips, 'the Active chip should remain').toContain(data.status);
      expect(await networkManagementPage.getQuickFilterValue('type')).toBe(FILTER_DEFAULT.type);
    });

    await steps.step('The list shows every Active network, whatever its type', async () => {
      await networkManagementPage.expectRowsRendered();
      const statuses = await networkManagementPage.readColumn(NETWORK_COLUMN.status);
      const types = await networkManagementPage.readColumn(NETWORK_COLUMN.networkType);
      expect(statuses.filter((status) => status !== data.status), 'rows that are not Active').toEqual([]);
      expect(new Set(types).size, 'the removed type criterion should no longer narrow the list').toBeGreaterThan(1);
    });
  });

  test(`TC-${CASES.clearAll.azureId}: should remove every chip and list the whole register when Clear All is used`, async ({
    networkManagementPage,
    steps,
  }) => {
    const data = CASES.clearAll;
    let unfiltered = -1;

    await steps.critical('Navigate to the module filtered by HMO and Inactive, with both chips', async () => {
      unfiltered = await networkManagementPage.captureListTotal(() => networkManagementPage.openList());
      await networkManagementPage.applyQuickFilter('type', data.type);
      await networkManagementPage.applyQuickFilter('status', data.status);
      expect(await networkManagementPage.getChips()).toEqual(expect.arrayContaining([data.type, data.status]));
    });

    await steps.step('Clear All removes every chip at once', async () => {
      const total = await networkManagementPage.captureListTotal(() => networkManagementPage.clearAllChips());
      expect(await networkManagementPage.getChips(), 'no chip should remain').toEqual([]);
      expect(total, 'the full register should be listed again').toBe(unfiltered);
    });

    await steps.step('Both quick filters are back at their defaults', async () => {
      expect(await networkManagementPage.getQuickFilterValue('type')).toBe(FILTER_DEFAULT.type);
      expect(await networkManagementPage.getQuickFilterValue('status')).toBe(FILTER_DEFAULT.status);
    });
  });

  test(`TC-${CASES.randomOrder.azureId}: should keep the list in step with the remaining chips when three chips are removed out of order`, async ({
    networkManagementPage,
    steps,
  }) => {
    const data = CASES.randomOrder;
    let unfiltered = -1;

    await steps.critical('Navigate to the module with Name/Code Care, Type POS and Status Pending as three chips', async () => {
      unfiltered = await networkManagementPage.captureListTotal(() => networkManagementPage.openList());
      await networkManagementPage.advancedSearchFor({ nameOrCode: data.nameOrCode, networkType: data.type, status: data.status });
      expect(await networkManagementPage.getChips()).toEqual(
        expect.arrayContaining([data.nameOrCode, data.type, data.status]),
      );
    });

    await steps.step('Removing the middle chip (Type) leaves Name/Code and Status', async () => {
      await networkManagementPage.removeChip(data.type);
      const chips = await networkManagementPage.getChips();
      expect(chips).not.toContain(data.type);
      expect(chips).toEqual(expect.arrayContaining([data.nameOrCode, data.status]));
    });

    await steps.step('Removing the last chip (Status) leaves only Name/Code, and the list follows it', async () => {
      await networkManagementPage.removeChip(data.status);
      expect(await networkManagementPage.getChips()).toEqual([data.nameOrCode]);
      const names = await networkManagementPage.readColumn(NETWORK_COLUMN.networkName);
      const codes = await networkManagementPage.readColumn(NETWORK_COLUMN.code);
      expect(
        names.filter((name, i) => !`${name} ${codes[i] ?? ''}`.toLowerCase().includes(data.nameOrCode.toLowerCase())),
        `rows matching neither name nor code "${data.nameOrCode}"`,
      ).toEqual([]);
    });

    await steps.step('Removing the first chip (Name/Code) leaves no chip and the whole register', async () => {
      const total = await networkManagementPage.captureListTotal(() => networkManagementPage.removeChip(data.nameOrCode));
      expect(await networkManagementPage.getChips()).toEqual([]);
      expect(total, 'no stale filter should survive').toBe(unfiltered);
    });
  });
});
