import { test as base } from '@playwright/test';
import { NetworkManagementPage, type OwnedNetwork } from '../pages/network/NetworkManagementPage';
import { PayerManagementPage } from '../pages/payer/PayerManagementPage';
import type { LinkedNetworkRow } from '../pages/payer/PayerDetailPage';
import { Logger } from '../utils/Logger';
import { blockedByPrecondition } from './testStatus.fixture';

/** How many owned networks to gather before classifying. */
const SCAN_MINIMUM = 6;

/**
 * The classes of payer-to-network link the network stories need.
 *
 *   any             a payer that holds a network at all
 *   settled         the link is published - neither a Draft nor a Pending state
 *   pendingRemoval  a submitted removal is awaiting a reviewer
 *   withFacilities  the network carries more than one facility
 *   oneFacility     the network carries exactly one facility
 *   zeroFacilities  the network carries none
 */
export type LinkClass =
  | 'any'
  | 'settled'
  | 'pendingRemoval'
  | 'withFacilities'
  | 'oneFacility'
  | 'zeroFacilities';

/** A payer-network link found in the environment, seen from both sides. */
export interface LinkedNetworkCandidate {
  payer: string;
  network: string;
  /** The Facilities cell the NETWORK list shows for this network. */
  facilitiesOnList: string;
  /** The network's row in the payer's Linked Networks table. */
  row: LinkedNetworkRow;
}

/**
 * Finds a payer that holds a network in the requested state.
 *
 * DISCOVERED, NOT PROVISIONED, for the reason the network-assignment fixture
 * records at length: the assignable pool is empty here, so a link cannot be
 * created to order. But links EXIST - the register carries payers that hold a
 * network, most of them with a removal submitted and never decided - and the
 * facility-count, draft-state and removal-dependency stories only need to
 * find one. The Network list's Payer column is where the relationship shows
 * from the network side, and the payer's own Linked Networks table is where
 * its state shows; a candidate is read from both so the two can be compared.
 *
 * A class no link occupies makes its case report BLOCKED naming the links that
 * WERE found - a true statement about the environment rather than a failure
 * of the feature.
 */
export interface NetworkLinkFixtures {
  linkedNetwork: (wanted: LinkClass) => Promise<LinkedNetworkCandidate>;
}

const isSettled = (state: string): boolean => !/draft|pending/i.test(state);
const isPendingRemoval = (state: string): boolean => /pending\s*removal/i.test(state);
const count = (cell: string): number | null => (/^\d+$/.test(cell) ? Number(cell) : null);

const fits = (wanted: LinkClass, owned: OwnedNetwork, row: LinkedNetworkRow): boolean => {
  switch (wanted) {
    case 'any':
      return true;
    case 'settled':
      return isSettled(row.assignmentState);
    case 'pendingRemoval':
      return isPendingRemoval(row.assignmentState);
    case 'withFacilities':
      return (count(owned.facilities) ?? 0) > 1;
    case 'oneFacility':
      return count(owned.facilities) === 1;
    case 'zeroFacilities':
      return count(owned.facilities) === 0;
    default:
      return false;
  }
};

/** The facility classes can be settled from the Network list alone. */
const facilityClassFits = (wanted: LinkClass, owned: OwnedNetwork): boolean => {
  switch (wanted) {
    case 'withFacilities':
      return (count(owned.facilities) ?? 0) > 1;
    case 'oneFacility':
      return count(owned.facilities) === 1;
    case 'zeroFacilities':
      return count(owned.facilities) === 0;
    default:
      return true;
  }
};

export const test = base.extend<NetworkLinkFixtures>({
  linkedNetwork: async ({ page }, use, testInfo) => {
    const networkPage = new NetworkManagementPage(page);
    const payerPage = new PayerManagementPage(page);

    await use(async (wanted: LinkClass) => {
      const owned = await networkPage.findOwnedNetworks(SCAN_MINIMUM);
      if (owned.length === 0) {
        return blockedByPrecondition(
          testInfo,
          'a payer that holds a linked network',
          new Error('the Network list names no owning payer on any row'),
        );
      }

      // Facility classes can be settled from the list alone; the others need
      // the link's state, which only the payer's own table shows.
      const byFacilities = owned.filter((o) => facilityClassFits(wanted, o));

      const seen: string[] = [];
      for (const candidate of byFacilities.slice(0, SCAN_MINIMUM)) {
        await payerPage.open();
        const detail = await payerPage.openDetails(candidate.payer);
        const rows = await detail.getLinkedNetworkRows();
        const row = rows.find((r) => r.name === candidate.network);
        if (!row) {
          seen.push(`${candidate.payer}/${candidate.network}: not listed on the payer`);
          continue;
        }
        seen.push(`${candidate.payer}/${candidate.network}: ${row.assignmentState || '(no state)'}, `
          + `facilities ${candidate.facilities}`);
        if (!fits(wanted, candidate, row)) continue;
        Logger.step(
          `[fixture] Link candidate (${wanted}): "${candidate.network}" on "${candidate.payer}" - `
          + `${row.assignmentState || 'settled'}, ${candidate.facilities} facility(ies)`,
        );
        return { payer: candidate.payer, network: candidate.network, facilitiesOnList: candidate.facilities, row };
      }

      return blockedByPrecondition(
        testInfo,
        `a payer-network link of class "${wanted}"`,
        new Error(
          `${owned.length} owned network(s) found, none in that class. Seen: `
          + `${seen.join('; ') || owned.map((o) => `${o.payer}/${o.network}: ${o.facilities} facility(ies)`).join('; ')}`,
        ),
      );
    });
  },
});
