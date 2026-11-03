import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { chooseSelectOption, readSelectOptions, requiredLabels } from '../components/PrimeControls';
import { Timeouts } from '../../constants/Timeouts';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import {
  BENEFIT_CONFIGS,
  BENEFIT_CONFIG_FORM,
  TOAST,
  buttonSelector,
  type BenefitConfigField,
} from '../../constants/ElementIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';
import { readBenefitConfigs, type BenefitConfig } from '../../utils/FormularyProvisioning';

/** Form values; dates `DD/MM/YYYY HH:mm`; a key left out is not touched. */
export type BenefitConfigValues = Partial<Record<BenefitConfigField, string | number>>;

/** One configuration card as it renders. */
export interface BenefitConfigCard {
  id: string;
  title: string;
  /** "04 Nov 2026, 18:10 - Open-ended". */
  period: string;
  /** "Future", "Active", "Expired", or "Draft · New" for an unapproved one. */
  status: string;
  copaymentAmount: string;
  coinsurancePercentage: string;
  deductible: string;
  outOfPocketMaximum: string;
  maximumCopayAmount: string;
  minimumMemberContribution: string;
}

/** Kebab-case suffix of each form field (`benefit-config-form-{suffix}-input` / `-error`). */
const SUFFIX: Record<BenefitConfigField, string> = {
  nameEn: 'name-en',
  nameAr: 'name-ar',
  copaymentAmount: 'copayment-amount',
  coinsurancePercentage: 'coinsurance-percentage',
  deductible: 'deductible',
  outOfPocketMaximum: 'out-of-pocket-maximum',
  maximumCopayAmount: 'maximum-copay-amount',
  minimumMemberContribution: 'minimum-member-contribution',
  sublimitAmount: 'sublimit-amount',
  benefitEffectiveDate: 'benefit-effective-date',
  benefitEndDate: 'benefit-end-date',
};

const DATE_FIELDS: readonly BenefitConfigField[] = ['benefitEffectiveDate', 'benefitEndDate'];

/**
 * The Benefit Configuration drawer of one trade (`benefit-configs-dialog`),
 * verified live 2026-11-02. List view: "Benefit Configurations — <trade>", an
 * "Important: Define per-trade cost-sharing rules ..." notice, Add Benefit
 * Configuration, a status filter (All Statuses ...), one card per configuration
 * (`-card-{id}`: name, period "04 Nov 2026, 18:10 - Open-ended", status, the
 * amounts; an approved Future card offers "Edit Benefit" / "Delete", a new
 * draft card none), Close. The form opens in the drawer
 * (`benefit-config-form-*`): name EN / AR, copayment, coinsurance %,
 * deductible, OOP maximum, maximum copay, minimum member contribution,
 * sublimit amount, benefit effective / end date; Back / Cancel / Save.
 *
 * Empty Save: "This field is required." (names, effective date) and "Provide
 * at least a copayment amount or a coinsurance percentage." under BOTH
 * copayment and coinsurance. Created: toast "Benefit configuration created /
 * The benefit configuration has been created." - the server says "Saved to the
 * formulary's draft. Send the formulary for approval ..." (a draft change of the
 * formulary; AddBenefitConfig answers an empty guid).
 */
export class BenefitConfigDrawer {
  constructor(private readonly page: Page) {}

  private byId(id: string): Locator {
    return this.page.locator(`#${id}`);
  }

  private cards(): Locator {
    return this.page.locator(`article[id^="${BENEFIT_CONFIGS.cardPrefix}"]`);
  }

  private input(field: BenefitConfigField): Locator {
    return this.byId(`${BENEFIT_CONFIG_FORM.errorPrefix}${SUFFIX[field]}-input`);
  }

  async waitForOpen(): Promise<void> {
    await expect(this.byId(BENEFIT_CONFIGS.notice), 'the Benefit Configuration drawer should open').toBeVisible({ timeout: Timeouts.default });
    await this.cards().first().waitFor({ state: 'visible', timeout: Timeouts.short }).catch(() => undefined);
  }

  async isOpen(): Promise<boolean> {
    return this.byId(BENEFIT_CONFIGS.notice).isVisible();
  }

  async getText(): Promise<string> {
    return (await this.byId(BENEFIT_CONFIGS.root).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  // ---- list ---------------------------------------------------------------------------------

  async readConfigIds(): Promise<string[]> {
    return (await this.cards().evaluateAll((els) => els.map((e) => e.id))).map((id) => id.slice(BENEFIT_CONFIGS.cardPrefix.length));
  }

  /** The id of the card titled `name`. */
  async configIdByName(name: string): Promise<string> {
    const card = this.cards().filter({ has: this.page.locator(`[id$="-${BENEFIT_CONFIGS.card.title}"]`, { hasText: name }) }).first();
    await expect(card, `a benefit configuration card titled "${name}"`).toBeVisible({ timeout: Timeouts.default });
    return ((await card.getAttribute('id')) ?? '').slice(BENEFIT_CONFIGS.cardPrefix.length);
  }

  async readCard(configId: string): Promise<BenefitConfigCard> {
    const card = this.byId(`${BENEFIT_CONFIGS.cardPrefix}${configId}`);
    const own = (suffix: string) => this.byId(`${BENEFIT_CONFIGS.cardPrefix}${configId}-${suffix}`).innerText({ timeout: Timeouts.short }).then((t) => t.trim()).catch(() => '');
    const value = (suffix: string) => card.locator(`[id="${BENEFIT_CONFIGS.valuePrefix}${suffix}"]`).first().innerText({ timeout: Timeouts.short }).then((t) => t.trim()).catch(() => '');
    return {
      id: configId,
      title: await own(BENEFIT_CONFIGS.card.title),
      period: await own(BENEFIT_CONFIGS.card.subtitle),
      status: await own(BENEFIT_CONFIGS.card.status),
      copaymentAmount: await value('copayment-amount'),
      coinsurancePercentage: await value('coinsurance-percentage'),
      deductible: await value('deductible'),
      outOfPocketMaximum: await value('out-of-pocket-maximum'),
      maximumCopayAmount: await value('maximum-copay-amount'),
      minimumMemberContribution: await value('minimum-member-contribution'),
    };
  }

  async readCards(): Promise<BenefitConfigCard[]> {
    const out: BenefitConfigCard[] = [];
    for (const id of await this.readConfigIds()) out.push(await this.readCard(id));
    return out;
  }

  /** How a card offers Edit Benefit / Delete (the shared ids, inside the card). */
  async getCardActionAvailability(configId: string, action: 'edit' | 'delete'): Promise<'absent' | 'disabled' | 'available'> {
    const id = action === 'edit' ? BENEFIT_CONFIGS.editButton : BENEFIT_CONFIGS.deleteButton;
    const button = this.byId(`${BENEFIT_CONFIGS.cardPrefix}${configId}`).locator(buttonSelector(id)).first();
    if ((await button.count()) === 0 || !(await button.isVisible())) return 'absent';
    return (await button.isEnabled()) ? 'available' : 'disabled';
  }

  async isAddOffered(): Promise<'absent' | 'disabled' | 'available'> {
    const button = this.page.locator(buttonSelector(BENEFIT_CONFIGS.addButton)).first();
    if ((await button.count()) === 0 || !(await button.isVisible())) return 'absent';
    return (await button.isEnabled()) ? 'available' : 'disabled';
  }

  async getStatusFilterOptions(): Promise<string[]> {
    return readSelectOptions(this.page, this.byId(BENEFIT_CONFIGS.statusFilter));
  }

  /** Filters the cards by status (client-side or GetBenefitConfigs - waits for the cards to settle). */
  async filterByStatus(label: string): Promise<void> {
    await chooseSelectOption(this.page, this.byId(BENEFIT_CONFIGS.statusFilter), label);
    await this.page.waitForLoadState('networkidle', { timeout: Timeouts.short }).catch(() => undefined);
  }

  // ---- form ------------------------------------------------------------------------------

  /** Whether the Add / Edit form is showing (a successful save closes it). */
  async isFormOpen(): Promise<boolean> {
    return this.input('nameEn').isVisible();
  }

  async openAdd(): Promise<void> {
    await this.page.locator(buttonSelector(BENEFIT_CONFIGS.addButton)).first().click();
    await expect(this.input('nameEn'), 'the benefit configuration form should open').toBeVisible({ timeout: Timeouts.default });
  }

  async openEdit(configId: string): Promise<void> {
    await this.byId(`${BENEFIT_CONFIGS.cardPrefix}${configId}`).locator(buttonSelector(BENEFIT_CONFIGS.editButton)).first().click();
    await expect(this.input('nameEn'), 'the benefit configuration form should open').toBeVisible({ timeout: Timeouts.default });
    await expect(this.input('nameEn'), 'the form should load the configuration').not.toHaveValue('', { timeout: Timeouts.default });
  }

  async getRequiredLabels(): Promise<string[]> {
    return requiredLabels(this.byId(BENEFIT_CONFIG_FORM.root).first());
  }

  async getFormNotice(): Promise<string> {
    return (await this.byId(BENEFIT_CONFIG_FORM.notice).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  async type(field: BenefitConfigField, value: string | number): Promise<void> {
    const input = this.input(field);
    await input.click();
    await input.press('ControlOrMeta+a');
    await input.press('Delete');
    if (String(value) !== '') await input.pressSequentially(String(value));
    if (DATE_FIELDS.includes(field)) await input.press('Enter');
    else await input.blur();
  }

  async fill(values: BenefitConfigValues): Promise<void> {
    Logger.step(`Benefit configuration: ${JSON.stringify(values)}`);
    for (const [field, value] of Object.entries(values) as [BenefitConfigField, string | number][]) await this.type(field, value);
  }

  async getValue(field: BenefitConfigField): Promise<string> {
    return this.input(field).inputValue();
  }

  async isFieldEditable(field: BenefitConfigField): Promise<boolean> {
    const input = this.input(field);
    return (await input.isEditable().catch(() => false)) && (await input.getAttribute('aria-disabled')) !== 'true';
  }

  async getFieldError(field: BenefitConfigField): Promise<string> {
    return (await this.byId(`${BENEFIT_CONFIG_FORM.errorPrefix}${SUFFIX[field]}-error`).innerText({ timeout: Timeouts.short }).catch(() => '')).trim();
  }

  async getFieldErrors(): Promise<Partial<Record<BenefitConfigField, string>>> {
    const out: Partial<Record<BenefitConfigField, string>> = {};
    for (const field of Object.keys(SUFFIX) as BenefitConfigField[]) {
      const el = this.byId(`${BENEFIT_CONFIG_FORM.errorPrefix}${SUFFIX[field]}-error`);
      if (await el.isVisible().catch(() => false)) out[field] = (await el.innerText()).trim();
    }
    return out;
  }

  async getMessages(): Promise<string[]> {
    return WaitUtils.settleMessages(async () => {
      const own = await this.page.locator(`[id^="${BENEFIT_CONFIG_FORM.errorPrefix}"][id$="-error"]`).filter({ visible: true }).allInnerTexts().catch(() => [] as string[]);
      const toast = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
      return [...own, ...toast].map((t) => t.trim()).filter((t) => t !== '');
    });
  }

  /** Clicks Save and reports AddBenefitConfig / UpdateBenefitConfig's answer (-1 when refused client-side) and the messages. */
  async attemptSave(): Promise<{ status: number; text: string; backToList: boolean; messages: string[] }> {
    Logger.step('Benefit configuration: Save');
    const answered = this.page
      .waitForResponse((r) => /\/(AddBenefitConfig|UpdateBenefitConfig)$/.test(new URL(r.url()).pathname), { timeout: Timeouts.short })
      .catch(() => null);
    await this.page.locator(buttonSelector(BENEFIT_CONFIGS.submit)).first().click();
    const response = await answered;
    const backToList = await this.page.locator(buttonSelector(BENEFIT_CONFIGS.addButton)).first()
      .waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
    return { status: response?.status() ?? -1, text: response ? await response.text().catch(() => '') : '', backToList, messages: await this.getMessages() };
  }

  /** Cancel in the form (back to the list; a dirty form's prompt answered with `discard`). */
  async cancelForm(discard = true): Promise<void> {
    await this.page.locator(buttonSelector(BENEFIT_CONFIGS.cancel)).first().click();
    const dialog = new ConfirmDialog(this.page);
    if (await dialog.isDiscardPromptVisible()) {
      if (discard) await dialog.discardChanges();
      else await dialog.keepEditing();
    }
  }

  // ---- delete / close ------------------------------------------------------------------------

  async requestDelete(configId: string): Promise<ConfirmDialog> {
    await this.byId(`${BENEFIT_CONFIGS.cardPrefix}${configId}`).locator(buttonSelector(BENEFIT_CONFIGS.deleteButton)).first().click();
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    return dialog;
  }

  /** Deletes through the prompt; returns DeleteBenefitConfig's answer and the messages (a refusal is an answer). */
  async deleteConfig(configId: string): Promise<{ status: number; text: string; messages: string[] }> {
    const dialog = await this.requestDelete(configId);
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.benefitConfigDelete, () => dialog.confirm().catch(() => undefined));
    return { status: answer?.status ?? -1, text: answer?.text ?? '', messages: await this.getMessages() };
  }

  async close(): Promise<void> {
    const closeButton = this.page.locator(buttonSelector(BENEFIT_CONFIGS.closeButton)).first();
    if (await closeButton.isVisible().catch(() => false)) await closeButton.click();
    else await this.byId(BENEFIT_CONFIGS.close).click();
    const dialog = new ConfirmDialog(this.page);
    if (await dialog.isDiscardPromptVisible()) await dialog.discardChanges();
    await expect(this.byId(BENEFIT_CONFIGS.notice)).toBeHidden({ timeout: Timeouts.default });
  }

  // ---- API -----------------------------------------------------------------------------------

  async fetchConfigs(formularyTradeId: string): Promise<BenefitConfig[]> {
    return readBenefitConfigs(this.page, formularyTradeId);
  }
}
