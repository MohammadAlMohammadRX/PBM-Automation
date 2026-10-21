import type { Page } from '@playwright/test';
import { NetworkUtils } from './NetworkUtils';
import { Logger } from './Logger';
import { env } from '../constants/EnvironmentConfig';

/** One network as a payer's Network Assignment tab lists it. */
export interface PayerNetworkLink {
  payerId: string;
  payer: string;
  payerCode: string;
  /** Null for a published payer; "draft" / "pendingApproval" otherwise. */
  payerVersionState: string | null;
  payerActive: boolean;
  network: string;
  networkCode: string;
  /** What the payer's own request says the network carries. */
  facilities: number;
  /** "live", "pendingRemoval", "draftRemoval", "draftAssignment". */
  assignmentState: string;
}

let cache: PayerNetworkLink[] | null = null;

/**
 * Every payer-network link in the register, with each network's facility count
 * - read the way the payer details page reads them (2026-10-12).
 *
 * WHY. The facility-count story is tested where the user sees the count: View a
 * payer, open Network Assignment, read the Facilities column. To give each case
 * the payer it needs (a network with 0 facilities, with 1, a payer with several
 * networks), the links are located first: GetPayers names the payers holding a
 * network, and GetPayerNetworks - the request the details page itself makes -
 * gives each network's facilitiesCount.
 *
 * THE API ONLY LOCATES. Every case then opens the payer and reads the count
 * from the screen; what the screen shows is what the case judges.
 */
export async function findPayerNetworkLinks(page: Page): Promise<PayerNetworkLink[]> {
  if (cache) return cache;
  if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);

  const payers: Array<Record<string, unknown>> = [];
  for (let n = 1; n <= 5; n += 1) {
    const r = await NetworkUtils.postAsSession(page, '/api/Payers/GetPayers', { pageNumber: n, rowsPerPage: 1000 });
    const items = (JSON.parse(r.text)?.payload?.payers?.items ?? []) as Array<Record<string, unknown>>;
    payers.push(...items);
    if (items.length < 1000) break;
  }

  const links: PayerNetworkLink[] = [];
  for (const p of payers.filter((x) => Number(x.linkedNetworksCount) > 0)) {
    const r = await NetworkUtils.postAsSession(page, '/api/Payers/GetPayerNetworks', { payerId: p.id, pageNumber: 1, rowsPerPage: 50 });
    const nets = (JSON.parse(r.text)?.payload?.networks?.items ?? []) as Array<Record<string, unknown>>;
    for (const n of nets) {
      links.push({
        payerId: String(p.id),
        payer: String(p.payerNameEn),
        payerCode: String(p.payerCode ?? ''),
        payerVersionState: (p.versionStatusCode as string | null) ?? null,
        payerActive: Boolean(p.isActive),
        network: String(n.networkNameEn),
        networkCode: String(n.networkCode ?? ''),
        facilities: Number(n.facilitiesCount ?? NaN),
        assignmentState: String(n.assignmentState ?? ''),
      });
    }
  }
  const dist = links.reduce<Record<string, number>>((m, l) => ({ ...m, [l.facilities]: (m[l.facilities] ?? 0) + 1 }), {});
  Logger.step(`[PayerNetworkFinder] ${links.length} payer-network link(s); facilities per network: ${JSON.stringify(dist)}`);
  cache = links;
  return links;
}

/** Links that fit, the most dependable first: a live assignment on a published payer. */
export function rankLinks(links: PayerNetworkLink[], fits: (l: PayerNetworkLink) => boolean): PayerNetworkLink[] {
  const score = (l: PayerNetworkLink): number => (l.assignmentState === 'live' ? 2 : 0) + (l.payerVersionState === null ? 1 : 0);
  return links.filter(fits).sort((a, b) => score(b) - score(a));
}

/** How the facility counts are spread - for a BLOCKED reason that states what was found. */
export function describeLinks(links: PayerNetworkLink[]): string {
  const dist = links.reduce<Record<string, number>>((m, l) => ({ ...m, [l.facilities]: (m[l.facilities] ?? 0) + 1 }), {});
  return `${links.length} payer-network links; facilities per network: `
    + Object.entries(dist).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, v]) => `${v} with ${k}`).join(', ');
}
