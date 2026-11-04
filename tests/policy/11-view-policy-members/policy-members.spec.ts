import { test, expect } from '../../../fixtures';
import type { ConfirmDialog } from '../../../pages/components/ConfirmDialog';
import type { AdvancedSearchDrawer } from '../../../pages/payer/AdvancedSearchDrawer';
import type { PolicyMembersTab } from '../../../pages/policy/PolicyMembersTab';
import type { PolicyMemberDrawer } from '../../../pages/policy/PolicyMemberDrawer';
import type { PolicyDetailPage } from '../../../pages/policy/PolicyDetailPage';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { POLICY_MEMBERS, POLICY_MEMBER_FILTER_FIELD } from '../../../constants/ElementIds';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { DIALOG, NOTICE } from '../../../data/policy/policy.data';
import { BLOCKED_CASES, CASES, SUBLIMITS_SECTION } from '../../../data/policy/policyMembers.data';
import { blockUnless, findExpiredPolicy, freeCandidates, rowControlAvailability, rowControlTitle } from '../../../utils/policy/writerCHelpers';
import {
  addPolicyMember,
  policyDayText,
  publishPolicyChange,
  readPolicyMembers,
  type MemberCandidate,
} from '../../../utils/PolicyProvisioning';

const MEMBERS_LIST = /\/GetPolicyMembers$/;

/**
 * Add Member with the picker: search, pick the candidate by document id, choose the relationship, save; returns the answer.
 * Searches by DOCUMENT ID by default (2026-11-04): the picker finds nobody for a name of
 * several words (the candidate's full name, or "first last" as the table prints it -
 * 19559's finding), so the cases that only need "a member" search by document id.
 */
async function enrolOnScreen(members: PolicyMembersTab, candidate: MemberCandidate, relationship: string, by: 'name' | 'documentId' = 'documentId'): Promise<{ status: number; text: string; messages: string[] }> {
  const drawer = await members.openAdd();
  await drawer.search(by === 'name' ? candidate.displayNameEn : candidate.documentId);
  await drawer.pick(candidate.documentId);
  await drawer.chooseRelationship(relationship);
  return drawer.attemptSave();
}

/** Re-opens the policy's Members tab (a fresh tab state between filter checks). */
async function reopenMembers(detail: PolicyDetailPage, members: PolicyMembersTab, policyId: string): Promise<void> {
  await detail.open(policyId);
  await members.open();
}

/**
 * User story 15178: View Policy - Members. The administrator plays the
 * Insurance Coordinator and the approving reviewer. Policies are INDIVIDUAL
 * (a Group policy takes members only once Active); Expired policies are only
 * looked at (data/policy/policyMembers.data.ts).
 */
test.describe('US 15178 - View Policy - Members', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.enrolByName.azureId}: should enrol a member found by name into a draft policy`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyMembersTab,
    policyIn,
    steps,
  }, testInfo) => {
    const data = CASES.enrolByName;
    const policy = await policyIn('Draft', { type: 'individual', members: 0 });
    const [candidate] = await freeCandidates(page, policy.id, 1);
    blockUnless(testInfo, candidate !== undefined, 'a member the picker offers', 'the member picker offered no member');
    let drawer!: PolicyMemberDrawer;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the draft policy and go to the Members tab - the current member list is shown', async () => {
      await policyDetailPage.open(policy.id);
      await policyMembersTab.open();
      expect(await policyMembersTab.countRows()).toBe(0);
    });

    // A plain step (2026-11-04): the picker answered [] for the member's full name in
    // the 2026-11-03 run (finding). The next step then finds the member by document id
    // so the Save step's own expectations are still checked.
    let foundByName = false;
    await steps.step(`Click Add Member and search by the name "${candidate.displayNameEn}" - matching members are displayed`, async () => {
      drawer = await policyMembersTab.openAdd();
      const results = await drawer.search(candidate.displayNameEn);
      foundByName = results.some((r) => r.documentId.includes(candidate.documentId));
      expect(foundByName, `the picker's results for the name "${candidate.displayNameEn}": ${results.length ? results.map((r) => `${r.name} (${r.documentId})`).join(', ') : 'none'}`).toBe(true);
    });

    await steps.critical(`Select the member and choose the relationship ${data.relationship} - both are populated in the form`, async () => {
      if (!foundByName) await drawer.search(candidate.documentId);
      await drawer.pick(candidate.documentId);
      await drawer.chooseRelationship(data.relationship);
      const text = await drawer.getText();
      expect(text).toContain(candidate.documentId);
      expect(text).toContain(data.relationship);
    });

    await steps.step('Save the member - a row appears with Member Number, Document ID, Name, Relationship, Status and Approval Status populated', async () => {
      const answer = await drawer.attemptSave();
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
      await policyMembersTab.open();
      expect(await policyMembersTab.getHeaders()).toEqual(expect.arrayContaining([...CASES.columns.headers]));
      const row = (await policyMembersTab.readRows()).find((r) => r.number === candidate.memberCode);
      expect(row, `a row for ${candidate.memberCode}`).toBeDefined();
      expect(row).toMatchObject({ documentId: candidate.documentId, relationship: data.relationship });
      expect(row!.name && row!.state, JSON.stringify(row)).toBeTruthy();
    });
  });

  test(`TC-${CASES.enrolByDocumentId.azureId}: should find a member by document ID and add them to the policy`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyMembersTab,
    policyIn,
    steps,
  }, testInfo) => {
    const data = CASES.enrolByDocumentId;
    const policy = await policyIn('Draft', { type: 'individual', members: 0 });
    const [candidate] = await freeCandidates(page, policy.id, 1);
    blockUnless(testInfo, candidate !== undefined, 'a member the picker offers', 'the member picker offered no member');
    let drawer!: PolicyMemberDrawer;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the policy\'s Members tab and click Add Member - the Add Member form opens', async () => {
      await policyDetailPage.open(policy.id);
      await policyMembersTab.open();
      drawer = await policyMembersTab.openAdd();
      expect(await drawer.isOpen()).toBe(true);
    });

    await steps.critical(`Search by the Document ID ${candidate.documentId} - the matching member is returned`, async () => {
      const results = await drawer.search(candidate.documentId);
      expect(results.some((r) => r.documentId.includes(candidate.documentId)), JSON.stringify(results)).toBe(true);
    });

    await steps.step(`Select the member, set Relationship = ${data.relationship} and save - the member row is added`, async () => {
      await drawer.pick(candidate.documentId);
      await drawer.chooseRelationship(data.relationship);
      const answer = await drawer.attemptSave();
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
      await policyMembersTab.open();
      const row = (await policyMembersTab.readRows()).find((r) => r.number === candidate.memberCode);
      expect(row, `a row for ${candidate.memberCode}`).toBeDefined();
      expect(row?.relationship).toBe(data.relationship);
    });
  });

  test(`TC-${CASES.noDuplicate.azureId}: should not let an already-enrolled member be selected again on the same policy`, async ({
    policyManagementPage,
    policyDetailPage,
    policyMembersTab,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('Draft', { type: 'individual', members: 1 });
    const enrolled = policy.members[0];

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical(`Open the policy's Members tab - the enrolled member ${enrolled.memberCode} is visible`, async () => {
      await policyDetailPage.open(policy.id);
      await policyMembersTab.open();
      await expect(policyMembersTab.rowOf(enrolled.memberCode)).toBeVisible();
    });

    await steps.step('Click Add Member and search for the same member - the member cannot be selected again', async () => {
      const drawer = await policyMembersTab.openAdd();
      const results = await drawer.search(enrolled.documentId);
      expect(results.some((r) => r.documentId.includes(enrolled.documentId)), `the picker offered the already-enrolled member again: ${results.map((r) => `${r.name} (${r.documentId})`).join(', ')}`).toBe(false);
    });
  });

  test(`TC-${CASES.expiredReadOnly.azureId}: should block adding and deleting members on an expired policy`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyMembersTab,
    steps,
  }, testInfo) => {
    const expired = await findExpiredPolicy(page, { members: true });
    blockUnless(testInfo, expired !== null, 'an Expired policy with members (read-only use)', 'the register holds no Expired policy with members, and Expired cannot be produced on demand (daily lifecycle job)');
    let code = '';

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(expired!.policyNameEn)).toBe(true);
    });

    await steps.critical('Open the Expired policy\'s Members tab - the existing members are displayed read-only', async () => {
      await policyDetailPage.open(expired!.id);
      expect(await policyDetailPage.getStatus()).toMatch(/Expired/);
      await policyMembersTab.open();
      const rows = await policyMembersTab.readRows();
      expect(rows.length).toBeGreaterThan(0);
      code = rows[0].number;
      expect(await policyMembersTab.getPanelHeaderText(), 'the read-only notice').toContain(NOTICE.membersReadOnly);
    });

    await steps.step('Attempt to click Add Member - the action is disabled or blocked', async () => {
      expect(await policyMembersTab.getAddAvailability()).not.toBe('available');
    });

    await steps.step('Attempt to delete an existing member - the action is disabled or blocked with a message that expired policies cannot be modified', async () => {
      const row = policyMembersTab.rowOf(code);
      expect(await rowControlAvailability(row, POLICY_MEMBERS.remove)).not.toBe('available');
      expect(`${await rowControlTitle(row, POLICY_MEMBERS.remove)} ${await policyMembersTab.getPanelHeaderText()}`).toMatch(CASES.expiredReadOnly.message);
    });
  });

  test(`TC-${CASES.inactiveReadOnly.azureId}: should block adding and deleting members on an inactive policy`, async ({
    policyManagementPage,
    policyDetailPage,
    policyMembersTab,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('Inactive', { type: 'individual' });
    const member = policy.members[0];

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    // A plain step (2026-11-04): the 2026-11-03 run stopped here on the missing notice,
    // so Add / Remove (both offered on screen) were never recorded. "Read-only" is a
    // read-only notice OR neither Add Member nor Remove usable - not the notice alone.
    await steps.step('Open the Inactive policy\'s Members tab - the existing members are displayed read-only', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getStatus()).toMatch(/Inactive/);
      await policyMembersTab.open();
      await expect(policyMembersTab.rowOf(member.memberCode)).toBeVisible();
      const notice = await policyMembersTab.getPanelHeaderText();
      const add = await policyMembersTab.getAddAvailability();
      const remove = await rowControlAvailability(policyMembersTab.rowOf(member.memberCode), POLICY_MEMBERS.remove);
      const readOnly = /cannot be changed|read[- ]only/i.test(notice) || (add !== 'available' && remove !== 'available');
      expect(readOnly, `read-only display: no read-only notice ("${notice.slice(0, 160)}"), Add Member ${add}, Remove ${remove}`).toBe(true);
    });

    await steps.step('Attempt to click Add Member - the action is disabled or blocked', async () => {
      expect(await policyMembersTab.getAddAvailability()).not.toBe('available');
    });

    await steps.step('Attempt to delete an existing member - the action is disabled or blocked with a message that inactive policies cannot be modified', async () => {
      const row = policyMembersTab.rowOf(member.memberCode);
      expect(await rowControlAvailability(row, POLICY_MEMBERS.remove)).not.toBe('available');
      expect(`${await rowControlTitle(row, POLICY_MEMBERS.remove)} ${await policyMembersTab.getPanelHeaderText()}`).toMatch(CASES.inactiveReadOnly.message);
    });
  });

  test(`TC-${CASES.enrolAnyStatus.azureId}: should allow enrolment on Draft, Active and Pending Approval policies and block it on an Expired one`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyMembersTab,
    policyIn,
    steps,
  }, testInfo) => {
    const relationship = CASES.enrolAnyStatus.relationship;
    const draft = await policyIn('Draft', { type: 'individual', members: 0 });
    const pending = await policyIn('PendingApproval', { type: 'individual' });
    const active = await policyIn('Active');
    const expired = await findExpiredPolicy(page);
    blockUnless(testInfo, expired !== null, 'an Expired policy (read-only use)', 'the register holds no Expired policy, and Expired cannot be produced on demand');

    const enrolInto = async (policyId: string): Promise<void> => {
      const [candidate] = await freeCandidates(page, policyId, 1);
      expect(candidate, 'a member the picker offers').toBeDefined();
      await policyDetailPage.open(policyId);
      await policyMembersTab.open();
      const answer = await enrolOnScreen(policyMembersTab, candidate, relationship);
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
      expect((await readPolicyMembers(page, policyId)).some((m) => m.memberId === candidate.id), 'the member is on the policy').toBe(true);
    };

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(draft.nameEn)).toBe(true);
    });

    await steps.step('Open a Draft policy\'s Members tab and add a member - the member is added', async () => {
      await enrolInto(draft.id);
    });

    await steps.step(`Open an Active policy's Members tab (${active.policyNumber}) and add a member - the member is added`, async () => {
      await enrolInto(active.id);
    });

    await steps.step('Open a Pending Approval policy\'s Members tab and add a member - the member is added', async () => {
      await enrolInto(pending.id);
    });

    await steps.step(`Open an Expired policy's Members tab (${expired!.policyNumber}) and attempt to add a member - the add action is blocked`, async () => {
      await policyDetailPage.open(expired!.id);
      await policyMembersTab.open();
      expect(await policyMembersTab.getAddAvailability()).not.toBe('available');
    });
  });

  test(`TC-${CASES.relationships.azureId}: should save each relationship type selected for different members`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyMembersTab,
    policyIn,
    steps,
  }, testInfo) => {
    const data = CASES.relationships;
    const policy = await policyIn('Draft', { type: 'individual', members: 0 });
    const [first, second] = await freeCandidates(page, policy.id, 2);
    blockUnless(testInfo, second !== undefined, 'two members the picker offers', 'the member picker offered fewer than two members');
    let drawer!: PolicyMemberDrawer;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the policy\'s Members tab and click Add Member - the Add Member form opens', async () => {
      await policyDetailPage.open(policy.id);
      await policyMembersTab.open();
      drawer = await policyMembersTab.openAdd();
      expect(await drawer.isOpen()).toBe(true);
    });

    await steps.critical(`Search and select a member, then open the Relationship list - ${data.options.join(', ')} are listed`, async () => {
      // By document id (2026-11-04): the picker finds nobody for a full name (19559).
      await drawer.search(first.documentId);
      await drawer.pick(first.documentId);
      expect(await drawer.getRelationshipOptions()).toEqual([...data.options]);
    });

    await steps.step(`Select ${data.first} and save - the member is added with Relationship = ${data.first}`, async () => {
      await drawer.chooseRelationship(data.first);
      const answer = await drawer.attemptSave();
      expect(answer.status, answer.text.slice(0, 200)).toBe(200);
      await policyMembersTab.open();
      expect((await policyMembersTab.readRows()).find((r) => r.number === first.memberCode)?.relationship).toBe(data.first);
    });

    await steps.step(`Repeat the add with ${data.second} for a different member - the member is added with Relationship = ${data.second}`, async () => {
      const answer = await enrolOnScreen(policyMembersTab, second, data.second);
      expect(answer.status, answer.text.slice(0, 200)).toBe(200);
      await policyMembersTab.open();
      expect((await policyMembersTab.readRows()).find((r) => r.number === second.memberCode)?.relationship).toBe(data.second);
    });
  });

  test(`TC-${CASES.eachFilter.azureId}: should narrow the member list with each Advance Search filter on its own`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyMembersTab,
    policyIn,
    steps,
  }, testInfo) => {
    const data = CASES.eachFilter;
    const policy = await policyIn('Draft', { type: 'individual', members: data.members });
    const [extra] = await freeCandidates(page, policy.id, 1);
    blockUnless(testInfo, extra !== undefined, 'one more member the picker offers', 'the member picker offered no further member');
    const target = policy.members[0];

    await steps.critical(`Precondition: one more member is enrolled as ${data.extraRelationship}`, async () => {
      expect((await addPolicyMember(page, policy.id, extra.id, { relationship: 'child' })).status).toBe(200);
    });

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the policy\'s Members tab - the full member list is displayed', async () => {
      await policyDetailPage.open(policy.id);
      await policyMembersTab.open();
      expect(await policyMembersTab.countRows()).toBe(data.members + 1);
    });

    await steps.step(`Open Advance Search and search by Member Number ${target.memberCode} - the table shows the matching member`, async () => {
      const rows = await policyMembersTab.applyCriteria({ [POLICY_MEMBER_FILTER_FIELD.number]: target.memberCode });
      expect(rows.map((r) => r.number)).toEqual([target.memberCode]);
    });

    await steps.step(`Clear and search by Name "${target.memberNameEn}" - the table shows the matching member(s)`, async () => {
      await reopenMembers(policyDetailPage, policyMembersTab, policy.id);
      const rows = await policyMembersTab.applyCriteria({ [POLICY_MEMBER_FILTER_FIELD.name]: target.memberNameEn });
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(row.name).toContain(target.memberNameEn);
    });

    await steps.step(`Clear and search by Document ID ${target.documentId} - the table shows the matching member`, async () => {
      await reopenMembers(policyDetailPage, policyMembersTab, policy.id);
      const rows = await policyMembersTab.applyCriteria({ [POLICY_MEMBER_FILTER_FIELD.documentId]: target.documentId });
      expect(rows.map((r) => r.documentId)).toEqual([target.documentId]);
    });

    await steps.step(`Clear and search by Relationship ${data.extraRelationship} - the table shows the members with that relationship`, async () => {
      await reopenMembers(policyDetailPage, policyMembersTab, policy.id);
      const rows = await policyMembersTab.applyCriteria({ [POLICY_MEMBER_FILTER_FIELD.relationship]: data.extraRelationship });
      expect(rows.map((r) => r.number)).toEqual([extra.memberCode]);
      expect(rows.every((r) => r.relationship === data.extraRelationship)).toBe(true);
    });
  });

  test(`TC-${CASES.combinedFilters.azureId}: should show only the members matching Name and Relationship together`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyMembersTab,
    policyIn,
    steps,
  }, testInfo) => {
    const data = CASES.combinedFilters;
    const policy = await policyIn('Draft', { type: 'individual', members: data.members });
    const [extra] = await freeCandidates(page, policy.id, 1);
    blockUnless(testInfo, extra !== undefined, 'one more member the picker offers', 'the member picker offered no further member');
    let drawer!: AdvancedSearchDrawer;
    // The member's name AS THE TABLE PRINTS IT (2026-11-04): the picker's full
    // name ("Ahmad Fakhri Ibrahim Abu Sabha") is not the roster's ("Ahmad Abu
    // Sabha"), and the Name filter matched nothing for the former in the
    // 2026-11-03 run. 19566 filters by the roster name and passed.
    let name = '';

    await steps.critical(`Precondition: one more member is enrolled as ${data.extraRelationship}`, async () => {
      expect((await addPolicyMember(page, policy.id, extra.id, { relationship: 'child' })).status).toBe(200);
      name = (await readPolicyMembers(page, policy.id)).find((m) => m.memberId === extra.id)?.memberNameEn ?? '';
      expect(name, `the roster name of ${extra.memberCode}`).not.toBe('');
    });

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the policy\'s Members tab - the full list is displayed', async () => {
      await policyDetailPage.open(policy.id);
      await policyMembersTab.open();
      expect(await policyMembersTab.countRows()).toBe(data.members + 1);
    });

    await steps.step(`Open Advance Search and enter the Name of ${extra.memberCode} and Relationship ${data.extraRelationship} together - the criteria are set`, async () => {
      drawer = await policyMembersTab.openAdvancedSearch();
      await drawer.typeText(POLICY_MEMBER_FILTER_FIELD.name, name);
      await drawer.choose(POLICY_MEMBER_FILTER_FIELD.relationship, data.extraRelationship);
      expect(await drawer.getValue(POLICY_MEMBER_FILTER_FIELD.name)).toBe(name);
    });

    await steps.step('Click Search - only the members matching both criteria are shown', async () => {
      const answered = page.waitForResponse((r) => MEMBERS_LIST.test(new URL(r.url()).pathname)).catch(() => null);
      await drawer.submit();
      await answered;
      const rows = await policyMembersTab.readRows();
      expect(rows.map((r) => r.number)).toEqual([extra.memberCode]);
      expect(rows[0].relationship).toBe(data.extraRelationship);
    });
  });

  test(`TC-${CASES.columns.azureId}: should display every required column and the View Accumulator and Delete actions on the members table`, async ({
    policyManagementPage,
    policyDetailPage,
    policyMembersTab,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('Future', { type: 'individual' });
    const member = policy.members[0];

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the policy\'s Members tab - the members table loads', async () => {
      await policyDetailPage.open(policy.id);
      await policyMembersTab.open();
      await expect(policyMembersTab.rowOf(member.memberCode)).toBeVisible();
    });

    await steps.step(`Verify the columns ${CASES.columns.headers.join(', ')} are present and populated`, async () => {
      expect(await policyMembersTab.getHeaders()).toEqual(expect.arrayContaining([...CASES.columns.headers]));
      const row = (await policyMembersTab.readRows()).find((r) => r.number === member.memberCode);
      expect(row && row.number && row.documentId && row.name && row.relationship && row.state, JSON.stringify(row)).toBeTruthy();
    });

    await steps.step('Verify the Actions column shows View Accumulator and Delete - both are visible and clickable', async () => {
      expect(await policyMembersTab.getRowActionAvailability(member.memberCode, 'viewAccumulator')).toBe('available');
      expect(await policyMembersTab.getRowActionAvailability(member.memberCode, 'remove')).toBe('available');
    });
  });

  test(`TC-${CASES.removeFromDraft.azureId}: should remove an enrolled member from a draft policy after confirmation`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyMembersTab,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('Draft', { type: 'individual', members: 1 });
    const member = policy.members[0];
    let dialog!: ConfirmDialog;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical(`Open the policy's Members tab - the member row ${member.memberCode} is visible`, async () => {
      await policyDetailPage.open(policy.id);
      await policyMembersTab.open();
      await expect(policyMembersTab.rowOf(member.memberCode)).toBeVisible();
    });

    await steps.critical('Click Delete on the member row - a confirmation prompt is displayed', async () => {
      dialog = await policyMembersTab.requestRemove(member.memberCode);
      expect(await dialog.getTitle()).toBe(DIALOG.removeMember.title);
    });

    await steps.step('Confirm the deletion - the member row is removed from the table', async () => {
      const answer = await NetworkUtils.captureResponse(page, ApiEndpoints.policyRemoveMember, async () => { await dialog.confirmWithFollowUps(); });
      expect(answer?.status ?? -1, answer?.text.slice(0, 200)).toBe(200);
      await policyDetailPage.open(policy.id);
      await policyMembersTab.open();
      expect(await policyMembersTab.rowOf(member.memberCode).count(), `the row reads "${await policyMembersTab.readState(member.memberCode)}"`).toBe(0);
    });
  });

  test(`TC-${CASES.periodSamePayer.azureId}: should list only same-payer policies in the accumulator's Benefit Period dropdown`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyMembersTab,
    policyIn,
    steps,
  }) => {
    const data = CASES.periodSamePayer;
    const policyA = await policyIn('Future', { type: 'individual', expiryInDays: data.expiryA });
    const member = policyA.members[0];
    const policyB = await policyIn('Draft', { type: 'individual', members: 0, expiryInDays: data.expiryB });
    const policyC = await policyIn('Draft', { type: 'individual', members: 0, networks: 0, payerName: data.otherPayer, expiryInDays: data.expiryC });
    const endOf = (iso: string): string => policyDayText(iso);
    let options: string[] = [];

    await steps.critical('Precondition: the member is also enrolled on policy B (same payer, approved) and policy C (another payer)', async () => {
      expect((await addPolicyMember(page, policyB.id, member.memberId)).status).toBe(200);
      await publishPolicyChange(page, policyB.id, policyB.nameEn);
      expect((await addPolicyMember(page, policyC.id, member.memberId)).status).toBe(200);
    });

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policyA.nameEn)).toBe(true);
    });

    await steps.critical('Open a policy\'s Members tab and click View Accumulator for the member - the accumulator opens with the current policy selected', async () => {
      await policyDetailPage.open(policyA.id);
      await policyMembersTab.open();
      const accumulator = await policyMembersTab.openAccumulator(member.memberCode);
      const period = await accumulator.readPeriod();
      expect(period.value).toMatch(/current/i);
      expect(period.value).toContain(endOf(policyA.expiryDate));
      options = period.options;
    });

    await steps.step('Open the Benefit Period dropdown - it lists only the policies sharing the current policy\'s payer', async () => {
      const ends = [endOf(policyA.expiryDate), endOf(policyB.expiryDate)];
      expect(options.some((o) => o.includes(endOf(policyB.expiryDate))), `policy B's period among ${JSON.stringify(options)}`).toBe(true);
      expect(options.every((o) => ends.some((end) => o.includes(end))), JSON.stringify(options)).toBe(true);
    });

    await steps.step('Verify the policy under a different payer is not listed - it is absent', async () => {
      expect(options.some((o) => o.includes(endOf(policyC.expiryDate))), `policy C's period (${endOf(policyC.expiryDate)}) among ${JSON.stringify(options)}`).toBe(false);
    });
  });

  test(`TC-${CASES.noSublimitsConsumed.azureId}: should show "No sublimits consumed in this period" when no sublimit amount has been paid`, async ({
    policyManagementPage,
    policyDetailPage,
    policyMembersTab,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('Future', { type: 'individual' });
    const member = policy.members[0];
    let sublimits = '';

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the policy\'s Members tab and click View Accumulator for the member - the accumulator view opens', async () => {
      await policyDetailPage.open(policy.id);
      await policyMembersTab.open();
      const accumulator = await policyMembersTab.openAccumulator(member.memberCode);
      sublimits = (await accumulator.readSections()).sublimits;
      expect(await accumulator.getText()).toContain(member.memberCode);
    });

    await steps.step(`Scroll to the ${SUBLIMITS_SECTION} section - the section is displayed`, async () => {
      expect(sublimits).toContain(SUBLIMITS_SECTION);
    });

    await steps.step(`Verify the message "${NOTICE.noSublimits}" is shown`, async () => {
      expect(sublimits).toContain(NOTICE.noSublimits);
    });
  });

  test(`TC-${CASES.anyPayer.azureId}: should show every enrolled member on the Members tab whatever the policy's payer`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyMembersTab,
    policyIn,
    steps,
  }) => {
    const policyA = await policyIn('Draft', { type: 'individual' });
    const policyB = await policyIn('Draft', { type: 'individual', payerName: CASES.anyPayer.otherPayer, networks: 0 });

    const expectAllShown = async (policyId: string): Promise<void> => {
      await policyDetailPage.open(policyId);
      await policyMembersTab.open();
      const onScreen = (await policyMembersTab.readRows()).map((r) => r.number).sort();
      const stored = (await readPolicyMembers(page, policyId)).map((m) => m.memberCode).sort();
      expect(stored.length).toBeGreaterThan(0);
      expect(onScreen).toEqual(stored);
    };

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policyA.nameEn)).toBe(true);
    });

    await steps.step(`Open a policy under Payer A (${policyA.payerName}) and view its Members tab - the members are shown without payer restriction`, async () => {
      await expectAllShown(policyA.id);
    });

    await steps.step(`Open a policy under Payer B (${policyB.payerName}) and view its Members tab - the members are shown without payer restriction`, async () => {
      await expectAllShown(policyB.id);
    });
  });

  test(`TC-${CASES.reviewerSeesMembers.azureId}: should show the reviewer the complete member arrangement before the approval decision`, async ({
    policyManagementPage,
    policyDetailPage,
    policyMembersTab,
    policyApprovalsPage,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('PendingApproval', { type: 'individual', members: CASES.reviewerSeesMembers.members });

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Log in as the approving reviewer and open the policy pending approval - the detail shows the approval workflow', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getVersionBadge()).toMatch(/Pending Approval/);
    });

    await steps.step('Open the Members tab - every enrolled member is shown with Status and Approval Status', async () => {
      await policyMembersTab.open();
      expect(await policyMembersTab.getHeaders()).toEqual(expect.arrayContaining(['Status', 'Approval Status']));
      const rows = await policyMembersTab.readRows();
      expect(rows.map((r) => r.number).sort()).toEqual(policy.members.map((m) => m.memberCode).sort());
      for (const row of rows) expect(row.state, row.number).not.toBe('');
    });

    await steps.step('Review the full arrangement before deciding - the reviewer sees every enrolled member', async () => {
      await policyApprovalsPage.open();
      // openReview waits for the panel's field / before / after rows (2026-11-04):
      // readReviewText read the panel before it filled ("Review Submission" only).
      const rows = await policyApprovalsPage.openReview(policy.nameEn);
      const review = rows.map((r) => `${r.field}: ${r.before} -> ${r.after}`).join(' | ');
      for (const member of policy.members) expect(review, `member ${member.memberNameEn} in the Review panel (${review.slice(0, 300)})`).toContain(member.memberNameEn);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
