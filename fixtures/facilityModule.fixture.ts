import { test as base } from '@playwright/test';
import { FacilityManagementPage } from '../pages/facility/FacilityManagementPage';
import { FacilityDetailPage } from '../pages/facility/FacilityDetailPage';
import { FacilityFormDrawer } from '../pages/facility/FacilityFormDrawer';
import { FacilityInactivateDrawer } from '../pages/facility/FacilityInactivateDrawer';
import { FacilityNetworksTab } from '../pages/facility/FacilityNetworksTab';
import { FacilityAuditTab } from '../pages/facility/FacilityAuditTab';
import { ConfirmDialog } from '../pages/components/ConfirmDialog';
import { blockedByPrecondition } from './testStatus.fixture';
import { env } from '../constants/EnvironmentConfig';
import { Logger } from '../utils/Logger';
import {
  SUITE_FACILITY_PREFIX,
  assignToSuiteNetwork,
  discardSuiteFacility,
  findFacilityByName,
  provisionSuiteFacility,
  waitForFacilityNetwork,
  type FacilityNetworkAssignment,
  type FacilityNetworkItem,
  type FacilityState,
  type ProvisionedFacility,
  type SuiteFacilitySpec,
} from '../utils/FacilityProvisioning';

/** A suite facility placed in its own disposable network, as the facility's Network Assignment tab lists it. */
export interface FacilityInNetwork {
  facility: ProvisionedFacility;
  assignment: FacilityNetworkAssignment;
  /** The GetFacilityNetworks row (code, name, statusId, assignedOn). */
  listed: FacilityNetworkItem;
}

export interface FacilityModuleFixtures {
  /** The list (`/facility-management`). */
  facilityManagementPage: FacilityManagementPage;
  /** The detail (`/facility-management/{id}`). */
  facilityDetailPage: FacilityDetailPage;
  /** The Add / Edit drawer (`facility-form-drawer`, list and detail alike). */
  facilityFormDrawer: FacilityFormDrawer;
  /** The DETAIL's Inactivate drawer (`facility-detail-deactivate-drawer`). */
  facilityInactivateDrawer: FacilityInactivateDrawer;
  /** The LIST's Inactivate drawer (`facility-deactivate-drawer`). */
  facilityListInactivateDrawer: FacilityInactivateDrawer;
  facilityNetworksTab: FacilityNetworksTab;
  facilityAuditTab: FacilityAuditTab;
  /** The shared confirmation dialog (`#pbm-dialog`) - Delete Facility (No / Yes), Activate facility (No / Activate), Unsaved Changes, Export format. */
  facilityConfirmDialog: ConfirmDialog;
  /**
   * Builds a suite facility ("QA Automation Facility <stamp>", Arabic letters
   * only, unique e-mail; Pharmacy / Both by default) in `state` - licence
   * dates and the Is Active switch chosen so the status is right at save
   * (utils/FacilityProvisioning provisionSuiteFacility) - and DISCARDS it at
   * teardown (deleted; inactivated when it is in a network). BLOCKED, with the
   * server's answer, when the application refuses a step.
   */
  facilityIn: (state: FacilityState, spec?: SuiteFacilitySpec) => Promise<ProvisionedFacility>;
  /**
   * An ACTIVE suite PHARMACY (the network pool offers nothing else) assigned to
   * its own disposable network (created, submitted, approved - ~10 s) and
   * listed on its Network Assignment tab. Teardown INACTIVATES the facility
   * and leaves it and the network: a network cannot lose its last facility nor
   * be deleted with one (see FacilityProvisioning.assignToSuiteNetwork).
   * `networks` > 1 builds that many networks for the same facility.
   */
  facilityInNetwork: (spec?: SuiteFacilitySpec & { networks?: number }) => Promise<FacilityInNetwork & { all: FacilityNetworkAssignment[] }>;
  /** Registers a facility the CASE creates through the screen, by name, for teardown. Suite names only. */
  discardFacilityNamed: (name: string) => void;
  /** Registers a facility the case creates, by id, for teardown. */
  discardFacilityId: (id: string) => void;
}

export const test = base.extend<FacilityModuleFixtures>({
  facilityManagementPage: async ({ page }, use) => {
    await use(new FacilityManagementPage(page));
  },

  facilityDetailPage: async ({ page }, use) => {
    await use(new FacilityDetailPage(page));
  },

  facilityFormDrawer: async ({ page }, use) => {
    await use(new FacilityFormDrawer(page));
  },

  facilityInactivateDrawer: async ({ page }, use) => {
    await use(new FacilityInactivateDrawer(page, 'detail'));
  },

  facilityListInactivateDrawer: async ({ page }, use) => {
    await use(new FacilityInactivateDrawer(page, 'list'));
  },

  facilityNetworksTab: async ({ page }, use) => {
    await use(new FacilityNetworksTab(page));
  },

  facilityAuditTab: async ({ page }, use) => {
    await use(new FacilityAuditTab(page));
  },

  facilityConfirmDialog: async ({ page }, use) => {
    await use(new ConfirmDialog(page));
  },

  facilityIn: async ({ page }, use, testInfo) => {
    const built: string[] = [];
    await use(async (state, spec = {}) => {
      try {
        if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
        // Named BEFORE it is built, so a step refused half-way still discards what was created.
        const nameEn = spec.nameEn ?? `${SUITE_FACILITY_PREFIX} ${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
        const facility = await provisionSuiteFacility(page, state, { ...spec, nameEn }).catch(async (error: unknown) => {
          const partial = await findFacilityByName(page, nameEn).catch(() => null);
          if (partial) built.push(partial.id);
          throw error;
        });
        built.push(facility.id);
        return facility;
      } catch (error) {
        return blockedByPrecondition(testInfo, `a facility in state ${state} ${JSON.stringify(spec).slice(0, 160)}`, error);
      }
    });
    for (const id of [...built].reverse()) await discardSuiteFacility(page, id);
  },

  facilityInNetwork: async ({ page }, use, testInfo) => {
    const built: string[] = [];
    await use(async (spec = {}) => {
      try {
        if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
        const { networks = 1, ...facilitySpec } = spec;
        const nameEn = facilitySpec.nameEn ?? `${SUITE_FACILITY_PREFIX} ${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
        const facility = await provisionSuiteFacility(page, 'Active', { type: 'pharmacy', ...facilitySpec, nameEn }).catch(async (error: unknown) => {
          const partial = await findFacilityByName(page, nameEn).catch(() => null);
          if (partial) built.push(partial.id);
          throw error;
        });
        built.push(facility.id);
        const all: FacilityNetworkAssignment[] = [];
        for (let i = 0; i < networks; i += 1) all.push(await assignToSuiteNetwork(page, facility));
        const listed = await waitForFacilityNetwork(page, facility.id, all[0].network.id);
        return { facility, assignment: all[0], listed, all };
      } catch (error) {
        return blockedByPrecondition(testInfo, `a suite facility assigned to its own approved network ${JSON.stringify(spec).slice(0, 120)}`, error);
      }
    });
    for (const id of [...built].reverse()) {
      const outcome = await discardSuiteFacility(page, id);
      Logger.step(`[fixture] Facility ${id} in a network: ${outcome}`);
    }
  },

  discardFacilityNamed: async ({ page }, use) => {
    const names: string[] = [];
    await use((name) => {
      if (!name.startsWith(SUITE_FACILITY_PREFIX)) throw new Error(`"${name}" is not a suite facility name (prefix "${SUITE_FACILITY_PREFIX}")`);
      names.push(name);
    });
    for (const name of names) {
      const found = await findFacilityByName(page, name).catch(() => null);
      if (found) {
        Logger.step(`[fixture] Discarding the case's facility "${name}"`);
        await discardSuiteFacility(page, found.id);
      }
    }
  },

  discardFacilityId: async ({ page }, use) => {
    const ids: string[] = [];
    await use((id) => ids.push(id));
    for (const id of ids.reverse()) await discardSuiteFacility(page, id);
  },
});
