import { test, expect } from '../../../fixtures';
import { blockWhenMissing, memberAccess, scopeDataFor, scopeGaps, type ScopeData } from '../../../utils/role/writerDHelpers';
import { PREDEFINED_ROLES } from '../../../data/role/common.data';
import { ACCUMULATOR_EDIT_RIGHT, CASES, COVERAGE_EDIT_RIGHT, FULL_MEMBER_ACCESS } from '../../../data/role/predefinedRoleModuleAccess.data';

const RIGHTS = { coverageEdit: COVERAGE_EDIT_RIGHT, accumulatorEdit: ACCUMULATOR_EDIT_RIGHT };

/**
 * User story 21286: Predefined Role Module Access - Member Mgmt (coverage order + benefit accumulator) for each
 * predefined role, one sign-in per role (maalmohammad through `roleHolder`, restored at teardown).
 */
test.describe('US 21286 - Predefined Role Module Access (Member Management)', () => {
  test(`TC-${CASES.memberAccessAllRoles.azureId}: should give Organization Administrator, Payer Administrator and Payer Officer full Member Management including coverage order and accumulator`, async ({ steps, roleAdmin, roleHolder, page }) => {
    let data!: ScopeData;
    const ids = { memberId: '', policyMemberId: '' };

    await steps.critical('Navigate to the Role Management module - the module home page is displayed', async () => {
      const answer = await roleAdmin.open();
      expect(answer.status).toBe(200);
      data = await scopeDataFor(page, ['members']);
      blockWhenMissing(steps, scopeGaps(data, ['members']), 'No member enrolled in a policy of an active payer');
      ids.memberId = data.inScope.members as string;
      ids.policyMemberId = data.policyMemberId;
      expect(ids.policyMemberId).not.toBe('');
    });

    await steps.step("Sign in as the Organization Administrator, open a member's record in Member Management, then view coverage order and benefit accumulator - both display full data for any payer and are editable", async () => {
      await roleHolder.become({ role: PREDEFINED_ROLES.organizationAdministrator.en });
      expect(await memberAccess(roleHolder.page, ids, RIGHTS)).toEqual(FULL_MEMBER_ACCESS);
    });

    await steps.step("Sign in as the Payer Administrator and open a Payer A member's coverage order and benefit accumulator - both display full data for Payer A and are editable", async () => {
      await roleHolder.become({ role: PREDEFINED_ROLES.payerAdministrator.en, payerIds: [data.payer.id] });
      expect(await memberAccess(roleHolder.page, ids, RIGHTS)).toEqual(FULL_MEMBER_ACCESS);
    });

    await steps.step("Sign in as the Payer Officer and open a Payer A member's coverage order and benefit accumulator - both display full data for Payer A and are editable", async () => {
      await roleHolder.become({ role: PREDEFINED_ROLES.payerOfficer.en, payerIds: [data.payer.id] });
      expect(await memberAccess(roleHolder.page, ids, RIGHTS)).toEqual(FULL_MEMBER_ACCESS);
    });
  });
});
