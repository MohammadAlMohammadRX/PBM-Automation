import { RandomDataUtils } from '../../utils/RandomDataUtils';
import { toArabicToken } from '../payers/payer.data';
import { DISPOSABLE_NETWORK_PREFIX } from '../../utils/NetworkProvisioning';

/**
 * Shared test data for the Network Management module (Feature 14116).
 *
 * Every value here was read off the live application on 2026-10-21 by DOM and
 * traffic probes - the list, the wizard, the detail tabs, the export file and
 * the lookups - rather than taken from the stories. Where a story's wording
 * differs from what the screen says, the STORY's expectation lives in the
 * story's own data file and the screen's wording lives here, so a mismatch is
 * a visible assertion failure rather than a silently "corrected" test.
 */

/** The Azure Feature every network user story hangs off. */
export const NETWORK_FEATURE = { id: '14116', title: 'Network Management' } as const;

/** A network as the Add / Edit wizard takes it. Dates are `DD/MM/YYYY HH:mm`. */
export interface NetworkFormData {
  nameEn: string;
  nameAr: string;
  type: string;
  descriptionEn?: string;
  descriptionAr?: string;
  effectiveDate: string;
  expiryDate: string;
}

/** The administrator-maintained network types (lookup `networkType`). */
export const NETWORK_TYPES = ['HMO', 'PPO', 'EPO', 'POS'] as const;
export type NetworkType = (typeof NETWORK_TYPES)[number];

/** Lifecycle statuses as the row and header badges render them. */
export const NETWORK_LIFECYCLE = {
  pending: 'Pending',
  active: 'Active',
  inactive: 'Inactive',
  expired: 'Expired',
  /** A never-approved draft: it has no live status yet. */
  notLive: 'Not Live',
} as const;

/** The status lookup codes behind those labels (lookup `networkStatus`). */
export const NETWORK_STATUS_CODE = {
  pending: 'pending',
  active: 'active',
  inactive: 'inactive',
  expired: 'expired',
} as const;

/** The approval cell's `v{n} · {state}` states. */
export const NETWORK_APPROVAL_STATE = {
  draft: 'Draft',
  pendingApproval: 'Pending Approval',
  published: 'Published',
  rejected: 'Rejected',
} as const;

/** The KPI tiles, in the order the band shows them. */
export const NETWORK_KPI_LABELS = {
  total: 'Total Networks',
  active: 'Active Networks',
  pending: 'Pending Networks',
  inactive: 'Inactive Networks',
  expired: 'Expired Networks',
} as const;

/** The list's columns, by header text, in order. */
export const NETWORK_LIST_HEADERS = [
  'Network Name',
  'Network Code',
  'Payer',
  'Network Type',
  'Status',
  'Effective Date',
  'Expiry Date',
  'Facilities',
  'Linked Policies',
  'Approval Status',
  'Actions',
] as const;

/** The list's quick-filter defaults. */
export const NETWORK_FILTER_DEFAULT = { type: 'All Types', status: 'All Statuses' } as const;

/** The Sort By menu, in menu order (verified 2026-10-21). */
export const NETWORK_SORT_OPTIONS = [
  'Network Name (A-Z)',
  'Network Name (Z-A)',
  'Network Code (A-Z)',
  'Network Code (Z-A)',
  'Network Type (A-Z)',
  'Network Type (Z-A)',
  'Status (A-Z)',
  'Status (Z-A)',
  'Effective Date (A-Z)',
  'Effective Date (Z-A)',
  'Expiry Date (A-Z)',
  'Expiry Date (Z-A)',
  'Created On (Newest to Oldest)',
  'Created On (Oldest to Newest)',
  'Last Modified (Newest to Oldest)',
  'Last Modified (Oldest to Newest)',
] as const;

/** The default list order, as the list's own request states it. */
export const NETWORK_DEFAULT_SORT = 'CreatedOn desc';

/** The detail screen's tabs, in order. Counts follow the two middle labels. */
export const NETWORK_DETAIL_TABS = [
  'Overview',
  'Facility Assignment',
  'Linked Policies',
  'Version History',
  'Audit History',
] as const;

/** The Add Network wizard's step titles. */
export const NETWORK_WIZARD_STEPS = ['Basic Information', 'Effective Period'] as const;

/** The wizard titles per mode. */
export const NETWORK_WIZARD_TITLE = {
  add: 'Add New Network',
  edit: 'Edit Network',
} as const;

/** Messages the application shows, word for word. */
export const NETWORK_MESSAGE = {
  required: 'This field is required.',
  effectiveInPast: 'Effective date and time cannot be in the past.',
  /** Step 2's notice. */
  initialPending: 'Initial status will be set to Pending',
  /** The draft hint on the detail header of a never-approved network. */
  draftHint: 'This network is a draft. It is not live yet',
  noPolicies: 'No policies linked to this network yet.',
  /** The list's empty state when a search or filter matches nothing. */
  noNetworksFound: 'No networks found.',
  discardTitle: 'Unsaved Changes',
  deleteTitle: 'Delete Network',
  removeFacilityTitle: 'Delete facility',
  exportTitle: 'Export',
  exportPrompt: 'Choose the record type and the file format.',
  inactivateTitle: 'Inactivate Network',
  needsApproval: 'Needs approval',
} as const;

/** Toasts, as `{ summary, detail }` (the shape Toast.expectText takes). */
export const NETWORK_TOAST = {
  savedAsDraft: {
    summary: 'Saved as draft',
    detail: 'Your changes were saved as a draft. Send the record for approval when you are ready.',
  },
  noChanges: {
    summary: 'No changes to submit',
    detail: 'No changes were made — there is nothing to submit for approval.',
  },
} as const;

/** Server answers worth asserting on the wire. */
export const NETWORK_SERVER_MESSAGE = {
  draftDiscarded: 'The draft network has been discarded.',
  savedAsDraft: 'The network has been saved as a draft. Send it for approval when you are ready.',
  noChanges: 'No changes were made - there is nothing to submit for approval.',
} as const;

/** The exported file's header row (CSV and Excel alike), verified 2026-10-21. */
export const NETWORK_EXPORT_HEADERS = [
  'Network Code',
  'Network Name (English) *',
  'Network Name (Arabic) *',
  'Network Type *',
  'Payer Code',
  'Description (English)',
  'Description (Arabic)',
  'Effective Date *',
  'Expiry Date *',
] as const;

/** Export file names: `Networks_YYYYMMDD_HHmmss.csv|xlsx`. */
export const NETWORK_EXPORT_FILE = /^Networks_\d{8}_\d{6}\.(csv|xlsx)$/;

/**
 * The 25 Network permissions in the role catalogue (verified 2026-10-21 in
 * Role Administration > Networks). Labels are the catalogue's own.
 */
export const NETWORK_PERMISSION_LABELS = [
  'View Audit Logs',
  'GetNetworks',
  'AssignFacilitiesToNetwork',
  'Import networks and facilities',
  'View network upload history and results',
  'CloneNetwork',
  'CreateNetwork',
  'DeleteNetwork',
  'ExportNetworks',
  'GetAssignableFacilities',
  'GetNetwork',
  'GetNetworkAuditTrail',
  'GetNetworkFacilities',
  'ExportNetworkFacilities',
  'GetNetworkForClone',
  'GetNetworkPolicies',
  'GetNetworksDashboard',
  'GetNetworksDropdown',
  'GetNetworkVersions',
  'InactivateNetwork',
  'SetNetworkActive',
  'SubmitNetworkForApproval',
  'UnassignFacilityFromNetwork',
  'UpdateNetwork',
  'RevertNetworkVersion',
] as const;

/** The Network Approvals permissions (Approval Management group). */
export const NETWORK_APPROVAL_PERMISSIONS = ['Approve/Reject', 'Approve/Reject all'] as const;

/**
 * The active pharmacies the cases use (2026-10-24 - FCL-000007/08 had lapsed;
 * see facilities.data.ts).
 */
/**
 * The network types as the ARABIC interface labels them (read live 2026-10-25).
 * The form offers these, not "HMO", once the language is Arabic - 18014 and
 * 18020 timed out looking for "HMO" in an Arabic drawer.
 */
export const NETWORK_TYPE_LABEL_AR: Readonly<Record<string, string>> = {
  HMO: 'منظمة الصيانة الصحية',
  PPO: 'منظمة مقدمي الخدمة المفضلين',
  EPO: 'منظمة مقدمي الخدمة الحصريين',
  POS: 'نقطة الخدمة',
};

/** The network statuses as the ARABIC interface labels them (read live 2026-10-25). */
export const NETWORK_STATUS_LABEL_AR: Readonly<Record<string, string>> = {
  Pending: 'قيد الانتظار',
  Active: 'نشطة',
  Inactive: 'غير نشطة',
  Expired: 'منتهية',
};

export const KNOWN_FACILITIES = [
  { code: 'FCL-000025', nameEn: 'QA Automation Pharmacy A' },
  { code: 'FCL-000026', nameEn: 'QA Automation Pharmacy B' },
  { code: 'FCL-000030', nameEn: 'Facility Al - Tawnyah' },
] as const;

/**
 * A sheet case that cannot run in this environment. The story's data file
 * lists these and its spec generates one BLOCKED test per entry, naming the
 * exact resource it waits for - so every Azure case appears in the report and
 * becomes a real test the moment that resource exists.
 */
export interface NetworkBlockedCase {
  /** The Azure Test Case id. */
  azureId: string;
  /** "should <behaviour> when <condition>". */
  title: string;
  /** What is missing, and what would make the case runnable. */
  reason: string;
}

// ---- builders -----------------------------------------------------------------

const pad = (n: number): string => String(n).padStart(2, '0');

/** `DD/MM/YYYY HH:mm` for a Date, as the wizard's pickers take it. */
export function toPickerDateTime(date: Date): string {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `DD/MM/YYYY` for a Date, as the list and the overview print the day. */
export function toDisplayDate(date: Date): string {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/**
 * A picker value `days` from today at `time` (HH:mm). Today with a time a few
 * minutes ahead is the earliest value the form accepts: since the date+time
 * build, "today 00:00" is refused as being in the past.
 */
export function pickerDateTime(days: number, time = '10:00'): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const [h, m] = time.split(':').map(Number);
  date.setHours(h, m, 0, 0);
  return toPickerDateTime(date);
}

/** A picker value `minutes` from now. */
export function pickerMinutesFromNow(minutes: number): string {
  return toPickerDateTime(new Date(Date.now() + minutes * 60_000));
}

/** A unique, valid network for the wizard; override any field. */
export function buildNetwork(overrides: Partial<NetworkFormData> = {}): NetworkFormData {
  const suffix = RandomDataUtils.uniqueSuffix();
  return {
    nameEn: `${DISPOSABLE_NETWORK_PREFIX} ${suffix}`,
    nameAr: `شبكة ${toArabicToken(suffix)}`,
    type: 'HMO',
    descriptionEn: 'Created by an automated network case.',
    descriptionAr: `وصف ${toArabicToken(suffix)}`,
    effectiveDate: pickerDateTime(1),
    expiryDate: pickerDateTime(366),
    ...overrides,
  };
}

/**
 * A unique ARABIC-ONLY name from a prefix. Digits are refused by the server
 * ("Arabic network name must contain only Arabic characters." - 422, verified
 * 2026-10-21), so uniqueness comes from an Arabic-letter token.
 */
export function uniqueArabic(prefix: string): string {
  return `${prefix} ${toArabicToken(RandomDataUtils.uniqueSuffix())}`;
}

/** A string of `length` characters built from `unit`. */
export const repeatTo = (unit: string, length: number): string =>
  unit.repeat(Math.ceil(length / unit.length)).slice(0, length);
