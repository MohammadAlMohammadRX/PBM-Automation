import { test, expect } from '../../../fixtures';
import { VERSION_CHANGE_LABEL } from '../../../data/policy/policy.data';
import { ADMIN_NAME, APPROVED, CASES, DATE_TIME, EMPTY_CELL, REVIEWER_FILTER_LABEL, VERSION_COLUMNS } from '../../../data/policy/viewVersionHistory.data';
import { approvePolicy, policyDayText, readPolicy, waitForPolicy } from '../../../utils/PolicyProvisioning';
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
 * User story 15185: View Policy - Version History (amended 18 Nov 2026).
 * Numbered versions with requester / approver, the read-only Version Details,
 * reverting to an earlier approved version (staged and approved, as every
 * published change is), only approved changes becoming versions (not a rejected
 * change, not a pending one, not the first draft), the advanced search and the
 * table's columns. See the data file for how the cases' wording maps onto the
 * application.
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

  test(`TC-${CASES.requesterReviewer.azureId}: should show who requested and approved each version and when`, async ({
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

    await steps.step('Select the policy and click View to open its Version History table - it lists the existing versions', async () => {
      await detail.open(policy.id);
      await versions.open();
      rows = await versions.readRows();
      expect(rows.length).toBeGreaterThan(0);
    });

    // Approved By / On are the `reviewedby` / `reviewedon` cells, relabelled in the build of 14 Nov 2026.
    await steps.step('Inspect a version row - Requested By, Requested On, Approved By and Approved On are all populated', async () => {
      const approved = rows.find((r) => versionNumber(r.version) === 1);
      const labels = { requestedBy: 'Requested By', requestedOn: 'Requested On', reviewedBy: 'Approved By', reviewedOn: 'Approved On' } as const;
      const blank = (Object.keys(labels) as (keyof typeof labels)[]).filter((key) => EMPTY_CELL.test(approved?.[key] ?? '')).map((key) => labels[key]);
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

  // 22 Nov 2026: the case's title, its final expected result and the story say an earlier approved version CAN be
  // reverted to; its steps 2-3 say Revert is disabled and blocked. The title and the story are asserted (data file).
  test(`TC-${CASES.revertEarlierApproved.azureId}: should let the compliance officer revert a policy to an earlier approved version from the version history`, async ({
    policyManagementPage: list,
    policyDetailPage: detail,
    policyVersionHistoryTab: versions,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Inactive');
    let earlier = '';

    await steps.critical('Navigate to the Policy Management module - the module home screen shows the policy list', async () => {
      await list.openTable();
    });

    // The earlier version is taken whatever its label, so the revert is still exercised: on 23 Nov 2026 it read
    // "Superseded" where the amended story says every version reads "Approved" - reported here, not a reason to stop.
    await steps.step('Select the policy, click View, open Version History and locate an earlier Approved version - the Revert action is available on its row', async () => {
      await detail.open(policy.id);
      await versions.open();
      const rows = await versions.readRows();
      const current = Math.max(...rows.map((r) => versionNumber(r.version)));
      const row = rows.find((r) => versionNumber(r.version) < current);
      earlier = row?.version ?? '';
      expect(earlier, `an earlier version among ${rows.map((r) => `${r.version} ${r.status}`).join(', ')}`).not.toBe('');
      expect({ approvalStatus: row?.status ?? '', revert: await versions.getRevertAvailability(earlier) }, `${earlier} among ${rows.map((r) => `${r.version} ${r.status}`).join(', ')}`)
        .toEqual({ approvalStatus: APPROVED, revert: 'available' });
    });

    await steps.step('Trigger Revert on that approved version and confirm - the policy is restored to that version\'s values', async () => {
      const wanted = (await versions.viewVersion(earlier)).businessStatus;
      await versions.closeVersion();
      const answer = await versions.revertTo(earlier);
      expect(answer.status, `RevertPolicyVersion: ${answer.text.slice(0, 200)}`).toBeLessThan(300);
      await publishStaged(page, policy);
      await detail.open(policy.id);
      expect({ status: await detail.getStatus(), active: (await readPolicy(page, policy.id)).isActive }).toEqual({ status: wanted, active: true });
    });
  });

  test(`TC-${CASES.rejectedExcluded.azureId}: should keep a rejected change out of Version History with no version number`, async ({
    policyManagementPage: list,
    policyDetailPage: detail,
    policyVersionHistoryTab: versions,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Future');
    let before: Awaited<ReturnType<typeof versions.readRows>> = [];

    await steps.critical('Navigate to the Policy Management module - the module home screen shows the policy list', async () => {
      await list.openTable();
      await detail.open(policy.id);
      await versions.open();
      before = await versions.readRows();
      expect(before.length, 'versions before the rejected change').toBeGreaterThan(0);
    });

    await steps.step('Submit a change to the policy and have it rejected in the Approval module - the rejection is recorded', async () => {
      await stageAndReject(page, policy);
      expect((await readPolicy(page, policy.id)).hasPendingVersion, 'no change left pending').toBe(false);
    });

    await steps.step('Select the policy, click View and open Version History - the rejected change is not listed and no version number was created for it', async () => {
      await detail.open(policy.id);
      await versions.open();
      const after = await versions.readRows();
      const top = (rows: typeof after): number => Math.max(0, ...rows.map((r) => versionNumber(r.version)));
      expect({
        rows: after.length,
        highest: top(after),
        rejectedRows: after.filter((r) => r.status === CASES.rejectedExcluded.rejected).map((r) => r.version),
      }, `after: ${after.map((r) => `${r.version} ${r.status} ${r.change}`).join(', ')}`).toEqual({
        rows: before.length,
        highest: top(before),
        rejectedRows: [],
      });
    });
  });

  // 22 Nov 2026: only approved changes become versions, so the filter on "Approved" returns the full list. The build of
  // 14 Nov offers no Approval Status field in the advanced search (VERIFIED 23 Nov) - step 2 reports it.
  test(`TC-${CASES.filterStatus.azureId}: should return the full version list, all Approved, when filtering by Approval Status Approved`, async ({
    policyManagementPage: list,
    policyDetailPage: detail,
    policyVersionHistoryTab: versions,
    policyIn,
    page,
    steps,
  }) => {
    const status = CASES.filterStatus.status;
    const policy = await policyIn('Future');
    await provisionOrBlock('a policy with two approved versions, a rejected change and a pending one', async () => {
      await publishDocumentChanges(page, policy, 1);
      await stageAndReject(page, policy);
      await stageAndSubmit(page, policy);
    });
    let all = 0;
    let rows: Awaited<ReturnType<typeof versions.readRows>> = [];

    await steps.critical('Navigate to the Policy Management module - the module home screen shows the policy list', async () => {
      await list.openTable();
    });

    await steps.step('Select the policy, click View, open Version History and open Advanced Search - the filter panel offers Approval Status', async () => {
      await detail.open(policy.id);
      await versions.open();
      all = (await versions.readRows()).length;
      const labels = await versions.getAdvancedSearchLabels();
      expect(labels, `fields offered: ${labels.join(', ')}`).toEqual(expect.arrayContaining([expect.stringMatching(/approval status/i)]));
    });

    await steps.step(`Set the Approval Status filter to "${status}" and apply - the table refreshes`, async () => {
      rows = await versions.applyFilter({ status });
      expect(rows.length, `rows for "${status}"`).toBeGreaterThan(0);
    });

    await steps.step(`Review the results - every version is listed and shows Approval Status ${status}; no Rejected or Pending entry exists`, async () => {
      expect({ rows: rows.length, others: rows.filter((r) => r.status !== status).map((r) => `${r.version} ${r.status}`) }).toEqual({ rows: all, others: [] });
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

    await steps.step('Select the policy, click View, open Version History and select View Details on a version - the detail screen loads in read mode', async () => {
      await detail.open(policy.id);
      await versions.open();
      fields = await versions.viewVersion('v1');
      expect(await versions.isDrawerReadOnly()).toBe(true);
    });

    // 22 Nov 2026: Policy Type, Policy Holder, Members and Documents in this version, Requested By / On and Approved By / On
    // were added to the fields the details must show. Members / Documents count as shown with their list or their
    // "none in this version" message.
    await steps.step('Inspect every field - Version, Approval Status, Status, both names, Plan, Payer, dates, Grace Period, networks, Policy Type, Policy Holder, members, documents, Requested By / On and Approved By / On are shown correctly', async () => {
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
        policyType: !EMPTY_CELL.test(fields.type),
        policyHolder: !EMPTY_CELL.test(fields.holder),
        members: fields.members !== '' || fields.membersEmpty !== '',
        documents: fields.documents !== '' || fields.documentsEmpty !== '',
        requestedBy: fields.requestedBy,
        requestedOn: DATE_TIME.test(fields.requestedOn),
        approvedBy: fields.approvedBy,
        approvedOn: DATE_TIME.test(fields.approvedOn),
      }, `drawer: ${text.slice(0, 400)}`).toEqual({
        version: true,
        approvalStatus: APPROVED,
        status: 'Future',
        nameEn: policy.nameEn,
        nameAr: policy.nameAr,
        plan: policy.planName,
        payer: policy.payerName,
        dates: true,
        grace: true,
        networks: true,
        policyType: true,
        policyHolder: true,
        members: true,
        documents: true,
        requestedBy: ADMIN_NAME,
        requestedOn: true,
        approvedBy: ADMIN_NAME,
        approvedOn: true,
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
      expect(labels).toEqual(expect.arrayContaining([expect.stringMatching(/change/i), expect.stringMatching(/requested by/i), expect.stringMatching(REVIEWER_FILTER_LABEL), expect.stringMatching(/requested on/i)]));
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

    // 22 Nov 2026: Approved By / Approved On replace Reviewed By / Reviewed On, and Approval Status always reads "Approved".
    await steps.step('Inspect the table header and a data row - Version, Change Type, Members, Networks, Approval Status (Approved), Requested By / On, Approved By / On and Actions are present and populated', async () => {
      const headers = await versions.getHeaders();
      const missing = VERSION_COLUMNS.filter(([, header]) => !headers.some((h) => header.test(h))).map(([name]) => name);
      const [row] = await versions.readRows();
      const blank = Object.entries(row ?? {}).filter(([key, value]) => key !== 'rowId' && EMPTY_CELL.test(value)).map(([key]) => key);
      expect({ missing, blank, approvalStatus: row?.status ?? '' }, `headers shown: ${headers.join(', ')}`).toEqual({ missing: [], blank: [], approvalStatus: APPROVED });
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

  // Added 22 Nov 2026 (story amended 18 Nov): the first draft of a new record is not counted as a version.
  test(`TC-${CASES.firstDraftNotCounted.azureId}: should not count the first draft of a new policy in Version History`, async ({
    policyManagementPage: list,
    policyDetailPage: detail,
    policyVersionHistoryTab: versions,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Draft');

    await steps.critical('Navigate to the Policy Management module - the module home screen shows the policy list', async () => {
      await list.openTable();
    });

    await steps.step('Create a new policy record and save it as a draft without submitting it for approval - the draft is saved', async () => {
      const record = await readPolicy(page, policy.id);
      expect({ draft: record.isPendingCreate, pending: record.hasPendingVersion, version: record.currentVersion }).toEqual({ draft: true, pending: false, version: 0 });
    });

    await steps.step('Select the policy, click View and open Version History - no entry is shown for the initial draft', async () => {
      await detail.open(policy.id);
      await versions.open();
      const rows = await versions.readRows();
      expect(rows.map((r) => `${r.version} ${r.status} ${r.change}`), 'versions of a never-approved draft').toEqual([]);
    });
  });

  // Added 22 Nov 2026 (story amended 18 Nov): a new version is created only when a change is approved.
  test(`TC-${CASES.versionOnlyOnApproval.azureId}: should add a new version only after the change is approved, not while it is pending`, async ({
    policyManagementPage: list,
    policyDetailPage: detail,
    policyVersionHistoryTab: versions,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Future');
    let before: Awaited<ReturnType<typeof versions.readRows>> = [];
    const top = (rows: typeof before): number => Math.max(0, ...rows.map((r) => versionNumber(r.version)));
    const listed = (rows: typeof before): string => rows.map((r) => `${r.version} ${r.status} ${r.change}`).join(', ');

    await steps.critical('Navigate to the Policy Management module - the module home screen shows the policy list', async () => {
      await list.openTable();
      await detail.open(policy.id);
      await versions.open();
      before = await versions.readRows();
      expect(before.length, 'versions before the change').toBeGreaterThan(0);
    });

    await steps.step('Submit a change to the policy and leave it pending in the Approval module - no new version is created yet', async () => {
      await stageAndSubmit(page, policy);
      expect((await readPolicy(page, policy.id)).hasPendingVersion, 'the change awaits approval').toBe(true);
    });

    await steps.step('Select the policy, click View and open Version History - the list does not yet include the pending change', async () => {
      await detail.open(policy.id);
      await versions.open();
      const pending = await versions.readRows();
      expect({ rows: pending.length, highest: top(pending) }, listed(pending)).toEqual({ rows: before.length, highest: top(before) });
    });

    await steps.step('Approve the pending change through the Approval module, then open Version History again - a new numbered version now appears', async () => {
      await approvePolicy(page, policy.nameEn);
      await waitForPolicy(page, policy.id, (p) => !p.hasPendingVersion && !p.hasDraft, 'the change approved');
      await detail.open(policy.id);
      await versions.open();
      const after = await versions.readRows();
      const newest = after.find((r) => versionNumber(r.version) === top(after));
      expect({ rows: after.length, highest: top(after), status: newest?.status ?? '' }, listed(after)).toEqual({ rows: before.length + 1, highest: top(before) + 1, status: APPROVED });
    });
  });
});
