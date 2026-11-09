import { test, expect } from '../../../fixtures';
import type { SuiteSession } from '../../../fixtures/userModule.fixture';
import { AppRoutes } from '../../../constants/AppRoutes';
import type { PasswordRule } from '../../../constants/user/userIds';
import { CASES } from '../../../data/user/changePassword.data';
import { ChangePasswordDrawer } from '../../../pages/user/ChangePasswordDrawer';
import { generatePassword, readPasswordPolicy, requestSignIn } from '../../../utils/UserProvisioning';
import {
  currentPasswordError,
  distinctRun,
  expectedRuleKeys,
  highlightedPasswordBoxes,
  isRequirementsListShown,
  strengthWhileTyping,
} from '../../../utils/user/writerFHelpers';

/** "Navigate to the User Management module": the suite user's Users Administration list opens with the user menu. */
async function openModule(s: SuiteSession): Promise<boolean> {
  await s.users.openTable();
  expect(new URL(s.page.url()).pathname, 'the User Management module').toBe(AppRoutes.usersAdministration);
  expect(await s.menu.isOffered(), 'the user menu').toBe(true);
  return true;
}

/** User menu > Change Password, open. */
async function openDrawer(s: SuiteSession, drawer: ChangePasswordDrawer): Promise<boolean> {
  await s.menu.openChangePassword();
  expect(await drawer.isOpen(), 'the Change Password drawer').toBe(true);
  return true;
}

/** The checklist lines that read as NOT met. */
async function unmetRules(drawer: ChangePasswordDrawer): Promise<PasswordRule[]> {
  const out: PasswordRule[] = [];
  for (const r of Object.keys(await drawer.readRules()) as PasswordRule[]) if (!(await drawer.isRuleMet(r))) out.push(r);
  return out;
}

/** A submit that did NOT change the password: no 200 and the drawer still open. */
const blockedChange = (r: { status: number; closed: boolean }): { changed: boolean; closed: boolean } => ({ changed: r.status === 200, closed: r.closed });

/**
 * User story 20425: Change Password - validation (wrong current, reuse, same
 * as current, mismatch, invalid fields, maximum length, checklist, strength,
 * required current, policy). Every case runs as a SUITE user; passwords are
 * SuiteSecrets; a filled drawer is wiped before the test ends. 20792 loosens
 * the global policy ONLY through `settingsRestore` (restored and read back).
 */
test.describe('US 20425 - Change Password', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.wrongCurrent.azureId}: should show "Incorrect password." and keep the password when the current password entered is wrong`, async ({ page, steps, suiteSession }) => {
    const s = await suiteSession();
    const drawer = new ChangePasswordDrawer(s.page);
    const policy = await readPasswordPolicy(page);
    const wrong = generatePassword(policy);
    const next = generatePassword(policy);

    await steps.critical('Navigate to the User Management module - the user menu is accessible', async () => {
      expect(await openModule(s), 'the User Management module').toBe(true);
    });

    await steps.critical('Open Change Password from the user menu - the drawer opens', async () => {
      expect(await openDrawer(s, drawer), 'the Change Password drawer').toBe(true);
    });

    await steps.step('Enter an incorrect value in Current Password and a valid new password in New Password and Confirm Password - the fields accept the input', async () => {
      await drawer.fill('current', wrong);
      await drawer.fill('next', next);
      await drawer.fill('confirm', next);
      expect([await drawer.valueLength('current'), await drawer.valueLength('next'), await drawer.valueLength('confirm')].every((n) => n > 0), 'all three fields filled').toBe(true);
    });

    await steps.step(`Select Change Password - "${CASES.wrongCurrent.message}" is displayed and the password is not changed`, async () => {
      const result = await drawer.attemptSubmit();
      expect([...result.errors, ...result.messages], `what the drawer showed (answer ${result.status})`).toContain(CASES.wrongCurrent.message);
      expect(blockedChange(result), 'the change').toEqual({ changed: false, closed: false });
      expect((await requestSignIn(page, s.user.email, s.password)).status, 'signing in with the UNCHANGED password').toBe(200);
    });
    await drawer.wipe();
  });

  test(`TC-${CASES.rememberedPassword.azureId}: should refuse a remembered password with the reuse message when it is entered as the new password`, async ({ page, steps, suiteSession }) => {
    const s = await suiteSession();
    const drawer = new ChangePasswordDrawer(s.page);
    const second = generatePassword(await readPasswordPolicy(page));

    await steps.critical('Navigate to the User Management module - the user menu is accessible', async () => {
      expect(await openModule(s), 'the User Management module').toBe(true);
    });

    await steps.critical('Precondition: change the password once through the drawer, so the first password becomes a remembered one', async () => {
      expect(await openDrawer(s, drawer), 'the Change Password drawer').toBe(true);
      const first = await drawer.change(s.password, second);
      expect({ status: first.status, closed: first.closed }, `the precondition change (${first.text.slice(0, 200)})`).toEqual({ status: 200, closed: true });
    });

    await steps.critical('Open Change Password - the drawer opens', async () => {
      expect(await openDrawer(s, drawer), 'the Change Password drawer').toBe(true);
    });

    await steps.step('Enter the correct Current Password - the value is accepted', async () => {
      await drawer.fill('current', second);
      expect(await drawer.valueLength('current'), 'Current Password filled').toBe(second.length);
    });

    await steps.step('Enter a New Password that matches one of the last remembered passwords - the checklist shows policy requirements met', async () => {
      await drawer.fill('next', s.password);
      await drawer.fill('confirm', s.password);
      expect(await unmetRules(drawer), 'requirements not met').toEqual([]);
    });

    await steps.step('Select Change Password - "You cannot reuse any of your last {0} passwords. Please choose a different one." is shown and the change is blocked', async () => {
      const result = await drawer.attemptSubmit();
      expect([...result.errors, ...result.messages].some((m) => CASES.rememberedPassword.message.test(m)), `the reuse message among ${JSON.stringify([...result.errors, ...result.messages])} (answer ${result.status})`).toBe(true);
      expect(blockedChange(result), 'the change').toEqual({ changed: false, closed: false });
      expect((await requestSignIn(page, s.user.email, second)).status, 'signing in with the UNCHANGED (second) password').toBe(200);
    });
    await drawer.wipe();
  });

  test(`TC-${CASES.sameAsCurrent.azureId}: should refuse a new password equal to the current one with the "must be different" message when it is submitted`, async ({ page, steps, suiteSession }) => {
    const s = await suiteSession();
    const drawer = new ChangePasswordDrawer(s.page);

    await steps.critical('Navigate to the User Management module - the user menu is accessible', async () => {
      expect(await openModule(s), 'the User Management module').toBe(true);
    });

    await steps.critical('Open Change Password - the drawer opens', async () => {
      expect(await openDrawer(s, drawer), 'the Change Password drawer').toBe(true);
    });

    await steps.step('Enter the current password correctly in Current Password - the value is accepted', async () => {
      await drawer.fill('current', s.password);
      expect(await drawer.valueLength('current'), 'Current Password filled').toBe(s.password.length);
    });

    await steps.step('Enter the same password again in New Password and Confirm Password - the fields accept the input', async () => {
      await drawer.fill('next', s.password);
      await drawer.fill('confirm', s.password);
      expect([await drawer.valueLength('next'), await drawer.valueLength('confirm')], 'New / Confirm filled').toEqual([s.password.length, s.password.length]);
    });

    await steps.step(`Select Change Password - "${CASES.sameAsCurrent.message}" is shown and the change is blocked`, async () => {
      const result = await drawer.attemptSubmit();
      expect([...result.errors, ...result.messages], `what the drawer showed (answer ${result.status})`).toContain(CASES.sameAsCurrent.message);
      expect(blockedChange(result), 'the change').toEqual({ changed: false, closed: false });
      expect((await requestSignIn(page, s.user.email, s.password)).status, 'signing in with the current password').toBe(200);
    });
    await drawer.wipe();
  });

  test(`TC-${CASES.confirmMismatch.azureId}: should show "Passwords do not match." and block the change when Confirm Password differs`, async ({ page, steps, suiteSession }) => {
    const s = await suiteSession();
    const drawer = new ChangePasswordDrawer(s.page);
    const policy = await readPasswordPolicy(page);
    const next = generatePassword(policy);
    const other = generatePassword(policy);

    await steps.critical('Navigate to the User Management module - the user menu is accessible', async () => {
      expect(await openModule(s), 'the User Management module').toBe(true);
    });

    await steps.critical('Open Change Password - the drawer opens', async () => {
      expect(await openDrawer(s, drawer), 'the Change Password drawer').toBe(true);
    });

    await steps.step('Enter the correct Current Password - the value is accepted', async () => {
      await drawer.fill('current', s.password);
      expect(await drawer.valueLength('current'), 'Current Password filled').toBe(s.password.length);
    });

    await steps.step('Enter a valid New Password, then enter a different value in Confirm Password - the fields show differing values', async () => {
      await drawer.fill('next', next);
      await drawer.fill('confirm', other);
      expect([await drawer.valueLength('next'), await drawer.valueLength('confirm')].every((n) => n > 0), 'New / Confirm filled (two different generated values)').toBe(true);
    });

    await steps.step(`Select Change Password - "${CASES.confirmMismatch.message}" is shown and the change is blocked`, async () => {
      const result = await drawer.attemptSubmit();
      expect([...result.errors, ...result.messages], `what the drawer showed (answer ${result.status})`).toContain(CASES.confirmMismatch.message);
      expect(blockedChange(result), 'the change').toEqual({ changed: false, closed: false });
      expect((await requestSignIn(page, s.user.email, s.password)).status, 'signing in with the UNCHANGED password').toBe(200);
    });
    await drawer.wipe();
  });

  test(`TC-${CASES.invalidFields.azureId}: should show the consolidated fix-the-fields message and block the change when the drawer holds invalid fields`, async ({ page, steps, suiteSession }) => {
    const s = await suiteSession();
    const drawer = new ChangePasswordDrawer(s.page);

    await steps.critical('Navigate to the User Management module - the user menu is accessible', async () => {
      expect(await openModule(s), 'the User Management module').toBe(true);
    });

    await steps.critical('Open Change Password - the drawer opens', async () => {
      expect(await openDrawer(s, drawer), 'the Change Password drawer').toBe(true);
    });

    await steps.step('Leave Current Password blank and enter a New Password that does not meet policy - the invalid fields are highlighted', async () => {
      await drawer.fill('current', '');
      await drawer.fill('next', CASES.invalidFields.newPassword);
      expect(await highlightedPasswordBoxes(s.page), 'highlighted boxes').toEqual(expect.arrayContaining(['current', 'next']));
    });

    await steps.step(`Select Change Password - "${CASES.invalidFields.message}" is displayed and the change is blocked`, async () => {
      const result = await drawer.attemptSubmit();
      expect([...result.errors, ...result.messages], `what the drawer showed (answer ${result.status})`).toContain(CASES.invalidFields.message);
      expect(blockedChange(result), 'the change').toEqual({ changed: false, closed: false });
      expect((await requestSignIn(page, s.user.email, s.password)).status, 'signing in with the UNCHANGED password').toBe(200);
    });
    await drawer.wipe();
  });

  test(`TC-${CASES.maxLength.azureId}: should stop New Password at the policy maximum length when one more character is typed`, async ({ page, steps, suiteSession }) => {
    const s = await suiteSession();
    const drawer = new ChangePasswordDrawer(s.page);
    const policy = await readPasswordPolicy(page);
    const max = policy.maximumLength;

    await steps.critical(`Navigate to the User Management module - the user menu is accessible (policy maximum length ${max})`, async () => {
      expect(await openModule(s), 'the User Management module').toBe(true);
      expect(max, 'the policy maximum length').toBeGreaterThanOrEqual(8);
    });

    await steps.critical('Open Change Password - the drawer opens', async () => {
      expect(await openDrawer(s, drawer), 'the Change Password drawer').toBe(true);
    });

    await steps.step('Enter the correct Current Password - the value is accepted', async () => {
      await drawer.fill('current', s.password);
      expect(await drawer.valueLength('current'), 'Current Password filled').toBe(s.password.length);
    });

    await steps.step('Type a new password of exactly the maximum allowed length into New Password - all characters are accepted', async () => {
      await drawer.typeSlowly('next', generatePassword(policy, max));
      expect(await drawer.valueLength('next'), 'characters held by New Password').toBe(max);
    });

    await steps.step('Attempt to type one additional character beyond the maximum - the extra character is not accepted and the field retains the maximum-length value', async () => {
      await drawer.typeSlowly('next', 'x');
      expect(await drawer.valueLength('next'), `characters held after typing ${max + 1} (maxlength attribute: ${await drawer.getMaxLength('next')})`).toBe(max);
    });
    await drawer.wipe();
  });

  test(`TC-${CASES.checklistFollowsPolicy.azureId}: should list only the rules the policy imposes when New Password is typed under a reduced policy`, async ({ page, steps, suiteSession, settingsRestore }) => {
    const d = CASES.checklistFollowsPolicy;
    const s = await suiteSession({ signIn: false });
    const drawer = new ChangePasswordDrawer(s.page);
    const changed = await settingsRestore.changePolicy({ ...d.policy });
    if (changed.status >= 300) steps.blocked(`the precondition policy (only a length range and an uppercase letter) could not be saved: ${changed.status} ${changed.text.slice(0, 200)}`);
    const policy = await readPasswordPolicy(page);

    await steps.critical('Navigate to the User Management module - the user menu is accessible (the suite user signs in under the reduced policy)', async () => {
      expect({ lower: policy.requireLowercase, digit: policy.requireDigit, symbol: policy.requireNonAlphanumeric, distinct: policy.requiredUniqueChars }, 'the precondition policy').toEqual({ lower: false, digit: false, symbol: false, distinct: 1 });
      await s.signInPage.open();
      await s.signInPage.signIn(s.user.email, s.password);
      expect(await openModule(s), 'the User Management module').toBe(true);
    });

    await steps.critical('Open Change Password - the drawer opens', async () => {
      expect(await openDrawer(s, drawer), 'the Change Password drawer').toBe(true);
    });

    await steps.step('Click into the New Password field and begin typing - the "Password requirements" checklist appears below the field', async () => {
      await drawer.typeSlowly('next', d.typed);
      expect(await isRequirementsListShown(s.page), 'the requirements checklist').toBe(true);
    });

    await steps.step('Compare the lines shown in the checklist against the active policy rules - only the rules the policy currently imposes are listed', async () => {
      const shown = Object.keys(await drawer.readRules()).sort();
      expect(shown, 'checklist lines').toEqual(expectedRuleKeys(policy).sort());
    });
    await drawer.wipe();
    await settingsRestore.restorePolicyNow();
  });

  test(`TC-${CASES.strengthMeter.azureId}: should move the strength meter from Weak through Fair and Good to Strong when the new password grows stronger`, async ({ steps, suiteSession }) => {
    const d = CASES.strengthMeter;
    const s = await suiteSession();
    const drawer = new ChangePasswordDrawer(s.page);
    let lastWeak = '';

    await steps.critical('Navigate to the User Management module - the user menu is accessible', async () => {
      expect(await openModule(s), 'the User Management module').toBe(true);
    });

    await steps.critical('Open Change Password - the drawer opens', async () => {
      expect(await openDrawer(s, drawer), 'the Change Password drawer').toBe(true);
    });

    await steps.step('Type a short, simple new password - the strength meter shows "Weak"', async () => {
      const labels = await strengthWhileTyping(s.page, drawer, d.weak);
      lastWeak = labels[labels.length - 1] ?? '';
      expect(lastWeak, `the meter while typing (${labels.join(' > ')})`).toBe('Weak');
    });

    await steps.step('Extend the password with mixed case, numbers and symbols - the strength meter progressively updates through Fair and Good to "Strong"', async () => {
      const labels = await strengthWhileTyping(s.page, drawer, d.extension);
      expect(distinctRun([lastWeak, ...labels]), `the meter while extending (${labels.join(' > ')})`).toEqual([...d.run]);
    });
    await drawer.wipe();
  });

  test(`TC-${CASES.currentRequired.azureId}: should mask Current Password and flag it as required when the change is submitted without it`, async ({ page, steps, suiteSession }) => {
    const s = await suiteSession();
    const drawer = new ChangePasswordDrawer(s.page);
    const next = generatePassword(await readPasswordPolicy(page));

    await steps.critical('Navigate to the User Management module - the user menu is accessible', async () => {
      expect(await openModule(s), 'the User Management module').toBe(true);
    });

    await steps.critical('Open Change Password - the drawer opens', async () => {
      expect(await openDrawer(s, drawer), 'the Change Password drawer').toBe(true);
    });

    await steps.step('Observe the Current Password field as characters are typed - the characters display as masked', async () => {
      await drawer.typeSlowly('current', CASES.currentRequired.typed);
      expect({ type: await drawer.getInputType('current'), held: await drawer.valueLength('current') }, 'Current Password while typing').toEqual({ type: 'password', held: CASES.currentRequired.typed.length });
    });

    await steps.step('Leave Current Password empty and attempt to select Change Password - the field is flagged as required and the change is blocked', async () => {
      await drawer.fill('current', '');
      await drawer.fill('next', next);
      await drawer.fill('confirm', next);
      const result = await drawer.attemptSubmit();
      expect(await currentPasswordError(s.page), `the Current Password error (drawer showed ${JSON.stringify(result.errors)})`).toMatch(/required/i);
      expect(blockedChange(result), `the change (answer ${result.status})`).toEqual({ changed: false, closed: false });
    });
    await drawer.wipe();
  });

  test(`TC-${CASES.policyViolation.azureId}: should show "Password does not meet the password policy." when the new password misses a required character class`, async ({ page, steps, suiteSession }) => {
    const s = await suiteSession();
    const drawer = new ChangePasswordDrawer(s.page);
    const d = CASES.policyViolation;

    await steps.critical('Navigate to the User Management module - the user menu is accessible', async () => {
      expect(await openModule(s), 'the User Management module').toBe(true);
    });

    await steps.critical('Open Change Password - the drawer opens', async () => {
      expect(await openDrawer(s, drawer), 'the Change Password drawer').toBe(true);
    });

    await steps.step('Enter the correct Current Password - the value is accepted', async () => {
      await drawer.fill('current', s.password);
      expect(await drawer.valueLength('current'), 'Current Password filled').toBe(s.password.length);
    });

    await steps.step('Enter a New Password missing a required character class in New Password and Confirm Password - the checklist shows the unmet requirement', async () => {
      await drawer.fill('next', d.newPassword);
      await drawer.fill('confirm', d.newPassword);
      expect(await unmetRules(drawer), 'unmet requirements').toEqual(expect.arrayContaining(['uppercase', 'symbol']));
    });

    await steps.step(`Select Change Password - "${d.message}" is displayed and the change is blocked`, async () => {
      const result = await drawer.attemptSubmit();
      expect([...result.errors, ...result.messages], `what the drawer showed (answer ${result.status})`).toContain(d.message);
      expect(blockedChange(result), 'the change').toEqual({ changed: false, closed: false });
      expect((await requestSignIn(page, s.user.email, s.password)).status, 'signing in with the UNCHANGED password').toBe(200);
    });
    await drawer.wipe();
  });
});
