import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { chooseSelectOption, readSelectOptions, requiredLabels, setCheckbox } from '../components/PrimeControls';
import { Timeouts } from '../../constants/Timeouts';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { TERMINOLOGY_FORM, TOAST, buttonSelector, type TerminologyFieldControl } from '../../constants/ElementIds';
import { parseJson } from '../../utils/TerminologyProvisioning';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';

/** A field as the builder configures it; anything left out keeps the builder's default. */
export interface FieldBuilderSpec {
  name?: string;
  /** Type label as offered ("Text", "Number", "Date", "Boolean", "List", "Mapping Identifier"). */
  type?: string;
  /** Restriction label as offered. */
  restriction?: string;
  maxLength?: number;
  listSource?: string;
  mappingTerminology?: string;
  mappingField?: string;
  required?: boolean;
  unique?: boolean;
  showInTable?: boolean;
}

/** What Save answered. */
export interface SaveAnswer {
  /** HTTP status of the create / update request, -1 when none was sent. */
  status: number;
  /** Server-side field errors (`ValidationErrors[].Reason`). */
  validationErrors: string[];
  /** Toasts and inline errors on screen afterwards. */
  messages: string[];
  /** Whether the drawer closed. */
  closed: boolean;
}

/**
 * The Add / Edit Terminology drawer - Details, then Fields.
 *
 * Field cards repeat the same ids (verified 2026-10-29), so a card is addressed
 * by its POSITION: 0 is the first custom field. The dependent controls a type
 * brings (Max Length, List Source, Mapping Terminology / Field) are read by
 * whether their id is rendered in that card.
 */
export class TerminologyFormDrawer {
  constructor(private readonly page: Page) {}

  private byId(id: string): Locator {
    return this.page.locator(`#${id}`);
  }

  private root(): Locator {
    return this.byId(TERMINOLOGY_FORM.root);
  }

  async waitForOpen(): Promise<void> {
    await expect(this.byId(TERMINOLOGY_FORM.title), 'the terminology drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  /** For Edit: waits until the drawer has loaded the terminology's saved name (it fills a moment after opening). */
  async waitForLoadedValues(): Promise<void> {
    await expect(this.byId(TERMINOLOGY_FORM.name), 'the Edit drawer should load the saved name').not.toHaveValue('', { timeout: Timeouts.default });
  }

  async isOpen(): Promise<boolean> {
    return this.byId(TERMINOLOGY_FORM.title).isVisible();
  }

  async getTitle(): Promise<string> {
    return (await this.byId(TERMINOLOGY_FORM.title).innerText()).trim();
  }

  // ---- step 1: details --------------------------------------------------------

  async fillName(value: string): Promise<void> {
    await this.byId(TERMINOLOGY_FORM.name).fill(value);
  }

  /** Types the name key by key - for the maximum-length cases, where `fill` would bypass maxlength. */
  async typeName(value: string): Promise<void> {
    await this.byId(TERMINOLOGY_FORM.name).fill('');
    await this.byId(TERMINOLOGY_FORM.name).pressSequentially(value, { delay: 0 });
  }

  async getNameValue(): Promise<string> {
    return this.byId(TERMINOLOGY_FORM.name).inputValue();
  }

  async fillDescription(value: string): Promise<void> {
    await this.byId(TERMINOLOGY_FORM.description).fill(value);
  }

  async typeDescription(value: string): Promise<void> {
    await this.byId(TERMINOLOGY_FORM.description).fill('');
    await this.byId(TERMINOLOGY_FORM.description).pressSequentially(value, { delay: 0 });
  }

  async getDescriptionValue(): Promise<string> {
    return this.byId(TERMINOLOGY_FORM.description).inputValue();
  }

  async fillDetails(details: { name?: string; description?: string }): Promise<void> {
    if (details.name !== undefined) await this.fillName(details.name);
    if (details.description !== undefined) await this.fillDescription(details.description);
  }

  async setSubscribed(value: boolean): Promise<void> {
    await setCheckbox(this.byId(TERMINOLOGY_FORM.subscribed), value);
  }

  async isSubscribedChecked(): Promise<boolean> {
    return this.byId(TERMINOLOGY_FORM.subscribed).isChecked();
  }

  async isSubscriptionReferenceShown(): Promise<boolean> {
    return this.byId(TERMINOLOGY_FORM.subscriptionReference).isVisible();
  }

  /** Whether the reference input is shown AND accepts typing. */
  async isSubscriptionReferenceEditable(): Promise<boolean> {
    const input = this.byId(TERMINOLOGY_FORM.subscriptionReference);
    return (await input.isVisible()) && (await input.isEditable());
  }

  async fillSubscriptionReference(value: string): Promise<void> {
    await this.byId(TERMINOLOGY_FORM.subscriptionReference).fill(value);
  }

  async typeSubscriptionReference(value: string): Promise<void> {
    await this.byId(TERMINOLOGY_FORM.subscriptionReference).fill('');
    await this.byId(TERMINOLOGY_FORM.subscriptionReference).pressSequentially(value, { delay: 0 });
  }

  async getSubscriptionReferenceValue(): Promise<string> {
    return this.byId(TERMINOLOGY_FORM.subscriptionReference).inputValue().catch(() => '');
  }

  /** The reference's own validation message, '' when none shows. */
  async getSubscriptionReferenceError(): Promise<string> {
    return this.byId(TERMINOLOGY_FORM.subscriptionReferenceError).innerText({ timeout: Timeouts.short }).then((t) => t.trim()).catch(() => '');
  }

  /** The labels of the Details step's checkboxes. */
  async getDetailsText(): Promise<string> {
    return (await this.root().innerText()).replace(/\s+/g, ' ').trim();
  }

  /** Whether the Fields step (its Add Field button) is on screen. */
  async isOnFieldsStep(): Promise<boolean> {
    return this.btnLocator(TERMINOLOGY_FORM.addField).waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  private btnLocator(id: string): Locator {
    return this.page.locator(buttonSelector(id)).first();
  }

  /** Clicks Next; returns whether the Fields step opened. */
  async next(): Promise<boolean> {
    Logger.step('Terminology drawer: Next');
    await this.btnLocator(TERMINOLOGY_FORM.next).click();
    return this.isOnFieldsStep();
  }

  async back(): Promise<void> {
    await this.btnLocator(TERMINOLOGY_FORM.back).click();
    await expect(this.byId(TERMINOLOGY_FORM.name)).toBeVisible({ timeout: Timeouts.default });
  }

  // ---- step 2: fields -------------------------------------------------------------

  private fieldControl(index: number, control: TerminologyFieldControl): Locator {
    // locator-exception: every field card repeats these ids - see TERMINOLOGY_FORM.field.
    return this.page.locator(`#${TERMINOLOGY_FORM.field[control]}`).nth(index);
  }

  /** How many field cards the builder shows (the automatic Is Active is not one). */
  async countFields(): Promise<number> {
    return this.page.locator(`#${TERMINOLOGY_FORM.field.name}`).count();
  }

  /** Adds a field card and returns its index. */
  async addField(): Promise<number> {
    const before = await this.countFields();
    await this.btnLocator(TERMINOLOGY_FORM.addField).click();
    await expect.poll(() => this.countFields(), { timeout: Timeouts.default, message: 'Add Field should add a field card' }).toBe(before + 1);
    return before;
  }

  /** The names of the field cards, in order. */
  async getFieldNames(): Promise<string[]> {
    const inputs = this.page.locator(`#${TERMINOLOGY_FORM.field.name}`);
    const names: string[] = [];
    for (let i = 0; i < (await inputs.count()); i += 1) names.push(await inputs.nth(i).inputValue());
    return names;
  }

  async fieldIndexOf(name: string): Promise<number> {
    const index = (await this.getFieldNames()).indexOf(name);
    expect(index, `the builder should list a field named "${name}"`).toBeGreaterThanOrEqual(0);
    return index;
  }

  async setFieldName(index: number, name: string): Promise<void> {
    await this.fieldControl(index, 'name').fill(name);
  }

  /** Whether a builder control is rendered for the card at `index`. */
  async isControlShown(index: number, control: TerminologyFieldControl): Promise<boolean> {
    const card = this.fieldCard(index);
    return card.locator(`#${TERMINOLOGY_FORM.field[control]}`).isVisible();
  }

  /**
   * The field card (the builder block) holding the name input at `index`: the
   * nearest ancestor holding both the Type select and the Required checkbox.
   * The inputs sit in their own grid and the three flag checkboxes beside it,
   * so the nearest Type-holding ancestor left the flags out (20075, 2026-10-30).
   */
  private fieldCard(index: number): Locator {
    return this.page.locator(`#${TERMINOLOGY_FORM.field.name}`).nth(index)
      .locator(`xpath=ancestor::*[.//*[@id="${TERMINOLOGY_FORM.field.type}"]][.//*[@id="${TERMINOLOGY_FORM.field.required}"]][1]`);
  }

  /** The dependent controls shown for the card at `index`. */
  async getShownControls(index: number): Promise<TerminologyFieldControl[]> {
    const shown: TerminologyFieldControl[] = [];
    for (const control of Object.keys(TERMINOLOGY_FORM.field) as TerminologyFieldControl[]) {
      if (await this.isControlShown(index, control)) shown.push(control);
    }
    return shown;
  }

  /** The text a select currently shows. */
  async getSelected(index: number, control: TerminologyFieldControl): Promise<string> {
    return (await this.fieldCard(index).locator(`#${TERMINOLOGY_FORM.field[control]}`).innerText().catch(() => '')).trim();
  }

  private select(index: number, control: TerminologyFieldControl): Locator {
    return this.fieldCard(index).locator(`#${TERMINOLOGY_FORM.field[control]}`);
  }

  /** The options a select offers, without choosing one - read from that select's own overlay. */
  async getOptions(index: number, control: TerminologyFieldControl): Promise<string[]> {
    return readSelectOptions(this.page, this.select(index, control));
  }

  async choose(index: number, control: TerminologyFieldControl, option: string): Promise<void> {
    Logger.step(`Field ${index}: ${control} = "${option}"`);
    // A type change re-renders the card's dependent selects a moment later and
    // can reset a choice made at once (seen 2026-10-29: Alphanumeric read back
    // as None) - so a lost choice is made once more before it is asserted.
    const kept = await chooseSelectOption(this.page, this.select(index, control), option).then(() => true).catch(() => false);
    if (!kept) await chooseSelectOption(this.page, this.select(index, control), option);
  }

  /**
   * Chooses an option when it is offered; reports whether it was, and the
   * messages the builder showed after the attempt - for the cases where an
   * invalid choice may be either withheld or warned about.
   */
  async tryChoose(index: number, control: TerminologyFieldControl, option: string): Promise<{ chosen: boolean; messages: string[] }> {
    const offered = (await this.getOptions(index, control)).includes(option);
    if (offered) await this.choose(index, control, option);
    return { chosen: offered, messages: await this.getMessages() };
  }

  /** The text of one field card - its labels. */
  async getFieldCardText(index: number): Promise<string> {
    return (await this.fieldCard(index).innerText()).replace(/\s+/g, ' ').trim();
  }

  /** The labels a field card marks as required (the asterisk is drawn by CSS). */
  async getRequiredLabels(index: number): Promise<string[]> {
    return requiredLabels(this.fieldCard(index));
  }

  async setMaxLength(index: number, value: number): Promise<void> {
    await this.fieldControl(index, 'maxLength').fill(String(value));
  }

  async getMaxLength(index: number): Promise<string> {
    return this.fieldControl(index, 'maxLength').inputValue();
  }

  async setFlag(index: number, flag: 'required' | 'unique' | 'showInTable', value: boolean): Promise<void> {
    await setCheckbox(this.fieldCard(index).locator(`#${TERMINOLOGY_FORM.field[flag]}`), value);
  }

  async isFlagChecked(index: number, flag: 'required' | 'unique' | 'showInTable'): Promise<boolean> {
    return this.fieldCard(index).locator(`#${TERMINOLOGY_FORM.field[flag]}`).isChecked();
  }

  /** Configures the card at `index`, in the order the builder needs (type before its dependants). */
  async configureField(index: number, spec: FieldBuilderSpec): Promise<void> {
    if (spec.name !== undefined) await this.setFieldName(index, spec.name);
    if (spec.type !== undefined) await this.choose(index, 'type', spec.type);
    if (spec.restriction !== undefined) await this.choose(index, 'restriction', spec.restriction);
    if (spec.maxLength !== undefined) await this.setMaxLength(index, spec.maxLength);
    if (spec.listSource !== undefined) await this.choose(index, 'listSource', spec.listSource);
    if (spec.mappingTerminology !== undefined) await this.choose(index, 'mappingTerminology', spec.mappingTerminology);
    if (spec.mappingField !== undefined) await this.choose(index, 'mappingField', spec.mappingField);
    if (spec.required !== undefined) await this.setFlag(index, 'required', spec.required);
    if (spec.unique !== undefined) await this.setFlag(index, 'unique', spec.unique);
    if (spec.showInTable !== undefined) await this.setFlag(index, 'showInTable', spec.showInTable);
  }

  /** Adds a field card and configures it; returns its index. */
  async addConfiguredField(spec: FieldBuilderSpec): Promise<number> {
    const index = await this.addField();
    await this.configureField(index, spec);
    return index;
  }

  /** How the card's remove control is offered. */
  async getRemoveAvailability(index: number): Promise<'absent' | 'disabled' | 'available'> {
    const remove = this.fieldCard(index).locator(`#${TERMINOLOGY_FORM.removeField}`).first();
    if ((await remove.count()) === 0) return 'absent';
    return (await remove.isEnabled()) ? 'available' : 'disabled';
  }

  /** How the builder lets a field be removed, by name - 'absent' when the builder does not list it at all. */
  async getRemoveAvailabilityOf(name: string): Promise<'absent' | 'disabled' | 'available'> {
    const index = (await this.getFieldNames()).indexOf(name);
    if (index < 0) return 'absent';
    return this.getRemoveAvailability(index);
  }

  async removeField(index: number): Promise<void> {
    await this.fieldCard(index).locator(`#${TERMINOLOGY_FORM.removeField}`).first().click();
  }

  /** The whole text of the Fields step - Is Active, when the builder shows it, appears here. */
  async getFieldsStepText(): Promise<string> {
    return (await this.root().innerText()).replace(/\s+/g, ' ').trim();
  }

  // ---- saving ------------------------------------------------------------------------

  /** Validation messages and toasts on screen now (settled). */
  async getMessages(timeout: number = Timeouts.short): Promise<string[]> {
    return WaitUtils.settleMessages(async () => {
      const inDrawer = await this.root().locator('small, [role="alert"], .p-error, [id$="-error"]').filter({ visible: true }).allInnerTexts().catch(() => [] as string[]);
      const toast = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
      return [...inDrawer, ...toast].map((text) => text.trim()).filter((text) => text !== '');
    }, timeout);
  }

  /** Clicks Save and reports what the server and the screen answered. */
  async save(): Promise<SaveAnswer> {
    Logger.step('Terminology drawer: Save');
    // Only the create / update answer counts: the list re-query that follows a
    // save also goes to /Terminologies/ and must not be read as the save.
    const saved = new RegExp(`(${ApiEndpoints.terminologyCreate}|${ApiEndpoints.terminologyUpdate})$`);
    const waiting = this.page.waitForResponse((response) => saved.test(new URL(response.url()).pathname), { timeout: Timeouts.short }).catch(() => null);
    await this.btnLocator(TERMINOLOGY_FORM.save).click();
    const response = await waiting;
    const text = response === null ? '' : await response.text().catch(() => '');
    const body = parseJson<{ ValidationErrors?: { Reason?: string }[] }>(text);
    const messages = await this.getMessages();
    const closed = await this.byId(TERMINOLOGY_FORM.title).waitFor({ state: 'hidden', timeout: Timeouts.short }).then(() => true).catch(() => false);
    return {
      status: response?.status() ?? -1,
      validationErrors: (body?.ValidationErrors ?? []).map((e) => e.Reason ?? '').filter((r) => r !== ''),
      messages,
      closed,
    };
  }

  /**
   * Tries to save whatever the Details step holds: Next, then - when the
   * Fields step opens - one field named `fieldName` if the builder has none,
   * then Save. A Details step that refuses Next answers with its own messages
   * and status -1, so a validation case reads one answer either way.
   */
  /**
   * Tries to point a mapping field at a terminology and one of its fields, then
   * save. The picker may refuse the target outright by not offering it - the
   * self-mapping case saw City left out of its own picker (20170, 2026-10-30) -
   * so whether it was offered is reported, and nothing is saved then.
   */
  async attemptMappingTo(index: number, terminology: string, field: string): Promise<SaveAnswer & { offered: boolean }> {
    const offered = (await this.getOptions(index, 'mappingTerminology')).includes(terminology);
    if (!offered) return { offered, status: -1, validationErrors: [], messages: await this.getMessages(), closed: false };
    await this.choose(index, 'mappingTerminology', terminology);
    await this.choose(index, 'mappingField', field);
    return { offered, ...(await this.save()) };
  }

  async attemptSave(fieldName = 'Code'): Promise<SaveAnswer> {
    if (!(await this.next())) return { status: -1, validationErrors: [], messages: await this.getMessages(), closed: false };
    if ((await this.countFields()) === 0) await this.addConfiguredField({ name: fieldName });
    return this.save();
  }

  /** Closes the drawer, discarding any change. */
  async close(): Promise<void> {
    await this.byId(TERMINOLOGY_FORM.close).click();
    const guard = new ConfirmDialog(this.page);
    if (await guard.isDiscardPromptVisible()) await guard.discardChanges();
    await expect(this.byId(TERMINOLOGY_FORM.title)).toBeHidden({ timeout: Timeouts.default });
  }
}
