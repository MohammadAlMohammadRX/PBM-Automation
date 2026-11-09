import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { MemberManagementPage } from '../../../pages/member/MemberManagementPage';
import type { MemberFormDrawer, MemberSaveAnswer } from '../../../pages/member/MemberFormDrawer';
import { MEMBER_FORM, type MemberFormField } from '../../../constants/member/memberIds';
import { CASES, EMAIL_INVALID, HIJRI_INVALID, REQUIRED, UPDATED } from '../../../data/member/editMember.data';
import { memberDayText, readMember, suiteMemberEmail, toHijri, type ProvisionedMember } from '../../../utils/MemberProvisioning';
import {
  ageToday,
  editableValues,
  longEnglishName,
  said,
  saved,
  submitWizard,
  validWizardData,
  visibleLabels,
  watchScriptDialogs,
} from '../../../utils/member/writerBHelpers';

const NAVIGATE = 'Navigate to the Member Management module - the Member Management list view loads';

/** "Navigate" (the member listed) + "Open the Edit form for a specific member record": the Edit Member drawer, loaded. */
async function openEdit(steps: TestSteps, list: MemberManagementPage, member: ProvisionedMember, expected = 'the Member Information edit form displays the record\'s current values'): Promise<MemberFormDrawer> {
  let drawer!: MemberFormDrawer;
  await steps.critical(NAVIGATE, async () => {
    await list.openTable();
    expect(await list.isListed(member.displayNameEn), `"${member.displayNameEn}" in the list`).toBe(true);
  });
  await steps.critical(`Open the Edit form for a specific member record - ${expected}`, async () => {
    drawer = await list.openEditForm(member.displayNameEn);
    expect(await drawer.getTitle(), 'the drawer title').toMatch(/edit member/i);
    expect({ lastName: await drawer.getValue('englishLastName'), documentId: await drawer.getValue('documentId') }).toEqual({ lastName: member.lastName, documentId: member.documentId });
  });
  return drawer;
}

/** Whether a save was refused (on screen or by the server). */
const refused = (answer: MemberSaveAnswer): boolean => answer.status === -1 || answer.status >= 400;

/** The fields of each wizard step (contacts on step 4 are compared by label). */
const FIELDS_BY_STEP: Record<1 | 2 | 3, MemberFormField[]> = {
  1: Object.keys(MEMBER_FORM.patient) as MemberFormField[],
  2: Object.keys(MEMBER_FORM.nonNational) as MemberFormField[],
  3: Object.keys(MEMBER_FORM.address) as MemberFormField[],
};

/**
 * User story 14382: Edit Member. Edit opens the Add wizard in edit mode
 * ("Edit Member") loaded with the record; Save sends UpdateMember and applies at
 * once; invalid data is refused on screen (the step's Next) or by the server and
 * the record keeps its values. Every member is the suite's own (fixture
 * `memberIn`). 19872 (no edit right) is in edit-access.spec.ts.
 */
test.describe('US 14382 - Edit Member', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.opensEditForm.azureId}: should open the edit form pre-populated with the member's data when Edit is selected on the record`, async ({
    memberIn,
    memberManagementPage: list,
    steps,
  }) => {
    const member = await memberIn('Active');

    await steps.critical('Navigate to the Member Management module - the Member Management list view loads showing existing member records', async () => {
      await list.openTable();
      expect(await list.countRows(), 'existing member records').toBeGreaterThan(0);
    });

    await steps.step('Locate a specific member record in the view list - the record row is visible with an Edit action available', async () => {
      expect(await list.isListed(member.displayNameEn), `"${member.displayNameEn}" in the list`).toBe(true);
      expect((await list.getActionState(member.displayNameEn, 'edit')).availability, 'Edit on the row').toBe('available');
    });

    await steps.step('Click the "Edit" button next to that record - the system redirects to the Member Information edit form pre-populated with that member\'s data', async () => {
      const drawer = await list.openEditForm(member.displayNameEn);
      const step1 = {
        title: await drawer.getTitle(),
        firstName: await drawer.getValue('englishFirstName'),
        lastName: await drawer.getValue('englishLastName'),
        documentId: await drawer.getValue('documentId'),
        nationality: await drawer.readSelect('nationality'),
        dateOfBirth: await drawer.getValue('dateOfBirth'),
      };
      await drawer.ensureStep(2);
      const step2 = { mobileNumber: await drawer.getValue('mobileNumber'), email: await drawer.getValue('email') };
      expect({ ...step1, ...step2 }, 'the edit form values').toEqual({
        title: expect.stringMatching(/edit member/i),
        firstName: 'QA',
        lastName: member.lastName,
        documentId: member.documentId,
        nationality: expect.stringContaining('Saudi'),
        dateOfBirth: memberDayText(member.record.dateOfBirth as string),
        mobileNumber: member.mobileNumber,
        email: member.email,
      });
      await drawer.close(true);
    });
  });

  test(`TC-${CASES.validChanges.azureId}: should save valid changes to a member's mobile number and occupation`, async ({ page, memberIn, memberManagementPage: list, steps }) => {
    const c = CASES.validChanges;
    const member = await memberIn('Active');
    const drawer = await openEdit(steps, list, member);

    await steps.step(`Update one or more editable fields with valid values (Mobile Number "${c.mobile}", Occupation "${c.occupation}") - the fields accept the new values without error`, async () => {
      await drawer.type('occupation', c.occupation);
      await drawer.ensureStep(2);
      await drawer.type('mobileNumber', c.mobile);
      expect({ mobile: await drawer.getValue('mobileNumber'), errors: await drawer.getFieldErrors() }).toEqual({ mobile: c.mobile, errors: {} });
      await drawer.ensureStep(1);
      expect(await drawer.getValue('occupation')).toBe(c.occupation);
    });

    await steps.step('Click the "Submit" button - the system displays a success confirmation message; the changes are saved and the record reflects the updated values', async () => {
      const answer = await submitWizard(drawer);
      expect(saved(answer), `the save answered ${said(answer)}`).toBe(true);
      expect(answer.messages.join(' | '), 'the success message').toMatch(UPDATED);
      const record = await readMember(page, member.id);
      expect({ mobile: record.mobileNumber, occupation: record.occupation }, 'the saved record').toEqual({ mobile: c.mobile, occupation: c.occupation });
    });
  });

  test(`TC-${CASES.invalidRejected.azureId}: should reject invalid changes to a member's details and save none of them`, async ({ page, memberIn, memberManagementPage: list, steps }) => {
    const c = CASES.invalidRejected;
    const member = await memberIn('Active');
    const drawer = await openEdit(steps, list, member, 'the Member Information edit form displays');

    await steps.step(`Enter an invalid value in a field (letters "${c.mobile}" in Mobile Number) - the field shows the entered invalid value`, async () => {
      await drawer.ensureStep(2);
      await drawer.type('mobileNumber', c.mobile);
      expect(await drawer.getValue('mobileNumber'), 'the Mobile Number box').toBe(c.mobile);
    });

    await steps.step('Click the "Submit" button - the system displays an error message identifying the invalid field, and none of the entered changes are saved', async () => {
      const answer = await submitWizard(drawer);
      const mobileMessage = [await drawer.getFieldError('mobileNumber'), ...answer.messages.filter((m) => /mobile/i.test(m))].join(' ').trim();
      expect({ refused: refused(answer), mobileMessage: mobileMessage !== '' }, `the save answered ${said(answer)}`).toEqual({ refused: true, mobileMessage: true });
      expect((await readMember(page, member.id)).mobileNumber, 'the stored mobile number').toBe(member.mobileNumber);
    });
  });

  test(`TC-${CASES.correctOrLeave.azureId}: should let the administrator correct the field and save, or leave without saving, after a failed update`, async ({
    page,
    memberIn,
    memberManagementPage: list,
    steps,
  }) => {
    const c = CASES.correctOrLeave;
    const member = await memberIn('Active');
    const corrected = suiteMemberEmail();
    let drawer!: MemberFormDrawer;

    await steps.critical(NAVIGATE, async () => {
      await list.openTable();
      expect(await list.isListed(member.displayNameEn)).toBe(true);
    });

    await steps.step(`Open the Edit form and submit invalid data for a mandatory field (Email "${c.invalidEmail}") - an error message is displayed`, async () => {
      drawer = await list.openEditForm(member.displayNameEn);
      await drawer.ensureStep(2);
      await drawer.type('email', c.invalidEmail);
      const answer = await submitWizard(drawer);
      expect({ refused: refused(answer), error: await drawer.getFieldError('email') }, said(answer)).toEqual({ refused: true, error: expect.stringMatching(EMAIL_INVALID) });
    });

    await steps.step('Wait for or dismiss the error message - the error message disappears and the form remains open with the invalid entry still shown', async () => {
      await expect.poll(async () => (await list.waitForVisibleMessages(500)).length, { message: 'a transient message still showing', timeout: 15_000 }).toBe(0);
      expect({ open: await drawer.isOpen(), email: await drawer.getValue('email') }).toEqual({ open: true, email: c.invalidEmail });
    });

    await steps.step(`Re-enter a valid value ("${corrected}") in the previously invalid mandatory field and click Submit - the system displays a success message and saves the change`, async () => {
      await drawer.type('email', corrected);
      const answer = await submitWizard(drawer);
      expect(saved(answer), `the save answered ${said(answer)}`).toBe(true);
      expect(answer.messages.join(' | ')).toMatch(UPDATED);
      expect((await readMember(page, member.id)).email, 'the stored e-mail').toBe(corrected);
    });

    await steps.step('Repeat from step 2 on a fresh attempt, but instead choose to leave the form without correcting the field - the system exits the edit form without saving any data', async () => {
      const again = await list.openEditForm(member.displayNameEn);
      await again.ensureStep(2);
      await again.type('email', c.invalidEmail);
      const answer = await submitWizard(again);
      await again.close(true);
      expect({ refused: refused(answer), open: await again.isOpen(), email: (await readMember(page, member.id)).email }, said(answer))
        .toEqual({ refused: true, open: false, email: corrected });
    });
  });

  test(`TC-${CASES.mandatoryBlank.azureId}: should refuse to save when a mandatory field is cleared and keep the original value`, async ({ page, memberIn, memberManagementPage: list, steps }) => {
    const member = await memberIn('Active');
    const drawer = await openEdit(steps, list, member, 'the form displays with existing data');

    await steps.step('Clear a mandatory field (the Display Name\'s English Last Name) completely - the field shows as empty', async () => {
      await drawer.clear('englishLastName');
      expect(await drawer.getValue('englishLastName')).toBe('');
    });

    await steps.step('Click Submit - the system displays a required-field error message; the original value remains unchanged', async () => {
      const answer = await submitWizard(drawer);
      expect({ refused: refused(answer), error: await drawer.getFieldError('englishLastName') }, said(answer)).toEqual({ refused: true, error: expect.stringMatching(REQUIRED) });
      expect((await readMember(page, member.id)).englishLastName, 'the stored last name').toBe(member.lastName);
    });
  });

  test(`TC-${CASES.combinations.azureId}: should apply validation consistently to the combination of mandatory and optional changes`, async ({ page, memberIn, memberManagementPage: list, steps }) => {
    const c = CASES.combinations;
    const member = await memberIn('Active');
    const drawer = await openEdit(steps, list, member, 'the form displays');
    const newEmail = suiteMemberEmail();

    await steps.step(`Change only an optional field (Occupation "${c.occupation}") while all mandatory fields stay valid, then Submit - the system saves successfully with a success message`, async () => {
      await drawer.type('occupation', c.occupation);
      const answer = await submitWizard(drawer);
      expect(saved(answer), `the save answered ${said(answer)}`).toBe(true);
      expect(answer.messages.join(' | ')).toMatch(UPDATED);
      expect((await readMember(page, member.id)).occupation).toBe(c.occupation);
    });

    await steps.step(`Reopen the record, clear a mandatory field (English Last Name) while also changing an optional field (Occupation "${c.changedOccupation}"), then Submit - the system displays an error and discards both changes`, async () => {
      const again = await list.openEditForm(member.displayNameEn);
      await again.type('occupation', c.changedOccupation);
      await again.clear('englishLastName');
      const answer = await submitWizard(again);
      const error = await again.getFieldError('englishLastName');
      if (await again.isOpen()) await again.close(true);
      const record = await readMember(page, member.id);
      expect({ refused: refused(answer), error, lastName: record.englishLastName, occupation: record.occupation }, said(answer))
        .toEqual({ refused: true, error: expect.stringMatching(REQUIRED), lastName: member.lastName, occupation: c.occupation });
    });

    await steps.step(`Reopen the record, enter a valid new mandatory field value (Email "${newEmail}") together with an invalid optional field format (Hijri Date of Birth "${c.invalidHijri}"), then Submit - the system displays an error referencing the invalid optional field and discards all changes`, async () => {
      const again = await list.openEditForm(member.displayNameEn);
      await again.ensureStep(2);
      await again.type('email', newEmail);
      await again.ensureStep(1);
      await again.type('hijriDateOfBirth', c.invalidHijri);
      const answer = await submitWizard(again);
      const error = await again.getFieldError('hijriDateOfBirth');
      if (await again.isOpen()) await again.close(true);
      const record = await readMember(page, member.id);
      expect({ refused: refused(answer), error, email: record.email, hijri: record.hijriDateOfBirth }, said(answer))
        .toEqual({ refused: true, error: expect.stringMatching(HIJRI_INVALID), email: member.email, hijri: member.record.hijriDateOfBirth });
    });
  });

  test(`TC-${CASES.tooLong.azureId}: should not save a field value longer than its limit`, async ({ page, memberIn, memberManagementPage: list, steps }) => {
    const c = CASES.tooLong;
    const member = await memberIn('Active');
    const drawer = await openEdit(steps, list, member, 'the form displays with existing data');
    const value = longEnglishName(c.length);
    let capped = false;

    await steps.step(`Enter a Display Name value (English Last Name) that exceeds the maximum allowed length by one character (${c.length}) - the system either blocks further input at the limit or flags the value as too long`, async () => {
      await drawer.type('englishLastName', value);
      const shown = await drawer.getValue('englishLastName');
      const error = await drawer.getFieldError('englishLastName');
      capped = shown.length <= c.limit;
      expect({ blockedAtLimit: capped, flagged: error !== '' }, `the box holds ${shown.length} characters (maxlength ${await drawer.getMaxLength('englishLastName')}), message "${error}"`)
        .not.toEqual({ blockedAtLimit: false, flagged: false });
    });

    await steps.step('Click Submit - the system displays a validation error message (the value over the limit is not saved)', async () => {
      const answer = await submitWizard(drawer);
      const stored = (await readMember(page, member.id)).englishLastName;
      if (capped) expect(stored.length, `input stopped at the limit; the save answered ${said(answer)}`).toBeLessThanOrEqual(c.limit);
      else {
        expect({ refused: refused(answer), message: answer.messages.join(' ') !== '' || (await drawer.getFieldError('englishLastName')) !== '' }, said(answer)).toEqual({ refused: true, message: true });
        expect(stored, 'the stored last name').toBe(member.lastName);
      }
    });
  });

  test(`TC-${CASES.fieldsMatchRegistration.azureId}: should offer on the edit form exactly the editable fields of the registration form`, async ({ page, memberIn, memberManagementPage: list, steps }) => {
    const member = await memberIn('Active');
    const registration: Record<number, string[]> = {};
    let drawer!: MemberFormDrawer;

    await steps.critical('Precondition: the registration form field list is available for comparison (Add New Member, steps 1-4)', async () => {
      await list.openTable();
      const add = await list.openAddForm();
      const data = await validWizardData(page);
      registration[1] = await visibleLabels(page);
      await add.fillPatient(data.patient);
      expect(await add.next()).toBe(true);
      registration[2] = await visibleLabels(page);
      await add.fillNonNational(data.nonNational);
      expect(await add.next()).toBe(true);
      registration[3] = await visibleLabels(page);
      await add.fillAddress(data.address);
      expect(await add.next()).toBe(true);
      await add.addContact({});
      registration[4] = await visibleLabels(page);
      await add.close(true);
      expect(registration[1].length, 'registration step 1 labels').toBeGreaterThan(0);
    });

    await steps.critical(NAVIGATE, async () => {
      await list.openTable();
      expect(await list.isListed(member.displayNameEn)).toBe(true);
    });

    await steps.critical('Open the Edit form for a specific member record - the Member Information edit form opens', async () => {
      drawer = await list.openEditForm(member.displayNameEn);
      expect(await drawer.getTitle()).toMatch(/edit member/i);
    });

    await steps.step('Compare each field displayed on the edit form against the fields captured during member registration - every registration field is present and editable on the edit form, with no extra or missing fields', async () => {
      const differences: { step: number; missing: string[]; extra: string[]; readOnly: string[] }[] = [];
      for (const step of [1, 2, 3, 4] as const) {
        await drawer.ensureStep(step);
        if (step === 4) await drawer.addContact({});
        const labels = await visibleLabels(page);
        const readOnly: string[] = [];
        // District / Street are a cascade: disabled until the level above holds a value (the member has no City) - not read-only fields.
        const record = (member.record ?? {}) as Record<string, unknown>;
        const cascadeWaiting: Partial<Record<MemberFormField, boolean>> = { ['district' as MemberFormField]: !record.cityId, ['street' as MemberFormField]: !record.districtId };
        if (step !== 4) for (const field of FIELDS_BY_STEP[step]) if (!cascadeWaiting[field] && (await drawer.isReadOnly(field))) readOnly.push(field);
        differences.push({ step, missing: registration[step].filter((l) => !labels.includes(l)), extra: labels.filter((l) => !registration[step].includes(l)), readOnly });
      }
      await drawer.close(true);
      expect(differences).toEqual([1, 2, 3, 4].map((step) => ({ step, missing: [], extra: [], readOnly: [] })));
    });
  });

  test(`TC-${CASES.noChanges.azureId}: should leave the member record unchanged when the edit form is submitted without changes`, async ({ page, memberIn, memberManagementPage: list, steps }) => {
    const member = await memberIn('Active');
    const before = await editableValues(page, member.id);
    const drawer = await openEdit(steps, list, member, 'the form displays the current values');

    await steps.step('Without changing any field, click Submit - the system either saves with no detectable change or informs the user that no changes were made; the record remains identical', async () => {
      const answer = await submitWizard(drawer);
      expect(answer.status === -1 && answer.messages.length === 0, `the save answered ${said(answer)}`).toBe(false);
      expect(await editableValues(page, member.id), 'the record after the submit').toEqual(before);
    });
  });

  test(`TC-${CASES.specialCharacters.azureId}: should handle special characters and script-like text in member fields safely`, async ({ page, memberIn, memberManagementPage: list, memberDetailPage, memberInformationTab, steps }) => {
    const c = CASES.specialCharacters;
    const member = await memberIn('Active');
    const dialogs = watchScriptDialogs(page);
    const drawer = await openEdit(steps, list, member, 'the form displays');

    await steps.step(`Enter special characters and script-like text into text fields (Display Name's English Last Name "${c.displayName}", Occupation "${c.occupation}") and click Submit - the system either sanitises/escapes the input and saves it safely, or rejects it with a validation message; no script executes and no data is corrupted`, async () => {
      await drawer.type('englishLastName', c.displayName);
      await drawer.type('occupation', c.occupation);
      const first = await submitWizard(drawer);
      const record = await readMember(page, member.id);
      if (saved(first)) {
        expect({ lastName: record.englishLastName, occupation: record.occupation }, 'stored exactly as entered (escaped, not altered)').toEqual({ lastName: c.displayName, occupation: c.occupation });
      } else {
        const message = [await drawer.getFieldError('englishLastName'), ...first.messages].join(' ').trim();
        expect({ message: message !== '', lastName: record.englishLastName }, `the save answered ${said(first)}`).toEqual({ message: true, lastName: member.lastName });
        // The special characters alone (the name back to its own value) - saved safely or refused with a message.
        await drawer.ensureStep(1);
        await drawer.type('englishLastName', member.lastName);
        const second = await submitWizard(drawer);
        const after = await readMember(page, member.id);
        if (saved(second)) expect(after.occupation, 'the occupation stored exactly as entered').toBe(c.occupation);
        else expect(second.messages.join(' ') !== '', `the save answered ${said(second)}`).toBe(true);
      }
      await memberDetailPage.open(member.id);
      await memberInformationTab.open();
      const shown = await memberInformationTab.readField('occupation');
      expect({ scriptDialogs: dialogs, occupationShown: [c.occupation, '—'].includes(shown) }, `the view shows Occupation "${shown}"`).toEqual({ scriptDialogs: [], occupationShown: true });
    });
  });

  test(`TC-${CASES.dobConsistency.azureId}: should recalculate the age and Hijri date of birth when the date of birth is changed`, async ({ page, memberIn, memberManagementPage: list, memberDetailPage, memberInformationTab, steps }) => {
    const c = CASES.dobConsistency;
    const member = await memberIn('Active');
    const drawer = await openEdit(steps, list, member, 'the edit form opens');

    await steps.step('The edit form displays the current Date of Birth, Age, and Hijri Date of Birth', async () => {
      expect({ dateOfBirth: await drawer.getValue('dateOfBirth'), hijri: await drawer.getValue('hijriDateOfBirth'), ageShown: /\bAge\b/.test(await drawer.getText()) })
        .toEqual({ dateOfBirth: memberDayText(member.record.dateOfBirth as string), hijri: member.record.hijriDateOfBirth, ageShown: true });
    });

    await steps.step(`Change the Date of Birth to a valid new date (${memberDayText(c.dateOfBirth)}) and click Submit - the system displays a success message`, async () => {
      await drawer.type('dateOfBirth', memberDayText(c.dateOfBirth));
      await expect.poll(() => drawer.getValue('hijriDateOfBirth'), { message: 'the Hijri date follows the new date', timeout: 10_000 }).not.toBe(member.record.hijriDateOfBirth);
      const answer = await submitWizard(drawer);
      expect(saved(answer), `the save answered ${said(answer)}`).toBe(true);
      expect(answer.messages.join(' | ')).toMatch(UPDATED);
    });

    await steps.step('Reopen the record and view the Member Information - the Age and Hijri Date of Birth values are recalculated consistently with the new Date of Birth', async () => {
      await memberDetailPage.open(member.id);
      await memberInformationTab.open();
      expect({
        dateOfBirth: await memberInformationTab.readField('dateOfBirth'),
        hijri: await memberInformationTab.readField('hijriDateOfBirth'),
        age: await memberInformationTab.readField('age'),
      }, 'the Member Information values').toEqual({ dateOfBirth: expect.stringMatching(new RegExp(`${c.dateOfBirth}|${memberDayText(c.dateOfBirth)}`)), hijri: await toHijri(page, c.dateOfBirth), age: String(ageToday(c.dateOfBirth)) });
    });
  });
});
