import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { readSelectOptions } from '../components/PrimeControls';
import { AppRoutes } from '../../constants/AppRoutes';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { Timeouts } from '../../constants/Timeouts';
import { MEMBER_ACCUMULATOR, buttonSelector } from '../../constants/ElementIds';
import { NetworkUtils } from '../../utils/NetworkUtils';

/** The section texts of the accumulator page (none of its values carries an id). */
export interface AccumulatorSections {
  header: string;
  individual: string;
  policyLevel: string;
  sublimits: string;
}

/**
 * The Member Benefit Accumulator page (`/financial-benefits/accumulator/{policyMemberId}`),
 * reached from a member row's View Accumulator (verified live 2026-11-03). It is a
 * PAGE, not a drawer: breadcrumb "Dashboard > Member Benefit Accumulator", Back.
 * Sections: the member (name, MBR-number) with the "Benefit Period" select
 * ("03/11/2026 – 02/01/2027 (current)"), "Individual" (Deductible, Out-of-Pocket
 * "0.00 SAR of 10.00 SAR 0%"), "Policy-Level Benefit" (Policy Deductible /
 * Coinsurance / Out-of-Pocket Maximum / Sublimit - "None" when the policy has
 * none) and "Sublimits and trade sub-caps" ("No sublimits consumed in this
 * period."). Data: GetMemberAccumulator `{ policyMemberId }`.
 */
export class MemberAccumulatorPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async open(policyMemberId: string): Promise<void> {
    await this.goto(`${AppRoutes.memberAccumulator}/${policyMemberId}`);
    await this.waitForLoaded();
  }

  async waitForLoaded(): Promise<void> {
    await expect(this.byId(MEMBER_ACCUMULATOR.root), 'the accumulator page should load').toBeVisible({ timeout: Timeouts.default });
    // The root renders at once with a "Loading..." placeholder; wait for the member's data (2026-11-05: read while still loading).
    await expect.poll(async () => (await this.byId(MEMBER_ACCUMULATOR.root).innerText().catch(() => '')).replace(/\s+/g, ' ').trim(), { message: 'the accumulator page should finish loading', timeout: Timeouts.default })
      .not.toMatch(/^(Loading\b.*)?$/i);
    await this.waitForPageReady();
  }

  /** The whole page text. */
  async getText(): Promise<string> {
    return (await this.byId(MEMBER_ACCUMULATOR.root).innerText()).replace(/\s+/g, ' ').trim();
  }

  /** The page split at its section titles (Individual, Policy-Level Benefit, Sublimits and trade sub-caps). */
  async readSections(): Promise<AccumulatorSections> {
    const text = await this.getText();
    const cut = (from: string, to?: string): string => {
      const start = text.indexOf(from);
      if (start < 0) return '';
      const end = to ? text.indexOf(to, start) : -1;
      return text.slice(start, end > start ? end : undefined).trim();
    };
    return {
      header: text.slice(0, Math.max(0, text.indexOf('Individual'))).trim(),
      individual: cut('Individual', 'Policy-Level Benefit'),
      policyLevel: cut('Policy-Level Benefit', 'Sublimits and trade sub-caps'),
      sublimits: cut('Sublimits and trade sub-caps'),
    };
  }

  /** The Benefit Period select's value and options. */
  async readPeriod(): Promise<{ value: string; options: string[]; range: string; ends: string }> {
    const select = this.byId(MEMBER_ACCUMULATOR.periodSelect);
    const read = (id: string) => this.byId(id).innerText({ timeout: Timeouts.short }).then((t) => t.trim()).catch(() => '');
    return {
      value: (await select.innerText()).trim(),
      options: await readSelectOptions(this.page, select),
      range: await read(MEMBER_ACCUMULATOR.periodRange),
      ends: await read(MEMBER_ACCUMULATOR.periodEnds),
    };
  }

  async back(): Promise<void> {
    await this.page.locator(buttonSelector(MEMBER_ACCUMULATOR.back)).first().click();
    await this.waitForPageReady();
  }

  /** GetMemberAccumulator as the page reads it. */
  async fetch(policyMemberId: string): Promise<Record<string, unknown> | null> {
    const res = await NetworkUtils.postAsSession(this.page, ApiEndpoints.memberAccumulator, { policyMemberId });
    try {
      return (JSON.parse(res.text) as { payload: Record<string, unknown> }).payload ?? null;
    } catch {
      return null;
    }
  }
}
