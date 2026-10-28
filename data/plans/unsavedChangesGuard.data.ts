import { pickerDateTime } from '../networks/network.data';
import { networkStamp } from '../../utils/NetworkProvisioning';
import { NAV } from '../../constants/ElementIds';
import { NON_ADMIN_PROFILE } from '../accounts/nonAdminAccount.data';
import { planFormData, planNamed, type PlanFormData } from './plan.data';
import type { PlanSpec } from '../../utils/PlanProvisioning';
import type { DrawerExitPath } from '../../pages/components/EntityWizardDialog';

/**
 * Test data for US 14165 "Warn before discarding unsaved plan form changes"
 * (plan folder 14), written 2026-10-27.
 *
 * THE GUARD is the application's shared dialog ("Unsaved Changes") with the
 * `stay` (Keep Editing) and `discard` (Discard Changes) action keys - see
 * ConfirmDialog. The sheet's "Cancel" is the `stay` action: whatever its label,
 * it is the one that dismisses the warning and returns to the form.
 *
 * MAPPED FIELDS: the plan form has no Status and no Plan Code (verified
 * 2026-10-27 - names, payer, type, descriptions and dates only), so 19144's
 * "Plan Status Active -> Inactive" is the Plan Type Individual -> Family, and
 * 19155's "Plan Code cleared" is the required Plan Name cleared.
 *
 * ROLES (19153): the second role "with edit permission" is the non-admin
 * account (Payer Admin) shaped to HOLD UpdatePlan, on a plan of its scoped
 * payer - the administrator is the first.
 */

/** The guard's action keys: Discard, and the dismissal the sheet calls Cancel. */
export const GUARD_ACTIONS = ['discard', 'stay'] as const;

/** The guard's labels: a Discard button and a Cancel / Keep Editing button. */
export const GUARD_LABEL = { discard: /discard/i, cancel: /cancel|keep editing|stay/i } as const;

/** What the guard's text must convey - unsaved changes that will be lost. */
export const GUARD_WARNING = /unsaved|discard|lose|lost|leave/i;

/** A unique edited text value. */
export const edited = (label: string): string => `${label} ${networkStamp()}`;

/** A case's own plan to edit: a draft effective a day ahead. */
export const GUARD_PLAN: PlanSpec = { effectiveInMinutes: 24 * 60, expiryInMinutes: 400 * 24 * 60 };

/** A plan the non-admin account can see and edit: a draft of its first scoped payer, no formulary. */
export const NON_ADMIN_GUARD_PLAN: PlanSpec = { ...GUARD_PLAN, payerName: NON_ADMIN_PROFILE.scopedPayers[0], noFormulary: true };

/** The in-app navigation target of 19146 ("Payer Directory module"). */
export const NAVIGATION_TARGET = NAV.payerManagement;

/** How many rapid clicks 19150 fires at the close control. */
export const RAPID_CLOSE_CLICKS = 4;

/** The exit paths 19151 walks, in the sheet's order. */
export const EXIT_PATHS: { via: DrawerExitPath; label: string }[] = [
  { via: 'close-button', label: 'the drawer\'s close (X) icon' },
  { via: 'escape', label: 'the Escape key' },
  { via: 'outside-click', label: 'a click outside the drawer' },
];

/** 19149's decision table - the guard shows for the dirty combinations only. */
export const MODE_STATE_TABLE: { mode: 'create' | 'edit'; dirty: boolean; label: string }[] = [
  { mode: 'create', dirty: true, label: 'Create+Dirty' },
  { mode: 'create', dirty: false, label: 'Create+Pristine' },
  { mode: 'edit', dirty: true, label: 'Edit+Dirty' },
  { mode: 'edit', dirty: false, label: 'Edit+Pristine' },
];

/** The table's rows with what to type: a unique value for a dirty row, null (type nothing) for a pristine one. */
export const modeStateRows = (): { mode: 'create' | 'edit'; label: string; dirtyValue: string | null }[] =>
  MODE_STATE_TABLE.map((row) => ({ mode: row.mode, label: row.label, dirtyValue: row.dirty ? edited(row.label) : null }));

/** What 19149 expects of each combination: a guard exactly when dirty. */
export const EXPECTED_TABLE: Record<string, boolean> = Object.fromEntries(MODE_STATE_TABLE.map((row) => [row.label, row.dirty]));

export const GUARD = {
  createDirty: { azureId: '19142', typedName: () => planNamed('Draft Plan') },
  editDirty: { azureId: '19143', newExpiry: () => pickerDateTime(500) },
  discard: { azureId: '19144', originalType: 'Individual', changedType: 'Family' },
  cancel: { azureId: '19145', description: () => edited('Kept while the warning is cancelled') },
  navigateAway: { azureId: '19146', description: () => edited('Unsaved before navigating away') },
  afterSave: { azureId: '19147', build: (): PlanFormData => planFormData({ nameEn: planNamed('Platinum Care') }) },
  pristine: { azureId: '19148' },
  decisionTable: { azureId: '19149', description: () => edited('Dirty combination'), typedName: () => planNamed('Dirty Create') },
  rapidClose: { azureId: '19150', description: () => edited('Rapid close clicks') },
  everyExitPath: { azureId: '19151', description: () => edited('Exit path probe') },
  browserLeave: { azureId: '19152', description: () => edited('Unsaved before a reload') },
  everyRole: { azureId: '19153', description: () => edited('Guard per role') },
  dialogContent: { azureId: '19154', description: () => edited('Guard wording probe') },
  failedSave: { azureId: '19155', description: () => edited('Dirty beside an invalid field') },
} as const;
