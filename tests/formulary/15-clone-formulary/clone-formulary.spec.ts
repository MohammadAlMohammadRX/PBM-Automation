import type { Page } from '@playwright/test';
import { test, expect } from '../../../fixtures';
import type { FormularyManagementPage } from '../../../pages/formulary/FormularyManagementPage';
import type { FormularyCloneDrawer } from '../../../pages/formulary/FormularyCloneDrawer';
import { APPROVAL_STATUS, CODE_PATTERN, FORMULARY_STATUS } from '../../../data/formulary/formulary.data';
import { CASES, EXCLUSION_NOTE, clonePeriodFor, pastPeriod } from '../../../data/formulary/cloneFormulary.data';
import {
  STAGED_BENEFIT_PREFIX,
  addBenefitConfig,
  addPricingPeriod,
  answerText,
  cloneFormulary,
  findFormularyByName,
  formularyDateText,
  listFormularyRegister,
  readBenefitConfigs,
  readFormulary,
  readPriceHistory,
  readTiers,
  readTrades,
  setTradeStatus,
  suiteFormularyName,
} from '../../../utils/FormularyProvisioning';
import { findExpiredFormulary } from '../../../utils/formulary/writerAHelpers';

/** The clone's id from CloneFormulary's answer, else by its name. */
async function cloneIdOf(page: Page, text: string, name: string): Promise<string> {
  try {
    const payload = (JSON.parse(text) as { payload?: unknown }).payload;
    if (typeof payload === 'string' && payload !== '') return payload;
    if (payload && typeof payload === 'object' && typeof (payload as { id?: unknown }).id === 'string') return (payload as { id: string }).id;
  } catch {
    // not JSON - read back by name
  }
  return (await findFormularyByName(page, name))?.id ?? '';
}

/** Clones `sourceName` through the list row's Clone drawer under `cloneName`; returns the answer and the clone's id. */
async function cloneThroughList(
  list: FormularyManagementPage,
  page: Page,
  source: { nameEn: string; effectiveDate: string; expiryDate: string },
  cloneName: string,
): Promise<{ status: number; text: string; messages: string[]; id: string }> {
  await list.open();
  const drawer = await list.openCloneDrawer(source.nameEn);
  const answer = await drawer.clone(clonePeriodFor(source), { nameEn: cloneName });
  return { ...answer, id: answer.status < 300 ? await cloneIdOf(page, answer.text, cloneName) : '' };
}

/** A formulary's content for comparison: tiers, trades, pricing and benefit configurations, by stable keys. */
async function contentOf(page: Page, formularyId: string): Promise<{
  tiers: { name: string; order: number; coverage: number }[];
  trades: { code: string; tier: string; coverage: number }[];
  pricing: Record<string, { base: number; public: number; supplier: number; discount: number; vat: number }[]>;
  benefits: Record<string, { name: string; copay: number | null; coinsurance: number | null }[]>;
}> {
  const tiers = (await readTiers(page, formularyId)).map((t) => ({ name: t.tierNameEn, order: t.tierOrder, coverage: t.defaultCoveragePercentage })).sort((a, b) => a.order - b.order);
  const trades = await readTrades(page, formularyId);
  const pricing: Record<string, { base: number; public: number; supplier: number; discount: number; vat: number }[]> = {};
  const benefits: Record<string, { name: string; copay: number | null; coinsurance: number | null }[]> = {};
  for (const trade of trades) {
    pricing[trade.tradeCode] = (await readPriceHistory(page, trade.id))
      .map((p) => ({ base: p.baseCost, public: p.publicPrice, supplier: p.supplierPrice, discount: p.discountPercentage, vat: p.vatPercentage }));
    benefits[trade.tradeCode] = (await readBenefitConfigs(page, trade.id))
      .filter((b) => !b.benefitConfigNameEn.startsWith(STAGED_BENEFIT_PREFIX))
      .map((b) => ({ name: b.benefitConfigNameEn, copay: b.copaymentAmount, coinsurance: b.coinsurancePercentage }));
  }
  return {
    tiers,
    trades: trades.map((t) => ({ code: t.tradeCode, tier: t.tierNameEn, coverage: t.coveragePercentage })).sort((a, b) => a.code.localeCompare(b.code)),
    pricing,
    benefits,
  };
}

/**
 * User story 15211: Clone Formulary.
 * A clone carries the source's tiers, trades, pricing and benefit
 * configurations, leaves out expired / inactive trades, price records and
 * benefit configurations, starts as a new unapproved Draft and gets its own
 * code only on approval. Sources are the case's own formularies (see the data file).
 */
test.describe('US 15211 - Clone Formulary', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.carriesOver.azureId}: should carry the source's tiers, trades, pricing history and benefit configuration over to the clone`, async ({
    formularyManagementPage,
    formularyIn,
    discardFormularyNamed,
    page,
    steps,
  }) => {
    const data = CASES.carriesOver;
    const source = await formularyIn('Draft', { tiers: data.tiers, trades: data.trades, benefitConfigs: data.benefitConfigs });
    const cloneName = suiteFormularyName('clone');
    discardFormularyNamed(cloneName);
    let drawer: FormularyCloneDrawer;
    let cloneId = '';
    let before: Awaited<ReturnType<typeof contentOf>>;
    let after: Awaited<ReturnType<typeof contentOf>>;

    await steps.critical('Navigate to the Formulary Management module - the formulary list is shown', async () => {
      await formularyManagementPage.open();
      before = await contentOf(page, source.id);
    });

    await steps.critical('Select the source formulary and choose Clone - the clone confirmation form is displayed', async () => {
      drawer = await formularyManagementPage.openCloneDrawer(source.nameEn);
      expect(await drawer.getSourceMessage()).toContain(source.nameEn);
    });

    await steps.critical('Confirm the clone - a new formulary record is created', async () => {
      const answer = await drawer.clone(clonePeriodFor(source), { nameEn: cloneName });
      expect(answer.status, `${answerText(answer)} ${answer.messages.join(' | ')}`).toBeLessThan(300);
      cloneId = await cloneIdOf(page, answer.text, cloneName);
      expect(cloneId, 'the clone').not.toBe('');
      after = await contentOf(page, cloneId);
    });

    await steps.step('The clone has the same tiers as the source', async () => {
      expect(after.tiers).toEqual(before.tiers);
    });

    await steps.step('The clone has the same trades as the source', async () => {
      expect(after.trades).toEqual(before.trades);
    });

    await steps.step('The clone has the same pricing history as the source', async () => {
      expect(after.pricing).toEqual(before.pricing);
    });

    await steps.step('The clone has the same benefit configuration as the source', async () => {
      expect(after.benefits).toEqual(before.benefits);
    });
  });

  test(`TC-${CASES.unapproved.azureId}: should create the clone of an Active, approved formulary as a new Draft that is Not Live`, async ({
    formularyManagementPage,
    formularyIn,
    discardFormularyNamed,
    page,
    steps,
  }) => {
    const source = await formularyIn('Active');
    const cloneName = suiteFormularyName('clone');
    discardFormularyNamed(cloneName);

    await steps.critical('Navigate to the Formulary Management module - the formulary list is shown', async () => {
      await formularyManagementPage.open();
      expect((await formularyManagementPage.readRow(source.nameEn)).status).toBe(FORMULARY_STATUS.active);
    });

    await steps.critical('Clone the source formulary - the clone operation completes and a new formulary is created', async () => {
      const answer = await cloneThroughList(formularyManagementPage, page, source, cloneName);
      expect(answer.status, answerText(answer)).toBeLessThan(300);
      expect(answer.id).not.toBe('');
    });

    await steps.step('The new formulary\'s status is Draft / "Not Live"', async () => {
      await formularyManagementPage.open();
      const row = await formularyManagementPage.readRow(cloneName);
      expect({ status: row.status, approval: row.approvalStatus.replace(/^v\d+ · /, '') }).toEqual({ status: FORMULARY_STATUS.notLive, approval: APPROVAL_STATUS.draft });
    });
  });

  test(`TC-${CASES.codeOnApproval.azureId}: should give the clone a temporary code and replace it with its own permanent code only when it is approved`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyApprovalsPage,
    formularyIn,
    discardFormularyNamed,
    page,
    steps,
  }) => {
    const source = await formularyIn('Draft', { tiers: 1, trades: 1 });
    const cloneName = suiteFormularyName('clone');
    discardFormularyNamed(cloneName);
    let cloneId = '';

    await steps.critical('Precondition: a clone of the formulary has just been created and is an unapproved Draft', async () => {
      const answer = await cloneThroughList(formularyManagementPage, page, source, cloneName);
      expect(answer.status, answerText(answer)).toBeLessThan(300);
      cloneId = answer.id;
      expect(cloneId).not.toBe('');
    });

    await steps.critical('Navigate to the Formulary Management module - the formulary list is shown', async () => {
      await formularyManagementPage.open();
    });

    await steps.critical('Open the newly cloned formulary\'s details - the detail page loads', async () => {
      await formularyDetailPage.open(cloneId);
      expect(await formularyDetailPage.getName()).toBe(cloneName);
    });

    await steps.step('The Formulary Code field shows a temporary code before approval', async () => {
      expect(await formularyDetailPage.readOverviewField('code')).toMatch(CODE_PATTERN.temporary);
    });

    await steps.critical('Submit and approve the cloned formulary - the approval completes and it reads Approved', async () => {
      const sent = await formularyDetailPage.sendForApproval();
      expect(sent.status, sent.text.slice(0, 200)).toBeLessThan(300);
      await formularyApprovalsPage.open();
      await formularyApprovalsPage.approve(cloneName);
      await formularyDetailPage.open(cloneId);
      expect(await formularyDetailPage.getVersionBadge()).toMatch(new RegExp(`${APPROVAL_STATUS.approved}$`));
    });

    await steps.step('A new, unique permanent formulary code has been generated and assigned', async () => {
      const code = await formularyDetailPage.readOverviewField('code');
      expect(code).toMatch(CODE_PATTERN.permanent);
      expect(code, 'the source\'s code').not.toBe((await readFormulary(page, source.id)).formularyCode);
      const holders = (await listFormularyRegister(page, { searchText: code }, 50)).items.filter((f) => f.formularyCode === code);
      expect(holders.map((f) => f.formularyNameEn), `formularies carrying ${code}`).toEqual([cloneName]);
    });
  });

  for (const key of ['expiredTrade', 'inactiveTrade'] as const) {
    const data = CASES[key];
    const expired = key === 'expiredTrade';
    const label = expired ? 'expired' : 'inactive';
    test(`TC-${data.azureId}: should leave the source's ${label} trade out of the clone and carry over only the active one`, async ({
      formularyManagementPage,
      formularyIn,
      discardFormularyNamed,
      page,
      steps,
    }) => {
      const past = pastPeriod();
      const source = await formularyIn('Draft', {
        tiers: 1,
        trades: expired ? [{}, { effectiveFrom: past.from, effectiveTo: past.to }] : 2,
      });
      const [active, excluded] = source.trades;
      const cloneName = suiteFormularyName('clone');
      discardFormularyNamed(cloneName);
      let cloneId = '';

      await steps.critical(`Navigate to the Formulary Management module - the source holds an active trade and an ${label} one`, async () => {
        if (!expired) expect((await setTradeStatus(page, excluded.id, true)).status, `suspending ${excluded.tradeCode}`).toBeLessThan(300);
        await formularyManagementPage.open();
        expect(source.trades.length).toBe(2);
      });

      await steps.critical('Clone the source formulary - the clone is created', async () => {
        const answer = await cloneThroughList(formularyManagementPage, page, source, cloneName);
        expect(answer.status, answerText(answer)).toBeLessThan(300);
        cloneId = answer.id;
        expect(cloneId).not.toBe('');
      });

      await steps.step(`The clone's Trades tab holds only the active trade ${active.tradeCode}`, async () => {
        expect((await readTrades(page, cloneId)).map((t) => t.tradeCode)).toEqual([active.tradeCode]);
      });

      await steps.step(`The ${label} trade ${excluded.tradeCode} appears nowhere on the clone`, async () => {
        expect((await readTrades(page, cloneId)).map((t) => t.tradeCode)).not.toContain(excluded.tradeCode);
        expect((await formularyManagementPage.readRow(cloneName)).trades, 'the clone\'s Trades count in the list').toBe('1');
      });
    });
  }

  test(`TC-${CASES.expiredPrice.azureId}: should leave an expired price history record out of the clone and keep the active one`, async ({
    formularyManagementPage,
    formularyIn,
    discardFormularyNamed,
    page,
    steps,
  }) => {
    const source = await formularyIn('Draft', { tiers: 1, trades: 1 });
    const trade = source.trades[0];
    const past = pastPeriod();
    const expiredRecord = await addPricingPeriod(page, trade.id, { effectiveFrom: past.from, effectiveTo: past.to, supplierPrice: 7 });
    if (expiredRecord.status >= 300) steps.blocked(`An expired price record cannot be produced: AddPricingPeriod with a past period answered ${expiredRecord.status} ${answerText(expiredRecord).slice(0, 200)}`);
    const cloneName = suiteFormularyName('clone');
    discardFormularyNamed(cloneName);
    let cloneTradeId = '';

    await steps.critical('Navigate to the Formulary Management module - the formulary list is shown', async () => {
      await formularyManagementPage.open();
      expect((await readPriceHistory(page, trade.id)).length, 'the source\'s active and expired records').toBe(2);
    });

    await steps.critical('Clone the source formulary - the clone is created', async () => {
      const answer = await cloneThroughList(formularyManagementPage, page, source, cloneName);
      expect(answer.status, answerText(answer)).toBeLessThan(300);
      cloneTradeId = (await readTrades(page, answer.id)).find((t) => t.tradeCode === trade.tradeCode)?.id ?? '';
      expect(cloneTradeId, `${trade.tradeCode} on the clone`).not.toBe('');
    });

    await steps.step(`The clone's ${trade.tradeCode} price history lists only the active record`, async () => {
      const records = await readPriceHistory(page, cloneTradeId);
      expect(records.map((r) => r.supplierPrice), 'the cloned price records').toEqual([9]);
    });

    await steps.step('The expired pricing record does not appear on the cloned trade', async () => {
      const records = await readPriceHistory(page, cloneTradeId);
      expect(records.filter((r) => r.periodStatus === 'expired' || r.supplierPrice === 7)).toEqual([]);
    });
  });

  test(`TC-${CASES.completeCopy.azureId}: should copy every tier, trade, price record and benefit configuration unchanged when all of the source's data is active`, async ({
    formularyManagementPage,
    formularyIn,
    discardFormularyNamed,
    page,
    steps,
  }) => {
    const data = CASES.completeCopy;
    const source = await formularyIn('Draft', { tiers: data.tiers, trades: data.trades, benefitConfigs: data.benefitConfigs, rebate: { type: 'flatValue', value: 1 } });
    const cloneName = suiteFormularyName('clone');
    discardFormularyNamed(cloneName);
    let cloneId = '';

    await steps.critical('Navigate to the Formulary Management module - the formulary list is shown', async () => {
      await formularyManagementPage.open();
    });

    await steps.critical('Clone the source formulary - the clone is created', async () => {
      const answer = await cloneThroughList(formularyManagementPage, page, source, cloneName);
      expect(answer.status, answerText(answer)).toBeLessThan(300);
      cloneId = answer.id;
      expect(cloneId).not.toBe('');
    });

    await steps.step('Every tier, trade, price record and benefit configuration of the source is on the clone with matching values', async () => {
      expect(await contentOf(page, cloneId)).toEqual(await contentOf(page, source.id));
      const rebates = async (id: string): Promise<(number | null)[]> => (await readTrades(page, id)).map((t) => t.rebateValue).sort();
      expect(await rebates(cloneId), 'the rebates').toEqual(await rebates(source.id));
    });
  });

  test(`TC-${CASES.noTradesLeft.azureId}: should keep the tiers but carry no trade when every trade of the source is expired or inactive`, async ({
    formularyManagementPage,
    formularyIn,
    discardFormularyNamed,
    page,
    steps,
  }) => {
    const data = CASES.noTradesLeft;
    const source = await formularyIn('Draft', { tiers: data.tiers, trades: data.trades });
    const cloneName = suiteFormularyName('clone');
    discardFormularyNamed(cloneName);
    let cloneId = '';

    await steps.critical('Navigate to the Formulary Management module - every trade of the source is inactive', async () => {
      for (const trade of source.trades) expect((await setTradeStatus(page, trade.id, true)).status, `suspending ${trade.tradeCode}`).toBeLessThan(300);
      await formularyManagementPage.open();
    });

    await steps.critical('Clone the source formulary - the clone is created', async () => {
      const answer = await cloneThroughList(formularyManagementPage, page, source, cloneName);
      expect(answer.status, answerText(answer)).toBeLessThan(300);
      cloneId = answer.id;
      expect(cloneId).not.toBe('');
    });

    await steps.step('The clone\'s Trades tab is empty', async () => {
      expect(await readTrades(page, cloneId)).toEqual([]);
    });

    await steps.step('The source\'s tiers are still present on the clone', async () => {
      expect((await readTiers(page, cloneId)).map((t) => t.tierNameEn).sort()).toEqual(source.tiers.map((t) => t.tierNameEn).sort());
    });
  });

  test(`TC-${CASES.inactiveBenefit.azureId}: should leave an inactive benefit configuration out of the clone and keep the active one`, async ({
    formularyManagementPage,
    formularyIn,
    discardFormularyNamed,
    page,
    steps,
  }) => {
    const source = await formularyIn('Draft', { tiers: 1, trades: 1, benefitConfigs: CASES.inactiveBenefit.benefitConfigs });
    const trade = source.trades[0];
    const past = pastPeriod();
    const inactive = await addBenefitConfig(page, trade.id, { benefitEffectiveDate: past.from, benefitEndDate: past.to });
    if (inactive.id === null) steps.blocked(`An inactive (ended) benefit configuration cannot be produced: AddBenefitConfig with past dates answered ${inactive.status} ${answerText(inactive).slice(0, 200)}`);
    const cloneName = suiteFormularyName('clone');
    discardFormularyNamed(cloneName);
    let cloneTradeId = '';
    let activeName = '';

    await steps.critical('Navigate to the Formulary Management module - the source trade has an active and an inactive benefit configuration', async () => {
      await formularyManagementPage.open();
      const configs = await readBenefitConfigs(page, trade.id);
      expect(configs.length).toBe(2);
      activeName = configs.find((c) => c.id !== inactive.id)?.benefitConfigNameEn ?? '';
    });

    await steps.critical('Clone the source formulary - the clone is created', async () => {
      const answer = await cloneThroughList(formularyManagementPage, page, source, cloneName);
      expect(answer.status, answerText(answer)).toBeLessThan(300);
      cloneTradeId = (await readTrades(page, answer.id)).find((t) => t.tradeCode === trade.tradeCode)?.id ?? '';
      expect(cloneTradeId).not.toBe('');
    });

    await steps.step(`The clone's ${trade.tradeCode} Benefit Configuration lists only the active record`, async () => {
      expect((await readBenefitConfigs(page, cloneTradeId)).map((c) => c.benefitConfigNameEn)).toEqual([activeName]);
    });

    await steps.step('The inactive benefit configuration does not appear on the cloned trade', async () => {
      expect((await readBenefitConfigs(page, cloneTradeId)).map((c) => c.benefitConfigNameEn)).not.toContain(inactive.nameEn);
    });
  });

  test(`TC-${CASES.expiredSource.azureId}: should produce an independent Draft clone with its own editable dates when the source formulary is Expired`, async ({
    formularyManagementPage,
    discardFormularyNamed,
    page,
    steps,
  }) => {
    const expired = await findExpiredFormulary(page);
    if (expired === null) steps.blocked('Needs an Expired formulary: none is in the register, and Expired cannot be produced on demand (the lifecycle job is daily).');
    const source = { nameEn: expired?.formularyNameEn ?? '', effectiveDate: expired?.effectiveDate ?? '', expiryDate: expired?.expiryDate ?? '' };
    const cloneName = suiteFormularyName('clone');
    discardFormularyNamed(cloneName);
    const period = clonePeriodFor({ effectiveDate: new Date(Date.now() + 2 * 86_400_000).toISOString(), expiryDate: new Date(Date.now() + 200 * 86_400_000).toISOString() });
    let drawer: FormularyCloneDrawer;
    let cloneId = '';

    await steps.critical('Navigate to the Formulary Management module - the formulary list is shown', async () => {
      await formularyManagementPage.open();
      expect((await formularyManagementPage.readRow(source.nameEn)).status).toBe(FORMULARY_STATUS.expired);
    });

    await steps.critical(`Select the Expired formulary "${source.nameEn}" and choose Clone - the action is available and the confirmation form is displayed`, async () => {
      drawer = await formularyManagementPage.openCloneDrawer(source.nameEn);
      expect(await drawer.getSourceMessage()).toContain(source.nameEn);
    });

    await steps.critical('Confirm the clone - a new Draft formulary is created', async () => {
      const answer = await drawer.clone(period, { nameEn: cloneName });
      expect(answer.status, answerText(answer)).toBeLessThan(300);
      cloneId = await cloneIdOf(page, answer.text, cloneName);
      expect(cloneId).not.toBe('');
    });

    await steps.step('The clone is a Draft whose dates are its own, independent of the source\'s expired dates', async () => {
      const clone = await readFormulary(page, cloneId);
      expect(clone.isPendingCreate, 'an unapproved draft').toBe(true);
      expect({ effective: formularyDateText(clone.effectiveDate), expiry: formularyDateText(clone.expiryDate) }).toEqual({ effective: period.effectiveDate, expiry: period.expiryDate });
      expect(clone.expiryDate, 'not the source\'s expiry').not.toBe(source.expiryDate);
    });
  });

  test(`TC-${CASES.exploratory.azureId}: should apply the exclusion and unapproved-status rules to a clone of a clone and to repeated clones without collisions`, async ({
    formularyManagementPage,
    formularyIn,
    discardFormularyNamed,
    discardFormularyId,
    page,
    steps,
  }) => {
    const source = await formularyIn('Draft', { tiers: 1, trades: 2 });
    const [active, suspended] = source.trades;
    const firstName = suiteFormularyName('clone');
    discardFormularyNamed(firstName);
    const clones: { id: string; name: string }[] = [];

    await steps.critical('Navigate to the Formulary Management module - the source holds an active and an inactive trade', async () => {
      expect((await setTradeStatus(page, suspended.id, true)).status).toBeLessThan(300);
      await formularyManagementPage.open();
    });

    await steps.step('Clone the formulary, then clone the clone - the exclusion rules still hold on the second generation', async () => {
      const first = await cloneThroughList(formularyManagementPage, page, source, firstName);
      expect(first.status, answerText(first)).toBeLessThan(300);
      clones.push({ id: first.id, name: firstName });
      const second = await cloneFormulary(page, first.id, { effectiveInMinutes: 3 * 24 * 60, expiryInDays: 300 });
      if (second.id) discardFormularyId(second.id);
      expect(second.status, answerText(second)).toBeLessThan(300);
      clones.push({ id: second.id ?? '', name: second.nameEn });
      expect((await readTrades(page, second.id ?? '')).map((t) => t.tradeCode), 'the second-generation clone\'s trades').toEqual([active.tradeCode]);
      expect((await readFormulary(page, second.id ?? '')).isPendingCreate, 'an unapproved draft').toBe(true);
    });

    await steps.step(`Clone the same source ${CASES.exploratory.repeats} times in quick succession - each clone is independent with no collision`, async () => {
      const repeated = await Promise.all(Array.from({ length: CASES.exploratory.repeats }, () => cloneFormulary(page, source.id, { effectiveInMinutes: 3 * 24 * 60, expiryInDays: 300 })));
      for (const clone of repeated) if (clone.id) discardFormularyId(clone.id);
      expect(repeated.map((c) => c.status < 300), repeated.map((c) => answerText(c)).join(' | ')).toEqual(repeated.map(() => true));
      clones.push(...repeated.map((c) => ({ id: c.id ?? '', name: c.nameEn })));
      expect(new Set(repeated.map((c) => c.id)).size, 'distinct clones').toBe(repeated.length);
    });

    await steps.step('No data leaks, duplicate codes or inconsistent exclusions are found across the clones', async () => {
      const records = await Promise.all(clones.map((c) => readFormulary(page, c.id)));
      const codes = records.map((r) => r.formularyCode);
      expect(new Set(codes).size, `clone codes: ${codes.join(', ')}`).toBe(codes.length);
      for (const clone of clones) {
        expect((await readTrades(page, clone.id)).map((t) => t.tradeCode), `${clone.name}'s trades`).toEqual([active.tradeCode]);
        expect((await readTiers(page, clone.id)).map((t) => t.tierNameEn), `${clone.name}'s tiers`).toEqual(source.tiers.map((t) => t.tierNameEn));
      }
      const tierIds = (await Promise.all(clones.map((c) => readTiers(page, c.id)))).flat().map((t) => t.id);
      expect(new Set(tierIds).size, 'each clone owns its own tiers').toBe(tierIds.length);
    });
  });

  test(`TC-${CASES.dialog.azureId}: should name the source, note the excluded data and offer Confirm and Cancel, and create nothing when cancelled`, async ({
    formularyManagementPage,
    formularyIn,
    page,
    steps,
  }) => {
    const source = await formularyIn('Draft', { tiers: 1, trades: 2 });
    let drawer: FormularyCloneDrawer;

    await steps.critical('Navigate to the Formulary Management module - the source holds some inactive data', async () => {
      expect((await setTradeStatus(page, source.trades[1].id, true)).status).toBeLessThan(300);
      await formularyManagementPage.open();
    });

    await steps.critical('Select the source formulary and click Clone - the Clone Formulary form opens', async () => {
      drawer = await formularyManagementPage.openCloneDrawer(source.nameEn);
      expect(await drawer.isOpen()).toBe(true);
    });

    await steps.step('Checklist: the source name, the note that expired / inactive data is excluded, and Confirm and Cancel are all present', async () => {
      expect(await drawer.getSourceMessage(), 'the source formulary named').toContain(source.nameEn);
      const text = [await drawer.getText(), ...Object.values(await drawer.getContentHints())].join(' ');
      expect(text, 'a note on the data left out').toMatch(EXCLUSION_NOTE);
      const controls = await drawer.readControls();
      expect({ confirm: controls.next.availability === 'available' || controls.clone.availability === 'available', cancel: controls.back.availability === 'available' || controls.close.availability === 'available' })
        .toEqual({ confirm: true, cancel: true });
    });

    await steps.step('Click Cancel - the form closes and no clone is created', async () => {
      await drawer.cancel();
      expect(await drawer.isOpen(), 'the drawer should close').toBe(false);
      const { items } = await listFormularyRegister(page, { searchText: source.nameEn }, 20);
      expect(items.map((f) => f.formularyNameEn), 'formularies named after the source').toEqual([source.nameEn]);
    });
  });
});
