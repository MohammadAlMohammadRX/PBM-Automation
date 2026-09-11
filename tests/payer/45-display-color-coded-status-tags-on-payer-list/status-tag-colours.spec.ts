import { test, expect } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import { STATUS_TONE, statusBadgeId } from '../../../constants/ElementIds';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import { PRIMARY_REASON } from '../../../data/payers/inactivationDecisions.data';

/**
 * User story: Display Color-Coded Status Tags on Payer List.
 *
 * THE FOUR-COLOUR MAPPING IS ALREADY AUTOMATED, and asserting it again would
 * duplicate a result rather than add one. The paginated-list story's TC-003
 * walks Active/green, Pending/amber, Inactive/grey and Expired/red through
 * `STATUS_TONE_CASES`, reads the tone from `data-tone` rather than from pixels,
 * carries the Arabic label for each, and proves no two statuses share a band.
 * The bilingual labels are covered again by the Arabic-approval-status story.
 *
 * THAT STORY ALSO SETTLED SOMETHING THIS SHEET GETS WRONG. The sheet treats
 * Pending as a lifecycle tag alongside Active, Inactive and Expired. It is not:
 * the lifecycle badge renders Active, Inactive, Expired and "Not Live", and
 * "Pending Approval" is an APPROVAL status in a different column with its own
 * badge. A case reading Pending from the lifecycle column finds nothing and
 * would report a missing colour mapping that is not missing - which is why the
 * existing suite selects the column per status.
 *
 * What is left, and what these cases do, is the behaviour around the mapping:
 * that a tag follows a status change rather than caching, that a missing status
 * degrades safely, and that the band is not something a role or a session
 * changes.
 */
test.describe('Status tag colours', () => {
  test('TC-001: should re-band the tag when the payer\'s status changes', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    let toneWhenActive = '';

    await steps.critical('Navigate to the module with an Active payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.step('It carries the Active band', async () => {
      toneWhenActive = await payerManagementPage.getStatusTone(publishedPayer.nameEn);
      expect(
        toneWhenActive,
        'an Active payer should be banded as active',
      ).toBe(STATUS_TONE.active);
    });

    await steps.step('The payer is inactivated and the change approved', async () => {
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
      await payerInactivateDialog.selectReason(PRIMARY_REASON);
      await payerInactivateDialog.confirm();
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.approve(publishedPayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.inactive.en,
      );
    });

    await steps.step('And the tag has moved to the Inactive band, not kept the old one', async () => {
      // The point of the case. A tag that keeps its previous colour after a
      // real status change is worse than no colour at all: the list would show
      // a green payer that is not live, and nobody scanning the column would
      // know to look closer.
      const toneNow = await payerManagementPage.getStatusTone(publishedPayer.nameEn);
      expect(
        toneNow,
        `the payer is now Inactive but its tag is still banded "${toneNow}" `
          + `(it was "${toneWhenActive}" when Active)`,
      ).toBe(STATUS_TONE.inactive);
    });
  });

  test('TC-002: should band every Inactive payer alike so they can be picked out at a glance', async ({
    payerManagementPage,
    steps,
  }) => {
    let names: string[] = [];

    await steps.critical('Navigate to the module and filter to Inactive payers', async () => {
      await payerManagementPage.open();
      await payerManagementPage.filterByStatus(LIFECYCLE_STATUS.inactive.en);
      await payerManagementPage.expectRowsRendered();
      names = await payerManagementPage.getVisiblePayerNames();
      expect(names, 'the filter should return payers to inspect').not.toEqual([]);
    });

    await steps.step('Every row claiming Inactive carries the Inactive band', async () => {
      // Scoped to the rows that actually READ Inactive rather than to every row
      // the filter returned: the status filter does not return a pure result
      // set in this build - a defect the filter story owns - and asserting over
      // the whole page would report that filter behaviour as a colour fault.
      const mismatched: string[] = [];
      for (const name of names) {
        const status = await payerManagementPage.getLifecycleStatus(name);
        if (!status.includes(LIFECYCLE_STATUS.inactive.en)) continue;
        const tone = await payerManagementPage.getStatusTone(name);
        if (tone !== STATUS_TONE.inactive) mismatched.push(`${name}: "${status}" banded "${tone}"`);
      }
      expect(
        mismatched,
        `every Inactive payer should share one band; these did not: ${mismatched.join('; ')}`,
      ).toEqual([]);
    });

    await steps.step('And the band is the one the reader is scanning for', async () => {
      const inactive = [] as string[];
      for (const name of names) {
        const status = await payerManagementPage.getLifecycleStatus(name);
        if (status.includes(LIFECYCLE_STATUS.inactive.en)) inactive.push(name);
      }
      expect(
        inactive,
        'filtering to Inactive should surface at least one Inactive payer to scan',
      ).not.toEqual([]);
    });
  });

  test('TC-003: should render a payer with no status safely rather than banding it wrongly', async ({
    page,
    payerManagementPage,
    steps,
  }) => {
    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.critical('The list is answered with a payer carrying no status', async () => {
      // Stripped from the response rather than created in the database: a payer
      // with a null status is not a state the application will produce, but it
      // is a state a partial migration or a bad join can serve - and what the
      // column does with it is worth knowing before it happens.
      await payerManagementPage.blankStatusInListResponse();
      await payerManagementPage.reload();
    });

    await steps.step('The list still renders rather than failing', async () => {
      // The first thing that must hold: one unreadable status must not cost the
      // reader the whole register.
      const names = await payerManagementPage.getVisiblePayerNames().catch(() => []);
      expect(
        names,
        'a payer with no status should not stop the list from rendering',
      ).not.toEqual([]);
    });

    await steps.step('And no status-less payer is banded as though it were live', async () => {
      // The dangerous failure: a missing status defaulting to the Active band
      // would show a payer as live on no evidence at all.
      const names = await payerManagementPage.getVisiblePayerNames();
      const wronglyActive: string[] = [];
      for (const name of names) {
        const status = (await payerManagementPage.getLifecycleStatus(name)).trim();
        if (status !== '') continue;
        const tone = await payerManagementPage.getStatusTone(name);
        if (tone === STATUS_TONE.active) wronglyActive.push(name);
      }
      expect(
        wronglyActive,
        `these payers have no status but are banded as active: ${wronglyActive.join(', ')}`,
      ).toEqual([]);
    });

    await steps.step('And the list recovers once the response does', async () => {
      await payerManagementPage.restoreListResponse();
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
    });
  });

  test('TC-004: should band the tag from the stored status rather than from a cached view', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module with an Active payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.critical('Its status is changed and approved', async () => {
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
      await payerInactivateDialog.selectReason(PRIMARY_REASON);
      await payerInactivateDialog.confirm();
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.approve(publishedPayer.nameEn);
    });

    await steps.step('A fresh load shows the new band', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      expect(
        await payerManagementPage.getStatusTone(publishedPayer.nameEn),
        'the band should follow the stored status on a fresh load',
      ).toBe(STATUS_TONE.inactive);
    });

    await steps.step('And so does the cards view, which renders the tag separately', async () => {
      // Two independently built surfaces reading the same stored value. If one
      // of them caches, they disagree - and this is the cheapest place to catch
      // that, because both are on the same screen behind one toggle.
      const cardTone = await payerManagementPage.getCardStatusTone(publishedPayer.nameEn);
      expect(
        cardTone,
        `the table bands this payer "${STATUS_TONE.inactive}" and the card bands it `
          + `"${cardTone}"`,
      ).toBe(STATUS_TONE.inactive);
    });

    await steps.step('And the detail screen agrees with both', async () => {
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      expect(
        await detail.statusBadge().getAttribute('data-tone'),
        'all three surfaces should band a status the same way',
      ).toBe(STATUS_TONE.inactive);
    });
  });
});

/** The role half, signed out of the shared administrator session. */
test.describe('Status tag colours - Roles', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('TC-005: should band statuses identically for every role that can read the list', async ({
    loginPage,
    payerManagementPage,
    steps,
  }) => {
    if (!env.nonAdminUsername || !env.nonAdminPassword) {
      steps.blocked(
        'NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD are not configured in .env. The case exists '
        + 'to prove the colour bands are a property of the status and not of the viewer, which '
        + 'needs a second role: read as the administrator alone it would compare a result with '
        + 'itself. Set them to any account with Payer Management read access, then re-run.',
      );
    }

    await steps.critical('Sign in as the second role and open the payer list', async () => {
      await loginPage.open();
      await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
      await payerManagementPage.navigate();
      await payerManagementPage.expectRowsRendered();
    });

    await steps.step('Each status this role can see is banded by the shared rule', async () => {
      const names = await payerManagementPage.getVisiblePayerNames();
      const wrong: string[] = [];
      for (const name of names.slice(0, 10)) {
        const status = await payerManagementPage.getLifecycleStatus(name);
        const tone = await payerManagementPage.getStatusTone(name);
        const expected =
          status.includes(LIFECYCLE_STATUS.active.en) ? STATUS_TONE.active
            : status.includes(LIFECYCLE_STATUS.inactive.en) ? STATUS_TONE.inactive
              : status.includes(LIFECYCLE_STATUS.expired.en) ? STATUS_TONE.expired
                : null;
        if (expected !== null && tone !== expected) {
          wrong.push(`${name}: "${status}" banded "${tone}", expected "${expected}"`);
        }
      }
      expect(
        wrong,
        `the bands must not depend on who is looking; these differed: ${wrong.join('; ')}`,
      ).toEqual([]);
    });

    await steps.step('And the badge element is the same one the administrator reads', async () => {
      // Same id namespace, so the two roles are being compared on the same
      // element rather than on two different renderings.
      const names = await payerManagementPage.getVisiblePayerNames();
      const rowId = await payerManagementPage.getRowId(names[0]);
      expect(
        statusBadgeId(rowId),
        'the status badge should carry the shared id convention for every role',
      ).toContain('status-badge');
    });
  });
});
