import { test as base } from '@playwright/test';
import { blockedByPrecondition } from './testStatus.fixture';
import { Logger } from '../utils/Logger';
import { env } from '../constants/EnvironmentConfig';
import { ApiEndpoints } from '../constants/ApiEndpoints';
import { NetworkUtils } from '../utils/NetworkUtils';
import { payerIdByName, pendingRequestId } from '../utils/NetworkProvisioning';
import { deactivateFormulary, formularyStatusIds, listFormularies, type FormularyOption } from '../utils/FormularyProvisioning';
import { submitPlan, type ProvisionedPlan } from '../utils/PlanProvisioning';
import { ApprovalManagementPage } from '../pages/approval/ApprovalManagementPage';

/**
 * Plan preconditions beyond a plan's lifecycle state (2026-10-27, plan folders
 * 24 / 29 / 30). Formulary-history preconditions live in planFormularyState.fixture.ts. `planIn` (fixtures/planModule.fixture.ts) builds the plan; these
 * build what a case needs AROUND it - an Active formulary of another payer, a
 * staged activation, a pending revert, a deactivated case formulary - through the application's own API,
 * never by clicking through the screens.
 *
 * Each takes the ProvisionedPlan `planIn` returned (fixtures merged with
 * mergeTests cannot depend on one another) and BLOCKS, naming what was
 * missing, when the precondition cannot be reached - the rule under test was
 * never exercised then.
 */

/** What to do with a staged activation. */
export type StagedChangeFate = 'draft' | 'submit' | 'reject';

export interface PlanPreconditionFixtures {
  /**
   * An ACTIVE formulary owned by `payerName`, found in the register
   * (FormularyProvisioning.listFormularies) - never minted, since a new
   * formulary stays Pending until the daily lifecycle job. BLOCKED, naming the
   * payer, when it owns none.
   */
  payerFormulary: (payerName: string) => Promise<FormularyOption>;
  /**
   * Stages an activation of an Inactive plan (SetPlanActive) and leaves it a
   * draft, submits it (Pending Approval) or submits and rejects it.
   */
  stagePlanActivation: (plan: ProvisionedPlan, fate: StagedChangeFate) => Promise<void>;
  /** Requests a revert to version `n` through the API and makes sure it awaits approval. */
  pendingRevert: (plan: ProvisionedPlan, n: number) => Promise<void>;
  /**
   * Deactivates a formulary end to end (FormularyProvisioning.deactivateFormulary:
   * stage, submit, approve) - for a plan that must be linked to an Inactive
   * formulary, which cannot be assigned as such. Use it on a case-owned
   * formulary only (fixture `disposableFormulary`), never on a shared one.
   */
  deactivatedFormulary: (formulary: FormularyOption) => Promise<void>;
}

type Answer = { status: number; text: string };

const refuse = (what: string, res: Answer): never => {
  throw new Error(`${what} answered ${res.status} ${res.text.slice(0, 300)}`);
};

const NOT_EXPIRING_WITHIN = 30 * 86_400_000;

export const test = base.extend<PlanPreconditionFixtures>({
  payerFormulary: async ({ page }, use, testInfo) => {
    await use(async (payerName) => {
      try {
        if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
        const payerId = await payerIdByName(page, payerName);
        const active = (await formularyStatusIds(page)).active;
        const owned = (await listFormularies(page)).filter((f) => f.payerId === payerId);
        const usable = owned.find((f) =>
          f.statusId === active
          && Boolean(f.formularyCode)
          && !/-D-/.test(f.formularyCode ?? '')
          && new Date(f.expiryDate).getTime() > Date.now() + NOT_EXPIRING_WITHIN);
        if (!usable) throw new Error(`"${payerName}" owns ${owned.length} formulary(ies) and none is Active`);
        Logger.step(`[fixture] Using formulary ${usable.formularyCode} "${usable.formularyNameEn}" of "${payerName}"`);
        return usable;
      } catch (error) {
        return blockedByPrecondition(testInfo, `an Active formulary of "${payerName}"`, error);
      }
    });
  },

  stagePlanActivation: async ({ page }, use, testInfo) => {
    await use(async (plan, fate) => {
      try {
        Logger.step(`[fixture] Staging an activation of "${plan.name}" (${fate})`);
        // The body is INFERRED from InactivatePlan's `{ id, ... }` - not yet verified live.
        const staged = await NetworkUtils.postAsSession(page, ApiEndpoints.planSetActive, { id: plan.id });
        if (staged.status >= 300) refuse('SetPlanActive', staged);
        if (fate === 'draft') return;
        await submitPlan(page, plan.id, plan.name);
        if (fate === 'submit') return;
        const approvals = new ApprovalManagementPage(page, 'plan');
        await approvals.open();
        await approvals.reject(plan.name);
      } catch (error) {
        return blockedByPrecondition(testInfo, `a staged activation (${fate}) of "${plan.name}"`, error);
      }
    });
  },

  deactivatedFormulary: async ({ page }, use, testInfo) => {
    await use(async (formulary) => {
      try {
        Logger.step(`[fixture] Deactivating the case formulary "${formulary.formularyNameEn}"`);
        await deactivateFormulary(page, formulary);
      } catch (error) {
        return blockedByPrecondition(testInfo, `an Inactive formulary ("${formulary.formularyNameEn}" deactivated)`, error);
      }
    });
  },

  pendingRevert: async ({ page }, use, testInfo) => {
    await use(async (plan, n) => {
      try {
        const listed = await NetworkUtils.postAsSession(page, ApiEndpoints.planVersions, { planId: plan.id });
        if (listed.status >= 300) refuse('GetPlanVersions', listed);
        const versions = (JSON.parse(listed.text) as { payload: { id: string; version: number }[] }).payload ?? [];
        const target = versions.find((record) => record.version === n);
        if (!target) throw new Error(`the plan has no version ${n} (it has ${versions.map((r) => r.version).join(', ')})`);
        Logger.step(`[fixture] Requesting a revert of "${plan.name}" to v${n}`);
        const reverted = await NetworkUtils.postAsSession(page, ApiEndpoints.planRevert, { planId: plan.id, versionId: target.id });
        if (reverted.status >= 300) refuse('RevertPlanVersion', reverted);
        // A revert may be staged as a draft rather than sent at once - send it when nothing awaits approval yet.
        const queued = await pendingRequestId(page, plan.name).catch(() => '');
        if (!queued) await submitPlan(page, plan.id, plan.name);
        const awaiting = await pendingRequestId(page, plan.name).catch(() => '');
        if (!awaiting) throw new Error('the revert never reached the approval queue');
      } catch (error) {
        return blockedByPrecondition(testInfo, `a revert of "${plan.name}" to v${n} awaiting approval`, error);
      }
    });
  },
});
