import { expect } from '../../../fixtures';
import { SCOPED_PAYER } from '../../../data/formulary/formularyPermissions.data';
import { test } from '../../../utils/formulary/writerCHelpers';
import type { AddTradeValues } from '../../../pages/formulary/FormularyAddTradeDrawer';
import { FormularyDetailPage } from '../../../pages/formulary/FormularyDetailPage';
import { FormularyManagementPage } from '../../../pages/formulary/FormularyManagementPage';
import { FormularyTradesTab } from '../../../pages/formulary/FormularyTradesTab';
import { APPROVAL_STATUS, DIALOG_TITLE, TRADES, formularyDateText } from '../../../data/formulary/formulary.data';
import {
  ACTIVE,
  BLOCKED_CASES,
  CASES,
  EXPIRED,
  FUTURE,
  INACTIVE,
  NO_MATCH,
  OFFERS_ACTIVATE,
  OFFERS_INACTIVATE,
  PENDING_BLOCK,
  POPULATED,
} from '../../../data/formulary/tradesPricingTab.data';
import {
  addTrade,
  answerText,
  approveFormulary,
  deleteTrade,
  formularyTradeStatusIds,
  pendingFormularyRequestId,
  readPriceHistory,
  readTrades,
  rejectFormulary,
  submitFormulary,
  waitUntil,
} from '../../../utils/FormularyProvisioning';
import {
  addTradesToTiers,
  isoIn,
  requireAccepted,
  requireDone,
  signInWithFormularyRights,
  updateTradeTier,
  versionNumber,
} from '../../../utils/formulary/writerBHelpers';

/**
 * User story 15199: View Formulary - Trade & Pricing tab.
 * Trades are added, edited and deleted in the tab and shown as cards (title,
 * Trade Code, Tier, Coverage %, Net price, Rebate, Status) with an
 * Activate / Inactivate toggle; the advanced search filters by trade, tier and
 * status; a trade's status follows its effective period and its changes go
 * through the formulary's approval workflow.
 */
test.describe('US 15199 - View Formulary - Trade & Pricing tab', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.addTrade.azureId}: should show the new trade as a card with every entered detail when a trade is added from the tab`, async ({
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.addTrade;
    const formulary = await formularyIn('Draft', { tiers: 2, trades: 0 });
    const tier = [...formulary.tiers].sort((a, b) => a.tierOrder - b.tierOrder)[data.tierIndex];
    const values: AddTradeValues = {
      trade: data.trade,
      tier: tier.tierNameEn,
      coverage: data.coverage,
      supplierPrice: data.supplierPrice,
      vat: data.vat,
      rebateType: data.rebate.type,
      rebateValue: data.rebate.value,
      effectiveFrom: formularyDateText(formulary.effectiveDate),
      effectiveTo: formularyDateText(formulary.expiryDate),
    };
    let tradeId = '';

    await steps.critical('Navigate to the Formulary Management module - the module loads successfully', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open a formulary and select the Trade & Pricing tab - the tab shows the existing trade cards', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      expect(await formularyTradesTab.countCards()).toBe(0);
    });

    await steps.critical('Click Add Trade and enter the trade, tier, coverage, price and rebate - the form accepts the values', async () => {
      const drawer = await formularyTradesTab.openAdd();
      await drawer.fill(values);
      expect(await drawer.getNetPrice()).toBe(data.netPrice);
      expect(await drawer.getValue('coverage')).toContain(String(data.coverage));
      const answer = await drawer.attemptSave();
      expect(answer.status, answer.messages.join(' | ')).toBe(200);
    });

    await steps.step('Save the new trade - a new card shows the entered code, tier, coverage, net price and rebate', async () => {
      tradeId = await formularyTradesTab.tradeIdOf(data.trade);
      const card = await formularyTradesTab.readCard(tradeId);
      expect(card.tradeCode).toContain(data.trade);
      expect(card.tier).toContain(tier.tierNameEn);
      expect(card.coverage).toContain(String(data.coverage));
      expect(card.netPrice).toContain(data.netPrice.toFixed(2));
      expect(card.rebate).toContain(String(data.rebate.value));
    });
  });

  test(`TC-${CASES.editPricing.azureId}: should show the new net price and rebate when an existing trade's pricing is edited`, async ({
    formularyManagementPage,
    formularyTradesTab,
    formularyPriceHistoryDrawer,
    formularyIn,
    steps,
  }) => {
    const data = CASES.editPricing;
    const formulary = await formularyIn('Draft');
    const trade = formulary.trades[0];
    let periodId = '';

    await steps.critical('Navigate to the Formulary Management module - the module loads successfully', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Trade & Pricing tab and select the trade\'s pricing - the edit form opens with the current details', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      await formularyTradesTab.openPriceHistory(trade.id);
      periodId = (await formularyPriceHistoryDrawer.readPeriodIds())[0];
      await formularyPriceHistoryDrawer.openEditRecord(periodId);
      expect(Number(await formularyPriceHistoryDrawer.getRecordValue('supplierPrice'))).toBe(9);
    });

    await steps.step('Update the Net Price and the Rebate - the form reflects the new values', async () => {
      await formularyPriceHistoryDrawer.fillRecord({ supplierPrice: data.supplierPrice, discount: 0, vat: 0 });
      expect(await formularyPriceHistoryDrawer.getNetPriceMessage()).toContain(data.netPrice.toFixed(2));
      const saved = await formularyPriceHistoryDrawer.attemptSave();
      expect(saved.status, saved.messages.join(' | ')).toBe(200);
      await formularyPriceHistoryDrawer.openEditRebate(periodId);
      await formularyPriceHistoryDrawer.chooseRebateType(data.rebate.type);
      await formularyPriceHistoryDrawer.typeRebateValue(data.rebate.value);
      expect(await formularyPriceHistoryDrawer.isRebateValueShown()).toBe(true);
    });

    await steps.step('Save the changes - the trade\'s pricing card shows the new net price and rebate', async () => {
      const saved = await formularyPriceHistoryDrawer.attemptSave();
      expect(saved.status, saved.messages.join(' | ')).toBe(200);
      const card = await formularyPriceHistoryDrawer.readCard(periodId);
      expect(card.netPrice).toContain(data.netPrice.toFixed(2));
      expect(`${card.rebateType} ${card.rebate}`).toContain(String(data.rebate.value));
      await formularyPriceHistoryDrawer.close();
      const tradeCard = await formularyTradesTab.readCard(trade.id);
      expect(tradeCard.netPrice).toContain(data.netPrice.toFixed(2));
      expect(tradeCard.rebate).toContain(String(data.rebate.value));
    });
  });

  test(`TC-${CASES.deleteTrade.azureId}: should remove the trade card when a trade eligible for deletion is deleted`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { trades: 2 });
    const target = formulary.trades[1];

    await steps.critical('Navigate to the Formulary Management module - the module loads successfully', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Trade & Pricing tab and select a trade eligible for deletion - the card offers Delete', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      expect(await formularyTradesTab.getCardActionAvailability(target.id, 'remove')).toBe('available');
    });

    await steps.step('Click Delete and confirm - a confirmation prompt is shown and accepted', async () => {
      const dialog = await formularyTradesTab.requestRemove(target.id);
      expect(await dialog.getTitle()).toBe(DIALOG_TITLE.deleteTrade);
      await dialog.cancel();
      const answer = await formularyTradesTab.removeTrade(target.id);
      expect(answer.status, answer.text.slice(0, 300)).toBe(200);
    });

    await steps.step('Review the trade list - the deleted trade card no longer appears', async () => {
      await expect(formularyTradesTab.card(target.id)).toBeHidden();
      expect((await readTrades(page, formulary.id)).map((t) => t.id)).not.toContain(target.id);
    });
  });

  test(`TC-${CASES.cardDetails.azureId}: should show the trade name and every required summary detail on a trade card`, async ({
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Active', { rebate: CASES.cardDetails.rebate });
    const trade = formulary.trades[0];

    await steps.critical('Navigate to the Formulary Management module - the module loads successfully', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Trade & Pricing tab - the tab loads with trade cards displayed', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      expect(await formularyTradesTab.countCards()).toBe(formulary.trades.length);
    });

    await steps.step('Inspect a card against the checklist - title, Trade Code, Tier, Coverage %, Net Price, Rebate and Status are all populated', async () => {
      const card = await formularyTradesTab.readCard(trade.id);
      expect(card.title).toContain(trade.tradeNameEn);
      expect(card.tradeCode).toContain(trade.tradeCode);
      expect(card.tier).toContain(trade.tierNameEn);
      expect(card.coverage).toMatch(/\d/);
      expect(card.netPrice).toMatch(POPULATED);
      expect(card.rebate).toMatch(POPULATED);
      expect(card.status).toMatch(ACTIVE);
    });
  });

  test(`TC-${CASES.searchByName.azureId}: should show only the trades matching the name when the trade filter is applied`, async ({
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.searchByName;
    const formulary = await formularyIn('Draft', { trades: 3 });

    await steps.critical('Navigate to the Formulary Management module - the module loads successfully', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Trade & Pricing tab and the Advance Search - the panel shows a Trade filter field', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      const panel = await formularyTradesTab.openAdvancedSearch();
      expect(await panel.hasField('name')).toBe(true);
      await panel.cancel();
    });

    await steps.step('Enter a valid trade name and apply - only the matching trade cards are displayed', async () => {
      const items = await formularyTradesTab.applyCriteria({ name: data.term });
      expect(items.map((t) => t.tradeNameEn)).toEqual([expect.stringContaining(data.term)]);
      expect((await formularyTradesTab.readCards()).map((c) => c.title)).toEqual([expect.stringContaining(data.term)]);
    });
  });

  test(`TC-${CASES.filterByTier.azureId}: should show only the trades of the selected tier when the tier filter is applied`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }, testInfo) => {
    const data = CASES.filterByTier;
    const formulary = await formularyIn('Draft', { tiers: 2, trades: 0 });
    const [first, second] = [...formulary.tiers].sort((a, b) => a.tierOrder - b.tierOrder);
    await requireDone(testInfo, 'trades in two tiers', () => addTradesToTiers(page, formulary.id, [{ trade: 0, tierId: first.id }, { trade: 1, tierId: second.id }]));

    await steps.critical('Navigate to the Formulary Management module - the module loads successfully', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Trade & Pricing tab and the Advance Search - the panel shows a Tier filter', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      const panel = await formularyTradesTab.openAdvancedSearch();
      expect(await panel.hasField('tier')).toBe(true);
      await panel.cancel();
    });

    await steps.step('Select a tier and apply - only the trades of that tier are displayed', async () => {
      const items = await formularyTradesTab.applyCriteria({ tier: data.tier });
      expect(items.map((t) => t.tierNameEn)).toEqual([data.tier]);
      expect((await formularyTradesTab.readCards()).map((c) => c.tier)).toEqual([expect.stringContaining(data.tier)]);
    });
  });

  test(`TC-${CASES.filterByStatus.azureId}: should show only the trades in the selected status when the status filter is applied`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }, testInfo) => {
    const data = CASES.filterByStatus;
    const formulary = await formularyIn('Draft', { tiers: 1, trades: 0 });
    const tierId = formulary.tiers[0].id;
    await requireDone(testInfo, 'two active trades and a suspended one', () => addTradesToTiers(page, formulary.id, [
      { trade: 0, tierId },
      { trade: 1, tierId },
      { trade: 2, tierId, suspend: true },
    ]));

    await steps.critical('Navigate to the Formulary Management module - the module loads successfully', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Trade & Pricing tab and the Advance Search - the panel shows a Status filter', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      const panel = await formularyTradesTab.openAdvancedSearch();
      expect(await panel.hasField('status')).toBe(true);
      await panel.cancel();
    });

    await steps.step('Select "Active" and apply - only the trades currently Active are displayed', async () => {
      const activeId = (await formularyTradeStatusIds(page)).active;
      const items = await formularyTradesTab.applyCriteria({ status: data.status });
      expect(items.length).toBe(2);
      expect(items.filter((t) => t.statusId !== activeId).map((t) => t.tradeCode)).toEqual([]);
      expect((await formularyTradesTab.readCards()).map((c) => c.status).filter((s) => !ACTIVE.test(s))).toEqual([]);
    });
  });

  test(`TC-${CASES.combinedFilters.azureId}: should return only the trades matching trade, tier and status together when the filters are combined`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }, testInfo) => {
    const data = CASES.combinedFilters;
    const formulary = await formularyIn('Draft', { tiers: 2, trades: 0 });
    const [first, second] = [...formulary.tiers].sort((a, b) => a.tierOrder - b.tierOrder);
    await requireDone(testInfo, 'trades across two tiers and two statuses', () => addTradesToTiers(page, formulary.id, [
      { trade: 0, tierId: second.id },
      { trade: 1, tierId: second.id, suspend: true },
      { trade: 2, tierId: first.id },
    ]));
    let items: Awaited<ReturnType<typeof formularyTradesTab.applyCriteria>> = [];

    await steps.critical('Navigate to the Formulary Management module - the module loads successfully', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Trade & Pricing tab and the Advance Search - the panel shows Trade, Tier and Status filters', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      const panel = await formularyTradesTab.openAdvancedSearch();
      expect([await panel.hasField('name'), await panel.hasField('tier'), await panel.hasField('status')]).toEqual([true, true, true]);
      await panel.cancel();
    });

    await steps.step('Enter a trade name, a tier and a status together and apply - the search runs with all three conditions', async () => {
      items = await formularyTradesTab.applyCriteria({ name: data.name, tier: data.tier, status: data.status });
      expect(Array.isArray(items)).toBe(true);
    });

    await steps.step('Review the results - only the trade matching all three criteria is displayed', async () => {
      expect(items.map((t) => t.tradeCode)).toEqual([TRADES[0].code]);
      expect((await formularyTradesTab.readCards()).map((c) => c.tradeCode)).toEqual([expect.stringContaining(TRADES[0].code)]);
    });
  });

  test(`TC-${CASES.toggleFromCard.azureId}: should inactivate a trade from its card toggle and show it Inactive once approved`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Active');
    const trade = formulary.trades[0];

    await steps.critical('Navigate to the Formulary Management module - the module loads successfully', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Trade & Pricing tab and locate an Active trade card - its toggle is set to Active', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      const card = await formularyTradesTab.readCard(trade.id);
      expect(card.status).toMatch(ACTIVE);
      expect(card.toggleLabel).toMatch(OFFERS_INACTIVATE);
    });

    await steps.critical('Click the toggle to inactivate - a confirmation is requested and the request is submitted for approval', async () => {
      const answer = await formularyTradesTab.toggleStatus(trade.id);
      expect(answer.status, answer.text.slice(0, 300)).toBe(200);
      const sent = await formularyDetailPage.sendForApproval();
      expect(sent.status, sent.text.slice(0, 300)).toBe(200);
      expect(await pendingFormularyRequestId(page, formulary.nameEn)).not.toBe('');
    });

    await steps.step('Refresh the tab after approval - the card\'s toggle and status show Inactive', async () => {
      await approveFormulary(page, formulary.nameEn);
      await formularyDetailPage.reload();
      await formularyTradesTab.open();
      const card = await formularyTradesTab.readCard(trade.id);
      expect(card.status).toMatch(INACTIVE);
      expect(card.toggleLabel).toMatch(OFFERS_ACTIVATE);
    });
  });

  test(`TC-${CASES.statusByPeriod.azureId}: should show Future, Active and Expired from each trade's effective period without manual action`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.statusByPeriod;
    const expiresAt = isoIn(data.expiresAfterMinutes);
    const formulary = await formularyIn('Active', {
      trades: [
        { tradeId: TRADES[0].id },
        { tradeId: TRADES[1].id, effectiveFrom: isoIn(data.futureAfterDays * 24 * 60) },
        { tradeId: TRADES[2].id, effectiveTo: expiresAt },
      ],
    });
    const byCode = Object.fromEntries(formulary.trades.map((t) => [t.tradeCode, t.id]));

    await steps.critical('Navigate to the Formulary Management module - the module loads successfully', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
    });

    await steps.step('Locate the trade whose effective start is in the future - its card shows "Future"', async () => {
      expect((await formularyTradesTab.readCard(byCode[TRADES[1].code])).status).toMatch(FUTURE);
    });

    await steps.step('Locate the trade whose effective period covers today - its card shows "Active"', async () => {
      expect((await formularyTradesTab.readCard(byCode[TRADES[0].code])).status).toMatch(ACTIVE);
    });

    await steps.step('Locate the trade whose effective end has passed - its card shows "Expired"', async () => {
      await waitUntil(page, expiresAt);
      await formularyDetailPage.reload();
      await formularyTradesTab.open();
      expect((await formularyTradesTab.readCard(byCode[TRADES[2].code])).status).toMatch(EXPIRED);
    });
  });

  test(`TC-${CASES.statusOnBoundary.azureId}: should read Active on the day a trade's period starts and on the day it ends`, async ({
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 0, 0);
    const formulary = await formularyIn('Active', { trades: [{ tradeId: TRADES[0].id }, { tradeId: TRADES[1].id, effectiveTo: endOfToday.toISOString() }] });
    const [startsToday, endsToday] = formulary.trades;

    await steps.critical('Navigate to the Formulary Management module - the module loads successfully', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
    });

    await steps.step('Check the trade whose effective start is today - it has already moved from Future to Active', async () => {
      expect((await formularyTradesTab.readCard(startsToday.id)).status).toMatch(ACTIVE);
    });

    await steps.step('Check the trade whose effective end is today - it still reads Active on its last valid day', async () => {
      expect((await formularyTradesTab.readCard(endsToday.id)).status).toMatch(ACTIVE);
    });
  });

  test(`TC-${CASES.approvalProgress.azureId}: should move a trade change through Draft, Pending Approval and Approved with the version incremented`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Future');
    let startVersion = NaN;

    await steps.critical('Navigate to the Formulary Management module - the module loads successfully', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
      await formularyManagementPage.openDetails(formulary.nameEn);
      startVersion = versionNumber(await formularyDetailPage.getVersionBadge());
      expect(startVersion).toBeGreaterThanOrEqual(1);
    });

    await steps.critical('Open the Trade & Pricing tab and add a trade - the approval status shows "Draft"', async () => {
      await formularyTradesTab.open();
      const drawer = await formularyTradesTab.openAdd();
      await drawer.fill({
        trade: CASES.approvalProgress.trade,
        tier: formulary.tiers[0].tierNameEn,
        supplierPrice: 20,
        vat: 15,
        effectiveFrom: formularyDateText(formulary.effectiveDate),
        effectiveTo: formularyDateText(formulary.expiryDate),
      });
      const answer = await drawer.attemptSave();
      expect(answer.status, answer.messages.join(' | ')).toBe(200);
      await formularyDetailPage.reload();
      expect(await formularyDetailPage.getVersionBadge()).toContain(APPROVAL_STATUS.draft);
    });

    await steps.critical('Submit the trade for approval - the approval status changes to "Pending Approval"', async () => {
      const sent = await formularyDetailPage.sendForApproval();
      expect(sent.status, sent.text.slice(0, 300)).toBe(200);
      await formularyDetailPage.reload();
      expect(await formularyDetailPage.getVersionBadge()).toContain(APPROVAL_STATUS.pending);
    });

    await steps.step('Have the approver approve - the approval status changes to "Approved" and the version number increments', async () => {
      await approveFormulary(page, formulary.nameEn);
      await formularyDetailPage.reload();
      const badge = await formularyDetailPage.getVersionBadge();
      expect(badge).toContain(APPROVAL_STATUS.approved);
      expect(versionNumber(badge)).toBeGreaterThan(startVersion);
    });
  });

  test(`TC-${CASES.rejectedResubmitted.azureId}: should let a rejected trade change be edited and resubmitted without losing its data`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }, testInfo) => {
    const formulary = await formularyIn('Future');
    const added = await addTrade(page, formulary.id, { tradeId: TRADES[1].id, tierId: formulary.tiers[0].id });
    requireAccepted(testInfo, added, 'a trade added to the published formulary');
    requireAccepted(testInfo, await submitFormulary(page, formulary.id), 'the trade change sent for approval');
    const tradeId = added.id ?? '';

    await steps.critical('Navigate to the Formulary Management module - the module loads successfully', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Trade & Pricing tab and locate the trade pending approval - it shows "Pending Approval"', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      expect(await formularyDetailPage.getVersionBadge()).toContain(APPROVAL_STATUS.pending);
      await formularyTradesTab.open();
      expect(await formularyTradesTab.card(tradeId).isVisible()).toBe(true);
    });

    await steps.critical('Have the approver reject the submission - the status changes to "Rejected" and the trade is editable again', async () => {
      const rejected = await rejectFormulary(page, formulary.nameEn);
      expect(rejected.status, answerText(rejected)).toBe(200);
      await formularyDetailPage.reload();
      expect(await formularyDetailPage.getVersionBadge()).toContain(APPROVAL_STATUS.rejected);
      await formularyTradesTab.open();
      expect(await formularyTradesTab.getCardActionAvailability(tradeId, 'toggleStatus')).toBe('available');
    });

    await steps.step('Edit the trade and resubmit it - the status returns to "Pending Approval" with the entered data kept', async () => {
      const edited = await formularyTradesTab.toggleStatus(tradeId);
      expect(edited.status, edited.text.slice(0, 300)).toBe(200);
      const sent = await formularyDetailPage.sendForApproval();
      expect(sent.status, sent.text.slice(0, 300)).toBe(200);
      await formularyDetailPage.reload();
      expect(await formularyDetailPage.getVersionBadge()).toContain(APPROVAL_STATUS.pending);
      expect((await readTrades(page, formulary.id)).map((t) => t.tradeCode)).toContain(TRADES[1].code);
    });
  });

  test(`TC-${CASES.noPermission.azureId}: should show trades read-only and withhold add, edit and delete from a non-administrator`, async ({
    formularyIn,
    formularyRole,
    steps,
  }, testInfo) => {
    const formulary = await formularyIn('Draft', { payerName: SCOPED_PAYER });
    const trade = formulary.trades[0];
    const session = await signInWithFormularyRights(formularyRole, {
      held: ['viewFormulary', 'viewTrades'],
      lacking: ['addTrade', 'updateTrade', 'deleteTrade', 'setTradeStatus'],
    });
    const list = new FormularyManagementPage(session.page);
    const detail = new FormularyDetailPage(session.page);
    const trades = new FormularyTradesTab(session.page);

    await steps.critical('Navigate to the Formulary Management module - the module loads successfully', async () => {
      await list.openExpectingDenial();
      expect(await list.isListRendered()).toBe(true);
    });

    await steps.critical('Signed in as a non-administrator, open the Trade & Pricing tab - the trade cards show read-only', async () => {
      await detail.open(formulary.id);
      await trades.open();
      expect(await trades.countCards()).toBe(1);
    });

    await steps.step('Attempt Add, Edit or Delete on a trade card - the actions are disabled or hidden', async () => {
      expect(await trades.isAddOffered()).not.toBe('available');
      expect(await trades.getCardActionAvailability(trade.id, 'remove')).not.toBe('available');
      expect(await trades.getCardActionAvailability(trade.id, 'toggleStatus')).not.toBe('available');
      const direct = await deleteTrade(session.page, trade.id);
      expect(direct.status, `a direct DeleteFormularyTrade answered ${direct.status}`).toBeGreaterThanOrEqual(400);
    });
  });

  test(`TC-${CASES.emptySearch.azureId}: should show a clear empty state when the trade search matches nothing`, async ({
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { trades: 2 });
    let items: Awaited<ReturnType<typeof formularyTradesTab.applyCriteria>> = [];

    await steps.critical('Navigate to the Formulary Management module - the module loads successfully', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Trade & Pricing tab and the Advance Search - the search panel displays', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      const panel = await formularyTradesTab.openAdvancedSearch();
      expect(await panel.isOpen()).toBe(true);
      await panel.cancel();
    });

    await steps.step('Enter a trade name that is not in the formulary and apply - the search executes', async () => {
      items = await formularyTradesTab.applyCriteria({ name: CASES.emptySearch.term });
      expect(items).toEqual([]);
    });

    await steps.step('Review the results area - an empty-state message says no matching trades were found', async () => {
      expect(await formularyTradesTab.countCards()).toBe(0);
      expect(await formularyTradesTab.getPanelText()).toMatch(NO_MATCH);
    });
  });

  test(`TC-${CASES.pendingDeletion.azureId}: should refuse to delete a trade while its change is pending approval`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('PendingApproval');
    const trade = formulary.trades[0];

    await steps.critical('Navigate to the Formulary Management module - the module loads successfully', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Trade & Pricing tab and locate the trade pending approval - it shows "Pending Approval"', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      expect(await formularyDetailPage.getVersionBadge()).toContain(APPROVAL_STATUS.pending);
      await formularyTradesTab.open();
      expect(await formularyTradesTab.card(trade.id).isVisible()).toBe(true);
    });

    await steps.step('Attempt to delete this trade - the deletion is blocked with a message that pending-approval trades cannot be deleted', async () => {
      if ((await formularyTradesTab.getCardActionAvailability(trade.id, 'remove')) === 'available') {
        const answer = await formularyTradesTab.removeTrade(trade.id);
        expect(answer.status, 'the deletion must be refused').not.toBe(200);
        expect(`${answer.messages.join(' | ')} ${answer.text}`).toMatch(PENDING_BLOCK);
      }
      const direct = await deleteTrade(page, trade.id);
      expect(direct.status, `a direct DeleteFormularyTrade answered ${direct.status} ${answerText(direct)}`).toBeGreaterThanOrEqual(400);
      expect((await readTrades(page, formulary.id)).map((t) => t.id)).toContain(trade.id);
      expect(await pendingFormularyRequestId(page, formulary.nameEn)).not.toBe('');
    });
  });

  test(`TC-${CASES.tierChangeReflected.azureId}: should show a trade under its new tier in the filters once its tier is changed`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.tierChangeReflected;
    const formulary = await formularyIn('Draft', { tiers: 3 });
    const trade = formulary.trades[0];
    const target = formulary.tiers.find((t) => t.tierNameEn === data.to);

    await steps.critical('Navigate to the Formulary Management module - the module loads successfully', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
      expect(trade.tierNameEn).toBe(data.from);
    });

    await steps.critical('Edit the trade to move it from Tier 1 to Tier 3 - the new tier is accepted and saved', async () => {
      const answer = await updateTradeTier(page, trade, formulary.id, target?.id ?? '');
      expect(answer.status, `UpdateFormularyTrade answered ${answer.status} ${answerText(answer)}`).toBe(200);
      expect((await readTrades(page, formulary.id)).find((t) => t.id === trade.id)?.tierNameEn).toBe(data.to);
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      expect((await formularyTradesTab.readCard(trade.id)).tier).toContain(data.to);
    });

    await steps.step('Filter by the new tier (Tier 3) - the trade appears in the results', async () => {
      const items = await formularyTradesTab.applyCriteria({ tier: data.to });
      expect(items.map((t) => t.id)).toContain(trade.id);
    });

    await steps.step('Filter by the old tier (Tier 1) - the trade no longer appears', async () => {
      const items = await formularyTradesTab.applyCriteria({ tier: data.from });
      expect(items.map((t) => t.id)).not.toContain(trade.id);
      expect((await readPriceHistory(page, trade.id)).length, 'the trade keeps its pricing').toBeGreaterThan(0);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
