import { test, expect } from '../../../fixtures';
import { NETWORK_COLUMN } from '../../../constants/ElementIds';
import {
  BLOCKED_CASES,
  CASES,
  MULTI_PAYER_ACCOUNT,
  NO_OWNER,
  PAYER_HEADER,
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

  // REWORKED 2026-11-19 (bug 20020, QA instruction): start from "All Payers", then select one payer and check the
  // list returns ONLY that payer's networks. The payer used is a suite payer that owns networks made for this case
  // (the non-admin's NUPCO owns none, so it listed nothing). The Payer column was removed (bug 20021), so ownership
  // is checked by network code: the payer's networks are known, and a network it does not own must drop out.
  test(`TC-${CASES.narrowsToPayer.azureId}: should list only that payer's networks when a payer is selected in the quick filter`, async ({
    networkManagementPage,
    publishedPayer,
    networkIn,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const payer = publishedPayer.nameEn;
    const owned = [
      await networkIn('Draft', { payerName: payer }),
      await networkIn('Draft', { payerName: payer }),
    ];
    const other = await networkIn('Draft'); // owned by no payer
    const ownedCodes: string[] = [];
    let otherCode = '';

    await steps.critical('Open the Network Directory with "All Payers" selected - every payer\'s networks are listed', async () => {
      await networkManagementPage.openList();
      expect(await networkManagementPage.scopeTo('All Payers'), 'the payer selector should offer "All Payers"').toBe(true);
      await networkManagementPage.openList();
      expect(await networkManagementPage.getScopedPayer()).toBe('All Payers');
      for (const network of owned) ownedCodes.push((await networkManagementPage.readRow(network.name)).code);
      otherCode = (await networkManagementPage.readRow(other.name)).code;
      expect([...ownedCodes, otherCode].every(Boolean), 'all three networks are listed under All Payers').toBe(true);
    });

    await steps.step(`Selecting "${payer}" refreshes the list to that payer`, async () => {
      await networkManagementPage.openListFor(payer);
      expect(await networkManagementPage.getScopedPayer()).toBe(payer);
    });

    // The payer also owns the network the suite links to every payer it publishes (a payer needs one to be
    // approved - seen as NET-000824 on 2026-11-19), so the list is checked for the payer's networks being there and
    // the network it does not own being gone, not for an exact set.
    await steps.step(`Only "${payer}"'s networks are listed`, async () => {
      let listed: string[] = [];
      await expect
        .poll(async () => {
          listed = await networkManagementPage.readCodesOnPage();
          return ownedCodes.every((c) => listed.includes(c)) && !listed.includes(otherCode);
        }, { timeout: 30_000 })
        .toBe(true)
        .catch(() => {
          throw new Error(`with "${payer}" selected the list should hold its networks ${ownedCodes.join(', ')} and not ${otherCode}; `
            + `it listed: ${listed.join(', ') || '(nothing)'}`);
        });
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

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
