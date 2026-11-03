import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormularyFormDrawer } from './FormularyFormDrawer';
import { FormularyCloneDrawer } from './FormularyCloneDrawer';
import { FormularyDeactivateDrawer } from './FormularyDeactivateDrawer';
import { AppRoutes } from '../../constants/AppRoutes';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import {
  FORMULARY_CLONE,
  FORMULARY_DEACTIVATE,
  FORMULARY_DETAIL,
  FORMULARY_DETAIL_EXTRA,
  FORMULARY_FORM,
  FORMULARY_FORM_DRAWER,
  TOAST,
  buttonSelector,
  type FormularyDetailTab,
} from '../../constants/ElementIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';
import {
  deactivateFormulary,
  deleteFormulary,
  formularyStatusCode,
  publishFormularyChange,
  readFormulary,
  readFormularyOrNull,
  updateFormularyPayer,
  type FormularyOption,
  type FormularyRecord,
} from '../../utils/FormularyProvisioning';

export type FormularyDetailAction = keyof typeof FORMULARY_DETAIL.action;
export type FormularyOverviewField = keyof typeof FORMULARY_DETAIL.overview;

/** How a header action is offered, with its label and tooltip. */
export interface DetailActionState {
  availability: 'absent' | 'disabled' | 'available';
  label: string;
  title: string;
}

/** The header as the screen shows it. */
export interface FormularyHeader {
  name: string;
  /** "Not Live", "Future", "Active", "Inactive", "Expired". */
  status: string;
  /** "v0 · Draft", "v1 · Approved", "v1 · Pending Approval", "v1 · Rejected", ... */
  version: string;
}

/**
 * A formulary's detail screen (`/formulary-pricing/{id}`), verified live 2026-11-02.
 *
 * Header: name, status badge, version badge and, by state, the notices
 * ("Not published yet: This formulary has never gone live ..." on v0; "This
 * formulary is a draft. It is not live yet ..." while a draft version exists)
 * and the actions Edit Metadata / Send for Approval / Clone / Deactivate (or
 * Activate on an Inactive one, `-set-active-button-2`) / Delete. Observed:
 *   v0 draft          Edit, Send for Approval, Clone, Deactivate, Delete
 *   approved (Future) Clone, Deactivate, Delete            (NO Edit)
 *   with a staged change: + Send for Approval
 *   Inactive          Clone, Activate, Delete
 * Tabs: Overview, Tiers (n), Trades & Pricing (n), Version History, Audit History.
 *
 * The plan suite's methods (readPayer, openEdit, deleteAndCapture, the API
 * wrappers) are kept as they were.
 */
export class FormularyDetailPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private action(key: FormularyDetailAction): Locator {
    return this.page.locator(buttonSelector(FORMULARY_DETAIL.action[key])).first();
  }

  async open(formularyId: string): Promise<void> {
    await this.goto(`${AppRoutes.formularyManagement}/${formularyId}`);
    await this.waitForLoaded();
  }

  /** Navigates WITHOUT expecting the screen - a deleted formulary, a denied user. */
  async openExpectingFailure(formularyId: string): Promise<void> {
    await this.goto(`${AppRoutes.formularyManagement}/${formularyId}`);
  }

  async waitForLoaded(): Promise<void> {
    await expect(this.byId(FORMULARY_DETAIL.name), 'the formulary detail should load').toBeVisible({ timeout: Timeouts.default });
    await this.waitForPageReady();
  }

  /** Whether the detail rendered (its name) within the default wait. */
  async isLoaded(): Promise<boolean> {
    return this.byId(FORMULARY_DETAIL.name).waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true).catch(() => false);
  }

  async getName(): Promise<string> {
    return (await this.byId(FORMULARY_DETAIL.name).innerText()).trim();
  }

  // ---- header -------------------------------------------------------------------------

  async readHeader(): Promise<FormularyHeader> {
    const read = (id: string) => this.byId(id).innerText({ timeout: Timeouts.default }).then((t) => t.trim()).catch(() => '');
    return { name: await read(FORMULARY_DETAIL.name), status: await read(FORMULARY_DETAIL.statusBadge), version: await read(FORMULARY_DETAIL.versionBadge) };
  }

  async getStatus(): Promise<string> {
    return (await this.byId(FORMULARY_DETAIL.statusBadge).innerText()).trim();
  }

  async getVersionBadge(): Promise<string> {
    return (await this.byId(FORMULARY_DETAIL.versionBadge).innerText()).trim();
  }

  /** Polls until the status badge reads `expected` (reloading between reads). */
  async expectStatus(expected: string | RegExp): Promise<void> {
    await expect.poll(async () => {
      await this.reload();
      return this.getStatus().catch(() => '');
    }, { timeout: Timeouts.queuePropagation, message: `the formulary status should read ${String(expected)}` }).toMatch(expected);
  }

  /** The header card's text (status, version, the draft notice). */
  async getHeaderText(): Promise<string> {
    return (await this.byId(FORMULARY_DETAIL.headerCard).innerText({ timeout: Timeouts.default })).replace(/\s+/g, ' ').trim();
  }

  /** The "Not published yet: ..." notice of a never-published formulary, '' when absent. */
  async getPendingCreateNotice(): Promise<string> {
    return (await this.byId(FORMULARY_DETAIL_EXTRA.pendingCreate).innerText({ timeout: Timeouts.short }).catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** The Overview's "Important: Every change ... is saved as a draft first" notice, '' when absent. */
  async getDraftNotice(): Promise<string> {
    return (await this.byId(FORMULARY_DETAIL_EXTRA.draftNotice).innerText({ timeout: Timeouts.short }).catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** The active tab's "Important: ..." notice (Tiers / Trades), '' when absent. */
  async getTabNotice(): Promise<string> {
    return (await this.byId(FORMULARY_DETAIL_EXTRA.tabNotice).innerText({ timeout: Timeouts.short }).catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** The screen's whole text (header, notices, Overview) - for "are the dependent plans listed". */
  async getPageText(): Promise<string> {
    return (await this.byId(FORMULARY_DETAIL.root).innerText({ timeout: Timeouts.default })).replace(/\s+/g, ' ').trim();
  }

  /** 'absent' | 'disabled' | 'available' for one header action. */
  async getActionAvailability(key: FormularyDetailAction): Promise<'absent' | 'disabled' | 'available'> {
    const button = this.action(key);
    if ((await button.count()) === 0 || !(await button.isVisible())) return 'absent';
    return (await button.isEnabled()) ? 'available' : 'disabled';
  }

  /** One header action with its label and tooltip. */
  async getActionState(key: FormularyDetailAction): Promise<DetailActionState> {
    const availability = await this.getActionAvailability(key);
    if (availability === 'absent') return { availability, label: '', title: '' };
    const button = this.action(key);
    return { availability, label: (await button.innerText().catch(() => '')).trim(), title: (await button.getAttribute('title')) ?? '' };
  }

  /** Every header action's state. */
  async readActionStates(): Promise<Record<FormularyDetailAction, DetailActionState>> {
    await this.waitForPageReady();
    const out = {} as Record<FormularyDetailAction, DetailActionState>;
    for (const key of Object.keys(FORMULARY_DETAIL.action) as FormularyDetailAction[]) out[key] = await this.getActionState(key);
    return out;
  }

  /** A header action's explanatory tooltip (`title`), '' when none. */
  async getActionMessage(key: FormularyDetailAction): Promise<string> {
    const button = this.action(key);
    if ((await button.count()) === 0) return '';
    return (await button.getAttribute('title')) ?? '';
  }

  /** Clicks a header action after asserting it is usable. */
  async clickAction(key: FormularyDetailAction): Promise<void> {
    Logger.step(`Clicking the formulary's "${key}" action`);
    await this.waitForPageReady();
    await expect(this.action(key), `the "${key}" action should be usable`).toBeEnabled({ timeout: Timeouts.default });
    await this.action(key).click();
  }

  // ---- tabs and Overview ---------------------------------------------------------------

  /** Opens a tab and waits for the page to settle. */
  async openTab(tab: FormularyDetailTab): Promise<void> {
    Logger.step(`Opening the formulary's ${tab} tab`);
    await this.page.locator(`#${FORMULARY_DETAIL_EXTRA.tab[tab]}`).click();
    await this.waitForPageReady();
  }

  /** The tabs offered, by key, with their labels ("Tiers (1)"). */
  async readTabs(): Promise<Partial<Record<FormularyDetailTab, string>>> {
    const out: Partial<Record<FormularyDetailTab, string>> = {};
    for (const [key, id] of Object.entries(FORMULARY_DETAIL_EXTRA.tab) as [FormularyDetailTab, string][]) {
      const tab = this.page.locator(`#${id}`);
      if (await tab.isVisible().catch(() => false)) out[key] = (await tab.innerText()).trim();
    }
    return out;
  }

  /** The count a tab label carries ("Tiers (2)" -> 2), null when it shows none. */
  async readTabCount(tab: 'tiers' | 'trades'): Promise<number | null> {
    const label = await this.page.locator(`#${FORMULARY_DETAIL_EXTRA.tab[tab]}`).innerText().catch(() => '');
    const match = label.match(/\((\d+)\)/);
    return match ? Number(match[1]) : null;
  }

  /** One Overview value ('' when the field is not rendered). */
  async readOverviewField(field: FormularyOverviewField): Promise<string> {
    return this.byId(FORMULARY_DETAIL.overview[field]).last().innerText({ timeout: Timeouts.default }).then((t) => t.trim()).catch(() => '');
  }

  /** Every Overview value. */
  async readOverview(): Promise<Record<FormularyOverviewField, string>> {
    const out = {} as Record<FormularyOverviewField, string>;
    for (const field of Object.keys(FORMULARY_DETAIL.overview) as FormularyOverviewField[]) out[field] = await this.readOverviewField(field);
    return out;
  }

  /** The Overview's Payer value. */
  async readPayer(): Promise<string> {
    return this.readOverviewField('payer');
  }

  // ---- header actions -------------------------------------------------------------------

  /** Opens the Edit drawer from the header. */
  async openEdit(): Promise<void> {
    Logger.step('Opening the formulary\'s Edit drawer');
    await this.action('edit').click();
    await expect(this.byId(FORMULARY_FORM_DRAWER.title), 'the Edit Formulary drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  /** Opens the Edit drawer and returns it, loaded. */
  async openEditDrawer(): Promise<FormularyFormDrawer> {
    await this.openEdit();
    const drawer = new FormularyFormDrawer(this.page);
    await drawer.waitForOpen();
    await drawer.waitForLoadedValues();
    return drawer;
  }

  /** Whether the open drawer lets the payer be chosen (a select) rather than showing it read-only. */
  async isPayerEditable(): Promise<boolean> {
    return new FormularyFormDrawer(this.page).isPayerEditable();
  }

  /** The payer as the open drawer shows it (the read-only tag or the select's value). */
  async readPayerField(): Promise<string> {
    return new FormularyFormDrawer(this.page).readPayer();
  }

  /** The open drawer's whole text - for an inline warning next to the payer. */
  async getEditDrawerText(): Promise<string> {
    return (await this.byId(FORMULARY_FORM.root).first().innerText()).replace(/\s+/g, ' ').trim();
  }

  /** Closes the drawer without saving, discarding nothing (no field was changed). */
  async closeEdit(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await expect(this.byId(FORMULARY_FORM_DRAWER.title), 'the Edit drawer should close').toBeHidden({ timeout: Timeouts.default });
  }

  /** Opens the Clone drawer. */
  async openClone(): Promise<FormularyCloneDrawer> {
    await this.clickAction('clone');
    const drawer = new FormularyCloneDrawer(this.page, FORMULARY_CLONE.root);
    await drawer.waitForOpen();
    return drawer;
  }

  /** Opens the Deactivate drawer (header "Deactivate"). */
  async openDeactivate(): Promise<FormularyDeactivateDrawer> {
    await this.clickAction('setActive');
    const drawer = new FormularyDeactivateDrawer(this.page, FORMULARY_DEACTIVATE.detail);
    await drawer.waitForOpen();
    return drawer;
  }

  /**
   * Clicks Activate on an Inactive formulary and confirms its prompt(s);
   * returns SetFormularyActive's answer and the messages shown. Activation is
   * staged as a draft like every other change.
   */
  async activate(): Promise<{ status: number; text: string; messages: string[] }> {
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.formularySetActive, async () => {
      await this.clickAction('activate');
      const dialog = new ConfirmDialog(this.page);
      if (await dialog.isVisible()) await dialog.confirmWithFollowUps();
    });
    return { status: answer?.status ?? -1, text: answer?.text ?? '', messages: await this.readMessages() };
  }

  /** Clicks Send for Approval and leaves its prompt open. */
  async requestSendForApproval(): Promise<ConfirmDialog> {
    await this.clickAction('submit');
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    return dialog;
  }

  /** Sends the formulary for approval through the header and its prompt; returns the answer and the messages shown. */
  async sendForApproval(): Promise<{ status: number; text: string; messages: string[] }> {
    const dialog = await this.requestSendForApproval();
    const answer = await NetworkUtils.captureResponse(this.page, ApiEndpoints.formularySubmit, () => dialog.confirm());
    return { status: answer?.status ?? -1, text: answer?.text ?? '', messages: await this.readMessages() };
  }

  /** Clicks Delete and leaves its prompt open. */
  async requestDelete(): Promise<ConfirmDialog> {
    await this.clickAction('delete');
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    return dialog;
  }

  /** Clicks Delete and confirms (and any follow-up); returns what DeleteFormulary answered and the messages shown. */
  async deleteAndCapture(): Promise<{ status: number; text: string; messages: string[] }> {
    await this.action('delete').click();
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    const outcome = await NetworkUtils.captureResponse(this.page, ApiEndpoints.formularyDelete, async () => { await dialog.confirmWithFollowUps(); });
    return { status: outcome?.status ?? 0, text: outcome?.text ?? '', messages: await this.readMessages() };
  }

  /** Toasts and dialog messages on screen now (no wait). */
  async readMessages(): Promise<string[]> {
    const toasts = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
    const dialog = await this.page.locator('#pbm-dialog-message').allInnerTexts().catch(() => [] as string[]);
    return [...toasts, ...dialog].map((t) => t.trim()).filter((t) => t !== '');
  }

  /** Toasts on screen, settled (waits a moment for one to arrive). */
  async waitForMessages(timeout: number = Timeouts.short): Promise<string[]> {
    return WaitUtils.settleMessages(() => this.readMessages(), timeout);
  }

  // ---- Writer C additions (folders 06 / 17 / 19 / 20 / 22, 2026-11-02) ----------------

  /** Whether the screen offers a tab. */
  async hasTab(tab: FormularyDetailTab): Promise<boolean> {
    return (await this.readTabs())[tab] !== undefined;
  }

  /** The tabs offered, by key, in the order they are declared. */
  async readOfferedTabs(): Promise<FormularyDetailTab[]> {
    await this.waitForPageReady();
    return Object.keys(await this.readTabs()) as FormularyDetailTab[];
  }

  /** Whether the Overview's values are on screen (the Code value renders). */
  async isOverviewShown(): Promise<boolean> {
    return this.byId(FORMULARY_DETAIL.overview.code).last().waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false);
  }

  /**
   * The main area's whole text, whether or not the detail rendered - for the
   * "Unable to load the requested formulary." and access-denied states, which
   * replace the detail and carry no id of their own.
   */
  async getScreenText(): Promise<string> {
    await this.waitForPageReady().catch(() => undefined);
    const messages = (await this.readMessages()).join(' ');
    const main = await this.page.locator('main').first().innerText({ timeout: Timeouts.short }).catch(() => ''); // locator-exception: the failure states carry no id; the app's single <main> is read whole.
    return `${main} ${messages}`.replace(/\s+/g, ' ').trim();
  }

  /** Every Overview value, with the tab counts, read in one go - to compare before and after switching tabs. */
  async snapshotOverview(): Promise<Record<string, string>> {
    await this.openTab('overview');
    const values: Record<string, string> = { ...(await this.readOverview()) };
    values.tiersTab = String(await this.readTabCount('tiers'));
    values.tradesTab = String(await this.readTabCount('trades'));
    return values;
  }

  // ---- API (the same calls the screen makes) -------------------------------

  /** The formulary as GetFormulary answers it, with its assigned / pending plan counts. */
  async readViaApi(formularyId: string): Promise<FormularyRecord> {
    return readFormulary(this.page, formularyId);
  }

  /** The formulary, or null when the server no longer returns it. */
  async readViaApiOrNull(formularyId: string): Promise<FormularyRecord | null> {
    return readFormularyOrNull(this.page, formularyId);
  }

  /** Saves the formulary with a different payer (UpdateFormulary) and returns the answer. */
  async changePayerViaApi(formularyId: string, payerId: string): Promise<{ status: number; text: string }> {
    Logger.step(`Changing formulary ${formularyId}'s payer to ${payerId}`);
    return updateFormularyPayer(this.page, formularyId, payerId);
  }

  /**
   * Deactivates the formulary end to end (SetFormularyActive isActive=false,
   * send for approval, approve) and reports its status code afterwards, or the
   * reason the server refused - never throws, so a refusal is the case's to judge.
   */
  async deactivateViaApi(formulary: FormularyOption): Promise<{ statusCode: string; error: string }> {
    Logger.step(`Deactivating formulary "${formulary.formularyNameEn}"`);
    const error = await deactivateFormulary(this.page, formulary).then(() => '', (e: unknown) => String(e instanceof Error ? e.message : e));
    return { statusCode: await formularyStatusCode(this.page, formulary.id), error };
  }

  /**
   * Sends the formulary's staged change for approval and approves it (a
   * published formulary's edit is a draft until then). Returns '' on success,
   * else the reason - never throws.
   */
  async publishChangeViaApi(formulary: FormularyOption): Promise<string> {
    return publishFormularyChange(this.page, formulary.id, formulary.formularyNameEn)
      .then(() => '', (e: unknown) => String(e instanceof Error ? e.message : e));
  }

  /** The formulary's status code ("active", "inactive", "pending", ...), '' when it is gone. */
  async readStatusCodeViaApi(formularyId: string): Promise<string> {
    return formularyStatusCode(this.page, formularyId);
  }

  /** Deletes (or stages the deletion of) the formulary (DeleteFormulary/{id}) and returns the answer. */
  async deleteViaApi(formularyId: string): Promise<{ status: number; text: string }> {
    Logger.step(`Deleting formulary ${formularyId}`);
    return deleteFormulary(this.page, formularyId);
  }
}
