import type { NetworkBlockedCase } from '../networks/network.data';
import { toDisplayDate } from '../networks/network.data';
import { NON_ADMIN_PROFILE } from '../accounts/nonAdminAccount.data';
import type { RolePermissionKey } from '../accounts/payerAdminRole.data';

/**
 * Test data for US 14157 "View a dedicated audit trail for a plan"
 * (folder 08-view-a-dedicated-audit-trail-for-a-plan). 19111 is NOT here - it
 * belongs to folder 12 (sort).
 *
 * The plan detail's Audit History tab is the shared timeline component
 * (pages/components/AuditHistoryTab): entries "{action} {DD/MM/YYYY hh:mm AM|PM}
 * By: {actor}", View Details drawer (Field / Before / After), an advanced search
 * with action type and date range. A never-submitted draft shows no entries.
 * Twin: tests/network/20-view-network-audit-history.
 */

export type PlanBlockedCase = NetworkBlockedCase;

export const CASE = {
  orderedTrail: '19098',
  actionTypeFilter: '19099',
  combinedFilters: '19100',
  dateBoundaries: '19101',
  noAuditPermission: '19102',
  auditPermissionOnly: '19103',
  entryDetail: '19104',
  systemActor: '19105',
  utcTimestamps: '19106',
  invalidRange: '19107',
  emptyState: '19108',
  noChangedFields: '19109',
  largeVolume: '19110',
  lifecycleTransitions: '19112',
} as const;

/** The action types as the plan timeline labels them ("Edited" in the sheet is "Update"). */
export const ACTION = {
  create: 'Create',
  update: 'Update',
  statusChange: 'Status Change',
} as const;

/** 19109 / 19112 - an entry recording an activation or a lifecycle status move. */
export const ACTIVATION_ACTION = /Activat|Status Change/i;
/** 19112 - the expiry job's entry. */
export const EXPIRY_ACTION = /Expir|Status Change/i;

/** The automated actor's label (19105, 19112). */
export const SYSTEM_ACTOR = 'System';

/** An entry's timestamp as the timeline prints it. */
export const ENTRY_TIME = /^\d{2}\/\d{2}\/\d{4} \d{1,2}:\d{2}\s?(AM|PM)?$/i;

/** DD/MM/YYYY for today plus `days` - the filter's date format. */
export const auditDay = (days = 0): string => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDisplayDate(date);
};

/** The day part of an entry's timestamp. */
export const entryDay = (when: string): string => when.slice(0, 10);

/** A DD/MM/YYYY day moved by `days` (19101: one day before the latest entry). */
export const shiftDay = (ddmmyyyy: string, days: number): string => {
  const [dd, mm, yyyy] = ddmmyyyy.split('/').map(Number);
  return toDisplayDate(new Date(yyyy, mm - 1, dd + days));
};

/** 19107 - the sheet's inverted range: a start date nineteen days AFTER the end date. */
export const INVERTED_RANGE = { fromDays: 0, toDays: -19 } as const;

/**
 * An entry's timestamp as epoch milliseconds, read AS UTC (`asUtc`) or as the
 * browser's local time. "19/10/2026 06:20 PM" -> 2026-10-19 18:20.
 */
export const entryTime = (when: string, asUtc = false): number => {
  const m = when.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{1,2}):(\d{2})\s?(AM|PM)?$/i);
  if (!m) return Number.NaN;
  const [, dd, mm, yyyy, hh, min, meridiem] = m;
  let hour = Number(hh) % (meridiem ? 12 : 24);
  if (meridiem && meridiem.toUpperCase() === 'PM') hour += 12;
  const parts = [Number(yyyy), Number(mm) - 1, Number(dd), hour, Number(min)] as const;
  return asUtc ? Date.UTC(...parts) : new Date(...parts).getTime();
};

/** True when `times` (newest first, as the tab lists them) never goes up. */
export const isDescending = (times: readonly number[]): boolean => times.every((t, i) => i === 0 || t <= times[i - 1]);

/** Whether `expected` (oldest first) occurs in that order within the newest-first actions. */
export const appearsInOrder = (newestFirst: readonly string[], expected: readonly RegExp[]): boolean => {
  const oldestFirst = [...newestFirst].reverse();
  let from = 0;
  for (const pattern of expected) {
    const at = oldestFirst.findIndex((action, i) => i >= from && pattern.test(action));
    if (at < 0) return false;
    from = at + 1;
  }
  return true;
};

/** What an inverted date range should be told (19107). */
export const INVALID_RANGE_MESSAGE = /invalid|before|after|earlier|later|range/i;

/** What an empty Audit History should say (19108). */
export const EMPTY_AUDIT_MESSAGE = /no (audit )?(history|records?|entries|changes|events|activity)/i;

/** 19100 - a period long before any of the case's own entries (a month, two months back). */
export const EMPTY_PERIOD = { fromDays: -60, toDays: -30 } as const;

/**
 * 19106 - the viewer's time zone (UTC+5, as in the sheet), and how far an
 * entry's displayed time may sit from the moment the case's request was made.
 * A local (UTC+5) rendering is five hours off, far outside the tolerance.
 */
export const VIEWER_TIME_ZONE = 'Asia/Karachi';
export const VIEWER_UTC_OFFSET_MINUTES = 5 * 60;
export const UTC_TOLERANCE_MS = 10 * 60_000;

/**
 * 19104 - an entry that records field-level changes. The case's plan carries an
 * approved inactivation (status, reason and details changed); an "Update" is
 * taken when the timeline records one.
 */
export const FIELD_CHANGE_ACTION = /Update|Status Change/i;

/** 19104 - the drawer's "timestamp • actor" line. */
export const ENTRY_META = /\d{2}\/\d{2}\/\d{4}.*\S/;

/** 19112 - the status values the lifecycle transitions record in the drawer. */
export const TRANSITION_VALUE = { active: /Active/i, expired: /Expired/i } as const;

/**
 * 19102 / 19103 - the plans are built for a payer IN the non-administrator's
 * scope, so a refusal can only come from the permission, never from the payer
 * scope. A submitted plan needs no formulary, and has audit entries (a draft
 * has none).
 */
export const SCOPED_PAYER = NON_ADMIN_PROFILE.scopedPayers[0];

/** 19102 - a Plan Editor: every plan right except the audit trail. */
export const WITHOUT_AUDIT: readonly RolePermissionKey[] = ['viewPlanAuditTrail'];
export const WITH_GENERAL: readonly RolePermissionKey[] = ['viewPlanDetails', 'editPlan'];

/** 19103 - an Auditor: the audit trail permission and no other plan permission. */
export const AUDIT_ONLY = {
  with: ['viewPlanAuditTrail'],
  without: [
    'viewPlanDetails', 'viewPlanVersions', 'createPlan', 'editPlan', 'deletePlan', 'clonePlan',
    'submitPlan', 'assignPlanFormulary', 'inactivatePlan', 'activatePlan', 'revertPlanVersion',
  ],
} as const satisfies { with: readonly RolePermissionKey[]; without: readonly RolePermissionKey[] };

/** 19102 - the tabs a user with the general plan permissions keeps. */
export const GENERAL_TABS = ['overview', 'formulary', 'versions'] as const;

export const BLOCKED_CASES: PlanBlockedCase[] = [
  {
    azureId: CASE.largeVolume,
    title: 'should keep every entry reachable and correctly ordered when a plan has several hundred audit entries',
    reason:
      'Needs a plan with 500+ recorded audit entries accumulated over its lifetime. No plan in this environment has more '
      + 'than a handful, and building hundreds through the approval workflow (each entry is a change plus a checker '
      + 'approval) would take hours of a shared environment. Unblocked by a seeded high-volume plan.',
  },
];
