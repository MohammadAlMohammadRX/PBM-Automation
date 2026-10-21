import { test, expect } from '../../../fixtures';
import type { Page } from '@playwright/test';
import type { PayerManagementPage } from '../../../pages/payer/PayerManagementPage';
import type { LinkedNetworkRow } from '../../../pages/payer/PayerDetailPage';
import { describeLinks, findPayerNetworkLinks, rankLinks, type PayerNetworkLink } from '../../../utils/PayerNetworkFinder';
import {
  CONSISTENCY_SAMPLE,
  PLACEHOLDER_PATTERN,
  WHOLE_NUMBER,
  ZERO_FACILITIES,
} from '../../../data/payers/facilityCount.data';

/**
 * User story: Show Real Facility Count per Assigned Network (Azure US 14232).
 *
 * TESTED FROM THE PAYER, as the QA lead set the scope (2026-10-12): View a
 * payer, open its Network Assignment tab, read the Facilities column. Before a
 * case runs, the payers whose networks carry the facility count it needs are
 * located (utils/PayerNetworkFinder - the same request the details page makes);
 * the case then reads the count off the screen. Read-only: no payer or network
 * is changed. 15828 also compares with the Network Management list, the
 * network's own record.
 */

/**
 * The row for a located network - by its CODE, which is unique; names are not
 * (one payer holds two networks both named "al aram", 2026-10-12).
 */
const sameNetwork = (row: LinkedNetworkRow, link: PayerNetworkLink): boolean =>
  (link.networkCode ? row.code.trim() === link.networkCode : row.name === link.network);

/** Opens a payer's details and returns its Network Assignment rows. */
async function networkRowsOf(payers: PayerManagementPage, payer: string): Promise<LinkedNetworkRow[]> {
  await payers.open();
  await payers.search(payer);
  const detail = await payers.openDetails(payer);
  return detail.getLinkedNetworkRows();
}

/** The first located link that fits, or BLOCKED naming what the register holds. */
async function linkWhere(
  page: Page,
  steps: { blocked: (reason: string) => never },
  fits: (l: PayerNetworkLink) => boolean,
  wanted: string,
): Promise<PayerNetworkLink> {
  const links = await findPayerNetworkLinks(page);
  const found = rankLinks(links, fits)[0];
  if (!found) steps.blocked(`No payer holds ${wanted}. ${describeLinks(links)}.`);
  return found!;
}

test.describe('Facility count per assigned network', () => {
  // Azure test case 15819
  test('15819: should show the real facility count when a linked network has several facilities', async ({
    page,
    payerManagementPage,
    steps,
  }) => {
    let link!: PayerNetworkLink;

    await steps.critical('Find a payer whose network has several facilities', async () => {
      link = await linkWhere(page, steps, (l) => l.facilities > 1, 'a network with more than one facility');
      expect(link.facilities, 'the located network should carry more than one facility').toBeGreaterThan(1);
    });

    await steps.step('View the payer: Network Assignment shows that count', async () => {
      const row = (await networkRowsOf(payerManagementPage, link.payerCode || link.payer)).find((r) => sameNetwork(r, link));
      expect(row?.facilities, `"${link.network}" on "${link.payer}" should show ${link.facilities} facilities`)
        .toBe(String(link.facilities));
    });
  });

  // Azure test case 15820
  test('15820: should show "0" rather than a placeholder when a linked network has no facilities', async ({
    page,
    payerManagementPage,
    steps,
  }) => {
    let link!: PayerNetworkLink;

    await steps.critical('Find a payer whose network has no facilities', async () => {
      link = await linkWhere(page, steps, (l) => l.facilities === 0, 'a network with no facilities');
      expect(link.facilities, 'the located network should carry no facilities').toBe(0);
    });

    await steps.step('View the payer: Network Assignment shows an explicit 0', async () => {
      // A real count of nothing is "0". A dash, a blank or "N/A" would leave
      // the reader unable to tell "no facilities" from "not loaded".
      const row = (await networkRowsOf(payerManagementPage, link.payerCode || link.payer)).find((r) => sameNetwork(r, link));
      expect(
        row?.facilities,
        `"${link.network}" on "${link.payer}" should show "${ZERO_FACILITIES}" explicitly; it shows "${row?.facilities}"`,
      ).toBe(ZERO_FACILITIES);
    });
  });

  // Azure test case 15821
  test('15821: should show the singular count when a linked network has exactly one facility', async ({
    page,
    payerManagementPage,
    steps,
  }) => {
    let link!: PayerNetworkLink;

    await steps.critical('Find a payer whose network has exactly one facility', async () => {
      link = await linkWhere(page, steps, (l) => l.facilities === 1, 'a network with exactly one facility');
      expect(link.facilities, 'the located network should carry exactly one facility').toBe(1);
    });

    await steps.step('View the payer: Network Assignment shows exactly 1', async () => {
      const row = (await networkRowsOf(payerManagementPage, link.payerCode || link.payer)).find((r) => sameNetwork(r, link));
      expect(row?.facilities, `"${link.network}" on "${link.payer}" should show 1`).toBe('1');
    });
  });

  // Azure test case 15824
  test('15824: should show a real count on every linked network row when the tab is opened', async ({
    page,
    payerManagementPage,
    steps,
  }) => {
    let payer = '';
    let expected: PayerNetworkLink[] = [];
    let rows: LinkedNetworkRow[] = [];

    await steps.critical('Find the payer holding the most networks, with mixed counts preferred', async () => {
      const links = await findPayerNetworkLinks(page);
      // BY PAYER ID, not name: several payers share a name ("basel" is at least
      // three), and grouping by name merged their networks (2026-10-12).
      const byPayer = new Map<string, PayerNetworkLink[]>();
      for (const l of links) byPayer.set(l.payerId, [...(byPayer.get(l.payerId) ?? []), l]);
      const mixed = (ls: PayerNetworkLink[]) => new Set(ls.map((l) => l.facilities)).size;
      const best = [...byPayer.entries()].sort((a, b) => mixed(b[1]) - mixed(a[1]) || b[1].length - a[1].length)[0];
      if (!best) steps.blocked(`No payer holds a network. ${describeLinks(links)}.`);
      expected = best![1];
      payer = expected[0].payerCode || expected[0].payer;
      rows = await networkRowsOf(payerManagementPage, payer);
      expect(rows.length, `"${payer}" should list its ${expected.length} network(s)`).toBe(expected.length);
    });

    await steps.step('Every row carries a whole-number facility count', async () => {
      for (const row of rows) {
        expect(
          row.facilities,
          `"${row.name}" on "${payer}" should show a whole-number facility count; it shows "${row.facilities}"`,
        ).toMatch(WHOLE_NUMBER);
      }
    });

    await steps.step('And each row shows the count the network actually carries', async () => {
      for (const want of expected) {
        const row = rows.find((r) => sameNetwork(r, want));
        expect(row?.facilities, `"${want.network}" on "${payer}" should show ${want.facilities}`).toBe(String(want.facilities));
      }
    });
  });

  // Azure test case 15828
  test('15828: should show no placeholder and agree with the network records across several payers', async ({
    page,
    payerManagementPage,
    networkManagementPage,
    steps,
  }) => {
    test.slow();
    let sample: PayerNetworkLink[] = [];

    await steps.critical('Find several payers, each holding a live network', async () => {
      const links = rankLinks(await findPayerNetworkLinks(page), (l) => l.assignmentState === 'live');
      const onePerPayer = links.filter((l, i) => links.findIndex((x) => x.payerId === l.payerId) === i);
      // Both counts wanted when the register has them: a zero and a non-zero.
      sample = [
        ...onePerPayer.filter((l) => l.facilities === 0).slice(0, 1),
        ...onePerPayer.filter((l) => l.facilities > 0),
      ].slice(0, CONSISTENCY_SAMPLE);
      expect(sample.length, 'the register should hold payers with a live network').toBeGreaterThan(1);
    });

    await steps.step('Each payer\'s tab shows a real count that matches the Network Management record', async () => {
      const mismatches: string[] = [];
      for (const link of sample) {
        const row = (await networkRowsOf(payerManagementPage, link.payerCode || link.payer)).find((r) => sameNetwork(r, link));
        const record = await networkManagementPage.findNetworkRow(link.network, link.payer, link.networkCode || undefined);
        if (!row) { mismatches.push(`"${link.network}" is not listed on "${link.payer}"`); continue; }
        if (PLACEHOLDER_PATTERN.test(row.facilities)) mismatches.push(`"${link.network}" on "${link.payer}" shows a placeholder: "${row.facilities}"`);
        if (!record) { mismatches.push(`"${link.network}" was not found in Network Management with "${link.payer}" in scope`); continue; }
        if (row.facilities !== record.facilities) {
          mismatches.push(`"${link.network}": ${row.facilities} on payer "${link.payer}", ${record.facilities} in Network Management`);
        }
      }
      expect(mismatches, `checked: ${sample.map((l) => `${l.payer}/${l.network}`).join(', ')}`).toEqual([]);
    });
  });
});
