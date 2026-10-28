import { test, expect } from '../../../fixtures';
import {
  ACTIONS_PER_STATUS,
  AUDIT_ENTRY_TIME,
  BLOCKED_CASES,
  CASE,
  DRAFT_BADGE,
  DRAFT_GO_LIVE_ACTION,
  DRAFT_HIDDEN_ACTIONS,
  MIN_VERSIONS,
  NOT_SHOWN,
  TAB_CYCLE,
  TAB_SWITCH_ROUNDS,
  VERSION_DATE,
  VERSION_LABEL,
} from '../../../data/plans/planDetailOverview.data';

/**
 * User story 14155: View plan detail with overview and tabs.
 * The Formulary Assignment, Version History and Audit History tabs, the header
 * actions per status, and tab switching between plans.
 * Twin: tests/network/12-view-network-overview-and-details.
 */
test.describe('US 14155 - Plan detail tabs and actions', () => {
  test(`TC-${CASE.formularyTab}: should show the assigned formulary's details when the Formulary Assignment tab is opened`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    planFormulary,
    steps,
  }) => {
    test.setTimeout(12 * 60_000);
    const plan = await planIn('Active');
    const formulary = await planFormulary();

    await steps.critical('Navigate to the Plans Management module - the list loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the plan with an assigned formulary - the detail loads on the Overview tab', async () => {
      await planManagementPage.openDetails(plan.name);
      expect(await planDetailPage.getActiveTab()).toBe('overview');
    });

    await steps.critical('Select the Formulary Assignment tab - the tab switches and its data loads', async () => {
      await planDetailPage.formulary().open();
      expect(await planDetailPage.formulary().getPanelText(), 'the tab should render the assignment').not.toBe('');
    });

    await steps.step('The formulary name, code, status and effective details match the formulary record', async () => {
      const tab = planDetailPage.formulary();
      const panel = await tab.getPanelText();
      expect(panel, 'the formulary name').toContain(formulary.formularyNameEn);
      expect(panel, 'the formulary code').toContain(formulary.formularyCode ?? '');
      expect(await tab.getStateBadge(), 'the assignment status').not.toBe('');
      expect(panel, 'the effective details (dates)').toMatch(VERSION_DATE);
    });
  });

  test(`TC-${CASE.versionHistory}: should list every version with its number, status and dates in order when Version History is opened`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);
    const plan = await planIn('Inactive');

    await steps.critical('Navigate to the Plans Management module - the list loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the plan with several versions - the detail loads', async () => {
      const detail = await planManagementPage.openDetails(plan.name);
      expect(await detail.getName()).toBe(plan.name);
    });

    await steps.critical('Select the Version History tab - the list of versions loads', async () => {
      await planDetailPage.versions().open();
      expect((await planDetailPage.versions().readRows()).length, 'a created and inactivated plan has two versions').toBeGreaterThanOrEqual(MIN_VERSIONS);
    });

    await steps.step('Each version shows its number, status and dates, newest first', async () => {
      const rows = await planDetailPage.versions().readRows();
      expect(rows.filter((row) => !VERSION_LABEL.test(row.version)), 'rows without a version number').toEqual([]);
      expect(rows.filter((row) => row.status === ''), 'rows without a status').toEqual([]);
      expect(rows.filter((row) => !VERSION_DATE.test(row.requestedOn)), 'rows without a date').toEqual([]);
      const numbers = rows.map((row) => Number(row.version.replace(/\D/g, '')));
      expect(numbers, 'versions should be listed newest first').toEqual([...numbers].sort((a, b) => b - a));
    });
  });

  test(`TC-${CASE.auditTab}: should show recorded entries with action, actor and timestamp when Audit History is opened from the detail page`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(12 * 60_000);
    const plan = await planIn('Active');

    await steps.critical('Navigate to the Plans Management module - the list loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the plan with recorded history - the detail loads', async () => {
      const detail = await planManagementPage.openDetails(plan.name);
      expect(await detail.getName()).toBe(plan.name);
    });

    await steps.critical('Select the Audit History tab - the entries load', async () => {
      await planDetailPage.audit().open();
      expect((await planDetailPage.audit().readEntries()).length, 'an approved plan has history').toBeGreaterThan(0);
    });

    await steps.step('A sample entry shows an action, an actor and a timestamp', async () => {
      const [entry] = await planDetailPage.audit().readEntries();
      expect(entry.action, 'action').not.toBe('');
      expect(entry.by, 'actor').not.toBe('');
      expect(entry.when, 'timestamp').toMatch(AUDIT_ENTRY_TIME);
    });
  });

  test(`TC-${CASE.actionsPerStatus}: should show only the header actions each status allows - Edit on a Draft only, no Activate or Inactivate on a Draft - when Draft, Active and Inactive plans are opened`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const plans = {
      Draft: await planIn('Draft'),
      Active: await planIn('Active'),
      Inactive: await planIn('Inactive'),
    };

    await steps.critical('Navigate to the Plans Management module - the list shows the plans', async () => {
      await planManagementPage.openListFor(plans.Draft.payerName);
      expect(await planManagementPage.isListed(plans.Draft.name)).toBe(true);
    });

    for (const expected of ACTIONS_PER_STATUS) {
      await steps.step(`The ${expected.state} plan offers ${expected.shown.join(' and ')} and does not show ${expected.hidden.join(' or ')}`, async () => {
        await planDetailPage.open(plans[expected.state].id);
        for (const action of expected.shown) {
          expect(await planDetailPage.getActionAvailability(action), `${expected.state}: "${action}" should be offered`).toBe('available');
        }
        for (const action of expected.hidden) {
          expect(await planDetailPage.getActionAvailability(action), `${expected.state}: "${action}" must not appear`).toBe(NOT_SHOWN);
        }
      });
    }
  });

  test(`TC-${CASE.activateDraft}: should show neither Activate nor Inactivate and offer Send for Approval when a draft plan is opened`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    const plan = await planIn('Draft');

    await steps.critical('Navigate to the Plans Management module - the list loads', async () => {
      await planManagementPage.openListFor(plan.payerName);
      expect(await planManagementPage.isListed(plan.name)).toBe(true);
    });

    await steps.critical('Open the draft plan - the badge shows Draft', async () => {
      await planManagementPage.openDetails(plan.name);
      expect(await planDetailPage.getVersionBadge(), 'the draft badge').toMatch(DRAFT_BADGE);
    });

    await steps.step('Neither an Activate nor an Inactivate action appears on the draft', async () => {
      for (const action of DRAFT_HIDDEN_ACTIONS) {
        expect(await planDetailPage.getActionAvailability(action), `a draft must not show "${action}"`).toBe(NOT_SHOWN);
      }
    });

    await steps.step('The draft offers Send for Approval as its way to go live', async () => {
      expect(await planDetailPage.getActionAvailability(DRAFT_GO_LIVE_ACTION), 'a draft should offer Send for Approval').toBe('available');
    });
  });

  test(`TC-${CASE.tabSwitching}: should only ever show the open plan's data when tabs are switched rapidly and another plan is opened`, async ({
    planManagementPage,
    planDetailPage,
    planIn,
    steps,
  }) => {
    const planA = await planIn('Draft');
    const planB = await planIn('Draft');
    let codeA = '';

    await steps.critical('Navigate to the Plans Management module - the list loads', async () => {
      await planManagementPage.openListFor(planA.payerName);
      expect(await planManagementPage.isListed(planA.name)).toBe(true);
    });

    await steps.step('Switching Plan A\'s tabs rapidly several times always shows Plan A\'s data', async () => {
      await planManagementPage.openDetails(planA.name);
      for (let round = 0; round < TAB_SWITCH_ROUNDS; round += 1) {
        for (const tab of TAB_CYCLE) {
          await planDetailPage.openTab(tab);
          expect(await planDetailPage.getName(), `round ${round + 1}, ${tab}: the header should still be Plan A`).toBe(planA.name);
        }
      }
      const overview = await planDetailPage.readOverview();
      codeA = overview.code;
      expect(overview.nameEn, 'the Overview should still be Plan A\'s').toBe(planA.name);
    });

    await steps.step('Returning to the list and opening Plan B shows only Plan B\'s data', async () => {
      await planManagementPage.openListFor(planB.payerName);
      await planManagementPage.openDetails(planB.name);
      expect(await planDetailPage.getName()).toBe(planB.name);
      const overview = await planDetailPage.readOverview();
      expect(overview.nameEn, 'the Overview should be Plan B\'s').toBe(planB.name);
      expect(overview.code, 'no residual code from Plan A').not.toBe(codeA);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
