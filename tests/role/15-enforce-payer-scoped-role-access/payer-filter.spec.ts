import {
  test,
  expect,
  LIST_API,
  WriterFScreen,
  asSession,
  idOf,
  listAll,
  openRecordsOfTwoPayers,
  openScreen,
  payerListProblems,
  payersByName,
  readRoleOnScreen,
  requireData,
  said,
  scopedHolder,
  switchAndCheck,
  switchProblems,
  switchScope,
  valueOf,
} from '../../../utils/role/writerFHelpers';
import type { SuitePayer, SuiteRole } from '../../../fixtures/roleModule.fixture';
import { UserMenu } from '../../../pages/user/UserMenu';
import { PREDEFINED_ROLES } from '../../../data/role/common.data';
import { PAYER_SCREENS, WRITER_F_IDS } from '../../../constants/role/writerFIds';
import {
  ADMIN_MODULES,
  CASES,
  DATA_PAYERS,
  ENGINE_API,
  OWN_PENDING_PAYERS_ARE_IN_SCOPE,
  PAYERS_MODULES,
  PORTAL_TEXT,
  REGULAR_ROLE,
  SCOPE_LABEL,
  SWITCH_MODULES,
  VIEW_LABEL,
  YES_NO,
} from '../../../data/role/enforcePayerScopedRoleAccess.data';

/**
 * US 21299 - Enforce Payer-Scoped Role Access: the top-bar payer filter - its default for a payer-scoped
 * and for a regular user, narrowing to one payer, keeping the choice across modules until sign-out, the
 * System Administrator seeing every payer, and repeated quick switching. Decisions:
 * data/role/enforcePayerScopedRoleAccess.data.ts.
 */
test.describe('US 21299 - Enforce Payer-Scoped Role Access (payer filter)', () => {
  test.describe.configure({ timeout: 8 * 60_000 });

  test(`TC-${CASES.defaultAllMyPayers.azureId}: should default the payer filter to All My Payers for a user with assigned payers`, async ({ steps, suiteRoles, suitePayers, roleHolder, roleAdmin, page }, testInfo) => {
    let payers: SuitePayer[] = [];
    let role!: SuiteRole;
    let shown!: Awaited<ReturnType<typeof openScreen>>;

    await steps.critical('Precondition: a payer-scoped role given to the holder with Payer A and Payer B, freshly signed in', async () => {
      payers = await suitePayers.existing(2);
      role = await scopedHolder(suiteRoles, roleHolder, { label: 'default mine', modules: PAYERS_MODULES, scoped: true, payers, payerToChoose: SCOPE_LABEL.allMyPayers });
      testInfo.annotations.push({ type: 'facts', description: `sign-in payer gate answered: "${roleHolder.lastSignIn?.payerChosen ?? '(no gate)'}"` });
      expect(roleHolder.lastSignIn?.heldAtVerify).toBe(false);
    });

    await steps.step('Navigate to the Role Management module - it opens and the role shows Has Assigned Payers? = Yes', async () => {
      const seen = await readRoleOnScreen(roleAdmin, role);
      expect(seen.listed).toBe(true);
      expect(valueOf(seen.values, VIEW_LABEL.hasAssignedPayers)).toBe(YES_NO.yes);
    });

    await steps.step('Navigate to the Payer Management module - the payer filter dropdown is displayed', async () => {
      shown = await openScreen(roleHolder.page, 'payers');
      await expect(new WriterFScreen(roleHolder.page).scopeSelect()).toBeVisible();
    });

    await steps.step('Observe the default selection of the payer filter - "All My Payers", the list showing every assigned payer', async () => {
      const problems = await payerListProblems(page, shown.items, payers, roleHolder.id, OWN_PENDING_PAYERS_ARE_IN_SCOPE);
      await expect(new WriterFScreen(roleHolder.page).scopeSelect()).toContainText(SCOPE_LABEL.allMyPayers);
      expect(problems, `the Payers list under the default "${shown.scope}" (${shown.totalRows} rows)`).toBe('');
    });
  });

  test(`TC-${CASES.defaultAllPayers.azureId}: should default the payer filter to All Payers for a user without the assigned-payers restriction`, async ({ steps, roleHolder, roleAdmin, page }, testInfo) => {
    let shown!: Awaited<ReturnType<typeof openScreen>>;
    const oa = PREDEFINED_ROLES.organizationAdministrator;

    await steps.critical(`Precondition: the holder holds only "${REGULAR_ROLE}" (no Has Assigned Payers), freshly signed in`, async () => {
      await roleHolder.become({ role: REGULAR_ROLE }, { payerToChoose: SCOPE_LABEL.allPayers });
      testInfo.annotations.push({ type: 'facts', description: `sign-in payer gate answered: "${roleHolder.lastSignIn?.payerChosen ?? '(no gate)'}"` });
      expect((await roleHolder.currentGrants()).map((g) => g.name)).toEqual([REGULAR_ROLE]);
    });

    await steps.step(`Navigate to the Role Management module - it opens and "${REGULAR_ROLE}" shows Has Assigned Payers? = No`, async () => {
      const seen = await readRoleOnScreen(roleAdmin, { id: oa.id, name: oa.en });
      expect(seen.listed).toBe(true);
      expect(valueOf(seen.values, VIEW_LABEL.hasAssignedPayers)).toBe(YES_NO.no);
    });

    await steps.step('Navigate to the Payer Management module - the payer filter dropdown is displayed', async () => {
      shown = await openScreen(roleHolder.page, 'payers');
      await expect(new WriterFScreen(roleHolder.page).scopeSelect()).toBeVisible();
    });

    await steps.step('Observe the default selection of the payer filter - "All Payers", the list showing every payer', async () => {
      const all = await listAll(page, LIST_API.payers, {}, undefined, 10);
      expect({ scope: shown.scope, total: shown.totalRows }).toEqual({ scope: SCOPE_LABEL.allPayers, total: all.totalRows });
    });
  });

  test(`TC-${CASES.singlePayerFilter.azureId}: should show only the selected payer's records when a single payer is chosen in the dropdown`, async ({ steps, suitePayers, roleAdmin, page }) => {
    let payerA!: SuitePayer;
    let first!: Awaited<ReturnType<typeof openScreen>>;
    let picked!: Awaited<ReturnType<typeof switchScope>>;

    await steps.critical('Precondition: the System Administrator (careconnect) has access to multiple payers; Payer A is a suite payer', async () => {
      [payerA] = await suitePayers.existing(1);
      const all = await listAll(page, LIST_API.payers, {}, undefined, 10);
      expect(all.totalRows).toBeGreaterThan(1);
    });

    await steps.step('Navigate to the Role Management module - it opens', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
    });

    await steps.step('Navigate to the Payer Management module - the payer filter shows "All Payers" or "All My Payers"', async () => {
      first = await openScreen(page, 'payers');
      await expect(new WriterFScreen(page).scopeSelect()).toBeVisible();
      expect([SCOPE_LABEL.allPayers, SCOPE_LABEL.allMyPayers]).toContain(first.scope);
    });

    await steps.step('Select a specific payer from the dropdown - the filter is applied and the list reloads', async () => {
      picked = await switchScope(page, 'payers', payerA.name);
      await expect(new WriterFScreen(page).scopeSelect()).toContainText(payerA.name);
      expect({ status: picked.status, header: picked.header }).toEqual({ status: 200, header: payerA.id });
    });

    await steps.step('Review the records displayed - only the selected payer\'s records are shown', async () => {
      expect(picked.items.map(idOf)).toEqual([payerA.id]);
    });
  });

  test(`TC-${CASES.filterPersists.azureId}: should keep the selected payer across modules and reset it to the default after signing out`, async ({ steps, suitePayers, roleHolder, roleAdmin }, testInfo) => {
    let payerA!: SuitePayer;

    await steps.critical(`Precondition: the holder (regular user, "${REGULAR_ROLE}") is signed in`, async () => {
      [payerA] = await suitePayers.existing(1);
      await roleHolder.become({ role: REGULAR_ROLE }, { payerToChoose: SCOPE_LABEL.allPayers });
      expect(roleHolder.lastSignIn?.heldAtVerify).toBe(false);
    });

    await steps.step('Navigate to the Role Management module - it opens', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
    });

    await steps.critical('Navigate to the Payer Management module and select Payer A in the filter - the filter is set to Payer A', async () => {
      await openScreen(roleHolder.page, 'payers');
      const picked = await switchScope(roleHolder.page, 'payers', payerA.name);
      await expect(new WriterFScreen(roleHolder.page).scopeSelect()).toContainText(payerA.name);
      expect(picked.items.map(idOf)).toEqual([payerA.id]);
    });

    await steps.step('Navigate to another payer-related module (Plans) - the filter is still Payer A', async () => {
      const plans = await openScreen(roleHolder.page, 'plans');
      await expect(roleHolder.page).toHaveURL(new RegExp(PAYER_SCREENS.plans.route));
      expect({ scope: plans.scope, header: plans.header }).toEqual({ scope: payerA.name, header: payerA.id });
    });

    await steps.step('Sign out and sign back in - the filter is back at its default ("All Payers")', async () => {
      const out = await new UserMenu(roleHolder.page).logout();
      expect(out.path).toMatch(/\/login/);
      await roleHolder.signInAgain({ payerToChoose: SCOPE_LABEL.allPayers });
      testInfo.annotations.push({ type: 'facts', description: `sign-in payer gate answered: "${roleHolder.lastSignIn?.payerChosen ?? '(no gate)'}"` });
      const after = await openScreen(roleHolder.page, 'payers');
      await expect(new WriterFScreen(roleHolder.page).scopeSelect()).toBeVisible();
      expect(after.scope).toBe(SCOPE_LABEL.allPayers);
    });
  });

  test(`TC-${CASES.adminAllPayers.azureId}: should let the System Administrator access every payer's records across modules`, async ({ steps, suitePayers, roleAdmin, page }) => {
    let payers: SuitePayer[] = [];

    await steps.critical('Precondition: the System Administrator (careconnect) is signed in; two payers with records are known', async () => {
      const data = await payersByName(page, DATA_PAYERS);
      requireData(steps, data.length === 2, `the data payers ${DATA_PAYERS.join(', ')} are not both offered`);
      payers = [...data, ...(await suitePayers.existing(1))];
      expect(payers.length).toBe(3);
    });

    await steps.step('Navigate to the Role Management module - it opens', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
    });

    await steps.step('Navigate to the Payer Management module - the full payer list is displayed', async () => {
      const shown = await openScreen(page, 'payers', SCOPE_LABEL.allPayers);
      const all = await listAll(page, LIST_API.payers, {}, undefined, 10);
      await expect(page).toHaveURL(new RegExp(PAYER_SCREENS.payers.route));
      expect({ scope: shown.scope, total: shown.totalRows }).toEqual({ scope: SCOPE_LABEL.allPayers, total: all.totalRows });
    });

    await steps.step('Open records of different payers in Payers, Networks, Plans, Members and the Integration Portal - each is accessible', async () => {
      const opened: Record<string, string[]> = {};
      for (const module of ADMIN_MODULES) opened[module] = await openRecordsOfTwoPayers(page, module, payers);
      const portal = await asSession(page, 'POST', ENGINE_API.authorizations, { pageNumber: 1, rowsPerPage: 10 });
      const screen = new WriterFScreen(page);
      await screen.open(PAYER_SCREENS.payers.route);
      await expect(screen.el(WRITER_F_IDS.navEnginePortalLink), 'the Integration Portal entry in the administrator\'s side menu').toBeVisible();
      const portalText = await screen.visitRaw(PAYER_SCREENS.enginePortal.route);
      await expect(page).toHaveURL(new RegExp(PAYER_SCREENS.enginePortal.route));
      const refused = Object.entries(opened).flatMap(([m, list]) => list.filter((x) => !/: 200$/.test(x)).map((x) => `${m} ${x}`));
      const tooFew = Object.entries(opened).filter(([, list]) => list.length < 2).map(([m, list]) => `${m} (${list.length})`);
      const problems = [
        ...refused.map((r) => `refused: ${r}`),
        ...tooFew.map((t) => `fewer than two payers' records opened: ${t}`),
        ...(portal.status === 200 ? [] : [`GetAuthorizations answered ${said(portal)}`]),
        ...(PORTAL_TEXT.test(portalText) ? [] : [`the portal route showed "${portalText.slice(0, 120)}"`]),
      ];
      expect(problems.join('; '), `records opened: ${Object.entries(opened).map(([m, l]) => `${m} [${l.join(', ')}]`).join('; ')}`).toBe('');
    });
  });

  test(`TC-${CASES.repeatedSwitching.azureId}: should keep each module's records matching the payer chosen when the filter is switched repeatedly`, async ({ steps, suitePayers, roleAdmin, page }) => {
    let payers: SuitePayer[] = [];

    await steps.critical('Precondition: the user (careconnect) has access to Payers A, B and C', async () => {
      const data = await payersByName(page, DATA_PAYERS);
      requireData(steps, data.length === 2, `the data payers ${DATA_PAYERS.join(', ')} are not both offered`);
      payers = [...(await suitePayers.existing(1)), ...data];
      expect(new Set(payers.map((p) => p.id)).size).toBe(3);
    });

    await steps.step('Navigate to the Role Management module - it opens', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
    });

    await steps.step('Navigate to the Payer Management module and switch the filter between several payers quickly - the list matches the last choice', async () => {
      const last = payers[payers.length - 1];
      const seen = await switchAndCheck(page, SWITCH_MODULES[0], payers);
      await expect(new WriterFScreen(page).scopeSelect()).toContainText(last.name);
      expect(switchProblems(seen, last), `Payer Management after switching ${payers.map((p) => `"${p.name}"`).join(' > ')}`).toBe('');
    });

    await steps.step('Navigate to Plans, Policies and Members while switching the filter repeatedly - each module matches the last choice, nothing stale', async () => {
      const problems: string[] = [];
      const orders = [[payers[1], payers[2], payers[0]], [payers[2], payers[0], payers[1]], [payers[0], payers[1], payers[2]]];
      for (const [i, module] of SWITCH_MODULES.slice(1).entries()) {
        const order = orders[i];
        const found = switchProblems(await switchAndCheck(page, module, order), order[order.length - 1]);
        if (found) problems.push(`${PAYER_SCREENS[module].label}: ${found}`);
      }
      await expect(new WriterFScreen(page).scopeSelect()).toBeVisible();
      expect(problems.join(' | '), 'modules whose list did not match the last payer chosen').toBe('');
    });
  });
});
