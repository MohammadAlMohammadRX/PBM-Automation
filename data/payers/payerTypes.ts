/**
 * Types and enumerated option values for the Create New Payer feature.
 * Option values mirror exactly what the live "Add New Payer" wizard offers,
 * so tests never guess dropdown text.
 */

/** Payer Type options (Step 1). */
export const PAYER_TYPES = ['Government', 'Private'] as const;
export type PayerType = (typeof PAYER_TYPES)[number];

/** City options (Step 2). */
export const CITIES = ['Riyadh', 'Jeddah', 'Dammam'] as const;
export type City = (typeof CITIES)[number];

/** Preferred Language options (Step 2). */
export const LANGUAGES = ['English', 'Arabic'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Preferred Contact Method options (Step 2). */
export const CONTACT_METHODS = ['Email', 'SMS', 'Both'] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];

/** Rejection reasons offered by the reviewer's "Reject this request" dialog. */
export const REJECTION_REASONS = [
  'Incomplete Information',
  'Incorrect Data',
  'Missing Supporting Document',
  'Policy Violation',
  'Change Not Required',
  'Duplicate Request',
  'Other',
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

/** A complete, valid payer record used to drive the create wizard. */
export interface PayerData {
  /** English payer name (Step 1). */
  nameEn: string;
  /** Arabic payer name (Step 1). */
  nameAr: string;
  type: PayerType;
  /** Contact email (Step 2). */
  email: string;
  /** Subscriber digits only - the +966 dial code is a separate control. */
  phone: string;
  licenseNumber: string;
  city: City;
  language: Language;
  contactMethod: ContactMethod;
  /** Effective date in DD/MM/YYYY (matches the datepicker input format). */
  effectiveDate: string;
  /** Expiry date in DD/MM/YYYY. */
  expiryDate: string;
}

/**
 * The mandatory fields enforced by the data model, keyed by the visible label
 * used to locate each control. Drives the data-driven "every mandatory field
 * is enforced" test (TC-017). `step` tells the test how far to advance the
 * wizard before the omission can be observed.
 */
export interface MandatoryFieldSpec {
  label: string;
  step: 'Basic Information' | 'Contact Information' | 'Effective Period';
}

export const MANDATORY_FIELDS: readonly MandatoryFieldSpec[] = [
  { label: 'Payer Name', step: 'Basic Information' },
  { label: 'Payer Type', step: 'Basic Information' },
  { label: 'Email Address', step: 'Contact Information' },
  { label: 'License Number', step: 'Contact Information' },
  { label: 'City', step: 'Contact Information' },
  { label: 'Preferred Language', step: 'Contact Information' },
  { label: 'Preferred Contact Method', step: 'Contact Information' },
  { label: 'Effective Date', step: 'Effective Period' },
  { label: 'Expiry Date', step: 'Effective Period' },
] as const;
