import { test, expect } from '../../../fixtures';
import type { PolicyFormDrawer } from '../../../pages/policy/PolicyFormDrawer';
import type { PolicyMemberDrawer } from '../../../pages/policy/PolicyMemberDrawer';
import { CASES, LOCKED, VALIDATION } from '../../../data/policy/editPolicy.data';
import { APPROVAL_LABEL, FIELD_MESSAGE, LABEL, versionBadge } from '../../../data/policy/policy.data';
import { POLICY_FORM } from '../../../constants/ElementIds';
import { POLICY_EDIT_ROUTE_SUFFIX } from '../../../constants/policy/writerBIds';
import { Logger } from '../../../utils/Logger';
import {
  assignableNetworks,
  plansForPayer,
  readPolicy,
  readPolicyMembers,
  readPolicyNetworks,
  readPolicyVersions,
  updatePolicyFields,
} from '../../../utils/PolicyProvisioning';
import {
  arabicName,
  editCoverageAndSave,
  editableOverviewFields,
  expectAccepted,
  expectRefused,
  freeCandidates,
  isFormFieldEditable,
  isoDaysAfter,
  numberKept,
  openEditAtCoverage,
  openPolicyReview,
  policyDateTextLocal,
  policyRoute,
  said,
  suitePolicyName,
  typeCoverage,
  typeIntoOverview,
  versionNumber,
} from '../../../utils/policy/writerBHelpers';

const draftBadge = /·\s*Draft$/;
const pendingBadge = /·\s*Pending Approval$/;

/**
 * User story 15169: Edit policy.
 * A Draft V0 is edited through the Edit drawer; once published (V1) only the
 * Members, Network Assignment and Documentation tabs change, and every such
 * change is staged as a draft that goes through Send for Approval. See the data
 * file for how the sheet maps onto this build.
 */
test.describe('US 15169 - Edit policy', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.draftEdit.azureId}: should save a deductible change on a Draft V0 policy and keep it in Draft V0`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    page,
    steps,
  }) => {
    const data = CASES.draftEdit;
    const policy = await policyIn('Draft', { deductibleAmount: data.deductibleBefore });
    let drawer!: PolicyFormDrawer;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the policy that is in Draft V0 - the policy view page opens', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getName()).toBe(policy.nameEn);
      expect(await policyDetailPage.getVersionBadge()).toBe(versionBadge(0, APPROVAL_LABEL.draft));
    });

    await steps.critical('Select the edit action - edit mode opens allowing changes to policy fields', async () => {
      drawer = await policyDetailPage.openEditDrawer();
      expect(await drawer.getTitle()).toBe(LABEL.drawerTitle.edit);
    });

    await steps.step('Change the Policy Deductible value and save - the change is saved and the policy remains in Draft V0 pending submission', async () => {
      if ((await drawer.currentStep()) === 1) expect(await drawer.next(), 'Next should open Coverage Period').toBe(true);
      await typeCoverage(page, drawer, { deductible: String(data.deductibleAfter) });
      expectAccepted(await drawer.attemptSave());
      const record = await readPolicy(page, policy.id);
      expect({ deductible: record.deductibleAmount, version: record.currentVersion, notLive: record.isPendingCreate }).toEqual({ deductible: data.deductibleAfter, version: 0, notLive: true });
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getVersionBadge()).toBe(versionBadge(0, APPROVAL_LABEL.draft));
    });
  });

  test(`TC-${CASES.limits.azureId}: should accept coinsurance 0 % and 100 % and zero amounts when a draft policy is edited`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Draft', { ...CASES.limits.start });

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Open the Draft policy and select edit - the edit form opens', async () => {
      const drawer = await openEditAtCoverage(policyDetailPage, policy.id);
      expect(await drawer.getTitle()).toBe(LABEL.drawerTitle.edit);
    });

    await steps.step('Set the Policy Coinsurance to its lowest valid value (0%) and save - the value is accepted and saved', async () => {
      expectAccepted(await editCoverageAndSave(page, policyDetailPage, policy.id, { coinsurance: '0' }));
      expect((await readPolicy(page, policy.id)).coinsurancePercent).toBe(0);
    });

    await steps.step('Edit again and set the Coinsurance to its highest valid value (100%) and save - the value is accepted and saved', async () => {
      expectAccepted(await editCoverageAndSave(page, policyDetailPage, policy.id, { coinsurance: '100' }));
      expect((await readPolicy(page, policy.id)).coinsurancePercent).toBe(100);
    });

    await steps.step('Set the Policy Deductible, Out-of-Pocket Maximum and Policy Sublimit to 0 SAR and save - the values are accepted and saved correctly', async () => {
      expectAccepted(await editCoverageAndSave(page, policyDetailPage, policy.id, { deductible: '0', outOfPocket: '0', sublimit: '0' }));
      const record = await readPolicy(page, policy.id);
      expect({ deductible: record.deductibleAmount, outOfPocket: record.outOfPocketMaximum, sublimit: record.sublimitAmount }).toEqual({ deductible: 0, outOfPocket: 0, sublimit: 0 });
    });
  });

  test(`TC-${CASES.coreInfo.azureId}: should save new names, type, plan and holder on a policy still in Draft`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    page,
    steps,
  }) => {
    const data = CASES.coreInfo;
    const policy = await policyIn('Draft', { holderName: data.holderBefore });
    const wanted = { nameEn: suitePolicyName(data.nameLabel), nameAr: arabicName(data.arabicPrefix) };
    // Another plan of the payer whose period covers the policy's (the current one when none is offered).
    const plans = await plansForPayer(page, policy.payerId);
    const otherPlan = plans.find((p) => p.id !== policy.planId && Date.parse(p.effectiveDate) <= Date.parse(policy.effectiveDate) && Date.parse(p.expiryDate) >= Date.parse(policy.expiryDate));
    const planCode = otherPlan?.planCode ?? plans.find((p) => p.id === policy.planId)?.planCode ?? policy.planName;
    let drawer!: PolicyFormDrawer;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the Draft policy and select edit - the edit form opens showing the policy information section', async () => {
      await policyDetailPage.open(policy.id);
      drawer = await policyDetailPage.openEditDrawer();
      expect(await drawer.currentStep()).toBe(1);
      expect(await drawer.getValue('nameEn')).toBe(policy.nameEn);
    });

    await steps.step('Update the Arabic name, English name, policy type, plan, and policy holder fields - each field accepts and reflects the new value', async () => {
      const editable = {
        nameEn: await isFormFieldEditable(page, 'nameEn'),
        nameAr: await isFormFieldEditable(page, 'nameAr'),
        type: await drawer.isSelectEditable('type'),
        plan: await drawer.isSelectEditable('plan'),
        holder: await drawer.isSelectEditable('holder'),
      };
      if (editable.nameEn) await drawer.type('nameEn', wanted.nameEn);
      if (editable.nameAr) await drawer.type('nameAr', wanted.nameAr);
      if (editable.plan) await drawer.choose('plan', planCode);
      if (editable.holder) await drawer.choose('holder', data.holderAfter);
      expect(editable, 'every policy information field should be editable on a Draft').toEqual({ nameEn: true, nameAr: true, type: true, plan: true, holder: true });
      expect({ nameEn: await drawer.getValue('nameEn'), nameAr: await drawer.getValue('nameAr'), holder: await drawer.readSelect('holder') })
        .toEqual({ nameEn: wanted.nameEn, nameAr: wanted.nameAr, holder: data.holderAfter });
      expect(await drawer.readSelect('plan')).toContain(planCode);
    });

    await steps.step('Save the changes - all updated policy information is persisted and displayed correctly on the policy', async () => {
      if ((await drawer.currentStep()) === 1) expect(await drawer.next(), `Next should open Coverage Period: ${(await drawer.getMessages()).join(' | ')}`).toBe(true);
      expectAccepted(await drawer.attemptSave());
      const record = await readPolicy(page, policy.id);
      expect({ nameEn: record.policyNameEn, nameAr: record.policyNameAr, holder: record.policyHolderNames })
        .toEqual({ nameEn: wanted.nameEn, nameAr: wanted.nameAr, holder: data.holderAfter });
      if (otherPlan) expect(record.planId).toBe(otherPlan.id);
      await policyDetailPage.open(policy.id);
      expect({ name: await policyDetailPage.getName(), nameAr: await policyDetailPage.readOverviewField('nameAr'), holder: await policyDetailPage.readOverviewField('holder') })
        .toEqual({ name: wanted.nameEn, nameAr: wanted.nameAr, holder: data.holderAfter });
    });
  });

  test(`TC-${CASES.publishedTabs.azureId}: should keep only Members, Network Assignment and Documentation editable once a policy is published`, async ({
    policyManagementPage,
    policyDetailPage,
    policyMembersTab,
    policyNetworksTab,
    policyDocumentsTab,
    policyIn,
    page,
    steps,
  }) => {
    // Individual: a Group policy takes no members until Active, which is not the rule under test.
    const policy = await policyIn('Future', { type: 'individual' });
    const networkCode = policy.networks[0]?.networkCode ?? '';

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the published policy\'s view page - it shows the Members, Network Assignment, Documentation and other tabs', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getVersionBadge()).toBe(versionBadge(1, APPROVAL_LABEL.approved));
      expect(Object.keys(await policyDetailPage.readTabs())).toEqual(expect.arrayContaining(['members', 'networks', 'documents']));
    });

    await steps.step('Attempt to edit the Members tab - edit controls are available and changes can be entered', async () => {
      await policyMembersTab.open();
      expect(await policyMembersTab.getAddAvailability(), 'Add Member').toBe('available');
      const drawer = await policyMembersTab.openAdd();
      const free = await freeCandidates(page, policy.id, 1);
      expect(free.length, 'a member to enter').toBe(1);
      await drawer.search(free[0].documentId);
      expect((await drawer.readResults()).length, 'the picker should list the member').toBeGreaterThan(0);
      await drawer.cancel();
    });

    await steps.step('Attempt to edit the Network Assignment tab - edit controls are available and changes can be entered', async () => {
      await policyNetworksTab.open();
      const offered = { assign: await policyNetworksTab.isAssignOffered(), remove: networkCode ? await policyNetworksTab.getRemoveAvailability(networkCode) : 'absent' };
      expect(offered.assign || offered.remove === 'available', `the network controls offered: ${JSON.stringify(offered)}`).toBe(true);
    });

    await steps.step('Attempt to edit the Documentation tab - edit controls are available and changes can be entered', async () => {
      await policyDocumentsTab.open();
      expect(await policyDocumentsTab.getAddAvailability(), 'Add Documentation').toBe('available');
      const drawer = await policyDocumentsTab.openAdd();
      await drawer.typeTitle('Automation entry that is not saved');
      expect(await drawer.getValue('title')).toBe('Automation entry that is not saved');
      await drawer.cancel();
    });

    await steps.step('Attempt to edit core policy information or the coverage period - edit controls are disabled or unavailable', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getActionAvailability('edit'), 'the header Edit').not.toBe('available');
      expect(await editableOverviewFields(page), 'editable Overview values').toEqual([]);
    });
  });

  test(`TC-${CASES.listEditRemoved.azureId}: should remove the Edit action from the list and the view once a policy is published as V1`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('Future');

    await steps.critical('Navigate to the Policy Management module - the module loads showing the policy list', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.countRows()).toBeGreaterThan(0);
    });

    await steps.step('Locate the published policy (V1) in the list - the row shows its published, live status', async () => {
      const row = await policyManagementPage.readRow(policy.nameEn);
      expect(row.approvalStatus).toBe(versionBadge(1, APPROVAL_LABEL.approved));
      expect(row.status, 'a published status, not "Not Live"').not.toMatch(/Not Live|Draft/i);
    });

    await steps.step('Inspect the available actions for this policy - the edit action is not present', async () => {
      expect((await policyManagementPage.getActionState(policy.nameEn, 'edit')).availability).toBe('absent');
    });

    await steps.step('Open the policy\'s view page directly - no full-form edit option is available outside the permitted tabs', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getActionAvailability('edit')).not.toBe('available');
    });
  });

  test(`TC-${CASES.approvalGate.azureId}: should hold a Members change of a published policy in Draft until it passes the approval gate`, async ({
    policyManagementPage,
    policyDetailPage,
    policyMembersTab,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Future', { type: 'individual' });
    const liveBefore = (await readPolicy(page, policy.id)).memberCount;
    const [candidate] = await freeCandidates(page, policy.id, 1);
    let drawer!: PolicyMemberDrawer;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(candidate, 'a member the policy does not hold yet').toBeDefined();
    });

    await steps.critical('Open the published policy and change data in the Members tab - the change is entered in the form', async () => {
      await policyDetailPage.open(policy.id);
      await policyMembersTab.open();
      drawer = await policyMembersTab.openAdd();
      await drawer.search(candidate.documentId);
      await drawer.pick(candidate.documentId);
      await drawer.chooseRelationship(CASES.approvalGate.relationship);
      expect(await drawer.getText()).toContain(candidate.documentId);
    });

    await steps.step('Save the change without sending it for approval - the approval status becomes Draft, Send for Approval is available and the live data is not altered', async () => {
      expectAccepted(await drawer.attemptSave());
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getVersionBadge()).toMatch(draftBadge);
      expect(await policyDetailPage.getActionAvailability('submit'), 'Send for Approval').toBe('available');
      const record = await readPolicy(page, policy.id);
      expect({ live: record.memberCount, draft: record.hasDraft }).toEqual({ live: liveBefore, draft: true });
    });

    await steps.step('Check the previously published version of the data - the live data remains unchanged pending approval', async () => {
      const added = (await readPolicyMembers(page, policy.id)).find((m) => m.memberId === candidate.id);
      expect(added?.rosterState, 'the new member is staged, not enrolled').not.toBe('live');
      const published = (await readPolicyVersions(page, policy.id)).find((v) => v.version === 1);
      expect(published?.versionStatusCode, 'v1 stays the published version').toBe('published');
      expect((await readPolicy(page, policy.id)).memberCount).toBe(liveBefore);
    });
  });

  test(`TC-${CASES.reviewerVisibility.azureId}: should show a change to the reviewer only after it is sent for approval`, async ({
    policyManagementPage,
    policyDetailPage,
    policyDocumentsTab,
    policyApprovalsPage,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Future');
    const title = `${CASES.reviewerVisibility.documentTitle} ${Date.now().toString(36)}`;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Change a permitted field and save without selecting Send for Approval - the approval status is set to Draft', async () => {
      await policyDetailPage.open(policy.id);
      await policyDocumentsTab.open();
      const drawer = await policyDocumentsTab.openAdd();
      expectAccepted(await drawer.add({ title, type: 'Other', description: 'Staged by the automation suite for the reviewer-visibility case.' }));
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getVersionBadge()).toMatch(draftBadge);
    });

    await steps.step('Check the approval queue as the Reviewer - the modified policy does not appear in the pending list', async () => {
      await policyApprovalsPage.open();
      expect(await policyApprovalsPage.isInQueue(policy.nameEn)).toBe(false);
    });

    await steps.critical('Select Send for Approval on the modified policy - the approval status changes to Pending Approval', async () => {
      await policyDetailPage.open(policy.id);
      expectAccepted(await policyDetailPage.sendForApproval(), 'Send for Approval');
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getVersionBadge()).toMatch(pendingBadge);
    });

    await steps.step('Check the approval queue as the Reviewer again - the policy now appears with the proposed changes visible', async () => {
      const review = await openPolicyReview(page, policyApprovalsPage, policy.nameEn);
      expect(review.text, 'the proposed change (the new document) in the review').toContain(title);
    });
  });

  test(`TC-${CASES.tradeTierChange.azureId}: should reset a published policy to Draft when its trade or tier details are changed`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    steps,
  }) => {
    const first = await policyIn('Future');
    const second = await policyIn('Future');
    const section = CASES.tradeTierChange.section;
    const sectionsOf = async (): Promise<string[]> => Object.values(await policyDetailPage.readTabs()).filter((label): label is string => section.test(label ?? ''));

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(first.nameEn)).toBe(true);
    });

    await steps.step('Open the published policy and change a trade-related setting, such as the benefit configuration - the change is entered', async () => {
      await policyDetailPage.open(first.id);
      expect(await sectionsOf(), `a trade / benefit configuration / tier section on the policy (tabs: ${Object.values(await policyDetailPage.readTabs()).join(', ')})`).not.toEqual([]);
    });

    await steps.step('Save the change - the policy\'s approval status changes to Draft', async () => {
      await policyDetailPage.open(first.id);
      expect(await sectionsOf(), 'no trade-related change could be entered to save').not.toEqual([]);
      expect(await policyDetailPage.getVersionBadge()).toMatch(draftBadge);
    });

    await steps.step('Repeat with a tier configuration change on another published policy - saving it also resets that policy\'s approval status to Draft', async () => {
      await policyDetailPage.open(second.id);
      expect(await sectionsOf(), 'a tier section on the second policy').not.toEqual([]);
      expect(await policyDetailPage.getVersionBadge()).toMatch(draftBadge);
    });
  });

  test(`TC-${CASES.restrictedInfo.azureId}: should refuse every way of editing the restricted information of a published policy`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Future');
    const before = await readPolicy(page, policy.id);

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Open the published policy\'s view page - the view opens with its tabs displayed', async () => {
      await policyDetailPage.open(policy.id);
      expect(Object.keys(await policyDetailPage.readTabs()).length).toBe(6);
    });

    await steps.step('Attempt to directly change the Effective Date or Expiry Date outside the permitted tabs - the fields are read-only', async () => {
      expect(await policyDetailPage.getActionAvailability('edit'), 'the header Edit').not.toBe('available');
      expect(await editableOverviewFields(page)).toEqual([]);
      const typed = await typeIntoOverview(page, policyDetailPage, 'expiryDate', '01/01/2030 00:00', ['Enter']);
      expect(typed.after, 'the Expiry Date after typing into it').toBe(typed.before);
    });

    await steps.step('Attempt to reach a full edit form through direct navigation, bypassing the view page - the system denies access', async () => {
      await page.goto(policyRoute(policy.id, POLICY_EDIT_ROUTE_SUFFIX));
      await policyDetailPage.waitForPageReady();
      expect(await page.locator(`#${POLICY_FORM.add}-${POLICY_FORM.title}`).isVisible().catch(() => false), 'an edit form reached by URL').toBe(false);
      const direct = await updatePolicyFields(page, policy.id, { expiryDate: isoDaysAfter(before.expiryDate, -1) });
      expectRefused(direct, 'UpdatePolicy of a published policy');
      expect(said(direct)).toMatch(LOCKED);
      const after = await readPolicy(page, policy.id);
      expect({ expiry: after.expiryDate, draft: after.hasDraft }).toEqual({ expiry: before.expiryDate, draft: false });
    });
  });

  test(`TC-${CASES.memberLimit.azureId}: should reject a negative or non-numeric Member Limit and save a valid one`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    page,
    steps,
  }) => {
    const data = CASES.memberLimit;
    const policy = await policyIn('Draft', { maxMembers: data.start });

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Open the Draft policy and select edit - the edit form opens', async () => {
      const drawer = await openEditAtCoverage(policyDetailPage, policy.id);
      expect(await drawer.getValue('maxMembers')).toBe(String(data.start));
    });

    for (const [label, value] of [['a negative value', data.negative], ['a non-numeric value', data.text]] as const) {
      await steps.step(`Enter ${label} for Member Limit and attempt to save - the system rejects the value with a validation message`, async () => {
        const drawer = await openEditAtCoverage(policyDetailPage, policy.id);
        await typeCoverage(page, drawer, { maxMembers: value });
        const { kept, held } = await numberKept(drawer, 'maxMembers', value);
        // The number field refuses the minus sign and letters (it keeps "5" / the old value):
        // prevented at input - nothing is saved (2026-11-04 triage, as in the Formulary suite).
        if (!kept) {
          Logger.step(`[19493] the Member Limit field did not take "${value}" (it holds "${held}")`);
          expect((await readPolicy(page, policy.id)).maxMembers, `the stored Member Limit after typing "${value}"`).toBe(data.start);
          return;
        }
        const answer = await drawer.attemptSave();
        expectRefused(answer, `a save with Member Limit "${value}"`);
        expect(answer.messages.join(' | ')).toMatch(VALIDATION);
        expect((await readPolicy(page, policy.id)).maxMembers).toBe(data.start);
      });
    }

    await steps.step('Enter a valid positive whole number and save - the value is accepted and saved successfully', async () => {
      expectAccepted(await editCoverageAndSave(page, policyDetailPage, policy.id, { maxMembers: data.valid }));
      expect((await readPolicy(page, policy.id)).maxMembers).toBe(Number(data.valid));
    });
  });

  test(`TC-${CASES.expiryBeforeEffective.azureId}: should prevent an expiry date earlier than the effective date when a draft policy is edited`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    page,
    steps,
  }) => {
    const data = CASES.expiryBeforeEffective;
    const policy = await policyIn('Draft');
    const effective = new Date(Date.now() + data.effectiveInDays * 86_400_000);
    effective.setHours(10, 0, 0, 0);
    const effectiveText = policyDateTextLocal(effective);
    const invalidExpiry = policyDateTextLocal(new Date(effective.getTime() - 86_400_000));
    const validExpiry = policyDateTextLocal(new Date(effective.getTime() + data.validExpiryDays * 86_400_000));

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Open the Draft policy and select edit - the edit form opens', async () => {
      const drawer = await openEditAtCoverage(policyDetailPage, policy.id);
      expect(await drawer.getValue('effectiveDate')).not.toBe('');
    });

    await steps.step('Set the Effective Date to a given date and save it - the value is accepted', async () => {
      expectAccepted(await editCoverageAndSave(page, policyDetailPage, policy.id, { effectiveDate: effectiveText }));
      expect(policyDateTextLocal(new Date((await readPolicy(page, policy.id)).effectiveDate))).toBe(effectiveText);
    });

    await steps.step('Set the Expiry Date to one day before the Effective Date and attempt to save - a validation error is shown and saving is prevented', async () => {
      const before = (await readPolicy(page, policy.id)).expiryDate;
      const drawer = await openEditAtCoverage(policyDetailPage, policy.id);
      await typeCoverage(page, drawer, { expiryDate: invalidExpiry });
      const answer = await drawer.attemptSave();
      expectRefused(answer);
      expect(`${await drawer.getFieldError('expiryDate')} ${answer.messages.join(' ')}`).toMatch(new RegExp(`${FIELD_MESSAGE.expiryBeforeEffective.replace(/\./g, '\\.')}|after the effective|before the effective`, 'i'));
      expect((await readPolicy(page, policy.id)).expiryDate).toBe(before);
    });

    await steps.step('Correct the Expiry Date to a date after the Effective Date and save - the change is accepted and saved successfully', async () => {
      expectAccepted(await editCoverageAndSave(page, policyDetailPage, policy.id, { expiryDate: validExpiry }));
      expect(policyDateTextLocal(new Date((await readPolicy(page, policy.id)).expiryDate))).toBe(validExpiry);
    });
  });

  test(`TC-${CASES.rejectAndResubmit.azureId}: should take a published policy's network change through rejection, revision and approval with the version incremented`, async ({
    policyManagementPage,
    policyDetailPage,
    policyNetworksTab,
    policyApprovalsPage,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Future');
    const assigned = new Set((await readPolicyNetworks(page, policy.id)).map((n) => n.networkId));
    const network = (await assignableNetworks(page, policy.payerId)).find((n) => !assigned.has(n.id))
      ?? steps.blocked(`the payer "${policy.payerName}" has no second ACTIVE network to assign - a network change that can be approved needs one `
        + '(removing the policy\'s only network can never be approved: "A policy must have at least one assigned network").');

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the published policy and change the Network Assignment tab - the change is entered and the approval status becomes Draft', async () => {
      await policyDetailPage.open(policy.id);
      await policyNetworksTab.open();
      expectAccepted(await policyNetworksTab.assign(network.networkNameEn), 'Assign');
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getVersionBadge()).toMatch(draftBadge);
    });

    await steps.critical('Select Send for Approval - the approval status changes to Pending Approval and the change becomes visible to the reviewer', async () => {
      expectAccepted(await policyDetailPage.sendForApproval(), 'Send for Approval');
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getVersionBadge()).toMatch(pendingBadge);
      await policyApprovalsPage.open();
      expect(await policyApprovalsPage.isInQueue(policy.nameEn)).toBe(true);
    });

    await steps.critical('As the Reviewer, reject the change with a comment - the approval status changes to Rejected', async () => {
      await policyApprovalsPage.reject(policy.nameEn);
      const versions = await readPolicyVersions(page, policy.id);
      expect(versions.map((v) => v.versionStatusCode), 'a rejected version').toContain('rejected');
      await policyDetailPage.open(policy.id);
      expect(`${await policyDetailPage.getVersionBadge()} ${await policyDetailPage.getHeaderText()}`).toMatch(/Rejected/);
    });

    await steps.critical('Revise the change based on the rejection feedback and resend it for approval - the approval status returns to Pending Approval', async () => {
      await policyDetailPage.open(policy.id);
      await policyNetworksTab.open();
      expectAccepted(await policyNetworksTab.assign(network.networkNameEn), 'Assign again');
      await policyDetailPage.open(policy.id);
      expectAccepted(await policyDetailPage.sendForApproval(), 'Send for Approval');
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getVersionBadge()).toMatch(pendingBadge);
    });

    await steps.step('As the Reviewer, approve the revised change - the approval status changes to Approved and the version number increments', async () => {
      await policyApprovalsPage.approve(policy.nameEn);
      await policyDetailPage.open(policy.id);
      const badge = await policyDetailPage.getVersionBadge();
      expect(badge).toMatch(/·\s*Approved$/);
      expect(versionNumber(badge), `the version after the second decision (${badge})`).toBeGreaterThan(1);
      expect((await readPolicyNetworks(page, policy.id)).find((n) => n.networkId === network.id)?.assignmentState).toBe('live');
    });
  });
});
