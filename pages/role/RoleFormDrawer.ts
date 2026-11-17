import type { Locator, Page, Response } from '@playwright/test';
import { expect } from '@playwright/test';
import { ROLE_DIALOG, ROLE_FORM_IDS, ROLE_TOAST } from '../../constants/role/roleIds';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { buttonSelector, multiselectControl } from '../../constants/ElementIds';
import { Timeouts } from '../../constants/Timeouts';
import { Logger } from '../../utils/Logger';
import { answerMessage, type PermissionCatalogue } from '../../utils/role/roleApi';
import { PermissionTree } from './PermissionTree';

/**
 * The Add / Edit Role drawer `role-form-drawer` (title "Add New Role" / "Edit Role").
 *
 * Step 1 "Role Information": English + Arabic name (maxlength 100), "Allowed To Assign By" multiselect
 * (REQUIRED; options = every listed role incl. inactive and suite roles), English + Arabic description
 * (maxlength 250), checkboxes Is Active? (ticked by default), Has Assigned Payers?, Can a user approve their
 * own requests?; Cancel / Next. Next with empty required fields shows "This field is required." under each
 * (`-english-name-error`, `-arabic-name-error`, `-assignable-role-ids-error`) and stays on step 1 - no toast.
 * Step 2 "Privileges": banner with both names, the permission tree (PermissionTree), Back / Save. Save with
 * nothing ticked shows "Select at least one privilege." (no id) and sends nothing.
 *
 * Edit of a PREDEFINED role: every step-1 field disabled + `role-form-drawer-predefined-note`. Edit of a
 * suite role whose "Allowed To Assign By" is empty opens with the required error already shown and Next refused.
 *
 * Closing (X / Cancel) a dirty drawer raises the shared "Unsaved Changes" dialog (Keep Editing / Discard Changes).
 * The drawer animates closed - every close waits for the title to be HIDDEN.
 */

export type RoleFormField = 'englishName' | 'arabicName' | 'englishDescription' | 'arabicDescription' | 'allowedToAssignBy' | 'isActive' | 'hasAssignedPayers' | 'canApproveOwnRequests';

export interface RoleFormValues {
  nameEn?: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  /** Role NAMES as the multiselect lists them. Replaces the current choice when given. */
  allowedToAssignBy?: readonly string[];
  isActive?: boolean;
  hasAssignedPayers?: boolean;
  canApproveOwnRequests?: boolean;
}

export interface SaveOutcome {
  /** The CreateRole / UpdateRole answer (null when no request went out - client-side refusal). */
  status: number | null;
  /** successMessage or the validation reasons. */
  apiMessage: string;
  /** The new role id (CreateRole). */
  id: string;
  /** Toast summary + detail shown after the click ('' when none). */
  toast: string;
  /** Whether the drawer closed. */
  closed: boolean;
}

const FIELD_ID: Record<Exclude<RoleFormField, 'allowedToAssignBy'>, string> = {
  englishName: ROLE_FORM_IDS.englishName,
  arabicName: ROLE_FORM_IDS.arabicName,
  englishDescription: ROLE_FORM_IDS.englishDescription,
  arabicDescription: ROLE_FORM_IDS.arabicDescription,
  isActive: ROLE_FORM_IDS.isActive,
  hasAssignedPayers: ROLE_FORM_IDS.hasAssignedPayers,
  canApproveOwnRequests: ROLE_FORM_IDS.canApproveOwnRequests,
};

export class RoleFormDrawer {
  readonly tree: PermissionTree;

  constructor(private readonly page: Page, catalogue?: PermissionCatalogue) {
    this.tree = new PermissionTree(page, catalogue);
  }

  el(id: string): Locator {
    return this.page.locator(`#${id}`);
  }

  button(id: string): Locator {
    return this.page.locator(buttonSelector(id)).first();
  }

  titleLocator(): Locator {
    return this.el(ROLE_FORM_IDS.title);
  }

  async waitOpen(): Promise<string> {
    await expect(this.titleLocator(), 'the role drawer should open').toBeVisible({ timeout: Timeouts.default });
    return (await this.titleLocator().innerText()).trim();
  }

  async isOpen(): Promise<boolean> {
    return this.titleLocator().isVisible().catch(() => false);
  }

  async title(): Promise<string> {
    return (await this.titleLocator().innerText()).trim();
  }

  async waitClosed(): Promise<void> {
    await expect(this.titleLocator(), 'the role drawer should close').toBeHidden({ timeout: Timeouts.default });
  }

  /** 1 = Role Information, 2 = Privileges (by what is rendered). */
  async currentStep(): Promise<1 | 2> {
    if (await this.el(ROLE_FORM_IDS.permissionSearch).isVisible().catch(() => false)) return 2;
    return 1;
  }

  // ---- step 1 ------------------------------------------------------------------------------

  field(field: Exclude<RoleFormField, 'allowedToAssignBy'>): Locator {
    return this.el(FIELD_ID[field]);
  }

  /** The visible multiselect host of "Allowed To Assign By". */
  allowedToAssignByControl(): Locator {
    return this.page.locator(multiselectControl(ROLE_FORM_IDS.assignableRoles)).first();
  }

  async fill(values: RoleFormValues): Promise<void> {
    if (values.nameEn !== undefined) await this.field('englishName').fill(values.nameEn);
    if (values.nameAr !== undefined) await this.field('arabicName').fill(values.nameAr);
    if (values.descriptionEn !== undefined) await this.field('englishDescription').fill(values.descriptionEn);
    if (values.descriptionAr !== undefined) await this.field('arabicDescription').fill(values.descriptionAr);
    if (values.allowedToAssignBy !== undefined) await this.chooseAllowedToAssignBy(values.allowedToAssignBy);
    if (values.isActive !== undefined) await this.setCheckbox('isActive', values.isActive);
    if (values.hasAssignedPayers !== undefined) await this.setCheckbox('hasAssignedPayers', values.hasAssignedPayers);
    if (values.canApproveOwnRequests !== undefined) await this.setCheckbox('canApproveOwnRequests', values.canApproveOwnRequests);
  }

  /**
   * Sets a step-1 checkbox. Native click through the input (the edit drawer's inputs can sit outside the
   * scrolled viewport - a pointer click is refused there, 18298 / 2026-10-25).
   */
  async setCheckbox(field: 'isActive' | 'hasAssignedPayers' | 'canApproveOwnRequests', on: boolean): Promise<void> {
    const box = this.field(field);
    if ((await box.isChecked()) !== on) await box.evaluate((input) => (input as HTMLInputElement).click());
    await expect(box, `${field} should be ${on ? 'ticked' : 'cleared'}`).toBeChecked({ checked: on, timeout: Timeouts.default });
  }

  async isChecked(field: 'isActive' | 'hasAssignedPayers' | 'canApproveOwnRequests'): Promise<boolean> {
    return this.field(field).isChecked();
  }

  /** Opens the multiselect overlay and returns its option labels (closes it again). */
  async allowedToAssignByOptions(): Promise<string[]> {
    await this.openAllowedOverlay();
    const labels = (await this.page.getByRole('option').filter({ visible: true }).allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    await this.closeAllowedOverlay();
    return labels;
  }

  private async openAllowedOverlay(): Promise<void> {
    await this.allowedToAssignByControl().click();
    await expect(this.page.getByRole('option').filter({ visible: true }).first()).toBeVisible({ timeout: Timeouts.default });
  }

  /** Escape would close the whole drawer - the overlay is closed by clicking the drawer title. */
  private async closeAllowedOverlay(): Promise<void> {
    const open = this.page.getByRole('option').filter({ visible: true });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await this.titleLocator().click();
      if (await expect(open).toHaveCount(0, { timeout: Timeouts.short }).then(() => true, () => false)) return;
      // A title click that lands while the overlay is (re)positioning is swallowed - the host toggles it shut.
      await this.allowedToAssignByControl().click();
      if (await expect(open).toHaveCount(0, { timeout: Timeouts.short }).then(() => true, () => false)) return;
    }
    await expect(open, 'the Allowed To Assign By overlay should close').toHaveCount(0, { timeout: Timeouts.default });
  }

  /** Makes the multiselect hold EXACTLY `names`. */
  async chooseAllowedToAssignBy(names: readonly string[]): Promise<void> {
    Logger.step(`[roleForm] Allowed To Assign By = [${names.join(', ')}]`);
    await this.openAllowedOverlay();
    const options = this.page.getByRole('option').filter({ visible: true });
    // The pbm-multiselect overlay (build of 2026-11-14 21:30 UTC) can show its first option before the rest have
    // rendered (verify run: 22191 read no "Organization Administrator" although it is offered) - wait for the names.
    let offered: string[] = [];
    await expect
      .poll(async () => {
        offered = (await options.allInnerTexts()).map((t) => t.trim());
        return names.every((n) => offered.includes(n));
      }, { timeout: Timeouts.short, intervals: [150, 300, 500] })
      .toBe(true)
      .catch(() => undefined);
    const missing = names.filter((n) => !offered.includes(n));
    if (missing.length) {
      await this.closeAllowedOverlay();
      throw new Error(`Allowed To Assign By offers no option ${missing.map((m) => `"${m}"`).join(', ')}`);
    }
    const count = await options.count();
    for (let i = 0; i < count; i += 1) {
      const option = options.nth(i); // locator-exception: PrimeNG options carry render-order ids; walked by position inside the open overlay
      const label = (await option.innerText()).trim();
      const selected = (await option.getAttribute('aria-selected')) === 'true';
      if (selected !== names.includes(label)) await option.click();
    }
    await this.closeAllowedOverlay();
  }

  /** The names the multiselect shows as chosen ([] when it reads "Select"). */
  /**
   * Chosen role NAMES: one chip per value - PrimeNG `.p-chip-label`, or `.pbm-chip__label` on the custom
   * pbm-multiselect of the 2026-11-14 21:30 UTC build; [] when the placeholder "Select" shows.
   */
  async readAllowedToAssignBy(): Promise<string[]> {
    return this.allowedToAssignByControl().evaluate((host) =>
      Array.from(host.querySelectorAll('.p-chip-label, .pbm-chip__label')).map((e) => (e.textContent ?? '').trim()).filter(Boolean));
  }

  /** Chosen role IDS - the multiselect's hidden input value (comma-separated GUIDs). */
  async readAllowedToAssignByIds(): Promise<string[]> {
    const value = await this.el(ROLE_FORM_IDS.assignableRoles).inputValue();
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }

  async readValues(): Promise<Required<Omit<RoleFormValues, 'allowedToAssignBy'>> & { allowedToAssignBy: string[] }> {
    return {
      nameEn: await this.field('englishName').inputValue(),
      nameAr: await this.field('arabicName').inputValue(),
      descriptionEn: await this.field('englishDescription').inputValue(),
      descriptionAr: await this.field('arabicDescription').inputValue(),
      allowedToAssignBy: await this.readAllowedToAssignBy(),
      isActive: await this.isChecked('isActive'),
      hasAssignedPayers: await this.isChecked('hasAssignedPayers'),
      canApproveOwnRequests: await this.isChecked('canApproveOwnRequests'),
    };
  }

  /** Whether each step-1 field is disabled (predefined role edit). */
  async disabledFields(): Promise<Record<RoleFormField, boolean>> {
    const out = {} as Record<RoleFormField, boolean>;
    for (const f of Object.keys(FIELD_ID) as Exclude<RoleFormField, 'allowedToAssignBy'>[]) out[f] = await this.field(f).isDisabled();
    out.allowedToAssignBy = await this.el(ROLE_FORM_IDS.assignableRoles).isDisabled();
    return out;
  }

  /** The field's `<small>` error text ('' when none). */
  async fieldError(field: 'englishName' | 'arabicName' | 'allowedToAssignBy'): Promise<string> {
    const id = field === 'englishName' ? ROLE_FORM_IDS.englishNameError : field === 'arabicName' ? ROLE_FORM_IDS.arabicNameError : ROLE_FORM_IDS.assignableRolesError;
    const loc = this.el(id);
    return (await loc.isVisible().catch(() => false)) ? (await loc.innerText()).trim() : '';
  }

  predefinedNote(): Locator {
    return this.el(ROLE_FORM_IDS.predefinedNote);
  }

  /** Clicks Next; returns the step the drawer is on afterwards. */
  async next(): Promise<1 | 2> {
    await this.button(ROLE_FORM_IDS.nextButton).click();
    const reached = await this.el(ROLE_FORM_IDS.permissionSearch).waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true, () => false);
    if (reached) await this.tree.waitForLoaded();
    return reached ? 2 : 1;
  }

  /** Next, asserting the Privileges step opened. */
  async nextToPrivileges(): Promise<void> {
    const step = await this.next();
    if (step !== 2) {
      const errors = [await this.fieldError('englishName'), await this.fieldError('arabicName'), await this.fieldError('allowedToAssignBy')].filter(Boolean);
      throw new Error(`Next stayed on Role Information (${errors.join(' | ') || 'no field error shown'})`);
    }
  }

  async back(): Promise<void> {
    await this.button(ROLE_FORM_IDS.backButton).click();
    await expect(this.field('englishName')).toBeVisible({ timeout: Timeouts.default });
  }

  /** The step-2 banner: both names. */
  async banner(): Promise<string> {
    const box = this.el(ROLE_FORM_IDS.root);
    return box.locator('section').first().innerText().catch(() => ''); // the banner <section> has no id; scoped to the drawer
  }

  // ---- save / close ------------------------------------------------------------------------

  /**
   * Clicks Save and reports what happened: the CreateRole / UpdateRole answer (if a request went out), the
   * toast, and whether the drawer closed. Never asserts - the caller does.
   */
  async save(): Promise<SaveOutcome> {
    const before = await this.page.locator(`#${ROLE_TOAST.root}`).allInnerTexts().catch(() => [] as string[]);
    const isSave = (url: string): boolean => url.includes(ApiEndpoints.roleCreate) || url.includes(ApiEndpoints.roleUpdateIdentity);
    // A client-side refusal sends nothing: wait SHORT for the request, then long for its answer.
    const sent = this.page.waitForRequest((r) => isSave(r.url()) && r.method() !== 'GET', { timeout: Timeouts.short }).catch(() => null);
    const answer = this.page.waitForResponse((r) => isSave(r.url()) && r.request().method() !== 'GET', { timeout: Timeouts.navigation }).catch(() => null as Response | null);
    Logger.step('[roleForm] Save');
    await this.button(ROLE_FORM_IDS.saveButton).click();
    const res = (await sent) ? await answer : null;
    if (!res) {
      return { status: null, apiMessage: '', id: '', toast: '', closed: !(await this.isOpen()) };
    }
    let status: number | null = null;
    let apiMessage = '';
    let id = '';
    if (res) {
      status = res.status();
      const text = await res.text().catch(() => '');
      let reasons: string[] = [];
      try {
        const body = JSON.parse(text) as { ValidationErrors?: { Reason?: string }[]; payload?: { id?: string } };
        reasons = (body.ValidationErrors ?? []).map((v) => v.Reason ?? '').filter(Boolean);
        id = body.payload?.id ?? '';
      } catch {
        /* non-JSON */
      }
      apiMessage = answerMessage({ status, text, validationErrors: reasons });
    }
    const toast = await this.newToast(before);
    const closed = await this.titleLocator().waitFor({ state: 'hidden', timeout: status !== null && status < 300 ? Timeouts.default : Timeouts.short }).then(() => true, () => false);
    return { status, apiMessage, id, toast, closed };
  }

  /** Save, asserting the role was created / updated and the drawer closed. */
  async saveExpectingSuccess(): Promise<SaveOutcome> {
    const out = await this.save();
    expect(out.status, `the role save should be accepted (${out.apiMessage})`).not.toBeNull();
    expect(out.status as number, `the role save should be accepted (${out.apiMessage})`).toBeLessThan(300);
    expect(out.closed, 'the drawer should close after a successful save').toBe(true);
    return out;
  }

  /** The first toast text that was not on screen before (summary + detail, whitespace collapsed). */
  private async newToast(before: string[]): Promise<string> {
    const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();
    const seen = new Set(before.map(norm));
    let found = '';
    await expect
      .poll(async () => {
        const now = (await this.page.locator(`#${ROLE_TOAST.root}`).allInnerTexts().catch(() => [] as string[])).map(norm);
        found = now.find((t) => !seen.has(t)) ?? '';
        return found;
      }, { timeout: Timeouts.toast })
      .not.toBe('')
      .catch(() => undefined);
    return found;
  }

  /**
   * Closes with X (or Cancel). Returns the close-guard text when "Unsaved Changes" appeared ('' when the drawer
   * just closed); `answer` = discard (default) or stay.
   */
  async close(how: 'x' | 'cancel' = 'x', answer: 'discard' | 'stay' = 'discard'): Promise<string> {
    await (how === 'x' ? this.el(ROLE_FORM_IDS.close) : this.button(ROLE_FORM_IDS.cancelButton)).click();
    const guard = this.page.locator(`#${ROLE_DIALOG.root}`);
    const shown = await guard.waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true, () => false);
    if (!shown) {
      await this.waitClosed();
      return '';
    }
    const text = (await guard.innerText()).replace(/\s+/g, ' ').trim();
    await this.page.locator(buttonSelector(answer === 'discard' ? ROLE_DIALOG.discard : ROLE_DIALOG.stay)).first().click();
    await expect(guard).toBeHidden({ timeout: Timeouts.default });
    if (answer === 'discard') await this.waitClosed();
    return text;
  }
}
