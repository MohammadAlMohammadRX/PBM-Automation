import { test, expect } from '../../../fixtures';
import { CASES, NO_RECORDS, dayFromToday } from '../../../data/policy/viewAuditHistory.data';
import type { AuditEntry } from '../../../pages/components/AuditHistoryTab';
import { deletePolicy, publishPolicyChange, readPolicyOrNull } from '../../../utils/PolicyProvisioning';
import {
  ERROR_MESSAGE,
  applyAuditCriteria,
  buildAuditTrail,
  cancelAuditSearch,
  fillAuditCriteria,
  openSystemAuditLogs,
  provisionOrBlock,
  readSystemAuditLogs,
  submitAuditSearch,
  typeReversedRange,
  visibleMessages,
} from '../../../utils/policy/writerAHelpers';

/** Entries in words, for failure messages. */
const listed = (entries: readonly AuditEntry[]): string => entries.map((e) => `${e.action} by ${e.by} at ${e.when}`).join(' | ') || '(none)';

/**
 * User story 15187: View Policy - Audit History.
 * The trail and its entries, the advanced search (action type, performed by,
 * date range - alone, combined, empty, invalid, special characters, rapid
 * changes), View Details' previous / new values and the trail kept after the
 * policy is deleted. Each case builds its own trail - see the data file.
 */
test.describe('US 15187 - View Policy - Audit History', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.byActionType.azureId}: should list only the entries of the chosen action type`, async ({
    policyManagementPage: list,
    policyDetailPage: detail,
    policyAuditTab: audit,
    policyIn,
    page,
    steps,
  }) => {
    const action = CASES.byActionType.action;
    const policy = await policyIn('Draft');
    await provisionOrBlock('a policy with Create, Update and Status Change entries', () => buildAuditTrail(page, policy));
    let entries: AuditEntry[] = [];

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
    });

    await steps.step('Open the Audit History tab of the policy - the full list of audit entries is displayed', async () => {
      await detail.open(policy.id);
      await audit.open();
      expect((await audit.readAllEntries()).length, 'entries before filtering').toBeGreaterThan(1);
    });

    await steps.step(`Apply the Action Type filter "${action.option}" - the list reloads`, async () => {
      const result = await applyAuditCriteria(page, audit, { actionType: action.option });
      entries = result.entries;
      expect(result.applied, result.messages.join(' | ')).toBe(true);
    });

    await steps.step(`Review the filtered results - only "${action.option}" entries are displayed`, async () => {
      expect({ shown: entries.length > 0, others: entries.filter((e) => !action.entry.test(e.action)).map((e) => e.action) }, listed(entries))
        .toEqual({ shown: true, others: [] });
    });
  });

  test(`TC-${CASES.viewTrail.azureId}: should show a policy's audit trail with the action, who performed it and when for each entry`, async ({
    policyManagementPage: list,
    policyAuditTab: audit,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('Future');
    let entries: AuditEntry[] = [];

    await steps.critical('Navigate to the Policy Management module - the Policy Management module loads', async () => {
      await list.openTable();
    });

    await steps.step('Open an existing policy - the policy detail view opens', async () => {
      const detail = await list.openDetails(policy.nameEn);
      expect(await detail.getName()).toBe(policy.nameEn);
    });

    await steps.step('Select the Audit History tab - it opens and displays a list of recorded actions', async () => {
      await audit.open();
      entries = await audit.readAllEntries();
      expect(entries.length).toBeGreaterThan(0);
    });

    await steps.step('Review the audit entries - each shows the action type, who performed it and the date and time', async () => {
      expect(entries.filter((e) => e.action === '' || e.by === '' || e.when === '').map((e) => JSON.stringify(e)), 'entries missing a field').toEqual([]);
    });
  });

  test(`TC-${CASES.dateBoundary.azureId}: should include the entries on the boundary dates and return none for a range before the first entry`, async ({
    policyDetailPage: detail,
    policyAuditTab: audit,
    policyManagementPage: list,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Draft');
    await provisionOrBlock('a policy with a recorded trail', () => buildAuditTrail(page, policy));
    let all: AuditEntry[] = [];
    let inRange: Awaited<ReturnType<typeof submitAuditSearch>>;
    let before: Awaited<ReturnType<typeof submitAuditSearch>>;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
    });

    await steps.step('Open the Audit History tab for the policy - the full audit list is displayed', async () => {
      await detail.open(policy.id);
      await audit.open();
      all = await audit.readAllEntries();
      expect(all.length).toBeGreaterThan(0);
    });

    await steps.step('Set the date range from the earliest to the latest recorded action date - the filter is applied', async () => {
      await fillAuditCriteria(page, audit, { from: dayFromToday(0), to: dayFromToday(0) });
      inRange = await submitAuditSearch(page, audit);
      expect(inRange.applied, inRange.messages.join(' | ')).toBe(true);
    });

    await steps.step('Review the results - every entry within the inclusive boundary dates is returned and none outside it', async () => {
      expect(inRange.entries.length, `in range: ${listed(inRange.entries)}; all: ${listed(all)}`).toBe(all.length);
    });

    await steps.step('Narrow the range to end one day before the earliest action - the filter is applied', async () => {
      await audit.clearFilters();
      await fillAuditCriteria(page, audit, { from: dayFromToday(-1), to: dayFromToday(-1) });
      before = await submitAuditSearch(page, audit);
      expect(before.applied, before.messages.join(' | ')).toBe(true);
    });

    await steps.step('Review the results - the list returns zero entries', async () => {
      expect(before.entries.length, listed(before.entries)).toBe(0);
    });
  });

  test(`TC-${CASES.reversedRange.azureId}: should refuse a date range whose start is later than its end with a validation message`, async ({
    policyDetailPage: detail,
    policyAuditTab: audit,
    policyManagementPage: list,
    policyIn,
    page,
    steps,
  }) => {
    const data = CASES.reversedRange;
    const policy = await policyIn('Future');

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
    });

    await steps.step('Open the Audit History tab - the audit list is displayed', async () => {
      await detail.open(policy.id);
      await audit.open();
      expect((await audit.readEntries()).length).toBeGreaterThan(0);
    });

    await steps.step(`Enter a start date (${data.from}) later than the end date (${data.to}) - the invalid field is highlighted`, async () => {
      const typed = await typeReversedRange(page, audit, data.from, data.to);
      expect(typed.highlighted, `the field reads "${typed.value}"; messages ${typed.messages.join(' | ')}`).toBe(true);
    });

    await steps.step('Click Search - a validation message appears and the search is not executed', async () => {
      const result = await submitAuditSearch(page, audit);
      expect({ applied: result.applied, searched: result.requested, message: result.messages.length > 0 }, result.messages.join(' | '))
        .toEqual({ applied: false, searched: false, message: true });
    });
  });

  test(`TC-${CASES.combined.azureId}: should show only the entries matching action type, performer and date range together`, async ({
    policyDetailPage: detail,
    policyAuditTab: audit,
    policyManagementPage: list,
    policyIn,
    page,
    steps,
  }) => {
    const action = CASES.combined.action;
    const policy = await policyIn('Draft');
    await provisionOrBlock('a policy with a Status Change entry among others', () => buildAuditTrail(page, policy));
    let actor = '';
    let result: Awaited<ReturnType<typeof submitAuditSearch>>;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
    });

    await steps.step('Open the Audit History tab and open Advanced Search - it offers Action Type, Performed By and Date Range', async () => {
      await detail.open(policy.id);
      await audit.open();
      actor = (await audit.readEntries())[0]?.by ?? '';
      const drawer = await audit.openAdvancedSearch();
      const labels = await drawer.getFieldLabels();
      await drawer.cancel();
      expect(labels).toEqual(expect.arrayContaining([expect.stringMatching(/action type/i), expect.stringMatching(/performed by/i), expect.stringMatching(/date range/i)]));
    });

    await steps.step(`Select Action Type "${action.option}", Performed By "${actor}" and a date range covering the action - the filters are set`, async () => {
      const set = await fillAuditCriteria(page, audit, { actionType: action.option, performedBy: actor, from: dayFromToday(0), to: dayFromToday(0) });
      expect({ actionType: set.actionType, performedBy: set.performedBy, range: set.dateRange !== '' }).toEqual({ actionType: action.option, performedBy: actor, range: true });
    });

    await steps.step('Click Search - the list reloads with only the entries matching all three conditions', async () => {
      result = await submitAuditSearch(page, audit);
      const off = result.entries.filter((e) => !action.entry.test(e.action) || e.by !== actor);
      // Name what the trail holds, so an empty result says why (2026-11-04: the approved
      // inactivation was recorded as UPDATE, with no STATUS_CHANGE entry at all).
      const trail = (await audit.fetchTrail(policy.id)).items.map((e) => `${e.actionType}@${e.actorLabel}`).join(', ');
      expect({ applied: result.applied, shown: result.entries.length > 0, off: off.length }, `${listed(result.entries)}; the trail's action types: ${trail}`).toEqual({ applied: true, shown: true, off: 0 });
    });
  });

  test(`TC-${CASES.viewDetails.azureId}: should show the previous and new value of each changed field with who changed it and when`, async ({
    policyDetailPage: detail,
    policyAuditTab: audit,
    policyManagementPage: list,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Draft');
    await provisionOrBlock('a policy with a recorded field change', () => buildAuditTrail(page, policy));
    let index = -1;
    let entry: Awaited<ReturnType<typeof audit.openEntry>>;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
    });

    await steps.step('Open the Audit History tab - the list of actions is displayed', async () => {
      await detail.open(policy.id);
      await audit.open();
      const entries = await audit.readEntries();
      index = entries.findIndex((e) => /updat/i.test(e.action));
      if (index < 0) index = entries.findIndex((e) => /status/i.test(e.action));
      expect(index, `a field-update entry among: ${listed(entries)}`).toBeGreaterThanOrEqual(0);
    });

    await steps.step('Locate the entry of a field update and click View Details - a details panel opens', async () => {
      entry = await audit.openEntry(index);
      expect(entry.action, 'the Audit Entry drawer').not.toBe('');
    });

    await steps.step('Review the details panel - it shows the previous and the new value of each changed field, with who made the change and when', async () => {
      const changed = entry.changes.filter((c) => c.before !== '' && c.after !== '' && c.before !== c.after);
      // The meta spans lines ("03/11/2026 21:36\n•\nCareConnect", 2026-11-04) - read as one line.
      const meta = entry.meta.replace(/\s+/g, ' ');
      expect({ changedFields: changed.length > 0, whoAndWhen: /\d{2}\/\d{2}\/\d{4}.*•\s*\S/.test(meta) }, `meta "${meta}"; rows ${entry.changes.slice(0, 8).map((c) => `${c.field}: "${c.before}" -> "${c.after}"`).join('; ')}`)
        .toEqual({ changedFields: true, whoAndWhen: true });
      await audit.closeEntry();
    });
  });

  test(`TC-${CASES.retainedAfterDelete.azureId}: should keep a deleted policy's audit records viewable in the audit history`, async ({
    policyManagementPage: list,
    policyDetailPage: detail,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Future');

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
    });

    await steps.step('Open the policy and delete it - it is removed from the active policy list', async () => {
      await detail.open(policy.id);
      // A published policy offers no Delete on screen: the deletion is staged as the application stages it, and approved.
      const offered = await detail.getActionAvailability('delete');
      if (offered === 'available') await detail.deletePolicy();
      else expect((await deletePolicy(page, policy.id)).status, 'DeletePolicy (staged)').toBeLessThan(300);
      await publishPolicyChange(page, policy.id, policy.nameEn);
      await expect.poll(async () => (await readPolicyOrNull(page, policy.id)) === null, { timeout: 30_000 }).toBe(true).catch(() => undefined);
      expect({ record: await readPolicyOrNull(page, policy.id), listed: await list.isListed(policy.nameEn) }, `Delete on the header: ${offered}`)
        .toEqual({ record: null, listed: false });
    });

    await steps.step('Navigate to the independent audit history area - the audit history view loads', async () => {
      const text = await openSystemAuditLogs(page);
      expect(text, 'the Audit Logs screen').not.toMatch(/access restricted|not authori[sz]ed|^$/i);
    });

    await steps.step('Search for the deleted policy\'s audit records - its historical records appear', async () => {
      const logs = await readSystemAuditLogs(page, policy.id);
      expect(logs.total, `GetAuditLogs for policy ${policy.id}: ${logs.status} ${logs.text.slice(0, 200)}`).toBeGreaterThan(0);
    });
  });

  test(`TC-${CASES.byPerformer.azureId}: should list only the entries performed by the chosen user`, async ({
    policyDetailPage: detail,
    policyAuditTab: audit,
    policyManagementPage: list,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Draft');
    await provisionOrBlock('a policy with a recorded trail', () => buildAuditTrail(page, policy));
    let actor = '';
    let result: Awaited<ReturnType<typeof submitAuditSearch>>;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
    });

    await steps.step('Open the Audit History tab and Advanced Search - the advanced search panel opens', async () => {
      await detail.open(policy.id);
      await audit.open();
      actor = (await audit.readEntries())[0]?.by ?? '';
      const drawer = await audit.openAdvancedSearch();
      const labels = await drawer.getFieldLabels();
      await drawer.cancel();
      expect(labels).toEqual(expect.arrayContaining([expect.stringMatching(/performed by/i)]));
    });

    await steps.step(`Set the Performed By filter to "${actor}" - the filter value is set`, async () => {
      const set = await fillAuditCriteria(page, audit, { performedBy: actor });
      expect(set.performedBy).toBe(actor);
    });

    await steps.step('Click Search - the list reloads with only the entries performed by that user', async () => {
      result = await submitAuditSearch(page, audit);
      expect({ applied: result.applied, shown: result.entries.length > 0, others: result.entries.filter((e) => e.by !== actor).map((e) => e.by) }, listed(result.entries))
        .toEqual({ applied: true, shown: true, others: [] });
    });
  });

  test(`TC-${CASES.noResults.azureId}: should show a clear no-records message when no entry matches the filters`, async ({
    policyDetailPage: detail,
    policyAuditTab: audit,
    policyManagementPage: list,
    policyIn,
    page,
    steps,
  }) => {
    const action = CASES.noResults.action;
    const policy = await policyIn('Future');
    let actor = '';

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
    });

    await steps.step('Open the Audit History tab and Advanced Search - the advanced search panel opens', async () => {
      await detail.open(policy.id);
      await audit.open();
      actor = (await audit.readEntries())[0]?.by ?? '';
      const drawer = await audit.openAdvancedSearch();
      expect(await drawer.getFieldLabels()).toEqual(expect.arrayContaining([expect.stringMatching(/action type/i)]));
      await drawer.cancel();
    });

    await steps.step(`Select Action Type "${action.option}" and Performed By "${actor}", who never cloned this policy - the filters are set`, async () => {
      const set = await fillAuditCriteria(page, audit, { actionType: action.option, performedBy: actor });
      expect({ actionType: set.actionType, performedBy: set.performedBy }).toEqual({ actionType: action.option, performedBy: actor });
    });

    await steps.step('Click Search - the list reloads showing a clear "no records found" message and no audit rows', async () => {
      const result = await submitAuditSearch(page, audit);
      const panel = await audit.getPanelText();
      expect({ applied: result.applied, rows: result.entries.length, message: NO_RECORDS.test(panel) }, `panel "${panel.slice(0, 200)}"`).toEqual({ applied: true, rows: 0, message: true });
    });
  });

  test(`TC-${CASES.specialChars.azureId}: should take quotes, dashes and angle brackets in Performed By and search safely without error or script execution`, async ({
    policyDetailPage: detail,
    policyAuditTab: audit,
    policyManagementPage: list,
    policyIn,
    page,
    steps,
  }) => {
    const inputs = CASES.specialChars.inputs;
    const policy = await policyIn('Future');
    let dialogs = 0;
    page.on('dialog', (dialog) => { dialogs += 1; void dialog.dismiss().catch(() => undefined); });

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
    });

    await steps.step('Open the Audit History tab and Advanced Search - the advanced search panel opens', async () => {
      await detail.open(policy.id);
      await audit.open();
      const drawer = await audit.openAdvancedSearch();
      expect(await drawer.getFieldLabels()).toEqual(expect.arrayContaining([expect.stringMatching(/performed by/i)]));
      await drawer.cancel();
    });

    await steps.step('Enter special characters (quotes, dashes, angle brackets) into Performed By - the characters are accepted into the field', async () => {
      const refused: string[] = [];
      for (const input of inputs) {
        const set = await fillAuditCriteria(page, audit, { performedBy: input });
        if (set.performedBy !== input) refused.push(`"${input}" read back as "${set.performedBy}"`);
        await cancelAuditSearch(page);
      }
      expect(refused).toEqual([]);
    });

    await steps.step('Click Search with each - the request is processed without error and no script runs', async () => {
      const problems: string[] = [];
      for (const input of inputs) {
        await audit.clearFilters();
        const result = await applyAuditCriteria(page, audit, { performedBy: input });
        const errors = result.messages.filter((m) => ERROR_MESSAGE.test(m));
        if (errors.length > 0) problems.push(`"${input}": ${errors.join(' | ')}`);
        if (!result.applied && result.messages.length === 0) problems.push(`"${input}": the search neither ran nor said why`);
      }
      const injected = await page.evaluate(() => (window as unknown as Record<string, unknown>).__policyAuditXss ?? null);
      expect({ problems, dialogs, scriptRan: injected !== null }).toEqual({ problems: [], dialogs: 0, scriptRan: false });
    });
  });

  test(`TC-${CASES.rapidChanges.azureId}: should settle on exactly the last filter combination after rapid filter changes`, async ({
    policyDetailPage: detail,
    policyAuditTab: audit,
    policyManagementPage: list,
    policyIn,
    page,
    steps,
  }) => {
    const final = CASES.rapidChanges.final;
    const policy = await policyIn('Draft');
    await provisionOrBlock('a policy with several audit entries', () => buildAuditTrail(page, policy));
    let settled: AuditEntry[] = [];

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
    });

    await steps.step('Open the Audit History tab - the audit list is displayed', async () => {
      await detail.open(policy.id);
      await audit.open();
      expect((await audit.readAllEntries()).length).toBeGreaterThan(1);
    });

    await steps.step('Change Action Type, Performed By and Date Range in quick succession, clearing and reapplying - each change updates the list without errors', async () => {
      const actor = (await audit.readEntries())[0]?.by ?? '';
      const problems: string[] = [];
      for (const criteria of [{ actionType: 'Policy updated' }, { performedBy: actor }, { from: dayFromToday(0), to: dayFromToday(0) }]) {
        const result = await applyAuditCriteria(page, audit, criteria);
        if (!result.applied) problems.push(`${JSON.stringify(criteria)} not applied: ${result.messages.join(' | ')}`);
        problems.push(...result.messages.filter((m) => ERROR_MESSAGE.test(m)));
      }
      await audit.clearFilters();
      const last = await applyAuditCriteria(page, audit, { actionType: final.option });
      settled = last.entries;
      problems.push(...(await visibleMessages(page)).filter((m) => ERROR_MESSAGE.test(m)));
      expect(problems).toEqual([]);
    });

    await steps.step(`Observe the final result set - it settles on exactly the "${final.option}" entries, with no stale or duplicated rows`, async () => {
      const expected = (await audit.fetchTrail(policy.id, final.code)).totalRows;
      expect({ count: settled.length, others: settled.filter((e) => !final.entry.test(e.action)).length }, listed(settled)).toEqual({ count: expected, others: 0 });
    });
  });

  test(`TC-${CASES.checklist.azureId}: should show the action type, performer, timestamp and a working View Details for every entry`, async ({
    policyDetailPage: detail,
    policyAuditTab: audit,
    policyManagementPage: list,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Draft');
    await provisionOrBlock('a policy with create, update and status change entries', () => buildAuditTrail(page, policy));

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
    });

    await steps.step('Open the Audit History tab - the audit list is displayed', async () => {
      await detail.open(policy.id);
      await audit.open();
      expect((await audit.readEntries()).length).toBeGreaterThan(0);
    });

    await steps.step('Check each entry against the checklist (Action Type, Performed By, Date/Time, View Details) - every item is present for every entry', async () => {
      const checked = await audit.readEntryDetails(CASES.checklist.maxEntries);
      const missing = checked.flatMap((e) => [
        ...(e.action ? [] : [`#${e.index}: no action type`]),
        ...(e.by ? [] : [`#${e.index}: no performer`]),
        ...(e.when ? [] : [`#${e.index}: no date/time`]),
        ...(e.detail.action ? [] : [`#${e.index}: View Details showed nothing`]),
      ]);
      expect({ checked: checked.length > 0, missing }).toEqual({ checked: true, missing: [] });
    });
  });
});
