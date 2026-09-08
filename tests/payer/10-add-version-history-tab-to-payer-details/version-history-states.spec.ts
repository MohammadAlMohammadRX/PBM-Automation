import { test, expect } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import type { PayerDetailPage } from '../../../pages/payer/PayerDetailPage';
import type { PayerVersionHistoryTab } from '../../../pages/payer/PayerVersionHistoryTab';
import { VERSION_LABEL } from '../../../data/payers/versionHistory.data';

/**
 * User story: Add Version History Tab to Payer Details.
 * Empty state, the pending-to-approved transition, resilience and access.
 *
 * Like its sibling spec, each test opens the detail screen ONCE and keeps the
 * Page Object - re-deriving it per step means walking the 35-page list again,
 * and in the resilience case it is impossible, because the list's own endpoint
 * has deliberately been made to fail by then.
 */
test.describe('Add Version History Tab to Payer Details - States and resilience', () => {
  test('TC-004: should show an empty state for a payer with no approved changes', async ({
    payerManagementPage,
    draftPayer,
    steps,
  }) => {
    // `draftPayer` is a v0 registration that has never been approved, which is
    // precisely the criterion's precondition ("only the initial unapproved
    // registration").
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    // Split to mirror the sheet, which expects the detail screen to load and
    // the tab to activate as two separate results.
    let history: PayerVersionHistoryTab;
    await steps.critical('Open the new payer’s detail screen', async () => {
      const detail = await payerManagementPage.openDetails(draftPayer.nameEn);
      await detail.waitForLoaded();
      history = detail.versionHistory();
    });

    await steps.critical('The Version History tab activates', async () => {
      await history.open();
      await history.expectTabActive();
    });

    // The criterion requires an explicit "no approved changes" state. Note this
    // is the same rule TC-003 checks from the other direction: if the tab lists
    // the unapproved v0 registration instead of an empty state, both fail, and
    // they fail for the one underlying reason - unapproved entries are listed.
    await steps.step('An empty state is shown, with no error', () =>
      history.expectEmptyState());
  });

  test('TC-007: should list a change only after it is approved', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    // The state transition, driven end to end: the payer arrives published at
    // v1, an edit is staged, the tab is checked WHILE the edit is pending, the
    // edit is then approved, and the tab is checked again. Checking only the
    // "after" state would not distinguish this criterion from TC-001.
    const newLicense = `LIC-TRANS-${Date.now()}`;

    await steps.critical('Open the payer list', () => payerManagementPage.open());

    await steps.critical('Submit a change to the payer', async () => {
      await payerManagementPage.editTextFieldAndSave(
        publishedPayer.nameEn,
        'License Number',
        newLicense,
      );
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
    });

    await steps.critical('The change is awaiting approval', () =>
      payerManagementPage.expectApprovalStatusContains(publishedPayer.nameEn, 'Pending'));

    await steps.step('Version History does not list the pending change', async () => {
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.waitForLoaded();
      const history = detail.versionHistory();
      await history.open();
      await history.expectDoesNotListVersion(VERSION_LABEL.firstEdit);
    });

    await steps.critical('Approve the pending change', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.approve(publishedPayer.nameEn);
    });

    await steps.step('Version History now lists the approved change', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.waitForLoaded();
      const history = detail.versionHistory();
      await history.open();
      await history.expectListsVersion(VERSION_LABEL.firstEdit);
    });
  });

  test('TC-009: should report a clear failure when the version service is unavailable', async ({
    page,
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    // The endpoint failed here is the VERSION feed
    // (`/api/Payers/GetPayerVersions`), which the tab fires when it is
    // activated - not the payer list.
    //
    // That distinction is the whole test. Failing the list endpoint instead
    // (which an earlier version of this did) breaks the navigation that reaches
    // the detail screen AND leaves the version feed working, so the tab loaded
    // its rows perfectly and the case failed for a reason that had nothing to
    // do with the criterion. Failing only the version feed leaves the Overview
    // tab genuinely healthy, which is exactly the state the criterion
    // describes.
    let detail: PayerDetailPage;
    await steps.critical('Open the payer detail screen', async () => {
      await payerManagementPage.open();
      detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.waitForLoaded();
    });

    await steps.critical('Simulate the version data service failing', () =>
      NetworkUtils.failEndpoint(page, ApiEndpoints.payerVersions));

    await steps.step('The Overview tab is still usable', async () => {
      await expect(detail.statusBadge()).toBeVisible();
    });

    await steps.step('The tab does not present rows as though history had loaded', async () => {
      const history = detail.versionHistory();
      // The tab may legitimately never reach a settled state with its feed
      // broken, which is why opening it is allowed to give up quietly - the
      // assertion that follows is what judges the outcome.
      await history.open().catch(() => undefined);
      await history.expectLoadFailureReported();
    });

    await steps.critical('Restore the service', () =>
      NetworkUtils.restoreEndpoint(page, ApiEndpoints.payerVersions));

    await steps.step('The history loads once the service is back', async () => {
      const history = detail.versionHistory();
      await detail.reload();
      await detail.waitForLoaded();
      await history.open();
      await history.expectTableVisible();
    });
  });

  test('TC-010: should stay consistent across navigation and reload', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Open the payer list', () => payerManagementPage.open());

    let detail: PayerDetailPage;
    let history: PayerVersionHistoryTab;
    let baseline: string[] = [];

    await steps.critical('Open the Version History tab and record its entries', async () => {
      detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.waitForLoaded();
      history = detail.versionHistory();
      await history.open();
      baseline = await history.getVersionLabels();
      expect(baseline.length, 'there must be history to compare against').toBeGreaterThan(0);
    });

    await steps.step('An entry opens its detail view', async () => {
      await history.openEntry(baseline[0]);
      await history.expectEntryDrawerOpen();
      // Closed before moving on: the drawer lays a modal mask over the page, so
      // the next tab click would be swallowed and fail as a click timeout on a
      // control that is visible and enabled throughout.
      await history.closeEntry();
    });

    await steps.step('Leaving the tab and returning reloads the same entries', async () => {
      await detail.openAuditHistory();
      await history.open();
      expect(
        await history.getVersionLabels(),
        'switching tabs and returning must not change, duplicate or lose entries',
      ).toEqual(baseline);
    });

    await steps.step('Reloading the browser reloads the same entries', async () => {
      await detail.reload();
      await detail.waitForLoaded();
      await history.open();
      expect(
        await history.getVersionLabels(),
        'a reload must not duplicate or lose entries',
      ).toEqual(baseline);
    });
  });
});

test.describe('Add Version History Tab to Payer Details - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('TC-006: should apply role-based access to the Version History tab', async ({
    loginPage,
    payerManagementPage,
    steps,
  }) => {
    // The criterion's decision table needs THREE roles: System Administrator,
    // a read-only Payer Manager, and a role with no payer access at all. Only
    // the administrator is configured. The administrator row is already proved
    // by every other case in this story - the tab is reachable and usable - so
    // running it again here would add nothing while making the case look
    // covered.
    if (!env.nonAdminUsername || !env.nonAdminPassword) {
      steps.blocked(
        'the access decision table needs a read-only Payer Manager account and an account '
          + 'with no Payer Management rights. Neither is configured - NON_ADMIN_USERNAME / '
          + 'NON_ADMIN_PASSWORD are empty in .env - so the two denial rows cannot be '
          + 'exercised. The System Administrator row is already covered by the other cases '
          + 'in this story.',
      );
    }

    await steps.critical('Sign in as a non-administrator', async () => {
      await loginPage.open();
      await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
    });

    await steps.critical('Navigate to the payer module', () => payerManagementPage.navigate());

    await steps.step('The payer module and its Version History are not available', () =>
      payerManagementPage.expectSearchAccessRestricted());
  });
});
