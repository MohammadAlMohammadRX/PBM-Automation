import { test, expect } from '../../../fixtures';
import { azureOrCase } from '../../../data/azureTestIds.data';
import type { ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';
import { NON_ADMIN_PROFILE } from '../../../data/accounts/nonAdminAccount.data';
import type { LinkedNetworkCandidate } from '../../../fixtures/networkLinkState.fixture';
import {
  BLOCKED_CASES,
  CONSISTENCY_SAMPLE,
  PLACEHOLDER_PATTERN,
  WHOLE_NUMBER,
  ZERO_FACILITIES,
} from '../../../data/payers/facilityCount.data';

/**
 * User story: Show Real Facility Count per Linked Network.
 *
 * The Facilities column of the payer's Linked Networks table is compared with
 * the Network list's own Facilities column for the same network - the second
 * source that makes "real" mean something. Candidates are DISCOVERED from the
 * links the register holds; every linked network here carries zero facilities,
 * so the above-zero classes report what was found.
 */
test.describe('Facility count per linked network', () => {
  // Azure test case 15819
  test('15819: should show the real facility count when a linked network has several facilities', async ({
    payerManagementPage,
    linkedNetwork,
    steps,
  }) => {
    let candidate!: LinkedNetworkCandidate;

    await steps.critical('Navigate to the module and find a linked network with several facilities', async () => {
      candidate = await linkedNetwork('withFacilities');
      expect(Number(candidate.facilitiesOnList), 'the network should carry more than one facility').toBeGreaterThan(1);
    });

    await steps.step('The payer\'s Linked Networks tab shows the same count', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(candidate.payer);
      const row = (await detail.getLinkedNetworkRows()).find((linked) => linked.name === candidate.network);
      expect(row?.facilities, `"${candidate.network}" should show ${candidate.facilitiesOnList} facilities`)
        .toBe(candidate.facilitiesOnList);
    });
  });

  // Azure test case 15820
  test('15820: should show "0" rather than a placeholder when a linked network has no facilities', async ({
    payerManagementPage,
    linkedNetwork,
    steps,
  }) => {
    let candidate!: LinkedNetworkCandidate;

    await steps.critical('Navigate to the module and find a linked network with no facilities', async () => {
      candidate = await linkedNetwork('zeroFacilities');
      expect(candidate.facilitiesOnList, 'the Network list should show zero for it').toBe(ZERO_FACILITIES);
    });

    await steps.step('The Linked Networks tab shows an explicit zero', async () => {
      // A real count of nothing is "0". A dash, a blank or "N/A" would leave
      // the reader unable to tell "no facilities" from "not loaded".
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(candidate.payer);
      const row = (await detail.getLinkedNetworkRows()).find((linked) => linked.name === candidate.network);
      expect(
        row?.facilities,
        `"${candidate.network}" should show "${ZERO_FACILITIES}" explicitly; it shows "${row?.facilities}"`,
      ).toBe(ZERO_FACILITIES);
    });
  });

  // Azure test case 15821
  test('15821: should show the singular count when a linked network has exactly one facility', async ({
    payerManagementPage,
    linkedNetwork,
    steps,
  }) => {
    let candidate!: LinkedNetworkCandidate;

    await steps.critical('Navigate to the module and find a linked network with exactly one facility', async () => {
      candidate = await linkedNetwork('oneFacility');
      expect(candidate.facilitiesOnList, 'the network should carry exactly one facility').toBe('1');
    });

    await steps.step('The Linked Networks tab shows exactly 1', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(candidate.payer);
      const row = (await detail.getLinkedNetworkRows()).find((linked) => linked.name === candidate.network);
      expect(row?.facilities, `"${candidate.network}" should show 1`).toBe('1');
    });
  });

  // Azure test case 15824
  test('15824: should show a real count on every linked network row when the tab is opened', async ({
    payerManagementPage,
    linkedNetwork,
    steps,
  }) => {
    let candidate!: LinkedNetworkCandidate;

    await steps.critical('Navigate to the module and open a payer that holds a network', async () => {
      candidate = await linkedNetwork('any');
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(candidate.payer);
      expect(await detail.getLinkedNetworkColumnKeys(), 'the Linked Networks table should render').not.toEqual([]);
    });

    await steps.step('Every row carries a whole-number facility count', async () => {
      const rows = await payerManagementPage.detail().getLinkedNetworkRows();
      expect(rows.length, 'the payer should list at least one linked network').toBeGreaterThan(0);
      for (const row of rows) {
        expect(
          row.facilities,
          `"${row.name}" should show a whole-number facility count; it shows "${row.facilities}"`,
        ).toMatch(WHOLE_NUMBER);
      }
    });
  });

  // Azure test case 15828
  test('15828: should show no placeholder and agree with the network records across several payers', async ({
    payerManagementPage,
    networkManagementPage,
    steps,
  }) => {
    test.slow();
    let owned: { network: string; payer: string; facilities: string }[] = [];

    await steps.critical('Navigate to the Network module and collect networks that payers hold', async () => {
      owned = (await networkManagementPage.findOwnedNetworks(CONSISTENCY_SAMPLE)).slice(0, CONSISTENCY_SAMPLE);
      expect(owned.length, 'the register should hold at least one payer-owned network').toBeGreaterThan(0);
    });

    let checked: { network: string; payer: string; facilities: string }[] = [];

    await steps.step('Each payer\'s tab shows a real count that matches the Network list', async () => {
      // Only the pairs the payer's own tab confirms are compared: a network the
      // Network list calls owned may be mid-removal and no longer on the payer
      // tab, which is a state-transition matter, not a facility-count one. At
      // least one consistent pair must exist to make the comparison meaningful.
      for (const link of owned) {
        await payerManagementPage.open();
        const detail = await payerManagementPage.openDetails(link.payer);
        const row = (await detail.getLinkedNetworkRows()).find((linked) => linked.name === link.network);
        if (row === undefined) continue;
        checked.push(link);
        expect(
          PLACEHOLDER_PATTERN.test(row.facilities),
          `"${link.network}" shows a placeholder facility count: "${row.facilities}"`,
        ).toBe(false);
        expect(
          row.facilities,
          `"${link.network}" shows ${row.facilities} facilities on the payer but ${link.facilities} on the Network list`,
        ).toBe(link.facilities);
      }
      expect(
        checked.length,
        `no sampled owned network was still listed on its payer's tab to cross-check; sampled: `
          + `${owned.map((o) => `${o.payer}/${o.network}`).join(', ')}`,
      ).toBeGreaterThan(0);
    });

    await steps.step('The counts are unchanged after re-navigation', async () => {
      const link = checked[0];
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(link.payer);
      const row = (await detail.getLinkedNetworkRows()).find((linked) => linked.name === link.network);
      expect(row?.facilities, `"${link.network}" should still show ${link.facilities} after re-opening`)
        .toBe(link.facilities);
    });
  });


  // ---- the withheld half, on a role shaped for this case -------------------
  // This used to report BLOCKED: the one non-administrator credential in this
  // environment HOLDS the permission whose absence the case is about. The
  // account is now BUILT - the administrator takes the permission off the
  // shared "Payer Admin" role, the case signs in as it, and the permission
  // goes back when the case ends.

  // Azure test case 15827
  test('15827: should withhold facility counts from a user without Linked Networks permission', async ({ shapedNonAdmin, steps }) => {
    let session!: ShapedSession;

    await steps.critical('Sign in as a user without the Linked Networks permission', async () => {
      session = await shapedNonAdmin({ without: ['viewLinkedNetworks'] });
      await session.payers.navigate();
      await session.payers.expectRowsRendered();
    });

    await steps.step('The Linked Networks tab, and so its facility counts, is withheld', async () => {
      const detail = await session.payers.openDetails(NON_ADMIN_PROFILE.scopedPayers[0]);
      const tabs = await detail.getTabOrder();

      // AND THE DATA BEHIND IT. A withheld tab is only half the claim: what the
      // permission protects is the content, so if the tab IS offered the case
      // opens it and reports how much of that content the role was served.
      // "the tab was offered and rendered N rows" is a defect a developer can
      // act on; "a tab id was in a list" is not.
      if (tabs.includes('networks')) {
        const rows = await detail.getLinkedNetworkRows().catch(() => []);
        expect(
          rows.length,
          `the Linked Networks tab was offered to a role without the permission, and it `
            + `rendered ${rows.length} network row(s) with their facility counts`,
        ).toBe(0);
      }
      expect(
        tabs,
        `the counts live on the Linked Networks tab, which should be withheld; offered: ${tabs.join(', ')}`,
      ).not.toContain('networks');
    });
  });
  for (const blocked of BLOCKED_CASES) {
    // Azure test cases - one per generated case:
    //   TC-004 = 15822,  TC-005 = 15823,  TC-007 = 15825
    //   TC-008 = 15826,  TC-011 = 15829
    test(`${azureOrCase('60', 'TC-' + blocked.id)}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
