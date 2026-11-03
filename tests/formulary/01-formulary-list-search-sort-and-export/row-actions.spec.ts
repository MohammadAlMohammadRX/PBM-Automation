import { test, expect, findExpiredFormulary, formularyShape, openScopedList, SCOPED_ACCOUNT } from '../../../utils/formulary/writerAHelpers';
import { CASES } from '../../../data/formulary/listSearchSortExport.data';
import type { FormularyRowAction } from '../../../constants/ElementIds';

/**
 * User story 15191: Formulary list - Search, Sort and Export (row actions).
 * Which row actions each status / approval state enables, and that a
 * read-only role is offered View only. The read-only user is the Payer Admin
 * account shaped to the formulary read rights (writerAHelpers.formularySession);
 * it sees its own payers' formularies, so the case builds one for "Al Dawaa 2".
 */
test.describe('US 15191 - Formulary list row actions', () => {
  test(`TC-${CASES.actionsByStatus.azureId}: should enable each row action strictly by the formulary's status, approval state and the user's role`, async ({
    formularyManagementPage,
    formularyIn,
    formularySession,
    page,
    steps,
  }) => {
    test.setTimeout(25 * 60_000);
    const draftChange = await formularyIn('DraftChange');
    const draft = await formularyIn('Draft');
    const active = await formularyIn('Active');
    const scopedDraft = await formularyIn('Draft', { payerName: SCOPED_ACCOUNT.payerA });
    const availability = async (name: string): Promise<Record<FormularyRowAction, string>> => {
      const states = await formularyManagementPage.readActionStates(name);
      return Object.fromEntries(Object.entries(states).map(([action, state]) => [action, state.availability])) as Record<FormularyRowAction, string>;
    };

    await steps.critical('Navigate to the Formulary Management module - the module landing page loads', async () => {
      await formularyManagementPage.open();
    });

    await steps.step('Open the Formulary list view - the list loads with all formulary records', async () => {
      expect(await formularyManagementPage.countRows()).toBeGreaterThan(0);
    });

    await steps.step('A Draft v>0 formulary has View, Clone, Send for Approval, Delete and Deactivate enabled', async () => {
      const a = await availability(draftChange.nameEn);
      expect({ view: a.view, clone: a.clone, submit: a.submit, delete: a.delete, deactivate: a.deactivate })
        .toEqual({ view: 'available', clone: 'available', submit: 'available', delete: 'available', deactivate: 'available' });
    });

    await steps.step('A Draft v0 formulary has View, Clone, Send for Approval and Delete enabled and Deactivate disabled', async () => {
      const a = await availability(draft.nameEn);
      expect({ view: a.view, clone: a.clone, submit: a.submit, delete: a.delete }).toEqual({ view: 'available', clone: 'available', submit: 'available', delete: 'available' });
      expect(a.deactivate, 'Deactivate on a v0 draft').not.toBe('available');
    });

    await steps.step('An Active approved formulary has View, Clone and Deactivate enabled and Delete disabled', async () => {
      const a = await availability(active.nameEn);
      expect({ view: a.view, clone: a.clone, deactivate: a.deactivate }).toEqual({ view: 'available', clone: 'available', deactivate: 'available' });
      expect(a.delete, 'Delete on an Active formulary').not.toBe('available');
    });

    await steps.step('An Expired formulary keeps View and Clone enabled with Deactivate and Delete disabled', async () => {
      const expired = await findExpiredFormulary(page);
      expect(expired, 'an Expired formulary of the register (read only)').not.toBeNull();
      const a = await availability(expired?.formularyNameEn ?? '');
      expect({ view: a.view, clone: a.clone }).toEqual({ view: 'available', clone: 'available' });
      expect({ deactivate: a.deactivate === 'available', delete: a.delete === 'available' }, 'Deactivate / Delete on an Expired formulary').toEqual({ deactivate: false, delete: false });
    });

    await steps.step('A read-only role is offered only the View action on every record', async () => {
      const session = await formularySession(formularyShape());
      await openScopedList(session, SCOPED_ACCOUNT.allMine);
      await session.formularies.search(scopedDraft.nameEn);
      const offered = await session.formularies.readActionStatesOnScreen();
      expect(Object.keys(offered), `the read-only user should see "${scopedDraft.nameEn}"`).toContain(scopedDraft.nameEn);
      const extra = Object.entries(offered).flatMap(([name, states]) =>
        Object.entries(states).filter(([action, state]) => action !== 'view' && state.availability === 'available').map(([action]) => `${name}: ${action}`));
      expect(extra, `actions enabled for a read-only role (withheld: ${session.removed.join(', ')})`).toEqual([]);
      expect(Object.values(offered).every((states) => states.view.availability === 'available'), 'View on every record').toBe(true);
    });
  });
});
