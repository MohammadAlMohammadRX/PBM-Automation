import type { Locator, Page } from '@playwright/test';
import { Timeouts } from '../../constants/Timeouts';
import { buttonSelector } from '../../constants/ElementIds';
import {
  MEMBER_DASHBOARD,
  MEMBER_DETAIL,
  type MemberDashboardAccumulatorField,
  type MemberDashboardBenefitField,
  type MemberDashboardPolicyField,
} from '../../constants/member/memberIds';
import { Logger } from '../../utils/Logger';
import { readMember, type MemberBenefitPolicy } from '../../utils/MemberProvisioning';

/** One policy as the tab shows it. */
export interface DashboardPolicyView {
  policy: Record<MemberDashboardPolicyField, string>;
  benefit: Record<MemberDashboardBenefitField, string>;
  accumulator: Record<MemberDashboardAccumulatorField, string>;
  accumulatorsYear: string;
}

/**
 * The PBM Accumulator Dashboard tab (verified live 2026-11-05, a suite member
 * enrolled in two approved suite policies). Member card: initials, name,
 * status, Member ID (MBR-...), Benefit Year (read "—" even with policies),
 * Policies (count). One policy at a time; "COB Policy 1", "COB Policy 2" ...
 * buttons switch (COB Policy 1 = the coverage order's primary). Policy:
 * Policy Number, Plan, Payer, PBM Member ID (= the member code), Relationship,
 * Policy Status (Future for a just-approved policy), Effective Period
 * ("05/11/2026 02:13 – 03/02/2027 02:09"). Policy-Level Benefit: Policy
 * Deductible ("None" for 0, "SAR 100.00"), Coinsurance ("20%"),
 * Out-of-Pocket Maximum, Sublimit. Accumulators & Sublimits "Benefit year
 * 2026-11-05" + View full accumulator, Deductible met ("SAR 0.00" + "No cap on
 * this policy" | "SAR 100.00 remaining 0%"), Out-of-pocket met, Policy
 * sublimit used, Trade sub-caps in use, "Benefit period 05/11/2026 –
 * 03/02/2027 · ends with the policy", "No claims have posted in this benefit
 * period yet.". No policy: "No active benefit policy found.". The tab is
 * read-only. Data: GetMember `benefitPolicies` (approved enrolments only - a
 * DRAFT enrolment is not listed).
 */
export class MemberAccumulatorDashboardTab {
  constructor(private readonly page: Page) {}

  private byId(id: string): Locator {
    return this.page.locator(`#${id}`);
  }

  async open(): Promise<void> {
    Logger.step("Opening the member's PBM Accumulator Dashboard tab");
    await this.byId(MEMBER_DETAIL.tab.dashboard).click();
    await this.byId(MEMBER_DASHBOARD.memberId).waitFor({ state: 'visible', timeout: Timeouts.default }).catch(() => undefined);
  }

  /** The tab's whole text. */
  async getText(): Promise<string> {
    return (await this.byId(MEMBER_DETAIL.root).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** The member card: Member ID, Benefit Year, Policies. */
  async readMemberCard(): Promise<{ memberId: string; benefitYear: string; policiesCount: string }> {
    const read = async (id: string): Promise<string> => (await this.byId(id).innerText({ timeout: Timeouts.short }).catch(() => '')).replace(/\s+/g, ' ').trim();
    return { memberId: await read(MEMBER_DASHBOARD.memberId), benefitYear: await read(MEMBER_DASHBOARD.benefitYear), policiesCount: await read(MEMBER_DASHBOARD.policiesCount) };
  }

  /** "No active benefit policy found." when the member holds none, else ''. */
  async getNoPolicyText(): Promise<string> {
    return (await this.getText()).includes('No active benefit policy found.') ? 'No active benefit policy found.' : '';
  }

  /** The COB Policy buttons' labels ("COB Policy 1", "COB Policy 2"); [] with a single policy. */
  async readCobButtons(): Promise<string[]> {
    return (await this.page.locator(buttonSelector(MEMBER_DASHBOARD.selectCob)).allInnerTexts()).map((t) => t.trim()); // locator-exception: every COB Policy button shares the id.
  }

  /** Clicks "COB Policy n" (1-based). */
  async selectCobPolicy(n: number): Promise<void> {
    await this.page.locator(buttonSelector(MEMBER_DASHBOARD.selectCob)).nth(n - 1).click(); // locator-exception: every COB Policy button shares the id.
    await this.page.waitForTimeout(300);
  }

  /** Which COB Policy button is selected (1-based; 0 when none is marked). */
  async selectedCobPolicy(): Promise<number> {
    const states = await this.page.locator(buttonSelector(MEMBER_DASHBOARD.selectCob)).evaluateAll((buttons) =>
      buttons.map((b) => b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-selected') === 'true' || b.classList.contains('is-active'))); // locator-exception: every COB Policy button shares the id.
    return states.indexOf(true) + 1;
  }

  /** The shown policy's details, benefit terms and accumulators, by field. */
  async readPolicy(): Promise<DashboardPolicyView> {
    const read = async (id: string): Promise<string> => (await this.byId(id).innerText({ timeout: Timeouts.short }).catch(() => '')).replace(/\s+/g, ' ').trim();
    const section = async <K extends string>(ids: Record<K, string>): Promise<Record<K, string>> => {
      const out = {} as Record<K, string>;
      for (const [key, id] of Object.entries(ids) as [K, string][]) out[key] = await read(id);
      return out;
    };
    return {
      policy: await section(MEMBER_DASHBOARD.policy),
      benefit: await section(MEMBER_DASHBOARD.benefit),
      accumulator: await section(MEMBER_DASHBOARD.accumulator),
      accumulatorsYear: await read(MEMBER_DASHBOARD.accumulatorsYear),
    };
  }

  /** Every policy, clicking through the COB Policy buttons in order. */
  async readAllPolicies(): Promise<DashboardPolicyView[]> {
    const count = Math.max(1, (await this.readCobButtons()).length);
    const out: DashboardPolicyView[] = [];
    for (let n = 1; n <= count; n += 1) {
      if (count > 1) await this.selectCobPolicy(n);
      out.push(await this.readPolicy());
    }
    return out;
  }

  async isViewAccumulatorOffered(): Promise<boolean> {
    return this.page.locator(buttonSelector(MEMBER_DASHBOARD.viewAccumulator)).first().isVisible().catch(() => false);
  }

  /** "View full accumulator" -> `/financial-benefits/accumulator/{policyMemberId}`; returns the URL reached. */
  async viewFullAccumulator(): Promise<string> {
    await this.page.locator(buttonSelector(MEMBER_DASHBOARD.viewAccumulator)).first().click();
    await this.page.waitForURL(/\/financial-benefits\/accumulator\//, { timeout: Timeouts.default });
    return this.page.url();
  }

  /** The tab's data through the API (GetMember `benefitPolicies`, in the screen's order). */
  async fetchPolicies(memberId: string): Promise<MemberBenefitPolicy[]> {
    return (await readMember(this.page, memberId)).benefitPolicies;
  }
}
