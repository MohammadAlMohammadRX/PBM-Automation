import { test, expect } from '../../../utils/user/userRole';
import { CASES } from '../../../data/user/editPasswordPolicy.data';
import { readPasswordPolicy } from '../../../utils/UserProvisioning';
import { isPolicyEditUsable, openPolicyViewWithoutEdit } from '../../../utils/user/writerFHelpers';

/**
 * User story 20426: Edit Password Policy - a user WITHOUT the permission to
 * change settings. Baseline first: the administrator (who holds it) is offered
 * Edit. The restricted user is a SUITE user whose suite role holds
 * SystemSettings.GetSystemSettings (view) and not UpdatePasswordPolicy -
 * nothing shared is touched, and nothing is saved.
 */
test.describe('US 20426 - Edit Password Policy', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.noSettingsPermission.azureId}: should not offer a usable Edit on the Password Policy tab when the user lacks the settings permission`, async ({ page, steps, userRole, requireShapeApplied, passwordPolicyTab }) => {
    const policy = await readPasswordPolicy(page);

    await steps.critical('Baseline: the administrator, who holds the permission to change settings, is offered Edit on the Password Policy tab', async () => {
      await passwordPolicyTab.open();
      expect(await isPolicyEditUsable(page), 'Edit for the administrator').toEqual({ shown: true, enabled: true });
    });

    const s = await userRole.signIn({ with: [...CASES.noSettingsPermission.rights] });
    requireShapeApplied(s);

    await steps.critical('Navigate to the User Management module - the System Settings area loads', async () => {
      const { tabOffered } = await openPolicyViewWithoutEdit(s.page);
      expect(tabOffered, `the Password Policy tab for "${s.role.name}" (${s.rights.join(', ')})`).toBe(true);
    });

    await steps.step('Open the Password Policy tab - the current policy values display', async () => {
      const view = await s.policy.readView();
      expect({ min: view['Minimum length'], max: view['Maximum length'], remembered: view['Passwords remembered'] }, 'the values shown')
        .toEqual({ min: String(policy.requiredLength), max: String(policy.maximumLength), remembered: policy.passwordHistoryCount === 0 ? 'Reuse allowed' : String(policy.passwordHistoryCount) });
    });

    await steps.step('Look for the Edit button - the Edit button is not shown or is disabled for this user', async () => {
      const edit = await isPolicyEditUsable(s.page);
      expect(edit.enabled, `Edit for the restricted user (shown ${edit.shown})`).toBe(false);
    });
  });
});
