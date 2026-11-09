import { test, expect } from '../../../fixtures';
import { AppRoutes } from '../../../constants/AppRoutes';
import { CASES } from '../../../data/user/editPasswordPolicy.data';
import { ChangePasswordDrawer } from '../../../pages/user/ChangePasswordDrawer';
import { establishSuitePassword, readPasswordPolicy, type SuiteSecret } from '../../../utils/UserProvisioning';
import { expectedRuleKeys } from '../../../utils/user/writerFHelpers';

/**
 * User story 20426: Edit Password Policy - what a saved policy does to users
 * (the current password never reusable, the checklist following the policy at
 * once, a shorter existing password still signing in). The precondition
 * policy is set through `settingsRestore.changePolicy` (snapshot first),
 * restored explicitly at the end of each test and again (read back) at
 * teardown. Users are SUITE users; their passwords are SuiteSecrets.
 */
test.describe('US 20426 - Edit Password Policy', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.currentNeverReused.azureId}: should refuse the current password as the new one when password reuse is allowed`, async ({ steps, suiteSession, settingsRestore, passwordPolicyTab }) => {
    const s = await suiteSession({ signIn: false });
    const drawer = new ChangePasswordDrawer(s.page);
    const changed = await settingsRestore.changePolicy({ passwordHistoryCount: 0 });
    if (changed.status >= 300) steps.blocked(`the precondition "Passwords remembered = 0" could not be saved: ${changed.status} ${changed.text.slice(0, 200)}`);

    await steps.critical('Navigate to the User Management module - the Password Policy tab shows Passwords remembered as "Reuse allowed"', async () => {
      await passwordPolicyTab.open();
      await expect.poll(async () => (await passwordPolicyTab.readView())['Passwords remembered'], { message: 'Passwords remembered on the tab', timeout: 10_000 }).toBe('Reuse allowed');
    });

    await steps.critical('Sign in as a standard user and open Change Password - the drawer opens', async () => {
      await s.signInPage.open();
      await s.signInPage.signIn(s.user.email, s.password);
      await s.menu.openChangePassword();
      expect(await drawer.isOpen(), 'the Change Password drawer').toBe(true);
    });

    await steps.step('Enter the current password correctly in Current Password, then enter the same password again in New Password and Confirm Password - the fields accept the input', async () => {
      await drawer.fill('current', s.password);
      await drawer.fill('next', s.password);
      await drawer.fill('confirm', s.password);
      expect([await drawer.valueLength('current'), await drawer.valueLength('next'), await drawer.valueLength('confirm')], 'the three fields filled').toEqual([s.password.length, s.password.length, s.password.length]);
    });

    await steps.step(`Select Change Password - "${CASES.currentNeverReused.message}" is shown and the change is blocked`, async () => {
      const result = await drawer.attemptSubmit();
      expect([...result.errors, ...result.messages], `what the drawer showed (answer ${result.status})`).toContain(CASES.currentNeverReused.message);
      expect({ changed: result.status === 200, closed: result.closed }, 'the change').toEqual({ changed: false, closed: false });
    });
    await drawer.wipe();
    await settingsRestore.restorePolicyNow();
  });

  test(`TC-${CASES.appliesToNextChange.azureId}: should show exactly the newly saved rules in the Change Password checklist when the policy has just been updated`, async ({ page, steps, suiteSession, settingsRestore, passwordPolicyTab }) => {
    const d = CASES.appliesToNextChange;
    const s = await suiteSession({ signIn: false });
    const drawer = new ChangePasswordDrawer(s.page);
    const changed = await settingsRestore.changePolicy({ ...d.policy });
    if (changed.status >= 300) steps.blocked(`the precondition policy (symbol and digit off, 5 distinct characters) could not be saved: ${changed.status} ${changed.text.slice(0, 200)}`);
    const policy = await readPasswordPolicy(page);

    await steps.critical('Navigate to the User Management module - the Password Policy tab shows the newly saved rules', async () => {
      await passwordPolicyTab.open();
      await expect.poll(async () => {
        const view = await passwordPolicyTab.readView();
        return { symbol: view['Require a symbol'], digit: view['Require a digit'], distinct: view['Minimum distinct characters'] };
      }, { message: 'the rules on the tab', timeout: 10_000 }).toEqual({ symbol: 'No', digit: 'No', distinct: String(d.policy.requiredUniqueChars) });
    });

    await steps.critical('Sign in as a standard user and open Change Password - the drawer opens', async () => {
      await s.signInPage.open();
      await s.signInPage.signIn(s.user.email, s.password);
      await s.menu.openChangePassword();
      expect(await drawer.isOpen(), 'the Change Password drawer').toBe(true);
    });

    await steps.step('Begin typing a new password in New Password - the "Password requirements" checklist reflects exactly the newly saved policy rules', async () => {
      await drawer.typeSlowly('next', d.typed);
      const rules = await drawer.readRules();
      expect(Object.keys(rules).sort(), 'checklist lines').toEqual(expectedRuleKeys(policy).sort());
      expect(rules.uniqueChars ?? '', 'the distinct-characters line').toContain(String(d.policy.requiredUniqueChars));
      expect(rules.lengthRange ?? '', 'the length line').toContain(`${policy.requiredLength} and ${policy.maximumLength}`);
    });
    await drawer.wipe();
    await settingsRestore.restorePolicyNow();
  });

  test(`TC-${CASES.shorterPasswordStillWorks.azureId}: should sign a user in with an existing password shorter than a newly raised minimum length`, async ({ page, steps, userIn, signedOut, settingsRestore, passwordPolicyTab }) => {
    const d = CASES.shorterPasswordStillWorks;
    const user = await userIn('Active');
    let short: SuiteSecret | null = null;
    try {
      short = await establishSuitePassword(page, user.email, { ...(await readPasswordPolicy(page)), maximumLength: d.passwordLength });
    } catch (error) {
      steps.blocked(`a ${d.passwordLength}-character password for suite user ${user.email} (ForgotPassword code + ResetPassword): ${String(error instanceof Error ? error.message : error).slice(0, 200)}`);
    }
    const password = short as SuiteSecret;
    await settingsRestore.snapshotPolicy();
    const changed = await settingsRestore.changePolicy({ requiredLength: d.newMinimum });
    if (changed.status >= 300) steps.blocked(`the raised minimum length ${d.newMinimum} could not be saved: ${changed.status} ${changed.text.slice(0, 200)}`);
    const w = await signedOut();

    await steps.critical(`Navigate to the User Management module - the Password Policy tab shows the newly increased minimum length (${d.newMinimum})`, async () => {
      await passwordPolicyTab.open();
      await expect.poll(async () => (await passwordPolicyTab.readView())['Minimum length'], { message: 'Minimum length on the tab', timeout: 10_000 }).toBe(String(d.newMinimum));
    });

    await steps.step('Sign in using the existing shorter password - sign-in succeeds without being forced to change the password', async () => {
      expect(password.length, 'the existing password is shorter than the new minimum').toBeLessThan(d.newMinimum);
      await w.signIn.openSignedOut();
      const outcome = await w.signIn.attempt(user.email, password);
      expect({ status: outcome.status, onLogin: outcome.path.startsWith(AppRoutes.login) }, `sign-in (${outcome.serverMessage} ${outcome.alert})`).toEqual({ status: 200, onLogin: false });
    });

    await steps.step('Confirm no forced-change drawer appears due solely to the length change - the user has normal access', async () => {
      expect({ forcedDrawer: await new ChangePasswordDrawer(w.page).isOpen(), userMenu: await w.menu.isOffered() }, 'after signing in').toEqual({ forcedDrawer: false, userMenu: true });
    });
    await settingsRestore.restorePolicyNow();
  });
});
