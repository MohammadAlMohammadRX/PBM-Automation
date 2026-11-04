import { test, expect } from '../../../fixtures';
import { CASES, PLACEHOLDER, TAB_ERROR } from '../../../data/policy/policyOverview.data';
import { LABEL } from '../../../data/policy/policy.data';
import { POLICY_DETAIL, type PolicyDetailTab } from '../../../constants/ElementIds';
import { OVERVIEW_STORY_FIELDS } from '../../../constants/policy/writerBIds';
import { readPolicy, updatePolicyFields, type ProvisionedPolicy } from '../../../utils/PolicyProvisioning';
import {
  editableOverviewFields,
  parseCountChip,
  suitePolicyName,
  switchTabsRapidly,
  drawnDirection,
  textDirection,
  typeIntoOverview,
} from '../../../utils/policy/writerBHelpers';

/**
 * User story 15174: View Policy - Overview.
 * Six tabs on a policy record and an Overview of read-only values: names,
 * links, status, members, dates, limits, amounts in SAR and the benefit year.
 * See the data file for how the sheet's records are built.
 */
test.describe('US 15174 - View Policy - Overview', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.sixTabs.azureId}: should show the six policy tabs and open each one`, async ({
    policyManagementPage,
    policyDetailPage,
    policyMembersTab,
    policyNetworksTab,
    policyDocumentsTab,
    policyVersionHistoryTab,
    policyAuditTab,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('Draft');

    await steps.critical('Navigate to the Policy Management module - the module loads showing the policy list', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.countRows()).toBeGreaterThan(0);
    });

    await steps.critical('Select an existing policy from the list - the policy record opens', async () => {
      await policyManagementPage.revealRow(policy.nameEn);
      const detail = await policyManagementPage.openDetails(policy.nameEn);
      expect(await detail.getName()).toBe(policy.nameEn);
    });

    await steps.step('Observe the tab bar - six tabs are displayed: Overview, Members, Network assignment, Documentation, Version History, Audit History', async () => {
      const tabs = await policyDetailPage.readTabs();
      const labels = (Object.keys(LABEL.tabs) as PolicyDetailTab[]).map((key) => (tabs[key] ?? '').replace(/\s*\(\d+\)$/, '').toLowerCase());
      expect(labels).toEqual(Object.values(LABEL.tabs).map((l) => l.toLowerCase()));
    });

    await steps.step('Click on each tab in turn - each tab opens its corresponding content area without error', async () => {
      await policyMembersTab.open();
      await policyNetworksTab.open();
      await policyDocumentsTab.open();
      await policyVersionHistoryTab.open();
      await policyAuditTab.open();
      await policyDetailPage.openTab('overview');
      expect(await policyDetailPage.readOverviewField('number')).toBe(policy.policyNumber);
      expect((await policyDetailPage.readMessages()).filter((m) => TAB_ERROR.test(m)), 'errors shown while switching tabs').toEqual([]);
    });
  });

  test(`TC-${CASES.readMode.azureId}: should show every Overview field of a live policy in read mode`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Future', { ...CASES.readMode.spec });

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the policy record - it opens on the Overview tab by default', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.hasOverviewField('number')).toBe(true);
    });

    await steps.step('Review each field on the Overview tab against the required checklist - every listed field is visible', async () => {
      const missing: string[] = [];
      for (const field of OVERVIEW_STORY_FIELDS) if (!(await policyDetailPage.hasOverviewField(field))) missing.push(field);
      expect(missing, 'Overview fields not shown').toEqual([]);
      expect(await policyDetailPage.getName(), 'Policy Name (English)').toBe(policy.nameEn);
      expect(await policyDetailPage.readOverviewField('nameAr'), 'Policy Name (Arabic)').toBe(policy.nameAr);
    });

    await steps.step('Attempt to click into any field - the fields remain non-editable, confirming read mode', async () => {
      expect(await editableOverviewFields(page)).toEqual([]);
      const typed = await typeIntoOverview(page, policyDetailPage, 'maxMembers', '7');
      expect(typed.after).toBe(typed.before);
    });
  });

  test(`TC-${CASES.bilingualNames.azureId}: should display the Arabic and English policy names correctly`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    page,
    steps,
  }) => {
    const data = CASES.bilingualNames;
    const policy = await policyIn('Draft', { nameEn: suitePolicyName(data.label), nameAr: data.nameAr });

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the policy record and view the Overview tab - the Overview tab displays', async () => {
      await policyDetailPage.open(policy.id);
      await policyDetailPage.openTab('overview');
      expect(await policyDetailPage.hasOverviewField('number')).toBe(true);
    });

    await steps.step('Locate the Policy Name fields - two separate fields are shown, one for Arabic text and one for English text', async () => {
      expect({ arabic: await policyDetailPage.hasOverviewField('nameAr'), english: await policyDetailPage.getName() }).toEqual({ arabic: true, english: policy.nameEn });
    });

    await steps.step('Verify the Arabic name renders right-to-left and the English name in Latin script - each shows its text correctly without truncation', async () => {
      expect(await policyDetailPage.readOverviewField('nameAr')).toBe(data.nameAr);
      expect(await policyDetailPage.getName()).toBe(policy.nameEn);
      // What the screen DRAWS (first character right of the last for Arabic), not the CSS direction:
      // the run read the Arabic value's computed direction "ltr" while it was drawn right to left (2026-11-04 triage).
      const [arabic, english] = [await drawnDirection(page, POLICY_DETAIL.overview.nameAr), await drawnDirection(page, POLICY_DETAIL.name)];
      expect({ arabic, english }, `the names as drawn (CSS direction of the Arabic value: ${await textDirection(page, POLICY_DETAIL.overview.nameAr)})`)
        .toEqual({ arabic: { direction: 'rtl', truncated: false }, english: { direction: 'ltr', truncated: false } });
    });
  });

  test(`TC-${CASES.memberLimitBounds.azureId}: should show the Member Limit at its minimum and maximum values exactly`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    steps,
  }) => {
    const [low, high] = CASES.memberLimitBounds.values;
    const min = await policyIn('Draft', { maxMembers: low });
    const max = await policyIn('Draft', { maxMembers: high });

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(min.nameEn)).toBe(true);
    });

    await steps.step(`Open the policy with Member Limit = ${low} - the Overview shows Member Limit as ${low}`, async () => {
      await policyDetailPage.open(min.id);
      expect((await policyDetailPage.readOverviewField('maxMembers')).replace(/,/g, '')).toBe(String(low));
    });

    await steps.step(`Open the policy with Member Limit = ${high} - the Overview shows Member Limit as ${high}`, async () => {
      await policyDetailPage.open(max.id);
      expect((await policyDetailPage.readOverviewField('maxMembers')).replace(/,/g, '')).toBe(String(high));
    });
  });

  test(`TC-${CASES.unsetFields.azureId}: should show a clear placeholder for an unset Sublimit and Grace Period`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Draft', { gracePeriodDays: null });
    await updatePolicyFields(page, policy.id, { sublimitAmount: null as unknown as number, gracePeriodDays: null }, { confirmRevertToDraft: true });

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect((await readPolicy(page, policy.id)).gracePeriodDays).toBeNull();
    });

    await steps.critical('Open the policy with unset Policy Sublimit and Grace Period - the Overview tab loads', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.hasOverviewField('sublimit')).toBe(true);
    });

    await steps.step('Review the Policy Sublimit (SAR) and Grace Period (days) fields - each shows a clear placeholder (e.g. "-" or "N/A"), not blank, zero or an error', async () => {
      expect({ sublimit: await policyDetailPage.readOverviewField('sublimit'), grace: await policyDetailPage.readOverviewField('gracePeriod') }, 'the unset Sublimit and Grace Period as the Overview shows them')
        .toEqual({ sublimit: expect.stringMatching(PLACEHOLDER), grace: expect.stringMatching(PLACEHOLDER) });
    });
  });

  test(`TC-${CASES.notEditable.azureId}: should not let any Overview value be changed from the Overview tab`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Draft', { maxMembers: 10 });

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Open a policy and view the Overview tab - the fields display in read-only format', async () => {
      await policyDetailPage.open(policy.id);
      expect(await editableOverviewFields(page)).toEqual([]);
    });

    await steps.step('Attempt to click, type into or select a different value in Policy Number, Status and Member Limit - no field accepts input or becomes editable', async () => {
      const changed: string[] = [];
      for (const field of ['number', 'status', 'maxMembers'] as const) {
        const typed = await typeIntoOverview(page, policyDetailPage, field, CASES.notEditable.typed);
        if (typed.after !== typed.before) changed.push(`${field}: "${typed.before}" -> "${typed.after}"`);
      }
      expect(changed).toEqual([]);
      expect(await editableOverviewFields(page)).toEqual([]);
    });

    await steps.step('Attempt to use keyboard shortcuts (Tab, Enter) to force edit mode - the fields remain locked and unchanged', async () => {
      const typed = await typeIntoOverview(page, policyDetailPage, 'maxMembers', CASES.notEditable.typed, ['Tab', 'Enter']);
      expect(typed.after).toBe(typed.before);
      expect(await editableOverviewFields(page)).toEqual([]);
      expect((await readPolicy(page, policy.id)).maxMembers).toBe(10);
    });
  });

  test(`TC-${CASES.rapidTabs.azureId}: should keep the policy details consistent when the tabs are switched rapidly`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Draft', { documents: 1 });
    let before: Record<string, string> = {};

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      await policyDetailPage.open(policy.id);
      before = await policyDetailPage.readOverview();
      expect(before.number).toBe(policy.policyNumber);
    });

    await steps.step('Rapidly click through the six tabs several times in quick succession - each tab loads its own content without freezing or crashing', async () => {
      await switchTabsRapidly(page, CASES.rapidTabs.rounds);
      expect(await policyDetailPage.isLoaded()).toBe(true);
      expect(Object.keys(await policyDetailPage.readTabs()).length).toBe(6);
      expect((await policyDetailPage.readMessages()).filter((m) => TAB_ERROR.test(m))).toEqual([]);
    });

    await steps.step('Return to the Overview tab after the rapid switching - it still displays the original, correct policy data', async () => {
      await policyDetailPage.openTab('overview');
      expect(await policyDetailPage.readOverview()).toEqual(before);
      expect(await policyDetailPage.getName()).toBe(policy.nameEn);
    });
  });

  test(`TC-${CASES.backToOverview.azureId}: should show the same policy and its correct Members count after returning from the Members tab`, async ({
    policyManagementPage,
    policyDetailPage,
    policyMembersTab,
    policyIn,
    steps,
  }) => {
    const data = CASES.backToOverview;
    const policy = await policyIn('Future', { type: 'individual', members: data.members });

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Open the policy and go to the Members tab - the Members tab displays the member list', async () => {
      await policyDetailPage.open(policy.id);
      await policyMembersTab.open();
      expect(await policyMembersTab.countRows()).toBe(data.members);
    });

    await steps.step('Click back on the Overview tab - it shows the same policy\'s data, including the correct Members count', async () => {
      await policyDetailPage.openTab('overview');
      expect(await policyDetailPage.readOverviewField('number')).toBe(policy.policyNumber);
      expect(parseCountChip(await policyDetailPage.readOverviewField('members')).count).toBe(data.members);
    });
  });

  test(`TC-${CASES.linkedRecords.azureId}: should show the linked plan, payer and policy holder on the Overview`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('Draft', { holderName: CASES.linkedRecords.holder });

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical(`Open the policy linked to "${policy.planName}", "${policy.payerName}" and "${CASES.linkedRecords.holder}" - the Overview tab loads`, async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.hasOverviewField('plan')).toBe(true);
    });

    await steps.step('Verify the Plan, Payer and Policy Holder fields - each shows exactly the linked record\'s name', async () => {
      expect({ plan: await policyDetailPage.readOverviewField('plan'), payer: await policyDetailPage.readOverviewField('payer'), holder: await policyDetailPage.readOverviewField('holder') })
        .toEqual({ plan: policy.planName, payer: policy.payerName, holder: CASES.linkedRecords.holder });
    });
  });

  test(`TC-${CASES.coinsuranceShown.azureId}: should show the coinsurance percentage at its boundary and mid values`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    steps,
  }) => {
    const policies: { value: number; policy: ProvisionedPolicy }[] = [];
    for (const value of CASES.coinsuranceShown.values) policies.push({ value, policy: await policyIn('Draft', { coinsurancePercent: value }) });

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policies[0].policy.nameEn)).toBe(true);
    });

    for (const { value, policy } of policies) {
      await steps.step(`Open the policy with Coinsurance % = ${value} - the Overview shows ${value}%`, async () => {
        await policyDetailPage.open(policy.id);
        expect(await policyDetailPage.readOverviewField('coinsurance')).toBe(`${value}%`);
      });
    }
  });

  test(`TC-${CASES.policyTypes.azureId}: should show each policy type correctly on the Overview`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    steps,
  }) => {
    const policies: { label: string; policy: ProvisionedPolicy }[] = [];
    for (const [type, label] of CASES.policyTypes.types) policies.push({ label, policy: await policyIn('Draft', { type }) });

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policies[0].policy.nameEn)).toBe(true);
    });

    await steps.step('Open a policy of each distinct Policy Type (Group, Individual) - the Overview loads for each', async () => {
      for (const { policy } of policies) {
        await policyDetailPage.open(policy.id);
        expect(await policyDetailPage.hasOverviewField('type')).toBe(true);
      }
    });

    await steps.step('Verify the Policy Type field shows the correct category for each record - each shows its own type', async () => {
      const shown: string[] = [];
      for (const { policy } of policies) {
        await policyDetailPage.open(policy.id);
        shown.push(await policyDetailPage.readOverviewField('type'));
      }
      expect(shown).toEqual(policies.map((p) => p.label));
    });
  });

  test(`TC-${CASES.sarFormat.azureId}: should format the monetary values consistently in SAR`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    steps,
  }) => {
    const data = CASES.sarFormat;
    const policy = await policyIn('Draft', { ...data.spec });

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the policy and view the Overview tab - the Overview tab loads', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.hasOverviewField('deductible')).toBe(true);
    });

    await steps.step('Check the Deductible, Out-of-Pocket Maximum and Sublimit against the formatting checklist - each shows the SAR label with thousand separators and decimals', async () => {
      expect({
        deductible: await policyDetailPage.readOverviewField('deductible'),
        outOfPocket: await policyDetailPage.readOverviewField('outOfPocket'),
        sublimit: await policyDetailPage.readOverviewField('sublimit'),
      }).toEqual(data.shown);
    });
  });
});
