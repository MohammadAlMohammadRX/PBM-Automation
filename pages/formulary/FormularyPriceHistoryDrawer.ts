import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { openSelect, readSelectOptions, requiredLabels } from '../components/PrimeControls';
import { Timeouts } from '../../constants/Timeouts';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import {
  FORMULARY_PRICE_HISTORY,
  FORMULARY_PRICE_RECORD,
  FORMULARY_REBATE_FORM,
  TOAST,
  buttonSelector,
} from '../../constants/ElementIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';

/** One price period card as it renders. */
export interface PriceCard {
  id: string;
  /** "04 Nov 2026, 18:00 — 07 Dec 2027, 18:00". */
  title: string;
  /** "Future", "Active"/"Current", "Expired". */
  status: string;
  baseCost: string;
  publicPrice: string;
  supplierPrice: string;
  discount: string;
  vat: string;
  netPrice: string;
  /** The rebate type label and value ("Flat Value", "SAR 1.00"), '' when none. */
  rebateType: string;
  rebate: string;
}

export type PriceRecordField = 'baseCost' | 'publicPrice' | 'supplierPrice' | 'discount' | 'vat' | 'effectiveFrom' | 'effectiveTo';

/** Price record form values; dates `DD/MM/YYYY HH:mm`. */
export type PriceRecordValues = Partial<Record<PriceRecordField, string | number>>;

const RECORD_INPUT: Record<PriceRecordField, string> = {
  baseCost: FORMULARY_PRICE_RECORD.baseCost,
  publicPrice: FORMULARY_PRICE_RECORD.publicPrice,
  supplierPrice: FORMULARY_PRICE_RECORD.supplierPrice,
  discount: FORMULARY_PRICE_RECORD.discount,
  vat: FORMULARY_PRICE_RECORD.vat,
  effectiveFrom: FORMULARY_PRICE_RECORD.effectiveFrom,
  effectiveTo: FORMULARY_PRICE_RECORD.effectiveTo,
};

const RECORD_ERROR: Record<PriceRecordField, string> = {
  baseCost: 'base-cost-error',
  publicPrice: 'public-price-error',
  supplierPrice: 'supplier-price-error',
  discount: 'discount-error',
  vat: 'vat-error',
  effectiveFrom: 'effective-from-error',
  effectiveTo: 'effective-to-error',
};

/**
 * The Price History drawer of one trade (`formulary-price-history-dialog`),
 * verified live 2026-11-02. List view: the NetPrice notice, Add Price Record,
 * one card per period (`-card-{periodId}`: the period as its title, a status
 * badge, Base Cost / Public Price / Supplier Price / Discount % / VAT % /
 * Calculated Net Price, the rebate line, Edit Price History / Edit Rebate /
 * Delete), Close. The record form and the rebate form open IN the drawer
 * (Back / Cancel / Save). Empty record Save: "This field is required." under
 * supplier price, VAT and effective from. Toasts: "Price record saved.",
 * "Rebate saved.", "Price record removed."; delete asks "Delete price record -
 * Do you want to delete <period>?" (No / Yes).
 *
 * The card's value spans and buttons repeat the same ids on every card, so
 * each is read / clicked INSIDE the card's own id.
 */
export class FormularyPriceHistoryDrawer {
  constructor(private readonly page: Page) {}

  private byId(id: string): Locator {
    return this.page.locator(`#${id}`);
  }

  private cards(): Locator {
    return this.page.locator(`article[id^="${FORMULARY_PRICE_HISTORY.cardPrefix}"]`);
  }

  private card(periodId: string): Locator {
    return this.byId(`${FORMULARY_PRICE_HISTORY.cardPrefix}${periodId}`);
  }

  async waitForOpen(): Promise<void> {
    await expect(this.page.locator(buttonSelector(FORMULARY_PRICE_HISTORY.addRecord)).first().or(this.byId(FORMULARY_PRICE_HISTORY.notice)).first(),
      'the Price History drawer should open').toBeVisible({ timeout: Timeouts.default });
    await this.cards().first().waitFor({ state: 'visible', timeout: Timeouts.short }).catch(() => undefined);
  }

  async isOpen(): Promise<boolean> {
    return this.byId(FORMULARY_PRICE_HISTORY.notice).isVisible();
  }

  /** The drawer's whole text (title "Price History — <trade>", notices). */
  async getText(): Promise<string> {
    return (await this.byId(FORMULARY_PRICE_HISTORY.root).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  async getNotice(): Promise<string> {
    return (await this.byId(FORMULARY_PRICE_HISTORY.notice).innerText()).replace(/\s+/g, ' ').trim();
  }

  /** The period ids of the cards, in the order shown (newest future first). */
  async readPeriodIds(): Promise<string[]> {
    return (await this.cards().evaluateAll((els) => els.map((e) => e.id))).map((id) => id.slice(FORMULARY_PRICE_HISTORY.cardPrefix.length));
  }

  async readCard(periodId: string): Promise<PriceCard> {
    const card = this.card(periodId);
    const own = (suffix: string) => this.byId(`${FORMULARY_PRICE_HISTORY.cardPrefix}${periodId}-${suffix}`).innerText({ timeout: Timeouts.short }).then((t) => t.trim()).catch(() => '');
    const inside = (id: string) => card.locator(`[id="${id}"]`).first().innerText({ timeout: Timeouts.short }).then((t) => t.trim()).catch(() => '');
    const v = FORMULARY_PRICE_HISTORY.value;
    return {
      id: periodId,
      title: await own('title'),
      status: await own('status-badge'),
      baseCost: await inside(v.baseCost),
      publicPrice: await inside(v.publicPrice),
      supplierPrice: await inside(v.supplierPrice),
      discount: await inside(v.discount),
      vat: await inside(v.vat),
      netPrice: await inside(v.netPrice),
      rebateType: await inside(v.rebateType),
      rebate: await inside(v.rebate),
    };
  }

  async readCards(): Promise<PriceCard[]> {
    const out: PriceCard[] = [];
    for (const id of await this.readPeriodIds()) out.push(await this.readCard(id));
    return out;
  }

  private cardButton(periodId: string, id: string): Locator {
    return this.card(periodId).locator(buttonSelector(id)).first();
  }

  /** How a card offers Edit Price History / Edit Rebate / Delete. */
  async getCardActionAvailability(periodId: string, action: 'editRecord' | 'editRebate' | 'removeRecord'): Promise<'absent' | 'disabled' | 'available'> {
    const button = this.cardButton(periodId, FORMULARY_PRICE_HISTORY[action]);
    if ((await button.count()) === 0 || !(await button.isVisible())) return 'absent';
    return (await button.isEnabled()) ? 'available' : 'disabled';
  }

  async isAddOffered(): Promise<'absent' | 'disabled' | 'available'> {
    const button = this.page.locator(buttonSelector(FORMULARY_PRICE_HISTORY.addRecord)).first();
    if ((await button.count()) === 0 || !(await button.isVisible())) return 'absent';
    return (await button.isEnabled()) ? 'available' : 'disabled';
  }

  // ---- price record form ------------------------------------------------------------------

  async openAddRecord(): Promise<void> {
    await this.page.locator(buttonSelector(FORMULARY_PRICE_HISTORY.addRecord)).first().click();
    await expect(this.byId(FORMULARY_PRICE_RECORD.supplierPrice), 'the price record form should open').toBeVisible({ timeout: Timeouts.default });
  }

  async openEditRecord(periodId: string): Promise<void> {
    await this.cardButton(periodId, FORMULARY_PRICE_HISTORY.editRecord).click();
    await expect(this.byId(FORMULARY_PRICE_RECORD.supplierPrice), 'the price record form should open').toBeVisible({ timeout: Timeouts.default });
  }

  async typeRecord(field: PriceRecordField, value: string | number): Promise<void> {
    const input = this.byId(RECORD_INPUT[field]);
    await input.click();
    await input.press('ControlOrMeta+a');
    await input.press('Delete');
    if (String(value) !== '') await input.pressSequentially(String(value));
    if (field === 'effectiveFrom' || field === 'effectiveTo') await input.press('Enter');
    else await input.blur();
  }

  async fillRecord(values: PriceRecordValues): Promise<void> {
    Logger.step(`Price record: ${JSON.stringify(values)}`);
    for (const [field, value] of Object.entries(values) as [PriceRecordField, string | number][]) await this.typeRecord(field, value);
  }

  async getRecordValue(field: PriceRecordField): Promise<string> {
    return this.byId(RECORD_INPUT[field]).inputValue();
  }

  /** The form's live "Net price = ... = SAR n" line. */
  async getNetPriceMessage(): Promise<string> {
    return (await this.byId(FORMULARY_PRICE_RECORD.netPriceMessage).innerText()).replace(/\s+/g, ' ').trim();
  }

  async getRecordNotice(): Promise<string> {
    return (await this.byId(FORMULARY_PRICE_RECORD.notice).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  async getRecordError(field: PriceRecordField): Promise<string> {
    return (await this.byId(`${FORMULARY_PRICE_RECORD.errorPrefix}${RECORD_ERROR[field]}`).innerText({ timeout: Timeouts.short }).catch(() => '')).trim();
  }

  /** Whether a record form field is rendered. */
  async isRecordFieldShown(field: PriceRecordField): Promise<boolean> {
    return this.byId(RECORD_INPUT[field]).isVisible();
  }

  /** The labels the open record form marks as required (Writer B, 2026-11-02). */
  async getRecordRequiredLabels(): Promise<string[]> {
    return requiredLabels(this.byId(FORMULARY_PRICE_HISTORY.root).first());
  }

  /** The vertical position of each record field, for the form's grouping and order (NaN when not rendered). */
  async getRecordFieldTops(): Promise<Record<PriceRecordField, number>> {
    const out = {} as Record<PriceRecordField, number>;
    for (const field of Object.keys(RECORD_INPUT) as PriceRecordField[]) {
      const box = await this.byId(RECORD_INPUT[field]).boundingBox().catch(() => null);
      out[field] = box ? box.y : NaN;
    }
    return out;
  }

  // ---- rebate form ----------------------------------------------------------------------------

  async openEditRebate(periodId: string): Promise<void> {
    await this.cardButton(periodId, FORMULARY_PRICE_HISTORY.editRebate).click();
    await expect(this.byId(FORMULARY_REBATE_FORM.type), 'the rebate form should open').toBeVisible({ timeout: Timeouts.default });
  }

  async getRebateTypeOptions(): Promise<string[]> {
    return readSelectOptions(this.page, this.byId(FORMULARY_REBATE_FORM.type));
  }

  async chooseRebateType(label: string): Promise<void> {
    const options = await openSelect(this.page, this.byId(FORMULARY_REBATE_FORM.type));
    await options.filter({ hasText: label }).first().click();
    await expect(this.byId(FORMULARY_REBATE_FORM.type)).toContainText(label, { timeout: Timeouts.default });
  }

  async isRebateValueShown(): Promise<boolean> {
    return this.byId(FORMULARY_REBATE_FORM.value).isVisible();
  }

  async typeRebateValue(value: string | number): Promise<void> {
    const input = this.byId(FORMULARY_REBATE_FORM.value);
    await input.click();
    await input.press('ControlOrMeta+a');
    await input.press('Delete');
    if (String(value) !== '') await input.pressSequentially(String(value));
    await input.blur();
  }

  /** The rebate value as the open rebate form holds it ('' when hidden or empty). */
  async getRebateValue(): Promise<string> {
    const input = this.byId(FORMULARY_REBATE_FORM.value);
    return (await input.isVisible()) ? input.inputValue() : '';
  }

  async getRebateValueError(): Promise<string> {
    return (await this.byId(FORMULARY_REBATE_FORM.valueError).innerText({ timeout: Timeouts.short }).catch(() => '')).trim();
  }

  // ---- save / delete / navigation ---------------------------------------------------------------

  async getMessages(): Promise<string[]> {
    return WaitUtils.settleMessages(async () => {
      const own = await this.page.locator('[id^="formulary-price-record-form-"][id$="-error"], [id^="formulary-rebate-form-"][id$="-error"]').filter({ visible: true }).allInnerTexts().catch(() => [] as string[]);
      const toast = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
      return [...own, ...toast].map((t) => t.trim()).filter((t) => t !== '');
    });
  }

  /**
   * Clicks Save in the open form and reports the request's answer
   * (AddPricingPeriod / UpdatePricingPeriod / UpsertRebate / DeleteRebate; -1
   * when refused client-side), whether the drawer went back to its list, and the messages.
   */
  async attemptSave(): Promise<{ status: number; text: string; endpoint: string; backToList: boolean; messages: string[] }> {
    Logger.step('Price History: Save');
    const answered = this.page
      .waitForResponse((r) => /\/(AddPricingPeriod|UpdatePricingPeriod|UpsertRebate|DeleteRebate)$/.test(new URL(r.url()).pathname), { timeout: Timeouts.short })
      .catch(() => null);
    await this.page.locator(buttonSelector(FORMULARY_PRICE_HISTORY.submit)).first().click();
    const response = await answered;
    const backToList = await this.page.locator(buttonSelector(FORMULARY_PRICE_HISTORY.addRecord)).first()
      .waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
    return {
      status: response?.status() ?? -1,
      text: response ? await response.text().catch(() => '') : '',
      endpoint: response ? new URL(response.url()).pathname : '',
      backToList,
      messages: await this.getMessages(),
    };
  }

  /** Clicks a card's Delete and returns the prompt, still open. */
  async requestDelete(periodId: string): Promise<ConfirmDialog> {
    await this.cardButton(periodId, FORMULARY_PRICE_HISTORY.removeRecord).click();
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    return dialog;
  }

  async deleteRecord(periodId: string): Promise<{ status: number; text: string; messages: string[] }> {
    const dialog = await this.requestDelete(periodId);
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.formularyDeletePricingPeriod, () => dialog.confirm().catch(() => undefined));
    return { status: answer?.status ?? -1, text: answer?.text ?? '', messages: await this.getMessages() };
  }

  /** Cancel in a form view (back to the list; a dirty form's prompt is answered with `discard`). */
  async cancelForm(discard = true): Promise<void> {
    await this.page.locator(buttonSelector(FORMULARY_PRICE_HISTORY.cancel)).first().click();
    const dialog = new ConfirmDialog(this.page);
    if (await dialog.isDiscardPromptVisible()) {
      if (discard) await dialog.discardChanges();
      else await dialog.keepEditing();
    }
  }

  async close(): Promise<void> {
    const closeButton = this.page.locator(buttonSelector(FORMULARY_PRICE_HISTORY.closeButton)).first();
    if (await closeButton.isVisible().catch(() => false)) await closeButton.click();
    else await this.byId(FORMULARY_PRICE_HISTORY.close).click();
    const dialog = new ConfirmDialog(this.page);
    if (await dialog.isDiscardPromptVisible()) await dialog.discardChanges();
    await expect(this.byId(FORMULARY_PRICE_HISTORY.notice)).toBeHidden({ timeout: Timeouts.default });
  }
}
