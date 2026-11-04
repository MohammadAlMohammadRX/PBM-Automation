import { test, expect } from '../../../fixtures';
import { VERSION_CHANGE_LABEL } from '../../../data/policy/policy.data';
import { ADMIN_NAME, CASES, EMPTY_CELL, VERSION_COLUMNS } from '../../../data/policy/viewVersionHistory.data';
import { policyDayText, readPolicy } from '../../../utils/PolicyProvisioning';
import {
  ERROR_MESSAGE,
  activateAndPublish,
  isOrdered,
  provisionOrBlock,
  publishDocumentChanges,
  publishStaged,
  stageAndReject,
  stageAndSubmit,
  versionNumber,
  visibleMessages,
} from '../../../utils/policy/writerAHelpers';

/**
 * User story 15185: View Policy - Version History.
 * Numbered versions with requester / reviewer, the read-only Version Details,
 * reverting to a published or superseded version (staged and approved, as
 * every published change is), refusing a never-approved one, the advanced
 * search and the table's columns. See the data file for how the cases' wording
 * maps onto the application.
 */
test.describe('US 15185 - View Policy - Version History', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.numbered.azureId}: should list every version of a policy numbered in sequence 1, 2, 3`, async ({
    policyManagementPage: list,
    policyVersionHistoryTab: versions,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Future');
    await provisionOrBlock('a policy with three approved versions', () => publishDocumentChanges(page, policy, CASES.numbered.changes));
    let numbers: number[] = [];

    await steps.critical('Navigate to the Policy Management module - the module home screen shows the policy list', async () => {
      await list.openTable();
      expect(await list.isListed(policy.nameEn)).toBe(true);
    });

    await steps.step('Open the policy and select the Version History tab - a list of versions loads', async () => {
      await list.openDetails(policy.nameEn);
      await versions.open();
      numbers = (await versions.readRows()).map((r) => versionNumber(r.version));
      expect(numbers.length, 'versions listed').toBe(CASES.numbered.changes + 1);
    });

    await steps.step('Review the sequence of version numbers - they are displayed in numbered order (1, 2, 3)', async () => {
      expect([...numbers].sort((a, b) => a - b), 'the version numbers').toEqual([1, 2, 3]);
      expect(isOrdered(numbers, (a, b) => b - a) || isOrdered(numbers, (a, b) => a - b), `displayed order ${numbers.join(', ')}`).toBe(true);
    });
  });

  test(`TC-${CASES.requesterReviewer.azureId}: should show who requested and reviewed each version and when`, async ({
    policyManagementPage: list,
    policyDetailPage: detail,
    policyVersionHistoryTab: versions,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('Future');
    let rows: Awaited<ReturnType<typeof versions.readRows>> = [];

    await steps.critical('Navigate to the Policy Management module - the module home screen shows the policy list', async () => {
      await list.openTable();
    });

    await steps.step('Open the policy\'s Version History table - it lists the existing versions', async () => {
      await detail.open(policy.id);
      await versions.open();
      rows = await versions.readRows();
      expect(rows.length).toBeGreaterThan(0);
    });

    await steps.step('Inspect a version row - Requested By, Requested On, Reviewed By and Reviewed On are all populated', async () => {
      const approved = rows.find((r) => versionNumber(r.version) === 1);
      const blank = (['requestedBy', 'requestedOn', 'reviewedBy', 'reviewedOn'] as const).filter((key) => EMPTY_CELL.test(approved?.[key] ?? ''));
      expect(blank, `v1: ${JSON.stringify(approved)}`).toEqual([]);
    });
  });

  test(`TC-${CASES.readOnlyDetail.azureId}: should show a prior version's details with no editable field`, async ({
    policyManagementPage: list,
    policyDetailPage: detail,
    policyVersionHistoryTab: versions,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Future');
    await provisionOrBlock('a policy with a prior version', () => publishDocumentChanges(page, policy, CASES.readOnlyDetail.changes));

    await steps.critical('Navigate to the Policy Management module - the module home screen shows the policy list', async () => {
      await list.openTable();
    });

    await steps.step('Open Version History and select View Details on a prior version - the version detail screen opens', async () => {
      await detail.open(policy.id);
      await versions.open();
      const fields = await versions.viewVersion('v1');
      expect(fields.nameEn, 'the prior version\'s name').toBe(policy.nameEn);
    });

    await steps.step('Attempt to edit any field on the detail screen - no field is editable, every control is read-only', async () => {
      expect(await versions.isDrawerReadOnly(), `the drawer: ${(await versions.getDrawerText()).slice(0, 200)}`).toBe(true);
    });
  });

  test(`TC-${CASES.revertPublished.azureId}: should restore a previously published version and log the revert as a new version`, async ({
    policyManagementPage: list,
    policyDetailPage: detail,
    policyVersionHistoryTab: versions,
    policyIn,
    page,
    steps,
  }) => {
    const target = CASES.revertPublished.target;
    const policy = await policyIn('Inactive');
    await provisionOrBlock('a policy on version 3 (Created, Deactivated, Activated)', () => activateAndPublish(page, policy));
    let wanted = '';
    let before = 0;

    await steps.critical('Navigate to the Policy Management module - the module home screen shows the policy list', async () => {
      await list.openTable();
    });

    await steps.step(`Open Version History and locate version ${target} - the Revert action is available on its row`, async () => {
      await detail.open(policy.id);
      await versions.open();
      before = (await versions.readRows()).length;
      expect(await versions.getRevertAvailability(target), `Revert on ${target}`).toBe('available');
    });

    await steps.step('Select Revert and confirm - the policy\'s current configuration updates to match the version\'s values', async () => {
      wanted = (await versions.viewVersion(target)).businessStatus;
      await versions.closeVersion();
      const answer = await versions.revertTo(target);
      expect(answer.status, `RevertPolicyVersion: ${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBeLessThan(300);
      await publishStaged(page, policy);
      await detail.open(policy.id);
      expect({ status: await detail.getStatus(), wanted: wanted !== '' }).toEqual({ status: wanted, wanted: true });
    });

    await steps.step('Review the version history again - a new version entry reflects the revert', async () => {
      await versions.open();
      const rows = await versions.readRows();
      const newest = rows.reduce((top, r) => (versionNumber(r.version) > versionNumber(top.version) ? r : top), rows[0]);
      expect({ added: rows.length - before, change: newest?.change }).toEqual({ added: 1, change: VERSION_CHANGE_LABEL.revert });
    });
  });

  test(`TC-${CASES.revertSuperseded.azureId}: should restore a superseded version as the policy's current configuration`, async ({
    policyManagementPage: list,
    policyDetailPage: detail,
    policyVersionHistoryTab: versions,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Inactive');
    let superseded = '';

    await steps.critical('Navigate to the Policy Management module - the module home screen shows the policy list', async () => {
      await list.openTable();
    });

    await steps.step('Open Version History and locate a Superseded version - the Revert action is available on its row', async () => {
      await detail.open(policy.id);
      await versions.open();
      superseded = (await versions.readRows()).find((r) => r.status === CASES.revertSuperseded.superseded)?.version ?? '';
      expect(superseded, 'a Superseded row').not.toBe('');
      expect(await versions.getRevertAvailability(superseded), `Revert on ${superseded}`).toBe('available');
    });

    await steps.step('Select Revert and confirm - the policy\'s current configuration updates to match the superseded version\'s values', async () => {
      const wanted = (await versions.viewVersion(superseded)).businessStatus;
      await versions.closeVersion();
      const answer = await versions.revertTo(superseded);
      expect(answer.status, `RevertPolicyVersion: ${answer.text.slice(0, 200)}`).toBeLessThan(300);
      await publishStaged(page, policy);
      await detail.open(policy.id);
      expect({ status: await detail.getStatus(), active: (await readPolicy(page, policy.id)).isActive }).toEqual({ status: wanted, active: true });
    });
  });

  test(`TC-${CASES.neverApproved.azureId}: should not offer or allow a revert to a version that was never approved`, async ({
    policyManagementPage: list,
    policyDetailPage: detail,
    policyVersionHistoryTab: versions,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('PendingChange');
    let pending = '';

    await steps.critical('Navigate to the Policy Management module - the module home screen shows the policy list', async () => {
      await list.openTable();
    });

    await steps.step('Open Version History and locate the Pending version row - the Revert action is disabled or hidden', async () => {
      await detail.open(policy.id);
      await versions.open();
      pending = (await versions.readRows()).find((r) => r.status === CASES.neverApproved.pending)?.version ?? '';
      expect(pending, 'a Pending Approval row').not.toBe('');
      expect(await versions.getRevertAvailability(pending), `Revert on ${pending}`).not.toBe('available');
    });

    await steps.step('Attempt to trigger the revert directly - the system blocks the action', async () => {
      const answer = await versions.revertViaApi(policy.id, versionNumber(pending));
      expect(answer.status, `RevertPolicyVersion to ${pending}: ${answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
    });
  });

  test(`TC-${CASES.filterStatus.azureId}: should list only the versions of the chosen approval status`, async ({
    policyManagementPage: list,
    policyDetailPage: detail,
    policyVersionHistoryTab: versions,
    policyIn,
    page,
    steps,
  }) => {
    const status = CASES.filterStatus.status;
    const policy = await policyIn('Future');
    await provisionOrBlock('a policy with Approved, Superseded, Rejected and Pending versions', async () => {
      await publishDocumentChanges(page, policy, 1);
      await stageAndReject(page, policy);
      await stageAndSubmit(page, policy);
    });
    let rows: Awaited<ReturnType<typeof versions.readRows>> = [];

    await steps.critical('Navigate to the Policy Management module - the module home screen shows the policy list', async () => {
      await list.openTable();
    });

    await steps.step('Open Version History and open Advanced Search - the filter panel is displayed', async () => {
      await detail.open(policy.id);
      await versions.open();
      expect(await versions.getAdvancedSearchLabels()).toEqual(expect.arrayContaining([expect.stringMatching(/approval status/i)]));
    });

    await steps.step(`Set the Approval Status filter to "${status}" and apply - the table refreshes`, async () => {
      rows = await versions.applyFilter({ status });
      expect(rows.length, `rows for "${status}"`).toBeGreaterThan(0);
    });

    await steps.step(`Review the results - only versions with Approval Status ${status} are listed`, async () => {
      expect(rows.filter((r) => r.status !== status).map((r) => `${r.version} ${r.status}`)).toEqual([]);
    });
  });

  test(`TC-${CASES.detailFields.azureId}: should show every required field of a version in its read-only details`, async ({
    policyManagementPage: list,
    policyDetailPage: detail,
    policyVersionHistoryTab: versions,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('Future', { gracePeriodDays: CASES.detailFields.gracePeriodDays });
    let fields: Awaited<ReturnType<typeof versions.viewVersion>>;

    await steps.critical('Navigate to the Policy Management module - the module home screen shows the policy list', async () => {
      await list.openTable();
    });

    await steps.step('Open Version History and select View Details on a version - the detail screen loads in read mode', async () => {
      await detail.open(policy.id);
      await versions.open();
      fields = await versions.viewVersion('v1');
      expect(await versions.isDrawerReadOnly()).toBe(true);
    });

    await steps.step('Inspect every field - Version, Approval Status, Status, both names, Plan, Payer, dates, Grace Period and the version\'s networks are shown correctly', async () => {
      const text = await versions.getDrawerText();
      expect({
        version: /\bv1\b|version\s*:?\s*1\b/i.test(text),
        approvalStatus: fields.approvalStatus,
        status: fields.businessStatus,
        nameEn: fields.nameEn,
        nameAr: fields.nameAr,
        plan: fields.plan,
        payer: fields.payer,
        dates: fields.effectiveDate !== '' && fields.expiryDate !== '',
        grace: fields.gracePeriod.includes(String(CASES.detailFields.gracePeriodDays)),
        networks: policy.networks.every((n) => fields.networks.includes(n.networkCode)),
      }, `drawer: ${text.slice(0, 300)}`).toEqual({
        version: true,
        approvalStatus: 'Approved',
        status: 'Future',
        nameEn: policy.nameEn,
        nameAr: policy.nameAr,
        plan: policy.planName,
        payer: policy.payerName,
        dates: true,
        grace: true,
        networks: true,
      });
    });
  });

  test(`TC-${CASES.combinedFilters.azureId}: should apply change type, requester, reviewer and requested date together with AND logic`, async ({
    policyManagementPage: list,
    policyDetailPage: detail,
    policyVersionHistoryTab: versions,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Future');
    await provisionOrBlock('a policy with a second, updated version', () => publishDocumentChanges(page, policy, 1));
    const today = policyDayText(new Date());
    let change = '';
    let rows: Awaited<ReturnType<typeof versions.readRows>> = [];

    await steps.critical('Navigate to the Policy Management module - the module home screen shows the policy list', async () => {
      await list.openTable();
    });

    await steps.step('Open Version History and open Advanced Search - the filter panel is displayed', async () => {
      await detail.open(policy.id);
      await versions.open();
      change = (await versions.readRows()).find((r) => versionNumber(r.version) === 2)?.change ?? '';
      const labels = await versions.getAdvancedSearchLabels();
      expect(labels).toEqual(expect.arrayContaining([expect.stringMatching(/change/i), expect.stringMatching(/requested by/i), expect.stringMatching(/reviewed by/i), expect.stringMatching(/requested on/i)]));
    });

    await steps.step(`Set Change "${change}", Requested By and Reviewed By "${ADMIN_NAME}" and Requested On today together, then apply - the table refreshes`, async () => {
      rows = await versions.applyFilter({ change, requestedBy: ADMIN_NAME, reviewedBy: ADMIN_NAME, requestedOn: `${today} - ${today}` });
      expect(rows.length, 'rows for the combination').toBeGreaterThan(0);
    });

    await steps.step('Review the results - only the versions matching every criterion at once are listed', async () => {
      expect(rows.map((r) => ({ version: r.version, change: r.change, requestedBy: r.requestedBy, reviewedBy: r.reviewedBy })))
        .toEqual([{ version: 'v2', change, requestedBy: ADMIN_NAME, reviewedBy: ADMIN_NAME }]);
    });
  });

  test(`TC-${CASES.emptyFilter.azureId}: should show an empty-state message when no version matches the advanced search`, async ({
    policyManagementPage: list,
    policyDetailPage: detail,
    policyVersionHistoryTab: versions,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Future');
    let rows: Awaited<ReturnType<typeof versions.readRows>> = [];

    await steps.critical('Navigate to the Policy Management module - the module home screen shows the policy list', async () => {
      await list.openTable();
    });

    await steps.step('Open Version History and open Advanced Search - the filter panel is displayed', async () => {
      await detail.open(policy.id);
      await versions.open();
      expect(await versions.getAdvancedSearchLabels()).toEqual(expect.arrayContaining([expect.stringMatching(/requested by/i)]));
    });

    await steps.step(`Enter Requested By "${CASES.emptyFilter.requestedBy}", who never submitted a change, and apply - the table refreshes`, async () => {
      rows = await versions.applyFilter({ requestedBy: CASES.emptyFilter.requestedBy });
      expect(rows.length).toBe(0);
    });

    await steps.step('Review the results area - an empty-state message is shown instead of an error or stale data', async () => {
      const message = await versions.getEmptyStateText();
      expect({ message: message !== '', errors: (await visibleMessages(page)).filter((m) => ERROR_MESSAGE.test(m)) }, `empty state "${message}"`).toEqual({ message: true, errors: [] });
    });
  });

  test(`TC-${CASES.columns.azureId}: should show every required column with data for each version`, async ({
    policyManagementPage: list,
    policyDetailPage: detail,
    policyVersionHistoryTab: versions,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('Future');

    await steps.critical('Navigate to the Policy Management module - the module home screen shows the policy list', async () => {
      await list.openTable();
    });

    await steps.step('Open Version History for the policy - the version table loads', async () => {
      await detail.open(policy.id);
      await versions.open();
      expect(await versions.countRows()).toBeGreaterThan(0);
    });

    await steps.step('Inspect the table header and a data row - every required column is present and populated', async () => {
      const headers = await versions.getHeaders();
      const missing = VERSION_COLUMNS.filter(([, header]) => !headers.some((h) => header.test(h))).map(([name]) => name);
      const [row] = await versions.readRows();
      const blank = Object.entries(row ?? {}).filter(([key, value]) => key !== 'rowId' && EMPTY_CELL.test(value)).map(([key]) => key);
      expect({ missing, blank }, `headers shown: ${headers.join(', ')}`).toEqual({ missing: [], blank: [] });
    });
  });

  test(`TC-${CASES.sequential.azureId}: should number the next approved change exactly one above the current version`, async ({
    policyManagementPage: list,
    policyDetailPage: detail,
    policyVersionHistoryTab: versions,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Future');

    await steps.critical('Navigate to the Policy Management module - the module home screen shows the policy list', async () => {
      await list.openTable();
    });

    await steps.step('Submit and get approval for a change to the policy - a new version is created', async () => {
      await publishDocumentChanges(page, policy, 1);
      expect((await versions.fetchVersions(policy.id)).length, 'versions after the approval').toBe(2);
    });

    await steps.step('Open Version History - the new version is numbered 2, directly following version 1', async () => {
      await detail.open(policy.id);
      await versions.open();
      const numbers = (await versions.readRows()).map((r) => versionNumber(r.version)).sort((a, b) => a - b);
      expect(numbers).toEqual([1, 2]);
    });
  });

  test(`TC-${CASES.preservesHistory.azureId}: should keep every earlier version unchanged and add a new version when reverting`, async ({
    policyManagementPage: list,
    policyDetailPage: detail,
    policyVersionHistoryTab: versions,
    policyIn,
    page,
    steps,
  }) => {
    const target = CASES.preservesHistory.target;
    const policy = await policyIn('Inactive');
    await provisionOrBlock('a policy on version 3 (Created, Deactivated, Activated)', () => activateAndPublish(page, policy));
    let before: Awaited<ReturnType<typeof versions.readRows>> = [];

    await steps.critical('Navigate to the Policy Management module - the module home screen shows the policy list', async () => {
      await list.openTable();
    });

    await steps.step(`Open Version History and revert to version ${target} - the policy's live data matches version ${target}`, async () => {
      await detail.open(policy.id);
      await versions.open();
      before = await versions.readRows();
      const wanted = (await versions.viewVersion(target)).businessStatus;
      await versions.closeVersion();
      const answer = await versions.revertTo(target);
      expect(answer.status, `RevertPolicyVersion: ${answer.text.slice(0, 200)}`).toBeLessThan(300);
      await publishStaged(page, policy);
      await detail.open(policy.id);
      expect(await detail.getStatus()).toBe(wanted);
    });

    await steps.step('Review the full version history - versions 1, 2 and 3 are all present and unchanged, with a new version 4 for the revert', async () => {
      await versions.open();
      const after = await versions.readRows();
      const facts = (rows: typeof after, n: number) => {
        const row = rows.find((r) => versionNumber(r.version) === n);
        return row ? { change: row.change, requestedBy: row.requestedBy, requestedOn: row.requestedOn, reviewedBy: row.reviewedBy, reviewedOn: row.reviewedOn } : null;
      };
      expect([1, 2, 3].map((n) => facts(after, n)), 'versions 1-3 after the revert').toEqual([1, 2, 3].map((n) => facts(before, n)));
      expect(facts(after, 4)?.change ?? 'no version 4', 'the revert\'s own version').toBe(VERSION_CHANGE_LABEL.revert);
    });
  });

  test(`TC-${CASES.currentVersion.azureId}: should make no change when Revert is attempted on the currently active version`, async ({
    policyManagementPage: list,
    policyDetailPage: detail,
    policyVersionHistoryTab: versions,
    policyIn,
    page,
    steps,
  }) => {
    const current = CASES.currentVersion.current;
    const policy = await policyIn('Future');
    let offered: 'absent' | 'disabled' | 'available' = 'absent';
    let before = 0;

    await steps.critical('Navigate to the Policy Management module - the module home screen shows the policy list', async () => {
      await list.openTable();
    });

    await steps.step(`Open Version History and select Revert on ${current}, the current active version - the system evaluates the request`, async () => {
      await detail.open(policy.id);
      await versions.open();
      before = (await versions.fetchVersions(policy.id)).length;
      offered = await versions.getRevertAvailability(current);
      const answer = offered === 'available' ? await versions.revertTo(current) : null;
      expect(answer === null || answer.status !== -1, `Revert offered "${offered}", answered ${answer?.status}`).toBe(true);
    });

    await steps.step('Observe the result - either the action is disabled for the current version or it completes with no functional change', async () => {
      const record = await readPolicy(page, policy.id);
      const after = (await versions.fetchVersions(policy.id)).length;
      expect({ noChange: offered !== 'available' || (after === before && !record.hasDraft && !record.hasPendingVersion) }, `Revert ${offered}; versions ${before} -> ${after}; draft ${record.hasDraft}`)
        .toEqual({ noChange: true });
    });
  });
});
