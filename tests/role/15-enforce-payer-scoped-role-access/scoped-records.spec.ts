import {
  test,
  expect,
  LIST_API,
  WriterFScreen,
  asSession,
  foreignRecords,
  idOf,
  listAll,
  memberPair,
  openScreen,
  payerListProblems,
  payersByName,
  readRoleOnScreen,
  requireData,
  said,
  scopedHolder,
  valueOf,
  type MemberRef,
} from '../../../utils/role/writerFHelpers';
import type { SuitePayer, SuiteRole } from '../../../fixtures/roleModule.fixture';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { PAYER_SCREENS, WRITER_F_IDS } from '../../../constants/role/writerFIds';
import {
  ALL_PAYERS_NETWORKS_ARE_LINKED,
  CASES,
  DATA_PAYERS,
  DETAIL_ROUTE,
  ENGINE_API,
  MEMBER_MODULES,
  OWN_PENDING_PAYERS_ARE_IN_SCOPE,
  PAYERS_MODULES,
  RECORD_MODULES,
  SCOPE_LABEL,
  UNSCOPED_MODULES,
  VIEW_LABEL,
  YES_NO,
  ZERO_PAYER_MODULES,
  isDenied,
} from '../../../data/role/enforcePayerScopedRoleAccess.data';

/**
 * US 21299 - Enforce Payer-Scoped Role Access: the records a payer-scoped role holder may see (Payers,
 * Networks / Plans / Policies / Formularies, Members and balances), a role WITHOUT the flag, a direct link
 * to another payer's record, and a scoped role with no payer. The holder is maalmohammad (roleHolder);
 * careconnect builds the role and reads it back on Role Administration. Decisions:
 * data/role/enforcePayerScopedRoleAccess.data.ts.
 */
test.describe('US 21299 - Enforce Payer-Scoped Role Access', () => {
  test.describe.configure({ timeout: 8 * 60_000 });

  test(`TC-${CASES.payersOnly.azureId}: should list only the assigned payers when the user's role has Has Assigned Payers enabled`, async ({ steps, suiteRoles, suitePayers, roleHolder, roleAdmin, page }) => {
    let payers: SuitePayer[] = [];
    let role!: SuiteRole;

    await steps.critical('Precondition: a payer-scoped suite role with the Payers rights, given to the holder with Payer A and Payer B only', async () => {
      payers = await suitePayers.existing(2);
      role = await scopedHolder(suiteRoles, roleHolder, { label: 'scope payers', modules: PAYERS_MODULES, scoped: true, payers, payerToChoose: SCOPE_LABEL.allMyPayers });
      expect((await roleHolder.currentGrants()).flatMap((g) => g.payerIds).sort()).toEqual(payers.map((p) => p.id).sort());
    });

    await steps.step('Navigate to the Role Management module - it opens and the role shows Has Assigned Payers? = Yes', async () => {
      const seen = await readRoleOnScreen(roleAdmin, role);
      expect(seen.listed, `"${role.name}" listed on Role Administration`).toBe(true);
      expect(valueOf(seen.values, VIEW_LABEL.hasAssignedPayers)).toBe(YES_NO.yes);
    });

    let shown: Awaited<ReturnType<typeof openScreen>>;
    await steps.critical('Navigate to the Payer Management module - the Payers list is displayed', async () => {
      shown = await openScreen(roleHolder.page, 'payers');
      await expect(roleHolder.page).toHaveURL(new RegExp(PAYER_SCREENS.payers.route));
      expect(shown.status, `GetPayers sent by the screen answered ${shown.status}`).toBe(200);
    });

    await steps.step('Review the list of payers - only Payer A and Payer B are shown; no other payer is listed or readable', async () => {
      const direct = await listAll(roleHolder.page, LIST_API.payers);
      const problems = await payerListProblems(page, [...shown.items, ...direct.items], payers, roleHolder.id, OWN_PENDING_PAYERS_ARE_IN_SCOPE);
      expect(direct.status, `GetPayers through the holder answered ${direct.status}`).toBe(200);
      expect(problems, `the payers of a holder scoped to ${payers.map((p) => `"${p.name}"`).join(' and ')} (screen ${shown.totalRows} rows, GetPayers ${direct.totalRows} rows)`).toBe('');
    });
  });

  test(`TC-${CASES.modulesScoped.azureId}: should list only Payer A's networks, plans, policies and formularies when the user is scoped to Payer A`, async ({ steps, suiteRoles, roleHolder, roleAdmin, page }) => {
    let payerA!: SuitePayer;
    let role!: SuiteRole;
    const check = async (key: 'networks' | 'plans' | 'policies' | 'formularies', ownerless: boolean): Promise<{ statuses: Record<string, number>; foreign: Record<string, string[]>; note: string }> => {
      const shown = await openScreen(roleHolder.page, key);
      await expect(roleHolder.page).toHaveURL(new RegExp(PAYER_SCREENS[key].route));
      const direct = await listAll(roleHolder.page, LIST_API[key]);
      const adminCount = (await listAll(page, LIST_API[key])).items.filter((i) => i.payerId === payerA.id).length;
      return {
        statuses: { screen: shown.status, list: direct.status },
        foreign: { screen: foreignRecords(shown.items, [payerA.id], ownerless), list: foreignRecords(direct.items, [payerA.id], ownerless).slice(0, 10) },
        note: `${PAYER_SCREENS[key].label} for a holder scoped to "${payerA.name}" (${direct.totalRows} rows; the administrator sees ${adminCount} of "${payerA.name}")`,
      };
    };

    await steps.critical('Precondition: a payer-scoped suite role (Payers, Networks, Plans, Policies, Formularies) given to the holder with Payer A only', async () => {
      const found = await payersByName(page, [DATA_PAYERS[0]]);
      requireData(steps, found.length === 1, `the data payer "${DATA_PAYERS[0]}" is not offered in this environment`);
      payerA = found[0];
      role = await scopedHolder(suiteRoles, roleHolder, { label: 'scope records', modules: RECORD_MODULES, scoped: true, payers: [payerA] });
      expect((await roleHolder.currentGrants()).flatMap((g) => g.payerIds)).toEqual([payerA.id]);
    });

    await steps.step('Navigate to the Role Management module - it opens and the role shows Has Assigned Payers? = Yes', async () => {
      const seen = await readRoleOnScreen(roleAdmin, role);
      expect(seen.listed).toBe(true);
      expect(valueOf(seen.values, VIEW_LABEL.hasAssignedPayers)).toBe(YES_NO.yes);
    });

    await steps.step('Navigate to the Networks module - only Networks linked to Payer A are listed', async () => {
      const seen = await check('networks', ALL_PAYERS_NETWORKS_ARE_LINKED);
      expect(seen.statuses).toEqual({ screen: 200, list: 200 });
      expect(seen.foreign, seen.note).toEqual({ screen: [], list: [] });
    });

    await steps.step('Navigate to the Plans module - only Plans linked to Payer A are listed', async () => {
      const seen = await check('plans', false);
      expect(seen.statuses).toEqual({ screen: 200, list: 200 });
      expect(seen.foreign, seen.note).toEqual({ screen: [], list: [] });
    });

    await steps.step('Navigate to the Policies module - only Policies linked to Payer A are listed', async () => {
      const seen = await check('policies', false);
      expect(seen.statuses).toEqual({ screen: 200, list: 200 });
      expect(seen.foreign, seen.note).toEqual({ screen: [], list: [] });
    });

    await steps.step('Navigate to the Formularies module - only Formularies linked to Payer A are listed', async () => {
      const seen = await check('formularies', false);
      expect(seen.statuses).toEqual({ screen: 200, list: 200 });
      expect(seen.foreign, seen.note).toEqual({ screen: [], list: [] });
    });
  });

  test(`TC-${CASES.membersScoped.azureId}: should show only Payer A's members and balances when the user is scoped to Payer A`, async ({ steps, suiteRoles, roleHolder, roleAdmin, page }) => {
    let payerA!: SuitePayer;
    let role!: SuiteRole;
    let pair: { a: MemberRef | null; b: MemberRef | null } = { a: null, b: null };
    let a!: MemberRef;
    let b!: MemberRef;

    await steps.critical('Precondition: members under Payer A and under another payer (B); a payer-scoped role (Members, balances, Policies) given to the holder with Payer A only', async () => {
      const found = await payersByName(page, [DATA_PAYERS[0]]);
      requireData(steps, found.length === 1, `the data payer "${DATA_PAYERS[0]}" is not offered in this environment`);
      payerA = found[0];
      pair = await memberPair(page, payerA);
      requireData(steps, pair.a !== null && pair.b !== null, `no enrolled member under "${payerA.name}" and under another payer (policies with live members) - members under Payer A and Payer B cannot be shown`);
      a = pair.a as MemberRef;
      b = pair.b as MemberRef;
      role = await scopedHolder(suiteRoles, roleHolder, { label: 'scope members', modules: MEMBER_MODULES, scoped: true, payers: [payerA] });
      expect(b.payerId).not.toBe(payerA.id);
    });

    await steps.step('Navigate to the Role Management module - it opens and the role shows Has Assigned Payers? = Yes', async () => {
      const seen = await readRoleOnScreen(roleAdmin, role);
      expect(seen.listed).toBe(true);
      expect(valueOf(seen.values, VIEW_LABEL.hasAssignedPayers)).toBe(YES_NO.yes);
    });

    await steps.step('Navigate to the Members module - the member list is displayed with Payer A members only', async () => {
      const shown = await openScreen(roleHolder.page, 'members');
      await expect(roleHolder.page).toHaveURL(new RegExp(PAYER_SCREENS.members.route));
      const ofA = new Set((await listAll(page, LIST_API.members, {}, payerA.id)).items.map(idOf));
      expect(shown.status, `GetMembers sent by the screen answered ${shown.status}`).toBe(200);
      expect(shown.items.filter((i) => !ofA.has(idOf(i))).map((i) => String(i.memberCode ?? idOf(i))), `members on the holder's list that are not "${payerA.name}"'s`).toEqual([]);
    });

    await steps.step(`Review the list and open a member balance belonging to Payer A - the balance record is shown`, async () => {
      const balance = await asSession(roleHolder.page, 'POST', ApiEndpoints.memberAccumulator, { policyMemberId: a.policyMemberId });
      await new WriterFScreen(roleHolder.page).open(DETAIL_ROUTE.accumulator(a.policyMemberId));
      await expect(roleHolder.page).toHaveURL(new RegExp(DETAIL_ROUTE.accumulator(a.policyMemberId)));
      expect(isDenied(balance), `the balance of ${a.memberCode} ("${payerA.name}") through the holder: ${said(balance)}`).toBe(false);
    });

    await steps.step('Attempt to access a member balance belonging to Payer B via search and direct link - it is not shown or reachable', async () => {
      const search = await listAll(roleHolder.page, LIST_API.members, { searchText: b.memberCode });
      const member = await asSession(roleHolder.page, 'POST', ApiEndpoints.memberGet, { id: b.memberId });
      const balance = await asSession(roleHolder.page, 'POST', ApiEndpoints.memberAccumulator, { policyMemberId: b.policyMemberId });
      const screen = new WriterFScreen(roleHolder.page);
      await screen.open(DETAIL_ROUTE.accumulator(b.policyMemberId));
      const text = await screen.mainText();
      await expect(roleHolder.page).toHaveURL(new RegExp(DETAIL_ROUTE.accumulator(b.policyMemberId)));
      expect({
        foundBySearch: search.items.some((i) => idOf(i) === b.memberId),
        memberDenied: isDenied(member),
        balanceDenied: isDenied(balance),
        nameOnScreen: text.includes(b.memberName),
      }, `member ${b.memberCode} of "${b.payerName}" (GetMember ${said(member)}, GetMemberAccumulator ${said(balance)})`).toEqual({ foundBySearch: false, memberDenied: true, balanceDenied: true, nameOnScreen: false });
    });
  });

  test(`TC-${CASES.unscopedRole.azureId}: should give access to all payers within the permitted modules only when the role has no assigned-payers restriction`, async ({ steps, suiteRoles, roleHolder, roleAdmin, page }) => {
    let role!: SuiteRole;

    await steps.critical('Precondition: a suite role WITHOUT Has Assigned Payers holding only the Payers and Plans rights, given to the holder', async () => {
      role = await scopedHolder(suiteRoles, roleHolder, { label: 'unscoped', modules: UNSCOPED_MODULES, scoped: false, payers: [], payerToChoose: SCOPE_LABEL.allPayers });
      expect(role.record.hasAssignedPayers).toBe(false);
    });

    await steps.step('Navigate to the Role Management module - it opens and the role shows Has Assigned Payers? = No', async () => {
      const seen = await readRoleOnScreen(roleAdmin, role);
      expect(seen.listed).toBe(true);
      expect(valueOf(seen.values, VIEW_LABEL.hasAssignedPayers)).toBe(YES_NO.no);
    });

    await steps.step('Navigate to the Payer Management module - all payers in the system are listed', async () => {
      const shown = await openScreen(roleHolder.page, 'payers', SCOPE_LABEL.allPayers);
      const mine = await listAll(roleHolder.page, LIST_API.payers);
      const all = await listAll(page, LIST_API.payers);
      await expect(roleHolder.page).toHaveURL(new RegExp(PAYER_SCREENS.payers.route));
      expect({ screen: shown.totalRows, list: mine.totalRows }, `payers for the unscoped holder (scope shown "${shown.scope}") vs the administrator's ${all.totalRows}`).toEqual({ screen: all.totalRows, list: all.totalRows });
    });

    await steps.step('Navigate to a module not covered by the role, the Integration Portal - access is refused', async () => {
      const api = await asSession(roleHolder.page, 'POST', ENGINE_API.authorizations, { pageNumber: 1, rowsPerPage: 10 });
      const screen = new WriterFScreen(roleHolder.page);
      // The menu entry is read on a PBM screen: the portal's own route shows its separate sign-in (no PBM menu).
      await screen.open(PAYER_SCREENS.payers.route);
      await expect(screen.el(WRITER_F_IDS.navPayersLink), 'the side menu (Payer Mgmt entry)').toBeVisible();
      await expect(screen.el(WRITER_F_IDS.navEnginePortalLink), 'the Integration Portal entry in the side menu of a holder without the PBM Engine / API Clients rights').toHaveCount(0);
      expect(isDenied(api), `GetAuthorizations through the holder without the Engine rights: ${said(api)} (landed on ${new URL(roleHolder.page.url()).pathname})`).toBe(true);
    });
  });

  test(`TC-${CASES.directLinkDenied.azureId}: should deny a payer-scoped user access to a non-assigned payer's record opened by direct link`, async ({ steps, suiteRoles, suitePayers, roleHolder, roleAdmin, page }) => {
    let payerA!: SuitePayer;
    let payerB!: SuitePayer;
    let role!: SuiteRole;

    await steps.critical('Precondition: Payer B exists (the administrator reads it); a payer-scoped role given to the holder with Payer A only', async () => {
      [payerA, payerB] = await suitePayers.existing(2);
      const baseline = await asSession(page, 'POST', ApiEndpoints.payerDetail, { id: payerB.id });
      expect(baseline.status, `GetPayer of "${payerB.name}" for the administrator`).toBe(200);
      role = await scopedHolder(suiteRoles, roleHolder, { label: 'direct link', modules: PAYERS_MODULES, scoped: true, payers: [payerA] });
    });

    await steps.step('Navigate to the Role Management module - it opens and the role shows Has Assigned Payers? = Yes', async () => {
      const seen = await readRoleOnScreen(roleAdmin, role);
      expect(seen.listed).toBe(true);
      expect(valueOf(seen.values, VIEW_LABEL.hasAssignedPayers)).toBe(YES_NO.yes);
    });

    await steps.step('Navigate to the Payer Management module - Payer A records are listed', async () => {
      const shown = await openScreen(roleHolder.page, 'payers');
      await expect(roleHolder.page).toHaveURL(new RegExp(PAYER_SCREENS.payers.route));
      const problems = await payerListProblems(page, shown.items, [payerA], roleHolder.id, OWN_PENDING_PAYERS_ARE_IN_SCOPE);
      expect(shown.status, `GetPayers sent by the screen answered ${shown.status}`).toBe(200);
      expect(problems, `the Payers list of a holder scoped to "${payerA.name}" (${shown.totalRows} rows)`).toBe('');
    });

    await steps.step('Attempt to open a Payer B record directly by its URL - access is denied or not found; no Payer B data is exposed', async () => {
      const api = await asSession(roleHolder.page, 'POST', ApiEndpoints.payerDetail, { id: payerB.id });
      const screen = new WriterFScreen(roleHolder.page);
      await screen.open(DETAIL_ROUTE.payer(payerB.id));
      await expect(screen.mainArea(), `the detail page of "${payerB.name}" for a holder scoped to "${payerA.name}"`).not.toContainText(payerB.name);
      expect(isDenied(api), `GetPayer of "${payerB.name}" through the holder: ${said(api)}`).toBe(true);
    });
  });

  test(`TC-${CASES.zeroPayers.azureId}: should show no payer, plan or member records when the payer-scoped user has zero assigned payers`, async ({ steps, suiteRoles, roleHolder, roleAdmin }) => {
    let role!: SuiteRole;

    await steps.critical('Precondition: a payer-scoped role (Payers, Plans, Members) given to the holder with NO payer', async () => {
      role = await scopedHolder(suiteRoles, roleHolder, { label: 'zero payers', modules: ZERO_PAYER_MODULES, scoped: true, payers: [] });
      expect((await roleHolder.currentGrants()).flatMap((g) => g.payerIds)).toEqual([]);
    });

    await steps.step('Navigate to the Role Management module - it opens and the role shows Has Assigned Payers? = Yes', async () => {
      const seen = await readRoleOnScreen(roleAdmin, role);
      expect(seen.listed).toBe(true);
      expect(valueOf(seen.values, VIEW_LABEL.hasAssignedPayers)).toBe(YES_NO.yes);
    });

    await steps.step('Navigate to the Payer Management module - the payer filter and list area are displayed', async () => {
      await openScreen(roleHolder.page, 'payers');
      await expect(roleHolder.page).toHaveURL(new RegExp(PAYER_SCREENS.payers.route));
    });

    await steps.step('Review the records shown in the Payers, Plans and Members modules - none is displayed', async () => {
      const screens = { payers: await openScreen(roleHolder.page, 'payers'), plans: await openScreen(roleHolder.page, 'plans'), members: await openScreen(roleHolder.page, 'members') };
      const lists = { payers: await listAll(roleHolder.page, LIST_API.payers), plans: await listAll(roleHolder.page, LIST_API.plans), members: await listAll(roleHolder.page, LIST_API.members) };
      expect({
        payers: screens.payers.items.length + lists.payers.items.length,
        plans: screens.plans.items.length + lists.plans.items.length,
        members: screens.members.items.length + lists.members.items.length,
      }, 'records shown to a payer-scoped holder with zero payers (screen + list reads)').toEqual({ payers: 0, plans: 0, members: 0 });
    });
  });
});
