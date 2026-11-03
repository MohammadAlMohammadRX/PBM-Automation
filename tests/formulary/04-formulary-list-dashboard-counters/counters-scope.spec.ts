import {
  test,
  expect,
  FORMULARY_NO_ACCESS,
  formularyShape,
  openScopedList,
  requestDashboard,
} from '../../../utils/formulary/writerAHelpers';
import { CASES } from '../../../data/formulary/dashboardCounters.data';

/**
 * User story 15194: Formulary list - dashboard counters (data scope and access).
 * The counters of a payer-scoped user and of a user without formulary rights.
 * Both are the Payer Admin account (assigned "Al Dawaa 2" and "NUPCO") shaped
 * per case (writerAHelpers.formularySession). The sheet's two administrators of
 * different scopes are that one account working under each of its payers in
 * turn (the top-bar payer scope) - one account cannot be logged in twice.
 */
test.describe('US 15194 - Dashboard counters by data scope', () => {
  test(`TC-${CASES.scopedCounts.azureId}: should calculate the counters on each logged-in scope only`, async ({
    formularyIn,
    formularySession,
    steps,
  }) => {
    test.setTimeout(10 * 60_000);
    const data = CASES.scopedCounts;
    await formularyIn('Future', { payerName: data.payerA });
    await formularyIn('Future', { payerName: data.payerB });
    const session = await formularySession(formularyShape());
    const list = session.formularies;

    /** The list under the current scope: its total and the payers of its rows. */
    const scopedList = async (): Promise<{ total: number; payers: string[] }> => {
      const answer = await list.captureList(() => list.reload());
      return { total: answer.totalRows, payers: [...new Set(answer.items.map((f) => f.payerNameEn))] };
    };

    await steps.critical('Navigate to the Formulary Management module - the module loads', async () => {
      await openScopedList(session);
      expect(await list.isListRendered()).toBe(true);
    });

    await steps.step(`Work as the administrator scoped to "${data.payerA}" - the dashboard loads`, async () => {
      expect(await list.scopeTo(data.payerA), `the scope should offer "${data.payerA}"`).toBe(true);
      expect(await list.isKpiBandVisible()).toBe(true);
    });

    await steps.step(`The counters reflect only "${data.payerA}"'s formularies`, async () => {
      const scoped = await scopedList();
      expect(scoped.payers, 'the scope\'s rows').toEqual([data.payerA]);
      expect((await list.readKpiNumbers()).total, 'the Total of the scope').toBe(scoped.total);
    });

    await steps.step(`Work as the administrator scoped to "${data.payerB}" - the dashboard loads`, async () => {
      expect(await list.scopeTo(data.payerB), `the scope should offer "${data.payerB}"`).toBe(true);
      expect(await list.isKpiBandVisible()).toBe(true);
    });

    await steps.step(`The counters reflect only "${data.payerB}"'s formularies`, async () => {
      const scoped = await scopedList();
      expect(scoped.payers, 'the scope\'s rows').toEqual([data.payerB]);
      expect((await list.readKpiNumbers()).total, 'the Total of the scope').toBe(scoped.total);
    });
  });

  test(`TC-${CASES.noPermission.azureId}: should deny the dashboard and its counters to a user without formulary access`, async ({
    formularyManagementPage,
    formularySession,
    requireBaseline,
    steps,
  }) => {
    await formularyManagementPage.open();
    requireBaseline(await formularyManagementPage.isKpiBandVisible(), 'the formulary KPI tiles');
    const session = await formularySession(FORMULARY_NO_ACCESS);

    await steps.step('Navigate to the Formulary Management module - the system checks the user\'s permissions', async () => {
      const answer = await requestDashboard(session.page);
      expect(answer.status, `GetFormulariesDashboard answered ${answer.status} without the right (${session.removed.join(', ')})`).toBeGreaterThanOrEqual(400);
    });

    await steps.step('As the unauthorized user, the module / counters are not shown or access is denied', async () => {
      await session.formularies.openExpectingDenial();
      expect(await session.formularies.isKpiBandVisible(), 'the counters must not render').toBe(false);
    });
  });
});
