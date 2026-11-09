import { test, expect } from '../../../fixtures';
import type { Page } from '@playwright/test';
import { ACTION_LABEL, AUDIT_TIME, CASES, WRITE_CONTROL } from '../../../data/member/viewMemberAuditHistory.data';
import { WRITER_D_ENDPOINT } from '../../../constants/member/writerDIds';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import type { AuditLogRow } from '../../../pages/system/AuditLogsPage';
import type { MemberDetailPage } from '../../../pages/member/MemberDetailPage';
import {
  activateMember,
  deactivateMember,
  deleteMember,
  readAuditEntry,
  readMember,
  readMemberAuditTrail,
  updateMemberFields,
  type ProvisionedMember,
} from '../../../utils/MemberProvisioning';
import {
  asSession,
  auditRowActionLabels,
  auditTabLabels,
  findCreateEntryAnywhere,
  memberTrail,
  memberTrailPages,
  utcTime,
  type AuditKind,
  type AuditLine,
} from '../../../utils/member/writerDHelpers';

/** The member's trail once at least `atLeast` entries are written (audit writes are not always instant; ~20 s at most). */
async function settledTrail(page: Page, memberId: string, atLeast: number): Promise<AuditLine[]> {
  for (let round = 0; round < 10; round += 1) {
    if ((await readMemberAuditTrail(page, memberId, {}, 200)).totalRows >= atLeast) break;
    await page.waitForTimeout(2_000);
  }
  return memberTrail(page, memberId);
}

/** Step 2 of every case: the member's view page and its (missing) Audit History view, with what the trail in Audit Logs holds. */
async function openAuditView(detail: MemberDetailPage, member: ProvisionedMember): Promise<{ tabs: string[]; audit: string[] }> {
  await detail.open(member.id);
  return { tabs: await detail.readTabLabels(), audit: await auditTabLabels(detail) };
}

const kindsOf = (trail: AuditLine[]): AuditKind[] => trail.map((l) => l.kind);
const listTrail = (trail: AuditLine[]): string => trail.map((l) => `${l.entry.actionType}(${l.kind}) by ${l.entry.actorLabel || '?'} at ${l.entry.occurredAtUtc}`).join('; ') || 'no entries';
const rowsText = (rows: AuditLogRow[]): string => rows.map((r) => `${r.occurredAt} ${r.actionType} ${r.actor}`).join('; ') || 'no rows';

/**
 * User story 14387: View Member - Audit History.
 * The member's view page has NO Audit History tab (known finding): step 2 of
 * every case asserts the view the case opens and fails; the case then reads the
 * member's trail where the application keeps it - System Settings > Audit Logs
 * and its GetAuditLogs / GetAuditLogById - and asserts the rest of the case
 * against it (data/member/viewMemberAuditHistory.data.ts). Every member is the
 * case's own, built through the API; the administrator is the Compliance Officer.
 */
test.describe('US 14387 - View Member - Audit History', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.completeHistory.azureId}: should list every action performed on the member, creation included, in time order`, async ({
    page,
    memberIn,
    memberManagementPage,
    memberDetailPage,
    auditLogsPage,
    steps,
  }) => {
    const member = await memberIn('Active');
    let trail: AuditLine[] = [];

    await steps.critical('Navigate to the Member Management module - the module loads and displays the member list', async () => {
      const answers = [
        (await updateMemberFields(page, member.id, { occupation: CASES.completeHistory.occupation })).status,
        (await deactivateMember(page, member.id)).status,
        (await activateMember(page, member.id)).status,
      ];
      expect(answers.every((s) => s < 300), `the edit / deactivate / activate answered ${answers.join(', ')}`).toBe(true);
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(member.displayNameEn)).toBe(true);
    });

    await steps.step('Open the member record and navigate to its Audit History view - the audit history view loads and displays a list of recorded actions', async () => {
      const view = await openAuditView(memberDetailPage, member);
      trail = await settledTrail(page, member.id, 3);
      expect({ auditHistoryView: view.audit.length > 0, actionsListed: trail.length > 0 }, `the view page offers the tabs: ${view.tabs.join(', ')}; the trail in Audit Logs: ${listTrail(trail)}`)
        .toEqual({ auditHistoryView: true, actionsListed: true });
    });

    await steps.step('Review the list of entries - every action performed on the member is listed, including creation and subsequent changes', async () => {
      if (trail.length === 0) trail = await memberTrail(page, member.id);
      const kinds = kindsOf(trail);
      const elsewhere = await findCreateEntryAnywhere(page, { memberCode: member.code, documentId: member.documentId });
      const rows = await auditLogsPage.findRowsMentioning(member.id);
      const times = rows.map((r) => r.occurredAt);
      expect({
        creation: kinds.includes('create'),
        fieldChange: kinds.includes('update'),
        deactivation: kinds.includes('deactivate'),
        activation: kinds.includes('activate'),
        chronological: times.every((t, i) => i === 0 || times[i - 1] >= t),
      }, `the member's trail: ${listTrail(trail)}; Audit Logs rows: ${rowsText(rows)}; a CREATE mentioning ${member.code} `
        + `${elsewhere ? `is filed under ANOTHER entity id (${elsewhere.entityId})` : 'was not found at all'}`)
        .toEqual({ creation: true, fieldChange: true, deactivation: true, activation: true, chronological: true });
    });
  });

  test(`TC-${CASES.entryDetails.azureId}: should show the action, the performer and the date and time on each audit entry`, async ({
    page,
    memberIn,
    memberManagementPage,
    memberDetailPage,
    auditLogsPage,
    steps,
  }) => {
    const member = await memberIn('Active');
    const span = { from: 0, to: 0 };

    await steps.critical('Navigate to the Member Management module - the module loads and displays the member list', async () => {
      span.from = Date.now() - 5_000;
      const answer = await deactivateMember(page, member.id);
      span.to = Date.now() + 5_000;
      expect(answer.status, `the status change (deactivation): ${answer.text.slice(0, 160)}`).toBeLessThan(300);
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(member.displayNameEn)).toBe(true);
    });

    await steps.step('Open the member record and navigate to its Audit History view - the audit history view loads and displays recorded entries', async () => {
      const view = await openAuditView(memberDetailPage, member);
      const trail = await settledTrail(page, member.id, 1);
      expect({ auditHistoryView: view.audit.length > 0, entriesShown: trail.length > 0 }, `the view page offers the tabs: ${view.tabs.join(', ')}; the trail: ${listTrail(trail)}`)
        .toEqual({ auditHistoryView: true, entriesShown: true });
    });

    await steps.step('Select an individual audit entry and review its details - the entry shows the action performed, the user who performed it, and the exact date/time', async () => {
      const trail = await memberTrail(page, member.id);
      const statusChange = trail.find((l) => l.kind === 'deactivate');
      const rows = await auditLogsPage.findRowsMentioning(member.id);
      const row = rows[0];
      const record = await readMember(page, member.id);
      const performer = `${record.modifiedByName ?? record.createdByName ?? ''}`;
      const at = statusChange ? utcTime(statusChange.entry.occurredAtUtc) : NaN;
      expect({
        entryRecorded: statusChange !== undefined && row !== undefined,
        actionNamesTheStatusChange: ACTION_LABEL.deactivate.test(row?.actionType ?? '') || /status/i.test(row?.actionType ?? ''),
        performerShown: (row?.actor ?? '') !== '' && (performer.includes(row?.actor ?? '\u0000') || (row?.actor ?? '').includes(performer || '\u0000')),
        dateTimeShown: AUDIT_TIME.test(row?.occurredAt ?? ''),
        exactTime: at >= span.from && at <= span.to,
      }, `Audit Logs row: ${rowsText(rows.slice(0, 1))}; the entry: ${statusChange ? listTrail([statusChange]) : 'none'}; the record was changed by "${performer}"`)
        .toEqual({ entryRecorded: true, actionNamesTheStatusChange: true, performerShown: true, dateTimeShown: true, exactTime: true });
    });
  });

  test(`TC-${CASES.everyActionType.azureId}: should record creation, activation, deactivation and a field update as distinct, correctly labelled entries`, async ({
    page,
    memberIn,
    memberManagementPage,
    memberDetailPage,
    steps,
  }) => {
    const member = await memberIn('Active');
    let trail: AuditLine[] = [];

    await steps.critical('Navigate to the Member Management module - the module loads and displays the member list', async () => {
      const answers = [
        (await deactivateMember(page, member.id)).status,
        (await activateMember(page, member.id)).status,
        (await updateMemberFields(page, member.id, { occupation: CASES.everyActionType.occupation })).status,
      ];
      expect(answers.every((s) => s < 300), `the deactivate / activate / field update answered ${answers.join(', ')}`).toBe(true);
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(member.displayNameEn)).toBe(true);
    });

    await steps.step('Open the member record and navigate to its Audit History view - the audit history view loads and displays recorded entries', async () => {
      const view = await openAuditView(memberDetailPage, member);
      trail = await settledTrail(page, member.id, 3);
      expect({ auditHistoryView: view.audit.length > 0, entriesShown: trail.length > 0 }, `the view page offers the tabs: ${view.tabs.join(', ')}; the trail: ${listTrail(trail)}`)
        .toEqual({ auditHistoryView: true, entriesShown: true });
    });

    await steps.step('Review entries for each distinct action category (creation, activation, deactivation, field update) - each action type appears as a distinct, correctly labelled entry', async () => {
      if (trail.length === 0) trail = await memberTrail(page, member.id);
      const category = (kind: AuditKind): string | null => trail.find((l) => l.kind === kind)?.entry.actionType ?? null;
      const labels = { creation: category('create'), activation: category('activate'), deactivation: category('deactivate'), fieldUpdate: category('update') };
      expect({
        creation: labels.creation !== null && ACTION_LABEL.create.test(labels.creation),
        activation: labels.activation !== null && ACTION_LABEL.activate.test(labels.activation),
        deactivation: labels.deactivation !== null && ACTION_LABEL.deactivate.test(labels.deactivation),
        fieldUpdate: labels.fieldUpdate !== null && ACTION_LABEL.update.test(labels.fieldUpdate),
        distinctLabels: new Set(Object.values(labels).filter((l) => l !== null)).size === 4,
      }, `labels per category ${JSON.stringify(labels)}; the trail: ${listTrail(trail)}`)
        .toEqual({ creation: true, activation: true, deactivation: true, fieldUpdate: true, distinctLabels: true });
    });
  });

  test(`TC-${CASES.emptyThenFirst.azureId}: should show the initial state of a new member's history and one more entry after its first action`, async ({
    page,
    memberIn,
    memberManagementPage,
    memberDetailPage,
    steps,
  }) => {
    const member = await memberIn('InactiveAtCreate');
    let before: AuditLine[] = [];

    await steps.critical('Navigate to the Member Management module - the module loads and displays the member list', async () => {
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(member.displayNameEn)).toBe(true);
    });

    await steps.step('Open the newly created member and navigate to its Audit History view - the audit history displays the creation event as the sole entry, or an appropriate initial state', async () => {
      const view = await openAuditView(memberDetailPage, member);
      before = await settledTrail(page, member.id, 1);
      const initial = before.length === 0 || (before.length === 1 && before[0].kind === 'create');
      expect({ auditHistoryView: view.audit.length > 0, initialState: initial }, `the view page offers the tabs: ${view.tabs.join(', ')}; the trail: ${listTrail(before)}`)
        .toEqual({ auditHistoryView: true, initialState: true });
    });

    await steps.step('Perform one action on the member (activate) and return to the Audit History view - a second entry now appears, bringing the total to two entries', async () => {
      const answer = await activateMember(page, member.id);
      expect(answer.status, `Activate answered ${answer.text.slice(0, 160)}`).toBeLessThan(300);
      const after = await settledTrail(page, member.id, before.length + 1);
      await memberDetailPage.open(member.id);
      expect({ entries: after.length, newest: after[after.length - 1]?.kind ?? null }, `the trail after the activation: ${listTrail(after)} (before: ${before.length})`)
        .toEqual({ entries: 2, newest: 'activate' });
    });
  });

  test(`TC-${CASES.immutable.azureId}: should offer no edit or delete control on an audit entry and refuse an alteration through another route`, async ({
    page,
    memberIn,
    memberManagementPage,
    memberDetailPage,
    auditLogsPage,
    steps,
  }) => {
    const member = await memberIn('Active');
    let rows: AuditLogRow[] = [];
    let trail: AuditLine[] = [];

    await steps.critical('Navigate to the Member Management module - the module loads and displays the member list', async () => {
      expect((await updateMemberFields(page, member.id, { occupation: CASES.immutable.occupation })).status).toBeLessThan(300);
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(member.displayNameEn)).toBe(true);
    });

    await steps.step("Open the member's Audit History view - the audit history view loads and displays recorded entries", async () => {
      const view = await openAuditView(memberDetailPage, member);
      trail = await settledTrail(page, member.id, 1);
      expect({ auditHistoryView: view.audit.length > 0, entriesShown: trail.length > 0 }, `the view page offers the tabs: ${view.tabs.join(', ')}; the trail: ${listTrail(trail)}`)
        .toEqual({ auditHistoryView: true, entriesShown: true });
    });

    await steps.step('Attempt to locate any edit or delete control on an individual audit entry - no edit or delete option is available for any audit entry', async () => {
      rows = await auditLogsPage.findRowsMentioning(member.id);
      expect(rows.length, 'the member\'s entries in Audit Logs').toBeGreaterThan(0);
      if (trail.length === 0) trail = await memberTrail(page, member.id);
      const controls: string[] = [];
      for (const line of trail) controls.push(...(await auditRowActionLabels(page, line.entry.id)).filter((label) => WRITE_CONTROL.test(label)));
      expect(controls, 'edit / delete controls on the member\'s audit entries').toEqual([]);
    });

    await steps.step('Attempt to modify an entry via an alternate route (direct request) - the system rejects the attempt and the entry remains unchanged', async () => {
      const target = trail[trail.length - 1]?.entry ?? (await memberTrail(page, member.id))[0]?.entry;
      expect(target, 'an audit entry of the member').toBeDefined();
      const original = await readAuditEntry(page, target.id);
      const attempts = {
        update: await asSession(page, 'PUT', WRITER_D_ENDPOINT.auditUpdate, { ...original, afterJson: '{}' }),
        delete: await asSession(page, 'DELETE', `${WRITER_D_ENDPOINT.auditDelete}/${target.id}`),
        deleteById: await asSession(page, 'DELETE', `${ApiEndpoints.auditLogById}/${target.id}`),
      };
      const after = await readAuditEntry(page, target.id);
      expect({
        updateRejected: attempts.update.status >= 400,
        deleteRejected: attempts.delete.status >= 400,
        deleteByIdRejected: attempts.deleteById.status >= 400,
        unchanged: JSON.stringify([after.actionType, after.beforeJson, after.afterJson, after.occurredAtUtc]) === JSON.stringify([original.actionType, original.beforeJson, original.afterJson, original.occurredAtUtc]),
      }, `answers ${JSON.stringify(Object.fromEntries(Object.entries(attempts).map(([k, v]) => [k, v.status])))}`)
        .toEqual({ updateRejected: true, deleteRejected: true, deleteByIdRejected: true, unchanged: true });
    });
  });

  test(`TC-${CASES.volume.azureId}: should keep a long audit history complete and correct across pages`, async ({
    page,
    memberIn,
    memberManagementPage,
    memberDetailPage,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const data = CASES.volume;
    const member = await memberIn('Active');
    let pages: { pages: Awaited<ReturnType<typeof memberTrailPages>>['pages']; totalRows: number } = { pages: [], totalRows: 0 };

    await steps.critical(`Navigate to the Member Management module - the module loads and displays the member list (the member then edited ${data.edits} times)`, async () => {
      const failed: string[] = [];
      for (let n = 1; n <= data.edits; n += 1) {
        const answer = await updateMemberFields(page, member.id, { occupation: `${data.occupation} ${n}` });
        if (answer.status >= 300) failed.push(`edit ${n}: ${answer.status} ${answer.text.slice(0, 120)}`);
      }
      expect(failed, 'edits refused').toEqual([]);
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(member.displayNameEn)).toBe(true);
    });

    await steps.step("Open the member's Audit History view - the audit history view loads, displaying entries with pagination or scrolling as needed", async () => {
      const view = await openAuditView(memberDetailPage, member);
      await settledTrail(page, member.id, data.edits);
      pages = await memberTrailPages(page, member.id, data.rowsPerPage);
      expect({
        auditHistoryView: view.audit.length > 0,
        paged: pages.pages.length > 1 && (pages.pages[0]?.length ?? 0) <= data.rowsPerPage,
      }, `the view page offers the tabs: ${view.tabs.join(', ')}; the trail: ${pages.totalRows} entries over ${pages.pages.length} pages`)
        .toEqual({ auditHistoryView: true, paged: true });
    });

    await steps.step('Navigate through multiple pages, and try sorting/filtering if available - all entries load correctly without errors, duplication, or missing records across pages', async () => {
      if (pages.pages.length === 0) pages = await memberTrailPages(page, member.id, data.rowsPerPage);
      const ids = pages.pages.flat().map((e) => e.id);
      const filtered = await readMemberAuditTrail(page, member.id, { actionType: 'UPDATE' }, 200);
      expect({
        loaded: ids.length,
        unique: new Set(ids).size,
        atLeastTheEdits: ids.length >= data.edits,
        filterAnswers: filtered.totalRows > 0,
      }, `pages of ${data.rowsPerPage}: ${pages.pages.map((p) => p.length).join(' + ')}`)
        .toEqual({ loaded: pages.totalRows, unique: pages.totalRows, atLeastTheEdits: true, filterAnswers: true });
    });

    await steps.step('Spot-check entries from the beginning, middle, and end of the history - each spot-checked entry displays complete and correct details', async () => {
      const edits = (await memberTrail(page, member.id)).filter((l) => l.changes.Occupation !== undefined);
      const picks = [0, Math.floor(edits.length / 2), edits.length - 1];
      const wrong = picks.map((i) => {
        const line = edits[i];
        const expected = `${data.occupation} ${i + 1}`;
        const ok = line !== undefined && line.changes.Occupation?.[1] === expected && line.entry.actorLabel !== '' && !Number.isNaN(Date.parse(line.entry.occurredAtUtc));
        return ok ? null : `entry ${i + 1}: ${line ? `${JSON.stringify(line.changes.Occupation)} by "${line.entry.actorLabel}" at ${line.entry.occurredAtUtc}` : 'missing'} (expected Occupation -> "${expected}")`;
      }).filter((w): w is string => w !== null);
      expect({ edits: edits.length, wrong }).toEqual({ edits: data.edits, wrong: [] });
    });
  });

  test(`TC-${CASES.oldAndNew.azureId}: should show the old and the new value of a changed field distinctly`, async ({
    page,
    memberIn,
    memberManagementPage,
    memberDetailPage,
    auditLogsPage,
    steps,
  }) => {
    const data = CASES.oldAndNew;
    const member = await memberIn('Active', { mobileNumber: data.before });

    await steps.critical('Navigate to the Member Management module - the module loads and displays the member list', async () => {
      const answer = await updateMemberFields(page, member.id, { mobileNumber: data.after });
      expect(answer.status, `the Contact Number change: ${answer.text.slice(0, 160)}`).toBeLessThan(300);
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(member.displayNameEn)).toBe(true);
    });

    await steps.step('Open the member and navigate to its Audit History view - the audit history view loads and displays recorded entries', async () => {
      const view = await openAuditView(memberDetailPage, member);
      const trail = await settledTrail(page, member.id, 1);
      expect({ auditHistoryView: view.audit.length > 0, entriesShown: trail.length > 0 }, `the view page offers the tabs: ${view.tabs.join(', ')}; the trail: ${listTrail(trail)}`)
        .toEqual({ auditHistoryView: true, entriesShown: true });
    });

    await steps.step(`Select the entry corresponding to the field change - the entry clearly displays the old value "${data.before}" and the new value "${data.after}" labelled distinctly`, async () => {
      const line = (await memberTrail(page, member.id)).find((l) => l.changes[data.field] !== undefined);
      const rows = await auditLogsPage.findRowsMentioning(member.id);
      expect({ listed: rows.length > 0, field: data.field, before: line?.changes[data.field]?.[0] ?? null, after: line?.changes[data.field]?.[1] ?? null }, `the entry's changes: ${JSON.stringify(line?.changes ?? {})}`)
        .toEqual({ listed: true, field: data.field, before: data.before, after: data.after });
    });
  });

  test(`TC-${CASES.crossFeature.azureId}: should record a deactivation and a later deletion with their performer and time`, async ({
    page,
    memberIn,
    memberManagementPage,
    memberDetailPage,
    auditLogsPage,
    steps,
  }) => {
    const member = await memberIn('Active');
    const span = { from: 0, to: 0 };

    await steps.critical('Navigate to the Member Management module - the module loads and displays the member list', async () => {
      span.from = Date.now() - 5_000;
      const deactivated = await deactivateMember(page, member.id);
      const deleted = await deleteMember(page, member.id);
      span.to = Date.now() + 5_000;
      expect({ deactivate: deactivated.status, delete: deleted.status }, `${deactivated.text.slice(0, 120)} / ${deleted.text.slice(0, 120)}`).toEqual({ deactivate: 200, delete: 200 });
      await memberManagementPage.openTable();
      expect(await memberManagementPage.isListed(member.displayNameEn), 'the deleted member in the list').toBe(false);
    });

    await steps.step('Locate the member record that was deactivated and later deleted, and open its Audit History view - the audit history view loads and displays recorded entries for the member', async () => {
      await memberDetailPage.openExpectingFailure(member.id);
      const opened = await memberDetailPage.isLoaded();
      const audit = opened ? await auditTabLabels(memberDetailPage) : [];
      const rows = await auditLogsPage.findRowsMentioning(member.id);
      expect({ auditHistoryView: audit.length > 0, entriesShown: rows.length > 0 }, `the deleted member's view page ${opened ? 'opened' : 'did not open'}; Audit Logs rows: ${rowsText(rows)}`)
        .toEqual({ auditHistoryView: true, entriesShown: true });
    });

    await steps.step('Review the entries for the deactivation and deletion actions - both are recorded with the correct performer and timestamp', async () => {
      const trail = await settledTrail(page, member.id, 2);
      const within = (l: AuditLine | undefined): boolean => {
        if (!l) return false;
        const at = utcTime(l.entry.occurredAtUtc);
        return at >= span.from && at <= span.to && l.entry.actorLabel !== '';
      };
      const deactivation = trail.find((l) => l.kind === 'deactivate');
      const deletion = trail.find((l) => l.kind === 'delete');
      expect({
        deactivationRecorded: within(deactivation) && ACTION_LABEL.deactivate.test(deactivation?.entry.actionType ?? ''),
        deletionRecorded: within(deletion) && ACTION_LABEL.delete.test(deletion?.entry.actionType ?? ''),
      }, `the trail: ${listTrail(trail)}`).toEqual({ deactivationRecorded: true, deletionRecorded: true });
    });
  });
});
