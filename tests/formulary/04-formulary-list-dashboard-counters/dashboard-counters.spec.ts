import { test, expect } from '../../../fixtures';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import type { FormularyKpiKey } from '../../../constants/ElementIds';
import { TECHNICAL_DETAIL } from '../../../data/formulary/formulary.data';
import { BLOCKED_CASES, CASES, FILTER_OF, TILE_LABEL } from '../../../data/formulary/dashboardCounters.data';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import {
  approveFormulary,
  formularyStatusCode,
  promoteToActive,
  setFormularyActive,
  submitFormulary,
  waitForFormularyStatus,
} from '../../../utils/FormularyProvisioning';
import {
  formularyImportFile,
  formularyImportKit,
  formularyImportRow,
  operationIdOf,
  waitForOperation,
} from '../../../utils/formulary/writerAHelpers';
import { suiteName } from '../../../data/formulary/createFormulary.data';

const STATUS_TILES = ['active', 'pending', 'inactive', 'expired'] as const;

/** Every number in a dashboard answer set to 0 - the empty-scope answer (18622). */
const zeroed = (value: unknown): unknown => {
  if (typeof value === 'number') return 0;
  if (Array.isArray(value)) return value.map(zeroed);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, zeroed(v)]));
  return value;
};

/**
 * User story 15194: Formulary list - dashboard counters.
 * The five KPI tiles: labels and numbers, Total as the sum of the four status
 * counters, each counter against its own category, live updates after a status
 * change or a bulk import, the user's data scope, and access control.
 */
test.describe('US 15194 - Formulary list - dashboard counters', () => {
  test(`TC-${CASES.fiveCounters.azureId}: should show the Total, Active, Pending, Inactive and Expired counters with numbers when the formulary list is opened`, async ({
    formularyManagementPage,
    steps,
  }) => {
    let tiles: Awaited<ReturnType<typeof formularyManagementPage.readKpis>>;

    await steps.critical('Navigate to the Formulary Management module - the module home page loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.step('Open the formulary dashboard / list view - five counters are displayed: Total, Active, Pending, Inactive, Expired', async () => {
      expect(await formularyManagementPage.isKpiBandVisible()).toBe(true);
      tiles = await formularyManagementPage.readKpis();
      const mislabelled = (Object.keys(TILE_LABEL) as FormularyKpiKey[]).filter((key) => !TILE_LABEL[key].test(tiles[key].label));
      expect(mislabelled.map((key) => `${key}: "${tiles[key].label}"`), 'tiles missing or mislabelled').toEqual([]);
    });

    await steps.step('Every counter is labelled and shows a numeric value', async () => {
      const notNumeric = (Object.keys(tiles) as FormularyKpiKey[]).filter((key) => !/^\d+$/.test(tiles[key].value));
      expect(notNumeric.map((key) => `${key}: "${tiles[key].value}"`)).toEqual([]);
    });
  });

  test(`TC-${CASES.totalIsSum.azureId}: should show a Total equal to the sum of the Active, Pending, Inactive and Expired counters`, async ({
    formularyManagementPage,
    steps,
  }) => {
    let kpis: Record<FormularyKpiKey, number>;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.step('Note the Active, Pending, Inactive and Expired counters - each shows its count', async () => {
      kpis = await formularyManagementPage.readKpiNumbers();
      const dashboard = await formularyManagementPage.fetchDashboard();
      expect(STATUS_TILES.map((key) => kpis[key]), 'the tiles should show the dashboard\'s counts').toEqual(STATUS_TILES.map((key) => dashboard[key]));
    });

    await steps.step('The Total counter equals the sum of the other four', async () => {
      const sum = STATUS_TILES.reduce((acc, key) => acc + kpis[key], 0);
      expect(kpis.total, `Active ${kpis.active} + Pending ${kpis.pending} + Inactive ${kpis.inactive} + Expired ${kpis.expired}`).toBe(sum);
    });
  });

  test(`TC-${CASES.allZero.azureId}: should show 0 on all five counters without an error when no formulary exists in the user's scope`, async ({
    formularyManagementPage,
    page,
    steps,
  }) => {
    // The shared register always holds formularies, so the empty scope is the
    // application's own answers emptied in the browser (as the Terminology
    // suite's empty-state cases do): what is checked is how the screen renders it.
    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.simulateEmptyRegister();
      await NetworkUtils.rewriteJsonResponse(page, ApiEndpoints.formularyDashboard, zeroed);
      await formularyManagementPage.open();
    });

    await steps.step('Open the dashboard with no formularies present - it loads without error', async () => {
      expect(await formularyManagementPage.isKpiBandVisible()).toBe(true);
      const messages = await formularyManagementPage.waitForVisibleMessages();
      expect(messages.filter((m) => /error|failed|unable/i.test(m) || TECHNICAL_DETAIL.test(m)), 'errors shown').toEqual([]);
    });

    await steps.step('All five counters display 0', async () => {
      expect(await formularyManagementPage.readKpiNumbers()).toEqual({ total: 0, active: 0, pending: 0, inactive: 0, expired: 0 });
      await formularyManagementPage.restoreEndpoints();
    });
  });

  test(`TC-${CASES.pendingToActive.azureId}: should move one from Pending to Active and keep the Total when a formulary's status changes from Pending to Active`, async ({
    formularyManagementPage,
    formularyIn,
    page,
    steps,
  }) => {
    test.setTimeout(12 * 60_000);
    const formulary = await formularyIn('Future', { effectiveInMinutes: CASES.pendingToActive.effectiveInMinutes });
    let before: Record<FormularyKpiKey, number>;

    await steps.critical('Navigate to the Formulary Management module - the dashboard counters are visible', async () => {
      await formularyManagementPage.open();
      expect(await formularyManagementPage.isKpiBandVisible()).toBe(true);
    });

    await steps.critical('Record the current Pending and Active counters', async () => {
      before = await formularyManagementPage.readKpiNumbers();
      expect([before.pending, before.active].every(Number.isFinite), `Pending ${before.pending}, Active ${before.active}`).toBe(true);
    });

    await steps.critical('Change the formulary\'s status from Pending to Active - it reads Active', async () => {
      await promoteToActive(page, formulary.id, formulary.nameEn);
      expect(await formularyStatusCode(page, formulary.id)).toBe('active');
    });

    await steps.step('Revisit the dashboard - Pending is one lower, Active one higher, Total unchanged', async () => {
      await formularyManagementPage.open();
      const after = await formularyManagementPage.readKpiNumbers();
      expect({ pending: after.pending, active: after.active, total: after.total })
        .toEqual({ pending: before.pending - 1, active: before.active + 1, total: before.total });
    });
  });

  test(`TC-${CASES.ownCategory.azureId}: should count in each counter only the formularies of its own status`, async ({
    formularyManagementPage,
    steps,
  }) => {
    const totals = {} as Record<(typeof STATUS_TILES)[number], number>;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.step('At least one formulary exists in each status category', async () => {
      for (const key of STATUS_TILES) totals[key] = (await formularyManagementPage.filterByStatus(FILTER_OF[key])).totalRows;
      expect(STATUS_TILES.filter((key) => totals[key] < 1).map((key) => `${key}: ${totals[key]}`), 'categories without a formulary').toEqual([]);
    });

    await steps.step('Each counter matches the count of formularies in its own category', async () => {
      await formularyManagementPage.open();
      const kpis = await formularyManagementPage.readKpiNumbers();
      expect(Object.fromEntries(STATUS_TILES.map((key) => [key, kpis[key]]))).toEqual(totals);
    });
  });

  test(`TC-${CASES.externalChange.azureId}: should reflect a status change made in another session when the dashboard is refreshed and stay consistent across views`, async ({
    formularyManagementPage,
    formularyIn,
    formularySecondWindow,
    steps,
  }) => {
    test.setTimeout(12 * 60_000);
    const formulary = await formularyIn('Active');
    let before: Record<FormularyKpiKey, number>;
    let after: Record<FormularyKpiKey, number>;

    await steps.critical('Navigate to the Formulary Management module - the dashboard loads with its baseline counters', async () => {
      await formularyManagementPage.open();
      before = await formularyManagementPage.readKpiNumbers();
      expect(Number.isFinite(before.total)).toBe(true);
    });

    await steps.critical('In a separate session, change a formulary\'s status from Active to Inactive - it is updated', async () => {
      const second = await formularySecondWindow();
      await second.formularies.open();
      expect((await setFormularyActive(second.page, formulary.id, false)).status).toBeLessThan(300);
      expect((await submitFormulary(second.page, formulary.id)).status).toBeLessThan(300);
      await approveFormulary(second.page, formulary.nameEn);
      await waitForFormularyStatus(second.page, formulary.id, 'inactive', 90_000);
      expect(await formularyStatusCode(second.page, formulary.id)).toBe('inactive');
    });

    await steps.step('Refresh the dashboard - it reflects the updated counts', async () => {
      await formularyManagementPage.open();
      after = await formularyManagementPage.readKpiNumbers();
      expect({ active: after.active, inactive: after.inactive, total: after.total })
        .toEqual({ active: before.active - 1, inactive: before.inactive + 1, total: before.total });
    });

    await steps.step('Switching views and returning keeps the counters consistent', async () => {
      await formularyManagementPage.switchToCards();
      expect(await formularyManagementPage.readKpiNumbers()).toEqual(after);
      await formularyManagementPage.switchToTable();
      await formularyManagementPage.open();
      expect(await formularyManagementPage.readKpiNumbers()).toEqual(after);
    });
  });

  test(`TC-${CASES.checklist.azureId}: should show all five counters correctly labelled with valid non-negative numbers`, async ({
    formularyManagementPage,
    steps,
  }) => {
    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.step('Checklist: five counters present, correctly labelled, numeric and non-negative', async () => {
      expect(await formularyManagementPage.isKpiBandVisible()).toBe(true);
      const tiles = await formularyManagementPage.readKpis();
      const problems = (Object.keys(TILE_LABEL) as FormularyKpiKey[]).flatMap((key) => [
        ...(TILE_LABEL[key].test(tiles[key].label) ? [] : [`${key} labelled "${tiles[key].label}"`]),
        ...(/^\d+$/.test(tiles[key].value) && Number(tiles[key].value) >= 0 ? [] : [`${key} reads "${tiles[key].value}"`]),
      ]);
      expect(problems, 'checklist items failing').toEqual([]);
    });
  });

  test(`TC-${CASES.afterImport.azureId}: should count the newly imported formularies when a bulk import completes`, async ({
    formularyManagementPage,
    discardFormularyNamed,
    page,
    steps,
  }) => {
    test.setTimeout(10 * 60_000);
    const names = Array.from({ length: CASES.afterImport.rows }, (_, i) => suiteName(`Imported ${i + 1}`));
    names.forEach((name) => discardFormularyNamed(name));
    let before: Record<FormularyKpiKey, number>;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
      before = await formularyManagementPage.readKpiNumbers();
      expect(Number.isFinite(before.total)).toBe(true);
    });

    await steps.critical(`Bulk import ${names.length} formularies - the import completes with a confirmation`, async () => {
      const kit = await formularyImportKit(page, formularyManagementPage);
      const file = formularyImportFile(kit, names.map((nameEn) => formularyImportRow(kit, { nameEn })));
      await formularyManagementPage.open();
      const dialog = await formularyManagementPage.openImport();
      const answer = await dialog.addFile(file);
      expect(answer.status, `${answer.endpoint} ${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`).toBeLessThan(300);
      const { operation } = await waitForOperation(page, operationIdOf(answer.text));
      expect({ status: operation.status, succeeded: operation.succeededRows }, operation.errorMessage ?? '').toEqual({ status: 'Completed', succeeded: names.length });
    });

    await steps.step('The counters reflect every newly imported formulary', async () => {
      await formularyManagementPage.open();
      const after = await formularyManagementPage.readKpiNumbers();
      expect(after.total, 'the Total should count the imported formularies').toBe(before.total + names.length);
      expect(STATUS_TILES.map((key) => after[key]), 'imported drafts are not live').toEqual(STATUS_TILES.map((key) => before[key]));
    });
  });

  test(`TC-${CASES.attention.azureId}: should show non-zero Pending and Expired counters that lead to the formularies needing attention`, async ({
    formularyManagementPage,
    formularyIn,
    steps,
  }) => {
    await formularyIn('Future');
    let kpis: Record<FormularyKpiKey, number>;

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.step('View the counters - Pending and Expired show non-zero values', async () => {
      kpis = await formularyManagementPage.readKpiNumbers();
      expect({ pending: kpis.pending > 0, expired: kpis.expired > 0 }, `Pending ${kpis.pending}, Expired ${kpis.expired}`).toEqual({ pending: true, expired: true });
    });

    await steps.step('The counters identify the formularies needing review - each matches the formularies of its status', async () => {
      for (const key of ['pending', 'expired'] as const) {
        expect((await formularyManagementPage.filterByStatus(FILTER_OF[key])).totalRows, `the ${key} formularies`).toBe(kpis[key]);
      }
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
