import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MemberFormDrawer } from './MemberFormDrawer';
import { MemberDeactivateDrawer } from './MemberDeactivateDrawer';
import { AppRoutes } from '../../constants/AppRoutes';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import { TOAST, buttonSelector } from '../../constants/ElementIds';
import { MEMBER_DETAIL, type MemberDetailAction, type MemberDetailTab } from '../../constants/member/memberIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';
import { readMember, readMemberOrNull, type MemberRecord } from '../../utils/MemberProvisioning';

/** How a header action is offered, with its label and tooltip. */
export interface MemberHeaderActionState {
  availability: 'absent' | 'disabled' | 'available';
  label: string;
  title: string;
}

/** What a header write answered (status -1 when nothing was sent) and the messages shown. */
export interface MemberDetailWriteAnswer {
  status: number;
  text: string;
  messages: string[];
}

/**
 * A member's view page (`/member-management/{id}`), verified live 2026-11-05.
 *
 * Header card (`member-detail-header-card`): initials, tags (Alive / Deceased,
 * Male / Female, Special Needs, VIP), the English display name
 * (`member-detail-name`), the member code, the Active switch
 * (`member-detail-toggle-active-button`: "Active" / "Inactive"; a user without
 * Members.SetMemberActive sees `member-detail-status-label`), and a strip
 * Nationality / Document ID / Mobile Number / Age ("36 years, 5 months, 21
 * days"). Edit and Delete sit in the breadcrumb bar. Tabs: Member Information,
 * Non-National Registry, Address, Emergency Contacts, PBM Accumulator
 * Dashboard, Coverage Ordering (COB) (the last needs Cob.GetMemberCobTimeline) -
 * NO Audit History tab (the member's trail is in System Settings > Audit Logs).
 * Every tab is rendered from ONE GetMember answer. Deactivate: the header switch
 * on an active member opens the Deactivate drawer; on an inactive one the
 * "Activate Member" dialog ("Activate {name}? The member can be enrolled into
 * new policies." Cancel / Activate). Delete: "Delete Member ID / Do you want to
 * delete {name}?" (No / Yes) -> back to the list. A deleted / unknown id:
 * GetMember 404 "Unable to load member." -> toast and back to the list.
 */
export class MemberDetailPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private action(key: MemberDetailAction): Locator {
    return this.page.locator(buttonSelector(MEMBER_DETAIL.action[key])).first();
  }

  async open(memberId: string): Promise<void> {
    await this.goto(`${AppRoutes.memberManagement}/${memberId}`);
    await this.waitForLoaded();
  }

  /** Navigates WITHOUT expecting the screen - a deleted member, a denied user. */
  async openExpectingFailure(memberId: string): Promise<void> {
    await this.goto(`${AppRoutes.memberManagement}/${memberId}`);
  }

  async waitForLoaded(): Promise<void> {
    await expect(this.byId(MEMBER_DETAIL.name), 'the member view should load').toBeVisible({ timeout: Timeouts.default });
    await this.waitForPageReady();
  }

  async isLoaded(): Promise<boolean> {
    return this.byId(MEMBER_DETAIL.name).waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true).catch(() => false);
  }

  /** The header's display name (double spaces collapsed). */
  async getName(): Promise<string> {
    return (await this.byId(MEMBER_DETAIL.name).innerText()).replace(/\s+/g, ' ').trim();
  }

  /** The member id in the URL. */
  idFromUrl(): string {
    return new URL(this.page.url()).pathname.split('/').pop() ?? '';
  }

  /** The header card's whole text (tags, name, code, status, the Nationality / Document ID / Mobile / Age strip). */
  async getHeaderText(): Promise<string> {
    return (await this.byId(MEMBER_DETAIL.headerCard).innerText({ timeout: Timeouts.default })).replace(/\s+/g, ' ').trim();
  }

  /**
   * The header strip's values, read from the header text by label
   * ("Nationality", "Document ID", "Mobile Number", "Age") - the strip carries
   * no ids.
   */
  async readHeaderStrip(): Promise<{ nationality: string; documentId: string; mobileNumber: string; age: string }> {
    const text = await this.getHeaderText();
    const pick = (label: string, next: string): string => (new RegExp(`${label}\\s+(.*?)\\s+${next}`).exec(`${text} END`)?.[1] ?? '').trim();
    return { nationality: pick('Nationality', 'Document ID'), documentId: pick('Document ID', 'Mobile Number'), mobileNumber: pick('Mobile Number', 'Age'), age: pick('Age', 'END') };
  }

  /** The screen's whole text (header, tabs, the open tab). */
  async getPageText(): Promise<string> {
    return (await this.byId(MEMBER_DETAIL.root).innerText({ timeout: Timeouts.default })).replace(/\s+/g, ' ').trim();
  }

  /** The main area's text and the toasts, whether or not the page rendered (not-found / denied states carry no id). */
  async getScreenText(): Promise<string> {
    await this.waitForPageReady().catch(() => undefined);
    const main = await this.page.locator('main').first().innerText({ timeout: Timeouts.short }).catch(() => ''); // locator-exception: the failure states carry no id; the app's single <main> is read whole.
    return `${main} ${(await this.readMessages()).join(' ')}`.replace(/\s+/g, ' ').trim();
  }

  /** The header's status ("Active" / "Inactive"), from the switch (or the read-only label). */
  async getStatus(): Promise<string> {
    const toggle = this.byId(MEMBER_DETAIL.action.toggleActive);
    if (await toggle.isVisible().catch(() => false)) return (await toggle.innerText()).replace(/\s+/g, ' ').trim();
    return (await this.byId(MEMBER_DETAIL.statusLabel).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** Polls (reloading) until the header status reads `expected`. */
  async expectStatus(expected: string | RegExp, timeout: number = Timeouts.default): Promise<void> {
    await expect.poll(async () => {
      await this.reload();
      await this.waitForLoaded().catch(() => undefined);
      return this.getStatus().catch(() => '');
    }, { timeout, message: `the member status should read ${String(expected)}` }).toMatch(expected);
  }

  // ---- header actions -------------------------------------------------------------------

  async getActionAvailability(key: MemberDetailAction): Promise<'absent' | 'disabled' | 'available'> {
    const button = this.action(key);
    if ((await button.count()) === 0 || !(await button.isVisible())) return 'absent';
    return (await button.isEnabled()) ? 'available' : 'disabled';
  }

  async getActionState(key: MemberDetailAction): Promise<MemberHeaderActionState> {
    const availability = await this.getActionAvailability(key);
    if (availability === 'absent') return { availability, label: '', title: '' };
    const button = this.action(key);
    return { availability, label: (await button.innerText().catch(() => '')).replace(/\s+/g, ' ').trim(), title: (await button.getAttribute('title')) ?? '' };
  }

  async readActionStates(): Promise<Record<MemberDetailAction, MemberHeaderActionState>> {
    await this.waitForPageReady();
    const out = {} as Record<MemberDetailAction, MemberHeaderActionState>;
    for (const key of Object.keys(MEMBER_DETAIL.action) as MemberDetailAction[]) out[key] = await this.getActionState(key);
    return out;
  }

  async clickAction(key: MemberDetailAction): Promise<void> {
    Logger.step(`Clicking the member's "${key}" action`);
    await this.waitForPageReady();
    await expect(this.action(key), `the "${key}" action should be usable`).toBeEnabled({ timeout: Timeouts.default });
    await this.action(key).click();
  }

  // ---- tabs ------------------------------------------------------------------------------

  async openTab(tab: MemberDetailTab): Promise<void> {
    Logger.step(`Opening the member's ${tab} tab`);
    await this.page.locator(`#${MEMBER_DETAIL.tab[tab]}`).click();
    await this.waitForPageReady();
  }

  /** The tabs offered, by key, with their labels. */
  async readTabs(): Promise<Partial<Record<MemberDetailTab, string>>> {
    const out: Partial<Record<MemberDetailTab, string>> = {};
    for (const [key, id] of Object.entries(MEMBER_DETAIL.tab) as [MemberDetailTab, string][]) {
      const tab = this.page.locator(`#${id}`);
      if (await tab.isVisible().catch(() => false)) out[key] = (await tab.innerText()).trim();
    }
    return out;
  }

  /** Every tab label rendered, in order (catches a tab the constants do not know, e.g. a future Audit History). */
  async readTabLabels(): Promise<string[]> {
    return (await this.page.locator(`[id^="${MEMBER_DETAIL.tabs}"] [id^="member-detail-tab-"]`).allInnerTexts()).map((t) => t.trim());
  }

  async hasTab(tab: MemberDetailTab): Promise<boolean> {
    return (await this.readTabs())[tab] !== undefined;
  }

  /** The tab marked active (aria-selected / is-active), by key. */
  async activeTab(): Promise<MemberDetailTab | null> {
    for (const [key, id] of Object.entries(MEMBER_DETAIL.tab) as [MemberDetailTab, string][]) {
      const active = await this.page.locator(`#${id}`).evaluate((el) => el.getAttribute('aria-selected') === 'true' || el.classList.contains('is-active')).catch(() => false);
      if (active) return key;
    }
    return null;
  }

  // ---- writes ---------------------------------------------------------------------------

  /** Opens the Edit wizard and returns it, loaded. */
  async openEditDrawer(): Promise<MemberFormDrawer> {
    await this.clickAction('edit');
    const drawer = new MemberFormDrawer(this.page);
    await drawer.waitForOpen();
    await drawer.waitForLoadedValues();
    return drawer;
  }

  /** The header switch on an ACTIVE member -> the detail's Deactivate drawer (`member-detail-deactivate-drawer`). */
  async openDeactivate(): Promise<MemberDeactivateDrawer> {
    await this.clickAction('toggleActive');
    const drawer = new MemberDeactivateDrawer(this.page, 'detail');
    await drawer.waitForOpen();
    return drawer;
  }

  /** The header switch on an INACTIVE member -> "Activate Member" (Cancel / Activate), left open. */
  async requestActivate(): Promise<ConfirmDialog> {
    await this.clickAction('toggleActive');
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    return dialog;
  }

  /** Activate + confirm; returns SetMemberActive's answer (applied at once) and the toasts. */
  async activate(): Promise<MemberDetailWriteAnswer> {
    const dialog = await this.requestActivate();
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.memberSetActive, () => dialog.confirm());
    return { status: answer?.status ?? -1, text: answer?.text ?? '', messages: await this.waitForMessages() };
  }

  /** Clicks Delete and leaves "Delete Member ID / Do you want to delete {name}?" (No / Yes) open. */
  async requestDelete(): Promise<ConfirmDialog> {
    await this.clickAction('delete');
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    return dialog;
  }

  /** Delete + Yes; returns DeleteMember's answer. Deleted: toast "Member deleted" and back to the list; refused: the reason as a toast. */
  async deleteMember(): Promise<MemberDetailWriteAnswer> {
    const dialog = await this.requestDelete();
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.memberDelete, () => dialog.confirm());
    return { status: answer?.status ?? -1, text: answer?.text ?? '', messages: await this.waitForMessages() };
  }

  /** Toasts and dialog messages on screen now (no wait). */
  async readMessages(): Promise<string[]> {
    const toasts = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
    const dialog = await this.page.locator('#pbm-dialog-message').allInnerTexts().catch(() => [] as string[]);
    return [...toasts, ...dialog].map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t !== '');
  }

  /** Toasts on screen, settled. */
  async waitForMessages(timeout: number = Timeouts.short): Promise<string[]> {
    return WaitUtils.settleMessages(() => this.readMessages(), timeout);
  }

  // ---- API ------------------------------------------------------------------------------

  async readViaApi(memberId: string): Promise<MemberRecord> {
    return readMember(this.page, memberId);
  }

  async readViaApiOrNull(memberId: string): Promise<MemberRecord | null> {
    return readMemberOrNull(this.page, memberId);
  }
}
