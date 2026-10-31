import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';
import { TERMINOLOGY_DEACTIVATE, buttonSelector } from '../../constants/ElementIds';
import { Logger } from '../../utils/Logger';
import { openSelect, readSelectOptions } from '../components/PrimeControls';

/**
 * The "Deactivate terminology" drawer - a warning, a required reason and
 * optional notes. The list and the detail screen render the same component
 * under two namespaces (`terminology-deactivate-drawer`,
 * `terminology-detail-deactivate-drawer`). Activation needs no drawer: it is a
 * plain confirmation (ConfirmDialog).
 */
export class TerminologyDeactivateDrawer {
  constructor(private readonly page: Page, private readonly namespace: string) {}

  private part(suffix: string): Locator {
    return this.page.locator(`#${this.namespace}-${suffix}`);
  }

  async waitForOpen(): Promise<void> {
    await expect(this.part(TERMINOLOGY_DEACTIVATE.title), 'the Deactivate drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  async getTitle(): Promise<string> {
    return (await this.part(TERMINOLOGY_DEACTIVATE.title).innerText()).trim();
  }

  async getWarning(): Promise<string> {
    return (await this.part(TERMINOLOGY_DEACTIVATE.warning).innerText()).replace(/\s+/g, ' ').trim();
  }

  async getReasonOptions(): Promise<string[]> {
    return readSelectOptions(this.page, this.part(TERMINOLOGY_DEACTIVATE.reason));
  }

  async chooseFirstReason(): Promise<void> {
    const options = await openSelect(this.page, this.part(TERMINOLOGY_DEACTIVATE.reason));
    await options.first().click();
  }

  async isConfirmEnabled(): Promise<boolean> {
    return this.page.locator(buttonSelector(`${this.namespace}-${TERMINOLOGY_DEACTIVATE.confirm}`)).first().isEnabled();
  }

  /** The confirm and cancel labels. */
  async getButtonLabels(): Promise<string[]> {
    const confirm = await this.page.locator(buttonSelector(`${this.namespace}-${TERMINOLOGY_DEACTIVATE.confirm}`)).first().innerText();
    const cancel = await this.page.locator(buttonSelector(`${this.namespace}-${TERMINOLOGY_DEACTIVATE.cancel}`)).first().innerText();
    return [confirm.trim(), cancel.trim()];
  }

  async confirm(): Promise<void> {
    Logger.step('Confirming the deactivation');
    await this.page.locator(buttonSelector(`${this.namespace}-${TERMINOLOGY_DEACTIVATE.confirm}`)).first().click();
    await expect(this.part(TERMINOLOGY_DEACTIVATE.title)).toBeHidden({ timeout: Timeouts.default });
  }

  /** Confirms without expecting the drawer to close - for the refused cases. */
  async confirmExpectingRefusal(): Promise<boolean> {
    await this.page.locator(buttonSelector(`${this.namespace}-${TERMINOLOGY_DEACTIVATE.confirm}`)).first().click();
    return this.part(TERMINOLOGY_DEACTIVATE.title).waitFor({ state: 'hidden', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  async cancel(): Promise<void> {
    await this.page.locator(buttonSelector(`${this.namespace}-${TERMINOLOGY_DEACTIVATE.cancel}`)).first().click();
    await expect(this.part(TERMINOLOGY_DEACTIVATE.title)).toBeHidden({ timeout: Timeouts.default });
  }
}
