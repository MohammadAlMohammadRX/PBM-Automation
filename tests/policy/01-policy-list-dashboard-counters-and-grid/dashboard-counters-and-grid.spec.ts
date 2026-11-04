import { test, expect, type PolicySession } from '../../../utils/policy/policyRole';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import type { PolicyKpiKey, PolicyRowAction, PolicyCardAction } from '../../../constants/ElementIds';
import {
  ALL_STATUSES,
  CASES,
  GRID_COLUMNS,
  NOT_A_PLACEHOLDER,
  READ_ONLY_WITHHELD,
  STORY_COUNTERS,
} from '../../../data/policy/dashboardCountersAndGrid.data';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { listPolicyRegister, policyStatusIds } from '../../../utils/PolicyProvisioning';
import {
  ERROR_MESSAGE,
  POLICY_SCOPE,
  countCards,
  openScopedPolicies,
  payersOf,
  readScreenList,
  readSearchBox,
  visibleMessages,
  zeroed,
} from '../../../utils/policy/writerAHelpers';

type Tile = { label: string; value: string };

/** The tile whose label matches `label`, null when none. */
const tileFor = (tiles: readonly Tile[], label: RegExp): Tile | null => tiles.find((t) => label.test(t.label)) ?? null;

/** Every tile's number by key. */
const tileNumbers = (tiles: Record<PolicyKpiKey, Tile>): Record<string, number> =>
  Object.fromEntries(Object.entries(tiles).map(([key, tile]) => [key, Number(tile.value)]));

/** The actions a card and a row both carry. */
const CARD_ROW_ACTIONS: ReadonlyArray<PolicyCardAction & PolicyRowAction> = ['view', 'edit', 'clone', 'submit', 'delete'];

/**
 * User story 15165: Policy list - Dashboard counters & grid.
 * The summary counters (labels, numbers, each against the grid, the user's data
 * scope, an empty scope, after a filter), the grid's columns, the cards' fields
 * and actions, switching views, role-dependent actions and placeholders for
 * blank optional fields. See the data file for how the cases map onto the live list.
 */
test.describe('US 15165 - Policy list - Dashboard counters & grid', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.fiveCounters.azureId}: should show Total, Active, Pending, Inactive and Expired counters each matching the grid's count of its policies`, async ({
    policyManagementPage: list,
    steps,
  }) => {
    let tiles: Tile[] = [];
    let total = -1;

    await steps.critical('Navigate to the Policy Management module - the Policy Management landing page loads', async () => {
      await list.openTable();
      total = (await readScreenList(list)).totalRows;
      expect(total, 'the unfiltered list\'s total').toBeGreaterThan(0);
    });

    await steps.step('Open the policy dashboard view - the dashboard loads showing the counters and the policy list below', async () => {
      expect(await list.isKpiBandVisible(), 'the counters').toBe(true);
      expect(await list.countRows(), 'the policy list').toBeGreaterThan(0);
    });

    await steps.step('Observe the five counters - Total, Active, Pending, Inactive and Expired are all displayed with numeric values', async () => {
      tiles = Object.values(await list.readKpis());
      const missing = STORY_COUNTERS.filter((c) => !/^\d+$/.test(tileFor(tiles, c.label)?.value ?? '')).map((c) => c.name);
      expect(missing, `counters missing or not numeric - tiles shown: ${tiles.map((t) => `"${t.label}" ${t.value}`).join(', ')}`).toEqual([]);
    });

    await steps.step('Compare each counter value against the number of policies of that status in the grid - each counter matches', async () => {
      const mismatches: string[] = [];
      for (const counter of STORY_COUNTERS) {
        const tile = tileFor(tiles, counter.label);
        const grid = counter.filter === null ? total : (await list.filterBy('status', counter.filter)).totalRows;
        if (tile === null || Number(tile.value) !== grid) mismatches.push(`${counter.name}: counter ${tile ? `"${tile.label}" ${tile.value}` : 'missing'}, grid ${grid}`);
      }
      expect(mismatches, 'counters that do not match the grid').toEqual([]);
    });
  });

  test(`TC-${CASES.scopedCounts.azureId}: should calculate the counters only on the policies the logged-in user's payer scope allows`, async ({
    policyManagementPage: list,
    policyRole,
    requirePolicyListAccess,
    page,
    steps,
  }) => {
    let adminTotal = 0;
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the dashboard loads', async () => {
      await list.openTable();
      expect(await list.isKpiBandVisible()).toBe(true);
    });

    await steps.step('Log in as the user with full access and note the Total counter - it counts the entire portfolio', async () => {
      adminTotal = await list.readKpi('total');
      const register = await listPolicyRegister(page, {}, 500);
      expect(adminTotal, 'the administrator\'s Total against the whole register').toBe(register.totalRows);
      expect(payersOf(register.items).length, 'payers in the administrator\'s portfolio').toBeGreaterThan(1);
    });

    await steps.critical('Log out and log in as the user restricted to its assigned payers - the dashboard loads for this user', async () => {
      session = await policyRole.signIn({});
      await requirePolicyListAccess(session);
      await openScopedPolicies(session, POLICY_SCOPE.allMine);
      expect(await session.policies.isKpiBandVisible(), 'the scoped user\'s counters').toBe(true);
    });

    await steps.step('Observe the Total counter and the other counters - they count only the policies within the user\'s assigned scope', async () => {
      const scoped = await listPolicyRegister(session.page, {}, 500);
      const ids = await policyStatusIds(page);
      const scopedActive = await listPolicyRegister(session.page, { statusId: ids.active }, 1);
      const kpis = tileNumbers(await session.policies.readKpis());
      expect(payersOf(scoped.items).filter((p) => !POLICY_SCOPE.assigned.includes(p)), 'policies of payers outside the scope').toEqual([]);
      expect({ total: kpis.total, active: kpis.active }, `the scoped user's counters (administrator's Total ${adminTotal})`)
        .toEqual({ total: scoped.totalRows, active: scopedActive.totalRows });
      expect(kpis.total, 'the scoped Total must not count the whole portfolio').toBeLessThan(adminTotal);
    });
  });

  test(`TC-${CASES.gridColumns.azureId}: should show every required column with a value for each policy in the grid view`, async ({
    policyManagementPage: list,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('Draft', { maxMembers: CASES.gridColumns.maxMembers });

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
    });

    await steps.step('Switch the policy list to grid view - the list renders in a table layout', async () => {
      await list.switchToTable();
      expect(await list.countRows(), 'table rows').toBeGreaterThan(0);
    });

    await steps.step('Check the column headers against the thirteen required columns - all are present and correctly labelled', async () => {
      const headers = await list.getHeaderTexts();
      const missing = GRID_COLUMNS.filter(([, header]) => !headers.some((h) => header.test(h))).map(([name]) => name);
      expect(missing, `columns missing - headers shown: ${headers.join(', ')}`).toEqual([]);
    });

    await steps.step('Verify every row has a value in each column - every column shows the correct data for each policy', async () => {
      const rows = await list.readRowsOnScreen();
      const blanks = rows.flatMap((row) => Object.entries(row).filter(([, value]) => value === '').map(([column]) => `${row.name || row.number}: ${column}`));
      expect(blanks, 'blank cells').toEqual([]);
      const own = await list.readRow(policy.nameEn);
      expect({ name: own.name, number: own.number, type: own.type, plan: own.plan, payer: own.payer, holder: own.holder, members: own.members })
        .toEqual({ name: policy.nameEn, number: policy.policyNumber, type: 'Group', plan: policy.planName, payer: policy.payerName, holder: policy.holderName, members: '0' });
    });
  });

  test(`TC-${CASES.cardFields.azureId}: should show all required fields and the user's available actions on each policy card`, async ({
    policyManagementPage: list,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Draft', { maxMembers: CASES.cardFields.maxMembers });
    let card: Record<string, string> = {};

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
    });

    await steps.step('Switch the policy list to card view - the list renders as individual policy cards', async () => {
      await list.switchToCards();
      expect(await list.loadCardsUntilShown(policy.nameEn), `a card for "${policy.nameEn}"`).toBe(true);
      expect(await countCards(page)).toBeGreaterThan(0);
    });

    await steps.step('Check the card against the required fields - Policy name, holder, number, type, plan, payer, members, dates, limit, status and approval status are visible', async () => {
      card = await list.readCard(policy.nameEn);
      const fields: Record<string, string> = {
        'Policy name': card.title,
        'Policy holder': card.header.includes(policy.holderName) ? policy.holderName : '',
        'Policy Number': card.number,
        'Policy Type': card.type,
        Plan: card.plan,
        Payer: card.payer,
        'Members #': card.members,
        'Effective Date': card.effectiveDate,
        'Expiry Date': card.expiryDate,
        'Member Limit': card.maxMembers,
        Status: card.statusBadge,
        'Approval status': card.versionStatus,
      };
      expect(Object.entries(fields).filter(([, value]) => value === '').map(([name]) => name), `fields missing from the card (header "${card.header}")`).toEqual([]);
      expect({ title: card.title, number: card.number, type: card.type, plan: card.plan, payer: card.payer, members: card.members, limit: card.maxMembers })
        .toEqual({ title: policy.nameEn, number: policy.policyNumber, type: 'Group', plan: policy.planName, payer: policy.payerName, members: '0', limit: String(CASES.cardFields.maxMembers) });
    });

    await steps.step('Check the actions shown on the card - the actions available to the logged-in user are displayed', async () => {
      const onCard: Record<string, string> = {};
      for (const action of CARD_ROW_ACTIONS) onCard[action] = (await list.getCardActionState(policy.nameEn, action)).availability;
      await list.switchToTable();
      const onRow: Record<string, string> = {};
      for (const action of CARD_ROW_ACTIONS) onRow[action] = (await list.getActionState(policy.nameEn, action)).availability;
      const usable = (states: Record<string, string>) => CARD_ROW_ACTIONS.filter((a) => states[a] === 'available');
      expect(usable(onCard), `the card's actions (row offers ${usable(onRow).join(', ')})`).toEqual(usable(onRow));
      expect(usable(onCard)).toContain('view');
    });
  });

  test(`TC-${CASES.zeroCounters.azureId}: should show zero on every counter and an empty state in both views when no policy is in the user's scope`, async ({
    policyManagementPage: list,
    page,
    steps,
  }) => {
    await steps.critical('Navigate to the Policy Management module - the module loads with no policies in scope', async () => {
      await list.simulateEmptyRegister();
      await NetworkUtils.rewriteJsonResponse(page, ApiEndpoints.policyDashboard, zeroed);
      await list.open();
      expect(await list.isKpiBandVisible()).toBe(true);
    });

    await steps.step('Observe the dashboard counters - Total, Active, Pending, Inactive and Expired all display zero', async () => {
      const tiles = Object.values(await list.readKpis());
      const notZero = STORY_COUNTERS.filter((c) => tileFor(tiles, c.label)?.value !== '0').map((c) => `${c.name}: ${tileFor(tiles, c.label)?.value ?? 'missing'}`);
      expect(notZero, `tiles shown: ${tiles.map((t) => `"${t.label}" ${t.value}`).join(', ')}`).toEqual([]);
    });

    await steps.step('Switch between grid and card views - both display an empty-state message with no policy rows or cards', async () => {
      await list.switchToTable().catch(() => undefined);
      // With nothing to list the screen renders one "No policies found." panel and no
      // table at all (2026-11-03), so the table view's message is read from the page.
      const table = { rows: await list.getRowCount(), message: /no polic/i.test(await list.getPageText()) ? await list.getPageText() : '' };
      await list.switchToCards().catch(() => undefined);
      const cards = { cards: await countCards(page), text: await list.getPageText() };
      await list.restoreEndpoints();
      expect({ rows: table.rows, tableMessage: table.message !== '', cards: cards.cards, cardsMessage: /no polic/i.test(cards.text) }, `table "${table.message}"`)
        .toEqual({ rows: 0, tableMessage: true, cards: 0, cardsMessage: true });
    });
  });

  test(`TC-${CASES.pageBoundary.azureId}: should keep the Total counter and the grid pagination accurate when one more policy passes the page size`, async ({
    policyManagementPage: list,
    policyIn,
    steps,
  }) => {
    let before = 0;
    let beforeList = 0;
    let pageSize = 0;
    let added = '';

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
    });

    await steps.step('Observe the Total counter with the register at its page-size boundary - the Total counter shows the correct count', async () => {
      before = await list.readKpi('total');
      beforeList = (await readScreenList(list)).totalRows;
      pageSize = await list.getEffectivePageSize();
      expect(pageSize, 'the grid\'s page size').toBeGreaterThan(0);
      expect(before, 'the Total against the list\'s own count').toBe(beforeList);
    });

    await steps.step('Add one more policy, taking the count past the page size, and reload the dashboard - the dashboard reloads', async () => {
      added = (await policyIn('Draft')).nameEn;
      await list.openTable();
      expect(await list.isKpiBandVisible()).toBe(true);
    });

    await steps.step('Observe the Total counter and the grid pagination - the Total rises by one and the pages show the additional policy', async () => {
      const answer = await readScreenList(list);
      expect({ total: await list.readKpi('total'), listed: answer.totalRows }).toEqual({ total: before + 1, listed: beforeList + 1 });
      expect((await list.readNames())[0], 'the newest policy heads page 1').toBe(added);
      let counted = await list.countRows();
      for (let n = 1; n < CASES.pageBoundary.maxPages && (await list.hasNextPage()); n += 1) {
        // Counted once the page has turned: read straight away, the last page
        // still showed the previous ten rows (70 counted for 64, 2026-11-03).
        const previousFirst = (await list.readNames())[0];
        await list.goToNextPage();
        await expect.poll(async () => (await list.readNames())[0], { timeout: 15_000 }).not.toBe(previousFirst);
        counted += await list.countRows();
      }
      expect(counted, `rows across all pages (page size ${pageSize})`).toBe(answer.totalRows);
    });
  });

  test(`TC-${CASES.filterConsistency.azureId}: should keep the counters on the full portfolio and consistent with the list when a status filter is applied and removed`, async ({
    policyManagementPage: list,
    steps,
  }) => {
    let before: Record<string, number> = {};

    await steps.critical('Navigate to the Policy Management module - the module loads showing unfiltered counters and list', async () => {
      await list.openTable();
      before = tileNumbers(await list.readKpis());
    });

    await steps.step(`Apply the status filter "${CASES.filterConsistency.status}" - the list refreshes to show only ${CASES.filterConsistency.status} policies`, async () => {
      await list.filterBy('status', CASES.filterConsistency.status);
      // The cell carries the status badge plus any "In Grace" badge; the first is the status.
      const statuses = (await list.readColumnValues('status')).map((s) => s.split('\n')[0].trim());
      expect(statuses.filter((s) => s !== CASES.filterConsistency.status), 'rows of another status').toEqual([]);
    });

    await steps.step('Observe the dashboard counters - they still reflect the full portfolio, with no stale or mismatched values', async () => {
      expect(tileNumbers(await list.readKpis()), 'the counters after filtering').toEqual(before);
      expect(before.total, 'the Total against the dashboard\'s own answer').toBe((await list.fetchDashboard()).total);
    });

    await steps.step('Remove the filter - the list returns to all policies, consistent with the counters', async () => {
      const answer = await list.filterBy('status', ALL_STATUSES);
      expect(answer.totalRows, 'the unfiltered list against the Total').toBe(before.total);
    });
  });

  test(`TC-${CASES.switchViews.azureId}: should switch between grid and card views without errors, with matching values and the search kept`, async ({
    policyManagementPage: list,
    policyIn,
    page,
    steps,
  }) => {
    const policy = await policyIn('Draft', { maxMembers: 5 });

    await steps.critical('Navigate to the Policy Management module - the module loads in the default view', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.step(`Switch between grid and card views ${CASES.switchViews.switches} times - each switch renders correctly with no errors or missing data`, async () => {
      const problems: string[] = [];
      for (let n = 1; n <= CASES.switchViews.switches; n += 1) {
        await list.switchToCards();
        if (!(await list.loadCardsUntilShown(policy.nameEn))) problems.push(`switch ${n}: no card for the policy`);
        await list.switchToTable();
        if ((await list.countRows()) === 0) problems.push(`switch ${n}: no table rows`);
      }
      problems.push(...(await visibleMessages(page)).filter((m) => ERROR_MESSAGE.test(m)));
      expect(problems).toEqual([]);
    });

    await steps.step('Compare the same policy\'s values across both views - every field matches between the grid and the card', async () => {
      const row = await list.readRow(policy.nameEn);
      await list.switchToCards();
      await list.loadCardsUntilShown(policy.nameEn);
      const card = await list.readCard(policy.nameEn);
      expect({ name: card.title, number: card.number, type: card.type, plan: card.plan, payer: card.payer, members: card.members, effective: card.effectiveDate, expiry: card.expiryDate, status: card.statusBadge, approval: card.versionStatus })
        .toEqual({ name: row.name, number: row.number, type: row.type, plan: row.plan, payer: row.payer, members: row.members, effective: row.effectiveDate, expiry: row.expiryDate, status: row.status, approval: row.approvalStatus });
    });

    await steps.step('Switch views while a search is active - the search stays applied after each switch', async () => {
      await list.switchToTable();
      await list.search(policy.nameEn);
      await list.switchToCards();
      const inCards = { box: await readSearchBox(page), cards: await countCards(page) };
      await list.switchToTable();
      const inTable = { box: await readSearchBox(page), rows: await list.countRows() };
      expect({ inCards, inTable }).toEqual({ inCards: { box: policy.nameEn, cards: 1 }, inTable: { box: policy.nameEn, rows: 1 } });
    });
  });

  test(`TC-${CASES.roleActions.azureId}: should offer a read-only user only the read-only row actions the edit user is offered more of`, async ({
    policyManagementPage: list,
    policyIn,
    policyRole,
    requirePolicyListAccess,
    steps,
  }) => {
    const policy = await policyIn('Draft', { payerName: POLICY_SCOPE.payerA, networks: 0 });
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
    });

    await steps.step('Log in as the user with edit rights and inspect the actions for a policy row - the full set of permitted actions is available', async () => {
      const states = await list.readActionStates(policy.nameEn);
      expect(CARD_ROW_ACTIONS.filter((a) => states[a].availability !== 'available'), 'actions not offered to the edit user').toEqual([]);
    });

    await steps.critical('Log out and log in as the read-only user - the dashboard loads for this user', async () => {
      session = await policyRole.signIn({ without: READ_ONLY_WITHHELD });
      await requirePolicyListAccess(session);
      await openScopedPolicies(session, POLICY_SCOPE.allMine);
      expect(await session.policies.isKpiBandVisible()).toBe(true);
    });

    await steps.step('Inspect the actions for the same policy row - only read-only actions are shown, the restricted ones hidden or disabled', async () => {
      const states = await session.policies.readActionStates(policy.nameEn);
      const offered = (Object.keys(states) as PolicyRowAction[]).filter((a) => states[a].availability === 'available');
      expect(offered, `actions offered with ${session.removed.length} write rights withheld`).toEqual(['view']);
    });
  });

  test(`TC-${CASES.placeholder.azureId}: should show a clear placeholder instead of a blank when a policy's optional field has no value`, async ({
    policyManagementPage: list,
    policyIn,
    steps,
  }) => {
    const policy = await policyIn('Draft', { networks: 0, maxMembers: null, gracePeriodDays: null });

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
    });

    await steps.step('Switch to card view and locate the policy with the blank optional fields - its card is displayed', async () => {
      await list.switchToCards();
      expect(await list.loadCardsUntilShown(policy.nameEn), `a card for "${policy.nameEn}"`).toBe(true);
    });

    await steps.step('Inspect the field with no assigned value - the card shows a clear placeholder instead of a blank or broken layout', async () => {
      const card = await list.readCard(policy.nameEn);
      const broken = Object.entries(card).filter(([, value]) => NOT_A_PLACEHOLDER.test(value)).map(([field, value]) => `card ${field}: "${value}"`);
      await list.switchToTable();
      const row = await list.readRow(policy.nameEn);
      broken.push(...Object.entries(row).filter(([, value]) => NOT_A_PLACEHOLDER.test(value)).map(([column, value]) => `row ${column}: "${value}"`));
      expect(broken, `Member Limit reads "${card.maxMembers}"`).toEqual([]);
      expect(card.maxMembers, 'an unlimited Member Limit must not read as 0').not.toBe('0');
    });
  });
});
