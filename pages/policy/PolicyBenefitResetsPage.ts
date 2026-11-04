import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AppRoutes } from '../../constants/AppRoutes';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import { BENEFIT_RESETS, POLICY_RESET, TOAST, buttonSelector } from '../../constants/ElementIds';
import { IN_FORCE_EMPTY } from '../../constants/policy/writerCIds';
import { WaitUtils } from '../../utils/WaitUtils';
import { Logger } from '../../utils/Logger';
import { policiesInForce, type PolicyInForce, type PolicyUploadFile } from '../../utils/PolicyProvisioning';

/** One Policies-in-force row as shown. */
export interface InForceRow {
  policyId: string;
  text: string;
  period: string;
  nextReset: string;
  members: string;
  used: string;
  resetOffered: boolean;
}

/**
 * Policy Benefit Resets (`/financial-benefits/reset-history`, System Settings >
 * Policy Benefit Resets), verified live 2026-11-03: title, subtitle ("Every
 * policy in force with its benefit year ... (System Administrators only)"), two
 * tabs - "Policies in force" (search "Search by policy number, name or payer";
 * table Policy, Benefit period, Next reset ("Ends with the policy on ..."),
 * Members, Benefit used ("Deductible: SAR 0.00 / SAR 100.00 Out-of-pocket: ...
 * Sublimit: ..."), Override, Reset now) and "Reset history" ("No resets have been
 * recorded yet."). Rows `reset-job-history-policy-row-{policyId}-*`. "In force"
 * = effective time passed, not inactive - a FUTURE policy whose effective time
 * passed is listed (verified). Data: GetPolicyBenefitYears.
 */
export class PolicyBenefitResetsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Opens the screen and waits until Policies in force has RENDERED its answer -
   * a row or the empty state (2026-11-04): the rows come after a placeholder, and
   * reading them as soon as the title showed found none on 2026-11-03 (19676 /
   * 19677) while the screenshot a moment later listed them.
   */
  async open(): Promise<void> {
    const answered = this.page.waitForResponse((r) => new URL(r.url()).pathname === ApiEndpoints.policyBenefitYears, { timeout: Timeouts.default }).catch(() => null);
    await this.goto(AppRoutes.policyBenefitResets);
    await expect(this.byId(BENEFIT_RESETS.title), 'the Policy Benefit Resets screen should load').toBeVisible({ timeout: Timeouts.default });
    await answered;
    await this.page.locator(`tr[id^="${BENEFIT_RESETS.policyRowPrefix}"][id$="-row"], #${IN_FORCE_EMPTY}`).first()
      .waitFor({ state: 'visible', timeout: Timeouts.default }).catch(() => undefined);
    await this.waitForPageReady();
  }

  /** The Policies in force empty state ("No policy is in force."), '' when not shown. */
  async getInForceEmptyText(): Promise<string> {
    const empty = this.byId(IN_FORCE_EMPTY);
    return (await empty.isVisible().catch(() => false)) ? (await empty.innerText()).replace(/\s+/g, ' ').trim() : '';
  }

  /** Navigates without expecting the screen (denied cases). */
  async openExpectingDenial(): Promise<void> {
    await this.goto(AppRoutes.policyBenefitResets);
  }

  async isLoaded(): Promise<boolean> {
    return this.byId(BENEFIT_RESETS.title).waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true).catch(() => false);
  }

  async getText(): Promise<string> {
    return (await this.byId(BENEFIT_RESETS.root).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  async openTab(tab: keyof typeof BENEFIT_RESETS.tab): Promise<void> {
    await this.page.locator(`#${BENEFIT_RESETS.tab[tab]}`).click();
    await this.waitForPageReady();
  }

  /** Searches Policies in force and waits for ITS GetPolicyBenefitYears answer. */
  async search(term: string): Promise<void> {
    Logger.step(`Benefit resets: searching "${term}"`);
    const input = this.byId(BENEFIT_RESETS.policiesSearch);
    const answered = this.page.waitForResponse((r) => /GetPolicyBenefitYears$/.test(r.url())
      && (r.request().postData() ?? '').includes(JSON.stringify(term).slice(1, -1)), { timeout: Timeouts.default }).catch(() => null);
    await input.fill(term);
    await input.press('Enter');
    await answered;
    await this.waitForPageReady();
  }

  private row(policyId: string): Locator {
    return this.byId(`${BENEFIT_RESETS.policyRowPrefix}${policyId}-row`);
  }

  async isListed(policyId: string): Promise<boolean> {
    return this.row(policyId).isVisible().catch(() => false);
  }

  /** Every in-force row on screen. */
  async readRows(): Promise<InForceRow[]> {
    const prefix = BENEFIT_RESETS.policyRowPrefix;
    return this.page.locator(`tr[id^="${prefix}"][id$="-row"]`).evaluateAll((trs, p) => trs.map((tr) => {
      const policyId = tr.id.slice(p.length, -'-row'.length);
      const read = (suffix: string): string => ((document.getElementById(`${p}${policyId}-${suffix}`) as HTMLElement | null)?.innerText ?? '').replace(/\s+/g, ' ').trim();
      return {
        policyId,
        text: (tr as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
        period: read('period'),
        nextReset: read('next-reset'),
        members: read('members'),
        used: read('used'),
        resetOffered: !!document.getElementById(`${p}${policyId}-reset-button`),
      };
    }), prefix);
  }

  async readRow(policyId: string): Promise<InForceRow | undefined> {
    return (await this.readRows()).find((r) => r.policyId === policyId);
  }

  /** The column headers of Policies in force. */
  async getHeaders(): Promise<string[]> {
    return (await this.byId(BENEFIT_RESETS.policiesTable).locator('th').allInnerTexts()).map((t) => t.trim()).filter((t) => t !== '');
  }

  /** Reset now on a policy's row -> the Reset policy benefits drawer. */
  async openReset(policyId: string): Promise<PolicyResetDrawer> {
    await this.page.locator(buttonSelector(`${BENEFIT_RESETS.policyRowPrefix}${policyId}-reset-button`)).first().click();
    const drawer = new PolicyResetDrawer(this.page);
    await drawer.waitForOpen();
    return drawer;
  }

  async fetchInForce(searchText = ''): Promise<PolicyInForce[]> {
    return policiesInForce(this.page, searchText);
  }
}

/** What Reset benefits answered. */
export interface ResetAnswer {
  status: number;
  text: string;
  body: Record<string, unknown> | null;
  messages: string[];
}

/**
 * The Reset policy benefits drawer (`policy-reset-dialog`), verified live
 * 2026-11-03: notice "POL-... — <name>: Every member of this policy (n) starts a
 * fresh benefit period today, from zero. ... until the benefit year ends on
 * ...", "Used so far in the current period — Deductible: SAR x / SAR y ...",
 * Reason (required, max 1000), New deal / contract (PDF, up to 10 MB), "Terms
 * for the rest of the benefit year" (Deductible, Coinsurance %, Out-of-pocket
 * maximum, Sublimit - placeholders show the policy's own values), Cancel /
 * Reset benefits. Sends ResetPolicyBenefits; a policy whose period starts
 * TODAY is refused (409, see SERVER_MESSAGE.resetSameDay).
 */
export class PolicyResetDrawer {
  constructor(private readonly page: Page) {}

  private byId(id: string): Locator {
    return this.page.locator(`#${id}`);
  }

  async waitForOpen(): Promise<void> {
    await expect(this.byId(POLICY_RESET.title), 'the Reset policy benefits drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  async getNotice(): Promise<string> {
    const title = await this.byId(POLICY_RESET.noticeTitle).innerText().catch(() => '');
    const text = await this.byId(POLICY_RESET.notice).innerText().catch(() => '');
    return `${title} ${text}`.replace(/\s+/g, ' ').trim();
  }

  async getUsed(): Promise<string> {
    return (await this.byId(POLICY_RESET.used).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  async getText(): Promise<string> {
    return (await this.byId(POLICY_RESET.root).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** The placeholders of the four terms (the policy's own values: "SAR 100.00", "20%" ...). */
  async getTermPlaceholders(): Promise<Record<'deductible' | 'coinsurance' | 'outOfPocket' | 'sublimit', string>> {
    const ph = async (id: string) => (await this.byId(id).getAttribute('placeholder')) ?? '';
    return { deductible: await ph(POLICY_RESET.deductible), coinsurance: await ph(POLICY_RESET.coinsurance), outOfPocket: await ph(POLICY_RESET.outOfPocket), sublimit: await ph(POLICY_RESET.sublimit) };
  }

  async typeReason(text: string): Promise<void> {
    await this.byId(POLICY_RESET.reason).fill(text);
  }

  async getReasonMaxLength(): Promise<number | null> {
    const raw = await this.byId(POLICY_RESET.reason).getAttribute('maxlength');
    return raw === null ? null : Number(raw);
  }

  async typeTerm(term: 'deductible' | 'coinsurance' | 'outOfPocket' | 'sublimit', value: string): Promise<void> {
    const input = this.byId(POLICY_RESET[term]);
    await input.click();
    await input.press('ControlOrMeta+a');
    await input.pressSequentially(value);
    await input.blur();
  }

  async attach(file: PolicyUploadFile): Promise<void> {
    await this.byId(POLICY_RESET.attachment).setInputFiles(file);
  }

  async getReasonError(): Promise<string> {
    return (await this.byId(POLICY_RESET.reasonError).innerText({ timeout: Timeouts.short }).catch(() => '')).trim();
  }

  /** Clicks Reset benefits (confirming a follow-up prompt) and reports ResetPolicyBenefits' answer (-1 = refused client-side). */
  async attemptReset(): Promise<ResetAnswer> {
    const answered = this.page.waitForResponse((r) => new URL(r.url()).pathname === ApiEndpoints.policyResetBenefits, { timeout: Timeouts.default }).catch(() => null);
    await this.page.locator(buttonSelector(POLICY_RESET.save)).first().click();
    const dialog = new ConfirmDialog(this.page);
    if (await dialog.isVisible()) await dialog.confirmWithFollowUps().catch(() => undefined);
    const response = await answered;
    let body: Record<string, unknown> | null = null;
    try { body = response ? (response.request().postDataJSON() as Record<string, unknown>) : null; } catch { body = null; }
    const messages = await WaitUtils.settleMessages(async () => {
      const own = await this.page.locator(`[id^="${POLICY_RESET.root}-"][id$="-error"]`).filter({ visible: true }).allInnerTexts().catch(() => [] as string[]);
      const toast = await this.page.locator(`#${TOAST.summary}, #${TOAST.detail}`).allInnerTexts().catch(() => [] as string[]);
      return [...own, ...toast].map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t !== '');
    });
    return { status: response?.status() ?? -1, text: response ? await response.text().catch(() => '') : '', body, messages };
  }

  async cancel(): Promise<void> {
    await this.page.locator(buttonSelector(POLICY_RESET.cancel)).first().click();
    const dialog = new ConfirmDialog(this.page);
    if (await dialog.isDiscardPromptVisible()) await dialog.discardChanges();
    await expect(this.byId(POLICY_RESET.title)).toBeHidden({ timeout: Timeouts.default });
  }
}
