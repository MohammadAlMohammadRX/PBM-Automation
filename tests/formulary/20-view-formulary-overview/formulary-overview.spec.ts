import { test, expect } from '../../../fixtures';
import { formularyDateText } from '../../../data/formulary/formulary.data';
import { ALL_TABS, CASES, EMPTY_DESCRIPTION, dayAheadIso } from '../../../data/formulary/formularyOverview.data';

/** The day part (`DD/MM/YYYY`) of an ISO date as the screens show it. */
const dayOf = (iso: string): string => formularyDateText(iso).slice(0, 10);

/**
 * User story 15218: View Formulary - Overview.
 * The detail screen opens on Overview (Formulary Code, Payer, Total Tiers,
 * Total Trades, Effective Date, Expiry Date, Description) and offers Tiers,
 * Trades & Pricing, Version History and Audit History, each with its own
 * details. Who may see it: overview-permission.spec.ts.
 */
test.describe('US 15218 - View Formulary - Overview', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.overviewDetails.azureId}: should open on Overview showing every key detail with its correct value`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyIn,
    steps,
  }) => {
    const data = CASES.overviewDetails;
    const formulary = await formularyIn('Draft', { tiers: data.tiers, trades: data.trades, descriptionEn: data.description });

    await steps.critical('Navigate to the Formulary Management module - it loads and lists formularies', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open an existing formulary - the details page opens on the Overview tab by default', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      expect(await formularyDetailPage.isOverviewShown()).toBe(true);
    });

    await steps.step('Review the Overview - Code, Payer, Total Tiers, Total Trades, Effective / Expiry Date and Description are correct', async () => {
      const record = await formularyDetailPage.readViaApi(formulary.id);
      const overview = await formularyDetailPage.readOverview();
      expect({
        code: overview.code,
        payer: overview.payer,
        totalTiers: overview.totalTiers,
        totalTrades: overview.totalTrades,
        description: overview.description,
      }).toEqual({
        code: record.formularyCode ?? '',
        payer: data.payer,
        totalTiers: String(data.tiers),
        totalTrades: String(data.trades),
        description: data.description,
      });
      expect(overview.effectiveDate).toContain(dayOf(formulary.effectiveDate));
      expect(overview.expiryDate).toContain(dayOf(formulary.expiryDate));
    });
  });

  test(`TC-${CASES.allTabs.azureId}: should offer all five tabs and open each with its own content`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyTiersTab,
    formularyTradesTab,
    formularyVersionHistoryTab,
    formularyAuditTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Future');

    await steps.critical('Navigate to the Formulary Management module - it loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open a formulary - Overview, Tiers, Trade and Pricing, Version History and Audit History are visible', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      expect(await formularyDetailPage.readOfferedTabs()).toEqual([...ALL_TABS]);
    });

    await steps.step('Click each tab in turn - each opens and shows its own content without error', async () => {
      await formularyDetailPage.openTab('overview');
      const content = {
        overview: await formularyDetailPage.isOverviewShown(),
        tiers: await formularyTiersTab.open().then(() => formularyTiersTab.countCards()),
        trades: await formularyTradesTab.open().then(() => formularyTradesTab.countCards()),
        versions: await formularyVersionHistoryTab.open().then(async () => (await formularyVersionHistoryTab.readRows()).length),
        audit: await formularyAuditTab.open().then(async () => (await formularyAuditTab.readEntries()).length),
      };
      expect(content).toEqual({
        overview: true,
        tiers: formulary.tiers.length,
        trades: formulary.trades.length,
        versions: expect.any(Number),
        audit: expect.any(Number),
      });
      expect(Math.min(content.versions, content.audit), 'Version History and Audit History show their records').toBeGreaterThan(0);
    });
  });

  test(`TC-${CASES.zeroCounts.azureId}: should show Total Tiers and Total Trades as 0 for a formulary with neither`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { tiers: 0 });

    await steps.critical('Navigate to the Formulary Management module - it loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the new formulary with no tiers or trades - the Overview tab loads', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      expect(await formularyDetailPage.isOverviewShown()).toBe(true);
    });

    await steps.step('Review Total Tiers and Total Trades - both display 0', async () => {
      expect({ tiers: await formularyDetailPage.readOverviewField('totalTiers'), trades: await formularyDetailPage.readOverviewField('totalTrades') })
        .toEqual({ tiers: '0', trades: '0' });
    });
  });

  test(`TC-${CASES.singleDay.azureId}: should show the same Effective and Expiry Date for a formulary valid for a single day`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyIn,
    steps,
  }) => {
    const day = dayAheadIso(CASES.singleDay.daysAhead);
    // Valid for one day: the application refuses an expiry equal to the effective
    // instant (422 "Expiry date must be after the effective date"), so the window
    // closes later the same day.
    const sameDayEnd = new Date(new Date(day).getTime() + CASES.singleDay.windowMinutes * 60_000).toISOString();
    const formulary = await formularyIn('Draft', { effectiveDate: day, expiryDate: sameDayEnd });

    await steps.critical('Navigate to the Formulary Management module - it loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the formulary whose Effective Date equals its Expiry Date - the Overview tab loads', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      expect(await formularyDetailPage.isOverviewShown()).toBe(true);
    });

    await steps.step('Review the Effective and Expiry Date - both display the same value correctly', async () => {
      const effective = await formularyDetailPage.readOverviewField('effectiveDate');
      const expiry = await formularyDetailPage.readOverviewField('expiryDate');
      // DD/MM/YYYY HH:mm - the same date, the times differing within the day.
      expect(effective.slice(0, 10), 'the Effective and Expiry Date should be the same day').toBe(expiry.slice(0, 10));
      expect(effective).toContain(dayOf(day));
    });
  });

  test(`TC-${CASES.tabSwitching.azureId}: should keep each tab's data unchanged while moving between the tabs`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyTiersTab,
    formularyTradesTab,
    formularyVersionHistoryTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Future', { tiers: 2, trades: 2 });
    let first: Record<string, string> = {};

    await steps.critical('Navigate to the Formulary Management module - it loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open a formulary and view the Overview tab - its data loads correctly', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      first = await formularyDetailPage.snapshotOverview();
      expect({ tiers: first.totalTiers, trades: first.totalTrades }).toEqual({ tiers: '2', trades: '2' });
    });

    await steps.step('Click Tiers, Trade and Pricing, Version History and back to Overview, repeatedly - each tab shows its own correct data every time', async () => {
      const versions = (await formularyVersionHistoryTab.fetchVersions(formulary.id)).length;
      const seen: string[] = [];
      for (let round = 1; round <= CASES.tabSwitching.rounds; round += 1) {
        await formularyTiersTab.open();
        seen.push(`tiers ${await formularyTiersTab.countCards()}`);
        await formularyTradesTab.open();
        seen.push(`trades ${await formularyTradesTab.countCards()}`);
        await formularyVersionHistoryTab.open();
        seen.push(`versions ${(await formularyVersionHistoryTab.readRows()).length}`);
        expect(await formularyDetailPage.snapshotOverview(), `round ${round}: the Overview after switching`).toEqual(first);
      }
      expect(seen).toEqual(Array.from({ length: CASES.tabSwitching.rounds }, () => ['tiers 2', 'trades 2', `versions ${versions}`]).flat());
    });
  });

  test(`TC-${CASES.deletedFormulary.azureId}: should say the formulary cannot be loaded instead of showing blank data when it no longer exists`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft');

    await steps.critical('Precondition: the formulary is deleted while its link is still known', async () => {
      expect((await formularyDetailPage.deleteViaApi(formulary.id)).status).toBe(200);
      expect(await formularyDetailPage.readViaApiOrNull(formulary.id)).toBeNull();
    });

    await steps.critical('Navigate to the Formulary Management module - it loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(false);
    });

    await steps.step('Attempt to open the deleted formulary - the Overview tab does not load', async () => {
      await formularyDetailPage.openExpectingFailure(formulary.id);
      expect(await formularyDetailPage.isOverviewShown()).toBe(false);
    });

    await steps.step('Observe the response - "Unable to load the requested formulary." is shown instead of broken or blank data', async () => {
      expect(await formularyDetailPage.getScreenText()).toMatch(CASES.deletedFormulary.message);
    });
  });

  test(`TC-${CASES.countsMatchTabs.azureId}: should list as many tiers and trades in their tabs as the Overview counts`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyTiersTab,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.countsMatchTabs;
    const formulary = await formularyIn('Draft', { tiers: data.tiers, trades: data.trades });
    let counts = { tiers: -1, trades: -1 };

    await steps.critical('Navigate to the Formulary Management module - it loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the formulary and note Total Tiers and Total Trades on the Overview - the values are recorded', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      counts = { tiers: Number(await formularyDetailPage.readOverviewField('totalTiers')), trades: Number(await formularyDetailPage.readOverviewField('totalTrades')) };
      expect(counts).toEqual({ tiers: data.tiers, trades: data.trades });
    });

    await steps.step('Open the Tiers tab - the number of tiers listed matches the Overview count', async () => {
      await formularyTiersTab.open();
      expect(await formularyTiersTab.countCards()).toBe(counts.tiers);
    });

    await steps.step('Open the Trade and Pricing tab - the number of trades listed matches the Overview count', async () => {
      await formularyTradesTab.open();
      expect(await formularyTradesTab.countCards()).toBe(counts.trades);
    });
  });

  test(`TC-${CASES.noDescription.azureId}: should show a clear empty state for the Description when none was entered`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { descriptionEn: null, descriptionAr: null });

    await steps.critical('Navigate to the Formulary Management module - it loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the formulary with no description - the Overview tab loads', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      expect(await formularyDetailPage.isOverviewShown()).toBe(true);
    });

    await steps.step('Review the Description - it shows " - " (or "No description provided"), not an error', async () => {
      expect(await formularyDetailPage.readOverviewField('description')).toMatch(EMPTY_DESCRIPTION);
    });
  });

  test(`TC-${CASES.versionsFromOverview.azureId}: should list the formulary's historical versions in the Version History tab of the same page`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyVersionHistoryTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Active');

    await steps.critical('Navigate to the Formulary Management module - it loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open a formulary and view the Overview tab - its data loads', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      expect(await formularyDetailPage.isOverviewShown()).toBe(true);
    });

    await steps.step('Click the Version History tab - it lists the prior versions with their details', async () => {
      await formularyVersionHistoryTab.open();
      const rows = await formularyVersionHistoryTab.readRows();
      expect(rows.length).toBeGreaterThanOrEqual(2);
      expect(rows.filter((r) => r.version === '' || r.status === '' || r.requestedBy === '').map((r) => r.rowId), 'rows missing their details').toEqual([]);
    });
  });

  test(`TC-${CASES.countsAfterAdd.azureId}: should raise Total Trades by one once a trade is added`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { tiers: 1, trades: 1 });
    let before = { tiers: '', trades: '' };

    await steps.critical('Navigate to the Formulary Management module - it loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the formulary and note Total Tiers and Total Trades on the Overview - the counts are recorded', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      before = { tiers: await formularyDetailPage.readOverviewField('totalTiers'), trades: await formularyDetailPage.readOverviewField('totalTrades') };
      expect(before).toEqual({ tiers: '1', trades: '1' });
    });

    await steps.critical('Add one new trade under the Trade and Pricing tab - the trade is saved', async () => {
      await formularyTradesTab.open();
      const drawer = await formularyTradesTab.openAdd();
      await drawer.fill({
        trade: CASES.countsAfterAdd.addedTrade,
        tier: formulary.tiers[0].tierNameEn,
        supplierPrice: 9,
        vat: 0,
        effectiveFrom: formularyDateText(formulary.effectiveDate),
        effectiveTo: formularyDateText(formulary.expiryDate),
      });
      await drawer.save();
      expect((await formularyTradesTab.fetchTrades(formulary.id)).length).toBe(2);
    });

    await steps.step('Return to the Overview tab - Total Trades has increased by one', async () => {
      await formularyDetailPage.reload();
      await formularyDetailPage.openTab('overview');
      expect({ tiers: await formularyDetailPage.readOverviewField('totalTiers'), trades: await formularyDetailPage.readOverviewField('totalTrades') })
        .toEqual({ tiers: before.tiers, trades: String(Number(before.trades) + 1) });
    });
  });
});
