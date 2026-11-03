import { expect } from '../../../fixtures';
import { toArabicToken } from '../../../data/payers/payer.data';
import { SCOPED_PAYER } from '../../../data/formulary/formularyPermissions.data';
import { test } from '../../../utils/formulary/writerCHelpers';
import type { BenefitConfigDrawer, BenefitConfigValues } from '../../../pages/formulary/BenefitConfigDrawer';
import { FormularyDetailPage } from '../../../pages/formulary/FormularyDetailPage';
import { FormularyTradesTab } from '../../../pages/formulary/FormularyTradesTab';
import { APPROVAL_STATUS, FIELD_MESSAGE, MESSAGE, formularyDateText } from '../../../data/formulary/formulary.data';
import {
  ACTIVE,
  CASES,
  DRAFT,
  EXPIRED,
  FUTURE,
  OPEN_ENDED,
  OVERLAP,
  UNLIMITED,
  ZERO,
} from '../../../data/formulary/benefitConfiguration.data';
import {
  addBenefitConfig,
  answerText,
  approveFormulary,
  readBenefitConfigs,
  readVersions,
  rejectFormulary,
  submitFormulary,
  updateBenefitConfig,
  waitUntil,
} from '../../../utils/FormularyProvisioning';
import {
  benefitTimeline,
  isoDaysAfter,
  isoIn,
  provide,
  requireAccepted,
  signInWithFormularyRights,
  stamp,
  versionNumber,
} from '../../../utils/formulary/writerBHelpers';

/** The form values of a configuration effective at `effectiveIso`. */
const benefit = (nameEn: string, nameAr: string, effectiveIso: string, amounts: BenefitConfigValues = { copaymentAmount: 15 }): BenefitConfigValues => ({
  nameEn,
  nameAr,
  ...amounts,
  benefitEffectiveDate: formularyDateText(effectiveIso),
});

/** "04 Nov 2026" - how a card's period shows a date. */
const cardDate = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleString('en-GB', { month: 'short' })} ${d.getFullYear()}`;
};

/**
 * User story 15202: View Formulary - Trade & Pricing / Benefit Configuration.
 * Each trade's configurations are listed by name, effective date and status;
 * a configuration needs a copayment or a coinsurance (0-100), bilingual names
 * unique within the formulary, an effective date not in the past and an end
 * date after it (or none, open ended); optional limits default to 0.00 and 0
 * means unlimited. Status follows the dates, approval follows the formulary's
 * workflow, edit is for Future and delete for draft configurations only.
 */
test.describe('US 15202 - View Formulary - Trade & Pricing / Benefit Configuration', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.addConfiguration.azureId}: should save a new benefit configuration in Draft and list it`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.addConfiguration;
    const formulary = await formularyIn('Draft');
    const trade = formulary.trades[0];
    let drawer!: BenefitConfigDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open a trade\'s Benefit Configuration action - the view lists the existing benefits', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openBenefitConfigs(trade.id);
      expect((await drawer.readConfigIds()).length).toBe((await readBenefitConfigs(page, trade.id)).length);
    });

    await steps.critical('Click Add - the form opens with name, copayment, coinsurance and limit fields', async () => {
      await drawer.openAdd();
      for (const field of ['nameEn', 'nameAr', 'copaymentAmount', 'coinsurancePercentage', 'deductible', 'outOfPocketMaximum'] as const) {
        expect(await drawer.isFieldEditable(field), `${field} is offered`).toBe(true);
      }
    });

    await steps.step('Enter "Standard Copay", "نسبة قياسية", copayment 50, coinsurance 10 and a future effective date - the fields are filled', async () => {
      await drawer.fill(benefit(data.nameEn, data.nameAr, formulary.effectiveDate, { copaymentAmount: data.copaymentAmount, coinsurancePercentage: data.coinsurancePercentage }));
      expect(await drawer.getValue('nameEn')).toBe(data.nameEn);
      expect(await drawer.getValue('nameAr')).toBe(data.nameAr);
    });

    await steps.step('Click Save - the configuration is saved in Draft and appears in the list', async () => {
      const answer = await drawer.attemptSave();
      expect(answer.status, answer.messages.join(' | ')).toBe(200);
      const card = await drawer.readCard(await drawer.configIdByName(data.nameEn));
      expect(card.status).toMatch(DRAFT);
    });
  });

  test(`TC-${CASES.copayOrCoinsurance.azureId}: should require a copayment or a coinsurance before saving`, async ({
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.copayOrCoinsurance;
    const formulary = await formularyIn('Draft');
    let drawer!: BenefitConfigDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Add form and fill everything but Copayment and Coinsurance - both stay empty', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openBenefitConfigs(formulary.trades[0].id);
      await drawer.openAdd();
      await drawer.fill(benefit(data.nameEn, data.nameAr, formulary.effectiveDate, {}));
      expect([await drawer.getValue('copaymentAmount'), await drawer.getValue('coinsurancePercentage')]).toEqual(['', '']);
    });

    await steps.step('Click Save - at least one of Copayment or Coinsurance is required and nothing is saved', async () => {
      const answer = await drawer.attemptSave();
      expect(answer.status, 'nothing may be saved without a copayment or a coinsurance').not.toBe(200);
      expect(`${await drawer.getFieldError('copaymentAmount')} ${await drawer.getFieldError('coinsurancePercentage')}`).toContain(FIELD_MESSAGE.copayOrCoinsurance);
    });

    await steps.step('Enter Coinsurance 15 only and save - the configuration saves', async () => {
      await drawer.type('coinsurancePercentage', data.coinsurancePercentage);
      const answer = await drawer.attemptSave();
      expect(answer.status, answer.messages.join(' | ')).toBe(200);
    });
  });

  test(`TC-${CASES.uniqueEnglishName.azureId}: should refuse a second configuration with the same English name in the formulary`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.uniqueEnglishName;
    const formulary = await formularyIn('Draft', { benefitConfigs: [{ nameEn: data.nameEn, nameAr: data.nameAr }] });
    const trade = formulary.trades[0];
    let drawer!: BenefitConfigDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Open the Add form and enter the English name "Standard Copay" again - the name is entered', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openBenefitConfigs(trade.id);
      await drawer.openAdd();
      await drawer.type('nameEn', data.nameEn);
      expect(await drawer.getValue('nameEn')).toBe(data.nameEn);
    });

    await steps.step('Complete the rest and save - the English name must be unique and nothing is saved', async () => {
      // Two days on, clear of the first configuration's window: on the same date the
      // overlap rule answered first and the NAME rule was never reached (2026-11-02).
      await drawer.fill(benefit(data.nameEn, data.otherNameAr, isoDaysAfter(formulary.effectiveDate, 2), { copaymentAmount: data.copaymentAmount }));
      const answer = await drawer.attemptSave();
      expect(answer.status, 'a duplicate English name must be refused').not.toBe(200);
      expect(`${answer.messages.join(' | ')} ${answer.text}`).toMatch(MESSAGE.unique);
      expect((await readBenefitConfigs(page, trade.id)).filter((b) => b.benefitConfigNameEn === data.nameEn)).toHaveLength(1);
    });
  });

  test(`TC-${CASES.overlappingName.azureId}: should refuse a configuration reusing a name in the formulary over an overlapping period`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.overlappingName;
    const formulary = await formularyIn('Draft', { benefitConfigs: [{ nameEn: data.nameEn, nameAr: data.nameAr }] });
    const trade = formulary.trades[0];

    await steps.critical('Open the trade\'s benefit configurations, where "نسبة قياسية" exists', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      expect((await readBenefitConfigs(page, trade.id)).map((b) => b.benefitConfigNameAr)).toContain(data.nameAr);
    });

    await steps.step('Add a configuration with the same Arabic name over an overlapping period - it is refused with a message that the name exists for that period', async () => {
      const drawer = await formularyTradesTab.openBenefitConfigs(trade.id);
      await drawer.openAdd();
      await drawer.fill(benefit(data.otherNameEn, data.nameAr, formulary.effectiveDate, { copaymentAmount: data.copaymentAmount }));
      const answer = await drawer.attemptSave();
      expect(answer.status, 'the overlapping same-name configuration must be refused').not.toBe(200);
      expect(`${answer.messages.join(' | ')} ${answer.text}`).toMatch(OVERLAP);
      expect((await readBenefitConfigs(page, trade.id)).map((b) => b.benefitConfigNameEn)).not.toContain(data.otherNameEn);
    });
  });

  test(`TC-${CASES.coinsuranceBounds.azureId}: should accept a coinsurance of 0 and 100 and reject 101`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.coinsuranceBounds;
    const formulary = await formularyIn('Draft');
    const trade = formulary.trades[0];
    const suffix = stamp();
    let drawer!: BenefitConfigDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openBenefitConfigs(trade.id);
    });

    // The Arabic name takes Arabic letters only (no digits / Latin stamp), and one
    // trade's configurations may not overlap - each gets its own day (2026-11-02).
    const arabic = (n: number): string => `تأمين ${toArabicToken(`${n}${suffix}`)}`;
    const window = (n: number): BenefitConfigValues => ({
      benefitEffectiveDate: formularyDateText(isoDaysAfter(formulary.effectiveDate, 2 * n)),
      benefitEndDate: formularyDateText(isoDaysAfter(formulary.effectiveDate, 2 * n + 1)),
    });
    for (const [n, coinsurance] of data.valid.entries()) {
      await steps.step(`Add a configuration with Coinsurance % = ${coinsurance} and save - it saves with ${coinsurance}%`, async () => {
        await drawer.openAdd();
        await drawer.fill({ ...benefit(`Coinsurance ${coinsurance} ${suffix}`, arabic(coinsurance), formulary.effectiveDate, { coinsurancePercentage: coinsurance }), ...window(n) });
        const answer = await drawer.attemptSave();
        expect(answer.status, answer.messages.join(' | ')).toBe(200);
        expect((await readBenefitConfigs(page, trade.id)).find((b) => b.benefitConfigNameEn === `Coinsurance ${coinsurance} ${suffix}`)?.coinsurancePercentage).toBe(coinsurance);
      });
    }

    await steps.step('Add a configuration with Coinsurance % = 101 and save - a validation error is shown and nothing is saved', async () => {
      await drawer.openAdd();
      await drawer.fill({ ...benefit(`Coinsurance 101 ${suffix}`, arabic(101), formulary.effectiveDate, { coinsurancePercentage: data.invalid }), ...window(data.valid.length) });
      const typed = await drawer.getValue('coinsurancePercentage');
      // Capped at input (101 reads 100) is prevention; saving the capped value proves nothing (2026-11-02).
      if (Number(typed) !== data.invalid) {
        expect((await readBenefitConfigs(page, trade.id)).map((b) => b.benefitConfigNameEn)).not.toContain(`Coinsurance 101 ${suffix}`);
        return;
      }
      const answer = await drawer.attemptSave();
      expect(answer.status, `coinsurance 101 (typed "${typed}") must not be saved`).not.toBe(200);
      expect((await drawer.getFieldError('coinsurancePercentage')) || answer.messages.join(' | ')).toMatch(MESSAGE.range);
      expect((await readBenefitConfigs(page, trade.id)).map((b) => b.benefitConfigNameEn)).not.toContain(`Coinsurance 101 ${suffix}`);
    });
  });

  test(`TC-${CASES.pastEffectiveDate.azureId}: should reject a benefit effective date in the past and accept today`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.pastEffectiveDate;
    const formulary = await formularyIn('Draft', { effectiveInMinutes: data.formularyInMinutes });
    const trade = formulary.trades[0];
    const name = `Past Date Check ${stamp()}`;
    let drawer!: BenefitConfigDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Open the Add form, complete it and set the effective date to yesterday - the date is entered', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openBenefitConfigs(trade.id);
      await drawer.openAdd();
      const yesterday = formularyDateText(isoIn(-24 * 60));
      // Ends before today: a saved past configuration (the finding) must not overlap step 4's.
      await drawer.fill({ ...benefit(name, 'تاريخ سابق', isoIn(-24 * 60)), benefitEndDate: formularyDateText(isoIn(-22 * 60)) });
      expect([yesterday, ''], 'the picker shows the past date, or refuses it outright').toContain(await drawer.getValue('benefitEffectiveDate'));
    });

    await steps.step('Click Save - the effective date cannot be in the past and nothing is saved', async () => {
      const answer = await drawer.attemptSave();
      if (answer.status === 200) {
        // Saved (2026-11-02): the stored date tells a past date accepted (the
        // finding) from a picker that refused it and fell back to its own. The
        // form is reopened in step 4 (DELETE answers 404 for it).
        const saved = (await readBenefitConfigs(page, trade.id)).find((b) => b.benefitConfigNameEn === name);
        const from = saved?.benefitEffectiveDate ?? '';
        expect(Date.parse(from), `a past effective date must be refused - saved with ${from}`).toBeGreaterThanOrEqual(Date.now() - 5 * 60_000);
        return;
      }
      expect((await drawer.getFieldError('benefitEffectiveDate')) || answer.messages.join(' | ')).toMatch(MESSAGE.pastDate);
      expect((await readBenefitConfigs(page, trade.id)).map((b) => b.benefitConfigNameEn)).not.toContain(name);
    });

    await steps.step('Change the effective date to today and save - the configuration saves', async () => {
      // A past configuration that was saved keeps its name, so a reopened form takes another.
      let saving = name;
      if (!(await drawer.isFormOpen())) {
        saving = `${name} Today`;
        await drawer.openAdd();
        await drawer.fill(benefit(saving, 'تاريخ سابق', isoIn(data.todayInMinutes)));
      }
      await drawer.type('benefitEffectiveDate', formularyDateText(isoIn(data.todayInMinutes)));
      await drawer.type('benefitEndDate', formularyDateText(isoIn(data.todayInMinutes + 24 * 60)));
      const answer = await drawer.attemptSave();
      expect(answer.status, answer.messages.join(' | ')).toBe(200);
      expect((await readBenefitConfigs(page, trade.id)).map((b) => b.benefitConfigNameEn)).toContain(saving);
    });
  });

  test(`TC-${CASES.endAfterEffective.azureId}: should refuse an end date before the effective date and accept a later one`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.endAfterEffective;
    const formulary = await formularyIn('Draft');
    const trade = formulary.trades[0];
    const effective = isoDaysAfter(formulary.effectiveDate, data.effectiveAfterDays);
    const name = `End Date Check ${stamp()}`;
    let drawer!: BenefitConfigDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Open the Add form and set an end date a day before the effective date - both dates are entered', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openBenefitConfigs(trade.id);
      await drawer.openAdd();
      const end = formularyDateText(isoDaysAfter(effective, -data.badEndBeforeDays));
      await drawer.fill({ ...benefit(name, 'تاريخ نهاية', effective), benefitEndDate: end });
      expect(await drawer.getValue('benefitEndDate')).toBe(end);
    });

    await steps.step('Click Save - the end date must be later than the effective date and nothing is saved', async () => {
      const answer = await drawer.attemptSave();
      expect(answer.status, 'an end date before the effective date must be refused').not.toBe(200);
      expect((await drawer.getFieldError('benefitEndDate')) || answer.messages.join(' | ')).toMatch(MESSAGE.afterEffective);
      expect((await readBenefitConfigs(page, trade.id)).map((b) => b.benefitConfigNameEn)).not.toContain(name);
    });

    await steps.step('Change the end date to six months after the effective date and save - the configuration saves', async () => {
      await drawer.type('benefitEndDate', formularyDateText(isoDaysAfter(effective, data.goodEndAfterDays)));
      const answer = await drawer.attemptSave();
      expect(answer.status, answer.messages.join(' | ')).toBe(200);
    });
  });

  test(`TC-${CASES.openEnded.azureId}: should save a benefit configuration without an end date as open ended`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft');
    const trade = formulary.trades[0];
    const name = `Open Ended ${stamp()}`;
    let drawer!: BenefitConfigDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Open the Add form, complete it and leave the end date blank - the end date stays empty', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openBenefitConfigs(trade.id);
      await drawer.openAdd();
      await drawer.fill(benefit(name, 'مفتوحة', formulary.effectiveDate));
      expect(await drawer.getValue('benefitEndDate')).toBe('');
    });

    await steps.step('Click Save - the configuration saves as open ended, without an end date', async () => {
      const answer = await drawer.attemptSave();
      expect(answer.status, answer.messages.join(' | ')).toBe(200);
      expect((await readBenefitConfigs(page, trade.id)).find((b) => b.benefitConfigNameEn === name)?.benefitEndDate ?? null).toBeNull();
      expect((await drawer.readCard(await drawer.configIdByName(name))).period).toMatch(OPEN_ENDED);
    });
  });

  test(`TC-${CASES.optionalDefaults.azureId}: should store blank optional limits as 0.00`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Draft');
    const trade = formulary.trades[0];
    const name = `Blank Limits ${stamp()}`;
    let drawer!: BenefitConfigDrawer;
    const limits = ['deductible', 'outOfPocketMaximum', 'maximumCopayAmount', 'minimumMemberContribution', 'sublimitAmount'] as const;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Open the Add form and leave Deductible, OOP Maximum, Maximum Copay, Minimum Contribution and Sublimit blank - they show no entry', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openBenefitConfigs(trade.id);
      await drawer.openAdd();
      for (const field of limits) expect(await drawer.getValue(field), field).toMatch(/^(|0(\.0+)?)$/);
    });

    await steps.step('Complete the required fields and save - every optional limit is stored as 0.00', async () => {
      await drawer.fill(benefit(name, 'حدود فارغة', formulary.effectiveDate, { copaymentAmount: CASES.optionalDefaults.copaymentAmount }));
      const answer = await drawer.attemptSave();
      expect(answer.status, answer.messages.join(' | ')).toBe(200);
      const saved = (await readBenefitConfigs(page, trade.id)).find((b) => b.benefitConfigNameEn === name);
      expect(limits.map((field) => saved?.[field])).toEqual(limits.map(() => 0));
    });
  });

  test(`TC-${CASES.zeroIsUnlimited.azureId}: should present a zero limit as unlimited`, async ({
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const name = `Zero Limit ${stamp()}`;
    const formulary = await formularyIn('Future', { benefitConfigs: [{ nameEn: name, outOfPocketMaximum: 0 }] });
    let drawer!: BenefitConfigDrawer;
    let configId = '';

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Open the configuration with Out-of-Pocket Maximum 0.00 - the field displays 0.00', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openBenefitConfigs(formulary.trades[0].id);
      configId = await drawer.configIdByName(name);
      await drawer.openEdit(configId);
      expect((await drawer.getValue('outOfPocketMaximum')).replace(/[^\d.]/g, '')).toMatch(ZERO);
      await drawer.cancelForm();
    });

    await steps.step('View the configuration\'s summary - the Out-of-Pocket Maximum reads as unlimited', async () => {
      expect((await drawer.readCard(configId)).outOfPocketMaximum).toMatch(UNLIMITED);
    });
  });

  test(`TC-${CASES.statusByPeriod.azureId}: should move a configuration from Future to Active to Expired as its dates pass`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }, testInfo) => {
    const timeline = await provide(testInfo, 'a benefit configuration timeline', () => benefitTimeline(page, formularyIn, ['expired']));
    const name = timeline.names.expired ?? '';
    const statusNow = async (): Promise<string> => {
      await formularyDetailPage.reload();
      await formularyTradesTab.open();
      const drawer = await formularyTradesTab.openBenefitConfigs(timeline.tradeId);
      return (await drawer.readCard(await drawer.configIdByName(name))).status;
    };

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(timeline.formulary.nameEn)).toBe(true);
      await formularyManagementPage.openDetails(timeline.formulary.nameEn);
    });

    await steps.step('Create a configuration effective in the future - its status reads Future', async () => {
      expect(await statusNow()).toMatch(FUTURE);
    });

    await steps.step('Let the date reach the effective date - the status updates to Active by itself', async () => {
      await waitUntil(page, timeline.activeFrom);
      expect(await statusNow()).toMatch(ACTIVE);
    });

    await steps.step('Let the date pass the end date - the status updates to Expired by itself', async () => {
      await waitUntil(page, timeline.expiredAfter);
      expect(await statusNow()).toMatch(EXPIRED);
    });
  });

  test(`TC-${CASES.approvalProgress.azureId}: should move a new configuration from Draft through Pending Approval to Approved`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Future');
    const name = `Approval Flow ${stamp()}`;
    let drawer!: BenefitConfigDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Create a configuration and save it - it is created as Draft', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openBenefitConfigs(formulary.trades[0].id);
      await drawer.openAdd();
      await drawer.fill(benefit(name, 'تدفق الموافقة', isoDaysAfter(formulary.effectiveDate, 1), { copaymentAmount: CASES.approvalProgress.copaymentAmount }));
      const answer = await drawer.attemptSave();
      expect(answer.status, answer.messages.join(' | ')).toBe(200);
      expect((await drawer.readCard(await drawer.configIdByName(name))).status).toMatch(DRAFT);
      await drawer.close();
      await formularyDetailPage.reload();
      expect(await formularyDetailPage.getVersionBadge()).toContain(APPROVAL_STATUS.draft);
    });

    await steps.critical('Submit the configuration for approval - its approval status changes to Pending Approval', async () => {
      const sent = await formularyDetailPage.sendForApproval();
      expect(sent.status, sent.text.slice(0, 300)).toBe(200);
      await formularyDetailPage.reload();
      expect(await formularyDetailPage.getVersionBadge()).toContain(APPROVAL_STATUS.pending);
    });

    await steps.step('Approve it as the approver - its approval status changes to Approved', async () => {
      await approveFormulary(page, formulary.nameEn);
      await formularyDetailPage.reload();
      expect(await formularyDetailPage.getVersionBadge()).toContain(APPROVAL_STATUS.approved);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openBenefitConfigs(formulary.trades[0].id);
      expect((await drawer.readCard(await drawer.configIdByName(name))).status).toMatch(FUTURE);
    });
  });

  test(`TC-${CASES.editOnlyFuture.azureId}: should allow Edit on a Future configuration only`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }, testInfo) => {
    const timeline = await provide(testInfo, 'a benefit configuration timeline', () => benefitTimeline(page, formularyIn, ['future', 'active', 'expired']));
    let drawer!: BenefitConfigDrawer;
    const idOf = async (stage: 'future' | 'active' | 'expired'): Promise<string> => drawer.configIdByName(timeline.names[stage] ?? '');

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await waitUntil(page, timeline.expiredAfter);
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(timeline.formulary.nameEn)).toBe(true);
      await formularyManagementPage.openDetails(timeline.formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openBenefitConfigs(timeline.tradeId);
    });

    await steps.step('Open the Future configuration and select Edit - the form opens for changes', async () => {
      const id = await idOf('future');
      expect((await drawer.readCard(id)).status).toMatch(FUTURE);
      expect(await drawer.getCardActionAvailability(id, 'edit')).toBe('available');
      await drawer.openEdit(id);
      expect(await drawer.isFieldEditable('copaymentAmount')).toBe(true);
      await drawer.cancelForm();
    });

    await steps.step('Open the Active configuration and try Edit - Edit is disabled or blocked', async () => {
      const id = await idOf('active');
      expect((await drawer.readCard(id)).status).toMatch(ACTIVE);
      expect(await drawer.getCardActionAvailability(id, 'edit')).not.toBe('available');
      const direct = await updateBenefitConfig(page, id, { copaymentAmount: CASES.editOnlyFuture.newCopay });
      expect(direct.status, `UpdateBenefitConfig on an Active configuration answered ${direct.status}`).toBeGreaterThanOrEqual(400);
    });

    await steps.step('Open the Expired configuration and try Edit - Edit is disabled or blocked', async () => {
      const id = await idOf('expired');
      expect((await drawer.readCard(id)).status).toMatch(EXPIRED);
      expect(await drawer.getCardActionAvailability(id, 'edit')).not.toBe('available');
      const direct = await updateBenefitConfig(page, id, { copaymentAmount: CASES.editOnlyFuture.newCopay });
      expect(direct.status, `UpdateBenefitConfig on an Expired configuration answered ${direct.status}`).toBeGreaterThanOrEqual(400);
    });
  });

  test(`TC-${CASES.deleteOnlyDraft.azureId}: should delete a draft configuration and not offer Delete on an approved one`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }, testInfo) => {
    const approvedName = `Approved Benefit ${stamp()}`;
    const formulary = await formularyIn('Future', { benefitConfigs: [{ nameEn: approvedName }] });
    const trade = formulary.trades[0];
    const draft = await addBenefitConfig(page, trade.id, { nameEn: `Draft Benefit ${stamp()}`, benefitEffectiveDate: isoDaysAfter(formulary.effectiveDate, 1) });
    requireAccepted(testInfo, draft, 'a draft benefit configuration on the published formulary');
    let drawer!: BenefitConfigDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openBenefitConfigs(trade.id);
    });

    await steps.step('Open the Draft configuration and select Delete - it is deleted', async () => {
      const id = await drawer.configIdByName(draft.nameEn);
      expect((await drawer.readCard(id)).status).toMatch(DRAFT);
      expect(await drawer.getCardActionAvailability(id, 'delete')).toBe('available');
      const answer = await drawer.deleteConfig(id);
      expect(answer.status, answer.text.slice(0, 300)).toBe(200);
      expect((await readBenefitConfigs(page, trade.id)).map((b) => b.id)).not.toContain(id);
    });

    await steps.step('Open the Approved configuration and try Delete - Delete is disabled or blocked', async () => {
      const id = await drawer.configIdByName(approvedName);
      expect((await drawer.readCard(id)).status).not.toMatch(DRAFT);
      expect(await drawer.getCardActionAvailability(id, 'delete')).not.toBe('available');
    });
  });

  test(`TC-${CASES.rejectedResubmitted.azureId}: should let a rejected configuration be corrected and resubmitted with a new version`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyIn,
    steps,
  }, testInfo) => {
    const formulary = await formularyIn('Future');
    const added = await addBenefitConfig(page, formulary.trades[0].id, { nameEn: `Rejected Benefit ${stamp()}`, benefitEffectiveDate: isoDaysAfter(formulary.effectiveDate, 1) });
    requireAccepted(testInfo, added, 'a benefit configuration staged on the published formulary');
    requireAccepted(testInfo, await submitFormulary(page, formulary.id), 'the configuration sent for approval');
    let rejectedVersion = NaN;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
      await formularyManagementPage.openDetails(formulary.nameEn);
      expect(await formularyDetailPage.getVersionBadge()).toContain(APPROVAL_STATUS.pending);
    });

    await steps.critical('Reject the pending configuration as the approver - its approval status changes to Rejected', async () => {
      const rejected = await rejectFormulary(page, formulary.nameEn);
      expect(rejected.status, answerText(rejected)).toBe(200);
      await formularyDetailPage.reload();
      const badge = await formularyDetailPage.getVersionBadge();
      // On a PUBLISHED formulary the header returns to the live version after a
      // rejection ("v1 · Approved", 2026-11-02); the rejected version is in its history.
      if (badge.includes(APPROVAL_STATUS.rejected)) rejectedVersion = versionNumber(badge);
      else {
        const rejectedRow = (await readVersions(page, formulary.id)).find((v) => v.versionStatusCode === 'rejected');
        expect(rejectedRow, `header "${badge}"; the version history should hold the rejected version`).toBeDefined();
        rejectedVersion = rejectedRow?.version ?? NaN;
      }
    });

    await steps.step('Edit and resubmit the rejected configuration - it returns to Pending Approval with the version number incremented', async () => {
      // The id AddBenefitConfig gave answers 404 after the rejection: look the configuration up by name.
      const configs = await readBenefitConfigs(page, formulary.trades[0].id);
      const current = configs.find((b) => b.benefitConfigNameEn === added.nameEn);
      expect(current, `the rejected configuration on the trade (it has ${JSON.stringify(configs.map((b) => b.benefitConfigNameEn))})`).toBeDefined();
      const edited = await updateBenefitConfig(page, current?.id ?? '', { copaymentAmount: CASES.rejectedResubmitted.newCopay });
      expect(edited.status, answerText(edited)).toBe(200);
      const sent = await formularyDetailPage.sendForApproval();
      expect(sent.status, sent.text.slice(0, 300)).toBe(200);
      await formularyDetailPage.reload();
      const badge = await formularyDetailPage.getVersionBadge();
      expect(badge).toContain(APPROVAL_STATUS.pending);
      expect(versionNumber(badge)).toBeGreaterThan(rejectedVersion);
    });
  });

  test(`TC-${CASES.groupedList.azureId}: should list every configuration with its name, effective date and status`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }) => {
    const suffix = stamp();
    const base = isoIn(2 * 24 * 60);
    const specs = CASES.groupedList.offsetsDays.map((days, n) => ({ nameEn: `Grouped Benefit ${n + 1} ${suffix}`, benefitEffectiveDate: isoDaysAfter(base, days) }));
    const formulary = await formularyIn('Draft', { effectiveDate: base, benefitConfigs: specs });
    let drawer!: BenefitConfigDrawer;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the trade\'s Benefit Configuration action - every configured benefit is listed', async () => {
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openBenefitConfigs(formulary.trades[0].id);
      expect((await drawer.readConfigIds()).length).toBe((await readBenefitConfigs(page, formulary.trades[0].id)).length);
    });

    await steps.step('Review the layout - each benefit shows under its English name with its effective date and current status', async () => {
      const cards = await drawer.readCards();
      for (const spec of specs) {
        const card = cards.find((c) => c.title.includes(spec.nameEn));
        expect(card, `a card for "${spec.nameEn}"`).toBeDefined();
        expect(card?.period).toContain(cardDate(spec.benefitEffectiveDate));
        expect(card?.status).toMatch(/\w/);
      }
    });
  });

  test(`TC-${CASES.actionsByStatus.azureId}: should offer only the actions valid for each configuration's status`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    steps,
  }, testInfo) => {
    const timeline = await provide(testInfo, 'a benefit configuration timeline', () => benefitTimeline(page, formularyIn, ['future', 'active', 'expired']));
    const draft = await addBenefitConfig(page, timeline.tradeId, { nameEn: `Draft Explore ${stamp()}`, benefitEffectiveDate: isoIn(3 * 24 * 60) });
    requireAccepted(testInfo, draft, 'a draft benefit configuration on the published formulary');
    let drawer!: BenefitConfigDrawer;
    const names = { ...timeline.names, draft: draft.nameEn };

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await waitUntil(page, timeline.expiredAfter);
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(timeline.formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the list holding Draft (Not Live), Future, Active and Expired configurations - each shows its status', async () => {
      await formularyManagementPage.openDetails(timeline.formulary.nameEn);
      await formularyTradesTab.open();
      drawer = await formularyTradesTab.openBenefitConfigs(timeline.tradeId);
      const status = async (name: string) => (await drawer.readCard(await drawer.configIdByName(name))).status;
      expect(await status(names.draft)).toMatch(DRAFT);
      expect(await status(names.future ?? '')).toMatch(FUTURE);
      expect(await status(names.active ?? '')).toMatch(ACTIVE);
      expect(await status(names.expired ?? '')).toMatch(EXPIRED);
    });

    await steps.step('Explore the actions on each status - only the actions valid for that status are offered', async () => {
      const offered = async (name: string) => {
        const id = await drawer.configIdByName(name);
        return { edit: await drawer.getCardActionAvailability(id, 'edit'), delete: await drawer.getCardActionAvailability(id, 'delete') };
      };
      expect(await offered(names.future ?? ''), 'Future: edit and delete').toEqual({ edit: 'available', delete: 'available' });
      expect((await offered(names.draft)).delete, 'Draft: delete').toBe('available');
      for (const stage of ['active', 'expired'] as const) {
        const actions = await offered(names[stage] ?? '');
        expect(actions.edit, `${stage}: no edit`).not.toBe('available');
        expect(actions.delete, `${stage}: no delete`).not.toBe('available');
      }
    });
  });

  test(`TC-${CASES.noPermission.azureId}: should withhold add, edit and delete of configurations from a user without the analyst rights`, async ({
    page,
    formularyIn,
    formularyRole,
    steps,
  }, testInfo) => {
    const name = `Guarded Benefit ${stamp()}`;
    const formulary = await formularyIn('Future', { payerName: SCOPED_PAYER, benefitConfigs: [{ nameEn: name }] });
    const trade = formulary.trades[0];
    const session = await signInWithFormularyRights(formularyRole, { lacking: ['addBenefitConfig', 'updateBenefitConfig', 'deleteBenefitConfig'] });
    const detail = new FormularyDetailPage(session.page);
    const trades = new FormularyTradesTab(session.page);

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await detail.openExpectingFailure(formulary.id);
      expect(session.page.url()).toContain(formulary.id);
    });

    await steps.step('As a user without the analyst role, open the Benefit Configuration action - Add, Edit and Delete are disabled or hidden', async () => {
      const opened = (await detail.isLoaded()) && (await trades.open().then(() => true).catch(() => false))
        && (await trades.getCardActionAvailability(trade.id, 'benefitConfig')) === 'available';
      if (opened) {
        const drawer = await trades.openBenefitConfigs(trade.id);
        expect(await drawer.isAddOffered()).not.toBe('available');
        const id = await drawer.configIdByName(name);
        expect(await drawer.getCardActionAvailability(id, 'edit')).not.toBe('available');
        expect(await drawer.getCardActionAvailability(id, 'delete')).not.toBe('available');
      } else {
        expect(await trades.getCardActionAvailability(trade.id, 'benefitConfig')).not.toBe('available');
      }
    });

    await steps.step('Attempt to reach the Add form directly - access is denied with an authorization message', async () => {
      const direct = await addBenefitConfig(session.page, trade.id, { nameEn: `Denied Benefit ${stamp()}`, benefitEffectiveDate: isoDaysAfter(formulary.effectiveDate, 1) });
      expect(direct.status, `a direct AddBenefitConfig answered ${direct.status}`).toBeGreaterThanOrEqual(400);
      expect(answerText(direct)).toMatch(MESSAGE.denied);
      expect((await readBenefitConfigs(page, trade.id)).map((b) => b.benefitConfigNameEn)).not.toContain(direct.nameEn);
    });
  });

  test(`TC-${CASES.sharedAcrossUsers.azureId}: should show a configuration added by one user to another user with access to the formulary`, async ({
    page,
    formularyManagementPage,
    formularyTradesTab,
    formularyIn,
    formularyRole,
    steps,
  }, testInfo) => {
    const formulary = await formularyIn('Draft', { payerName: SCOPED_PAYER });
    const trade = formulary.trades[0];
    const name = `Shared Benefit ${stamp()}`;

    await steps.critical('One user adds a benefit configuration to the formulary - it is saved', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
      await formularyManagementPage.openDetails(formulary.nameEn);
      await formularyTradesTab.open();
      const drawer = await formularyTradesTab.openBenefitConfigs(trade.id);
      await drawer.openAdd();
      await drawer.fill(benefit(name, 'منفعة مشتركة', formulary.effectiveDate));
      expect((await drawer.attemptSave()).status).toBe(200);
      expect((await readBenefitConfigs(page, trade.id)).map((b) => b.benefitConfigNameEn)).toContain(name);
    });

    await steps.step('Another user with access to the same formulary opens it - the configuration is visible to them', async () => {
      const session = await signInWithFormularyRights(formularyRole, { held: ['viewFormulary', 'viewTrades', 'viewBenefitConfigs'], lacking: [] });
      expect((await readBenefitConfigs(session.page, trade.id)).map((b) => b.benefitConfigNameEn)).toContain(name);
      const detail = new FormularyDetailPage(session.page);
      const trades = new FormularyTradesTab(session.page);
      await detail.open(formulary.id);
      await trades.open();
      const drawer = await trades.openBenefitConfigs(trade.id);
      expect(await drawer.configIdByName(name)).not.toBe('');
    });
  });
});
