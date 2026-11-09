import { test, expect } from '../../../fixtures';
import type { UserFormDrawer, UserSaveAnswer } from '../../../pages/user/UserFormDrawer';
import { CASES } from '../../../data/user/createUser.data';
import {
  DRAWER_LABEL,
  digits,
  drawerUser,
  errorsShown,
  literalOrFreeDocumentId,
  navigateToUsers,
  passContact,
  refused,
  said,
} from '../../../utils/user/writerBHelpers';

const LIST_SHOWN = 'the user list is displayed';

/** The Document ID box after an entry: its value and its error. */
async function documentIdState(drawer: UserFormDrawer): Promise<{ value: string; error: string }> {
  await new Promise((resolve) => setTimeout(resolve, 800)); // the on-blur CheckDocumentIdExists
  return { value: await drawer.getValue('documentId'), error: await drawer.getFieldError('documentId') };
}

/** Types a Document ID and reads its error. */
async function enterDocumentId(drawer: UserFormDrawer, value: string): Promise<{ value: string; error: string }> {
  await drawer.type('documentId', value);
  return documentIdState(drawer);
}

/**
 * User story 20411: Create User - Nationality / Identity Type pairing and the
 * Document ID rules (format per identity type, uniqueness, length). See
 * data/user/createUser.data.ts for the literal readings.
 */
test.describe('US 20411 - Create User', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.saudiNationalId.azureId}: should offer only National ID and accept a well-formed one when the nationality is Saudi`, async ({ page, steps, userListPage: list }) => {
    const documentId = await literalOrFreeDocumentId(page, CASES.saudiNationalId.documentId);
    let drawer!: UserFormDrawer;

    await navigateToUsers(steps, list, LIST_SHOWN);
    await steps.critical('Click "Add User" - the User Information step is displayed', async () => {
      drawer = await list.openAddForm();
      expect(await drawer.currentStep()).toBe(1);
    });

    await steps.step('Set Nationality to "Saudi Arabia" - the field accepts the selection', async () => {
      await drawer.choose('nationality', DRAWER_LABEL.saudi);
      expect(await drawer.readSelect('nationality')).toContain('Saudi');
    });

    await steps.step('Open the Identity Type dropdown - only "National ID" is available / suggested for selection', async () => {
      expect(await drawer.getOptions('identityType'), 'the Identity Type options').toEqual([DRAWER_LABEL.nationalId]);
    });

    await steps.step(`Select National ID and enter a valid National ID Document ID ("${documentId}"), then leave the field - the value is accepted with no validation error`, async () => {
      await drawer.choose('identityType', DRAWER_LABEL.nationalId);
      expect(await enterDocumentId(drawer, documentId)).toEqual({ value: documentId, error: '' });
    });
  });

  test(`TC-${CASES.nationalIdValid.azureId}: should accept a National ID of 10 digits starting with 1`, async ({ page, steps, userListPage: list }) => {
    const documentId = await literalOrFreeDocumentId(page, CASES.nationalIdValid.documentId);
    let drawer!: UserFormDrawer;

    await navigateToUsers(steps, list, LIST_SHOWN);
    await steps.critical('Click "Add User" (Nationality Saudi Arabia) - the User Information step is displayed', async () => {
      drawer = await list.openAddForm();
      await drawer.choose('nationality', DRAWER_LABEL.saudi);
      expect(await drawer.currentStep()).toBe(1);
    });

    await steps.step(`Select Identity Type = National ID and enter Document ID "${documentId}" - the field accepts the 10-digit value starting with 1`, async () => {
      await drawer.choose('identityType', DRAWER_LABEL.nationalId);
      await drawer.type('documentId', documentId);
      expect(await drawer.getValue('documentId')).toBe(documentId);
    });

    await steps.step('Move focus away from the field - no validation error is shown', async () => {
      expect((await documentIdState(drawer)).error, 'the Document ID error').toBe('');
    });
  });

  test(`TC-${CASES.nonSaudiNationalId.azureId}: should not let a non-Saudi nationality be registered with a National ID`, async ({ steps, userListPage: list }) => {
    const c = CASES.nonSaudiNationalId;
    let drawer!: UserFormDrawer;

    await navigateToUsers(steps, list, LIST_SHOWN);
    await steps.critical('Click "Add User" - the User Information step is displayed', async () => {
      drawer = await list.openAddForm();
      expect(await drawer.currentStep()).toBe(1);
    });

    await steps.step(`Set Nationality to "${c.nationality}" (non-Saudi) - the field accepts the selection`, async () => {
      const options = await drawer.getOptions('nationality');
      const literal = options.find((o) => new RegExp(c.nationality, 'i').test(o));
      await drawer.choose('nationality', literal ?? DRAWER_LABEL.emirati);
      expect(literal, `Nationality should offer "${c.nationality}" - it offers ${JSON.stringify(options)} (the case goes on with ${DRAWER_LABEL.emirati})`).toBeDefined();
    });

    await steps.step('Attempt to select Identity Type "National ID" and leave the field - the combination is rejected or the option is unavailable, showing a mismatch message', async () => {
      const options = await drawer.getOptions('identityType');
      let message = '';
      if (options.includes(DRAWER_LABEL.nationalId)) {
        await drawer.choose('identityType', DRAWER_LABEL.nationalId);
        await drawer.type('documentId', digits(10, '1'));
        message = [await drawer.getFieldError('identityType'), await drawer.getFieldError('documentId'), await drawer.getFieldError('nationality')].filter(Boolean).join(' | ');
      }
      expect({ nationalIdOffered: options.includes(DRAWER_LABEL.nationalId), message }, `Identity Type options ${JSON.stringify(options)}`)
        .toEqual(options.includes(DRAWER_LABEL.nationalId) ? { nationalIdOffered: true, message: expect.stringMatching(/.+/) } : { nationalIdOffered: false, message: '' });
    });
  });

  test(`TC-${CASES.nationalIdFormat.azureId}: should reject a National ID that does not start with 1`, async ({ steps, userListPage: list }) => {
    const c = CASES.nationalIdFormat;
    let drawer!: UserFormDrawer;

    await navigateToUsers(steps, list, LIST_SHOWN);
    await steps.critical('Click "Add User" (Nationality Saudi Arabia) - the User Information step is displayed', async () => {
      drawer = await list.openAddForm();
      await drawer.choose('nationality', DRAWER_LABEL.saudi);
      expect(await drawer.currentStep()).toBe(1);
    });

    await steps.step(`Select Identity Type = National ID and enter Document ID "${c.documentId}" (starts with 2, not 1) - the field accepts the input`, async () => {
      await drawer.choose('identityType', DRAWER_LABEL.nationalId);
      await drawer.type('documentId', c.documentId);
      expect(await drawer.getValue('documentId')).toBe(c.documentId);
    });

    await steps.step('Move focus away from the field - a validation error indicating an invalid National ID format is shown', async () => {
      expect((await documentIdState(drawer)).error, 'the Document ID error').toMatch(c.error);
    });
  });

  test(`TC-${CASES.gccLength.azureId}: should accept a GCC ID only between 8 and 15 digits`, async ({ steps, userListPage: list }) => {
    const c = CASES.gccLength;
    let drawer!: UserFormDrawer;

    await navigateToUsers(steps, list, LIST_SHOWN);
    await steps.critical(`Click "Add User" (Nationality ${DRAWER_LABEL.emirati}, Identity Type GCC ID) - the User Information step is displayed`, async () => {
      drawer = await list.openAddForm();
      await drawer.choose('nationality', DRAWER_LABEL.emirati);
      await drawer.choose('identityType', DRAWER_LABEL.gccId);
      expect(await drawer.readSelect('identityType')).toContain(DRAWER_LABEL.gccId);
    });

    await steps.step('Enter a 7-digit Document ID and leave the field - a format validation error is shown (below minimum boundary)', async () => {
      expect((await enterDocumentId(drawer, digits(7, '9'))).error).toMatch(c.error);
    });

    await steps.step('Enter an 8-digit Document ID and leave the field - the value is accepted (minimum boundary)', async () => {
      const value = digits(8, '9');
      expect(await enterDocumentId(drawer, value)).toEqual({ value, error: '' });
    });

    await steps.step('Enter a 15-digit Document ID and leave the field - the value is accepted (maximum boundary)', async () => {
      const value = digits(15, '9');
      expect(await enterDocumentId(drawer, value)).toEqual({ value, error: '' });
    });

    await steps.step('Enter a 16-digit Document ID and leave the field - a format validation error is shown (above maximum boundary)', async () => {
      expect((await enterDocumentId(drawer, digits(16, '9'))).error).toMatch(c.error);
    });
  });

  test(`TC-${CASES.specialPrefixes.azureId}: should enforce the Document ID prefix of the Boarder, Visitor, Pilgrim and Company identity types`, async ({ steps, userListPage: list }) => {
    let drawer!: UserFormDrawer;

    await navigateToUsers(steps, list, LIST_SHOWN);
    await steps.critical(`Click "Add User" (Nationality ${DRAWER_LABEL.emirati}) - the User Information step is displayed`, async () => {
      drawer = await list.openAddForm();
      await drawer.choose('nationality', DRAWER_LABEL.emirati);
      expect(await drawer.readSelect('nationality')).toContain('Emirati');
    });

    for (const t of CASES.specialPrefixes.types) {
      await steps.step(`Select Identity Type = ${t.name} and enter a 10-digit Document ID starting with ${t.valid.map((v) => v[0]).join(' / ')} - the value is accepted; a value starting with ${t.invalid[0]} is rejected`, async () => {
        const options = await drawer.getOptions('identityType');
        const label = options.find((o) => t.match.test(o));
        expect(label, `Identity Type should offer "${t.name}" - it offers ${JSON.stringify(options)}`).toBeDefined();
        await drawer.choose('identityType', label as string);
        const valid: string[] = [];
        for (const v of t.valid) valid.push((await enterDocumentId(drawer, v)).error);
        const invalid = (await enterDocumentId(drawer, t.invalid)).error;
        expect({ validErrors: valid, invalidRejected: invalid !== '' }).toEqual({ validErrors: t.valid.map(() => ''), invalidRejected: true });
      });
    }
  });

  test(`TC-${CASES.duplicateDocumentId.azureId}: should block a new user whose Document ID already belongs to another user`, async ({
    page,
    steps,
    userListPage: list,
    userIn,
    suiteRole,
    newSuiteUserName,
    discardUserEmail,
  }) => {
    const c = CASES.duplicateDocumentId;
    const existing = await userIn('Active');
    const role = await suiteRole();
    const name = newSuiteUserName();
    discardUserEmail(name.email);
    const user = await drawerUser(page, name, { info: { documentId: existing.documentId } });
    const shown: string[] = [];
    let drawer!: UserFormDrawer;

    await navigateToUsers(steps, list, LIST_SHOWN);
    await steps.critical('Click "Add User" - the User Information step is displayed', async () => {
      drawer = await list.openAddForm();
      expect(await drawer.currentStep()).toBe(1);
    });

    await steps.step(`Enter Document ID "${existing.documentId}" (already registered to the suite user "${existing.displayNameEn}") and complete the remaining mandatory fields - the fields accept the input`, async () => {
      await drawer.fillUserInfo(user.info);
      shown.push(await drawer.getFieldError('documentId'));
      expect({ documentId: await drawer.getValue('documentId'), last: await drawer.getValue('englishLastName') }).toEqual({ documentId: existing.documentId, last: name.lastName });
    });

    await steps.step('Attempt to proceed / save - the system blocks the action', async () => {
      let answer: UserSaveAnswer | null = null;
      const moved = await drawer.next();
      shown.push(...(await drawer.getFieldErrors()));
      if (moved && (await passContact(drawer, user))) {
        await drawer.addRole(role.name);
        answer = await drawer.attemptSave();
        shown.push(...answer.messages, ...answer.errors);
      }
      expect(!moved || (answer !== null && refused(answer)), `Next moved on: ${moved}; ${answer ? said(answer) : 'not saved'}`).toBe(true);
    });

    await steps.step(`Observe the validation message - "${c.message}" is displayed`, async () => {
      expect(shown.join(' | '), 'the messages shown').toContain(c.message);
    });
  });

  test(`TC-${CASES.documentIdLength.azureId}: should cap the Document ID at 50 characters`, async ({ steps, userListPage: list }) => {
    const c = CASES.documentIdLength;
    const fifty = `QA${'A1'.repeat(24)}`;
    const fiftyOne = `${fifty}B`;
    let drawer!: UserFormDrawer;

    await navigateToUsers(steps, list, LIST_SHOWN);
    await steps.critical(`Click "Add User" (Nationality ${DRAWER_LABEL.emirati}, Identity Type Passport) - the User Information step is displayed`, async () => {
      drawer = await list.openAddForm();
      await drawer.choose('nationality', DRAWER_LABEL.emirati);
      await drawer.choose('identityType', DRAWER_LABEL.passport);
      expect(await drawer.readSelect('identityType')).toContain(DRAWER_LABEL.passport);
    });

    await steps.step(`Enter a Document ID of exactly ${c.limit} alphanumeric characters - the value is accepted`, async () => {
      expect(await enterDocumentId(drawer, fifty)).toEqual({ value: fifty, error: '' });
    });

    await steps.step(`Clear the field and enter ${c.limit + 1} alphanumeric characters - the field prevents entry beyond ${c.limit} characters or shows a validation error`, async () => {
      const state = await enterDocumentId(drawer, fiftyOne);
      expect(state.value.length <= c.limit || state.error !== '', `the box holds ${state.value.length} characters, error "${state.error}"; maxlength ${await drawer.getMaxLength('documentId')}; ${await errorsShown(drawer)}`).toBe(true);
    });
  });
});
