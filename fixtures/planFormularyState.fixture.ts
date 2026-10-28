import { test as base } from '@playwright/test';
import type { Page } from '@playwright/test';
import { blockedByPrecondition } from './testStatus.fixture';
import { Logger } from '../utils/Logger';
import { env } from '../constants/EnvironmentConfig';
import { approvePending, payerIdByName, pendingRequestId } from '../utils/NetworkProvisioning';
import {
  assignFormulary,
  deletePlanById,
  provisionPlan,
  readPlan,
  submitPlan,
  waitForPlanStatusCode,
  type PlanSpec,
  type ProvisionedPlan,
} from '../utils/PlanProvisioning';
import {
  SUITE_FORMULARY_PREFIX,
  deactivateFormulary,
  deleteFormularyAndApply,
  formularyStatusIds,
  listFormularies,
  provisionFormulary,
  suiteFormulary,
  type FormularyOption,
} from '../utils/FormularyProvisioning';
import { NetworkUtils } from '../utils/NetworkUtils';
import { ApiEndpoints } from '../constants/ApiEndpoints';
import { PLAN_SUITE } from '../data/plans/planSuite.data';
import { FormularyDetailPage } from '../pages/formulary/FormularyDetailPage';

/** A plan whose published versions carried each formulary in turn. */
export interface PlanWithFormularyHistory extends ProvisionedPlan {
  /** In assignment order: v1 carried `[0]`, the current version carries the last. */
  formularies: FormularyOption[];
}

/**
 * Formulary-side preconditions for the plan stories 14148, 14154, 14326,
 * 14327 and 14342 (plan folders 04, 06, 20, 21, 27) - added 2026-10-27.
 *
 * Kept out of planModule.fixture.ts so the parallel plan folders do not edit
 * one file. Everything is built through the application's API
 * (utils/PlanProvisioning.ts, utils/FormularyProvisioning.ts); a precondition
 * that cannot be reached reports BLOCKED, never a failure.
 */
export interface PlanFormularyStateFixtures {
  /**
   * `count` distinct ACTIVE formularies of the Plans suite payer: the suite's
   * own (planFormulary) first, then the payer's other Active ones (the suite's
   * "QA Automation Formulary ..." preferred), minting only what is missing. A
   * minted formulary that is not Active after approval BLOCKS the case
   * (planPreconditions.fixture notes they may stay Pending until the daily job).
   */
  suitePayerFormularies: (count: number) => Promise<FormularyOption[]>;
  /**
   * A brand-new Active formulary of the suite payer that no other case touches -
   * for the cases that change its payer, delete or deactivate it. Deleted at
   * teardown when nothing holds it any more (best effort).
   */
  disposableFormulary: () => Promise<FormularyOption>;
  /** An Inactive formulary of the suite payer (an existing one, else a disposable one deactivated). */
  inactiveSuiteFormulary: () => Promise<FormularyOption>;
  /** A formulary of the suite payer that has been deleted (its deletion approved). */
  deletedSuiteFormulary: () => Promise<FormularyOption>;
  /** An Active plan whose v1 carried `formularies[0]` and each later version the next one, every change approved. */
  planWithFormularyHistory: (formularies: FormularyOption[], spec?: PlanSpec) => Promise<PlanWithFormularyHistory>;
  /** A plan that was approved and has since EXPIRED (a short expiry, then the lifecycle job). */
  expiredPlan: (spec?: PlanSpec) => Promise<ProvisionedPlan>;
  /**
   * A plan awaiting approval whose formulary was deactivated AFTER the plan was
   * submitted - the only way a pending plan can carry an Inactive formulary,
   * since only an Active one can be assigned.
   */
  pendingPlanWithInactiveFormulary: () => Promise<{ plan: ProvisionedPlan; formulary: FormularyOption }>;
  /**
   * Stages a formulary change on a published plan and sends it for approval,
   * leaving it awaiting a decision - "a formulary change has been submitted".
   */
  pendingFormularyChange: (plan: ProvisionedPlan, formularyId: string) => Promise<void>;
  /** Stages the deletion of a published plan and sends it for approval, leaving it awaiting a decision (folder 05). */
  pendingPlanDeletion: (plan: ProvisionedPlan) => Promise<void>;
  /**
   * A plan whose deletion was approved and applied, with the id of the
   * now-processed approval request - the "stale reference" of 19011.
   */
  deletedPlanWithStaleRequest: () => Promise<{ plan: ProvisionedPlan; requestId: string }>;
  /** The formulary detail screen (Formulary module) - pages/formulary/FormularyDetailPage. */
  formularyDetailPage: FormularyDetailPage;
}

const ensureOnApp = async (page: Page): Promise<void> => {
  if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
};

const isActive = async (page: Page, formulary: FormularyOption): Promise<boolean> => {
  const status = await formularyStatusIds(page);
  return formulary.statusId === status.active;
};

/** A fresh suite formulary that must come out Active, or throws. */
const freshActiveFormulary = async (page: Page): Promise<FormularyOption> => {
  const formulary = await provisionFormulary(page, { payerName: PLAN_SUITE.payerName });
  if (!(await isActive(page, formulary))) {
    throw new Error(`the provisioned formulary "${formulary.formularyNameEn}" is not Active after approval (only an Active formulary can be assigned to a plan)`);
  }
  return formulary;
};

/** Polls the plan's formulary history until its current version carries `formularyId`. */
const waitForCurrentFormulary = async (page: Page, planId: string, formularyId: string, timeoutMs = 90_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await NetworkUtils.postAsSession(page, ApiEndpoints.planFormularyHistory, { planId });
    const entries = res.status < 300 ? ((JSON.parse(res.text) as { payload: { isCurrent: boolean; formularyId: string }[] }).payload ?? []) : [];
    if (entries.some((e) => e.isCurrent && e.formularyId === formularyId)) return;
    await page.waitForTimeout(5_000);
  }
  throw new Error(`plan ${planId} does not carry formulary ${formularyId} as its current formulary after the change was approved`);
};

/**
 * Stages a formulary change on a published plan: straight to the new formulary,
 * or - when the server wants the old one removed first - remove, then assign.
 */
const stageFormularyChange = async (page: Page, plan: ProvisionedPlan, formularyId: string): Promise<void> => {
  const direct = await NetworkUtils.postAsSession(page, ApiEndpoints.planAssignFormulary, { planId: plan.id, formularyId });
  if (direct.status < 300) return;
  Logger.warn(`[fixture] direct reassignment answered ${direct.status}; removing the formulary first`);
  const removed = await NetworkUtils.postAsSession(page, ApiEndpoints.planAssignFormulary, { planId: plan.id, formularyId: null });
  if (removed.status >= 300) throw new Error(`removing the plan's formulary answered ${removed.status} ${removed.text.slice(0, 200)}`);
  await assignFormulary(page, plan.id, formularyId, plan.name);
};

/**
 * Stages a published plan's deletion (DeletePlan) and sends it for approval.
 * A deletion the server already routed for approval answers the submit with
 * an error that is not a failure here - what matters is the pending request.
 */
const stagePlanDeletion = async (page: Page, plan: ProvisionedPlan): Promise<void> => {
  const deleted = await deletePlanById(page, plan.id);
  if (deleted.status >= 300) throw new Error(`DeletePlan answered ${deleted.status} ${deleted.text.slice(0, 200)}`);
  await submitPlan(page, plan.id, plan.name).catch((error) => Logger.warn(`[fixture] submit after delete: ${String(error).slice(0, 200)}`));
  if (!(await pendingRequestId(page, plan.name))) throw new Error(`the deletion of "${plan.name}" did not reach the approval queue`);
};

export const test = base.extend<PlanFormularyStateFixtures>({
  suitePayerFormularies: async ({ page }, use, testInfo) => {
    await use(async (count) => {
      try {
        await ensureOnApp(page);
        const own = await suiteFormulary(page, PLAN_SUITE.payerName);
        const payerId = await payerIdByName(page, PLAN_SUITE.payerName);
        const status = await formularyStatusIds(page);
        const picked: FormularyOption[] = [own];
        const others = (await listFormularies(page)).filter((f) =>
          f.id !== own.id
          && f.payerId === payerId
          && f.statusId === status.active
          && Boolean(f.formularyCode)
          && !/-D-/.test(f.formularyCode ?? '')
          && new Date(f.expiryDate).getTime() > Date.now() + 30 * 86_400_000);
        // The suite's own first; any other Active formulary of the payer serves too -
        // a case only ASSIGNS it to its own plan, never changes it.
        others.sort((a, b) => Number(b.formularyNameEn.startsWith(SUITE_FORMULARY_PREFIX)) - Number(a.formularyNameEn.startsWith(SUITE_FORMULARY_PREFIX)));
        picked.push(...others.slice(0, Math.max(0, count - 1)));
        while (picked.length < count) picked.push(await freshActiveFormulary(page));
        return picked.slice(0, count);
      } catch (error) {
        return blockedByPrecondition(testInfo, `${count} Active formularies of "${PLAN_SUITE.payerName}"`, error);
      }
    });
  },

  disposableFormulary: async ({ page }, use, testInfo) => {
    const built: FormularyOption[] = [];
    await use(async () => {
      try {
        await ensureOnApp(page);
        const formulary = await freshActiveFormulary(page);
        built.push(formulary);
        return formulary;
      } catch (error) {
        return blockedByPrecondition(testInfo, `a disposable Active formulary of "${PLAN_SUITE.payerName}"`, error);
      }
    });
    for (const formulary of built) {
      await deleteFormularyAndApply(page, formulary)
        .then(() => Logger.step(`[fixture] Deleted the case's formulary "${formulary.formularyNameEn}"`))
        .catch((error) => Logger.warn(`[fixture] Left formulary "${formulary.formularyNameEn}": ${String(error).slice(0, 200)}`));
    }
  },

  inactiveSuiteFormulary: async ({ page }, use, testInfo) => {
    await use(async () => {
      try {
        await ensureOnApp(page);
        const payerId = await payerIdByName(page, PLAN_SUITE.payerName);
        const status = await formularyStatusIds(page);
        const existing = (await listFormularies(page)).find((f) =>
          f.payerId === payerId && f.statusId === status.inactive && Boolean(f.formularyCode));
        if (existing) return existing;
        const formulary = await freshActiveFormulary(page);
        await deactivateFormulary(page, formulary);
        return { ...formulary, statusId: status.inactive };
      } catch (error) {
        return blockedByPrecondition(testInfo, `an Inactive formulary of "${PLAN_SUITE.payerName}"`, error);
      }
    });
  },

  deletedSuiteFormulary: async ({ page }, use, testInfo) => {
    await use(async () => {
      try {
        await ensureOnApp(page);
        const formulary = await freshActiveFormulary(page);
        await deleteFormularyAndApply(page, formulary);
        return formulary;
      } catch (error) {
        return blockedByPrecondition(testInfo, `a deleted formulary of "${PLAN_SUITE.payerName}"`, error);
      }
    });
  },

  planWithFormularyHistory: async ({ page }, use, testInfo) => {
    await use(async (formularies, spec = {}) => {
      try {
        await ensureOnApp(page);
        if (formularies.length === 0) throw new Error('planWithFormularyHistory needs at least one formulary');
        const plan = await provisionPlan(page, { ...spec, formularyId: formularies[0].id });
        await waitForPlanStatusCode(page, plan.id, 'active', 4 * 60_000);
        for (const formulary of formularies.slice(1)) {
          Logger.step(`[fixture] Publishing formulary "${formulary.formularyCode}" on "${plan.name}"`);
          await stageFormularyChange(page, plan, formulary.id);
          await submitPlan(page, plan.id, plan.name);
          await approvePending(page, plan.name);
          await waitForCurrentFormulary(page, plan.id, formulary.id);
        }
        return { ...plan, formularyId: formularies[formularies.length - 1].id, formularies };
      } catch (error) {
        return blockedByPrecondition(testInfo, `an Active plan whose versions carried ${formularies.length} formularies in turn`, error);
      }
    });
  },

  expiredPlan: async ({ page }, use, testInfo) => {
    await use(async (spec = {}) => {
      try {
        await ensureOnApp(page);
        const plan = await provisionPlan(page, { expiryInMinutes: 4, ...spec });
        await waitForPlanStatusCode(page, plan.id, 'expired', 8 * 60_000);
        return plan;
      } catch (error) {
        return blockedByPrecondition(testInfo, 'an Expired plan (approved, then past its expiry)', error);
      }
    });
  },

  pendingPlanWithInactiveFormulary: async ({ page }, use, testInfo) => {
    const built: ProvisionedPlan[] = [];
    await use(async () => {
      try {
        await ensureOnApp(page);
        const formulary = await freshActiveFormulary(page);
        const plan = await provisionPlan(page, { formularyId: formulary.id, submitOnly: true });
        built.push(plan);
        await deactivateFormulary(page, formulary);
        return { plan, formulary };
      } catch (error) {
        return blockedByPrecondition(testInfo, 'a plan awaiting approval whose assigned formulary has since been deactivated', error);
      }
    });
    for (const plan of built) {
      const record = await readPlan(page, plan.id).catch(() => null);
      if (record && (record.isPendingCreate || /^PLN-D-/.test(record.planCode ?? ''))) await deletePlanById(page, plan.id).catch(() => undefined);
    }
  },

  pendingFormularyChange: async ({ page }, use, testInfo) => {
    await use(async (plan, formularyId) => {
      try {
        await ensureOnApp(page);
        Logger.step(`[fixture] Submitting a formulary change on "${plan.name}"`);
        await stageFormularyChange(page, plan, formularyId);
        await submitPlan(page, plan.id, plan.name);
      } catch (error) {
        return blockedByPrecondition(testInfo, `a formulary change awaiting approval on "${plan.name}"`, error);
      }
    });
  },

  pendingPlanDeletion: async ({ page }, use, testInfo) => {
    await use(async (plan) => {
      try {
        await ensureOnApp(page);
        await stagePlanDeletion(page, plan);
      } catch (error) {
        return blockedByPrecondition(testInfo, `a deletion request awaiting approval for "${plan.name}"`, error);
      }
    });
  },

  deletedPlanWithStaleRequest: async ({ page }, use, testInfo) => {
    await use(async () => {
      try {
        await ensureOnApp(page);
        const plan = await provisionPlan(page);
        await waitForPlanStatusCode(page, plan.id, 'active', 4 * 60_000);
        await stagePlanDeletion(page, plan);
        const requestId = await pendingRequestId(page, plan.name);
        if (!requestId) throw new Error(`no pending deletion request for "${plan.name}"`);
        const approved = await NetworkUtils.postAsSession(page, ApiEndpoints.approvalApprove, { id: requestId });
        if (approved.status >= 300) throw new Error(`approving the deletion answered ${approved.status} ${approved.text.slice(0, 200)}`);
        const deadline = Date.now() + 2 * 60_000;
        while (Date.now() < deadline && (await readPlan(page, plan.id).then(() => true, () => false))) await page.waitForTimeout(5_000);
        return { plan, requestId };
      } catch (error) {
        return blockedByPrecondition(testInfo, 'a plan whose approved deletion has been applied', error);
      }
    });
  },

  formularyDetailPage: async ({ page }, use) => {
    await use(new FormularyDetailPage(page));
  },
});
