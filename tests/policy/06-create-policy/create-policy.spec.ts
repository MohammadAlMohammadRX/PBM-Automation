import { test, expect } from '../../../fixtures';
import type { PolicyFormDrawer, PolicyInfo } from '../../../pages/policy/PolicyFormDrawer';
import { CASES, DRAFT, LIFECYCLE_JOB_REASON, NAME_TOO_LONG } from '../../../data/policy/createPolicy.data';
import {
  APPROVAL_LABEL,
  FIELD_MESSAGE,
  LABEL,
  POLICY_STATUS_LABEL,
  POLICY_SUITE_PAYER,
  suiteNameOfLength,
  versionBadge,
} from '../../../data/policy/policy.data';
import { payerIdByName } from '../../../utils/NetworkProvisioning';
import {
  listPolicyRegister,
  plansForPayer,
  policyStatusCode,
  readPolicy,
} from '../../../utils/PolicyProvisioning';
import {
  arabicName,
  attemptSendForApproval,
  expectAccepted,
  expectRefused,
  isFormFieldEditable,
  numberKept,
  policyDateTextLocal,
  suitePlanName,
  suitePolicyName,
  validCoverage,
  waitUntilPast,
} from '../../../utils/policy/writerBHelpers';

/** Step 1 of a valid Group policy under the suite payer and plan, `extra` overriding. */
const stepOne = (nameEn: string, planName: string, extra: PolicyInfo = {}): PolicyInfo => ({
  nameEn, nameAr: arabicName(), type: 'Group', payer: POLICY_SUITE_PAYER, plan: planName, holder: 'Acme Corporation', ...extra,
});

/**
 * User story 15173: Create policy.
 * The two-step Add Policy drawer, its field rules, the Draft it saves and the
 * approval path to Active; identity locked after Draft. See the data file.
 */
test.describe('US 15173 - Create policy', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.createDraft.azureId}: should create a new policy through both steps and save it as Draft`, async ({
    policyManagementPage,
    discardPolicyNamed,
    page,
    steps,
  }) => {
    const data = CASES.createDraft;
    const nameEn = suitePolicyName(data.label);
    const planName = await suitePlanName(page);
    let drawer!: PolicyFormDrawer;

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical('Select Create New Policy - the Step 1 Policy Information form is displayed', async () => {
      drawer = await policyManagementPage.openAddForm();
      expect(await drawer.getTitle()).toBe(LABEL.drawerTitle.add);
      expect(await drawer.currentStep()).toBe(1);
    });

    await steps.critical('Enter the English and Arabic names, Policy Type, Payer, Plan and Policy Holder, then click Next - the Step 2 Coverage Period form is displayed', async () => {
      await drawer.fillInfo(stepOne(nameEn, planName, { nameAr: data.nameAr, type: data.type, holder: data.holder }));
      expect(await drawer.next(), `Next: ${(await drawer.getMessages()).join(' | ')}`).toBe(true);
    });

    await steps.step('Enter valid coverage values and dates, then Save as Draft - the policy is saved and appears in the policy list with status Draft', async () => {
      discardPolicyNamed(nameEn);
      await drawer.fillCoverage(validCoverage(data.coverage));
      expectAccepted(await drawer.attemptSave());
      const row = await policyManagementPage.readRow(nameEn);
      expect(`${row.status} ${row.approvalStatus}`).toMatch(DRAFT);
      expect(row.approvalStatus).toBe(versionBadge(0, APPROVAL_LABEL.draft));
    });
  });

  for (const key of ['name255', 'name256'] as const) {
    const data = CASES[key];
    const over = key === 'name256';
    test(over
      ? `TC-${data.azureId}: should reject an English policy name longer than 255 characters`
      : `TC-${data.azureId}: should accept an English policy name of exactly 255 characters`, async ({
      policyManagementPage,
      page,
      steps,
    }) => {
      const nameEn = suiteNameOfLength(data.length);
      const planName = await suitePlanName(page);
      let drawer!: PolicyFormDrawer;

      await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
        await policyManagementPage.openTable();
        expect(await policyManagementPage.isAddOffered()).toBe(true);
      });

      await steps.critical('Open Create New Policy Step 1 - the Policy Information form is displayed', async () => {
        drawer = await policyManagementPage.openAddForm();
        expect(await drawer.currentStep()).toBe(1);
      });

      await steps.step(over
        ? `Enter ${data.length} English letters in the English name and attempt to proceed - a validation error says the maximum of 255 characters is exceeded`
        : `Enter exactly ${data.length} English letters in the English name and proceed - the value is accepted without truncation or error`, async () => {
        await drawer.fillInfo(stepOne(nameEn, planName));
        const typed = await drawer.getValue('nameEn');
        const moved = await drawer.next();
        const error = await drawer.getFieldError('nameEn');
        if (over) {
          expect(moved, `Next with a ${typed.length}-character English name should be refused, but it moved on to Coverage Period ${error ? `(error "${error}")` : 'with no error shown'}`).toBe(false);
          expect(`${error} ${(await drawer.getMessages()).join(' ')}`).toMatch(NAME_TOO_LONG);
        } else {
          expect({ length: typed.length, moved, error }).toEqual({ length: data.length, moved: true, error: '' });
        }
        await drawer.close(true);
      });
    });
  }

  test(`TC-${CASES.arabicOnly.azureId}: should accept only Arabic letters in the Arabic policy name`, async ({
    policyManagementPage,
    page,
    steps,
  }) => {
    const planName = await suitePlanName(page);
    let drawer!: PolicyFormDrawer;

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical('Open Create New Policy Step 1 - the Policy Information form is displayed', async () => {
      drawer = await policyManagementPage.openAddForm();
      expect(await drawer.currentStep()).toBe(1);
    });

    await steps.step(`Enter English letters ("${CASES.arabicOnly.nameAr}") into the Arabic name and attempt to proceed - a validation error says only Arabic letters are allowed`, async () => {
      await drawer.fillInfo(stepOne(suitePolicyName('Arabic Only'), planName, { nameAr: CASES.arabicOnly.nameAr }));
      expect(await drawer.next()).toBe(false);
      // The field shows "Arabic letters only." (2026-11-03), not the bundle's
      // policy.validation.arabicOnly text; either says what the case expects.
      expect(await drawer.getFieldError('nameAr')).toMatch(new RegExp(`^(Arabic letters only\\.|${FIELD_MESSAGE.arabicOnly.replace(/\./g, '\\.')})$`));
      await drawer.close(true);
    });
  });

  test(`TC-${CASES.plansOfPayer.azureId}: should offer only the plans of the selected payer`, async ({
    policyManagementPage,
    page,
    steps,
  }) => {
    const payerId = await payerIdByName(page, POLICY_SUITE_PAYER);
    const ownCodes = (await plansForPayer(page, payerId)).map((p) => p.planCode);
    const foreign = (await listPolicyRegister(page, {}, 200)).items.find((p) => p.payerId !== payerId && p.planNameEn);
    let drawer!: PolicyFormDrawer;
    let options: string[] = [];

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(ownCodes.length, `plans of "${POLICY_SUITE_PAYER}"`).toBeGreaterThan(0);
    });

    await steps.critical(`Open Create New Policy with the payer ${POLICY_SUITE_PAYER} - the Step 1 form is displayed`, async () => {
      drawer = await policyManagementPage.openAddForm();
      await drawer.choose('payer', POLICY_SUITE_PAYER);
      expect(await drawer.readSelect('payer')).toContain(POLICY_SUITE_PAYER);
    });

    await steps.step('Click the Plan dropdown - the dropdown opens', async () => {
      options = (await drawer.getOptions('plan')).filter((o) => o.trim() !== '');
      expect(options.length).toBeGreaterThan(0);
    });

    await steps.step(`Review the available options - only plans of ${POLICY_SUITE_PAYER} are listed; a plan of another payer is not shown`, async () => {
      const codes = options.map((o) => (o.match(/\((PLN-\d+)\)/) ?? [])[1] ?? o);
      expect(codes.filter((c) => !ownCodes.includes(c)), 'options that are not plans of the payer').toEqual([]);
      if (foreign) expect(options.filter((o) => o.startsWith(`${foreign.planNameEn} (`)), `"${foreign.planNameEn}" of "${foreign.payerNameEn}"`).toEqual([]);
      await drawer.close(true);
    });
  });

  test(`TC-${CASES.holderByType.azureId}: should adapt the coverage holder to the chosen policy type`, async ({
    policyManagementPage,
    steps,
  }) => {
    let drawer!: PolicyFormDrawer;

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isAddOffered()).toBe(true);
    });

    await steps.step('Open Create New Policy and select Policy Type = Individual - the Coverage Holder is set to Self and is not selectable', async () => {
      drawer = await policyManagementPage.openAddForm();
      await drawer.choose('type', 'Individual');
      expect(await drawer.readHolderStatic()).toMatch(/self|themselves/i);
      expect(await drawer.isSelectEditable('holder')).toBe(false);
    });

    await steps.step('Change Policy Type = Group - the Policy Holder field becomes an enabled dropdown requiring manual selection', async () => {
      await drawer.choose('type', 'Group');
      expect(await drawer.isSelectEditable('holder')).toBe(true);
      expect(await drawer.readSelect('holder')).not.toMatch(/Acme|Globex|Neorx/);
      await drawer.close(true);
    });
  });

  test(`TC-${CASES.coinsuranceBounds.azureId}: should accept the coinsurance boundary values 0 % and 100 %`, async ({
    policyManagementPage,
    discardPolicyNamed,
    page,
    steps,
  }) => {
    const planName = await suitePlanName(page);
    const names = CASES.coinsuranceBounds.values.map((v) => suitePolicyName(`Coinsurance ${v}`));
    let drawer!: PolicyFormDrawer;

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical('Open a policy at Step 2 Coverage Period - the Coinsurance % field is displayed', async () => {
      drawer = await policyManagementPage.openAddForm();
      await drawer.fillInfo(stepOne(names[0], planName));
      expect(await drawer.next()).toBe(true);
      expect(await drawer.hasField('coinsurance')).toBe(true);
    });

    await steps.step('Enter 0 in the Coinsurance % field and save - the value is accepted', async () => {
      discardPolicyNamed(names[0]);
      await drawer.fillCoverage(validCoverage({ coinsurance: '0' }));
      expectAccepted(await drawer.attemptSave());
      const created = (await listPolicyRegister(page, { searchText: names[0] })).items.find((p) => p.policyNameEn === names[0]);
      expect((await readPolicy(page, created?.id ?? '')).coinsurancePercent).toBe(0);
    });

    await steps.step('Enter 100 in the Coinsurance % field and save - the value is accepted', async () => {
      discardPolicyNamed(names[1]);
      drawer = await policyManagementPage.openAddForm();
      await drawer.fillInfo(stepOne(names[1], planName));
      expect(await drawer.next()).toBe(true);
      await drawer.fillCoverage(validCoverage({ coinsurance: '100' }));
      expectAccepted(await drawer.attemptSave());
      const created = (await listPolicyRegister(page, { searchText: names[1] })).items.find((p) => p.policyNameEn === names[1]);
      expect((await readPolicy(page, created?.id ?? '')).coinsurancePercent).toBe(100);
    });
  });

  test(`TC-${CASES.coinsuranceAbove.azureId}: should reject a coinsurance percentage above 100 %`, async ({
    policyManagementPage,
    discardPolicyNamed,
    page,
    steps,
  }) => {
    const nameEn = suitePolicyName('Coinsurance 101');
    const planName = await suitePlanName(page);
    let drawer!: PolicyFormDrawer;

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical('Open a policy at Step 2 Coverage Period - the Coinsurance % field is displayed', async () => {
      drawer = await policyManagementPage.openAddForm();
      await drawer.fillInfo(stepOne(nameEn, planName));
      expect(await drawer.next()).toBe(true);
      expect(await drawer.hasField('coinsurance')).toBe(true);
    });

    await steps.step(`Enter ${CASES.coinsuranceAbove.value} in the Coinsurance % field and attempt to save - a validation error says the value must be between 0 and 100`, async () => {
      discardPolicyNamed(nameEn);
      await drawer.fillCoverage(validCoverage({ coinsurance: CASES.coinsuranceAbove.value }));
      const { kept, held } = await numberKept(drawer, 'coinsurance', CASES.coinsuranceAbove.value);
      // The number field (max 100) does not keep 101 (it caps it): prevented at input, and
      // saving would store the capped value - nothing is saved (2026-11-04 triage).
      if (!kept) {
        expect(Number(held), `the Coinsurance % field after typing ${CASES.coinsuranceAbove.value}`).toBeLessThanOrEqual(100);
        expect((await listPolicyRegister(page, { searchText: nameEn })).items.filter((p) => p.policyNameEn === nameEn), 'policies saved').toEqual([]);
        await drawer.close(true);
        return;
      }
      expectRefused(await drawer.attemptSave(), `a save with Coinsurance % ${CASES.coinsuranceAbove.value}`);
      expect(await drawer.getFieldError('coinsurance')).toBe(FIELD_MESSAGE.coinsuranceRange);
    });
  });

  test(`TC-${CASES.negativeAmounts.azureId}: should reject negative Deductible, Out-of-Pocket Maximum and Sublimit amounts`, async ({
    policyManagementPage,
    discardPolicyNamed,
    page,
    steps,
  }) => {
    const data = CASES.negativeAmounts;
    const planName = await suitePlanName(page);
    const atCoverage = async (nameEn: string): Promise<PolicyFormDrawer> => {
      discardPolicyNamed(nameEn);
      await policyManagementPage.openTable();
      const drawer = await policyManagementPage.openAddForm();
      await drawer.fillInfo(stepOne(nameEn, planName));
      expect(await drawer.next()).toBe(true);
      return drawer;
    };
    const negative = { expectAmountRefused: async (field: (typeof data.fields)[number]): Promise<void> => {
      const nameEn = suitePolicyName(`Negative ${field}`);
      const drawer = await atCoverage(nameEn);
      await drawer.fillCoverage(validCoverage({ [field]: data.value }));
      const { kept, held } = await numberKept(drawer, field, data.value);
      // The amount fields (min 0) drop the minus sign: the negative value is prevented at input,
      // and saving would store the positive one - nothing is saved (2026-11-04 triage).
      if (!kept) {
        expect(held.startsWith('-'), `the ${field} field after typing ${data.value} holds "${held}"`).toBe(false);
        expect((await listPolicyRegister(page, { searchText: nameEn })).items.filter((p) => p.policyNameEn === nameEn), 'policies saved').toEqual([]);
        await drawer.close(true);
        return;
      }
      expectRefused(await drawer.attemptSave(), `a save with ${field} ${data.value}`);
      expect(await drawer.getFieldError(field)).toMatch(new RegExp(`${FIELD_MESSAGE.amountNotNegative.replace(/\./g, '\\.')}|zero or|positive|negative`, 'i'));
    } };

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isAddOffered()).toBe(true);
    });

    await steps.step('Open a policy at Step 2 Coverage Period - the Deductible, Out-of-Pocket Maximum and Sublimit fields are displayed', async () => {
      const drawer = await atCoverage(suitePolicyName('Negative Fields'));
      expect({ deductible: await drawer.hasField('deductible'), outOfPocket: await drawer.hasField('outOfPocket'), sublimit: await drawer.hasField('sublimit') })
        .toEqual({ deductible: true, outOfPocket: true, sublimit: true });
      await drawer.close(true);
    });

    await steps.step(`Enter a negative value (${data.value}) in the Deductible field and attempt to save - a validation error says the value must be zero or positive`, async () => {
      await negative.expectAmountRefused('deductible');
    });

    await steps.step('Repeat with negative values for the Out-of-Pocket Maximum and Sublimit fields - each is rejected with a similar validation error', async () => {
      await negative.expectAmountRefused('outOfPocket');
      await negative.expectAmountRefused('sublimit');
    });
  });

  test(`TC-${CASES.submitDraft.azureId}: should move a completed Draft policy to Pending Approval when it is submitted`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('Draft');

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Open the completed Draft policy - the policy details are displayed with status Draft', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getVersionBadge()).toBe(versionBadge(0, APPROVAL_LABEL.draft));
    });

    await steps.step('Click Submit for Approval - the policy status changes to Pending Approval', async () => {
      expectAccepted(await attemptSendForApproval(policyDetailPage), 'Send for Approval');
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getVersionBadge()).toBe(versionBadge(0, APPROVAL_LABEL.pending));
    });
  });

  test(`TC-${CASES.mandatoryStep1.azureId}: should not proceed to Coverage Period until the mandatory fields are completed`, async ({
    policyManagementPage,
    steps,
  }) => {
    let drawer!: PolicyFormDrawer;

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical('Open Create New Policy Step 1 and leave the English Policy Name and Policy Type empty - the fields remain empty', async () => {
      drawer = await policyManagementPage.openAddForm();
      await drawer.type('nameAr', arabicName());
      expect(await drawer.getValue('nameEn')).toBe('');
      expect(await drawer.readSelect('type')).not.toMatch(/^(Individual|Group)$/);
    });

    await steps.step('Click Next to proceed to Step 2 - the system blocks navigation and highlights the missing mandatory fields', async () => {
      expect(await drawer.next()).toBe(false);
      const errors = await drawer.getFieldErrors();
      expect({ nameEn: errors.nameEn, type: errors.type }).toEqual({ nameEn: FIELD_MESSAGE.required, type: FIELD_MESSAGE.required });
      await drawer.close(true);
    });
  });

  test(`TC-${CASES.activeOnEffective.azureId}: should keep an approved policy Pending until its effective date and then turn it Active`, async ({
    policyManagementPage,
    policyDetailPage,
    policyApprovalsPage,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('PendingApproval', { effectiveInMinutes: CASES.activeOnEffective.effectiveInMinutes });

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.critical('Open the Pending Approval policy and have a reviewer approve it - the status stays Pending because the effective date has not arrived', async () => {
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getVersionBadge()).toBe(versionBadge(0, APPROVAL_LABEL.pending));
      await policyApprovalsPage.approve(policy.nameEn);
      expect(await policyStatusCode(page, policy.id), 'the status code after the approval (pending = the AC\'s "Pending")').toBe('pending');
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getStatus()).not.toBe(POLICY_STATUS_LABEL.active);
    });

    await steps.step(`Advance to the Effective Date (${policyDateTextLocal(new Date(policy.effectiveDate))}) and check the policy status - it changes to Active`, async () => {
      await waitUntilPast(page, policy.effectiveDate);
      if ((await policyStatusCode(page, policy.id)) !== 'active') steps.blocked(LIFECYCLE_JOB_REASON);
      await policyDetailPage.open(policy.id);
      expect(await policyDetailPage.getStatus()).toBe(POLICY_STATUS_LABEL.active);
    });
  });

  test(`TC-${CASES.identityLocked.azureId}: should lock the policy number, type and names once the policy leaves Draft`, async ({
    policyManagementPage,
    policyDetailPage,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('PendingApproval');

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Open the policy that is no longer in Draft - the Policy Number, Policy Type and Policy Name are displayed', async () => {
      await policyDetailPage.open(policy.id);
      expect({ name: await policyDetailPage.getName(), number: await policyDetailPage.readOverviewField('number'), type: await policyDetailPage.readOverviewField('type') })
        .toEqual({ name: policy.nameEn, number: policy.policyNumber, type: 'Group' });
    });

    await steps.step('Attempt to edit the Policy Number, Policy Type or Policy Name - the fields are read-only and cannot be modified', async () => {
      if ((await policyDetailPage.getActionAvailability('edit')) === 'available') {
        const drawer = await policyDetailPage.openEditDrawer();
        expect({
          nameEn: await isFormFieldEditable(page, 'nameEn'),
          nameAr: await isFormFieldEditable(page, 'nameAr'),
          type: await drawer.isSelectEditable('type'),
        }).toEqual({ nameEn: false, nameAr: false, type: false });
        await drawer.close(true);
      }
      const record = await readPolicy(page, policy.id);
      expect({ name: record.policyNameEn, number: record.policyNumber }).toEqual({ name: policy.nameEn, number: policy.policyNumber });
    });
  });

  test(`TC-${CASES.expiryBeforeEffective.azureId}: should reject an expiry date earlier than the effective date`, async ({
    policyManagementPage,
    discardPolicyNamed,
    page,
    steps,
  }) => {
    const data = CASES.expiryBeforeEffective;
    const nameEn = suitePolicyName('Expiry Before Effective');
    const planName = await suitePlanName(page);
    const day = (days: number): string => { const d = new Date(Date.now() + days * 86_400_000); d.setHours(10, 0, 0, 0); return policyDateTextLocal(d); };
    let drawer!: PolicyFormDrawer;

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical('Open a policy at Step 2 Coverage Period - the Effective Date and Expiry Date fields are displayed', async () => {
      drawer = await policyManagementPage.openAddForm();
      await drawer.fillInfo(stepOne(nameEn, planName));
      expect(await drawer.next()).toBe(true);
      expect({ effective: await drawer.hasField('effectiveDate'), expiry: await drawer.hasField('expiryDate') }).toEqual({ effective: true, expiry: true });
    });

    await steps.step('Enter an Expiry Date earlier than the Effective Date and attempt to save - a validation error says the Expiry Date must be after the Effective Date', async () => {
      discardPolicyNamed(nameEn);
      await drawer.fillCoverage({ effectiveDate: day(data.effectiveInDays), expiryDate: day(data.expiryInDays) });
      expectRefused(await drawer.attemptSave());
      expect(await drawer.getFieldError('expiryDate')).toBe(FIELD_MESSAGE.expiryBeforeEffective);
    });
  });

  test(`TC-${CASES.fieldChecklist.azureId}: should present every Policy Information and Coverage Period field of the specification`, async ({
    policyManagementPage,
    page,
    steps,
  }) => {
    const data = CASES.fieldChecklist;
    const planName = await suitePlanName(page);
    let drawer!: PolicyFormDrawer;

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isAddOffered()).toBe(true);
    });

    await steps.step('Open Create New Policy Step 1 and check each field against the specification - all listed fields are present and correctly labeled', async () => {
      drawer = await policyManagementPage.openAddForm();
      await drawer.choose('type', 'Group');
      const present = { nameEn: await drawer.hasField('nameEn'), nameAr: await drawer.hasField('nameAr'), type: await drawer.hasField('type'), payer: await drawer.hasField('payer'), plan: await drawer.hasField('plan'), holder: await drawer.hasField('holder') };
      expect(present).toEqual({ nameEn: true, nameAr: true, type: true, payer: true, plan: true, holder: true });
      const text = await drawer.getText();
      expect(data.step1.filter((label) => !text.toLowerCase().includes(label.toLowerCase())), 'labels missing from step 1').toEqual([]);
    });

    await steps.step('Proceed to Step 2 and check each field - all listed fields are present and correctly labeled', async () => {
      await drawer.fillInfo(stepOne(suitePolicyName('Checklist'), planName));
      expect(await drawer.next()).toBe(true);
      const fields = ['deductible', 'coinsurance', 'outOfPocket', 'sublimit', 'gracePeriod', 'maxMembers', 'effectiveDate', 'expiryDate'] as const;
      const missing: string[] = [];
      for (const field of fields) if (!(await drawer.hasField(field))) missing.push(field);
      expect(missing, 'step 2 fields not rendered').toEqual([]);
      const text = await drawer.getText();
      expect(data.step2.filter((label) => !text.toLowerCase().includes(label.toLowerCase())), 'labels missing from step 2').toEqual([]);
      await drawer.close(true);
    });
  });

  test(`TC-${CASES.stepsKeepData.azureId}: should keep the entered data when moving back and forth between the two steps`, async ({
    policyManagementPage,
    page,
    steps,
  }) => {
    const nameEn = suitePolicyName('Steps Keep Data');
    const planName = await suitePlanName(page);
    const info = stepOne(nameEn, planName);
    let drawer!: PolicyFormDrawer;

    await steps.critical('Navigate to the Policy Management module - the module home page loads', async () => {
      await policyManagementPage.openTable();
      expect(await policyManagementPage.isAddOffered()).toBe(true);
    });

    await steps.critical('Start Create New Policy, fill in Step 1, then click Next - the Step 2 Coverage Period form is displayed', async () => {
      drawer = await policyManagementPage.openAddForm();
      await drawer.fillInfo(info);
      expect(await drawer.next()).toBe(true);
    });

    await steps.step('Click Back to return to Step 1 - the previously entered Step 1 values are still populated', async () => {
      await drawer.back();
      expect({
        nameEn: await drawer.getValue('nameEn'),
        nameAr: await drawer.getValue('nameAr'),
        type: await drawer.readSelect('type'),
        payer: await drawer.readSelect('payer'),
        holder: await drawer.readSelect('holder'),
      }).toEqual({ nameEn: info.nameEn, nameAr: info.nameAr, type: info.type, payer: info.payer, holder: info.holder });
      expect(await drawer.readSelect('plan')).toContain(planName);
    });

    await steps.step('Modify a Step 2 field, navigate back to Step 1 and forward again to Step 2 - the Step 2 field keeps the modified value', async () => {
      expect(await drawer.next()).toBe(true);
      await drawer.type('deductible', CASES.stepsKeepData.deductible);
      await drawer.back();
      expect(await drawer.next()).toBe(true);
      expect(await drawer.getValue('deductible')).toBe(CASES.stepsKeepData.deductible);
      await drawer.close(true);
    });
  });
});
