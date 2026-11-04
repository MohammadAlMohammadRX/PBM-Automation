import { test, expect, SCOPED_POLICY_PAYER, asSession, controlAvailability, policyImportFile, refused, type PolicySession } from '../../../utils/policy/writerCHelpers';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { POLICY_EXPORT, POLICY_LIST } from '../../../constants/ElementIds';
import { CASES } from '../../../data/policy/policyPermissionCases.data';
import { POLICY_RIGHT } from '../../../data/policy/policyPermissions.data';
import { SUITE_POLICY_PREFIX } from '../../../data/policy/policy.data';
import {
  findPolicyByName,
  minutesFromNow,
  policyDateText,
  policyStamp,
  policyStatusCode,
  publishPolicyChange,
  readPolicyOrNull,
  readPolicyVersions,
  suitePolicyPlan,
} from '../../../utils/PolicyProvisioning';

/**
 * User story 15189: Policy Permissions - the ACTION permissions (Send for
 * Approval, Activate, Inactivate, Delete, Clone, View, Import, Export), each
 * granted or withheld on its own and enforced on screen and on the server.
 * The Payer Admin role is shaped per case (fixture `policyRole`,
 * data/policy/policyPermissionCases.data.ts); every policy belongs to a payer in
 * that account's scope, so only the permission can explain what it is offered.
 * A "control is absent" step baselines first: the administrator (who holds
 * every right) is shown the control on the same policy.
 */
test.describe('US 15189 - Policy Permissions - actions', () => {
  test.describe.configure({ timeout: 20 * 60_000 });

  test(`TC-${CASES.activateOnly.azureId}: should let a user holding only the Activate permission activate a policy and nothing else`, async ({
    page,
    policyManagementPage,
    policyIn,
    policyRole,
    requirePolicyListAccess,
    steps,
  }) => {
    // Effective in two minutes (2026-11-04), not the default two days: a policy
    // activated before its effective date rightly reads Future, so "changes to
    // Active" is only checkable on a policy whose coverage period has begun.
    const policy = await policyIn('Inactive', { payerName: SCOPED_POLICY_PAYER, effectiveInMinutes: 2 });
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      session = await policyRole.signIn(CASES.activateOnly.shape);
      await requirePolicyListAccess(session);
      await session.policies.open();
      expect(await session.policies.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Open the inactive policy and click Activate - the policy status changes to Active', async () => {
      await session.detail.open(policy.id);
      expect(await session.detail.getStatus()).toMatch(/Inactive/);
      const answer = await session.detail.activate();
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
      // The activation is staged: the administrator sends and approves it before the status is read
      // (once the effective time has passed, so Active is the only right answer).
      const untilEffective = Date.parse(policy.effectiveDate) - Date.now();
      if (untilEffective > 0) await page.waitForTimeout(untilEffective + 5_000);
      await publishPolicyChange(page, policy.id, policy.nameEn);
      expect(await policyStatusCode(page, policy.id)).toBe('active');
    });

    await steps.step('Attempt Delete, Clone, Inactivate, Send for Approval, Import and Export on the same policy - each is unavailable or blocked', async () => {
      await session.detail.open(policy.id);
      const actions = await session.detail.readActionStates();
      const offered: string[] = (['delete', 'clone', 'inactivate', 'submit'] as const).filter((a) => actions[a].availability === 'available');
      await session.policies.open();
      if ((await controlAvailability(session.page, POLICY_LIST.importTrigger)) === 'available') offered.push('import');
      if ((await controlAvailability(session.page, POLICY_EXPORT.trigger)) === 'available') offered.push('export');
      expect(offered, 'actions offered beyond Activate').toEqual([]);
    });
  });

  test(`TC-${CASES.noDelete.azureId}: should not offer Delete to a user without the Delete permission`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    policyRole,
    requirePolicyListAccess,
    requireBaseline,
    steps,
  }) => {
    const policy = await policyIn('Draft', { payerName: SCOPED_POLICY_PAYER, networks: 0 });
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      await policyDetailPage.open(policy.id);
      requireBaseline((await policyDetailPage.getActionAvailability('delete')) === 'available', 'Delete on a Draft policy');
      session = await policyRole.signIn(CASES.noDelete.shape);
      await requirePolicyListAccess(session);
      await session.policies.open();
      expect(await session.policies.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Open a policy and attempt to delete it - the Delete action is unavailable', async () => {
      await session.detail.open(policy.id);
      expect(await session.detail.getActionAvailability('delete')).not.toBe('available');
    });
  });

  test(`TC-${CASES.viewOnly.azureId}: should show policy details but no modification action to a user holding only the View permission`, async ({
    policyManagementPage,
    policyIn,
    policyRole,
    requirePolicyListAccess,
    steps,
  }) => {
    const policy = await policyIn('Draft', { payerName: SCOPED_POLICY_PAYER, networks: 0 });
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      session = await policyRole.signIn(CASES.viewOnly.shape);
      await requirePolicyListAccess(session);
      await session.policies.open();
      expect(await session.policies.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open a policy to view its details - the policy details are displayed', async () => {
      await session.detail.open(policy.id);
      expect(await session.detail.getName()).toBe(policy.nameEn);
    });

    await steps.step('Attempt any edit or action (Activate, Clone, Delete ...) - no modification action is available', async () => {
      const actions = await session.detail.readActionStates();
      const offered = Object.entries(actions).filter(([, state]) => state.availability === 'available').map(([key]) => key);
      expect(offered, 'modification actions offered').toEqual([]);
    });
  });

  test(`TC-${CASES.noSubmit.azureId}: should not let a user without the Send for Approval permission submit a draft policy`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyIn,
    policyRole,
    requirePolicyListAccess,
    requireBaseline,
    steps,
  }) => {
    const policy = await policyIn('Draft', { payerName: SCOPED_POLICY_PAYER, networks: 0 });
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      await policyDetailPage.open(policy.id);
      requireBaseline((await policyDetailPage.getActionAvailability('submit')) === 'available', 'Send for Approval on a Draft policy');
      session = await policyRole.signIn(CASES.noSubmit.shape);
      await requirePolicyListAccess(session);
      await session.policies.open();
      expect(await session.policies.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Open the draft policy and attempt to send it for approval - Send for Approval is unavailable or blocked', async () => {
      await session.detail.open(policy.id);
      expect(await session.detail.getActionAvailability('submit')).not.toBe('available');
      const direct = await asSession(session.page, 'POST', ApiEndpoints.policySubmit, { policyId: policy.id });
      expect(refused(direct), `a direct submission answered ${direct.status} ${direct.text.slice(0, 200)}`).toBe(true);
      expect((await readPolicyVersions(page, policy.id)).some((v) => v.versionStatusCode === 'pendingApproval'), 'nothing submitted').toBe(false);
    });
  });

  test(`TC-${CASES.cloneOnlyWithRight.azureId}: should let the role holding Clone duplicate a policy and block the role without it`, async ({
    page,
    policyManagementPage,
    policyIn,
    policyRole,
    requirePolicyListAccess,
    discardPolicyNamed,
    steps,
  }) => {
    const data = CASES.cloneOnlyWithRight;
    const policy = await policyIn('Draft', { payerName: SCOPED_POLICY_PAYER, networks: 0 });
    const cloneName = `${SUITE_POLICY_PREFIX} ${data.cloneLabel} ${policyStamp()}`;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('As Role A (Clone granted), select the policy and clone it - a cloned copy of the policy is created', async () => {
      const roleA = await policyRole.signIn(data.withClone);
      await requirePolicyListAccess(roleA);
      await roleA.detail.open(policy.id);
      discardPolicyNamed(cloneName);
      const drawer = await roleA.detail.openClone();
      const answer = await drawer.clone(
        { effectiveDate: policyDateText(minutesFromNow(2 * 24 * 60)), expiryDate: policyDateText(minutesFromNow(60 * 24 * 60)) },
        { nameEn: cloneName },
      );
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
      expect(await findPolicyByName(page, cloneName), 'the clone in the register').not.toBeNull();
    });

    await steps.step('As Role B (Clone withheld), select the same policy and attempt to clone it - the Clone action is unavailable or blocked', async () => {
      const roleB = await policyRole.signIn(data.withoutClone);
      await requirePolicyListAccess(roleB);
      await roleB.detail.open(policy.id);
      expect(await roleB.detail.getActionAvailability('clone')).not.toBe('available');
    });
  });

  test(`TC-${CASES.importOnlyWithRight.azureId}: should let the role holding Import import policies and block the role without it`, async ({
    page,
    policyManagementPage,
    policyIn,
    policyRole,
    requirePolicyListAccess,
    discardPolicyNamed,
    steps,
  }) => {
    const data = CASES.importOnlyWithRight;
    // A policy of the scoped payer, so the Payer Admin's list has the payer's suite plan and a row.
    const anchor = await policyIn('Draft', { payerName: SCOPED_POLICY_PAYER, networks: 0 });
    const importedName = `${SUITE_POLICY_PREFIX} ${data.importLabel} ${policyStamp()}`;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(anchor.nameEn)).toBe(true);
    });

    await steps.step('As Role A (Import granted), import a policy file - the file is imported and the new policy is created', async () => {
      const plan = await suitePolicyPlan(page, SCOPED_POLICY_PAYER);
      const roleA = await policyRole.signIn(data.withImport);
      await requirePolicyListAccess(roleA);
      await roleA.policies.open();
      const template = await roleA.policies.exportTemplate('excel');
      const file = policyImportFile(template.parsed.headers, [
        [/arab|عرب|\(ar\)|name.*ar\b/i, 'وثيقة استيراد'],
        [/name/i, importedName],
        [/type/i, 'Group'],
        [/plan/i, plan.name],
        [/payer/i, SCOPED_POLICY_PAYER],
        [/holder/i, 'Acme Corporation'],
        [/effective/i, policyDateText(minutesFromNow(2 * 24 * 60))],
        [/expir/i, policyDateText(minutesFromNow(60 * 24 * 60))],
        [/grace/i, '0'],
        [/member|limit/i, '10'],
        [/deductible|coinsurance|out.?of.?pocket|sublimit/i, '0'],
      ]);
      discardPolicyNamed(importedName);
      const dialog = await roleA.policies.openImport();
      const answer = await dialog.addFile(file);
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBeLessThan(300);
      await expect.poll(async () => (await findPolicyByName(page, importedName)) !== null, { timeout: 120_000, message: `the imported policy "${importedName}"` }).toBe(true);
    });

    await steps.step('As Role B (Import withheld), attempt to import a policy file - the Import action is unavailable or blocked', async () => {
      const roleB = await policyRole.signIn(data.withoutImport);
      await requirePolicyListAccess(roleB);
      await roleB.policies.open();
      expect(await controlAvailability(roleB.page, POLICY_LIST.importTrigger)).not.toBe('available');
    });
  });

  test(`TC-${CASES.exportOnlyWithRight.azureId}: should let the role holding Export download the policy list and block the role without it`, async ({
    policyManagementPage,
    policyIn,
    policyRole,
    requireBaseline,
    requirePolicyListAccess,
    steps,
  }) => {
    const data = CASES.exportOnlyWithRight;
    const policy = await policyIn('Draft', { payerName: SCOPED_POLICY_PAYER, networks: 0 });

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('As Role A (Export granted), export the policy list - a file with the policy data is downloaded', async () => {
      const roleA = await policyRole.signIn(data.withExport);
      await requirePolicyListAccess(roleA);
      await roleA.policies.openTable();
      // Same gate as folder 17's export cases (2026-11-04): ExportPolicies granted to the
      // Payer Admin role has not reached the account - its menu offers only the template.
      const offered = await roleA.policies.getExportOptions();
      requireBaseline(offered.includes('all'), `Role A offered Export All Data once granted Export (menu offers: ${offered.join(', ') || 'nothing'})`);
      const file = await roleA.policies.exportAndParse('all', 'csv');
      expect(file.filename).not.toBe('');
      expect(file.parsed.rows.length, 'policy rows in the file').toBeGreaterThan(0);
    });

    await steps.step('As Role B (Export withheld), attempt to export the policy list - the Export action is unavailable or blocked', async () => {
      const roleB = await policyRole.signIn(data.withoutExport);
      await requirePolicyListAccess(roleB);
      await roleB.policies.open();
      expect(await controlAvailability(roleB.page, POLICY_EXPORT.trigger)).not.toBe('available');
    });
  });

  test(`TC-${CASES.noPolicyRights.azureId}: should show no policy action or tab to a user holding no policy permission`, async ({
    policyManagementPage,
    policyIn,
    policyRole,
    steps,
  }) => {
    const policy = await policyIn('Draft', { payerName: SCOPED_POLICY_PAYER, networks: 0 });
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module loads (or refuses the user)', async () => {
      await policyManagementPage.openTable();
      session = await policyRole.signIn(CASES.noPolicyRights.shape);
      await session.policies.open();
      expect(session.page.url()).toMatch(/^https?:/);
    });

    await steps.step('Attempt to open the Policy List and any policy record - no accessible actions or tabs are shown', async () => {
      const listed = (await session.policies.canListPolicies()) && (await session.policies.isListed(policy.nameEn).catch(() => false));
      expect(listed, 'the policy is listed to a user with no policy right').toBe(false);
      await session.detail.openExpectingFailure(policy.id);
      if (await session.detail.isLoaded()) {
        const actions = await session.detail.readActionStates();
        expect(Object.entries(actions).filter(([, s]) => s.availability === 'available').map(([k]) => k), 'actions offered').toEqual([]);
        const tabs = Object.keys(await session.detail.readTabs()).filter((t) => t !== 'overview');
        expect(tabs, 'tabs offered').toEqual([]);
      }
    });
  });

  test(`TC-${CASES.revokedWhileSignedIn.azureId}: should block Inactivate on the user's next attempt once the permission is revoked mid-session`, async ({
    policyManagementPage,
    policyIn,
    policyRole,
    requirePolicyListAccess,
    steps,
  }) => {
    const data = CASES.revokedWhileSignedIn;
    const policy = await policyIn('Future', { payerName: SCOPED_POLICY_PAYER });
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      session = await policyRole.signIn(data.granted);
      await requirePolicyListAccess(session);
      await session.policies.open();
      expect(await session.policies.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Confirm the user can currently access Inactivate on the policy - the Inactivate action is available', async () => {
      await session.detail.open(policy.id);
      expect(await session.detail.getActionAvailability('inactivate')).toBe('available');
    });

    await steps.critical('As an administrator, revoke the role\'s Inactivate permission - the permission is removed from the role', async () => {
      // reshape saves the role ("Role updated") or BLOCKS the case with the catalogue's answer.
      const { removed } = await policyRole.reshape(data.revoke);
      expect(removed).toContain(POLICY_RIGHT.inactivate);
    });

    await steps.step('As the affected user, attempt to inactivate the policy again without logging out - the Inactivate action is unavailable or blocked', async () => {
      await session.detail.open(policy.id);
      const availability = await session.detail.getActionAvailability('inactivate');
      let blocked = availability !== 'available';
      let answer = '(not attempted - the control is not offered)';
      if (!blocked) {
        const direct = await asSession(session.page, 'POST', ApiEndpoints.policyInactivate, { id: policy.id, inactivationReasonId: null, inactivationDetails: 'Permission revocation check.', confirmRevertToDraft: true });
        blocked = refused(direct);
        answer = `${direct.status} ${direct.text.slice(0, 200)}`;
      }
      expect(blocked, `Inactivate ${availability}; a direct inactivation answered ${answer}`).toBe(true);
    });
  });

  test(`TC-${CASES.noBypass.azureId}: should reject a direct delete request from a user without the Delete permission`, async ({
    page,
    policyManagementPage,
    policyIn,
    policyRole,
    requirePolicyListAccess,
    steps,
  }) => {
    const policy = await policyIn('Draft', { payerName: SCOPED_POLICY_PAYER, networks: 0 });
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      session = await policyRole.signIn(CASES.noBypass.shape);
      await requirePolicyListAccess(session);
      await session.policies.open();
      expect(await session.policies.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open a policy the user can view - the policy details are displayed', async () => {
      await session.detail.open(policy.id);
      expect(await session.detail.getName()).toBe(policy.nameEn);
    });

    await steps.step('Trigger the delete action directly, bypassing the interface - the system rejects it', async () => {
      const direct = await asSession(session.page, 'DELETE', `${ApiEndpoints.policyDelete}/${policy.id}?confirmRevertToDraft=true`);
      expect(refused(direct), `a direct delete answered ${direct.status} ${direct.text.slice(0, 200)}`).toBe(true);
      expect(await readPolicyOrNull(page, policy.id), 'the policy still exists').not.toBeNull();
    });
  });
});
