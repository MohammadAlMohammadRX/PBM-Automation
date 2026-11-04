import { test, expect, type PolicySession } from '../../../utils/policy/policyRole';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { BLOCKED_CASES, CASES, OUT_OF_SCOPE, sharedTerm } from '../../../data/policy/policiesPerPayer.data';
import type { PolicyRight } from '../../../data/policy/policyPermissions.data';
import { headerLike } from '../../../utils/formulary/writerAHelpers';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { SUITE_POLICY_PREFIX, listPolicyRegister, policyStamp } from '../../../utils/PolicyProvisioning';
import {
  ERROR_MESSAGE,
  POLICY_SCOPE,
  exportColumn,
  exportNames,
  openScopedPolicies,
  payerIsActive,
  payersOf,
  primaryStatus,
  readScreenList,
  said,
  visibleMessages,
} from '../../../utils/policy/writerAHelpers';

/**
 * The right the export cases grant the Payer Admin. 2026-11-04: its role does not hold
 * ExportPolicies, so its Export menu offered only "Export Template" (19651 waited 30 s for
 * Export All Data) - the case's payer-scoped user is one who may export.
 */
const EXPORTING: readonly PolicyRight[] = ['export'];

/** BLOCKS the case when the shaped account is still offered no data export (the granted right did not reach it). */
async function requireExportData(session: PolicySession, requireBaseline: (held: boolean, what: string) => void): Promise<void> {
  const offered = await session.policies.getExportOptions();
  requireBaseline(offered.includes('all'), `the Payer Admin offered Export All Data once granted "${session.granted.join(', ')}" (menu offers: ${offered.join(', ') || 'nothing'})`);
}

/** Payers of `payers` outside `allowed`. */
const outside = (payers: readonly string[], allowed: readonly string[]): string[] => [...new Set(payers.filter((p) => !allowed.includes(p)))];

/**
 * User story 15188: Policy List - Policies per payer.
 * A payer-scoped user sees only its assigned payers' policies - in the list,
 * a search, an export and a direct link - while the administrator sees every
 * payer's. See the data file for who plays which user.
 */
test.describe('US 15188 - Policy List - Policies per payer', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.onlyPayerA.azureId}: should list only the assigned payer's policies to a payer-scoped user`, async ({
    policyIn,
    policyRole,
    requirePolicyListAccess,
    steps,
  }) => {
    const inScope = await policyIn('Draft', { payerName: POLICY_SCOPE.payerA, networks: 0 });
    const outScope = await policyIn('Draft');
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      session = await policyRole.signIn({});
      await requirePolicyListAccess(session);
      await openScopedPolicies(session, POLICY_SCOPE.payerA);
    });

    await steps.step('Open the Policy List view - the list of policies loads', async () => {
      expect((await readScreenList(session.policies)).totalRows, `policies of ${POLICY_SCOPE.payerA}`).toBeGreaterThan(0);
    });

    await steps.step(`Review the displayed policies - only ${POLICY_SCOPE.payerA} policies are listed`, async () => {
      const payers = (await session.policies.readRowsOnScreen()).map((r) => r.payer);
      expect({
        otherPayers: outside(payers, [POLICY_SCOPE.payerA]),
        own: await session.policies.isListed(inScope.nameEn),
        other: await session.policies.isListed(outScope.nameEn),
      }).toEqual({ otherPayers: [], own: true, other: false });
    });
  });

  test(`TC-${CASES.searchScoped.azureId}: should limit a payer-scoped user's search results to the assigned payer`, async ({
    policyIn,
    policyRole,
    requirePolicyListAccess,
    steps,
  }) => {
    const term = sharedTerm();
    const a = await policyIn('Draft', { nameEn: `${term} A`, payerName: POLICY_SCOPE.payerA, networks: 0 });
    await policyIn('Draft', { nameEn: `${term} B` });
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      session = await policyRole.signIn({});
      await requirePolicyListAccess(session);
      await openScopedPolicies(session, POLICY_SCOPE.payerA);
    });

    await steps.step('Open the Policy List view - the list loads', async () => {
      expect(await session.policies.countRows()).toBeGreaterThan(0);
    });

    await steps.step(`Enter "${term}", which matches policies of both ${POLICY_SCOPE.payerA} and ${POLICY_SCOPE.outside} - only ${POLICY_SCOPE.payerA}'s match is returned`, async () => {
      const answer = await session.policies.searchFor(term);
      expect(answer.items.map((p) => p.policyNameEn)).toEqual([a.nameEn]);
    });
  });

  test(`TC-${CASES.exportScoped.azureId}: should export only the assigned payer's policies for a payer-scoped user`, async ({
    policyIn,
    policyRole,
    requirePolicyListAccess,
    requireBaseline,
    steps,
  }) => {
    await policyIn('Draft', { payerName: POLICY_SCOPE.payerA, networks: 0 });
    const outScope = await policyIn('Draft');
    let session!: PolicySession;
    let file!: Awaited<ReturnType<PolicySession['policies']['exportAndParse']>>;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      session = await policyRole.signIn({ with: EXPORTING });
      await requirePolicyListAccess(session);
      await openScopedPolicies(session, POLICY_SCOPE.payerA);
      await requireExportData(session, requireBaseline);
    });

    await steps.step('Open the Policy List view - the list loads', async () => {
      expect(await session.policies.countRows()).toBeGreaterThan(0);
    });

    await steps.step('Click Export - the export file is generated and downloaded', async () => {
      file = await session.policies.exportAndParse('all', 'csv');
      expect(file.filename).toMatch(/\.csv$/i);
    });

    await steps.step(`Open the exported file - its content is viewable and holds only ${POLICY_SCOPE.payerA} policies`, async () => {
      const payers = exportColumn(file.parsed, /payer/i);
      expect({ rows: file.parsed.rows.length > 0, otherPayers: outside(payers, [POLICY_SCOPE.payerA]), leaked: exportNames(file.parsed).includes(outScope.nameEn) }, `payer column "${headerLike(file.parsed.headers, /payer/i)}"`)
        .toEqual({ rows: true, otherPayers: [], leaked: false });
    });
  });

  test(`TC-${CASES.multiplePayers.azureId}: should combine the policies of every assigned payer and hide the others`, async ({
    policyIn,
    policyRole,
    requirePolicyListAccess,
    page,
    steps,
  }) => {
    const inScope = await policyIn('Draft', { payerName: POLICY_SCOPE.payerA, networks: 0 });
    const outScope = await policyIn('Draft');
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      session = await policyRole.signIn({});
      await requirePolicyListAccess(session);
      await openScopedPolicies(session, POLICY_SCOPE.allMine);
    });

    await steps.step(`Open the Policy List view - it shows the policies of ${POLICY_SCOPE.assigned.join(' and ')} while ${POLICY_SCOPE.outside}'s stay hidden`, async () => {
      const mine = (await listPolicyRegister(session.page, {}, 500)).items;
      const payerBInRegister = (await listPolicyRegister(page, {}, 500)).items.filter((p) => p.payerNameEn === POLICY_SCOPE.inactivePayer).length;
      expect({
        otherPayers: outside(payersOf(mine), POLICY_SCOPE.assigned),
        payerA: mine.some((p) => p.id === inScope.id),
        payerB: mine.filter((p) => p.payerNameEn === POLICY_SCOPE.inactivePayer).length,
        hidden: !mine.some((p) => p.id === outScope.id),
      }).toEqual({ otherPayers: [], payerA: true, payerB: payerBInRegister, hidden: true });
    });
  });

  test(`TC-${CASES.adminAll.azureId}: should show policies of every payer to the unrestricted administrator`, async ({
    policyManagementPage: list,
    policyIn,
    page,
    steps,
  }) => {
    const term = sharedTerm();
    const a = await policyIn('Draft', { nameEn: `${term} A`, payerName: POLICY_SCOPE.payerA, networks: 0 });
    const b = await policyIn('Draft', { nameEn: `${term} B` });

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      await list.openTable();
    });

    await steps.step('Open the Policy List view - the list loads with the policies of all payers', async () => {
      const found = await list.searchFor(term);
      const register = await listPolicyRegister(page, {}, 500);
      expect({ found: found.items.map((p) => p.policyNameEn).sort(), payers: payersOf(register.items).length > 2 }).toEqual({ found: [a.nameEn, b.nameEn].sort(), payers: true });
    });
  });

  test(`TC-${CASES.directLink.azureId}: should deny a payer-scoped user another payer's policy opened by a direct link`, async ({
    policyIn,
    policyRole,
    requirePolicyListAccess,
    steps,
  }) => {
    const outScope = await policyIn('Draft');
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      session = await policyRole.signIn({});
      await requirePolicyListAccess(session);
      await openScopedPolicies(session, POLICY_SCOPE.allMine);
    });

    await steps.step(`Open ${POLICY_SCOPE.outside}'s policy ${outScope.policyNumber} directly by its link - access is denied or the policy is not found`, async () => {
      const answer = await NetworkUtils.postAsSession(session.page, ApiEndpoints.policyGet, { id: outScope.id });
      await session.detail.openExpectingFailure(outScope.id);
      const loaded = await session.detail.isLoaded();
      const screen = await session.detail.getScreenText();
      expect({ loaded, refused: answer.status >= 400, told: OUT_OF_SCOPE.test(`${answer.text} ${screen}`) }, `GetPolicy ${said(answer)}; screen "${screen.slice(0, 200)}"`)
        .toEqual({ loaded: false, refused: true, told: true });
    });
  });

  test(`TC-${CASES.noLeak.azureId}: should return nothing when a payer-scoped user searches a term unique to another payer's policy`, async ({
    policyIn,
    policyRole,
    requirePolicyListAccess,
    steps,
  }) => {
    const outScope = await policyIn('Draft', { nameEn: `${SUITE_POLICY_PREFIX} Only B ${policyStamp()}` });
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      session = await policyRole.signIn({});
      await requirePolicyListAccess(session);
      await openScopedPolicies(session, POLICY_SCOPE.payerA);
    });

    await steps.step(`Open the Policy List view and search "${outScope.nameEn}", unique to a ${POLICY_SCOPE.outside} policy - the search returns no results`, async () => {
      const answer = await session.policies.searchFor(outScope.nameEn);
      expect({ found: answer.items.map((p) => p.policyNameEn), emptyState: (await session.policies.getEmptyStateText()) !== '' }).toEqual({ found: [], emptyState: true });
    });
  });

  test(`TC-${CASES.exportFilterScope.azureId}: should export only the assigned payer's policies of the filtered status`, async ({
    policyRole,
    requirePolicyListAccess,
    requireBaseline,
    steps,
  }) => {
    const status = CASES.exportFilterScope.status;
    let session!: PolicySession;
    let filtered = 0;
    let file!: Awaited<ReturnType<PolicySession['policies']['exportAndParse']>>;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      session = await policyRole.signIn({ with: EXPORTING });
      await requirePolicyListAccess(session);
      await openScopedPolicies(session, POLICY_SCOPE.payerA);
      await requireExportData(session, requireBaseline);
    });

    await steps.step(`Open the Policy List view and apply the status filter ${status} - the list reloads showing only ${status} policies`, async () => {
      filtered = (await session.policies.filterBy('status', status)).totalRows;
      requireBaseline(filtered > 0, `an ${status} policy of ${POLICY_SCOPE.payerA} (the case's precondition; Active is reached only by the daily job)`);
      expect((await session.policies.readColumnValues('status')).filter((s) => primaryStatus(s) !== status), 'rows of another status').toEqual([]);
    });

    await steps.step('Click Export - the export file is generated', async () => {
      // The filtered rows = "Selected Export" (scope "Filtered" with a filter on); "Export All Data" is the whole scope (2026-11-04).
      file = await session.policies.exportAndParse('selected', 'csv');
      expect(file.filename).toMatch(/\.csv$/i);
    });

    await steps.step(`Open the exported file - it holds only ${status} policies of ${POLICY_SCOPE.payerA}`, async () => {
      const statuses = exportColumn(file.parsed, /^status$/i);
      const payers = exportColumn(file.parsed, /payer/i);
      expect({ rows: file.parsed.rows.length, otherStatuses: [...new Set(statuses.filter((s) => s !== status))], otherPayers: outside(payers, [POLICY_SCOPE.payerA]) }, `export headers: ${file.parsed.headers.join(', ')}`)
        .toEqual({ rows: filtered, otherStatuses: [], otherPayers: [] });
    });
  });

  test(`TC-${CASES.payerDeactivated.azureId}: should expose no other payer's policies once the user's assigned payer is deactivated`, async ({
    policyManagementPage,
    policyRole,
    requirePolicyListAccess,
    requireBaseline,
    page,
    steps,
  }) => {
    const payer = POLICY_SCOPE.inactivePayer;
    await policyManagementPage.open();
    requireBaseline((await payerIsActive(page, payer)) === false, `the account's payer "${payer}" deactivated (the suite never deactivates a payer it did not create)`);
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      session = await policyRole.signIn({});
      await requirePolicyListAccess(session);
      await openScopedPolicies(session, POLICY_SCOPE.allMine);
    });

    await steps.step(`As administrator, deactivate ${payer} - it is marked inactive`, async () => {
      expect(await payerIsActive(page, payer), `"${payer}" in the payer register`).toBe(false);
    });

    await steps.step('As the affected user, reload the Policy List view - the list reloads gracefully, showing no other payer\'s policies', async () => {
      const scoped = await session.policies.scopeTo(payer);
      const answer = await readScreenList(session.policies);
      const allowed = scoped ? [payer] : POLICY_SCOPE.assigned;
      const errors = (await visibleMessages(session.page)).filter((m) => ERROR_MESSAGE.test(m));
      expect({ exposed: outside(payersOf(answer.items), allowed), errors }, `"${payer}" ${scoped ? 'put in scope' : 'no longer offered by the scope'}; ${answer.totalRows} rows`)
        .toEqual({ exposed: [], errors: [] });
    });
  });

  test(`TC-${CASES.consistentViews.azureId}: should keep the payer scope across list, search, filters and export used repeatedly`, async ({
    policyIn,
    policyRole,
    requirePolicyListAccess,
    requireBaseline,
    steps,
  }) => {
    const data = CASES.consistentViews;
    const term = sharedTerm();
    await policyIn('Draft', { nameEn: `${term} A`, payerName: POLICY_SCOPE.payerA, networks: 0 });
    const outScope = await policyIn('Draft', { nameEn: `${term} B` });
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      session = await policyRole.signIn({ with: EXPORTING });
      await requirePolicyListAccess(session);
      await openScopedPolicies(session, POLICY_SCOPE.payerA);
      await requireExportData(session, requireBaseline);
    });

    await steps.step('Move between the Policy List, Search and Export repeatedly, applying and clearing filters - each responds without error and stays within the payer', async () => {
      const list = session.policies;
      const seenPayers: string[] = [];
      const seenNames: string[] = [];
      const errors: string[] = [];
      for (let round = 1; round <= data.rounds; round += 1) {
        seenPayers.push(...payersOf((await readScreenList(list)).items));
        const found = await list.searchFor(term);
        seenPayers.push(...payersOf(found.items));
        seenNames.push(...found.items.map((p) => p.policyNameEn));
        seenPayers.push(...payersOf((await list.filterBy('type', data.type)).items));
        const file = await list.exportAndParse('all', 'csv');
        seenPayers.push(...exportColumn(file.parsed, /payer/i));
        seenNames.push(...exportNames(file.parsed));
        await list.filterBy('type', data.allTypes);
        await list.search('');
        errors.push(...(await visibleMessages(session.page)).filter((m) => ERROR_MESSAGE.test(m)));
      }
      expect({ errors, otherPayers: outside(seenPayers, [POLICY_SCOPE.payerA]), leaked: seenNames.includes(outScope.nameEn) }).toEqual({ errors: [], otherPayers: [], leaked: false });
    });
  });

  test(`TC-${CASES.identicalRule.azureId}: should apply the same payer scope to the list, the search and the export`, async ({
    policyIn,
    policyRole,
    requirePolicyListAccess,
    requireBaseline,
    steps,
  }) => {
    const term = sharedTerm();
    const a = await policyIn('Draft', { nameEn: `${term} A`, payerName: POLICY_SCOPE.payerA, networks: 0 });
    const b = await policyIn('Draft', { nameEn: `${term} B` });
    let session!: PolicySession;

    await steps.critical('Navigate to the Policy Management module - the module loads', async () => {
      session = await policyRole.signIn({ with: EXPORTING });
      await requirePolicyListAccess(session);
      await openScopedPolicies(session, POLICY_SCOPE.payerA);
      await requireExportData(session, requireBaseline);
    });

    await steps.step(`Check the Policy List for scoping - only ${POLICY_SCOPE.payerA} policies appear`, async () => {
      const answer = await readScreenList(session.policies);
      expect({ rows: answer.totalRows > 0, otherPayers: outside(payersOf(answer.items), [POLICY_SCOPE.payerA]) }).toEqual({ rows: true, otherPayers: [] });
    });

    await steps.step(`Check the Search results for scoping - only ${POLICY_SCOPE.payerA} policies appear`, async () => {
      const found = await session.policies.searchFor(term);
      expect(found.items.map((p) => p.policyNameEn)).toEqual([a.nameEn]);
    });

    await steps.step(`Check the Export output for scoping - only ${POLICY_SCOPE.payerA} policies appear in the file`, async () => {
      await session.policies.search('');
      const file = await session.policies.exportAndParse('all', 'csv');
      expect({ otherPayers: outside(exportColumn(file.parsed, /payer/i), [POLICY_SCOPE.payerA]), leaked: exportNames(file.parsed).includes(b.nameEn) })
        .toEqual({ otherPayers: [], leaked: false });
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
