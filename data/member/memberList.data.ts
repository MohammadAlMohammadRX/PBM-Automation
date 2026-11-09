import type { MemberShape } from './memberPermissions.data';

/**
 * US 14377 "Member List" (member folder 02), 8 cases.
 *
 * How the cases map onto the live list (2026-11-05, Member-Foundation-Notes.md):
 *  - Table headers: Name, Member ID, Document ID, Nationality, Mobile Number,
 *    Status, Actions - NO Identity Type and NO Member Status column (AC). 19786 /
 *    19794 require them - the finding. "Member Name" is the Name column.
 *  - 19786 "table view by default": the view choice is REMEMBERED PER USER - the
 *    case is asserted literally on a fresh open (decision, writers brief); it
 *    fails when the administrator's last choice was Cards.
 *  - Cards show the name and the member code in the header, Document ID, Date of
 *    Birth, Identity Type, Nationality, Email, Mobile in the body, View / Edit /
 *    Delete in the footer and an Active SWITCH for Activate / Inactivate; no
 *    status text (19788 requires it). Member Status is the Alive / Deceased tag.
 *  - 19789's test data "+971500000000" is typed into the Mobile Number box as
 *    given (the box has a fixed "+966" prefix and no format check) - the case is
 *    about the edit reaching the list.
 *  - 19791 "read-only role" = the Payer Admin shaped WITHOUT UpdateMember,
 *    GetMemberForEdit, SetMemberActive and DeleteMember (shared memberRole);
 *    the administrator's row is the baseline (Edit / Inactivate / Delete
 *    offered). When the role edit does not reach the account the case is
 *    BLOCKED with the evidence (requireShapeApplied).
 *  - 19792 payer scope: Payer A = the suite payer "Al sharq" chosen in the
 *    breadcrumb payer select, its member enrolled in a NEW suite policy, next to
 *    a suite member enrolled nowhere (Payer B's side) - members belong to payers
 *    only through enrolments.
 *  - 19794's five varied records are the case's own suite members (Saudi
 *    National ID, Jordanian Iqama, Jordanian Passport, Emirati GCC ID, Emirati
 *    Iqama).
 */
export const CASES = {
  tableDefault: { azureId: '19786' },
  cardsToTable: { azureId: '19787' },
  cardFields: { azureId: '19788' },
  editMobile: { azureId: '19789', mobileNumber: '+971500000000' },
  viewRecord: { azureId: '19790' },
  readOnly: { azureId: '19791', shape: { without: ['edit', 'editOpen', 'setActive', 'delete'] } satisfies MemberShape },
  payerList: { azureId: '19792' },
  formats: { azureId: '19794' },
} as const;

/** The columns the cases require, case wording -> header pattern. */
export const REQUIRED_COLUMNS: ReadonlyArray<[string, RegExp]> = [
  ['Member Name', /^(member )?name$/i],
  ['Member ID', /^member (id|code)$/i],
  ['Document ID', /^document id$/i],
  ['Nationality', /^nationality$/i],
  ['Identity Type', /^identity type$/i],
  ['Mobile Number', /^mobile( number)?$/i],
  ['Status', /^status$/i],
  ['Member Status', /^member status$/i],
  ['Actions', /^actions?$/i],
];

/** 19794's varied records: nationality lookup code + identity type. */
export const VARIED_MEMBERS = [
  { nationality: 'saudi', identityType: 'nationalId' },
  { nationality: 'jordanian', identityType: 'iqama' },
  { nationality: 'jordanian', identityType: 'passport' },
  { nationality: 'emirati', identityType: 'gccId' },
  { nationality: 'emirati', identityType: 'iqama' },
] as const;
