import { test, expect } from '../../../fixtures';
import { NETWORK_COLUMN } from '../../../constants/ElementIds';
import {
  DRAWER_CHECKLIST,
  FIELD,
  HOSTILE_CASE_ID,
  HOSTILE_INPUTS,
  NAME_CODE_BOUNDARY,
  SEARCH_CASES,
  SERVER_ERROR_MARKERS,
} from '../../../data/networks/advancedSearch.data';

/**
 * User story 14117: Apply advanced search criteria to networks.
 * The Name / Code input itself - its boundaries, its debounce, hostile input -
 * and the drawer's UI checklist.
 */
test.describe('US 14117 - Advanced search input and drawer', () => {
  test(`TC-${NAME_CODE_BOUNDARY.azureId}: should accept one character and stop at the maximum length when Name/Code is filled at its boundaries`, async ({
    networkManagementPage,
    steps,
  }) => {
    const data = NAME_CODE_BOUNDARY;

    await steps.critical('Navigate to the module and open the drawer', async () => {
      await networkManagementPage.openList();
      const drawer = await networkManagementPage.openAdvancedSearch();
      expect(await drawer.hasField(FIELD.nameOrCode), 'the drawer should offer Name / Code').toBe(true);
    });

    await steps.step('A single character is accepted', async () => {
      const drawer = networkManagementPage.advancedSearch();
      await drawer.typeText(FIELD.nameOrCode, data.minimum);
      expect(await drawer.getValue(FIELD.nameOrCode)).toBe(data.minimum);
    });

    await steps.step(`Input stops at ${data.maximum} characters and the extra character is blocked`, async () => {
      const drawer = networkManagementPage.advancedSearch();
      await drawer.clearText(FIELD.nameOrCode);
      await drawer.typeText(FIELD.nameOrCode, data.beyondMaximum);
      expect(
        await drawer.getMaxLength(FIELD.nameOrCode),
        `the field should declare a maximum length of ${data.maximum}`,
      ).toBe(data.maximum);
      expect(
        (await drawer.getValue(FIELD.nameOrCode)).length,
        `typing ${data.beyondMaximum.length} characters should leave ${data.maximum}`,
      ).toBe(data.maximum);
      await drawer.cancel();
    });
  });

  test(`TC-${SEARCH_CASES.searchOnClick.azureId}: should send no request while typing and one request when Search is clicked`, async ({
    networkManagementPage,
    steps,
  }) => {
    const data = SEARCH_CASES.searchOnClick;

    await steps.critical('Navigate to the module and open the drawer', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.openAdvancedSearch();
    });

    await steps.step('Typing in Name / Code sends no search request', async () => {
      const drawer = networkManagementPage.advancedSearch();
      const requests = await networkManagementPage.countListRequests(() => drawer.typeText(FIELD.nameOrCode, data.term), data.settleMs);
      expect(requests, 'typing alone must not search - the search runs when Search is clicked').toBe(0);
    });

    await steps.step('Clicking Search sends one request carrying the typed value', async () => {
      const drawer = networkManagementPage.advancedSearch();
      let requests = -1;
      const body = await networkManagementPage.captureListRequest(async () => {
        requests = await networkManagementPage.countListRequests(() => drawer.submit(), data.settleMs);
      });
      expect(requests, 'one click on Search should send exactly one search request').toBe(1);
      expect(String(body.searchText ?? ''), 'the request should carry the typed value').toBe(data.term);
    });
  });

  test(`TC-${HOSTILE_CASE_ID}: should treat script and SQL payloads as plain text and match nothing when they are searched`, async ({
    networkManagementPage,
    steps,
  }) => {
    await steps.critical('Navigate to the module - the list loads', async () => {
      await networkManagementPage.openList();
    });

    for (const payload of HOSTILE_INPUTS) {
      await steps.step(`"${payload}" is kept as plain text, runs nothing and returns no match`, async () => {
        const drawer = await networkManagementPage.openAdvancedSearch();
        await drawer.typeText(FIELD.nameOrCode, payload);
        expect(await drawer.getValue(FIELD.nameOrCode), 'the payload should sit in the field as typed').toBe(payload);
        const total = await networkManagementPage.captureListTotal(() => drawer.submit());
        expect(total, 'a hostile term should match no network').toBe(0);
        const shown = await networkManagementPage.getTableBodyText();
        for (const marker of SERVER_ERROR_MARKERS) {
          expect(shown, `the list must not expose "${marker}"`).not.toContain(marker);
        }
        expect(await networkManagementPage.readColumn(NETWORK_COLUMN.networkName)).toEqual([]);
        await networkManagementPage.openList();
      });
    }
  });

  test(`TC-${DRAWER_CHECKLIST.azureId}: should show every labelled field, option and control when the drawer is opened`, async ({
    networkManagementPage,
    steps,
  }) => {
    const data = DRAWER_CHECKLIST;

    await steps.critical('Navigate to the module and open the drawer', async () => {
      await networkManagementPage.openList();
      const drawer = await networkManagementPage.openAdvancedSearch();
      expect(await drawer.getTitle()).toBe(data.title);
    });

    await steps.step('Labels, placeholder, options and controls are all present', async () => {
      const drawer = networkManagementPage.advancedSearch();
      expect(await drawer.getFieldLabels(), 'field labels').toEqual(expect.arrayContaining([...data.labels]));
      expect(await drawer.getPlaceholder(FIELD.nameOrCode), 'Name / Code placeholder').toBe(data.placeholder);
      expect(await drawer.getOptions(FIELD.networkType), 'type options').toEqual(expect.arrayContaining([...data.typeOptions]));
      expect(await drawer.getOptions(FIELD.status), 'status options').toEqual(expect.arrayContaining([...data.statusOptions]));
      expect(await drawer.getOptions(FIELD.approvalStatus), 'approval options').toEqual(
        expect.arrayContaining([...data.approvalOptions]),
      );
      expect(await drawer.getControlsPresent(), 'Search, Cancel and close controls').toEqual({ search: true, cancel: true, close: true });
    });

    await steps.step('Labels render in the active language without being cut off', async () => {
      const drawer = networkManagementPage.advancedSearch();
      const labels = await drawer.getFieldLabels();
      expect(labels.filter((label) => label === '' || label.endsWith('…')), 'empty or truncated labels').toEqual([]);
      await drawer.cancel();
    });
  });
});
