import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { chooseSelectOption, readSelectOptions, setCheckbox } from '../components/PrimeControls';
import { clickDialogAction, fieldErrors, readDialog, toastMessages } from './userCommon';
import { Timeouts } from '../../constants/Timeouts';
import { DIALOG } from '../../constants/ElementIds';
import { USER_FORM, type UserFormErrorField, type UserFormInput, type UserFormSelect } from '../../constants/user/userIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { Logger } from '../../utils/Logger';

/** What a Save from the drawer answered (status -1: refused on screen, nothing sent). */
export interface UserSaveAnswer {
  status: number;
  text: string;
  /** The request body sent (CreateUser / UpdateUser), `{}` when nothing was sent. */
  body: Record<string, unknown>;
  messages: string[];
  errors: string[];
}

/** Step 1 values (labels for selects; dates `DD/MM/YYYY`). */
export interface UserInfoValues {
  englishFirstName?: string;
  englishSecondName?: string;
  englishLastName?: string;
  arabicFirstName?: string;
  arabicSecondName?: string;
  arabicLastName?: string;
  dob?: string;
  hijriDob?: string;
  gender?: string;
  accountDeactivationDate?: string;
  /** Chosen BEFORE the identity type (Saudi presets National ID and offers only it). */
  nationality?: string;
  identityType?: string;
  documentId?: string;
  isActive?: boolean;
}

/** Step 2 values. */
export interface ContactValues {
  phoneNumber?: string;
  email?: string;
  preferredContactMethod?: string;
  preferredLanguage?: string;
}

/**
 * The Add / Edit / Assign Roles & Payers drawer (`user-form-drawer`, verified
 * 2026-11-08). Step 1 User Information: First / Second / Last Name (English
 * letters only, "English letters only."), الاسم الأول / الثاني / اسم العائلة
 * (Arabic letters only), Date of Birth (picker, typed `DD/MM/YYYY` + Enter; fills
 * the Hijri date; age outside 15-120 leaves it EMPTY -> "This field is
 * required."), Hijri Date of Birth (typing one fills the Gregorian date),
 * Gender (Other / Male / Female), Account Deactivation Date (picker), Nationality
 * (Saudi -> Identity Type National ID only; other -> Iqama / Passport / GCC ID),
 * Document ID (format on blur: "Must be 10 digits starting with 1 (Saudi
 * National ID)." ...; taken -> "This document ID is already registered to
 * another user."), Is Active (unticked by default; hint text below it). Step 2
 * Contact Information: Mobile Number (after a "+966" prefix; "Enter 9 digits
 * starting with 5 (e.g. 5XXXXXXXX)."), Email ("Enter a valid email address."),
 * Preferred Contact Method (Email / SMS / Both), Preferred Language (Arabic /
 * English). Step 3 Roles and Privileges: "No roles assigned yet. Use “Add New
 * User Roles” to assign one.", Add New User Roles -> a card (Role select, Delete
 * Role; a payer-scoped role adds "Assign Payers" -> the two-list picker); Save
 * without a role -> "Add at least one role."; a payer role without payers ->
 * "Select at least one payer for this role.". Closing a dirty drawer ->
 * `#pbm-dialog` Unsaved Changes (Keep Editing / Discard Changes).
 * NO maxlength on any text box (51+ characters can be typed).
 */
export class UserFormDrawer extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private root(): Locator {
    return this.byId(USER_FORM.root);
  }

  async waitForOpen(): Promise<void> {
    await expect(this.byId(USER_FORM.close), 'the user drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  async isOpen(): Promise<boolean> {
    return this.byId(USER_FORM.close).isVisible().catch(() => false);
  }

  /** Waits for the drawer to finish closing (it slides out after a Save / Discard); true when it is gone. */
  async waitForClosed(timeout: number = Timeouts.short): Promise<boolean> {
    return this.byId(USER_FORM.close).waitFor({ state: 'hidden', timeout }).then(() => true).catch(() => false);
  }

  /** Edit: waits until GetUser filled the first name. */
  async waitForLoadedValues(): Promise<void> {
    await expect.poll(async () => this.getValue('englishFirstName'), { timeout: Timeouts.default, message: 'the Edit drawer should load the user' }).not.toBe('');
  }

  /** "Add New User" / "Edit User" (the drawer's first text line - the header has no id). */
  async getTitle(): Promise<string> {
    return ((await this.root().innerText().catch(() => '')).split('\n')[0] ?? '').trim();
  }

  async getText(): Promise<string> {
    return (await this.root().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** The stepper labels in order. */
  async getStepLabels(): Promise<string[]> {
    const labels: string[] = [];
    for (let n = 1; n <= 3; n += 1) labels.push((await this.byId(`${USER_FORM.stepPrefix}${n}-label`).innerText().catch(() => '')).trim());
    return labels.filter(Boolean);
  }

  /** The step showing (1-3), from which step's fields are visible. */
  async currentStep(): Promise<number> {
    if (await this.byId(USER_FORM.input.englishFirstName).isVisible().catch(() => false)) return 1;
    if (await this.byId(USER_FORM.input.phoneNumber).isVisible().catch(() => false)) return 2;
    if (await this.byId(USER_FORM.addRoleButton).isVisible().catch(() => false)) return 3;
    return 0;
  }

  /** The footer buttons shown ("Cancel"/"Back", "Next"/"Save"). */
  async getFooterLabels(): Promise<string[]> {
    const out: string[] = [];
    for (const id of [USER_FORM.backButton, USER_FORM.nextButton, USER_FORM.saveButton]) {
      if (await this.byId(id).isVisible().catch(() => false)) out.push((await this.byId(id).innerText()).trim());
    }
    return out;
  }

  // ---- fields -----------------------------------------------------------------------------

  /** Types into a text field with real key presses; the two date pickers are committed with Enter, the rest blurred. '' clears. */
  async type(field: UserFormInput, value: string): Promise<void> {
    const input = this.byId(USER_FORM.input[field]);
    await input.click();
    await input.press('ControlOrMeta+a');
    if (value === '') await input.press('Delete');
    else await input.pressSequentially(value);
    if (field === 'dob' || field === 'accountDeactivationDate') await input.press('Enter');
    else await input.blur();
    await this.page.waitForTimeout(300);
  }

  async getValue(field: UserFormInput): Promise<string> {
    return this.byId(USER_FORM.input[field]).inputValue().catch(() => '');
  }

  async getMaxLength(field: UserFormInput): Promise<number | null> {
    const raw = await this.byId(USER_FORM.input[field]).getAttribute('maxlength');
    return raw === null ? null : Number(raw);
  }

  async getPlaceholder(field: UserFormInput): Promise<string> {
    return (await this.byId(USER_FORM.input[field]).getAttribute('placeholder')) ?? '';
  }

  async isDisabled(field: UserFormInput): Promise<boolean> {
    return this.byId(USER_FORM.input[field]).isDisabled().catch(() => false);
  }

  async choose(select: UserFormSelect, label: string): Promise<void> {
    await chooseSelectOption(this.page, this.byId(USER_FORM.select[select]), label);
  }

  async getOptions(select: UserFormSelect): Promise<string[]> {
    return readSelectOptions(this.page, this.byId(USER_FORM.select[select]));
  }

  async readSelect(select: UserFormSelect): Promise<string> {
    return (await this.byId(USER_FORM.select[select]).innerText().catch(() => '')).trim();
  }

  async isActiveTicked(): Promise<boolean> {
    return this.byId(USER_FORM.isActive).isChecked();
  }

  async setActive(value: boolean): Promise<void> {
    await setCheckbox(this.byId(USER_FORM.isActive), value);
  }

  /** The dial-code prefix shown before the mobile box ("+966"), read from step 2's text (the prefix has no id). */
  async readMobilePrefix(): Promise<string> {
    const text = await this.root().innerText().catch(() => '');
    return (text.match(new RegExp('Mobile Number[^+]*?([+][0-9]{1,4})')) ?? [])[1] ?? '';
  }

  /** Fills step 1 (nationality BEFORE identity type; waits for the Hijri date after the Date of Birth). */
  async fillUserInfo(v: UserInfoValues): Promise<void> {
    const { nationality, identityType, documentId, dob, hijriDob, gender, accountDeactivationDate, isActive, ...names } = v;
    for (const [field, value] of Object.entries(names) as [UserFormInput, string][]) if (value !== undefined) await this.type(field, value);
    if (dob !== undefined) {
      await this.type('dob', dob);
      if (dob !== '') await expect.poll(async () => this.getValue('hijriDob'), { timeout: Timeouts.default }).not.toBe('').catch(() => undefined);
    }
    if (hijriDob !== undefined) await this.type('hijriDob', hijriDob);
    if (gender !== undefined) await this.choose('gender', gender);
    if (accountDeactivationDate !== undefined) await this.type('accountDeactivationDate', accountDeactivationDate);
    if (nationality !== undefined) await this.choose('nationality', nationality);
    if (identityType !== undefined) await this.choose('identityType', identityType);
    if (documentId !== undefined) {
      await this.type('documentId', documentId);
      await this.page.waitForTimeout(800); // the on-blur CheckDocumentIdExists
    }
    if (isActive !== undefined) await this.setActive(isActive);
  }

  async fillContact(v: ContactValues): Promise<void> {
    if (v.phoneNumber !== undefined) await this.type('phoneNumber', v.phoneNumber);
    if (v.email !== undefined) await this.type('email', v.email);
    if (v.preferredContactMethod !== undefined) await this.choose('preferredContactMethod', v.preferredContactMethod);
    if (v.preferredLanguage !== undefined) await this.choose('preferredLanguage', v.preferredLanguage);
  }

  // ---- errors / hints ---------------------------------------------------------------------

  async getFieldError(field: UserFormErrorField): Promise<string> {
    const el = this.byId(USER_FORM.error[field]);
    if (await el.isVisible().catch(() => false)) return (await el.innerText()).trim();
    // The ASYNC document-ID check ("This document ID is already registered to another user.")
    // renders a `<small class="pbm-field-error">` WITH NO ID inside the field's block (probe
    // 2026-11-08, 20526 / 20593) - read the id-less error of the field's own block.
    const control = field in USER_FORM.input ? USER_FORM.input[field as UserFormInput] : USER_FORM.select[field as UserFormSelect];
    // locator-exception: the async field error has no id; it is reached from the field's control (id) up to its block.
    const loose = this.byId(control).locator('xpath=ancestor::div[contains(@class,"user-dialog__field")][1]//small[contains(@class,"pbm-field-error") and not(@id)]').first();
    return (await loose.isVisible().catch(() => false)) ? (await loose.innerText()).replace(/\s+/g, ' ').trim() : '';
  }

  /** Every field error shown in the drawer (the id-less async one included - see getFieldError). */
  async getFieldErrors(): Promise<string[]> {
    // locator-exception: the async document-ID error is a `small.pbm-field-error` with no id.
    const loose = (await this.root().locator('small.pbm-field-error:not([id])').filter({ visible: true }).allInnerTexts().catch(() => [] as string[]))
      .map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
    return [...(await fieldErrors(this.page, `${USER_FORM.root}-`)), ...loose];
  }

  /** Every message the drawer shows outside the field errors (roles step texts, hints). */
  async getDrawerMessages(): Promise<string[]> {
    return (await this.root().locator('small, p').allInnerTexts().catch(() => [] as string[])).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }

  // ---- navigation -------------------------------------------------------------------------

  /** Next; true when the step changed. */
  async next(): Promise<boolean> {
    const before = await this.currentStep();
    await this.btn(USER_FORM.nextButton).click();
    await this.page.waitForTimeout(600);
    return (await this.currentStep()) !== before;
  }

  async back(): Promise<void> {
    await this.btn(USER_FORM.backButton).click();
    await this.page.waitForTimeout(400);
  }

  /** Clicks a stepper bullet (1-3). */
  async goToStep(n: number): Promise<void> {
    await this.byId(`${USER_FORM.stepPrefix}${n}-bullet`).click();
    await this.page.waitForTimeout(500);
  }

  /** Moves forward with Next until step `n` (or until Next refuses). */
  async ensureStep(n: number): Promise<number> {
    for (let i = 0; i < 3 && (await this.currentStep()) < n; i += 1) if (!(await this.next())) break;
    return this.currentStep();
  }

  // ---- roles ----------------------------------------------------------------------------

  async getRolesEmptyText(): Promise<string> {
    const text = await this.getText();
    const m = text.match(/No roles assigned yet\.[^.]*\./);
    return m ? m[0] : '';
  }

  /** The role cards' selects (a NEW card: `user-form-drawer-role-select`; a chosen one: `-role-row-{roleId}-role-select`). */
  private roleSelects(): Locator {
    return this.page.locator(`[id="${USER_FORM.roleSelect}"], [id^="${USER_FORM.roleRowPrefix}"][id$="-role-select"]`);
  }

  async countRoleCards(): Promise<number> {
    return this.page.locator(`[id^="${USER_FORM.roleRowPrefix}"][id$="-remove-button"]`).count();
  }

  /** The roles chosen on the cards, in order. */
  async readRoles(): Promise<string[]> {
    return (await this.roleSelects().allInnerTexts()).map((t) => t.trim());
  }

  /** "Add New User Roles" -> a new empty card. */
  async addRoleCard(): Promise<void> {
    await this.btn(USER_FORM.addRoleButton).click();
    await this.page.waitForTimeout(400);
  }

  /** The Role options of the LAST card (only active roles the administrator may assign). */
  async getRoleOptions(): Promise<string[]> {
    return readSelectOptions(this.page, this.roleSelects().last());
  }

  /** Picks `roleName` on the `index`-th card (default the last). */
  async chooseRole(roleName: string, index?: number): Promise<void> {
    const select = index === undefined ? this.roleSelects().last() : this.roleSelects().nth(index); // locator-exception: role cards share one id until a role is chosen; reached by position.
    await chooseSelectOption(this.page, select, roleName);
  }

  /** Adds a card and picks a role. */
  async addRole(roleName: string): Promise<void> {
    await this.addRoleCard();
    await this.chooseRole(roleName);
  }

  /** "Delete Role" of the card holding `roleId` (or `idx-{n}` for a card with no role yet). */
  async removeRole(roleIdOrIndexKey: string): Promise<void> {
    await this.byId(`${USER_FORM.roleRowPrefix}${roleIdOrIndexKey}-remove-button`).click();
    await this.page.waitForTimeout(400);
  }

  /** Whether the card of `roleId` offers "Assign Payers" (only payer-scoped roles do). */
  async isAssignPayersOffered(roleId: string): Promise<boolean> {
    return this.byId(`${USER_FORM.roleRowPrefix}${roleId}-assign-payers-link`).isVisible().catch(() => false);
  }

  /**
   * The whole text of the role card holding `roleId` (role name, "Payers" with its chips or
   * "No payers assigned yet.", Assign Payers, Delete Role), reached from the card's own Delete
   * Role button (id) up to its `<section class="user-dialog__role-card">`. Until 2026-11-08 this
   * read the closest <div> of the Assign Payers link - the footer row only ("Assign Payers
   * Delete Role"), never the chips above it (20508, 20516-20518).
   */
  async readRoleCardText(roleId: string): Promise<string> {
    // locator-exception: the role card <section> has no id; it is the ancestor of the card's Delete Role button (id).
    return this.byId(`${USER_FORM.roleRowPrefix}${roleId}-remove-button`).evaluate((el) => (el.closest('section') ?? el).textContent ?? '')
      .then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
  }

  /**
   * The card's Payer field (live 2026-11-08): a payer-scoped role's card shows a "Payers" label
   * marked required (`user-dialog__label--required`, the red asterisk) above its chips
   * (`{row}{roleId}-payer-chips-chip-{payerId}`), or "No payers assigned yet." when it has none;
   * a plain role's card has no Payers field at all.
   */
  async readPayerField(roleId: string): Promise<{ shown: boolean; required: boolean; chips: string[]; emptyText: string }> {
    // locator-exception: the card <section>, its "Payers" <label> and the empty-state <span> carry no id; reached from the card's Delete Role button (id).
    const field = await this.byId(`${USER_FORM.roleRowPrefix}${roleId}-remove-button`).evaluate((el) => {
      const card = el.closest('section');
      const label = Array.from(card?.querySelectorAll('label') ?? []).find((l) => /^\s*Payers\s*$/.test(l.textContent ?? ''));
      const empty = card?.querySelector('.user-dialog__chips-empty');
      return { shown: !!label, required: !!label?.classList.contains('user-dialog__label--required'), emptyText: (empty?.textContent ?? '').replace(/\s+/g, ' ').trim() };
    }).catch(() => ({ shown: false, required: false, emptyText: '' }));
    const chips = (await this.page.locator(`[id^="${USER_FORM.roleRowPrefix}${roleId}-payer-chips-chip-"]:not([id$="-remove"])`).allInnerTexts().catch(() => [] as string[]))
      .map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
    return { ...field, chips };
  }

  /** Opens the Assign Payers picker of `roleId`'s card. */
  async openAssignPayers(roleId: string): Promise<void> {
    await this.byId(`${USER_FORM.roleRowPrefix}${roleId}-assign-payers-link`).click();
    await expect(this.byId(`${USER_FORM.root}-assign-payers-picklist`)).toBeVisible({ timeout: Timeouts.default });
  }

  private picklist(side: 'source' | 'target'): string {
    return `${USER_FORM.root}-assign-payers-picklist-${side}`;
  }

  /** The payer names on one side of the picker (Available = source, Selected = target). */
  async readPickerPayers(side: 'source' | 'target'): Promise<string[]> {
    return (await this.page.locator(`li[id^="${this.picklist(side)}-item-"]`).allInnerTexts()).map((t) => t.trim());
  }

  /** Types into a side's search box. */
  async searchPicker(side: 'source' | 'target', term: string): Promise<void> {
    await this.byId(`${this.picklist(side)}-search-input`).fill(term);
    await this.page.waitForTimeout(400);
  }

  /** Selects payers (by name) on the Available side and moves them to Selected. */
  async movePayers(names: readonly string[]): Promise<void> {
    for (const name of names) {
      await this.searchPicker('source', name);
      const item = this.page.locator(`li[id^="${this.picklist('source')}-item-"]`).filter({ hasText: new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) }).first();
      await item.click();
      await this.byId(`${USER_FORM.root}-assign-payers-picklist-move-selected-to-target`).click();
    }
    await this.searchPicker('source', '');
  }

  /** Picker Save / Cancel. */
  async closePicker(save: boolean): Promise<void> {
    await this.btn(save ? USER_FORM.assignSave : USER_FORM.assignCancel).click();
    await this.page.waitForTimeout(400);
  }

  /** Opens the picker of `roleId`, moves `payers`, saves. */
  async assignPayers(roleId: string, payers: readonly string[]): Promise<void> {
    await this.openAssignPayers(roleId);
    await this.movePayers(payers);
    await this.closePicker(true);
  }

  /** The role id of the card at `index` (from its remove-button id; `idx-n` when no role yet). */
  async roleIdAt(index: number): Promise<string> {
    const ids = await this.page.locator(`[id^="${USER_FORM.roleRowPrefix}"][id$="-remove-button"]`).evaluateAll((els) => els.map((e) => e.id));
    return (ids[index] ?? '').replace(USER_FORM.roleRowPrefix, '').replace(/-remove-button$/, '');
  }

  // ---- record info (Edit) ----------------------------------------------------------------

  async readRecordInfo(): Promise<{ createdBy: string; createdOn: string; modifiedBy: string; modifiedOn: string }> {
    const v = async (id: string): Promise<string> => this.byId(id).inputValue().catch(() => '');
    return {
      createdBy: await v(USER_FORM.recordInfo.createdBy),
      createdOn: await v(USER_FORM.recordInfo.createdOn),
      modifiedBy: await v(USER_FORM.recordInfo.modifiedBy),
      modifiedOn: await v(USER_FORM.recordInfo.modifiedOn),
    };
  }

  // ---- save / close ------------------------------------------------------------------------

  /** Save (step 3) -> CreateUser / UpdateUser answer, the body sent, the toasts and the errors left on screen. */
  async attemptSave(): Promise<UserSaveAnswer> {
    const sent = this.page.waitForRequest((r) => /\/(CreateUser|UpdateUser)$/.test(r.url()), { timeout: Timeouts.short }).catch(() => null);
    const answer = await NetworkUtils.captureResponse(this.page, '/identity/Users/', async () => {
      await this.btn(USER_FORM.saveButton).click();
    }, Timeouts.default).catch(() => null);
    const request = await sent;
    const wrote = !!request && !!answer && /(CreateUser|UpdateUser)/.test(request.url());
    return {
      status: wrote ? answer.status : -1,
      text: wrote ? answer.text : '',
      body: wrote ? ((request.postDataJSON() as Record<string, unknown>) ?? {}) : {},
      messages: await toastMessages(this.page),
      errors: [...(await this.getFieldErrors()), ...(await this.getDrawerMessages()).filter((m) => /Add at least one role|Select at least one payer/.test(m))],
    };
  }

  /** Save, asserting a 2xx answer. */
  async save(): Promise<UserSaveAnswer> {
    const a = await this.attemptSave();
    expect(a.status, `saving the user should succeed: ${a.text.slice(0, 300)} ${a.messages.join(' | ')} ${a.errors.join(' | ')}`).toBeGreaterThanOrEqual(200);
    expect(a.status).toBeLessThan(300);
    return a;
  }

  /** Closes with the X; returns the Unsaved Changes dialog when one appeared (left open). */
  async close(): Promise<{ title: string; message: string; actions: string[] } | null> {
    await this.byId(USER_FORM.close).click();
    await this.page.waitForTimeout(500);
    const d = await readDialog(this.page);
    return d.visible ? { title: d.title, message: d.message, actions: d.actions } : null;
  }

  /** Step 1 Cancel (the back button); returns the Unsaved Changes dialog when one appeared. */
  async cancel(): Promise<{ title: string; message: string; actions: string[] } | null> {
    await this.btn(USER_FORM.backButton).click();
    await this.page.waitForTimeout(500);
    const d = await readDialog(this.page);
    return d.visible ? { title: d.title, message: d.message, actions: d.actions } : null;
  }

  /** Keep Editing, then waits out the dialog's closing animation (read straight after the click it still reported visible: 20543, 20605). */
  async keepEditing(): Promise<void> {
    await clickDialogAction(this.page, 'stay');
    await this.byId(DIALOG.root).waitFor({ state: 'hidden', timeout: Timeouts.short }).catch(() => undefined);
  }

  async discardChanges(): Promise<void> {
    await clickDialogAction(this.page, 'discard');
    Logger.step('Discarded the user drawer');
  }
}

