import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { InvitationListPage } from '../../../pages/user/InvitationListPage';
import type { UserListPage } from '../../../pages/user/UserListPage';
import type { IdentityListAnswer } from '../../../pages/user/IdentityListPage';
import {
  ADVANCED_FIELDS,
  APPROVALS_LABEL,
  CASES,
  LIST_HEADERS,
  PAYER_A,
  PAYER_B,
  PENDING_ACTIONS,
  SEARCH_PROBE_LENGTH,
} from '../../../data/user/searchAndFilterInvitations.data';
import {
  pauseFromList,
  pauseSuiteInvitation,
  readInvitationShown,
  removeChipLabelled,
  registrationsTabShown,
  stampTerm,
  stampedInvitationEmail,
  toggleView,
  typeOneMoreSearchChar,
} from '../../../utils/user/writerDHelpers';
import { userStamp, type InvitationItem } from '../../../utils/UserProvisioning';

const DATE_SHOWN = /^\d{2}\/\d{2}\/\d{4}/;

/** Steps 1-2 of every case: Users Mgmt, then its Invitations list. */
async function openInvitations(steps: TestSteps, users: UserListPage, list: InvitationListPage, expected = 'the list loads', check: () => Promise<void> = async () => undefined): Promise<void> {
  await steps.critical('Navigate to the User Management module - the module home page loads', async () => {
    await users.openTable();
    await users.expectToolbar();
  });
  await steps.critical(`Open the Invitations list - ${expected}`, async () => {
    await list.openTable();
    expect(await list.countRows()).toBeGreaterThan(0);
    await check();
  });
}

/** The ids an answer holds. */
const idsOf = (answer: IdentityListAnswer<InvitationItem>): string[] => answer.items.map((i) => i.id);

/** The flat row values of an invitation as the admin sees it. */
const expectedRow = (email: string, role: string, payer: string) => ({ email, role, payer, expiration: expect.stringMatching(DATE_SHOWN), status: 'Pending' });

/**
 * User story 20419: Search and Filter Invitations (System Administrator).
 * The list's details, cards / table, every payer, Quick Search, Advance Search
 * by Email / Role / Status and combined, Approvals List, Add Invitation, a
 * status change, the search length and the checklist. The Payer Admin scope
 * cases (20661, 20662) are in invitation-payer-scope.spec.ts. See the data file.
 */
test.describe('US 20419 - Search and Filter Invitations', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.listDetails.azureId}: should show Email, Role, Payer, Expiration, Status and the status actions when an invitation is reviewed`, async ({
    userListPage: users,
    invitationListPage: list,
    suiteRole,
    suiteInvitation,
    steps,
  }) => {
    const role = await suiteRole({ hasAssignedPayers: true });
    const inv = await suiteInvitation({ roleId: role.id, payerName: PAYER_A });

    await openInvitations(steps, users, list, 'the list loads as cards or a table');

    await steps.step('Review a sample invitation record - Email, Role, Payer, Expiration, Status and the status-specific actions are displayed', async () => {
      await list.revealRow(inv.email);
      expect({ row: await list.readRowById(inv.id), actions: await list.readRowActions(inv.id) })
        .toEqual({ row: expectedRow(inv.email, role.name, PAYER_A), actions: [...PENDING_ACTIONS] });
    });
  });

  test(`TC-${CASES.cardsAndTable.azureId}: should render the same invitation data when the view is toggled between cards and table`, async ({
    userListPage: users,
    invitationListPage: list,
    suiteRole,
    suiteInvitation,
    steps,
  }) => {
    const role = await suiteRole({ hasAssignedPayers: true });
    const inv = await suiteInvitation({ roleId: role.id, payerName: PAYER_A });
    let before: Awaited<ReturnType<typeof readInvitationShown>> | null = null;

    await steps.critical('Navigate to the User Management module - the module home page loads', async () => {
      await users.openTable();
      await users.expectToolbar();
    });

    await steps.critical('Open the Invitations list in its default view - the list displays in its default layout', async () => {
      await list.open();
      await list.expectToolbar();
      const answer = await list.searchFor(inv.email);
      before = await readInvitationShown(list, inv.id);
      expect({ found: idsOf(answer), email: before.email }).toEqual({ found: [inv.id], email: inv.email });
    });

    await steps.step('Toggle to the alternate layout (card / table) - the invitations re-render in it with the same data', async () => {
      const was = (before as unknown as Awaited<ReturnType<typeof readInvitationShown>>);
      const view = await toggleView(list);
      const after = await readInvitationShown(list, inv.id);
      expect({ view, data: { ...after, view: undefined } }).toEqual({ view: was.view === 'table' ? 'cards' : 'table', data: { ...was, view: undefined } });
    });
  });

  test(`TC-${CASES.adminAllPayers.azureId}: should list invitations of every payer when the System Administrator reviews the Payer column`, async ({
    userListPage: users,
    invitationListPage: list,
    suiteRole,
    suiteInvitation,
    steps,
  }) => {
    const stamp = userStamp();
    const role = await suiteRole({ hasAssignedPayers: true });
    await suiteInvitation({ roleId: role.id, payerName: PAYER_A, email: stampedInvitationEmail(stamp, 'a') });
    await suiteInvitation({ roleId: role.id, payerName: PAYER_B, email: stampedInvitationEmail(stamp, 'b') });

    await openInvitations(steps, users, list);

    await steps.step(`Review the Payer column across the records - invitations of several payers are listed ("${PAYER_A}" and "${PAYER_B}" among them)`, async () => {
      await list.searchFor(stampTerm(stamp));
      const ours = (await list.readRows()).map((r) => r.payer).sort();
      expect(ours).toEqual([PAYER_B, PAYER_A].sort());
    });
  });

  test(`TC-${CASES.quickSearch.azureId}: should show only the matching invitation when a known invitee e-mail is quick-searched`, async ({
    userListPage: users,
    invitationListPage: list,
    suiteInvitation,
    steps,
  }) => {
    const inv = await suiteInvitation();
    let answer: IdentityListAnswer<InvitationItem> = { items: [], totalRows: -1 };

    await openInvitations(steps, users, list, 'the list loads with all invitations');

    await steps.step(`Enter the invitee e-mail into Quick Search ("${inv.email}") - the field accepts it`, async () => {
      answer = await list.searchFor(inv.email);
      expect(await list.readSearchValue()).toBe(inv.email);
    });

    await steps.step('Submit the quick search - only the matching invitation is displayed', async () => {
      expect({ answered: answer.items.map((i) => i.email), rows: await list.rowIdsOnScreen() }).toEqual({ answered: [inv.email], rows: [inv.id] });
    });
  });

  test(`TC-${CASES.quickSearchNoMatch.azureId}: should show the empty state when the quick-searched e-mail matches no invitation`, async ({
    userListPage: users,
    invitationListPage: list,
    steps,
  }) => {
    const term = stampedInvitationEmail(userStamp(), CASES.quickSearchNoMatch.tag);
    let answer: IdentityListAnswer<InvitationItem> = { items: [], totalRows: -1 };

    await openInvitations(steps, users, list);

    await steps.step(`Enter an e-mail no invitation has ("${term}") - the field accepts it`, async () => {
      answer = await list.searchFor(term);
      expect(await list.readSearchValue()).toBe(term);
    });

    await steps.step('Submit the quick search - an empty results state / message is shown', async () => {
      expect({ total: answer.totalRows, rows: await list.countRows(), message: (await list.getEmptyStateText()) !== '' }).toEqual({ total: 0, rows: 0, message: true });
    });
  });

  test(`TC-${CASES.advancedEmail.azureId}: should return only the invitations of an e-mail when Advance Search filters by Email`, async ({
    userListPage: users,
    invitationListPage: list,
    suiteInvitation,
    steps,
  }) => {
    const inv = await suiteInvitation();
    await suiteInvitation();

    await openInvitations(steps, users, list);

    await steps.critical('Open the Advance Search panel - Email, Role and Status filter fields are displayed', async () => {
      expect(await list.openAdvancedSearch()).toBe(true);
      expect(await list.readAdvancedFieldLabels()).toEqual(expect.arrayContaining([...ADVANCED_FIELDS]));
    });

    await steps.step(`Enter the e-mail ("${inv.email}") and apply - only invitations of that e-mail are returned`, async () => {
      await list.fillAdvanced({ email: inv.email });
      const { request, answer } = await list.applyAdvanced();
      expect({ email: request.email, answered: [...new Set(answer.items.map((i) => i.email.toLowerCase()))], rows: await list.rowIdsOnScreen() })
        .toEqual({ email: inv.email, answered: [inv.email], rows: [inv.id] });
    });
  });

  test(`TC-${CASES.advancedRole.azureId}: should return only the invitations of a role when Advance Search filters by Role`, async ({
    userListPage: users,
    invitationListPage: list,
    suiteRole,
    suiteInvitation,
    steps,
  }) => {
    const role = await suiteRole();
    const inv = await suiteInvitation({ roleId: role.id });
    await suiteInvitation();

    await openInvitations(steps, users, list);

    await steps.critical('Open the Advance Search panel - the Role filter is displayed', async () => {
      expect(await list.openAdvancedSearch()).toBe(true);
      expect(await list.readAdvancedFieldLabels()).toContain('Role');
    });

    await steps.step(`Select the Role "${role.name}" and apply - only invitations with that role are returned`, async () => {
      await list.fillAdvanced({ role: role.name });
      const { request, answer } = await list.applyAdvanced();
      expect({ roleId: request.roleId, roles: [...new Set(answer.items.map((i) => i.roleName))], ids: idsOf(answer) }).toEqual({ roleId: role.id, roles: [role.name], ids: [inv.id] });
    });
  });

  test(`TC-${CASES.advancedStatus.azureId}: should return only the invitations of a status when Advance Search filters by Status`, async ({
    userListPage: users,
    invitationListPage: list,
    page,
    suiteRole,
    suiteInvitation,
    steps,
  }) => {
    const data = CASES.advancedStatus;
    const role = await suiteRole();
    const pending = await suiteInvitation({ roleId: role.id });
    const paused = await suiteInvitation({ roleId: role.id });
    await pauseSuiteInvitation(page, paused);

    await openInvitations(steps, users, list, 'the list loads (a Pending and a Paused suite invitation among the records)');

    await steps.critical('Open the Advance Search panel - the Status filter is displayed', async () => {
      expect(await list.openAdvancedSearch()).toBe(true);
      expect(await list.readAdvancedFieldLabels()).toContain('Status');
    });

    await steps.step(`Select the Status "${data.status}" and apply - only invitations with that status are returned`, async () => {
      await list.fillAdvanced({ status: data.status });
      const { request, answer } = await list.applyAdvanced();
      const ids = idsOf(answer);
      expect({
        status: request.status,
        statuses: [...new Set(answer.items.map((i) => i.statusName))],
        rows: [...new Set((await list.readRows()).map((r) => r.status))],
        pendingListed: ids.includes(pending.id),
        pausedListed: ids.includes(paused.id),
      }).toEqual({ status: data.statusValue, statuses: [data.status], rows: [data.status], pendingListed: true, pausedListed: false });
    });
  });

  test(`TC-${CASES.advancedCombined.azureId}: should return only invitations matching Email, Role and Status together when the three filters are combined`, async ({
    userListPage: users,
    invitationListPage: list,
    page,
    suiteRole,
    suiteInvitation,
    steps,
  }) => {
    const data = CASES.advancedCombined;
    const role = await suiteRole();
    const otherRole = await suiteRole();
    const target = await suiteInvitation({ roleId: role.id });
    await suiteInvitation({ roleId: otherRole.id, email: target.email });
    const paused = await suiteInvitation({ roleId: role.id });
    await pauseSuiteInvitation(page, paused);

    await openInvitations(steps, users, list);

    await steps.critical(`Open Advance Search and set Email ("${target.email}"), Role ("${role.name}") and Status ("${data.status}") together - all three accept their values`, async () => {
      expect(await list.openAdvancedSearch()).toBe(true);
      await list.fillAdvanced({ email: target.email, role: role.name, status: data.status });
      expect(await list.readAdvancedFieldLabels()).toEqual(expect.arrayContaining([...ADVANCED_FIELDS]));
    });

    await steps.step('Apply the combined filter - only invitations matching all three criteria are returned', async () => {
      const { request, answer } = await list.applyAdvanced();
      expect({ request: { email: request.email, roleId: request.roleId, status: request.status }, ids: idsOf(answer), chips: (await list.getChips()).length })
        .toEqual({ request: { email: target.email, roleId: role.id, status: data.statusValue }, ids: [target.id], chips: 3 });
    });
  });

  test(`TC-${CASES.approvalsList.azureId}: should open the Registrations tab of Approval Management when Approvals List (N) is clicked`, async ({
    userListPage: users,
    invitationListPage: list,
    page,
    steps,
  }) => {
    await openInvitations(steps, users, list, 'the list loads showing the Approvals List (N) button with a count', async () => {
      expect(await list.readApprovalsButton()).toMatch(APPROVALS_LABEL);
    });

    await steps.step('Click the Approvals List (N) button - Approval Management opens on its Registrations tab', async () => {
      const url = await list.openApprovals();
      expect({ url, tab: await registrationsTabShown(page), now: page.url() })
        .toEqual({ url: expect.stringMatching(/\/approval-management\?.*tab=invitation/), tab: { table: true, tabLabel: expect.stringMatching(/^Registrations/) }, now: url });
    });
  });

  test(`TC-${CASES.addInvitation.azureId}: should open the invitation form when Add Invitation is clicked on the list`, async ({
    userListPage: users,
    invitationListPage: list,
    steps,
  }) => {
    await openInvitations(steps, users, list, 'the list loads with the Add Invitation action visible', async () => {
      expect(await list.isAddOffered()).toBe(true);
    });

    await steps.step('Click Add Invitation - the invitation creation form opens', async () => {
      const drawer = await list.openAddForm();
      expect(await drawer.getTitle()).toBe('Add New Invitation');
    });
  });

  test(`TC-${CASES.statusAfterAction.azureId}: should show the new status in the list when a Pending invitation is paused from the list`, async ({
    userListPage: users,
    invitationListPage: list,
    page,
    suiteInvitation,
    steps,
  }) => {
    const data = CASES.statusAfterAction;
    const inv = await suiteInvitation();

    await steps.critical('Navigate to the User Management module - the module home page loads', async () => {
      await users.openTable();
      await users.expectToolbar();
    });

    await steps.critical('Open the Invitations list and locate the Pending suite invitation - the record shows status Pending', async () => {
      await list.openTable();
      await list.revealRow(inv.email);
      expect((await list.readRowById(inv.id)).status).toBe('Pending');
    });

    await steps.step('Pause the invitation and confirm the action from the list - a confirmation message is shown', async () => {
      const paused = await pauseFromList(page, list, inv.id);
      expect({ saved: paused.status >= 200 && paused.status < 300, confirmation: paused.dialog.visible || paused.messages.length > 0 }, `${paused.status} ${paused.text.slice(0, 160)} | dialog "${paused.dialog.title}" | ${paused.messages.join(' | ')}`)
        .toEqual({ saved: true, confirmation: true });
    });

    await steps.step(`Review the invitations list again - the same record shows status ${data.paused}`, async () => {
      await list.searchFor(inv.email);
      expect((await list.readRowById(inv.id)).status).toBe(data.paused);
    });
  });

  test(`TC-${CASES.searchMaxLength.azureId}: should accept a search string up to the maximum length and refuse one more character when the limit is reached`, async ({
    userListPage: users,
    invitationListPage: list,
    page,
    steps,
  }) => {
    let limit = SEARCH_PROBE_LENGTH;

    await openInvitations(steps, users, list);

    await steps.step('Enter a search string at the field\'s maximum allowed length - the field accepts the full string', async () => {
      const declared = await list.getSearchMaxLength();
      limit = declared ?? SEARCH_PROBE_LENGTH;
      const term = 'q'.repeat(limit);
      await list.searchFor(term);
      expect({ length: (await list.readSearchValue()).length }, `declared maxlength ${declared}`).toEqual({ length: limit });
    });

    await steps.step('Attempt to enter one character beyond the maximum length - the extra character is not accepted', async () => {
      const value = await typeOneMoreSearchChar(page, 'q');
      expect({ length: value.length, declared: await list.getSearchMaxLength() }).toEqual({ length: limit, declared: limit });
    });
  });

  test(`TC-${CASES.checklist.azureId}: should present every required invitation list element correctly labelled when the list is opened`, async ({
    userListPage: users,
    invitationListPage: list,
    suiteInvitation,
    steps,
  }) => {
    const inv = await suiteInvitation();

    await openInvitations(steps, users, list);

    await steps.step('Check Email / Role / Payer / Expiration / Status columns, status actions, Quick Search, Advance Search, Approvals List (N) and Add Invitation - every item present and labelled', async () => {
      const headers = await list.getHeaderTexts();
      await list.expectToolbar();
      const approvals = await list.readApprovalsButton();
      const add = await list.isAddOffered();
      await list.revealRow(inv.email);
      const actions = await list.readRowActions(inv.id);
      const advanced = await list.openAdvancedSearch();
      const fields = await list.readAdvancedFieldLabels();
      await list.cancelAdvanced();
      expect({ headers, actions, approvals, add, advanced, fields }).toEqual({
        headers: expect.arrayContaining([...LIST_HEADERS]),
        actions: [...PENDING_ACTIONS],
        approvals: expect.stringMatching(APPROVALS_LABEL),
        add: true,
        advanced: true,
        fields: expect.arrayContaining([...ADVANCED_FIELDS]),
      });
    });
  });

  test(`TC-${CASES.quickAndAdvanced.azureId}: should update the list consistently when Quick Search and Advance Search are combined and cleared one at a time`, async ({
    userListPage: users,
    invitationListPage: list,
    page,
    suiteRole,
    suiteInvitation,
    steps,
  }) => {
    const stamp = userStamp();
    const role = await suiteRole();
    const otherRole = await suiteRole();
    const a =await suiteInvitation({ roleId: role.id, email: stampedInvitationEmail(stamp, 'a') });
    const b = await suiteInvitation({ roleId: otherRole.id, email: stampedInvitationEmail(stamp, 'b') });
    let combinedTotal = -1;

    await openInvitations(steps, users, list);

    await steps.step(`Apply the Quick Search "${stampTerm(stamp)}", then Advance Search Role "${role.name}" - both work together without errors and the list updates`, async () => {
      const quick = await list.searchFor(stampTerm(stamp));
      const { request, answer } = await list.advancedSearch({ role: role.name });
      combinedTotal = answer.totalRows;
      expect({ quick: idsOf(quick).sort(), request: { searchText: request.searchText, roleId: request.roleId }, combined: idsOf(answer) })
        .toEqual({ quick: [a.id, b.id].sort(), request: { searchText: stampTerm(stamp), roleId: role.id }, combined: [a.id] });
    });

    await steps.step('Clear one filter at a time (the Role chip, then the Quick Search) - the list updates consistently each time', async () => {
      const withoutRole = await removeChipLabelled(page, list, /^Role/i);
      const cleared = await list.searchFor('');
      expect({ withoutRole: idsOf(withoutRole).sort(), widerThanCombined: withoutRole.totalRows > combinedTotal, everything: cleared.totalRows > withoutRole.totalRows, chips: await list.getChips() })
        .toEqual({ withoutRole: [a.id, b.id].sort(), widerThanCombined: true, everything: true, chips: [] });
    });
  });
});
