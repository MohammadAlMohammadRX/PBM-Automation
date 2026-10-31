import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { TERMINOLOGY_RECORD_DIALOG, TOAST, buttonSelector } from '../../constants/ElementIds';
import { parseJson } from '../../utils/TerminologyProvisioning';
import { chooseSelectOption, closeSelect, openSelect, readSelectOptions, requiredLabels, setCheckbox } from '../components/PrimeControls';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';

/** What Save answered. */
export interface RecordSaveAnswer {
  /** HTTP status of UpsertTerminologyRow, -1 when the drawer sent nothing. */
  status: number;
  validationErrors: string[];
  messages: string[];
  closed: boolean;
}

/**
 * The Add / Edit Record drawer (`terminology-row-dialog`), also opened by an
 * Upload Errors row's "Fix & save this row". One input per field, by FIELD ID:
 * `terminology-row-dialog-{fieldId}-input` for text / number / date and
 * `-select` for list / mapping fields; the automatic Is Active is a checkbox.
 */
export class TerminologyRecordDialog {
  constructor(private readonly page: Page) {}

  private byId(id: string): Locator {
    return this.page.locator(`#${id}`);
  }

  private input(fieldId: string): Locator {
    return this.byId(`${TERMINOLOGY_RECORD_DIALOG.fieldPrefix}${fieldId}-input`);
  }

  private select(fieldId: string): Locator {
    return this.byId(`${TERMINOLOGY_RECORD_DIALOG.fieldPrefix}${fieldId}-select`);
  }

  async waitForOpen(): Promise<void> {
    await expect(this.byId(TERMINOLOGY_RECORD_DIALOG.title), 'the record drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  async getTitle(): Promise<string> {
    return (await this.byId(TERMINOLOGY_RECORD_DIALOG.title).innerText()).trim();
  }

  /** The labels of the drawer's fields, in order - the required marker included. */
  async getText(): Promise<string> {
    return (await this.byId(TERMINOLOGY_RECORD_DIALOG.root).innerText()).replace(/\s+/g, ' ').trim();
  }

  async fill(fieldId: string, value: string): Promise<void> {
    Logger.step(`Record field ${fieldId} = "${value.slice(0, 40)}"`);
    await this.input(fieldId).fill(value);
  }

  /** Types key by key - for the maximum-length cases, where `fill` bypasses maxlength. */
  async type(fieldId: string, value: string): Promise<void> {
    const input = this.input(fieldId);
    await input.scrollIntoViewIfNeeded();
    await input.fill('');
    await input.pressSequentially(value, { delay: 0 });
  }

  async getValue(fieldId: string): Promise<string> {
    return this.input(fieldId).inputValue();
  }

  /** The options a list / mapping field offers - read from that select's own overlay. */
  async getOptions(fieldId: string): Promise<string[]> {
    return readSelectOptions(this.page, this.select(fieldId));
  }

  /** What a list / mapping field shows when opened - its options, or the message it gives instead. */
  async getSelectPanelText(fieldId: string): Promise<string> {
    await openSelect(this.page, this.select(fieldId));
    const panel = this.page.locator('.p-select-overlay, .p-select-list-container, [role="listbox"]').filter({ visible: true }).first();
    const text = await panel.innerText({ timeout: Timeouts.short }).then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
    await closeSelect(this.page, this.select(fieldId));
    return text;
  }

  /** The labels the drawer marks as required (the asterisk is drawn by CSS). */
  async getRequiredLabels(): Promise<string[]> {
    return requiredLabels(this.byId(TERMINOLOGY_RECORD_DIALOG.root));
  }

  async choose(fieldId: string, option: string): Promise<void> {
    await chooseSelectOption(this.page, this.select(fieldId), option);
  }

  async getSelected(fieldId: string): Promise<string> {
    return (await this.select(fieldId).innerText()).trim();
  }

  /**
   * Sets the automatic Is Active checkbox. Fails plainly when the drawer has
   * none: the predefined Country, Street, District, Policy Holder and Trades
   * carry no Is Active field at all (only City does - verified 2026-10-30).
   */
  async setActive(value: boolean): Promise<void> {
    await expect(this.byId(TERMINOLOGY_RECORD_DIALOG.isActive), 'the record drawer should offer the automatic Is Active field').toBeVisible({ timeout: Timeouts.short });
    await setCheckbox(this.byId(TERMINOLOGY_RECORD_DIALOG.isActive), value);
  }

  /** Whether the drawer offers the automatic Is Active field (the predefined lists mostly do not). */
  async hasActiveField(): Promise<boolean> {
    return (await this.byId(TERMINOLOGY_RECORD_DIALOG.isActive).count()) > 0;
  }

  async isActiveChecked(): Promise<boolean> {
    return this.byId(TERMINOLOGY_RECORD_DIALOG.isActive).isChecked();
  }

  async isActiveEditable(): Promise<boolean> {
    return this.byId(TERMINOLOGY_RECORD_DIALOG.isActive).isEnabled();
  }

  async getMessages(timeout: number = Timeouts.short): Promise<string[]> {
    return WaitUtils.settleMessages(async () => {
      const inDrawer = await this.byId(TERMINOLOGY_RECORD_DIALOG.root).locator('small, [role="alert"], .p-error, [id$="-error"]').filter({ visible: true }).allInnerTexts().catch(() => [] as string[]);
      const toast = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
      return [...inDrawer, ...toast].map((text) => text.trim()).filter((text) => text !== '');
    }, timeout);
  }

  /** Clicks Save and reports what the server and the screen answered. */
  async save(): Promise<RecordSaveAnswer> {
    Logger.step('Record drawer: Save');
    const waiting = this.page
      .waitForResponse((response) => new URL(response.url()).pathname.endsWith(ApiEndpoints.terminologyUpsertRow), { timeout: Timeouts.short })
      .catch(() => null);
    await this.page.locator(buttonSelector(TERMINOLOGY_RECORD_DIALOG.save)).first().click();
    const response = await waiting;
    const text = response === null ? '' : await response.text().catch(() => '');
    const body = parseJson<{ ValidationErrors?: { Reason?: string }[] }>(text);
    const messages = await this.getMessages();
    const closed = await this.byId(TERMINOLOGY_RECORD_DIALOG.title).waitFor({ state: 'hidden', timeout: Timeouts.short }).then(() => true).catch(() => false);
    return {
      status: response?.status() ?? -1,
      validationErrors: (body?.ValidationErrors ?? []).map((e) => e.Reason ?? '').filter((r) => r !== ''),
      messages,
      closed,
    };
  }

  async cancel(): Promise<void> {
    await this.page.locator(buttonSelector(TERMINOLOGY_RECORD_DIALOG.cancel)).first().click();
    await expect(this.byId(TERMINOLOGY_RECORD_DIALOG.title)).toBeHidden({ timeout: Timeouts.default });
  }
}
