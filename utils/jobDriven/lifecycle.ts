import type { Page } from '@playwright/test';
import { NetworkUtils } from '../NetworkUtils';
import { Logger } from '../Logger';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import {
  DISPOSABLE_NETWORK_PREFIX,
  approvePending,
  networkStatusLabels,
  provisionNetwork,
  readNetwork,
  submitNetwork,
  type NetworkSpec,
  type ProvisionedNetwork,
} from '../NetworkProvisioning';
import {
  DISPOSABLE_PLAN_PREFIX,
  planStatusLabels,
  provisionPlan,
  readPlan,
  submitPlan,
  type PlanSpec,
  type ProvisionedPlan,
} from '../PlanProvisioning';
import { waitFor, type WaitForOptions, type WaitForResult } from '../JobClock';

/**
 * Job-driven lifecycle helpers for the Network / Plans "Manual" stories
 * (2026-11-08) - what the cases need around a lifecycle-job firing. Request
 * shapes verified live on 2026-11-08 (reports/manual-automation/Foundation-Notes.md).
 *
 * THE RULE THE CASES HINGE ON (verified 2026-11-08): approval NEVER makes a
 * network or plan Active, even when its effective time has passed - it reads
 * Future ("pending") until the lifecycle job runs; expiry is likewise only
 * applied by the job. Both the stored `statusId` and the displayed
 * `effectiveStatusId` move together at the job; a manual inactivation moves
 * `effectiveStatusId` (and isActive) at approval.
 */

// ---- snapshots ----------------------------------------------------------------------

/** What a case reads off a network or plan around a job firing. */
export interface LifecycleSnapshot {
  id: string;
  code: string | null;
  /** Displayed status label (effectiveStatusId): Future / Active / Inactive / Expired. */
  status: string;
  /** Stored status label (statusId). */
  storedStatus: string;
  isActive: boolean;
  effectiveDate: string;
  expiryDate: string;
  versionStatusCode: string | null;
  currentVersion: number | null;
  hasPendingVersion: boolean;
  /** When the snapshot was read (ISO). */
  readAt: string;
}

let networkLabels: Record<string, string> | null = null;
let planLabels: Record<string, string> | null = null;

/** One network's status, labelled. */
export async function networkSnapshot(page: Page, id: string): Promise<LifecycleSnapshot> {
  networkLabels ??= await networkStatusLabels(page);
  const r = await readNetwork(page, id);
  const eff = r.effectiveStatusId ?? r.statusId;
  return {
    id,
    code: r.networkCode,
    status: networkLabels[eff] ?? eff,
    storedStatus: networkLabels[r.statusId] ?? r.statusId,
    isActive: r.isActive,
    effectiveDate: r.effectiveDate,
    expiryDate: r.expiryDate,
    versionStatusCode: r.versionStatusCode,
    currentVersion: r.currentVersion ?? null,
    hasPendingVersion: Boolean(r.hasPendingVersion),
    readAt: new Date().toISOString(),
  };
}

/** One plan's status, labelled. */
export async function planSnapshot(page: Page, id: string): Promise<LifecycleSnapshot> {
  planLabels ??= await planStatusLabels(page);
  const r = await readPlan(page, id);
  const eff = r.effectiveStatusId ?? r.statusId;
  return {
    id,
    code: r.planCode,
    status: planLabels[eff] ?? eff,
    storedStatus: planLabels[r.statusId] ?? r.statusId,
    isActive: r.isActive,
    effectiveDate: r.effectiveDate,
    expiryDate: r.expiryDate,
    versionStatusCode: r.versionStatusCode ?? null,
    currentVersion: (r.currentVersion as number | undefined) ?? null,
    hasPendingVersion: Boolean(r.hasPendingVersion),
    readAt: new Date().toISOString(),
  };
}

/** Polls a network until its DISPLAYED status label is `status` (bounded; never throws). */
export async function waitForNetworkStatus(
  page: Page,
  id: string,
  status: 'Future' | 'Active' | 'Inactive' | 'Expired',
  options: WaitForOptions = {},
): Promise<WaitForResult<LifecycleSnapshot>> {
  return waitFor(page, () => networkSnapshot(page, id), (s) => s.status === status, { intervalMs: 5_000, describe: `network ${id} reads ${status}`, ...options });
}

/** Polls a plan until its DISPLAYED status label is `status` (bounded; never throws). */
export async function waitForPlanStatus(
  page: Page,
  id: string,
  status: 'Future' | 'Active' | 'Inactive' | 'Expired',
  options: WaitForOptions = {},
): Promise<WaitForResult<LifecycleSnapshot>> {
  return waitFor(page, () => planSnapshot(page, id), (s) => s.status === status, { intervalMs: 5_000, describe: `plan ${id} reads ${status}`, ...options });
}

// ---- building records at fixed instants ---------------------------------------------

const minutesUntil = (at: Date): number => (at.getTime() - Date.now()) / 60_000;

/**
 * An APPROVED suite network ("Automation Network ...") effective at `effectiveAt`
 * and expiring at `expiryAt` (exact instants - the job compares date-times).
 * It reads Future until the network job runs after `effectiveAt`. The
 * application refuses an effective time in the past (create 422) and a
 * network with no facility at approval (409) - see the notes.
 */
export async function approvedNetworkAt(
  page: Page,
  times: { effectiveAt: Date; expiryAt?: Date },
  spec: NetworkSpec = {},
): Promise<ProvisionedNetwork> {
  return provisionNetwork(page, {
    ...spec,
    effectiveInMinutes: minutesUntil(times.effectiveAt),
    ...(times.expiryAt ? { expiryInMinutes: minutesUntil(times.expiryAt) } : {}),
  });
}

/**
 * An APPROVED suite plan ("Automation Plan ...", payer "Al sharq", formulary
 * FORM-0023 assigned READ-ONLY) effective at `effectiveAt`, expiring at
 * `expiryAt`. Approved straight away (approval timing does not matter: it
 * reads Future until the plan job runs after `effectiveAt`).
 */
export async function approvedPlanAt(
  page: Page,
  times: { effectiveAt: Date; expiryAt?: Date },
  spec: PlanSpec = {},
): Promise<ProvisionedPlan> {
  const plan = await provisionPlan(page, {
    ...spec,
    // > 5 min so provisionPlan does not wait for the effective time before approving;
    // the real instants are applied below through the create body's own minutes.
    effectiveInMinutes: minutesUntil(times.effectiveAt),
    ...(times.expiryAt ? { expiryInMinutes: minutesUntil(times.expiryAt) } : {}),
    submitOnly: true,
  });
  await approvePending(page, plan.name);
  plan.stage = 'approved';
  return plan;
}

// ---- status changes through the approval flow ----------------------------------------

type Answer = { status: number; text: string; validationErrors: string[] };

const must = (what: string, res: Answer): void => {
  if (res.status >= 300) throw new Error(`${what} answered ${res.status} ${res.text.slice(0, 300)}`);
};

const firstReasonId = async (page: Page, lookup: string): Promise<string | null> => {
  const res = await NetworkUtils.requestAsSession(page, 'GET', lookup);
  return res.status === 200 ? ((JSON.parse(res.text) as { payload?: { id: string }[] }).payload ?? [])[0]?.id ?? null : null;
};

/**
 * Inactivates a SUITE network: POST InactivateNetwork `{ id, inactivationReasonId,
 * inactivationDetails }` (stages vN+1) -> SubmitNetworkForApproval `{ networkId }`
 * -> ApproveRequest. The displayed status is Inactive at approval (statusId stays
 * Active). Refuses a network without the disposable prefix.
 */
export async function inactivateSuiteNetwork(page: Page, network: { id: string; name: string }, details = 'Inactivated by an automated job case.'): Promise<void> {
  if (!network.name.startsWith(DISPOSABLE_NETWORK_PREFIX)) throw new Error(`refusing to inactivate "${network.name}": not a suite network`);
  must('InactivateNetwork', await NetworkUtils.postAsSession(page, ApiEndpoints.networkSetInactive, {
    id: network.id,
    inactivationReasonId: await firstReasonId(page, ApiEndpoints.networkInactivationReasonLookup),
    inactivationDetails: details,
  }));
  await submitNetwork(page, network.id, network.name);
  await approvePending(page, network.name);
  Logger.step(`[job] Inactivated suite network "${network.name}" (approved)`);
}

/**
 * Inactivates a SUITE plan: POST InactivatePlan `{ id, inactivationReasonId,
 * inactivationDetails }` -> SubmitPlanForApproval `{ planId }` -> ApproveRequest.
 */
export async function inactivateSuitePlan(page: Page, plan: { id: string; name: string }, details = 'Inactivated by an automated job case.'): Promise<void> {
  if (!plan.name.startsWith(DISPOSABLE_PLAN_PREFIX)) throw new Error(`refusing to inactivate "${plan.name}": not a suite plan`);
  must('InactivatePlan', await NetworkUtils.postAsSession(page, ApiEndpoints.planInactivate, {
    id: plan.id,
    inactivationReasonId: await firstReasonId(page, ApiEndpoints.planInactivationReasonLookup),
    inactivationDetails: details,
  }));
  await submitPlan(page, plan.id, plan.name);
  await approvePending(page, plan.name);
  Logger.step(`[job] Inactivated suite plan "${plan.name}" (approved)`);
}

/**
 * Stages an edit of a SUITE network's expiry (PUT UpdateNetwork with the whole
 * record + `concurrencyStamp`, `confirmRevertToDraft: true`) and sends it for
 * approval; approves it too unless `approve` is false. Returns the answers.
 */
export async function changeNetworkExpiry(
  page: Page,
  network: { id: string; name: string },
  expiryAt: Date,
  options: { approve?: boolean } = {},
): Promise<{ update: Answer; submitted: boolean; approved: boolean }> {
  if (!network.name.startsWith(DISPOSABLE_NETWORK_PREFIX)) throw new Error(`refusing to edit "${network.name}": not a suite network`);
  const r = await readNetwork(page, network.id);
  const update = await NetworkUtils.requestAsSession(page, 'PUT', ApiEndpoints.networkUpdate, {
    networkNameEn: r.networkNameEn,
    networkNameAr: r.networkNameAr,
    networkTypeId: r.networkTypeId,
    payerId: r.payerId,
    descriptionEn: r.descriptionEn,
    descriptionAr: r.descriptionAr,
    effectiveDate: r.effectiveDate,
    expiryDate: expiryAt.toISOString(),
    id: r.id,
    concurrencyStamp: r.concurrencyStamp,
    confirmRevertToDraft: true,
  });
  if (update.status >= 300) return { update, submitted: false, approved: false };
  await submitNetwork(page, network.id, network.name);
  if (options.approve === false) return { update, submitted: true, approved: false };
  await approvePending(page, network.name);
  return { update, submitted: true, approved: true };
}

// ---- audit trails ---------------------------------------------------------------------

/** One entry of a network / plan Audit History feed. */
export interface AuditEntry {
  actionType?: string;
  actorLabel?: string;
  occurredAtUtc?: string;
  [key: string]: unknown;
}

const itemsOf = (res: Answer): AuditEntry[] => {
  if (res.status >= 300) return [];
  const payload = (JSON.parse(res.text) as { payload?: unknown }).payload as Record<string, unknown> | undefined;
  if (!payload) return [];
  if (Array.isArray((payload as { items?: unknown }).items)) return (payload as { items: AuditEntry[] }).items;
  const nested = Object.values(payload).find((v) => v && typeof v === 'object' && Array.isArray((v as { items?: unknown }).items)) as { items: AuditEntry[] } | undefined;
  return nested?.items ?? [];
};

/** A network's Audit History tab feed (POST GetNetworkAuditTrail), newest first. */
export async function networkAuditTrail(page: Page, networkId: string, rows = 50): Promise<AuditEntry[]> {
  return itemsOf(await NetworkUtils.postAsSession(page, ApiEndpoints.networkAuditTrail, { networkId, actionType: null, pageNumber: 1, rowsPerPage: rows }));
}

/** A plan's Audit History tab feed (POST GetPlanAuditTrail), newest first. */
export async function planAuditTrail(page: Page, planId: string, rows = 50): Promise<AuditEntry[]> {
  return itemsOf(await NetworkUtils.postAsSession(page, ApiEndpoints.planAuditTrail, { planId, actionType: null, pageNumber: 1, rowsPerPage: rows }));
}

/** The system-wide Audit Logs rows for one entity (POST GetAuditLogs `{ entityType, entityId }`). */
export async function systemAuditLog(page: Page, entityType: string, entityId: string, rows = 50): Promise<AuditEntry[]> {
  return itemsOf(await NetworkUtils.postAsSession(page, ApiEndpoints.auditLogList, { entityType, entityId, pageNumber: 1, rowsPerPage: rows }));
}

/**
 * One audit entry in full (POST GetAuditLogById `{ id }`): `actorLabel`
 * ("System" for the job), `occurredAtUtc` (+03:00), `beforeJson` / `afterJson`
 * (the stored fields as JSON text - parse them for the status ids).
 */
export async function auditEntryDetail(page: Page, id: string): Promise<Record<string, unknown> | null> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.auditLogById, { id });
  if (res.status >= 300) return null;
  return ((JSON.parse(res.text) as { payload?: Record<string, unknown> }).payload) ?? null;
}

/** The STATUS_CHANGE entries the job wrote (actor "System"), newest first. */
export async function systemStatusChanges(page: Page, suite: 'network' | 'plan', id: string): Promise<AuditEntry[]> {
  const trail = suite === 'network' ? await networkAuditTrail(page, id) : await planAuditTrail(page, id);
  return trail.filter((e) => e.actionType === 'STATUS_CHANGE' && e.actorLabel === 'System');
}
