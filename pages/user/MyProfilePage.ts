import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { chooseSelectOption, readSelectOptions } from '../components/PrimeControls';
import { ChangePasswordDrawer } from './ChangePasswordDrawer';
import { toastMessages } from './userCommon';
import { AppRoutes } from '../../constants/AppRoutes';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import { MY_PROFILE, type MyProfileField, type MyProfileSection, type MyProfileValue } from '../../constants/user/userIds';
import { NetworkUtils } from '../../utils/NetworkUtils';

/** What one in-place Save answered (status -1 when nothing was sent) and what the field shows after. */
export interface ProfileFieldSave {
  status: number;
  text: string;
  body: Record<string, unknown>;
  shown: string;
  errors: string[];
  messages: string[];
}

/**
 * My Profile (`/my-profile`, header user menu > My Profile, verified
 * 2026-11-08 as the admin AND as a suite user). Header: initials, gender tag,
 * name (`my-profile-name`), user name (`-username` = document ID), an
 * Active toggle + label, Change Password (p-button). Summary strip:
 * Nationality, Document ID, Mobile Number, Age. Sections (Expand / collapse
 * all): Personal Information - First / Second / Last Name, الاسم الأول /
 * الثاني / اسم العائلة (editable in place, pencil -> `-input` + Save / Cancel
 * icon buttons), Gender, Nationality, Identity Type, Document ID, Date of
 * Birth, Hijri Date of Birth, Age (read-only `my-profile-{key}`); Contact
 * Information - Email Address (read-only), Mobile Number, Country Dial Code,
 * Preferred Language, Preferred Contact Method (editable); Roles & Status -
 * Roles (label only on 2026-11-08), Status, Last Login; Record Information -
 * Email Confirmed (Yes / No), Deactivated On (the account deactivation date).
 * NO Created At / By, Updated At / By on this page (AC of 20423).
 */
export class MyProfilePage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async open(): Promise<void> {
    await this.goto(AppRoutes.myProfile);
    await this.waitForLoaded();
  }

  async waitForLoaded(): Promise<void> {
    await expect(this.byId(MY_PROFILE.name), 'My Profile should load').toBeVisible({ timeout: Timeouts.default });
  }

  async isLoaded(): Promise<boolean> {
    return this.byId(MY_PROFILE.name).isVisible().catch(() => false);
  }

  async getText(): Promise<string> {
    return (await this.byId(MY_PROFILE.root).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  async readName(): Promise<string> {
    return (await this.byId(MY_PROFILE.name).innerText()).trim();
  }

  async readStatusLabel(): Promise<string> {
    return (await this.byId(MY_PROFILE.activeLabel).innerText().catch(() => '')).trim();
  }

  async expandAll(): Promise<void> {
    if (await this.byId(MY_PROFILE.value.email).isVisible().catch(() => false)) return;
    await this.byId(MY_PROFILE.collapseAll).click();
    await this.page.waitForTimeout(500);
  }

  async clickCollapseAll(): Promise<void> {
    await this.byId(MY_PROFILE.collapseAll).click();
    await this.page.waitForTimeout(500);
  }

  /** Whether a section shows its body (judged by one of its read-only values being visible - the headers carry no aria-expanded). */
  async isSectionExpanded(section: MyProfileSection): Promise<boolean> {
    const probe: Record<MyProfileSection, string> = {
      personal: MY_PROFILE.value.gender,
      contact: MY_PROFILE.value.email,
      rolesStatus: MY_PROFILE.value.status,
      record: MY_PROFILE.value.emailConfirmed,
    };
    return this.byId(probe[section]).isVisible().catch(() => false);
  }

  async toggleSection(section: MyProfileSection): Promise<void> {
    await this.byId(MY_PROFILE.section[section]).click();
    await this.page.waitForTimeout(400);
  }

  /** A read-only value (`my-profile-{key}`). */
  async readValue(key: MyProfileValue): Promise<string> {
    return (await this.byId(MY_PROFILE.value[key]).innerText().catch(() => '')).trim();
  }

  /** An editable field's shown value (`my-profile-field-{key}-value`). */
  async readField(field: MyProfileField): Promise<string> {
    return (await this.byId(`my-profile-field-${MY_PROFILE.field[field]}-value`).innerText().catch(() => '')).trim();
  }

  async readFieldLabel(field: MyProfileField): Promise<string> {
    return (await this.byId(`my-profile-field-${MY_PROFILE.field[field]}-label`).innerText().catch(() => '')).trim();
  }

  /** Whether a field offers its pencil (editable) - read-only values have none. */
  async hasEditButton(field: MyProfileField): Promise<boolean> {
    return this.byId(`my-profile-field-${MY_PROFILE.field[field]}-edit-button`).isVisible().catch(() => false);
  }

  /** Every pencil on the page (`my-profile-field-*-edit-button`) - which fields are editable. */
  async editableFieldKeys(): Promise<string[]> {
    return (await this.page.locator('[id^="my-profile-field-"][id$="-edit-button"]').evaluateAll((els) => els.map((e) => e.id)))
      .map((id) => id.replace('my-profile-field-', '').replace('-edit-button', ''));
  }

  /** Pencil -> edit mode (the input / select and Save / Cancel). */
  async startEdit(field: MyProfileField): Promise<void> {
    await this.expandAll();
    await this.byId(`my-profile-field-${MY_PROFILE.field[field]}-edit-button`).click();
    await this.page.waitForTimeout(300);
  }

  async isEditing(field: MyProfileField): Promise<boolean> {
    return this.byId(`my-profile-field-${MY_PROFILE.field[field]}-save-button`).isVisible().catch(() => false);
  }

  /** Types into the open text input (the four name fields, Mobile Number). */
  async typeField(field: MyProfileField, value: string): Promise<void> {
    await this.byId(`my-profile-field-${MY_PROFILE.field[field]}-input`).fill(value);
  }

  async readInput(field: MyProfileField): Promise<string> {
    return this.byId(`my-profile-field-${MY_PROFILE.field[field]}-input`).inputValue().catch(() => '');
  }

  /**
   * The open select's options (Country Dial Code, Preferred Language / Contact Method). In edit mode
   * a select field renders `my-profile-field-{key}-select`, not `-input` (probe 2026-11-08; the
   * full run's 20757 waited 15 s for an `-input` that never exists).
   */
  async getFieldOptions(field: MyProfileField): Promise<string[]> {
    return readSelectOptions(this.page, this.byId(`my-profile-field-${MY_PROFILE.field[field]}-select`));
  }

  async chooseField(field: MyProfileField, label: string): Promise<void> {
    await chooseSelectOption(this.page, this.byId(`my-profile-field-${MY_PROFILE.field[field]}-select`), label);
  }

  /** The field's visible errors (`small` inside the field block). */
  async getFieldErrors(field: MyProfileField): Promise<string[]> {
    return (await this.byId(`my-profile-field-${MY_PROFILE.field[field]}`).locator('small').allInnerTexts().catch(() => [] as string[])).map((t) => t.trim()).filter(Boolean);
  }

  /** Save (the field's tick) -> UpdateUserProfile's answer (status -1 = refused on screen) and the value shown after. */
  async saveField(field: MyProfileField): Promise<ProfileFieldSave> {
    const sent = this.page.waitForRequest((r) => r.url().includes(ApiEndpoints.manageUpdateProfile), { timeout: Timeouts.short }).catch(() => null);
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.manageUpdateProfile, () => this.byId(`my-profile-field-${MY_PROFILE.field[field]}-save-button`).click(), Timeouts.short).catch(() => null);
    const request = await sent;
    await this.page.waitForTimeout(500);
    return {
      status: request && answer ? answer.status : -1,
      text: answer?.text ?? '',
      body: (request?.postDataJSON() as Record<string, unknown> | null) ?? {},
      shown: await this.readField(field),
      errors: await this.getFieldErrors(field),
      messages: await toastMessages(this.page, 1_500),
    };
  }

  async cancelField(field: MyProfileField): Promise<void> {
    await this.byId(`my-profile-field-${MY_PROFILE.field[field]}-cancel-button`).click();
    await this.page.waitForTimeout(300);
  }

  /** Pencil, type, Save. */
  async editText(field: MyProfileField, value: string): Promise<ProfileFieldSave> {
    await this.startEdit(field);
    await this.typeField(field, value);
    return this.saveField(field);
  }

  /** The header's Change Password -> the drawer. */
  async openChangePassword(): Promise<ChangePasswordDrawer> {
    await this.btn(MY_PROFILE.changePasswordButton).click();
    const drawer = new ChangePasswordDrawer(this.page);
    await drawer.waitForOpen();
    return drawer;
  }
}
