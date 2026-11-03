import type { NetworkBlockedCase } from '../networks/network.data';
import {
  FORMULARY_SUITE_PAYER,
  SUITE_FORMULARY_PREFIX,
  SUITE_TRADES,
  formularyDateText,
} from '../../utils/FormularyProvisioning';

/**
 * Shared test data for the Formulary Management module (Feature 15190, Azure
 * export `reports/formulary/source/formulary-azure-export-2026-11-02.json`,
 * 342 cases in 22 stories; 335 automated, 7 Manual). Every label and message
 * below was read off the live screens / answers on 2026-11-02
 * (reports/formulary/Formulary-Foundation-Notes.md).
 *
 * Roles. The administrator (`careconnect`) holds every Formularies.* and
 * BenefitConfigs.* right and plays the Formulary Administrator, the Benefits
 * Configuration Analyst and the Compliance Officer. The restricted roles are
 * the Payer Admin account shaped per case (fixtures/shapedNonAdmin.fixture.ts).
 * There is ONE checker: the administrator approves its own submissions (the
 * shared approvals module allows it - see the Plans suite).
 */

export type FormularyBlockedCase = NetworkBlockedCase;

/** The suite's owning payer and name prefix. Never touch FORM-0023 "Al Sharq 2" (the Plans suite's). */
export const FORMULARY_SUITE = {
  payerName: FORMULARY_SUITE_PAYER,
  prefix: SUITE_FORMULARY_PREFIX,
  /** The Plans suite's formulary - read-only for this suite. */
  protectedCode: 'FORM-0023',
  protectedName: 'Al Sharq 2',
} as const;

/** The catalogue trades the suite uses (MED-001 Paracetamol 500mg, MED-002 Amoxicillin 250mg, MED-003 Metformin 850mg). */
export const TRADES = SUITE_TRADES;

/** How the trade picker labels a trade ("Paracetamol 500mg — MED-001"). */
export const tradeOptionLabel = (trade: { nameEn: string; code: string }): string => `${trade.nameEn} — ${trade.code}`;

/** Lifecycle status labels (list badge, quick filter, advanced search). */
export const FORMULARY_STATUS = {
  notLive: 'Not Live',
  /** The status code `pending`: labelled "Future" on badges and KPI, "Pending" in the status filters. */
  future: 'Future',
  pendingFilter: 'Pending',
  active: 'Active',
  inactive: 'Inactive',
  expired: 'Expired',
} as const;

/** The quick status filter's options, in order. */
export const STATUS_FILTER_OPTIONS = ['All Statuses', 'Not Live', 'Pending', 'Active', 'Inactive', 'Expired'] as const;
/** The advanced search's status options. */
export const ADVANCED_STATUS_OPTIONS = ['Not Live', 'Pending', 'Active', 'Inactive', 'Expired'] as const;

/** Approval status labels (the `v<n> · <status>` badge and column). */
export const APPROVAL_STATUS = {
  draft: 'Draft',
  pending: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
} as const;
export const APPROVAL_STATUS_OPTIONS = ['Draft', 'Pending Approval', 'Rejected', 'Approved'] as const;

/** Version History "Approval Status" labels (a later approval marks the earlier ones Superseded). */
export const VERSION_STATUS = {
  draft: 'Draft',
  pending: 'Pending Approval',
  published: 'Published',
  superseded: 'Superseded',
  rejected: 'Rejected',
} as const;

/** Version History "Change" labels seen: "Created", "Updated", "Deactivated (v1)"; the API's changeType: Create, Update, Inactivate, Clone. */
export const VERSION_CHANGE = { created: 'Created', updated: 'Updated', deactivated: /^Deactivated/ } as const;

/** Audit trail action types (GetFormularyAuditTrail `actionType`, the drawer's action chip). */
export const AUDIT_ACTION = {
  update: 'UPDATE',
  submitted: 'SUBMITTED_FOR_APPROVAL',
  approved: 'APPROVED',
  rejected: 'REJECTED',
  superseded: 'SUPERSEDED',
  statusChange: 'STATUS_CHANGE',
} as const;

/** `v0 · Draft` etc. - the version badge text. */
export const versionBadge = (version: number, status: string): string => `v${version} · ${status}`;

/** The status codes behind the labels (GetFormulary statusId / effectiveStatusId lookup codes). */
export const STATUS_CODE = { pending: 'pending', active: 'active', inactive: 'inactive', expired: 'expired' } as const;

/** Trade status labels (card badge, filters) and the toggle's labels. */
export const TRADE_STATUS = { active: 'Active', suspended: 'Suspended' } as const;
export const TRADE_TOGGLE_LABEL = { suspend: 'Suspend', reactivate: /Reactivate|Activate/ } as const;

/** Rebate types, as the selects offer them. */
export const REBATE_TYPES = ['No rebate', 'Percent of Net Price', 'Flat Value', 'Per Dispense Unit'] as const;

/** Benefit configuration statuses (lookup `benefitConfigStatus`). */
export const BENEFIT_STATUS = { future: 'Future', active: 'Active', expired: 'Expired', draftNew: 'Draft · New' } as const;

/** KPI tile labels. */
export const KPI_LABEL = {
  total: 'Total Formularies',
  active: 'Active Formularies',
  pending: 'Future Formularies',
  inactive: 'Inactive Formularies',
  expired: 'Expired Formularies',
} as const;

/** List column headers, in order. */
export const LIST_HEADERS = ['Name', 'Code', 'Payer', 'Tiers', 'Trades', 'Effective Date', 'Expiry Date', 'Status', 'Approval Status', 'Actions'] as const;
/** Version History headers. */
export const VERSION_HEADERS = ['Version', 'Change', 'Approval Status', 'Requested By', 'Requested On', 'Reviewed By', 'Reviewed On', 'Actions'] as const;

/** Sort menu labels by field / direction. */
export const SORT_LABEL = {
  name: { asc: 'Name (A-Z)', desc: 'Name (Z-A)' },
  code: { asc: 'Code (A-Z)', desc: 'Code (Z-A)' },
  status: { asc: 'Status (A-Z)', desc: 'Status (Z-A)' },
  effectiveDate: { asc: 'Effective Date (A-Z)', desc: 'Effective Date (Z-A)' },
  expiryDate: { asc: 'Expiry Date (A-Z)', desc: 'Expiry Date (Z-A)' },
  createdOn: { asc: 'Created On (Oldest to Newest)', desc: 'Created On (Newest to Oldest)' },
  modifiedOn: { asc: 'Last Modified (Oldest to Newest)', desc: 'Last Modified (Newest to Oldest)' },
} as const;

/** Codes: a never-approved formulary carries a TEMPORARY code, the permanent one comes with approval. */
export const CODE_PATTERN = { temporary: /^FORM-D-\d{4}$/, permanent: /^FORM-\d{4}$/ } as const;
/** Benefit configuration codes once approved. */
export const BENEFIT_CODE_PATTERN = /^BNF-\d{6}$/;

/** Dates as every formulary screen shows and takes them. */
export const DATE_TEXT = /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/;
export { formularyDateText };

/** Toasts (summary / detail), verified 2026-11-02. */
export const TOAST_TEXT = {
  savedAsDraft: /Saved as draft/i,
  savedAsDraftDetail: /Your changes were saved as a draft\. Send the record for approval when you are ready\./i,
  submitted: /Submitted for approval/i,
  submittedDetail: /waiting for a second authorized user to approve it/i,
  draftDiscarded: /Draft discarded|The draft formulary has been discarded/i,
  tierCreated: /Tier created\./i,
  tierUpdated: /Tier updated\./i,
  tierDeleted: /Tier deleted/i,
  tradeAdded: /Trade added to the formulary\./i,
  tradeSuspended: /Trade suspended\./i,
  tradeReactivated: /Trade reactivated\./i,
  tradeRemoved: /removed|deleted/i,
  priceSaved: /Price record saved\./i,
  priceRemoved: /Price record removed\./i,
  rebateSaved: /Rebate saved\./i,
  benefitCreated: /Benefit configuration created|The benefit configuration has been created\./i,
  benefitUpdated: /updated/i,
  benefitDeleted: /deleted/i,
  rejected: /Submission rejected\./i,
} as const;

/** Server answers (successMessage / ValidationErrors[].Reason), verified 2026-11-02. */
export const SERVER_MESSAGE = {
  createdAsDraft: 'The formulary has been saved as a draft. Send it for approval when you are ready.',
  submitted: 'The change has been submitted for approval.',
  alreadyPending: 'A change on this formulary is already awaiting approval. Please wait for it to be decided before submitting another.',
  noDraftChanges: 'This formulary has no draft changes to send for approval.',
  publishedDetailsLocked: /Formulary details cannot be edited once the first version has been published/i,
  pendingEditWithdraws: 'This formulary is awaiting approval. Saving this change withdraws that request and returns the formulary to draft.',
  tierOrderUnique: 'Tier order must be unique within the formulary.',
  tierInUse: 'A tier cannot be deleted while trades are assigned to it.',
  priceOverlap: /This period overlaps the price .* which cannot be moved/i,
  deletionStaged: 'The deletion has been saved as a draft. Send it for approval when you are ready.',
  draftDiscarded: 'The draft formulary has been discarded.',
  benefitSavedToDraft: "Saved to the formulary's draft. Send the formulary for approval to submit this cost-sharing change.",
  cloneSaved: 'The clone has been saved as a draft. Send it for approval when you are ready.',
  approvalRejected: 'Approval request rejected.',
} as const;

/** Field messages (under the field), verified 2026-11-02. */
export const FIELD_MESSAGE = {
  required: 'This field is required.',
  copayOrCoinsurance: 'Provide at least a copayment amount or a coinsurance percentage.',
} as const;

/** What messages must say, by meaning, where the wording is not fixed by the case. */
export const MESSAGE = {
  required: /required/i,
  maxLength: /exceed|maximum|at most|longer than|too long|characters/i,
  arabicOnly: /arabic/i,
  englishOnly: /english|latin/i,
  pastDate: /past|today|future|earlier|before/i,
  afterEffective: /after|later|greater|before|expiry|end date/i,
  unique: /unique|already exists|duplicate|already/i,
  range: /between|range|0.*100|100|maximum|minimum|greater|less/i,
  denied: /permission|not authori[sz]ed|access denied|forbidden|not allowed/i,
  notFound: /not found|no longer|does not exist|unable to load|deleted/i,
  assignedToPlan: /plan/i,
  pendingApproval: /pending|awaiting|approval/i,
  noData: /no data|no rows|no records|empty|nothing|no results|no formular/i,
} as const;

/** Raw technical detail a user-facing message must not expose. */
export const TECHNICAL_DETAIL = /stack ?trace|exception|at PBM\.|\.cs:|sql|null reference|\bline \d+/i;

/** Dialog titles (shared `pbm-dialog`), verified 2026-11-02. */
export const DIALOG_TITLE = {
  sendForApproval: 'Send for approval?',
  deleteFormulary: 'Delete Formulary',
  deleteTier: 'Delete Tier',
  deleteTrade: 'Delete Trade',
  deletePrice: 'Delete price record',
  suspendTrade: 'Suspend trade',
  reactivateTrade: 'Reactivate trade',
  unsavedChanges: 'Unsaved Changes',
  rejectRequest: 'Reject this request',
  export: 'Export',
} as const;

/** Notices on the screens (substrings), verified 2026-11-02. */
export const NOTICE = {
  pendingCreate: /Not published yet/i,
  draftFirst: /Every change to this formulary .* is saved as a draft first/i,
  tiersDefine: /Tiers define cost-sharing groups\. Every trade must be assigned to a tier\./i,
  netPriceFormula: /NetPrice = \(Supplier − Supplier × Discount%\) × \(1 \+ VAT%\)/,
  benefitRule: /Provide at least one of Copayment or Coinsurance\. A sublimit amount and period must be set together\./i,
  deactivateNeedsApproval: /Needs approval/i,
  cloneSource: /This creates a NEW formulary from/i,
  clonePeriod: /A clone does not inherit its source period/i,
  savedAsDraftOnCreate: /The formulary is saved as a draft\. Nothing goes live until you send it for approval/i,
} as const;

/** Net price as the screens compute it: (Supplier − Supplier × Discount%) × (1 + VAT%), to 2 places. */
export const netPrice = (supplier: number, discountPct: number, vatPct: number): number =>
  Math.round((supplier - supplier * discountPct / 100) * (1 + vatPct / 100) * 100) / 100;

/** Free text a case may type. */
export const SAFE_TEXT = {
  nameAr: 'قائمة الأتمتة',
  descriptionEn: 'Built by an automated formulary case.',
  descriptionAr: 'أنشأتها حالة اختبار آلية',
  tierNameAr: 'مستوى الأتمتة',
  benefitNameAr: 'منفعة الأتمتة',
} as const;

/** Script / injection payloads for the input-safety cases. */
export const INJECTION = {
  script: '<script>alert("x")</script>',
  sql: "'; DROP TABLE Formularies; --",
} as const;

/** Text of an exact length (for the 100 / 255 / 1000 character limits). */
export const textOfLength = (length: number, seed = 'A'): string => seed.repeat(length).slice(0, length);
/** Arabic text of an exact length. */
export const arabicOfLength = (length: number): string => 'ق'.repeat(length);

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const CSV_MIME = 'text/csv';
