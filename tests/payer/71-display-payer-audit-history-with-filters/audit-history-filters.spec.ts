import { test, expect } from '../../../fixtures';
import { azureOrCase } from '../../../data/azureTestIds.data';
import type { ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';
import { NON_ADMIN_PROFILE } from '../../../data/accounts/nonAdminAccount.data';
import type { PayerManagementPage } from '../../../pages/payer/PayerManagementPage';
import type { PayerInactivateDialog } from '../../../pages/payer/PayerInactivateDialog';
import type { ApprovalManagementPage } from '../../../pages/approval/ApprovalManagementPage';
import { AUDIT_LOG_COLUMN } from '../../../constants/ElementIds';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import { PRIMARY_REASON } from '../../../data/payers/inactivationDecisions.data';
import {
  ACTION,
  ACTION_OPTIONS,
  AUDIT_EDIT,
  BLOCKED_CASES,
  EMPTY_HISTORY_TEXT,
  ENTRY_ONLY_ACTION,
  MUTATING_CONTROL,
  NO_MATCH_MESSAGE,
  STATUS_TRANSITION_DIFF,
  TIMESTAMP_PATTERN,
  parseEntryTimestamp,
} from '../../../data/payers/auditHistoryFilters.data';

/**
 * User story: Display Payer Audit History with Filters.
 *
 * Each case builds a rich trail on a disposable payer - an approved edit (an
 * Update entry) and an approved inactivation (a Status Change entry) above the
 * Create entry - then reads the timeline, its filters and its detail drawer.
 */
const today = (): Date => new Date();
const yesterday = (): Date => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
};

/** Gives the payer an Update and a Status Change entry above its Create entry. */
async function buildAuditHistory(
  payerManagementPage: PayerManagementPage,
  payerInactivateDialog: PayerInactivateDialog,
  approvalManagementPage: ApprovalManagementPage,
  name: string,
): Promise<void> {
  await payerManagementPage.open();
  await payerManagementPage.editTextFieldAndSave(name, AUDIT_EDIT.label, AUDIT_EDIT.value);
  await payerManagementPage.open();
  await payerManagementPage.sendForApproval(name);
  await approvalManagementPage.open();
  await approvalManagementPage.approve(name);
  await payerManagementPage.open();
  await payerManagementPage.search(name);
  await payerManagementPage.waitForRowVisible(name);
  await payerManagementPage.inactivateRow(name);
  await payerInactivateDialog.selectReason(PRIMARY_REASON);
  await payerInactivateDialog.confirm();
  await payerManagementPage.open();
  await payerManagementPage.sendForApproval(name);
  await approvalManagementPage.open();
  await approvalManagementPage.approve(name);
  await payerManagementPage.open();
  await payerManagementPage.search(name);
  await payerManagementPage.expectLifecycleStatus(name, LIFECYCLE_STATUS.inactive.en);
}

test.describe('Payer audit history with filters', () => {
  // Azure test case 14598
  test('14598: should show the payer\'s audit history with timestamp, user, action and a field-level diff', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module and give the payer a change history', async () => {
      await buildAuditHistory(payerManagementPage, payerInactivateDialog, approvalManagementPage, publishedPayer.nameEn);
    });

    await steps.step('Every entry shows a timestamp, a user and an action', async () => {
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const audit = detail.auditHistory();
      await audit.open();
      const entries = await audit.getEntries();
      expect(entries.length, 'the trail should hold the create, the update and the status change').toBeGreaterThanOrEqual(3);
      for (const entry of entries) {
        expect(entry.action, `an entry should name its action: "${entry.raw}"`).not.toBe('');
        expect(entry.timestamp, `an entry should carry a timestamp: "${entry.raw}"`).toMatch(TIMESTAMP_PATTERN);
        expect(entry.user, `an entry should name its user: "${entry.raw}"`).not.toBe('');
      }
    });

    await steps.step('An entry\'s details show field, before and after values', async () => {
      const audit = payerManagementPage.detail().auditHistory();
      const details = await audit.openEntryDetails(0);
      expect(details.diff.length, 'the drawer should list the changed fields').toBeGreaterThan(0);
      for (const row of details.diff) expect(row.field, 'each diff row should name its field').not.toBe('');
      await audit.closeDetails();
    });
  });

  // Azure test case 14602
  test('14602: should show all required fields for every action type in the history', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module and give the payer one entry of each reachable type', async () => {
      await buildAuditHistory(payerManagementPage, payerInactivateDialog, approvalManagementPage, publishedPayer.nameEn);
    });

    await steps.step('Each distinct action type carries the six fields', async () => {
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const audit = detail.auditHistory();
      await audit.open();
      const entries = await audit.getEntries();
      const seen = new Set<string>();
      for (const [index, entry] of entries.entries()) {
        if (seen.has(entry.action)) continue;
        seen.add(entry.action);
        expect(entry.timestamp).toMatch(TIMESTAMP_PATTERN);
        expect(entry.user).not.toBe('');
        const details = await audit.openEntryDetails(index);
        expect(details.meta, `${entry.action}: the drawer should show who and when`).not.toBe('');
        expect(details.diff.length, `${entry.action}: the drawer should list field/before/after rows`).toBeGreaterThan(0);
        await audit.closeDetails();
      }
      expect(seen.size, 'at least Create, Update and Status Change should be present').toBeGreaterThanOrEqual(3);
    });
  });

  // Azure test case 14570
  test('14570: should list audit entries newest first', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module and give the payer a change history', async () => {
      await buildAuditHistory(payerManagementPage, payerInactivateDialog, approvalManagementPage, publishedPayer.nameEn);
    });

    await steps.step('Timestamps never increase down the list, Status Change first and Create last', async () => {
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const audit = detail.auditHistory();
      await audit.open();
      const entries = await audit.getEntries();
      const times = entries.map((e) => parseEntryTimestamp(e.timestamp).getTime());
      for (let i = 1; i < times.length; i += 1) {
        expect(times[i - 1], `entry ${i} should not be newer than entry ${i - 1}`).toBeGreaterThanOrEqual(times[i]);
      }
      expect(entries[0].action, 'the most recent change is the status change').toBe(ACTION.statusChange);
      expect(entries[entries.length - 1].action, 'the oldest is the creation').toBe(ACTION.create);
    });
  });

  // Azure test case 14574
  test('14574: should show only the entries within the chosen date range', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();
    let total = 0;

    await steps.critical('Navigate to the module and give the payer a change history made today', async () => {
      await buildAuditHistory(payerManagementPage, payerInactivateDialog, approvalManagementPage, publishedPayer.nameEn);
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.auditHistory().open();
      total = await detail.auditHistory().getEntryCount();
      expect(total).toBeGreaterThan(0);
    });

    await steps.step('A range covering today keeps every entry', async () => {
      const audit = payerManagementPage.detail().auditHistory();
      const query = await audit.setDateRange(today(), today());
      expect(query, 'the range should query the server with the dates').toMatch(/fromUtc/);
      expect(await audit.getEntryCount()).toBe(total);
    });

    await steps.step('A range ending yesterday excludes them all', async () => {
      const audit = payerManagementPage.detail().auditHistory();
      await audit.clearDateRange();
      await audit.setDateRange(yesterday(), yesterday());
      expect(await audit.getEntryCount(), 'nothing happened to this payer yesterday').toBe(0);
    });
  });

  // Azure test case 14591
  test('14591: should include entries on the exact start and end dates of the range', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    let total = 0;

    await steps.critical('Navigate to the module and open a payer whose entries are dated today', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.auditHistory().open();
      total = await detail.auditHistory().getEntryCount();
      expect(total).toBeGreaterThan(0);
    });

    await steps.step('A single-day range on today includes today\'s entries - both boundaries inclusive', async () => {
      const audit = payerManagementPage.detail().auditHistory();
      const query = await audit.setDateRange(today(), today());
      expect(query).toMatch(/fromUtc/);
      expect(query).toMatch(/toUtc/);
      expect(await audit.getEntryCount(), 'entries on the boundary day must be included').toBe(total);
    });
  });

  // Azure test case 14577
  test('14577: should show only matching entries when filtered by each Action Type', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module and give the payer one entry of each reachable type', async () => {
      await buildAuditHistory(payerManagementPage, payerInactivateDialog, approvalManagementPage, publishedPayer.nameEn);
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.auditHistory().open();
      expect(await detail.auditHistory().getEntryCount()).toBeGreaterThanOrEqual(3);
    });

    await steps.step('Each Action Type filter returns only its own entries, by a server query', async () => {
      const audit = payerManagementPage.detail().auditHistory();
      for (const action of [ACTION.create, ACTION.update, ACTION.statusChange]) {
        const query = await audit.selectAction(action);
        expect(query, `filtering by ${action} should query the server`).toMatch(/actionType/);
        const entries = await audit.getEntries();
        expect(entries.length, `${action} should match at least one entry`).toBeGreaterThan(0);
        for (const entry of entries) expect(entry.action, `only ${action} entries should be listed`).toBe(action);
      }
    });
  });

  // Azure test case 14586
  test('14586: should apply a date range and an Action Type together', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module and give the payer a change history made today', async () => {
      await buildAuditHistory(payerManagementPage, payerInactivateDialog, approvalManagementPage, publishedPayer.nameEn);
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.auditHistory().open();
      expect(await detail.auditHistory().getEntryCount()).toBeGreaterThanOrEqual(3);
    });

    await steps.step('Update within today lists only today\'s updates', async () => {
      const audit = payerManagementPage.detail().auditHistory();
      await audit.selectAction(ACTION.update);
      await audit.setDateRange(today(), today());
      const entries = await audit.getEntries();
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) expect(entry.action).toBe(ACTION.update);
    });

    await steps.step('Update within yesterday lists nothing - both criteria apply', async () => {
      const audit = payerManagementPage.detail().auditHistory();
      await audit.clearDateRange();
      await audit.setDateRange(yesterday(), yesterday());
      expect(await audit.getEntryCount()).toBe(0);
    });
  });

  // Azure test case 14593
  test('14593: should reject an inverted date range with a validation message and run no query', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    let before = 0;

    await steps.critical('Navigate to the module and open the payer\'s audit history', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.auditHistory().open();
      before = await detail.auditHistory().getEntryCount();
      expect(before).toBeGreaterThan(0);
    });

    await steps.step('An end date before the start date runs no query and leaves the list unchanged', async () => {
      const audit = payerManagementPage.detail().auditHistory();
      const fmt = (d: Date): string =>
        `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      const query = await audit.typeDateRange(`${fmt(today())} - ${fmt(yesterday())}`);
      expect(query, 'an invalid range must not be sent to the server').toBeNull();
      expect(await audit.getEntryCount()).toBe(before);
    });

    await steps.step('And the user is told the range is invalid', async () => {
      // VERIFIED: typed input is ignored silently - no message. Asserted as
      // the sheet states it, so the missing feedback is reported.
      const panel = await payerManagementPage.detail().auditHistory().getPanelText();
      expect(
        /invalid|before the start|valid range|end date/i.test(panel),
        `a validation message should explain the invalid range; the panel read: "${panel.slice(0, 160)}"`,
      ).toBe(true);
    });
  });

  // Azure test case 14594
  test('14594: should show an empty-results message when the filters match no entries', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and filter the payer\'s history to an action it never had', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const audit = detail.auditHistory();
      await audit.open();
      expect(await audit.getEntryCount(), 'the payer should have history').toBeGreaterThan(0);
      await audit.selectAction(ACTION.networkUnassigned);
      expect(await audit.getEntryCount()).toBe(0);
    });

    await steps.step('A message says nothing matched', async () => {
      const panel = await payerManagementPage.detail().auditHistory().getPanelText();
      expect(
        NO_MATCH_MESSAGE.test(panel) || EMPTY_HISTORY_TEXT.test(panel),
        `an empty-results message should be shown; the panel read: "${panel.slice(0, 160)}"`,
      ).toBe(true);
    });

    await steps.step('And it does not claim the payer has no history at all', async () => {
      // VERIFIED: the filtered-empty state reuses "No audit history yet." -
      // which is untrue for a payer with entries, and the sheet asks that the
      // two situations be told apart.
      const panel = await payerManagementPage.detail().auditHistory().getPanelText();
      expect(
        EMPTY_HISTORY_TEXT.test(panel),
        `a filter with no matches must not say the payer has no history; the panel read: "${panel.slice(0, 160)}"`,
      ).toBe(false);
    });
  });

  // Azure test case 14599
  test('14599: should keep audit entries immutable with no edit or delete controls', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    // The drawer is opened for its CONTROLS, not its contents, so it is opened
    // with the reader that stops there. Building the diff costs an auto-waiting
    // read per field, and for an entry whose body never settles - VERIFIED for
    // some Create entries - those reads ran the case out of time before this
    // assertion was ever reached.
    await steps.critical('Navigate to the module and open the payer\'s audit history', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.auditHistory().open();
      expect(await detail.auditHistory().getEntryCount()).toBeGreaterThan(0);
    });

    await steps.step('An entry offers only View Details', async () => {
      const ids = await payerManagementPage.detail().auditHistory().getEntryActionIds(0);
      expect(ids, `an audit entry must be read-only; it offers: ${ids.join(', ')}`).toEqual([ENTRY_ONLY_ACTION]);
    });

    await steps.step('And its detail drawer offers nothing that could change it', async () => {
      const audit = payerManagementPage.detail().auditHistory();
      await audit.openEntryDetailsDrawer(0);
      const controls = (await audit.getDetailDrawerControlIds()).filter((id) => MUTATING_CONTROL.test(id));
      expect(controls, `the drawer must not offer edit/delete; it carries: ${controls.join(', ')}`).toEqual([]);
      await audit.closeDetails();
    });
  });

  // Azure test case 14606
  test('14606: should be a dedicated payer audit view distinct from the shared application audit log', async ({
    payerManagementPage,
    auditLogsPage,
    publishedPayer,
    steps,
  }) => {
    let payerOptions: string[] = [];

    await steps.critical('Navigate to the module and read the payer audit\'s filter set', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.auditHistory().open();
      payerOptions = await detail.auditHistory().getActionOptions();
      expect(payerOptions, 'the payer trail should offer its payer-specific action set').toEqual([...ACTION_OPTIONS]);
    });

    await steps.step('The shared audit log has a different shape - entity type and actor, no payer action set', async () => {
      await auditLogsPage.openList();
      const keys = await auditLogsPage.getColumnKeys();
      expect(keys, 'the shared log lists entity types').toContain(AUDIT_LOG_COLUMN.entityType);
      expect(keys, 'the shared log lists the actor as a column').toContain(AUDIT_LOG_COLUMN.actor);
      expect(keys.some((key) => /before|after|field/i.test(key)), 'the shared log has no field/before/after layout').toBe(false);
    });
  });

  // Azure test case 14578
  test('14578: should log a status transition as a Status Change entry from Active to Inactive', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module and inactivate the Active payer through approval', async () => {
      await buildAuditHistory(payerManagementPage, payerInactivateDialog, approvalManagementPage, publishedPayer.nameEn);
    });

    await steps.step('The newest entry is a Status Change from Active to Inactive', async () => {
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      const audit = detail.auditHistory();
      await audit.open();
      const entries = await audit.getEntries();
      expect(entries[0].action).toBe(ACTION.statusChange);
      const details = await audit.openEntryDetails(0);
      const status = details.diff.find((row) => STATUS_TRANSITION_DIFF.field.test(row.field));
      expect(status, `the drawer should list the status field; it lists: ${details.diff.map((r) => r.field).join(', ')}`).not.toBe(undefined);
      expect(status?.before).toBe(STATUS_TRANSITION_DIFF.before);
      expect(status?.after).toBe(STATUS_TRANSITION_DIFF.after);
      await audit.closeDetails();
    });
  });


  // ---- the withheld half, on a role shaped for this case -------------------
  // This used to report BLOCKED: the one non-administrator credential in this
  // environment HOLDS the permission whose absence the case is about. The
  // account is now BUILT - the administrator takes the permission off the
  // shared "Payer Admin" role, the case signs in as it, and the permission
  // goes back when the case ends.

  // Azure test case 14601
  test('14601: should deny the Payer Audit History to a user without audit-view permission', async ({ shapedNonAdmin, steps }) => {
    let session!: ShapedSession;

    await steps.critical('Sign in as a user without View Payer Audit History', async () => {
      session = await shapedNonAdmin({ without: ['viewAuditTrail'] });
      await session.payers.navigate();
      await session.payers.expectRowsRendered();
    });

    await steps.step('The Audit History tab is withheld from this role', async () => {
      const detail = await session.payers.openDetails(NON_ADMIN_PROFILE.scopedPayers[0]);
      const tabs = await detail.getTabOrder();

      // AND THE DATA BEHIND IT. A withheld tab is only half the claim: what the
      // permission protects is the content, so if the tab IS offered the case
      // opens it and reports how much of that content the role was served.
      // "the tab was offered and rendered N rows" is a defect a developer can
      // act on; "a tab id was in a list" is not.
      if (tabs.includes('audit')) {
        const audit = detail.auditHistory();
        await audit.open().catch(() => undefined);
        const rows = await audit.getEntryCount().catch(() => -1);
        expect(
          rows,
          `the Audit History tab was offered to a role without the permission, and it `
            + `rendered ${rows} entr(y/ies)`,
        ).toBe(0);
      }
      expect(
        tabs,
        `a role without the audit permission should not be offered the tab; offered: ${tabs.join(', ')}`,
      ).not.toContain('audit');
    });
  });
  // Azure test case 14579
  test('14579: should list only Update entries when the Update action is filtered', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Give the payer a history that contains an update', async () => {
      await buildAuditHistory(payerManagementPage, payerInactivateDialog, approvalManagementPage, publishedPayer.nameEn);
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.auditHistory().open();
    });

    await steps.step('The Update filter queries the server and returns only its own entries', async () => {
      const audit = payerManagementPage.detail().auditHistory();
      const query = await audit.selectAction(ACTION.update);
      expect(query, 'filtering should ask the server rather than hide rows locally').toMatch(/actionType/);

      const entries = await audit.getEntries();
      expect(entries.length, 'the payer was edited, so an Update entry should exist').toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.action, 'only Update entries should survive the filter').toBe(ACTION.update);
      }
    });
  });

  // Azure test case 14582
  test('14582: should offer Delete among the Action Types the history can be filtered by', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Open the payer audit history', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.auditHistory().open();
    });

    // A deletion is a state-changing action and the story says every such action
    // is logged, so the history must be filterable by it. The application
    // currently offers Create, Update, Status Change and the two network
    // actions - if Delete is absent, a reviewer cannot isolate deletions, which
    // is what this case exists to catch.
    await steps.step('Delete is one of the offered Action Types', async () => {
      const offered = await payerManagementPage.detail().auditHistory().getActionOptions();
      expect(
        offered.some((option) => /delete/i.test(option)),
        `the history should be filterable by Delete; the filter offered: ${offered.join(', ')}`,
      ).toBe(true);
    });
  });

  for (const action of [ACTION.networkAssigned, ACTION.networkUnassigned]) {
    // Azure test cases - one per generated case:
    //   Network Assigned = 14585,  Network Unassigned = 14588
    test(`${action === ACTION.networkAssigned ? '14585' : '14588'}: should list only ${action} entries when that action is filtered`, async ({
      payerManagementPage,
      publishedPayer,
      steps,
    }) => {
      await steps.critical('Open the payer audit history', async () => {
        await payerManagementPage.open();
        const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
        await detail.auditHistory().open();
      });

      // The payer may have no network history at all - assignment needs a free
      // network, which this environment rarely has. That does not make the
      // filter untestable: it must still query the server, and it must either
      // return only its own entries or say nothing matched. Showing unrelated
      // entries, or an empty panel with no explanation, are the failures.
      await steps.step(`The ${action} filter returns only its own entries, or says nothing matched`, async () => {
        const audit = payerManagementPage.detail().auditHistory();
        const query = await audit.selectAction(action);
        expect(query, 'filtering should ask the server rather than hide rows locally').toMatch(/actionType/);

        const entries = await audit.getEntries();
        if (entries.length === 0) {
          const text = await audit.getPanelText();
          expect(
            text,
            `with no ${action} entries the tab should say nothing matched rather than sit empty`,
          ).toMatch(NO_MATCH_MESSAGE);
          return;
        }
        for (const entry of entries) {
          expect(entry.action, `only ${action} entries should survive the filter`).toBe(action);
        }
      });
    });
  }

  for (const blocked of BLOCKED_CASES) {
    test(`${azureOrCase('71', 'TC-' + blocked.id)}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
