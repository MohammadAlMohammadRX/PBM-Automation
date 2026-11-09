import { test, expect } from '../../../fixtures';
import type { Page } from '@playwright/test';
import { MEMBER_COB, MEMBER_DASHBOARD, MEMBER_DETAIL } from '../../../constants/member/memberIds';
import { CASES, DASHBOARD_LABELS, SHARED_POLICY } from '../../../data/member/viewMember.data';
import { readMember, type MemberBenefitPolicy } from '../../../utils/MemberProvisioning';
import { SharedEnrolment, policyTerm, riyadhDateTime } from '../../../utils/member/writerCHelpers';

/** Whether an element (by id) is on screen now. */
const shownNow = (page: Page, id: string): Promise<boolean> => page.locator(`#${id}`).first().isVisible().catch(() => false);

/**
 * User story 14383: View Member - the tabs that need a policy. ONE suite member
 * (`Complete`: data on every record tab) enrolled in ONE approved suite policy
 * (deductible 0) is shared by the three cases - they only read it - and
 * discarded after the last (policy retired, member deactivated: the approved
 * enrolment blocks its delete). See the data file for the literal readings.
 */
test.describe('US 14383 - View Member - policy tabs', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  const shared = new SharedEnrolment({ label: 'View member - one policy', state: 'Complete', policies: 1, policySpecs: [{ ...SHARED_POLICY }] });
  test.beforeAll(async ({ browser }, testInfo) => shared.build(browser, testInfo));
  test.afterAll(async ({ browser }) => shared.discard(browser));

  test(`TC-${CASES.dashboard.azureId}: should display every PBM Accumulator Dashboard value of the member's policy`, async ({
    page,
    memberManagementPage,
    memberAccumulatorDashboardTab,
    steps,
  }) => {
    const { member, enrolments } = shared.require(test.info());
    let policy!: MemberBenefitPolicy;

    await steps.critical('Navigate to the Member Management module - the Member Management list view loads', async () => {
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(member.displayNameEn)).toBe(true);
    });

    await steps.critical('Open a member record in view mode and select the PBM Accumulator Dashboard tab - the tab opens', async () => {
      await memberManagementPage.openDetails(member.displayNameEn);
      await memberAccumulatorDashboardTab.open();
      expect((await memberAccumulatorDashboardTab.readMemberCard()).memberId).toBe(member.code);
      policy = (await readMember(page, member.id)).benefitPolicies.find((p) => p.policyNumber === enrolments[0].policy.policyNumber) as MemberBenefitPolicy;
      expect(policy, `GetMember lists ${enrolments[0].policy.policyNumber}`).toBeTruthy();
    });

    await steps.step('Verify Policy Number, Plan, Payer, PBM Member ID, Relationship, Policy Status, Effective Period, the Policy-Level Benefit terms, Accumulators & Sublimits, Benefit Year, Deductible / Out-of-Pocket met, Policy Sublimit used, No Cap and Trade Sub-Caps - each shows accurate, current values', async () => {
      const text = (await memberAccumulatorDashboardTab.getText()).toLowerCase();
      expect(DASHBOARD_LABELS.filter((label) => !text.includes(label.toLowerCase())), 'labels missing from the tab').toEqual([]);
      const shown = await memberAccumulatorDashboardTab.readPolicy();
      const card = await memberAccumulatorDashboardTab.readMemberCard();
      const period = shown.policy.effectivePeriod;
      const yearStart = (policy.accumulators?.benefitPeriodStart ?? policy.policyEffective).slice(0, 10);
      expect({
        policyNumber: shown.policy.policyNumber,
        plan: shown.policy.plan,
        payer: shown.policy.payer,
        pbmMemberId: shown.policy.pbmMemberId,
        relationship: shown.policy.relationship,
        policyStatus: shown.policy.policyStatus,
        effectivePeriodIsThePolicys: period.includes(riyadhDateTime(policy.policyEffective)) && period.includes(riyadhDateTime(policy.policyExpiry)) ? true : period,
        deductible: shown.benefit.deductible,
        coinsurance: shown.benefit.coinsurance,
        outOfPocketMaximum: shown.benefit.outOfPocketMaximum,
        sublimit: shown.benefit.sublimit,
        accumulatorsBenefitYear: shown.accumulatorsYear.includes(yearStart) ? true : shown.accumulatorsYear,
        memberCardBenefitYear: card.benefitYear !== '' && card.benefitYear !== '—' ? true : `"${card.benefitYear}"`,
        deductibleMetNothingNoCap: /SAR 0\.00/.test(shown.accumulator.deductibleMet) && /no cap on this policy/i.test(shown.accumulator.deductibleMet) ? true : shown.accumulator.deductibleMet,
        outOfPocketMetNothing: /SAR 0\.00/.test(shown.accumulator.outOfPocketMet) ? true : shown.accumulator.outOfPocketMet,
        policySublimitUsedNothing: /SAR 0\.00/.test(shown.accumulator.policySublimit) ? true : shown.accumulator.policySublimit,
        tradeSubCapsInUse: /\b0\b/.test(shown.accumulator.tradeSublimits) ? true : shown.accumulator.tradeSublimits,
      }, 'the PBM Accumulator Dashboard as shown').toEqual({
        policyNumber: enrolments[0].policy.policyNumber,
        plan: policy.planNameEn,
        payer: policy.payerNameEn,
        pbmMemberId: member.code,
        relationship: policy.relationshipNameEn,
        policyStatus: policy.policyStatusEn,
        effectivePeriodIsThePolicys: true,
        deductible: policyTerm(policy.deductibleAmount),
        coinsurance: `${policy.coinsurancePercent}%`,
        outOfPocketMaximum: policyTerm(policy.outOfPocketMaximum),
        sublimit: policyTerm(policy.sublimitAmount),
        accumulatorsBenefitYear: true,
        memberCardBenefitYear: true,
        deductibleMetNothingNoCap: true,
        outOfPocketMetNothing: true,
        policySublimitUsedNothing: true,
        tradeSubCapsInUse: true,
      });
    });
  });

  test(`TC-${CASES.coverageOrdering.azureId}: should display every coverage ordering detail of each of the member's policies`, async ({
    page,
    memberManagementPage,
    memberCobTab,
    steps,
  }) => {
    const { member } = shared.require(test.info());
    let policies: MemberBenefitPolicy[] = [];

    await steps.critical('Navigate to the Member Management module - the Member Management list view loads', async () => {
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(member.displayNameEn)).toBe(true);
    });

    await steps.critical('Open a member record in view mode and select the Coverage Ordering (COB) tab - the tab opens', async () => {
      await memberManagementPage.openDetails(member.displayNameEn);
      const entries = await memberCobTab.open();
      expect(entries.filter((e) => e.isCurrent).length, 'policies in the current ordering').toBeGreaterThan(0);
      policies = (await readMember(page, member.id)).benefitPolicies;
    });

    await steps.step('Verify each policy shows Policy Name, Policy Number, Effective Start Date, Effective End Date, Status, Deductible, Coinsurance, OOPM and Sublimit - accurate values for every policy listed', async () => {
      const entries = (await memberCobTab.fetchTimeline(member.id)).filter((e) => e.isCurrent).sort((a, b) => a.coverageOrder - b.coverageOrder);
      const rows = await memberCobTab.readRows();
      expect(rows.length, 'rows shown').toBe(entries.length);
      const report = entries.map((entry, i) => {
        const row = rows[i] ?? { text: '', benefit: '', order: '' };
        const status = policies.find((p) => p.policyId === entry.policyId)?.policyStatusEn ?? '(status unknown)';
        return {
          policy: entry.policyNumber,
          policyName: row.text.includes(entry.policyNameEn),
          policyNumber: row.text.includes(entry.policyNumber),
          effectiveStartDate: row.text.includes(riyadhDateTime(entry.policyEffectiveDate)),
          effectiveEndDate: row.text.includes(riyadhDateTime(entry.policyExpiryDate)),
          status: new RegExp(`\\b${status}\\b`, 'i').test(row.text) ? true : `no "${status}" in "${row.text}"`,
          deductible: row.benefit.includes(`Deductible: ${policyTerm(entry.deductibleAmount)}`),
          coinsurance: row.benefit.includes(`Coinsurance: ${entry.coinsurancePercent}%`),
          oopm: row.benefit.includes(`OOPM: ${policyTerm(entry.outOfPocketMaximum)}`),
          sublimit: row.benefit.includes(`Sublimit: ${policyTerm(entry.sublimitAmount)}`),
        };
      });
      expect(report, 'each row against its policy').toEqual(entries.map((e) => ({
        policy: e.policyNumber, policyName: true, policyNumber: true, effectiveStartDate: true, effectiveEndDate: true, status: true, deductible: true, coinsurance: true, oopm: true, sublimit: true,
      })));
    });
  });

  test(`TC-${CASES.tabSwitching.azureId}: should show each tab's own current data when switching through every tab and back`, async ({
    page,
    memberManagementPage,
    memberInformationTab,
    memberNonNationalTab,
    memberAddressTab,
    memberEmergencyContactsTab,
    memberAccumulatorDashboardTab,
    memberCobTab,
    steps,
  }) => {
    const { member, enrolments } = shared.require(test.info());
    const record = await readMember(page, member.id);
    const policyNumber = enrolments[0].policy.policyNumber;

    await steps.critical('Navigate to the Member Management module - the Member Management list view loads', async () => {
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(member.displayNameEn)).toBe(true);
    });

    await steps.critical('Open a member record in view mode - the Member Information tab is shown by default', async () => {
      await memberManagementPage.openDetails(member.displayNameEn);
      expect(await memberInformationTab.readField('displayName')).toBe(member.displayNameEn);
      expect(await shownNow(page, MEMBER_DETAIL.nonNational.email), 'another tab\'s values on opening').toBe(false);
    });

    await steps.step('Click through Non-National Registry, Address, Emergency Contacts, PBM Accumulator Dashboard, Coverage Ordering and back to Member Information - each tab displays its own correct data without residual data from the previous one', async () => {
      const sequence: { tab: string; open: () => Promise<unknown>; read: () => Promise<boolean>; previous: string }[] = [
        { tab: 'Non-National Registry', open: () => memberNonNationalTab.open(), read: async () => (await memberNonNationalTab.readField('email')) === record.email, previous: MEMBER_DETAIL.patient.displayName },
        { tab: 'Address', open: () => memberAddressTab.open(), read: async () => (await memberAddressTab.readField('buildingNumber')) === record.buildingNumber, previous: MEMBER_DETAIL.nonNational.email },
        { tab: 'Emergency Contacts', open: () => memberEmergencyContactsTab.open(), read: async () => (await memberEmergencyContactsTab.readField('name')) === (record.emergencyContacts[0]?.name ?? '(none stored)'), previous: MEMBER_DETAIL.address.buildingNumber },
        { tab: 'PBM Accumulator Dashboard', open: () => memberAccumulatorDashboardTab.open(), read: async () => (await memberAccumulatorDashboardTab.readPolicy()).policy.policyNumber === policyNumber, previous: MEMBER_DETAIL.emergency.name },
        { tab: 'Coverage Ordering (COB)', open: () => memberCobTab.open(), read: async () => (await memberCobTab.readPolicyNumbers()).includes(policyNumber), previous: MEMBER_DASHBOARD.policy.policyNumber },
        { tab: 'Member Information', open: () => memberInformationTab.open(), read: async () => (await memberInformationTab.readField('displayName')) === member.displayNameEn, previous: MEMBER_COB.prefix },
      ];
      const report: { tab: string; ownData: boolean; residual: boolean }[] = [];
      for (const step of sequence) {
        await step.open();
        report.push({ tab: step.tab, ownData: await step.read(), residual: await shownNow(page, step.previous) });
      }
      expect(report, 'each tab after switching to it').toEqual(sequence.map((s) => ({ tab: s.tab, ownData: true, residual: false })));
    });
  });
});
