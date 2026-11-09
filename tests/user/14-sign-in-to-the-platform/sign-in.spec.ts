import { test, expect } from '../../../fixtures';
import type { SignedOutWindow } from '../../../fixtures/userModule.fixture';
import type { SignInOutcome } from '../../../pages/user/SignInPage';
import { AppRoutes } from '../../../constants/AppRoutes';
import { Timeouts } from '../../../constants/Timeouts';
import {
  BLOCKED_CASES,
  CASES,
  DEACTIVATED,
  FAILED_EVENT,
  HOSTILE_INPUTS,
  INVALID_LOGIN,
  LOCKED,
  LOCKOUT_THRESHOLD,
  NOT_ACTIVATED,
  PASSWORD_MAX,
  REQUIRED_AR,
  REQUIRED_EN,
  SIGN_IN_EVENT,
  SYSTEM_ERROR,
  USERNAME_MAX,
} from '../../../data/user/signInToThePlatform.data';
import { deactivateUser, generatePassword } from '../../../utils/UserProvisioning';
import {
  auditEntriesFor,
  auditText,
  isSignInUrl,
  openModuleWithoutSession,
  signInFieldError,
  submitSignIn,
  suiteAddressOfLength,
  throwawayBoxText,
  typeUsernameSlowly,
  usernameLength,
  waitForResetScreen,
  wipeSignInPassword,
} from '../../../utils/user/writerEHelpers';

/** "Navigate to the User Management module" in a window with no session: the screen it lands on ('login' = the sign-in page at /login). */
async function moduleScreen(w: SignedOutWindow): Promise<string> {
  const landed = await openModuleWithoutSession(w.page);
  return landed === 'login' && !isSignInUrl(w.page) ? `the sign-in form at ${w.page.url()}` : landed;
}

/** The refusal as shown (banner) plus the server's own reason - for the failure message. */
const shown = (o: SignInOutcome): string => `banner "${o.alert}" | server "${o.serverMessage}" | HTTP ${o.status} | path ${o.path}`;

/**
 * User story 20421: Sign In to the Platform. Every account signed in with (or
 * given a wrong password) is a suite user in its own signed-out window; the
 * administrator only provisions and reads. See the data file for the readings.
 */
test.describe('US 20421 - Sign In to the Platform', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.signInWithEmail.azureId}: should sign a user in with a valid email and password and land on the home or requested page`, async ({
    steps,
    userWithPassword,
    signedOut,
  }) => {
    const { user, password } = await userWithPassword();
    const w = await signedOut();

    await steps.critical('Navigate to the User Management module - the sign-in page loads', async () => {
      expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
    });

    await steps.critical('Enter the registered email address in Username - the field accepts the email', async () => {
      await w.signIn.typeUsername(user.email);
      expect(await w.signIn.readUsername()).toBe(user.email);
    });

    await steps.critical('Enter the correct password in Password - the password field shows masked characters', async () => {
      await w.signIn.typePassword(password);
      expect(await w.signIn.getPasswordType(), 'the password box type').toBe('password');
      expect(await w.signIn.passwordLength(), 'characters in the password box').toBe(password.length);
    });

    await steps.critical('Submit the sign-in form - the system validates the credentials successfully', async () => {
      const outcome = await submitSignIn(w.page, Timeouts.navigation);
      expect(outcome.status, shown(outcome)).toBe(200);
    });

    await steps.step('Review the resulting page - the user is redirected to the home page or the originally requested page', async () => {
      await expect(w.page).not.toHaveURL(/\/login(\?|$)/, { timeout: Timeouts.navigation });
      expect([AppRoutes.dashboard, AppRoutes.usersAdministration], `landed on ${w.page.url()}`).toContain(new URL(w.page.url()).pathname);
    });
  });

  test(`TC-${CASES.signInWithDocumentId.azureId}: should sign a user in with their Document ID as the username`, async ({
    steps,
    userWithPassword,
    signedOut,
  }) => {
    const { user, password } = await userWithPassword();
    const w = await signedOut();

    await steps.critical('Navigate to the User Management module - the sign-in page loads', async () => {
      expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
    });

    await steps.critical("Enter the account's Document ID in Username - the field accepts the value", async () => {
      await w.signIn.typeUsername(user.documentId);
      expect(await w.signIn.readUsername()).toBe(user.documentId);
    });

    await steps.critical('Enter the correct password - the password is masked', async () => {
      await w.signIn.typePassword(password);
      expect(await w.signIn.getPasswordType(), 'the password box type').toBe('password');
    });

    await steps.step('Submit the sign-in form - the credentials validate successfully', async () => {
      const outcome = await submitSignIn(w.page, Timeouts.navigation);
      expect(outcome.status, shown(outcome)).toBe(200);
      await expect(w.page).not.toHaveURL(/\/login(\?|$)/, { timeout: Timeouts.navigation });
    });
  });

  test(`TC-${CASES.usernameRequired.azureId}: should show the required-field message under Username when it is left blank`, async ({ steps, signedOut }) => {
    const w = await signedOut();

    await steps.critical('Navigate to the User Management module - the sign-in page loads', async () => {
      expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
    });

    await steps.critical('Leave Username blank and enter a password - Username remains empty', async () => {
      await w.signIn.typePassword(throwawayBoxText(12));
      expect(await w.signIn.readUsername()).toBe('');
      expect(await w.signIn.passwordLength()).toBe(12);
    });

    await steps.step('Submit the sign-in form - "This field is required." is shown under Username', async () => {
      const outcome = await submitSignIn(w.page);
      expect(await signInFieldError(w.page, 'email'), `the Username error (${shown(outcome)})`).toBe(REQUIRED_EN);
      expect(outcome.status, 'no sign-in may succeed with a blank username').not.toBe(200);
    });
  });

  test(`TC-${CASES.passwordRequired.azureId}: should show the required-field message under Password when it is left blank`, async ({ steps, userIn, signedOut }) => {
    const user = await userIn('Active');
    const w = await signedOut();

    await steps.critical('Navigate to the User Management module - the sign-in page loads', async () => {
      expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
    });

    await steps.critical('Enter a valid username and leave Password blank - Password remains empty', async () => {
      await w.signIn.typeUsername(user.email);
      expect(await w.signIn.readUsername()).toBe(user.email);
      expect(await w.signIn.passwordLength()).toBe(0);
    });

    await steps.step('Submit the sign-in form - "This field is required." is shown under Password', async () => {
      const outcome = await submitSignIn(w.page);
      expect(await signInFieldError(w.page, 'password'), `the Password error (${shown(outcome)})`).toBe(REQUIRED_EN);
      expect(outcome.status, 'no sign-in may succeed with a blank password').not.toBe(200);
    });
  });

  test(`TC-${CASES.requiredInArabic.azureId}: should show the required-field message in Arabic when the page language is Arabic`, async ({ steps, signedOut }) => {
    const w = await signedOut();
    const before = { title: '', lang: '' };

    await steps.critical('Navigate to the User Management module - the sign-in page loads', async () => {
      expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
      before.title = await w.signIn.getTitle();
      before.lang = await w.page.evaluate(() => `${document.documentElement.lang}|${document.documentElement.dir}`);
    });

    await steps.critical('Switch the sign-in page language to Arabic - the page labels switch to Arabic', async () => {
      await w.signIn.toggleLanguage();
      // The case checks the page LABELS. The document's lang / dir attributes stay "en|ltr" while the
      // labels turn Arabic (full run screenshot) - recorded as an observation, not asserted.
      const lang = await w.page.evaluate(() => `${document.documentElement.lang}|${document.documentElement.dir}`);
      test.info().annotations.push({ type: 'observation', description: `20701: document lang|dir before ${before.lang}, after the switch ${lang}` });
      const title = await w.signIn.getTitle();
      expect(title, 'the title in Arabic').not.toBe(before.title);
      expect(title, 'the title in Arabic').toMatch(/[؀-ۿ]/);
    });

    await steps.step('Leave Username blank and submit the form - "هذا الحقل مطلوب." is shown under Username', async () => {
      expect(await w.signIn.readUsername()).toBe('');
      const outcome = await submitSignIn(w.page);
      expect(await signInFieldError(w.page, 'email'), `the Username error (${shown(outcome)})`).toBe(REQUIRED_AR);
    });
  });

  test(`TC-${CASES.showHidePassword.azureId}: should reveal and hide the typed password with the show-hide control`, async ({ steps, signedOut }) => {
    const w = await signedOut();
    const text = throwawayBoxText(10);

    try {
      await steps.critical('Navigate to the User Management module - the sign-in page loads', async () => {
        expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
      });

      await steps.critical('Enter a password into the Password field - characters are masked by default', async () => {
        await w.signIn.typePassword(text);
        expect(await w.signIn.passwordLength()).toBe(text.length);
        expect(await w.signIn.getPasswordType(), 'the password box type').toBe('password');
      });

      await steps.critical('Activate the show/hide control - the typed password becomes visible in plain text', async () => {
        await w.signIn.togglePasswordVisibility();
        expect(await w.signIn.getPasswordType(), 'the password box type after show').toBe('text');
      });

      await steps.step('Activate the control again - the password returns to masked display', async () => {
        await w.signIn.togglePasswordVisibility();
        expect(await w.signIn.getPasswordType(), 'the password box type after hide').toBe('password');
      });
    } finally {
      await wipeSignInPassword(w.page);
    }
  });

  test(`TC-${CASES.passwordMaxLength.azureId}: should stop password typing at the 50-character maximum`, async ({ steps, signedOut }) => {
    const w = await signedOut();

    try {
      await steps.critical('Navigate to the User Management module - the sign-in page loads', async () => {
        expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
      });

      await steps.critical(`Type a password value exactly ${PASSWORD_MAX} characters long - all ${PASSWORD_MAX} characters are accepted`, async () => {
        await w.signIn.typePasswordSlowly(throwawayBoxText(PASSWORD_MAX));
        expect(await w.signIn.passwordLength(), `characters kept (maxlength attribute ${String(await w.signIn.getMaxLength('password'))})`).toBe(PASSWORD_MAX);
      });

      await steps.step('Attempt to type an additional character - typing stops and no further characters are accepted', async () => {
        await w.signIn.typePasswordSlowly('x');
        expect(await w.signIn.passwordLength(), `characters kept after the ${PASSWORD_MAX + 1}st (maxlength attribute ${String(await w.signIn.getMaxLength('password'))})`).toBe(PASSWORD_MAX);
      });
    } finally {
      await wipeSignInPassword(w.page);
    }
  });

  test(`TC-${CASES.usernameMaxLength.azureId}: should cap the Username field at 50 characters`, async ({ steps, signedOut }) => {
    const w = await signedOut();

    await steps.critical('Navigate to the User Management module - the sign-in page loads', async () => {
      expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
    });

    await steps.critical(`Enter a username value exactly ${USERNAME_MAX} characters long - the full value is accepted in the field`, async () => {
      await typeUsernameSlowly(w.page, suiteAddressOfLength(USERNAME_MAX));
      expect(await usernameLength(w.page), `characters kept (maxlength attribute ${String(await w.signIn.getMaxLength('email'))})`).toBe(USERNAME_MAX);
    });

    await steps.step('Attempt to type one additional character - the 51st character is not accepted', async () => {
      await w.page.keyboard.press('End');
      await w.page.keyboard.type('q');
      expect(await usernameLength(w.page), `characters kept after the ${USERNAME_MAX + 1}st (maxlength attribute ${String(await w.signIn.getMaxLength('email'))})`).toBe(USERNAME_MAX);
    });
  });

  test(`TC-${CASES.forgotPasswordLink.azureId}: should open the Reset Password flow from the Forget Password link`, async ({ steps, signedOut }) => {
    const w = await signedOut();

    await steps.critical('Navigate to the User Management module - the sign-in page loads', async () => {
      expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
    });

    await steps.critical('Locate and click the Forget Password? link - the system navigates away from the sign-in form', async () => {
      await w.signIn.clickForgotPassword();
      expect(new URL(w.page.url()).pathname).toBe(AppRoutes.resetPassword);
    });

    await steps.step('Review the resulting page - the Reset Password flow is displayed', async () => {
      await waitForResetScreen(w.page);
      expect(await w.reset.getTitle()).toMatch(/Reset Password/i);
      expect((await w.reset.getStepLabels())[0], 'step 1 of the flow').toMatch(/Sending an Email/i);
      expect(await w.reset.isStep2(), 'the flow starts on its e-mail step').toBe(false);
    });
  });

  test(`TC-${CASES.unknownUsername.azureId}: should refuse an unknown username with the invalid-login message`, async ({ steps, signedOut }) => {
    const w = await signedOut();
    const unknown = suiteAddressOfLength(40);

    await steps.critical('Navigate to the User Management module - the sign-in page loads', async () => {
      expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
    });

    await steps.critical('Enter a username / document ID that does not exist in the system - the field accepts the text', async () => {
      await w.signIn.typeUsername(unknown);
      expect(await w.signIn.readUsername()).toBe(unknown);
    });

    await steps.step('Enter any password and submit - the account-known check fails with "Invalid login attempt. Invalid Username or Password"', async () => {
      await w.signIn.typePassword(generatePassword());
      const outcome = await submitSignIn(w.page, Timeouts.navigation);
      expect(outcome.status, shown(outcome)).not.toBe(200);
      expect(isSignInUrl(w.page), 'sign-in refused - still on the sign-in page').toBe(true);
      expect(outcome.alert, shown(outcome)).toContain(INVALID_LOGIN);
    });
  });

  test(`TC-${CASES.neverActivated.azureId}: should tell a never-activated user to contact their administrator`, async ({ steps, userIn, signedOut }) => {
    const user = await userIn('InactiveAtCreate');
    const w = await signedOut();

    await steps.critical('Navigate to the User Management module - the sign-in page loads', async () => {
      expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
    });

    await steps.critical("Enter the account's username and a password - the account-known check passes", async () => {
      await w.signIn.typeUsername(user.email);
      await w.signIn.typePassword(generatePassword());
      expect(await w.signIn.readUsername()).toBe(user.email);
      expect(user.isActive, 'the suite account was never activated').toBe(false);
    });

    await steps.step('Submit the sign-in form - the inactive-account check fails with "Your account is still not activated. Please contact your administrator."', async () => {
      const outcome = await submitSignIn(w.page, Timeouts.navigation);
      expect(outcome.status, shown(outcome)).not.toBe(200);
      expect(outcome.alert, shown(outcome)).toContain(NOT_ACTIVATED);
    });
  });

  test(`TC-${CASES.deactivated.azureId}: should tell a user deactivated by an administrator that the account is deactivated`, async ({
    page,
    steps,
    userWithPassword,
    signedOut,
  }) => {
    const { user, password } = await userWithPassword();
    const off = await deactivateUser(page, user.id, 'other', 'Deactivated by the automation suite (sign-in case).');
    if (off.status >= 300) steps.blocked(`the suite user ${user.email} could not be deactivated: ${off.status} ${off.text.slice(0, 200)}`);
    const w = await signedOut();

    await steps.critical('Navigate to the User Management module - the sign-in page loads', async () => {
      expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
    });

    await steps.critical("Enter the deactivated account's username and password - the account-known and active-status checks run in order", async () => {
      await w.signIn.typeUsername(user.email);
      await w.signIn.typePassword(password);
      expect(await w.signIn.readUsername()).toBe(user.email);
      expect(await w.signIn.passwordLength()).toBe(password.length);
    });

    await steps.step('Submit the sign-in form - "Your account is deactivated. Please contact your administrator." is shown and sign-in is refused', async () => {
      const outcome = await submitSignIn(w.page, Timeouts.navigation);
      expect(outcome.status, shown(outcome)).not.toBe(200);
      expect(outcome.alert, shown(outcome)).toContain(DEACTIVATED);
    });
  });

  test(`TC-${CASES.wrongPassword.azureId}: should refuse a wrong password for a valid account with the invalid-login message`, async ({ steps, userWithPassword, signedOut }) => {
    const { user } = await userWithPassword();
    const w = await signedOut();

    await steps.critical('Navigate to the User Management module - the sign-in page loads', async () => {
      expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
    });

    await steps.critical('Enter a valid username and an incorrect password - the known, active and confirmed checks pass', async () => {
      await w.signIn.typeUsername(user.email);
      await w.signIn.typePassword(generatePassword());
      expect(await w.signIn.readUsername()).toBe(user.email);
      expect(user.isActive, 'the suite account is active').toBe(true);
    });

    await steps.step('Submit the sign-in form - the password check fails with "Invalid login attempt. Invalid Username or Password"', async () => {
      const outcome = await submitSignIn(w.page, Timeouts.navigation);
      expect(outcome.status, shown(outcome)).not.toBe(200);
      expect(isSignInUrl(w.page), 'sign-in refused - still on the sign-in page').toBe(true);
      expect(outcome.alert, shown(outcome)).toContain(INVALID_LOGIN);
    });
  });

  test(`TC-${CASES.lockout.azureId}: should lock the account after the configured number of failed sign-in attempts`, async ({ steps, userWithPassword, signedOut }) => {
    const { user, password } = await userWithPassword();
    const w = await signedOut();

    await steps.critical('Navigate to the User Management module - the sign-in page loads', async () => {
      expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
    });

    await steps.step(`Enter the valid username with an incorrect password ${LOCKOUT_THRESHOLD - 1} times in a row - each attempt shows "Invalid login attempt. Invalid Username or Password" and the account remains usable`, async () => {
      const outcomes: SignInOutcome[] = [];
      for (let n = 1; n < LOCKOUT_THRESHOLD; n += 1) {
        await w.signIn.openSignedOut();
        outcomes.push(await w.signIn.attempt(user.email, generatePassword()));
      }
      expect(outcomes.every((o) => o.status !== 200), outcomes.map(shown).join(' || ')).toBe(true);
      expect(outcomes.every((o) => o.lockoutUntil === null), 'no lock before the threshold').toBe(true);
      for (const o of outcomes) expect(o.alert, shown(o)).toContain(INVALID_LOGIN);
    });

    await steps.step(`Enter the valid username with an incorrect password a ${LOCKOUT_THRESHOLD}th time - the account becomes locked`, async () => {
      await w.signIn.openSignedOut();
      const outcome = await w.signIn.attempt(user.email, generatePassword());
      expect(outcome.status, shown(outcome)).not.toBe(200);
      expect(outcome.alert, `${shown(outcome)} | lockoutUntil ${String(outcome.lockoutUntil)}`).toContain(LOCKED);
    });

    await steps.step('Immediately retry with the correct password within the lockout period - sign-in is refused', async () => {
      await w.signIn.openSignedOut();
      const outcome = await w.signIn.attempt(user.email, password);
      expect(outcome.status, `the correct password right after ${LOCKOUT_THRESHOLD} failures: ${shown(outcome)}`).not.toBe(200);
      expect(outcome.alert, shown(outcome)).toContain(LOCKED);
    });
  });

  test(`TC-${CASES.auditTrail.azureId}: should record every sign-in attempt, successful or failed, for audit`, async ({
    page,
    steps,
    userWithPassword,
    signedOut,
    auditLogsPage,
  }) => {
    const { user, password } = await userWithPassword();
    const w = await signedOut();
    const since = new Date().toISOString();

    await steps.critical('Navigate to the User Management module - the sign-in page loads', async () => {
      expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
    });

    await steps.critical('Perform one successful sign-in and one failed sign-in attempt - both attempts are processed by the system', async () => {
      const failed = await w.signIn.attempt(user.email, generatePassword());
      expect(failed.status, `the failed attempt: ${shown(failed)}`).not.toBe(200);
      await w.signIn.openSignedOut();
      const succeeded = await w.signIn.attempt(user.email, password);
      expect(succeeded.status, `the successful attempt: ${shown(succeeded)}`).toBe(200);
    });

    await steps.step('Review the audit log - both the successful and the failed attempt are recorded with their outcome', async () => {
      await auditLogsPage.open();
      let entries = await auditEntriesFor(page, user, since);
      await expect.poll(async () => {
        entries = await auditEntriesFor(page, user, since);
        return entries.filter((e) => SIGN_IN_EVENT.test(auditText(e))).length;
      }, { timeout: 45_000, message: 'sign-in entries about the suite user' }).toBeGreaterThanOrEqual(2);
      const signIns = entries.filter((e) => SIGN_IN_EVENT.test(auditText(e)));
      const kinds = entries.map((e) => `${e.actionType}/${e.entityType}`).join(', ') || 'none';
      expect(signIns.some((e) => !FAILED_EVENT.test(auditText(e))), `a successful sign-in entry (entries: ${kinds})`).toBe(true);
      expect(signIns.some((e) => FAILED_EVENT.test(auditText(e))), `a failed sign-in entry (entries: ${kinds})`).toBe(true);
    });
  });

  test(`TC-${CASES.specialCharacters.azureId}: should handle special characters and scripts in the sign-in fields safely`, async ({ steps, signedOut }) => {
    const w = await signedOut();
    const dialogs: string[] = [];
    w.page.on('dialog', (d) => {
      dialogs.push(d.message());
      void d.dismiss().catch(() => undefined);
    });
    const injected = async (): Promise<unknown> => w.page.evaluate(() => (window as unknown as { __pbmInjected?: unknown }).__pbmInjected);

    await steps.critical('Navigate to the User Management module - the sign-in page loads', async () => {
      expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
    });

    await steps.step('Enter special characters, SQL-like syntax or script tags into Username and Password - the fields accept or safely reject the input without executing it', async () => {
      for (const input of HOSTILE_INPUTS) {
        await w.signIn.typeUsername(input);
        await w.signIn.typePassword(input);
        expect(['', input], `the Username box after typing ${input}`).toContain(await w.signIn.readUsername());
        await wipeSignInPassword(w.page);
      }
      expect(dialogs, 'no script dialog may open').toEqual([]);
      expect(await injected(), 'no injected script may run').toBeUndefined();
    });

    await steps.step('Submit the sign-in form - the input is handled safely and the standard invalid-login message is shown', async () => {
      const seen: string[] = [];
      for (const input of HOSTILE_INPUTS) {
        await w.signIn.openSignedOut();
        const outcome = await w.signIn.attempt(input, input);
        seen.push(`${input} -> ${shown(outcome)}`);
        expect(outcome.status, shown(outcome)).not.toBe(200);
        expect(`${outcome.serverMessage} ${outcome.alert}`, `no system error for ${input}`).not.toMatch(SYSTEM_ERROR);
        expect(outcome.alert, `the message for ${input}: ${shown(outcome)}`).toContain(INVALID_LOGIN);
      }
      expect(dialogs, `no script dialog may open (${seen.join(' || ')})`).toEqual([]);
      expect(await injected(), 'no injected script may run').toBeUndefined();
    });
  });

  test(`TC-${CASES.deactivatedBeforePassword.azureId}: should show the deactivated message instead of the invalid-password message for a deactivated account`, async ({
    page,
    steps,
    userWithPassword,
    signedOut,
  }) => {
    const { user } = await userWithPassword();
    const off = await deactivateUser(page, user.id, 'other', 'Deactivated by the automation suite (sign-in order case).');
    if (off.status >= 300) steps.blocked(`the suite user ${user.email} could not be deactivated: ${off.status} ${off.text.slice(0, 200)}`);
    const w = await signedOut();

    await steps.critical('Navigate to the User Management module - the sign-in page loads', async () => {
      expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
    });

    await steps.critical("Enter the deactivated account's username together with an intentionally wrong password - the username is recognized as known", async () => {
      await w.signIn.typeUsername(user.email);
      await w.signIn.typePassword(generatePassword());
      expect(await w.signIn.readUsername()).toBe(user.email);
    });

    await steps.step('Submit the sign-in form - the deactivated-account check fails before the password is ever evaluated', async () => {
      const outcome = await submitSignIn(w.page, Timeouts.navigation);
      expect(outcome.status, shown(outcome)).not.toBe(200);
      expect(outcome.alert, `the invalid-password message must not be shown: ${shown(outcome)}`).not.toMatch(/Invalid login attempt|Sign-in failed/i);
      expect(outcome.alert, shown(outcome)).toContain(DEACTIVATED);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
