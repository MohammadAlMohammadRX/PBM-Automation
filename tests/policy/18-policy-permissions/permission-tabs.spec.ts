import { test, expect, SCOPED_POLICY_PAYER, blockUnless, controlAvailability, freeCandidates, networkSelectUsable, rowControlAvailability, tabDenied, type PolicySession } from '../../../utils/policy/writerCHelpers';
import type { RolePermissionsStep } from '../../../pages/system/RolePermissionsStep';
import { POLICY_MEMBERS, POLICY_NETWORKS } from '../../../constants/ElementIds';
import { ROW_EDIT } from '../../../constants/policy/writerCIds';
import { CASES, REQUIRED_PERMISSIONS } from '../../../data/policy/policyPermissionCases.data';
import { assignableNetworks, policyStamp, samplePdf } from '../../../utils/PolicyProvisioning';

const DATA_CALL = {
  members: /\/GetPolicyMembers$/,
  networks: /\/GetPolicyNetworks$/,
  documents: /\/GetPolicyEndorsements$/,
  versions: /\/GetPolicyVersions\//,
  audit: /\/GetPolicyAuditTrail$/,
} as const;

/**
 * User story 15189: Policy Permissions - the TAB permissions (Members, Network
 * Assignment, Documentation, Version History, Audit History) and the
 * sub-permissions inside the Members, Network Assignment and Documentation
 * tabs, plus the catalogue checklist. The Payer Admin role is shaped per case
 * (fixture `policyRole`); its policies belong to a payer in its scope. A
 * "control is absent" step baselines first on the administrator's screen.
 */
test.describe('US 15189 - Policy Permissions - tabs', () => {
  test.describe.configure({ timeout: 20 * 60_000 });

  for (const [key, tab, label] of [
    ['noMembersTab', 'members', 'Members'],
    ['noVersionsTab', 'versions', 'Version History'],
    ['noAuditTab', 'audit', 'Audit History'],
  ] as const) {
    const data = CASES[key];
    test(`TC-${data.azureId}: should hide or deny the ${label} tab to a user without its permission`, async ({
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
        requireBaseline(await policyDetailPage.hasTab(tab), `the ${label} tab`);
        session = await policyRole.signIn(data.shape);
        await requirePolicyListAccess(session);
        await session.policies.open();
        expect(await session.policies.isListed(policy.nameEn)).toBe(true);
      });

      await steps.critical('Open a policy\'s detail view - the policy detail view loads', async () => {
        await session.detail.open(policy.id);
        expect(await session.detail.getName()).toBe(policy.nameEn);
      });

      await steps.step(`Look for the ${label} tab - it is not visible, or access is denied when it is selected`, async () => {
        const outcome = await tabDenied(session, tab, DATA_CALL[tab]);
        expect(outcome.denied, outcome.how).toBe(true);
      });
    });
  }

  test(`TC-${CASES.membersNoDelete.azureId}: should let a user with member Add and Edit add and edit members but not delete them`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyMembersTab,
    policyIn,
    policyRole,
    requirePolicyListAccess,
    requireBaseline,
    steps,
  }, testInfo) => {
    const policy = await policyIn('Draft', { type: 'individual', members: 1, networks: 0, payerName: SCOPED_POLICY_PAYER });
    const [candidate] = await freeCandidates(page, policy.id, 1);
    blockUnless(testInfo, candidate !== undefined, 'a member the picker offers', 'the member picker offered no further member');
    const existing = policy.members[0].memberCode;
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      await policyDetailPage.open(policy.id);
      await policyMembersTab.open();
      requireBaseline((await policyMembersTab.getRowActionAvailability(existing, 'remove')) === 'available', 'Delete on a member row');
      session = await policyRole.signIn(CASES.membersNoDelete.shape);
      await requirePolicyListAccess(session);
      await session.policies.open();
      expect(await session.policies.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step(`Open the policy's Members tab and add a new member (${candidate.memberCode}) - the member is added to the list`, async () => {
      await session.detail.open(policy.id);
      await session.members.open();
      const drawer = await session.members.openAdd();
      await drawer.search(candidate.documentId); // a full-name search finds nobody (2026-11-03); the document id does
      await drawer.pick(candidate.documentId);
      await drawer.chooseRelationship('Spouse');
      const answer = await drawer.attemptSave();
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
      await session.members.open();
      await expect(session.members.rowOf(candidate.memberCode)).toBeVisible();
    });

    await steps.step('Edit the newly added member\'s details - the changes are saved', async () => {
      expect(await rowControlAvailability(session.members.rowOf(candidate.memberCode), ROW_EDIT.member), 'an Edit action on the member row').toBe('available');
    });

    await steps.step('Attempt to delete a member - the delete action is unavailable or blocked', async () => {
      expect(await session.members.getRowActionAvailability(existing, 'remove')).not.toBe('available');
    });
  });

  test(`TC-${CASES.membersNoImportExport.azureId}: should block importing and exporting members for a user without those permissions`, async ({
    policyManagementPage,
    policyDetailPage,
    policyMembersTab,
    policyIn,
    policyRole,
    requirePolicyListAccess,
    requireBaseline,
    steps,
  }) => {
    const policy = await policyIn('Draft', { type: 'individual', members: 1, networks: 0, payerName: SCOPED_POLICY_PAYER });
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      await policyDetailPage.open(policy.id);
      await policyMembersTab.open();
      requireBaseline((await policyMembersTab.isImportOffered()) && (await policyMembersTab.isExportOffered()), 'the Members tab\'s Import and Export');
      session = await policyRole.signIn(CASES.membersNoImportExport.shape);
      await requirePolicyListAccess(session);
      await session.policies.open();
      expect(await session.policies.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Open the policy\'s Members tab and attempt to import a members file - the import action is unavailable or blocked', async () => {
      await session.detail.open(policy.id);
      await session.members.open();
      expect(await controlAvailability(session.page, POLICY_MEMBERS.importTrigger)).not.toBe('available');
    });

    await steps.step('Attempt to export the members list - the export action is unavailable or blocked', async () => {
      expect(await controlAvailability(session.page, POLICY_MEMBERS.export.trigger)).not.toBe('available');
    });
  });

  test(`TC-${CASES.networksAddExportOnly.azureId}: should allow only adding and exporting network assignments when Edit, Delete and Import are withheld`, async ({
    page,
    policyManagementPage,
    policyDetailPage,
    policyNetworksTab,
    policyIn,
    policyRole,
    requirePolicyListAccess,
    requireBaseline,
    steps,
  }, testInfo) => {
    const policy = await policyIn('Draft', { payerName: SCOPED_POLICY_PAYER, networks: 0 });
    const network = (await assignableNetworks(page, policy.payerId))[0];
    blockUnless(testInfo, network !== undefined, `an active network of "${SCOPED_POLICY_PAYER}"`, 'the payer has no active network to assign');
    let session!: PolicySession;
    let code = '';

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      session = await policyRole.signIn(CASES.networksAddExportOnly.shape);
      await requirePolicyListAccess(session);
      await session.policies.open();
      expect(await session.policies.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical(`Open the policy's Network Assignment tab and add "${network.networkNameEn}" - the assignment is added`, async () => {
      await session.detail.open(policy.id);
      await session.networks.open();
      const answer = await session.networks.assign(network.networkNameEn);
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
      await session.networks.open();
      code = (await session.networks.readRows()).find((r) => r.name === network.networkNameEn)?.code ?? '';
      expect(code).not.toBe('');
    });

    await steps.step('Attempt to edit an existing network assignment - the edit action is unavailable or blocked', async () => {
      expect(await rowControlAvailability(session.networks.rowOf(code), ROW_EDIT.network)).not.toBe('available');
    });

    await steps.step('Attempt to delete a network assignment - the delete action is unavailable or blocked', async () => {
      await policyDetailPage.open(policy.id);
      await policyNetworksTab.open();
      requireBaseline((await policyNetworksTab.getRemoveAvailability(code)) === 'available', 'Delete on a network assignment');
      expect(await rowControlAvailability(session.networks.rowOf(code), POLICY_NETWORKS.remove)).not.toBe('available');
    });

    await steps.step('Attempt to import network assignments - the import action is unavailable or blocked', async () => {
      expect(await controlAvailability(session.page, POLICY_NETWORKS.importTrigger)).not.toBe('available');
    });

    await steps.step('Export the network assignment list - a file with the assignments is downloaded', async () => {
      const file = await session.networks.exportFile('csv');
      expect(file.parsed, `no file came: ${file.messages.join(' | ')}`).not.toBeNull();
      expect(file.parsed!.rows.length).toBeGreaterThan(0);
    });
  });

  test(`TC-${CASES.documentsAddOnly.azureId}: should allow only adding documents when Edit and Delete are withheld`, async ({
    policyManagementPage,
    policyDetailPage,
    policyDocumentsTab,
    policyIn,
    policyRole,
    requirePolicyListAccess,
    requireBaseline,
    steps,
  }) => {
    const policy = await policyIn('Draft', { payerName: SCOPED_POLICY_PAYER, networks: 0 });
    const title = `Automation Permission Document ${policyStamp()}`;
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      session = await policyRole.signIn(CASES.documentsAddOnly.shape);
      await requirePolicyListAccess(session);
      await session.policies.open();
      expect(await session.policies.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the policy\'s Documentation tab and upload a new document - the document is added to the list', async () => {
      await session.detail.open(policy.id);
      await session.documents.open();
      const drawer = await session.documents.openAdd();
      const answer = await drawer.add({ title, type: 'Other', description: 'Added by the permission case.', attachment: samplePdf() });
      expect(answer.status, `${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBe(200);
      await session.documents.open();
      expect(await session.documents.readCard(title), 'the new document card').toBeDefined();
    });

    await steps.step('Attempt to edit an existing document\'s details - the edit action is unavailable or blocked', async () => {
      expect(await session.documents.isEditOffered(title)).toBe(false);
    });

    await steps.step('Attempt to delete a document - the delete action is unavailable or blocked', async () => {
      await policyDetailPage.open(policy.id);
      await policyDocumentsTab.open();
      requireBaseline((await policyDocumentsTab.readCard(title))?.deleteOffered === true, 'Delete on a document card');
      expect((await session.documents.readCard(title))?.deleteOffered).toBe(false);
    });
  });

  test(`TC-${CASES.mixedPartial.azureId}: should give a mixed partial role exactly the granted tabs and actions and block every other one`, async ({
    policyManagementPage,
    policyIn,
    policyRole,
    requirePolicyListAccess,
    steps,
  }) => {
    const policy = await policyIn('Draft', { type: 'individual', members: 1, payerName: SCOPED_POLICY_PAYER, networks: 0 });
    const member = policy.members[0].memberCode;
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      session = await policyRole.signIn(CASES.mixedPartial.shape);
      await requirePolicyListAccess(session);
      await session.policies.open();
      expect(await session.policies.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Log in with View, Members Add and Network Assignment Export only and try each tab and action - each responds according to the permissions', async () => {
      const inconsistent: string[] = [];
      await session.detail.open(policy.id);
      const actions = await session.detail.readActionStates();
      for (const [action, state] of Object.entries(actions)) if (state.availability === 'available') inconsistent.push(`action ${action} offered`);

      if (!(await session.detail.hasTab('members'))) inconsistent.push('Members tab (granted) not offered');
      else {
        await session.members.open();
        if ((await session.members.getAddAvailability()) !== 'available') inconsistent.push('Add Member (granted) not available');
        if ((await session.members.getRowActionAvailability(member, 'remove')) === 'available') inconsistent.push('member Remove offered');
        if ((await controlAvailability(session.page, POLICY_MEMBERS.export.trigger)) === 'available') inconsistent.push('members Export offered');
      }

      if (!(await session.detail.hasTab('networks'))) inconsistent.push('Network Assignment tab (granted) not offered');
      else {
        await session.networks.open();
        if (!(await session.networks.isExportOffered())) inconsistent.push('network Export (granted) not offered');
        if (await networkSelectUsable(session.page)) inconsistent.push('network Assign offered');
      }

      for (const tab of ['documents', 'versions', 'audit'] as const) {
        await session.detail.open(policy.id);
        const outcome = await tabDenied(session, tab, DATA_CALL[tab]);
        if (!outcome.denied) inconsistent.push(`${tab} tab: ${outcome.how}`);
      }
      expect(inconsistent, 'tabs / actions not matching the permissions').toEqual([]);
    });
  });

  test(`TC-${CASES.catalogueChecklist.azureId}: should list every policy action, tab and sub-tab permission as its own independently togglable entry`, async ({
    policyManagementPage,
    policyRole,
    steps,
  }) => {
    let labels: string[] = [];
    let catalogue!: RolePermissionsStep;
    const resolved: Array<{ requirement: string; label: string }> = [];

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.countRows()).toBeGreaterThan(0);
    });

    await steps.critical('Open the role permission configuration for Policy Management - the configurable permissions are listed', async () => {
      catalogue = await policyRole.openCatalogue();
      labels = (await catalogue.getAllLabels()).map((l) => l.replace(/\s*\(\d+\/\d+\)\s*$/, '').trim());
      expect(labels.length).toBeGreaterThan(0);
    });

    await steps.step('Verify each permission of the checklist (actions, tabs, sub-tab actions) is present and independently togglable', async () => {
      const missing: string[] = [];
      for (const [group, entries] of Object.entries(REQUIRED_PERMISSIONS)) {
        for (const [requirement, candidates] of Object.entries(entries)) {
          const label = candidates.find((c) => labels.includes(c));
          if (label === undefined) missing.push(`${group} / ${requirement} (${candidates.join(' | ')})`);
          else if (!resolved.some((r) => r.label === label)) resolved.push({ requirement: `${group} / ${requirement}`, label });
        }
      }
      // Toggled and toggled back, never saved: the role is unchanged.
      const notIndependent: string[] = [];
      for (const { requirement, label } of resolved) {
        const before = await catalogue.isPermissionChecked(label);
        const others = await Promise.all(resolved.filter((r) => r.label !== label).map(async (r) => [r.label, await catalogue.isPermissionChecked(r.label)] as const));
        await catalogue.togglePermission(label);
        const moved: string[] = [];
        for (const [other, was] of others) if ((await catalogue.isPermissionChecked(other)) !== was) moved.push(other);
        await catalogue.togglePermission(label);
        if ((await catalogue.isPermissionChecked(label)) !== before || moved.length > 0) notIndependent.push(`${requirement} "${label}" also moved ${moved.join(', ') || '(itself did not return)'}`);
      }
      expect(missing, 'permissions the checklist needs that the catalogue lacks').toEqual([]);
      expect(notIndependent, 'permissions not independently togglable').toEqual([]);
    });
  });
});
