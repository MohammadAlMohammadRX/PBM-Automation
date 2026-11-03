import { test, expect } from '../../../fixtures';
import type { ConfirmDialog } from '../../../pages/components/ConfirmDialog';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { DATE_TEXT, MESSAGE, VERSION_HEADERS, VERSION_STATUS } from '../../../data/formulary/formulary.data';
import {
  ADMIN_NAME,
  ALREADY_CURRENT,
  APPROVED_ROW,
  BLOCKED_CASES,
  CASES,
  EMPTY_CELL,
  NOT_APPROVED_ROW,
  REVERT_CHANGE,
  VERSION_LABEL,
  dayText,
} from '../../../data/formulary/versionHistory.data';
import { publishFormularyChange, readVersions, stageTrivialChange } from '../../../utils/FormularyProvisioning';

/**
 * User story 15214: View Formulary - Version History.
 * Every approved change is a numbered version with its requester and reviewer;
 * the table (Version, Change, Approval Status, Requested By / On, Reviewed By
 * / On, Actions) has an advanced search (approval status, change type,
 * requested by, reviewed by, requested on), a read-only View Details drawer,
 * and Revert on a previously published version. Readings of the ambiguous
 * cases: data/formulary/versionHistory.data.ts.
 */
test.describe('US 15214 - View Formulary - Version History', () => {
  test.describe.configure({ timeout: 15 * 60_000 });

  test(`TC-${CASES.fullHistory.azureId}: should show every version with all its columns when the formulary has several approved versions`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyVersionHistoryTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Inactive');

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the formulary\'s Version History tab - the version history table is displayed', async () => {
      await formularyDetailPage.open(formulary.id);
      await formularyVersionHistoryTab.open();
      expect((await formularyVersionHistoryTab.readRows()).length).toBeGreaterThanOrEqual(3);
    });

    await steps.step('Review the table columns - every record shows Version, Change, Approval Status, Requested By / On, Reviewed By / On and Actions', async () => {
      expect(await formularyVersionHistoryTab.getHeaders()).toEqual([...VERSION_HEADERS]);
      const rows = await formularyVersionHistoryTab.readRows();
      const gaps = rows.flatMap((row) => (['version', 'change', 'status', 'requestedBy', 'requestedOn', 'reviewedBy', 'reviewedOn'] as const)
        .filter((column) => EMPTY_CELL.test(row[column])).map((column) => `${row.version}.${column}`));
      expect(gaps, 'empty cells').toEqual([]);
    });
  });

  test(`TC-${CASES.filterApproval.azureId}: should return only the approved versions when filtering by approval status Approved`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyVersionHistoryTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('PendingChange');
    let approved = '';

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Version History advanced search - its filters include Approval Status', async () => {
      await formularyDetailPage.open(formulary.id);
      await formularyVersionHistoryTab.open();
      expect((await formularyVersionHistoryTab.readRows()).some((r) => NOT_APPROVED_ROW.test(r.status)), 'a version that is not approved').toBe(true);
      const options = await formularyVersionHistoryTab.getFilterOptions('approvalStatus');
      approved = options.find((o) => CASES.filterApproval.status.test(o)) ?? '';
      expect(approved, `the Approval Status filter offers ${JSON.stringify(options)}`).not.toBe('');
    });

    await steps.step('Select "Approved" in the Approval Status filter and search - only Approved versions are listed', async () => {
      const result = await formularyVersionHistoryTab.applyFilter({ approvalStatus: approved });
      expect(result.unplaced, 'criteria with no field').toEqual([]);
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows.filter((r) => !APPROVED_ROW.test(r.status)).map((r) => `${r.version} ${r.status}`)).toEqual([]);
    });
  });

  test(`TC-${CASES.filterChangeType.azureId}: should return only the versions of the selected change type`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyVersionHistoryTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Inactive');
    let option = '';

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Version History advanced search - its filters include Change Type', async () => {
      await formularyDetailPage.open(formulary.id);
      await formularyVersionHistoryTab.open();
      const options = await formularyVersionHistoryTab.getFilterOptions('changeType');
      option = options.find((o) => CASES.filterChangeType.preferred.test(o)) ?? options[0] ?? '';
      expect(option, `the Change Type options: ${options.join(', ')}`).not.toBe('');
    });

    await steps.step('Select a Change Type and search - only versions of that change type are listed', async () => {
      const result = await formularyVersionHistoryTab.applyFilter({ changeType: option });
      expect(result.unplaced).toEqual([]);
      expect(result.rows.length).toBeGreaterThan(0);
      const sameType = new RegExp(`^${option.slice(0, 5).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
      expect(result.rows.filter((r) => !sameType.test(r.change)).map((r) => `${r.version} ${r.change}`)).toEqual([]);
    });
  });

  test(`TC-${CASES.filterRequestedOn.azureId}: should include the boundary dates and exclude dates outside the data when filtering by requested date`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyVersionHistoryTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Future');

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Version History advanced search - the Requested On date filter is displayed', async () => {
      await formularyDetailPage.open(formulary.id);
      await formularyVersionHistoryTab.open();
      expect((await formularyVersionHistoryTab.readFilterFields()).keys.some((k) => /date|requestedon/i.test(k)), 'a Requested On field').toBe(true);
    });

    await steps.step('Set the range to exactly the earliest and latest requested dates - the records on those dates are returned', async () => {
      const all = await formularyVersionHistoryTab.readRows();
      const result = await formularyVersionHistoryTab.applyFilter({ requestedOn: `${dayText(0)} - ${dayText(0)}` });
      expect(result.applied, result.messages.join(' | ')).toBe(true);
      expect(result.rows.map((r) => r.version).sort()).toEqual(all.map((r) => r.version).sort());
    });

    await steps.step('Set a range one day outside the data on either end - no records are returned', async () => {
      await formularyDetailPage.open(formulary.id);
      await formularyVersionHistoryTab.open();
      const before = await formularyVersionHistoryTab.applyFilter({ requestedOn: `${dayText(-1)} - ${dayText(-1)}` });
      await formularyDetailPage.open(formulary.id);
      await formularyVersionHistoryTab.open();
      const after = await formularyVersionHistoryTab.applyFilter({ requestedOn: `${dayText(1)} - ${dayText(1)}` });
      expect({ before: before.rows.length, after: after.rows.length }).toEqual({ before: 0, after: 0 });
    });
  });

  test(`TC-${CASES.filterCombined.azureId}: should return only the versions matching both the approval status and the requester`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyVersionHistoryTab,
    formularyIn,
    steps,
  }) => {
    const data = CASES.filterCombined;
    const formulary = await formularyIn('PendingChange');

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Version History advanced search - all the filters are displayed', async () => {
      await formularyDetailPage.open(formulary.id);
      await formularyVersionHistoryTab.open();
      const { keys } = await formularyVersionHistoryTab.readFilterFields();
      expect(keys.length, `filter fields: ${keys.join(', ')}`).toBeGreaterThanOrEqual(5);
    });

    await steps.step('Select an Approval Status and a Requested By together and search - only records matching both are listed', async () => {
      const approved = (await formularyVersionHistoryTab.getFilterOptions('approvalStatus')).find((o) => data.status.test(o)) ?? 'Approved';
      const result = await formularyVersionHistoryTab.applyFilter({ approvalStatus: approved, requestedBy: data.requester });
      expect(result.unplaced).toEqual([]);
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows.filter((r) => !APPROVED_ROW.test(r.status) || r.requestedBy !== data.requester).map((r) => `${r.version} ${r.status} ${r.requestedBy}`)).toEqual([]);
    });
  });

  test(`TC-${CASES.newNumberedVersion.azureId}: should record each approved change as the next numbered version with requester and reviewer`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyVersionHistoryTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Active');
    const latestBefore = Math.max(...(await readVersions(page, formulary.id)).map((v) => v.version));

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Submit a change and have it approved by a reviewer - the change is approved and the formulary updated', async () => {
      await stageTrivialChange(page, formulary.id, formulary.nameEn);
      await publishFormularyChange(page, formulary.id, formulary.nameEn);
      expect((await formularyDetailPage.readViaApi(formulary.id)).hasDraft).not.toBe(true);
    });

    await steps.step('Open the Version History tab - a new version with the next number appears with requester and reviewer', async () => {
      await formularyDetailPage.open(formulary.id);
      await formularyVersionHistoryTab.open();
      const next = (await formularyVersionHistoryTab.readRows()).find((r) => r.version === `v${latestBefore + 1}`);
      expect(next, `a v${latestBefore + 1} row`).toBeDefined();
      expect({ requestedBy: next?.requestedBy, reviewedBy: next?.reviewedBy }).toEqual({ requestedBy: ADMIN_NAME, reviewedBy: ADMIN_NAME });
    });
  });

  test(`TC-${CASES.revertPublished.azureId}: should restore an earlier published version and log the revert as a new version`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyVersionHistoryTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Active');
    const countBefore = (await readVersions(page, formulary.id)).length;
    let dialog: ConfirmDialog | null = null;

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Version History tab - the published versions are listed with an Actions column', async () => {
      await formularyDetailPage.open(formulary.id);
      await formularyVersionHistoryTab.open();
      expect(await formularyVersionHistoryTab.getHeaders()).toContain('Actions');
      expect(await formularyVersionHistoryTab.getRevertAvailability('v1')).toBe('available');
    });

    await steps.critical('Click Revert on an earlier published version - a confirmation prompt is displayed', async () => {
      dialog = await formularyVersionHistoryTab.requestRevert('v1');
      expect(dialog, 'a confirmation prompt').not.toBeNull();
    });

    await steps.step('Confirm the revert - the selected version is restored and a new version entry reflects the revert', async () => {
      const answer = await NetworkUtils.captureResponse(page, ApiEndpoints.formularyRevert, async () => { await dialog!.confirmWithFollowUps(); });
      expect(answer?.status, answer?.text.slice(0, 200)).toBe(200);
      await publishFormularyChange(page, formulary.id, formulary.nameEn);
      const versions = [...(await readVersions(page, formulary.id))].sort((a, b) => b.version - a.version);
      expect(versions.length).toBe(countBefore + 1);
      expect(versions[0].versionStatusCode).toBe('published');
      expect(`${versions[0].changeType} ${JSON.stringify(versions[0])}`).toMatch(REVERT_CHANGE);
    });
  });

  test(`TC-${CASES.neverPublished.azureId}: should offer no Revert on a version that was never published`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyVersionHistoryTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Rejected');

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Version History tab - the versions are listed with their approval statuses', async () => {
      await formularyDetailPage.open(formulary.id);
      await formularyVersionHistoryTab.open();
      await formularyVersionHistoryTab.expectVersionStatus('v1', VERSION_STATUS.rejected);
    });

    await steps.step('Locate the version with a non-published status and check its Actions - Revert is disabled or not shown', async () => {
      expect(await formularyVersionHistoryTab.getRevertAvailability('v1')).not.toBe('available');
    });
  });

  test(`TC-${CASES.detailsReadOnly.azureId}: should show every version detail field populated and read-only`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyVersionHistoryTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Future');
    let fields: Record<string, string> = {};

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Version History tab and click View Details on a version - the version details open', async () => {
      await formularyDetailPage.open(formulary.id);
      await formularyVersionHistoryTab.open();
      fields = await formularyVersionHistoryTab.viewVersion('v1');
      expect(fields.nameEn).toBe(formulary.nameEn);
    });

    await steps.step('Review every field (approval status ... reviewed on) - all are populated and displayed correctly', async () => {
      const empty = Object.entries(fields).filter(([, value]) => EMPTY_CELL.test(value)).map(([key]) => key);
      expect(empty, 'empty fields').toEqual([]);
      expect({ nameAr: fields.nameAr, payer: fields.payer, requestedBy: fields.requestedBy, reviewedBy: fields.reviewedBy })
        .toEqual({ nameAr: formulary.nameAr, payer: formulary.payerName, requestedBy: ADMIN_NAME, reviewedBy: ADMIN_NAME });
    });

    await steps.step('Attempt to edit any field - all fields are read-only', async () => {
      expect(await formularyVersionHistoryTab.isDrawerReadOnly()).toBe(true);
    });
  });

  test(`TC-${CASES.noMatch.azureId}: should show a clear no-records message when no version matches the filters`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyVersionHistoryTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Future');

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Version History advanced search - the search filters are displayed', async () => {
      await formularyDetailPage.open(formulary.id);
      await formularyVersionHistoryTab.open();
      expect((await formularyVersionHistoryTab.readFilterFields()).keys.length).toBeGreaterThan(0);
    });

    await steps.step('Apply a filter combination with no matching records and search - a clear "no records found" message is shown', async () => {
      const approved = (await formularyVersionHistoryTab.getFilterOptions('approvalStatus')).find((o) => CASES.noMatch.status.test(o)) ?? 'Approved';
      const result = await formularyVersionHistoryTab.applyFilter({ approvalStatus: approved, requestedBy: CASES.noMatch.requester });
      expect(result.unplaced).toEqual([]);
      expect(result.rows).toEqual([]);
      expect(await formularyVersionHistoryTab.getEmptyStateText()).toMatch(MESSAGE.noData);
    });
  });

  test(`TC-${CASES.revertCurrent.azureId}: should not revert to the version that is already the current one`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyVersionHistoryTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Active');
    const current = `v${Math.max(...(await readVersions(page, formulary.id)).map((v) => v.version))}`;

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Version History tab - the currently active version is indicated', async () => {
      await formularyDetailPage.open(formulary.id);
      await formularyVersionHistoryTab.open();
      await formularyVersionHistoryTab.expectVersionStatus(current, VERSION_STATUS.published);
    });

    await steps.step('Click Revert on the current version\'s row - the action is disabled, or a message says it is already active', async () => {
      const availability = await formularyVersionHistoryTab.getRevertAvailability(current);
      if (availability === 'available') {
        const outcome = await formularyVersionHistoryTab.revertTo(current);
        expect(`${outcome.text} ${outcome.messages.join(' ')}`).toMatch(ALREADY_CURRENT);
        expect((await formularyDetailPage.readViaApi(formulary.id)).hasDraft, 'no redundant version staged').not.toBe(true);
      } else {
        expect(availability).not.toBe('available');
      }
    });
  });

  test(`TC-${CASES.singleVersion.azureId}: should show exactly one row and no Revert when the formulary has a single version`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyVersionHistoryTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Future');

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Version History tab of the new formulary - the table loads without errors', async () => {
      await formularyDetailPage.open(formulary.id);
      await formularyVersionHistoryTab.open();
      expect(await formularyVersionHistoryTab.getHeaders()).toEqual([...VERSION_HEADERS]);
    });

    await steps.step('Review the table - exactly one version row, with no Revert option', async () => {
      const rows = await formularyVersionHistoryTab.readRows();
      expect(rows.map((r) => r.version)).toEqual(['v1']);
      expect(await formularyVersionHistoryTab.getRevertAvailability('v1')).not.toBe('available');
    });
  });

  test(`TC-${CASES.columnFormats.azureId}: should show every column accurately and in the right format`, async ({
    page,
    formularyManagementPage,
    formularyDetailPage,
    formularyVersionHistoryTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Active');

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Version History tab - the table is displayed with all records', async () => {
      await formularyDetailPage.open(formulary.id);
      await formularyVersionHistoryTab.open();
      expect((await formularyVersionHistoryTab.readRows()).length).toBe((await readVersions(page, formulary.id)).length);
    });

    await steps.step('Check each column against the source data - every column is in the correct format and matches the record', async () => {
      const source = await readVersions(page, formulary.id);
      const rows = await formularyVersionHistoryTab.readRows();
      const problems: string[] = [];
      for (const row of rows) {
        const record = source.find((v) => `v${v.version}` === row.version);
        if (!VERSION_LABEL.test(row.version) || record === undefined) { problems.push(`${row.version}: not a source version`); continue; }
        if (row.requestedBy !== (record.requestedByNameEn ?? '')) problems.push(`${row.version}: requested by "${row.requestedBy}" vs "${record.requestedByNameEn}"`);
        if (row.reviewedBy !== (record.reviewedByNameEn ?? '')) problems.push(`${row.version}: reviewed by "${row.reviewedBy}" vs "${record.reviewedByNameEn}"`);
        if (!DATE_TEXT.test(row.requestedOn)) problems.push(`${row.version}: requested on "${row.requestedOn}"`);
        if (!DATE_TEXT.test(row.reviewedOn)) problems.push(`${row.version}: reviewed on "${row.reviewedOn}"`);
        if (EMPTY_CELL.test(row.change) || EMPTY_CELL.test(row.status)) problems.push(`${row.version}: change "${row.change}", status "${row.status}"`);
      }
      expect(problems).toEqual([]);
    });
  });

  test(`TC-${CASES.invalidRange.azureId}: should refuse to search version history with a From date later than the To date`, async ({
    formularyManagementPage,
    formularyDetailPage,
    formularyVersionHistoryTab,
    formularyIn,
    steps,
  }) => {
    const formulary = await formularyIn('Future');

    await steps.critical('Navigate to the Formulary Management module - the formulary list is displayed', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.critical('Open the Version History advanced search - the Requested On date range filter is displayed', async () => {
      await formularyDetailPage.open(formulary.id);
      await formularyVersionHistoryTab.open();
      expect((await formularyVersionHistoryTab.readFilterFields()).keys.some((k) => /date|requestedon/i.test(k)), 'a Requested On field').toBe(true);
    });

    await steps.step('Enter a From date later than the To date and click Search - the range is reported invalid and the search not run', async () => {
      const result = await formularyVersionHistoryTab.applyFilter({ requestedOn: CASES.invalidRange.range });
      expect(result.applied, 'the search should not run').toBe(false);
      expect(result.messages.join(' | ')).toMatch(/invalid|before|after|later|earlier|range/i);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
