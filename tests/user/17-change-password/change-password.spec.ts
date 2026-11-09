import { test, expect } from '../../../fixtures';
import type { SuiteSession } from '../../../fixtures/userModule.fixture';
import { AppRoutes } from '../../../constants/AppRoutes';
import { CASES } from '../../../data/user/changePassword.data';
import type { PasswordRule } from '../../../constants/user/userIds';
import { ChangePasswordDrawer } from '../../../pages/user/ChangePasswordDrawer';
import {
  USER_RIGHTS,
  generatePassword,
  readPasswordPolicy,
  requestSignIn,
  resetCodeFromEmail,
  waitForEmail,
  type TriggerExecution,
} from '../../../utils/UserProvisioning';
import { isChangePasswordButtonShown } from '../../../utils/user/writerFHelpers';

/** "Navigate to the User Management module": the suite user's Users Administration list opens with the user menu. */
async function openModule(s: SuiteSession): Promise<boolean> {
  await s.users.openTable();
  expect(new URL(s.page.url()).pathname, 'the User Management module').toBe(AppRoutes.usersAdministration);
  expect(await s.menu.isOffered(), 'the user menu').toBe(true);
  return true;
}

/** The three boxes' input types (masked = "password"). */
async function boxTypes(drawer: ChangePasswordDrawer): Promise<Record<string, string>> {
  return { current: await drawer.getInputType('current'), next: await drawer.getInputType('next'), confirm: await drawer.getInputType('confirm') };
}

const MASKED = { current: 'password', next: 'password', confirm: 'password' };

/**
 * User story 20425: Change Password - the voluntary flow (success, from My
 * Profile, Cancel, any role) and the lost-password reset. Every case runs as a
 * SUITE user; passwords are SuiteSecrets (never logged or asserted on). The
 * validation cases live in change-password-validation.spec.ts, the forced
 * change in forced-password-change.spec.ts.
 */
test.describe('US 20425 - Change Password', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.changeOwnPassword.azureId}: should change the password, close the drawer silently and keep the user signed in when the change is valid`, async ({ page, steps, suiteSession }) => {
    const s = await suiteSession();
    const drawer = new ChangePasswordDrawer(s.page);
    const next = generatePassword(await readPasswordPolicy(page));

    await steps.critical('Navigate to the User Management module - the module loads and the user menu is visible', async () => {
      expect(await openModule(s), 'the User Management module').toBe(true);
    });

    await steps.critical('Open the user menu and select Change Password - the drawer opens showing Current Password, New Password and Confirm Password fields', async () => {
      await s.menu.openChangePassword();
      expect(await boxTypes(drawer), 'the three password fields').toEqual(MASKED);
    });

    await steps.step('Enter the correct current password in Current Password - the field accepts masked input', async () => {
      await drawer.fill('current', s.password);
      expect({ type: await drawer.getInputType('current'), filled: (await drawer.valueLength('current')) === s.password.length }, 'Current Password').toEqual({ type: 'password', filled: true });
    });

    await steps.step('Enter a new password meeting the policy in New Password - the live checklist shows all requirements met and a strength rating', async () => {
      await drawer.fill('next', next);
      const rules = Object.keys(await drawer.readRules()) as PasswordRule[];
      expect(rules.length, 'checklist lines shown').toBeGreaterThan(0);
      const unmet: string[] = [];
      for (const r of rules) if (!(await drawer.isRuleMet(r))) unmet.push(r);
      expect(unmet, 'requirements not met').toEqual([]);
      expect(await drawer.readStrength(), 'the strength rating').not.toBe('');
    });

    await steps.step('Re-enter the same new password in Confirm Password - the field accepts masked input matching New Password', async () => {
      await drawer.fill('confirm', next);
      expect({ type: await drawer.getInputType('confirm'), sameLength: (await drawer.valueLength('confirm')) === next.length }, 'Confirm Password').toEqual({ type: 'password', sameLength: true });
    });

    await steps.step('Select Change Password - the drawer closes, no confirmation message is shown, and the user remains signed in', async () => {
      const result = await drawer.attemptSubmit();
      expect({ status: result.status, closed: result.closed, messages: result.messages }, `the change (${result.text.slice(0, 200)})`).toEqual({ status: 200, closed: true, messages: [] });
      expect({ session: await s.menu.hasSession(), onLogin: new URL(s.page.url()).pathname.startsWith(AppRoutes.login) }, 'still signed in').toEqual({ session: true, onLogin: false });
      expect((await requestSignIn(page, s.user.email, next)).status, 'signing in with the NEW password').toBe(200);
    });
    await drawer.wipe();
  });

  test(`TC-${CASES.openFromProfile.azureId}: should open the Change Password drawer with Cancel when Change Password is selected on My Profile`, async ({ steps, suiteSession }) => {
    const s = await suiteSession();
    const drawer = new ChangePasswordDrawer(s.page);

    await steps.critical('Navigate to the User Management module - the module loads with the My Profile button visible', async () => {
      expect(await openModule(s), 'the User Management module').toBe(true);
    });

    await steps.critical('Open My Profile - the profile view displays with a Change Password button', async () => {
      await s.menu.openMyProfile();
      await s.myProfile.waitForLoaded();
      expect(await isChangePasswordButtonShown(s.page), 'the Change Password button').toBe(true);
    });

    await steps.step('Select Change Password - the drawer opens with Current Password, New Password and Confirm Password fields and Cancel available', async () => {
      await s.myProfile.openChangePassword();
      expect({ boxes: await boxTypes(drawer), cancel: await drawer.isCancelOffered() }, 'the drawer').toEqual({ boxes: MASKED, cancel: true });
      await drawer.cancel();
    });
  });

  test(`TC-${CASES.lostIssuedPassword.azureId}: should let a user who lost the issued password reset it and sign in without the forced block when the session has ended`, async ({ page, steps, userIn, signedOut }) => {
    const user = await userIn('Active');
    const w = await signedOut();
    const since = new Date().toISOString();
    const next = generatePassword(await readPasswordPolicy(page));
    let mail: TriggerExecution | null = null;

    await steps.critical('Navigate to the User Management module - the sign-in page displays', async () => {
      await w.signIn.openSignedOut();
      expect(new URL(w.page.url()).pathname, 'the sign-in page').toBe(AppRoutes.login);
    });

    await steps.critical('Select Forget Password? on the sign-in page - the reset request screen displays', async () => {
      await w.signIn.clickForgotPassword();
      expect({ path: new URL(w.page.url()).pathname, step2: await w.reset.isStep2() }, 'the reset request screen').toEqual({ path: AppRoutes.resetPassword, step2: false });
    });

    await steps.critical('Submit the registered email address - a reset email is sent', async () => {
      await w.reset.typeEmail(user.email);
      const sent = await w.reset.continue();
      expect(sent.status, `ForgotPassword (${sent.messages.join(' | ')})`).toBe(200);
      mail = await waitForEmail(page, user.email, 'forgetPassword', since);
      expect(mail.recipientAddress.toLowerCase(), 'the reset e-mail recipient').toBe(user.email.toLowerCase());
    });

    await steps.critical('Open the emailed reset link and set a new password meeting policy - the password is reset successfully', async () => {
      const code = resetCodeFromEmail((mail as TriggerExecution | null)?.body ?? '');
      expect(code, 'the reset link in the e-mail').not.toBeNull();
      if (!code) return;
      await w.reset.openWithCode(user.email, code);
      expect(await w.reset.isStep2(), 'the Reset your Password step').toBe(true);
      await w.reset.fillPasswords(next);
      const saved = await w.reset.save();
      expect(saved.status, `ResetPassword (${saved.messages.join(' | ')} ${saved.errors.join(' | ')})`).toBe(200);
    });

    await steps.step('Sign in with the new password - sign-in succeeds and the forced-change block no longer appears', async () => {
      await w.signIn.openSignedOut();
      const outcome = await w.signIn.attempt(user.email, next);
      expect({ status: outcome.status, onLogin: outcome.path.startsWith(AppRoutes.login) }, `sign-in (${outcome.serverMessage} ${outcome.alert})`).toEqual({ status: 200, onLogin: false });
      expect(await new ChangePasswordDrawer(w.page).isOpen(), 'a forced "Set a New Password" drawer').toBe(false);
    });
  });

  test(`TC-${CASES.cancel.azureId}: should close the drawer, clear the fields and keep the password when a filled voluntary change is cancelled`, async ({ page, steps, suiteSession }) => {
    const s = await suiteSession();
    const drawer = new ChangePasswordDrawer(s.page);
    const next = generatePassword(await readPasswordPolicy(page));
    const lengths = async (): Promise<Record<string, number>> => ({
      current: await drawer.valueLength('current'),
      next: await drawer.valueLength('next'),
      confirm: await drawer.valueLength('confirm'),
    });

    await steps.critical('Navigate to the User Management module - the user menu is accessible', async () => {
      expect(await openModule(s), 'the User Management module').toBe(true);
    });

    await steps.critical('Open Change Password - the drawer opens', async () => {
      await s.menu.openChangePassword();
      expect(await drawer.isOpen(), 'the drawer').toBe(true);
    });

    await steps.critical('Enter values into Current Password, New Password and Confirm Password - the fields show the entered values', async () => {
      await drawer.fill('current', s.password);
      await drawer.fill('next', next);
      await drawer.fill('confirm', next);
      expect(Object.values(await lengths()).every((n) => n > 0), 'all three fields filled').toBe(true);
    });

    await steps.step('Select Cancel - the drawer closes and all fields are cleared, with the password unchanged', async () => {
      await drawer.cancel();
      expect(await drawer.isOpen(), 'the drawer after Cancel').toBe(false);
      await s.menu.openChangePassword();
      expect(await lengths(), 'the fields when Change Password is reopened').toEqual({ current: 0, next: 0, confirm: 0 });
      await drawer.cancel();
      expect((await requestSignIn(page, s.user.email, s.password)).status, 'signing in with the UNCHANGED password').toBe(200);
    });
    await drawer.wipe();
  });

  test(`TC-${CASES.anyRole.azureId}: should offer Change Password with Cancel to a standard and an administrative user when each opens the user menu`, async ({ steps, suiteSession }) => {
    const standard = await suiteSession();
    const reachable = async (s: SuiteSession): Promise<{ listed: boolean; opened: boolean; cancel: boolean }> => {
      const listed = (await s.menu.readItems()).includes('Change Password');
      const drawer = await s.menu.openChangePassword();
      const out = { listed, opened: await drawer.isOpen(), cancel: await drawer.isCancelOffered() };
      await drawer.cancel();
      return out;
    };

    await steps.critical('Navigate to the User Management module - the module loads', async () => {
      expect(await openModule(standard), 'the User Management module').toBe(true);
    });

    await steps.step('Sign in as a user with a standard role and open the user menu - the Change Password option is visible and selectable', async () => {
      expect(await reachable(standard), `Change Password for the standard role "${standard.role.name}"`).toEqual({ listed: true, opened: true, cancel: true });
    });

    await steps.step('Repeat sign-in with a user holding an administrative role and open the user menu - the Change Password option is likewise visible and selectable', async () => {
      const admin = await suiteSession({ rights: USER_RIGHTS });
      await admin.users.openTable();
      expect(await reachable(admin), `Change Password for the administrative role "${admin.role.name}" (every Users / Invitations / Settings right)`).toEqual({ listed: true, opened: true, cancel: true });
    });
  });
});
