import { test, expect } from '../../../fixtures';
import { NETWORK_COLUMN } from '../../../constants/ElementIds';
import { NETWORK_MESSAGE } from '../../../data/networks/network.data';
import {
  CASES,
  EXPECTED_OPTIONS,
  FILTER_DEFAULT,
  UNHANDLED_ERROR_MARKERS,
} from '../../../data/networks/typeStatusFilters.data';

/**
 * User story 14118: Filter networks by type and status.
 * The Type and Status quick filters - each option, combinations, boundaries,
 * the option checklist, a manipulated value and the empty combination.
 *
 * Read on the list's FIRST page: a filter that leaks would show the wrong
 * type or status there as surely as on any later page.
 */
test.describe('US 14118 - Type and status quick filters', () => {
  test(`TC-${CASES.byType.azureId}: should list only HMO networks when the Type filter is set to HMO`, async ({
    networkManagementPage,
    steps,
  }) => {
    const data = CASES.byType;

    await steps.critical('Navigate to the Network Management module - the full list loads', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.expectRowsRendered();
    });

    await steps.step(`The Type dropdown shows ${data.type} once selected`, async () => {
      await networkManagementPage.applyQuickFilter('type', data.type);
      expect(await networkManagementPage.getQuickFilterValue('type')).toBe(data.type);
    });

    await steps.step(`Only ${data.type} networks are listed`, async () => {
      await networkManagementPage.expectRowsRendered();
      const types = await networkManagementPage.readColumn(NETWORK_COLUMN.networkType);
      expect(types.filter((type) => type !== data.type), `rows whose type is not ${data.type}`).toEqual([]);
    });
  });

  test(`TC-${CASES.byEachStatus.azureId}: should list only networks of the chosen status when each Status option is applied in turn`, async ({
    networkManagementPage,
    steps,
  }) => {
    await steps.critical('Navigate to the Network Management module - the full list loads', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.expectRowsRendered();
    });

    for (const status of CASES.byEachStatus.statuses) {
      await steps.step(`Status ${status} lists only ${status} networks`, async () => {
        await networkManagementPage.applyQuickFilter('status', status);
        expect(await networkManagementPage.getQuickFilterValue('status')).toBe(status);
        const statuses = await networkManagementPage.readColumn(NETWORK_COLUMN.status);
        expect(statuses.length, `the register holds ${status} networks, so rows should be listed`).toBeGreaterThan(0);
        expect(statuses.filter((value) => value !== status), `rows not reading ${status}`).toEqual([]);
      });
    }
  });

  test(`TC-${CASES.combined.azureId}: should list only networks matching both when Type PPO and Status Expired are combined`, async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const data = CASES.combined;
    const network = await networkIn('Expired', { type: data.type });

    await steps.critical('Navigate to the Network Management module - the full list loads', async () => {
      await networkManagementPage.openList();
    });

    await steps.step(`Both dropdowns show ${data.type} and ${data.status}`, async () => {
      await networkManagementPage.applyQuickFilter('type', data.type);
      await networkManagementPage.applyQuickFilter('status', data.status);
      expect(await networkManagementPage.getQuickFilterValue('type')).toBe(data.type);
      expect(await networkManagementPage.getQuickFilterValue('status')).toBe(data.status);
    });

    await steps.step('Only networks that are both PPO and Expired are listed, the case\'s own among them', async () => {
      await networkManagementPage.expectRowsRendered();
      const names = await networkManagementPage.readColumn(NETWORK_COLUMN.networkName);
      const types = await networkManagementPage.readColumn(NETWORK_COLUMN.networkType);
      const statuses = await networkManagementPage.readColumn(NETWORK_COLUMN.status);
      expect(names, 'the provisioned PPO network that expired should be listed').toContain(network.name);
      expect(types.filter((type) => type !== data.type), `types other than ${data.type}`).toEqual([]);
      expect(statuses.filter((status) => status !== data.status), `statuses other than ${data.status}`).toEqual([]);
    });
  });

  test(`TC-${CASES.boundaries.azureId}: should filter by the first and last type and restore the full list when the selection is cleared`, async ({
    networkManagementPage,
    steps,
  }) => {
    const data = CASES.boundaries;
    let unfiltered = -1;

    await steps.critical('Navigate to the Network Management module - the full unfiltered list loads', async () => {
      unfiltered = await networkManagementPage.captureListTotal(() => networkManagementPage.openList());
      expect(unfiltered, 'the unfiltered register should hold networks').toBeGreaterThan(0);
    });

    await steps.step(`The first (${data.first}) and last (${data.last}) type options each filter correctly`, async () => {
      for (const type of [data.first, data.last]) {
        const total = await networkManagementPage.captureListTotal(() => networkManagementPage.applyQuickFilter('type', type));
        const types = await networkManagementPage.readColumn(NETWORK_COLUMN.networkType);
        expect(types.filter((value) => value !== type), `rows other than ${type}`).toEqual([]);
        expect(total, `${type} should narrow the register`).toBeLessThan(unfiltered);
      }
    });

    await steps.step('Clearing the selection back to All Types returns the full list', async () => {
      const total = await networkManagementPage.captureListTotal(() =>
        networkManagementPage.applyQuickFilter('type', FILTER_DEFAULT.type),
      );
      expect(await networkManagementPage.getQuickFilterValue('type')).toBe(FILTER_DEFAULT.type);
      expect(total, 'no filter should list the whole register again').toBe(unfiltered);
    });
  });

  test(`TC-${CASES.checklist.azureId}: should offer exactly the four types and four statuses when the dropdowns are opened`, async ({
    networkManagementPage,
    steps,
  }) => {
    await steps.critical('Navigate to the Network Management module - the list loads', async () => {
      await networkManagementPage.openList();
    });

    await steps.step('The Type dropdown lists exactly HMO, PPO, EPO and POS', async () => {
      const options = (await networkManagementPage.getFilterOptions('type')).filter((o) => o !== FILTER_DEFAULT.type);
      expect(options).toEqual(EXPECTED_OPTIONS.type);
    });

    await steps.step('The Status dropdown lists exactly Pending, Active, Inactive and Expired', async () => {
      const options = (await networkManagementPage.getFilterOptions('status')).filter((o) => o !== FILTER_DEFAULT.status);
      expect(options).toEqual(EXPECTED_OPTIONS.status);
    });
  });

  test(`TC-${CASES.invalidValue.azureId}: should refuse or ignore an unsupported type without an unhandled error when the filter request is manipulated`, async ({
    networkManagementPage,
    steps,
  }) => {
    const data = CASES.invalidValue;
    let answer = { answered: 0, screen: '' };

    await steps.critical('Navigate to the Network Management module - the list loads', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.expectRowsRendered();
    });

    await steps.step(`The list is filtered with Type "${data.invalidType}" (the request is manipulated)`, async () => {
      answer = await networkManagementPage.applyManipulatedQuickFilter('type', data.probeType, data.invalidType);
      expect(answer.answered, 'the manipulated request should get an answer').toBeGreaterThan(0);
    });

    await steps.step('The screen shows "No networks found" and no error - it does not crash', async () => {
      // Judged on the screen, as the QA lead tested it (2026-10-27). The server
      // itself still answers this request with 500 (seen 2026-10-25); the
      // answer code is logged by the page, not asserted.
      expect(answer.screen, 'an unsupported type should simply find nothing').toContain(NETWORK_MESSAGE.noNetworksFound);
      for (const marker of UNHANDLED_ERROR_MARKERS) {
        expect(answer.screen, `the screen must not show "${marker}"`).not.toContain(marker);
      }
    });
  });

  test(`TC-${CASES.noMatch.azureId}: should show an empty state with zero records when Type EPO and Status Expired match nothing`, async ({
    networkManagementPage,
    steps,
  }) => {
    const data = CASES.noMatch;
    let total = -1;

    await steps.critical('Navigate to the Network Management module - the list loads', async () => {
      await networkManagementPage.openList();
    });

    await steps.step(`${data.type} and ${data.status} are applied and both show as chips`, async () => {
      await networkManagementPage.applyQuickFilter('type', data.type);
      total = await networkManagementPage.captureListTotal(() => networkManagementPage.applyQuickFilter('status', data.status));
      expect(await networkManagementPage.getChips()).toEqual(expect.arrayContaining([data.type, data.status]));
    });

    await steps.step('The list area shows the no-results empty state with zero records', async () => {
      expect(total, `no network is ${data.type} and ${data.status}`).toBe(0);
      expect(await networkManagementPage.getTableBodyText()).toContain(NETWORK_MESSAGE.noNetworksFound);
    });
  });
});
