import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AppRoutes } from '../../constants/AppRoutes';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import { FORMULARY_DETAIL, FORMULARY_FORM, TOAST, buttonSelector } from '../../constants/ElementIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { Logger } from '../../utils/Logger';
import {
  deactivateFormulary,
  deleteFormulary,
  formularyStatusCode,
  publishFormularyChange,
  readFormulary,
  readFormularyOrNull,
  updateFormularyPayer,
  type FormularyOption,
  type FormularyRecord,
} from '../../utils/FormularyProvisioning';

export type FormularyDetailAction = keyof typeof FORMULARY_DETAIL.action;

/**
 * A formulary's detail screen (`/formulary-pricing/{id}`) - the minimal part the
 * plan stories need (plan folder 27, 2026-10-27): the header and Overview, the
 * Edit drawer's payer field, Delete, and the formulary API calls behind them.
 *
 * Ids read off the application's own bundle on 2026-10-27 (constants/ElementIds
 * FORMULARY_DETAIL / FORMULARY_FORM), not yet verified live. In edit mode the
 * drawer renders the payer as a read-only tag; Delete is disabled (with a
 * tooltip) while the formulary is assigned to a plan or a plan change that
 * assigns it awaits approval.
 */
export class FormularyDetailPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private action(key: FormularyDetailAction): Locator {
    return this.page.locator(buttonSelector(FORMULARY_DETAIL.action[key])).first();
  }

  async open(formularyId: string): Promise<void> {
    await this.goto(`${AppRoutes.formularyManagement}/${formularyId}`);
    await this.waitForLoaded();
  }

  async waitForLoaded(): Promise<void> {
    await expect(this.byId(FORMULARY_DETAIL.name), 'the formulary detail should load').toBeVisible({ timeout: Timeouts.default });
    await this.waitForPageReady();
  }

  async getName(): Promise<string> {
    return (await this.byId(FORMULARY_DETAIL.name).innerText()).trim();
  }

  /** The Overview's Payer value. */
  async readPayer(): Promise<string> {
    return this.byId(FORMULARY_DETAIL.overview.payer).last().innerText({ timeout: Timeouts.default }).then((t) => t.trim());
  }

  /** The screen's whole text (header, notices, Overview) - for "are the dependent plans listed". */
  async getPageText(): Promise<string> {
    return (await this.byId(FORMULARY_DETAIL.root).innerText({ timeout: Timeouts.default })).replace(/\s+/g, ' ').trim();
  }

  /** 'absent' | 'disabled' | 'available' for one header action. */
  async getActionAvailability(key: FormularyDetailAction): Promise<'absent' | 'disabled' | 'available'> {
    const button = this.action(key);
    if ((await button.count()) === 0 || !(await button.isVisible())) return 'absent';
    return (await button.isEnabled()) ? 'available' : 'disabled';
  }

  /** A header action's explanatory tooltip (`title`), '' when none. */
  async getActionMessage(key: FormularyDetailAction): Promise<string> {
    const button = this.action(key);
    if ((await button.count()) === 0) return '';
    return (await button.getAttribute('title')) ?? '';
  }

  /** Opens the Edit drawer from the header. */
  async openEdit(): Promise<void> {
    Logger.step('Opening the formulary\'s Edit drawer');
    await this.action('edit').click();
    await expect(this.byId(FORMULARY_FORM.root).first(), 'the Edit Formulary drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  /** Whether the open drawer lets the payer be chosen (a select) rather than showing it read-only. */
  async isPayerEditable(): Promise<boolean> {
    const select = this.byId(FORMULARY_FORM.payerSelect);
    if (!(await select.isVisible().catch(() => false))) return false;
    return (await select.getAttribute('aria-disabled').catch(() => null)) !== 'true';
  }

  /** The payer as the open drawer shows it (the read-only tag or the select's value). */
  async readPayerField(): Promise<string> {
    const tag = this.byId(FORMULARY_FORM.payerTag);
    if (await tag.isVisible().catch(() => false)) return (await tag.innerText()).trim();
    return (await this.byId(FORMULARY_FORM.payerSelect).innerText().catch(() => '')).trim();
  }

  /** The open drawer's whole text - for an inline warning next to the payer. */
  async getEditDrawerText(): Promise<string> {
    return (await this.byId(FORMULARY_FORM.root).first().innerText()).replace(/\s+/g, ' ').trim();
  }

  /** Closes the drawer without saving, discarding nothing (no field was changed). */
  async closeEdit(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await expect(this.byId(FORMULARY_FORM.root).first(), 'the Edit drawer should close').toBeHidden({ timeout: Timeouts.default });
  }

  /** Clicks Delete and confirms; returns what DeleteFormulary answered (null when nothing was sent) and the messages shown. */
  async deleteAndCapture(): Promise<{ status: number; text: string; messages: string[] }> {
    await this.action('delete').click();
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    const outcome = await NetworkUtils.captureResponse(this.page, ApiEndpoints.formularyDelete, () => dialog.confirm());
    return { status: outcome?.status ?? 0, text: outcome?.text ?? '', messages: await this.readMessages() };
  }

  async readMessages(): Promise<string[]> {
    const toasts = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
    const dialog = await this.page.locator('#pbm-dialog-message').allInnerTexts().catch(() => [] as string[]);
    return [...toasts, ...dialog].map((t) => t.trim()).filter((t) => t !== '');
  }

  // ---- API (the same calls the screen makes) -------------------------------

  /** The formulary as GetFormulary answers it, with its assigned / pending plan counts. */
  async readViaApi(formularyId: string): Promise<FormularyRecord> {
    return readFormulary(this.page, formularyId);
  }

  /** The formulary, or null when the server no longer returns it. */
  async readViaApiOrNull(formularyId: string): Promise<FormularyRecord | null> {
    return readFormularyOrNull(this.page, formularyId);
  }

  /** Saves the formulary with a different payer (UpdateFormulary) and returns the answer. */
  async changePayerViaApi(formularyId: string, payerId: string): Promise<{ status: number; text: string }> {
    Logger.step(`Changing formulary ${formularyId}'s payer to ${payerId}`);
    return updateFormularyPayer(this.page, formularyId, payerId);
  }

  /**
   * Deactivates the formulary end to end (SetFormularyActive isActive=false,
   * send for approval, approve) and reports its status code afterwards, or the
   * reason the server refused - never throws, so a refusal is the case's to judge.
   */
  async deactivateViaApi(formulary: FormularyOption): Promise<{ statusCode: string; error: string }> {
    Logger.step(`Deactivating formulary "${formulary.formularyNameEn}"`);
    const error = await deactivateFormulary(this.page, formulary).then(() => '', (e: unknown) => String(e instanceof Error ? e.message : e));
    return { statusCode: await formularyStatusCode(this.page, formulary.id), error };
  }

  /**
   * Sends the formulary's staged change for approval and approves it (a
   * published formulary's edit is a draft until then). Returns '' on success,
   * else the reason - never throws.
   */
  async publishChangeViaApi(formulary: FormularyOption): Promise<string> {
    return publishFormularyChange(this.page, formulary.id, formulary.formularyNameEn)
      .then(() => '', (e: unknown) => String(e instanceof Error ? e.message : e));
  }

  /** The formulary's status code ("active", "inactive", "pending", ...), '' when it is gone. */
  async readStatusCodeViaApi(formularyId: string): Promise<string> {
    return formularyStatusCode(this.page, formularyId);
  }

  /** Deletes (or stages the deletion of) the formulary (DeleteFormulary/{id}) and returns the answer. */
  async deleteViaApi(formularyId: string): Promise<{ status: number; text: string }> {
    Logger.step(`Deleting formulary ${formularyId}`);
    return deleteFormulary(this.page, formularyId);
  }
}
