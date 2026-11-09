import { test, expect, type MemberSession } from '../../../utils/member/memberRole';
import type { Page } from '@playwright/test';
import type { MemberManagementPage } from '../../../pages/member/MemberManagementPage';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { CASES, HISTORY, ORDER_BADGES, REORDERED, THREE_POLICIES } from '../../../data/member/viewMemberCobOrderingTab.data';
import { readMember, reorderCoverage, riyadhDay, type ProvisionedMember } from '../../../utils/MemberProvisioning';
import { readPolicy } from '../../../utils/PolicyProvisioning';
import {
  SharedEnrolment,
  asSession,
  currentEntries,
  currentPolicyNumbers,
  dropOutsideList,
  editableControls,
  hasManualOrdering,
  rapidDrags,
  refused,
  reloadMidDrag,
  requireMemberShown,
  riyadhDateTime,
  watchReorders,
  watchRequest,
} from '../../../utils/member/writerCHelpers';

/** "Navigate to the Member Management module": opens the list and answers whether it lists the case's member. */
async function openList(list: MemberManagementPage, member: ProvisionedMember): Promise<boolean> {
  await list.openTable();
  return list.isListed(member.displayNameEn);
}

/** The badges shown, top first. */
async function badgesOf(rows: { order: string }[]): Promise<string[]> {
  return rows.map((r) => r.order);
}

/** Whether the order shown is complete: every enrolled policy exactly once, badges Primary / Secondary / Tertiary... */
function integrity(shown: string[], badges: string[], policyNumbers: string[]): true | string {
  const complete = shown.length === policyNumbers.length && new Set(shown).size === shown.length && policyNumbers.every((p) => shown.includes(p));
  const ranked = badges.every((b, i) => b === ORDER_BADGES[i]);
  return complete && ranked ? true : `shown ${shown.join(', ')} with ${badges.join(', ')} (policies ${policyNumbers.join(', ')})`;
}

/** Reloads the view and re-opens the COB tab (the page lands on Member Information). */
async function reopenCob(page: Page, memberId: string, open: () => Promise<unknown>, detailOpen: (id: string) => Promise<void>): Promise<void> {
  await detailOpen(memberId);
  await open();
  await page.waitForTimeout(300);
}

/**
 * User story 14384: the Coverage Ordering (COB) tab - ONE suite member enrolled
 * in THREE approved suite policies (created out of their start order) is shared
 * by these cases and discarded after the last. 19891 runs first (nothing
 * reordered yet); 19899 (a known finding) runs last. Each case establishes its
 * own precondition, because a failed case restarts the worker and the next one
 * may meet a freshly built member. The no-policy / one-policy / growing cases
 * live in cob-ordering-growth.spec.ts. See the data file for the readings.
 */
test.describe('US 14384 - Veiw Member - Coordination of Benefits Ordering Tab', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  const shared = new SharedEnrolment({ label: 'COB - three policies', policies: 3, policySpecs: THREE_POLICIES.map((p) => ({ ...p })) });
  test.beforeAll(async ({ browser }, testInfo) => shared.build(browser, testInfo));
  test.afterAll(async ({ browser }) => shared.discard(browser));

  test(`TC-${CASES.oldestFirst.azureId}: should list the member's policies oldest to newest before any manual reordering`, async ({
    page,
    memberManagementPage,
    memberCobTab,
    steps,
  }) => {
    const { member, enrolments } = shared.require(test.info());
    if (hasManualOrdering(await currentEntries(page, member.id))) {
      steps.blocked('the shared member\'s policies have already been reordered (this case runs first in its file - run the file whole), so "no prior manual ordering" cannot hold');
    }
    const startOrder = [...enrolments].sort((a, b) => Date.parse(a.policy.effectiveDate) - Date.parse(b.policy.effectiveDate)).map((e) => e.policy.policyNumber);

    await steps.critical('Navigate to the Member Management module - the Member Management list view loads', async () => {
      expect(await openList(memberManagementPage, member), 'the member in the list').toBe(true);
    });

    await steps.critical('Open the member and select the Coverage Ordering (COB) tab - the tab opens', async () => {
      await memberManagementPage.openDetails(member.displayNameEn);
      const entries = await memberCobTab.open();
      expect(entries.filter((e) => e.isCurrent).length, 'policies in the current ordering').toBe(enrolments.length);
    });

    await steps.step('Review the order in which policies are listed - with no manual ordering they are displayed oldest to newest', async () => {
      const shown = await memberCobTab.readPolicyNumbers();
      const starts = enrolments.map((e) => `${e.policy.policyNumber} from ${e.policy.effectiveDate}`).join('; ');
      expect(shown, `the order shown (policies: ${starts})`).toEqual(startOrder);
    });
  });

  test(`TC-${CASES.datesReadOnly.azureId}: should show each policy's coverage dates read-only on the coverage ordering tab`, async ({
    page,
    memberManagementPage,
    memberCobTab,
    steps,
  }) => {
    const { member, enrolments } = shared.require(test.info());
    // One at a time: on a blank page each read first navigates to the app, and parallel navigations abort each other (2026-11-05: net::ERR_ABORTED).
    const stored: { id: string; effectiveDate: string; expiryDate: string }[] = [];
    for (const e of enrolments) {
      const p = await readPolicy(page, e.policy.id);
      stored.push({ id: e.policy.id, effectiveDate: p.effectiveDate, expiryDate: p.expiryDate });
    }

    await steps.critical('Navigate to the Member Management module - the Member Management list view loads', async () => {
      expect(await openList(memberManagementPage, member), 'the member in the list').toBe(true);
    });

    await steps.critical('Open the member and select the Coverage Ordering (COB) tab - each policy\'s Effective Start Date and Effective End Date are shown', async () => {
      await memberManagementPage.openDetails(member.displayNameEn);
      await memberCobTab.open();
      const entries = await currentEntries(page, member.id);
      const rows = await memberCobTab.readRows();
      expect(entries.map((e, i) => ({ policy: e.policyNumber, start: (rows[i]?.text ?? '').includes(riyadhDateTime(e.policyEffectiveDate)), end: (rows[i]?.text ?? '').includes(riyadhDateTime(e.policyExpiryDate)) })), 'the dates on each row')
        .toEqual(entries.map((e) => ({ policy: e.policyNumber, start: true, end: true })));
    });

    await steps.step('Attempt to click into or edit the Effective Start Date or Effective End Date - the dates remain read-only and cannot be changed here', async () => {
      const entries = await currentEntries(page, member.id);
      const write = watchRequest(page, /\/(UpdatePolicy|ReorderMemberCoverage|UpdateMember)/, 5_000);
      const start = page.getByText(riyadhDateTime(entries[0].policyEffectiveDate)).first();
      await start.click();
      await start.dblclick();
      await page.keyboard.type('01/01/2030');
      await page.keyboard.press('Enter');
      expect(await editableControls(page), 'editable controls on the tab').toEqual([]);
      expect(await write, 'a write sent by clicking / typing on the dates').toBeNull();
      const after = await Promise.all(stored.map(async (s) => {
        const p = await readPolicy(page, s.id);
        return { id: s.id, effectiveDate: p.effectiveDate, expiryDate: p.expiryDate };
      }));
      expect(after, 'the policies\' stored dates').toEqual(stored);
    });
  });

  test(`TC-${CASES.reorderPrimary.azureId}: should make the policy dragged to the top Primary and the previous first Secondary`, async ({
    page,
    memberManagementPage,
    memberCobTab,
    steps,
  }) => {
    const { member } = shared.require(test.info());
    let before: string[] = [];
    let moved!: Awaited<ReturnType<typeof memberCobTab.drag>>;

    await steps.critical('Navigate to the Member Management module - the Member Management list view loads', async () => {
      expect(await openList(memberManagementPage, member), 'the member in the list').toBe(true);
    });

    await steps.critical('Open the member and select the Coverage Ordering (COB) tab - it shows the current order and statuses', async () => {
      await memberManagementPage.openDetails(member.displayNameEn);
      await memberCobTab.open();
      const rows = await memberCobTab.readRows();
      before = await memberCobTab.readPolicyNumbers();
      expect(before.length, 'policies listed').toBeGreaterThanOrEqual(2);
      expect((await badgesOf(rows))[0], 'the first row\'s status').toBe('Primary');
    });

    await steps.critical('Drag the second-listed policy to the first position and drop it - the list reflects the new order', async () => {
      moved = await memberCobTab.drag(1, 0);
      await memberCobTab.expectOrder([before[1], before[0], ...before.slice(2)]);
    });

    await steps.step('Confirm the reorder - the moved policy becomes Primary and the previously first policy Secondary', async () => {
      expect(moved.status, `ReorderMemberCoverage answered ${moved.text.slice(0, 200)}`).toBe(200);
      expect(moved.messages.join(' | '), 'the confirmation shown').toMatch(REORDERED);
      const rows = await memberCobTab.readRows();
      const shown = await memberCobTab.readPolicyNumbers();
      expect({ primary: `${rows[0]?.order} ${shown[0]}`, secondary: `${rows[1]?.order} ${shown[1]}` }).toEqual({ primary: `Primary ${before[1]}`, secondary: `Secondary ${before[0]}` });
      expect(await currentPolicyNumbers(page, member.id), 'the saved order').toEqual([before[1], before[0], ...before.slice(2)]);
    });
  });

  test(`TC-${CASES.noSharedPosition.azureId}: should never let two policies share a place in the coverage order`, async ({
    page,
    memberManagementPage,
    memberDetailPage,
    memberCobTab,
    steps,
  }) => {
    const { member, enrolments } = shared.require(test.info());
    const numbers = enrolments.map((e) => e.policy.policyNumber);

    await steps.critical('Navigate to the Member Management module - the Member Management list view loads', async () => {
      expect(await openList(memberManagementPage, member), 'the member in the list').toBe(true);
    });

    await steps.critical('Open the member and select the Coverage Ordering (COB) tab - the tab opens', async () => {
      await memberManagementPage.openDetails(member.displayNameEn);
      await memberCobTab.open();
      expect((await memberCobTab.readRows()).length, 'policies listed').toBe(enrolments.length);
    });

    await steps.step('Attempt rapid drags and a simultaneous duplicate placement so two policies get the same position - the system prevents or corrects it', async () => {
      await rapidDrags(page, [[0, 1], [1, 0], [0, 1]]);
      const ids = (await currentEntries(page, member.id)).map((e) => e.policyId);
      const duplicate = await reorderCoverage(page, member.id, [ids[0], ids[0], ...ids.slice(1, -1)]);
      const entries = await currentEntries(page, member.id);
      await reopenCob(page, member.id, () => memberCobTab.open(), (id) => memberDetailPage.open(id));
      const shown = await memberCobTab.readPolicyNumbers();
      const badges = await badgesOf(await memberCobTab.readRows());
      expect(duplicate.status, `a duplicate placement answered ${duplicate.status} ${duplicate.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
      expect({
        places: entries.map((e) => e.coverageOrder),
        uniquePolicies: new Set(entries.map((e) => e.policyId)).size,
        shownIsSaved: shown.join(', ') === entries.map((e) => e.policyNumber).join(', ') ? true : shown.join(', '),
        integrity: integrity(shown, badges, numbers),
      }, 'the order after the attempts').toEqual({
        places: entries.map((_, i) => i + 1),
        uniquePolicies: enrolments.length,
        shownIsSaved: true,
        integrity: true,
      });
    });
  });

  test(`TC-${CASES.effectiveTodayHistory.azureId}: should apply a new coverage order at once from today and keep the earlier order unchanged in History`, async ({
    page,
    memberManagementPage,
    memberCobTab,
    steps,
  }) => {
    const { member } = shared.require(test.info());
    let current = await currentEntries(page, member.id);
    if (!hasManualOrdering(current)) {
      const applied = await reorderCoverage(page, member.id, current.map((e) => e.policyId));
      if (applied.status >= 300) steps.blocked(`the precondition ordering could not be applied: ${applied.status} ${applied.text.slice(0, 200)}`);
      current = await currentEntries(page, member.id);
    }
    const previous = current.map((e) => ({ policyId: e.policyId, policyNumber: e.policyNumber, coverageOrder: e.coverageOrder, effectiveFrom: e.effectiveFrom }));
    let expected: string[] = [];

    await steps.critical('Navigate to the Member Management module - the Member Management list view loads', async () => {
      expect(await openList(memberManagementPage, member), 'the member in the list').toBe(true);
    });

    await steps.critical('Open the member and select the Coverage Ordering (COB) tab - it shows the current order', async () => {
      await memberManagementPage.openDetails(member.displayNameEn);
      await memberCobTab.open();
      expect(await memberCobTab.readPolicyNumbers()).toEqual(previous.map((p) => p.policyNumber));
    });

    await steps.critical('Reorder the policies and confirm the change - the new order applies immediately, effective from today, with no approval step', async () => {
      const last = previous.length - 1;
      expected = [previous[last].policyNumber, ...previous.slice(0, last).map((p) => p.policyNumber)];
      const moved = await memberCobTab.drag(last, 0);
      expect(moved.status, `ReorderMemberCoverage answered ${moved.text.slice(0, 200)}`).toBe(200);
      const now = await currentEntries(page, member.id);
      expect({ order: now.map((e) => e.policyNumber), effectiveFrom: [...new Set(now.map((e) => e.effectiveFrom.slice(0, 10)))] }, 'the saved current ordering')
        .toEqual({ order: expected, effectiveFrom: [riyadhDay(0)] });
      await memberCobTab.expectOrder(expected);
    });

    await steps.step('Navigate to the ordering History view - the previous ordering remains recorded unchanged with its original effective dates', async () => {
      const history = (await memberCobTab.fetchTimeline(member.id)).filter((e) => !e.isCurrent);
      const kept = previous.map((p) => ({
        policy: p.policyNumber,
        inHistoryUnchanged: history.some((h) => h.policyId === p.policyId && h.coverageOrder === p.coverageOrder && h.effectiveFrom.slice(0, 10) === p.effectiveFrom.slice(0, 10)),
      }));
      expect(await memberCobTab.getText(), 'the tab\'s History section').toMatch(HISTORY);
      expect(kept, `History entries: ${JSON.stringify(history.map((h) => [h.policyNumber, h.coverageOrder, h.effectiveFrom, h.effectiveTo]))}`).toEqual(previous.map((p) => ({ policy: p.policyNumber, inHistoryUnchanged: true })));
    });
  });

  test(`TC-${CASES.dashboardFollowsPrimary.azureId}: should open the PBM Accumulator Dashboard on the new Primary policy after a reorder`, async ({
    page,
    memberManagementPage,
    memberCobTab,
    memberAccumulatorDashboardTab,
    steps,
  }) => {
    const { member } = shared.require(test.info());
    let before: string[] = [];

    await steps.critical('Navigate to the Member Management module - the Member Management list view loads', async () => {
      expect(await openList(memberManagementPage, member), 'the member in the list').toBe(true);
    });

    await steps.step('Open the member and note which policy the PBM Accumulator Dashboard tab opens on - the current Primary policy', async () => {
      await memberManagementPage.openDetails(member.displayNameEn);
      await memberAccumulatorDashboardTab.open();
      before = await currentPolicyNumbers(page, member.id);
      expect((await memberAccumulatorDashboardTab.readPolicy()).policy.policyNumber, `the dashboard's default policy (Primary ${before[0]})`).toBe(before[0]);
    });

    await steps.critical('Return to the Coverage Ordering (COB) tab and reorder so a different policy becomes Primary - the previously Secondary policy is now Primary', async () => {
      await memberCobTab.open();
      const moved = await memberCobTab.drag(1, 0);
      expect(moved.status, `ReorderMemberCoverage answered ${moved.text.slice(0, 200)}`).toBe(200);
      expect((await currentPolicyNumbers(page, member.id))[0], 'the saved Primary').toBe(before[1]);
    });

    await steps.step('Open the PBM Accumulator Dashboard tab again - it now opens by default on the newly Primary policy', async () => {
      await memberAccumulatorDashboardTab.open();
      await expect.poll(async () => (await memberAccumulatorDashboardTab.readPolicy()).policy.policyNumber, { message: `the dashboard's default policy (new Primary ${before[1]})` }).toBe(before[1]);
    });
  });

  test(`TC-${CASES.exploratory.azureId}: should keep the saved coverage order and complete rows under unusual drag and refresh actions`, async ({
    page,
    memberManagementPage,
    memberDetailPage,
    memberCobTab,
    steps,
  }) => {
    const { member, enrolments } = shared.require(test.info());
    const numbers = enrolments.map((e) => e.policy.policyNumber);

    await steps.critical('Navigate to the Member Management module - the Member Management list view loads', async () => {
      expect(await openList(memberManagementPage, member), 'the member in the list').toBe(true);
    });

    await steps.critical('Open a member with multiple policies and select the Coverage Ordering (COB) tab - the tab opens', async () => {
      await memberManagementPage.openDetails(member.displayNameEn);
      await memberCobTab.open();
      expect((await memberCobTab.readRows()).length, 'policies listed').toBe(enrolments.length);
    });

    await steps.step('Drop a policy outside the list, reorder rapidly several times, refresh mid-drag and re-open - the tab recovers each time, keeps the last confirmed order and the policy data and statuses intact', async () => {
      const check = async (action: string): Promise<{ action: string; showsSavedOrder: true | string; integrity: true | string }> => {
        const saved = await currentPolicyNumbers(page, member.id);
        const shown = await memberCobTab.readPolicyNumbers();
        const badges = await badgesOf(await memberCobTab.readRows());
        return { action, showsSavedOrder: shown.join(', ') === saved.join(', ') ? true : `shown ${shown.join(', ')} / saved ${saved.join(', ')}`, integrity: integrity(shown, badges, numbers) };
      };
      const report: Awaited<ReturnType<typeof check>>[] = [];
      const reorders = watchReorders(page);

      await dropOutsideList(page, 0);
      report.push(await check('dropped outside the list'));

      await rapidDrags(page, [[0, 1], [2, 0], [1, 2]]);
      report.push(await check('three rapid reorders (as left on screen)'));
      await reopenCob(page, member.id, () => memberCobTab.open(), (id) => memberDetailPage.open(id));
      report.push(await check('three rapid reorders (after re-opening)'));

      await reloadMidDrag(page, 1);
      await memberDetailPage.waitForLoaded();
      await memberCobTab.open();
      report.push(await check('refreshed mid-drag'));

      await reopenCob(page, member.id, () => memberCobTab.open(), (id) => memberDetailPage.open(id));
      report.push(await check('re-opened'));

      const sent = reorders.stop();
      const failed: string[] = [];
      for (const r of sent) {
        const res = await r.response().catch(() => null);
        if (res && res.status() >= 500) failed.push(`${res.status()} ${r.postData() ?? ''}`);
      }
      expect(failed, 'reorders the server failed on').toEqual([]);
      expect(report, 'the tab after each unusual action').toEqual(report.map((r) => ({ action: r.action, showsSavedOrder: true, integrity: true })));
    });
  });

  test(`TC-${CASES.restrictedReorder.azureId}: should let a user without the reorder permission view but not change the coverage order`, async ({
    page,
    memberDetailPage,
    memberCobTab,
    memberRole,
    requireMemberListAccess,
    requireShapeApplied,
    requireBaseline,
    steps,
  }) => {
    const { member, enrolments } = shared.require(test.info());
    let session!: MemberSession;
    let before: string[] = [];

    await steps.critical('Navigate to the Member Management module - the Member Management list view loads', async () => {
      await memberDetailPage.open(member.id);
      await memberCobTab.open();
      requireBaseline((await memberCobTab.countHandles()) >= 2, 'dragging on the Coverage Ordering tab of a member with several policies');
      before = await currentPolicyNumbers(page, member.id);
      session = await memberRole.signIn(CASES.restrictedReorder.shape);
      await requireMemberListAccess(session);
      requireShapeApplied(session);
      await requireMemberShown(session, member, test.info());
      await session.members.openTable();
      expect(await session.members.isListed(member.displayNameEn), 'the member in the restricted user\'s list').toBe(true);
    });

    await steps.critical('Log in as a user without the Member Administrator role and open the member\'s Coverage Ordering (COB) tab - the policy list is shown read-only', async () => {
      await session.detail.open(member.id);
      expect(await session.cob.isOffered(), 'the Coverage Ordering tab for the restricted user').toBe(true);
      await session.cob.open();
      expect(await session.cob.readPolicyNumbers(), 'the policies listed').toEqual(before);
      expect({ hint: await session.cob.getReorderHint(), handles: await session.cob.countHandles() }, 'the reorder affordances').toEqual({ hint: '', handles: 0 });
    });

    await steps.step('Attempt to drag or otherwise reorder a policy - the reorder is unavailable or rejected', async () => {
      let said = 'no drag handle offered';
      if ((await session.cob.countHandles()) >= 2) {
        const moved = await session.cob.drag(1, 0);
        said = moved.request ? `the drop sent a reorder answered ${moved.status} ${moved.text.slice(0, 160)}` : 'the drop sent nothing';
        if (moved.request) expect(refused({ status: moved.status, text: moved.text }), said).toBe(true);
      }
      const direct = await asSession(session.page, 'PUT', ApiEndpoints.cobReorder, { memberId: member.id, policyIds: [...enrolments].reverse().map((e) => e.policy.id) });
      expect(refused(direct), `${said}; the direct ReorderMemberCoverage answered ${direct.status} ${direct.text.slice(0, 160)}`).toBe(true);
      expect(await currentPolicyNumbers(page, member.id), 'the saved order').toEqual(before);
    });
  });

  test(`TC-${CASES.rowDetails.azureId}: should show Policy Name, Number, Effective Start and End Date and Status on every policy row`, async ({
    page,
    memberManagementPage,
    memberCobTab,
    steps,
  }) => {
    const { member } = shared.require(test.info());

    await steps.critical('Navigate to the Member Management module - the Member Management list view loads', async () => {
      expect(await openList(memberManagementPage, member), 'the member in the list').toBe(true);
    });

    await steps.critical('Open a member with multiple policies and select the Coverage Ordering (COB) tab - the tab opens', async () => {
      await memberManagementPage.openDetails(member.displayNameEn);
      await memberCobTab.open();
      expect((await memberCobTab.readRows()).length, 'policies listed').toBeGreaterThanOrEqual(2);
    });

    await steps.step('Verify each policy row displays Policy Name, Policy Number, Effective Start Date, Effective End Date and Status - every policy shows all five accurately', async () => {
      const entries = await currentEntries(page, member.id);
      const statuses = (await readMember(page, member.id)).benefitPolicies;
      const rows = await memberCobTab.readRows();
      const report = entries.map((entry, i) => {
        const text = rows[i]?.text ?? '';
        const status = statuses.find((p) => p.policyId === entry.policyId)?.policyStatusEn ?? '(status unknown)';
        return {
          policy: entry.policyNumber,
          policyName: text.includes(entry.policyNameEn),
          policyNumber: text.includes(entry.policyNumber),
          effectiveStartDate: text.includes(riyadhDateTime(entry.policyEffectiveDate)),
          effectiveEndDate: text.includes(riyadhDateTime(entry.policyExpiryDate)),
          status: new RegExp(`\\b${status}\\b`, 'i').test(text) ? true : `no "${status}" in "${text}"`,
        };
      });
      expect(report, 'each row against its policy').toEqual(entries.map((e) => ({ policy: e.policyNumber, policyName: true, policyNumber: true, effectiveStartDate: true, effectiveEndDate: true, status: true })));
    });
  });
});
