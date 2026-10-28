import { test as base } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PlanDetailPage } from '../pages/plan/PlanDetailPage';
import { ApprovalManagementPage } from '../pages/approval/ApprovalManagementPage';
import { PlanInactivateDialog } from '../pages/plan/PlanInactivateDialog';
import { blockedByPrecondition } from './testStatus.fixture';
import { Logger } from '../utils/Logger';
import { env } from '../constants/EnvironmentConfig';
import { approvePending, payerIdByName } from '../utils/NetworkProvisioning';
import {
  deletePlanById,
  provisionPlan,
  readPlan,
  submitPlan,
  waitForPlanStatusCode,
  type PlanSpec,
  type ProvisionedPlan,
} from '../utils/PlanProvisioning';
import { formularyStatusIds, listFormularies, suiteFormulary, type FormularyOption } from '../utils/FormularyProvisioning';
import { PLAN_SUITE } from '../data/plans/planSuite.data';
import { NetworkUtils } from '../utils/NetworkUtils';
import { ApiEndpoints } from '../constants/ApiEndpoints';

/** The states a plan case can ask to start from. */
export type PlanState =
  /** Created, never submitted - "Not Live", `v0 · Draft`. */
  | 'Draft'
  /** Created and submitted, awaiting a checker - `v0 · Pending Approval`. */
  | 'PendingApproval'
  /** Approved with an effective date two days out - reads Pending ("Future"). */
  | 'Pending'
  /** Approved once its effective time had passed - Active at once. */
  | 'Active'
  /** Active, then inactivated (API) and the inactivation approved. */
  | 'Inactive'
  /** Submitted, then rejected by the checker. */
  | 'Rejected'
  // ---- plan folder 16 / 22 additions (2026-10-27) ----
  /**
   * A short-lived plan (expiring minutes after it went live) the lifecycle job
   * has expired - the network fixture's 'Expired' recipe. Not yet verified live.
   */
  | 'Expired'
  /**
   * Approved with an effective date two days out (Pending), then inactivated and
   * the inactivation approved BEFORE it went live - an Inactive plan whose
   * effective date has not arrived (US 14329). BLOCKED, with the server's
   * answer, when the application refuses to inactivate a not-yet-live plan.
   */
  | 'InactiveFuture'
  // ---- plan folder 17 / 18 / 25 / 28 additions (2026-10-27) ----
  /**
   * Active, with a further change (an inactivation, the one change the screens
   * offer on a published plan) staged and SENT FOR APPROVAL but not decided -
   * the plan is still live while `vN · Pending Approval` waits in the queue.
   * The precondition of "a plan that already has a change awaiting approval"
   * and of every "approve the new version" case.
   */
  | 'PendingChange';

export interface PlanModuleFixtures {
  /**
   * Builds a plan for this case in the wanted state and returns it.
   *
   * Provisioned through the application's API (utils/PlanProvisioning.ts) with
   * the Plans suite's formulary (data/plans/planSuite.data.ts), never sampled
   * from the list. Drafts it built are discarded at teardown; anything published
   * is left (deleting a live plan is itself an approval round trip).
   *
   * BLOCKED, not failed, when the state cannot be reached - the rule under test
   * was never exercised then.
   */
  planIn: (state: PlanState, spec?: PlanSpec) => Promise<ProvisionedPlan>;
  /** The formulary the suite assigns to its plans (Active, of the suite payer), or BLOCKED. */
  planFormulary: () => Promise<FormularyOption>;
  /** Another Active formulary of a DIFFERENT payer - for the cross-payer refusal cases - or BLOCKED. */
  foreignFormulary: () => Promise<FormularyOption>;
  planDetailPage: PlanDetailPage;
  planApprovalsPage: ApprovalManagementPage;
  planInactivateDialog: PlanInactivateDialog;
  // ---- plan folder 17 / 18 / 26 additions (2026-10-27) ----
  /**
   * A SECOND Active formulary of the suite payer (not the one planIn assigns) -
   * for the cases that change a plan's formulary to a different one - or BLOCKED.
   */
  alternatePlanFormulary: () => Promise<FormularyOption>;
  /**
   * A plan created and SENT FOR APPROVAL by the session behind `page` (another
   * signed-in account, e.g. nonAdminSession.page), with an Active formulary of
   * `spec.payerName` - so the request's submitter is that account, not the
   * administrator. For the maker-checker cases where the administrator is the
   * independent reviewer. BLOCKED (with the reason) when that payer has no
   * Active formulary or the account may not create / submit plans. Discarded at
   * teardown through the administrator session while it is still unapproved.
   */
  planSubmittedFrom: (page: Page, spec: PlanSpec & { payerName: string }) => Promise<ProvisionedPlan>;
}

/** Stages an inactivation of a live plan through the API (first reason offered) and sends it for approval. */
async function stageAndSubmitInactivation(page: Page, plan: ProvisionedPlan): Promise<void> {
  const reason = await NetworkUtils.requestAsSession(page, 'GET', ApiEndpoints.planInactivationReasonLookup);
  const reasonId = (JSON.parse(reason.text) as { payload: { id: string }[] }).payload[0].id;
  const staged = await NetworkUtils.postAsSession(page, ApiEndpoints.planInactivate, {
    id: plan.id,
    inactivationReasonId: reasonId,
    inactivationDetails: 'Staged to provision a case precondition.',
  });
  if (staged.status >= 300) throw new Error(`InactivatePlan answered ${staged.status} ${staged.text.slice(0, 300)}`);
  await submitPlan(page, plan.id, plan.name);
}

const TWO_DAYS = 2 * 24 * 60;

/**
 * Stages a plan's inactivation through the API (first reason offered), sends it
 * and approves it, then waits for Inactive. Shared by 'Inactive' and
 * 'InactiveFuture' (moved here from the 'Inactive' branch, plan folder 22, 2026-10-27).
 */
async function inactivateAndApprove(page: Page, plan: ProvisionedPlan): Promise<void> {
  Logger.step(`[fixture] Inactivating "${plan.name}" to provision an Inactive plan`);
  const reason = await NetworkUtils.requestAsSession(page, 'GET', ApiEndpoints.planInactivationReasonLookup);
  const reasonId = (JSON.parse(reason.text) as { payload: { id: string }[] }).payload[0].id;
  const staged = await NetworkUtils.postAsSession(page, ApiEndpoints.planInactivate, {
    id: plan.id,
    inactivationReasonId: reasonId,
    inactivationDetails: 'Inactivated to provision a case precondition.',
  });
  if (staged.status >= 300) throw new Error(`InactivatePlan answered ${staged.status} ${staged.text.slice(0, 300)}`);
  await submitPlan(page, plan.id, plan.name);
  await approvePending(page, plan.name);
  await waitForPlanStatusCode(page, plan.id, 'inactive', 2 * 60_000);
}

export const test = base.extend<PlanModuleFixtures>({
  planIn: async ({ page }, use, testInfo) => {
    const built: ProvisionedPlan[] = [];

    await use(async (state, spec = {}) => {
      try {
        if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
        if (state === 'Draft') {
          const plan = await provisionPlan(page, { ...spec, draftOnly: true });
          built.push(plan);
          return plan;
        }
        if (state === 'PendingApproval') {
          const plan = await provisionPlan(page, { ...spec, submitOnly: true });
          built.push(plan);
          return plan;
        }
        if (state === 'Rejected') {
          const plan = await provisionPlan(page, { ...spec, submitOnly: true });
          built.push(plan);
          const approvals = new ApprovalManagementPage(page, 'plan');
          await approvals.open();
          await approvals.reject(plan.name);
          return plan;
        }
        if (state === 'Pending') {
          const plan = await provisionPlan(page, { effectiveInMinutes: TWO_DAYS, ...spec });
          await waitForPlanStatusCode(page, plan.id, 'pending', 2 * 60_000);
          return plan;
        }
        if (state === 'Expired') {
          // Effective in a minute, expiring a few minutes later: the job (every
          // minute here) takes it Active -> Expired (plan folder 16 addition).
          const plan = await provisionPlan(page, { effectiveInMinutes: 1, expiryInMinutes: 5, ...spec });
          await waitForPlanStatusCode(page, plan.id, 'expired', 12 * 60_000);
          return plan;
        }
        if (state === 'InactiveFuture') {
          const plan = await provisionPlan(page, { effectiveInMinutes: TWO_DAYS, ...spec });
          await waitForPlanStatusCode(page, plan.id, 'pending', 2 * 60_000);
          await inactivateAndApprove(page, plan);
          return plan;
        }
        const plan = await provisionPlan(page, spec);
        await waitForPlanStatusCode(page, plan.id, 'active', 4 * 60_000);
        if (state === 'Active') return plan;
        if (state === 'PendingChange') {
          // plan folder 17 / 18 / 25 / 28 addition: live, with a change awaiting a decision.
          Logger.step(`[fixture] Staging a change on "${plan.name}" and sending it for approval`);
          await stageAndSubmitInactivation(page, plan);
          return plan;
        }

        await inactivateAndApprove(page, plan);
        return plan;
      } catch (error) {
        return blockedByPrecondition(testInfo, `a plan in state ${state}`, error);
      }
    });

    for (const plan of built) {
      const record = await readPlan(page, plan.id).catch(() => null);
      if (record && (record.isPendingCreate || /^PLN-D-/.test(record.planCode ?? ''))) {
        await deletePlanById(page, plan.id).catch(() => undefined);
        Logger.step(`[fixture] Discarded the case's draft plan "${plan.name}"`);
      }
    }
  },

  planFormulary: async ({ page }, use, testInfo) => {
    await use(async () => {
      try {
        if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
        return await suiteFormulary(page, PLAN_SUITE.payerName);
      } catch (error) {
        return blockedByPrecondition(testInfo, `an Active formulary of "${PLAN_SUITE.payerName}"`, error);
      }
    });
  },

  foreignFormulary: async ({ page }, use, testInfo) => {
    await use(async () => {
      try {
        if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
        const own = await suiteFormulary(page, PLAN_SUITE.payerName);
        const all = await listFormularies(page);
        const active = all.find((f) => f.id === own.id)?.statusId ?? own.statusId;
        const other = all.find((f) => f.payerId !== own.payerId && f.statusId === active && Boolean(f.formularyCode));
        if (!other) throw new Error('no Active formulary of another payer is in the register');
        return other;
      } catch (error) {
        return blockedByPrecondition(testInfo, 'an Active formulary of a different payer', error);
      }
    });
  },

  // ---- plan folder 17 / 18 / 26 additions (2026-10-27) ----
  alternatePlanFormulary: async ({ page }, use, testInfo) => {
    await use(async () => {
      try {
        if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
        const own = await suiteFormulary(page, PLAN_SUITE.payerName);
        const active = (await formularyStatusIds(page)).active ?? own.statusId;
        const other = (await listFormularies(page)).find((f) =>
          f.payerId === own.payerId
          && f.id !== own.id
          && f.statusId === active
          && Boolean(f.formularyCode)
          && !/-D-/.test(f.formularyCode ?? ''));
        if (!other) throw new Error(`"${PLAN_SUITE.payerName}" holds no Active formulary besides ${own.formularyCode ?? own.id}`);
        return other;
      } catch (error) {
        return blockedByPrecondition(testInfo, `a second Active formulary of "${PLAN_SUITE.payerName}"`, error);
      }
    });
  },

  planSubmittedFrom: async ({ page }, use, testInfo) => {
    const built: ProvisionedPlan[] = [];
    await use(async (submitter, spec) => {
      try {
        if (!/^https?:/.test(page.url())) await page.goto(env.baseUrl);
        const payerId = await payerIdByName(page, spec.payerName);
        const active = (await formularyStatusIds(page)).active;
        const formulary = (await listFormularies(page)).find((f) =>
          f.payerId === payerId && f.statusId === active && Boolean(f.formularyCode) && !/-D-/.test(f.formularyCode ?? ''));
        if (!formulary) throw new Error(`"${spec.payerName}" holds no Active formulary to assign`);
        const plan = await provisionPlan(submitter, { ...spec, formularyId: formulary.id, submitOnly: true });
        built.push(plan);
        return plan;
      } catch (error) {
        return blockedByPrecondition(testInfo, `a plan of "${spec.payerName}" submitted by the second account`, error);
      }
    });
    for (const plan of built) {
      const record = await readPlan(page, plan.id).catch(() => null);
      if (record && (record.isPendingCreate || /^PLN-D-/.test(record.planCode ?? ''))) {
        await deletePlanById(page, plan.id).catch(() => undefined);
        Logger.step(`[fixture] Discarded the second account's plan "${plan.name}"`);
      }
    }
  },

  planDetailPage: async ({ page }, use) => {
    await use(new PlanDetailPage(page));
  },

  planApprovalsPage: async ({ page }, use) => {
    await use(new ApprovalManagementPage(page, 'plan'));
  },

  planInactivateDialog: async ({ page }, use) => {
    await use(new PlanInactivateDialog(page));
  },
});
