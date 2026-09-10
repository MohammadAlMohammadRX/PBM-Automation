/**
 * Types and enumerated option values for the Create New Payer feature.
 * Option values mirror exactly what the live "Add New Payer" wizard offers,
 * so tests never guess dropdown text.
 */

/** Payer Type options (Step 1). */
export const PAYER_TYPES = ['Government', 'Private'] as const;
export type PayerType = (typeof PAYER_TYPES)[number];

/**
 * The Payer Type options as the ARABIC interface renders them.
 *
 * Needed because the wizard localizes its dropdown OPTION TEXT, not just its
 * labels: selecting "Private" in the Arabic form waits out a full action
 * timeout on an option that does not exist there. The field ids are identical
 * in both languages, so this is the one part of driving the wizard that the
 * id-based locators cannot make language-independent.
 *
 * Read off the live Arabic wizard.
 */
export const PAYER_TYPE_AR: Record<PayerType, string> = {
  Government: 'حكومي',
  Private: 'خاص',
};

/** City options (Step 2). */
export const CITIES = ['Riyadh', 'Jeddah', 'Dammam'] as const;
export type City = (typeof CITIES)[number];

/** Preferred Language options (Step 2). */
export const LANGUAGES = ['English', 'Arabic'] as const;
export type Language = (typeof LANGUAGES)[number];

/**
 * Every wizard dropdown OPTION as the Arabic interface renders it.
 *
 * WHY THIS IS NEEDED AT ALL. The field ids are identical in both languages -
 * that is what makes almost every locator in this framework language-neutral -
 * but the option TEXT inside a dropdown is translated. So asking for "Riyadh"
 * or "Email" in the Arabic form waits out a full action timeout on an option
 * that does not exist there, and the failure looks like a broken form rather
 * than a wrong label. Every value below was read off the live Arabic wizard.
 *
 * `الرياضض` is not a typo on this side: the environment's city catalogue really
 * does contain both "Riyadh" and "Riyadhh". It is deliberately left out of
 * CITIES - no test should depend on a duplicate that may be cleaned up - but it
 * is why a city lookup has to match exactly rather than by prefix.
 */
export const COUNTRY_AR: Record<string, string> = {
  Jordan: 'الأردن',
  'Saudi Arabia': 'المملكة العربية السعودية',
  'United Arab Emirates': 'الإمارات العربية المتحدة',
};

/**
 * The countries the environment offers, in the order the dropdown lists them.
 *
 * Only three exist, and `Saudi Arabia` is PRE-SELECTED when the contact step
 * opens - which contradicts the creation-validation story's expectation that
 * Country carries no default. Recorded here because a test asserting "no
 * default" needs to know what the application actually does.
 */
export const COUNTRIES = ['Jordan', 'Saudi Arabia', 'United Arab Emirates'] as const;
export type Country = (typeof COUNTRIES)[number];
export const DEFAULT_COUNTRY: Country = 'Saudi Arabia';

/** Preferred Contact Method options (Step 2). */
export const CONTACT_METHODS = ['Email', 'SMS', 'Both'] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];

/** The remaining Arabic option maps - see COUNTRY_AR above for why. */
export const CITY_AR: Record<City, string> = {
  Riyadh: 'الرياض',
  Jeddah: 'جدة',
  Dammam: 'الدمام',
};

export const LANGUAGE_AR: Record<Language, string> = {
  English: 'الإنجليزية',
  Arabic: 'العربية',
};

export const CONTACT_METHOD_AR: Record<ContactMethod, string> = {
  Email: 'البريد الإلكتروني',
  SMS: 'رسالة نصية',
  Both: 'كلاهما',
};

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
