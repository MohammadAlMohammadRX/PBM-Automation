import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { openSelect, readSelectOptions, requiredLabels } from '../components/PrimeControls';
import { Timeouts } from '../../constants/Timeouts';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import {
  FORMULARY_ADD_TRADE,
  FORMULARY_TRADE_ERROR,
  TOAST,
  buttonSelector,
  type FormularyTradeField,
} from '../../constants/ElementIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';

/** The Add Trade drawer's typed fields. */
export type AddTradeInput = 'coverage' | 'baseCost' | 'publicPrice' | 'supplierPrice' | 'discount' | 'vat' | 'rebateValue' | 'effectiveFrom' | 'effectiveTo';

/** Values for the drawer; a key left out is not touched. Dates `DD/MM/YYYY HH:mm`. */
export interface AddTradeValues {
  /** Text typed into the trade picker's filter and the option containing it chosen ("MED-001"). */
  trade?: string;
  /** The tier, by its label. */
  tier?: string;
  coverage?: string | number;
  baseCost?: string | number;
  publicPrice?: string | number;
  supplierPrice?: string | number;
  discount?: string | number;
  vat?: string | number;
  /** "No rebate", "Percent of Net Price", "Flat Value", "Per Dispense Unit". */
  rebateType?: string;
  rebateValue?: string | number;
  effectiveFrom?: string;
  effectiveTo?: string;
}

const INPUT: Record<AddTradeInput, string> = {
  coverage: FORMULARY_ADD_TRADE.coverage,
  baseCost: FORMULARY_ADD_TRADE.baseCost,
  publicPrice: FORMULARY_ADD_TRADE.publicPrice,
  supplierPrice: FORMULARY_ADD_TRADE.supplierPrice,
  discount: FORMULARY_ADD_TRADE.discount,
  vat: FORMULARY_ADD_TRADE.vat,
  rebateValue: FORMULARY_ADD_TRADE.rebateValue,
  effectiveFrom: FORMULARY_ADD_TRADE.effectiveFrom,
  effectiveTo: FORMULARY_ADD_TRADE.effectiveTo,
};

/**
 * The "Add Trade to Formulary" drawer (`formulary-add-trade-dialog`), verified
 * live 2026-11-02. Trade (catalogue, "Paracetamol 500mg — MED-001"), Tier
 * (choosing one pre-fills Coverage % with the tier's default), Coverage %, Base
 * Cost, Public Price, Supplier Price, Discount %, VAT %, the live "Net price =
 * (S − S × D%) × (1 + V%) = SAR n" line, Rebate type (No rebate / Percent of Net
 * Price / Flat Value / Per Dispense Unit - the value field appears only for a
 * type), Effective From / To. Empty Save: "This field is required." under
 * trade, tier, coverage, supplier price, VAT and effective from
 * (`formulary-add-trade-dialog-{field}-error`). Toast "Trade added to the formulary.".
 */
export class FormularyAddTradeDrawer {
  constructor(private readonly page: Page) {}

  private byId(id: string): Locator {
    return this.page.locator(`#${id}`);
  }

  async waitForOpen(): Promise<void> {
    await expect(this.byId(FORMULARY_ADD_TRADE.title), 'the Add Trade drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  async isOpen(): Promise<boolean> {
    return this.byId(FORMULARY_ADD_TRADE.title).isVisible();
  }

  async getTitle(): Promise<string> {
    return (await this.byId(FORMULARY_ADD_TRADE.title).innerText()).trim();
  }

  async getRequiredLabels(): Promise<string[]> {
    return requiredLabels(this.byId(FORMULARY_ADD_TRADE.root).first());
  }

  /** The trades the picker offers ("Paracetamol 500mg — MED-001", ...). */
  async getTradeOptions(): Promise<string[]> {
    return readSelectOptions(this.page, this.byId(FORMULARY_ADD_TRADE.trade));
  }

  async getTierOptions(): Promise<string[]> {
    return readSelectOptions(this.page, this.byId(FORMULARY_ADD_TRADE.tier));
  }

  async getRebateTypeOptions(): Promise<string[]> {
    return readSelectOptions(this.page, this.byId(FORMULARY_ADD_TRADE.rebateType));
  }

  /** Chooses the first option of a select whose label contains `text`. */
  private async chooseContaining(selectId: string, text: string): Promise<void> {
    const options = await openSelect(this.page, this.byId(selectId));
    await options.filter({ hasText: text }).first().click();
    await expect(this.byId(selectId), `the select should show "${text}"`).toContainText(text, { timeout: Timeouts.default });
  }

  async chooseTrade(text: string): Promise<void> {
    await this.chooseContaining(FORMULARY_ADD_TRADE.trade, text);
  }

  async chooseTier(label: string): Promise<void> {
    await this.chooseContaining(FORMULARY_ADD_TRADE.tier, label);
  }

  async chooseRebateType(label: string): Promise<void> {
    await this.chooseContaining(FORMULARY_ADD_TRADE.rebateType, label);
  }

  /** Types a value with real key presses (dates committed with Enter). */
  async type(field: AddTradeInput, value: string | number): Promise<void> {
    const input = this.byId(INPUT[field]);
    await input.click();
    await input.press('ControlOrMeta+a');
    await input.press('Delete');
    if (String(value) !== '') await input.pressSequentially(String(value));
    if (field === 'effectiveFrom' || field === 'effectiveTo') await input.press('Enter');
    else await input.blur();
  }

  async getValue(field: AddTradeInput): Promise<string> {
    return this.byId(INPUT[field]).inputValue();
  }

  /** The rebate type the select shows now ("No rebate" by default) - Writer B, 2026-11-02. */
  async getRebateType(): Promise<string> {
    return (await this.byId(FORMULARY_ADD_TRADE.rebateType).innerText()).replace(/\s+/g, ' ').trim();
  }

  /** The tier the select shows now ('' when none is chosen). */
  async getChosenTier(): Promise<string> {
    return (await this.byId(FORMULARY_ADD_TRADE.tier).innerText()).replace(/\s+/g, ' ').trim();
  }

  /** Whether the rebate value field is rendered (only with a rebate type chosen). */
  async isRebateValueShown(): Promise<boolean> {
    return this.byId(FORMULARY_ADD_TRADE.rebateValue).isVisible();
  }

  /** The live net-price line ("Net price = (9 − 9 × 10%) × (1 + 15%) = SAR 9.32"). */
  async getNetPriceMessage(): Promise<string> {
    return (await this.byId(FORMULARY_ADD_TRADE.netPriceMessage).innerText()).replace(/\s+/g, ' ').trim();
  }

  /** The SAR amount the net-price line ends with, NaN when none. */
  async getNetPrice(): Promise<number> {
    const match = (await this.getNetPriceMessage()).match(/SAR\s*([\d.,]+)\s*$/);
    return match ? Number(match[1].replace(/,/g, '')) : NaN;
  }

  /** Fills the drawer in the screen's order (trade, tier, prices, rebate, dates). */
  async fill(values: AddTradeValues): Promise<void> {
    Logger.step(`Add Trade: ${JSON.stringify(values)}`);
    if (values.trade !== undefined) await this.chooseTrade(values.trade);
    if (values.tier !== undefined) await this.chooseTier(values.tier);
    for (const field of ['coverage', 'baseCost', 'publicPrice', 'supplierPrice', 'discount', 'vat'] as const) {
      if (values[field] !== undefined) await this.type(field, values[field] as string | number);
    }
    if (values.rebateType !== undefined) await this.chooseRebateType(values.rebateType);
    if (values.rebateValue !== undefined) await this.type('rebateValue', values.rebateValue);
    if (values.effectiveFrom !== undefined) await this.type('effectiveFrom', values.effectiveFrom);
    if (values.effectiveTo !== undefined) await this.type('effectiveTo', values.effectiveTo);
  }

  async getFieldError(field: FormularyTradeField): Promise<string> {
    return (await this.byId(`${FORMULARY_ADD_TRADE.errorPrefix}${FORMULARY_TRADE_ERROR[field]}`).innerText({ timeout: Timeouts.short }).catch(() => '')).trim();
  }

  async getFieldErrors(): Promise<Partial<Record<FormularyTradeField, string>>> {
    const out: Partial<Record<FormularyTradeField, string>> = {};
    for (const field of Object.keys(FORMULARY_TRADE_ERROR) as FormularyTradeField[]) {
      const el = this.byId(`${FORMULARY_ADD_TRADE.errorPrefix}${FORMULARY_TRADE_ERROR[field]}`);
      if (await el.isVisible().catch(() => false)) out[field] = (await el.innerText()).trim();
    }
    return out;
  }

  async getMessages(): Promise<string[]> {
    return WaitUtils.settleMessages(async () => {
      const own = await this.page.locator(`[id^="${FORMULARY_ADD_TRADE.errorPrefix}"][id$="-error"]`).filter({ visible: true }).allInnerTexts().catch(() => [] as string[]);
      const toast = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
      return [...own, ...toast].map((t) => t.trim()).filter((t) => t !== '');
    });
  }

  /** Clicks Add Trade and reports AddFormularyTrade's answer (-1 when refused client-side), whether the drawer closed, and the messages. */
  async attemptSave(): Promise<{ status: number; text: string; closed: boolean; messages: string[] }> {
    Logger.step('Add Trade: save');
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.formularyAddTrade,
      () => this.page.locator(buttonSelector(FORMULARY_ADD_TRADE.save)).first().click(), Timeouts.short);
    const closed = await this.byId(FORMULARY_ADD_TRADE.title).waitFor({ state: 'hidden', timeout: Timeouts.short }).then(() => true).catch(() => false);
    return { status: answer?.status ?? -1, text: answer?.text ?? '', closed, messages: await this.getMessages() };
  }

  async save(): Promise<void> {
    const answer = await this.attemptSave();
    expect(answer.status, `the trade should be added: ${answer.text.slice(0, 300)} ${answer.messages.join(' | ')}`).toBe(200);
    expect(answer.closed, 'the Add Trade drawer should close').toBe(true);
  }

  async cancel(discard = true): Promise<void> {
    await this.page.locator(buttonSelector(FORMULARY_ADD_TRADE.cancel)).first().click();
    const dialog = new ConfirmDialog(this.page);
    if (await dialog.isDiscardPromptVisible()) {
      if (discard) await dialog.discardChanges();
      else await dialog.keepEditing();
    }
  }
}
