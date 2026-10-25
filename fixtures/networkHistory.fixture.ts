import { test as base } from '@playwright/test';
import { blockedByPrecondition } from './testStatus.fixture';
import { env } from '../constants/EnvironmentConfig';
import {
  assignableFacilityIds,
  listNetworks,
  provisionNetwork,
  type NetworkSpec,
  type ProvisionedNetwork,
} from '../utils/NetworkProvisioning';
import {
  publishFacilityChange,
  publishNetworkEdit,
  stageNetworkEdit,
  type NetworkEdit,
} from '../utils/NetworkHistory';

/** Which register network with linked policies a case needs. */
export interface PolicyNetworkCriteria {
  minPolicies?: number;
  maxPolicies?: number;
  /** true = must have facilities, false = must have none, undefined = either. */
  withFacilities?: boolean;
}

/** A register network with linked policies (READ-ONLY to the suite). */
export interface PolicyNetwork {
  id: string;
  name: string;
  code: string;
  policies: number;
  facilities: number;
  /** The owning payer (English name), undefined when none. */
  payer: string | undefined;
}

export interface NetworkHistoryFixtures {
  /**
   * A network with `published` approved versions (v1 = the create, then one
   * published edit per further version), built through the API. BLOCKED when
   * the history cannot be built.
   */
  networkWithVersions: (published: number, spec?: NetworkSpec) => Promise<ProvisionedNetwork>;
  /** Publishes one more edit of a network (edit, submit, approve). */
  publishEdit: (network: ProvisionedNetwork, edit?: NetworkEdit) => Promise<void>;
  /**
   * Publishes a facility membership change (assign/unassign, submit, approve).
   * `assignAny: n` assigns the first n facilities of the network's assignable
   * pool. Resolves to the facility ids it assigned.
   */
  publishFacilityChange: (
    network: ProvisionedNetwork,
    change: { assign?: readonly string[]; assignAny?: number; unassign?: readonly string[] },
  ) => Promise<string[]>;
  /** Saves an edit as a draft without submitting it. */
  stageEdit: (network: ProvisionedNetwork, edit?: NetworkEdit) => Promise<void>;
  /**
   * Discovers a register network with linked policies matching `criteria`.
   * Networks with policies are shared team records: read them, never change
   * them. BLOCKED when none matches.
   */
  policyNetwork: (criteria?: PolicyNetworkCriteria) => Promise<PolicyNetwork>;
}

export const test = base.extend<NetworkHistoryFixtures>({
  networkWithVersions: async ({ page }, use, testInfo) => {
    await use(async (published, spec = {}) => {
      try {
        if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
        const network = await provisionNetwork(page, spec);
        for (let version = 2; version <= published; version += 1) {
          await publishNetworkEdit(page, network.id, { descriptionEn: `Version ${version} of an automated network` });
        }
        return network;
      } catch (error) {
        return blockedByPrecondition(testInfo, `a network with ${published} published versions`, error);
      }
    });
  },

  publishEdit: async ({ page }, use, testInfo) => {
    await use(async (network, edit = {}) => {
      try {
        await publishNetworkEdit(page, network.id, edit);
      } catch (error) {
        blockedByPrecondition(testInfo, `a published edit of "${network.name}"`, error);
      }
    });
  },

  publishFacilityChange: async ({ page }, use, testInfo) => {
    await use(async (network, change) => {
      try {
        const pool = change.assignAny ? (await assignableFacilityIds(page, network.id)).map((f) => f.id) : [];
        if (pool.length < (change.assignAny ?? 0)) throw new Error(`only ${pool.length} assignable facilities, ${change.assignAny} wanted`);
        const assign = [...(change.assign ?? []), ...pool.slice(0, change.assignAny ?? 0)];
        await publishFacilityChange(page, network.id, { assign, unassign: change.unassign });
        return assign;
      } catch (error) {
        return blockedByPrecondition(testInfo, `a published facility change on "${network.name}"`, error);
      }
    });
  },

  stageEdit: async ({ page }, use, testInfo) => {
    await use(async (network, edit = {}) => {
      try {
        const answer = await stageNetworkEdit(page, network.id, { descriptionEn: `Draft edit ${Date.now().toString(36)}`, ...edit });
        if (answer.status >= 300) throw new Error(`UpdateNetwork answered ${answer.status} ${answer.text.slice(0, 300)}`);
      } catch (error) {
        blockedByPrecondition(testInfo, `a draft edit of "${network.name}"`, error);
      }
    });
  },

  policyNetwork: async ({ page }, use, testInfo) => {
    await use(async (criteria = {}) => {
      const min = criteria.minPolicies ?? 1;
      const max = criteria.maxPolicies ?? Number.POSITIVE_INFINITY;
      const wanted = `a register network with ${min}${Number.isFinite(max) ? `-${max}` : '+'} linked policies`
        + (criteria.withFacilities === undefined ? '' : criteria.withFacilities ? ' and facilities' : ' and no facilities');
      try {
        if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
        const row = (await listNetworks(page))
          .map((r) => ({
            id: String(r.id),
            name: String(r.networkNameEn),
            code: String(r.networkCode ?? ''),
            policies: Number(r.linkedPoliciesCount ?? 0),
            facilities: Number(r.linkedFacilitiesCount ?? 0),
            payer: r.payerNameEn ? String(r.payerNameEn) : undefined,
          }))
          .filter((r) => r.policies >= min && r.policies <= max)
          .filter((r) => criteria.withFacilities === undefined || (r.facilities > 0) === criteria.withFacilities)
          .sort((a, b) => b.policies - a.policies)[0];
        if (!row) throw new Error(`the register holds no such network`);
        return row;
      } catch (error) {
        return blockedByPrecondition(testInfo, wanted, error);
      }
    });
  },
});
