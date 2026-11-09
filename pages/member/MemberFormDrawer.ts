import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { chooseSelectOption, readSelectOptions, requiredLabels, setCheckbox } from '../components/PrimeControls';
import { Timeouts } from '../../constants/Timeouts';
import { TOAST, buttonSelector } from '../../constants/ElementIds';
import {
  MEMBER_FORM,
  type MemberContactField,
  type MemberFormErrorField,
  type MemberFormField,
} from '../../constants/member/memberIds';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';

/** Step 1 (Member Information); a key left out is not touched. Selects take the option's label. */
export interface MemberPatientInfo {
  englishFirstName?: string;
  englishSecondName?: string;
  englishThirdName?: string;
  englishLastName?: string;
  arabicFirstName?: string;
  arabicSecondName?: string;
  arabicThirdName?: string;
  arabicLastName?: string;
  eHealthId?: string;
  /** "Saudi (SAU)", "Jordanian (JOR)", ... (the select filters as you type). */
  nationality?: string;
  /** "National ID" | "Iqama (Residence Permit)" | "Passport" | "GCC ID". */
  identityType?: string;
  documentId?: string;
  /** `DD/MM/YYYY` (memberDayText) - typed + Enter; fills the Hijri date. */
  dateOfBirth?: string;
  /** `YYYY/MM/DD` - typed + blur; fills the Date of Birth. */
  hijriDateOfBirth?: string;
  /** "Male" | "Female". */
  gender?: string;
  placeOfBirth?: string;
  occupation?: string;
  maritalStatus?: string;
  /** "Alive" | "Deceased". */
  memberStatus?: string;
  isActive?: boolean;
  isSpecialNeeds?: boolean;
}

/** Step 2 (Non-National Registry). */
export interface MemberNonNationalInfo {
  insuranceNumber?: string;
  /** 9 digits starting 5 (the "+966" prefix is fixed text). */
  mobileNumber?: string;
  email?: string;
  /** "Email" | "SMS" | "Both". */
  preferredContactMethod?: string;
  /** "English" | "Arabic". */
  preferredLanguage?: string;
  /** "A+" ... "O-". */
  bloodGroup?: string;
  isVip?: boolean;
}

/** Step 3 (Address). */
export interface MemberAddressInfo {
  /** "Saudi Arabia" | "Jordan" | "United Arab Emirates". */
  country?: string;
  city?: string;
  district?: string;
  street?: string;
  buildingNumber?: string;
  postalCode?: string;
  additionalNumber?: string;
}

/** One emergency contact (step 4). */
export interface MemberContactInfo {
  name?: string;
  /** "Self" | "Spouse" | "Child" | "Parent" | "Other". */
  relationship?: string;
  phoneNumber?: string;
}

/** What a Save answered: HTTP status (-1 = refused client-side, nothing sent), body sent, messages shown. */
export interface MemberSaveAnswer {
  status: number;
  text: string;
  messages: string[];
  body: Record<string, unknown> | null;
}

type Step = 1 | 2 | 3 | 4;
type SelectField = 'nationality' | 'identityType' | 'gender' | 'placeOfBirth' | 'maritalStatus' | 'memberStatus'
  | 'preferredContactMethod' | 'preferredLanguage' | 'bloodGroup' | 'country' | 'city' | 'district' | 'street';
type CheckField = 'isActive' | 'isSpecialNeeds' | 'isVip';
type TextField = Exclude<MemberFormField, SelectField | CheckField>;

const SELECTS: readonly string[] = ['nationality', 'identityType', 'gender', 'placeOfBirth', 'maritalStatus', 'memberStatus', 'preferredContactMethod', 'preferredLanguage', 'bloodGroup', 'country', 'city', 'district', 'street'];

const inputId = (field: MemberFormField): string =>
  (MEMBER_FORM.patient as Record<string, string>)[field]
  ?? (MEMBER_FORM.nonNational as Record<string, string>)[field]
  ?? (MEMBER_FORM.address as Record<string, string>)[field];

/** The step a field lives on. */
const stepOf = (field: MemberFormField): Step =>
  field in MEMBER_FORM.patient ? 1 : field in MEMBER_FORM.nonNational ? 2 : 3;

/**
 * The Add / Edit Member wizard (`member-form-drawer`), verified live 2026-11-05.
 *
 * Step 1 "Member Information": First / Second / Third / Last Name (English)
 * and الاسم الأول / الثاني / الثالث / اسم العائلة (Arabic) - third names
 * optional; E-Health ID; Nationality* (choosing Saudi presets AND limits
 * Identity Type to National ID; any other nationality presets Iqama and offers
 * Iqama / Passport / GCC ID); Identity Type*; Document ID* (checked on blur:
 * "Must be 10 digits starting with 1 (Saudi National ID)." / "... 2 (Iqama /
 * Residence Permit)." / "Must be 8 to 15 digits." / "Letters and numbers only,
 * no special characters.", and CheckDocumentIdExists: "This document ID is
 * already registered to another member."); Date of Birth* (DD/MM/YYYY, no
 * future date; fills the Hijri date); Hijri Date of Birth (YYYY/MM/DD - on blur
 * fills the Date of Birth; "Enter a valid Hijri date in the format
 * YYYY/MM/DD."); Gender*; Place of Birth; Occupation; Marital Status (Single /
 * Married / Divorced / Widowed); Member Status* (Alive / Deceased); Member
 * Active Status (TICKED) and Special Needs. Next validates the step: "This
 * field is required.", "English letters only." / "Arabic letters only.".
 * Step 2 "Non-National Registry": Insurance Number, Mobile Number* ("+966"
 * fixed prefix, placeholder 5XXXXXXXX, NO format check), Email* ("Enter a valid
 * email address."; on blur CheckEmailExists "This email is already used by
 * another member."), Preferred Contact Method* (Email / SMS / Both), Preferred
 * Language* (English / Arabic), Blood Group, VIP.
 * Step 3 "Address": Country* (Jordan / Saudi Arabia / United Arab Emirates),
 * City -> District -> Street (cascading, filterable), Building Number, Postal
 * Code, Additional Number.
 * Step 4 "Emergency Contacts": "Add Contact" adds a block (Name*, Relationship*
 * Self / Spouse / Child / Parent / Other, Phone Number* - no format check) with
 * Remove; Save checks every block ("This field is required.").
 * Save sends CreateMember / UpdateMember -> toast "Member created / The member
 * has been created." ("Member updated / The member has been updated."), the
 * drawer closes. A dirty drawer closed raises "Unsaved Changes".
 */
export class MemberFormDrawer {
  constructor(protected readonly page: Page) {}

  protected byId(id: string): Locator {
    return this.page.locator(`#${id}`);
  }

  protected btn(id: string): Locator {
    return this.page.locator(buttonSelector(id)).first();
  }

  async waitForOpen(): Promise<void> {
    await expect(this.byId(MEMBER_FORM.title), 'the member wizard should open').toBeVisible({ timeout: Timeouts.default });
  }

  async isOpen(): Promise<boolean> {
    return this.byId(MEMBER_FORM.title).waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  /** Edit: waits until the wizard shows the member's values (the English first name filled by GetMemberForEdit). */
  async waitForLoadedValues(): Promise<void> {
    await expect(this.byId(MEMBER_FORM.patient.englishFirstName), 'the wizard should load the member').not.toHaveValue('', { timeout: Timeouts.default });
  }

  /** "Add New Member" | "Edit Member". */
  async getTitle(): Promise<string> {
    return (await this.byId(MEMBER_FORM.title).innerText()).trim();
  }

  /** The drawer's whole text (labels, hints, errors). */
  async getText(): Promise<string> {
    return (await this.byId(MEMBER_FORM.root).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** The stepper's step labels ("Member Information", "Non-National Registry", "Address", "Emergency Contacts"). */
  async getStepLabels(): Promise<string[]> {
    return (await this.page.locator(`[id^="${MEMBER_FORM.stepPrefix}"][id$="-label"]`).allInnerTexts()).map((t) => t.trim());
  }

  /** The step shown now (by the field on screen). */
  async currentStep(): Promise<Step> {
    if (await this.byId(MEMBER_FORM.patient.englishFirstName).isVisible().catch(() => false)) return 1;
    if (await this.byId(MEMBER_FORM.nonNational.email).isVisible().catch(() => false)) return 2;
    if (await this.byId(MEMBER_FORM.address.country).isVisible().catch(() => false)) return 3;
    return 4;
  }

  /** The labels marked required on the visible step (the red "*" is CSS). */
  async getRequiredLabels(): Promise<string[]> {
    return requiredLabels(this.byId(MEMBER_FORM.root).first());
  }

  /** Whether a field renders on the visible step (field-list cases). */
  async hasField(field: MemberFormField): Promise<boolean> {
    return this.byId(inputId(field)).isVisible().catch(() => false);
  }

  // ---- fields -----------------------------------------------------------------------------

  /** Moves to the step a field lives on (Back from later steps; Next - validating - from earlier ones). */
  async ensureStep(step: Step): Promise<void> {
    for (let guard = 0; guard < 4; guard += 1) {
      const now = await this.currentStep();
      if (now === step) return;
      if (now > step) await this.back();
      else if (!(await this.next())) return;
    }
  }

  /** Types into a text field with real key presses (the Date of Birth is committed with Enter, others blurred). '' clears it. */
  async type(field: TextField, value: string): Promise<void> {
    const input = this.byId(inputId(field));
    await input.click();
    await input.press('ControlOrMeta+a');
    if (value === '') await input.press('Delete');
    else await input.pressSequentially(value);
    if (field === 'dateOfBirth') await input.press('Enter');
    else await input.blur();
  }

  async clear(field: TextField): Promise<void> {
    await this.type(field, '');
  }

  async getValue(field: MemberFormField): Promise<string> {
    return this.byId(inputId(field)).inputValue().catch(() => '');
  }

  async getMaxLength(field: TextField): Promise<number | null> {
    const raw = await this.byId(inputId(field)).getAttribute('maxlength');
    return raw === null ? null : Number(raw);
  }

  async getPlaceholder(field: MemberFormField): Promise<string> {
    return (await this.byId(inputId(field)).getAttribute('placeholder')) ?? '';
  }

  /** Whether a field (input or select) is read-only / disabled (Identity Type is not locked for a Saudi - it is limited to one option). */
  async isReadOnly(field: MemberFormField): Promise<boolean> {
    const el = this.byId(inputId(field));
    return el.evaluate((e) => (e as HTMLInputElement).readOnly || e.hasAttribute('readonly') || (e as HTMLInputElement).disabled
      || e.getAttribute('aria-disabled') === 'true' || !!e.closest('.p-disabled')).catch(() => false);
  }

  /** Picks a select's option by its label. */
  async choose(select: SelectField, label: string): Promise<void> {
    await chooseSelectOption(this.page, this.byId(inputId(select as MemberFormField)), label);
  }

  async getOptions(select: SelectField): Promise<string[]> {
    return readSelectOptions(this.page, this.byId(inputId(select as MemberFormField)));
  }

  /** What a select shows now ("Select", the chosen label). */
  async readSelect(select: SelectField): Promise<string> {
    return (await this.byId(inputId(select as MemberFormField)).innerText().catch(() => '')).trim();
  }

  async isTicked(field: CheckField): Promise<boolean> {
    return this.byId(inputId(field)).isChecked();
  }

  async setTicked(field: CheckField, value: boolean): Promise<void> {
    await setCheckbox(this.byId(inputId(field)), value);
  }

  /** The text before the mobile box ("+966") - the dial code follows the nationality; there is no dial-code control. */
  async readMobilePrefix(): Promise<string> {
    return this.byId(MEMBER_FORM.nonNational.mobileNumber).evaluate((el) => {
      const field = el.closest('div');
      return (field?.parentElement?.innerText ?? '').replace(/\s+/g, ' ').trim();
    }).then((t) => (t.match(/\+\d{1,4}/) ?? [''])[0]).catch(() => '');
  }

  private async fill(info: object): Promise<void> {
    for (const [field, value] of Object.entries(info) as [MemberFormField, unknown][]) {
      if (value === undefined) continue;
      if (typeof value === 'boolean') await this.setTicked(field as CheckField, value);
      else if (SELECTS.includes(field)) await this.choose(field as SelectField, String(value));
      else await this.type(field as TextField, String(value));
    }
  }

  /** Step 1. Nationality is filled before Identity Type (it presets / limits it). */
  async fillPatient(info: MemberPatientInfo): Promise<void> {
    Logger.step(`Member wizard step 1: ${JSON.stringify(info)}`);
    await this.ensureStep(1);
    const { nationality, identityType, documentId, dateOfBirth, hijriDateOfBirth, ...rest } = info;
    await this.fill(rest);
    if (nationality !== undefined) await this.choose('nationality', nationality);
    if (identityType !== undefined) await this.choose('identityType', identityType);
    if (documentId !== undefined) await this.type('documentId', documentId);
    if (dateOfBirth !== undefined) {
      await this.type('dateOfBirth', dateOfBirth);
      await this.waitForHijri();
    }
    if (hijriDateOfBirth !== undefined) await this.type('hijriDateOfBirth', hijriDateOfBirth);
  }

  /** Waits until the Hijri box holds a value (ConvertToHijri answered). */
  async waitForHijri(): Promise<string> {
    await expect.poll(() => this.getValue('hijriDateOfBirth'), { timeout: Timeouts.short }).not.toBe('').catch(() => undefined);
    return this.getValue('hijriDateOfBirth');
  }

  async fillNonNational(info: MemberNonNationalInfo): Promise<void> {
    Logger.step(`Member wizard step 2: ${JSON.stringify(info)}`);
    await this.ensureStep(2);
    await this.fill(info);
  }

  /** Step 3. Country before City before District before Street (the cascade resets the later ones). */
  async fillAddress(info: MemberAddressInfo): Promise<void> {
    Logger.step(`Member wizard step 3: ${JSON.stringify(info)}`);
    await this.ensureStep(3);
    const { country, city, district, street, ...rest } = info;
    if (country !== undefined) await this.choose('country', country);
    if (city !== undefined) await this.choose('city', city);
    if (district !== undefined) await this.choose('district', district);
    if (street !== undefined) await this.choose('street', street);
    await this.fill(rest);
  }

  // ---- emergency contacts (step 4) ----------------------------------------------------------

  /** locator-exception: every contact block repeats the same ids; the n-th block's field is the n-th match. */
  private contactField(field: MemberContactField, index: number): Locator {
    return this.byId(MEMBER_FORM.contact[field]).nth(index);
  }

  async countContacts(): Promise<number> {
    return this.byId(MEMBER_FORM.contact.name).count();
  }

  /** "Add Contact" and fills the new block; returns its index. */
  async addContact(info: MemberContactInfo = {}): Promise<number> {
    await this.ensureStep(4);
    const index = await this.countContacts();
    await this.btn(MEMBER_FORM.contact.add).click();
    await expect(this.byId(MEMBER_FORM.contact.name)).toHaveCount(index + 1, { timeout: Timeouts.short });
    await this.editContact(index, info);
    return index;
  }

  /** Changes a contact block's fields. */
  async editContact(index: number, info: MemberContactInfo): Promise<void> {
    if (info.name !== undefined) await this.contactField('name', index).fill(info.name);
    if (info.relationship !== undefined) await chooseSelectOption(this.page, this.contactField('relationship', index), info.relationship);
    if (info.phoneNumber !== undefined) await this.contactField('phoneNumber', index).fill(info.phoneNumber);
  }

  async readContact(index: number): Promise<Required<MemberContactInfo>> {
    return {
      name: await this.contactField('name', index).inputValue().catch(() => ''),
      relationship: (await this.contactField('relationship', index).innerText().catch(() => '')).trim(),
      phoneNumber: await this.contactField('phoneNumber', index).inputValue().catch(() => ''),
    };
  }

  /** Remove on the n-th block. */
  async removeContact(index: number): Promise<void> {
    await this.page.locator(buttonSelector(MEMBER_FORM.contact.remove)).nth(index).click(); // locator-exception: every block's Remove shares the id.
  }

  /** The empty-state text ("No emergency contacts added yet.") or ''. */
  async getContactsEmptyText(): Promise<string> {
    const text = await this.getText();
    return text.includes('No emergency contacts added yet.') ? 'No emergency contacts added yet.' : '';
  }

  // ---- validation ---------------------------------------------------------------------------

  async getFieldError(field: MemberFormErrorField): Promise<string> {
    const own = (await this.byId(MEMBER_FORM.error[field]).innerText({ timeout: Timeouts.short }).catch(() => '')).trim();
    if (own !== '') return own;
    return this.readAsyncFieldError(field);
  }

  /**
   * The ASYNC uniqueness checks (CheckDocumentIdExists / CheckEmailExists on blur)
   * render their message in an id-LESS `<small class="pbm-field-error">` inside
   * the field's own box, not in the field's `-error` element (probe 2026-11-05:
   * "This document ID is already registered to another member." under the
   * Document ID while `#member-form-drawer-document-id-error` was absent).
   */
  private async readAsyncFieldError(field: MemberFormErrorField): Promise<string> {
    const inputs: Partial<Record<MemberFormErrorField, string>> = {
      documentId: MEMBER_FORM.patient.documentId,
      email: MEMBER_FORM.nonNational.email,
    } as Partial<Record<MemberFormErrorField, string>>;
    const inputId = inputs[field];
    if (!inputId) return '';
    // locator-exception: the async message has no id - it is read inside the field box that holds the input's own id
    const message = this.byId(inputId).locator('xpath=ancestor::div[contains(@class,"member-dialog__field")][1]').locator('small.pbm-field-error');
    return (await message.allInnerTexts().catch(() => [] as string[])).map((t) => t.trim()).filter((t) => t !== '').join(' ');
  }

  /** Every field error on screen now, by field. */
  async getFieldErrors(): Promise<Partial<Record<MemberFormErrorField, string>>> {
    const out: Partial<Record<MemberFormErrorField, string>> = {};
    for (const field of Object.keys(MEMBER_FORM.error) as MemberFormErrorField[]) {
      const error = this.byId(MEMBER_FORM.error[field]);
      if (await error.isVisible().catch(() => false)) out[field] = (await error.innerText()).trim();
    }
    return out;
  }

  /** Field errors (own ids, plus the contacts' id-less ones read from the text) and toasts, settled. */
  async getMessages(): Promise<string[]> {
    return WaitUtils.settleMessages(async () => {
      const own = await this.page.locator(`[id^="${MEMBER_FORM.root}-"][id$="-error"]`).filter({ visible: true }).allInnerTexts().catch(() => [] as string[]);
      const toast = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
      return [...own, ...toast].map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t !== '');
    });
  }

  // ---- buttons ----------------------------------------------------------------------------

  /** Next: moves on when the step is valid. Returns whether the step changed. */
  async next(): Promise<boolean> {
    const before = await this.currentStep();
    await this.btn(MEMBER_FORM.next).click();
    return expect.poll(() => this.currentStep(), { timeout: Timeouts.short }).not.toBe(before).then(() => true).catch(() => false);
  }

  /** Back (labelled "Cancel" on step 1 - use cancel() there). */
  async back(): Promise<void> {
    const before = await this.currentStep();
    await this.btn(MEMBER_FORM.back).click();
    await expect.poll(() => this.currentStep(), { timeout: Timeouts.short }).toBe((before - 1) as Step);
  }

  /** Clicks a stepper bullet (going forward validates the steps between). */
  async goToStep(step: Step): Promise<void> {
    await this.page.locator(`#${MEMBER_FORM.stepPrefix}${step}-bullet`).click();
  }

  async isSaveEnabled(): Promise<boolean> {
    return this.btn(MEMBER_FORM.save).isEnabled().catch(() => false);
  }

  /**
   * Clicks Save (moving to step 4 first) and reports what the save answered, the
   * body sent and the messages. -1 = refused client-side (the wizard jumps back
   * to the step with the error).
   */
  async attemptSave(): Promise<MemberSaveAnswer> {
    Logger.step('Member wizard: Save');
    await this.ensureStep(4);
    const sent = this.page.waitForRequest((r) => /\/(CreateMember|UpdateMember)$/.test(new URL(r.url()).pathname), { timeout: Timeouts.short }).catch(() => null);
    await this.btn(MEMBER_FORM.save).click();
    const request = await sent;
    const response = request ? await request.response().catch(() => null) : null;
    let body: Record<string, unknown> | null = null;
    try { body = request ? (request.postDataJSON() as Record<string, unknown>) : null; } catch { body = null; }
    return { status: response?.status() ?? -1, text: response ? await response.text().catch(() => '') : '', messages: await this.getMessages(), body };
  }

  /** Saves and asserts success and that the drawer closed. */
  async save(): Promise<MemberSaveAnswer> {
    const answer = await this.attemptSave();
    expect(answer.status, `the member save should succeed: ${answer.text.slice(0, 300)} ${answer.messages.join(' | ')}`).toBeGreaterThanOrEqual(200);
    expect(answer.status).toBeLessThan(300);
    await expect(this.byId(MEMBER_FORM.title), 'the wizard should close after saving').toBeHidden({ timeout: Timeouts.default });
    return answer;
  }

  /** The whole Add flow (steps 1-4 + Save); returns the save answer (not asserted). The new member's id is in `JSON.parse(text).payload.id`. */
  async create(patient: MemberPatientInfo, nonNational: MemberNonNationalInfo, address: MemberAddressInfo, contacts: MemberContactInfo[] = []): Promise<MemberSaveAnswer> {
    await this.fillPatient(patient);
    await this.next();
    await this.fillNonNational(nonNational);
    await this.next();
    await this.fillAddress(address);
    await this.next();
    for (const contact of contacts) await this.addContact(contact);
    return this.attemptSave();
  }

  /** The X; a dirty form raises "Unsaved Changes" - Discard Changes (default) or Keep Editing. */
  async close(discard = true): Promise<void> {
    await this.byId(MEMBER_FORM.close).click();
    const dialog = new ConfirmDialog(this.page);
    if (await dialog.isDiscardPromptVisible()) {
      if (discard) await dialog.discardChanges();
      else await dialog.keepEditing();
    }
    if (discard) await expect(this.byId(MEMBER_FORM.title)).toBeHidden({ timeout: Timeouts.default });
  }

  /** Whether closing now raises the "Unsaved Changes" prompt (left open for the case to answer). */
  async closeRaisesUnsavedPrompt(): Promise<boolean> {
    await this.byId(MEMBER_FORM.close).click();
    return new ConfirmDialog(this.page).isDiscardPromptVisible();
  }

  /** Step 1's Cancel; a dirty form raises the discard prompt. */
  async cancel(discard = true): Promise<void> {
    await this.ensureStep(1);
    await this.btn(MEMBER_FORM.back).click();
    const dialog = new ConfirmDialog(this.page);
    if (await dialog.isDiscardPromptVisible()) {
      if (discard) await dialog.discardChanges();
      else await dialog.keepEditing();
    }
  }

  /** The element id of a field - exported for field-list cases. */
  static idOf(field: MemberFormField): string {
    return inputId(field);
  }

  /** The step a field lives on. */
  static stepOf(field: MemberFormField): Step {
    return stepOf(field);
  }
}
