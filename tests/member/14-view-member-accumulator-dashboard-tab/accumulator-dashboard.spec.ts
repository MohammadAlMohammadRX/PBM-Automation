import { test, expect, type MemberSession } from '../../../utils/member/memberRole';
import type { Page, TestInfo } from '@playwright/test';
import { blockedByPrecondition } from '../../../fixtures/testStatus.fixture';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import type { DashboardPolicyView, MemberAccumulatorDashboardTab } from '../../../pages/member/MemberAccumulatorDashboardTab';
import {
  ACCESS_RESTRICTED,
  BENEFIT_YEAR,
  BLOCKED_CASES,
  CASES,
  DASHBOARD_ANCHOR,
  WRITE_CONTROL,
} from '../../../data/member/viewMemberAccumulatorDashboardTab.data';
import { POLICY_SUITE_PAYER, SUITE_POLICY_PREFIX, policyStamp } from '../../../utils/PolicyProvisioning';
import {
  currentCobOrder,
  discardEnrolment,
  enrolSuiteMember,
  readMember,
  reorderCoverage,
  type MemberBenefitPolicy,
  type MemberEnrolment,
} from '../../../utils/MemberProvisioning';
import {
  asSession,
  dashboardControls,
  ensurePolicyActive,
  findOrBuildAnchor,
  percentText,
  refused,
  riyadhDateText,
  sarText,
  waitUntilPoliciesInForce,
  type SuiteAnchor,
} from '../../../utils/member/writerDHelpers';

/**
 * The shared dashboard member (data/member/viewMemberAccumulatorDashboardTab.data.ts):
 * found (built today) or built - three approved suite policies, coverage order
 * Dash1, Dash2, Dash3. BLOCKED with the application's answer when it cannot be built.
 */
async function dashboardMember(page: Page, testInfo: TestInfo): Promise<SuiteAnchor> {
  testInfo.setTimeout(testInfo.timeout + 3 * 60_000);
  try {
    return await findOrBuildAnchor(page, {
      ...DASHBOARD_ANCHOR,
      afterBuild: async (anchor) => {
        const ordered = await reorderCoverage(page, anchor.member.id, anchor.policies.map((p) => p.policyId));
        if (ordered.status >= 300) throw new Error(`ReorderMemberCoverage answered ${ordered.status} ${ordered.text.slice(0, 200)}`);
      },
    });
  } catch (error) {
    return blockedByPrecondition(testInfo, 'the shared dashboard member enrolled in three approved suite policies', error);
  }
}

/** Puts the anchor's coverage order back to Dash1, Dash2, Dash3 when a case left it otherwise. */
async function restoreOrder(page: Page, anchor: SuiteAnchor): Promise<void> {
  const wanted = anchor.policies.map((p) => p.policyId);
  if (JSON.stringify(await currentCobOrder(page, anchor.member.id)) !== JSON.stringify(wanted)) await reorderCoverage(page, anchor.member.id, wanted);
}

/** The policy-level terms GetMember holds for a policy, as the tab should print them. */
const termsOf = (p: MemberBenefitPolicy): DashboardPolicyView['benefit'] => ({
  deductible: sarText(p.deductibleAmount),
  coinsurance: percentText(p.coinsurancePercent),
  outOfPocketMaximum: sarText(p.outOfPocketMaximum),
  sublimit: sarText(p.sublimitAmount),
});

/** Selects the COB Policy button showing `policyNumber` and returns its view (null when none shows it). */
async function showPolicy(tab: MemberAccumulatorDashboardTab, policyNumber: string): Promise<DashboardPolicyView | null> {
  const count = Math.max(1, (await tab.readCobButtons()).length);
  for (let n = 1; n <= count; n += 1) {
    if (count > 1) await tab.selectCobPolicy(n);
    const view = await tab.readPolicy();
    if (view.policy.policyNumber === policyNumber) return view;
  }
  return null;
}

/** The policy numbers in COB Policy button order. */
async function shownOrder(tab: MemberAccumulatorDashboardTab): Promise<string[]> {
  return (await tab.readAllPolicies()).map((v) => v.policy.policyNumber);
}

/**
 * User story 15207: View Member - Accumulator Dashboard Tab.
 * The administrator is the Claims Operations Specialist. The cases share ONE
 * suite member in three approved suite policies (built once a day); the
 * restricted role is the Payer Admin shaped through `memberRole`.
 * Accumulator AMOUNTS cannot be produced (no claim can be posted) - those cases
 * are data-driven BLOCKED.
 */
test.describe('US 15207 - View Member - Accumulator Dashboard Tab', () => {
  test.describe.configure({ timeout: 12 * 60_000 });

  test(`TC-${CASES.memberCard.azureId}: should show the member's name, status, Member ID, Benefit Year and number of policies on the member card`, async ({
    page,
    memberManagementPage,
    memberDetailPage,
    memberAccumulatorDashboardTab,
    steps,
  }) => {
    const anchor = await dashboardMember(page, test.info());

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(anchor.member.displayNameEn)).toBe(true);
    });

    await steps.critical('Open the member record and select the Accumulator Dashboard tab - the tab loads and displays a member card', async () => {
      await memberDetailPage.open(anchor.member.id);
      await memberAccumulatorDashboardTab.open();
      expect((await memberAccumulatorDashboardTab.readMemberCard()).memberId).not.toBe('');
    });

    await steps.step("Review the member card contents - the card shows the member's name, status, Member ID, Benefit Year, and number of policies", async () => {
      const card = await memberAccumulatorDashboardTab.readMemberCard();
      const text = await memberAccumulatorDashboardTab.getText();
      const policies = (await readMember(page, anchor.member.id)).benefitPolicies.length;
      expect({
        name: text.includes(anchor.member.displayNameEn),
        status: /\bActive\b/.test(text),
        memberId: card.memberId,
        benefitYear: BENEFIT_YEAR.test(card.benefitYear),
        policies: card.policiesCount,
      }, `the card read ${JSON.stringify(card)}`).toEqual({ name: true, status: true, memberId: anchor.member.memberCode, benefitYear: true, policies: String(policies) });
    });
  });

  test(`TC-${CASES.singlePolicy.azureId}: should show a single policy directly without any COB Policy buttons`, async ({
    memberEnrolled,
    memberManagementPage,
    memberDetailPage,
    memberAccumulatorDashboardTab,
    steps,
  }) => {
    const { member, enrolments } = await memberEnrolled({ policies: 1 });

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(member.displayNameEn)).toBe(true);
    });

    await steps.critical('Open the member record and select the Accumulator Dashboard tab - the tab loads', async () => {
      await memberDetailPage.open(member.id);
      await memberAccumulatorDashboardTab.open();
      expect((await memberAccumulatorDashboardTab.readMemberCard()).memberId).toBe(member.code);
    });

    await steps.step('Review the tab for COB Policy switch buttons - no COB Policy 1 or Policy 2 buttons are displayed, since only one policy exists', async () => {
      const buttons = await memberAccumulatorDashboardTab.readCobButtons();
      const shown = (await memberAccumulatorDashboardTab.readPolicy()).policy.policyNumber;
      expect({ buttons, shown }).toEqual({ buttons: [], shown: enrolments[0].policy.policyNumber });
    });
  });

  test(`TC-${CASES.switchPolicies.azureId}: should switch between the member's policies with the COB Policy buttons`, async ({
    page,
    memberManagementPage,
    memberDetailPage,
    memberAccumulatorDashboardTab,
    steps,
  }) => {
    const anchor = await dashboardMember(page, test.info());
    let order: MemberBenefitPolicy[] = [];

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(anchor.member.displayNameEn)).toBe(true);
    });

    await steps.critical('Open the member record and select the Accumulator Dashboard tab - the tab loads and displays COB Policy 1 and COB Policy 2 buttons, with COB Policy 1 selected', async () => {
      await memberDetailPage.open(anchor.member.id);
      await memberAccumulatorDashboardTab.open();
      order = await memberAccumulatorDashboardTab.fetchPolicies(anchor.member.id);
      const buttons = await memberAccumulatorDashboardTab.readCobButtons();
      expect({ buttons: buttons.slice(0, 2), selected: await memberAccumulatorDashboardTab.selectedCobPolicy() }).toEqual({ buttons: ['COB Policy 1', 'COB Policy 2'], selected: 1 });
    });

    await steps.step("Select the COB Policy 2 button - the dashboard refreshes to show the second policy's details, and COB Policy 2 is now the selected button", async () => {
      await memberAccumulatorDashboardTab.selectCobPolicy(2);
      expect({ selected: await memberAccumulatorDashboardTab.selectedCobPolicy(), shown: (await memberAccumulatorDashboardTab.readPolicy()).policy.policyNumber })
        .toEqual({ selected: 2, shown: order[1]?.policyNumber });
    });

    await steps.step("Select the COB Policy 1 button - the dashboard refreshes back to the first policy's details, and COB Policy 1 is selected again", async () => {
      await memberAccumulatorDashboardTab.selectCobPolicy(1);
      expect({ selected: await memberAccumulatorDashboardTab.selectedCobPolicy(), shown: (await memberAccumulatorDashboardTab.readPolicy()).policy.policyNumber })
        .toEqual({ selected: 1, shown: order[0]?.policyNumber });
    });
  });

  test(`TC-${CASES.primaryFirst.azureId}: should label the member's primary paying policy COB Policy 1`, async ({
    page,
    memberManagementPage,
    memberDetailPage,
    memberAccumulatorDashboardTab,
    memberCobTab,
    steps,
  }) => {
    const anchor = await dashboardMember(page, test.info());

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await restoreOrder(page, anchor);
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(anchor.member.displayNameEn)).toBe(true);
    });

    await steps.critical('Open the member record and select the Accumulator Dashboard tab - the tab loads', async () => {
      await memberDetailPage.open(anchor.member.id);
      await memberAccumulatorDashboardTab.open();
      expect((await memberAccumulatorDashboardTab.readMemberCard()).memberId).toBe(anchor.member.memberCode);
    });

    await steps.step('Check which policy is shown under the COB Policy 1 button - it is the member\'s primary, first-paying policy as defined on the Coverage Ordering tab', async () => {
      await memberAccumulatorDashboardTab.selectCobPolicy(1);
      const first = (await memberAccumulatorDashboardTab.readPolicy()).policy.policyNumber;
      await memberCobTab.open();
      const primary = (await memberCobTab.readPolicyNumbers())[0] ?? '';
      expect(first, `the Coverage Ordering tab lists ${(await memberCobTab.readPolicyNumbers()).join(', ')}`).toBe(primary);
    });
  });

  test(`TC-${CASES.policyDetails.azureId}: should show every identifying detail of the selected policy`, async ({
    page,
    memberManagementPage,
    memberDetailPage,
    memberAccumulatorDashboardTab,
    steps,
  }) => {
    const anchor = await dashboardMember(page, test.info());

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(anchor.member.displayNameEn)).toBe(true);
    });

    await steps.critical('Open the member record and select the Accumulator Dashboard tab - the tab loads showing the first policy', async () => {
      await memberDetailPage.open(anchor.member.id);
      await memberAccumulatorDashboardTab.open();
      expect((await memberAccumulatorDashboardTab.readPolicy()).policy.policyNumber).not.toBe('');
    });

    await steps.step('Review the policy details section against the checklist: Policy Number, Plan, Payer, PBM Member ID, Relationship, Policy Status, Effective Period - every field is present and populated with the correct value', async () => {
      const shown = (await memberAccumulatorDashboardTab.readPolicy()).policy;
      const p = (await memberAccumulatorDashboardTab.fetchPolicies(anchor.member.id)).find((b) => b.policyNumber === shown.policyNumber);
      expect(p, `policy ${shown.policyNumber} among the member's policies`).toBeDefined();
      expect({
        policyNumber: shown.policyNumber,
        plan: shown.plan,
        payer: shown.payer,
        pbmMemberId: shown.pbmMemberId,
        relationship: shown.relationship,
        policyStatus: shown.policyStatus,
        effectiveFrom: shown.effectivePeriod.includes(riyadhDateText(p?.policyEffective ?? '')),
        effectiveTo: shown.effectivePeriod.includes(riyadhDateText(p?.policyExpiry ?? '')),
      }, `Effective Period "${shown.effectivePeriod}"`).toEqual({
        policyNumber: p?.policyNumber,
        plan: p?.planNameEn,
        payer: p?.payerNameEn,
        pbmMemberId: anchor.member.memberCode,
        relationship: p?.relationshipNameEn,
        policyStatus: p?.policyStatusEn,
        effectiveFrom: true,
        effectiveTo: true,
      });
    });
  });

  test(`TC-${CASES.zeroIsNone.azureId}: should show a policy benefit term of zero as None`, async ({
    page,
    memberManagementPage,
    memberDetailPage,
    memberAccumulatorDashboardTab,
    steps,
  }) => {
    const data = CASES.zeroIsNone;
    const anchor = await dashboardMember(page, test.info());
    const policy = anchor.policies.find((p) => p.tag === data.tag);
    let view: DashboardPolicyView | null = null;

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(anchor.member.displayNameEn)).toBe(true);
    });

    await steps.critical(`Open the member record and select the Accumulator Dashboard tab - the tab loads showing the policy with a zero-value term (${policy?.policyNumber}, sublimit 0)`, async () => {
      await memberDetailPage.open(anchor.member.id);
      await memberAccumulatorDashboardTab.open();
      view = await showPolicy(memberAccumulatorDashboardTab, policy?.policyNumber ?? '');
      expect(view, `${policy?.policyNumber} among the COB Policy buttons`).not.toBeNull();
    });

    await steps.step('Review the Policy-Level Benefit section for the sublimit field - the sublimit displays "None" rather than "$0" or a blank value, while non-zero terms display their values', async () => {
      expect(view?.benefit).toEqual(data.expected);
    });
  });

  test(`TC-${CASES.ownTerms.azureId}: should show the policy's own deductible, coinsurance, out-of-pocket maximum and sublimit`, async ({
    page,
    memberManagementPage,
    memberDetailPage,
    memberAccumulatorDashboardTab,
    steps,
  }) => {
    const data = CASES.ownTerms;
    const anchor = await dashboardMember(page, test.info());
    const policy = anchor.policies.find((p) => p.tag === data.tag);
    let view: DashboardPolicyView | null = null;

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(anchor.member.displayNameEn)).toBe(true);
    });

    await steps.critical(`Open the member record and select the Accumulator Dashboard tab - the tab loads (${policy?.policyNumber}, every term non-zero)`, async () => {
      await memberDetailPage.open(anchor.member.id);
      await memberAccumulatorDashboardTab.open();
      view = await showPolicy(memberAccumulatorDashboardTab, policy?.policyNumber ?? '');
      expect(view, `${policy?.policyNumber} among the COB Policy buttons`).not.toBeNull();
    });

    await steps.step('Review the Policy-Level Benefit section - Deductible, Coinsurance, Out-of-Pocket Maximum, and Sublimit are all displayed with their configured non-zero values', async () => {
      expect(view?.benefit).toEqual(data.expected);
    });
  });

  test(`TC-${CASES.payerScope.azureId}: should list only approved policies of the user's payer`, async ({
    page,
    memberManagementPage,
    memberDetailPage,
    memberAccumulatorDashboardTab,
    requireBaseline,
    steps,
  }) => {
    const anchor = await dashboardMember(page, test.info());
    let draft: MemberEnrolment | null = null;
    let otherPayer = '';

    try {
      await steps.critical('Navigate to the Member Management module - the module loads (the member also holds a pending - draft - enrolment)', async () => {
        draft = await enrolSuiteMember(page, anchor.member.id, {
          approve: false,
          policy: { nameEn: `${SUITE_POLICY_PREFIX} ${CASES.payerScope.draftTag} ${policyStamp()}`, effectiveInMinutes: 24 * 60, expiryInDays: 60 },
        });
        await memberManagementPage.openTable();
        otherPayer = (await memberManagementPage.getPayerScopeOptions()).find((o) => !/all payers/i.test(o) && !o.includes(POLICY_SUITE_PAYER)) ?? '';
        requireBaseline(otherPayer !== '', `a payer other than "${POLICY_SUITE_PAYER}" in the breadcrumb payer select`);
        expect(await memberManagementPage.isListed(anchor.member.displayNameEn)).toBe(true);
      });

      await steps.critical(`Open the member record and select the Accumulator Dashboard tab (payer scope "${POLICY_SUITE_PAYER}", the user's payer) - the tab loads`, async () => {
        await memberManagementPage.openTable();
        const scoped = await memberManagementPage.selectPayerScope(POLICY_SUITE_PAYER);
        expect(scoped.header, 'the payer scope sent').not.toBeNull();
        await memberDetailPage.open(anchor.member.id);
        await memberAccumulatorDashboardTab.open();
        expect((await memberAccumulatorDashboardTab.readMemberCard()).memberId).toBe(anchor.member.memberCode);
      });

      await steps.step("Review the list of policies available for selection - only the approved policies under the user's payer are listed; the pending-enrolment policy and another payer's policies are not shown", async () => {
        const own = await shownOrder(memberAccumulatorDashboardTab);
        await memberManagementPage.openTable();
        await memberManagementPage.selectPayerScope(otherPayer);
        // Under another payer's scope the app may refuse the member view itself (GetMember 404 "Unable to load member.") - then none of its policies is shown.
        await memberDetailPage.openExpectingFailure(anchor.member.id);
        let underOther: string[] = [];
        if (await memberDetailPage.isLoaded()) {
          await memberAccumulatorDashboardTab.open();
          underOther = (await memberAccumulatorDashboardTab.getNoPolicyText()) !== '' ? [] : await shownOrder(memberAccumulatorDashboardTab);
        }
        const pending = (draft as MemberEnrolment | null)?.policy.policyNumber ?? '(draft)';
        expect({
          ownPayer: [...own].sort(),
          pendingShown: own.includes(pending),
          withOtherPayerSelected: underOther.filter((n) => n !== ''),
        }, `scope "${POLICY_SUITE_PAYER}" listed ${own.join(', ')}; scope "${otherPayer}" listed ${underOther.join(', ') || 'none'}`)
          .toEqual({ ownPayer: anchor.policies.map((p) => p.policyNumber).sort(), pendingShown: false, withOtherPayerSelected: [] });
      });
    } finally {
      if (draft) await discardEnrolment(page, draft).catch(() => 'left');
    }
  });

  test(`TC-${CASES.ordering.azureId}: should order the policies by in force today, then coverage order, then start date`, async ({
    page,
    memberManagementPage,
    memberDetailPage,
    memberAccumulatorDashboardTab,
    memberJobClock,
    steps,
  }) => {
    const data = CASES.ordering;
    const anchor = await dashboardMember(page, test.info());
    const [p1, p2, p3] = anchor.policies;
    let order: string[] = [];

    // Approved suite policies stay Future until the daily policy lifecycle job: the administrator moves it so Dash1 / Dash2 become
    // Active (in force) - Dash3 starts in two days and stays Future (2026-11-05: the case found both still Future).
    test.info().setTimeout(test.info().timeout + 12 * 60_000);
    try {
      for (const p of [p1, p2]) await ensurePolicyActive(page, p.policyId, memberJobClock);
    } catch (error) {
      blockedByPrecondition(test.info(), `${p1.policyNumber} and ${p2.policyNumber} Active (in force) after moving the policy lifecycle job`, error);
    }

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await restoreOrder(page, anchor);
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(anchor.member.displayNameEn)).toBe(true);
    });

    await steps.critical(`Open the member record and select the Accumulator Dashboard tab - the tab loads (${p1.policyNumber} primary and ${p2.policyNumber} secondary in force, ${p3.policyNumber} not in force today)`, async () => {
      const inForce = await waitUntilPoliciesInForce(page, anchor.member.id, [p1.policyId, p2.policyId], data.inForceWaitMs);
      const p3InForce = (await readMember(page, anchor.member.id)).benefitPolicies.find((b) => b.policyId === p3.policyId)?.isInForce ?? null;
      expect({ inForce, p3InForce }).toEqual({ inForce: { [p1.policyId]: true, [p2.policyId]: true }, p3InForce: false });
      await memberDetailPage.open(anchor.member.id);
      await memberAccumulatorDashboardTab.open();
      order = await shownOrder(memberAccumulatorDashboardTab);
      expect(order.length).toBeGreaterThanOrEqual(3);
    });

    await steps.step('Review the order of the COB Policy buttons - policies currently in force appear before any policy not in force today', async () => {
      const at = (n: string): number => order.indexOf(n);
      expect({ p1BeforeP3: at(p1.policyNumber) < at(p3.policyNumber), p2BeforeP3: at(p2.policyNumber) < at(p3.policyNumber) }, `buttons show ${order.join(', ')}`)
        .toEqual({ p1BeforeP3: true, p2BeforeP3: true });
    });

    await steps.step('Compare the two in-force policies - the policy with primary coverage order appears before the secondary one', async () => {
      expect(order.indexOf(p1.policyNumber), `buttons show ${order.join(', ')} (${p1.policyNumber} primary, ${p2.policyNumber} secondary and started later)`).toBeLessThan(order.indexOf(p2.policyNumber));
    });
  });

  test(`TC-${CASES.opensOnFirst.azureId}: should open the Accumulator Dashboard tab on COB Policy 1`, async ({
    page,
    memberManagementPage,
    memberDetailPage,
    memberAccumulatorDashboardTab,
    steps,
  }) => {
    const anchor = await dashboardMember(page, test.info());

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(anchor.member.displayNameEn)).toBe(true);
    });

    await steps.critical('Open the member record and select the Accumulator Dashboard tab - the tab opens', async () => {
      await memberDetailPage.open(anchor.member.id);
      await memberAccumulatorDashboardTab.open();
      expect((await memberAccumulatorDashboardTab.readCobButtons()).length).toBeGreaterThan(1);
    });

    await steps.step('Observe which policy is displayed without any manual selection - COB Policy 1 is selected and its details are shown by default', async () => {
      const first = (await memberAccumulatorDashboardTab.fetchPolicies(anchor.member.id))[0];
      expect({ selected: await memberAccumulatorDashboardTab.selectedCobPolicy(), shown: (await memberAccumulatorDashboardTab.readPolicy()).policy.policyNumber })
        .toEqual({ selected: 1, shown: first?.policyNumber });
    });
  });

  test(`TC-${CASES.afterReorder.azureId}: should reopen the dashboard on the new primary policy after the coverage order changes`, async ({
    page,
    memberManagementPage,
    memberDetailPage,
    memberAccumulatorDashboardTab,
    memberCobTab,
    steps,
  }) => {
    const anchor = await dashboardMember(page, test.info());
    let before = '';
    let after = '';

    try {
      await steps.critical('Navigate to the Member Management module - the module loads', async () => {
        await restoreOrder(page, anchor);
        await memberManagementPage.openTable();
        expect(await memberManagementPage.isListed(anchor.member.displayNameEn)).toBe(true);
      });

      await steps.step('Open the member record and select the Accumulator Dashboard tab - the tab loads showing Policy A (the primary) under COB Policy 1', async () => {
        await memberDetailPage.open(anchor.member.id);
        await memberAccumulatorDashboardTab.open();
        before = (await memberAccumulatorDashboardTab.readPolicy()).policy.policyNumber;
        expect(before).toBe(anchor.policies[0].policyNumber);
      });

      await steps.critical('Go to the Coverage Ordering tab and swap the coverage order so Policy B becomes primary - the change is saved and the coverage order is updated', async () => {
        await memberCobTab.open();
        const shown = await memberCobTab.readPolicyNumbers();
        const moved = await memberCobTab.drag(0, 1);
        expect(moved.status, `ReorderMemberCoverage answered ${moved.text.slice(0, 200)}`).toBe(200);
        after = shown[1] ?? '';
        await memberCobTab.expectOrder([after, shown[0], ...shown.slice(2)]);
      });

      await steps.step('Return to the Accumulator Dashboard tab - the tab reopens showing Policy B under COB Policy 1', async () => {
        await memberAccumulatorDashboardTab.open();
        expect({ selected: await memberAccumulatorDashboardTab.selectedCobPolicy(), shown: (await memberAccumulatorDashboardTab.readPolicy()).policy.policyNumber })
          .toEqual({ selected: 1, shown: after });
      });
    } finally {
      await restoreOrder(page, anchor).catch(() => undefined);
    }
  });

  test(`TC-${CASES.readOnly.azureId}: should offer no editing, enrolment or save control on the Accumulator Dashboard tab`, async ({
    page,
    memberManagementPage,
    memberDetailPage,
    memberAccumulatorDashboardTab,
    steps,
  }) => {
    const anchor = await dashboardMember(page, test.info());

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(anchor.member.displayNameEn)).toBe(true);
    });

    await steps.critical('Open the member record and select the Accumulator Dashboard tab - the tab loads', async () => {
      await memberDetailPage.open(anchor.member.id);
      await memberAccumulatorDashboardTab.open();
      expect((await memberAccumulatorDashboardTab.readMemberCard()).memberId).toBe(anchor.member.memberCode);
    });

    await steps.step('Attempt to find or use any edit, enrol, or save controls on the tab - no editable fields, enrolment, or save controls are present anywhere on the tab', async () => {
      const controls = await dashboardControls(page);
      expect({ editableFields: controls.editable, writeControls: controls.buttons.filter((b) => WRITE_CONTROL.test(b)) }, `buttons on the tab: ${controls.buttons.join(', ')}`)
        .toEqual({ editableFields: 0, writeControls: [] });
    });
  });

  test(`TC-${CASES.noPolicy.azureId}: should say clearly when the member has no active benefit policy`, async ({
    memberIn,
    memberManagementPage,
    memberDetailPage,
    memberAccumulatorDashboardTab,
    steps,
  }) => {
    const member = await memberIn('Active');

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(member.displayNameEn)).toBe(true);
    });

    await steps.critical('Open the member record and select the Accumulator Dashboard tab - the tab loads', async () => {
      await memberDetailPage.open(member.id);
      await memberAccumulatorDashboardTab.open();
      expect(await memberDetailPage.activeTab()).toBe('dashboard');
    });

    await steps.step('Review the tab content - the message "No active benefit policy found." is displayed and no policy detail sections appear', async () => {
      const view = await memberAccumulatorDashboardTab.readPolicy();
      expect({ message: await memberAccumulatorDashboardTab.getNoPolicyText(), policyNumber: view.policy.policyNumber, buttons: await memberAccumulatorDashboardTab.readCobButtons() })
        .toEqual({ message: CASES.noPolicy.text, policyNumber: '', buttons: [] });
    });
  });

  test(`TC-${CASES.viewFull.azureId}: should open the full Member Benefit Accumulator screen for the selected policy`, async ({
    page,
    memberManagementPage,
    memberDetailPage,
    memberAccumulatorDashboardTab,
    memberAccumulatorPage,
    steps,
  }) => {
    const anchor = await dashboardMember(page, test.info());
    let selected: MemberBenefitPolicy | undefined;

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(anchor.member.displayNameEn)).toBe(true);
    });

    await steps.critical('Open the member record and select the Accumulator Dashboard tab - the tab loads showing a "View full accumulator" option', async () => {
      await memberDetailPage.open(anchor.member.id);
      await memberAccumulatorDashboardTab.open();
      const shown = (await memberAccumulatorDashboardTab.readPolicy()).policy.policyNumber;
      selected = (await memberAccumulatorDashboardTab.fetchPolicies(anchor.member.id)).find((p) => p.policyNumber === shown);
      expect(await memberAccumulatorDashboardTab.isViewAccumulatorOffered()).toBe(true);
    });

    await steps.step('Select "View full accumulator" - the Member Benefit Accumulator screen opens for the currently selected policy', async () => {
      const url = await memberAccumulatorDashboardTab.viewFullAccumulator();
      await memberAccumulatorPage.waitForLoaded();
      expect({ policyMember: url.endsWith(`/${selected?.policyMemberId}`), member: (await memberAccumulatorPage.getText()).includes(anchor.member.memberCode) }, `reached ${url}`)
        .toEqual({ policyMember: true, member: true });
    });
  });

  test(`TC-${CASES.noAccumulatorRight.azureId}: should not open the full accumulator screen to a user without the accumulator permission`, async ({
    page,
    memberManagementPage,
    memberDetailPage,
    memberAccumulatorDashboardTab,
    memberRole,
    requireMemberListAccess,
    requireShapeApplied,
    requireBaseline,
    steps,
  }) => {
    const anchor = await dashboardMember(page, test.info());
    let session!: MemberSession;

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(anchor.member.displayNameEn)).toBe(true);
      await memberDetailPage.open(anchor.member.id);
      await memberAccumulatorDashboardTab.open();
      requireBaseline(await memberAccumulatorDashboardTab.isViewAccumulatorOffered(), '"View full accumulator" offered to a user holding MemberAccumulators.GetMemberAccumulator (the administrator)');
      session = await memberRole.signIn(CASES.noAccumulatorRight.shape);
      requireShapeApplied(session);
      await requireMemberListAccess(session);
    });

    await steps.critical('Open the member record and select the Accumulator Dashboard tab - the tab loads', async () => {
      // The member's policies belong to the suite payer: under another payer scope GetMember answers 404 (2026-11-05), so the session works in that scope.
      await session.members.openTable();
      const scopes = await session.members.getPayerScopeOptions();
      requireBaseline(scopes.some((o) => o.includes(POLICY_SUITE_PAYER)), `the Payer Admin's payer select offers "${POLICY_SUITE_PAYER}" (it offers ${scopes.join(', ') || 'nothing'})`);
      await session.members.selectPayerScope(POLICY_SUITE_PAYER);
      await session.detail.open(anchor.member.id);
      await session.accumulator.open();
      expect((await session.accumulator.readMemberCard()).memberId).toBe(anchor.member.memberCode);
    });

    await steps.step('Look for the "View full accumulator" option - the option is not displayed, or selecting it is blocked with an access-denied response', async () => {
      const offered = await session.accumulator.isViewAccumulatorOffered();
      const shown = (await session.accumulator.readPolicy()).policy.policyNumber;
      const policyMemberId = anchor.policies.find((p) => p.policyNumber === shown)?.policyMemberId ?? anchor.policies[0].policyMemberId;
      let denied = !offered;
      if (offered) {
        await session.accumulator.viewFullAccumulator().catch(() => '');
        denied = ACCESS_RESTRICTED.test(await session.detail.getScreenText());
      }
      const api = await asSession(session.page, 'POST', ApiEndpoints.memberAccumulator, { policyMemberId });
      expect({ hiddenOrDenied: denied, apiRefused: refused(api) }, `View full accumulator ${offered ? 'offered' : 'hidden'}; GetMemberAccumulator answered ${api.status} ${api.text.slice(0, 160)}`)
        .toEqual({ hiddenOrDenied: true, apiRefused: true });
    });
  });

  test(`TC-${CASES.rapidSwitch.azureId}: should always show each policy's own data when switching quickly between policies`, async ({
    page,
    memberManagementPage,
    memberDetailPage,
    memberAccumulatorDashboardTab,
    steps,
  }) => {
    const anchor = await dashboardMember(page, test.info());
    let order: MemberBenefitPolicy[] = [];

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(anchor.member.displayNameEn)).toBe(true);
    });

    await steps.critical('Open the member record and select the Accumulator Dashboard tab - the tab loads showing COB Policy 1', async () => {
      await memberDetailPage.open(anchor.member.id);
      await memberAccumulatorDashboardTab.open();
      order = await memberAccumulatorDashboardTab.fetchPolicies(anchor.member.id);
      expect({ buttons: (await memberAccumulatorDashboardTab.readCobButtons()).length >= 3, selected: await memberAccumulatorDashboardTab.selectedCobPolicy() }).toEqual({ buttons: true, selected: 1 });
    });

    await steps.step('Rapidly select COB Policy 2, then COB Policy 3, then back to COB Policy 1 - each selection updates the policy detail, benefit, and accumulator sections to match the policy clicked, with no leftover data', async () => {
      const wrong: string[] = [];
      for (const n of [2, 3, 1]) {
        await memberAccumulatorDashboardTab.selectCobPolicy(n);
        const view = await memberAccumulatorDashboardTab.readPolicy();
        const expected = order[n - 1];
        const matches = expected !== undefined && view.policy.policyNumber === expected.policyNumber
          && JSON.stringify(view.benefit) === JSON.stringify(termsOf(expected))
          // The period line belongs to the policy clicked (a policy with no accumulator period yet - not in force - is not compared).
          && (!expected.accumulators?.benefitPeriodStart || view.accumulator.period.includes(riyadhDateText(expected.accumulators.benefitPeriodStart)));
        if (!matches) wrong.push(`COB Policy ${n}: showed ${view.policy.policyNumber} ${JSON.stringify(view.benefit)} "${view.accumulator.period}", expected ${expected?.policyNumber} ${expected ? JSON.stringify(termsOf(expected)) : ''}`);
      }
      // A burst with no pause between the clicks: the screen must settle on COB Policy 1's own data.
      await memberAccumulatorDashboardTab.selectCobPolicy(3);
      await memberAccumulatorDashboardTab.selectCobPolicy(2);
      await memberAccumulatorDashboardTab.selectCobPolicy(1);
      const settled = await memberAccumulatorDashboardTab.readPolicy();
      if (settled.policy.policyNumber !== order[0]?.policyNumber || JSON.stringify(settled.benefit) !== JSON.stringify(order[0] ? termsOf(order[0]) : {})) {
        wrong.push(`after the burst: showed ${settled.policy.policyNumber} ${JSON.stringify(settled.benefit)}, expected ${order[0]?.policyNumber}`);
      }
      expect(wrong).toEqual([]);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
