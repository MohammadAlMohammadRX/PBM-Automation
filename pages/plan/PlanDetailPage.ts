import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AuditHistoryTab } from '../components/AuditHistoryTab';
import { PlanFormDialog } from './PlanFormDialog';
import { PlanInactivateDialog } from './PlanInactivateDialog';
import { PlanVersionHistoryTab } from './PlanVersionHistoryTab';
import { PlanFormularyTab } from './PlanFormularyTab';
import { AppRoutes } from '../../constants/AppRoutes';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import {
  APP_BREADCRUMB,
  PLAN_AUDIT,
  PLAN_DETAIL,
  TOAST,
  buttonSelector,
  type PlanDetailTab,
  type PlanOverviewField,
} from '../../constants/ElementIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { Logger } from '../../utils/Logger';
import { planInactivationReasons, planStatusIds, readPlan, type PlanRecord } from '../../utils/PlanProvisioning';

export type PlanDetailAction = keyof typeof PLAN_DETAIL.action;

/**
 * A plan's detail screen (`/plans-management/{id}`), verified 2026-10-27.
 *
 * Header: name, version badge ("v1 · Approved"), status badge, an "Important"
 * notice while a change awaits approval, and actions by state (Edit, Clone,
 * Inactivate / Activate, Send for Approval, Delete). Tabs: Overview, Formulary
 * Assignment, Benefit Summary, Version History, Audit History.
 */
export class PlanDetailPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private action(key: PlanDetailAction): Locator {
    return this.page.locator(buttonSelector(PLAN_DETAIL.action[key])).first();
  }

  private statusBadge(): Locator {
    return this.byId(PLAN_DETAIL.headerCard).locator(`#${PLAN_DETAIL.statusBadge}`).first();
  }

  private tab(key: PlanDetailTab): Locator {
    return this.page.locator(buttonSelector(PLAN_DETAIL.tab[key])).first();
  }

  async open(planId: string): Promise<void> {
    await this.goto(`${AppRoutes.planManagement}/${planId}`);
    await this.waitForLoaded();
  }

  /** Navigates without expecting the plan to load - for the out-of-scope / deleted cases. */
  async openExpectingFailure(planId: string): Promise<void> {
    await this.goto(`${AppRoutes.planManagement}/${planId}`);
  }

  /**
   * Opens a plan that should not load and returns the message the screen shows,
   * read WHILE it is up: the refusal is a toast that leaves after a few seconds,
   * and reading it after the "did not render" wait found nothing although the
   * toast had been shown (19011 / 19278, 2026-10-28).
   */
  async openAndReadRefusal(planId: string): Promise<string> {
    await this.openExpectingFailure(planId);
    await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).first().waitFor({ state: 'visible', timeout: Timeouts.default }).catch(() => undefined);
    return (await this.readMessages()).join(' ');
  }

  async waitForLoaded(): Promise<void> {
    await expect(this.byId(PLAN_DETAIL.name), 'the plan detail should load').toBeVisible({ timeout: Timeouts.default });
    await this.waitForPageReady();
  }

  async isLoaded(timeout: number = Timeouts.default): Promise<boolean> {
    return this.byId(PLAN_DETAIL.name).waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
  }

  async getName(): Promise<string> {
    return (await this.byId(PLAN_DETAIL.name).innerText()).trim();
  }

  async getStatus(): Promise<string> {
    return (await this.statusBadge().innerText()).trim();
  }

  async expectStatus(expected: string | RegExp): Promise<void> {
    await expect(this.statusBadge()).toHaveText(expected, { timeout: Timeouts.default });
  }

  /** Polls (reloading) until the header shows `expected` - lifecycle and approval changes are not instant. */
  async expectStatusEventually(expected: string, timeoutMs: number = Timeouts.queuePropagation): Promise<void> {
    await expect
      .poll(async () => {
        await this.reload();
        await this.waitForLoaded();
        return this.getStatus();
      }, { timeout: timeoutMs, message: `the plan should come to read "${expected}"` })
      .toBe(expected);
  }

  async getVersionBadge(): Promise<string> {
    return (await this.byId(PLAN_DETAIL.headerCard).locator(`#${PLAN_DETAIL.versionBadge}`).first().innerText()).trim();
  }

  /** The "Important" notice text (a change awaiting approval), '' when none shows. */
  async getNotice(): Promise<string> {
    return this.byId(PLAN_DETAIL.notice).first().innerText({ timeout: Timeouts.short }).then((t) => t.trim()).catch(() => '');
  }

  async getHeaderText(): Promise<string> {
    return (await this.byId(PLAN_DETAIL.headerCard).innerText()).trim();
  }

  /** The header actions offered (visible), by key. */
  async getOfferedActions(): Promise<PlanDetailAction[]> {
    const offered: PlanDetailAction[] = [];
    for (const key of Object.keys(PLAN_DETAIL.action) as PlanDetailAction[]) {
      if ((await this.action(key).count()) > 0 && (await this.action(key).isVisible())) offered.push(key);
    }
    return offered;
  }

  /** 'absent' | 'disabled' | 'available' for one header action. */
  async getActionAvailability(key: PlanDetailAction): Promise<'absent' | 'disabled' | 'available'> {
    const button = this.action(key);
    if ((await button.count()) === 0 || !(await button.isVisible())) return 'absent';
    return (await button.isEnabled()) ? 'available' : 'disabled';
  }

  async clickAction(key: PlanDetailAction): Promise<void> {
    Logger.step(`Clicking the plan's "${key}" action`);
    await this.action(key).click();
  }

  /** Opens the Edit drawer from the header. */
  async openEdit(): Promise<PlanFormDialog> {
    await this.clickAction('edit');
    const form = new PlanFormDialog(this.page);
    await form.waitForOpen();
    await form.waitForPopulated();
    return form;
  }

  /** Opens the Inactivate drawer from the header. */
  async openInactivate(): Promise<PlanInactivateDialog> {
    await this.clickAction('inactivate');
    const drawer = new PlanInactivateDialog(this.page);
    await drawer.waitForOpen();
    return drawer;
  }

  /** Stages an inactivation from the header with `reason` (first offered when omitted). */
  async stageInactivation(details: string, reason?: string): Promise<void> {
    const drawer = await this.openInactivate();
    if (reason) await drawer.selectReason(reason);
    else await drawer.selectFirstReason();
    await drawer.fillDetails(details);
    await drawer.confirm();
    await this.waitForPageReady();
  }

  /** Activates from the header (confirmation dialog); returns what the server answered and the toast. */
  async attemptActivation(): Promise<{ status: number; text: string; toast: string }> {
    await this.clickAction('activate');
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    const outcome = await NetworkUtils.captureResponse(this.page, ApiEndpoints.planSetActive, () => dialog.confirm());
    const toast = await this.readToast();
    await dialog.cancel().catch(() => undefined);
    return { status: outcome?.status ?? 0, text: outcome?.text ?? '', toast };
  }

  /** Sends the staged change for approval from the header (confirming the dialog). */
  async submitForApproval(): Promise<void> {
    await this.clickAction('submit');
    // Waits for SubmitPlanForApproval's answer, not just the dialog closing: the
    // dialog closes at once, and a caller that navigated straight to the queue
    // cancelled the request in flight - 18992's clear never reached the queue
    // (2026-10-27).
    await NetworkUtils.captureResponse(this.page, ApiEndpoints.planSubmit, () => new ConfirmDialog(this.page).confirm('Send for Approval'));
    await this.waitForPageReady();
  }

  /** Clicks Delete and confirms; returns what DeletePlan answered and any messages shown. */
  async deleteAndCapture(): Promise<{ status: number; text: string; messages: string[] }> {
    await this.clickAction('delete');
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    // A plan awaiting approval asks "Return this plan to draft?" after Delete Plan.
    const outcome = await NetworkUtils.captureResponse(this.page, ApiEndpoints.planDelete, async () => {
      await dialog.confirmWithFollowUps();
    });
    // The toast renders just after DeletePlan answers; reading at once found none (19353, 2026-11-01).
    await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).first().waitFor({ state: 'visible', timeout: Timeouts.short }).catch(() => undefined);
    return { status: outcome?.status ?? 0, text: outcome?.text ?? '', messages: await this.readMessages() };
  }

  async readToast(): Promise<string> {
    return this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts()
      .then((t) => t.map((x) => x.trim()).filter((x) => x !== '').join(' '))
      .catch(() => '');
  }

  /** Every message on screen: toasts and the shared dialog's text. */
  async readMessages(): Promise<string[]> {
    const toasts = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
    const dialog = await this.page.locator('#pbm-dialog-message').allInnerTexts().catch(() => [] as string[]);
    return [...toasts, ...dialog].map((t) => t.trim()).filter((t) => t !== '');
  }

  // ---- tabs ----------------------------------------------------------------

  async getTabLabels(): Promise<string[]> {
    return (await this.byId(PLAN_DETAIL.tabs).locator('button').allInnerTexts()).map((t) => t.trim()).filter((t) => t !== '');
  }

  async hasTab(key: PlanDetailTab): Promise<boolean> {
    return (await this.tab(key).count()) > 0 && (await this.tab(key).isVisible());
  }

  async openTab(key: PlanDetailTab): Promise<void> {
    Logger.step(`Opening the plan's "${key}" tab`);
    await this.tab(key).click();
    await this.waitForPageReady();
  }

  async readOverviewField(field: PlanOverviewField): Promise<string> {
    return this.byId(PLAN_DETAIL.overview[field]).last().innerText({ timeout: Timeouts.short }).then((t) => t.trim()).catch(() => '');
  }

  /** Every Overview field, opening the tab first. */
  async readOverview(): Promise<Record<PlanOverviewField, string>> {
    await this.openTab('overview');
    const out = {} as Record<PlanOverviewField, string>;
    for (const field of Object.keys(PLAN_DETAIL.overview) as PlanOverviewField[]) out[field] = await this.readOverviewField(field);
    return out;
  }

  /** The breadcrumb's text ("Dashboard > Plans Mgmt > <name>"). */
  async getBreadcrumb(): Promise<string> {
    return this.byId('app-breadcrumb-list').innerText().then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
  }

  formulary(): PlanFormularyTab {
    return new PlanFormularyTab(this.page, this);
  }

  versions(): PlanVersionHistoryTab {
    return new PlanVersionHistoryTab(this.page, this);
  }

  audit(): AuditHistoryTab {
    return new AuditHistoryTab(this.page, this, PLAN_AUDIT, 'plan');
  }

  // ---- plan folder 24 / 29 / 30 additions (2026-10-27) ----

  /**
   * Asks the server for one plan AS THIS SESSION (GetPlan) and returns the raw
   * answer - for the out-of-scope case, where the status and wording matter
   * (Not Found, not Forbidden).
   */
  async requestPlanViaApi(planId: string): Promise<{ status: number; text: string }> {
    return NetworkUtils.postAsSession(this.page, ApiEndpoints.planGet, { id: planId });
  }

  /** The plan as GetPlan answers it for this session (throws when it is refused). */
  async readRecordViaApi(planId: string): Promise<PlanRecord> {
    return readPlan(this.page, planId);
  }

  /** The plan's displayed status as a lookup code ("active", "inactive", ...), read through the API. */
  async readStatusCodeViaApi(planId: string): Promise<string> {
    const record = await readPlan(this.page, planId);
    const byId = Object.fromEntries(Object.entries(await planStatusIds(this.page)).map(([code, id]) => [id, code]));
    const id = record.effectiveStatusId ?? record.statusId;
    return byId[id] ?? id;
  }

  /**
   * Stages an inactivation directly (POST InactivatePlan, first reason on the
   * lookup) - the "direct call" half of the permission and integration cases.
   * Returns what the server answered; nothing is submitted.
   */
  async requestInactivationViaApi(planId: string, details: string): Promise<{ status: number; text: string }> {
    const reasons = await planInactivationReasons(this.page);
    return NetworkUtils.postAsSession(this.page, ApiEndpoints.planInactivate, {
      id: planId,
      inactivationReasonId: reasons[0]?.id ?? null,
      inactivationDetails: details,
    });
  }

  /**
   * Stages an activation directly (POST SetPlanActive `{ id }` - the body is
   * INFERRED from InactivatePlan's, not yet verified live). Returns the answer.
   */
  async requestActivationViaApi(planId: string): Promise<{ status: number; text: string }> {
    return NetworkUtils.postAsSession(this.page, ApiEndpoints.planSetActive, { id: planId });
  }

  // ---- plan folder 07 / 22 additions (2026-10-27) ----

  /** The tab currently selected (aria-selected, or an active class), '' when none reads selected. */
  async getActiveTab(): Promise<PlanDetailTab | ''> {
    for (const key of Object.keys(PLAN_DETAIL.tab) as PlanDetailTab[]) {
      const tab = this.tab(key);
      const selected = await tab.getAttribute('aria-selected', { timeout: Timeouts.short }).catch(() => null);
      const className = (await tab.getAttribute('class', { timeout: Timeouts.short }).catch(() => '')) ?? '';
      if (selected === 'true' || /\b(is-)?active\b/.test(className)) return key;
    }
    return '';
  }

  /** The main content's whole text - the not-found / access-denied message when no plan rendered. */
  async getMainText(): Promise<string> {
    // locator-exception: the layout's content region has no id of its own; `main` / #app-layout is the shell's landmark.
    return (await this.page.locator('main, #app-layout').first().innerText().catch(() => '')).trim();
  }

  /** Clicks the breadcrumb link whose text matches `label` (e.g. the Plans list) and waits for the page to settle. */
  async openBreadcrumbLink(label: RegExp): Promise<void> {
    Logger.step(`Following the breadcrumb link ${label}`);
    // locator-exception: breadcrumb items carry no ids of their own; scoped to the trail's id and matched by text.
    const link = this.byId(APP_BREADCRUMB.list).locator('a').filter({ hasText: label }).first();
    await expect(link, `the breadcrumb should offer a link matching ${label}`).toBeVisible({ timeout: Timeouts.default });
    await link.click();
    await this.waitForPageReady();
  }

  /** A header action's explanatory tooltip (its `title`), '' when it has none or is absent. */
  async getActionMessage(key: PlanDetailAction): Promise<string> {
    const button = this.action(key);
    if ((await button.count()) === 0) return '';
    return (await button.getAttribute('title')) ?? '';
  }

  // ---- plan folder 08 additions (2026-10-27) ----

  /**
   * How this session is offered the Audit History tab: 'hidden' (no tab),
   * 'denied' (the tab is there but its timeline never renders - a permission
   * message instead), or 'shown' (the timeline's search box rendered).
   */
  async readAuditTabAccess(): Promise<'hidden' | 'denied' | 'shown'> {
    if (!(await this.hasTab('audit'))) return 'hidden';
    await this.openTab('audit');
    const shown = await this.byId(PLAN_AUDIT.searchInput)
      .waitFor({ state: 'visible', timeout: Timeouts.default })
      .then(() => true)
      .catch(() => false);
    return shown ? 'shown' : 'denied';
  }

  /** The browser's offset from UTC in minutes (UTC+5 reads 300) - the viewer's time zone, for the UTC case. */
  async getBrowserUtcOffsetMinutes(): Promise<number> {
    return this.page.evaluate(() => -new Date().getTimezoneOffset());
  }

  // ---- plan folder 21 additions (2026-10-27) ----

  /** One tab's label as rendered in the current language. */
  async getTabLabel(key: PlanDetailTab): Promise<string> {
    await expect(this.tab(key), `the "${key}" tab should be on screen`).toBeVisible({ timeout: Timeouts.default });
    return (await this.tab(key).innerText()).trim();
  }

  // ---- plan folder 22 / 23 additions (2026-10-27) ----

  /** Clicks the header's Activate and returns the confirmation it raises, left open. */
  async openActivationPrompt(): Promise<ConfirmDialog> {
    await this.clickAction('activate');
    const dialog = new ConfirmDialog(this.page);
    await dialog.waitForVisible();
    return dialog;
  }

  /**
   * Confirms an open activation prompt and reports what SetPlanActive answered
   * and the toast shown; closes the prompt if a refusal left it open. The
   * two-step counterpart of attemptActivation, for cases that check the prompt first.
   */
  async confirmActivationAndCapture(prompt: ConfirmDialog): Promise<{ status: number; text: string; toast: string }> {
    const outcome = await NetworkUtils.captureResponse(this.page, ApiEndpoints.planSetActive, () => prompt.confirm('activate'));
    const toast = await this.readToast();
    await prompt.cancel().catch(() => undefined);
    await this.waitForPageReady();
    return { status: outcome?.status ?? 0, text: outcome?.text ?? '', toast };
  }

  // ---- plan folder 05 additions (2026-10-27) ----

  /**
   * Requests the deletion of a PUBLISHED plan from the header: Delete (staged
   * as a draft), then Send for Approval when the header offers it (a deletion
   * the server already routed for approval is left as it is). Returns what
   * DeletePlan answered and the messages shown.
   */
  async requestDeletion(): Promise<{ status: number; text: string; messages: string[] }> {
    const result = await this.deleteAndCapture();
    await this.reload();
    await this.waitForLoaded();
    // The header draws its actions after the plan loads: an instant read found
    // no Send for Approval, so 19012's deletion stayed a "v1 · Draft" and never
    // reached the queue (2026-10-27). Give the staged draft time to show it.
    const offered = await expect
      .poll(() => this.getActionAvailability('submit'), { timeout: Timeouts.default, intervals: [500, 1_000, 2_000] })
      .toBe('available')
      .then(() => true)
      .catch(() => false);
    if (offered) await this.submitForApproval();
    return result;
  }

  /** Asks the server to delete a plan directly (DELETE DeletePlan/{id}) - the duplicate / stale-reference cases. */
  async requestDeletionViaApi(planId: string): Promise<{ status: number; text: string }> {
    return NetworkUtils.requestAsSession(this.page, 'DELETE', `${ApiEndpoints.planDelete}/${planId}`);
  }

  // ---- plan folder 19 additions (2026-10-27) ----

  /**
   * Tries Send for Approval from the header and reports the outcome instead of
   * insisting it worked - addressed by the OPEN plan, so it is unambiguous when
   * two plans share a name (the uniqueness cases). `offered` says whether the
   * header offered the action ('absent' / 'disabled' is itself a refusal,
   * reported with no request sent); every message shown is returned (toasts and
   * the dialog's text). Leaves no dialog open.
   */
  async attemptSubmit(): Promise<{ offered: 'absent' | 'disabled' | 'available'; status: number; text: string; messages: string[] }> {
    const offered = await this.getActionAvailability('submit');
    if (offered !== 'available') return { offered, status: 0, text: '', messages: [] };
    await this.clickAction('submit');
    const dialog = new ConfirmDialog(this.page);
    const outcome = await NetworkUtils.captureResponse(this.page, ApiEndpoints.planSubmit, () =>
      dialog.confirm('Send for Approval').catch(() => undefined));
    const messages = await this.settleMessages(() => this.readMessages());
    if (await dialog.isVisible()) await dialog.cancel().catch(() => undefined);
    await this.waitForPageReady();
    return { offered, status: outcome?.status ?? 0, text: outcome?.text ?? '', messages };
  }
}
