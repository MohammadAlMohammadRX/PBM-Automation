import { test, expect } from '../../../fixtures';
import { BLOCKED_CASES, CASES, OVERLAP } from '../../../data/policy/benefitCalculations.data';
import { addBenefitConfig, answerText, minutesFromNow, readBenefitConfigs } from '../../../utils/FormularyProvisioning';

const DAY_MINUTES = 24 * 60;

/**
 * User story 18370: Sublimit / Deductible / Out-of-Pocket and effective-period
 * calculations - the two non-Manual cases. The drug benefit configuration is a
 * formulary trade's Benefit Configuration, on the case's own Draft formulary
 * (data/policy/benefitCalculations.data.ts).
 */
test.describe('US 18370 - Sublimit/Deductible/Out-of-Pocket and effective-period calculations', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.noOverlappingPeriods.azureId}: should reject a second effective period that overlaps the first for the same drug`, async ({
    page,
    policyManagementPage,
    formularyDetailPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.noOverlappingPeriods;
    // A formulary period long enough to hold both periods, so only their overlap can be refused.
    const formulary = await formularyIn('Draft', { tiers: 1, trades: 1, expiryInDays: 600 });
    const trade = formulary.trades[0];
    const start1 = minutesFromNow(data.period1.startInDays * DAY_MINUTES);
    const start2 = minutesFromNow(data.period2.startInDays * DAY_MINUTES);
    const plusDays = (iso: string, days: number): string => new Date(Date.parse(iso) + days * 86_400_000).toISOString();

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.countRows()).toBeGreaterThan(0);
    });

    await steps.critical('Open the drug benefit configuration and define an effective period with Sublimit, Deductible and Out-of-Pocket - the first period is saved', async () => {
      await formularyDetailPage.open(formulary.id);
      await formularyTradesTab.open();
      const first = await addBenefitConfig(page, trade.id, { ...data.terms, benefitEffectiveDate: start1, benefitEndDate: plusDays(start1, data.period1.lengthDays) });
      expect(first.id, `AddBenefitConfig answered ${first.status} ${answerText(first).slice(0, 200)}`).not.toBeNull();
      const saved = (await readBenefitConfigs(page, trade.id)).find((b) => b.id === first.id);
      expect(saved).toMatchObject({ deductible: data.terms.deductible, outOfPocketMaximum: data.terms.outOfPocketMaximum, sublimitAmount: data.terms.sublimitAmount });
    });

    await steps.step('Attempt to add a second period for the same drug overlapping the first - it is rejected with a validation error', async () => {
      const second = await addBenefitConfig(page, trade.id, { ...data.terms, benefitEffectiveDate: start2, benefitEndDate: plusDays(start2, data.period2.lengthDays) });
      expect(second.status, `AddBenefitConfig answered ${second.status} ${answerText(second).slice(0, 200)}`).toBeGreaterThanOrEqual(400);
      expect(answerText(second)).toMatch(OVERLAP);
      expect((await readBenefitConfigs(page, trade.id)).length, 'only the first period is kept').toBe(1);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
