import type { NetworkBlockedCase } from '../networks/network.data';
import type { PlanSearchField } from '../../constants/ElementIds';
import type { RolePermissionKey } from '../accounts/payerAdminRole.data';
import type { PlanTypeCode } from '../../utils/PlanProvisioning';
import { DISPOSABLE_PLAN_PREFIX } from '../../utils/PlanProvisioning';
import { networkStamp } from '../../utils/NetworkProvisioning';
import { PLAN_APPROVAL_CELL, PLAN_LIFECYCLE, PLAN_MESSAGE } from './plan.data';
import { PLAN_SUITE } from './planSuite.data';

/**
 * Test data for US 14159 "Advanced search plans by name, payer, type, and
 * status" (plan folder 10; network twin: tests/network/01 + 02).
 *
 * The drawer is the shared `{screen}-advanced-search` component; its criteria
 * are PLAN_ADVANCED_SEARCH_FIELD keys. The story's "Plan Name" text field is the
 * drawer's text criterion (`searchtext`, name or code); its Payer criterion's id
 * (`payerid`) is inferred, not yet seen live.
 *
 * Sheet values that do not exist here are replaced: "Bupa Arabia" by the suite
 * payer, Plan Type "Medical" by "Individual" (the type the suite provisions).
 * Plan Type is not a table column, so type matches are read from the list
 * request's `planTypeId`.
 */

export type PlanBlockedCase = NetworkBlockedCase;
type Criteria = Partial<Record<PlanSearchField, string>>;

/** The approval-status option for a published plan, and how its approval cell reads. */
export const APPROVED = { option: 'Approved', cell: PLAN_APPROVAL_CELL.approved } as const;

export const SUITE_TYPE = { label: 'Individual', code: 'individual' as PlanTypeCode } as const;

/** Two plans sharing one unique partial name (19040). */
export const partialNameDataset = (): { partial: string; names: string[] } => {
  const partial = `Silver ${networkStamp()}`;
  return { partial, names: [`QA ${partial} One`, `QA ${partial} Two`] };
};

/** A plan the five criteria of 19041 / 19044 all describe. */
export const goldPlan = (): { partial: string; name: string } => {
  const partial = `Gold ${networkStamp()}`;
  return { partial, name: `${partial} Plan` };
};

/** The ad hoc sequence of 19046 - one field changed at a time. */
export const EXPLORATION: Criteria[] = [
  { nameOrCode: DISPOSABLE_PLAN_PREFIX },
  { nameOrCode: DISPOSABLE_PLAN_PREFIX, status: PLAN_LIFECYCLE.active },
  { nameOrCode: DISPOSABLE_PLAN_PREFIX, status: PLAN_LIFECYCLE.active, payer: PLAN_SUITE.payerName },
  { status: PLAN_LIFECYCLE.active, type: SUITE_TYPE.label },
  { payer: PLAN_SUITE.payerName, approvalStatus: APPROVED.option },
];

/** The five criteria the story requires (19047), by field key, with the control each must be. */
export const REQUIRED_FIELDS: { key: PlanSearchField; label: string; control: 'text' | 'select' }[] = [
  { key: 'nameOrCode', label: 'Plan Name', control: 'text' },
  { key: 'approvalStatus', label: 'Approval Status', control: 'select' },
  { key: 'payer', label: 'Payer', control: 'select' },
  { key: 'type', label: 'Plan Type', control: 'select' },
  { key: 'status', label: 'Status', control: 'select' },
];

/** The permissions a role without plan administration is stripped of (19050). */
export const DIRECTORY_PERMISSIONS: RolePermissionKey[] = ['viewPlansDashboard', 'viewPlanList', 'viewPlanDetails'];

export const CASES = {
  partialName: { azureId: '19040' },
  allCriteria: {
    azureId: '19041',
    payer: PLAN_SUITE.payerName,
    type: SUITE_TYPE.label,
    status: PLAN_LIFECYCLE.active,
    approval: APPROVED.option,
  },
  maxLength: { azureId: '19042', fallbackMax: 100, character: 'A' },
  progressive: {
    azureId: '19043',
    payer: PLAN_SUITE.payerName,
    type: SUITE_TYPE.label,
    status: PLAN_LIFECYCLE.active,
    approval: APPROVED.option,
  },
  chipsClearAll: {
    azureId: '19044',
    criteria: {
      nameOrCode: DISPOSABLE_PLAN_PREFIX,
      approvalStatus: APPROVED.option,
      payer: PLAN_SUITE.payerName,
      type: SUITE_TYPE.label,
      status: PLAN_LIFECYCLE.active,
    } satisfies Criteria,
  },
  specialCharacters: {
    azureId: '19045',
    // The sheet's second value was a script tag lost in the export of the sheet; a script probe stands in for it.
    terms: ["'; DROP TABLE--", '<script>window.__planSearchXss=1</script>', '100%'],
    flag: '__planSearchXss',
  },
  exploration: { azureId: '19046', searches: EXPLORATION },
  fieldsPresent: { azureId: '19047', fields: REQUIRED_FIELDS },
  noResults: { azureId: '19048', name: (): string => `ZZZ_NoMatch ${networkStamp()}`, payer: PLAN_SUITE.payerName, empty: PLAN_MESSAGE.noPlansFound },
  removeChip: { azureId: '19049', name: DISPOSABLE_PLAN_PREFIX, payer: PLAN_SUITE.payerName, status: PLAN_LIFECYCLE.active },
  permission: { azureId: '19050', permissions: DIRECTORY_PERMISSIONS },
  approvalOptions: {
    azureId: '19051',
    /** The sheet's predefined values; every option must be an approval status. */
    expected: [/approved/i, /pending/i, /rejected/i],
    anyApprovalStatus: /^(all\b.*|draft|pending( approval)?|approved|published|rejected|withdrawn)$/i,
    freeText: 'Not a real status',
  },
  serviceFailure: { azureId: '19052', name: DISPOSABLE_PLAN_PREFIX },
  paging: { azureId: '19053', name: DISPOSABLE_PLAN_PREFIX, moreThan: 10 },
  blankName: { azureId: '19054', payer: PLAN_SUITE.payerName, status: PLAN_LIFECYCLE.active },
} as const;

export const BLOCKED_CASES: PlanBlockedCase[] = [];
