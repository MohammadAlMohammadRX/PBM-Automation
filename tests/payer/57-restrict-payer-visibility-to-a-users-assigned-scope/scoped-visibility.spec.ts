import { test, expect } from '../../../fixtures';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { AppRoutes } from '../../../constants/AppRoutes';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import {
  FORBIDDEN_WORDING,
  OUT_OF_SCOPE_STATUS,
  OUT_OF_SCOPE_TOAST,
} from '../../../data/accounts/nonAdminAccount.data';
import {
  DETAIL_REQUEST,
  IN_SCOPE_FORM_FIELD,
  IN_SCOPE_PAYER,
  SCOPED_PAYERS,
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
  // Azure test case 15626
  test('15626: should list only in-scope payers when a scoped user opens the payer list', async ({
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

  // Azure test case 15627
  test('15627: should let a scoped user open and edit an in-scope payer', async ({
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

  // Azure test case 15628
  test('15628: should answer Not Found rather than Forbidden when a scoped user follows a direct link to an out-of-scope payer', async ({
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

  // Azure test case 15629
  test('15629: should answer Not Found without leaking data when a scoped session calls the API for an out-of-scope payer', async ({
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
});
