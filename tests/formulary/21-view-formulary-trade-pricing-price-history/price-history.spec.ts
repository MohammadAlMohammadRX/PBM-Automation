import { expect } from '../../../fixtures';
import { SCOPED_PAYER } from '../../../data/formulary/formularyPermissions.data';
import { test } from '../../../utils/formulary/writerCHelpers';
import type { FormularyPriceHistoryDrawer, PriceRecordValues } from '../../../pages/formulary/FormularyPriceHistoryDrawer';
import { FormularyDetailPage } from '../../../pages/formulary/FormularyDetailPage';
import { FormularyTradesTab } from '../../../pages/formulary/FormularyTradesTab';
import { APPROVAL_STATUS, DIALOG_TITLE, formularyDateText, netPrice } from '../../../data/formulary/formulary.data';
import {
  AFTER_FROM,
  BLOCKED_CASES,
  CASES,
  CURRENT,
  DRAFT,
  EXPIRED,
  FUTURE,
  NEGATIVE,
  NUMERIC_ONLY,
  OVERLAP,
  RANGE,
  REQUIRED,
  REQUIRED_LABELS,
} from '../../../data/formulary/priceHistory.data';
import {
  answerText,
  readPriceHistory,
  rebateTypeId,
  upsertRebate,
  waitUntil,
} from '../../../utils/FormularyProvisioning';
import {
  blockRemainingSteps,
  hasDraft,
  isoDaysAfter,
  isoIn,
  priceTimeline,
  provide,
  signInWithFormularyRights,
  shortPricedDraft,
} from '../../../utils/formulary/writerBHelpers';

/** A new period's form values: its dates first (the pickers commit with Enter), then the prices. */
const period = (from: string, to: string, prices: PriceRecordValues): PriceRecordValues => ({
  effectiveFrom: formularyDateText(from),
  effectiveTo: formularyDateText(to),
  ...prices,
});

/**
 * User story 17634: View Formulary - Trade & Pricing / Price History.
 * Each trade's price periods are added, edited and deleted from its Price
 * History; periods never overlap, the net price is (Supplier - Supplier x
 * Discount%) x (1 + VAT%), only future records (and their rebates) may change,
 * and statuses follow the dates. Most cases price a Draft formulary's trade for
 * its first 30 days only, so new periods fit after it.
 */
test.describe('US 17634 - View Formulary - Trade & Pricing / Price History', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.addPeriod.azureId}: should save a new price period with its calculated net price and a Future status`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }, testInfo) => {
    const data = CASES.addPeriod;
    const built = await provide(testInfo, 'a draft formulary priced for its first 30 days', () => shortPricedDraft(page, formularyIn));
    let drawer!: FormularyPriceHistoryDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(built.formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open a formulary, go to Trade and Pricing and select a trade - its Price History opens', async () => {
      await formularyManagementPage.openDetails(built.formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openPriceHistory(built.tradeId);
      expect(await drawer.readPeriodIds()).toHaveLength(1);
    });

    await steps.step('Click Add and enter Effective From / To, Supplier Price, VAT % and Discount % - the fields accept the values', async () => {
      await drawer.openAddRecord();
      await drawer.fillRecord(period(built.futureFrom, built.futureTo, { supplierPrice: data.supplierPrice, vat: data.vat, discount: data.discount }));
      expect(Number(await drawer.getRecordValue('supplierPrice'))).toBe(data.supplierPrice);
    });

    await steps.step('Save the new period - it is saved with the net price calculated and a Future status', async () => {
      const answer = await drawer.attemptSave();
      expect(answer.status, answer.messages.join(' | ')).toBe(200);
      const added = (await readPriceHistory(page, built.tradeId)).find((p) => p.supplierPrice === data.supplierPrice);
      expect(added?.netPrice).toBe(data.netPrice);
      const card = await drawer.readCard(added?.id ?? '');
      expect(card.netPrice).toContain(data.netPrice.toFixed(2));
      expect(card.status).toMatch(FUTURE);
    });
  });

  test(`TC-${CASES.formLayout.azureId}: should present every pricing field grouped under the effective period with required markers`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }, testInfo) => {
    const built = await provide(testInfo, 'a draft formulary priced for its first 30 days', () => shortPricedDraft(page, formularyIn));
    let drawer!: FormularyPriceHistoryDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(built.formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open a trade\'s Price History and click Add - the form opens', async () => {
      await formularyManagementPage.openDetails(built.formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openPriceHistory(built.tradeId);
      await drawer.openAddRecord();
      expect(await drawer.isRecordFieldShown('supplierPrice')).toBe(true);
    });

    await steps.step('Review the layout - Effective From / To together, then Base Cost, Public Price, Supplier Price, Discount %, VAT % and the Net Price, with required markers', async () => {
      const top = await drawer.getRecordFieldTops();
      for (const [field, y] of Object.entries(top)) expect(Number.isNaN(y), `${field} is shown`).toBe(false);
      expect(Math.abs(top.effectiveFrom - top.effectiveTo), 'Effective From and To sit together').toBeLessThan(80);
      expect(Math.max(top.effectiveFrom, top.effectiveTo), 'the period comes first').toBeLessThan(top.baseCost);
      const order = [top.baseCost, top.publicPrice, top.supplierPrice, top.discount, top.vat];
      expect(order, 'the prices follow in order').toEqual([...order].sort((a, b) => a - b));
      expect(await drawer.getNetPriceMessage()).toMatch(/net price/i);
      const required = (await drawer.getRecordRequiredLabels()).join(' | ');
      for (const label of REQUIRED_LABELS) expect(required, `${label} is marked required`).toMatch(label);
      expect(required, 'Base Cost is optional').not.toMatch(/Base Cost/i);
    });
  });

  test(`TC-${CASES.zeroValues.azureId}: should accept a supplier price and VAT of zero`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }, testInfo) => {
    const data = CASES.zeroValues;
    const built = await provide(testInfo, 'a draft formulary priced for its first 30 days', () => shortPricedDraft(page, formularyIn));
    let drawer!: FormularyPriceHistoryDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(built.formulary.nameEn)).toBe(true);
    });

    await steps.step('Add a period with Supplier Price 0 and VAT 0 - the values are accepted', async () => {
      await formularyManagementPage.openDetails(built.formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openPriceHistory(built.tradeId);
      await drawer.openAddRecord();
      await drawer.fillRecord(period(built.futureFrom, built.futureTo, { supplierPrice: data.supplierPrice, vat: data.vat, discount: data.discount }));
      expect(await drawer.getRecordError('supplierPrice')).toBe('');
      expect(await drawer.getRecordError('vat')).toBe('');
    });

    await steps.step('Save the period - it is saved and the Net Price shows 0', async () => {
      // Found by id, not by date: futureFrom is UTC and the stored date +03:00, so
      // near midnight their calendar days differ and nothing matched (2026-11-03).
      const known = new Set((await readPriceHistory(page, built.tradeId)).map((p) => p.id));
      const answer = await drawer.attemptSave();
      expect(answer.status, answer.messages.join(' | ')).toBe(200);
      const added = (await readPriceHistory(page, built.tradeId)).find((p) => !known.has(p.id));
      expect(added?.netPrice).toBe(data.netPrice);
    });
  });

  test(`TC-${CASES.maximumPercentages.azureId}: should accept a discount and VAT of 100 and calculate the net price by the formula`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }, testInfo) => {
    const data = CASES.maximumPercentages;
    const built = await provide(testInfo, 'a draft formulary priced for its first 30 days', () => shortPricedDraft(page, formularyIn));
    let drawer!: FormularyPriceHistoryDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(built.formulary.nameEn)).toBe(true);
    });

    await steps.step('Add a period with Discount 100 and VAT 100 - the values are accepted', async () => {
      await formularyManagementPage.openDetails(built.formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openPriceHistory(built.tradeId);
      await drawer.openAddRecord();
      await drawer.fillRecord(period(built.futureFrom, built.futureTo, { supplierPrice: data.supplierPrice, discount: data.discount, vat: data.vat }));
      expect([await drawer.getRecordError('discount'), await drawer.getRecordError('vat')]).toEqual(['', '']);
    });

    await steps.step('Save the period - it is saved and the Net Price follows the formula', async () => {
      const answer = await drawer.attemptSave();
      expect(answer.status, answer.messages.join(' | ')).toBe(200);
      const added = (await readPriceHistory(page, built.tradeId)).find((p) => p.supplierPrice === data.supplierPrice);
      expect(added?.netPrice).toBe(netPrice(data.supplierPrice, data.discount, data.vat));
    });
  });

  test(`TC-${CASES.overHundred.azureId}: should reject a discount or VAT above 100`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }, testInfo) => {
    const data = CASES.overHundred;
    const built = await provide(testInfo, 'a draft formulary priced for its first 30 days', () => shortPricedDraft(page, formularyIn));
    let drawer!: FormularyPriceHistoryDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(built.formulary.nameEn)).toBe(true);
    });

    await steps.step('Add a period with Discount 100.01 and VAT 101 - the values are flagged', async () => {
      await formularyManagementPage.openDetails(built.formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openPriceHistory(built.tradeId);
      await drawer.openAddRecord();
      await drawer.fillRecord(period(built.futureFrom, built.futureTo, { supplierPrice: data.supplierPrice, discount: data.discount, vat: data.vat }));
      const kept = [Number(await drawer.getRecordValue('discount')), Number(await drawer.getRecordValue('vat'))];
      const flagged = `${await drawer.getRecordError('discount')} ${await drawer.getRecordError('vat')}`;
      expect(kept.every((v) => v <= 100) || RANGE.test(flagged), `kept ${kept.join(' / ')}, flagged "${flagged}"`).toBe(true);
    });

    await steps.step('Attempt to save - the save is blocked with a clear validation message', async () => {
      // Capped at input (100.01 / 101 read 100) is prevention; saving the capped
      // values only proves 100 is allowed (2026-11-03, as 18612 / 18712).
      const kept = [Number(await drawer.getRecordValue('discount')), Number(await drawer.getRecordValue('vat'))];
      if (kept[0] !== Number(data.discount) && kept[1] !== data.vat) {
        expect(await readPriceHistory(page, built.tradeId)).toHaveLength(1);
        return;
      }
      const answer = await drawer.attemptSave();
      expect(answer.status, 'percentages above 100 must not be saved').not.toBe(200);
      expect(answer.messages.join(' | ')).toMatch(RANGE);
      expect(await readPriceHistory(page, built.tradeId)).toHaveLength(1);
    });
  });

  test(`TC-${CASES.supplierRequired.azureId}: should block saving a price period without a supplier price`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }, testInfo) => {
    const built = await provide(testInfo, 'a draft formulary priced for its first 30 days', () => shortPricedDraft(page, formularyIn));
    let drawer!: FormularyPriceHistoryDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(built.formulary.nameEn)).toBe(true);
    });

    await steps.step('Add a period leaving Supplier Price blank and filling VAT % - Supplier Price stays empty', async () => {
      await formularyManagementPage.openDetails(built.formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openPriceHistory(built.tradeId);
      await drawer.openAddRecord();
      await drawer.fillRecord(period(built.futureFrom, built.futureTo, { vat: CASES.supplierRequired.vat }));
      expect(await drawer.getRecordValue('supplierPrice')).toBe('');
    });

    await steps.step('Attempt to save - the save is blocked and Supplier Price is flagged as required', async () => {
      const answer = await drawer.attemptSave();
      expect(answer.status, 'nothing may be saved without a supplier price').not.toBe(200);
      expect(await drawer.getRecordError('supplierPrice')).toMatch(REQUIRED);
      expect(await readPriceHistory(page, built.tradeId)).toHaveLength(1);
    });
  });

  test(`TC-${CASES.negativeValues.azureId}: should reject negative base cost, public price and supplier price`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }, testInfo) => {
    const data = CASES.negativeValues;
    const built = await provide(testInfo, 'a draft formulary priced for its first 30 days', () => shortPricedDraft(page, formularyIn));
    let drawer!: FormularyPriceHistoryDrawer;
    let typed: string[] = [];

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(built.formulary.nameEn)).toBe(true);
    });

    await steps.step('Add a period with Base Cost -10, Public Price -5 and Supplier Price -20 - the values are entered', async () => {
      await formularyManagementPage.openDetails(built.formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openPriceHistory(built.tradeId);
      await drawer.openAddRecord();
      await drawer.fillRecord(period(built.futureFrom, built.futureTo, { baseCost: data.baseCost, publicPrice: data.publicPrice, supplierPrice: data.supplierPrice, vat: data.vat }));
      typed = [await drawer.getRecordValue('baseCost'), await drawer.getRecordValue('publicPrice'), await drawer.getRecordValue('supplierPrice')];
      expect(typed).toHaveLength(3);
    });

    await steps.step('Attempt to save - the save is blocked and the negative values are rejected with a message', async () => {
      const kept = typed.filter((v) => v.includes('-'));
      if (kept.length > 0) {
        const answer = await drawer.attemptSave();
        expect(answer.status, `negative prices (${typed.join(' / ')}) must not be saved`).not.toBe(200);
        expect(answer.messages.join(' | ')).toMatch(NEGATIVE);
      } else {
        for (const value of typed) expect(value, 'the field refused the minus sign').toMatch(NUMERIC_ONLY);
      }
      expect((await readPriceHistory(page, built.tradeId)).some((p) => p.baseCost < 0 || p.publicPrice < 0 || p.supplierPrice < 0)).toBe(false);
    });
  });

  test(`TC-${CASES.noOverlap.azureId}: should refuse an overlapping period and move the current price's end to a new price's start`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }, testInfo) => {
    const data = CASES.noOverlap;
    const built = await provide(testInfo, 'a draft formulary priced for its first 30 days', () => shortPricedDraft(page, formularyIn, { futurePeriod: true }));
    const live = await formularyIn('Active');
    const liveTrade = live.trades[0];
    let drawer!: FormularyPriceHistoryDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(built.formulary.nameEn)).toBe(true);
    });

    await steps.step('Add a new price over a period overlapping an existing future price - the overlapping dates are entered', async () => {
      await formularyManagementPage.openDetails(built.formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openPriceHistory(built.tradeId);
      await drawer.openAddRecord();
      const from = isoDaysAfter(built.formulary.effectiveDate, data.overlapStartAfterDays);
      await drawer.fillRecord(period(from, isoDaysAfter(built.formulary.effectiveDate, data.overlapEndAfterDays), { supplierPrice: 25, vat: 15 }));
      expect(await drawer.getRecordValue('effectiveFrom')).toBe(formularyDateText(from));
    });

    await steps.step('Attempt to save - the save is blocked with a clear overlap message', async () => {
      const answer = await drawer.attemptSave();
      expect(answer.status, 'an overlapping period must be refused').not.toBe(200);
      expect(`${answer.messages.join(' | ')} ${answer.text}`).toMatch(OVERLAP);
      expect(await readPriceHistory(page, built.tradeId)).toHaveLength(2);
      await drawer.cancelForm();
    });

    await steps.step('Add a new price starting while the current one runs - the current price ends at the new start (to the minute) and the new one becomes current', async () => {
      const current = (await readPriceHistory(page, liveTrade.id)).find((p) => p.periodStatus === 'current');
      expect(current, 'the Active formulary has a current price').toBeDefined();
      const startsAt = isoIn(data.newPriceInMinutes);
      await formularyDetailPage.open(live.id);
      await formularyTradesTab.open();
      const liveDrawer = await formularyTradesTab.openPriceHistory(liveTrade.id);
      await liveDrawer.openAddRecord();
      await liveDrawer.fillRecord(period(startsAt, live.expiryDate, { supplierPrice: data.newSupplierPrice, vat: 0 }));
      const answer = await liveDrawer.attemptSave();
      expect(answer.status, `${answer.messages.join(' | ')} ${answer.text.slice(0, 300)}`).toBe(200);
      const previous = (await readPriceHistory(page, liveTrade.id)).find((p) => p.id === current?.id);
      expect(formularyDateText(previous?.effectiveTo ?? ''), 'the current price now ends where the new one starts').toBe(formularyDateText(startsAt));
      await waitUntil(page, startsAt);
      const added = (await readPriceHistory(page, liveTrade.id)).find((p) => p.supplierPrice === data.newSupplierPrice);
      expect(added?.periodStatus).toBe('current');
    });
  });

  test(`TC-${CASES.statusByDates.azureId}: should show Future, Active and Expired on price periods from their dates`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }, testInfo) => {
    const timeline = await provide(testInfo, 'a price period timeline', () => priceTimeline(page, formularyIn));
    let drawer!: FormularyPriceHistoryDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await waitUntil(page, timeline.settledAt);
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(timeline.formulary.nameEn)).toBe(true);
      await formularyManagementPage.openDetails(timeline.formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openPriceHistory(timeline.tradeId);
    });

    await steps.step('View the period whose Effective From is in the future - it reads "Future"', async () => {
      expect((await drawer.readCard(timeline.periods.future)).status).toMatch(/Future/i);
    });

    await steps.step('View the period covering today - it reads "Active"', async () => {
      expect((await drawer.readCard(timeline.periods.current)).status).toMatch(CURRENT);
    });

    await steps.step('View the period whose Effective To has passed - it reads "Expired"', async () => {
      expect((await drawer.readCard(timeline.periods.expired)).status).toMatch(EXPIRED);
    });
  });

  test(`TC-${CASES.approvalProgress.azureId}: should move a new price record from Draft to Pending Approval and through its approval decisions`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.approvalProgress;
    const formulary = await formularyIn('Future');
    const trade = formulary.trades[0];
    let periodId = '';

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the newly created price period - its approval status shows "Draft"', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      const drawer = await formularyTradesTab.openPriceHistory(trade.id);
      await drawer.openAddRecord();
      const from = isoDaysAfter(formulary.expiryDate, 1);
      await drawer.fillRecord(period(from, isoDaysAfter(from, 30), { supplierPrice: data.supplierPrice, vat: data.vat }));
      const answer = await drawer.attemptSave();
      expect(answer.status, answer.messages.join(' | ')).toBe(200);
      const added = (await readPriceHistory(page, trade.id)).find((p) => p.supplierPrice === data.supplierPrice);
      periodId = added?.id ?? '';
      expect(added?.isDraft || DRAFT.test((await drawer.readCard(periodId)).status), 'the new record is a draft').toBe(true);
      expect(await hasDraft(page, formulary.id), 'the formulary carries the draft change').toBe(true);
    });

    await steps.critical('Submit the price period for approval - the status changes to "Pending Approval"', async () => {
      await formularyDetailPage.reload();
      const sent = await formularyDetailPage.sendForApproval();
      expect(sent.status, sent.text.slice(0, 300)).toBe(200);
      await formularyDetailPage.reload();
      expect(await formularyDetailPage.getVersionBadge()).toContain(APPROVAL_STATUS.pending);
    });

    await steps.step('Record the first approval decision as Approved - the record awaits the second approval decision', async () => {
      expect(periodId).not.toBe('');
      blockRemainingSteps(steps, 'The case needs two approval decisions by two approvers. The environment has ONE checker - the administrator approves its own '
        + 'submissions and no second approver account exists - so the first / second approval sequence cannot be exercised. Draft and '
        + 'Pending Approval were checked above; runnable once a second approver account is provisioned.');
    });

    await steps.step('Record the second approval decision as Approved - the status changes to "Approved" and the version number increments', async () => {
      expect(periodId).not.toBe('');
    });
  });

  test(`TC-${CASES.onlyFutureEditable.azureId}: should lock the expired and current price records and let only the future one be edited`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }, testInfo) => {
    const timeline = await provide(testInfo, 'a price period timeline', () => priceTimeline(page, formularyIn));
    let drawer!: FormularyPriceHistoryDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await waitUntil(page, timeline.settledAt);
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(timeline.formulary.nameEn)).toBe(true);
      await formularyManagementPage.openDetails(timeline.formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openPriceHistory(timeline.tradeId);
    });

    await steps.step('Attempt to edit the previous (expired) record - Edit is disabled or blocked', async () => {
      expect((await drawer.readCard(timeline.periods.expired)).status).toMatch(EXPIRED);
      expect(await drawer.getCardActionAvailability(timeline.periods.expired, 'editRecord')).not.toBe('available');
      expect(await drawer.getCardActionAvailability(timeline.periods.expired, 'removeRecord')).not.toBe('available');
    });

    await steps.step('Attempt to edit the current (active) record - Edit is disabled or blocked', async () => {
      expect((await drawer.readCard(timeline.periods.current)).status).toMatch(CURRENT);
      expect(await drawer.getCardActionAvailability(timeline.periods.current, 'editRecord')).not.toBe('available');
      expect(await drawer.getCardActionAvailability(timeline.periods.current, 'removeRecord')).not.toBe('available');
    });

    await steps.step('Edit the future record - Edit is available and the edit succeeds', async () => {
      expect(await drawer.getCardActionAvailability(timeline.periods.future, 'editRecord')).toBe('available');
      await drawer.openEditRecord(timeline.periods.future);
      await drawer.typeRecord('supplierPrice', CASES.onlyFutureEditable.newSupplierPrice);
      const answer = await drawer.attemptSave();
      expect(answer.status, answer.messages.join(' | ')).toBe(200);
      expect((await readPriceHistory(page, timeline.tradeId)).find((p) => p.id === timeline.periods.future)?.supplierPrice).toBe(CASES.onlyFutureEditable.newSupplierPrice);
    });
  });

  test(`TC-${CASES.netPriceFormula.azureId}: should calculate the net price by the agreed formula on the form`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }, testInfo) => {
    const data = CASES.netPriceFormula;
    const built = await provide(testInfo, 'a draft formulary priced for its first 30 days', () => shortPricedDraft(page, formularyIn));
    let drawer!: FormularyPriceHistoryDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(built.formulary.nameEn)).toBe(true);
    });

    await steps.step('Add a period with Supplier 100, Discount 10 and VAT 15 - the values are entered', async () => {
      await formularyManagementPage.openDetails(built.formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openPriceHistory(built.tradeId);
      await drawer.openAddRecord();
      await drawer.fillRecord({ supplierPrice: data.supplierPrice, discount: data.discount, vat: data.vat });
      expect(Number(await drawer.getRecordValue('vat'))).toBe(data.vat);
    });

    await steps.step('Review the Calculated Net Price - it shows 103.50 SAR by the formula', async () => {
      expect(netPrice(data.supplierPrice, data.discount, data.vat)).toBe(data.netPrice);
      // The line follows the last field a moment later (103.50 was shown, 90.00 read): poll it.
      await expect.poll(() => drawer.getNetPriceMessage(), { message: 'the calculated net price' })
        .toMatch(new RegExp(`${data.netPrice.toFixed(2).replace('.', '\\.')}\\s*$`));
    });
  });

  test(`TC-${CASES.endBeforeStart.azureId}: should refuse a price period whose end is before its start`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }, testInfo) => {
    const data = CASES.endBeforeStart;
    const built = await provide(testInfo, 'a draft formulary priced for its first 30 days', () => shortPricedDraft(page, formularyIn));
    let drawer!: FormularyPriceHistoryDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(built.formulary.nameEn)).toBe(true);
    });

    await steps.step('Add a period with Effective From after Effective To - the dates are entered in reverse order', async () => {
      await formularyManagementPage.openDetails(built.formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openPriceHistory(built.tradeId);
      await drawer.openAddRecord();
      await drawer.fillRecord(period(built.futureTo, built.futureFrom, { supplierPrice: data.supplierPrice, vat: data.vat }));
      expect(await drawer.getRecordValue('effectiveTo')).toBe(formularyDateText(built.futureFrom));
    });

    await steps.step('Attempt to save - the save is blocked with a clear validation message', async () => {
      const answer = await drawer.attemptSave();
      expect(answer.status, 'a period ending before it starts must be refused').not.toBe(200);
      expect((await drawer.getRecordError('effectiveTo')) || answer.messages.join(' | ')).toMatch(AFTER_FROM);
      expect(await readPriceHistory(page, built.tradeId)).toHaveLength(1);
    });
  });

  test(`TC-${CASES.rebateOnCurrent.azureId}: should not let the rebate of the current price record be edited`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Active');
    const trade = formulary.trades[0];
    const current = async () => (await readPriceHistory(page, trade.id)).find((p) => p.periodStatus === 'current');

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
      expect(await current(), 'the trade has a current price record').toBeDefined();
    });

    await steps.step('Open the trade\'s Price History and try Edit Rebate on the current record - it is disabled or blocked', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      const drawer = await formularyTradesTab.openPriceHistory(trade.id);
      const record = await current();
      expect(await drawer.getCardActionAvailability(record?.id ?? '', 'editRebate')).not.toBe('available');
      const direct = await upsertRebate(page, record?.id ?? '', 'flatValue', 1);
      expect(direct.status, `UpsertRebate on the current record answered ${direct.status} ${answerText(direct)}`).toBeGreaterThanOrEqual(400);
    });
  });

  test(`TC-${CASES.rebateTypes.azureId}: should save each of the four rebate types on a future price record`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }, testInfo) => {
    const data = CASES.rebateTypes;
    const built = await provide(testInfo, 'a draft formulary priced for its first 30 days', () => shortPricedDraft(page, formularyIn, { rebate: data.existing }));
    const periodId = (await readPriceHistory(page, built.tradeId))[0]?.id ?? '';
    let drawer!: FormularyPriceHistoryDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(built.formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the future record\'s Edit Rebate - the form shows Rebate Type and Rebate Value', async () => {
      await formularyManagementPage.openDetails(built.formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openPriceHistory(built.tradeId);
      await drawer.openEditRebate(periodId);
      expect(await drawer.isRebateValueShown()).toBe(true);
      expect((await drawer.getRebateTypeOptions()).length).toBe(4);
    });

    await steps.step('Select and save No Rebate, then Percent of Net Price, Flat value and Per dispense unit - each is accepted and saved', async () => {
      await drawer.chooseRebateType(data.none);
      expect(await drawer.isRebateValueShown(), 'No Rebate hides the value').toBe(false);
      const none = await drawer.attemptSave();
      expect(none.status, `No Rebate: ${none.messages.join(' | ')}`).toBe(200);
      expect((await readPriceHistory(page, built.tradeId)).find((p) => p.id === periodId)?.rebateTypeId ?? null).toBeNull();
      for (const type of data.types) {
        await drawer.openEditRebate(periodId);
        await drawer.chooseRebateType(type.label);
        await drawer.typeRebateValue(type.value);
        const saved = await drawer.attemptSave();
        expect(saved.status, `${type.label}: ${saved.messages.join(' | ')}`).toBe(200);
        const record = (await readPriceHistory(page, built.tradeId)).find((p) => p.id === periodId);
        expect({ type: record?.rebateTypeId, value: record?.rebateValue }, type.label).toEqual({ type: await rebateTypeId(page, type.code), value: type.value });
      }
    });
  });

  test(`TC-${CASES.negativeRebate.azureId}: should reject a negative rebate value`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }, testInfo) => {
    const data = CASES.negativeRebate;
    const built = await provide(testInfo, 'a draft formulary priced for its first 30 days', () => shortPricedDraft(page, formularyIn, { rebate: data.existing }));
    const periodId = (await readPriceHistory(page, built.tradeId))[0]?.id ?? '';
    let drawer!: FormularyPriceHistoryDrawer;
    let typed = '';

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(built.formulary.nameEn)).toBe(true);
    });

    await steps.step('Open the future record\'s Edit Rebate, choose Flat value and enter -5 - the value is entered', async () => {
      await formularyManagementPage.openDetails(built.formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openPriceHistory(built.tradeId);
      await drawer.openEditRebate(periodId);
      await drawer.chooseRebateType(data.type);
      await drawer.typeRebateValue(data.value);
      expect(await drawer.isRebateValueShown()).toBe(true);
      typed = await drawer.getRebateValue();
    });

    await steps.step('Attempt to save - the save is blocked with a clear validation message', async () => {
      if (typed.includes('-')) {
        const answer = await drawer.attemptSave();
        expect(answer.status, 'a negative rebate must not be saved').not.toBe(200);
        expect((await drawer.getRebateValueError()) || answer.messages.join(' | ')).toMatch(NEGATIVE);
      } else {
        expect(typed, 'the rebate value refused the minus sign').toMatch(NUMERIC_ONLY);
      }
      expect((await readPriceHistory(page, built.tradeId)).find((p) => p.id === periodId)?.rebateValue).toBe(data.existing.value);
    });
  });

  test(`TC-${CASES.permissions.azureId}: should let only a price administrator add, edit or delete price history`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    formularyRole,
    steps,
  }, testInfo) => {
    const built = await provide(testInfo, 'a draft formulary priced for its first 30 days', () => shortPricedDraft(page, formularyIn, { futurePeriod: true, payerName: SCOPED_PAYER }));
    const session = await signInWithFormularyRights(formularyRole, {
      held: ['viewFormulary', 'viewTrades', 'viewPriceHistory'],
      lacking: ['addPricingPeriod', 'updatePricingPeriod', 'deletePricingPeriod'],
    });

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(built.formulary.nameEn)).toBe(true);
    });

    await steps.step('As the user without price permissions, open the trade\'s Price History - it is viewable but Add / Edit / Delete are disabled or hidden', async () => {
      const detail = new FormularyDetailPage(session.page);
      const trades = new FormularyTradesTab(session.page);
      await detail.open(built.formulary.id);
      await trades.open();
      const drawer = await trades.openPriceHistory(built.tradeId);
      expect(await drawer.readPeriodIds()).toContain(built.futurePeriodId);
      expect(await drawer.isAddOffered()).not.toBe('available');
      expect(await drawer.getCardActionAvailability(built.futurePeriodId ?? '', 'editRecord')).not.toBe('available');
      expect(await drawer.getCardActionAvailability(built.futurePeriodId ?? '', 'removeRecord')).not.toBe('available');
    });

    await steps.step('As the Formulary Administrator, open the same Price History - Add / Edit / Delete are available and work', async () => {
      await formularyManagementPage.openDetails(built.formulary.nameEn);
      await formularyTradesTab.open();
      const drawer = await formularyTradesTab.openPriceHistory(built.tradeId);
      expect(await drawer.isAddOffered()).toBe('available');
      expect(await drawer.getCardActionAvailability(built.futurePeriodId ?? '', 'editRecord')).toBe('available');
      const removed = await drawer.deleteRecord(built.futurePeriodId ?? '');
      expect(removed.status, removed.text.slice(0, 300)).toBe(200);
    });
  });

  test(`TC-${CASES.sameDayBoundary.azureId}: should refuse a new period starting on the existing period's end date and accept one starting the day after`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }, testInfo) => {
    const data = CASES.sameDayBoundary;
    const built = await provide(testInfo, 'a draft formulary priced for its first 30 days', () => shortPricedDraft(page, formularyIn, { futurePeriod: true }));
    let drawer!: FormularyPriceHistoryDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(built.formulary.nameEn)).toBe(true);
    });

    await steps.step('Add a period starting on the existing period\'s end date - the boundary date is entered', async () => {
      await formularyManagementPage.openDetails(built.formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openPriceHistory(built.tradeId);
      await drawer.openAddRecord();
      await drawer.fillRecord(period(built.futureTo, isoDaysAfter(built.futureTo, 60), { supplierPrice: data.supplierPrice, vat: data.vat }));
      expect(await drawer.getRecordValue('effectiveFrom')).toBe(formularyDateText(built.futureTo));
    });

    await steps.step('Attempt to save - the same-day start is refused, and a start on the next day is accepted', async () => {
      const sameDay = await drawer.attemptSave();
      expect(sameDay.status, 'a period starting on the day the other ends double-covers that date').not.toBe(200);
      expect(`${sameDay.messages.join(' | ')} ${sameDay.text}`).toMatch(OVERLAP);
      await drawer.typeRecord('effectiveFrom', formularyDateText(isoDaysAfter(built.futureTo, 1)));
      const nextDay = await drawer.attemptSave();
      expect(nextDay.status, nextDay.messages.join(' | ')).toBe(200);
      expect(await readPriceHistory(page, built.tradeId)).toHaveLength(3);
    });
  });

  test(`TC-${CASES.deleteFuture.azureId}: should delete the future price record and leave the active and expired records untouched`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }, testInfo) => {
    const timeline = await provide(testInfo, 'a price period timeline', () => priceTimeline(page, formularyIn));
    let drawer!: FormularyPriceHistoryDrawer;
    const snapshot = async () => (await readPriceHistory(page, timeline.tradeId))
      .filter((p) => p.id === timeline.periods.current || p.id === timeline.periods.expired)
      .map((p) => ({ id: p.id, from: p.effectiveFrom, to: p.effectiveTo, net: p.netPrice }));
    let before: Awaited<ReturnType<typeof snapshot>> = [];

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await waitUntil(page, timeline.settledAt);
      before = await snapshot();
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(timeline.formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the trade\'s Price History and delete the future record - a confirmation prompt is shown', async () => {
      await formularyManagementPage.openDetails(timeline.formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openPriceHistory(timeline.tradeId);
      const dialog = await drawer.requestDelete(timeline.periods.future);
      expect(await dialog.getTitle()).toBe(DIALOG_TITLE.deletePrice);
      await dialog.cancel();
    });

    await steps.step('Confirm the deletion - the future record is removed from the list', async () => {
      const answer = await drawer.deleteRecord(timeline.periods.future);
      expect(answer.status, answer.text.slice(0, 300)).toBe(200);
      await expect.poll(async () => drawer.readPeriodIds()).not.toContain(timeline.periods.future);
    });

    await steps.step('Review the remaining records - the active and expired records are unchanged', async () => {
      expect(await snapshot()).toEqual(before);
      expect((await drawer.readCard(timeline.periods.current)).status).toMatch(CURRENT);
      expect((await drawer.readCard(timeline.periods.expired)).status).toMatch(EXPIRED);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
