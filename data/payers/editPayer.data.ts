import { RandomDataUtils } from '../../utils/RandomDataUtils';

/**
 * Test data for the user story: Edit Existing Payer Configuration Details.
 */

/** Fields the user story defines as system-generated and therefore NOT editable. */
export const NON_EDITABLE_FIELDS = ['Payer ID', 'Payer Code'] as const;
export type NonEditableField = (typeof NON_EDITABLE_FIELDS)[number];

/** Detail-view labels (verified against the payer detail screen). */
export const DETAIL_LABELS = {
  payerCode: 'Payer Code',
  status: 'Status',
  licenseNumber: 'License Number',
  effectiveDate: 'Effective Date',
  expiryDate: 'Expiry Date',
  createdBy: 'Created By',
  createdAt: 'Created At',
  modifiedBy: 'Modified By',
  /** The application's name for the story's "UpdatedAt" timestamp. */
  modifiedAt: 'Modified At',
} as const;

/** Approval-queue change type raised by an edit. */
export const EDIT_CHANGE_TYPE = 'Update';

export const EDIT_REJECTION_REASON = 'Incorrect Data';

/** Maximum accepted length of Payer Name, per the user story (TC-005). */
export const PAYER_NAME_MAX_LENGTH = 100;

export interface LengthBoundaryCase {
  id: string;
  label: string;
  length: number;
  expectAccepted: boolean;
}

/** Boundary pair for TC-005: exactly max, and one character over. */
export const NAME_LENGTH_BOUNDARY_CASES: readonly LengthBoundaryCase[] = [
  {
    id: 'at-max',
    label: `exactly ${PAYER_NAME_MAX_LENGTH} characters`,
    length: PAYER_NAME_MAX_LENGTH,
    expectAccepted: true,
  },
  {
    id: 'over-max',
    label: `${PAYER_NAME_MAX_LENGTH + 1} characters`,
    length: PAYER_NAME_MAX_LENGTH + 1,
    expectAccepted: false,
  },
] as const;

/** Builds a Payer Name of an exact character length. */
export function payerNameOfLength(length: number): string {
  return 'A'.repeat(length);
}

/** Invalid values reused from the creation-time validation rules (TC-004). */
export const INVALID_EDIT_VALUES = {
  email: 'not-an-email',
} as const;

/**
 * The editable-field checklist for TC-008. Each entry is one iteration: the
 * field is edited on its own and the saved draft is verified, with the wizard
 * step recorded so the Page Object knows how far to advance.
 */
export interface EditableFieldCase {
  id: string;
  label: string;
  step: 'Basic Information' | 'Contact Information';
  kind: 'text' | 'dropdown';
  value: () => string;
}

export const EDITABLE_FIELD_CHECKLIST: readonly EditableFieldCase[] = [
  {
    id: 'payer-name',
    label: 'Payer Name',
    step: 'Basic Information',
    kind: 'text',
    value: () => `Edited Payer ${RandomDataUtils.uniqueSuffix()}`,
  },
  {
    id: 'payer-type',
    label: 'Payer Type',
    step: 'Basic Information',
    kind: 'dropdown',
    value: () => 'Government',
  },
  {
    id: 'email',
    label: 'Email Address',
    step: 'Contact Information',
    kind: 'text',
    value: () => RandomDataUtils.uniqueEmail(),
  },
  {
    id: 'phone',
    label: 'Phone Number',
    step: 'Contact Information',
    kind: 'text',
    value: () => '512345679',
  },
  {
    id: 'license',
    label: 'License Number',
    step: 'Contact Information',
    kind: 'text',
    value: () => RandomDataUtils.uniqueLicenseNumber(),
  },
  {
    id: 'city',
    label: 'City',
    step: 'Contact Information',
    kind: 'dropdown',
    value: () => 'Jeddah',
  },
  {
    id: 'language',
    label: 'Preferred Language',
    step: 'Contact Information',
    kind: 'dropdown',
    value: () => 'Arabic',
  },
  {
    id: 'contact-method',
    label: 'Preferred Contact Method',
    step: 'Contact Information',
    kind: 'dropdown',
    value: () => 'SMS',
  },
] as const;

/** Suffix applied when a test edits a payer's name (TC-010 onward). */
export function editedName(originalName: string): string {
  return `${originalName} Updated`;
}

/**
 * A payer's row in the list keeps showing the LIVE (published) values while an
 * edit sits in the private draft, so tests that walk the approval chain edit a
 * non-identifying field. This keeps every search and approval-queue lookup
 * anchored to a stable payer name while still proving the edit was applied.
 */
export const CHAIN_EDIT_FIELD = {
  label: 'License Number',
  kind: 'text' as const,
};

export function editedLicenseNumber(): string {
  return RandomDataUtils.uniqueLicenseNumber();
}
