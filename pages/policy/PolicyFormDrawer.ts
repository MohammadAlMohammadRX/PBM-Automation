import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { openSelect, readSelectOptions, requiredLabels } from '../components/PrimeControls';
import { Timeouts } from '../../constants/Timeouts';
import { POLICY_FORM, POLICY_FORM_ERROR, TOAST, buttonSelector, type PolicyFormField } from '../../constants/ElementIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';

/** Step 1; a key left out is not touched. Selects take the option's label. */
export interface PolicyInfo {
  nameEn?: string;
  nameAr?: string;
  /** "Individual" | "Group". */
  type?: string;
  /** The payer by name ("Al sharq") - the select filters. */
  payer?: string;
  /** The plan by (part of) its label - options read "<name> (PLN-nnnn) · <from> - <to>". */
  plan?: string;
  /** Group: the holder ("Acme Corporation", "Globex Corporation", "Neorx"). */
  holder?: string;
}

/** Step 2; numbers as text (typed), dates as `DD/MM/YYYY HH:mm` (policyDateText). '' clears a field. */
export interface PolicyCoverage {
  deductible?: string;
  coinsurance?: string;
  outOfPocket?: string;
  sublimit?: string;
  gracePeriod?: string;
  maxMembers?: string;
  effectiveDate?: string;
  expiryDate?: string;
}

/** What a Save answered: HTTP status (-1 = nothing sent), body and the messages shown. */
export interface PolicySaveAnswer {
  status: number;
  text: string;
  messages: string[];
  /** The request body the screen sent, when one was sent. */
  body: Record<string, unknown> | null;
}

type TextField = Exclude<PolicyFormField, 'type' | 'payer' | 'plan' | 'holder'>;

const TEXT_INPUT: Record<TextField, string> = {
  nameEn: POLICY_FORM.nameEn,
  nameAr: POLICY_FORM.nameAr,
  deductible: POLICY_FORM.deductible,
  coinsurance: POLICY_FORM.coinsurance,
  outOfPocket: POLICY_FORM.outOfPocket,
  sublimit: POLICY_FORM.sublimit,
  gracePeriod: POLICY_FORM.gracePeriod,
  maxMembers: POLICY_FORM.maxMembers,
  effectiveDate: POLICY_FORM.effectiveDate,
  expiryDate: POLICY_FORM.expiryDate,
};

const SELECT: Record<'type' | 'payer' | 'plan' | 'holder', string> = {
  type: POLICY_FORM.type,
  payer: POLICY_FORM.payer,
  plan: POLICY_FORM.plan,
  holder: POLICY_FORM.holder,
};

const DATE_FIELDS: readonly TextField[] = ['effectiveDate', 'expiryDate'];

/**
 * The Add / Edit Policy drawer (`policy-form-drawer`), verified live 2026-11-03,
 * and - under `policy-clone-drawer` - the Clone drawer (PolicyCloneDrawer).
 *
 * Step 1 "Policy Information": English / Arabic name, Policy Type (Individual |
 * Group), Payer (a filterable select of every payer, 246 for the admin), Plan
 * ("Select a payer first"; options "<name> (PLN-nnnn) · <period>"), and the
 * holder: a select for Group (GetPolicyHoldersDropdown) or the static "The
 * member themselves" for Individual. Next validates ("This field is required.",
 * "Select a policy holder.").
 * Step 2 "Coverage Period": Deductible, Coinsurance %, Out-of-Pocket Maximum,
 * Sublimit (placeholders "0 = none", "0 – 100"), Grace Period ("0 – 365
 * (optional)"), Member Limit ("Leave empty for unlimited"), Effective / Expiry
 * date-times (`DD/MM/YYYY HH:mm`, typed + Enter - the pickers ignore fill), the
 * benefit-year note and the "Important: This policy will be submitted for
 * approval ..." notice. Save sends CreatePolicy / UpdatePolicy.
 */
export class PolicyFormDrawer {
  constructor(protected readonly page: Page, protected readonly namespace: string = POLICY_FORM.add) {}

  protected id(suffix: string): string {
    return `${this.namespace}-${suffix}`;
  }

  protected byId(suffix: string): Locator {
    return this.page.locator(`#${this.id(suffix)}`);
  }

  protected btn(suffix: string): Locator {
    return this.page.locator(buttonSelector(this.id(suffix))).first();
  }

  async waitForOpen(): Promise<void> {
    await expect(this.byId(POLICY_FORM.title), 'the policy drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  /** Edit / clone: waits until the drawer shows the policy's values (the English name filled). */
  async waitForLoadedValues(): Promise<void> {
    await expect(this.byId(POLICY_FORM.nameEn), 'the drawer should load the policy').not.toHaveValue('', { timeout: Timeouts.default });
  }

  async isOpen(): Promise<boolean> {
    return this.byId(POLICY_FORM.title).isVisible();
  }

  async getTitle(): Promise<string> {
    return (await this.byId(POLICY_FORM.title).innerText()).trim();
  }

  /** The drawer's whole text (notices, labels, hints, errors). */
  async getText(): Promise<string> {
    return (await this.page.locator(`#${this.namespace}`).first().innerText()).replace(/\s+/g, ' ').trim();
  }

  /** The step showing now, read from which step's fields are rendered. */
  async currentStep(): Promise<1 | 2> {
    return (await this.byId(POLICY_FORM.effectiveDate).isVisible()) ? 2 : 1;
  }

  async getRequiredLabels(): Promise<string[]> {
    return requiredLabels(this.page.locator(`#${this.namespace}`).first());
  }

  /** Whether a field renders on the visible step (field-list cases). */
  async hasField(field: PolicyFormField): Promise<boolean> {
    const suffix = field in TEXT_INPUT ? TEXT_INPUT[field as TextField] : SELECT[field as keyof typeof SELECT];
    return this.byId(suffix).isVisible().catch(() => false);
  }

  // ---- step 1 -------------------------------------------------------------------------

  /** Types into a text field with real key presses; dates are committed with Enter. */
  async type(field: TextField, value: string): Promise<void> {
    const input = this.byId(TEXT_INPUT[field]);
    await input.click();
    await input.press('ControlOrMeta+a');
    if (value === '') {
      await input.press('Delete');
      if (DATE_FIELDS.includes(field)) await input.press('Enter');
      else await input.blur();
      return;
    }
    await input.pressSequentially(value);
    if (DATE_FIELDS.includes(field)) await input.press('Enter');
    else await input.blur();
  }

  async clear(field: TextField): Promise<void> {
    await this.type(field, '');
  }

  async getValue(field: TextField): Promise<string> {
    return this.byId(TEXT_INPUT[field]).inputValue();
  }

  async getMaxLength(field: TextField): Promise<number | null> {
    const raw = await this.byId(TEXT_INPUT[field]).getAttribute('maxlength');
    return raw === null ? null : Number(raw);
  }

  async getPlaceholder(field: TextField): Promise<string> {
    return (await this.byId(TEXT_INPUT[field]).getAttribute('placeholder')) ?? '';
  }

  /** Picks an option of a step-1 select by (part of) its label; the payer select is filtered first. */
  async choose(select: keyof typeof SELECT, label: string): Promise<void> {
    const combobox = this.byId(SELECT[select]);
    const exact = new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
    for (let attempt = 1; ; attempt += 1) {
      const options = await openSelect(this.page, combobox);
      // locator-exception: the select's portalled filter box carries no id; it is the overlay's only text input.
      const filter = this.page.locator('.p-select-overlay input[type="text"], .p-select-filter').filter({ visible: true }).first();
      if (await filter.isVisible().catch(() => false)) await filter.fill(label);
      const pick = (await options.filter({ hasText: exact }).count()) > 0 ? options.filter({ hasText: exact }) : options.filter({ hasText: label });
      try {
        await pick.first().click({ timeout: Timeouts.short });
        break;
      } catch (error) {
        // The overlay can be re-rendered under the click (the option "not stable", then detached) and
        // close: reopen it and pick again (19432, 2026-11-03 - the Type option after typing the names).
        if (attempt >= 3) throw error;
        Logger.step(`Policy drawer: the ${select} option "${label}" moved away under the click - reopening the select (attempt ${attempt + 1})`);
        if (await options.first().isVisible().catch(() => false)) await combobox.click().catch(() => undefined);
      }
    }
    await expect(combobox, `the ${select} select should show "${label}"`).toContainText(label.slice(0, 40), { timeout: Timeouts.default });
  }

  async getOptions(select: keyof typeof SELECT): Promise<string[]> {
    return readSelectOptions(this.page, this.byId(SELECT[select]));
  }

  /** What a select shows now ("Select", "Select a payer first", the chosen label). */
  async readSelect(select: keyof typeof SELECT): Promise<string> {
    return (await this.byId(SELECT[select]).innerText().catch(() => '')).trim();
  }

  /** Whether a select can be changed (rendered and not aria-disabled) - payer / type in edit and clone. */
  async isSelectEditable(select: keyof typeof SELECT): Promise<boolean> {
    const control = this.byId(SELECT[select]);
    if (!(await control.isVisible().catch(() => false))) return false;
    const disabled = await control.evaluate((el) => el.getAttribute('aria-disabled') === 'true' || !!el.closest('.p-disabled')).catch(() => false);
    return !disabled;
  }

  /** The payer as a read-only tag (clone / edit), '' when the select is shown instead. */
  async readPayerTag(): Promise<string> {
    return (await this.byId(POLICY_FORM.payerTag).innerText({ timeout: Timeouts.short }).catch(() => '')).trim();
  }

  /** The Individual holder text ("The member themselves"), '' for a Group policy. */
  async readHolderStatic(): Promise<string> {
    return (await this.byId(POLICY_FORM.holderStatic).innerText({ timeout: Timeouts.short }).catch(() => '')).trim();
  }

  async fillInfo(info: PolicyInfo): Promise<void> {
    Logger.step(`Policy drawer step 1: ${JSON.stringify(info)}`);
    if (info.nameEn !== undefined) await this.type('nameEn', info.nameEn);
    if (info.nameAr !== undefined) await this.type('nameAr', info.nameAr);
    if (info.type !== undefined) await this.choose('type', info.type);
    if (info.payer !== undefined) await this.choose('payer', info.payer);
    if (info.plan !== undefined) await this.choose('plan', info.plan);
    if (info.holder !== undefined) await this.choose('holder', info.holder);
  }

  // ---- step 2 -------------------------------------------------------------------------

  async fillCoverage(coverage: PolicyCoverage): Promise<void> {
    Logger.step(`Policy drawer step 2: ${JSON.stringify(coverage)}`);
    for (const [field, value] of Object.entries(coverage) as [TextField, string][]) {
      if (value !== undefined) await this.type(field, value);
    }
  }

  /** The step-2 benefit-year note ("Benefits are available for one year ..."). */
  async getBenefitYearNote(): Promise<string> {
    return (await this.byId(POLICY_FORM.benefitYearNote).innerText({ timeout: Timeouts.short }).catch(() => '')).trim();
  }

  // ---- validation ---------------------------------------------------------------------

  async getFieldError(field: PolicyFormField): Promise<string> {
    return (await this.byId(POLICY_FORM_ERROR[field]).innerText({ timeout: Timeouts.short }).catch(() => '')).trim();
  }

  async getFieldErrors(): Promise<Partial<Record<PolicyFormField, string>>> {
    const out: Partial<Record<PolicyFormField, string>> = {};
    for (const field of Object.keys(POLICY_FORM_ERROR) as PolicyFormField[]) {
      const error = this.byId(POLICY_FORM_ERROR[field]);
      if (await error.isVisible().catch(() => false)) out[field] = (await error.innerText()).trim();
    }
    return out;
  }

  /** Field errors and toasts, settled. */
  async getMessages(): Promise<string[]> {
    return WaitUtils.settleMessages(async () => {
      const own = await this.page.locator(`[id^="${this.namespace}-"][id$="-error"]`).filter({ visible: true }).allInnerTexts().catch(() => [] as string[]);
      const toast = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
      return [...own, ...toast].map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t !== '');
    });
  }

  // ---- buttons -------------------------------------------------------------------------

  /** Next: moves to step 2 when step 1 is valid. Returns whether it moved. */
  async next(): Promise<boolean> {
    await this.btn(POLICY_FORM.next).click();
    return this.byId(POLICY_FORM.effectiveDate).waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  async back(): Promise<void> {
    await this.btn(POLICY_FORM.back).click();
    await expect(this.byId(POLICY_FORM.nameEn)).toBeVisible({ timeout: Timeouts.default });
  }

  async goToStep(step: 1 | 2): Promise<void> {
    await this.page.locator(`#${this.id(POLICY_FORM.stepPrefix)}${step}-bullet`).click();
  }

  async isSaveEnabled(): Promise<boolean> {
    return this.btn(POLICY_FORM.save).isEnabled().catch(() => false);
  }

  /** The endpoints a save of this drawer answers on. */
  protected saveEndpoint(): RegExp {
    return /\/(CreatePolicy|UpdatePolicy)$/;
  }

  /**
   * Clicks Save and reports what the save answered, the body sent and the
   * messages. -1 = refused client-side. A "Return this policy to draft?" prompt
   * (pending policy) is confirmed.
   */
  async attemptSave(): Promise<PolicySaveAnswer> {
    Logger.step('Policy drawer: Save');
    const pattern = this.saveEndpoint();
    const answered = this.page.waitForResponse((r) => pattern.test(new URL(r.url()).pathname), { timeout: Timeouts.default }).catch(() => null);
    await this.btn(POLICY_FORM.save).click();
    const dialog = new ConfirmDialog(this.page);
    if (await dialog.isVisible()) await dialog.confirmWithFollowUps().catch(() => undefined);
    const response = await answered;
    let body: Record<string, unknown> | null = null;
    try { body = response ? (response.request().postDataJSON() as Record<string, unknown>) : null; } catch { body = null; }
    return { status: response?.status() ?? -1, text: response ? await response.text().catch(() => '') : '', messages: await this.getMessages(), body };
  }

  /** Saves and asserts success and that the drawer closed. */
  async save(): Promise<PolicySaveAnswer> {
    const answer = await this.attemptSave();
    expect(answer.status, `the policy save should succeed: ${answer.text.slice(0, 300)} ${answer.messages.join(' | ')}`).toBeGreaterThanOrEqual(200);
    expect(answer.status).toBeLessThan(300);
    await expect(this.byId(POLICY_FORM.title), 'the drawer should close after saving').toBeHidden({ timeout: Timeouts.default });
    return answer;
  }

  /** Step 1 + Next + step 2 + Save - the whole flow; returns the save answer. */
  async create(info: PolicyInfo, coverage: PolicyCoverage): Promise<PolicySaveAnswer> {
    await this.fillInfo(info);
    expect(await this.next(), `step 1 should accept ${JSON.stringify(info)}: ${(await this.getMessages()).join(' | ')}`).toBe(true);
    await this.fillCoverage(coverage);
    return this.attemptSave();
  }

  /** Runs `action` and returns the BODY of the save request it sent. */
  async captureSaveRequest(action: () => Promise<void>): Promise<Record<string, unknown> | null> {
    const body = await NetworkUtils.captureRequestBody(this.page, this.saveEndpoint(), action);
    return body ? (JSON.parse(body) as Record<string, unknown>) : null;
  }

  /** Closes with the header X; a dirty form raises the discard prompt, answered with `discard`. */
  async close(discard = true): Promise<void> {
    await this.byId(POLICY_FORM.close).click();
    const dialog = new ConfirmDialog(this.page);
    if (await dialog.isDiscardPromptVisible()) {
      if (discard) await dialog.discardChanges();
      else await dialog.keepEditing();
    }
    if (discard) await expect(this.byId(POLICY_FORM.title)).toBeHidden({ timeout: Timeouts.default });
  }

  /** Step 1's Cancel; a dirty form raises the discard prompt. */
  async cancel(discard = true): Promise<void> {
    await this.btn(POLICY_FORM.back).click();
    const dialog = new ConfirmDialog(this.page);
    if (await dialog.isDiscardPromptVisible()) {
      if (discard) await dialog.discardChanges();
      else await dialog.keepEditing();
    }
  }
}
