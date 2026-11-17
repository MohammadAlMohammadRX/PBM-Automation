import { test, expect } from '../../../fixtures';
import { readRole } from '../../../utils/role/roleApi';
import {
  arabicNameFrom,
  choosePayerInForm,
  describeNext,
  holderSubmitsNetwork,
  networkRequestActions,
  nextAndRead,
  payerControlIds,
  withdrawSubmittedNetworks,
} from '../../../utils/role/writerBHelpers';
import { ASSIGNER, CASES, STORY } from '../../../data/role/createRole.data';

/**
 * User story 21288: Create Role - the two role flags. 22088 (TC over AC, lead decision 1): ticking Has Assigned
 * Payers? must offer a payer picker in the drawer and require a payer (the probe saw a plain checkbox - expected to
 * fail). 22089: a role made through Add Role with "Can a user approve their own requests?" left unticked, given to
 * the role holder (maalmohammad), who submits a disposable network and must not be able to approve or reject it
 * while careconnect (another reviewer) can. The request is withdrawn after the test and rejected at teardown.
 */
test.describe(`US ${STORY.id} - ${STORY.title}`, () => {
  test.afterEach(async ({ page }) => {
    await withdrawSubmittedNetworks(page);
  });

  test(`TC-${CASES.hasAssignedPayers.azureId}: should require at least one payer once Has Assigned Payers? is ticked`, async ({ page, steps, suiteRoles, suitePayers, roleAdmin }) => {
    const d = CASES.hasAssignedPayers;
    const payer = { name: '' };

    await steps.critical('Navigate to the Role Management module - the module home page is displayed', async () => {
      payer.name = (await suitePayers.existing(1))[0].name;
      await suiteRoles.watch();
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
    });

    await steps.step('Select Add Role, fill every mandatory Role Information field and tick Has Assigned Payers? - a payer selection control becomes available', async () => {
      const form = await roleAdmin.openAdd();
      await form.fill({ nameEn: suiteRoles.newName(d.label), nameAr: suiteRoles.newArabicName(), allowedToAssignBy: [ASSIGNER.en], hasAssignedPayers: true });
      await expect(form.field('hasAssignedPayers'), 'Has Assigned Payers?').toBeChecked();
      const ids = await payerControlIds(page);
      expect(ids.length, `payer controls in the drawer after ticking Has Assigned Payers? (ids: ${ids.join(', ') || 'none'})`).toBeGreaterThan(0);
    });

    await steps.step('Leave the payer selection empty and try to proceed - the action is blocked until at least one payer is selected', async () => {
      const out = await nextAndRead(page, roleAdmin.form);
      expect(out.step, `the step after Next with no payer chosen (${describeNext(out)})`).toBe(1);
    });

    await steps.step('Select at least one payer (a suite payer) and proceed - the step completes and the role information is accepted', async () => {
      const form = roleAdmin.form;
      await choosePayerInForm(page, form, payer.name);
      const out = await nextAndRead(page, form);
      expect(out.step, `the step after choosing "${payer.name}" (${describeNext(out)})`).toBe(2);
    });
  });

  test(`TC-${CASES.selfApprovalDisabled.azureId}: should stop a holder of a role with self-approval disabled from approving or rejecting its own request`, async ({ page, steps, suiteRoles, suiteApprovals, roleHolder, roleAdmin }) => {
    test.setTimeout(10 * 60_000);
    const d = CASES.selfApprovalDisabled;
    const nameEn = suiteRoles.newName(d.label);
    const role = { id: '' };

    await steps.critical('Navigate to the Role Management module - the module home page is displayed', async () => {
      await suiteRoles.watch();
      const answer = await roleAdmin.open();
      expect(answer.status, 'GetRoles behind the Role Administration list').toBe(200);
    });

    await steps.critical('Create a role with "Can a user approve their own requests?" left unticked and assign it to the test user - the role is saved with the setting disabled', async () => {
      const form = await roleAdmin.openAdd();
      await form.fill({ nameEn, nameAr: arabicNameFrom(d.arabicStem), allowedToAssignBy: [ASSIGNER.en] });
      await expect(form.field('canApproveOwnRequests'), 'Can a user approve their own requests?').not.toBeChecked();
      await form.nextToPrivileges();
      for (const moduleKey of d.modules) await form.tree.tick(moduleKey);
      const out = await form.save();
      expect(out.status ?? 0, `CreateRole answered ${out.status ?? 'nothing (not sent)'} "${out.apiMessage}", toast "${out.toast || 'none'}"`).toBeGreaterThanOrEqual(200);
      expect(out.status ?? 0, `CreateRole answered "${out.apiMessage}"`).toBeLessThan(300);
      role.id = await suiteRoles.adopt(nameEn);
      expect((await readRole(page, role.id))?.canApproveOwnRequests, 'the saved "Can a user approve their own requests?" (GetRole)').toBe(false);
      await roleHolder.become({ role: { roleId: role.id } });
      expect((await roleHolder.currentGrants()).map((g) => g.name), 'the roles the test user holds').toEqual([nameEn]);
    });

    await steps.step('Sign in as the test user, submit a request, then try to approve or reject that same request - the self-approval / rejection is blocked', async () => {
      const me = await roleHolder.permissions();
      expect(me.permissions.filter((p) => (d.approvalRights as readonly string[]).includes(p)).sort(), 'the approval rights the test user holds (so a missing action is the self-approval rule)').toEqual([...d.approvalRights].sort());
      const request = await holderSubmitsNetwork(steps, roleHolder.page, page);
      suiteApprovals.track(request.name);
      const reviewer = await networkRequestActions(page, request.name, true);
      expect(reviewer.actions, `careconnect (another reviewer) on the request "${request.name}" - baseline`).toEqual(expect.arrayContaining(['approve', 'reject']));
      const own = await networkRequestActions(roleHolder.page, request.name, false);
      const offered = own.actions.filter((a) => a === 'approve' || a === 'reject');
      expect(offered, `Approve / Reject offered to the submitter on its own request (row ${own.queued ? `shown with actions ${own.actions.join(', ') || 'none'}` : 'not in its queue'})`).toEqual([]);
    });
  });
});
