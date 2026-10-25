import type { NetworkBlockedCase } from './network.data';

/**
 * Test data for US 14136 "View linked policies for a network".
 *
 * Verified on the live tab (2026-10-21): columns Policy Number, Name, Plan
 * Name, Policy Holder, Status, Effective Date, Expiry Date, Assigned On and
 * Actions; the count is the number in the tab label "Linked Policies (n)";
 * an empty network says "No policies linked to this network yet." No Detach
 * control was seen on any row, and no read-only marker is exposed.
 *
 * Every network with linked policies is a SHARED team record, discovered by
 * the `policyNetwork` fixture and only ever read. Nothing here detaches,
 * edits or expires a policy.
 */

export const CASE = {
  requiredFields: '17945',
  countPartitions: '17946',
  exploratory: '17951',
  checklist: '17952',
  consistency: '17955',
} as const;

/** The sheet's seven required columns, as the tab heads them. */
export const REQUIRED_COLUMNS = [
  'Policy Number',
  'Name',
  'Plan Name',
  'Policy Holder',
  'Status',
  'Effective Date',
  'Expiry Date',
] as const;

/** Columns the exploratory case sorts and filters on. */
export const COLUMN = {
  number: 'Policy Number',
  holder: 'Policy Holder',
  status: 'Status',
  effectiveDate: 'Effective Date',
  expiryDate: 'Expiry Date',
} as const;

/** The status the exploratory case filters by. */
export const FILTER_STATUS = 'Active';

/** The "many" partition: more than one policy (the sheet's example is 30). */
export const MANY_POLICIES = 2;

/** A Detach control's label. */
export const DETACH_ACTION = /detach|unlink|remove/i;

/** DD/MM/YYYY (optionally with a time) -> a sortable number. */
export const dateKey = (value: string): number => {
  const m = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? Number(`${m[3]}${m[2]}${m[1]}`) : Number.NaN;
};

/** Whether date cells are in the given order. */
export const isDateOrdered = (values: readonly string[], direction: 'asc' | 'desc'): boolean =>
  values.every((value, i) =>
    i === 0 || (direction === 'asc' ? dateKey(values[i - 1]) <= dateKey(value) : dateKey(values[i - 1]) >= dateKey(value)));

const READ_ONLY_REASON =
  'Needs linked policies flagged read-only and editable side by side. No read-only marker is exposed anywhere on the tab or '
  + 'the policy record, and every policy-linked network is a shared team record the suite must not change. Unblocked by '
  + 'seeded suite-owned policies with a known read-only flag.';

export const BLOCKED_CASES: NetworkBlockedCase[] = [
  {
    azureId: '17947',
    title: 'should display boundary dates and derive the status correctly when policies start or expire today or expired yesterday',
    reason:
      'Needs three linked policies dated effective today, expiring today and expired yesterday. Policies belong to the Policy '
      + 'module and the only policy-linked networks are shared team records; the suite cannot seed or re-date their policies. '
      + 'Unblocked by seeded suite-owned policies with those dates linked to an automation network.',
  },
  {
    azureId: '17948',
    title: 'should show the detach shortcut only when the policy is not read-only and the user holds Policy Management permission',
    reason: `${READ_ONLY_REASON} The permission half also needs a role without Policy Management whose change propagates `
      + '(role edits do not reach signed-in users in this build).',
  },
  {
    azureId: '17949',
    title: 'should show Expired in the linked policies view when a linked policy passes its expiry date',
    reason:
      'Needs a linked policy the suite may run past its expiry date (time simulation or a policy expiring within minutes). The '
      + 'policy-linked networks are shared team records; their policies must not be changed. Unblocked by a seeded suite-owned '
      + 'policy, linked to an automation network, with an expiry date a few minutes ahead.',
  },
  {
    azureId: '17950',
    title: 'should refuse a detach from any entry point when the user lacks Policy Management permission',
    reason:
      'Needs a role without Policy Management permission whose withdrawal propagates to the signed-in user (verified not to in '
      + 'this build) and a suite-owned linked policy that may be detached if the refusal fails. Neither exists.',
  },
  {
    azureId: '17953',
    title: 'should offer no way to detach a read-only linked policy when the user holds Policy Management permission',
    reason: READ_ONLY_REASON,
  },
  {
    azureId: '17954',
    title: 'should show a placeholder instead of an error when a linked policy has a missing holder or a malformed date',
    reason:
      'Needs a linked policy with a null Policy Holder or a malformed date. The Policy module validates both on save, and the '
      + 'suite may not alter shared policies. Unblocked by a seeded record with the defect, linked to an automation network.',
  },
];
