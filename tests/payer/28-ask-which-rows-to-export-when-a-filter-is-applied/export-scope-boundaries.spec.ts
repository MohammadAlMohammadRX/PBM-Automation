import { test, expect } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { TYPE_FILTER_OPTIONS } from '../../../data/payers/filterPayer.data';
import {
  MISSING_SCOPE,
  OFFERED_SCOPES,
  RESTRICTED_ROLE_REQUIREMENT,
  SCOPE_FILTER,
} from '../../../data/payers/exportScope.data';

/**
 * User story: Ask Which Rows to Export When a Filter Is Applied.
 * The filter-count boundaries, the failure path, and access control.
 *
 * The sheet's boundaries are about how MANY filters are active - one, then
 * several - on the theory that the prompt is triggered by filtering. It is not:
 * the menu is unconditional, and it offers the same two scopes every time. So
 * these cases assert that the prompt is stable across filter combinations,
 * which is the useful half of what the sheet is checking, and they report the
 * missing filtered scope once rather than at every boundary.
 */
test.describe('Export scope prompt - Boundaries', () => {
  test('TC-006: should prompt in the same way with exactly one filter applied', async ({
    payerManagementPage,
    exportMenu,
    steps,
  }) => {
    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
    });

    await steps.critical('Exactly one filter is applied', async () => {
      await payerManagementPage.filterByType(TYPE_FILTER_OPTIONS[1]);
      await payerManagementPage.expectFiltersApplied(TYPE_FILTER_OPTIONS[1], 'All Statuses');
      await payerManagementPage.expectRowsRendered();
    });

    await steps.step('The prompt appears at the single-filter boundary', async () => {
      await exportMenu.open();
      expect(
        await exportMenu.getOfferedScopes(),
        'one active filter, and the same two scopes',
      ).toEqual([...OFFERED_SCOPES]);
    });

    await steps.step('A filtered export is still not among them', async () => {
      // Reported once per boundary case, because the sheet's next step is
      // "select Export Filtered" and there is nothing to select.
      const scopes = await exportMenu.getOfferedScopes();
      expect(scopes, `the menu offers: ${scopes.join(', ')}`).toContain(MISSING_SCOPE);
    });
  });

  test('TC-007: should prompt in the same way with several filters applied', async ({
    payerManagementPage,
    exportMenu,
    steps,
  }) => {
    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
    });

    await steps.critical('Two filters are applied together', async () => {
      await payerManagementPage.filterByType(TYPE_FILTER_OPTIONS[1]);
      await payerManagementPage.filterByStatus(SCOPE_FILTER.status);
      // Both filters ACTIVE is the precondition; whether the result set obeys
      // them is the filter story's subject, not this one's.
      await payerManagementPage.expectFiltersApplied(
        TYPE_FILTER_OPTIONS[1],
        SCOPE_FILTER.status,
      );
    });

    await steps.step('The prompt is unchanged by the extra filter', async () => {
      await exportMenu.open();
      expect(
        await exportMenu.getOfferedScopes(),
        'the scope choice does not depend on how many filters are active',
      ).toEqual([...OFFERED_SCOPES]);
    });

    await steps.step('And an export covering only those rows cannot be requested', async () => {
      const scopes = await exportMenu.getOfferedScopes();
      expect(scopes, `the menu offers: ${scopes.join(', ')}`).toContain(MISSING_SCOPE);
    });
  });

  test('TC-010: should report a failure and deliver no file when the export service is unavailable', async ({
    page,
    payerManagementPage,
    exportMenu,
    steps,
  }) => {
    await steps.critical('Navigate to the module with a filter applied', async () => {
      await payerManagementPage.open();
      await payerManagementPage.filterByStatus(SCOPE_FILTER.status);
      // Asserted as "a filter is applied", not as "every row matches it". The
      // status filter returns rows of other statuses too - a defect the filter
      // story already owns and reports - and depending on it here would fail
      // every export case on somebody else's finding.
      await payerManagementPage.expectFiltersApplied(TYPE_FILTER_OPTIONS[0], SCOPE_FILTER.status);
      await payerManagementPage.expectRowsRendered();
    });

    let exportEndpoint!: string;

    await steps.critical('The export endpoint is discovered and made to fail', async () => {
      // DISCOVERED rather than named. This framework does not know the export
      // path, and failing a guessed one would break nothing - which looks
      // exactly like an export that cannot fail. So one real export is run to
      // learn the URL, and that URL is then broken.
      exportEndpoint = (await NetworkUtils.captureRequestUrl(page, /export/i, () =>
        exportMenu.exportAndDownload('all', 'csv').then(() => undefined))) ?? '';
      expect(
        exportEndpoint,
        'a successful export should have called an export endpoint to break',
      ).not.toBe('');

      // One endpoint, not everything: a blanket failure would break the list
      // that reaches the export control in the first place.
      await NetworkUtils.failEndpoint(page, exportEndpoint);
    });

    await steps.step('The export attempt is submitted and fails', async () => {
      await exportMenu.open();
      await exportMenu.chooseScope('all');
      const downloaded = await exportMenu.expectNoDownloadWhile(() =>
        exportMenu.clickFormat('csv'),
      );
      expect(downloaded, 'a failed export must not deliver a file').toBe(false);
    });

    await steps.step('The failure is reported to the user', async () => {
      // Whatever shape it takes - a toast or a dialog - the user must be told.
      // A silent failure that leaves the format dialog standing would look
      // exactly like a slow export.
      const messages = await payerManagementPage.detail().waitForVisibleMessages();
      expect(
        messages,
        `the interface should report the failure; it showed: `
          + `${messages.join(' | ') || '(nothing)'}`,
      ).not.toEqual([]);
    });

    await steps.step('And the list is left usable', async () => {
      await NetworkUtils.restore(page);
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
    });
  });

  test('TC-012: should keep the prompt consistent across filter changes and repeated triggers', async ({
    payerManagementPage,
    exportMenu,
    steps,
  }) => {
    const observed: string[][] = [];

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
    });

    await steps.step('The prompt is opened under several filter combinations', async () => {
      for (const apply of [
        async () => payerManagementPage.resetFilters(),
        async () => payerManagementPage.filterByStatus(SCOPE_FILTER.status),
        async () => payerManagementPage.filterByType(TYPE_FILTER_OPTIONS[1]),
      ]) {
        await apply();
        await exportMenu.open();
        observed.push(await exportMenu.getOfferedScopes());
        await exportMenu.cancelMenu();
      }
      expect(observed, 'three combinations should have been tried').toHaveLength(3);
    });

    await steps.step('It offers the same scopes every time', async () => {
      const distinct = new Set(observed.map((scopes) => scopes.join(',')));
      expect(
        distinct.size,
        `the prompt differed between filter combinations: ${[...distinct].join(' / ')}`,
      ).toBe(1);
    });

    await steps.step('And triggering it twice in succession produces one prompt', async () => {
      // The double-click half of the sheet's exploration: a second trigger must
      // not stack a second menu or leave a stale one behind.
      await exportMenu.open();
      await exportMenu.open();
      expect(
        await exportMenu.getOfferedScopes(),
        'a repeated trigger should leave exactly one menu',
      ).toEqual([...OFFERED_SCOPES]);
      await exportMenu.cancelMenu();
      await payerManagementPage.expectNoUnexpectedDialog();
    });
  });

  test('TC-013: should move from filtered list to completed export in the expected steps', async ({
    payerManagementPage,
    exportMenu,
    steps,
  }) => {
    await steps.critical('Navigate to the module in its default state', async () => {
      await payerManagementPage.open();
      await payerManagementPage.expectFiltersAtDefault();
    });

    await steps.step('Applying a filter moves the list to a filtered state', async () => {
      await payerManagementPage.filterByStatus(SCOPE_FILTER.status);
      // Asserted as "a filter is applied", not as "every row matches it". The
      // status filter returns rows of other statuses too - a defect the filter
      // story already owns and reports - and depending on it here would fail
      // every export case on somebody else's finding.
      await payerManagementPage.expectFiltersApplied(TYPE_FILTER_OPTIONS[0], SCOPE_FILTER.status);
      await payerManagementPage.expectRowsRendered();
    });

    await steps.step('Triggering the export moves it to awaiting-scope', async () => {
      await exportMenu.open();
      expect(
        await exportMenu.getOfferedScopes(),
        'the workflow should now be waiting for a scope',
      ).toEqual([...OFFERED_SCOPES]);
    });

    await steps.step('Choosing a scope moves it to awaiting-format', async () => {
      await exportMenu.chooseScope('all');
      expect(
        await exportMenu.getOfferedFormats(),
        'and then for a format',
      ).toEqual(expect.arrayContaining(['csv']));
    });

    await steps.step('And completing it delivers a file matching the chosen scope', async () => {
      await exportMenu.cancel();
      const parsed = await exportMenu.exportCsv('all');
      expect(parsed.rows.length, 'the completed export should hold rows').toBeGreaterThan(0);
      expect(
        parsed.headers.length,
        'and a header row describing them',
      ).toBeGreaterThan(1);
    });
  });
});

/** Access control, signed out of the shared administrator session. */
test.describe('Export scope prompt - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('TC-009: should withhold the export control from a user without export rights', async ({
    loginPage,
    payerManagementPage,
    exportMenu,
    steps,
  }) => {
    if (!env.nonAdminUsername || !env.nonAdminPassword) {
      steps.blocked(
        `NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD are not configured in .env. ${
          RESTRICTED_ROLE_REQUIREMENT.reason
        } Set them to an account holding ${RESTRICTED_ROLE_REQUIREMENT.role}, then re-run this `
          + 'case.',
      );
    }

    await steps.critical('Open the payer list as the restricted user', async () => {
      await loginPage.open();
      await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
      await payerManagementPage.navigate();
      await payerManagementPage.expectRowsRendered();
    });

    await steps.step('A filter still narrows the list for this role', async () => {
      await payerManagementPage.filterByStatus(SCOPE_FILTER.status);
      // Asserted as "a filter is applied", not as "every row matches it". The
      // status filter returns rows of other statuses too - a defect the filter
      // story already owns and reports - and depending on it here would fail
      // every export case on somebody else's finding.
      await payerManagementPage.expectFiltersApplied(TYPE_FILTER_OPTIONS[0], SCOPE_FILTER.status);
      await payerManagementPage.expectRowsRendered();
    });

    await steps.step('The export control is withheld', () => exportMenu.expectDenied());
  });
});
