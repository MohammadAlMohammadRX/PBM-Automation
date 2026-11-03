import { test, expect, catalogueOffers, controlAvailability, isListedFor, type FormularySession } from '../../../utils/formulary/writerCHelpers';
import { FORMULARY_TIERS, FORMULARY_TRADES } from '../../../constants/ElementIds';
import {
  ALL_FORMULARY_RIGHTS,
  CASES,
  EXPLORED_COMBINATION,
  EXPLORED_TOGGLES,
  FORMULARY_RIGHT,
  REQUIRED_PERMISSIONS,
  SCOPED_PAYER,
  UNRELATED_RIGHT,
} from '../../../data/formulary/formularyPermissions.data';
import type { RolePermissionsStep } from '../../../pages/system/RolePermissionsStep';

/** The names of a REQUIRED_PERMISSIONS group the catalogue offers no row for. */
const missingIn = async (catalogue: RolePermissionsStep, group: Readonly<Record<string, readonly string[]>>): Promise<string[]> => {
  const missing: string[] = [];
  for (const [name, candidates] of Object.entries(group)) if ((await catalogueOffers(catalogue, candidates)) === '') missing.push(name);
  return missing;
};

/**
 * User story 18525: Formulary Permissions - the permission matrix itself
 * (every required permission present and independent, stable under
 * exploration) and its two boundaries (no formulary right at all, every
 * formulary right). The Payer Admin role is the role edited (fixture
 * `formularyRole`); it is restored exactly at teardown.
 */
test.describe('US 18525 - Formulary Permissions - the permission matrix', () => {
  test.describe.configure({ timeout: 20 * 60_000 });

  test(`TC-${CASES.exploration.azureId}: should keep every toggle consistent and persist exactly the saved combination`, async ({
    formularyManagementPage,
    formularyRole,
    steps,
  }) => {
    let catalogue!: RolePermissionsStep;
    let unrelatedBefore = false;

    await steps.critical('Navigate to the Formulary Management module - the landing page loads', async () => {
      await formularyManagementPage.open();
      catalogue = await formularyRole.openCatalogue();
      expect(await catalogue.hasPermissionLabelled(FORMULARY_RIGHT.view), 'the formulary rights in the matrix').toBe(true);
      unrelatedBefore = await catalogue.isPermissionChecked(UNRELATED_RIGHT);
    });

    await steps.step('Toggle several formulary, tab and sub-tab permissions on and off - each reflects its state at once, nothing unrelated moves', async () => {
      const wrong: string[] = [];
      for (const right of EXPLORED_TOGGLES) {
        const label = FORMULARY_RIGHT[right];
        const before = await catalogue.isPermissionChecked(label);
        if ((await formularyRole.toggle(label)) === before) wrong.push(`${label} first toggle`);
        if ((await formularyRole.toggle(label)) !== before) wrong.push(`${label} second toggle`);
      }
      expect(wrong, 'toggles that did not take').toEqual([]);
      expect(await catalogue.isPermissionChecked(UNRELATED_RIGHT), `the unrelated "${UNRELATED_RIGHT}"`).toBe(unrelatedBefore);
    });

    await steps.critical('Save the final combination (View + Tiers tab + Tiers Export) - it is persisted with a success confirmation', async () => {
      for (const right of ALL_FORMULARY_RIGHTS.filter((r) => !EXPLORED_COMBINATION.includes(r))) {
        if (await catalogue.isPermissionChecked(FORMULARY_RIGHT[right])) await formularyRole.toggle(FORMULARY_RIGHT[right]);
      }
      for (const right of EXPLORED_COMBINATION) {
        if (!(await catalogue.isPermissionChecked(FORMULARY_RIGHT[right]))) await formularyRole.toggle(FORMULARY_RIGHT[right]);
      }
      const unchecked: string[] = [];
      for (const right of EXPLORED_COMBINATION) if (!(await catalogue.isPermissionChecked(FORMULARY_RIGHT[right]))) unchecked.push(FORMULARY_RIGHT[right]);
      expect(unchecked, 'the combination about to be saved').toEqual([]);
      await formularyRole.save();
    });

    await steps.step('Reopen the permission matrix for the role - the saved combination shows exactly, nothing added or dropped', async () => {
      catalogue = await formularyRole.openCatalogue();
      const differences: string[] = [];
      for (const right of ALL_FORMULARY_RIGHTS) {
        const wanted = EXPLORED_COMBINATION.includes(right);
        if ((await catalogue.isPermissionChecked(FORMULARY_RIGHT[right])) !== wanted) differences.push(`${FORMULARY_RIGHT[right]} should be ${wanted ? 'checked' : 'unchecked'}`);
      }
      const unrelated = await catalogue.isPermissionChecked(UNRELATED_RIGHT);
      await formularyRole.closeCatalogue();
      expect({ differences, unrelated }).toEqual({ differences: [], unrelated: unrelatedBefore });
    });
  });

  test(`TC-${CASES.catalogueComplete.azureId}: should list every formulary permission the business requires as its own selectable entry`, async ({
    formularyManagementPage,
    formularyRole,
    steps,
  }) => {
    let catalogue!: RolePermissionsStep;

    await steps.critical('Navigate to the Formulary Management module - the landing page loads', async () => {
      await formularyManagementPage.open();
      catalogue = await formularyRole.openCatalogue();
      expect((await catalogue.getPermissionLabels()).length, 'the permission matrix').toBeGreaterThan(0);
    });

    await steps.step('Check each action permission (Send for Approval, Activate, Inactivate, Delete, Clone, View, Import, Export) - all eight are present', async () => {
      expect(await missingIn(catalogue, REQUIRED_PERMISSIONS.actions), 'action permissions with no entry of their own').toEqual([]);
    });

    await steps.step('Check each view tab permission (Tiers, Trades & Pricing, Version History, Audit History) - all four are present', async () => {
      expect(await missingIn(catalogue, REQUIRED_PERMISSIONS.tabs), 'tab permissions with no entry of their own').toEqual([]);
    });

    await steps.step('Check the Tiers sub-permissions (Add/Edit/Delete, Import, Export) - all three are present', async () => {
      expect(await missingIn(catalogue, REQUIRED_PERMISSIONS.tierSub), 'Tiers sub-permissions with no entry of their own').toEqual([]);
    });

    await steps.step('Check the Trades & Pricing sub-permissions (Add/Edit/Delete, Import, Export) - all three are present', async () => {
      const missing = await missingIn(catalogue, REQUIRED_PERMISSIONS.tradeSub);
      await formularyRole.closeCatalogue();
      expect(missing, 'Trades & Pricing sub-permissions with no entry of their own').toEqual([]);
    });
  });

  test(`TC-${CASES.noRights.azureId}: should show no formulary records, actions, tabs or sub-tab controls to a role with no formulary permission`, async ({
    formularyIn,
    formularyRole,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { payerName: SCOPED_PAYER, tiers: 1, trades: 1 });
    let session!: FormularySession;

    await steps.critical('Navigate to the Formulary Management module - the landing page loads', async () => {
      session = await formularyRole.signIn(CASES.noRights.shape);
      await session.formularies.openExpectingDenial();
      expect(session.removed).toContain(FORMULARY_RIGHT.list);
    });

    await steps.step('Open the formulary list or a formulary record - no records or an access-restricted message, and no action, tab or sub-tab control', async () => {
      const listed = await isListedFor(session, formulary.nameEn);
      const listControls = {
        add: await session.formularies.isAddOffered(),
        import: await session.formularies.isImportOffered(),
        export: await session.formularies.isExportOffered(),
      };
      await session.detail.openExpectingFailure(formulary.id);
      const header = Object.entries(await session.detail.readActionStates()).filter(([, s]) => s.availability === 'available').map(([k]) => k);
      const subTab = {
        addTier: await controlAvailability(session.page, FORMULARY_TIERS.addButton),
        addTrade: await controlAvailability(session.page, FORMULARY_TRADES.addButton),
      };
      expect({ listed, listControls, header, tabs: await session.detail.readOfferedTabs(), subTab }).toEqual({
        listed: false,
        listControls: { add: false, import: false, export: false },
        header: [],
        tabs: [],
        subTab: { addTier: 'absent', addTrade: 'absent' },
      });
    });
  });

  test(`TC-${CASES.everyRight.azureId}: should offer every formulary action, tab and sub-tab control to a role holding every formulary permission`, async ({
    formularyIn,
    formularyRole,
    requireFormularyListAccess,
    steps,
  }) => {
    const formulary = await formularyIn('Draft', { payerName: SCOPED_PAYER, tiers: 1, trades: 1 });
    let session!: FormularySession;

    await steps.critical('Navigate to the Formulary Management module - the landing page loads', async () => {
      session = await formularyRole.signIn(CASES.everyRight.shape);
      await requireFormularyListAccess(session);
      await session.formularies.open();
      expect(await session.formularies.isListed(formulary.nameEn)).toBe(true);
    });

    await steps.step('Open a formulary record - Send for Approval, Delete, Clone, Import and Export are visible and enabled as its status allows', async () => {
      const list = { import: await session.formularies.isImportOffered(), export: await session.formularies.isExportOffered() };
      await session.detail.open(formulary.id);
      const header = await session.detail.readActionStates();
      expect({ ...list, submit: header.submit.availability, delete: header.delete.availability, clone: header.clone.availability })
        .toEqual({ import: true, export: true, submit: 'available', delete: 'available', clone: 'available' });
    });

    await steps.step('Review the tabs - Tiers, Trades & Pricing, Version History and Audit History are all visible', async () => {
      expect(await session.detail.readOfferedTabs()).toEqual(expect.arrayContaining(['tiers', 'trades', 'versions', 'audit']));
    });

    await steps.step('Open the Tiers and Trades & Pricing tabs - Add, Edit, Delete, Import and Export are visible and enabled on both', async () => {
      await session.tiers.open();
      const tierId = formulary.tiers[0].id;
      const tiers = {
        add: await session.tiers.isAddOffered(),
        edit: await session.tiers.getCardActionAvailability(tierId, 'edit'),
        delete: await session.tiers.getCardActionAvailability(tierId, 'delete'),
        import: await controlAvailability(session.page, FORMULARY_TIERS.importTrigger),
        export: await controlAvailability(session.page, FORMULARY_TIERS.export.trigger),
      };
      await session.trades.open();
      const tradeId = formulary.trades[0].id;
      const trades = {
        add: await session.trades.isAddOffered(),
        edit: await session.trades.getCardActionAvailability(tradeId, 'priceHistory'),
        delete: await session.trades.getCardActionAvailability(tradeId, 'remove'),
        import: await controlAvailability(session.page, FORMULARY_TRADES.importTrigger),
        export: await controlAvailability(session.page, FORMULARY_TRADES.export.trigger),
      };
      const all = { add: 'available', edit: 'available', delete: 'available', import: 'available', export: 'available' };
      expect({ tiers, trades }).toEqual({ tiers: all, trades: all });
    });
  });
});
