import { test as base, type Page } from '@playwright/test';
import { NetworkManagementPage, type OwnedNetwork } from '../pages/network/NetworkManagementPage';
import { PayerManagementPage } from '../pages/payer/PayerManagementPage';
import type { LinkedNetworkRow } from '../pages/payer/PayerDetailPage';
import { Logger } from '../utils/Logger';
import { findPayers, isEffectiveNow, type PayerShape } from '../utils/PayerFinder';
import { blockedByPrecondition } from './testStatus.fixture';
import { cleanUpAfterCase, provisionPublishedPayer, purgePayer } from './payerState.fixture';
import { ApprovalManagementPage } from '../pages/approval/ApprovalManagementPage';
import { buildUniquePayer } from '../data/payers/payer.data';
import { DateUtils } from '../utils/DateUtils';

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

const FACILITY_CLASSES: ReadonlySet<LinkClass> = new Set(['withFacilities', 'oneFacility', 'zeroFacilities']);

/** Payers tried on the payer side before giving up. */
const PAYER_SIDE_TRIES = 6;

/**
 * A link of a non-facility class, located by GetPayers and confirmed on the
 * payer's own Network Assignment tab.
 *
 * The SUITE'S OWN live payers only (published, effective now): the network
 * stories stage and approve removals, so they never act on a real record or on
 * the QA lead's reference payers. Two or more networks first (note N-046).
 * `facilitiesOnList` is left blank - it belongs to the Network list, which this
 * path does not read, and only the facility classes use it.
 */
async function findOnPayerSide(
  page: Page,
  payerPage: PayerManagementPage,
  wanted: LinkClass,
): Promise<{ candidate?: LinkedNetworkCandidate; seen: string[] }> {
  const ours = (p: PayerShape) => /^Automation Payer /.test(p.payerNameEn) && !p.versionStatusCode && isEffectiveNow(p);
  const payers = [
    ...await findPayers(page, (p) => ours(p) && p.linkedNetworksCount >= 2, 'a live suite payer with 2+ networks', []),
    ...await findPayers(page, (p) => ours(p) && p.linkedNetworksCount === 1, 'a live suite payer with a network', []),
  ];
  const seen: string[] = [];
  for (const payer of payers.slice(0, PAYER_SIDE_TRIES)) {
    await payerPage.open();
    await payerPage.search(payer.payerNameEn);
    const detail = await payerPage.openDetails(payer.payerNameEn);
    const rows = await detail.getLinkedNetworkRows().catch(() => [] as LinkedNetworkRow[]);
    seen.push(`${payer.payerNameEn}: ${rows.map((r) => `${r.name} (${r.assignmentState || 'settled'})`).join(', ') || 'no rows'}`);
    const row = rows.find((r) => fits(wanted, { network: r.name, payer: payer.payerNameEn, facilities: '', status: '' }, r));
    if (!row) continue;
    Logger.step(
      `[fixture] Link candidate (${wanted}) from the payer side: "${row.name}" on "${payer.payerNameEn}" - `
      + `${row.assignmentState || 'settled'}`,
    );
    return { candidate: { payer: payer.payerNameEn, network: row.name, facilitiesOnList: '', row }, seen };
  }
  return { seen };
}

/**
 * Publishes a suite payer with one network and shapes its link into `wanted`
 * ("any"/"settled" as published; "pendingRemoval" by staging the removal and
 * submitting it, left for a reviewer). Reports BLOCKED if it cannot.
 */
async function provisionLink(
  payerPage: PayerManagementPage,
  approvalPage: ApprovalManagementPage,
  wanted: LinkClass,
  testInfo: Parameters<typeof blockedByPrecondition>[0],
): Promise<{ candidate: LinkedNetworkCandidate; code: string }> {
  const data = buildUniquePayer({ effectiveDate: DateUtils.pastDate(30) });
  Logger.step(`[fixture] Provisioning a "${wanted}" link on "${data.nameEn}"`);
  const code = await provisionPublishedPayer(payerPage, approvalPage, data, testInfo);

  if (wanted === 'pendingRemoval') {
    // A SECOND NETWORK FIRST (2026-10-11). Removing a payer's ONLY network
    // cannot be approved - VERIFIED, ApproveRequest answers 409 "A payer must
    // have at least one assigned network before this change can be approved."
    // (batch 6b, 15807). The removal stories approve the removal, so the payer
    // gets a second network and ONE of the two is staged for removal.
    await payerPage.open();
    await payerPage.search(data.nameEn);
    const opened = await payerPage.openDetails(data.nameEn);
    const first = (await opened.getLinkedNetworkRows())[0]?.name ?? '';
    await opened.assignNetwork();
    await payerPage.open();
    await payerPage.sendForApproval(data.nameEn);
    await approvalPage.open();
    await approvalPage.approve(data.nameEn);

    await payerPage.open();
    await payerPage.search(data.nameEn);
    const detail = await payerPage.openDetails(data.nameEn);
    const linked = await detail.getLinkedNetworkRows();
    if (linked.length < 2 || first === '') {
      await purgePayer(payerPage, approvalPage, code || data.nameEn).catch(() => undefined);
      return blockedByPrecondition(
        testInfo,
        'a payer holding two networks',
        new Error(`"${data.nameEn}" holds ${linked.length} network(s) after the second assignment was approved`),
      );
    }
    await detail.unassignNetwork(first);
    await payerPage.open();
    await payerPage.sendForApproval(data.nameEn);
  }

  await payerPage.open();
  await payerPage.search(data.nameEn);
  const rows = await (await payerPage.openDetails(data.nameEn)).getLinkedNetworkRows();
  const row = rows.find((r) => fits(wanted, { network: r.name, payer: data.nameEn, facilities: '', status: '' }, r));
  if (!row) {
    await purgePayer(payerPage, approvalPage, code || data.nameEn).catch(() => undefined);
    return blockedByPrecondition(
      testInfo,
      `a payer-network link of class "${wanted}"`,
      new Error(`the provisioned payer "${data.nameEn}" shows: ${rows.map((r) => `${r.name} (${r.assignmentState || 'settled'})`).join(', ') || 'no rows'}`),
    );
  }
  Logger.step(`[fixture] Link candidate (${wanted}) provisioned: "${row.name}" on "${data.nameEn}" - ${row.assignmentState || 'settled'}`);
  return { candidate: { payer: data.nameEn, network: row.name, facilitiesOnList: '', row }, code };
}

export const test = base.extend<NetworkLinkFixtures>({
  linkedNetwork: async ({ page }, use, testInfo) => {
    const networkPage = new NetworkManagementPage(page);
    const payerPage = new PayerManagementPage(page);
    const approvalPage = new ApprovalManagementPage(page);
    const provisioned: string[] = [];

    await use(async (wanted: LinkClass) => {
      // THE PAYER SIDE FIRST for the classes that need only the link and its
      // state (2026-10-11). The Network list can no longer find these links:
      // it opens on ~600 unowned seed networks, and its owner data disagrees
      // with the payer side - GetNetworks names an owner for 1 live suite
      // network while GetPayers counts a network on 78 published suite payers,
      // whose Network Assignment tabs list it. The payer's own tab is where
      // the link and its state show, so it is read from there. The facility
      // classes still need the Network list's Facilities column.
      if (!FACILITY_CLASSES.has(wanted)) {
        const fromPayer = await findOnPayerSide(page, payerPage, wanted);
        if (fromPayer.candidate) return fromPayer.candidate;
        Logger.step(`[fixture] No "${wanted}" link on the payer side. Seen: ${fromPayer.seen.join('; ') || '(none)'}`);

        // PROVISIONED when none is found (2026-10-11). The clean-up sweeps
        // remove the suite's payers between cases, so a found link is often
        // gone; and the network pool is stocked again, so a link CAN now be
        // made to order: a published payer carries a settled link, and staging
        // and submitting its removal gives a pending removal. Purged at teardown.
        const made = await provisionLink(payerPage, approvalPage, wanted, testInfo);
        provisioned.push(made.code || made.candidate.payer);
        return made.candidate;
      }

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

    for (const identifier of provisioned) {
      await cleanUpAfterCase(testInfo, `payer ${identifier}`, () => purgePayer(payerPage, approvalPage, identifier));
    }
  },
});
