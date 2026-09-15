import { test, expect } from '../../../fixtures';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { AppRoutes } from '../../../constants/AppRoutes';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import {
  FORBIDDEN_WORDING,
  NO_OWNER_CELL,
  NON_ADMIN_PROFILE,
  OUT_OF_SCOPE_STATUS,
  OUT_OF_SCOPE_TOAST,
} from '../../../data/accounts/nonAdminAccount.data';
import {
  BLOCKED_CASES,
  DETAIL_REQUEST,
  EXPORT_NAME_COLUMN,
  IN_SCOPE_FORM_FIELD,
  IN_SCOPE_PAYER,
  NETWORK_PAGES,
  SCOPED_PAYERS,
  SCOPE_STATUS_FILTER,
} from '../../../data/payers/scopedVisibility.data';

/**
 * User story: Restrict Payer Visibility to a User's Assigned Scope.
 *
 * The scoped user is the configured non-admin account (a Payer Admin assigned
 * to two payers - see nonAdminAccount.data), signed in from its own browser
 * context by the `nonAdminSession` fixture while the administrator's session
 * stays open to provide the out-of-scope records. Every case here reads
 * through the same Page Objects the administrator's stories use; only the
 * session differs. The cases needing other scope shapes are BLOCKED - see
 * scopedVisibility.data.ts.
 */
const sorted = (names: readonly string[]): string[] => [...names].sort();

test.describe('Scope-restricted payer visibility', () => {
  test('TC-001: should list only in-scope payers when a scoped user opens the payer list', async ({
    nonAdminSession,
    steps,
  }) => {
    await steps.critical('Navigate to the payer module as the scoped user', async () => {
      await nonAdminSession.payers.open();
      await nonAdminSession.payers.expectRowsRendered();
    });

    await steps.step('The list holds exactly the assigned payers and the total agrees', async () => {
      const names = await nonAdminSession.payers.getVisiblePayerNames();
      expect(sorted(names), 'only the assigned payers should be listed').toEqual(sorted(SCOPED_PAYERS));
      expect(await nonAdminSession.payerMetrics.getMetric('total'), 'the total should count the scope, not the register').toBe(SCOPED_PAYERS.length);
    });
  });

  test('TC-002: should let a scoped user open and edit an in-scope payer', async ({
    nonAdminSession,
    steps,
  }) => {
    await steps.critical('Navigate to the module and open an assigned payer\'s details', async () => {
      await nonAdminSession.payers.open();
      const detail = await nonAdminSession.payers.openDetails(IN_SCOPE_PAYER);
      await detail.waitForLoaded();
      expect(await detail.getHeaderActionIds(), 'the assigned payer should offer Edit').toContain('edit');
    });

    await steps.step('The edit form opens on that payer', async () => {
      // Opened and read, not saved: the two assigned payers are shared live
      // records and a staged draft on one would outlive this case.
      await nonAdminSession.payers.open();
      const form = await nonAdminSession.payers.openEditForm(IN_SCOPE_PAYER);
      expect(await form.getFieldValue(IN_SCOPE_FORM_FIELD), 'the form should hold the assigned payer').toBe(IN_SCOPE_PAYER);
      await form.closeAndDiscard();
    });
  });

  test('TC-003: should answer Not Found rather than Forbidden when a scoped user follows a direct link to an out-of-scope payer', async ({
    payerManagementPage,
    publishedPayer,
    nonAdminSession,
    steps,
  }) => {
    let outOfScopeId = '';

    await steps.critical('Navigate to the module and learn an out-of-scope payer\'s link', async () => {
      await payerManagementPage.open();
      outOfScopeId = await payerManagementPage.getPayerIdFromDetailUrl(publishedPayer.nameEn);
      expect(outOfScopeId, 'the payer id should be known').not.toBe('');
    });

    await steps.step('The scoped user following the link is told the payer cannot be loaded, not that it is forbidden', async () => {
      await nonAdminSession.payers.openPayerById(outOfScopeId);
      await nonAdminSession.payers.expectRecordNotFound();
      const toast = await nonAdminSession.payers.getToastMessage();
      expect(toast, 'the refusal should be phrased as Not Found').toMatch(OUT_OF_SCOPE_TOAST);
      expect(toast, 'the refusal must not reveal the payer exists').not.toMatch(FORBIDDEN_WORDING);
    });

    await steps.step('The scoped user lands back on their own list', async () => {
      await nonAdminSession.payers.verifyUrlContains(AppRoutes.payerManagement);
      // The redirect lands on the user's remembered view (Cards); the list is
      // opened through the Page Object so the rows are read in Table view.
      await nonAdminSession.payers.open();
      await nonAdminSession.payers.expectRowsRendered();
      expect(sorted(await nonAdminSession.payers.getVisiblePayerNames())).toEqual(sorted(SCOPED_PAYERS));
    });
  });

  test('TC-004: should answer Not Found without leaking data when a scoped session calls the API for an out-of-scope payer', async ({
    page,
    payerManagementPage,
    publishedPayer,
    nonAdminSession,
    steps,
  }) => {
    let detailRequest = '';

    await steps.critical('Navigate to the module and capture the request that loads an out-of-scope payer', async () => {
      // The administrator's own detail request is captured and replayed from
      // the scoped session, so the call is exactly the one the application
      // makes rather than a guessed body shape.
      await payerManagementPage.open();
      detailRequest = (await NetworkUtils.captureRequestBody(page, DETAIL_REQUEST, async () => {
        await payerManagementPage.openDetails(publishedPayer.nameEn);
      })) ?? '';
      expect(detailRequest, 'the detail request should have been captured').not.toBe('');
      await nonAdminSession.payers.open();
    });

    await steps.step('The scoped session\'s API call answers Not Found with nothing of the payer in it', async () => {
      const response = await NetworkUtils.postAsSession(nonAdminSession.page, ApiEndpoints.payerDetail, JSON.parse(detailRequest));
      expect(response.status, 'an out-of-scope payer should be Not Found').toBe(OUT_OF_SCOPE_STATUS);
      expect(response.text, 'the body must not carry the payer\'s data').not.toContain(publishedPayer.nameEn);
      expect(response.text, 'the body must not carry the payer\'s contact data').not.toContain(publishedPayer.email);
    });
  });

  test('TC-005: should show unassigned networks alongside the scoped payers', async ({
    linkedNetwork,
    nonAdminSession,
    steps,
  }) => {
    test.slow();
    let outOfScopeNetwork = '';

    await steps.critical('Navigate to the networks and learn one owned by an out-of-scope payer', async () => {
      const candidate = await linkedNetwork('any');
      expect(SCOPED_PAYERS, `"${candidate.payer}" should be outside the scoped user's assignment`).not.toContain(candidate.payer);
      outOfScopeNetwork = candidate.network;
    });

    await steps.step('The scoped user sees unassigned networks but not the out-of-scope payer\'s', async () => {
      const listed = await nonAdminSession.networks.listNetworkOwnership(NETWORK_PAGES);
      expect(listed.some((row) => NO_OWNER_CELL.test(row.payer)), 'unassigned networks should be listed').toBe(true);
      const foreignOwners = listed.filter((row) => row.payer !== '' && !NO_OWNER_CELL.test(row.payer) && !SCOPED_PAYERS.includes(row.payer));
      expect(
        foreignOwners.map((row) => `${row.network} -> ${row.payer}`),
        'networks owned by out-of-scope payers should not be listed',
      ).toEqual([]);
      expect(listed.map((row) => row.network), `"${outOfScopeNetwork}" belongs to an out-of-scope payer`).not.toContain(outOfScopeNetwork);
    });
  });

  test('TC-010: should not leak out-of-scope payers through search, filter or export', async ({
    publishedPayer,
    nonAdminSession,
    steps,
  }) => {
    await steps.critical('Navigate to the module as the scoped user', async () => {
      await nonAdminSession.payers.open();
      await nonAdminSession.payers.expectRowsRendered();
    });

    await steps.step('A search for an out-of-scope payer finds nothing', async () => {
      await nonAdminSession.payers.search(publishedPayer.nameEn);
      await nonAdminSession.payers.expectEmptyState();
    });

    await steps.step('A status filter shows only in-scope payers', async () => {
      await nonAdminSession.payers.open();
      await nonAdminSession.payers.filterByStatus(SCOPE_STATUS_FILTER);
      await nonAdminSession.payers.expectRowsRendered();
      const names = await nonAdminSession.payers.getVisiblePayerNames();
      expect(names.filter((name) => !SCOPED_PAYERS.includes(name)), 'no out-of-scope payer should pass the filter').toEqual([]);
    });

    await steps.step('An export of everything holds only in-scope payers', async () => {
      await nonAdminSession.payers.open();
      const parsed = await nonAdminSession.exportMenu.exportCsv('all');
      const exported = parsed.rows.map((row) => row[EXPORT_NAME_COLUMN]);
      expect(exported.filter((name) => !SCOPED_PAYERS.includes(name)), 'the export must not leak the register').toEqual([]);
      expect(exported, 'the export should hold the assigned payers').toEqual(expect.arrayContaining([...SCOPED_PAYERS]));
    });
  });

  test('TC-011: should enforce scope consistently across list, detail, edit, delete and export', async ({
    payerManagementPage,
    publishedPayer,
    nonAdminSession,
    steps,
  }) => {
    test.slow();
    let outOfScopeId = '';

    await steps.critical('Navigate to the module and learn an out-of-scope payer\'s id', async () => {
      await payerManagementPage.open();
      outOfScopeId = await payerManagementPage.getPayerIdFromDetailUrl(publishedPayer.nameEn);
      expect(outOfScopeId).not.toBe('');
    });

    await steps.step('List: only the assigned payers', async () => {
      await nonAdminSession.payers.open();
      await nonAdminSession.payers.expectRowsRendered();
      expect(sorted(await nonAdminSession.payers.getVisiblePayerNames())).toEqual(sorted(SCOPED_PAYERS));
    });

    await steps.step('Detail and edit: the in-scope payer opens with its management actions', async () => {
      const detail = await nonAdminSession.payers.openDetails(IN_SCOPE_PAYER);
      await detail.waitForLoaded();
      const actions = await detail.getHeaderActionIds();
      expect(actions, 'the in-scope payer should be editable').toContain('edit');
      // The role is defined without deletion (nonAdminAccount.data); the
      // control is not exercised here because a staged delete on a shared
      // live payer would outlive the case. Its presence is reported by the
      // details-tabs role case instead.
    });

    await steps.step('Detail by direct link: the out-of-scope payer is Not Found', async () => {
      await nonAdminSession.payers.openPayerById(outOfScopeId);
      await nonAdminSession.payers.expectRecordNotFound();
    });

    await steps.step('Export: only the assigned payers', async () => {
      await nonAdminSession.payers.open();
      const parsed = await nonAdminSession.exportMenu.exportCsv('all');
      const exported = parsed.rows.map((row) => row[EXPORT_NAME_COLUMN]);
      expect(sorted(exported), `the ${NON_ADMIN_PROFILE.role}'s export should be its scope, nothing more`).toEqual(sorted(SCOPED_PAYERS));
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.id}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
