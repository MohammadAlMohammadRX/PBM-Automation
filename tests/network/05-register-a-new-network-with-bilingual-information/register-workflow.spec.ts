import { test, expect } from '../../../fixtures';
import type { NetworkFormDialog, SaveOutcome } from '../../../pages/network/NetworkFormDialog';
import { NETWORK_LIFECYCLE, NETWORK_TOAST } from '../../../data/networks/network.data';
import { FLOW_FACILITY, HOLD_MS, JOB_WAIT_MS, PERMANENT_CODE } from '../../../data/networks/networkForm.data';
import { APPROVAL_CELL, DENIED_STATUSES, REGISTER } from '../../../data/networks/registerNetwork.data';

/**
 * User story 14122: Register a new network with bilingual information.
 * The registration WORKFLOW - draft, send for approval, approve or reject -
 * and who may register at all.
 *
 * Maker-checker throughout: Save stores a private draft; a facility is
 * assigned on the detail screen (the form has none); Send for Approval routes
 * it to the Network tab of the approvals hub; approval issues the permanent
 * code and the lifecycle job (every minute here) sets the status.
 */
test.describe('US 14122 - Registration workflow', () => {
  test(`TC-${REGISTER.approvedActive.azureId}: should register, approve and activate a network when its bilingual details are valid and it is effective today`, async ({
    networkManagementPage,
    networkApprovalsPage,
    toast,
    steps,
    cleanup,
  }) => {
    test.setTimeout(20 * 60_000);
    const data = REGISTER.approvedActive.build();
    let form!: NetworkFormDialog;
    let saved: SaveOutcome = null;

    await steps.critical('Navigate to the Network Management module - the Register (Add Network) action is offered', async () => {
      await networkManagementPage.openList();
      expect(await networkManagementPage.isAddOffered(), 'Add Network should be offered').toBe(true);
    });

    await steps.critical('The English and Arabic names are accepted without validation errors', async () => {
      form = await networkManagementPage.openAddForm();
      await form.fillBasicInformation(data);
      expect(await form.readFieldError('nameEn'), 'English name error').toBe('');
      expect(await form.readFieldError('nameAr'), 'Arabic name error').toBe('');
    });

    await steps.critical('Descriptions, the owning payer and an effective date of today are accepted', async () => {
      expect(await form.getPayerTag(), 'the owning payer should be shown').not.toBe('');
      await form.next();
      await form.fillEffectivePeriod(data);
      expect(await form.readFieldError('effectiveDate'), 'effective date error').toBe('');
      expect(await form.readFieldError('expiryDate'), 'expiry date error').toBe('');
    });

    await steps.critical('Saving stores the registration as a private draft', async () => {
      const report = await form.saveNewAndReport();
      saved = report.outcome;
      cleanup.register(() => form.discardCreated(saved));
      expect(report.created, `the draft should save: ${report.text}`).toBe(true);
      await toast.expectText(NETWORK_TOAST.savedAsDraft);
      expect((await networkManagementPage.readRow(data.nameEn)).approvalStatus).toMatch(APPROVAL_CELL.draft);
    });

    await steps.critical('With a pharmacy assigned, Send for Approval moves it to Pending Approval', async () => {
      const detail = await networkManagementPage.openDetails(data.nameEn);
      const assigned = await detail.facilities().assign([FLOW_FACILITY]);
      expect(assigned?.status ?? 0, `the facility should be assigned: ${assigned?.text.slice(0, 200)}`).toBeLessThan(300);
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(data.nameEn);
      expect((await networkManagementPage.readRow(data.nameEn)).approvalStatus).toMatch(APPROVAL_CELL.pending);
    });

    await steps.critical('The reviewer approves the registration', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.expectInQueue(data.nameEn);
      await networkApprovalsPage.approve(data.nameEn);
    });

    await steps.step('A permanent network code is issued and the network becomes Active', async () => {
      await networkManagementPage.waitForStatus(data.nameEn, NETWORK_LIFECYCLE.active, JOB_WAIT_MS);
      expect(await networkManagementPage.readCode(data.nameEn), 'the permanent code issued at approval').toMatch(PERMANENT_CODE);
    });
  });

  test(`TC-${REGISTER.approvedFuture.azureId}: should set an approved registration to Pending when its effective date has not arrived`, async ({
    networkManagementPage,
    networkApprovalsPage,
    steps,
    cleanup,
  }) => {
    test.setTimeout(15 * 60_000);
    const data = REGISTER.approvedFuture.build();
    let saved: SaveOutcome = null;

    await steps.critical('Navigate to the Network Management module - Add Network is offered', async () => {
      await networkManagementPage.openList();
      expect(await networkManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical('A registration effective 30 days ahead, with a pharmacy, saves as a draft', async () => {
      const form = await networkManagementPage.openAddForm();
      await form.fill(data);
      const report = await form.saveNewAndReport();
      saved = report.outcome;
      cleanup.register(() => form.discardCreated(saved));
      expect(report.created, report.text).toBe(true);
      const detail = await networkManagementPage.openDetails(data.nameEn);
      expect((await detail.facilities().assign([FLOW_FACILITY]))?.status ?? 0).toBeLessThan(300);
    });

    await steps.critical('Send for Approval moves it to Pending Approval', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(data.nameEn);
      expect((await networkManagementPage.readRow(data.nameEn)).approvalStatus).toMatch(APPROVAL_CELL.pending);
    });

    await steps.critical('The reviewer approves it', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.approve(data.nameEn);
    });

    await steps.step('The approved network reads Pending, not Active', async () => {
      expect(await networkManagementPage.readStatus(data.nameEn)).toBe(NETWORK_LIFECYCLE.pending);
    });
  });

  test(`TC-${REGISTER.rejected.azureId}: should issue no network code and keep the record editable by its author when a registration is rejected`, async ({
    networkManagementPage,
    networkApprovalsPage,
    steps,
    cleanup,
  }) => {
    test.setTimeout(12 * 60_000);
    const data = REGISTER.rejected.build();
    let saved: SaveOutcome = null;

    await steps.critical('Navigate to the Network Management module - Add Network is offered', async () => {
      await networkManagementPage.openList();
      expect(await networkManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical('A valid registration is sent for approval - it reads Pending Approval', async () => {
      const form = await networkManagementPage.openAddForm();
      await form.fill(data);
      const report = await form.saveNewAndReport();
      saved = report.outcome;
      cleanup.register(() => form.discardCreated(saved));
      expect(report.created, report.text).toBe(true);
      const detail = await networkManagementPage.openDetails(data.nameEn);
      expect((await detail.facilities().assign([FLOW_FACILITY]))?.status ?? 0).toBeLessThan(300);
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(data.nameEn);
      expect((await networkManagementPage.readRow(data.nameEn)).approvalStatus).toMatch(APPROVAL_CELL.pending);
    });

    await steps.critical('The reviewer rejects it - it reads Rejected', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.reject(data.nameEn);
      expect((await networkManagementPage.readRow(data.nameEn)).approvalStatus).toMatch(APPROVAL_CELL.rejected);
    });

    await steps.step('No permanent network code is present on the rejected record', async () => {
      expect(await networkManagementPage.readCode(data.nameEn), 'a rejected registration must not consume a code').not.toMatch(PERMANENT_CODE);
    });

    await steps.step('The author still sees the record and can edit it', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(data.nameEn);
      expect(await networkManagementPage.getRowActionAvailability(data.nameEn, 'edit')).toBe('available');
    });
  });

  test(`TC-${REGISTER.inactivePayer.azureId}: should set an approved registration to Pending when its owning payer is inactive`, async ({
    networkManagementPage,
    networkDetailPage,
    networkIn,
    inactivePayer,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);

    await steps.critical('Navigate to the Network Management module', async () => {
      await networkManagementPage.openList();
      expect(await networkManagementPage.isAddOffered()).toBe(true);
    });

    // The form only offers the top-bar scope payer, and the scope selector
    // lists active payers only - so the registration for an INACTIVE payer is
    // made through the same API the form calls (create, facility, submit,
    // approve), effective now.
    const network = await networkIn('Pending', { payerName: inactivePayer.nameEn, effectiveInMinutes: 1 });

    await steps.step('The approved network with an inactive payer reads Pending, not Active', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.expectStatus(NETWORK_LIFECYCLE.pending);
    });

    await steps.step('It stays Pending once its effective date has passed and the job has run', async () => {
      await networkDetailPage.expectStatusHeldFor(network.id, NETWORK_LIFECYCLE.pending, HOLD_MS);
    });
  });

  test(`TC-${REGISTER.codeOnlyAtApproval.azureId}: should generate a network code only at approval and never for draft, pending or rejected registrations`, async ({
    networkManagementPage,
    networkApprovalsPage,
    steps,
    cleanup,
  }) => {
    test.setTimeout(20 * 60_000);
    const rejected = REGISTER.rejected.build();
    const approved = REGISTER.approvedActive.build();
    const outcomes: SaveOutcome[] = [];

    await steps.critical('Navigate to the Network Management module - Add Network is offered', async () => {
      await networkManagementPage.openList();
      expect(await networkManagementPage.isAddOffered()).toBe(true);
    });

    await steps.step('A saved draft has no permanent code', async () => {
      const form = await networkManagementPage.openAddForm();
      await form.fill(rejected);
      const report = await form.saveNewAndReport();
      outcomes.push(report.outcome);
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.created, report.text).toBe(true);
      expect(await networkManagementPage.readCode(rejected.nameEn)).not.toMatch(PERMANENT_CODE);
    });

    await steps.step('A registration pending approval has no permanent code', async () => {
      const detail = await networkManagementPage.openDetails(rejected.nameEn);
      expect((await detail.facilities().assign([FLOW_FACILITY]))?.status ?? 0).toBeLessThan(300);
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(rejected.nameEn);
      expect(await networkManagementPage.readCode(rejected.nameEn)).not.toMatch(PERMANENT_CODE);
    });

    await steps.step('A rejected registration has no permanent code', async () => {
      await networkApprovalsPage.open();
      await networkApprovalsPage.reject(rejected.nameEn);
      expect(await networkManagementPage.readCode(rejected.nameEn)).not.toMatch(PERMANENT_CODE);
    });

    await steps.step('An approved registration is given a unique permanent code', async () => {
      await networkManagementPage.openList();
      const form = await networkManagementPage.openAddForm();
      await form.fill(approved);
      const report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.created, report.text).toBe(true);
      const detail = await networkManagementPage.openDetails(approved.nameEn);
      expect((await detail.facilities().assign([FLOW_FACILITY]))?.status ?? 0).toBeLessThan(300);
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(approved.nameEn);
      await networkApprovalsPage.open();
      await networkApprovalsPage.approve(approved.nameEn);
      const code = await networkManagementPage.readCode(approved.nameEn);
      expect(code, 'the approved registration should carry a permanent code').toMatch(PERMANENT_CODE);
      expect(code, 'and it must differ from the rejected one').not.toBe(await networkManagementPage.readCode(rejected.nameEn));
    });
  });

  test(`TC-${REGISTER.draftThenSubmit.azureId}: should keep a saved registration as an editable private draft until it is sent for approval`, async ({
    networkManagementPage,
    networkDetailPage,
    steps,
    cleanup,
  }) => {
    test.setTimeout(12 * 60_000);
    const data = REGISTER.rejected.build();
    const newDescription = REGISTER.draftThenSubmit.editedArabicDescription();
    let networkId = '';

    await steps.critical('Navigate to the Network Management module - Add Network is offered', async () => {
      await networkManagementPage.openList();
      expect(await networkManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical('Saving (not sending) stores a private draft', async () => {
      const form = await networkManagementPage.openAddForm();
      await form.fill(data);
      const report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      networkId = form.createdId(report.outcome);
      expect(report.created, report.text).toBe(true);
      expect((await networkManagementPage.readRow(data.nameEn)).approvalStatus).toMatch(APPROVAL_CELL.draft);
    });

    await steps.critical('After navigating away, the draft is retrievable and editable', async () => {
      await networkManagementPage.openList();
      const form = await networkManagementPage.openEditForm(data.nameEn);
      expect(await form.readField('nameEn')).toBe(data.nameEn);
      await form.editField('descriptionAr', newDescription);
      const report = await form.saveEditAndReport();
      expect(report.created, `the edit should save: ${report.text}`).toBe(true);
    });

    await steps.step('The updated Arabic description is saved on the draft', async () => {
      await networkDetailPage.open(networkId);
      expect(await networkDetailPage.readOverviewField('descriptionAr')).toBe(newDescription);
    });

    await steps.step('Send for Approval moves it to Pending Approval', async () => {
      expect((await networkDetailPage.facilities().assign([FLOW_FACILITY]))?.status ?? 0).toBeLessThan(300);
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(data.nameEn);
      expect((await networkManagementPage.readRow(data.nameEn)).approvalStatus).toMatch(APPROVAL_CELL.pending);
    });
  });

  test(`TC-${REGISTER.creatorVisibility.azureId}: should show an administrator's network to every user and a Payer Admin's network only to its payer`, async ({
    networkManagementPage,
    nonAdminSession,
    steps,
    cleanup,
  }) => {
    test.setTimeout(15 * 60_000);
    const byAdmin = REGISTER.creatorVisibility.byAdmin();
    const byPayerAdmin = REGISTER.creatorVisibility.byPayerAdmin();
    cleanup.register(() => networkManagementPage.discardDraftNetwork(byAdmin.nameEn));
    cleanup.register(() => networkManagementPage.discardDraftNetwork(byPayerAdmin.nameEn));
    let adminPayer = '';
    let payerAdminPayer = '';

    await steps.critical('As the System Administrator, create a network - it is in the administrator\'s list', async () => {
      await networkManagementPage.openList();
      const form = await networkManagementPage.openAddForm();
      await form.fill(byAdmin);
      adminPayer = await form.getOwningPayer();
      const report = await form.saveNewAndReport();
      expect(report.created, report.text).toBe(true);
      await networkManagementPage.openList();
      await networkManagementPage.search(byAdmin.nameEn);
      expect(await networkManagementPage.isRowVisible(byAdmin.nameEn), 'the administrator should see the network').toBe(true);
    });

    await steps.step('The Payer Admin sees the administrator\'s network too - it is visible to every user', async () => {
      await nonAdminSession.networks.openList();
      await nonAdminSession.networks.search(byAdmin.nameEn);
      expect(await nonAdminSession.networks.isRowVisible(byAdmin.nameEn), 'a network the System Administrator created should appear for every user').toBe(true);
    });

    await steps.critical('As the Payer Admin, create a network for the payer chosen in the payer dropdown - it is in the Payer Admin\'s list', async () => {
      await nonAdminSession.networks.openList();
      const form = await nonAdminSession.networks.openAddForm();
      // The payer first: step 1 does not let this user move on without one.
      payerAdminPayer = await form.chooseOwningPayer();
      await form.fill(byPayerAdmin);
      expect(payerAdminPayer, 'the form should name the payer chosen in the payer dropdown').not.toBe('');
      const report = await form.saveNewAndReport();
      expect(report.created, report.text).toBe(true);
      await nonAdminSession.networks.openList();
      await nonAdminSession.networks.search(byPayerAdmin.nameEn);
      expect(await nonAdminSession.networks.isRowVisible(byPayerAdmin.nameEn), 'the Payer Admin should see the network').toBe(true);
    });

    await steps.step('The administrator, working on another payer, does not see the Payer Admin\'s network', async () => {
      expect(adminPayer, 'the administrator should be working on a different payer than the Payer Admin').not.toBe(payerAdminPayer);
      await networkManagementPage.openListFor(REGISTER.creatorVisibility.adminWorkingPayer());
      await networkManagementPage.search(byPayerAdmin.nameEn);
      expect(
        await networkManagementPage.isRowVisible(byPayerAdmin.nameEn),
        `a Payer Admin's network belongs to "${payerAdminPayer}" and should not appear under "${adminPayer}"`,
      ).toBe(false);
    });
  });

  test(`TC-${REGISTER.registrationRole.azureId}: should offer and allow registration only to a role holding the network registration right`, async ({
    networkManagementPage,
    shapedNonAdmin,
    requireBaseline,
    steps,
  }) => {
    await steps.critical('Navigate to the module as an administrator - Add Network is offered and enabled', async () => {
      await networkManagementPage.openList();
      const offered = await networkManagementPage.isAddOffered();
      requireBaseline(offered, 'the Add Network action for a session holding CreateNetwork');
      expect(offered).toBe(true);
    });

    const session = await shapedNonAdmin({ without: ['createNetwork'] });
    const attempt = REGISTER.rejected.build();

    await steps.critical('A role without the right loads the module', async () => {
      await session.networks.openList();
    });

    await steps.step('Add Network is hidden or disabled for that role', async () => {
      expect(await session.networks.isAddOffered(), 'Add Network must not be offered without CreateNetwork').toBe(false);
    });

    await steps.step('A direct registration request from that role is refused', async () => {
      const answer = await session.networks.createNetworkDirect({
        nameEn: attempt.nameEn,
        nameAr: attempt.nameAr,
        type: 'HMO',
        effectiveIso: new Date(Date.now() + 10 * 60_000).toISOString(),
        expiryIso: new Date(Date.now() + 365 * 24 * 3_600_000).toISOString(),
      });
      expect(DENIED_STATUSES as readonly number[], `CreateNetwork answered ${answer.status} ${answer.text.slice(0, 200)}`).toContain(answer.status);
    });
  });
});

