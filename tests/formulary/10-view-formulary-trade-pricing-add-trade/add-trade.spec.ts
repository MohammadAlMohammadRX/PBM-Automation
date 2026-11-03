import { expect } from '../../../fixtures';
import { SCOPED_PAYER } from '../../../data/formulary/formularyPermissions.data';
import { test } from '../../../utils/formulary/writerCHelpers';
import type { AddTradeValues, FormularyAddTradeDrawer } from '../../../pages/formulary/FormularyAddTradeDrawer';
import { FormularyDetailPage } from '../../../pages/formulary/FormularyDetailPage';
import { FormularyTradesTab } from '../../../pages/formulary/FormularyTradesTab';
import { MESSAGE, TRADES, formularyDateText, tradeOptionLabel } from '../../../data/formulary/formulary.data';
import {
  AFTER_FROM,
  CASES,
  DUPLICATE_TRADE,
  NUMERIC_ONLY,
  ONE_REBATE,
  PAST,
  RANGE,
  REQUIRED,
} from '../../../data/formulary/addTrade.data';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import {
  addTrade,
  answerText,
  deleteTrade,
  readPriceHistory,
  readTrades,
  rebateTypeId,
  type ProvisionedFormulary,
} from '../../../utils/FormularyProvisioning';
import { isoDaysAfter, isoIn, payloadArray, requestAddTrade, signInWithFormularyRights } from '../../../utils/formulary/writerBHelpers';

/** What every Add Trade in this story types unless the case changes it: its tier, a valid price and the formulary's own period. */
const baseValues = (formulary: ProvisionedFormulary, trade: string): AddTradeValues => ({
  trade,
  tier: formulary.tiers[0].tierNameEn,
  supplierPrice: 100,
  vat: 15,
  effectiveFrom: formularyDateText(formulary.effectiveDate),
  effectiveTo: formularyDateText(formulary.expiryDate),
});

/**
 * User story 15200: View Formulary - Trade & Pricing / Add trade.
 * Add Trade takes a catalogue trade, a tier of this formulary (pre-filling the
 * coverage), coverage 0-100, optional base cost / public price, a required
 * supplier price, discount 0-100, a required VAT 0-100, a live net price
 * ((S - S x D%) x (1 + V%)), a rebate type whose value appears only for a type
 * and is then required, and a period starting today or later and ending after
 * it. A trade is added once per formulary and a period holds one rebate.
 */
test.describe('US 15200 - View Formulary - Trade & Pricing / Add trade', () => {
  test(`TC-${CASES.coverageDefault.azureId}: should pre-fill the coverage with the chosen tier's coverage and keep it editable`, async ({
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.coverageDefault;
    const formulary = await formularyIn('Draft', { tiers: [{ nameEn: 'Automation Tier 1', nameAr: 'مستوى الأتمتة 1', order: 1, coverage: data.tierCoverage }], trades: 0 });
    let drawer!: FormularyAddTradeDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Add Trade form - it opens with the Coverage % field empty', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openAdd();
      expect(await drawer.getValue('coverage')).toBe('');
    });

    await steps.step('Select the tier with 80% coverage - Coverage % populates with 80', async () => {
      await drawer.chooseTier(formulary.tiers[0].tierNameEn);
      expect(Number((await drawer.getValue('coverage')).replace(/[^\d.]/g, ''))).toBe(data.tierCoverage);
    });

    await steps.step('Change the Coverage % by hand - the field accepts the new value within 0-100', async () => {
      await drawer.type('coverage', data.manual);
      expect(Number((await drawer.getValue('coverage')).replace(/[^\d.]/g, ''))).toBe(data.manual);
    });
  });

  test(`TC-${CASES.addWithPricing.azureId}: should add the trade with its calculated net price when pricing and the default rebate are entered`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.addWithPricing;
    const formulary = await formularyIn('Draft', { trades: 0 });
    let drawer!: FormularyAddTradeDrawer;

    await steps.critical('Navigate to the Formulary Management module - the list of formularies loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open an existing formulary and select the Trade & Pricing tab - the tab offers Add Trade', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      expect(await formularyTradesTab.isAddOffered()).toBe('available');
    });

    await steps.critical('Click Add Trade - the form shows Trade, Assign to Tier, Coverage %, pricing and rebate fields', async () => {
      drawer = await formularyTradesTab.openAdd();
      expect(await drawer.isOpen()).toBe(true);
      expect((await drawer.getRebateTypeOptions()).length).toBeGreaterThan(0);
    });

    await steps.step('Select a trade from the Trade dropdown - it populates the Trade field', async () => {
      await drawer.chooseTrade(data.trade);
      expect(await drawer.getFieldError('trade')).toBe('');
    });

    await steps.step('Select a tier from Assign to Tier - Coverage % auto-populates with the tier\'s coverage', async () => {
      await drawer.chooseTier(formulary.tiers[0].tierNameEn);
      expect(Number((await drawer.getValue('coverage')).replace(/[^\d.]/g, ''))).toBe(formulary.tiers[0].defaultCoveragePercentage);
    });

    await steps.step('Enter Supplier 100, Discount 10, VAT 15 and keep No Rebate - Net Price shows 103.50', async () => {
      await drawer.fill({ supplierPrice: data.supplierPrice, discount: data.discount, vat: data.vat });
      expect(await drawer.getNetPrice()).toBe(data.netPrice);
      expect(await drawer.isRebateValueShown()).toBe(false);
    });

    await steps.step('Set a future Effective From and a later Effective To and save - the trade is listed with the calculated Net Price', async () => {
      await drawer.fill({ effectiveFrom: formularyDateText(formulary.effectiveDate), effectiveTo: formularyDateText(formulary.expiryDate) });
      const answer = await drawer.attemptSave();
      expect(answer.status, answer.messages.join(' | ')).toBe(200);
      const trade = (await readTrades(page, formulary.id)).find((t) => t.tradeCode === data.trade);
      expect((await readPriceHistory(page, trade?.id ?? ''))[0]?.netPrice).toBe(data.netPrice);
      expect((await formularyTradesTab.readCard(trade?.id ?? '')).netPrice).toContain(data.netPrice.toFixed(2));
    });
  });

  test(`TC-${CASES.coverageBounds.azureId}: should accept a coverage of 0 and of 100`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { trades: 0 });
    const [low, high] = CASES.coverageBounds.values;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Add Trade form and complete the other mandatory fields - the form is ready', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      const drawer = await formularyTradesTab.openAdd();
      await drawer.fill(baseValues(formulary, TRADES[0].code));
      expect(await drawer.getFieldErrors()).toEqual({});
      await drawer.cancel();
    });

    for (const [index, coverage] of [low, high].entries()) {
      await steps.step(`Enter Coverage % = ${coverage} and save - the trade is saved with ${coverage}% coverage`, async () => {
        const drawer = await formularyTradesTab.openAdd();
        await drawer.fill({ ...baseValues(formulary, TRADES[index].code), coverage });
        const answer = await drawer.attemptSave();
        expect(answer.status, answer.messages.join(' | ')).toBe(200);
        expect((await readTrades(page, formulary.id)).find((t) => t.tradeCode === TRADES[index].code)?.coveragePercentage).toBe(coverage);
      });
    }
  });

  test(`TC-${CASES.coverageOutOfRange.azureId}: should reject a coverage below 0 or above 100 and save nothing`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { trades: 0 });
    let drawer!: FormularyAddTradeDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Add Trade form and complete the other mandatory fields - the form is ready', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openAdd();
      await drawer.fill(baseValues(formulary, TRADES[0].code));
      expect(await drawer.getFieldErrors()).toEqual({});
    });

    for (const coverage of CASES.coverageOutOfRange.values) {
      await steps.step(`Enter Coverage % = ${coverage} and save - a validation error is shown and the trade is not saved`, async () => {
        await drawer.type('coverage', coverage);
        const typed = await drawer.getValue('coverage');
        // The field itself refuses the value (drops the minus sign, caps at 100):
        // prevented at input, and saving the clamped value would close the drawer (2026-11-02).
        if (Number(typed) !== coverage) {
          expect(await readTrades(page, formulary.id)).toEqual([]);
          return;
        }
        const answer = await drawer.attemptSave();
        expect(answer.status, `coverage ${coverage} (typed "${typed}") must not be saved`).not.toBe(200);
        expect((await drawer.getFieldError('coverage')) || answer.messages.join(' | ')).toMatch(RANGE);
        expect(await readTrades(page, formulary.id)).toEqual([]);
      });
    }
  });

  test(`TC-${CASES.supplierRequired.azureId}: should block the save without a supplier price and accept it once one is entered`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { trades: 0 });
    let drawer!: FormularyAddTradeDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Add Trade form and fill every field except Supplier Price - the other fields are populated', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openAdd();
      const { supplierPrice: _omitted, ...rest } = baseValues(formulary, TRADES[0].code);
      await drawer.fill({ ...rest, baseCost: 90, publicPrice: 120, discount: 5 });
      expect(await drawer.getValue('supplierPrice')).toBe('');
    });

    await steps.step('Click Save - Supplier Price is flagged as required and the trade is not saved', async () => {
      const answer = await drawer.attemptSave();
      expect(answer.status, 'nothing may be saved without a supplier price').not.toBe(200);
      expect(await drawer.getFieldError('supplierPrice')).toMatch(REQUIRED);
      expect(await readTrades(page, formulary.id)).toEqual([]);
    });

    await steps.step('Enter Supplier Price = 100 and save - the trade saves', async () => {
      await drawer.type('supplierPrice', CASES.supplierRequired.supplierPrice);
      const answer = await drawer.attemptSave();
      expect(answer.status, answer.messages.join(' | ')).toBe(200);
      expect((await readTrades(page, formulary.id)).map((t) => t.tradeCode)).toEqual([TRADES[0].code]);
    });
  });

  test(`TC-${CASES.discountBounds.azureId}: should accept a discount of 0 and 100 and reject 101`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.discountBounds;
    const formulary = await formularyIn('Draft', { trades: 0 });

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Add Trade form and complete the other mandatory fields - the form is ready', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      const drawer = await formularyTradesTab.openAdd();
      await drawer.fill(baseValues(formulary, TRADES[0].code));
      expect(await drawer.getFieldErrors()).toEqual({});
      await drawer.cancel();
    });

    for (const [index, discount] of data.valid.entries()) {
      await steps.step(`Enter Discount % = ${discount} and save - the trade saves with ${discount}% discount`, async () => {
        const drawer = await formularyTradesTab.openAdd();
        await drawer.fill({ ...baseValues(formulary, TRADES[index].code), discount });
        const answer = await drawer.attemptSave();
        expect(answer.status, answer.messages.join(' | ')).toBe(200);
        const trade = (await readTrades(page, formulary.id)).find((t) => t.tradeCode === TRADES[index].code);
        expect((await readPriceHistory(page, trade?.id ?? ''))[0]?.discountPercentage).toBe(discount);
      });
    }

    await steps.step('Enter Discount % = 101 and save - a validation error is shown and the trade is not saved', async () => {
      const drawer = await formularyTradesTab.openAdd();
      await drawer.fill({ ...baseValues(formulary, TRADES[2].code), discount: data.invalid });
      const typed = await drawer.getValue('discount');
      // Capped at input (101 reads 100): prevented, and nothing is saved.
      if (Number(typed) !== data.invalid) {
        await drawer.cancel();
        expect((await readTrades(page, formulary.id)).map((t) => t.tradeCode)).not.toContain(TRADES[2].code);
        return;
      }
      const answer = await drawer.attemptSave();
      expect(answer.status, `discount 101 (typed "${typed}") must not be saved`).not.toBe(200);
      expect((await drawer.getFieldError('discount')) || answer.messages.join(' | ')).toMatch(RANGE);
      expect((await readTrades(page, formulary.id)).map((t) => t.tradeCode)).not.toContain(TRADES[2].code);
    });
  });

  test(`TC-${CASES.netPriceLive.azureId}: should recalculate the net price from supplier price, discount and VAT as they change`, async ({
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.netPriceLive;
    const formulary = await formularyIn('Draft', { trades: 0 });
    let drawer!: FormularyAddTradeDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Add Trade form - it displays the pricing fields', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openAdd();
      expect(await drawer.getValue('supplierPrice')).toBe('');
    });

    const [first, second, third] = data.steps;
    await steps.step('Enter Supplier 200, Discount 20, VAT 10 - Net Price calculates to 176.00', async () => {
      await drawer.fill({ supplierPrice: data.supplierPrice, discount: first.discount, vat: first.vat });
      await expect.poll(() => drawer.getNetPrice(), { message: 'the live net price' }).toBe(first.netPrice);
    });

    await steps.step('Change Discount % to 0 - Net Price recalculates to 220.00', async () => {
      await drawer.type('discount', second.discount);
      await expect.poll(() => drawer.getNetPrice(), { message: 'the live net price' }).toBe(second.netPrice);
    });

    await steps.step('Change VAT % to 0 - Net Price recalculates to 200.00', async () => {
      await drawer.type('vat', third.vat);
      await expect.poll(() => drawer.getNetPrice(), { message: 'the live net price' }).toBe(third.netPrice);
    });
  });

  test(`TC-${CASES.vatRequired.azureId}: should require VAT and accept only 0 to 100`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.vatRequired;
    const formulary = await formularyIn('Draft', { trades: 0 });
    let drawer!: FormularyAddTradeDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Open the Add Trade form, leave VAT blank, fill the rest and save - VAT is flagged as required and nothing is saved', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openAdd();
      const { vat: _omitted, ...rest } = baseValues(formulary, TRADES[0].code);
      await drawer.fill(rest);
      const answer = await drawer.attemptSave();
      expect(answer.status, 'nothing may be saved without VAT').not.toBe(200);
      expect(await drawer.getFieldError('vat')).toMatch(REQUIRED);
    });

    await steps.step('Enter VAT % = -1 and save - a validation error is shown and the trade is not saved', async () => {
      await drawer.type('vat', data.invalid);
      const typed = await drawer.getValue('vat');
      // The minus sign is dropped at input (-1 reads 1): prevented - saving 1 would close the drawer.
      if (Number(typed) !== data.invalid) {
        expect(await readTrades(page, formulary.id)).toEqual([]);
        return;
      }
      const answer = await drawer.attemptSave();
      expect(answer.status, `VAT -1 (typed "${typed}") must not be saved`).not.toBe(200);
      expect((await drawer.getFieldError('vat')) || answer.messages.join(' | ')).toMatch(/required|between|range|negative|minimum|0/i);
      expect(await readTrades(page, formulary.id)).toEqual([]);
    });

    for (const [index, vat] of data.valid.entries()) {
      await steps.step(`Enter VAT % = ${vat} and save - the trade saves`, async () => {
        if (index > 0) {
          drawer = await formularyTradesTab.openAdd();
          await drawer.fill(baseValues(formulary, TRADES[index].code));
        }
        await drawer.type('vat', vat);
        const answer = await drawer.attemptSave();
        expect(answer.status, answer.messages.join(' | ')).toBe(200);
        const trade = (await readTrades(page, formulary.id)).find((t) => t.tradeCode === TRADES[index].code);
        expect((await readPriceHistory(page, trade?.id ?? ''))[0]?.vatPercentage).toBe(vat);
      });
    }
  });

  test(`TC-${CASES.rebateHidden.azureId}: should show the rebate value only while a rebate type other than No Rebate is chosen`, async ({
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.rebateHidden;
    const formulary = await formularyIn('Draft', { trades: 0 });
    let drawer!: FormularyAddTradeDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Add Trade form - Rebate Type defaults to No Rebate and Rebate Value is hidden', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openAdd();
      expect(await drawer.getRebateType()).toMatch(new RegExp(data.none, 'i'));
      expect(await drawer.isRebateValueShown()).toBe(false);
    });

    await steps.step('Change Rebate Type to Percent of Net Price - Rebate Value appears and is editable', async () => {
      await drawer.chooseRebateType(data.type);
      expect(await drawer.isRebateValueShown()).toBe(true);
      await drawer.type('rebateValue', data.value);
      expect(Number(await drawer.getValue('rebateValue'))).toBe(data.value);
    });

    await steps.step('Change Rebate Type back to No Rebate - Rebate Value is hidden again and its value cleared', async () => {
      await drawer.chooseRebateType(data.none);
      expect(await drawer.isRebateValueShown()).toBe(false);
      await drawer.chooseRebateType(data.type);
      expect(await drawer.getValue('rebateValue'), 'the earlier value should not come back').toBe('');
    });
  });

  test(`TC-${CASES.rebateValueRequired.azureId}: should require a rebate value whenever a rebate type is chosen`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.rebateValueRequired;
    const formulary = await formularyIn('Draft', { trades: 0 });
    let drawer!: FormularyAddTradeDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Add Trade form and set Rebate Type = Flat value - Rebate Value appears empty', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openAdd();
      await drawer.fill({ ...baseValues(formulary, TRADES[0].code), rebateType: data.type });
      expect(await drawer.isRebateValueShown()).toBe(true);
      expect(await drawer.getValue('rebateValue')).toBe('');
    });

    await steps.step('Leave Rebate Value blank and save - Rebate Value is flagged as required and nothing is saved', async () => {
      const answer = await drawer.attemptSave();
      expect(answer.status, 'nothing may be saved without a rebate value').not.toBe(200);
      expect(await drawer.getFieldError('rebateValue')).toMatch(REQUIRED);
      expect(await readTrades(page, formulary.id)).toEqual([]);
    });

    await steps.step('Enter Rebate Value = 5 and save - the trade saves with the rebate', async () => {
      await drawer.type('rebateValue', data.value);
      const answer = await drawer.attemptSave();
      expect(answer.status, answer.messages.join(' | ')).toBe(200);
      // GetFormularyTrades carries only the price in force today (this period starts later): read the period.
      const saved = (await readTrades(page, formulary.id))[0];
      expect((await readPriceHistory(page, saved?.id ?? ''))[0]?.rebateValue).toBe(data.value);
    });
  });

  test(`TC-${CASES.duplicateTrade.azureId}: should refuse a trade that is already on the formulary`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft');
    const label = tradeOptionLabel(TRADES[0]);
    let drawer!: FormularyAddTradeDrawer;
    let offered = false;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Open the Add Trade form and select the trade already on the formulary - it is selected in the dropdown', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openAdd();
      offered = (await drawer.getTradeOptions()).some((o) => o.includes(TRADES[0].code));
      expect(offered, `the picker should offer "${label}" for the attempt`).toBe(true);
      await drawer.chooseTrade(CASES.duplicateTrade.trade);
    });

    await steps.step('Complete the other fields and save - "This trade is already added to the formulary." and nothing is added', async () => {
      if (offered) {
        await drawer.fill({ ...baseValues(formulary, TRADES[0].code), trade: undefined });
        const answer = await drawer.attemptSave();
        expect(answer.status, 'the duplicate must be refused').not.toBe(200);
        expect(answer.messages.join(' | ')).toContain(DUPLICATE_TRADE);
      }
      const direct = await addTrade(page, formulary.id, { tradeId: TRADES[0].id });
      expect(direct.status, 'AddFormularyTrade must refuse the duplicate').toBeGreaterThanOrEqual(400);
      expect(answerText(direct)).toContain(DUPLICATE_TRADE);
      expect((await readTrades(page, formulary.id)).filter((t) => t.tradeCode === TRADES[0].code)).toHaveLength(1);
    });
  });

  test(`TC-${CASES.oneRebatePerPeriod.azureId}: should refuse a second rebate for a pricing period that already has one`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyPriceHistoryDrawer,
    formularyIn,
    steps,
  }) => {
    const data = CASES.oneRebatePerPeriod;
    const formulary = await formularyIn('Draft', { rebate: data.existing });
    const trade = formulary.trades[0];
    let periodId = '';

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Open the trade and add a second rebate for the same pricing period - the rebate type and value accept input', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      await formularyTradesTab.openPriceHistory(trade.id);
      periodId = (await formularyPriceHistoryDrawer.readPeriodIds())[0];
      await formularyPriceHistoryDrawer.openEditRebate(periodId);
      await formularyPriceHistoryDrawer.chooseRebateType(data.second.type);
      await formularyPriceHistoryDrawer.typeRebateValue(data.second.value);
      expect(await formularyPriceHistoryDrawer.isRebateValueShown()).toBe(true);
    });

    await steps.step('Click Save - a rebate already exists for this period and the second one is not saved', async () => {
      const answer = await formularyPriceHistoryDrawer.attemptSave();
      expect(answer.status, 'a second rebate for the period must be refused').not.toBe(200);
      expect(answer.messages.join(' | ')).toMatch(ONE_REBATE);
      const period = (await readPriceHistory(page, trade.id)).find((p) => p.id === periodId);
      expect({ type: period?.rebateTypeId, value: period?.rebateValue }).toEqual({ type: await rebateTypeId(page, data.existing.type), value: data.existing.value });
    });
  });

  test(`TC-${CASES.pastEffectiveFrom.azureId}: should reject an Effective From in the past and accept today`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.pastEffectiveFrom;
    const formulary = await formularyIn('Draft', { trades: 0, effectiveInMinutes: data.formularyInMinutes });
    const yesterday = formularyDateText(isoIn(-24 * 60));
    let drawer!: FormularyAddTradeDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Open the Add Trade form, complete it and set Effective From to yesterday - the date is entered', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openAdd();
      await drawer.fill({ ...baseValues(formulary, TRADES[0].code), effectiveFrom: yesterday });
      expect([yesterday, ''], 'the picker shows the past date, or refuses it outright').toContain(await drawer.getValue('effectiveFrom'));
    });

    await steps.step('Click Save - Effective From is refused as in the past and the trade is not saved', async () => {
      const answer = await drawer.attemptSave();
      if (answer.status === 200) {
        // Saved (2026-11-02): WHICH date was stored tells a past date accepted
        // (the finding) from a picker that refused it and fell back to its own.
        // The trade is removed afterwards so step 4 starts from a fresh form.
        const saved = (await readTrades(page, formulary.id))[0];
        const from = (await readPriceHistory(page, saved?.id ?? ''))[0]?.effectiveFrom ?? '';
        if (saved) await deleteTrade(page, saved.id);
        expect(Date.parse(from), `a past Effective From must be refused - saved with Effective From ${from}`).toBeGreaterThanOrEqual(Date.now() - 5 * 60_000);
        return;
      }
      expect((await drawer.getFieldError('effectiveFrom')) || answer.messages.join(' | ')).toMatch(PAST);
      expect(await readTrades(page, formulary.id)).toEqual([]);
    });

    await steps.step('Change Effective From to today and save - the trade saves', async () => {
      if (!(await drawer.isOpen())) {
        drawer = await formularyTradesTab.openAdd();
        await drawer.fill(baseValues(formulary, TRADES[0].code));
      }
      await drawer.type('effectiveFrom', formularyDateText(isoIn(data.todayInMinutes)));
      const answer = await drawer.attemptSave();
      expect(answer.status, answer.messages.join(' | ')).toBe(200);
      expect((await readTrades(page, formulary.id)).map((t) => t.tradeCode)).toEqual([TRADES[0].code]);
    });
  });

  test(`TC-${CASES.effectiveToAfterFrom.azureId}: should refuse an Effective To before the Effective From and accept a later one`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.effectiveToAfterFrom;
    const formulary = await formularyIn('Draft', { trades: 0 });
    const from = isoDaysAfter(formulary.effectiveDate, data.fromAfterDays);
    let drawer!: FormularyAddTradeDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Open the Add Trade form and set Effective To a day before Effective From - both dates are entered', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openAdd();
      const to = formularyDateText(isoDaysAfter(from, -data.badToBeforeDays));
      await drawer.fill({ ...baseValues(formulary, TRADES[0].code), effectiveFrom: formularyDateText(from), effectiveTo: to });
      expect(await drawer.getValue('effectiveTo')).toBe(to);
    });

    await steps.step('Click Save - Effective To must be later than Effective From and the trade is not saved', async () => {
      const answer = await drawer.attemptSave();
      expect(answer.status, 'an Effective To before the Effective From must be refused').not.toBe(200);
      expect((await drawer.getFieldError('effectiveTo')) || answer.messages.join(' | ')).toMatch(AFTER_FROM);
      expect(await readTrades(page, formulary.id)).toEqual([]);
    });

    await steps.step('Change Effective To to a month after Effective From and save - the trade saves', async () => {
      await drawer.type('effectiveTo', formularyDateText(isoDaysAfter(from, data.goodToAfterDays)));
      const answer = await drawer.attemptSave();
      expect(answer.status, answer.messages.join(' | ')).toBe(200);
    });
  });

  test(`TC-${CASES.nonNegativePrices.azureId}: should save without base cost and public price and refuse negative values in them`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.nonNegativePrices;
    const formulary = await formularyIn('Draft', { trades: 0 });
    let drawer!: FormularyAddTradeDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Leave Base Cost and Public Price blank, complete the rest and save - the trade saves', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openAdd();
      await drawer.fill(baseValues(formulary, TRADES[0].code));
      const answer = await drawer.attemptSave();
      expect(answer.status, answer.messages.join(' | ')).toBe(200);
    });

    await steps.step('Open Add Trade again and enter Base Cost = -10 - the field takes only values of 0 or more', async () => {
      drawer = await formularyTradesTab.openAdd();
      await drawer.fill(baseValues(formulary, TRADES[1].code));
      await drawer.type('baseCost', data.negative.baseCost);
      expect(await drawer.getValue('baseCost')).toMatch(NUMERIC_ONLY);
    });

    await steps.step('Enter Public Price = -5 - the field takes only values of 0 or more', async () => {
      await drawer.type('publicPrice', data.negative.publicPrice);
      expect(await drawer.getValue('publicPrice')).toMatch(NUMERIC_ONLY);
    });

    await steps.step('Correct them to 50.00 and 60.00 and save - the trade saves with those values', async () => {
      await drawer.fill(data.corrected);
      const answer = await drawer.attemptSave();
      expect(answer.status, answer.messages.join(' | ')).toBe(200);
      const trade = (await readTrades(page, formulary.id)).find((t) => t.tradeCode === TRADES[1].code);
      const price = (await readPriceHistory(page, trade?.id ?? ''))[0];
      expect({ baseCost: price?.baseCost, publicPrice: price?.publicPrice }).toEqual(data.corrected);
    });
  });

  test(`TC-${CASES.rebateCycling.azureId}: should keep no stale rebate and save only the last type and value after switching types`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.rebateCycling;
    const formulary = await formularyIn('Draft', { trades: 0 });
    let drawer!: FormularyAddTradeDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Cycle the rebate type through every option and back to No Rebate - the value shows and hides and keeps no stale value', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openAdd();
      await drawer.fill(baseValues(formulary, TRADES[0].code));
      expect(await drawer.isRebateValueShown()).toBe(false);
      for (const step of data.cycle) {
        await drawer.chooseRebateType(step.type);
        expect(await drawer.isRebateValueShown(), `${step.type} shows the value`).toBe(true);
        expect(await drawer.getValue('rebateValue'), `${step.type} starts without the previous value`).toBe('');
        await drawer.type('rebateValue', step.value);
      }
      await drawer.chooseRebateType(data.none);
      expect(await drawer.isRebateValueShown()).toBe(false);
    });

    await steps.step('Set Per dispense unit with 2.50 and save - the trade saves with that type and value only', async () => {
      await drawer.chooseRebateType(data.final.type);
      await drawer.type('rebateValue', data.final.value);
      const answer = await drawer.attemptSave();
      expect(answer.status, answer.messages.join(' | ')).toBe(200);
      const saved = (await readTrades(page, formulary.id))[0];
      // The list carries only the price in force today (this period starts later): read the period.
      const trade = (await readPriceHistory(page, saved?.id ?? ''))[0];
      expect({ type: trade?.rebateTypeId, value: trade?.rebateValue }).toEqual({ type: await rebateTypeId(page, data.final.code), value: data.final.value });
    });
  });

  test(`TC-${CASES.noPermission.azureId}: should hide Add Trade and refuse a direct add from a user without the permission`, async ({
    page,
    formularyIn,
    formularyRole,
    steps,
  }, testInfo) => {
    const formulary = await formularyIn('Draft', { payerName: SCOPED_PAYER, trades: 0 });
    const session = await signInWithFormularyRights(formularyRole, { lacking: ['addTrade'] });
    const detail = new FormularyDetailPage(session.page);
    const trades = new FormularyTradesTab(session.page);

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await detail.openExpectingFailure(formulary.id);
      expect(session.page.url()).toContain(formulary.id);
    });

    await steps.step('Signed in without the Formulary Administrator role, open the Trade & Pricing tab - Add Trade is disabled or hidden', async () => {
      if (await detail.isLoaded()) await trades.open().catch(() => undefined);
      expect(await trades.isAddOffered()).not.toBe('available');
    });

    await steps.step('Attempt to reach Add Trade directly - the action is refused with an authorization answer', async () => {
      const direct = await requestAddTrade(session.page, formulary, formulary.tiers[0].id, 0);
      expect(direct.status, `a direct AddFormularyTrade answered ${direct.status}`).toBeGreaterThanOrEqual(400);
      expect(answerText(direct)).toMatch(MESSAGE.denied);
      expect(await readTrades(page, formulary.id)).toEqual([]);
    });
  });

  test(`TC-${CASES.dropdownSources.azureId}: should offer the catalogue's trades and only this formulary's tiers in the dropdowns`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { tiers: 2, trades: 0 });
    const foreign = await formularyIn('Draft', { tiers: [{ nameEn: CASES.dropdownSources.foreignTier, nameAr: 'مستوى آخر', order: 1, coverage: 50 }], trades: 0 });
    let drawer!: FormularyAddTradeDrawer;
    let catalogue: unknown[] = [];

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
      expect(foreign.tiers).toHaveLength(1);
    });

    await steps.step('Open the Add Trade form and the Trade dropdown - it lists exactly the trades defined in terminology', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      const body = await NetworkUtils.captureJsonResponseMatching(page, /\/GetTradesDropdown$/, async () => {
        drawer = await formularyTradesTab.openAdd();
      });
      catalogue = payloadArray(body);
      const options = await drawer.getTradeOptions();
      for (const trade of TRADES) expect(options.some((o) => o.includes(trade.code)), `${trade.code} offered`).toBe(true);
      expect(options.length).toBe(catalogue.length);
    });

    await steps.step('Open the Assign to Tier dropdown - it lists exactly the tiers of this formulary', async () => {
      const options = await drawer.getTierOptions();
      expect(options.length, `tiers offered: ${options.join(' | ')}`).toBe(formulary.tiers.length);
      for (const tier of formulary.tiers) expect(options.some((o) => o.includes(tier.tierNameEn)), `${tier.tierNameEn} offered`).toBe(true);
      expect(options.some((o) => o.includes(CASES.dropdownSources.foreignTier)), 'another formulary\'s tier must not be offered').toBe(false);
    });
  });

  test(`TC-${CASES.nonNumericPrice.azureId}: should keep non-numeric text out of the price fields`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { trades: 0 });
    let drawer!: FormularyAddTradeDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Open the Add Trade form and enter "abc" into Supplier Price - the field rejects the characters or flags them', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openAdd();
      const { supplierPrice: _omitted, ...rest } = baseValues(formulary, TRADES[0].code);
      await drawer.fill(rest);
      await drawer.type('supplierPrice', CASES.nonNumericPrice.text);
      expect(await drawer.getValue('supplierPrice')).toMatch(NUMERIC_ONLY);
    });

    await steps.step('Click Save - only valid decimal numbers are accepted and nothing is saved', async () => {
      const answer = await drawer.attemptSave();
      expect(answer.status, 'a non-numeric supplier price must not be saved').not.toBe(200);
      expect(await readTrades(page, formulary.id)).toEqual([]);
    });
  });
});
