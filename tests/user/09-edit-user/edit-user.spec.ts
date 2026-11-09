import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { UserListPage } from '../../../pages/user/UserListPage';
import type { UserFormDrawer, UserSaveAnswer } from '../../../pages/user/UserFormDrawer';
import { readDialog } from '../../../pages/user/userCommon';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { CASES, JOB_TITLE, PAYER, REQUIRED, UPDATED } from '../../../data/user/editUser.data';
import {
  payerIdByName,
  readUser,
  riyadhDate,
  suiteMobileNumber,
  suiteUserEmail,
  uniqueUserDocumentId,
  userDayText,
  type ProvisionedUser,
} from '../../../utils/UserProvisioning';
import {
  drawerClosed,
  drawerStepShape,
  drawerUser,
  errorsShown,
  jobTitleOffered,
  navigateToUser,
  openEditUser,
  passContact,
  passUserInfo,
  said,
  saved,
  type DrawerStepShape,
} from '../../../utils/user/writerBHelpers';

const NO_ANSWER: UserSaveAnswer = { status: -1, text: '', body: {}, messages: [], errors: [] };

/** "Open Edit on an existing user [and go to step n]" - the Edit User drawer, loaded, on step `n`. */
async function openEditAt(steps: TestSteps, list: UserListPage, user: ProvisionedUser, step: 1 | 2 | 3, text: string): Promise<UserFormDrawer> {
  let drawer!: UserFormDrawer;
  await steps.critical(text, async () => {
    drawer = await openEditUser(list, user);
    expect(await drawer.ensureStep(step), `the Edit User drawer on step ${step}; errors ${await errorsShown(drawer)}`).toBe(step);
  });
  return drawer;
}

/** Next on the current step: whether it moved on, the step showing and a field's error. */
async function tryNext(drawer: UserFormDrawer, field: Parameters<UserFormDrawer['getFieldError']>[0]): Promise<{ advanced: boolean; step: number; error: string }> {
  const advanced = await drawer.next();
  return { advanced, step: await drawer.currentStep(), error: await drawer.getFieldError(field) };
}

/**
 * User story 20415: Edit User - the drawer, its step navigation, the field
 * rules on edit (uniqueness, format, age, names), the Document ID rule, the
 * profile afterwards, a failing save and the Add / Edit parity. Roles and
 * payers are in edit-user-roles.spec.ts, the unsaved-changes guard in
 * edit-user-unsaved.spec.ts, the permission case in edit-access.spec.ts.
 * See data/user/editUser.data.ts for the literal readings.
 */
test.describe('US 20415 - Edit User', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.editDetails.azureId}: should save an edited detail and show it on the user's profile`, async ({ page, steps, userListPage: list, userProfilePage, userIn }) => {
    const user = await userIn('Active');
    const mobile = suiteMobileNumber();
    let drawer!: UserFormDrawer;

    await navigateToUser(steps, list, user);

    await steps.critical(`Select an existing user ("${user.displayNameEn}") and click Edit - the Edit User drawer opens on the User Information step`, async () => {
      drawer = await openEditUser(list, user);
      expect(await drawer.currentStep()).toBe(1);
    });

    await steps.step('Update a field such as the job title - the Job Title field is offered', async () => {
      const { offered } = await jobTitleOffered(drawer, JOB_TITLE);
      expect(offered, 'a Job Title field on User Information / Contact Information').toBe(true);
    });

    await steps.step(`Update the Mobile Number to "${mobile}" (in place of the Job Title) and proceed through Next on each step - each step accepts the change and advances`, async () => {
      await drawer.ensureStep(2);
      await drawer.type('phoneNumber', mobile);
      const advanced = await drawer.next();
      expect({ advanced, step: await drawer.currentStep() }, `errors ${await errorsShown(drawer)}`).toEqual({ advanced: true, step: 3 });
    });

    await steps.step('Submit the final step - the changes are saved and the updated details are shown on the user\'s profile', async () => {
      const answer = await drawer.attemptSave();
      expect(saved(answer), said(answer)).toBe(true);
      expect(answer.messages.join(' | '), 'the confirmation').toMatch(UPDATED);
      await userProfilePage.open(user.id);
      expect((await userProfilePage.readSection('contact'))['Mobile Number'], 'the profile\'s Mobile Number').toBe(mobile);
    });
  });

  test(`TC-${CASES.opensOnFirstStep.azureId}: should open the Edit User drawer on User Information with the three Add User steps and the user's data`, async ({ steps, userListPage: list, userIn }) => {
    const c = CASES.opensOnFirstStep;
    const user = await userIn('Active');
    let drawer!: UserFormDrawer;

    await navigateToUser(steps, list, user);

    await steps.critical(`Select an existing user ("${user.displayNameEn}") and click Edit - the Edit User drawer opens`, async () => {
      drawer = await list.openEditForm(user.id);
      expect(await drawer.getTitle(), 'the drawer title').toMatch(/edit user/i);
    });

    await steps.step(`Inspect the step indicator - three steps are shown: ${c.steps.join(', ')}`, async () => {
      expect(await drawer.getStepLabels()).toEqual([...c.steps]);
    });

    await steps.step('Confirm the active step - the drawer opens positioned on the User Information step, pre-filled with the user\'s existing data', async () => {
      expect({
        step: await drawer.currentStep(),
        first: await drawer.getValue('englishFirstName'),
        last: await drawer.getValue('englishLastName'),
        documentId: await drawer.getValue('documentId'),
        dob: await drawer.getValue('dob'),
      }).toEqual({ step: 1, first: user.record.englishFirstName, last: user.lastName, documentId: user.documentId, dob: userDayText(String(user.record.dob)) });
    });
  });

  test(`TC-${CASES.mandatoryBlocksNext.azureId}: should not advance from User Information while a mandatory field is empty`, async ({ steps, userListPage: list, userIn }) => {
    const user = await userIn('Active');
    await navigateToUser(steps, list, user);
    const drawer = await openEditAt(steps, list, user, 1, 'Select an existing user and click Edit - the Edit User drawer opens on the User Information step');

    await steps.step('Clear a mandatory field (First Name) and click Next - validation errors are shown and the step does not advance', async () => {
      await drawer.type('englishFirstName', '');
      expect(await tryNext(drawer, 'englishFirstName')).toEqual({ advanced: false, step: 1, error: expect.stringMatching(REQUIRED) });
    });

    await steps.step('Restore the mandatory field and click Next - the step validates successfully and advances to Contact Information', async () => {
      await drawer.type('englishFirstName', user.record.englishFirstName);
      expect(await tryNext(drawer, 'englishFirstName'), `errors ${await errorsShown(drawer)}`).toEqual({ advanced: true, step: 2, error: '' });
    });
  });

  test(`TC-${CASES.backFreely.azureId}: should move back through earlier steps with Back and the step headings without losing data`, async ({ steps, userListPage: list, userIn }) => {
    const user = await userIn('Active');
    await navigateToUser(steps, list, user);
    const drawer = await openEditAt(steps, list, user, 3, 'Open Edit on an existing user and advance to the Roles and Privileges step - the step is displayed');

    await steps.step('Click the Back button - the Contact Information step is shown with previously entered data intact', async () => {
      await drawer.back();
      expect({ step: await drawer.currentStep(), email: await drawer.getValue('email'), mobile: await drawer.getValue('phoneNumber') })
        .toEqual({ step: 2, email: user.email, mobile: user.record.phoneNumber });
    });

    await steps.step('Click the User Information step heading directly - the drawer jumps straight to that step without requiring validation', async () => {
      await drawer.goToStep(1);
      expect({ step: await drawer.currentStep(), last: await drawer.getValue('englishLastName'), errors: await drawer.getFieldErrors() })
        .toEqual({ step: 1, last: user.lastName, errors: [] });
    });
  });

  test(`TC-${CASES.duplicateEmail.azureId}: should refuse an e-mail address already used by another user and stay on Contact Information`, async ({ steps, userListPage: list, userIn }) => {
    const other = await userIn('Active');
    const user = await userIn('Active');
    await navigateToUser(steps, list, user);
    const drawer = await openEditAt(steps, list, user, 2, 'Open Edit on a different user and go to Contact Information - the step is displayed');

    await steps.step(`Change the Email Address field to "${other.email}" (used by the suite user "${other.displayNameEn}") and click Next - a uniqueness validation error is shown and the step does not advance`, async () => {
      await drawer.type('email', other.email);
      const outcome = await tryNext(drawer, 'email');
      expect({ advanced: outcome.advanced, step: outcome.step, errorShown: outcome.error !== '' }, `errors ${await errorsShown(drawer)}`).toEqual({ advanced: false, step: 2, errorShown: true });
    });
  });

  test(`TC-${CASES.duplicateDocumentId.azureId}: should refuse a Document ID already used by another user and stay on User Information`, async ({ page, steps, userListPage: list, userIn }) => {
    const c = CASES.duplicateDocumentId;
    const other = await userIn('Active');
    const user = await userIn('Active');
    await navigateToUser(steps, list, user);
    const drawer = await openEditAt(steps, list, user, 1, 'Open Edit on a different user and go to User Information - the step is displayed');

    await steps.step(`Change the Document ID field to "${other.documentId}" (held by the suite user "${other.displayNameEn}") and click Next - a uniqueness validation error is shown and the step does not advance`, async () => {
      await drawer.type('documentId', other.documentId);
      await page.waitForTimeout(800); // the on-blur CheckDocumentIdExists
      expect(await tryNext(drawer, 'documentId'), `errors ${await errorsShown(drawer)}`).toEqual({ advanced: false, step: 1, error: expect.stringMatching(c.error) });
    });
  });

  test(`TC-${CASES.emailFormat.azureId}: should accept only a correctly formatted e-mail address on edit`, async ({ steps, userListPage: list, userIn }) => {
    const c = CASES.emailFormat;
    const user = await userIn('Active');
    const valid = suiteUserEmail();
    await navigateToUser(steps, list, user);
    const drawer = await openEditAt(steps, list, user, 2, 'Open Edit on an existing user and go to Contact Information - the step is displayed');

    await steps.step(`Enter an invalid email value "${c.invalid}" and click Next - a format validation error is shown and the step does not advance`, async () => {
      await drawer.type('email', c.invalid);
      expect(await tryNext(drawer, 'email')).toEqual({ advanced: false, step: 2, error: expect.stringMatching(c.error) });
    });

    await steps.step(`Correct the value to a valid email format ("${valid}") and click Next - the step validates and advances`, async () => {
      await drawer.type('email', valid);
      expect(await tryNext(drawer, 'email'), `errors ${await errorsShown(drawer)}`).toEqual({ advanced: true, step: 3, error: '' });
    });
  });

  for (const bound of ['min', 'max'] as const) {
    const c = bound === 'min' ? CASES.belowMinimumAge : CASES.aboveMaximumAge;
    // min: one day under = born 15 years ago tomorrow, at = 15 years ago today; max: at = EXACTLY 120 years
    // old (born 120 years ago today), one day over = born 120 years ago yesterday (120 years and a day).
    // Until 2026-11-08 "at the maximum" was 121 years ago tomorrow (120 years 364 days) - not "exactly" 120.
    const outside = bound === 'min' ? userDayText(riyadhDate(1, -CASES.belowMinimumAge.minAge)) : userDayText(riyadhDate(-1, -CASES.aboveMaximumAge.maxAge));
    const at = bound === 'min' ? userDayText(riyadhDate(0, -CASES.belowMinimumAge.minAge)) : userDayText(riyadhDate(0, -CASES.aboveMaximumAge.maxAge));
    const word = bound === 'min' ? 'below the minimum' : 'above the maximum';

    test(`TC-${c.azureId}: should refuse a date of birth one day ${word} allowed age and accept the boundary itself`, async ({ steps, userListPage: list, userIn }) => {
      const user = await userIn('Active');
      await navigateToUser(steps, list, user);
      const drawer = await openEditAt(steps, list, user, 1, 'Open Edit on an existing user and go to User Information - the step is displayed');

      await steps.step(`Set the Date of Birth to one day ${word} allowed age (${outside}) and click Next - a validation error is shown and the step does not advance`, async () => {
        await drawer.type('dob', outside);
        const outcome = await tryNext(drawer, 'dob');
        expect({ advanced: outcome.advanced, step: outcome.step, errorShown: outcome.error !== '' }, `the box holds "${await drawer.getValue('dob')}"`).toEqual({ advanced: false, step: 1, errorShown: true });
      });

      await steps.step(`Set the Date of Birth to exactly the ${bound === 'min' ? 'minimum' : 'maximum'} allowed age (${at}) and click Next - the step validates and advances`, async () => {
        await drawer.type('dob', at);
        expect(await tryNext(drawer, 'dob'), `the box holds "${await drawer.getValue('dob')}"; errors ${await errorsShown(drawer)}`).toEqual({ advanced: true, step: 2, error: '' });
      });
    });
  }

  test(`TC-${CASES.nameCharacters.azureId}: should refuse digits and special characters in a name field on edit`, async ({ steps, userListPage: list, userIn }) => {
    const c = CASES.nameCharacters;
    const user = await userIn('Active');
    await navigateToUser(steps, list, user);
    const drawer = await openEditAt(steps, list, user, 1, 'Open Edit on an existing user and go to User Information - the step is displayed');

    await steps.step(`Enter numeric and special characters ("${c.invalid}") into the First Name field and click Next - a validation error is shown and the step does not advance`, async () => {
      await drawer.type('englishFirstName', c.invalid);
      expect(await tryNext(drawer, 'englishFirstName')).toEqual({ advanced: false, step: 1, error: expect.stringMatching(c.error) });
    });

    await steps.step(`Replace the value with a valid name using allowed characters ("${c.valid}") and click Next - the step validates and advances`, async () => {
      // When step 3's invalid name was (wrongly) accepted the drawer is already on step 2 - go back to
      // User Information first so this step tests its own value (full run: a 15 s click timeout instead).
      if ((await drawer.currentStep()) !== 1) await drawer.goToStep(1);
      await drawer.type('englishFirstName', c.valid);
      expect(await tryNext(drawer, 'englishFirstName'), `errors ${await errorsShown(drawer)}`).toEqual({ advanced: true, step: 2, error: '' });
    });
  });

  test(`TC-${CASES.documentIdRule.azureId}: should handle a change of the Document ID consistently with it being the user name`, async ({ page, steps, userListPage: list, userIn }) => {
    const user = await userIn('Active');
    const changed = await uniqueUserDocumentId(page, 'nationalId');
    let behaviour: 'editable' | 'read-only' | 'editable with a confirmation' = 'read-only';
    await navigateToUser(steps, list, user);
    const drawer = await openEditAt(steps, list, user, 1, 'Open Edit on an existing user - the Edit User drawer opens');

    await steps.step('Go to User Information - the Document ID field is displayed with its current value', async () => {
      expect(await drawer.getValue('documentId')).toBe(user.documentId);
    });

    await steps.step(`Attempt to modify the Document ID field (to "${changed}") - the field is editable, read-only, or editable with a confirmation`, async () => {
      const disabled = await drawer.isDisabled('documentId');
      if (!disabled) await drawer.type('documentId', changed);
      const value = await drawer.getValue('documentId');
      const confirmation = (await readDialog(page)).visible;
      behaviour = confirmation ? 'editable with a confirmation' : value === changed ? 'editable' : 'read-only';
      test.info().annotations.push({ type: 'document-id-edit', description: `the Document ID is ${behaviour} in Edit User (AC: "to be confirmed")` });
      expect(value === changed || value === user.documentId, `the box holds "${value}" (disabled: ${disabled})`).toBe(true);
    });

    await steps.step('If editable, change the value and attempt to save - the change is accepted, rejected or requires additional confirmation, consistently with the Document ID being the user name', async () => {
      if (behaviour === 'read-only') {
        expect((await readUser(page, user.id)).userName, 'the user name of a read-only Document ID').toBe(user.documentId);
        return;
      }
      const reached = await drawer.ensureStep(3);
      const answer = reached === 3 ? await drawer.attemptSave() : NO_ANSWER;
      const confirmation = await readDialog(page);
      const record = await readUser(page, user.id);
      const outcome = confirmation.visible ? 'confirmation asked' : saved(answer) ? 'accepted' : 'rejected';
      test.info().annotations.push({ type: 'document-id-edit', description: `saving a changed Document ID: ${outcome} - ${said(answer)}` });
      if (outcome === 'accepted') expect({ userName: record.userName, documentId: changed }, 'an accepted Document ID moves the user name with it').toEqual({ userName: changed, documentId: changed });
      else if (outcome === 'rejected') expect({ userName: record.userName, explained: [...answer.messages, ...answer.errors].length > 0 }, said(answer)).toEqual({ userName: user.documentId, explained: true });
      else expect(confirmation.message, 'the confirmation asked').not.toBe('');
    });
  });

  test(`TC-${CASES.profileReflects.azureId}: should show the edited contact number on the user's profile`, async ({ page, steps, userListPage: list, userProfilePage, userIn }) => {
    const c = CASES.profileReflects;
    const user = await userIn('Active');
    let contact: Record<string, string> = {};
    await navigateToUser(steps, list, user);

    await steps.step(`Edit the user's contact number to "+966${c.mobile}" and save - a success confirmation is shown`, async () => {
      const drawer = await openEditUser(list, user);
      await drawer.ensureStep(2);
      await drawer.type('phoneNumber', c.mobile);
      await drawer.ensureStep(3);
      const answer = await drawer.attemptSave();
      expect(saved(answer), said(answer)).toBe(true);
      expect(answer.messages.join(' | '), 'the confirmation').toMatch(UPDATED);
      expect((await readUser(page, user.id)).phoneNumber, 'the stored mobile number').toBe(c.mobile);
    });

    await steps.step('Open the View Profile page for the same user - the Contact Information section is displayed', async () => {
      await userProfilePage.open(user.id);
      contact = await userProfilePage.readSection('contact');
      expect(Object.keys(contact), 'the Contact Information section').toContain('Mobile Number');
    });

    await steps.step('Compare the contact number shown to the value just saved - the values match exactly', async () => {
      expect(contact['Mobile Number'], 'the profile\'s Mobile Number').toBe(c.mobile);
    });
  });

  test(`TC-${CASES.saveFails.azureId}: should tell the administrator the save failed and keep the user's data when the backend is unavailable`, async ({ page, steps, userListPage: list, userIn }) => {
    const user = await userIn('Active');
    const mobile = suiteMobileNumber();
    let drawer!: UserFormDrawer;
    let answer = NO_ANSWER;
    await navigateToUser(steps, list, user);

    await steps.critical(`Open Edit on an existing user and make a valid change (Mobile Number "${mobile}") - the field shows the new value`, async () => {
      drawer = await openEditUser(list, user);
      await drawer.ensureStep(2);
      await drawer.type('phoneNumber', mobile);
      expect(await drawer.getValue('phoneNumber')).toBe(mobile);
    });

    await steps.step('Submit the final step while the backend is unreachable (UpdateUser answered 500) - the save request fails', async () => {
      await NetworkUtils.failEndpoint(page, 'Users/UpdateUser', 500);
      try {
        await drawer.ensureStep(3);
        answer = await drawer.attemptSave();
      } finally {
        await NetworkUtils.restoreEndpoint(page, 'Users/UpdateUser');
      }
      expect(answer.status, said(answer)).toBeGreaterThanOrEqual(500);
    });

    await steps.step('Observe the response - a clear error message is shown and the user\'s original data remains unchanged', async () => {
      expect({ messageShown: [...answer.messages, ...answer.errors].length > 0, stored: (await readUser(page, user.id)).phoneNumber }, said(answer))
        .toEqual({ messageShown: true, stored: user.record.phoneNumber });
    });
  });

  test(`TC-${CASES.sameAsAdd.azureId}: should give the Edit User drawer the same fields, rules and controls as Add User on all three steps`, async ({
    page,
    steps,
    userListPage: list,
    userIn,
    suiteRole,
    newSuiteUserName,
  }) => {
    const role = await suiteRole({ hasAssignedPayers: true });
    const user = await userIn('Active', { roles: [{ roleId: role.id, payerIds: [await payerIdByName(page, PAYER.first)] }] });
    const added = await drawerUser(page, newSuiteUserName());
    const add: Record<1 | 2 | 3, DrawerStepShape> = { 1: { controls: [], required: [], maxLengths: {} }, 2: { controls: [], required: [], maxLengths: {} }, 3: { controls: [], required: [], maxLengths: {} } };
    let drawer!: UserFormDrawer;
    await navigateToUser(steps, list, user);

    await steps.critical(`Read the Add User drawer's three steps for comparison (step 3 with a "${role.name}" role card; nothing saved) - each step renders`, async () => {
      const adding = await list.openAddForm();
      add[1] = await drawerStepShape(page);
      expect(await passUserInfo(adding, added), `Add step 1 errors ${await errorsShown(adding)}`).toBe(true);
      add[2] = await drawerStepShape(page);
      expect(await passContact(adding, added), `Add step 2 errors ${await errorsShown(adding)}`).toBe(true);
      await adding.addRole(role.name);
      add[3] = await drawerStepShape(page);
      const dialog = await adding.close();
      if (dialog) await adding.discardChanges();
      expect(await drawerClosed(adding), 'the Add User drawer closed (nothing saved)').toBe(true);
      expect([add[1].controls.length, add[2].controls.length, add[3].controls.length].every((n) => n > 0), JSON.stringify(add)).toBe(true);
    });

    await steps.step('Open Edit on an existing user and review the User Information step - all fields match the same mandatory/optional status, control type, format and length rules as on Add User', async () => {
      drawer = await openEditUser(list, user);
      expect(await drawerStepShape(page), 'Edit step 1 against Add step 1').toEqual(add[1]);
    });

    await steps.step('Proceed to Contact Information - the same field rules and controls as Add User are present', async () => {
      expect(await drawer.ensureStep(2), `errors ${await errorsShown(drawer)}`).toBe(2);
      expect(await drawerStepShape(page), 'Edit step 2 against Add step 2').toEqual(add[2]);
    });

    await steps.step('Proceed to Roles and Privileges - the same Add New User Roles, Role, Payers and Delete Role controls as on Add User are present', async () => {
      expect(await drawer.ensureStep(3), `errors ${await errorsShown(drawer)}`).toBe(3);
      expect(await drawerStepShape(page), 'Edit step 3 against Add step 3').toEqual(add[3]);
    });
  });
});

