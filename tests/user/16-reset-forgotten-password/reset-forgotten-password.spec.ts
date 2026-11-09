import { test, expect } from '../../../fixtures';
import type { SignedOutWindow } from '../../../fixtures/userModule.fixture';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import { ChangePasswordDrawer } from '../../../pages/user/ChangePasswordDrawer';
import { AppRoutes } from '../../../constants/AppRoutes';
import { Timeouts } from '../../../constants/Timeouts';
import { SIGN_IN } from '../../../constants/user/userIds';
import {
  CASES,
  EMAIL_MAX,
  INVALID_EMAIL,
  INVALID_TOKEN,
  LINK_SENT,
  MALFORMED_EMAIL,
  NO_EMAIL_WATCH_MS,
  PARTIAL_INPUT,
  PARTIAL_MEETS,
  PARTIAL_MISSES,
  PASSWORD_RESET,
  PASSWORD_REUSED,
  PASSWORDS_DIFFER,
  REQUIRED,
  RESET_LINK_WAIT_BLOCKED,
  RESET_LINK_WAIT_MINUTES,
  WEAK_PASSWORD,
} from '../../../data/user/resetForgottenPassword.data';
import { emailLinks, generatePassword, requestSignIn, suiteResetCode, waitForEmail, type SuiteSecret } from '../../../utils/UserProvisioning';
import {
  allowWait,
  captureForgotAnswers,
  doubleClickContinue,
  forgotEmailsSince,
  isSignInUrl,
  openModuleWithoutSession,
  resetChecklistState,
  suiteAddressOfLength,
  typeResetEmailSlowly,
  waitForResetScreen,
} from '../../../utils/user/writerEHelpers';

type Continued = Awaited<ReturnType<SignedOutWindow['reset']['continue']>>;
type Saved = Awaited<ReturnType<SignedOutWindow['reset']['save']>>;

/** "Navigate to the User Management module" in a window with no session: the screen it lands on ('login' = the sign-in page, with its Forget Password? link). */
async function moduleScreen(w: SignedOutWindow): Promise<string> {
  const landed = await openModuleWithoutSession(w.page);
  return landed === 'login' && !isSignInUrl(w.page) ? `the sign-in form at ${w.page.url()}` : landed;
}

/** Step 1 of the reset flow, reached from the sign-in page (raw navigation - no admin auto sign-in). */
async function openRequestStep(w: SignedOutWindow): Promise<void> {
  if (new URL(w.page.url()).pathname !== AppRoutes.resetPassword) {
    if (!isSignInUrl(w.page)) await openModuleWithoutSession(w.page);
    await w.signIn.clickForgotPassword();
  }
  await waitForResetScreen(w.page);
}

/** Requests a reset link for `email` on step 1. */
async function requestResetFor(w: SignedOutWindow, email: string): Promise<Continued> {
  await openRequestStep(w);
  await w.reset.typeEmail(email);
  return w.reset.continue();
}

/** The suite user's reset code (what the e-mailed link carries) - BLOCKED when the platform gives none. */
async function resetCodeOrBlock(steps: TestSteps, w: SignedOutWindow, email: string): Promise<SuiteSecret> {
  try {
    return await suiteResetCode(w.page, email);
  } catch (error) {
    return steps.blocked(`a reset code for the suite user ${email} (ForgotPassword): ${String(error instanceof Error ? error.message : error).slice(0, 200)}`);
  }
}

/** Everything a save showed (toasts, field errors, banner). */
const saidBy = (s: Saved): string => [...s.messages, ...s.errors].join(' | ');

/** Whether `password` still signs the suite user in (API, the case's own window) - "the password is not saved". */
async function stillSignsIn(w: SignedOutWindow, email: string, password: SuiteSecret): Promise<number> {
  return (await requestSignIn(w.page, email, password)).status;
}

/**
 * User story 20424: Reset Forgotten Password. Every reset is of a suite user,
 * driven in a window without a session; step 2 opens with the suite user's own
 * reset code (the code the e-mailed link carries). See the data file.
 */
test.describe('US 20424 - Reset Forgotten Password', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.requestLink.azureId}: should send a reset link for a registered confirmed email and return to sign-in`, async ({ steps, userIn, signedOut }) => {
    const user = await userIn('Active');
    const w = await signedOut();
    let sent!: Continued;

    await steps.critical('Navigate to the User Management module - the module is accessible', async () => {
      expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
    });

    await steps.critical('Open the password reset request page, enter a registered confirmed email address and select Continue - "Password reset link was sent. Please check your email." is shown', async () => {
      sent = await requestResetFor(w, user.email);
      expect(sent.status, 'ForgotPassword answered').toBe(200);
      expect(sent.messages, 'the confirmation shown').toContain(LINK_SENT);
    });

    await steps.step('Observe the page after the message - the user is returned to the sign-in page', async () => {
      expect(sent.path, 'the page after Continue').toBe(AppRoutes.login);
      await expect(w.page.locator(`#${SIGN_IN.email}`), 'the sign-in form').toBeVisible();
    });
  });

  test(`TC-${CASES.invalidEmailFormat.azureId}: should reject an incorrectly formatted email before sending a reset request`, async ({ steps, signedOut }) => {
    const w = await signedOut();

    await steps.critical('Navigate to the User Management module - the module is accessible', async () => {
      expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
    });

    await steps.step(`Enter an invalid email format, e.g. "${MALFORMED_EMAIL}", and select Continue - "Enter a valid email address." is shown and no request is sent`, async () => {
      const sent = await requestResetFor(w, MALFORMED_EMAIL);
      expect(await w.reset.getEmailError(), 'the e-mail error').toBe(INVALID_EMAIL);
      expect(sent.status, 'ForgotPassword must not be called (-1 = no request)').toBe(-1);
    });
  });

  test(`TC-${CASES.emailMaxLength.azureId}: should accept a 50-character email and reject a 51-character one`, async ({ steps, signedOut }) => {
    const w = await signedOut();

    await steps.critical('Navigate to the User Management module - the module is accessible', async () => {
      expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
    });

    await steps.step(`Enter a validly formatted email address of exactly ${EMAIL_MAX} characters and select Continue - the request is accepted`, async () => {
      await openRequestStep(w);
      const address = suiteAddressOfLength(EMAIL_MAX);
      await typeResetEmailSlowly(w.page, address);
      expect((await w.reset.readEmail()).length, 'characters kept').toBe(EMAIL_MAX);
      const sent = await w.reset.continue();
      expect(sent.status, 'ForgotPassword answered').toBe(200);
      expect(sent.messages, 'the confirmation shown').toContain(LINK_SENT);
    });

    await steps.step(`Enter a validly formatted email address of ${EMAIL_MAX + 1} characters and select Continue - a max-length validation error is shown and the request is not sent`, async () => {
      await openRequestStep(w);
      await typeResetEmailSlowly(w.page, suiteAddressOfLength(EMAIL_MAX + 1));
      const kept = (await w.reset.readEmail()).length;
      const sent = await w.reset.continue();
      expect(sent.status, `ForgotPassword must not be called (-1 = no request); the box kept ${kept} characters, maxlength ${String(await w.reset.getEmailMaxLength().catch(() => null))}`).toBe(-1);
      expect(await w.reset.getEmailError(), 'the max-length error').toMatch(new RegExp(`${EMAIL_MAX}|max`, 'i'));
    });
  });

  test(`TC-${CASES.sameMessage.azureId}: should show the same confirmation whether or not the email belongs to an account`, async ({ steps, userIn, signedOut }) => {
    const user = await userIn('Active');
    const w = await signedOut();
    const unknown = suiteAddressOfLength(42);
    let registered!: Continued;
    let unregistered!: Continued;

    await steps.critical('Navigate to the User Management module - the module is accessible', async () => {
      expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
    });

    await steps.critical('Submit a reset request for the registered confirmed email with a password - "Password reset link was sent. Please check your email." is shown', async () => {
      registered = await requestResetFor(w, user.email);
      expect(registered.messages, 'the confirmation shown').toContain(LINK_SENT);
    });

    await steps.step('Submit a reset request for an email address with no matching account - the identical message is shown', async () => {
      unregistered = await requestResetFor(w, unknown);
      expect(unregistered.messages, 'the confirmation shown').toContain(LINK_SENT);
      expect(unregistered.messages, 'identical to the registered address').toEqual(registered.messages);
      expect(unregistered.path, 'the same page afterwards').toBe(registered.path);
    });

    await steps.step('Compare the two answers - nothing tells the registered address from the unknown one (no account enumeration)', async () => {
      expect(unregistered.status, 'the same HTTP status').toBe(registered.status);
      expect(unregistered.codePresent, `ForgotPassword's answer carries a reset code for the registered address (${String(registered.codePresent)}) but not for the unknown one`).toBe(registered.codePresent);
    });
  });

  test(`TC-${CASES.linkOnlyWhenEligible.azureId}: should send a real reset link only to a confirmed account that has a password`, async ({ page, steps, userIn, signedOut }) => {
    const confirmed = await userIn('Active');
    const unconfirmed = await userIn('InactiveAtCreate');
    const passwordless = await userIn('InactiveAtCreate');
    const w = await signedOut();

    await steps.critical('Navigate to the User Management module - the module is accessible', async () => {
      expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
    });

    await steps.step('Request a reset for an account with confirmed email and existing password - a reset email is delivered', async () => {
      const since = new Date().toISOString();
      const sent = await requestResetFor(w, confirmed.email);
      expect(sent.messages, 'the confirmation shown').toContain(LINK_SENT);
      const email = await waitForEmail(page, confirmed.email, 'forgetPassword', since, 60_000);
      expect(email.subject ?? '', 'the reset e-mail subject').toMatch(/reset/i);
      expect(emailLinks(email.body ?? '').some((l) => l.path.endsWith(AppRoutes.resetPassword) && l.params.includes('code')), 'the e-mail carries a reset link').toBe(true);
    });

    await steps.step('Request a reset for an account with an unconfirmed email - the confirmation message is shown but no reset email is delivered', async () => {
      expect(unconfirmed.record.emailConfirmed, 'the account e-mail is unconfirmed').toBe(false);
      const since = new Date().toISOString();
      const sent = await requestResetFor(w, unconfirmed.email);
      expect(sent.messages, 'the confirmation shown').toContain(LINK_SENT);
      await w.page.waitForTimeout(NO_EMAIL_WATCH_MS);
      expect((await forgotEmailsSince(page, unconfirmed.email, since)).length, 'reset e-mails logged for the unconfirmed account').toBe(0);
    });

    await steps.step('Request a reset for an account with no password set - the confirmation message is shown but no reset email is delivered', async () => {
      expect(passwordless.isActive, 'the account was never activated (no password issued)').toBe(false);
      const since = new Date().toISOString();
      const sent = await requestResetFor(w, passwordless.email);
      expect(sent.messages, 'the confirmation shown').toContain(LINK_SENT);
      await w.page.waitForTimeout(NO_EMAIL_WATCH_MS);
      expect((await forgotEmailsSince(page, passwordless.email, since)).length, 'reset e-mails logged for the account with no password').toBe(0);
    });
  });

  test(`TC-${CASES.linkExpiresAfterHour.azureId}: should reject a password reset link one hour after it was issued`, async ({ steps, userIn, signedOut }) => {
    const w = await signedOut();

    await steps.critical('Navigate to the User Management module - the module is accessible', async () => {
      expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
    });

    await steps.step('Open the password reset link after one hour has elapsed since it was sent and attempt to save a new password - "Invalid token." is shown and the password is not saved', async () => {
      if (RESET_LINK_WAIT_BLOCKED) steps.blocked(RESET_LINK_WAIT_BLOCKED);
      const user = await userIn('Active');
      const code = await resetCodeOrBlock(steps, w, user.email);
      allowWait(RESET_LINK_WAIT_MINUTES + 10);
      for (let m = 0; m < RESET_LINK_WAIT_MINUTES; m += 1) await w.page.waitForTimeout(60_000);
      await w.reset.openWithCode(user.email, code);
      await w.reset.fillPasswords(generatePassword());
      const saved = await w.reset.save();
      expect(saved.status, `ResetPassword answered ${saved.text.slice(0, 200)}`).not.toBe(200);
      expect(saidBy(saved), 'the message shown').toContain(INVALID_TOKEN);
    });
  });

  test(`TC-${CASES.linkSingleUse.azureId}: should reject a password reset link that was already used once`, async ({ steps, userIn, signedOut }) => {
    const user = await userIn('Active');
    const w = await signedOut();
    const code = await resetCodeOrBlock(steps, w, user.email);
    const first = generatePassword();

    await steps.critical('Navigate to the User Management module - the module is accessible', async () => {
      expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
    });

    await steps.critical('Precondition: use the reset link once to reset the password successfully', async () => {
      await w.reset.openWithCode(user.email, code);
      await w.reset.fillPasswords(first);
      const saved = await w.reset.save();
      expect(saved.status, `the first use: ${saved.text.slice(0, 200)}`).toBe(200);
    });

    await steps.step('Reopen the same reset link a second time and attempt to save a new password - "Invalid token." is shown and the save fails', async () => {
      await w.reset.openWithCode(user.email, code);
      await w.reset.fillPasswords(generatePassword());
      const saved = await w.reset.save();
      expect(saved.status, `ResetPassword answered ${saved.text.slice(0, 200)}`).not.toBe(200);
      expect(saidBy(saved), 'the message shown').toContain(INVALID_TOKEN);
      expect(await stillSignsIn(w, user.email, first), 'the password set by the first use is still the password').toBe(200);
    });
  });

  test(`TC-${CASES.liveChecklist.azureId}: should show the live password policy checklist while the new password is typed`, async ({ steps, userIn, signedOut }) => {
    const user = await userIn('Active');
    const w = await signedOut();
    const code = await resetCodeOrBlock(steps, w, user.email);

    await steps.critical('Navigate to the User Management module - the module is accessible', async () => {
      expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
    });

    await steps.step('Open the valid reset link and begin typing into the Password field - a live checklist of the policy requirements updates as characters are typed', async () => {
      await w.reset.openWithCode(user.email, code);
      expect(await w.reset.isStep2(), 'the reset step').toBe(true);
      const empty = await resetChecklistState(w.page);
      expect(Object.keys(empty).length, `the checklist lines: ${(await w.reset.readChecklist()).requirements}`).toBeGreaterThanOrEqual(4);
      expect(Object.values(empty).some(Boolean), 'nothing is met before typing').toBe(false);
      await w.reset.typePasswordOnly(PARTIAL_INPUT.slice(0, 1));
      expect((await resetChecklistState(w.page)).uppercase, 'uppercase met after the first character').toBe(true);
      expect((await resetChecklistState(w.page)).digit, 'no digit yet').toBe(false);
      await w.reset.typePasswordOnly(PARTIAL_INPUT);
      const typed = await resetChecklistState(w.page);
      for (const rule of PARTIAL_MEETS) expect(typed[rule], `"${rule}" met`).toBe(true);
      for (const rule of PARTIAL_MISSES) expect(typed[rule], `"${rule}" not met yet`).toBe(false);
    });
  });

  test(`TC-${CASES.policyRejected.azureId}: should reject a new password that does not meet the password policy`, async ({ steps, userWithPassword, signedOut }) => {
    const { user, password } = await userWithPassword();
    const w = await signedOut();
    const code = await resetCodeOrBlock(steps, w, user.email);

    await steps.critical('Navigate to the User Management module - the module is accessible', async () => {
      expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
    });

    await steps.step('Enter a password that fails policy rules in both Password and Confirm Password, then select Save Password - the password is not saved and the unmet rules remain flagged', async () => {
      await w.reset.openWithCode(user.email, code);
      await w.reset.fillPasswords(WEAK_PASSWORD, WEAK_PASSWORD);
      const before = await resetChecklistState(w.page);
      const saved = await w.reset.save();
      const unmet = Object.entries(before).filter(([, met]) => !met).map(([rule]) => rule);
      expect(unmet, 'rules flagged unmet for the weak password').toEqual(expect.arrayContaining(['lengthrange', 'digit']));
      expect(saved.status, `ResetPassword answered ${saved.text.slice(0, 200)} | shown ${saidBy(saved)}`).not.toBe(200);
      expect(await stillSignsIn(w, user.email, password), 'the previous password still signs in (nothing saved)').toBe(200);
    });
  });

  test(`TC-${CASES.historyRejected.azureId}: should reject a new password that repeats a remembered previous password`, async ({ steps, userWithPassword, signedOut }) => {
    const { user, password } = await userWithPassword();
    const w = await signedOut();
    const code = await resetCodeOrBlock(steps, w, user.email);

    await steps.critical('Navigate to the User Management module - the module is accessible', async () => {
      expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
    });

    await steps.step('Enter a password that matches a remembered previous password in both fields, then select Save Password - "You cannot reuse any of your last {0} passwords. Please choose a different one." is shown and the password is not saved', async () => {
      await w.reset.openWithCode(user.email, code);
      await w.reset.fillPasswords(password);
      const saved = await w.reset.save();
      expect(saved.status, `ResetPassword answered ${saved.text.slice(0, 200)}`).not.toBe(200);
      expect(saidBy(saved), 'the message shown').toMatch(PASSWORD_REUSED);
    });
  });

  test(`TC-${CASES.mismatchBlocked.azureId}: should block Save Password when Password and Confirm Password do not match`, async ({ steps, userWithPassword, signedOut }) => {
    const { user, password } = await userWithPassword();
    const w = await signedOut();
    const code = await resetCodeOrBlock(steps, w, user.email);

    await steps.critical('Navigate to the User Management module - the module is accessible', async () => {
      expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
    });

    await steps.step('Enter a valid new password and a different value in Confirm Password, then select Save Password - "Passwords do not match." is shown and the password is not saved', async () => {
      await w.reset.openWithCode(user.email, code);
      await w.reset.fillPasswords(generatePassword(), generatePassword());
      const saved = await w.reset.save();
      expect(saidBy(saved), 'the message shown').toContain(PASSWORDS_DIFFER);
      expect(await stillSignsIn(w, user.email, password), `the previous password still signs in (nothing saved; ResetPassword answered ${saved.status})`).toBe(200);
    });
  });

  test(`TC-${CASES.resetSucceeds.azureId}: should reset the password, clear a pending forced change and return to sign-in`, async ({ steps, userIn, signedOut }) => {
    const user = await userIn('Active');
    const w = await signedOut();
    const code = await resetCodeOrBlock(steps, w, user.email);
    const next = generatePassword();
    let saved!: Saved;

    await steps.critical('Navigate to the User Management module - the module is accessible', async () => {
      expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
    });

    await steps.critical('Enter a new password meeting the policy and history rules in both fields, then select Save Password - "Your password has been reset" is shown', async () => {
      await w.reset.openWithCode(user.email, code);
      await w.reset.fillPasswords(next);
      saved = await w.reset.save();
      expect(saved.status, `ResetPassword answered ${saved.text.slice(0, 200)}`).toBe(200);
      expect(saidBy(saved), 'the message shown').toContain(PASSWORD_RESET);
    });

    await steps.step('Observe the forced password change state and page after saving - the forced change is cleared and the user is returned to the sign-in page', async () => {
      expect(saved.path, 'the page after saving').toBe(AppRoutes.login);
      const outcome = await w.signIn.attempt(user.email, next);
      expect(outcome.status, `signing in with the new password: ${outcome.serverMessage} ${outcome.alert}`).toBe(200);
      await expect(w.page).not.toHaveURL(/\/login(\?|$)/, { timeout: Timeouts.navigation });
      await w.page.waitForTimeout(3_000);
      expect(await new ChangePasswordDrawer(w.page).isOpen(), 'no "Set a New Password" drawer (forced change cleared)').toBe(false);
    });
  });

  test(`TC-${CASES.logInLink.azureId}: should return to the sign-in page from the Log In link on either step`, async ({ steps, userIn, signedOut }) => {
    const user = await userIn('Active');
    const w = await signedOut();
    const code = await resetCodeOrBlock(steps, w, user.email);

    await steps.critical('Navigate to the User Management module - the module is accessible', async () => {
      expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
    });

    await steps.step('On the email request step, select Log In - the sign-in page is displayed', async () => {
      await openRequestStep(w);
      await w.reset.clickLogIn();
      expect(isSignInUrl(w.page), `the URL ${w.page.url()}`).toBe(true);
    });

    await steps.step('Return to a valid reset link, open the reset password step and select Log In - the sign-in page is displayed', async () => {
      await w.reset.openWithCode(user.email, code);
      expect(await w.reset.isStep2(), 'the reset step').toBe(true);
      await w.reset.clickLogIn();
      expect(isSignInUrl(w.page), `the URL ${w.page.url()}`).toBe(true);
    });
  });

  test(`TC-${CASES.rapidRequests.azureId}: should behave consistently when a reset is requested repeatedly in quick succession`, async ({ steps, userIn, signedOut }) => {
    const user = await userIn('Active');
    const w = await signedOut();

    await steps.critical('Navigate to the User Management module - the module is accessible', async () => {
      expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
    });

    await steps.step('Submit a reset request for the same registered email multiple times in quick succession - the same confirmation is shown each time without error states or page corruption', async () => {
      await openRequestStep(w);
      await w.reset.typeEmail(user.email);
      const burst = await captureForgotAnswers(w.page, () => doubleClickContinue(w.page));
      await openRequestStep(w);
      await w.reset.typeEmail(user.email);
      const third = await captureForgotAnswers(w.page, async () => {
        await w.reset.continue();
      });
      const all = [...burst.statuses, ...third.statuses];
      const said = [...burst.messages, ...third.messages];
      expect(all.length, 'ForgotPassword answers').toBeGreaterThanOrEqual(2);
      expect(all.every((s) => s === 200), `every answer 200: ${all.join(', ')}`).toBe(true);
      expect(said.filter((m) => m !== LINK_SENT), `only the confirmation may show: ${said.join(' | ')}`).toEqual([]);
      expect(said, 'the confirmation shown').toContain(LINK_SENT);
      expect([burst.path, third.path], 'back on the sign-in page each time').toEqual([AppRoutes.login, AppRoutes.login]);
    });
  });

  test(`TC-${CASES.emailConstraints.azureId}: should enforce the mandatory, 50-character and format constraints of the reset email field`, async ({ steps, signedOut }) => {
    const w = await signedOut();

    await steps.critical('Navigate to the User Management module - the module is accessible', async () => {
      expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
    });

    await steps.step('Verify the Email Address field is mandatory - a blank Continue shows "This field is required." and sends nothing', async () => {
      await openRequestStep(w);
      expect(await w.reset.readEmail()).toBe('');
      const sent = await w.reset.continue();
      expect(await w.reset.getEmailError(), 'the required error').toBe(REQUIRED);
      expect(sent.status, 'ForgotPassword must not be called (-1 = no request)').toBe(-1);
    });

    await steps.step(`Verify the Email Address field accepts text up to ${EMAIL_MAX} characters - longer input is not accepted`, async () => {
      await openRequestStep(w);
      await typeResetEmailSlowly(w.page, suiteAddressOfLength(EMAIL_MAX));
      expect((await w.reset.readEmail()).length, `${EMAIL_MAX} characters kept`).toBe(EMAIL_MAX);
      await typeResetEmailSlowly(w.page, suiteAddressOfLength(EMAIL_MAX + 1));
      const kept = (await w.reset.readEmail()).length;
      const error = await w.reset.getEmailError();
      expect(kept <= EMAIL_MAX || new RegExp(`${EMAIL_MAX}|max`, 'i').test(error), `the box kept ${kept} characters (maxlength ${String(await w.reset.getEmailMaxLength())}) and showed "${error}"`).toBe(true);
    });

    await steps.step('Verify the Email Address field requires a valid email format - "Enter a valid email address." and nothing sent', async () => {
      await openRequestStep(w);
      await w.reset.typeEmail(MALFORMED_EMAIL);
      const sent = await w.reset.continue();
      expect(await w.reset.getEmailError(), 'the format error').toBe(INVALID_EMAIL);
      expect(sent.status, 'ForgotPassword must not be called (-1 = no request)').toBe(-1);
    });
  });

  test(`TC-${CASES.confirmRequired.azureId}: should require Confirm Password before a reset can be saved`, async ({ steps, userWithPassword, signedOut }) => {
    const { user, password } = await userWithPassword();
    const w = await signedOut();
    const code = await resetCodeOrBlock(steps, w, user.email);

    await steps.critical('Navigate to the User Management module - the module is accessible', async () => {
      expect(await moduleScreen(w), 'the screen Users Administration opened on without a session').toBe('login');
    });

    await steps.step('Enter a valid new password in Password, leave Confirm Password blank and select Save Password - a required-field error is shown and the password is not saved', async () => {
      await w.reset.openWithCode(user.email, code);
      await w.reset.fillPasswords(generatePassword(), '');
      const saved = await w.reset.save();
      expect(saidBy(saved), 'the required error under Confirm Password').toContain(REQUIRED);
      expect(saved.status, `ResetPassword must not be called (-1 = no request): ${saved.text.slice(0, 200)}`).not.toBe(200);
      expect(await stillSignsIn(w, user.email, password), 'the previous password still signs in (nothing saved)').toBe(200);
    });
  });
});
