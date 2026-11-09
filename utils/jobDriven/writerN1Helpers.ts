import type { Page, TestInfo } from '@playwright/test';
import { NetworkUtils } from '../NetworkUtils';
import { Logger } from '../Logger';
import { riyadhDate } from '../JobClock';
import {
  assignableFacilityIds,
  pendingRequestId,
  provisionNetwork,
  type ProvisionedNetwork,
} from '../NetworkProvisioning';
import { auditEntryDetail, networkAuditTrail, networkSnapshot, type AuditEntry, type LifecycleSnapshot } from './lifecycle';
import { NETWORK_STATUS_BY_ID } from '../../constants/jobDriven/networkStatusIds';
import type { ClaimedJobSeed } from './jobSeeds';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { NETWORK_FACILITIES } from '../../constants/ElementIds';
import { APPROVE_REQUEST_ENDPOINT, ASSIGN_FACILITIES_ENDPOINT } from '../../data/networks/seedNetworks.data';

/**
 * Writer N1 helpers (2026-11-08) - what the job-driven Network cases of
 * folders 09 / 13 / 30 (and the single cases of 05 / 14 / 19 / 29 / 31 / 33)
 * need around a claimed job seed. Built on the foundation's contract:
 * `requireJobSeed` / `findJobSeeds` (jobSeeds.ts), `networkSnapshot` /
 * `networkAuditTrail` (lifecycle.ts). Nothing here moves a job.
 */

type Answer = { status: number; text: string };

/** "Future -> F1 Active -> Inactive -> Expired (now Expired)" - for assertion messages. */
export function seedTrail(seed: ClaimedJobSeed): string {
  const s = (x: LifecycleSnapshot | null): string => x?.status ?? '?';
  const inactivation = seed.afterInactivation ? ` -> inactivated ${s(seed.afterInactivation)}` : '';
  return `"${seed.name}": built ${s(seed.before)} -> F1 ${s(seed.afterF1)}${inactivation} -> F2 ${s(seed.after)} (now ${s(seed.now)}; expected ${seed.expected})`;
}

/** DD/MM/YYYY of an instant on the Riyadh calendar - how the overview prints a date. */
export function riyadhDisplayDate(at: string | Date | number): string {
  const [y, m, d] = riyadhDate(at).split('-');
  return `${d}/${m}/${y}`;
}

/** An audit entry's instant (ms), whichever time field the feed carries; null when none parses. */
export function entryTime(entry: AuditEntry): number | null {
  for (const key of ['occurredAtUtc', 'occurredAt', 'createdOn', 'timestamp', 'changedOn']) {
    const value = entry[key];
    if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return Date.parse(value);
  }
  return null;
}

/** The whole entry as text (its before / after values live in nested fields). */
export const entryText = (entry: AuditEntry): string => JSON.stringify(entry);

/**
 * The audit entries of a network that record its status becoming `to` (Active / Expired ...).
 *
 * The Audit History feed rows carry no status names: a STATUS_CHANGE row's
 * change lives in its detail (GetAuditLogById) as `beforeJson` / `afterJson`
 * StatusId values, and an administrator's inactivation is an UPDATE row whose
 * detail turns `IsActive` true -> false (the stored status stays Active).
 * So each row's detail is read and labelled `fromStatus` / `toStatus`
 * (shown names) - matching on the feed text alone found nothing (2026-11-08).
 */
export async function statusEntries(page: Page, networkId: string, to: string): Promise<AuditEntry[]> {
  const all = await networkAuditTrail(page, networkId, 100);
  const labelled: AuditEntry[] = [];
  for (const entry of all) {
    if (entry.actionType !== 'STATUS_CHANGE' && entry.actionType !== 'UPDATE') continue;
    const detail = await auditEntryDetail(page, String(entry.id));
    const parse = (raw: unknown): Record<string, unknown> => {
      try { return JSON.parse(String(raw ?? '{}')) as Record<string, unknown>; } catch { return {}; }
    };
    const before = parse(detail?.beforeJson);
    const after = parse(detail?.afterJson);
    let fromStatus: string | undefined;
    let toStatus: string | undefined;
    if (typeof after.StatusId === 'string') {
      fromStatus = NETWORK_STATUS_BY_ID[String(before.StatusId)] ?? String(before.StatusId ?? '');
      toStatus = NETWORK_STATUS_BY_ID[after.StatusId] ?? after.StatusId;
    } else if (typeof after.IsActive === 'boolean' && before.IsActive !== after.IsActive) {
      fromStatus = after.IsActive ? 'Inactive' : 'Active';
      toStatus = after.IsActive ? 'Active' : 'Inactive';
    }
    if (!toStatus) continue;
    labelled.push({ ...entry, fromStatus, toStatus, beforeJson: detail?.beforeJson, afterJson: detail?.afterJson });
  }
  return labelled.filter((e) => e.toStatus === to);
}

/** The audit entries recorded at or after `from` (ISO), newest first as the feed gives them. */
export function entriesSince(entries: AuditEntry[], from: string | null | undefined): AuditEntry[] {
  if (!from) return entries;
  const since = Date.parse(from) - 60_000;
  return entries.filter((e) => (entryTime(e) ?? 0) >= since);
}

/**
 * Records, as a visible annotation, a part of a case that this environment
 * cannot exercise (a row the application cannot hold, a second run that did
 * not happen). The asserted parts still decide the outcome.
 */
export function notExercised(testInfo: TestInfo, what: string): void {
  testInfo.annotations.push({ type: 'not-exercised', description: what });
  Logger.warn(`[not exercised] ${what}`);
}

/**
 * Whether the seed run that made `seed` was followed, the same day, by ANOTHER
 * seed run - whose firings then re-ran the job over this already-transitioned
 * seed. (A second `npm run seed:network-jobs` merges its records into the day's
 * manifest and the manifest carries the LATEST firings.)
 */
export function laterRunOver(seed: ClaimedJobSeed): boolean {
  if (!seed.firings || !seed.after?.readAt) return false;
  return Date.parse(seed.firings.f1) > Date.parse(seed.after.readAt);
}

// ---- eligibility at approval: a network with no pharmacy -------------------------

export interface NoFacilityAttempt {
  network: ProvisionedNetwork;
  submit: Answer;
  /** null when the submission was refused, so no approval could be attempted. */
  approve: Answer | null;
  after: LifecycleSnapshot | null;
}

/**
 * Builds a suite network WITHOUT a pharmacy (effective a few minutes ahead, so
 * the date condition is met by the time the job could run), sends it for
 * approval and tries to approve it - the go-live rule refuses it (verified
 * 2026-11-08: ApproveRequest 409). Reports every answer; asserts nothing.
 */
export async function attemptGoLiveWithoutFacility(page: Page): Promise<NoFacilityAttempt> {
  const network = await provisionNetwork(page, { facilities: 0, draftOnly: true, effectiveInMinutes: 3 });
  const submit = await NetworkUtils.postAsSession(page, ApiEndpoints.networkSubmit, { networkId: network.id });
  let approve: Answer | null = null;
  if (submit.status < 300) {
    const requestId = await pendingRequestId(page, network.name);
    approve = requestId
      ? await NetworkUtils.postAsSession(page, APPROVE_REQUEST_ENDPOINT, { id: requestId })
      : { status: 0, text: 'no pending approval request was found for the submission' };
  }
  const after = await networkSnapshot(page, network.id).catch(() => null);
  Logger.step(`[N1] "${network.name}" without a pharmacy: submit ${submit.status}, approve ${approve?.status ?? '-'}, reads ${after?.status ?? '?'}`);
  return { network, submit, approve, after };
}

export interface FacilityAddedApproval {
  facilityCode: string;
  assign: Answer;
  submit: Answer;
  approve: Answer;
  after: LifecycleSnapshot | null;
}

/**
 * Gives the network one assignable pharmacy (reverting a pending submission to
 * draft if one is open), sends it again and approves it. Reports the answers.
 */
export async function addFacilityAndApprove(page: Page, network: ProvisionedNetwork): Promise<FacilityAddedApproval> {
  const pool = await assignableFacilityIds(page, network.id);
  const facility = pool[0];
  if (!facility) {
    const none = { status: 0, text: 'the Assign Facilities pool offered no pharmacy' };
    return { facilityCode: '', assign: none, submit: none, approve: none, after: await networkSnapshot(page, network.id).catch(() => null) };
  }
  const assign = await NetworkUtils.postAsSession(page, ASSIGN_FACILITIES_ENDPOINT, {
    networkId: network.id,
    facilityIds: [facility.id],
    confirmRevertToDraft: true,
  });
  const submit = await NetworkUtils.postAsSession(page, ApiEndpoints.networkSubmit, { networkId: network.id });
  const requestId = await pendingRequestId(page, network.name);
  const approve = requestId
    ? await NetworkUtils.postAsSession(page, APPROVE_REQUEST_ENDPOINT, { id: requestId })
    : { status: 0, text: 'no pending approval request was found' };
  const after = await networkSnapshot(page, network.id).catch(() => null);
  Logger.step(`[N1] "${network.name}" + ${facility.facilityCode}: assign ${assign.status}, submit ${submit.status}, approve ${approve.status}, reads ${after?.status ?? '?'}`);
  return { facilityCode: facility.facilityCode, assign, submit, approve, after };
}

// ---- the Facility Assignment tab's badges (18107) ---------------------------------

/** Every assignment badge of the open Facility Assignment tab: its text and its visual tone. */
export async function readAssignmentBadges(page: Page): Promise<{ label: string; tone: string; className: string }[]> {
  // The badges share one id per column (see NETWORK_FACILITIES); every one on the open tab is read.
  return page.locator(`[id="${NETWORK_FACILITIES.assignmentBadge}"]`).evaluateAll((els) =>
    els.map((el) => ({
      label: (el as HTMLElement).innerText.trim(),
      tone: el.getAttribute('data-tone') ?? '',
      className: el.getAttribute('class') ?? '',
    })));
}

/** Seconds -> the time a seed's firing happened, for messages. */
export const firingOf = (seed: ClaimedJobSeed, which: 'f1' | 'f2'): string => seed.firings?.[which] ?? '(no firing recorded)';
