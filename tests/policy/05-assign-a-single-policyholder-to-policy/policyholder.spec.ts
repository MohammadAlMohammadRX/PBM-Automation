import { test, expect } from '../../../fixtures';
import type { PolicyFormDrawer } from '../../../pages/policy/PolicyFormDrawer';
import { CASES, HOLDER_LOCKED, HOLDER_REQUIRED, SELF } from '../../../data/policy/policyholder.data';
import { APPROVAL_LABEL, FIELD_MESSAGE, LABEL, OPTIONS, POLICY_SUITE_PAYER, versionBadge } from '../../../data/policy/policy.data';
import {
  policyHolders,
  policyTypeId,
  readPolicy,
  updatePolicyFields,
} from '../../../utils/PolicyProvisioning';
import {
  arabicName,
  attemptSendForApproval,
  createGroupWithoutHolder,
  expectAccepted,
  expectRefused,
  said,
  suitePlanName,
  suitePolicyName,
  validCoverage,
} from '../../../utils/policy/writerBHelpers';

const pendingBadge = versionBadge(0, APPROVAL_LABEL.pending);

/**
 * User story 15172: Assign a Single Policyholder to policy.
 * A Group policy's holder is chosen from the terminology list and required; an
 * Individual policy's holder is the member (Self) and cannot be chosen; the
 * holder changes only while the policy is a Draft. See the data file.
 */
test.describe('US 15172 - Assign a Single Policyholder to policy', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  for (const key of ['noHolderSubmit', 'groupNoHolder'] as const) {
    const data = CASES[key];
    const group = key === 'groupNoHolder';
    test(group
      ? `TC-${data.azureId}: should block submitting a Group policy for approval while no policyholder is selected`
      : `TC-${data.azureId}: should refuse to submit a Draft policy for approval while no policyholder is assigned`, async ({
      policyManagementPage,
      policyDetailPage,
      discardPolicyId,
      page,
      steps,
    }) => {
      const nameEn = suitePolicyName(data.label);
      const created = await createGroupWithoutHolder(page, nameEn);
      const id = created.id ?? steps.blocked(`a Draft Group policy without a policyholder cannot be created: CreatePolicy answered ${said(created)} - the holder is enforced at creation, so the submission rule cannot be reached`);
      discardPolicyId(id);

      await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
        await policyManagementPage.openTable();
        expect(await policyManagementPage.isListed(nameEn)).toBe(true);
      });

      await steps.step(group
        ? 'Open the Draft Group policy with the Policyholder field empty - the field shows no selection'
        : 'Open the Draft policy with no policyholder assigned - the Policyholder field is empty', async () => {
        await policyDetailPage.open(id);
        if (group) expect(await policyDetailPage.readOverviewField('type')).toBe('Group');
        expect(await policyDetailPage.readOverviewField('holder')).toMatch(/^(|—|-)$/);
      });

      await steps.step(group
        ? 'Attempt to submit the policy for approval - a validation error indicates a policyholder must be selected, and submission is blocked'
        : 'Attempt to submit the policy for approval - a validation error says at least one policyholder is required, and the policy remains in Draft', async () => {
        const answer = await attemptSendForApproval(policyDetailPage);
        expectRefused(answer, 'Send for Approval without a policyholder');
        expect(said(answer)).toMatch(HOLDER_REQUIRED);
        const record = await readPolicy(page, id);
        expect({ notLive: record.isPendingCreate, state: record.versionStatusCode }).toEqual({ notLive: true, state: 'draft' });
      });
    });
  }

  test(`TC-${CASES.individualSelf.azureId}: should set the holder of an Individual policy to Self automatically`, async ({
    policyManagementPage,
    steps,
  }) => {
    let drawer!: PolicyFormDrawer;

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical('Create a new policy and select Policy Type = Individual - the Coverage Holder section updates', async () => {
      drawer = await policyManagementPage.openAddForm();
      await drawer.choose('type', 'Individual');
      expect(await drawer.readHolderStatic()).not.toBe('');
    });

    await steps.step('Review the Policyholder field - it is automatically set to "Self" and shows the member as holder', async () => {
      expect(await drawer.readHolderStatic()).toMatch(SELF);
      expect(await drawer.hasField('holder'), 'a holder select for an Individual policy').toBe(false);
      await drawer.close(true);
    });
  });

  test(`TC-${CASES.holderSubmit.azureId}: should submit a Draft policy with a policyholder for approval`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('Draft', { holderName: CASES.holderSubmit.holder });

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Open the Draft policy that has a policyholder assigned - the Policyholder field displays the assigned holder', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.readOverviewField('holder')).toBe(CASES.holderSubmit.holder);
    });

    await steps.step('Submit the policy for approval - the submission succeeds and the policy status changes to Pending Approval', async () => {
      expectAccepted(await attemptSendForApproval(policyDetailPage), 'Send for Approval');
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getVersionBadge()).toBe(pendingBadge);
    });
  });

  test(`TC-${CASES.individualLocked.azureId}: should keep the policyholder of an Individual policy locked to Self`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('Draft', { type: 'individual' });

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Open a policy with Policy Type = Individual - the Policyholder field shows "Self"', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.readOverviewField('holder')).toMatch(SELF);
    });

    await steps.step('Attempt to click or change the Policyholder selection - the field is disabled or read-only', async () => {
      const drawer = await policyDetailPage.openEditDrawer();
      expect(await drawer.isSelectEditable('holder'), 'a holder select on an Individual policy').toBe(false);
      expect(await drawer.readHolderStatic()).toMatch(SELF);
    });
  });

  test(`TC-${CASES.changeInDraft.azureId}: should let the policyholder of a Draft Group policy be changed`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    page,
    steps,
  }) => {
    const data = CASES.changeInDraft;
    const policy = await policyIn('Draft', { holderName: data.from });
    let drawer!: PolicyFormDrawer;

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical(`Open the Draft policy and select the Policyholder field - the current holder (${data.from}) is shown and the field is editable`, async () => {
      await policyDetailPage.open(policy.id);
      drawer = await policyDetailPage.openEditDrawer();
      expect(await drawer.readSelect('holder')).toBe(data.from);
      expect(await drawer.isSelectEditable('holder'), 'the Policyholder select of the Draft\'s Edit drawer should be editable, but it is disabled').toBe(true);
    });

    await steps.step(`Change the selection to ${data.to} and save - the policy now shows ${data.to} as the holder`, async () => {
      await drawer.choose('holder', data.to);
      expect(await drawer.next(), 'Next should open Coverage Period').toBe(true);
      expectAccepted(await drawer.attemptSave());
      expect((await readPolicy(page, policy.id)).policyHolderNames).toBe(data.to);
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.readOverviewField('holder')).toBe(data.to);
    });
  });

  test(`TC-${CASES.groupSelect.azureId}: should require the policyholder of a Group policy to be selected from the list`, async ({
    policyManagementPage,
    steps,
  }) => {
    let drawer!: PolicyFormDrawer;

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical('Create a new policy and select Policy Type = Group - the Policyholder field becomes an enabled, selectable dropdown', async () => {
      drawer = await policyManagementPage.openAddForm();
      await drawer.choose('type', 'Group');
      expect(await drawer.isSelectEditable('holder')).toBe(true);
    });

    await steps.step('Select a policyholder from the dropdown - the selected policyholder is displayed in the field', async () => {
      await drawer.choose('holder', CASES.groupSelect.holder);
      expect(await drawer.readSelect('holder')).toBe(CASES.groupSelect.holder);
      await drawer.close(true);
    });
  });

  test(`TC-${CASES.removeApproved.azureId}: should refuse to remove the policyholder of a policy past Draft`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    page,
    steps,
  }) => {
    const data = CASES.removeApproved;
    const policy = await policyIn('PendingApproval', { holderName: data.holder });

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step(`Open the policy - the Policyholder field displays ${data.holder}`, async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.readOverviewField('holder')).toBe(data.holder);
    });

    await steps.step('Attempt to remove or clear the policyholder - the removal is blocked with a message that it cannot be removed once approved', async () => {
      const answer = await updatePolicyFields(page, policy.id, { policyHolderId: null as unknown as string });
      expectRefused(answer, 'clearing the policyholder');
      expect(said(answer)).toMatch(HOLDER_LOCKED);
      expect((await readPolicy(page, policy.id)).policyHolderNames).toBe(data.holder);
    });
  });

  test(`TC-${CASES.pendingLocked.azureId}: should not let the policyholder change once the policy is no longer a Draft`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    page,
    steps,
  }) => {
    const data = CASES.pendingLocked;
    const policy = await policyIn('PendingApproval', { holderName: data.from });
    let drawer!: PolicyFormDrawer;

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Open the Pending Approval policy and attempt to access the Policyholder field - the field is shown as read-only', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getVersionBadge()).toBe(pendingBadge);
      drawer = await policyDetailPage.openEditDrawer();
      expect(await drawer.isSelectEditable('holder'), 'the holder select of a Pending Approval policy').toBe(false);
    });

    await steps.step('Attempt to select a different policyholder - the action is not permitted and no change is saved', async () => {
      if (await drawer.isSelectEditable('holder').catch(() => false)) {
        await drawer.choose('holder', data.to);
        if (await drawer.next()) await drawer.attemptSave();
      }
      expect((await readPolicy(page, policy.id)).policyHolderNames).toBe(data.from);
    });
  });

  test(`TC-${CASES.typeSwitch.azureId}: should clear the selected policyholder when the policy type changes`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    steps,
  }) => {
    const data = CASES.typeSwitch;
    const policy = await policyIn('Draft', { holderName: data.holder });
    let drawer!: PolicyFormDrawer;

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical(`Open the Draft Group policy with ${data.holder} selected - the field shows ${data.holder}`, async () => {
      await policyDetailPage.open(policy.id);
      drawer = await policyDetailPage.openEditDrawer();
      expect(await drawer.readSelect('holder')).toBe(data.holder);
    });

    await steps.critical('Change the Policy Type from Group to Individual - the Policyholder field resets and is set to Self', async () => {
      expect(await drawer.isSelectEditable('type'), 'the Policy Type select of the Draft\'s Edit drawer should be editable, but it is disabled').toBe(true);
      await drawer.choose('type', 'Individual');
      expect(await drawer.readHolderStatic()).toMatch(SELF);
    });

    await steps.step('Change the Policy Type back to Group - the Policyholder field is empty and must be reselected', async () => {
      await drawer.choose('type', 'Group');
      expect(await drawer.readSelect('holder')).not.toBe(data.holder);
      expect(await drawer.next(), 'Next with no holder reselected').toBe(false);
      expect(await drawer.getFieldError('holder')).toBe(FIELD_MESSAGE.holderRequired);
    });
  });

  test(`TC-${CASES.rulesByType.azureId}: should enforce Self for Individual and a selected holder for Group when a policy is created`, async ({
    policyManagementPage,
    discardPolicyNamed,
    page,
    steps,
  }) => {
    const data = CASES.rulesByType;
    const nameEn = suitePolicyName(data.label);
    const planName = await suitePlanName(page);
    let drawer!: PolicyFormDrawer;

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isAddOffered()).toBe(true);
    });

    await steps.step('Create a policy, set Policy Type = Individual, and attempt to select a policyholder - the selection control is disabled, Self is enforced', async () => {
      drawer = await policyManagementPage.openAddForm();
      await drawer.choose('type', 'Individual');
      expect(await drawer.isSelectEditable('holder')).toBe(false);
      expect(await drawer.readHolderStatic()).toMatch(SELF);
    });

    await steps.critical('Change Policy Type = Group and leave Policyholder unselected, then attempt to submit - submission is blocked, requiring a selection', async () => {
      await drawer.fillInfo({ nameEn, nameAr: arabicName(), type: 'Group', payer: POLICY_SUITE_PAYER, plan: planName });
      expect(await drawer.next(), 'Next without a holder').toBe(false);
      expect(await drawer.getFieldError('holder')).toBe(FIELD_MESSAGE.holderRequired);
    });

    await steps.step('Select a policyholder for the Group policy and submit - submission succeeds', async () => {
      discardPolicyNamed(nameEn);
      await drawer.choose('holder', data.holder);
      expect(await drawer.next(), `Next with a holder: ${(await drawer.getMessages()).join(' | ')}`).toBe(true);
      await drawer.fillCoverage(validCoverage());
      expectAccepted(await drawer.attemptSave());
      const created = (await policyManagementPage.fetchRegister({ searchText: nameEn })).items.find((p) => p.policyNameEn === nameEn);
      expect(created?.policyHolderNames).toBe(data.holder);
    });
  });

  test(`TC-${CASES.rapidToggle.azureId}: should keep the policyholder consistent with the last policy type after rapid switching`, async ({
    policyManagementPage,
    discardPolicyNamed,
    page,
    steps,
  }) => {
    const data = CASES.rapidToggle;
    const nameEn = suitePolicyName(data.label);
    const planName = await suitePlanName(page);
    let drawer!: PolicyFormDrawer;

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      drawer = await policyManagementPage.openAddForm();
      expect(await drawer.getTitle()).toBe(LABEL.drawerTitle.add);
    });

    await steps.step('Rapidly toggle the Policy Type between Individual and Group several times - the Policyholder field updates each time without errors or stale data', async () => {
      const seen: string[] = [];
      for (let round = 0; round < data.rounds; round += 1) {
        await drawer.choose('type', 'Individual');
        seen.push(`Individual:${SELF.test(await drawer.readHolderStatic()) && !(await drawer.hasField('holder'))}`);
        await drawer.choose('type', 'Group');
        seen.push(`Group:${(await drawer.hasField('holder')) && (await drawer.readHolderStatic()) === ''}`);
      }
      await drawer.choose('type', 'Individual');
      expect(seen.filter((s) => s.endsWith(':false')), `states seen: ${seen.join(', ')}`).toEqual([]);
      expect(await drawer.readHolderStatic()).toMatch(SELF);
    });

    await steps.step('Save the policy after toggling - the final Policyholder value matches the last selected Policy Type\'s rule (Individual: Self)', async () => {
      discardPolicyNamed(nameEn);
      await drawer.fillInfo({ nameEn, nameAr: arabicName(), payer: POLICY_SUITE_PAYER, plan: planName });
      expect(await drawer.next(), `Next: ${(await drawer.getMessages()).join(' | ')}`).toBe(true);
      await drawer.fillCoverage(validCoverage());
      expectAccepted(await drawer.attemptSave());
      const created = (await policyManagementPage.fetchRegister({ searchText: nameEn })).items.find((p) => p.policyNameEn === nameEn);
      expect({ type: created?.policyTypeId, holder: created?.policyHolderNames }).toEqual({ type: await policyTypeId(page, 'individual'), holder: expect.stringMatching(SELF) });
    });
  });

  test(`TC-${CASES.terminologyList.azureId}: should list every policyholder configured in terminology in the Policyholder dropdown`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Draft');
    const configured = (await policyHolders(page)).map((h) => h.nameEn).sort();
    let drawer!: PolicyFormDrawer;

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(configured.length, 'policyholders configured in terminology').toBeGreaterThan(0);
    });

    await steps.critical('Open a Draft Group policy and click the Policyholder dropdown - the dropdown opens', async () => {
      await policyDetailPage.open(policy.id);
      drawer = await policyDetailPage.openEditDrawer();
      expect(await drawer.isSelectEditable('holder'), 'the Policyholder dropdown of the Draft\'s Edit drawer should open, but it is disabled').toBe(true);
    });

    await steps.step('Review the list of available options - all policyholders configured in the terminology list are displayed', async () => {
      const offered = (await drawer.getOptions('holder')).map((o) => o.trim()).filter((o) => o !== '').sort();
      expect(offered).toEqual(configured);
      expect(offered).toEqual(expect.arrayContaining([...OPTIONS.holders]));
    });
  });
});
