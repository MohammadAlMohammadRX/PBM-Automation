import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import { PLAN_FORMULARY_TAB, PLAN_FORMULARY_TAB_EXTRA, TOAST, buttonSelector } from '../../constants/ElementIds';
import { NetworkUtils } from '../../utils/NetworkUtils';
import { Logger } from '../../utils/Logger';
import { formularyStatusIds, listFormularies } from '../../utils/FormularyProvisioning';

/** What the tab needs from the plan detail screen. */
export interface PlanFormularyHost {
  openTab(tab: 'formulary'): Promise<void>;
  waitForPageReady(): Promise<void>;
}

/** One entry of GetPlanFormularyHistory - a formulary the plan has had, per version. */
export interface PlanFormularyHistoryEntry {
  planVersionId: string;
  version: number;
  isCurrent: boolean;
  formularyId: string;
  formularyCode: string;
  formularyNameEn: string;
  tierCount: number;
  tradeCount: number;
  effectiveDate: string;
  expiryDate: string;
  [key: string]: unknown;
}

/**
 * The plan detail's Formulary Assignment tab, verified 2026-10-27.
 *
 * With no formulary: a picker ("Select a formulary", options read
 * "<name> — <code> · <from> - <to>") and an Assign Formulary button, which calls
 * POST /api/Plans/AssignFormularyToPlan. With one: its card, a state badge
 * ("Draft Assignment", "Pending Approval", "Future", ...), View and Remove.
 *
 * Note (2026-10-27): the picker offers Pending formularies that the server then
 * refuses ("Only an active formulary can be assigned to a plan.").
 */
export class PlanFormularyTab {
  constructor(
    private readonly page: Page,
    private readonly detail: PlanFormularyHost,
  ) {}

  async open(): Promise<void> {
    await this.detail.openTab('formulary');
    await this.detail.waitForPageReady();
  }

  /** The formularies the picker offers, as their option labels. */
  async getOfferedFormularies(): Promise<string[]> {
    // The options load on demand after the tab renders; 18999 read the list
    // before it arrived and saw none (2026-10-27). Wait for the picker, then
    // for its options, opening it once more if the first click came too early.
    const select = this.page.locator(`#${PLAN_FORMULARY_TAB.select}`);
    await select.waitFor({ state: 'visible', timeout: Timeouts.default });
    const options = this.page.getByRole('option').filter({ visible: true });
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      await select.click();
      const loaded = await options.first().waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true).catch(() => false);
      if (loaded) break;
      await this.page.keyboard.press('Escape');
    }
    const labels = (await options.allInnerTexts()).map((t) => t.trim()).filter((t) => t !== '');
    await this.page.keyboard.press('Escape');
    return labels;
  }

  /** Whether the picker is on screen (only while no formulary is assigned). */
  async isPickerShown(): Promise<boolean> {
    // Wait for the tab to settle into one of its two states - the picker (no
    // formulary) or the assigned card's View button. An instant check ran
    // before the tab rendered and reported no picker while it was on screen
    // (18989, 18997 - 2026-10-27).
    const picker = this.page.locator(`#${PLAN_FORMULARY_TAB.select}`);
    const assigned = this.page.locator(`#${PLAN_FORMULARY_TAB.viewButton}`);
    await picker.or(assigned).first().waitFor({ state: 'visible', timeout: Timeouts.default }).catch(() => undefined);
    return picker.isVisible().catch(() => false);
  }

  /**
   * Picks the formulary whose option label contains `codeOrName` and clicks
   * Assign Formulary; returns what AssignFormularyToPlan answered (null when the
   * screen sent nothing).
   */
  async assign(codeOrName: string): Promise<{ status: number; body: unknown; text: string } | null> {
    Logger.step(`Assigning formulary "${codeOrName}" to the plan`);
    await this.page.locator(`#${PLAN_FORMULARY_TAB.select}`).click();
    await this.page.getByRole('option').filter({ visible: true }).filter({ hasText: codeOrName }).first().click();
    return NetworkUtils.captureResponse(this.page, ApiEndpoints.planAssignFormulary, () =>
      this.page.locator(buttonSelector(PLAN_FORMULARY_TAB.assignButton)).first().click());
  }

  /** Clicks Remove on the assigned formulary, confirming if asked. */
  async remove(): Promise<void> {
    Logger.step('Removing the plan\'s formulary');
    await this.page.locator(buttonSelector(PLAN_FORMULARY_TAB.removeButton)).first().click();
    const dialog = this.page.locator('#pbm-dialog');
    if (await dialog.waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true).catch(() => false)) {
      await this.page.locator(buttonSelector('pbm-dialog-action-submit')).first().click();
    }
    await this.detail.waitForPageReady();
  }

  /** The assignment's state badge, '' when none shows. */
  async getStateBadge(): Promise<string> {
    return this.page.locator(`#${PLAN_FORMULARY_TAB.stateBadge}`).first().innerText({ timeout: Timeouts.short }).then((t) => t.trim()).catch(() => '');
  }

  /** The tab's whole visible text (the assigned formulary's card, or the picker). */
  async getPanelText(): Promise<string> {
    const anchor = this.page.locator(`#${PLAN_FORMULARY_TAB.viewButton}, #${PLAN_FORMULARY_TAB.select}`).first();
    await expect(anchor, 'the Formulary Assignment tab should render').toBeVisible({ timeout: Timeouts.default });
    return (await anchor.locator('xpath=ancestor::*[contains(@id,"plan-detail")][1]').innerText().catch(() => '')).trim();
  }

  /** Whether the Remove control is offered. */
  async offersRemove(): Promise<boolean> {
    return this.page.locator(`#${PLAN_FORMULARY_TAB.removeButton}`).isVisible().catch(() => false);
  }

  /** The current and published formulary, as GetPlanFormularyAssignment answers. */
  async readAssignmentViaApi(planId: string): Promise<Record<string, unknown>> {
    const res = await NetworkUtils.postAsSession(this.page, ApiEndpoints.planFormularyAssignment, { id: planId });
    return res.status < 300 ? (JSON.parse(res.text) as { payload: Record<string, unknown> }).payload ?? {} : {};
  }

  /** Every formulary the plan has had, per version (GetPlanFormularyHistory). */
  async readHistoryViaApi(planId: string): Promise<PlanFormularyHistoryEntry[]> {
    const res = await NetworkUtils.postAsSession(this.page, ApiEndpoints.planFormularyHistory, { planId });
    return res.status < 300 ? (JSON.parse(res.text) as { payload: PlanFormularyHistoryEntry[] }).payload ?? [] : [];
  }

  /** Assigns through the API, for the server-side refusal cases (cross-payer, inactive...). */
  async assignViaApi(planId: string, formularyId: string): Promise<{ status: number; text: string }> {
    return NetworkUtils.postAsSession(this.page, ApiEndpoints.planAssignFormulary, { planId, formularyId });
  }

  // ---- plan folder 30 additions (2026-10-27) ----

  /**
   * A formulary's OWN status as a lookup code ("active", "inactive", ...), read
   * from the Formulary register (utils/FormularyProvisioning) - the "open the
   * linked formulary in the Formulary module" step of the isolation story, for
   * which no Formulary Page Object exists yet. '' when it is not in the register.
   */
  async readFormularyStatusViaApi(formularyId: string): Promise<string> {
    const byId = Object.fromEntries(Object.entries(await formularyStatusIds(this.page)).map(([code, id]) => [id, code]));
    const formulary = (await listFormularies(this.page)).find((f) => f.id === formularyId);
    return formulary ? (byId[formulary.statusId] ?? formulary.statusId) : '';
  }

  /** The id of the formulary currently assigned to the plan (GetPlan's `formularyId`), '' when none. */
  async readAssignedFormularyIdViaApi(planId: string): Promise<string> {
    const res = await NetworkUtils.postAsSession(this.page, ApiEndpoints.planGet, { id: planId });
    return res.status < 300 ? String((JSON.parse(res.text) as { payload?: { formularyId?: string | null } }).payload?.formularyId ?? '') : '';
  }

  // ---- plan folder 04 / 20 / 21 additions (2026-10-27) ----

  /** The codes of the formularies the picker offers, parsed from "<name> — <code> · <from> - <to>". */
  async getOfferedFormularyCodes(): Promise<string[]> {
    return (await this.getOfferedFormularies())
      .map((label) => label.match(/ — (\S+)/)?.[1] ?? '')
      .filter((code) => code !== '');
  }

  /** Opens the picker and returns its overlay's whole text - the empty-state message when it offers nothing. */
  async readPickerOverlayText(): Promise<string> {
    await this.page.locator(`#${PLAN_FORMULARY_TAB.select}`).click();
    // locator-exception: the PrimeNG select overlay is appended to <body> and carries no app id.
    const overlay = this.page.locator('.p-select-overlay').filter({ visible: true }).last();
    const text = await overlay.innerText({ timeout: Timeouts.short }).then((t) => t.trim()).catch(() => '');
    await this.page.keyboard.press('Escape');
    return text;
  }

  /**
   * Clicks Assign Formulary with nothing picked. Reports whether an
   * AssignFormularyToPlan request went out, and every message then on screen.
   */
  async attemptAssignWithoutSelection(): Promise<{ sent: boolean; messages: string[] }> {
    Logger.step('Clicking Assign Formulary with no formulary selected');
    const outcome = await NetworkUtils.captureResponse(this.page, ApiEndpoints.planAssignFormulary, () =>
      this.page.locator(buttonSelector(PLAN_FORMULARY_TAB.assignButton)).first().click(), Timeouts.short);
    return { sent: outcome !== null, messages: await this.readMessages() };
  }

  /**
   * Replaces the assigned formulary the way the tab allows it: Remove (staged as
   * a draft), then pick `codeOrName` and Assign. Returns what the Assign answered.
   */
  async replaceWith(codeOrName: string): Promise<{ status: number; body: unknown; text: string } | null> {
    await this.remove();
    await expect(this.page.locator(`#${PLAN_FORMULARY_TAB.select}`), 'the picker should return once the formulary is removed')
      .toBeVisible({ timeout: Timeouts.default });
    return this.assign(codeOrName);
  }

  /**
   * Every assignment card on the tab - one per formulary the plan has had, per
   * version - as its text ("<name> <code> · v<n> · <t> Tiers · <r> Trades ...
   * Effective ... Expires ... Assigned by ...") and its state badge
   * ("Active Assignment", "Previous Assignment", "Draft Assignment", ...).
   */
  async readAssignmentCards(): Promise<{ text: string; badge: string }[]> {
    await this.page.locator(`#${PLAN_FORMULARY_TAB.viewButton}, #${PLAN_FORMULARY_TAB.select}`).first()
      .waitFor({ state: 'visible', timeout: Timeouts.default }).catch(() => undefined);
    // locator-exception: the cards carry no id; each is reached from its state badge (which shares one id) by DOM ancestry.
    return this.page.locator(`[id="${PLAN_FORMULARY_TAB.stateBadge}"]`).evaluateAll((badges) =>
      badges.map((badge) => {
        const card = badge.closest('[class*="fcard"]:not([class*="fcard-"])') ?? badge.parentElement;
        return {
          text: ((card as HTMLElement | null)?.innerText ?? '').replace(/\s+/g, ' ').trim(),
          badge: (badge as HTMLElement).innerText.trim(),
        };
      }));
  }

  /** Every message on screen: toasts and the picker's field error. */
  async readMessages(): Promise<string[]> {
    const toasts = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
    const field = await this.page.locator(`#${PLAN_FORMULARY_TAB_EXTRA.selectError}`).allInnerTexts().catch(() => [] as string[]);
    return [...toasts, ...field].map((t) => t.trim()).filter((t) => t !== '');
  }

  /**
   * The formulary the plan's LIVE version carries (the history entry marked
   * `isCurrent`), '' when none - unlike GetPlan's `formularyId`, unaffected by
   * a change still staged or awaiting approval.
   */
  async readLiveFormularyIdViaApi(planId: string): Promise<string> {
    return (await this.readHistoryViaApi(planId)).find((entry) => entry.isCurrent)?.formularyId ?? '';
  }

  /**
   * What the picker offers, each option matched to the Formulary register:
   * its code, status code ("active", "inactive", "pending", ...; '' when the
   * register does not know it) and owning payer id.
   */
  async readOfferedFormularies(): Promise<{ code: string; statusCode: string; payerId: string }[]> {
    const codes = await this.getOfferedFormularyCodes();
    const byStatusId = Object.fromEntries(Object.entries(await formularyStatusIds(this.page)).map(([code, id]) => [id, code]));
    const register = await listFormularies(this.page);
    return codes.map((code) => {
      const match = register.find((f) => f.formularyCode === code || f.formularyNameEn === code);
      return { code, statusCode: match ? (byStatusId[match.statusId] ?? match.statusId) : '', payerId: match?.payerId ?? '' };
    });
  }

  /**
   * Tries to attach `formularyId` to the plan by every path the API exposes
   * besides the tab's own picker - the direct assignment call (URL
   * manipulation), UpdatePlan and CreatePlan carrying a `formularyId` (the
   * bulk-edit / copy equivalents). Reports, per path, what the server
   * answered and whether the plan it touched ended up carrying the formulary.
   * A plan CreatePlan made is discarded again.
   */
  async tryAlternateAssignmentPaths(planId: string, formularyId: string): Promise<{ path: string; status: number; text: string; carried: boolean }[]> {
    const carries = async (id: string): Promise<boolean> => (await this.readAssignedFormularyIdViaApi(id)) === formularyId;
    const results: { path: string; status: number; text: string; carried: boolean }[] = [];

    const direct = await this.assignViaApi(planId, formularyId);
    results.push({ path: 'AssignFormularyToPlan (direct request)', status: direct.status, text: direct.text, carried: await carries(planId) });

    const current = await NetworkUtils.postAsSession(this.page, ApiEndpoints.planGet, { id: planId });
    const record = current.status < 300 ? (JSON.parse(current.text) as { payload: Record<string, unknown> }).payload : {};
    const updated = await NetworkUtils.requestAsSession(this.page, 'PUT', ApiEndpoints.planUpdate, { ...record, id: planId, formularyId });
    results.push({ path: 'UpdatePlan with formularyId', status: updated.status, text: updated.text, carried: await carries(planId) });

    const created = await NetworkUtils.postAsSession(this.page, ApiEndpoints.planCreate, {
      ...record,
      id: undefined,
      planNameEn: `${String(record.planNameEn ?? 'Plan')} Copy`,
      formularyId,
    });
    const createdId = created.status < 300 ? String((JSON.parse(created.text) as { payload?: { id?: string } }).payload?.id ?? '') : '';
    results.push({ path: 'CreatePlan with formularyId', status: created.status, text: created.text, carried: createdId ? await carries(createdId) : false });
    if (createdId) await NetworkUtils.requestAsSession(this.page, 'DELETE', `${ApiEndpoints.planDelete}/${createdId}`).catch(() => undefined);
    return results;
  }

  /** Assigns through the API with `formularyId` null - the Remove call - for the clear-the-formulary cases. */
  async clearViaApi(planId: string): Promise<{ status: number; text: string }> {
    return NetworkUtils.postAsSession(this.page, ApiEndpoints.planAssignFormulary, { planId, formularyId: null });
  }
}
