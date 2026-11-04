import type { Page } from '@playwright/test';
import { NetworkUtils } from './NetworkUtils';
import { Logger } from './Logger';
import { ApiEndpoints } from '../constants/ApiEndpoints';
import { env } from '../constants/EnvironmentConfig';
import { ACCESS_TOKEN_KEY } from '../data/payers/lifecycleGuardrails.data';
import { toArabicToken } from '../data/payers/payer.data';
import { approvePending, networkStamp, payerIdByName, pendingRequestId } from './NetworkProvisioning';
import { provisionPlan } from './PlanProvisioning';

/**
 * Policies for the Policy suite (Feature 15164), built through the
 * application's own API - the same calls the Policy screens make, their bodies
 * CAPTURED from the screens on 2026-11-03 (reports/policy/Policy-Foundation-Notes.md).
 *
 * Every policy the suite creates is named `QA Automation Policy ...` under the
 * payer "Al sharq", on a suite plan (`QA Automation Policy Plan ...`, built
 * once with provisionPlan and reused) and, where a network is wanted, on an
 * ACTIVE network of that payer (the assign select offers active networks of
 * the policy's payer only). Nothing here changes a policy without the suite
 * prefix: every policy-level writer checks the name first (assertSuiteOwned).
 *
 * THE APPROVAL MODEL (verified live 2026-11-03): create -> v0 Draft ("Not
 * Live", POL-D-nnnn) -> Send for Approval -> the shared approvals hub
 * (GetApprovals / ApproveRequest, entity name = policy name) -> v1 Approved,
 * POL-2026-nnnn, status FUTURE. Every later change (edit, member, network,
 * document, inactivate, activate, delete) is STAGED as a draft of the next
 * version and needs Send for Approval + approve again. An approval needs at
 * least one network (409) and, for an INDIVIDUAL policy, at least one enrolled
 * member (409); a GROUP policy was approved with none.
 *
 * ACTIVE IS NOT REACHABLE ON DEMAND. The first approval reads Future even when
 * approved after the effective time, and neither a later approved change nor
 * an Inactivate -> Activate round re-derives it (the Formulary trick does not
 * work here). Policies turn Active only when the lifecycle job runs (seen
 * once a day; no lifecycle CRON is exposed in System Settings any more). The
 * suite therefore SEEDS policies the day before (seedActivePolicies,
 * `npm run seed:policy`) and `provisionSuitePolicy('Active')` claims one.
 */

export const SUITE_POLICY_PREFIX = 'QA Automation Policy';
/** Seeds for the Active state - "QA Automation Policy Seed <type> <stamp>" (seedActivePolicies). */
export const SEED_POLICY_PREFIX = `${SUITE_POLICY_PREFIX} Seed`;
/** The suite's own plan(s), reused across runs while they last. */
export const SUITE_POLICY_PLAN_PREFIX = `${SUITE_POLICY_PREFIX} Plan`;
/** A network the suite may create for its payer (Future until the network lifecycle job runs). */
export const SUITE_POLICY_NETWORK_PREFIX = `${SUITE_POLICY_PREFIX} Network`;
/** The suite's owning payer (the Plans / Formulary suite payer). */
export const POLICY_SUITE_PAYER = 'Al sharq';
/** The name prefix of the document stageTrivialChange adds. */
export const STAGED_DOCUMENT_PREFIX = 'Automation Staged Document';

export type PolicyAnswer = { status: number; text: string; validationErrors?: string[] };
type Answer = PolicyAnswer;

const fail = (name: string, what: string, res: Answer): never => {
  throw new Error(`could not provision policy "${name}": ${what} answered ${res.status} ${answerText(res).slice(0, 400)}`);
};

const payloadOrNull = <T>(res: Answer): T | null => {
  try {
    return (JSON.parse(res.text) as { payload: T }).payload ?? null;
  } catch {
    return null;
  }
};

/** Every message an answer carries (success message, title, error, validation reasons) as one string. */
export function answerText(res: Answer): string {
  try {
    const body = JSON.parse(res.text) as Record<string, unknown>;
    const parts = [body.successMessage, body.ErrorMessage, body.errorMessage, body.detail, body.message]
      .filter((v) => typeof v === 'string' && v !== '') as string[];
    const errors = (body.ValidationErrors ?? body.validationErrors ?? []) as { Reason?: string; reason?: string }[];
    for (const e of errors) parts.push(String(e.Reason ?? e.reason ?? ''));
    return parts.join(' | ') || res.text.slice(0, 400);
  } catch {
    return res.text.slice(0, 400);
  }
}

/** The validation reasons of an error answer ("A policy must have at least one assigned network ..."). */
export function answerReasons(res: Answer): string[] {
  try {
    const body = JSON.parse(res.text) as { ValidationErrors?: { Reason?: string }[]; ErrorMessage?: string };
    const reasons = (body.ValidationErrors ?? []).map((e) => String(e.Reason ?? ''));
    return reasons.length ? reasons : [String(body.ErrorMessage ?? '')].filter((r) => r !== '');
  } catch {
    return [];
  }
}

/** A unique stamp for suite names. */
export const policyStamp = (): string => `${Date.now().toString(36)}${Math.floor(Math.random() * 36 ** 3).toString(36)}`;

/** A fresh suite name: `QA Automation Policy <label> <stamp>`. */
export const suitePolicyName = (label = ''): string => `${SUITE_POLICY_PREFIX}${label ? ` ${label}` : ''} ${policyStamp()}`;

/** ISO time `minutes` from now. */
export const minutesFromNow = (minutes: number): string => new Date(Date.now() + minutes * 60_000).toISOString();

/** `DD/MM/YYYY HH:mm` (local time) - how the policy form's date-time pickers take and show a date. */
export function policyDateText(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** `DD/MM/YYYY` - the Add Documentation date picker (date only). */
export function policyDayText(value: Date | string): string {
  return policyDateText(value).slice(0, 10);
}

// ---- lookups ------------------------------------------------------------------

type LookupItem = { id: string; code: string; englishName: string; arabicName?: string };

async function lookupItems(page: Page, path: string): Promise<LookupItem[]> {
  const res = await NetworkUtils.requestAsSession(page, 'GET', path);
  return res.status < 300 ? (payloadOrNull<LookupItem[]>(res) ?? []) : [];
}

/** Policy status codes: `draft`, `pending` (label "Future"), `active`, `expired`, `terminated`, `inactive`. */
export type PolicyStatusCode = 'draft' | 'pending' | 'active' | 'expired' | 'terminated' | 'inactive';

/** The policyStatus lookup, code -> id. */
export async function policyStatusIds(page: Page): Promise<Record<string, string>> {
  return Object.fromEntries((await lookupItems(page, ApiEndpoints.policyStatusLookup)).map((i) => [i.code, i.id]));
}

/** The policyStatus lookup, id -> code. */
export async function policyStatusCodes(page: Page): Promise<Record<string, string>> {
  return Object.fromEntries((await lookupItems(page, ApiEndpoints.policyStatusLookup)).map((i) => [i.id, i.code]));
}

export type PolicyTypeCode = 'individual' | 'group';

export async function policyTypeId(page: Page, code: PolicyTypeCode = 'individual'): Promise<string> {
  const item = (await lookupItems(page, ApiEndpoints.policyTypeLookup)).find((i) => i.code === code);
  if (!item) throw new Error(`the policyType lookup has no "${code}"`);
  return item.id;
}

/** Relationship codes: `self`, `spouse`, `child`, `parent`, `other` (the Add Member drawer offers all but Self). */
export type RelationshipCode = 'self' | 'spouse' | 'child' | 'parent' | 'other';

export async function relationshipId(page: Page, code: RelationshipCode = 'spouse'): Promise<string> {
  const item = (await lookupItems(page, ApiEndpoints.memberRelationshipLookup)).find((i) => i.code === code);
  if (!item) throw new Error(`the memberRelationship lookup has no "${code}"`);
  return item.id;
}

/** Document types by English name ("Rider Addition", "Coverage Change", "Member Change", "Premium Adjustment", "Other"). */
export async function documentTypeId(page: Page, label = 'Other'): Promise<string> {
  const item = (await lookupItems(page, ApiEndpoints.endorsementTypeLookup)).find((i) => i.englishName === label || i.code === label);
  if (!item) throw new Error(`the endorsementType lookup has no "${label}"`);
  return item.id;
}

/** The Inactivate drawer's reasons: Contract Suspended, Payment Issue, Policy Holder Request, Compliance Issue, Other. */
export async function inactivationReasons(page: Page): Promise<LookupItem[]> {
  return lookupItems(page, ApiEndpoints.policyInactivationReasonLookup);
}

/** The approval module's rejection reasons. */
export async function rejectionReasons(page: Page): Promise<LookupItem[]> {
  return lookupItems(page, ApiEndpoints.approvalRejectionReasonLookup);
}

// ---- reading --------------------------------------------------------------------

/** One list row as GetPolicies answers it. */
export interface PolicyListItem {
  id: string;
  /** `POL-D-nnnn` until the first approval, then `POL-YYYY-nnnn`. */
  policyNumber: string;
  policyNameEn: string;
  policyNameAr: string;
  planId: string;
  planNameEn: string;
  policyTypeId: string;
  effectiveDate: string;
  expiryDate: string;
  gracePeriodDays: number | null;
  statusId: string;
  isActive: boolean;
  /** Read THIS one: an approved inactivation leaves statusId alone and moves effectiveStatusId to inactive. */
  effectiveStatusId: string;
  policyHolderId: string;
  /** "Self Holder" for an Individual policy. */
  policyHolderNames: string;
  memberCount: number;
  payerId: string;
  payerNameEn: string;
  maxMembers: number | null;
  currentVersion: number;
  hasPendingVersion: boolean;
  hasDraft: boolean;
  isPendingCreate: boolean;
  /** `draft` | `pendingApproval` | `rejected` | null (approved, nothing staged). */
  versionStatusCode: string | null;
  createdOn: string;
  [key: string]: unknown;
}

/** One policy as GetPolicy answers it. */
export interface PolicyRecord extends PolicyListItem {
  deductibleAmount: number;
  coinsurancePercent: number;
  outOfPocketMaximum: number;
  sublimitAmount: number;
  inactivationReasonId: string | null;
  inactivationDetails: string | null;
  inactivatedOn: string | null;
  benefitYear: { firstDay: string; lastDay: string; currentPeriodStart: string; currentPeriodEnd: string; nextResetOn: string | null; termsOverridden: boolean; resetCount: number; [key: string]: unknown };
  concurrencyStamp: string;
  networkCount: number;
  endorsementCount: number;
  rejectionReason: string | null;
  clonedFromPolicyId: string | null;
}

export async function readPolicyOrNull(page: Page, id: string): Promise<PolicyRecord | null> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.policyGet, { id });
  return res.status < 300 ? payloadOrNull<PolicyRecord>(res) : null;
}

export async function readPolicy(page: Page, id: string): Promise<PolicyRecord> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.policyGet, { id });
  const record = res.status < 300 ? payloadOrNull<PolicyRecord>(res) : null;
  if (!record) throw new Error(`GetPolicy ${id} answered ${res.status} ${answerText(res).slice(0, 200)}`);
  return record;
}

/**
 * The status the screens DISPLAY, as a code: `notLive` for a never-approved
 * policy (isPendingCreate), else the effective status code (`pending` = Future,
 * `active`, `inactive`, `expired`, `terminated`). '' when the policy is gone.
 */
export async function policyStatusCode(page: Page, id: string): Promise<string> {
  const record = await readPolicyOrNull(page, id);
  if (!record) return '';
  if (record.isPendingCreate) return 'notLive';
  return (await policyStatusCodes(page))[record.effectiveStatusId ?? record.statusId] ?? '';
}

/** The register (GetPolicies) with any criteria - `{ items, totalRows }`. */
export async function listPolicyRegister(page: Page, criteria: Record<string, unknown> = {}, rows = 100): Promise<{ items: PolicyListItem[]; totalRows: number }> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.policyList, { pageNumber: 1, rowsPerPage: rows, sortBy: 'CreatedOn desc', ...criteria });
  if (res.status >= 300) throw new Error(`GetPolicies answered ${res.status} ${res.text.slice(0, 200)}`);
  const list = payloadOrNull<{ policies: { items: PolicyListItem[]; totalRows: number } }>(res)?.policies;
  return { items: list?.items ?? [], totalRows: list?.totalRows ?? 0 };
}

/** The KPI source (GetPoliciesDashboard). */
export interface PolicyDashboard {
  total: number;
  draft: number;
  pending: number;
  active: number;
  inGracePeriod: number;
  expired: number;
  terminated: number;
  inactive: number;
}

export async function readPolicyDashboard(page: Page): Promise<PolicyDashboard> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.policyDashboard, {});
  const body = payloadOrNull<PolicyDashboard>(res);
  if (res.status >= 300 || !body) throw new Error(`GetPoliciesDashboard answered ${res.status} ${res.text.slice(0, 200)}`);
  return body;
}

/** A policy by its exact English name, or null. */
export async function findPolicyByName(page: Page, nameEn: string): Promise<PolicyListItem | null> {
  const { items } = await listPolicyRegister(page, { searchText: nameEn }, 50);
  return items.find((p) => p.policyNameEn === nameEn) ?? null;
}

/** Every suite policy in the register. */
export async function listSuitePolicies(page: Page): Promise<PolicyListItem[]> {
  const { items } = await listPolicyRegister(page, { searchText: SUITE_POLICY_PREFIX }, 500);
  return items.filter((p) => p.policyNameEn.startsWith(SUITE_POLICY_PREFIX));
}

/** Throws unless the policy is one the suite created (its name carries the suite prefix). */
export async function assertSuiteOwned(page: Page, policyId: string): Promise<PolicyRecord> {
  const record = await readPolicy(page, policyId);
  if (!record.policyNameEn.startsWith(SUITE_POLICY_PREFIX)) {
    throw new Error(`refusing to change policy "${record.policyNameEn}" (${record.policyNumber}): it is not a suite policy`);
  }
  return record;
}

/** One member row (GetPolicyMembers). `id` is the POLICY-member id (row ids, RemovePolicyMember, accumulator); `memberId` the person. */
export interface PolicyMember {
  id: string;
  policyId: string;
  memberId: string;
  memberCode: string;
  memberNameEn: string;
  memberNameAr: string;
  documentId: string;
  relationshipId: string;
  /** `live` (Enrolled) | `draftEnrollment` | `pendingEnrollment` | `draftRemoval` | `pendingRemoval`. */
  rosterState: string;
}

export async function readPolicyMembers(page: Page, policyId: string, criteria: Record<string, unknown> = {}): Promise<PolicyMember[]> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.policyMembers, { policyId, pageNumber: 1, rowsPerPage: 500, ...criteria });
  if (res.status >= 300) throw new Error(`GetPolicyMembers answered ${res.status} ${res.text.slice(0, 200)}`);
  return payloadOrNull<{ members: { items: PolicyMember[] } }>(res)?.members.items ?? [];
}

/** A member the Add Member picker offers (GetPolicyMemberCandidates). */
export interface MemberCandidate {
  id: string;
  memberCode: string;
  displayNameEn: string;
  displayNameAr: string;
  documentId: string;
  [key: string]: unknown;
}

/** The picker's pool for a search (>= 1 character via the API; the screen asks for 2). Enrolled members are NOT left out. */
export async function memberCandidates(page: Page, policyId: string, searchText = 'a'): Promise<MemberCandidate[]> {
  const res = await NetworkUtils.requestAsSession(page, 'GET', `${ApiEndpoints.policyMemberCandidates}?policyId=${policyId}&searchText=${encodeURIComponent(searchText)}`);
  if (res.status >= 300) throw new Error(`GetPolicyMemberCandidates answered ${res.status} ${answerText(res).slice(0, 200)}`);
  return payloadOrNull<MemberCandidate[]>(res) ?? [];
}

/** One network row (GetPolicyNetworks); `networkId` is also the row id. */
export interface PolicyNetwork {
  id: string;
  networkId: string;
  networkCode: string;
  networkNameEn: string;
  networkStatusId: string;
  assignedOn: string | null;
  /** `live` (Assigned) | `draftAssignment` | `pendingAssignment` | `draftRemoval` | `pendingRemoval`. */
  assignmentState: string;
}

export async function readPolicyNetworks(page: Page, policyId: string): Promise<PolicyNetwork[]> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.policyNetworks, { policyId, pageNumber: 1, rowsPerPage: 500 });
  if (res.status >= 300) throw new Error(`GetPolicyNetworks answered ${res.status} ${res.text.slice(0, 200)}`);
  return payloadOrNull<{ networks: PolicyNetwork[] }>(res)?.networks ?? [];
}

/** One document (GetPolicyEndorsements). */
export interface PolicyDocument {
  id: string;
  policyId: string;
  title: string;
  endorsementTypeId: string;
  effectiveDate: string;
  description: string;
  attachmentUri: string | null;
  attachmentFileName: string | null;
  createdByNameEn: string;
  createdOn: string;
  /** `live` (On policy) | `draftAttachment` | `pendingAttachment` | `draftRemoval` | `pendingRemoval`. */
  state: string;
}

export async function readPolicyDocuments(page: Page, policyId: string): Promise<PolicyDocument[]> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.policyDocuments, { policyId });
  if (res.status >= 300) throw new Error(`GetPolicyEndorsements answered ${res.status} ${res.text.slice(0, 200)}`);
  return payloadOrNull<{ endorsements: PolicyDocument[] }>(res)?.endorsements ?? [];
}

export interface PolicyVersion {
  id: string;
  version: number;
  isStatusChange: boolean;
  /** `draft` | `pendingApproval` | `published` | `rejected` | `superseded`. */
  versionStatusCode: string;
  versionStatusEn: string;
  /** Create, Update, Revert, Delete, Submit, Activate, Inactivate. */
  changeType: string;
  policyNameEn: string;
  statusId: string;
  networks: { networkId: string; networkCode: string; networkNameEn: string }[];
  requestedByNameEn?: string | null;
  reviewedByNameEn?: string | null;
  [key: string]: unknown;
}

export async function readPolicyVersions(page: Page, policyId: string): Promise<PolicyVersion[]> {
  const res = await NetworkUtils.requestAsSession(page, 'GET', `${ApiEndpoints.policyVersions}/${policyId}`);
  if (res.status >= 300) throw new Error(`GetPolicyVersions answered ${res.status} ${res.text.slice(0, 200)}`);
  return payloadOrNull<PolicyVersion[]>(res) ?? [];
}

export interface PolicyAuditEntry {
  id: string;
  entityType: string;
  entityId: string;
  /** CREATE, CLONED, UPDATE, DELETE, STATUS_CHANGE, MEMBER_ADDED, MEMBER_REMOVED, NETWORK_ASSIGNED, NETWORK_UNASSIGNED, ENDORSEMENT_CREATED, ENDORSEMENT_REMOVED, COB_CHANGED. */
  actionType: string;
  actorLabel: string;
  occurredAtUtc: string;
  [key: string]: unknown;
}

/** The policy's audit trail (first 500 entries). */
export async function readPolicyAuditTrail(page: Page, policyId: string, actionType: string | null = null): Promise<{ items: PolicyAuditEntry[]; totalRows: number }> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.policyAuditTrail, { policyId, actionType, pageNumber: 1, rowsPerPage: 500 });
  if (res.status >= 300) throw new Error(`GetPolicyAuditTrail answered ${res.status} ${res.text.slice(0, 200)}`);
  const body = payloadOrNull<{ items: PolicyAuditEntry[]; totalRows: number }>(res);
  return { items: body?.items ?? [], totalRows: body?.totalRows ?? 0 };
}

/** The Group holder select's options (GetPolicyHoldersDropdown): Acme Corporation, Globex Corporation, Neorx (2026-11-03). */
export async function policyHolders(page: Page, searchText = ''): Promise<{ id: string; nameEn: string; nameAr: string }[]> {
  const res = await NetworkUtils.requestAsSession(page, 'GET', `${ApiEndpoints.policyHoldersDropdown}?rowsPerPage=50${searchText ? `&searchText=${encodeURIComponent(searchText)}` : ''}`);
  return res.status < 300 ? (payloadOrNull<{ id: string; nameEn: string; nameAr: string }[]>(res) ?? []) : [];
}

/** The networks the assign select offers for a payer: ACTIVE networks of that payer only. */
export async function assignableNetworks(page: Page, payerId: string): Promise<{ id: string; networkNameEn: string; payerId: string }[]> {
  const res = await NetworkUtils.requestAsSession(page, 'GET', `${ApiEndpoints.networksDropdown}?payerId=${payerId}`);
  return res.status < 300 ? (payloadOrNull<{ id: string; networkNameEn: string; payerId: string }[]>(res) ?? []) : [];
}

/** The plans the policy form offers for a payer (GetPlansDropdown). */
export async function plansForPayer(page: Page, payerId: string): Promise<{ id: string; planCode: string; planNameEn: string; effectiveDate: string; expiryDate: string }[]> {
  const res = await NetworkUtils.requestAsSession(page, 'GET', `${ApiEndpoints.plansDropdown}?payerId=${payerId}`);
  return res.status < 300 ? (payloadOrNull<{ id: string; planCode: string; planNameEn: string; effectiveDate: string; expiryDate: string }[]>(res) ?? []) : [];
}

// ---- the suite's plan and network --------------------------------------------------

let cachedPlan: { payerId: string; id: string; name: string } | null = null;

/**
 * The suite's plan for `payerName`: a `QA Automation Policy Plan ...` the
 * policy form offers that runs at least 120 more days, else a new one
 * (provisionPlan - about a minute: it waits for its effective time and
 * approves). Cached for the run. The plan carries the Plans suite's formulary
 * (FORM-0023, read-only use).
 */
export async function suitePolicyPlan(page: Page, payerName = POLICY_SUITE_PAYER): Promise<{ id: string; name: string }> {
  const payerId = await payerIdByName(page, payerName);
  if (cachedPlan && cachedPlan.payerId === payerId) return cachedPlan;
  const horizon = Date.now() + 120 * 86_400_000;
  const offered = (await plansForPayer(page, payerId))
    .filter((p) => p.planNameEn.startsWith(SUITE_POLICY_PLAN_PREFIX) && Date.parse(p.expiryDate) > horizon)
    .sort((a, b) => Date.parse(b.expiryDate) - Date.parse(a.expiryDate));
  if (offered[0]) {
    cachedPlan = { payerId, id: offered[0].id, name: offered[0].planNameEn };
    return cachedPlan;
  }
  Logger.step(`[policy] No suite plan for "${payerName}" - provisioning one`);
  const plan = await provisionPlan(page, { nameEn: `${SUITE_POLICY_PLAN_PREFIX} ${networkStamp()}`, payerName, effectiveInMinutes: 1, expiryInMinutes: 2 * 365 * 24 * 60 });
  cachedPlan = { payerId, id: plan.id, name: plan.name };
  return cachedPlan;
}

/**
 * An ACTIVE network of the payer for a suite policy to link: the suite's own
 * (`QA Automation Policy Network ...`) when one is active, else the first the
 * assign select offers - READ-ONLY use, the network itself is never changed
 * (on 2026-11-03 the only active "Al sharq" network was NET-001093). Throws
 * with the screen's own reason when the payer has none.
 */
export async function suitePolicyNetwork(page: Page, payerId: string): Promise<{ id: string; name: string }> {
  const offered = await assignableNetworks(page, payerId);
  const own = offered.find((n) => n.networkNameEn.startsWith(SUITE_POLICY_NETWORK_PREFIX));
  const pick = own ?? offered[0];
  if (!pick) throw new Error(`no active network belongs to payer ${payerId}: "A policy can only be linked to networks of its own payer"`);
  return { id: pick.id, name: pick.networkNameEn };
}

// ---- writing: the policy ----------------------------------------------------------

export interface PolicyBasics {
  nameEn?: string;
  nameAr?: string;
  /**
   * Default `group` (a published GROUP policy can be deleted at teardown; a published
   * INDIVIDUAL one can only be retired - see discardSuitePolicy). Pass `individual`
   * for members on a non-Active policy: a Group policy takes members only once Active.
   */
  type?: PolicyTypeCode;
  /** Group only: the holder by English name (default the first offered, "Acme Corporation"). */
  holderName?: string;
  /** The owning payer by name (default "Al sharq") - the plan decides it. */
  payerName?: string;
  /** A plan id instead of the suite plan. */
  planId?: string;
  /** null / undefined = unlimited. */
  maxMembers?: number | null;
  gracePeriodDays?: number | null;
  deductibleAmount?: number;
  coinsurancePercent?: number;
  outOfPocketMaximum?: number;
  sublimitAmount?: number;
  /** Effective this many minutes from now (default 2 days: never in force by itself). "Now" or earlier is refused. */
  effectiveInMinutes?: number;
  /** Expiry this many days from now (default 60; must stay inside the plan's period). */
  expiryInDays?: number;
  /** Exact ISO dates, overriding the relative ones. */
  effectiveDate?: string;
  expiryDate?: string;
}

/** Sends CreatePolicy (the Add drawer's body) and returns the answer as is, with the new id. */
export async function requestCreatePolicy(page: Page, basics: PolicyBasics = {}): Promise<PolicyAnswer & { id: string | null; body: Record<string, unknown> }> {
  const type = basics.type ?? 'group';
  const planId = basics.planId ?? (await suitePolicyPlan(page, basics.payerName)).id;
  let holderId: string | null = null;
  if (type === 'group') {
    const holders = await policyHolders(page);
    const holder = basics.holderName ? holders.find((h) => h.nameEn === basics.holderName) : holders[0];
    if (!holder) throw new Error(`no policy holder "${basics.holderName ?? '(any)'}" is offered`);
    holderId = holder.id;
  }
  const body: Record<string, unknown> = {
    policyNameEn: basics.nameEn ?? suitePolicyName(),
    policyNameAr: basics.nameAr ?? `وثيقة ${toArabicToken(policyStamp())}`,
    planId,
    policyHolderId: holderId,
    effectiveDate: basics.effectiveDate ?? minutesFromNow(basics.effectiveInMinutes ?? 2 * 24 * 60),
    expiryDate: basics.expiryDate ?? new Date(Date.now() + (basics.expiryInDays ?? 60) * 86_400_000).toISOString(),
    gracePeriodDays: basics.gracePeriodDays ?? null,
    maxMembers: basics.maxMembers ?? null,
    deductibleAmount: basics.deductibleAmount ?? 0,
    coinsurancePercent: basics.coinsurancePercent ?? 0,
    outOfPocketMaximum: basics.outOfPocketMaximum ?? 0,
    sublimitAmount: basics.sublimitAmount ?? 0,
    policyTypeId: await policyTypeId(page, type),
  };
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.policyCreate, body);
  return { ...res, id: res.status < 300 ? (payloadOrNull<{ id: string }>(res)?.id ?? null) : null, body };
}

/**
 * UpdatePolicy with the current values plus `changes` (the Edit drawer's body).
 * Only a never-published policy is editable on screen. `confirmRevertToDraft`
 * answers the "Return this policy to draft?" prompt a pending one raises (without
 * it the server answers 200 `requiresDraftConfirmation: true` and saves nothing).
 */
export async function updatePolicyFields(
  page: Page,
  id: string,
  changes: Partial<Pick<PolicyRecord, 'policyNameEn' | 'policyNameAr' | 'planId' | 'policyHolderId' | 'effectiveDate' | 'expiryDate' | 'gracePeriodDays' | 'maxMembers' | 'deductibleAmount' | 'coinsurancePercent' | 'outOfPocketMaximum' | 'sublimitAmount'>> = {},
  options: { confirmRevertToDraft?: boolean; concurrencyStamp?: string } = {},
): Promise<PolicyAnswer> {
  const current = await assertSuiteOwned(page, id);
  return NetworkUtils.requestAsSession(page, 'PUT', ApiEndpoints.policyUpdate, {
    policyNameEn: current.policyNameEn,
    policyNameAr: current.policyNameAr,
    planId: current.planId,
    policyHolderId: current.policyHolderId === '00000000-0000-0000-0000-000000000000' ? null : current.policyHolderId,
    effectiveDate: current.effectiveDate,
    expiryDate: current.expiryDate,
    gracePeriodDays: current.gracePeriodDays,
    maxMembers: current.maxMembers,
    deductibleAmount: current.deductibleAmount,
    coinsurancePercent: current.coinsurancePercent,
    outOfPocketMaximum: current.outOfPocketMaximum,
    sublimitAmount: current.sublimitAmount,
    ...changes,
    id,
    concurrencyStamp: options.concurrencyStamp ?? current.concurrencyStamp,
    confirmRevertToDraft: options.confirmRevertToDraft ?? true,
  });
}

/** SubmitPolicyForApproval `{ policyId }` - the answer as is (409 when nothing is staged). */
export async function submitPolicy(page: Page, policyId: string): Promise<PolicyAnswer> {
  return NetworkUtils.postAsSession(page, ApiEndpoints.policySubmit, { policyId });
}

/** Approves the policy's pending request (the shared approvals module) by its name - throws with the server's answer when refused. */
export async function approvePolicy(page: Page, nameEn: string): Promise<void> {
  await approvePending(page, nameEn);
}

/** Approves the pending request and returns the answer as is (for the refusal cases: no network / no member 409). */
export async function requestApprovePolicy(page: Page, nameEn: string): Promise<PolicyAnswer> {
  const requestId = await pendingRequestId(page, nameEn);
  if (!requestId) return { status: -1, text: `no pending approval request for "${nameEn}"` };
  return NetworkUtils.postAsSession(page, ApiEndpoints.approvalApprove, { id: requestId });
}

/** The approval request id waiting for this policy, '' when none. */
export async function pendingPolicyRequestId(page: Page, nameEn: string): Promise<string> {
  return pendingRequestId(page, nameEn);
}

/** Rejects the pending request through RejectRequest `{ id, rejectionReasonId, reason }` (reason "Other"). */
export async function rejectPolicy(page: Page, nameEn: string, reason = 'Rejected by the automation suite.'): Promise<PolicyAnswer> {
  const requestId = await pendingRequestId(page, nameEn);
  if (!requestId) throw new Error(`no pending approval request for "${nameEn}"`);
  const reasons = await rejectionReasons(page);
  const other = reasons.find((r) => r.code === 'other') ?? reasons[0];
  return NetworkUtils.postAsSession(page, ApiEndpoints.approvalReject, { id: requestId, rejectionReasonId: other?.id ?? null, reason });
}

/** Submits whatever is staged and approves it. Throws with the server's answer. */
export async function publishPolicyChange(page: Page, policyId: string, nameEn: string): Promise<void> {
  const submitted = await submitPolicy(page, policyId);
  if (submitted.status >= 300) fail(nameEn, 'submit', submitted);
  await approvePolicy(page, nameEn);
}

const confirmQuery = (confirm: boolean): string => (confirm ? '?confirmRevertToDraft=true' : '');

/** DELETE DeletePolicy/{id} - a v0 is discarded at once ("The draft policy has been discarded."), a published one stages the deletion. */
export async function deletePolicy(page: Page, policyId: string, confirmRevertToDraft = true): Promise<PolicyAnswer> {
  return NetworkUtils.requestAsSession(page, 'DELETE', `${ApiEndpoints.policyDelete}/${policyId}${confirmQuery(confirmRevertToDraft)}`);
}

/** InactivatePolicy `{ id, inactivationReasonId, inactivationDetails, confirmRevertToDraft }` - staged (needs approval). */
export async function inactivatePolicy(
  page: Page,
  policyId: string,
  options: { reasonId?: string | null; details?: string; confirmRevertToDraft?: boolean } = {},
): Promise<PolicyAnswer> {
  await assertSuiteOwned(page, policyId);
  const reasonId = options.reasonId === undefined ? ((await inactivationReasons(page))[0]?.id ?? null) : options.reasonId;
  return NetworkUtils.postAsSession(page, ApiEndpoints.policyInactivate, {
    id: policyId,
    inactivationReasonId: reasonId,
    inactivationDetails: options.details ?? 'Inactivated by the automation suite.',
    confirmRevertToDraft: options.confirmRevertToDraft ?? true,
  });
}

/** SetPolicyActive `{ id, isActive: true, confirmRevertToDraft }` - Activate (staged). */
export async function activatePolicy(page: Page, policyId: string, confirmRevertToDraft = true): Promise<PolicyAnswer> {
  await assertSuiteOwned(page, policyId);
  return NetworkUtils.postAsSession(page, ApiEndpoints.policySetActive, { id: policyId, isActive: true, confirmRevertToDraft });
}

/** RevertPolicyVersion `{ policyId, targetVersion }` - stages that version as a draft. */
export async function revertPolicy(page: Page, policyId: string, targetVersion: number): Promise<PolicyAnswer> {
  await assertSuiteOwned(page, policyId);
  return NetworkUtils.postAsSession(page, ApiEndpoints.policyRevert, { policyId, targetVersion });
}

// ---- writing: members, networks, documents ---------------------------------------------

/** AddPolicyMember `{ policyId, memberId, relationshipId, confirmRevertToDraft }` (memberId = the PERSON's id, a candidate's `id`). */
export async function addPolicyMember(
  page: Page,
  policyId: string,
  memberId: string,
  options: { relationship?: RelationshipCode; confirmRevertToDraft?: boolean } = {},
): Promise<PolicyAnswer> {
  return NetworkUtils.postAsSession(page, ApiEndpoints.policyAddMember, {
    policyId,
    memberId,
    relationshipId: await relationshipId(page, options.relationship ?? 'spouse'),
    confirmRevertToDraft: options.confirmRevertToDraft ?? true,
  });
}

/** DELETE RemovePolicyMember/{policyId}/{policyMemberId} - staged on a published policy. */
export async function removePolicyMember(page: Page, policyId: string, policyMemberId: string, confirmRevertToDraft = true): Promise<PolicyAnswer> {
  return NetworkUtils.requestAsSession(page, 'DELETE', `${ApiEndpoints.policyRemoveMember}/${policyId}/${policyMemberId}${confirmQuery(confirmRevertToDraft)}`);
}

/**
 * Enrols `count` members the picker offers that the policy does not hold yet
 * and returns the candidates enrolled. Throws with the server's answer.
 */
export async function enrolMembers(page: Page, policyId: string, count: number, relationship: RelationshipCode = 'spouse'): Promise<MemberCandidate[]> {
  if (count <= 0) return [];
  const held = new Set((await readPolicyMembers(page, policyId)).map((m) => m.memberId));
  const pool = (await memberCandidates(page, policyId, 'a')).filter((c) => !held.has(c.id));
  if (pool.length < count) throw new Error(`the member picker offers ${pool.length} members not yet enrolled, ${count} wanted`);
  const added: MemberCandidate[] = [];
  for (const candidate of pool.slice(0, count)) {
    const res = await addPolicyMember(page, policyId, candidate.id, { relationship });
    if (res.status >= 300) throw new Error(`AddPolicyMember ${candidate.memberCode} answered ${res.status} ${answerText(res).slice(0, 300)}`);
    added.push(candidate);
  }
  return added;
}

/** AssignPolicyNetwork `{ policyId, networkId, confirmRevertToDraft }` (409 "This network is already assigned to the policy."). */
export async function assignPolicyNetwork(page: Page, policyId: string, networkId: string, confirmRevertToDraft = true): Promise<PolicyAnswer> {
  return NetworkUtils.postAsSession(page, ApiEndpoints.policyAssignNetwork, { policyId, networkId, confirmRevertToDraft });
}

/** DELETE UnassignPolicyNetwork/{policyId}/{networkId} - staged on a published policy. */
export async function unassignPolicyNetwork(page: Page, policyId: string, networkId: string, confirmRevertToDraft = true): Promise<PolicyAnswer> {
  return NetworkUtils.requestAsSession(page, 'DELETE', `${ApiEndpoints.policyUnassignNetwork}/${policyId}/${networkId}${confirmQuery(confirmRevertToDraft)}`);
}

/** A file to upload (same shape as Playwright's FilePayload). */
export interface PolicyUploadFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** A tiny valid-enough PDF for attachments. */
export function samplePdf(name = 'automation-document.pdf'): PolicyUploadFile {
  return { name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n') };
}

/** POST FileUpload/UploadFile (multipart `File` + `EntityName`) -> the file's download URI, as the Add Documentation drawer does. */
export async function uploadPolicyFile(page: Page, file: PolicyUploadFile, entityName = 'PolicyEndorsement'): Promise<{ status: number; uri: string; text: string }> {
  // On the app first: about:blank has no token to read (see NetworkUtils.requestAsSession).
  if (!page.url().startsWith('http')) await page.goto(env.baseUrl, { waitUntil: 'domcontentloaded' });
  const token = await page.evaluate((key) => window.localStorage.getItem(key), ACCESS_TOKEN_KEY);
  const res = await page.request.fetch(`${env.baseUrl}${ApiEndpoints.fileUpload}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    multipart: { File: file, EntityName: entityName },
    failOnStatusCode: false,
  });
  const text = await res.text();
  return { status: res.status(), uri: payloadOrNull<{ fileUri: string }>({ status: res.status(), text })?.fileUri ?? '', text };
}

export interface DocumentSpec {
  title?: string;
  /** Type by English name (default "Other"). */
  type?: string;
  /** ISO date or yyyy-mm-dd (default today). */
  effectiveDate?: string;
  description?: string;
  /** A file to upload and attach (none by default). */
  attachment?: PolicyUploadFile;
}

/** CreatePolicyEndorsement - the Add Documentation drawer's body (attachment uploaded first when given). Returns the answer with the new id. */
export async function addPolicyDocument(page: Page, policyId: string, spec: DocumentSpec = {}, confirmRevertToDraft = true): Promise<PolicyAnswer & { id: string | null; title: string }> {
  const title = spec.title ?? `Automation Document ${policyStamp()}`;
  let attachment: Record<string, unknown> = { attachmentUri: null, attachmentFileName: null, attachmentContentType: null, attachmentSizeBytes: null };
  if (spec.attachment) {
    const uploaded = await uploadPolicyFile(page, spec.attachment);
    if (!uploaded.uri) throw new Error(`UploadFile answered ${uploaded.status} ${uploaded.text.slice(0, 200)}`);
    attachment = { attachmentUri: uploaded.uri, attachmentFileName: spec.attachment.name, attachmentContentType: spec.attachment.mimeType, attachmentSizeBytes: spec.attachment.buffer.length };
  }
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.policyAddDocument, {
    policyId,
    title,
    endorsementTypeId: await documentTypeId(page, spec.type ?? 'Other'),
    effectiveDate: (spec.effectiveDate ?? new Date().toISOString()).slice(0, 10),
    description: spec.description ?? 'Recorded by the automation suite.',
    ...attachment,
    confirmRevertToDraft,
  });
  return { ...res, id: res.status < 300 ? (payloadOrNull<{ id: string }>(res)?.id ?? null) : null, title };
}

/** DELETE DeletePolicyEndorsement/{policyId}/{endorsementId} - staged on a published policy. */
export async function deletePolicyDocument(page: Page, policyId: string, documentId: string, confirmRevertToDraft = true): Promise<PolicyAnswer> {
  return NetworkUtils.requestAsSession(page, 'DELETE', `${ApiEndpoints.policyDeleteDocument}/${policyId}/${documentId}${confirmQuery(confirmRevertToDraft)}`);
}

// ---- clone and benefit reset ------------------------------------------------------------

export interface PolicyCloneSpec extends PolicyBasics {
  includeMembers?: boolean;
  includeNetworks?: boolean;
  includeDocumentation?: boolean;
}

/**
 * ClonePolicy - the clone drawer's body: the source's details (GetPolicyForClone)
 * with the new name / period, plus the three "What to bring across" flags.
 * Returns the answer and the clone's id (read back by name).
 */
export async function clonePolicy(page: Page, sourcePolicyId: string, spec: PolicyCloneSpec = {}): Promise<PolicyAnswer & { id: string | null; nameEn: string }> {
  const source = payloadOrNull<Record<string, unknown>>(await NetworkUtils.postAsSession(page, ApiEndpoints.policyForClone, { id: sourcePolicyId })) ?? {};
  const nameEn = spec.nameEn ?? suitePolicyName('Clone');
  if (!nameEn.startsWith(SUITE_POLICY_PREFIX)) throw new Error(`a suite clone must be named "${SUITE_POLICY_PREFIX} ..."`);
  const holder = source.policyHolderId === '00000000-0000-0000-0000-000000000000' ? null : source.policyHolderId;
  const body = {
    sourcePolicyId,
    policyNameEn: nameEn,
    policyNameAr: spec.nameAr ?? `${String(source.policyNameAr ?? 'وثيقة')} نسخة`,
    planId: spec.planId ?? source.planId,
    policyHolderId: holder,
    policyTypeId: source.policyTypeId,
    effectiveDate: spec.effectiveDate ?? minutesFromNow(spec.effectiveInMinutes ?? 2 * 24 * 60),
    expiryDate: spec.expiryDate ?? new Date(Date.now() + (spec.expiryInDays ?? 60) * 86_400_000).toISOString(),
    gracePeriodDays: spec.gracePeriodDays ?? source.gracePeriodDays ?? null,
    maxMembers: spec.maxMembers ?? source.maxMembers ?? null,
    deductibleAmount: spec.deductibleAmount ?? source.deductibleAmount ?? 0,
    coinsurancePercent: spec.coinsurancePercent ?? source.coinsurancePercent ?? 0,
    outOfPocketMaximum: spec.outOfPocketMaximum ?? source.outOfPocketMaximum ?? 0,
    sublimitAmount: spec.sublimitAmount ?? source.sublimitAmount ?? 0,
    includeMembers: spec.includeMembers ?? true,
    includeNetworks: spec.includeNetworks ?? true,
    includeDocumentation: spec.includeDocumentation ?? true,
  };
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.policyClone, body);
  const id = res.status < 300 ? (payloadOrNull<{ id: string }>(res)?.id ?? (await findPolicyByName(page, nameEn))?.id ?? null) : null;
  return { ...res, id, nameEn };
}

export interface ResetSpec {
  reason?: string;
  attachment?: PolicyUploadFile;
  deductibleAmount?: number | null;
  coinsurancePercent?: number | null;
  outOfPocketMaximum?: number | null;
  sublimitAmount?: number | null;
}

/**
 * ResetPolicyBenefits - the Reset now drawer's body. A policy whose current
 * benefit period starts TODAY is refused (409 "The policy's current benefit
 * period already starts today; it cannot be reset again today."), so a policy
 * created today can never be reset the same day.
 */
export async function resetPolicyBenefits(page: Page, policyId: string, spec: ResetSpec = {}): Promise<PolicyAnswer> {
  let attachment: Record<string, unknown> = { attachmentUri: null, attachmentFileName: null, attachmentContentType: null, attachmentSizeBytes: null };
  if (spec.attachment) {
    const uploaded = await uploadPolicyFile(page, spec.attachment, 'PolicyBenefitReset');
    attachment = { attachmentUri: uploaded.uri || null, attachmentFileName: spec.attachment.name, attachmentContentType: spec.attachment.mimeType, attachmentSizeBytes: spec.attachment.buffer.length };
  }
  return NetworkUtils.postAsSession(page, ApiEndpoints.policyResetBenefits, {
    policyId,
    reason: spec.reason ?? 'Reset by the automation suite.',
    ...attachment,
    deductibleAmount: spec.deductibleAmount ?? null,
    coinsurancePercent: spec.coinsurancePercent ?? null,
    outOfPocketMaximum: spec.outOfPocketMaximum ?? null,
    sublimitAmount: spec.sublimitAmount ?? null,
  });
}

/** One row of Policies in force (GetPolicyBenefitYears). */
export interface PolicyInForce {
  policyId: string;
  policyNumber: string;
  policyNameEn: string;
  payerNameEn: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  nextResetOn: string | null;
  membersCount: number;
  [key: string]: unknown;
}

/** Policies in force (the Benefit Resets screen's first tab) for a search. */
export async function policiesInForce(page: Page, searchText = ''): Promise<PolicyInForce[]> {
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.policyBenefitYears, { pageNumber: 1, rowsPerPage: 200, searchText });
  return res.status < 300 ? (payloadOrNull<{ policies: { items: PolicyInForce[] } }>(res)?.policies.items ?? []) : [];
}

/**
 * A SUITE policy in force whose benefit period started before today - the only
 * kind the Reset form accepts - or null (none was created on an earlier day).
 */
export async function resettableSuitePolicy(page: Page): Promise<PolicyInForce | null> {
  const today = new Date().toISOString().slice(0, 10);
  return (await policiesInForce(page, SUITE_POLICY_PREFIX)).find((p) => p.policyNameEn.startsWith(SUITE_POLICY_PREFIX) && p.currentPeriodStart < today) ?? null;
}

// ---- states -------------------------------------------------------------------------

/**
 * The states a case can ask for:
 * - Draft            v0 "Not Live" draft (POL-D-nnnn), with the spec's content.
 * - PendingApproval  v0 sent for approval.
 * - Rejected         v0 sent and rejected (reason "Other").
 * - Future           v1 approved (POL-YYYY-nnnn), status Future.
 * - Active           an Active SEED claimed (seedActivePolicies, the day before) - BLOCKED when none.
 * - Inactive         Future, then an inactivation staged, sent and approved (effective status Inactive).
 * - PendingChange    Future, with a document staged AND sent for approval.
 * - DraftChange      Future, with a document staged as a draft, not sent.
 * Expired / In Grace / Terminated are not reachable on demand (daily job).
 */
export type PolicyState = 'Draft' | 'PendingApproval' | 'Rejected' | 'Future' | 'Active' | 'Inactive' | 'PendingChange' | 'DraftChange';

export interface SuitePolicySpec extends PolicyBasics {
  /** Members enrolled (from the picker's pool). Default: 1 for an Individual policy, 0 for a Group one (409 "Members can only be added to a group policy after it becomes active."). */
  members?: number;
  /** Networks linked (0 or 1 - the payer's active network). Default 1. */
  networks?: number;
  /** Documents added (count or specs). Default 0. */
  documents?: number | DocumentSpec[];
}

export interface ProvisionedPolicy {
  id: string;
  nameEn: string;
  nameAr: string;
  type: PolicyTypeCode;
  payerId: string;
  payerName: string;
  planId: string;
  planName: string;
  holderName: string;
  effectiveDate: string;
  expiryDate: string;
  state: PolicyState;
  /** POL-D-nnnn / POL-YYYY-nnnn after provisioning. */
  policyNumber: string;
  members: PolicyMember[];
  networks: PolicyNetwork[];
  documents: PolicyDocument[];
}

/**
 * Builds one suite policy in `state` through the API and returns it. Throws
 * (with the server's answer) when a step is refused - the fixture turns that
 * into BLOCKED. Draft / Pending / Rejected / Future / Inactive / *Change take
 * 5-20 s; Active claims a seed (seconds) or throws.
 */
export async function provisionSuitePolicy(page: Page, state: PolicyState, spec: SuitePolicySpec = {}): Promise<ProvisionedPolicy> {
  if (state === 'Active') return claimActiveSeed(page, spec);
  const type = spec.type ?? 'group';
  const nameEn = spec.nameEn ?? suitePolicyName();
  if (!nameEn.startsWith(SUITE_POLICY_PREFIX)) throw new Error(`a suite policy must be named "${SUITE_POLICY_PREFIX} ..."`);
  const payerName = spec.payerName ?? POLICY_SUITE_PAYER;
  const payerId = await payerIdByName(page, payerName);
  Logger.step(`[policy] Provisioning "${nameEn}" (${state}, ${type}) for "${payerName}"`);

  const created = await requestCreatePolicy(page, { ...spec, type, nameEn, payerName });
  if (created.id === null) fail(nameEn, 'create', created);
  const id = created.id as string;

  const wantedMembers = spec.members ?? (type === 'individual' ? 1 : 0);
  const wantedNetworks = spec.networks ?? 1;
  await enrolMembers(page, id, wantedMembers).catch((e: unknown) => { throw new Error(`could not provision policy "${nameEn}": ${String(e instanceof Error ? e.message : e)}`); });
  if (wantedNetworks > 0) {
    const network = await suitePolicyNetwork(page, payerId);
    const linked = await assignPolicyNetwork(page, id, network.id);
    if (linked.status >= 300) fail(nameEn, 'assign network', linked);
  }
  const docSpecs: DocumentSpec[] = Array.isArray(spec.documents) ? spec.documents : Array.from({ length: spec.documents ?? 0 }, () => ({}));
  for (const [n, doc] of docSpecs.entries()) {
    const added = await addPolicyDocument(page, id, doc);
    if (added.status >= 300) fail(nameEn, `add document ${n + 1}`, added);
  }

  if (state !== 'Draft') {
    const submitted = await submitPolicy(page, id);
    if (submitted.status >= 300) fail(nameEn, 'submit', submitted);
  }
  if (state === 'Rejected') {
    const rejected = await rejectPolicy(page, nameEn);
    if (rejected.status >= 300) fail(nameEn, 'reject', rejected);
  }
  const published = ['Future', 'Inactive', 'PendingChange', 'DraftChange'].includes(state);
  if (published) {
    const approved = await requestApprovePolicy(page, nameEn);
    if (approved.status >= 300) fail(nameEn, 'approve', approved);
    await waitForPolicy(page, id, (p) => !p.isPendingCreate && p.currentVersion >= 1, 'approved (v1)');
  }
  if (state === 'Inactive') {
    const staged = await inactivatePolicy(page, id);
    if (staged.status >= 300) fail(nameEn, 'inactivate', staged);
    await publishPolicyChange(page, id, nameEn);
    await waitForPolicyStatus(page, id, 'inactive');
  }
  if (state === 'PendingChange' || state === 'DraftChange') {
    await stageTrivialChange(page, id, nameEn);
    if (state === 'PendingChange') {
      const submitted = await submitPolicy(page, id);
      if (submitted.status >= 300) fail(nameEn, 'submit the change', submitted);
    }
  }
  return describeProvisioned(page, id, state, type);
}

async function describeProvisioned(page: Page, id: string, state: PolicyState, type: PolicyTypeCode): Promise<ProvisionedPolicy> {
  const final = await readPolicy(page, id);
  return {
    id,
    nameEn: final.policyNameEn,
    nameAr: final.policyNameAr,
    type,
    payerId: final.payerId,
    payerName: final.payerNameEn,
    planId: final.planId,
    planName: final.planNameEn,
    holderName: final.policyHolderNames,
    effectiveDate: final.effectiveDate,
    expiryDate: final.expiryDate,
    state,
    policyNumber: final.policyNumber,
    members: await readPolicyMembers(page, id),
    networks: await readPolicyNetworks(page, id),
    documents: await readPolicyDocuments(page, id),
  };
}

/**
 * Stages a harmless change on a PUBLISHED policy as a draft - a document
 * (`STAGED_DOCUMENT_PREFIX ...`, type Other) - and returns its title.
 */
export async function stageTrivialChange(page: Page, id: string, nameEn: string): Promise<string> {
  const added = await addPolicyDocument(page, id, { title: `${STAGED_DOCUMENT_PREFIX} ${policyStamp()}`, type: 'Other' });
  if (added.status >= 300) fail(nameEn, 'stage a document', added);
  return added.title;
}

/** Polls GetPolicy until `ok` holds. */
export async function waitForPolicy(page: Page, id: string, ok: (p: PolicyRecord) => boolean, what: string, timeoutMs = 30_000): Promise<PolicyRecord> {
  const deadline = Date.now() + timeoutMs;
  let last: PolicyRecord | null = null;
  while (Date.now() < deadline) {
    last = await readPolicyOrNull(page, id);
    if (last && ok(last)) return last;
    await page.waitForTimeout(1_500);
  }
  throw new Error(`policy ${id} is not ${what} after ${Math.round(timeoutMs / 1000)} s (v${last?.currentVersion}, ${last?.versionStatusCode})`);
}

/** Polls until the displayed status code (policyStatusCode) is `code`. */
export async function waitForPolicyStatus(page: Page, id: string, code: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    last = await policyStatusCode(page, id);
    if (last === code) return;
    await page.waitForTimeout(1_500);
  }
  throw new Error(`policy ${id} reads "${last}" after ${Math.round(timeoutMs / 1000)} s, not "${code}"`);
}

// ---- Active seeds ------------------------------------------------------------------------

/**
 * Creates `count` policies that will be ACTIVE after the next lifecycle job:
 * `QA Automation Policy Seed <Individual|Group> <stamp>`, effective in two
 * minutes, approved (Future). Run it the day BEFORE a run that needs Active
 * policies (`npm run seed:policy`); claimActiveSeed takes them one per case
 * and the case's teardown discards it.
 */
export async function seedActivePolicies(page: Page, count: number, type: PolicyTypeCode = 'individual'): Promise<string[]> {
  const names: string[] = [];
  for (let n = 0; n < count; n += 1) {
    const nameEn = `${SEED_POLICY_PREFIX} ${type === 'individual' ? 'Individual' : 'Group'} ${policyStamp()}`;
    await provisionSuitePolicy(page, 'Future', { nameEn, type, effectiveInMinutes: 2, expiryInDays: 120, members: type === 'individual' ? 2 : 0 });
    names.push(nameEn);
  }
  return names;
}

/** The Active seeds not yet claimed (no draft, nothing pending), oldest first. */
export async function availableActiveSeeds(page: Page, type?: PolicyTypeCode): Promise<PolicyListItem[]> {
  const codes = await policyStatusCodes(page);
  const typeId = type ? await policyTypeId(page, type) : null;
  const { items } = await listPolicyRegister(page, { searchText: SEED_POLICY_PREFIX }, 200);
  return items
    .filter((p) => p.policyNameEn.startsWith(SEED_POLICY_PREFIX) && codes[p.effectiveStatusId] === 'active' && p.isActive && !p.hasDraft && !p.hasPendingVersion)
    .filter((p) => typeId === null || p.policyTypeId === typeId)
    .sort((a, b) => Date.parse(a.createdOn) - Date.parse(b.createdOn));
}

/**
 * Claims the oldest Active seed of the spec's type and adds the spec's extra
 * members / documents (staged, sent and approved). Throws - BLOCKED - when no
 * seed is Active: the policy lifecycle job (once a day) has not run since the
 * seeds were made, or none were made.
 */
export async function claimActiveSeed(page: Page, spec: SuitePolicySpec = {}): Promise<ProvisionedPolicy> {
  const seed = (await availableActiveSeeds(page, spec.type))[0];
  if (!seed) {
    throw new Error(`no Active ${spec.type ?? ''} seed policy ("${SEED_POLICY_PREFIX} ...") is available: a policy turns Active only when the daily lifecycle job runs `
      + '(approval alone gives Future) - run `npm run seed:policy` the day before');
  }
  Logger.step(`[policy] Claiming the Active seed "${seed.policyNameEn}" (${seed.policyNumber})`);
  let changed = false;
  const extraMembers = Math.max(0, (spec.members ?? 0) - seed.memberCount);
  if (extraMembers > 0) {
    await enrolMembers(page, seed.id, extraMembers);
    changed = true;
  }
  const docSpecs: DocumentSpec[] = Array.isArray(spec.documents) ? spec.documents : Array.from({ length: spec.documents ?? 0 }, () => ({}));
  for (const doc of docSpecs) {
    const added = await addPolicyDocument(page, seed.id, doc);
    if (added.status >= 300) fail(seed.policyNameEn, 'add document', added);
    changed = true;
  }
  if (changed) await publishPolicyChange(page, seed.id, seed.policyNameEn);
  const type: PolicyTypeCode = seed.policyTypeId === (await policyTypeId(page, 'group')) ? 'group' : 'individual';
  return describeProvisioned(page, seed.id, 'Active', type);
}

// ---- cleanup ------------------------------------------------------------------------------

/** How a discard ended: gone, retired (Inactive - it could not be deleted) or left (refused; see the warning). */
export type DiscardOutcome = 'gone' | 'retired' | 'left';

/**
 * Removes a suite policy whatever its state. Never throws (teardown); quiet on
 * one already gone; refuses one without the suite prefix.
 *
 * - Never approved (v0, any approval state): DeletePolicy discards it at once.
 * - Published: a deletion is REFUSED while documents (409 "Cannot delete a
 *   policy that has endorsements") or members (409 "Cannot delete a policy that
 *   has enrolled members") are live, and an approval is refused that leaves an
 *   INDIVIDUAL policy without a member or ANY policy without a network. So: a
 *   pending request is rejected (its staged change dropped), documents (and, on
 *   a Group policy, members) are removed and approved, then the deletion is
 *   staged, sent and approved. An Individual policy can never lose its last
 *   member, so it can never be deleted once published: it is RETIRED instead
 *   (inactivated and approved) and stays in the register, Inactive.
 */
export async function discardSuitePolicy(page: Page, id: string): Promise<DiscardOutcome> {
  try {
    let record = await readPolicyOrNull(page, id);
    if (!record) return 'gone';
    const name = record.policyNameEn;
    if (!name.startsWith(SUITE_POLICY_PREFIX)) {
      Logger.warn(`[policy] not discarding "${name}": not a suite policy`);
      return 'left';
    }
    if (record.isPendingCreate) {
      const res = await deletePolicy(page, id, true);
      if (res.status >= 300) Logger.warn(`[policy] DeletePolicy "${name}" answered ${res.status} ${answerText(res)}`);
      return (await readPolicyOrNull(page, id)) ? 'left' : 'gone';
    }
    const warn = (what: string, e: unknown): void => Logger.warn(`[policy] ${what} of "${name}": ${String(e instanceof Error ? e.message : e).slice(0, 240)}`);
    // 1. Drop whatever is staged: a pending request is rejected, a draft is sent and rejected.
    if (record.hasDraft) await submitPolicy(page, id).catch(() => undefined);
    if ((await readPolicyOrNull(page, id))?.hasPendingVersion) await rejectPolicy(page, name, 'Discarded by the automation suite.').catch((e: unknown) => warn('rejecting the pending change', e));
    // 2. Documents, and a Group policy's members, removed and approved.
    const isGroup = record.policyTypeId === (await policyTypeId(page, 'group'));
    let staged = false;
    for (const doc of (await readPolicyDocuments(page, id).catch(() => [] as PolicyDocument[])).filter((d) => !/removal/i.test(d.state))) {
      const res = await deletePolicyDocument(page, id, doc.id, true);
      if (res.status < 300) staged = true;
    }
    if (isGroup) {
      for (const member of (await readPolicyMembers(page, id).catch(() => [] as PolicyMember[])).filter((m) => !/removal/i.test(m.rosterState))) {
        const res = await removePolicyMember(page, id, member.id, true);
        if (res.status < 300) staged = true;
      }
    }
    if (staged) {
      await publishPolicyChange(page, id, name).catch(async (e: unknown) => {
        warn('approving the removals', e);
        await rejectPolicy(page, name, 'Discarded by the automation suite.').catch(() => undefined);
      });
    }
    // 3. Delete when nothing blocks it; retire otherwise.
    record = await readPolicyOrNull(page, id);
    if (!record) return 'gone';
    if (record.memberCount === 0 && record.endorsementCount === 0) {
      const res = await deletePolicy(page, id, true);
      if (res.status < 300) {
        if (!(await readPolicyOrNull(page, id))) return 'gone';
        await publishPolicyChange(page, id, name).catch((e: unknown) => warn('approving the deletion', e));
        if (!(await readPolicyOrNull(page, id))) return 'gone';
      } else warn('DeletePolicy', answerText(res));
    }
    const codes = await policyStatusCodes(page);
    if (codes[record.effectiveStatusId] === 'inactive' && !record.isActive) return 'retired';
    const staged2 = await inactivatePolicy(page, id, { details: 'Retired by the automation suite (a published individual policy cannot be deleted).' });
    if (staged2.status >= 300) {
      warn('InactivatePolicy', answerText(staged2));
      return 'left';
    }
    await publishPolicyChange(page, id, name).catch((e: unknown) => warn('approving the retirement', e));
    Logger.step(`[policy] "${name}" could not be deleted (published, members or documents remain) - retired as Inactive`);
    return 'retired';
  } catch (error) {
    Logger.warn(`[policy] discarding ${id} failed: ${String(error).slice(0, 300)}`);
    return 'left';
  }
}
