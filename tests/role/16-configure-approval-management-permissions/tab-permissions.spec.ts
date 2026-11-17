import {
  test,
  expect,
  ApprovalTabView,
  becomeReviewer,
  confirmPrompt,
  heldKeys,
  inspectApprovalModule,
  listApprovals,
  openAddPrivileges,
  openPrompt,
  passGate,
  pendingCount,
  pendingSuiteRegistrations,
  picture,
  readRoleOnScreen,
  requireData,
  statesOf,
  tickInEditDrawer,
  treeMismatch,
  treePicture,
} from '../../../utils/role/writerFHelpers';
import type { SuiteRole } from '../../../fixtures/roleModule.fixture';
import { PREDEFINED_ROLES } from '../../../data/role/common.data';
import {
  ACTION_LABEL,
  API_COUNTS_AS_ACCESS,
  APPROVAL_MODULES,
  CASES,
  GENERAL,
  GENERAL_LABEL,
  INVITATION,
  INVITATION_LABEL,
  REGISTRATION_GATE,
  ROLE_RIGHTS,
  TREE_DIFF,
  allKey,
  oneKey,
  tabKey,
} from '../../../data/role/configureApprovalManagementPermissions.data';

/**
 * US 21301 - Configure Approval Management Permissions: which tabs a reviewer sees (tab permission only,
 * a tab not granted, general rights without the tab), the pending-count badge, the six modules' own
 * permission entries, and the Registrations tab (BLOCKED - no pending registration can be produced).
 * The reviewer is maalmohammad (roleHolder); careconnect edits / reads the roles. Decisions:
 * data/role/configureApprovalManagementPermissions.data.ts.
 */
test.describe('US 21301 - Configure Approval Management Permissions (tabs)', () => {
  test.describe.configure({ timeout: 8 * 60_000 });

  test(`TC-${CASES.tabOnly.azureId}: should show the reviewer only the Payer tab when only the Payer tab permission is enabled`, async ({ steps, suiteRoles, roleHolder, roleAdmin }) => {
    let role!: SuiteRole;
    const groups = APPROVAL_MODULES.map((m) => m.key);
    const expectedStates = { ...Object.fromEntries(groups.map((k) => [k, 'unchecked'])), [tabKey('Payer')]: 'checked' };

    await steps.critical('Precondition: a reviewer suite role with no approval module tab permission (general view rights only)', async () => {
      role = await suiteRoles.create({ label: 'reviewer payer', rights: ROLE_RIGHTS.tabOnlyBefore });
      expect(role.rights.some((k) => k.startsWith('ApprovalManagement'))).toBe(false);
    });

    await steps.step('Navigate to the Role Management module - the screen loads with the list of roles', async () => {
      const answer = await roleAdmin.open();
      const found = await roleAdmin.search(role.name);
      expect(answer.status).toBe(200);
      expect(found.items.map((r) => r.id)).toEqual([role.id]);
    });

    await steps.critical('Open the reviewer\'s role and enable the "Payer" tab permission only - the Payer tab is checked, every other module tab unchecked', async () => {
      const states = await tickInEditDrawer(roleAdmin, role, tabKey('Payer'), groups);
      expect(states).toEqual(expectedStates);
    });

    await steps.critical('Save the role - a confirmation message confirms the role was updated', async () => {
      const out = await roleAdmin.form.save();
      expect(out.status, `UpdateRole answered ${out.status} "${out.apiMessage}"`).not.toBeNull();
      expect(out.status as number).toBeLessThan(300);
      expect(out.toast, `toast after saving: "${out.toast}"`).not.toBe('');
    });

    await steps.step('Log in as the reviewer and open Approval Management - only the Payer tab is shown', async () => {
      await roleHolder.become({ role });
      const view = new ApprovalTabView(roleHolder.page, 'payer');
      // One module offered = the hub shows that queue alone, without a tab strip (live 2026-11-14/15).
      const tabs = await view.openHub();
      await expect(view.section()).toBeVisible();
      expect(tabs.join(', '), 'module tabs / queues the reviewer is offered').toBe('payer');
    });
  });

  test(`TC-${CASES.tabHidden.azureId}: should hide a module tab the reviewer has no permission to view`, async ({ steps, suiteRoles, roleHolder, roleAdmin }) => {
    let role!: SuiteRole;
    const view = (): ApprovalTabView => new ApprovalTabView(roleHolder.page, 'payer');

    await steps.critical('Precondition: the reviewer\'s role has the Payer tab permission and not the Network tab permission', async () => {
      role = await becomeReviewer(suiteRoles, roleHolder, { label: 'payer tab', rights: ROLE_RIGHTS.payerTabOnly });
      expect(role.rights).toContain(tabKey('Payer'));
    });

    await steps.step('Navigate to the Role Management module - the screen loads', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
    });

    await steps.step('Confirm the reviewer\'s role has the Network tab permission unchecked', async () => {
      const seen = await readRoleOnScreen(roleAdmin, role);
      expect(seen.listed).toBe(true);
      expect(treeMismatch(statesOf(seen.rows, [tabKey('Network'), oneKey('Network'), allKey('Network')]), { [tabKey('Network')]: 'unchecked', [oneKey('Network')]: 'unchecked', [allKey('Network')]: 'unchecked' }), TREE_DIFF).toBe('');
    });

    await steps.step('Log in as the reviewer and open Approval Management - the screen shows the Payer tab', async () => {
      const tabs = await view().openHub();
      await expect(view().section()).toBeVisible();
      expect(tabs).toContain('payer');
    });

    await steps.step('Look for the Network tab in the tab list - it is absent and cannot be reached directly', async () => {
      const tabs = await view().offeredTabs();
      const direct = await listApprovals(roleHolder.page, 'Network');
      await expect(new ApprovalTabView(roleHolder.page, 'network').tabButton()).toHaveCount(0);
      expect({ tabs: tabs.includes('network'), reachable: API_COUNTS_AS_ACCESS && direct.status < 300 && direct.items.length > 0 },
        `Network tab offered: ${tabs.join(', ')}; GetApprovals (Network) through the reviewer answered ${direct.status} with ${direct.items.length} pending`).toEqual({ tabs: false, reachable: false });
    });
  });

  test(`TC-${CASES.generalNoTab.azureId}: should keep the Network tab away from a reviewer holding the general approve / reject rights but no Network tab`, async ({ steps, suiteRoles, roleHolder, roleAdmin }) => {
    let role!: SuiteRole;
    let tabs: string[] = [];

    await steps.critical('Precondition: the reviewer\'s role has the general Approve / Reject a Submission rights and no Network tab', async () => {
      role = await becomeReviewer(suiteRoles, roleHolder, { label: 'general no tab', rights: ROLE_RIGHTS.generalNoNetwork });
      expect(role.rights).not.toContain(tabKey('Network'));
    });

    await steps.step('Navigate to the Role Management module - the general Approve / Reject rights are enabled and the Network tab is disabled', async () => {
      const seen = await readRoleOnScreen(roleAdmin, role);
      expect(seen.listed).toBe(true);
      expect(treeMismatch(treePicture(seen.rows, [GENERAL.approve, GENERAL.reject, oneKey('Network'), allKey('Network')]), picture([
        [GENERAL.approve, GENERAL_LABEL[GENERAL.approve], 'checked'],
        [GENERAL.reject, GENERAL_LABEL[GENERAL.reject], 'checked'],
        [oneKey('Network'), ACTION_LABEL.one, 'unchecked'],
        [allKey('Network'), ACTION_LABEL.all, 'unchecked'],
      ])), TREE_DIFF).toBe('');
    });

    await steps.step('Log in as the reviewer and open Approval Management - the screen loads', async () => {
      const view = new ApprovalTabView(roleHolder.page, 'payer');
      tabs = await view.openHub();
      await expect(view.navEntry()).toBeVisible();
      expect(tabs.length, 'module tabs offered to the reviewer').toBeGreaterThan(0);
    });

    await steps.step('Check the tab list - the Network tab does not appear and its requests cannot be reached', async () => {
      const direct = await listApprovals(roleHolder.page, 'Network');
      await expect(new ApprovalTabView(roleHolder.page, 'network').tabButton()).toHaveCount(0);
      expect({ tabs: tabs.includes('network'), reachable: API_COUNTS_AS_ACCESS && direct.status < 300 && direct.items.length > 0 },
        `tabs offered: ${tabs.join(', ')}; GetApprovals (Network) through the reviewer answered ${direct.status} with ${direct.items.length} pending`).toEqual({ tabs: false, reachable: false });
    });
  });

  test(`TC-${CASES.pendingCount.azureId}: should show the pending approval count only to a reviewer holding View Pending Approval Count`, async ({ steps, suiteRoles, roleHolder, roleAdmin }) => {
    let withCount!: SuiteRole;
    let withoutCount!: SuiteRole;
    const view = (): ApprovalTabView => new ApprovalTabView(roleHolder.page, 'payer');

    await steps.critical('Precondition: two reviewer roles - one with View Pending Approval Count, one without', async () => {
      withoutCount = await suiteRoles.create({ label: 'no count', rights: ROLE_RIGHTS.countOff });
      withCount = await becomeReviewer(suiteRoles, roleHolder, { label: 'count', rights: ROLE_RIGHTS.countOn });
      expect(withCount.rights).toContain(GENERAL.count);
    });

    await steps.step('Navigate to the Role Management module - the permission state of each role is shown', async () => {
      const on = await readRoleOnScreen(roleAdmin, withCount);
      const off = await readRoleOnScreen(roleAdmin, withoutCount);
      const diffOn = treeMismatch(treePicture(on.rows, [GENERAL.count]), picture([[GENERAL.count, GENERAL_LABEL[GENERAL.count], 'checked']]));
      const diffOff = treeMismatch(treePicture(off.rows, [GENERAL.count]), picture([[GENERAL.count, GENERAL_LABEL[GENERAL.count], 'unchecked']]));
      expect([diffOn && `role with the count: ${diffOn}`, diffOff && `role without it: ${diffOff}`].filter(Boolean).join(' | '), TREE_DIFF).toBe('');
    });

    await steps.step('Log in as the reviewer WITH the permission and open the Approvals menu - a count badge shows the number of pending approvals', async () => {
      await view().openHub();
      const count = await pendingCount(roleHolder.page);
      expect(count.status, 'GetPendingApprovalCount through the reviewer').toBe(200);
      await expect(view().navEntry(), `the Approvals menu entry should show the pending count ${count.count}`).toContainText(String(count.count));
    });

    await steps.step('Log out and log in as the reviewer WITHOUT the permission, open the Approvals menu - no pending count badge', async () => {
      await roleHolder.reshape({ role: withoutCount });
      await roleHolder.signInAgain();
      await view().openHub();
      await expect(view().navEntry()).toBeVisible();
      await expect(view().navEntry(), 'the Approvals menu entry of a reviewer without View Pending Approval Count').not.toContainText(/\d/);
    });
  });

  test(`TC-${CASES.sixModules.azureId}: should list independent tab, one-at-a-time and bulk permissions for each of the six approval modules`, async ({ steps, suiteRoles, roleAdmin }) => {
    const groupKeys = APPROVAL_MODULES.map((m) => m.key);
    const check = async (index: number): Promise<string> => {
      const m = APPROVAL_MODULES[index];
      const module = m.key.split('.')[1];
      const seen = await inspectApprovalModule(roleAdmin, module, groupKeys.filter((k) => k !== m.key));
      await expect(roleAdmin.form.tree.searchInput()).toBeVisible();
      const rows = treeMismatch(seen.rows, { [m.key]: m.label, [oneKey(module)]: ACTION_LABEL.one, [allKey(module)]: ACTION_LABEL.all });
      const others = seen.othersChanged.length ? `ticking ${m.key} also changed ${seen.othersChanged.join(', ')}` : '';
      return [rows, others].filter(Boolean).join(' | ');
    };

    await steps.step('Navigate to the Role Management module - the screen loads', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
    });

    await steps.critical('Open a role\'s permission configuration (Add Role > Privileges, never saved) and locate the Payer section - the Payer tab with its one-at-a-time and bulk options are listed', async () => {
      await openAddPrivileges(roleAdmin, suiteRoles, PREDEFINED_ROLES.organizationAdministrator.en);
      const diff = await check(0);
      expect(diff, TREE_DIFF).toBe('');
    });

    await steps.step('Repeat for Network - its own tab, one-at-a-time and bulk options', async () => {
      const diff = await check(1);
      expect(diff, TREE_DIFF).toBe('');
    });

    await steps.step('Repeat for Plan - its own tab, one-at-a-time and bulk options', async () => {
      const diff = await check(2);
      expect(diff, TREE_DIFF).toBe('');
    });

    await steps.step('Repeat for Policy - its own tab, one-at-a-time and bulk options', async () => {
      const diff = await check(3);
      expect(diff, TREE_DIFF).toBe('');
    });

    await steps.step('Repeat for Formulary - its own tab, one-at-a-time and bulk options', async () => {
      const diff = await check(4);
      expect(diff, TREE_DIFF).toBe('');
    });

    await steps.step('Repeat for Registration - its own tab, tied to the invitation-specific general permissions', async () => {
      const diff = await check(5);
      const rows = await roleAdmin.form.tree.rowsByKey();
      const invitation = treeMismatch(treePicture(rows, [INVITATION.approve, INVITATION.reject]), picture([
        [INVITATION.approve, INVITATION_LABEL[INVITATION.approve], 'unchecked'],
        [INVITATION.reject, INVITATION_LABEL[INVITATION.reject], 'unchecked'],
      ]));
      await roleAdmin.form.close('x');
      await expect(roleAdmin.form.titleLocator()).toBeHidden();
      expect(rows.has(INVITATION.view), `the ${INVITATION.view} row in the tree`).toBe(true);
      expect([diff, invitation].filter(Boolean).join(' | '), TREE_DIFF).toBe('');
    });
  });

  test(`TC-${CASES.registration.azureId}: should govern registration approvals by View Invitation Approvals, Approve Invitation and Reject Invitation`, async ({ steps, suiteRoles, roleHolder, roleAdmin, page }) => {
    let role!: SuiteRole;
    let email = '';
    let rowId = '';
    const view = (): ApprovalTabView => new ApprovalTabView(roleHolder.page, 'invitation');

    await steps.step('Navigate to the Role Management module - View Invitation Approvals and Approve Invitation are enabled for the reviewer\'s role', async () => {
      role = await suiteRoles.create({ label: 'registrations', rights: ROLE_RIGHTS.registration });
      const seen = await readRoleOnScreen(roleAdmin, role);
      expect(seen.listed).toBe(true);
      // GetInvitationApprovals is a BRANCH whose box shows its descendants (foundation), so only its LABEL is compared.
      const viewLabel = { [INVITATION.view]: seen.rows.get(INVITATION.view)?.label ?? '(not rendered)' };
      expect(treeMismatch({ ...treePicture(seen.rows, [INVITATION.approve, INVITATION.reject]), ...viewLabel }, {
        ...picture([
          [INVITATION.approve, INVITATION_LABEL[INVITATION.approve], 'checked'],
          [INVITATION.reject, INVITATION_LABEL[INVITATION.reject], 'checked'],
        ]),
        [INVITATION.view]: INVITATION_LABEL[INVITATION.view],
      }), TREE_DIFF).toBe('');
    });

    await steps.critical('Precondition: a registration submitted by another user waits for approval', async () => {
      passGate(steps, REGISTRATION_GATE);
      const pending = await pendingSuiteRegistrations(page);
      requireData(steps, pending.length > 0, 'no suite registration is waiting for approval');
      email = pending[0];
      await roleHolder.become({ role });
      expect(email).not.toBe('');
    });

    await steps.step('Log in as the reviewer and open Approval Management > Registration tab - the pending invitation request is shown', async () => {
      await view().openTab();
      rowId = await view().findRow(email);
      expect(rowId, `the registration of ${email} on the reviewer's Registrations tab`).not.toBe('');
    });

    await steps.step('Click Approve on the invitation row - a confirmation prompt is shown', async () => {
      const prompt = await openPrompt(roleHolder.page, view().rowAction(rowId, 'approve'));
      expect(prompt.dialogShown, `no prompt (toast "${prompt.toast}")`).toBe(true);
    });

    await steps.step('Confirm the approval - the invitation is approved and leaves the pending list', async () => {
      const out = await confirmPrompt(roleHolder.page, 'approve');
      expect(await view().findRow(email), `answers: ${out.answers.join(' | ')}`).toBe('');
    });

    await steps.step('Remove Approve Invitation from the role and log in again to the Registration tab - Approve is no longer offered', async () => {
      await suiteRoles.setRights(role.id, ROLE_RIGHTS.registration.filter((k) => k !== INVITATION.approve));
      await roleHolder.signInAgain();
      await view().openTab();
      const first = await view().firstRowId();
      await expect(view().rowAction(first, 'approve')).toHaveCount(0);
      expect(await heldKeys(page, role.id)).not.toContain(INVITATION.approve);
    });
  });
});
