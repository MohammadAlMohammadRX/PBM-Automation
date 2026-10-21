import { test, expect } from '../../../fixtures';
import { Logger } from '../../../utils/Logger';
import { findPayer } from '../../../utils/PayerFinder';
import { REFERENCE_PAYERS } from '../../../data/payers/referencePayers.data';
import type { ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';
import type { PayerDetailPage } from '../../../pages/payer/PayerDetailPage';
import { UNMODIFIED_INDICATORS } from '../../../data/payers/overviewMetadata.data';
import { EMPTY_STATE_PATTERN } from '../../../data/payers/linkedPolicies.data';
import { NON_ADMIN_PROFILE } from '../../../data/accounts/nonAdminAccount.data';
import {
  ACTION_WITHHELD_FROM_PAYER_ADMIN,
  ATTRIBUTE_FORMAT,
  DETAIL_TAB_LABELS,
  OVERVIEW_LABELS,
  RAPID_TAB_CYCLES,
} from '../../../data/payers/detailsTabs.data';

/**
 * User story: View Comprehensive Payer Details with Tabs.
 *
 * The detail view as a whole: a read-only, complete Overview; empty states on
 * the linked sections; nothing lost when switching tabs; a consistent view
 * after rapid switching and browser navigation. Cases needing policies,
 * pagination or other roles are BLOCKED on those resources.
 */
const isBlank = (value: string): boolean =>
  value.trim() === '' || UNMODIFIED_INDICATORS.includes(value.trim() as (typeof UNMODIFIED_INDICATORS)[number]);

/** Visits every tab once, ending on the Overview. */
async function cycleTabs(detail: PayerDetailPage): Promise<void> {
  await detail.openLinkedNetworks();
  await detail.openLinkedPolicies();
  await detail.versionHistory().open();
  await detail.openAuditHistory();
  await detail.openOverview('Payer Code');
}

test.describe('Comprehensive payer details', () => {
  // Azure test case 14638
  test('14638: should show every Overview attribute as a read-only field', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and open the payer\'s details', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.waitForLoaded();
    });

    await steps.step('The Overview carries no editable control', async () => {
      const detail = payerManagementPage.detail();
      expect(await detail.isOverviewReadOnly(), 'the Overview must be read-only').toBe(true);
      for (const label of OVERVIEW_LABELS) {
        expect(await detail.getFieldValue(label), `"${label}" should be displayed`).not.toBe('');
      }
    });
  });

  // Azure test case 14637
  test('14637: should list the assigned networks with their management actions on the Linked Networks tab', async ({
    payerManagementPage,
    linkedNetwork,
    steps,
  }) => {
    let network = '';

    await steps.critical('Navigate to the module and open a payer that holds a network', async () => {
      const candidate = await linkedNetwork('any');
      network = candidate.network;
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(candidate.payer);
      expect((await detail.getLinkedNetworkRows()).map((r) => r.name), 'the linked network should be listed').toContain(network);
    });

    await steps.step('Each network row offers its action and the tab offers Assign', async () => {
      const detail = payerManagementPage.detail();
      const actions = await detail.getLinkedNetworkActions(network);
      expect(actions.length, `"${network}" should offer a management action; it offers: ${actions.join(', ')}`).toBeGreaterThan(0);
      expect(await detail.getAssignNetworkAvailability(), 'Assign Network should be offered').toBe('available');
    });
  });

  // Azure test case 14646
  test('14646: should show empty states on the Linked Networks and Linked Policies tabs when nothing is linked', async ({
    page,
    payerManagementPage,
    steps,
  }) => {
    // NOT a freshly published payer (changed 2026-10-11, note N-033): since
    // 2026-09-27 approval requires a network, so every published payer holds
    // one. A payer with nothing linked is a never-approved one - the QA lead's
    // reference is "National Health Fund 1791110252437"; any payer of the same
    // shape will do if that one is gone.
    let subject = '';
    await steps.critical('Navigate to the module and open a payer with nothing linked', async () => {
      await payerManagementPage.open();
      const found = await findPayer(
        page,
        (p) => p.linkedNetworksCount === 0 && p.linkedPoliciesCount === 0,
        'a payer with no network and no policy',
        [REFERENCE_PAYERS.noNetwork.name],
      );
      if (!found) steps.blocked('no payer in the register holds neither a network nor a policy');
      subject = found!.payerNameEn;
      await payerManagementPage.search(subject);
      const detail = await payerManagementPage.openDetails(subject);
      expect(await detail.linkedNetworkCount(), `"${subject}" should hold no networks`).toBe(0);
    });

    await steps.step('The Linked Networks tab renders its section rather than breaking', async () => {
      const detail = payerManagementPage.detail();
      expect(await detail.getLinkedNetworksHintText(), 'the section should still explain itself').not.toBe('');
      expect(await detail.getAssignNetworkAvailability(), 'and still offer Assign').toBe('available');
    });

    await steps.step('The Linked Policies tab shows its empty state', async () => {
      const section = await payerManagementPage.detail().getLinkedPoliciesSection();
      expect(EMPTY_STATE_PATTERN.test(section.text), `an empty-state message should show; it read "${section.text}"`).toBe(true);
    });
  });

  // Azure test case 14650
  test('14650: should preserve each tab\'s data when switching between tabs', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    let licence = '';
    let networks = 0;

    await steps.critical('Navigate to the module and read the Overview and Linked Networks', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      licence = await detail.getFieldValue('License Number');
      networks = await detail.linkedNetworkCount();
      expect(licence).not.toBe('');
    });

    await steps.step('After visiting every tab, the Overview and Linked Networks read the same', async () => {
      const detail = payerManagementPage.detail();
      await cycleTabs(detail);
      expect(await detail.getFieldValue('License Number'), 'the Overview should be intact').toBe(licence);
      expect(await detail.linkedNetworkCount(), 'the Linked Networks should be intact').toBe(networks);
    });
  });

  // Azure test case 14658
  test('14658: should keep a consistent view through rapid tab switching and browser navigation', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();
    let licence = '';

    await steps.critical('Navigate to the module and open the payer\'s details', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      licence = await detail.getFieldValue('License Number');
      expect(licence).not.toBe('');
    });

    await steps.step('Rapid switching leaves the Overview intact', async () => {
      const detail = payerManagementPage.detail();
      for (let cycle = 0; cycle < RAPID_TAB_CYCLES; cycle += 1) await cycleTabs(detail);
      expect(await detail.getFieldValue('License Number')).toBe(licence);
    });

    await steps.step('Browser back returns to the list and forward restores the details', async () => {
      await payerManagementPage.goBack();
      await payerManagementPage.expectRowsRendered();
      await payerManagementPage.goForward();
      await payerManagementPage.detail().waitForLoaded();
      expect(await payerManagementPage.detail().getFieldValue('License Number')).toBe(licence);
    });
  });

  // Azure test case 14644
  test('14644: should present every required Overview attribute, labelled and formatted', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and open a fully populated payer', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      await detail.waitForLoaded();
    });

    await steps.step('Each attribute is present and correctly formatted', async () => {
      const detail = payerManagementPage.detail();
      for (const label of OVERVIEW_LABELS) {
        const value = await detail.getFieldValue(label);
        expect(isBlank(value), `"${label}" should be populated; it read "${value}"`).toBe(false);
        const format = ATTRIBUTE_FORMAT[label];
        expect(format === undefined || format.test(value), `"${label}" should be formatted as expected; it read "${value}"`).toBe(true);
      }
    });
  });

  // ---- the withheld half, on a role shaped for this case -------------------
  // This used to report BLOCKED: the one non-administrator credential in this
  // environment HOLDS the permission whose absence the case is about. The
  // account is now BUILT - the administrator takes the permission off the
  // shared "Payer Admin" role, the case signs in as it, and the permission
  // goes back when the case ends.

  // Azure test case 14654
  test('14654: should deny the Payer Details view to a user without Payer Management view permission', async ({ shapedNonAdmin, steps }) => {
    let session!: ShapedSession;

    await steps.critical('Sign in as a user without View Payer Details', async () => {
      session = await shapedNonAdmin({ without: ['viewPayerDetails'] });
      await session.payers.navigate();
      await session.payers.expectRowsRendered();
    });

    await steps.step('The payer record is not reachable by this role', async () => {
      // Two refusals are acceptable and they are not the same: the row may
      // withhold the route, or the page may refuse the record. Only a rendered
      // record is a failure.
      const route = await session.payers.getRowActionAvailability(NON_ADMIN_PROFILE.scopedPayers[0], 'view');
      if (route !== 'available') return;

      const detail = await session.payers.openDetails(NON_ADMIN_PROFILE.scopedPayers[0]);
      expect(
        (await detail.getTabOrder()).length,
        'a role without View Payer Details should not be shown the tabbed record',
      ).toBe(0);
    });
  });
  // Azure test case 14645
  test('14645: should show an empty state on Linked Networks when the payer has none', async ({
    payerManagementPage,
    draftPayer,
    steps,
  }) => {
    let detail!: PayerDetailPage;

    // A payer created in this run owns nothing, which is exactly the state the
    // case needs - and it is built rather than searched for, so the assertion
    // cannot be satisfied by a payer that merely happens to have no networks.
    await steps.critical('Open a payer that owns no networks', async () => {
      await payerManagementPage.open();
      detail = await payerManagementPage.openDetails(draftPayer.nameEn);
      await detail.waitForLoaded();
    });

    await steps.step('The Linked Networks tab says so rather than showing an empty table', async () => {
      await detail.openLinkedNetworks().catch(() => undefined);
      const rows = await detail.getLinkedNetworkRows().catch(() => []);
      expect(rows, 'a payer with no networks should list none').toHaveLength(0);

      const text = (await detail.getLinkedNetworksHintText().catch(() => '')).trim();
      expect(
        text,
        'an empty tab should explain itself; a bare empty table reads as a loading failure',
      ).not.toBe('');
    });
  });

  // Azure test case 14653
  test('14653: should fail clearly when the payer is removed while its details are open', async ({
    payerManagementPage,
    draftPayer,
    steps,
  }) => {
    let payerId = '';

    await steps.critical('Open the payer and note the record it is showing', async () => {
      await payerManagementPage.open();
      payerId = await payerManagementPage.getPayerIdFromDetailUrl(draftPayer.nameEn);
      expect(payerId, 'the detail screen should be showing a record').not.toBe('');
    });

    // Deleted from under the open screen, then revisited by its own URL - which
    // is what "viewed concurrently" comes down to for a single session. The
    // screen must say the record is gone; rendering a shell of a payer that no
    // longer exists is the failure.
    await steps.step('Once it is deleted, its detail URL reports the record as gone', async () => {
      await payerManagementPage.open();
      await payerManagementPage.deletePayer(draftPayer.nameEn);
      await payerManagementPage.openPayerById(payerId);
      await payerManagementPage.expectRecordNotFound();
    });
  });

  // Azure test case 14660
  test('14660: should show each linked policy\'s status consistently with its expiry', async ({
    steps,
  }) => {
    // The comparison needs a payer owning at least one expired and one active
    // policy, and no payer in this environment owns a policy at all - the
    // Policies module that would create one is outside this framework. Left
    // BLOCKED rather than run against an empty tab, which would pass without
    // ever reading a status.
    steps.blocked(
      'This case needs a payer owning both an active and an expired policy so the Status column '
      + 'can be checked against each policy\'s expiry date. No payer in this environment owns a '
      + 'policy; the Policies module is outside this framework. Provide one and re-run - the '
      + 'readers for the tab already exist.',
    );
  });

  // Azure test case 14639
  //
  // WRITTEN 2026-10-13 (QA lead: check it on a payer that has at least one
  // policy). Located across the whole register by GetPayers, payer number 2
  // preferred; read-only. The acceptance criteria do not list the REQUIRED
  // columns (open question, 14954), so the columns found are recorded and every
  // one is held to being populated; "accurate" is checked against the policy's
  // own record in the Policies module.
  test('14639: should show the required columns with accurate data on the Linked Policies tab', async ({
    page,
    payerManagementPage,
    policyManagementPage,
    steps,
  }) => {
    test.slow();
    let payer = '';
    let rows: Array<Record<string, string>> = [];

    await steps.critical('Find a payer that owns at least one policy and open its Linked Policies tab', async () => {
      const found = await findPayer(page, (p) => Number(p.linkedPoliciesCount) > 0, 'a payer with at least one policy', [REFERENCE_PAYERS.payerNumber2.name]);
      if (!found) steps.blocked('No payer in the register owns a policy.');
      payer = found!.payerNameEn;
      await payerManagementPage.open();
      await payerManagementPage.search(found!.payerCode || payer);
      rows = await (await payerManagementPage.openDetails(found!.payerCode || payer)).getLinkedPolicyRows();
      expect(rows.length, `"${payer}" should list its ${found!.linkedPoliciesCount} polic(ies)`).toBe(Number(found!.linkedPoliciesCount));
    });

    await steps.step('Every column of every row carries a value', async () => {
      const blanks = rows.flatMap((row, i) => Object.entries(row)
        .filter(([, value]) => value === '' || /^[-–—]$|^N\/A$/i.test(value))
        .map(([column, value]) => `row ${i + 1} "${column}" = "${value}"`));
      expect(blanks, `columns shown: ${Object.keys(rows[0] ?? {}).join(', ')}`).toEqual([]);
    });

    await steps.step('Each policy\'s name and status match its record in the Policies module', async () => {
      const nameOf = (row: Record<string, string>) => Object.entries(row).find(([h]) => /name/i.test(h) && !/plan/i.test(h))?.[1] ?? '';
      const statusOf = (row: Record<string, string>) => Object.entries(row).find(([h]) => /status/i.test(h))?.[1] ?? '';
      const records = await policyManagementPage.getPoliciesOfPayer(payer);
      const mismatches: string[] = [];
      for (const row of rows) {
        const record = records.find((r) => r.name.trim() === nameOf(row).trim());
        if (!record) { mismatches.push(`"${nameOf(row)}" is not in the Policies module for "${payer}"`); continue; }
        if (record.status.trim() !== statusOf(row).trim()) mismatches.push(`"${nameOf(row)}": ${statusOf(row)} on the payer, ${record.status} in the Policies module`);
      }
      expect(mismatches, `Policies module rows for "${payer}": ${JSON.stringify(records)}`).toEqual([]);
    });
  });
});

/**
 * Added by change sheet 2026-09-27/28: the Network Assignment tab as a VIEW of
 * the Network Management module rather than a copy of it.
 *
 * WHY THIS CASE WAS REWRITTEN. 14661 was matched during the original mapping
 * exercise to a generated BLOCKED case about the Linked POLICIES tab, blocked
 * because the Policies module is outside this framework. The sheet's 14661 is
 * about the Linked NETWORKS tab and the NETWORK Management module - a
 * different tab and a different module, and one this suite does drive. The old
 * match was simply wrong, and the reason it gave for being blocked did not
 * apply to it.
 */
test.describe('Comprehensive payer details - the networks tab reads the network module', () => {
  // Azure test case 14661
  test('14661: should show each linked network as the Network Management module holds it', async ({
    payerManagementPage,
    networkManagementPage,
    linkedNetwork,
    steps,
  }, testInfo) => {
    test.slow();

    let candidate!: Awaited<ReturnType<typeof linkedNetwork>>;
    let onTab = { name: '', status: '' };
    let inModule = { name: '', status: '' };

    await steps.critical('Find a payer holding a settled network link', async () => {
      candidate = await linkedNetwork('settled');
      expect(candidate.network, 'the fixture should name the linked network').not.toBe('');
    });

    await steps.critical('Read the network as the payer\'s tab shows it', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(candidate.payer);
      await detail.openLinkedNetworks();
      const rows = await detail.getLinkedNetworkRows();
      const row = rows.find((entry) => entry.name.trim() === candidate.network.trim());
      expect(
        row,
        `the payer "${candidate.payer}" should still list "${candidate.network}"; its tab shows `
          + `${rows.map((entry) => entry.name).join(', ') || '(nothing)'}`,
      ).toBeDefined();
      onTab = { name: row!.name.trim(), status: row!.status.trim() };
    });

    await steps.critical('Read the same network in the Network Management module', async () => {
      // SEARCHED, with the payer in scope (2026-10-11): the list opens on ~600
      // newer seed networks, and a page scan never reached this one.
      const entry = await networkManagementPage.findNetworkRow(candidate.network, candidate.payer);
      expect(
        entry,
        `the Network Management module should hold "${candidate.network}" (searched with "${candidate.payer}" in scope)`,
      ).not.toBeNull();
      inModule = { name: entry!.network.trim(), status: entry!.status.trim() };
    });

    // THE INTEGRATION THIS CASE IS ABOUT. The tab must be a view of the network
    // module, not a copy taken when the link was made: a payer showing a
    // network as Active that the module retired weeks ago would be read as
    // current by everyone who opens it.
    await steps.step('The two agree on the network\'s name and status', async () => {
      expect(
        onTab.name,
        `the tab and the module should name the same network; tab "${onTab.name}", `
          + `module "${inModule.name}"`,
      ).toBe(inModule.name);
      expect(
        onTab.status,
        `the tab shows "${candidate.network}" as "${onTab.status}" while the Network Management `
          + `module holds it as "${inModule.status}" - the tab is not reflecting the module`,
      ).toBe(inModule.status);
    });

    // PARTIAL, AND SAYING SO. The sheet's steps 3 and 4 change the network's
    // name or status in the Network Management module and re-read the tab.
    // That cannot be done here: every network in this environment belongs to a
    // payer already (see NEEDS_FREE_NETWORK), so the only network available to
    // mutate is one another case depends on - and taking a shared record's
    // state away is a mistake this suite has made once and will not repeat.
    // The agreement above is the strongest evidence obtainable without one.
    await steps.step('And the live-update half is recorded as not exercised', async () => {
      const notExercised =
        'Steps 3-4 of this case change the network in the Network Management module and re-read '
        + 'the tab. They are not exercised: this environment has no disposable network, so the '
        + 'change would have to be made to a shared record other cases sample. Provide one free '
        + 'network and those steps can be added here.';
      Logger.warn(notExercised);
      testInfo.annotations.push({ type: 'partial-coverage', description: notExercised });
      expect(notExercised.length, 'the limitation is recorded on the result').toBeGreaterThan(0);
    });
  });
});
