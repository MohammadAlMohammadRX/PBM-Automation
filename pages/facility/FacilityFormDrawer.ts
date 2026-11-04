import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { readSelectOptions, requiredLabels, setCheckbox, chooseSelectOption } from '../components/PrimeControls';
import { Timeouts } from '../../constants/Timeouts';
import { TOAST, buttonSelector } from '../../constants/ElementIds';
import {
  FACILITY_FORM,
  type FacilityBasicField,
  type FacilityDetailsField,
  type FacilityFormErrorField,
  type FacilityFormField,
} from '../../constants/facility/facilityIds';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';

/** Step 1 (Basic Information); a key left out is not touched. Selects take the option's label. */
export interface FacilityBasicInfo {
  nameEn?: string;
  nameAr?: string;
  /** "Clinic" | "Hospital" | "Pharmacy". */
  type?: string;
  /** "Both" | "Integration Provider" | "Provider Portal". */
  providerType?: string;
  nationalCode?: string;
  /** The Is Active checkbox (ticked by default on Add). */
  isActive?: boolean;
}

/** Step 2 (Contact & License); dates as `DD/MM/YYYY` (facilityDayText). '' clears a field. */
export interface FacilityContactInfo {
  email?: string;
  phone?: string;
  mobile?: string;
  licenseNo?: string;
  licenseStart?: string;
  licenseExpiry?: string;
  buildingName?: string;
  zipCode?: string;
  unitNumber?: string;
  /** Typed into the number inputs (no range check on screen). */
  longitude?: string;
  latitude?: string;
  additionalAddressEn?: string;
  additionalAddressAr?: string;
}

/** What a Save answered: HTTP status (-1 = refused client-side, nothing sent), body sent, messages shown. */
export interface FacilitySaveAnswer {
  status: number;
  text: string;
  messages: string[];
  body: Record<string, unknown> | null;
}

type TextField = Exclude<FacilityFormField, 'type' | 'providerType' | 'isActive' | 'authorityCode'>;
const DATE_FIELDS: readonly string[] = ['licenseStart', 'licenseExpiry'];

const inputId = (field: FacilityFormField): string =>
  (FACILITY_FORM.basic as Record<string, string>)[field] ?? (FACILITY_FORM.details as Record<string, string>)[field];

/**
 * The Add / Edit Facility drawer (`facility-form-drawer`), verified live 2026-11-04.
 *
 * Step 1 "Basic Information": Facility Name*, اسم المنشأة* (Arabic), Facility
 * Type* (Clinic / Hospital / Pharmacy), Authority Code (read-only, from the
 * type: 1 / 2 / 3), Provider Type* (Both / Integration Provider / Provider
 * Portal), National Code, Is Active (ticked). Next validates step 1: "This
 * field is required.", "English letters only." (an Arabic letter in the English
 * name), "Arabic letters only." (a LATIN letter in the Arabic name - digits are
 * accepted on screen but refused by the server). No maxlength on the names
 * (server: 255).
 * Step 2 "Contact & License": Email Address* ("Enter a valid email address."),
 * Phone, Mobile (no format check), License Number*, License Start Date*,
 * License Expiry Date* (DD/MM/YYYY, typed + Enter; expiry before start -> "End
 * date must be after start date."; the SAME day is accepted), Building Name,
 * Zip Code, Unit Number, Longitude, Latitude (number inputs, 8 decimals, NO
 * range check), "Pick location on map" (Leaflet: a click sets both
 * coordinates to 6 decimals; the marker can be dragged), Additional Address
 * (English / Arabic). Save sends CreateFacility / UpdateFacility; the toast is
 * "Facility created / The facility has been created." ("Facility updated").
 * Closing a dirty drawer raises "Unsaved Changes" (Keep Editing / Discard
 * Changes). The Facility Code is NOT on the form.
 */
export class FacilityFormDrawer {
  constructor(protected readonly page: Page) {}

  protected byId(id: string): Locator {
    return this.page.locator(`#${id}`);
  }

  protected btn(id: string): Locator {
    return this.page.locator(buttonSelector(id)).first();
  }

  async waitForOpen(): Promise<void> {
    await expect(this.byId(FACILITY_FORM.title), 'the facility drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  async isOpen(): Promise<boolean> {
    return this.byId(FACILITY_FORM.title).waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  /** Edit: waits until the drawer shows the facility's values (the English name filled by GetFacility). */
  async waitForLoadedValues(): Promise<void> {
    await expect(this.byId(FACILITY_FORM.basic.nameEn), 'the drawer should load the facility').not.toHaveValue('', { timeout: Timeouts.default });
  }

  /** "Add New Facility" | "Edit Facility". */
  async getTitle(): Promise<string> {
    return (await this.byId(FACILITY_FORM.title).innerText()).trim();
  }

  /** The drawer's whole text (labels, hints, errors). */
  async getText(): Promise<string> {
    return (await this.byId(FACILITY_FORM.root).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** The stepper's step labels ("Basic Information", "Contact & License"). */
  async getStepLabels(): Promise<string[]> {
    return (await this.page.locator(`[id^="${FACILITY_FORM.stepPrefix}"][id$="-label"]`).allInnerTexts()).map((t) => t.trim());
  }

  /** The step shown now: 1 when the English name is on screen, 2 when the e-mail is. */
  async currentStep(): Promise<1 | 2> {
    return (await this.byId(FACILITY_FORM.details.email).isVisible().catch(() => false)) ? 2 : 1;
  }

  /** The labels marked required on the visible step (the red "*" is CSS). */
  async getRequiredLabels(): Promise<string[]> {
    return requiredLabels(this.byId(FACILITY_FORM.root).first());
  }

  /** Whether a field renders on the visible step (field-list cases). */
  async hasField(field: FacilityFormField): Promise<boolean> {
    return this.byId(inputId(field)).isVisible().catch(() => false);
  }

  // ---- fields -----------------------------------------------------------------------------

  /** Types into a text field with real key presses (dates committed with Enter, others blurred). '' clears it. */
  async type(field: TextField, value: string): Promise<void> {
    const input = this.byId(inputId(field));
    await input.click();
    await input.press('ControlOrMeta+a');
    if (value === '') {
      await input.press('Delete');
    } else {
      await input.pressSequentially(value);
    }
    if (DATE_FIELDS.includes(field)) await input.press('Enter');
    else await input.blur();
  }

  async clear(field: TextField): Promise<void> {
    await this.type(field, '');
  }

  async getValue(field: FacilityFormField): Promise<string> {
    return this.byId(inputId(field)).inputValue().catch(() => '');
  }

  async getMaxLength(field: TextField): Promise<number | null> {
    const raw = await this.byId(inputId(field)).getAttribute('maxlength');
    return raw === null ? null : Number(raw);
  }

  async getPlaceholder(field: FacilityFormField): Promise<string> {
    return (await this.byId(inputId(field)).getAttribute('placeholder')) ?? '';
  }

  /** Whether a field is read-only (the Authority Code is). */
  async isReadOnly(field: FacilityFormField): Promise<boolean> {
    const input = this.byId(inputId(field));
    return input.evaluate((el) => (el as HTMLInputElement).readOnly || el.hasAttribute('readonly') || (el as HTMLInputElement).disabled).catch(() => false);
  }

  /** Picks a select's option by its label. */
  async choose(select: 'type' | 'providerType', label: string): Promise<void> {
    await chooseSelectOption(this.page, this.byId(FACILITY_FORM.basic[select]), label);
  }

  async getOptions(select: 'type' | 'providerType'): Promise<string[]> {
    return readSelectOptions(this.page, this.byId(FACILITY_FORM.basic[select]));
  }

  /** What a select shows now ("Select", the chosen label). */
  async readSelect(select: 'type' | 'providerType'): Promise<string> {
    return (await this.byId(FACILITY_FORM.basic[select]).innerText().catch(() => '')).trim();
  }

  /** The derived Authority Code ('' before a type is chosen). */
  async getAuthorityCode(): Promise<string> {
    return this.byId(FACILITY_FORM.basic.authorityCode).inputValue();
  }

  async isActiveTicked(): Promise<boolean> {
    return this.byId(FACILITY_FORM.basic.isActive).isChecked();
  }

  async setActive(value: boolean): Promise<void> {
    await setCheckbox(this.byId(FACILITY_FORM.basic.isActive), value);
  }

  async fillBasic(info: FacilityBasicInfo): Promise<void> {
    Logger.step(`Facility drawer step 1: ${JSON.stringify(info)}`);
    if (info.nameEn !== undefined) await this.type('nameEn', info.nameEn);
    if (info.nameAr !== undefined) await this.type('nameAr', info.nameAr);
    if (info.type !== undefined) await this.choose('type', info.type);
    if (info.providerType !== undefined) await this.choose('providerType', info.providerType);
    if (info.nationalCode !== undefined) await this.type('nationalCode', info.nationalCode);
    if (info.isActive !== undefined) await this.setActive(info.isActive);
  }

  async fillContact(info: FacilityContactInfo): Promise<void> {
    Logger.step(`Facility drawer step 2: ${JSON.stringify(info)}`);
    for (const [field, value] of Object.entries(info) as [FacilityDetailsField, string][]) {
      if (value !== undefined) await this.type(field, value);
    }
  }

  // ---- map ---------------------------------------------------------------------------------

  /** The step-2 map canvas (Leaflet, no id of its own). */
  private mapCanvas(): Locator {
    return this.byId(FACILITY_FORM.root).locator('.pbm-map__canvas').first(); // locator-exception: the Leaflet map host carries no id; it is the only map inside the drawer.
  }

  async isMapShown(): Promise<boolean> {
    return this.mapCanvas().isVisible().catch(() => false);
  }

  /** The coordinates the inputs hold now ('' when empty). */
  async readCoordinates(): Promise<{ latitude: string; longitude: string }> {
    return { latitude: await this.getValue('latitude'), longitude: await this.getValue('longitude') };
  }

  /**
   * Clicks the map `dx` / `dy` pixels from its centre and returns the
   * coordinates the inputs then hold (a click sets BOTH, rounded to 6
   * decimals; it also moves the map's view to the marker at zoom >= 13).
   */
  async clickMap(dx = 0, dy = 0): Promise<{ latitude: string; longitude: string }> {
    const canvas = this.mapCanvas();
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('the facility map is not on screen (step 2 "Pick location on map")');
    const before = await this.readCoordinates();
    await this.page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
    await expect.poll(async () => JSON.stringify(await this.readCoordinates()), { timeout: Timeouts.short }).not.toBe(JSON.stringify(before)).catch(() => undefined);
    return this.readCoordinates();
  }

  /** Zooms the map with its +/- control `times` times. */
  async zoomMap(direction: 'in' | 'out', times = 1): Promise<void> {
    const control = this.byId(FACILITY_FORM.root).locator(direction === 'in' ? '.leaflet-control-zoom-in' : '.leaflet-control-zoom-out').first(); // locator-exception: Leaflet's zoom buttons carry no id; reached inside the drawer.
    for (let i = 0; i < times; i += 1) {
      await control.click();
      await this.page.waitForTimeout(300);
    }
  }

  /** Drags the map by (dx, dy) pixels (panning). */
  async panMap(dx: number, dy: number): Promise<void> {
    const box = await this.mapCanvas().boundingBox();
    if (!box) throw new Error('the facility map is not on screen');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await this.page.mouse.move(x, y);
    await this.page.mouse.down();
    await this.page.mouse.move(x + dx, y + dy, { steps: 8 });
    await this.page.mouse.up();
  }

  // ---- validation ---------------------------------------------------------------------------

  async getFieldError(field: FacilityFormErrorField): Promise<string> {
    return (await this.byId(FACILITY_FORM.error[field]).innerText({ timeout: Timeouts.short }).catch(() => '')).trim();
  }

  /** Every field error on screen now, by field. */
  async getFieldErrors(): Promise<Partial<Record<FacilityFormErrorField, string>>> {
    const out: Partial<Record<FacilityFormErrorField, string>> = {};
    for (const field of Object.keys(FACILITY_FORM.error) as FacilityFormErrorField[]) {
      const error = this.byId(FACILITY_FORM.error[field]);
      if (await error.isVisible().catch(() => false)) out[field] = (await error.innerText()).trim();
    }
    return out;
  }

  /** Field errors and toasts, settled. */
  async getMessages(): Promise<string[]> {
    return WaitUtils.settleMessages(async () => {
      const own = await this.page.locator(`[id^="${FACILITY_FORM.root}-"][id$="-error"]`).filter({ visible: true }).allInnerTexts().catch(() => [] as string[]);
      const toast = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
      return [...own, ...toast].map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t !== '');
    });
  }

  // ---- buttons ----------------------------------------------------------------------------

  /** Next: moves to step 2 when step 1 is valid. Returns whether it moved. */
  async next(): Promise<boolean> {
    await this.btn(FACILITY_FORM.next).click();
    return this.byId(FACILITY_FORM.details.email).waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  /** Back (step 2 -> step 1). */
  async back(): Promise<void> {
    await this.btn(FACILITY_FORM.back).click();
    await expect(this.byId(FACILITY_FORM.basic.nameEn)).toBeVisible({ timeout: Timeouts.default });
  }

  /** Clicks a stepper bullet (going forward validates step 1). */
  async goToStep(step: 1 | 2): Promise<void> {
    await this.page.locator(`#${FACILITY_FORM.stepPrefix}${step}-bullet`).click();
  }

  async isSaveEnabled(): Promise<boolean> {
    return this.btn(FACILITY_FORM.save).isEnabled().catch(() => false);
  }

  /**
   * Clicks Save (moving to step 2 first when needed) and reports what the save
   * answered, the body sent and the messages. -1 = refused client-side (the
   * drawer jumps back to the step with the error).
   */
  async attemptSave(): Promise<FacilitySaveAnswer> {
    Logger.step('Facility drawer: Save');
    if ((await this.currentStep()) === 1) await this.next();
    // A refused save sends nothing: wait briefly for the REQUEST, then for its answer.
    const sent = this.page.waitForRequest((r) => /\/(CreateFacility|UpdateFacility)$/.test(new URL(r.url()).pathname), { timeout: Timeouts.short }).catch(() => null);
    await this.btn(FACILITY_FORM.save).click();
    const request = await sent;
    const response = request ? await request.response().catch(() => null) : null;
    let body: Record<string, unknown> | null = null;
    try { body = response ? (response.request().postDataJSON() as Record<string, unknown>) : null; } catch { body = null; }
    return { status: response?.status() ?? -1, text: response ? await response.text().catch(() => '') : '', messages: await this.getMessages(), body };
  }

  /** Saves and asserts success and that the drawer closed. */
  async save(): Promise<FacilitySaveAnswer> {
    const answer = await this.attemptSave();
    expect(answer.status, `the facility save should succeed: ${answer.text.slice(0, 300)} ${answer.messages.join(' | ')}`).toBeGreaterThanOrEqual(200);
    expect(answer.status).toBeLessThan(300);
    await expect(this.byId(FACILITY_FORM.title), 'the drawer should close after saving').toBeHidden({ timeout: Timeouts.default });
    return answer;
  }

  /** Step 1 + Next + step 2 + Save - the whole Add flow; returns the save answer (not asserted). */
  async create(basic: FacilityBasicInfo, contact: FacilityContactInfo): Promise<FacilitySaveAnswer> {
    await this.fillBasic(basic);
    await this.next();
    await this.fillContact(contact);
    return this.attemptSave();
  }

  /** The X; a dirty form raises "Unsaved Changes" - Discard Changes (default) or Keep Editing. */
  async close(discard = true): Promise<void> {
    await this.byId(FACILITY_FORM.close).click();
    const dialog = new ConfirmDialog(this.page);
    if (await dialog.isDiscardPromptVisible()) {
      if (discard) await dialog.discardChanges();
      else await dialog.keepEditing();
    }
    if (discard) await expect(this.byId(FACILITY_FORM.title)).toBeHidden({ timeout: Timeouts.default });
  }

  /** Whether closing now raises the "Unsaved Changes" prompt (left open for the case to answer). */
  async closeRaisesUnsavedPrompt(): Promise<boolean> {
    await this.byId(FACILITY_FORM.close).click();
    return new ConfirmDialog(this.page).isDiscardPromptVisible();
  }

  /** Step 1's Back/Cancel; a dirty form raises the discard prompt. */
  async cancel(discard = true): Promise<void> {
    await this.btn(FACILITY_FORM.back).click();
    const dialog = new ConfirmDialog(this.page);
    if (await dialog.isDiscardPromptVisible()) {
      if (discard) await dialog.discardChanges();
      else await dialog.keepEditing();
    }
  }

  /** The type id `inputId` resolves - exported for field-list cases. */
  static idOf(field: FacilityBasicField | FacilityDetailsField): string {
    return inputId(field);
  }
}
