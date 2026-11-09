import type { MemberShape } from './memberPermissions.data';

/**
 * US 14383 "View Member" (member folder 08).
 *
 * How the view page works in this build (Member-Foundation-Notes.md, "View"):
 * `/member-management/{id}` - header card (name, code, Active switch, the
 * Nationality / Document ID / Mobile / Age strip "36 years, 5 months, 21 days"),
 * Edit / Delete in the breadcrumb bar, tabs Member Information, Non-National
 * Registry, Address, Emergency Contacts, PBM Accumulator Dashboard, Coverage
 * Ordering (COB). Every value carries an id; empty values read "—".
 *
 * Literal readings / decisions:
 * - The administrator plays the Member Administrator (the role's account does
 *   not exist - writers brief).
 * - 19876 / 19878 / 19879 / 19887 "the correct stored value": the value as the
 *   application presents it elsewhere - the Date of Birth as DD/MM/YYYY (the
 *   picker and the cards); a flag (Special Needs, VIP) as Yes / No. KNOWN
 *   FINDINGS (the case fails, writers brief): the view shows the RAW
 *   `YYYY-MM-DD` date and "Verified" / "Not verified" for the flags.
 * - 19876 "fully populated": the `Complete` state plus Special Needs.
 * - 19877 "matches the audit history": Modified On / By against the member's
 *   own UPDATE entry; Created On / By against its CREATE entry in Audit Logs
 *   (written under another entity id - found by the member's document ID).
 * - 19879 "address data": the `Complete` member plus City / District / Street
 *   saved through the Edit wizard (the provisioning body leaves the cascade empty).
 * - 19882 / 19883 / 19885 share ONE suite member (`Complete`) enrolled in one
 *   approved suite policy with deductible 0 (so "No cap on this policy" shows):
 *   view-member-policies.spec.ts. The accumulator AMOUNTS are 0 (no claim can be
 *   posted - writers brief) and are asserted as such. The member card's
 *   Benefit Year reads "—" with a policy (KNOWN FINDING).
 * - 19883: the COB rows show no Status (KNOWN FINDING); the dates are the
 *   policy's own, `DD/MM/YYYY HH:mm`.
 * - 19884 "attempt to modify any field": every tab is checked for an editable
 *   control and a save / submit button, and a value is clicked.
 * - 19886 "a user without permission to view member details": the Payer Admin
 *   shaped without GetMember (View member details) - `memberRole`.
 * - 19888: the date of birth is today exactly ONE year ago (the case's data);
 *   the Age reads 1 (whole years) and the header "1 year".
 * - 19889: E-Health ID blank, Hijri date blank (sent blank), Special Needs not
 *   set; "a blank or Not Provided placeholder" - "—" / blank / Not Provided (a
 *   flag that is not set may also read "No").
 */
export const CASES = {
  informationTab: { azureId: '19876' },
  recordInformation: { azureId: '19877', occupation: 'Auditor' },
  nonNational: { azureId: '19878' },
  address: { azureId: '19879' },
  emergencyContacts: { azureId: '19880' },
  noContacts: { azureId: '19881' },
  dashboard: { azureId: '19882' },
  coverageOrdering: { azureId: '19883' },
  readOnly: { azureId: '19884' },
  tabSwitching: { azureId: '19885' },
  noViewPermission: { azureId: '19886', shape: { without: ['view'] } as MemberShape },
  flags: { azureId: '19887' },
  birthday: { azureId: '19888', years: 1 },
  optionalBlank: { azureId: '19889' },
} as const;

/** A set flag (Special Needs / VIP) as it should read. */
export const FLAG_SET = /^(yes|true|active)$/i;

/** A flag that is not set. */
export const FLAG_UNSET = /^(no|false|inactive|not set|—|-)$/i;

/** An unpopulated optional value ("—", blank, "Not Provided"). */
export const PLACEHOLDER = /^(—|-|not provided|n\/a)?$/i;

/** An unpopulated optional FLAG: the placeholder, or "No". */
export const FLAG_PLACEHOLDER = /^(—|-|not provided|n\/a|no)?$/i;

/** The empty Emergency Contacts state. */
export const NO_CONTACTS = /no emergency contacts/i;

/** The Record Information date-time ("05/11/2026 02:03 AM"). */
export const RECORD_DATE_TIME = /^\d{2}\/\d{2}\/\d{4} \d{1,2}:\d{2} (AM|PM)$/;

/** The labels of the PBM Accumulator Dashboard tab the story names (AC of 14383). */
export const DASHBOARD_LABELS = [
  'Policy Number', 'Plan', 'Payer', 'PBM Member ID', 'Relationship', 'Policy Status', 'Effective Period',
  'Policy-Level Benefit', 'Policy Deductible', 'Policy Coinsurance', 'Policy Out-of-Pocket Maximum', 'Policy Sublimit',
  'Accumulators & Sublimits', 'Benefit year', 'Deductible met', 'Out-of-pocket met', 'Policy sublimit used',
  'No cap on this policy', 'Trade sub-caps in use',
] as const;

/** The shared enrolled member of view-member-policies.spec.ts: deductible 0 shows "No cap on this policy". */
export const SHARED_POLICY = { deductibleAmount: 0, coinsurancePercent: 20, outOfPocketMaximum: 500, sublimitAmount: 1000 } as const;

/** What an authorization refusal on the view says (or the screen bounces to the list / dashboard). */
export const ACCESS_DENIED = /not authori[sz]ed|access (is )?denied|forbidden|permission|unable to load member|access restricted/i;
