import { test as base } from '@playwright/test';
import { NetworkManagementPage } from '../pages/network/NetworkManagementPage';
import { blockedByPrecondition } from './testStatus.fixture';
import { Logger } from '../utils/Logger';
import { env } from '../constants/EnvironmentConfig';
import {
  approvePending,
  deleteNetworkById,
  listNetworks,
  provisionNetwork,
  readNetwork,
  waitForNetworkStatusCode,
  type NetworkSpec,
  type ProvisionedNetwork,
} from '../utils/NetworkProvisioning';

/** The states a network case can ask to start from. */
export type NetworkState =
  /** Created, never submitted - "Not Live", `v0 · Draft`. */
  | 'Draft'
  /** Created and submitted, awaiting a checker - `v0 · Pending Approval`. */
  | 'PendingApproval'
  /** Approved with an effective date two days out - reads Pending. */
  | 'Pending'
  /** Approved and made Active by the lifecycle job. */
  | 'Active'
  /** Active, then inactivated through the drawer and the approval queue. */
  | 'Inactive'
  /** A short-lived network (expiry minutes after effective) the job has expired. */
  | 'Expired';

/** A network that already has linked policies, found in the register. */
export interface NetworkWithPolicies {
  id: string;
  name: string;
  code: string;
  policies: number;
  facilities: number;
}

export interface NetworkModuleFixtures {
  /**
   * Builds a network for this case in the wanted state and returns it.
   *
   * Provisioned through the application's API (utils/NetworkProvisioning.ts),
   * never sampled from the list: the list is full of shared NETWORK-SEED and
   * team networks a case must not change. Drafts it built are deleted at
   * teardown; published networks are left (a live network with a facility
   * cannot be deleted without an approval round trip).
   *
   * BLOCKED, not failed, when the state cannot be reached - the rule under
   * test was never exercised then.
   */
  networkIn: (state: NetworkState, spec?: NetworkSpec) => Promise<ProvisionedNetwork>;
  /** A network in the register with at least `minimum` linked policies, or BLOCKED. */
  networkWithPolicies: (minimum?: number) => Promise<NetworkWithPolicies>;
}

const TWO_DAYS = 2 * 24 * 60;

export const test = base.extend<NetworkModuleFixtures>({
  networkIn: async ({ page }, use, testInfo) => {
    const built: ProvisionedNetwork[] = [];
    const networks = new NetworkManagementPage(page);

    await use(async (state, spec = {}) => {
      try {
        if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
        if (state === 'Draft') {
          const network = await provisionNetwork(page, { ...spec, draftOnly: true });
          built.push(network);
          return network;
        }
        if (state === 'PendingApproval') {
          const network = await provisionNetwork(page, { ...spec, submitOnly: true });
          built.push(network);
          return network;
        }
        if (state === 'Pending') {
          const network = await provisionNetwork(page, { effectiveInMinutes: TWO_DAYS, ...spec });
          await waitForNetworkStatusCode(page, network.id, 'pending', 2 * 60_000);
          return network;
        }
        if (state === 'Expired') {
          // Effective in a minute, expiring two minutes later: the job (every
          // minute here) takes it Pending -> Active -> Expired within minutes.
          const network = await provisionNetwork(page, { effectiveInMinutes: 1, expiryInMinutes: 3, ...spec });
          await waitForNetworkStatusCode(page, network.id, 'expired', 10 * 60_000);
          return network;
        }
        const network = await provisionNetwork(page, spec);
        await waitForNetworkStatusCode(page, network.id, 'active', 6 * 60_000);
        if (state === 'Active') return network;

        Logger.step(`[fixture] Inactivating "${network.name}" to provision an Inactive network`);
        // In the owning payer's scope when it has one: the Network module lists
        // one payer at a time (story 08 additions, 2026-10-21).
        await networks.openListShowing(spec.payerName);
        await networks.stageAndSubmit(network.name, 'inactivate');
        await approvePending(page, network.name);
        await waitForNetworkStatusCode(page, network.id, 'inactive', 2 * 60_000);
        return network;
      } catch (error) {
        return blockedByPrecondition(testInfo, `a network in state ${state}`, error);
      }
    });

    for (const network of built) {
      const record = await readNetwork(page, network.id).catch(() => null);
      if (record && record.isPendingCreate) {
        await deleteNetworkById(page, network.id).catch(() => undefined);
        Logger.step(`[fixture] Discarded the case's draft network "${network.name}"`);
      }
    }
  },

  networkWithPolicies: async ({ page }, use, testInfo) => {
    await use(async (minimum = 1) => {
      try {
        if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
        const rows = await listNetworks(page);
        const row = rows
          .filter((r) => Number(r.linkedPoliciesCount ?? 0) >= minimum)
          .sort((a, b) => Number(b.linkedPoliciesCount) - Number(a.linkedPoliciesCount))[0];
        if (!row) throw new Error(`no network in the register has ${minimum}+ linked policies`);
        return {
          id: String(row.id),
          name: String(row.networkNameEn),
          code: String(row.networkCode ?? ''),
          policies: Number(row.linkedPoliciesCount),
          facilities: Number(row.linkedFacilitiesCount ?? 0),
        };
      } catch (error) {
        return blockedByPrecondition(testInfo, `a network with ${minimum}+ linked policies`, error);
      }
    });
  },
});
