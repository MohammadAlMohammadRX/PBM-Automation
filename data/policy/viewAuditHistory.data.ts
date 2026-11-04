import { NOTICE } from './policy.data';

/**
 * US 15187 "View Policy - Audit History" (policy folder 16).
 *
 * The tab (verified live 2026-11-03) is the shared timeline: entries "{action} {when}
 * By: {actor}" with View Details (the "Audit Entry" drawer: action chip, entity, meta
 * "dd/mm/yyyy hh:mm • user", Field / Value rows), a search box, and the Advanced Search
 * (Action Type - "All actions", Policy created, Policy cloned, Policy updated, Policy
 * deleted, Status changed, Member enrolled ...; Performed By; Date Range - a range CLICKED
 * in the calendar, a typed one is ignored). Staged changes are audited when APPROVED.
 *
 * The trail a case filters is built by the case (writerAHelpers.buildAuditTrail): a draft
 * edited (grace period), approved, a document published and an inactivation published -
 * Created, Updated, Network assigned, Documentation added and Status changed entries, all
 * by the administrator, all today.
 *
 * Where the case's data cannot be used as written:
 *  - One administrator acts on suite policies (the Payer Admin cannot see the suite payer),
 *    so "jane.doe" / "john.smith" are the administrator's actor name as the trail shows it;
 *    19637's "only that user's entries" is checked on a trail of that one user.
 *  - "Earliest / latest recorded dates" (19630) are the trail's own day (today); the
 *    "day before the earliest" is yesterday.
 *  - 19631's start-after-end range is TYPED (a calendar cannot be clicked backwards); a
 *    field that ignores typing reports no validation - the case's finding either way.
 *  - 19634: a published policy offers no Delete on screen (Foundation notes), so the
 *    deletion is staged through the application's DeletePolicy call and approved; the
 *    "independent audit history area" is System Settings > Audit Logs (GetAuditLogs by the
 *    policy's id).
 *  - 19635 / 19636: the Payer Admin shaped without / with GetPolicyAuditTrail (the
 *    "dedicated Audit History permission"), on a policy of NUPCO, one of its payers. 19636
 *    needs entries, so its policy is published (Future) - it needs an active NUPCO network.
 */

/** The action type options the cases choose, and how an entry of that type reads. */
export const ACTION = {
  update: { option: 'Policy updated', entry: /updat/i, code: 'UPDATE' },
  statusChange: { option: 'Status changed', entry: /status/i, code: 'STATUS_CHANGE' },
  clone: { option: 'Policy cloned', entry: /clon/i, code: 'CLONED' },
} as const;

/** The empty-trail message, or any "nothing found" wording. */
export const NO_RECORDS = new RegExp(`${NOTICE.emptyAudit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|no (audit|records|history|entries|results)|not found|nothing`, 'i');

/** A day `days` from today (local midnight). */
export const dayFromToday = (days: number): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

export const CASES = {
  byActionType: { azureId: '19628', action: ACTION.update },
  viewTrail: { azureId: '19629' },
  dateBoundary: { azureId: '19630' },
  reversedRange: { azureId: '19631', from: '01/11/2026', to: '01/10/2026' },
  combined: { azureId: '19632', action: ACTION.statusChange },
  viewDetails: { azureId: '19633' },
  retainedAfterDelete: { azureId: '19634' },
  noPermission: { azureId: '19635' },
  withPermission: { azureId: '19636' },
  byPerformer: { azureId: '19637' },
  noResults: { azureId: '19638', action: ACTION.clone },
  /** The sheet's `""` and `O'Brien`, plus dashes and angle brackets (a script that must not run). */
  specialChars: { azureId: '19639', inputs: ['""', "O'Brien", '-- --', '<img src=x onerror="window.__policyAuditXss=1">'] },
  rapidChanges: { azureId: '19640', final: ACTION.statusChange },
  checklist: { azureId: '19641', maxEntries: 10 },
} as const;
