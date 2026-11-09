import { test, expect } from '../../../fixtures';
import type { SuiteSession } from '../../../fixtures/userModule.fixture';
import { AppRoutes } from '../../../constants/AppRoutes';
import { CASES, REQUIRED_MESSAGE } from '../../../data/user/viewAndEditMyProfile.data';
import { LanguageSwitcher } from '../../../pages/components/LanguageSwitcher';
import type { MyProfileField } from '../../../constants/user/userIds';
import { readDialog } from '../../../pages/user/userCommon';
import { readUser, type UserRecord } from '../../../utils/UserProvisioning';
import { changedProfileKeys, chooseAndSave, editAndSave, isCancelShown, tryStartEdit } from '../../../utils/user/writerFHelpers';

/** "Navigate to the User Management module": the suite user's Users Administration list opens. */
async function openModule(s: SuiteSession): Promise<boolean> {
  await s.users.openTable();
  expect(new URL(s.page.url()).pathname, 'the User Management module').toBe(AppRoutes.usersAdministration);
  return true;
}

/** User menu > My Profile, every section expanded. */
async function openProfile(s: SuiteSession): Promise<void> {
  await s.menu.openMyProfile();
  await s.myProfile.waitForLoaded();
  await s.myProfile.expandAll();
}

/** A refused Save: nothing reached UpdateUserProfile (or it was refused) and an error shows. */
const refused = (status: number): boolean => status === -1 || status >= 300;

/**
 * Types an invalid name in the given UI language, presses Save and returns
 * the field's errors; the edit is cancelled afterwards.
 */
async function nameErrorsIn(s: SuiteSession, language: 'en' | 'ar', field: MyProfileField, value: string): Promise<{ status: number; errors: string[] }> {
  await new LanguageSwitcher(s.page).switchTo(language);
  await s.myProfile.waitForLoaded();
  await s.myProfile.expandAll();
  const save = await editAndSave(s.myProfile, field, value);
  if (await s.myProfile.isEditing(field)) await s.myProfile.cancelField(field);
  return { status: save.status, errors: save.errors };
}

/**
 * User story 20423: View and Edit My Profile - the in-place edits. Every case
 * runs in a SUITE user's own window (`suiteSession`); the stored user is read
 * back by the admin (GetUser). See the data file for the literal readings.
 */
test.describe('US 20423 - View and Edit My Profile', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.editEnglishName.azureId}: should show the new English first name at once with no confirmation when it is saved in place`, async ({ page, steps, suiteSession }) => {
    const s = await suiteSession();

    await steps.critical('Navigate to the User Management module - the module is accessible', async () => {
      expect(await openModule(s), 'the User Management module').toBe(true);
    });

    await steps.critical('Select the pencil icon next to English First Name - the field becomes editable with Save and Cancel options', async () => {
      await openProfile(s);
      await s.myProfile.startEdit('englishFirstName');
      expect({ save: await s.myProfile.isEditing('englishFirstName'), cancel: await isCancelShown(s.page, 'englishFirstName') }, 'edit mode').toEqual({ save: true, cancel: true });
    });

    await steps.step('Enter a new valid English name and select Save - the new value is displayed immediately with no confirmation message', async () => {
      await s.myProfile.typeField('englishFirstName', CASES.editEnglishName.newFirstName);
      const save = await s.myProfile.saveField('englishFirstName');
      expect({ status: save.status, shown: save.shown, messages: save.messages }, 'the Save').toEqual({ status: 200, shown: CASES.editEnglishName.newFirstName, messages: [] });
      expect((await readUser(page, s.user.id)).englishFirstName, 'the stored English first name').toBe(CASES.editEnglishName.newFirstName);
    });
  });

  for (const c of [
    { data: CASES.englishLettersOnly, field: 'englishFirstName' as const, stored: 'englishFirstName' as const, title: 'reject Arabic letters in an English name with the bilingual "English letters only." message' },
    { data: CASES.arabicLettersOnly, field: 'arabicFirstName' as const, stored: 'arabicFirstName' as const, title: 'reject English letters in an Arabic name with the bilingual "Arabic letters only." message' },
  ]) {
    test(`TC-${c.data.azureId}: should ${c.title} when the name is saved`, async ({ page, steps, suiteSession }) => {
      const s = await suiteSession();
      const before = await readUser(page, s.user.id);

      await steps.critical('Navigate to the User Management module - the module is accessible', async () => {
        expect(await openModule(s), 'the User Management module').toBe(true);
      });

      await steps.step(`Select the pencil icon next to the name field, enter the other alphabet and select Save - the message "${c.data.messageEn}" / "${c.data.messageAr}" is shown and the value is not saved`, async () => {
        await openProfile(s);
        const english = await nameErrorsIn(s, 'en', c.field, c.data.value);
        const arabic = await nameErrorsIn(s, 'ar', c.field, c.data.value);
        await new LanguageSwitcher(s.page).switchTo('en');
        expect({
          englishRefused: refused(english.status),
          englishMessage: english.errors.includes(c.data.messageEn),
          arabicRefused: refused(arabic.status),
          arabicMessage: arabic.errors.includes(c.data.messageAr),
        }, `English UI errors ${JSON.stringify(english.errors)}, Arabic UI errors ${JSON.stringify(arabic.errors)}`).toEqual({
          englishRefused: true, englishMessage: true, arabicRefused: true, arabicMessage: true,
        });
        expect((await readUser(page, s.user.id))[c.stored], 'the stored name').toBe(before[c.stored]);
      });
    });
  }

  test(`TC-${CASES.nameNotEmpty.azureId}: should refuse to save English First Name empty when the field is cleared`, async ({ page, steps, suiteSession }) => {
    const s = await suiteSession();
    const before = await readUser(page, s.user.id);

    await steps.critical('Navigate to the User Management module - the module is accessible', async () => {
      expect(await openModule(s), 'the User Management module').toBe(true);
    });

    await steps.step('Select the pencil icon next to English First Name, clear the field completely and select Save - a required-field error is shown and the field is not saved as empty', async () => {
      await openProfile(s);
      const save = await editAndSave(s.myProfile, 'englishFirstName', '');
      expect(refused(save.status), `the Save of an empty name (answer ${save.status})`).toBe(true);
      expect(save.errors.join(' | '), 'the field error').toMatch(REQUIRED_MESSAGE);
      expect((await readUser(page, s.user.id)).englishFirstName, 'the stored English first name').toBe(before.englishFirstName);
    });
  });

  test(`TC-${CASES.mobileLength.azureId}: should accept a 5 and a 15 digit mobile number and refuse 4 and 16 digits when Mobile Number is saved`, async ({ page, steps, suiteSession }) => {
    const s = await suiteSession();
    const d = CASES.mobileLength;
    const storedPhone = async (): Promise<string> => (await readUser(page, s.user.id)).phoneNumber;

    await steps.critical('Navigate to the User Management module - the module is accessible', async () => {
      expect(await openModule(s), 'the User Management module').toBe(true);
      await openProfile(s);
    });

    await steps.step('Enter a mobile number of exactly 5 digits and select Save - the value is accepted and saved', async () => {
      const save = await editAndSave(s.myProfile, 'phoneNumber', d.fiveDigits);
      expect({ status: save.status, shown: save.shown, errors: save.errors }, '5 digits').toEqual({ status: 200, shown: d.fiveDigits, errors: [] });
      expect(await storedPhone(), 'the stored mobile number').toBe(d.fiveDigits);
    });

    await steps.step('Enter a mobile number of 4 digits and select Save - a validation error is shown and the value is not saved', async () => {
      const kept = await storedPhone();
      const save = await editAndSave(s.myProfile, 'phoneNumber', d.fourDigits);
      expect({ refused: refused(save.status), error: save.errors.length > 0 }, `4 digits (answer ${save.status})`).toEqual({ refused: true, error: true });
      expect(await storedPhone(), 'the stored mobile number').toBe(kept);
    });

    await steps.step('Enter a mobile number of exactly 15 digits and select Save - the value is accepted and saved', async () => {
      const save = await editAndSave(s.myProfile, 'phoneNumber', d.fifteenDigits);
      expect({ status: save.status, shown: save.shown, errors: save.errors }, '15 digits').toEqual({ status: 200, shown: d.fifteenDigits, errors: [] });
      expect(await storedPhone(), 'the stored mobile number').toBe(d.fifteenDigits);
    });

    await steps.step('Enter a mobile number of 16 digits and select Save - a validation error is shown and the value is not saved', async () => {
      const kept = await storedPhone();
      const save = await editAndSave(s.myProfile, 'phoneNumber', d.sixteenDigits);
      expect({ refused: refused(save.status), error: save.errors.length > 0 }, `16 digits (answer ${save.status})`).toEqual({ refused: true, error: true });
      expect(await storedPhone(), 'the stored mobile number').toBe(kept);
    });
  });

  test(`TC-${CASES.mobileInvalid.azureId}: should refuse an empty and a non-digit mobile number with the documented messages when Mobile Number is saved`, async ({ page, steps, suiteSession }) => {
    const s = await suiteSession();
    const d = CASES.mobileInvalid;
    const before = await readUser(page, s.user.id);

    await steps.critical('Navigate to the User Management module - the module is accessible', async () => {
      expect(await openModule(s), 'the User Management module').toBe(true);
      await openProfile(s);
    });

    await steps.step(`Clear the Mobile Number field and select Save - "${d.requiredMessage}" is shown and the value is not saved`, async () => {
      const save = await editAndSave(s.myProfile, 'phoneNumber', '');
      expect({ refused: refused(save.status), message: save.errors.includes(d.requiredMessage) }, `errors ${JSON.stringify(save.errors)} (answer ${save.status})`).toEqual({ refused: true, message: true });
      expect((await readUser(page, s.user.id)).phoneNumber, 'the stored mobile number').toBe(before.phoneNumber);
    });

    await steps.step(`Enter non-digit characters into Mobile Number and select Save - "${d.formatMessage}" is shown and the value is not saved`, async () => {
      const save = await editAndSave(s.myProfile, 'phoneNumber', d.nonDigits);
      expect({ refused: refused(save.status), message: save.errors.includes(d.formatMessage) }, `errors ${JSON.stringify(save.errors)} (answer ${save.status})`).toEqual({ refused: true, message: true });
      expect((await readUser(page, s.user.id)).phoneNumber, 'the stored mobile number').toBe(before.phoneNumber);
    });
  });

  test(`TC-${CASES.mobileHintMismatch.azureId}: should save an 11 digit Saudi mobile number although the hint reads "Enter 5 to 10 digits." when the dial code is +966`, async ({ page, steps, suiteSession }) => {
    const s = await suiteSession();
    const d = CASES.mobileHintMismatch;

    await steps.critical('Navigate to the User Management module - the module is accessible', async () => {
      expect(await openModule(s), 'the User Management module').toBe(true);
      await openProfile(s);
      expect(await s.myProfile.readField('countryDialCode'), 'the precondition dial code').toContain('+966');
    });

    await steps.step(`Enter an invalid mobile number under +966 and select Save - the error message displayed reads "${d.formatMessage}"`, async () => {
      const save = await editAndSave(s.myProfile, 'phoneNumber', d.invalid);
      expect(save.errors, `errors (answer ${save.status})`).toContain(d.formatMessage);
    });

    await steps.step('Enter a valid mobile number of 11-15 digits under +966 and select Save - the value is accepted and saved despite the message wording', async () => {
      const save = await editAndSave(s.myProfile, 'phoneNumber', d.elevenDigits);
      expect({ status: save.status, shown: save.shown }, '11 digits').toEqual({ status: 200, shown: d.elevenDigits });
      expect((await readUser(page, s.user.id)).phoneNumber, 'the stored mobile number').toBe(d.elevenDigits);
    });
  });

  test(`TC-${CASES.cancelEdit.azureId}: should restore the stored English second name and leave edit mode when an unsaved edit is cancelled`, async ({ page, steps, suiteSession }) => {
    const d = CASES.cancelEdit;
    const s = await suiteSession({ user: { englishSecondName: d.original } });

    await steps.critical('Navigate to the User Management module - the module is accessible', async () => {
      expect(await openModule(s), 'the User Management module').toBe(true);
      await openProfile(s);
      expect(await s.myProfile.readField('englishSecondName'), 'the stored English second name').toBe(d.original);
    });

    await steps.critical('Select the pencil icon on English Second Name and change its value without saving - the field shows the new unsaved value', async () => {
      await s.myProfile.startEdit('englishSecondName');
      await s.myProfile.typeField('englishSecondName', d.unsaved);
      expect(await s.myProfile.readInput('englishSecondName'), 'the unsaved value').toBe(d.unsaved);
    });

    await steps.step('Select Cancel - the field reverts to the previously stored value and exits edit mode', async () => {
      await s.myProfile.cancelField('englishSecondName');
      expect({ editing: await s.myProfile.isEditing('englishSecondName'), shown: await s.myProfile.readField('englishSecondName') }, 'after Cancel').toEqual({ editing: false, shown: d.original });
      expect((await readUser(page, s.user.id)).englishSecondName, 'the stored English second name').toBe(d.original);
    });
  });

  test(`TC-${CASES.dropdownFields.azureId}: should save Country Dial Code, Preferred Language and Preferred Contact Method each on its own when they are edited one after another`, async ({ page, steps, suiteSession }) => {
    const s = await suiteSession();
    const d = CASES.dropdownFields;
    let before: UserRecord = await readUser(page, s.user.id);
    const onlyChanged = async (key: string): Promise<void> => {
      const after = await readUser(page, s.user.id);
      expect(changedProfileKeys(before, after), 'stored profile fields that changed').toEqual([key]);
      before = after;
    };

    await steps.critical('Navigate to the User Management module - the module is accessible', async () => {
      expect(await openModule(s), 'the User Management module').toBe(true);
      await openProfile(s);
    });

    await steps.step('Edit Country Dial Code via the pencil icon, select a new value from the maintained list and Save - the new dial code is saved and displayed', async () => {
      const { save, chosen } = await chooseAndSave(s.myProfile, 'countryDialCode', d.dialCode);
      expect({ status: save.status, shown: save.shown }, 'the dial code Save').toEqual({ status: 200, shown: chosen });
      await onlyChanged('countryDialCodeId');
    });

    await steps.step('Edit Preferred Language, select Arabic or English and Save - the new language is saved and displayed', async () => {
      const { save, chosen } = await chooseAndSave(s.myProfile, 'preferredLanguage', d.language);
      expect({ status: save.status, shown: save.shown }, 'the language Save').toEqual({ status: 200, shown: chosen });
      await onlyChanged('preferredLanguageId');
    });

    await steps.step('Edit Preferred Contact Method, select Email, SMS or Both and Save - the new contact method is saved and displayed', async () => {
      const { save, chosen } = await chooseAndSave(s.myProfile, 'preferredContactMethod', d.contactMethod);
      expect({ status: save.status, shown: save.shown }, 'the contact method Save').toEqual({ status: 200, shown: chosen });
      await onlyChanged('preferredContactMethodId');
    });
  });

  test(`TC-${CASES.oneFieldAtATime.azureId}: should not let a second field enter edit mode when another field's edit is still open`, async ({ steps, suiteSession }) => {
    const s = await suiteSession();

    await steps.critical('Navigate to the User Management module - the module is accessible', async () => {
      expect(await openModule(s), 'the User Management module').toBe(true);
      await openProfile(s);
    });

    await steps.critical('Select the pencil icon on English First Name to enter edit mode - the field becomes editable', async () => {
      await s.myProfile.startEdit('englishFirstName');
      expect(await s.myProfile.isEditing('englishFirstName'), 'English First Name in edit mode').toBe(true);
    });

    await steps.step('Without saving or cancelling, select the pencil icon on Mobile Number - the system blocks the second edit or requires resolving the first edit first', async () => {
      const clicked = await tryStartEdit(s.page, 'phoneNumber');
      const state = {
        pencilClicked: clicked,
        firstStillEditing: await s.myProfile.isEditing('englishFirstName'),
        secondEditing: await s.myProfile.isEditing('phoneNumber'),
        prompt: (await readDialog(s.page)).visible,
      };
      const blocked = state.firstStillEditing && !state.secondEditing;
      expect(blocked || state.prompt, `the second edit was neither blocked nor gated by a prompt: ${JSON.stringify(state)}`).toBe(true);
      if (await s.myProfile.isEditing('englishFirstName')) await s.myProfile.cancelField('englishFirstName');
    });
  });
});
