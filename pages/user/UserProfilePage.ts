import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { UserFormDrawer } from './UserFormDrawer';
import { toastMessages } from './userCommon';
import { AppRoutes } from '../../constants/AppRoutes';
import { Timeouts } from '../../constants/Timeouts';
import { USER_PROFILE, type UserProfileSection } from '../../constants/user/userIds';
import { readUserOrNull, type UserRecord } from '../../utils/UserProvisioning';

/**
 * The User Profile page (`/users-management/users-administration/profile/{id}`,
 * row View; verified 2026-11-08). Breadcrumb "Users Administration > User
 * Profile" with Edit Profile (opens the Edit drawer on step 1). Header card:
 * initials, gender tag, name, user name (document ID), status; summary strip
 * Nationality / Document ID / Mobile Number / Age ("36 years, 5 months, 24
 * days"). Sections (collapsed except Personal; Expand / collapse all):
 * Personal Information (First Name = the FULL English name, الاسم الأول = the
 * full Arabic name, Gender, Nationality, Identity Type, Document ID, Date of
 * Birth DD/MM/YYYY, Hijri Date of Birth, Age), Contact Information (Email
 * Address, Mobile Number, Preferred Language, Preferred Contact Method), Roles
 * & Status (Roles, Status, Last Login), Record Information (Created On,
 * Created By, Modified On, Modified By). VALUES CARRY NO IDS: read a section's
 * label -> value pairs (`readSection`). NO Change Password button here.
 * An unknown id renders an empty page (no message) on 2026-11-08.
 */
export class UserProfilePage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async open(id: string): Promise<void> {
    await this.goto(`${AppRoutes.usersAdministration}/profile/${id}`);
    await this.waitForLoaded();
  }

  /** Opens without asserting it loads (deleted / foreign ids). */
  async openExpectingFailure(id: string): Promise<{ url: string; loaded: boolean; messages: string[] }> {
    await this.goto(`${AppRoutes.usersAdministration}/profile/${id}`);
    const loaded = await this.byId(USER_PROFILE.section.personal).waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true).catch(() => false);
    return { url: this.page.url(), loaded, messages: await toastMessages(this.page) };
  }

  async waitForLoaded(): Promise<void> {
    await expect(this.byId(USER_PROFILE.section.personal), 'the user profile should load').toBeVisible({ timeout: Timeouts.default });
  }

  async isLoaded(): Promise<boolean> {
    return this.byId(USER_PROFILE.section.personal).isVisible().catch(() => false);
  }

  /** The id in the URL. */
  idFromUrl(): string {
    return (this.page.url().match(/\/profile\/([0-9a-f-]{36})/i) ?? [])[1] ?? '';
  }

  /** The whole outlet text (header card + strip + open sections). */
  async getPageText(): Promise<string> {
    return (await this.page.locator('#app-layout-outlet').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** The header card + summary strip: the lines above "Personal Information". */
  async readHeader(): Promise<string[]> {
    const lines = (await this.page.locator('#app-layout-outlet').innerText().catch(() => '')).split('\n').map((l) => l.trim()).filter(Boolean);
    const end = lines.indexOf('Personal Information');
    return end > 0 ? lines.slice(0, end) : lines;
  }

  /** The summary strip as label -> value (Nationality, Document ID, Mobile Number, Age). */
  async readSummary(): Promise<Record<string, string>> {
    const header = await this.readHeader();
    const out: Record<string, string> = {};
    for (const label of ['Nationality', 'Document ID', 'Mobile Number', 'Age']) {
      const i = header.indexOf(label);
      if (i >= 0 && i + 1 < header.length) out[label] = header[i + 1];
    }
    return out;
  }

  async sectionLabels(): Promise<string[]> {
    const out: string[] = [];
    for (const id of Object.values(USER_PROFILE.section)) out.push((await this.byId(id).innerText().catch(() => '')).trim());
    return out;
  }

  async expandAll(): Promise<void> {
    await this.byId(USER_PROFILE.collapseAll).click();
    await this.page.waitForTimeout(500);
  }

  /** Whether a section shows its body (no aria-expanded on the header buttons). */
  async isExpanded(section: UserProfileSection): Promise<boolean> {
    return (await this.sectionBody(section)).length > 0;
  }

  async toggleSection(section: UserProfileSection): Promise<void> {
    await this.byId(USER_PROFILE.section[section]).click();
    await this.page.waitForTimeout(400);
  }

  /** The section's text below its header (the header button sits inside the section card). */
  private async sectionBody(section: UserProfileSection): Promise<string[]> {
    const button = this.byId(USER_PROFILE.section[section]);
    const text = await button.evaluate((el) => (el.parentElement as HTMLElement | null)?.innerText ?? '');
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    return lines.slice(1);
  }

  /**
   * A section's label -> value pairs (opens it when its body is empty). The
   * header button sits inside a `section` card; the body alternates label / value.
   * The buttons carry no aria-expanded (2026-11-08) - "open" = the body has text.
   */
  async readSection(section: UserProfileSection): Promise<Record<string, string>> {
    if ((await this.sectionBody(section)).length === 0) await this.toggleSection(section);
    const lines = await this.sectionBody(section);
    const out: Record<string, string> = {};
    for (let i = 0; i + 1 < lines.length; i += 2) out[lines[i]] = lines[i + 1];
    return out;
  }

  /** Edit Profile -> the Edit drawer (loaded). */
  async openEdit(): Promise<UserFormDrawer> {
    await this.btn(USER_PROFILE.editButton).click();
    const drawer = new UserFormDrawer(this.page);
    await drawer.waitForOpen();
    await drawer.waitForLoadedValues();
    return drawer;
  }

  async isEditOffered(): Promise<boolean> {
    return this.byId(USER_PROFILE.editButton).isVisible().catch(() => false);
  }

  /** Whether any Change Password control is on the page (none on 2026-11-08). */
  async isChangePasswordOffered(): Promise<boolean> {
    return (await this.page.locator('#app-layout-outlet [id*="change-password"]').count()) > 0;
  }

  async readViaApi(id: string): Promise<UserRecord | null> {
    return readUserOrNull(this.page, id);
  }
}
