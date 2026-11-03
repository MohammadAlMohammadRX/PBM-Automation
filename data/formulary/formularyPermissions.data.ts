import { NON_ADMIN_PROFILE } from '../accounts/nonAdminAccount.data';
import type { FormularyBlockedCase } from './formulary.data';

/**
 * US 18525 "Formulary Permissions" (formulary folder 22) - and the formulary
 * rights every permission case of the module shapes.
 *
 * HOW THE ROLE IS SHAPED (user decision 2026-11-02): the existing "Payer Admin"
 * role is granted / withheld rights the way the Plans and Terminology folders
 * do it. The shared shaping fixture (fixtures/shapedNonAdmin.fixture.ts) only
 * knows the keys of data/accounts/payerAdminRole.data.ts, which has no
 * formulary section - so the formulary rights are toggled by LABEL through the
 * `formularyRole` fixture of utils/formulary/writerCHelpers.ts, and the signed-in
 * session still comes from shapedNonAdmin (scope gate answered, viewport set).
 *
 * THE LABELS are code names, read off the live catalogue on 2026-10-24 (the
 * "Labels present" list RolePermissionsStep logs, reports/partials-fix-rerun-20261024/run-21.log):
 * AddFormularyTrade, AddPricingPeriod, "Import formularies, tiers and trades",
 * "View formulary upload history and results", CloneFormulary, CreateFormulary,
 * CreateTier, DeleteFormulary, DeleteFormularyTrade, DeletePricingPeriod,
 * DeleteRebate, DeleteTier, ExportFormularies, GetFormulariesDashboard,
 * GetFormulariesDropdown, GetFormulary, GetFormularyAuditTrail,
 * GetFormularyForClone, ExportFormularyTrades, GetFormularyVersions,
 * GetPriceHistory, ExportFormularyTiers, RevertFormularyVersion,
 * SetFormularyActive, SubmitFormularyForApproval, UpdateFormulary,
 * UpdateFormularyTrade, UpdatePricingPeriod, UpdateTier, UpsertRebate, and the
 * BenefitConfigs section AddBenefitConfig, DeleteBenefitConfig,
 * GetBenefitConfig, GetBenefitConfigsDashboard, UpdateBenefitConfig.
 *
 * PARENT NODES (INFERRED, not in that list because the list drops rows with an
 * (n/m) counter): `GetFormularies` - the list right, parent of the section, as
 * GetPayers / GetTerminologies are; `GetTiers` (parent of ExportFormularyTiers);
 * `GetFormularyTrades` (parent of ExportFormularyTrades); `BulkImport` (parent
 * of the two import rows); `GetBenefitConfigs`. A label the catalogue does not
 * have makes the shaping throw with the labels present, and the case reports
 * BLOCKED with that list - so a wrong guess is self-diagnosing, never a false
 * finding.
 *
 * THE TERMINOLOGY TRAP: granting the parent ticks every child; withholding one
 * child afterwards may leave the parent partly ticked and take the LIST right
 * with it. A case that needs "may view, may not X" checks the shaped account
 * can still list formularies (`requireFormularyListAccess`) and is BLOCKED with
 * that reason otherwise.
 *
 * Only ONE formulary-wide import right exists ("Import formularies, tiers and
 * trades") and Activate / Inactivate share SetFormularyActive: the story asks
 * for separate ones, which 18864 checks; the other cases shape the closest
 * right and say so.
 */
export const FORMULARY_RIGHT = {
  /** Parent of the section (verified 2026-11-02) - "may list formularies". */
  list: 'GetFormularies',
  view: 'GetFormulary',
  dashboard: 'GetFormulariesDashboard',
  dropdown: 'GetFormulariesDropdown',
  create: 'CreateFormulary',
  edit: 'UpdateFormulary',
  delete: 'DeleteFormulary',
  clone: 'CloneFormulary',
  viewForClone: 'GetFormularyForClone',
  /** Activate AND Inactivate (one right). */
  setActive: 'SetFormularyActive',
  submit: 'SubmitFormularyForApproval',
  revert: 'RevertFormularyVersion',
  versions: 'GetFormularyVersions',
  audit: 'GetFormularyAuditTrail',
  export: 'ExportFormularies',
  import: 'Import formularies, tiers and trades',
  importHistory: 'View formulary upload history and results',
  /** Parent of ExportFormularyTiers (verified 2026-11-02) - the Tiers tab. */
  tiers: 'GetTiers',
  createTier: 'CreateTier',
  updateTier: 'UpdateTier',
  deleteTier: 'DeleteTier',
  exportTiers: 'ExportFormularyTiers',
  /** Parent of ExportFormularyTrades (verified 2026-11-02) - the Trades & Pricing tab. */
  trades: 'GetFormularyTrades',
  addTrade: 'AddFormularyTrade',
  updateTrade: 'UpdateFormularyTrade',
  deleteTrade: 'DeleteFormularyTrade',
  tradeStatus: 'SetFormularyTradeStatus',
  exportTrades: 'ExportFormularyTrades',
  priceHistory: 'GetPriceHistory',
  addPrice: 'AddPricingPeriod',
  updatePrice: 'UpdatePricingPeriod',
  deletePrice: 'DeletePricingPeriod',
  upsertRebate: 'UpsertRebate',
  deleteRebate: 'DeleteRebate',
  /** BenefitConfigs section parent (verified 2026-11-02). */
  benefitList: 'GetBenefitConfigs',
  benefitView: 'GetBenefitConfig',
  benefitDashboard: 'GetBenefitConfigsDashboard',
  benefitAdd: 'AddBenefitConfig',
  benefitUpdate: 'UpdateBenefitConfig',
  benefitDelete: 'DeleteBenefitConfig',
} as const;

export type FormularyRight = keyof typeof FORMULARY_RIGHT;

/** The rights of the BenefitConfigs section (their effective codes read `BenefitConfigs.<label>`). */
export const BENEFIT_RIGHTS: readonly FormularyRight[] = ['benefitList', 'benefitView', 'benefitDashboard', 'benefitAdd', 'benefitUpdate', 'benefitDelete'];

/** A shape for the `formularyRole` fixture: rights to tick (first) and to untick (after). */
export interface FormularyShape {
  with?: readonly FormularyRight[];
  without?: readonly FormularyRight[];
}

/** Every formulary and benefit-configuration right - parents first, so unticking a parent clears its children before they are visited. */
export const ALL_FORMULARY_RIGHTS: readonly FormularyRight[] = [
  'list', 'tiers', 'trades', 'benefitList',
  ...(Object.keys(FORMULARY_RIGHT) as FormularyRight[]).filter((k) => !['list', 'tiers', 'trades', 'benefitList'].includes(k)),
];

/** Every write right of the Tiers tab. */
export const TIER_WRITE_RIGHTS: readonly FormularyRight[] = ['createTier', 'updateTier', 'deleteTier'];
/** Every write right of the Trades & Pricing tab (trade, price and rebate). */
export const TRADE_WRITE_RIGHTS: readonly FormularyRight[] = ['addTrade', 'updateTrade', 'deleteTrade', 'tradeStatus', 'addPrice', 'updatePrice', 'deletePrice', 'upsertRebate', 'deleteRebate'];
/** Every right that changes a formulary, its tabs or exports / imports its data. */
export const FORMULARY_WRITE_RIGHTS: readonly FormularyRight[] = [
  'create', 'edit', 'delete', 'clone', 'setActive', 'submit', 'revert', 'export', 'import', 'importHistory',
  ...TIER_WRITE_RIGHTS, 'exportTiers', ...TRADE_WRITE_RIGHTS, 'exportTrades', 'benefitAdd', 'benefitUpdate', 'benefitDelete',
];

/**
 * A role holding every formulary and benefit-configuration right - each one
 * named, not left to the parent: after a child was unticked the parent reads
 * "unchecked" (partly ticked), and toggling it did not give the audit right
 * back (18869 answered 403 in its "with the permission" half, 2026-11-02).
 */
export const FULL_ACCESS: FormularyShape = { with: ALL_FORMULARY_RIGHTS };
/** Every right named (as FULL_ACCESS), then `withhold` unticked. */
export const fullAccessWithout = (...withhold: FormularyRight[]): FormularyShape => ({
  with: ALL_FORMULARY_RIGHTS.filter((r) => !withhold.includes(r)),
  without: withhold,
});
/** A view-only formulary user: the list, then every write right withheld. */
export const VIEW_ONLY: FormularyShape = fullAccessWithout(...FORMULARY_WRITE_RIGHTS);
/** A role holding no formulary right at all. */
export const NO_ACCESS: FormularyShape = { without: ALL_FORMULARY_RIGHTS };

/**
 * The payer the permission cases build their formulary for: one IN the Payer
 * Admin's scope, so what it is offered can only be explained by the permission,
 * never by the payer scope (the Plans permission cases do the same).
 */
// NUPCO, the ACTIVE one of the account's two payers: "Al Dawaa 2" (scopedPayers[0])
// was inactive on 2026-11-02, so the create form no longer offers it (19385).
export const SCOPED_PAYER = NON_ADMIN_PROFILE.scopedPayers[1];

/** The administrator as the screens name it (requested / reviewed by). */
export const ADMIN_NAME = 'CareConnect Admin User';

/** What a refused direct request answers. */
export const FORBIDDEN = 403;

/**
 * 18864 - the permissions the story names, with the catalogue labels that would
 * satisfy each (a separate, selectable row). Activate and Inactivate are asked
 * for separately; Tiers / Trades import separately from the formulary import.
 */
export const REQUIRED_PERMISSIONS = {
  actions: {
    'Send for Approval': ['SubmitFormularyForApproval'],
    Activate: ['ActivateFormulary', 'Activate formulary', 'SetFormularyActive'],
    Inactivate: ['InactivateFormulary', 'DeactivateFormulary', 'Deactivate formulary', 'Inactivate formulary'],
    Delete: ['DeleteFormulary'],
    Clone: ['CloneFormulary'],
    View: ['GetFormulary'],
    Import: ['Import formularies, tiers and trades', 'ImportFormularies'],
    Export: ['ExportFormularies'],
  },
  tabs: {
    Tiers: ['GetTiers'],
    'Trades & Pricing': ['GetFormularyTrades'],
    'Version History': ['GetFormularyVersions'],
    'Audit History': ['GetFormularyAuditTrail'],
  },
  tierSub: {
    'Add/Edit/Delete': ['CreateTier'],
    Import: ['ImportFormularyTiers', 'Import formulary tiers'],
    Export: ['ExportFormularyTiers'],
  },
  tradeSub: {
    'Add/Edit/Delete': ['AddFormularyTrade'],
    Import: ['ImportFormularyTrades', 'Import formulary trades'],
    Export: ['ExportFormularyTrades'],
  },
} as const;

/** 18863 - the combination saved at the end of the exploration (View + Tiers tab + Tiers export). */
export const EXPLORED_COMBINATION: readonly FormularyRight[] = ['view', 'tiers', 'exportTiers'];
/** 18863 - the rights toggled on and off during the exploration. */
export const EXPLORED_TOGGLES: readonly FormularyRight[] = ['clone', 'delete', 'export', 'versions', 'audit', 'createTier'];
/** 18863 - a right of ANOTHER module whose state must not move while formulary rights are toggled. */
export const UNRELATED_RIGHT = 'GetPayer';

export const CASES = {
  grantSubmit: { azureId: '18841', shape: { without: ALL_FORMULARY_RIGHTS, with: [] } as FormularyShape, grant: 'submit' as FormularyRight },
  noSubmit: { azureId: '18842', shape: fullAccessWithout('submit') },
  noActivate: { azureId: '18843', shape: fullAccessWithout('setActive') },
  noInactivate: { azureId: '18844', shape: fullAccessWithout('setActive') },
  deleteOnlyWithRight: { azureId: '18845', viewOnly: fullAccessWithout('delete'), withDelete: FULL_ACCESS },
  noView: { azureId: '18846', shape: fullAccessWithout('view') },
  noImport: { azureId: '18847', shape: fullAccessWithout('import') },
  noClone: { azureId: '18848', shape: fullAccessWithout('clone', 'viewForClone') },
  noExport: { azureId: '18849', shape: fullAccessWithout('export') },
  tiersTabOnly: { azureId: '18850', shape: fullAccessWithout('trades', 'versions', 'audit') },
  tradesNotVersions: { azureId: '18851', shape: fullAccessWithout('versions') },
  tierManagement: { azureId: '18852', shape: FULL_ACCESS, newTier: { nameEn: 'Automation Permission Tier', nameAr: 'مستوى الصلاحيات', coverage: 70, order: 2 }, editedCoverage: 65 },
  auditTabOnly: { azureId: '18853', shape: fullAccessWithout('tiers', 'trades', 'versions') },
  tiersReadOnly: { azureId: '18854', shape: fullAccessWithout(...TIER_WRITE_RIGHTS), editedCoverage: 55 },
  tierExport: { azureId: '18855', without: fullAccessWithout('exportTiers'), withExport: FULL_ACCESS },
  tierImport: { azureId: '18856', without: fullAccessWithout('import'), withImport: FULL_ACCESS, importedTier: ['Automation Imported Tier', 'مستوى مستورد', '60', '2', 'Imported by the automation suite.', ''] },
  tradeManagement: { azureId: '18857', shape: FULL_ACCESS, addedTrade: 'MED-002', editedSupplierPrice: 11 },
  tradesReadOnly: { azureId: '18858', shape: fullAccessWithout(...TRADE_WRITE_RIGHTS), editedSupplierPrice: 13 },
  tradeImportNotExport: { azureId: '18859', shape: fullAccessWithout('exportTrades'), importedTrade: 'MED-003' },
  workflowSequence: { azureId: '18860', shape: FULL_ACCESS },
  independentRights: { azureId: '18861', exportOnly: { with: ['export'] } as FormularyShape, exportAndView: { with: ['export', 'view'] } as FormularyShape },
  bypass: { azureId: '18862', shape: VIEW_ONLY },
  exploration: { azureId: '18863' },
  catalogueComplete: { azureId: '18864' },
  noRights: { azureId: '18865', shape: NO_ACCESS },
  everyRight: { azureId: '18866', shape: FULL_ACCESS },
} as const;

/** Nothing in this story is BLOCKED by data: every case shapes the Payer Admin role (see above). */
export const BLOCKED_CASES: FormularyBlockedCase[] = [];
