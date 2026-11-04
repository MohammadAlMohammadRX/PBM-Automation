import { test, expect } from '../../../fixtures';
import type { Page } from '@playwright/test';
import type { AuditEntry } from '../../../pages/components/AuditHistoryTab';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { CASES, FAILURE_CONTEXT, LABEL, NO_RESULTS, RANGE_INVALID } from '../../../data/facility/facilityAuditHistory.data';
import { NETWORK_BLOCK } from '../../../data/facility/blockDeletion.data';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import {
  SUITE_FACILITY_PREFIX,
  activateFacility,
  deleteFacility,
  facilityDayText,
  facilityStamp,
  inactivateFacility,
  readFacility,
  readFacilityAuditTrail,
  riyadhDay,
  updateFacilityFields,
} from '../../../utils/FacilityProvisioning';
import {
  auditTrailWithChanges,
  clearAuditFilters,
  networkAnchorOrBlock,
  riyadhDayUtcRange,
} from '../../../utils/facility/writerCHelpers';

/** Today as the tab prints it (DD/MM/YYYY, Riyadh). */
const today = (): string => facilityDayText(riyadhDay(0));

/** An edit, an inactivation and an activation - the user actions a fresh facility's tab can show. Returns the answers' statuses. */
async function editThenToggle(page: Page, facilityId: string, buildingName: string): Promise<number[]> {
  const statuses = [(await updateFacilityFields(page, facilityId, { buildingName: `${buildingName} ${facilityStamp()}` })).status];
  statuses.push((await inactivateFacility(page, facilityId)).status);
  statuses.push((await activateFacility(page, facilityId)).status);
  return statuses;
}

const labels = (entries: AuditEntry[]): string[] => entries.map((e) => e.action);

/**
 * User story 15142: View Facility - Audit History.
 * Every case builds its own facility (FAC-2xx of the sheet) and its history
 * through the application's API, then reads the facility's Audit History tab.
 * Known findings are asserted as the cases state them (see the data file).
 */
test.describe('US 15142 - View Facility - Audit History', () => {
  test.describe.configure({ timeout: 8 * 60_000 });

  test(`TC-${CASES.everyAction.azureId}: should record every create, edit and failed delete in the facility's audit history`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityAuditTab,
    steps,
  }) => {
    const anchor = await networkAnchorOrBlock(page, test.info());
    const { id, nameEn: name } = anchor.facility;
    let entries: AuditEntry[] = [];

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility directory', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(name)).toBe(true);
    });

    await steps.critical('Open facility FAC-200 (created, edited, a delete refused) and select the Audit tab - the audit history list loads', async () => {
      // The anchor is Writer B's fully populated Overview facility: the edit is put back at once (two Edit entries).
      const original = (await readFacility(page, id)).buildingName;
      const edit = await updateFacilityFields(page, id, { buildingName: `${CASES.everyAction.buildingName} ${facilityStamp()}` });
      const restored = await updateFacilityFields(page, id, { buildingName: original });
      expect({ edit: edit.status < 300, restored: restored.status < 300 }, `the Edit: ${edit.text.slice(0, 160)} / the restore: ${restored.text.slice(0, 160)}`)
        .toEqual({ edit: true, restored: true });
      const refusedDelete = await deleteFacility(page, id);
      expect(refusedDelete.status, `the Delete of a facility a network holds: ${refusedDelete.text.slice(0, 160)}`).toBeGreaterThanOrEqual(400);
      await facilityDetailPage.open(id);
      await facilityAuditTab.open();
      entries = await facilityAuditTab.readAllEntries();
      expect(entries.length, 'audit entries').toBeGreaterThan(0);
    });

    await steps.step('Review the list for the Create, Edit and failed Delete entries - each action type is represented with its own entry', async () => {
      const shown = labels(entries);
      expect({
        create: shown.some((l) => LABEL.create.test(l)),
        edit: shown.some((l) => LABEL.edit.test(l)),
        failedDelete: shown.some((l) => LABEL.deleteFailed.test(l)),
      }, `entries shown: ${[...new Set(shown)].join(', ')}`).toEqual({ create: true, edit: true, failedDelete: true });
    });

    await steps.step('Confirm each entry shows the correct action label - entries are clearly labeled Create, Edit and Delete (Failed)', async () => {
      const shown = labels(entries);
      expect({
        Create: shown.some((l) => LABEL.exactCreate.test(l)),
        Edit: shown.some((l) => LABEL.exactEdit.test(l)),
        'Delete (Failed)': shown.some((l) => LABEL.exactDeleteFailed.test(l)),
      }, `labels shown: ${[...new Set(shown)].join(', ')}`).toEqual({ Create: true, Edit: true, 'Delete (Failed)': true });
    });
  });

  test(`TC-${CASES.activateDeactivate.azureId}: should show successful and failed activate and deactivate actions as separate audit entries`, async ({
    page,
    facilityIn,
    facilityManagementPage,
    facilityDetailPage,
    facilityAuditTab,
    steps,
  }) => {
    const facility = await facilityIn('Active');

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility directory', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open facility FAC-201 (activated and deactivated, once each refused) and select the Audit tab - the audit history list loads', async () => {
      const outcomes: Record<string, number> = {};
      outcomes.deactivate = (await inactivateFacility(page, facility.id)).status;
      outcomes.activate = (await activateFacility(page, facility.id)).status;
      // Refused: no inactivation reason (422 "Invalid inactivation reason.").
      outcomes.deactivateRefused = (await NetworkUtils.postAsSession(page, ApiEndpoints.facilitySetActive, { id: facility.id, isActive: false })).status;
      // Refused: activating an expired facility (409 "Cannot reactivate an expired facility.").
      outcomes.expire = (await updateFacilityFields(page, facility.id, { licenseExpiryDate: riyadhDay(-1) })).status;
      outcomes.switchOff = (await inactivateFacility(page, facility.id)).status;
      outcomes.activateRefused = (await activateFacility(page, facility.id)).status;
      expect({
        deactivate: outcomes.deactivate < 300,
        activate: outcomes.activate < 300,
        deactivateRefused: outcomes.deactivateRefused >= 400,
        expire: outcomes.expire < 300,
        switchOff: outcomes.switchOff < 300,
        activateRefused: outcomes.activateRefused >= 400,
      }, `answers ${JSON.stringify(outcomes)}`).toEqual({ deactivate: true, activate: true, deactivateRefused: true, expire: true, switchOff: true, activateRefused: true });
      await facilityDetailPage.open(facility.id);
      await facilityAuditTab.open();
      expect((await facilityAuditTab.readEntries()).length, 'audit entries').toBeGreaterThan(0);
    });

    await steps.step('Review the list for Activate and Deactivate entries - successful and failed outcomes are each shown as separate entries', async () => {
      const shown = labels(await facilityAuditTab.readAllEntries());
      expect({
        activate: shown.some((l) => LABEL.activate.test(l) && !LABEL.failed.test(l)),
        activateFailed: shown.some((l) => LABEL.activate.test(l) && LABEL.failed.test(l)),
        deactivate: shown.some((l) => LABEL.deactivate.test(l) && !LABEL.failed.test(l)),
        deactivateFailed: shown.some((l) => LABEL.deactivate.test(l) && LABEL.failed.test(l)),
      }, `entries shown: ${shown.join(', ')}`).toEqual({ activate: true, activateFailed: true, deactivate: true, deactivateFailed: true });
    });
  });

  test(`TC-${CASES.filterByType.azureId}: should list only Edit entries when the audit history is filtered by the Edit action type`, async ({
    page,
    facilityIn,
    facilityManagementPage,
    facilityDetailPage,
    facilityAuditTab,
    steps,
  }) => {
    const data = CASES.filterByType;
    const facility = await facilityIn('Active');

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility directory', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open facility FAC-202 (a mix of entries) and select the Audit tab - the full audit history list loads', async () => {
      const statuses = await editThenToggle(page, facility.id, data.buildingName);
      expect(statuses.every((s) => s < 300), `the edit / inactivate / activate answered ${statuses.join(', ')}`).toBe(true);
      await facilityDetailPage.open(facility.id);
      await facilityAuditTab.open();
      expect((await facilityAuditTab.readAllEntries()).length, 'audit entries').toBeGreaterThanOrEqual(statuses.length);
    });

    await steps.step(`Apply the action-type filter set to Edit ("${data.filter}" on screen) - the list refreshes`, async () => {
      const { applied, request, messages } = await facilityAuditTab.applyFilterByCalendar({ actionType: data.filter });
      expect(applied, `the filter was not applied: ${messages.join(' | ')}`).toBe(true);
      expect(String(request?.actionType ?? ''), 'the action type sent').toMatch(/^update$/i);
    });

    await steps.step('Review the filtered results - only entries with action type Edit are displayed', async () => {
      const shown = labels(await facilityAuditTab.readAllEntries());
      expect(shown.filter((l) => !LABEL.edit.test(l)), 'entries of another action type').toEqual([]);
      const trail = await auditTrailWithChanges(page, facility.id, { actionType: 'UPDATE' });
      const notEdits = trail.filter((t) => !t.isEdit).map((t) => `${t.entry.actionType} changing ${Object.keys(t.changes).join(', ')}`);
      expect(notEdits, 'entries listed under Edit that are not edits of the facility (activations / inactivations recorded as Update)').toEqual([]);
    });
  });

  test(`TC-${CASES.noMatch.azureId}: should show a clear no-results message when the filter matches no audit entries`, async ({
    page,
    facilityIn,
    facilityManagementPage,
    facilityDetailPage,
    facilityAuditTab,
    steps,
  }) => {
    const facility = await facilityIn('Active');
    const empty = facilityDayText(riyadhDay(CASES.noMatch.daysAgo));

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility directory', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open facility FAC-203 and select the Audit tab - the full audit history list loads', async () => {
      expect((await updateFacilityFields(page, facility.id, { buildingName: `QA Audit No Match ${facilityStamp()}` })).status).toBeLessThan(300);
      await facilityDetailPage.open(facility.id);
      await facilityAuditTab.open();
      expect((await facilityAuditTab.readEntries()).length, 'audit entries').toBeGreaterThan(0);
    });

    await steps.step(`Search for a date that has no log (${empty}) - the list refreshes`, async () => {
      const { applied, request, messages } = await facilityAuditTab.applyFilterByCalendar({ from: empty, to: empty });
      expect(applied, `the filter was not applied: ${messages.join(' | ')}`).toBe(true);
      expect(request?.fromUtc, 'the date range sent').toBeTruthy();
    });

    await steps.step('Review the result area - an empty-results message is displayed instead of a blank or broken list', async () => {
      expect(await facilityAuditTab.readEntries(), 'entries on a day without a log').toEqual([]);
      expect(await facilityAuditTab.getEmptyText()).toMatch(NO_RESULTS);
    });
  });

  test(`TC-${CASES.boundaries.azureId}: should include entries dated exactly on the start and end dates of the selected range`, async ({
    page,
    facilityIn,
    facilityManagementPage,
    facilityDetailPage,
    facilityAuditTab,
    steps,
  }) => {
    const facility = await facilityIn('Active');
    let todays: AuditEntry[] = [];

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility directory', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open facility FAC-204 (entries dated today) and select the Audit tab - the full audit history list loads', async () => {
      expect((await updateFacilityFields(page, facility.id, { buildingName: `QA Audit Boundary ${facilityStamp()}` })).status).toBeLessThan(300);
      await facilityDetailPage.open(facility.id);
      await facilityAuditTab.open();
      todays = (await facilityAuditTab.readAllEntries()).filter((e) => e.when.startsWith(today()));
      expect(todays.length, 'entries dated today').toBeGreaterThan(0);
    });

    await steps.step('Set the date-range filter so that its END date is the entries\' date, inclusive - the list refreshes', async () => {
      const { applied, messages } = await facilityAuditTab.applyFilterByCalendar({ from: facilityDayText(riyadhDay(-CASES.boundaries.span)), to: today() });
      expect(applied, `the filter was not applied: ${messages.join(' | ')}`).toBe(true);
      expect((await facilityAuditTab.readAllEntries()).length, 'entries dated on the END date').toBe(todays.length);
    });

    await steps.step('Review the filtered results with the range STARTING on the entries\' date - entries dated exactly on both the start and end dates are included', async () => {
      await facilityDetailPage.reload();
      await facilityAuditTab.open();
      const { applied, messages } = await facilityAuditTab.applyFilterByCalendar({ from: today(), to: today() });
      expect(applied, `the filter was not applied: ${messages.join(' | ')}`).toBe(true);
      expect((await facilityAuditTab.readAllEntries()).length, 'entries dated on the START date').toBe(todays.length);
    });
  });

  test(`TC-${CASES.combined.azureId}: should apply an action-type filter and a date range together`, async ({
    page,
    facilityIn,
    facilityManagementPage,
    facilityDetailPage,
    facilityAuditTab,
    steps,
  }) => {
    const facility = await facilityIn('Active');

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility directory', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open facility FAC-205 (several Edit and status entries) and select the Audit tab - the full audit history list loads', async () => {
      const statuses = await editThenToggle(page, facility.id, 'QA Audit Combined');
      expect(statuses.every((s) => s < 300), `answers ${statuses.join(', ')}`).toBe(true);
      await facilityDetailPage.open(facility.id);
      await facilityAuditTab.open();
      expect((await facilityAuditTab.readAllEntries()).length, 'audit entries').toBeGreaterThan(0);
    });

    await steps.step(`Apply action-type filter Edit together with a date range (today) - the list refreshes`, async () => {
      const { applied, request, messages } = await facilityAuditTab.applyFilterByCalendar({ actionType: CASES.combined.filter, from: today(), to: today() });
      expect(applied, `the filter was not applied: ${messages.join(' | ')}`).toBe(true);
      expect({ actionType: String(request?.actionType ?? '').toUpperCase(), range: Boolean(request?.fromUtc && request?.toUtc) }, 'what was sent').toEqual({ actionType: 'UPDATE', range: true });
    });

    await steps.step('Review the filtered results - only Edit entries within the range are displayed (AND logic)', async () => {
      const shown = await facilityAuditTab.readAllEntries();
      expect(shown.filter((e) => !LABEL.edit.test(e.action) || !e.when.startsWith(today())), 'entries outside Edit + today').toEqual([]);
      const expected = await readFacilityAuditTrail(page, facility.id, { actionType: 'UPDATE', ...riyadhDayUtcRange(riyadhDay(0)) });
      expect(shown.length, 'entries matching both').toBe(expected.totalRows);
      await facilityDetailPage.reload();
      await facilityAuditTab.open();
      const outside = await facilityAuditTab.applyFilterByCalendar({ actionType: CASES.combined.filter, from: facilityDayText(riyadhDay(-40)), to: facilityDayText(riyadhDay(-10)) });
      expect(outside.applied).toBe(true);
      expect(await facilityAuditTab.readEntries(), 'Edit entries in a range before the facility existed').toEqual([]);
    });
  });

  test(`TC-${CASES.clearFilters.azureId}: should restore the complete audit history when the filters are cleared`, async ({
    page,
    facilityIn,
    facilityManagementPage,
    facilityDetailPage,
    facilityAuditTab,
    steps,
  }) => {
    const data = CASES.clearFilters;
    const facility = await facilityIn('Active');
    let full: AuditEntry[] = [];

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility directory', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open facility FAC-206, select the Audit tab, and apply an action-type filter - the list shows only filtered entries', async () => {
      const statuses = await editThenToggle(page, facility.id, data.buildingName);
      expect(statuses.every((s) => s < 300), `answers ${statuses.join(', ')}`).toBe(true);
      await facilityDetailPage.open(facility.id);
      await facilityAuditTab.open();
      full = await facilityAuditTab.readAllEntries();
      const { applied, messages } = await facilityAuditTab.applyFilterByCalendar({ actionType: data.filter });
      expect(applied, `the filter was not applied: ${messages.join(' | ')}`).toBe(true);
      expect((await facilityAuditTab.readAllEntries()).filter((e) => !LABEL.edit.test(e.action)), 'entries of another action type').toEqual([]);
      expect((await facilityAuditTab.getChips()).join(' '), 'the applied filter chip').toMatch(new RegExp(data.filter, 'i'));
    });

    await steps.step('Select the clear / reset filters option - the filter controls reset to their default state', async () => {
      const how = await clearAuditFilters(page);
      expect(how, 'a clear / reset control on the tab').not.toBe('none');
      expect(await facilityAuditTab.getChips(), 'filter chips after clearing').toEqual([]);
    });

    await steps.step('Review the resulting list - the complete, unfiltered audit history is displayed again', async () => {
      expect(labels(await facilityAuditTab.readAllEntries()), 'the history after clearing').toEqual(labels(full));
    });
  });

  test(`TC-${CASES.whoWhenWhat.azureId}: should show who made a change, when, and the old and new values`, async ({
    page,
    facilityIn,
    facilityManagementPage,
    facilityDetailPage,
    facilityAuditTab,
    steps,
  }) => {
    const data = CASES.whoWhenWhat;
    const stamp = facilityStamp();
    const oldName = `${SUITE_FACILITY_PREFIX} ${data.oldLabel} ${stamp}`;
    const newName = `${SUITE_FACILITY_PREFIX} ${data.newLabel} ${stamp}`;
    const facility = await facilityIn('Active', { nameEn: oldName });
    let detail!: Awaited<ReturnType<typeof facilityAuditTab.openEntry>>;

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility directory', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(oldName)).toBe(true);
    });

    await steps.critical(`Open facility FAC-207 (renamed "${data.oldLabel}" -> "${data.newLabel}") and select the Audit tab - the audit history list loads`, async () => {
      const renamed = await updateFacilityFields(page, facility.id, { facilityNameEn: newName });
      expect(renamed.status, `the rename: ${renamed.text.slice(0, 160)}`).toBeLessThan(300);
      await facilityDetailPage.open(facility.id);
      await facilityAuditTab.open();
      expect((await facilityAuditTab.readEntries()).length, 'audit entries').toBeGreaterThan(0);
    });

    await steps.critical('Locate the Edit entry for the name change and expand it - the entry expands to show detail', async () => {
      const entries = await facilityAuditTab.readEntries();
      let found = false;
      for (let i = 0; i < entries.length && !found; i += 1) {
        detail = await facilityAuditTab.openEntry(i);
        found = detail.changes.some((c) => c.before.includes(data.oldLabel) && c.after.includes(data.newLabel));
        if (!found) await facilityAuditTab.closeEntry();
      }
      expect(found, `an entry whose detail shows the name change; entries: ${labels(entries).join(', ')}`).toBe(true);
    });

    await steps.step('Review the detail content - the old value, the new value, the acting user and the exact timestamp are all displayed', async () => {
      const change = detail.changes.find((c) => c.before.includes(data.oldLabel) && c.after.includes(data.newLabel));
      expect(change?.before, 'the old value').toContain(oldName);
      expect(change?.after, 'the new value').toContain(newName);
      const recorded = (await readFacilityAuditTrail(page, facility.id, { actionType: 'UPDATE' })).items[0];
      expect(recorded?.actorLabel, 'the acting user recorded').toBeTruthy();
      expect(detail.meta, 'the acting user shown').toContain(String(recorded?.actorLabel));
      expect(detail.meta, 'the date and time shown').toMatch(new RegExp(`${today().replace(/\//g, '\\/')}\\s+\\d{1,2}:\\d{2}`));
    });
  });

  test(`TC-${CASES.rapidFilters.azureId}: should show consistent, correct results after rapid repeated filter changes`, async ({
    page,
    facilityIn,
    facilityManagementPage,
    facilityDetailPage,
    facilityAuditTab,
    steps,
  }) => {
    const data = CASES.rapidFilters;
    const facility = await facilityIn('Active');
    const ranges = [{ from: today(), to: today() }, { from: facilityDayText(riyadhDay(-7)), to: today() }];
    let settled: AuditEntry[] = [];

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility directory', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open facility FAC-209 (a varied history) and select the Audit tab - the full audit history list loads', async () => {
      const statuses = await editThenToggle(page, facility.id, 'QA Audit Rapid');
      expect(statuses.every((s) => s < 300), `answers ${statuses.join(', ')}`).toBe(true);
      await facilityDetailPage.open(facility.id);
      await facilityAuditTab.open();
      expect((await facilityAuditTab.readAllEntries()).length, 'audit entries').toBeGreaterThan(0);
    });

    await steps.step('Rapidly switch between several action-type and date-range filter combinations - the list updates after each change without errors', async () => {
      const refusedOnes: string[] = [];
      for (const [i, actionType] of data.sequence.entries()) {
        const range = ranges[i % 2 === 0 || i === data.sequence.length - 1 ? 0 : 1];
        const answer = await facilityAuditTab.applyFilterByCalendar({ actionType, ...range });
        if (!answer.applied || answer.messages.length > 0) refusedOnes.push(`${actionType} ${range.from}-${range.to}: ${answer.messages.join(' | ') || 'not applied'}`);
      }
      expect(refusedOnes, 'filter changes that failed or raised a message').toEqual([]);
      settled = await facilityAuditTab.readAllEntries();
    });

    await steps.step('Settle on one combination and compare it to applying it directly on a fresh load - the two results match', async () => {
      await facilityDetailPage.reload();
      await facilityAuditTab.open();
      const direct = await facilityAuditTab.applyFilterByCalendar({ actionType: data.settleOn, ...ranges[0] });
      expect(direct.applied).toBe(true);
      expect(await facilityAuditTab.readAllEntries(), 'the settled result vs a fresh load').toEqual(settled);
    });
  });

  test(`TC-${CASES.failedDeleteLogged.azureId}: should record a delete blocked by network membership as a failed entry with its reason`, async ({
    page,
    facilityManagementPage,
    facilityDetailPage,
    facilityAuditTab,
    steps,
  }) => {
    const anchor = await networkAnchorOrBlock(page, test.info());
    const { id, nameEn: name } = anchor.facility;

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility directory', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(name)).toBe(true);
    });

    await steps.critical('Trigger a blocked delete attempt on facility FAC-211 - the deletion is blocked as expected', async () => {
      const answer = await facilityManagementPage.deleteFacility(name);
      expect(answer.status, `DeleteFacility answered ${answer.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
      expect(answer.messages.join(' | '), 'the reason shown').toMatch(NETWORK_BLOCK);
    });

    await steps.critical('Open facility FAC-211 and select the Audit tab - the audit history list loads', async () => {
      await facilityDetailPage.open(id);
      await facilityAuditTab.open();
      expect(await facilityDetailPage.hasTab('audit')).toBe(true);
    });

    await steps.step('Locate the Delete entry - the entry is marked as failed and references the blocking reason', async () => {
      const entries = await facilityAuditTab.readEntries();
      const index = entries.findIndex((e) => LABEL.delete.test(e.action));
      expect(index, `a Delete entry among the newest: ${labels(entries).join(', ')}`).toBeGreaterThanOrEqual(0);
      const detail = await facilityAuditTab.openEntry(index);
      const said = `${entries[index].action} ${detail.action} ${detail.changes.map((c) => `${c.field} ${c.before} ${c.after}`).join(' ')}`;
      expect(said, 'the entry marked failed').toMatch(LABEL.failed);
      expect(said, 'the blocking reason').toMatch(FAILURE_CONTEXT);
    });
  });

  test(`TC-${CASES.invalidRange.azureId}: should refuse a date range whose end date precedes its start date`, async ({
    page,
    facilityIn,
    facilityManagementPage,
    facilityDetailPage,
    facilityAuditTab,
    steps,
  }) => {
    const data = CASES.invalidRange;
    const facility = await facilityIn('Active');
    let before: AuditEntry[] = [];
    let attempt!: Awaited<ReturnType<typeof facilityAuditTab.applyFilterByCalendar>>;

    await steps.critical('Navigate to the Facility Management module - the module loads and displays the facility directory', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Open facility FAC-208 and select the Audit tab - the full audit history list loads', async () => {
      expect((await updateFacilityFields(page, facility.id, { buildingName: `QA Audit Range ${facilityStamp()}` })).status).toBeLessThan(300);
      await facilityDetailPage.open(facility.id);
      await facilityAuditTab.open();
      before = await facilityAuditTab.readAllEntries();
      expect(before.length, 'audit entries').toBeGreaterThan(0);
    });

    await steps.step(`Set the date-range filter with start date ${data.from} and end date ${data.to} - a validation message appears`, async () => {
      attempt = await facilityAuditTab.applyFilterByCalendar({ from: data.from, to: data.to });
      expect(attempt.messages.join(' | '), 'a validation message for the reversed range').toMatch(RANGE_INVALID);
    });

    await steps.step('Attempt to apply the filter - the system prevents applying the invalid range and the list remains unchanged', async () => {
      expect(attempt.applied, `the reversed range was applied (sent ${JSON.stringify(attempt.request ?? {})})`).toBe(false);
      expect(await facilityAuditTab.readAllEntries(), 'the list after the attempt').toEqual(before);
    });
  });
});
