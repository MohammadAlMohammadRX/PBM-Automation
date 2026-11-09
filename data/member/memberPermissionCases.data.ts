import { MEMBER_RIGHT, type MemberRight, type MemberShape } from './memberPermissions.data';

/**
 * US 14389 "Member Permissions" (member folder 13). Named `memberPermissionCases`
 * because `memberPermissions.data.ts` is the SHARED role data (hands off).
 *
 * THE ROLE: the existing "Payer Admin" role shaped through the shared
 * `memberRole` fixture (utils/member/memberRole.ts), restored at teardown. On
 * 2026-11-05 it held ALL 15 Members.* rights and NO Cob.* / MemberAccumulators.*
 * - the COB cases GRANT first. Role edits were not seen to reach the signed-in
 * Payer Admin in Policy / Facility (2026-11-04): a case whose shape did not take
 * BLOCKS through `requireShapeApplied` with the `permission-not-propagated` /
 * `permission-not-granted` evidence - EXCEPT 19953, whose subject IS whether a
 * revocation reaches a signed-in user (it stays a finding, as Facility 17571).
 *
 * The case's roles -> catalogue rights (Member-Foundation-Notes.md, "Permissions"):
 *   View      GetMembers (the list - PARENT of every Members right) + GetMember (the record)
 *   Create    CreateMember
 *   Edit      UpdateMember + GetMemberForEdit (the screen offers Edit only with both)
 *   Delete    DeleteMember
 *   Activate / Deactivate   SetMemberActive (ONE right)
 *   Benefit lookup          GetBenefitByPatientId
 *   COB       Cob.GetMemberCobTimeline (parent of ReorderMemberCoverage ...)
 *
 * Literal readings / decisions:
 * - 19945 CreateOnly / EditOnly / DeleteOnly: no screen opens without the LIST
 *   right (the parent), and Edit / Delete are reached from the record (GetMember),
 *   so each role keeps the rights its screen needs to be REACHED (list; + record
 *   for Edit / Delete) and holds exactly ONE action right; every other Members
 *   right is withheld. The check is "the one action is offered, the other two
 *   are not".
 * - 19946 StatusOnly: list + record + SetMemberActive.
 * - 19949 COBOnly {COB: Yes, View: No}: Cob.GetMemberCobTimeline granted, the
 *   Members parent withheld (every Members right goes with it) - the member is
 *   one enrolled in a suite policy so the COB tab has data.
 * - 19951 "New role GranularTestRole": no role is created - the suite edits only
 *   the Payer Admin role it restores; the seven rights are found in ITS catalogue
 *   and a combination is saved and read back.
 * - 19953 "T. Nguyen / EditorRole": the Payer Admin signed in with every member
 *   right; the administrator then withholds Edit (UpdateMember + GetMemberForEdit).
 * - 19954 DeleteOnly {Delete: Yes, View: No}: the parent is cleared first and
 *   Delete ticked alone; when the catalogue keeps GetMembers held with any child
 *   (the parent trap) such a role cannot be built - BLOCKED with that evidence.
 * - 19950 benefit lookup: no member screen calls GetBenefitByPatientId; it is
 *   sent to the path named after the right (constants/member/writerDIds.ts) and
 *   counted only when the administrator's own call reaches it.
 */

/** Every right of the Members section (the parent `list` first). */
export const MEMBERS_SECTION: readonly MemberRight[] = [
  'list', 'view', 'dashboard', 'create', 'editOpen', 'edit', 'delete', 'setActive', 'export', 'import', 'importHistory', 'benefitLookup', 'checkDocumentId', 'checkEmail',
];

/** The list right plus `keep`; every other Members right withheld. */
export function onlyMemberRights(...keep: MemberRight[]): MemberShape {
  return { with: ['list', ...keep], without: MEMBERS_SECTION.filter((r) => r !== 'list' && !keep.includes(r)) };
}

export const CASES = {
  viewOnly: { azureId: '19943', shape: { with: ['list'], without: ['create', 'editOpen', 'edit', 'delete'] } satisfies MemberShape },
  noView: { azureId: '19944', shape: { without: ['list', 'cob', 'accumulator'] } satisfies MemberShape },
  singleAction: {
    azureId: '19945',
    createOnly: onlyMemberRights('create'),
    editOnly: onlyMemberRights('view', 'editOpen', 'edit'),
    deleteOnly: onlyMemberRights('view', 'delete'),
  },
  statusOnly: { azureId: '19946', shape: onlyMemberRights('view', 'setActive'), details: 'Deactivated by the status-only role (automation suite).', occupation: 'QA Status Only Edit' },
  crudNoCob: { azureId: '19948', shape: { with: ['list'], without: ['cob'] } satisfies MemberShape },
  cobOnly: { azureId: '19949', shape: { with: ['cob'], without: ['list'] } satisfies MemberShape },
  zero: { azureId: '19950', shape: { without: ['list', 'cob', 'accumulator'] } satisfies MemberShape, occupation: 'QA Zero Permission Edit' },
  configure: {
    azureId: '19951',
    /** The seven permissions the case lists, by their catalogue labels. */
    seven: {
      View: MEMBER_RIGHT.view,
      Create: MEMBER_RIGHT.create,
      Edit: MEMBER_RIGHT.edit,
      Delete: MEMBER_RIGHT.delete,
      'Activate/Deactivate': MEMBER_RIGHT.setActive,
      'Benefit Lookup': MEMBER_RIGHT.benefitLookup,
      'Coordination of Benefits': MEMBER_RIGHT.cob,
    },
    /** The combination saved and read back. */
    combination: { with: ['list', 'cob'], without: ['create', 'delete', 'benefitLookup'] } satisfies MemberShape,
    expected: { View: true, Create: false, Edit: true, Delete: false, 'Activate/Deactivate': true, 'Benefit Lookup': false, 'Coordination of Benefits': true },
  },
  revoke: { azureId: '19953', granted: { with: ['list'] } satisfies MemberShape, revoke: { without: ['edit', 'editOpen'] } satisfies MemberShape, occupation: 'QA Revoked Edit' },
  deleteOnlyNoView: { azureId: '19954', clear: { without: ['list'] } satisfies MemberShape, grant: { with: ['delete'] } satisfies MemberShape },
} as const;

/** An access-restricted message ("access denied", "not authorised", "no permission", "Access Restricted"). */
export const ACCESS_RESTRICTED = /access|denied|not authori[sz]ed|unauthori[sz]ed|permission|restricted|forbidden/i;
