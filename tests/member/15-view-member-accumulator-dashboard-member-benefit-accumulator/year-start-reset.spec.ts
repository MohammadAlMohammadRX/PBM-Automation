import { test, expect, type MemberSession } from '../../../utils/member/memberRole';
import type { Page, TestInfo } from '@playwright/test';
import { blockedByPrecondition } from '../../../fixtures/testStatus.fixture';
import type { MemberJobClock } from '../../../fixtures/memberModule.fixture';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { MemberAccumulatorPage } from '../../../pages/policy/MemberAccumulatorPage';
import { PolicyBenefitResetsPage } from '../../../pages/policy/PolicyBenefitResetsPage';
import {
  ACCESS_RESTRICTED,
  AUTOMATIC_KIND,
  BLOCKED_CASES,
  CASES,
  EDIT_CONTROL,
  INDIVIDUAL_AMOUNT,
  MANUAL_KIND,
  NO_SUBLIMIT_USED,
  RESET_ANCHOR,
} from '../../../data/member/memberBenefitAccumulator.data';
import { publishPolicyChange, readPolicy, updatePolicyFields } from '../../../utils/PolicyProvisioning';
import { readResetHistory as readResetHistoryRows, searchResetHistory } from '../../../utils/policy/writerCHelpers';
import { readMember, readResetHistory, type MemberBenefitPolicy, type ResetRun } from '../../../utils/MemberProvisioning';
import {
  accumulatorPageControls,
  asSession,
  chooseBenefitPeriod,
  ensurePolicyActive,
  ensureYearStartReset,
  findOrBuildAnchor,
  refused,
  riyadhDateText,
  utcTime,
  type AnchorPolicy,
  type SuiteAnchor,
  type YearStartReset,
} from '../../../utils/member/writerDHelpers';

/** The shared reset member and its policy (data/member/memberBenefitAccumulator.data.ts) - BLOCKED with the application's answer when it cannot be built. */
async function resetAnchor(page: Page, testInfo: TestInfo): Promise<{ anchor: SuiteAnchor; policy: AnchorPolicy }> {
  try {
    const anchor = await findOrBuildAnchor(page, RESET_ANCHOR);
    return { anchor, policy: anchor.policies[0] };
  } catch (error) {
    return blockedByPrecondition(testInfo, 'the shared reset member enrolled in an approved suite policy', error);
  }
}

/** Phase 2: the policy ACTIVE through the moved policy lifecycle job - BLOCKED (a precondition) when it does not turn Active. */
async function makeActive(page: Page, policy: AnchorPolicy, clock: MemberJobClock, testInfo: TestInfo): Promise<void> {
  try {
    await ensurePolicyActive(page, policy.policyId, clock);
  } catch (error) {
    blockedByPrecondition(testInfo, `suite policy ${policy.policyNumber} made Active by the moved policy lifecycle job`, error);
  }
}

/** The member's accumulators for the policy, as GetMember reports them. */
async function accumulatorsOf(page: Page, memberId: string, policyId: string): Promise<MemberBenefitPolicy['accumulators']> {
  return (await readMember(page, memberId)).benefitPolicies.find((b) => b.policyId === policyId)?.accumulators ?? null;
}

/** The Individual section's totals on the accumulator page ("0.00" ...), null when a line is missing. */
async function individualTotals(accumulator: MemberAccumulatorPage): Promise<{ deductible: string | null; outOfPocket: string | null; sublimits: string }> {
  const sections = await accumulator.readSections();
  return {
    deductible: INDIVIDUAL_AMOUNT.deductible.exec(sections.individual)?.[1] ?? null,
    outOfPocket: INDIVIDUAL_AMOUNT.outOfPocket.exec(sections.individual)?.[1] ?? null,
    sublimits: sections.sublimits,
  };
}

const rowsText = (rows: ResetRun[]): string => rows.map((r) => `${r.kind} ${r.status} ${r.runAtUtc} (${r.periodStart}..${r.periodEnd})`).join('; ') || 'no row';

/** The periods the Benefit Period select offers other than the current one. */
async function priorPeriods(accumulator: MemberAccumulatorPage): Promise<string[]> {
  return (await accumulator.readPeriod()).options.filter((o) => !/current/i.test(o) && o.trim() !== '');
}

/**
 * User story 15208: Member Benefit Accumulator - accumulators reset at each
 * benefit year start. The suite's OWN policy (its benefit year starts today) is
 * made Active and reset by the SCHEDULED jobs, which the administrator moves
 * (memberJobClock, always restored). One shared member / policy per day; each
 * case asks for the phase it needs, so the jobs move as few times as possible.
 * 19980 comes first: it watches the screen while the reset runs.
 */
test.describe('US 15208 - View Member - Accumulator Dashboard - Member Benefit Accumulator', () => {
  test.describe.configure({ timeout: 30 * 60_000 });

  test(`TC-${CASES.atomic.azureId}: should never show mixed old-year and new-year totals while the benefit year rolls over`, async ({
    page,
    memberJobClock,
    memberManagementPage,
    memberAccumulatorPage,
    steps,
  }) => {
    const { anchor, policy } = await resetAnchor(page, test.info());
    const snapshots: { at: string; value: string; range: string; deductible: string | null; outOfPocket: string | null; api: string }[] = [];

    await steps.critical('Navigate to the Member Management module - the module loads (the member\'s policy in force, its rollover scheduled)', async () => {
      await makeActive(page, policy, memberJobClock, test.info());
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(anchor.member.displayNameEn)).toBe(true);
    });

    await steps.step('Open the Member Benefit Accumulator screen for the member at the moment the benefit year rolls over - the screen displays a single, consistent set of totals for either the old or new year, never a mixture of both', async () => {
      await memberAccumulatorPage.open(policy.policyMemberId);
      const observe = async (): Promise<void> => {
        await memberAccumulatorPage.open(policy.policyMemberId);
        const period = await memberAccumulatorPage.readPeriod();
        const totals = await individualTotals(memberAccumulatorPage);
        const acc = await accumulatorsOf(page, anchor.member.id, policy.policyId);
        snapshots.push({ at: new Date().toISOString(), value: period.value, range: period.range, ...totals, api: acc ? `${riyadhDateText(acc.benefitPeriodStart)} – ${riyadhDateText(acc.benefitPeriodEnd)}` : '' });
      };
      const reset = await ensureYearStartReset(page, policy, memberJobClock, observe);
      if (!reset.moved) {
        steps.blocked(`the year-start reset of the shared policy ${policy.policyNumber} already ran today (${rowsText(reset.rows)}) before this case could watch it; `
          + 'the moment of a rollover can be watched only once per policy - it is watched again with the next day\'s policy');
      }
      const mixed = snapshots.filter((s) => !s.value.startsWith(s.range) || s.deductible === null || s.outOfPocket === null
        || (s.api !== '' && !s.value.replace(/\s+/g, ' ').startsWith(s.api.replace(/\s+/g, ' '))));
      expect({ rolledOver: reset.rows.length > 0, watched: snapshots.length > 1, mixed },
        `the reset job moved to "${reset.cron}" (fires ${reset.firesAt}): ${rowsText(reset.rows)}; snapshots ${JSON.stringify(snapshots).slice(0, 1200)}`)
        .toEqual({ rolledOver: true, watched: true, mixed: [] });
    });
  });

  test(`TC-${CASES.autoReset.azureId}: should reset the member's accumulators to zero automatically when a new benefit year begins`, async ({
    page,
    memberJobClock,
    memberManagementPage,
    memberAccumulatorPage,
    steps,
  }) => {
    const { anchor, policy } = await resetAnchor(page, test.info());

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await makeActive(page, policy, memberJobClock, test.info());
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(anchor.member.displayNameEn)).toBe(true);
    });

    await steps.step("Open the member's Member Benefit Accumulator screen before the benefit year rolls over - the accumulators show the accrued amounts for the ending benefit year", async () => {
      await memberAccumulatorPage.open(policy.policyMemberId);
      const totals = await individualTotals(memberAccumulatorPage);
      expect({ deductible: totals.deductible !== null, outOfPocket: totals.outOfPocket !== null }, `the Individual section: ${(await memberAccumulatorPage.readSections()).individual}`)
        .toEqual({ deductible: true, outOfPocket: true });
    });

    await steps.step('Allow the benefit year to roll over to the new start date and reopen the Member Benefit Accumulator screen - the deductible and out-of-pocket maximum accumulators for the new benefit year both show zero', async () => {
      const reset = await ensureYearStartReset(page, policy, memberJobClock);
      await memberAccumulatorPage.open(policy.policyMemberId);
      const totals = await individualTotals(memberAccumulatorPage);
      const acc = await accumulatorsOf(page, anchor.member.id, policy.policyId);
      expect({ resetWithoutManualIntervention: reset.rows.length > 0, deductible: totals.deductible, outOfPocket: totals.outOfPocket, apiDeductible: acc?.individualDeductibleMet ?? null, apiOutOfPocket: acc?.individualOOPMMet ?? null },
        `the scheduled reset rows: ${rowsText(reset.rows)}${reset.moved ? ` (job moved to "${reset.cron}")` : ''}`)
        .toEqual({ resetWithoutManualIntervention: true, deductible: '0.00', outOfPocket: '0.00', apiDeductible: 0, apiOutOfPocket: 0 });
    });
  });

  test(`TC-${CASES.individualReset.azureId}: should reset the member's own deductible and out-of-pocket totals at year start`, async ({
    page,
    memberJobClock,
    memberManagementPage,
    memberAccumulatorPage,
    steps,
  }) => {
    const { anchor, policy } = await resetAnchor(page, test.info());

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await makeActive(page, policy, memberJobClock, test.info());
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(anchor.member.displayNameEn)).toBe(true);
    });

    await steps.step('Open the Member Benefit Accumulator screen after the benefit year has rolled over - the individual deductible and out-of-pocket totals both display zero for the new year', async () => {
      const reset = await ensureYearStartReset(page, policy, memberJobClock);
      await memberAccumulatorPage.open(policy.policyMemberId);
      const totals = await individualTotals(memberAccumulatorPage);
      expect({ rolledOver: reset.rows.length > 0, deductible: totals.deductible, outOfPocket: totals.outOfPocket }, `the scheduled reset rows: ${rowsText(reset.rows)}`)
        .toEqual({ rolledOver: true, deductible: '0.00', outOfPocket: '0.00' });
    });
  });

  test(`TC-${CASES.everyType.azureId}: should reset the deductible, out-of-pocket and sublimit accumulators at benefit year start`, async ({
    page,
    memberJobClock,
    memberManagementPage,
    memberAccumulatorPage,
    steps,
  }) => {
    const { anchor, policy } = await resetAnchor(page, test.info());
    let reset!: YearStartReset;

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await makeActive(page, policy, memberJobClock, test.info());
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(anchor.member.displayNameEn)).toBe(true);
    });

    await steps.step("Open the Member Benefit Accumulator screen after the benefit year has rolled over - the screen loads showing the new year's totals", async () => {
      reset = await ensureYearStartReset(page, policy, memberJobClock);
      await memberAccumulatorPage.open(policy.policyMemberId);
      expect({ rolledOver: reset.rows.length > 0, current: /current/i.test((await memberAccumulatorPage.readPeriod()).value) }, `the scheduled reset rows: ${rowsText(reset.rows)}`)
        .toEqual({ rolledOver: true, current: true });
    });

    await steps.step('Check the deductible, out-of-pocket maximum, and sublimit accumulator lines against the checklist of tracked accumulator types - all three accumulator types show zero for the new benefit year', async () => {
      const totals = await individualTotals(memberAccumulatorPage);
      const acc = await accumulatorsOf(page, anchor.member.id, policy.policyId);
      expect({
        deductible: totals.deductible,
        outOfPocket: totals.outOfPocket,
        sublimit: NO_SUBLIMIT_USED.test(totals.sublimits),
        api: acc ? [acc.individualDeductibleMet, acc.individualOOPMMet, acc.policySublimitConsumed] : null,
      }, `the sublimits section: ${totals.sublimits}`).toEqual({ deductible: '0.00', outOfPocket: '0.00', sublimit: true, api: [0, 0, 0] });
    });
  });

  test(`TC-${CASES.priorYear.azureId}: should keep a prior benefit year's accumulator totals available after the reset`, async ({
    page,
    memberJobClock,
    memberManagementPage,
    memberAccumulatorPage,
    steps,
  }) => {
    const { anchor, policy } = await resetAnchor(page, test.info());
    let prior = '';
    let reset!: YearStartReset;

    await steps.critical('Navigate to the Member Management module - the module loads (the member has completed a prior benefit year and the current year has reset)', async () => {
      await makeActive(page, policy, memberJobClock, test.info());
      reset = await ensureYearStartReset(page, policy, memberJobClock);
      await memberAccumulatorPage.open(policy.policyMemberId);
      prior = (await priorPeriods(memberAccumulatorPage))[0] ?? '';
      if (prior === '') {
        steps.blocked(`the Benefit Period select of ${policy.policyNumber} offers no prior benefit year (${(await memberAccumulatorPage.readPeriod()).options.join(' | ')}): `
          + `the suite's policy starts today (an effective date in the past is refused) and the year-start reset (${rowsText(reset.rows)}) closed no earlier period`);
      }
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(anchor.member.displayNameEn)).toBe(true);
    });

    await steps.step('Open the Member Benefit Accumulator screen and select the prior benefit year from the history - the screen displays the deductible and out-of-pocket totals as they stood at the end of that prior year', async () => {
      await memberAccumulatorPage.open(policy.policyMemberId);
      await chooseBenefitPeriod(page, prior);
      const totals = await individualTotals(memberAccumulatorPage);
      const closed = reset.rows[0];
      expect({ period: (await memberAccumulatorPage.readPeriod()).value, deductible: totals.deductible, outOfPocket: totals.outOfPocket }, `the reset row: ${rowsText(reset.rows)}`)
        .toEqual({
          period: prior,
          deductible: closed ? Number(closed.deductibleUsed ?? 0).toFixed(2) : expect.any(String),
          outOfPocket: closed ? Number(closed.outOfPocketUsed ?? 0).toFixed(2) : expect.any(String),
        });
    });
  });

  test(`TC-${CASES.priorReadOnly.azureId}: should keep a closed prior benefit year's totals read-only`, async ({
    page,
    memberJobClock,
    memberManagementPage,
    memberAccumulatorPage,
    steps,
  }) => {
    const { anchor, policy } = await resetAnchor(page, test.info());
    let prior = '';

    await steps.critical('Navigate to the Member Management module - the module loads (a prior benefit year has closed and reset)', async () => {
      await makeActive(page, policy, memberJobClock, test.info());
      const reset = await ensureYearStartReset(page, policy, memberJobClock);
      await memberAccumulatorPage.open(policy.policyMemberId);
      prior = (await priorPeriods(memberAccumulatorPage))[0] ?? '';
      if (prior === '') {
        steps.blocked(`the Benefit Period select of ${policy.policyNumber} offers no closed prior benefit year (${(await memberAccumulatorPage.readPeriod()).options.join(' | ')}): `
          + `the suite's policy starts today and the year-start reset (${rowsText(reset.rows)}) closed no earlier period`);
      }
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(anchor.member.displayNameEn)).toBe(true);
    });

    await steps.step("Open the Member Benefit Accumulator screen and select a closed prior benefit year - the prior year's totals are displayed in a read-only view", async () => {
      await memberAccumulatorPage.open(policy.policyMemberId);
      await chooseBenefitPeriod(page, prior);
      const totals = await individualTotals(memberAccumulatorPage);
      const controls = await accumulatorPageControls(page);
      expect({ shown: totals.deductible !== null && totals.outOfPocket !== null, editableFields: controls.editable }).toEqual({ shown: true, editableFields: 0 });
    });

    await steps.step("Attempt to locate any edit or save control for the prior year's totals - no edit or save controls are available for the closed benefit year", async () => {
      const controls = await accumulatorPageControls(page);
      expect(controls.buttons.filter((b) => EDIT_CONTROL.test(b)), `buttons on the screen: ${controls.buttons.join(', ')}`).toEqual([]);
    });
  });

  test(`TC-${CASES.autoVsManual.azureId}: should record an automatic year-start reset distinctly from a manual reset`, async ({
    page,
    memberJobClock,
    memberManagementPage,
    memberAccumulatorPage,
    policyBenefitResetsPage,
    steps,
  }) => {
    const { anchor, policy } = await resetAnchor(page, test.info());
    let manual: ResetRun | undefined;
    let automaticKind = '';

    await steps.critical('Navigate to the Member Management module - the module loads (one policy has only the automatic reset, another a manual reset)', async () => {
      await makeActive(page, policy, memberJobClock, test.info());
      manual = (await readResetHistory(page, {}, 200)).items.find((r) => MANUAL_KIND.test(String(r.kind)));
      if (!manual) {
        steps.blocked('the reset history holds no MANUAL reset of any policy to compare with: the suite never creates one (Reset now is refused on the day a '
          + 'benefit period starts, and the suite does not reset a policy it did not create)');
      }
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(anchor.member.displayNameEn)).toBe(true);
    });

    await steps.step('Open the Member Benefit Accumulator screen for the policy with only the automatic reset - the reset history shows an automatic, year-start reset entry', async () => {
      const reset = await ensureYearStartReset(page, policy, memberJobClock);
      await memberAccumulatorPage.open(policy.policyMemberId);
      await policyBenefitResetsPage.open();
      await policyBenefitResetsPage.openTab('history');
      await searchResetHistory(page, policy.policyNumber);
      const rows = (await readResetHistoryRows(page)).filter((r) => r.text.includes(policy.policyNumber));
      automaticKind = rows[0]?.kind ?? '';
      expect({ recorded: reset.rows.length > 0, automatic: rows.length > 0 && AUTOMATIC_KIND.test(automaticKind) && !MANUAL_KIND.test(automaticKind) },
        `history rows for ${policy.policyNumber}: ${rows.map((r) => `${r.kind} / ${r.status}`).join('; ') || 'none'}; API: ${rowsText(reset.rows)}`)
        .toEqual({ recorded: true, automatic: true });
    });

    await steps.step('Open the reset history for the policy with the manual reset - it shows a manual reset entry distinct from the automatic year-start type', async () => {
      const number = manual?.policyNumber ?? '';
      await policyBenefitResetsPage.open();
      await policyBenefitResetsPage.openTab('history');
      await searchResetHistory(page, number);
      const rows = (await readResetHistoryRows(page)).filter((r) => r.text.includes(number));
      const manualKind = rows.find((r) => MANUAL_KIND.test(r.kind))?.kind ?? '';
      expect({ manual: manualKind !== '', distinct: manualKind !== '' && manualKind !== automaticKind }, `history rows for ${number}: ${rows.map((r) => r.kind).join('; ') || 'none'}; automatic kind "${automaticKind}"`)
        .toEqual({ manual: true, distinct: true });
    });
  });

  test(`TC-${CASES.noAccumulatorRight.azureId}: should not show a member's reset history to a user without the accumulator permission`, async ({
    page,
    memberManagementPage,
    memberAccumulatorPage,
    memberRole,
    requireMemberListAccess,
    requireShapeApplied,
    steps,
  }) => {
    const { anchor, policy } = await resetAnchor(page, test.info());
    let session!: MemberSession;

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      // Baseline: a user holding the right (the administrator) opens the member's accumulator.
      await memberAccumulatorPage.open(policy.policyMemberId);
      session = await memberRole.signIn(CASES.noAccumulatorRight.shape);
      requireShapeApplied(session);
      await requireMemberListAccess(session);
      await memberManagementPage.openTable();
      await session.members.openTable();
      expect(await session.members.canListMembers()).toBe(true);
    });

    await steps.step('Attempt to open the Member Benefit Accumulator screen or its reset history for a member - access is denied and no reset history data is displayed', async () => {
      const accumulator = new MemberAccumulatorPage(session.page);
      const resets = new PolicyBenefitResetsPage(session.page);
      const accumulatorShown = await accumulator.open(policy.policyMemberId).then(() => true).catch(() => false);
      const accumulatorText = await session.detail.getScreenText();
      await resets.openExpectingDenial();
      const historyShown = await resets.isLoaded();
      const apiAccumulator = await asSession(session.page, 'POST', ApiEndpoints.memberAccumulator, { policyMemberId: policy.policyMemberId });
      const apiHistory = await asSession(session.page, 'POST', ApiEndpoints.policyResetHistory, { pageNumber: 1, rowsPerPage: 10 });
      expect({ accumulatorShown, historyShown, accumulatorRefused: refused(apiAccumulator), historyRefused: refused(apiHistory), denied: ACCESS_RESTRICTED.test(accumulatorText) },
        `GetMemberAccumulator ${apiAccumulator.status}, GetResetJobHistory ${apiHistory.status}; the screen read: ${accumulatorText.slice(0, 160)} (${anchor.member.memberCode})`)
        .toEqual({ accumulatorShown: false, historyShown: false, accumulatorRefused: true, historyRefused: true, denied: true });
    });
  });

  test(`TC-${CASES.datesChanged.azureId}: should keep the accumulator consistent when the policy's benefit year dates change mid-year`, async ({
    page,
    memberJobClock,
    memberManagementPage,
    memberAccumulatorPage,
    steps,
  }) => {
    const { anchor, policy } = await resetAnchor(page, test.info());
    let before: { range: string; deductible: string | null; outOfPocket: string | null } = { range: '', deductible: null, outOfPocket: null };

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await makeActive(page, policy, memberJobClock, test.info());
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(anchor.member.displayNameEn)).toBe(true);
    });

    await steps.step('Open the Member Benefit Accumulator screen for the affected member before the benefit year date change - the current accumulator totals are shown', async () => {
      await memberAccumulatorPage.open(policy.policyMemberId);
      const totals = await individualTotals(memberAccumulatorPage);
      before = { range: (await memberAccumulatorPage.readPeriod()).range, deductible: totals.deductible, outOfPocket: totals.outOfPocket };
      expect({ deductible: before.deductible !== null, outOfPocket: before.outOfPocket !== null, range: before.range !== '' }).toEqual({ deductible: true, outOfPocket: true, range: true });
    });

    await steps.step("Edit the policy's benefit year dates in Policy Management and reopen the Member Benefit Accumulator screen - the screen reflects the updated benefit year period and retains or resets the totals consistently with the new boundary", async () => {
      const record = await readPolicy(page, policy.policyId);
      const newExpiry = new Date(utcTime(record.expiryDate) + CASES.datesChanged.extendDays * 86_400_000).toISOString();
      const staged = await updatePolicyFields(page, policy.policyId, { expiryDate: newExpiry });
      const published = staged.status < 300 ? await publishPolicyChange(page, policy.policyId, record.policyNameEn).then(() => 'approved').catch((e: unknown) => String(e).slice(0, 200)) : 'not staged';
      await memberAccumulatorPage.open(policy.policyMemberId);
      const period = await memberAccumulatorPage.readPeriod();
      const totals = await individualTotals(memberAccumulatorPage);
      expect({
        saved: published === 'approved',
        periodUpdated: period.range.includes(riyadhDateText(newExpiry)),
        totalsConsistent: (totals.deductible === before.deductible || totals.deductible === '0.00') && (totals.outOfPocket === before.outOfPocket || totals.outOfPocket === '0.00'),
      }, `UpdatePolicy ${staged.status} ${staged.text.slice(0, 600)} / ${published}; the period read "${period.range}" (before "${before.range}"), totals ${JSON.stringify(totals).slice(0, 200)}`)
        .toEqual({ saved: true, periodUpdated: true, totalsConsistent: true });
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
