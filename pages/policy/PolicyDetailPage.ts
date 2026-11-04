import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PolicyFormDrawer } from './PolicyFormDrawer';
import { PolicyCloneDrawer } from './PolicyCloneDrawer';
import { PolicyInactivateDrawer } from './PolicyInactivateDrawer';
import { AppRoutes } from '../../constants/AppRoutes';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import {
  POLICY_DETAIL,
  POLICY_FORM,
  TOAST,
  buttonSelector,
  type PolicyDetailAction,
  type PolicyDetailTab,
  type PolicyOverviewField,
} from '../../constants/ElementIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';
import { readPolicy, readPolicyOrNull, type PolicyRecord } from '../../utils/PolicyProvisioning';

/** How a header action is offered, with its label and tooltip. */
export interface PolicyActionState {
  availability: 'absent' | 'disabled' | 'available';
  label: string;
  title: string;
}

/** The header as the screen shows it. */
export interface PolicyHeader {
  name: string;
  /** "Not Live", "Future", "Active", "Inactive", "Expired". */
  status: string;
  /** "v0 · Draft", "v1 · Approved", "v0 · Pending Approval", ... */
  version: string;
  /** The header card's whole text (number, notices, the contact strip). */
  text: string;
}

/** What a header write answered (status -1 when nothing was sent) and the messages shown. */
export interface PolicyWriteAnswer {
  status: number;
  text: string;
  messages: string[];
}

/**
 * A policy's detail screen (`/policy-management/{id}`), verified live 2026-11-03.
 *
 * Header: initials, name, policy number, status badge, version badge, the
 * draft / pending / rejected hint ("This policy has draft changes that are not
 * live yet ..."), a contact strip (Policy Type, Plan, Payer, Policy Holder,
 * Effective, Expiry - no ids) and the actions:
 *   v0 Draft            Edit, Clone, Send for Approval, Inactivate (DISABLED), Delete
 *   v0 Pending          Edit, Clone, Inactivate (disabled), Delete
 *   published (Future)  Clone, Inactivate (+ Send for Approval while a draft exists) - NO Edit / Delete
 *   Inactive            Clone, Activate
 * Tabs: Overview, Members (n), Network Assignment (n), Documentation (n),
 * Version History, Audit History.
 */
export class PolicyDetailPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private action(key: PolicyDetailAction): Locator {
    return this.page.locator(buttonSelector(POLICY_DETAIL.action[key])).first();
  }

  async open(policyId: string): Promise<void> {
    await this.goto(`${AppRoutes.policyManagement}/${policyId}`);
    await this.waitForLoaded();
  }

  /** Navigates WITHOUT expecting the screen - a deleted policy, a denied user. */
  async openExpectingFailure(policyId: string): Promise<void> {
    await this.goto(`${AppRoutes.policyManagement}/${policyId}`);
  }

  async waitForLoaded(): Promise<void> {
    await expect(this.byId(POLICY_DETAIL.name), 'the policy detail should load').toBeVisible({ timeout: Timeouts.default });
    await this.waitForPageReady();
  }

  async isLoaded(): Promise<boolean> {
    return this.byId(POLICY_DETAIL.name).waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true).catch(() => false);
  }

  async getName(): Promise<string> {
    return (await this.byId(POLICY_DETAIL.name).innerText()).trim();
  }

  /** The policy id in the URL. */
  idFromUrl(): string {
    return new URL(this.page.url()).pathname.split('/').pop() ?? '';
  }

  // ---- header -------------------------------------------------------------------------

  async readHeader(): Promise<PolicyHeader> {
    const read = (id: string) => this.byId(id).innerText({ timeout: Timeouts.default }).then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
    return {
      name: await read(POLICY_DETAIL.name),
      status: await read(POLICY_DETAIL.statusBadge),
      version: await read(POLICY_DETAIL.versionBadge),
      text: await read(POLICY_DETAIL.headerCard),
    };
  }

  async getStatus(): Promise<string> {
    return (await this.byId(POLICY_DETAIL.statusBadge).innerText()).trim();
  }

  async getVersionBadge(): Promise<string> {
    return (await this.byId(POLICY_DETAIL.versionBadge).innerText()).trim();
  }

  /** Polls (reloading) until the status badge reads `expected`. */
  async expectStatus(expected: string | RegExp): Promise<void> {
    await expect.poll(async () => {
      await this.reload();
      return this.getStatus().catch(() => '');
    }, { timeout: Timeouts.queuePropagation, message: `the policy status should read ${String(expected)}` }).toMatch(expected);
  }

  /** The header card's text (number, hint, contact strip). */
  async getHeaderText(): Promise<string> {
    return (await this.byId(POLICY_DETAIL.headerCard).innerText({ timeout: Timeouts.default })).replace(/\s+/g, ' ').trim();
  }

  /** The screen's whole text (header, tabs, the open tab). */
  async getPageText(): Promise<string> {
    return (await this.byId(POLICY_DETAIL.root).innerText({ timeout: Timeouts.default })).replace(/\s+/g, ' ').trim();
  }

  /**
   * The main area's whole text, whether or not the detail rendered - for the
   * not-found / access-denied states, which carry no id of their own.
   */
  async getScreenText(): Promise<string> {
    await this.waitForPageReady().catch(() => undefined);
    const main = await this.page.locator('main').first().innerText({ timeout: Timeouts.short }).catch(() => ''); // locator-exception: the failure states carry no id; the app's single <main> is read whole.
    return `${main} ${(await this.readMessages()).join(' ')}`.replace(/\s+/g, ' ').trim();
  }

  async getActionAvailability(key: PolicyDetailAction): Promise<'absent' | 'disabled' | 'available'> {
    const button = this.action(key);
    if ((await button.count()) === 0 || !(await button.isVisible())) return 'absent';
    return (await button.isEnabled()) ? 'available' : 'disabled';
  }

  /** One header action with its label and tooltip ("Not available until this policy is approved."). */
  async getActionState(key: PolicyDetailAction): Promise<PolicyActionState> {
    const availability = await this.getActionAvailability(key);
    if (availability === 'absent') return { availability, label: '', title: '' };
    const button = this.action(key);
    const host = this.byId(POLICY_DETAIL.action[key]);
    const title = (await button.getAttribute('title')) ?? (await host.getAttribute('title').catch(() => null)) ?? '';
    return { availability, label: (await button.innerText().catch(() => '')).trim(), title };
  }

  async readActionStates(): Promise<Record<PolicyDetailAction, PolicyActionState>> {
    await this.waitForPageReady();
    const out = {} as Record<PolicyDetailAction, PolicyActionState>;
    for (const key of Object.keys(POLICY_DETAIL.action) as PolicyDetailAction[]) out[key] = await this.getActionState(key);
    return out;
  }

  async clickAction(key: PolicyDetailAction): Promise<void> {
    Logger.step(`Clicking the policy's "${key}" action`);
    await this.waitForPageReady();
    await expect(this.action(key), `the "${key}" action should be usable`).toBeEnabled({ timeout: Timeouts.default });
    await this.action(key).click();
  }

  // ---- tabs and Overview ---------------------------------------------------------------

  async openTab(tab: PolicyDetailTab): Promise<void> {
    Logger.step(`Opening the policy's ${tab} tab`);
    await this.page.locator(`#${POLICY_DETAIL.tab[tab]}`).click();
    await this.waitForPageReady();
  }

  /** The tabs offered, by key, with their labels ("Members (3)"). */
  async readTabs(): Promise<Partial<Record<PolicyDetailTab, string>>> {
    const out: Partial<Record<PolicyDetailTab, string>> = {};
    for (const [key, id] of Object.entries(POLICY_DETAIL.tab) as [PolicyDetailTab, string][]) {
      const tab = this.page.locator(`#${id}`);
      if (await tab.isVisible().catch(() => false)) out[key] = (await tab.innerText()).trim();
    }
    return out;
  }

  async hasTab(tab: PolicyDetailTab): Promise<boolean> {
    return (await this.readTabs())[tab] !== undefined;
  }

  /** The count a tab label carries ("Members (3)" -> 3), null when none. */
  async readTabCount(tab: 'members' | 'networks' | 'documents'): Promise<number | null> {
    const label = await this.page.locator(`#${POLICY_DETAIL.tab[tab]}`).innerText().catch(() => '');
    const match = label.match(/\((\d+)\)/);
    return match ? Number(match[1]) : null;
  }

  /** One Overview value ('' when not rendered - e.g. the inactivation fields on a live policy). */
  async readOverviewField(field: PolicyOverviewField): Promise<string> {
    return this.byId(POLICY_DETAIL.overview[field]).last().innerText({ timeout: Timeouts.short }).then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
  }

  async readOverview(): Promise<Record<PolicyOverviewField, string>> {
    await this.byId(POLICY_DETAIL.overview.number).waitFor({ state: 'visible', timeout: Timeouts.default }).catch(() => undefined);
    const out = {} as Record<PolicyOverviewField, string>;
    for (const field of Object.keys(POLICY_DETAIL.overview) as PolicyOverviewField[]) out[field] = await this.readOverviewField(field);
    return out;
  }

  /** Whether an Overview field renders at all (the field list cases). */
  async hasOverviewField(field: PolicyOverviewField): Promise<boolean> {
    return this.byId(POLICY_DETAIL.overview[field]).first().isVisible().catch(() => false);
  }

  // ---- header actions -------------------------------------------------------------------

  /** Opens the Edit drawer (v0 only) and returns it, loaded. */
  async openEditDrawer(): Promise<PolicyFormDrawer> {
    await this.clickAction('edit');
    const drawer = new PolicyFormDrawer(this.page, POLICY_FORM.add);
    await drawer.waitForOpen();
    await drawer.waitForLoadedValues();
    return drawer;
  }

  async openClone(): Promise<PolicyCloneDrawer> {
    await this.clickAction('clone');
    const drawer = new PolicyCloneDrawer(this.page);
    await drawer.waitForOpen();
    await drawer.waitForLoadedValues();
    return drawer;
  }

  async openInactivate(): Promise<PolicyInactivateDrawer> {
    await this.clickAction('inactivate');
    const drawer = new PolicyInactivateDrawer(this.page);
    await drawer.waitForOpen();
    return drawer;
  }

  /** Clicks Activate (an Inactive policy) and confirms "Activate policy?"; returns SetPolicyActive's answer. Activation is staged as a draft. */
  async activate(): Promise<PolicyWriteAnswer> {
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.policySetActive, async () => {
      await this.clickAction('activate');
      const dialog = new ConfirmDialog(this.page);
      if (await dialog.isVisible()) await dialog.confirmWithFollowUps();
    });
    return { status: answer?.status ?? -1, text: answer?.text ?? '', messages: await this.waitForMessages() };
  }

  /** Clicks Send for Approval and leaves "Send for approval?" open. */
  async requestSendForApproval(): Promise<ConfirmDialog> {
    await this.clickAction('submit');
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    return dialog;
  }

  async sendForApproval(): Promise<PolicyWriteAnswer> {
    const dialog = await this.requestSendForApproval();
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.policySubmit, () => dialog.confirm());
    return { status: answer?.status ?? -1, text: answer?.text ?? '', messages: await this.waitForMessages() };
  }

  /** Clicks Delete and leaves the prompt open. */
  async requestDelete(): Promise<ConfirmDialog> {
    await this.clickAction('delete');
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    return dialog;
  }

  /** Delete + confirm (and any follow-up); returns DeletePolicy's answer. A v0 is discarded at once and the screen returns to the list. */
  async deletePolicy(): Promise<PolicyWriteAnswer> {
    const dialog = await this.requestDelete();
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.policyDelete, async () => { await dialog.confirmWithFollowUps(); });
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

  async readViaApi(policyId: string): Promise<PolicyRecord> {
    return readPolicy(this.page, policyId);
  }

  async readViaApiOrNull(policyId: string): Promise<PolicyRecord | null> {
    return readPolicyOrNull(this.page, policyId);
  }
}
