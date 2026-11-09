import type { Page } from '@playwright/test';
import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { UserListPage } from '../../../pages/user/UserListPage';
import type { UserFormDrawer, UserSaveAnswer } from '../../../pages/user/UserFormDrawer';
import { byId } from '../../../constants/ElementIds';
import { USER_FORM } from '../../../constants/user/userIds';
import { CASES } from '../../../data/user/createUser.data';
import { hijriOf, riyadhDate, userDayText } from '../../../utils/UserProvisioning';
import {
  digits,
  drawerUser,
  emailOfLength,
  errorsShown,
  navigateToUsers,
  passUserInfo,
  refused,
  said,
  type DrawerUser,
} from '../../../utils/user/writerBHelpers';

const LIST_SHOWN = 'the user list is displayed';

/** "Click Add User and proceed to Contact Information": a valid step 1, Next. */
async function openAtContact(steps: TestSteps, list: UserListPage, user: DrawerUser, expected = 'the Contact Information step is displayed', dialCode?: string): Promise<UserFormDrawer> {
  let drawer!: UserFormDrawer;
  await steps.critical(`Click "Add User" and proceed to Contact Information - ${expected}`, async () => {
    drawer = await list.openAddForm();
    expect(await passUserInfo(drawer, user), `step 1 errors: ${await errorsShown(drawer)}`).toBe(true);
    if (dialCode !== undefined) expect(await drawer.readMobilePrefix(), 'the dial code before Mobile Number').toBe(dialCode);
  });
  return drawer;
}

/** "Click Add User" - the drawer on User Information. */
async function openAtUserInfo(steps: TestSteps, list: UserListPage): Promise<UserFormDrawer> {
  let drawer!: UserFormDrawer;
  await steps.critical('Click "Add User" - the User Information step is displayed', async () => {
    drawer = await list.openAddForm();
    expect(await drawer.currentStep()).toBe(1);
  });
  return drawer;
}

/** Types into a field and reads it back with its error. */
async function enter(drawer: UserFormDrawer, field: Parameters<UserFormDrawer['type']>[0], value: string): Promise<{ value: string; error: string }> {
  await drawer.type(field, value);
  return { value: await drawer.getValue(field), error: await drawer.getFieldError(field) };
}

/** `DD/MM/YYYY` -> `YYYY-MM-DD`. */
const isoOf = (dayText: string): string => `${dayText.slice(6, 10)}-${dayText.slice(3, 5)}-${dayText.slice(0, 2)}`;

/** A Hijri `YYYY/MM/DD` moved by one day (backwards on the 29th / 30th, so the date stays valid). */
function otherHijriDay(hijri: string): string {
  const [y, m, d] = hijri.split('/');
  const day = Number(d);
  return `${y}/${m}/${String(day >= 28 ? day - 1 : day + 1).padStart(2, '0')}`;
}

/** Whether a field box is on screen. */
async function shown(page: Page, inputId: string): Promise<boolean> {
  return page.locator(byId(inputId)).isVisible().catch(() => false);
}

/**
 * User story 20411: Create User - field rules of User Information (names,
 * date of birth, Hijri date, dropdowns, Account Deactivation Date) and Contact
 * Information (e-mail format / length / uniqueness, mobile number). See
 * data/user/createUser.data.ts for the literal readings.
 */
test.describe('US 20411 - Create User', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.invalidEmail.azureId}: should reject an e-mail address without @ or domain when creating a user`, async ({ page, steps, userListPage: list, newSuiteUserName }) => {
    const c = CASES.invalidEmail;
    await navigateToUsers(steps, list, LIST_SHOWN);
    const drawer = await openAtContact(steps, list, await drawerUser(page, newSuiteUserName()));

    await steps.step(`Enter "${c.email}" (no @ or domain) in Email Address and move focus away - a format validation error is shown`, async () => {
      expect((await enter(drawer, 'email', c.email)).error, 'the Email error').toMatch(c.error);
    });
  });

  test(`TC-${CASES.emailLength.azureId}: should accept an e-mail address only between 6 and 100 characters`, async ({ page, steps, userListPage: list, newSuiteUserName }) => {
    const c = CASES.emailLength;
    const longest = emailOfLength(c.longest);
    const tooLong = emailOfLength(c.tooLong);
    await navigateToUsers(steps, list, LIST_SHOWN);
    const drawer = await openAtContact(steps, list, await drawerUser(page, newSuiteUserName()));

    await steps.step(`Enter a 5-character email value ("${c.tooShort}") and move focus away - a validation error is shown (below minimum)`, async () => {
      expect((await enter(drawer, 'email', c.tooShort)).error, 'the Email error').not.toBe('');
    });

    await steps.step(`Enter a valid 6-character email ("${c.shortest}") and move focus away - the value is accepted (minimum boundary)`, async () => {
      expect(await enter(drawer, 'email', c.shortest)).toEqual({ value: c.shortest, error: '' });
    });

    await steps.step(`Enter a valid ${c.longest}-character email and move focus away - the value is accepted (maximum boundary)`, async () => {
      expect(await enter(drawer, 'email', longest)).toEqual({ value: longest, error: '' });
    });

    await steps.step(`Enter a ${c.tooLong}-character email and move focus away - a validation error is shown (above maximum)`, async () => {
      const state = await enter(drawer, 'email', tooLong);
      expect(state.error, `the box holds ${state.value.length} characters`).not.toBe('');
    });
  });

  test(`TC-${CASES.duplicateEmail.azureId}: should block a new user whose e-mail address is already used by another user`, async ({
    page,
    steps,
    userListPage: list,
    userIn,
    suiteRole,
    newSuiteUserName,
    discardUserEmail,
  }) => {
    const c = CASES.duplicateEmail;
    const existing = await userIn('Active');
    const role = await suiteRole();
    const name = newSuiteUserName();
    discardUserEmail(name.email);
    discardUserEmail(existing.email);
    const user = await drawerUser(page, name, { contact: { email: existing.email } });
    const messages: string[] = [];

    await navigateToUsers(steps, list, LIST_SHOWN);
    const drawer = await openAtContact(steps, list, user);

    await steps.step(`Enter Email Address "${existing.email}" (already used by the suite user "${existing.displayNameEn}") and move focus away or attempt to proceed - the system blocks the action`, async () => {
      await drawer.fillContact(user.contact);
      messages.push(await drawer.getFieldError('email'));
      let answer: UserSaveAnswer | null = null;
      const moved = await drawer.next();
      messages.push(...(await drawer.getFieldErrors()));
      if (moved) {
        await drawer.addRole(role.name);
        answer = await drawer.attemptSave();
        messages.push(...answer.messages, ...answer.errors);
      }
      expect(!moved || (answer !== null && refused(answer)), `Next moved on: ${moved}; ${answer ? said(answer) : 'not saved'}`).toBe(true);
    });

    await steps.step(`Observe the validation message - "${c.message(existing.email)}" is displayed`, async () => {
      expect(messages.join(' | '), 'the messages shown').toContain(c.message(existing.email));
    });
  });

  test(`TC-${CASES.ageRange.azureId}: should accept a date of birth only when the age is between 15 and 120 years`, async ({ steps, userListPage: list }) => {
    const { ages } = CASES.ageRange;
    const born = (age: number): string => userDayText(riyadhDate(0, -age));
    await navigateToUsers(steps, list, LIST_SHOWN);
    const drawer = await openAtUserInfo(steps, list);

    await steps.step(`Enter a Date of Birth resulting in age ${ages.under} (${born(ages.under)}) and move focus away - a validation error is shown (below minimum)`, async () => {
      const state = await enter(drawer, 'dob', born(ages.under));
      expect(state.error, `the box holds "${state.value}"`).not.toBe('');
    });

    await steps.step(`Enter a Date of Birth resulting in age ${ages.min} (${born(ages.min)}) and move focus away - the value is accepted (minimum boundary)`, async () => {
      expect(await enter(drawer, 'dob', born(ages.min))).toEqual({ value: born(ages.min), error: '' });
    });

    await steps.step(`Enter a Date of Birth resulting in age ${ages.max} (${born(ages.max)}) and move focus away - the value is accepted (maximum boundary)`, async () => {
      expect(await enter(drawer, 'dob', born(ages.max))).toEqual({ value: born(ages.max), error: '' });
    });

    await steps.step(`Enter a Date of Birth resulting in age ${ages.over} (${born(ages.over)}) and move focus away - a validation error is shown (above maximum)`, async () => {
      const state = await enter(drawer, 'dob', born(ages.over));
      expect(state.error, `the box holds "${state.value}"`).not.toBe('');
    });
  });

  test(`TC-${CASES.hijriMatchesGregorian.azureId}: should keep the Hijri and Gregorian dates of birth on the same day`, async ({ page, steps, userListPage: list }) => {
    const c = CASES.hijriMatchesGregorian;
    let autoFilled = '';
    await navigateToUsers(steps, list, LIST_SHOWN);
    const drawer = await openAtUserInfo(steps, list);

    await steps.step(`Enter a valid Gregorian Date of Birth (${userDayText(c.gregorian)}) - the Hijri Date of Birth is auto-filled based on Umm al-Qura conversion`, async () => {
      const expected = await hijriOf(page, c.gregorian);
      await drawer.type('dob', userDayText(c.gregorian));
      await expect.poll(async () => drawer.getValue('hijriDob'), { message: 'the auto-filled Hijri date', timeout: 10_000 }).toBe(expected);
      autoFilled = await drawer.getValue('hijriDob');
    });

    await steps.step('Manually override the auto-filled Hijri date to a different day - a mismatch validation error is shown, or the Gregorian date is correspondingly recalculated', async () => {
      const altered = otherHijriDay(autoFilled || (await hijriOf(page, c.gregorian)));
      await drawer.type('hijriDob', altered);
      const error = [await drawer.getFieldError('hijriDob'), await drawer.getFieldError('dob')].filter(Boolean).join(' | ');
      const gregorian = await drawer.getValue('dob');
      const followed = /^\d{2}\/\d{2}\/\d{4}$/.test(gregorian) && (await hijriOf(page, isoOf(gregorian))) === altered;
      expect(error !== '' || followed, `Hijri typed ${altered}; Gregorian now "${gregorian}"; error "${error}"`).toBe(true);
    });
  });

  test(`TC-${CASES.englishOnly.azureId}: should reject Arabic characters in the English First Name`, async ({ steps, userListPage: list }) => {
    const c = CASES.englishOnly;
    await navigateToUsers(steps, list, LIST_SHOWN);
    const drawer = await openAtUserInfo(steps, list);

    await steps.step(`Enter Arabic characters "${c.value}" into the English First Name field and move focus away - a validation error is shown indicating English letters only are allowed`, async () => {
      expect((await enter(drawer, 'englishFirstName', c.value)).error, 'the English First Name error').toMatch(c.error);
    });
  });

  test(`TC-${CASES.arabicOnly.azureId}: should reject English characters in the Arabic First Name`, async ({ steps, userListPage: list }) => {
    const c = CASES.arabicOnly;
    await navigateToUsers(steps, list, LIST_SHOWN);
    const drawer = await openAtUserInfo(steps, list);

    await steps.step(`Enter English characters "${c.value}" into the Arabic First Name field and move focus away - a validation error is shown indicating Arabic letters only are allowed`, async () => {
      expect((await enter(drawer, 'arabicFirstName', c.value)).error, 'the Arabic First Name error').toMatch(c.error);
    });
  });

  test(`TC-${CASES.lastNameLength.azureId}: should cap the English Last Name at 50 characters`, async ({ steps, userListPage: list }) => {
    const c = CASES.lastNameLength;
    await navigateToUsers(steps, list, LIST_SHOWN);
    const drawer = await openAtUserInfo(steps, list);

    await steps.step(`Enter exactly ${c.limit} English letters into English Last Name - the value is accepted`, async () => {
      const value = 'a'.repeat(c.limit);
      expect(await enter(drawer, 'englishLastName', value)).toEqual({ value, error: '' });
    });

    await steps.step(`Clear the field and enter ${c.limit + 1} English letters - the field prevents entry beyond ${c.limit} characters or shows a validation error`, async () => {
      const state = await enter(drawer, 'englishLastName', 'b'.repeat(c.limit + 1));
      expect(state.value.length <= c.limit || state.error !== '', `the box holds ${state.value.length} characters, error "${state.error}"; maxlength ${await drawer.getMaxLength('englishLastName')}`).toBe(true);
    });
  });

  test(`TC-${CASES.dropdownValues.azureId}: should offer exactly the specified values in Gender, Preferred Contact Method and Preferred Language`, async ({ page, steps, userListPage: list, newSuiteUserName }) => {
    const c = CASES.dropdownValues;
    const user = await drawerUser(page, newSuiteUserName());
    const sorted = (values: readonly string[]): string[] => [...values].sort();
    await navigateToUsers(steps, list, LIST_SHOWN);
    const drawer = await openAtUserInfo(steps, list);

    await steps.step(`Open the Gender dropdown - only ${c.gender.map((v) => `"${v}"`).join(' and ')} are listed`, async () => {
      expect(sorted(await drawer.getOptions('gender')), 'the Gender options').toEqual(sorted(c.gender));
    });

    await steps.step(`Proceed to Contact Information and open Preferred Contact Method - only ${c.contact.map((v) => `"${v}"`).join(', ')} are listed`, async () => {
      expect(await passUserInfo(drawer, user), `step 1 errors: ${await errorsShown(drawer)}`).toBe(true);
      expect(sorted(await drawer.getOptions('preferredContactMethod')), 'the Preferred Contact Method options').toEqual(sorted(c.contact));
    });

    await steps.step(`Open Preferred Language - only ${c.language.map((v) => `"${v}"`).join(' and ')} are listed`, async () => {
      expect(sorted(await drawer.getOptions('preferredLanguage')), 'the Preferred Language options').toEqual(sorted(c.language));
    });
  });

  test(`TC-${CASES.deactivationFuture.azureId}: should accept an Account Deactivation Date only when it is later than today`, async ({ page, steps, userListPage: list }) => {
    const today = userDayText(riyadhDate(0));
    const tomorrow = userDayText(riyadhDate(1));
    let drawer!: UserFormDrawer;
    await navigateToUsers(steps, list, LIST_SHOWN);

    await steps.critical('Click "Add User" and proceed to the relevant step (User Information - the field sits on step 1) - the Account Deactivation Date field is displayed', async () => {
      drawer = await list.openAddForm();
      expect(await shown(page, USER_FORM.input.accountDeactivationDate), 'the Account Deactivation Date box').toBe(true);
    });

    await steps.step(`Enter today's date (${today}) as the Account Deactivation Date - a validation error is shown (date must be later than today)`, async () => {
      const state = await enter(drawer, 'accountDeactivationDate', today);
      expect(state.error, `the box holds "${state.value}"`).not.toBe('');
    });

    await steps.step(`Enter tomorrow's date (${tomorrow}) as the Account Deactivation Date - the value is accepted`, async () => {
      expect(await enter(drawer, 'accountDeactivationDate', tomorrow)).toEqual({ value: tomorrow, error: '' });
    });
  });

  test(`TC-${CASES.saudiMobile.azureId}: should accept a Saudi mobile number only when it is 9 digits starting with 5`, async ({ page, steps, userListPage: list, newSuiteUserName }) => {
    const c = CASES.saudiMobile;
    await navigateToUsers(steps, list, LIST_SHOWN);
    const drawer = await openAtContact(steps, list, await drawerUser(page, newSuiteUserName()), 'the Mobile Number field is displayed with dial code +966', '+966');

    await steps.step(`Enter "${c.valid}" (9 digits starting with 5) and move focus away - the value is accepted`, async () => {
      expect(await enter(drawer, 'phoneNumber', c.valid)).toEqual({ value: c.valid, error: '' });
    });

    await steps.step(`Clear and enter "${c.wrongStart}" (starts with 6) and move focus away - a validation error is shown`, async () => {
      expect((await enter(drawer, 'phoneNumber', c.wrongStart)).error).toMatch(c.error);
    });

    await steps.step(`Clear and enter "${c.tooShort}" (8 digits) and move focus away - a validation error is shown`, async () => {
      expect((await enter(drawer, 'phoneNumber', c.tooShort)).error).toMatch(c.error);
    });
  });

  test(`TC-${CASES.nonSaudiMobile.azureId}: should accept a mobile number for a non-Saudi dial code only between 5 and 10 digits`, async ({ page, steps, userListPage: list, newSuiteUserName }) => {
    const { lengths } = CASES.nonSaudiMobile;
    const user = await drawerUser(page, newSuiteUserName(), { identity: 'iqama' });
    await navigateToUsers(steps, list, LIST_SHOWN);
    const drawer = await openAtContact(steps, list, user, 'the Mobile Number field is displayed');

    await steps.step(`Select a non-Saudi dial code (Nationality ${user.info.nationality}; the drawer offers no dial-code control) and enter a ${lengths.under}-digit number - a validation error is shown (below minimum)`, async () => {
      const prefix = await drawer.readMobilePrefix();
      const state = await enter(drawer, 'phoneNumber', digits(lengths.under, '2'));
      expect({ nonSaudiDialCode: prefix !== '' && prefix !== '+966', rejected: state.error !== '' }, `the dial code shown is "${prefix}", error "${state.error}"`)
        .toEqual({ nonSaudiDialCode: true, rejected: true });
    });

    await steps.step(`Enter a ${lengths.min}-digit number - the value is accepted (minimum boundary)`, async () => {
      const value = digits(lengths.min, '2');
      expect(await enter(drawer, 'phoneNumber', value)).toEqual({ value, error: '' });
    });

    await steps.step(`Enter a ${lengths.max}-digit number - the value is accepted (maximum boundary)`, async () => {
      const value = digits(lengths.max, '2');
      expect(await enter(drawer, 'phoneNumber', value)).toEqual({ value, error: '' });
    });

    await steps.step(`Enter an ${lengths.over}-digit number - a validation error is shown (above maximum)`, async () => {
      const state = await enter(drawer, 'phoneNumber', digits(lengths.over, '2'));
      expect(state.error, `the box holds ${state.value.length} digits`).not.toBe('');
    });
  });
});
