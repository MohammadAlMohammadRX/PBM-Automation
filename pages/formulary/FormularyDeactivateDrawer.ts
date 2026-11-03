import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { openSelect, readSelectOptions } from '../components/PrimeControls';
import { Timeouts } from '../../constants/Timeouts';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { FORMULARY_DEACTIVATE, TOAST, buttonSelector } from '../../constants/ElementIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';

/**
 * The "Deactivate formulary?" drawer (verified live 2026-11-02): a "Needs
 * approval" notice, the warning "Deactivate <name>? Plans already assigned to
 * it keep their own status ...", a required reason (lookup
 * `formularyInactivationReason`), optional notes, Cancel / Deactivate.
 * Confirming STAGES the deactivation (SetFormularyActive isActive=false) as a
 * draft - toast "Saved as draft" - which goes live only after Send for
 * Approval and an approval. The detail and the list render it under their own
 * namespaces (FORMULARY_DEACTIVATE.detail / .list).
 */
export class FormularyDeactivateDrawer {
  constructor(private readonly page: Page, private readonly namespace: string = FORMULARY_DEACTIVATE.detail) {}

  private part(suffix: string): Locator {
    return this.page.locator(`#${this.namespace}-${suffix}`);
  }

  private button(suffix: string): Locator {
    return this.page.locator(buttonSelector(`${this.namespace}-${suffix}`)).first();
  }

  async waitForOpen(): Promise<void> {
    await expect(this.part(FORMULARY_DEACTIVATE.title), 'the Deactivate drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  async isOpen(): Promise<boolean> {
    return this.part(FORMULARY_DEACTIVATE.title).isVisible();
  }

  async getTitle(): Promise<string> {
    return (await this.part(FORMULARY_DEACTIVATE.title).innerText()).trim();
  }

  async getWarning(): Promise<string> {
    return (await this.part(FORMULARY_DEACTIVATE.warning).innerText()).replace(/\s+/g, ' ').trim();
  }

  async getApprovalNotice(): Promise<string> {
    return (await this.part(FORMULARY_DEACTIVATE.approvalNotice).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  async getReasonOptions(): Promise<string[]> {
    return readSelectOptions(this.page, this.part(FORMULARY_DEACTIVATE.reason));
  }

  async chooseFirstReason(): Promise<void> {
    const options = await openSelect(this.page, this.part(FORMULARY_DEACTIVATE.reason));
    await options.first().click();
  }

  async typeDetails(text: string): Promise<void> {
    await this.part(FORMULARY_DEACTIVATE.details).fill(text);
  }

  /** The reason's own error ("This field is required."), '' when none. */
  async getReasonError(): Promise<string> {
    return (await this.part(FORMULARY_DEACTIVATE.reasonError).innerText({ timeout: Timeouts.short }).catch(() => '')).trim();
  }

  async isConfirmEnabled(): Promise<boolean> {
    return this.button(FORMULARY_DEACTIVATE.confirm).isEnabled();
  }

  /**
   * Clicks Deactivate and reports SetFormularyActive's answer (-1 when nothing
   * was sent - a missing reason) and the messages shown. A "Return to draft?"
   * prompt (a request already pending) is confirmed.
   */
  async confirm(): Promise<{ status: number; text: string; closed: boolean; messages: string[] }> {
    Logger.step('Confirming the formulary deactivation');
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.formularySetActive, async () => {
      await this.button(FORMULARY_DEACTIVATE.confirm).click();
      const dialog = new ConfirmDialog(this.page);
      if (await dialog.isVisible()) await dialog.confirmWithFollowUps().catch(() => undefined);
    }, Timeouts.short);
    const closed = await this.part(FORMULARY_DEACTIVATE.title).waitFor({ state: 'hidden', timeout: Timeouts.short }).then(() => true).catch(() => false);
    const messages = await WaitUtils.settleMessages(async () => {
      const own = await this.part(FORMULARY_DEACTIVATE.reasonError).allInnerTexts().catch(() => [] as string[]);
      const toast = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
      return [...own, ...toast].map((t) => t.trim()).filter((t) => t !== '');
    });
    return { status: answer?.status ?? -1, text: answer?.text ?? '', closed, messages };
  }

  /** Chooses the first reason, adds notes and confirms - the whole deactivation. */
  async deactivate(details = 'Deactivated by the automation suite.'): Promise<{ status: number; text: string; closed: boolean; messages: string[] }> {
    await this.chooseFirstReason();
    await this.typeDetails(details);
    return this.confirm();
  }

  async cancel(): Promise<void> {
    await this.button(FORMULARY_DEACTIVATE.cancel).click();
    await expect(this.part(FORMULARY_DEACTIVATE.title)).toBeHidden({ timeout: Timeouts.default });
  }
}
