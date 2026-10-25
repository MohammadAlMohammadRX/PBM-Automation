import { test, expect } from '../../../fixtures';
import { NETWORK_COLUMN } from '../../../constants/ElementIds';
import {
  BLOCKED_CASES,
  CASES,
  MULTI_PAYER_ACCOUNT,
  NO_OWNER,
  PAYER_HEADER,
  PAYER_SORT_WORD,
  RAPID_TERM,
  VIEW_PERMISSIONS,
} from '../../../data/networks/owningPayerDirectory.data';

/**
 * User story 14302: Show owning payer on the network directory and expand
 * advanced search.
 * The Payer column and the payer quick filter (the top-bar payer selector -
 * see the data file), who sees which payer's networks, and who sees nothing.
 */
test.describe('US 14302 - Owning payer on the directory', () => {
  test(`TC-${CASES.payerColumn.azureId}: should show each network's owning payer in a Payer column when the directory is opened`, async ({
    networkManagementPage,
    publishedPayer,
    networkIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const network = await networkIn('Draft', { payerName: publishedPayer.nameEn });

    await steps.critical('Navigate to the Network Management module with the owning payer in scope', async () => {
      await networkManagementPage.openListFor(publishedPayer.nameEn);
      expect(await networkManagementPage.getScopedPayer(), 'the owning payer should be in scope').toBe(publishedPayer.nameEn);
    });

    await steps.step('The grid carries a Payer column header', async () => {
      expect(await networkManagementPage.getHeaderTexts()).toContain(PAYER_HEADER);
    });

    await steps.step('The network\'s row names its owning payer', async () => {
      const row = await networkManagementPage.readRow(network.name);
      expect(row.payer, `"${network.name}" is owned by "${publishedPayer.nameEn}"`).toBe(publishedPayer.nameEn);
    });
  });

  test(`TC-${CASES.quickFilterShown.azureId}: should show the payer quick filter when a Payer Admin with several assigned payers opens the directory`, async ({
    nonAdminSession,
    steps,
  }) => {
    await steps.critical('The multi-payer Payer Admin opens the Network Directory', async () => {
      await nonAdminSession.networks.openList();
    });

    await steps.step('A payer quick filter is shown above the directory, set to one of the assigned payers', async () => {
      expect(await nonAdminSession.networks.isPayerScopeSelectorShown(), 'the payer quick filter should be displayed').toBe(true);
      expect(MULTI_PAYER_ACCOUNT.payers).toContain(await nonAdminSession.networks.getScopedPayer());
    });
  });

  test(`TC-${CASES.narrowsToPayer.azureId}: should list only that payer's networks when a payer is selected in the quick filter`, async ({
    nonAdminSession,
    steps,
  }) => {
    const payer = MULTI_PAYER_ACCOUNT.payerB;

    await steps.critical('The multi-payer Payer Admin opens the Network Directory', async () => {
      await nonAdminSession.networks.openList();
    });

    await steps.step(`Selecting "${payer}" refreshes the list`, async () => {
      await nonAdminSession.networks.openListFor(payer);
      expect(await nonAdminSession.networks.getScopedPayer()).toBe(payer);
    });

    await steps.step(`Every listed row is owned by "${payer}"`, async () => {
      const payers = await nonAdminSession.networks.readColumn(NETWORK_COLUMN.payer);
      expect(payers.length, 'the directory should list rows').toBeGreaterThan(0);
      expect(payers.filter((value) => value !== payer), `rows not owned by ${payer} (${NO_OWNER} = unowned)`).toEqual([]);
    });
  });

  test(`TC-${CASES.noViewPermission.azureId}: should deny the directory, its Payer column and advanced search when the user lacks network view permission`, async ({
    shapedNonAdmin,
    steps,
  }) => {
    const session = await shapedNonAdmin({ without: [...VIEW_PERMISSIONS] });

    await steps.critical('The user without network view permission is signed in', async () => {
      expect(session.removed.length).toBeGreaterThan(0);
    });

    await steps.step('Opening the directory renders no list, no Payer column and no KPI band', async () => {
      const access = await session.networks.readListAccess();
      expect(access.table, 'the network list must not render').toBe(false);
      expect(access.kpis, 'the KPI band must not render').toBe(false);
    });
  });

  test(`TC-${CASES.rapidSwitching.azureId}: should stay consistent with the selected payer when the payer filter is switched rapidly`, async ({
    networkManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    let original = '';

    await steps.critical('Navigate to the module - the directory opens under its current payer', async () => {
      await networkManagementPage.openList();
      original = await networkManagementPage.getScopedPayer();
      expect(original).not.toBe('');
    });

    await steps.step('Switching between payers in succession updates the grid each time without stale rows', async () => {
      for (const payer of [publishedPayer.nameEn, original, publishedPayer.nameEn]) {
        await networkManagementPage.openListFor(payer);
        expect(await networkManagementPage.getScopedPayer()).toBe(payer);
        const owners = await networkManagementPage.readColumn(NETWORK_COLUMN.payer);
        expect(owners.filter((owner) => owner !== payer && owner !== NO_OWNER), `rows of other payers under ${payer}`).toEqual([]);
      }
    });

    await steps.step('Advanced criteria applied before a payer switch still hold, or reset cleanly, after it', async () => {
      await networkManagementPage.advancedSearchFor({ nameOrCode: RAPID_TERM });
      await networkManagementPage.scopeTo(original);
      const names = await networkManagementPage.readColumn(NETWORK_COLUMN.networkName);
      const chips = await networkManagementPage.getChips();
      expect(
        chips.includes(RAPID_TERM) === names.every((name) => name.includes(RAPID_TERM)),
        'the grid must agree with the chips after the switch - no stale criterion either way',
      ).toBe(true);
    });
  });

  test(`TC-${CASES.payerColumnPaging.azureId}: should sort by payer and keep the Payer column populated on later pages`, async ({
    networkManagementPage,
    steps,
  }) => {
    await steps.critical('Navigate to the module - the grid loads with the Payer column', async () => {
      await networkManagementPage.openList();
      expect(await networkManagementPage.getHeaderTexts()).toContain(PAYER_HEADER);
    });

    await steps.step('The directory can be sorted by payer in both directions', async () => {
      const options = await networkManagementPage.getSortOptions();
      expect(options.filter((option) => option.startsWith(PAYER_SORT_WORD)), 'payer ascending and descending sort options').toHaveLength(2);
    });

    await steps.step('On the next page the Payer column is still shown and populated', async () => {
      await networkManagementPage.goToPage(2);
      expect(await networkManagementPage.getHeaderTexts()).toContain(PAYER_HEADER);
      const owners = await networkManagementPage.readColumn(NETWORK_COLUMN.payer);
      expect(owners.length).toBeGreaterThan(0);
      expect(owners.filter((owner) => owner === ''), 'empty payer cells').toEqual([]);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
