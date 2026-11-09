import { test, expect } from '../../../fixtures';
import type { MemberManagementPage } from '../../../pages/member/MemberManagementPage';
import { MEMBER_COB } from '../../../constants/member/memberIds';
import { CASES, EMPTY_COB, GROWING, REORDERED } from '../../../data/member/viewMemberCobOrderingTab.data';
import { reorderCoverage, type ProvisionedMember } from '../../../utils/MemberProvisioning';
import {
  SharedEnrolment,
  currentEntries,
  currentPolicyNumbers,
  hasManualOrdering,
  readToasts,
  watchReorders,
} from '../../../utils/member/writerCHelpers';

/** "Navigate to the Member Management module": opens the list and answers whether it lists the case's member. */
async function openList(list: MemberManagementPage, member: Pick<ProvisionedMember, 'displayNameEn'>): Promise<boolean> {
  await list.openTable();
  return list.isListed(member.displayNameEn);
}

/**
 * User story 14384: the Coverage Ordering (COB) tab as a member's policies
 * grow - no policy (the case's own member), then ONE shared suite member that
 * starts with one approved policy (19896), gets a second (19897) and two more
 * unordered ones (19894). The shared member is discarded after the last case.
 * Each case establishes its own precondition (a failed case restarts the worker
 * and the next one may meet a freshly built member). See the data file.
 */
test.describe('US 14384 - Veiw Member - Coordination of Benefits Ordering Tab - no policy', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.noPolicies.azureId}: should show an empty coverage ordering list without an error when the member has no policy`, async ({
    page,
    memberIn,
    memberManagementPage,
    memberCobTab,
    steps,
  }) => {
    const member = await memberIn('Active');

    await steps.critical('Navigate to the Member Management module - the Member Management list view loads', async () => {
      expect(await openList(memberManagementPage, member), 'the member in the list').toBe(true);
    });

    await steps.critical('Open a member with no insurance policies and select the Coverage Ordering (COB) tab - the tab opens', async () => {
      await memberManagementPage.openDetails(member.displayNameEn);
      expect(await memberCobTab.isOffered(), 'the Coverage Ordering tab').toBe(true);
      const entries = await memberCobTab.open();
      expect(entries, 'the timeline GetMemberCobTimeline answered').toEqual([]);
    });

    await steps.step('Observe the tab content - it is empty, with no policy rows and no error message', async () => {
      expect((await memberCobTab.readRows()).length, 'policy rows').toBe(0);
      expect(await memberCobTab.getEmptyText(), 'the empty state').toMatch(EMPTY_COB);
      expect((await readToasts(page)).filter((t) => /error|fail|unable/i.test(t)), 'error messages').toEqual([]);
    });
  });
});

test.describe('US 14384 - Veiw Member - Coordination of Benefits Ordering Tab - growing policies', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  const shared = new SharedEnrolment({ label: 'COB - one policy, growing', policies: 1, policySpecs: [{ ...GROWING.first }] });
  test.beforeAll(async ({ browser }, testInfo) => shared.build(browser, testInfo));
  test.afterAll(async ({ browser }) => shared.discard(browser));

  test(`TC-${CASES.singlePolicyNoDrag.azureId}: should not offer dragging when the member has only one policy`, async ({
    page,
    memberManagementPage,
    memberCobTab,
    steps,
  }) => {
    const { member } = shared.require(test.info());
    const current = await currentEntries(page, member.id);
    if (current.length !== 1) steps.blocked(`the shared member holds ${current.length} policies in its ordering - "exactly one policy" cannot hold (this case runs first in its group - run the file whole)`);

    await steps.critical('Navigate to the Member Management module - the Member Management list view loads', async () => {
      expect(await openList(memberManagementPage, member), 'the member in the list').toBe(true);
    });

    await steps.critical('Open the member and select the Coverage Ordering (COB) tab - it shows the single policy', async () => {
      await memberManagementPage.openDetails(member.displayNameEn);
      await memberCobTab.open();
      expect(await memberCobTab.readPolicyNumbers()).toEqual([current[0].policyNumber]);
    });

    await steps.step('Attempt to drag the single policy row - dragging is not offered or enabled since there is nothing to reorder against', async () => {
      const handles = await memberCobTab.countHandles();
      const hint = await memberCobTab.getReorderHint();
      const reorders = watchReorders(page);
      if (handles > 0) {
        const box = await page.locator(`[id^="${MEMBER_COB.prefix}-entry-"][id$="-${MEMBER_COB.entry.dragHandle}"]`).first().boundingBox(); // locator-exception: the single row's handle (entry ids are the empty GUID).
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 120, { steps: 10 });
          await page.mouse.up();
          await page.waitForTimeout(1_500);
        }
      }
      expect({ handles, hint, reordersSent: reorders.stop().length }, 'the drag affordances with one policy').toEqual({ handles: 0, hint: '', reordersSent: 0 });
    });
  });

  test(`TC-${CASES.twoPoliciesDrag.azureId}: should offer dragging as soon as the member has two policies`, async ({
    page,
    memberManagementPage,
    memberCobTab,
    steps,
  }) => {
    const { member } = shared.require(test.info());
    if ((await currentEntries(page, member.id)).length === 1) {
      await shared.enrol(page, { ...GROWING.second }).catch((error: unknown) =>
        steps.blocked(`the second policy could not be enrolled: ${String(error instanceof Error ? error.message : error).slice(0, 240)}`));
    }
    const current = await currentEntries(page, member.id);
    if (current.length !== 2) steps.blocked(`the shared member holds ${current.length} policies - "exactly two policies" cannot hold`);
    const before = current.map((e) => e.policyNumber);

    await steps.critical('Navigate to the Member Management module - the Member Management list view loads', async () => {
      expect(await openList(memberManagementPage, member), 'the member in the list').toBe(true);
    });

    await steps.critical('Open the member and select the Coverage Ordering (COB) tab - it shows both policies', async () => {
      await memberManagementPage.openDetails(member.displayNameEn);
      await memberCobTab.open();
      expect(await memberCobTab.readPolicyNumbers()).toEqual(before);
    });

    await steps.step('Attempt to drag one policy row to reorder - the drag interaction is available and allows repositioning', async () => {
      expect({ handles: await memberCobTab.countHandles(), hint: (await memberCobTab.getReorderHint()) !== '' }, 'the drag affordances with two policies').toEqual({ handles: 2, hint: true });
      const moved = await memberCobTab.drag(1, 0);
      expect(moved.status, `ReorderMemberCoverage answered ${moved.text.slice(0, 200)}`).toBe(200);
      expect(moved.messages.join(' | ')).toMatch(REORDERED);
      await memberCobTab.expectOrder([before[1], before[0]]);
      expect(await currentPolicyNumbers(page, member.id), 'the saved order').toEqual([before[1], before[0]]);
    });
  });

  test(`TC-${CASES.newPolicyJoinsEnd.azureId}: should add newly enrolled policies at the end, earliest-starting first, until they are reordered`, async ({
    page,
    memberManagementPage,
    memberDetailPage,
    memberCobTab,
    steps,
  }) => {
    test.setTimeout(12 * 60_000);
    const { member } = shared.require(test.info());
    try {
      if ((await currentEntries(page, member.id)).length < 2) await shared.enrol(page, { ...GROWING.second });
      const current = await currentEntries(page, member.id);
      if (!hasManualOrdering(current)) {
        const applied = await reorderCoverage(page, member.id, current.map((e) => e.policyId));
        if (applied.status >= 300) throw new Error(`ReorderMemberCoverage answered ${applied.status} ${applied.text.slice(0, 200)}`);
      }
    } catch (error) {
      steps.blocked(`the precondition "an existing ordered list of policies" could not be built: ${String(error instanceof Error ? error.message : error).slice(0, 240)}`);
    }
    const existing = await currentPolicyNumbers(page, member.id);
    const added: { policyNumber: string; effectiveDate: string }[] = [];

    await steps.critical('Navigate to the Member Management module - the Member Management list view loads', async () => {
      expect(await openList(memberManagementPage, member), 'the member in the list').toBe(true);
    });

    await steps.critical('Open the member and select the Coverage Ordering (COB) tab before the new enrolment - it shows the existing order with Primary / Secondary', async () => {
      await memberManagementPage.openDetails(member.displayNameEn);
      await memberCobTab.open();
      expect(await memberCobTab.readPolicyNumbers()).toEqual(existing);
      expect((await memberCobTab.readRows()).slice(0, 2).map((r) => r.order)).toEqual(['Primary', 'Secondary']);
    });

    await steps.critical('Enroll new policies for the member and return to the Coverage Ordering tab without reordering - the new policies appear at the end of the list', async () => {
      for (const spec of GROWING.newer) {
        const enrolment = await shared.enrol(page, { ...spec });
        added.push({ policyNumber: enrolment.policy.policyNumber, effectiveDate: enrolment.policy.effectiveDate });
      }
      await memberDetailPage.open(member.id);
      await memberCobTab.open();
      const shown = await memberCobTab.readPolicyNumbers();
      expect({ head: shown.slice(0, existing.length), tail: [...shown.slice(existing.length)].sort() }, 'the order after the enrolments')
        .toEqual({ head: existing, tail: added.map((a) => a.policyNumber).sort() });
    });

    await steps.step('Compare the positions of the unordered new policies - they are sequenced earliest Effective Start Date first', async () => {
      const shown = await memberCobTab.readPolicyNumbers();
      const earliestFirst = [...added].sort((a, b) => Date.parse(a.effectiveDate) - Date.parse(b.effectiveDate)).map((a) => a.policyNumber);
      expect(shown.slice(existing.length), `the new policies (${added.map((a) => `${a.policyNumber} from ${a.effectiveDate}`).join('; ')})`).toEqual(earliestFirst);
    });
  });
});
