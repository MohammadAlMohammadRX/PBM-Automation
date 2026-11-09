import { test, expect } from '../../../fixtures';
import type { ConfirmDialog } from '../../../pages/components/ConfirmDialog';
import type { MemberManagementPage } from '../../../pages/member/MemberManagementPage';
import type { MemberDeactivateDrawer } from '../../../pages/member/MemberDeactivateDrawer';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { ACTIVATED, ACTIVATE_PROMPT, CASES, DEACTIVATED, DEACTIVATE_TITLE, STATUS_BOOKKEEPING } from '../../../data/member/activateDeactivateMember.data';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { deleteMember, readMember, readMemberForEdit } from '../../../utils/MemberProvisioning';
import { addPolicyMember, memberCandidates, policyStatusCode, readPolicyMembers, submitPolicy } from '../../../utils/PolicyProvisioning';

/** "Navigate to the Member Management module": opens the list and answers whether it lists the case's member. */
async function openList(list: MemberManagementPage, name: string): Promise<boolean> {
  await list.openTable();
  return list.isListed(name);
}

/** A member's stored data without the status bookkeeping (19912). */
function dataOf(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !STATUS_BOOKKEEPING.test(key)));
}

/**
 * User story 14386: Activate / Deactivate Member. The administrator plays the
 * Member Administrator; every member and policy is the case's own (19918's
 * member is enrolled in its own suite policies - it is left deactivated with
 * the approved policy retired). The restricted user lives in
 * activate-deactivate-access.spec.ts. See the data file for the readings.
 */
test.describe('US 14386 - Activate/Deactivate Member', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.activateInactive.azureId}: should activate an inactive member and show it Active with a success message`, async ({
    page,
    memberIn,
    memberManagementPage,
    memberDetailPage,
    steps,
  }) => {
    const member = await memberIn('Inactive');
    let dialog!: ConfirmDialog;

    await steps.critical('Navigate to the Member Management module - the module loads and displays the member list', async () => {
      expect(await openList(memberManagementPage, member.displayNameEn), 'the member in the list').toBe(true);
    });

    await steps.critical('Search for and open the inactive member - the detail page is displayed with an Activate action available', async () => {
      await memberManagementPage.openDetails(member.displayNameEn);
      expect(await memberDetailPage.getStatus()).toBe('Inactive');
      expect(await memberDetailPage.getActionAvailability('toggleActive'), 'the Activate control').toBe('available');
    });

    await steps.critical('Select the Activate action - a confirmation is presented', async () => {
      dialog = await memberDetailPage.requestActivate();
      expect(`${await dialog.getTitle()} ${await dialog.getMessage()}`).toMatch(ACTIVATE_PROMPT);
    });

    await steps.step('Confirm the activation - the status changes to Active and a success message is displayed', async () => {
      const answer = await NetworkUtils.captureResponse(page, ApiEndpoints.memberSetActive, () => dialog.confirm());
      const messages = await memberDetailPage.waitForMessages();
      expect(answer?.status ?? -1, `SetMemberActive answered ${answer?.text.slice(0, 200) ?? 'nothing'}`).toBe(200);
      expect(messages.join(' | '), 'the success message').toMatch(ACTIVATED);
      await memberDetailPage.expectStatus('Active');
      expect((await readMember(page, member.id)).isActive, 'the stored status').toBe(true);
    });
  });

  test(`TC-${CASES.deactivateActive.azureId}: should deactivate an active member and show it Inactive with a success message`, async ({
    page,
    memberIn,
    memberManagementPage,
    memberDetailPage,
    steps,
  }) => {
    const member = await memberIn('Active');
    let drawer!: MemberDeactivateDrawer;

    await steps.critical('Navigate to the Member Management module - the module loads and displays the member list', async () => {
      expect(await openList(memberManagementPage, member.displayNameEn), 'the member in the list').toBe(true);
    });

    await steps.critical('Search for and open the active member - the detail page is displayed with a Deactivate action available', async () => {
      await memberManagementPage.openDetails(member.displayNameEn);
      expect(await memberDetailPage.getStatus()).toBe('Active');
      expect(await memberDetailPage.getActionAvailability('toggleActive'), 'the Deactivate control').toBe('available');
    });

    await steps.critical('Select the Deactivate action - a confirmation is presented', async () => {
      drawer = await memberDetailPage.openDeactivate();
      expect(await drawer.getTitleText()).toMatch(DEACTIVATE_TITLE);
    });

    await steps.step('Confirm the deactivation - the status changes to Inactive and a success message is displayed', async () => {
      const answer = await drawer.deactivate();
      expect(answer.status, `SetMemberActive answered ${answer.text.slice(0, 200)}`).toBe(200);
      expect(answer.messages.join(' | '), 'the success message').toMatch(DEACTIVATED);
      await memberDetailPage.expectStatus('Inactive');
      expect((await readMember(page, member.id)).isActive, 'the stored status').toBe(false);
    });
  });

  test(`TC-${CASES.cycle.azureId}: should move a member through deactivate, activate and deactivate again without losing any data`, async ({
    page,
    memberIn,
    memberManagementPage,
    memberDetailPage,
    steps,
  }) => {
    const member = await memberIn('Complete');
    const before = dataOf(await readMemberForEdit(page, member.id) as unknown as Record<string, unknown>);

    await steps.critical('Navigate to the Member Management module - the module loads and displays the member list', async () => {
      expect(await openList(memberManagementPage, member.displayNameEn), 'the member in the list').toBe(true);
    });

    await steps.critical('Open the active member, select Deactivate and confirm - the status changes from Active to Inactive on the detail page', async () => {
      await memberManagementPage.openDetails(member.displayNameEn);
      expect(await memberDetailPage.getStatus()).toBe('Active');
      const answer = await (await memberDetailPage.openDeactivate()).deactivate();
      expect(answer.status, `SetMemberActive answered ${answer.text.slice(0, 200)}`).toBe(200);
      await memberDetailPage.expectStatus('Inactive');
    });

    await steps.critical('Reopen the same member, select Activate and confirm - the status changes from Inactive back to Active', async () => {
      await memberDetailPage.open(member.id);
      const answer = await memberDetailPage.activate();
      expect(answer.status, `SetMemberActive answered ${answer.text.slice(0, 200)}`).toBe(200);
      await memberDetailPage.expectStatus('Active');
    });

    await steps.step('Repeat the deactivate action once more - the status changes to Inactive again, and no member data was lost through the cycle', async () => {
      await memberDetailPage.open(member.id);
      const answer = await (await memberDetailPage.openDeactivate()).deactivate();
      expect(answer.status, `SetMemberActive answered ${answer.text.slice(0, 200)}`).toBe(200);
      await memberDetailPage.expectStatus('Inactive');
      expect(dataOf(await readMemberForEdit(page, member.id) as unknown as Record<string, unknown>), 'the member\'s data after the cycle').toEqual(before);
    });
  });

  test(`TC-${CASES.eligibility.azureId}: should offer only active members for enrolment, never inactive or deleted ones`, async ({
    page,
    memberIn,
    policyIn,
    memberManagementPage,
    policyDetailPage,
    policyMembersTab,
    steps,
  }) => {
    test.setTimeout(8 * 60_000);
    const active = await memberIn('Active');
    const inactive = await memberIn('Inactive');
    const deleted = await memberIn('Active');
    const policy = await policyIn('Draft', { type: 'individual', members: 0 });
    const removed = await deleteMember(page, deleted.id);
    if (removed.status >= 300) steps.blocked(`the precondition delete of "${deleted.displayNameEn}" was refused: ${removed.status} ${removed.text.slice(0, 200)}`);
    let drawer!: Awaited<ReturnType<typeof policyMembersTab.openAdd>>;

    await steps.critical('Navigate to the Member Management module - the member list displays with status indicators', async () => {
      await memberManagementPage.openTable();
      expect({
        active: (await memberManagementPage.readRow(active.displayNameEn)).status,
        inactive: (await memberManagementPage.readRow(inactive.displayNameEn)).status,
        deletedListed: await memberManagementPage.isListed(deleted.displayNameEn),
      }, 'the three members in the list').toEqual({ active: 'Active', inactive: 'Inactive', deletedListed: false });
    });

    await steps.critical('Navigate to the policy enrolment selection screen - it loads with a member selection list', async () => {
      await policyDetailPage.open(policy.id);
      await policyDetailPage.openTab('members');
      drawer = await policyMembersTab.openAdd();
      expect(await drawer.isOpen(), 'the Add Member picker').toBe(true);
    });

    await steps.step('Find and select the Active member for enrolment - it is available and selectable', async () => {
      const shown = await drawer.search(active.documentId);
      const offered = await memberCandidates(page, policy.id, active.documentId);
      // Not picked: a pick replaces the search box with "Selected ... Change", and the next step searches again.
      expect({ shown: shown.some((r) => r.documentId.includes(active.documentId)), offered: offered.some((c) => c.id === active.id) }, 'the Active member in the picker').toEqual({ shown: true, offered: true });
    });

    await steps.step('Find and select the Inactive and the Deleted members for enrolment - neither is available', async () => {
      const inactiveShown = await drawer.search(inactive.documentId);
      const deletedShown = await drawer.search(deleted.documentId);
      const inactiveOffered = await memberCandidates(page, policy.id, inactive.documentId);
      const deletedOffered = await memberCandidates(page, policy.id, deleted.documentId);
      expect({
        inactive: inactiveShown.some((r) => r.documentId.includes(inactive.documentId)) || inactiveOffered.some((c) => c.id === inactive.id),
        deleted: deletedShown.some((r) => r.documentId.includes(deleted.documentId)) || deletedOffered.some((c) => c.id === deleted.id),
      }, 'members offered for enrolment').toEqual({ inactive: false, deleted: false });
      await drawer.cancel().catch(() => undefined);
    });
  });

  test(`TC-${CASES.listStatus.azureId}: should show the current status in the list after each deactivation and activation, matching the detail page`, async ({
    memberIn,
    memberManagementPage,
    memberDetailPage,
    steps,
  }) => {
    const member = await memberIn('Active');

    await steps.critical('Navigate to the Member Management module - the member list displays with a status column', async () => {
      await memberManagementPage.openTable();
      expect(await memberManagementPage.getHeaderTexts()).toContain('Status');
      expect((await memberManagementPage.readRow(member.displayNameEn)).status).toBe('Active');
    });

    await steps.step('Deactivate the member and return to the list view - the member\'s status reads Inactive', async () => {
      const answer = await (await memberManagementPage.openDeactivateDrawer(member.displayNameEn)).deactivate();
      expect(answer.status, `SetMemberActive answered ${answer.text.slice(0, 200)}`).toBe(200);
      await memberManagementPage.openTable();
      expect((await memberManagementPage.readRow(member.displayNameEn)).status, 'the status after deactivating').toBe('Inactive');
    });

    await steps.step('Activate the member again and return to the list view - the member\'s status reads Active', async () => {
      const answer = await memberManagementPage.activateMember(member.displayNameEn);
      expect(answer.status, `SetMemberActive answered ${answer.text.slice(0, 200)}`).toBe(200);
      await memberManagementPage.openTable();
      expect((await memberManagementPage.readRow(member.displayNameEn)).status, 'the status after activating').toBe('Active');
    });

    await steps.step('Open the member detail page and verify the status matches the list view - the two are consistent', async () => {
      const listed = (await memberManagementPage.readRow(member.displayNameEn)).status;
      await memberManagementPage.openDetails(member.displayNameEn);
      expect(await memberDetailPage.getStatus(), 'the detail page\'s status').toBe(listed);
    });
  });

  test(`TC-${CASES.redundant.azureId}: should not offer Activate on an active member nor Deactivate on an inactive one`, async ({
    memberIn,
    memberManagementPage,
    memberDetailPage,
    steps,
  }) => {
    const active = await memberIn('Active');
    const inactive = await memberIn('Inactive');

    await steps.critical('Navigate to the Member Management module - the module loads and displays the member list', async () => {
      expect(await openList(memberManagementPage, active.displayNameEn), 'the member in the list').toBe(true);
    });

    await steps.step('Open Member A (already Active) and check whether the Activate action is available - it is not offered', async () => {
      const toggle = await memberManagementPage.getActionState(active.displayNameEn, 'toggleActive');
      await memberManagementPage.openDetails(active.displayNameEn);
      expect({ rowOffersActivate: /^activate$/i.test(toggle.label), detailStatus: await memberDetailPage.getStatus() }, `the row's toggle reads "${toggle.label}"`)
        .toEqual({ rowOffersActivate: false, detailStatus: 'Active' });
    });

    await steps.step('Open Member B (already Inactive) and check whether the Deactivate action is available - it is not offered', async () => {
      await memberManagementPage.openTable();
      const toggle = await memberManagementPage.getActionState(inactive.displayNameEn, 'toggleActive');
      await memberManagementPage.openDetails(inactive.displayNameEn);
      expect({ rowOffersDeactivate: /inactivate|deactivate/i.test(toggle.label), detailStatus: await memberDetailPage.getStatus() }, `the row's toggle reads "${toggle.label}"`)
        .toEqual({ rowOffersDeactivate: false, detailStatus: 'Inactive' });
    });
  });

  test(`TC-${CASES.policiesUnaffected.azureId}: should leave every policy enrolment's status unchanged when the member is deactivated`, async ({
    page,
    memberEnrolled,
    policyIn,
    memberManagementPage,
    memberDetailPage,
    memberAccumulatorDashboardTab,
    steps,
  }) => {
    test.setTimeout(10 * 60_000);
    const { member, enrolments } = await memberEnrolled({ policies: 1 });
    const pending = await policyIn('Draft', { type: 'individual', members: 0 });
    const added = await addPolicyMember(page, pending.id, member.id, { relationship: 'spouse' });
    const submitted = added.status < 300 ? await submitPolicy(page, pending.id) : added;
    if (submitted.status >= 300) steps.blocked(`the precondition pending policy with the member could not be built: ${submitted.status} ${submitted.text.slice(0, 200)}`);
    const policies = [{ label: `A ${enrolments[0].policy.policyNumber} (approved)`, id: enrolments[0].policy.id }, { label: `B ${pending.nameEn} (sent for approval)`, id: pending.id }];
    const snapshot = async (): Promise<{ policy: string; status: string; roster: string }[]> => Promise.all(policies.map(async (p) => ({
      policy: p.label,
      status: await policyStatusCode(page, p.id),
      roster: (await readPolicyMembers(page, p.id)).find((m) => m.memberId === member.id)?.rosterState ?? '(not on the policy)',
    })));
    let before: { policy: string; status: string; roster: string }[] = [];
    let shownStatus = '';

    await steps.critical('Navigate to the Member Management module - the module loads and displays the member list', async () => {
      expect(await openList(memberManagementPage, member.displayNameEn), 'the member in the list').toBe(true);
    });

    await steps.critical('Open the member and record the status of each existing policy enrolment - each status is noted', async () => {
      await memberManagementPage.openDetails(member.displayNameEn);
      await memberAccumulatorDashboardTab.open();
      shownStatus = (await memberAccumulatorDashboardTab.readPolicy()).policy.policyStatus;
      before = await snapshot();
      expect(shownStatus, 'Policy A\'s status on the dashboard').not.toBe('');
      expect(before.map((b) => b.roster), 'the member on each policy').not.toContain('(not on the policy)');
    });

    await steps.critical('Select Deactivate on the member and confirm - the status changes to Inactive and a success message is displayed', async () => {
      await memberDetailPage.open(member.id);
      const answer = await (await memberDetailPage.openDeactivate()).deactivate();
      expect(answer.status, `SetMemberActive answered ${answer.text.slice(0, 200)}`).toBe(200);
      expect(answer.messages.join(' | '), 'the success message').toMatch(DEACTIVATED);
      await memberDetailPage.expectStatus('Inactive');
    });

    await steps.step('Review each existing policy enrolment\'s status again - every enrolment retains its original status', async () => {
      expect(await snapshot(), 'each policy and the member\'s place on it').toEqual(before);
      await memberAccumulatorDashboardTab.open();
      expect((await memberAccumulatorDashboardTab.readPolicy()).policy.policyStatus, 'Policy A\'s status on the dashboard').toBe(shownStatus);
    });
  });
});
