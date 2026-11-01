import type { NetworkBlockedCase } from '../networks/network.data';
import { NON_ADMIN_PROFILE } from '../accounts/nonAdminAccount.data';
import type { PlanPermissionKey } from '../accounts/payerAdminRole.data';
import type { PlanVersionRecord } from '../../pages/plan/PlanVersionHistoryTab';
import { PLAN_VERSION_STATUS } from './plan.data';

/**
 * Test data for US 14345 "Revert a plan to a prior version"
 * (folder 29-revert-a-plan-to-a-prior-version). Network twin: US 14321
 * (tests/network/42-..., data/networks/versionHistoryRevert.data.ts).
 *
 * HOW A PLAN GETS PUBLISHED VERSIONS HERE (2026-10-27). A published plan offers
 * no Edit, so its history grows through status changes and formulary changes:
 * `planIn('Inactive')` is created (v1, published, then superseded) and
 * inactivated (v2, published - the current one). Every revert case starts from
 * such a plan; the sheet's "PLN-10 v2" etc. map onto it as below. A
 * never-published version is a rejected creation (`planIn('Rejected')`, v0) or
 * a staged activation that is rejected / left a draft (fixture
 * `stagePlanActivation`).
 *
 * The Revert control is matched by label inside a version's row
 * (PlanVersionHistoryTab.offersRevert) - its id is not known yet.
 */

export type PlanBlockedCase = NetworkBlockedCase;

export const CASE = {
  revertPublished: '19362',
  refuseNeverPublished: '19363',
  bothBoundaries: '19364',
  decisionTable: '19365',
  entersReview: '19366',
  restoredOnApproval: '19367',
  noPermission: '19368',
  successAndAudit: '19369',
  noDuplicates: '19370',
  formularyRestored: '19371',
  pendingConflict: '19372',
} as const;

/** The label a version row carries. */
export const v = (n: number): string => `v${n}`;

/** Version numbers of the plan `planIn('Inactive')` builds. */
export const VERSION = {
  /** The creation - published, superseded by the inactivation: the sheet's "prior Published version". */
  created: 1,
  /** The inactivation - published and current. */
  current: 2,
  /** A creation that never got through approval (Rejected / Draft / Pending): the sheet's "never Published" version. */
  neverPublished: 0,
} as const;

/** Statuses of versions that were published at some point (the current one, or one superseded since). */
export const PUBLISHED_STATES = new RegExp(`^(${PLAN_VERSION_STATUS.published}|${PLAN_VERSION_STATUS.superseded})$`);

/**
 * 19373 - the never-published statuses the mixed history carries: a staged
 * activation rejected, then another left a draft (the sheet's v3 Rejected, v2 Draft).
 */
export const NEVER_PUBLISHED_STATES = [PLAN_VERSION_STATUS.rejected, 'Draft'] as const;

/** The label of a row action that reverts. */
export const REVERT_ACTION = /revert/i;

/** The change type a revert should add to the history. */
export const REVERT_CHANGE = /revert/i;

/** What the screens and the server say. */
export const MESSAGE = {
  /** The success toast after a revert is confirmed. */
  revertAccepted: /revert|submitted for approval|success/i,
  /** A refused revert of a version that was never published. */
  onlyPublished: /publish/i,
  /** A refused revert while another change awaits approval (the single-pending-change rule). */
  pendingConflict: /pending|awaiting approval|already/i,
  /** The detail header's notice while a change awaits approval. */
  awaitingApproval: /awaiting approval|pending approval/i,
} as const;

/** What the server answers a role without the right. */
export const AUTHORISATION_REFUSALS = [401, 403] as const;

/** The permission the revert cases withhold (inferred label - data/accounts/payerAdminRole.data.ts). */
export const REVERT_PERMISSION: PlanPermissionKey = 'revertPlanVersion';

/** The payer of the plans a shaped non-admin works on: one of its own (the sheet's "Viewer" user). */
export const SCOPED_PAYER = NON_ADMIN_PROFILE.scopedPayers[0];

/** The administrator, as the history and audit trail name it. */
export const ADMIN_ACTOR = 'CareConnect Admin User';

/** An audit entry's timestamp ("27/10/2026 06:20 PM" or "27/10/2026 18:20"). */
export const AUDIT_TIME_PATTERN = /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/;

/** 19370 - how many times the revert is confirmed in quick succession. */
export const RAPID_CONFIRMS = 3;

/** The plan attributes a revert restores, compared between the reverted version and the plan afterwards. */
export const REVERTED_FIELDS = ['planNameEn', 'planNameAr', 'planTypeId', 'effectiveDate', 'expiryDate', 'formularyId'] as const;

/** The REVERTED_FIELDS a record carries (a field the version record lacks is not compared). */
export const revertedAttributes = (record: Record<string, unknown>, from: Record<string, unknown> = record): Record<string, string> =>
  Object.fromEntries(REVERTED_FIELDS.filter((key) => key in from).map((key) => [key, String(record[key] ?? '')]));

/** The highest-numbered version. */
export const newestVersion = (records: readonly PlanVersionRecord[]): PlanVersionRecord | undefined =>
  [...records].sort((a, b) => b.version - a.version)[0];

/** A version that was never published (its status is neither Published nor Superseded). */
export const neverPublishedVersion = (records: readonly PlanVersionRecord[]): PlanVersionRecord | undefined =>
  records.find((record) => !PUBLISHED_STATES.test(record.versionStatusEn));

/** A version by its number. */
export const versionNumbered = (records: readonly PlanVersionRecord[], n: number): PlanVersionRecord | undefined =>
  records.find((record) => record.version === n);

/** How long an approved revert may take to become the plan's current version. */
export const PUBLISH_WAIT_MS = 2 * 60_000;

/** A revert case builds an Inactive plan (about four minutes) and may run an approval round trip. */
export const REVERT_CASE_TIMEOUT_MS = 20 * 60_000;

/** The permission cases also shape the role (one or two round trips) and sign the non-admin in. */
export const PERMISSION_CASE_TIMEOUT_MS = 30 * 60_000;

export const BLOCKED_CASES: PlanBlockedCase[] = [];
