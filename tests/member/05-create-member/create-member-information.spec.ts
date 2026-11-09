import type { Page } from '@playwright/test';
import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { MemberFormDrawer } from '../../../pages/member/MemberFormDrawer';
import { CASES, MESSAGE, SPEC_FIELDS } from '../../../data/member/createMember.data';
import { memberDayText, memberStamp, readMember, riyadhDay, toGregorian, toHijri } from '../../../utils/MemberProvisioning';
import {
  WIZARD_LABEL,
  advanceTo,
  createdId,
  literalOrFreeDocumentId,
  nationalPart,
  openAddWizard,
  said,
  saved,
  submitWizard,
  validWizardData,
  visibleLabels,
  visibleRequiredLabels,
  type WizardData,
} from '../../../utils/member/writerBHelpers';

/** Step 1 without the identity fields - the identity cases choose those themselves. */
const withoutIdentity = (data: WizardData): WizardData['patient'] => {
  const { nationality: _n, identityType: _t, documentId: _d, ...rest } = data.patient;
  return rest;
};

/** The document-ID rule of a case: what the box holds after the entry, and its error. */
async function readDocumentId(drawer: MemberFormDrawer): Promise<{ value: string; error: string }> {
  return { value: await drawer.getValue('documentId'), error: await drawer.getFieldError('documentId') };
}

/** A non-Saudi nationality whose Identity Type offers `type`; returns the option label chosen (fails naming the options offered). */
async function chooseIdentityType(drawer: MemberFormDrawer, type: RegExp, typeName: string): Promise<void> {
  await drawer.choose('nationality', WIZARD_LABEL.nonSaudi);
  const options = await drawer.getOptions('identityType');
  const match = options.find((o) => type.test(o));
  expect(match, `Identity Type should offer "${typeName}" for a non-Saudi nationality - it offers ${JSON.stringify(options)}`).toBeDefined();
  await drawer.choose('identityType', match as string);
}

/** Step-1 case: a document ID for a non-Saudi identity type that the lookup does not hold (19828-19830). */
async function identityTypeAccepted(
  steps: TestSteps,
  drawer: MemberFormDrawer,
  data: WizardData,
  c: { type: RegExp; typeName: string },
  literal: string,
  documentId: string,
): Promise<void> {
  await steps.critical(`Select a non-Saudi Nationality, Identity Type = "${c.typeName}" and enter Document ID "${literal}" - the value is entered and accepted`, async () => {
    await drawer.fillPatient(withoutIdentity(data));
    await chooseIdentityType(drawer, c.type, c.typeName);
    await drawer.type('documentId', documentId);
    expect(await readDocumentId(drawer)).toEqual({ value: documentId, error: '' });
  });
  await steps.step('Click Next - Step 1 passes validation and Step 2 is displayed', async () => {
    expect(await drawer.next(), `step 1 errors: ${JSON.stringify(await drawer.getFieldErrors())}`).toBe(true);
    expect(await drawer.currentStep()).toBe(2);
  });
}

/** Step-1 case: a document ID that must be refused (Next does not advance, the rule's message shows). */
async function documentIdRefused(steps: TestSteps, drawer: MemberFormDrawer, data: WizardData, enterStep: string, rule: RegExp): Promise<void> {
  const documentId = data.patient.documentId as string;
  await steps.step(`${enterStep} - the value is entered in the field`, async () => {
    await drawer.fillPatient(data.patient);
    expect(await drawer.getValue('documentId'), 'the Document ID box').toBe(documentId);
  });
  await steps.step('Click Next - a validation message is shown and the wizard does not advance', async () => {
    const moved = await drawer.next();
    expect({ advanced: moved, step: await drawer.currentStep(), error: await drawer.getFieldError('documentId') }, `step 1 errors: ${JSON.stringify(await drawer.getFieldErrors())}`)
      .toEqual({ advanced: false, step: 1, error: expect.stringMatching(rule) });
  });
}

/** Whether a label shown matches a label of the specification (exact, or the shown one extends it: "Email Address" for "Email"). */
const sameLabel = (shown: string, spec: string): boolean => shown.toLowerCase() === spec.toLowerCase() || shown.toLowerCase().startsWith(`${spec.toLowerCase()} `);

/** One wizard step reviewed against the specification: fields missing, mandatory marks missing, marks the specification does not ask for. */
async function reviewStep(page: Page, step: 1 | 2 | 3 | 4): Promise<{ step: number; missing: string[]; unmarked: string[]; extraMarks: string[] }> {
  const labels = await visibleLabels(page);
  const marked = await visibleRequiredLabels(page);
  const spec = SPEC_FIELDS[step];
  return {
    step,
    missing: spec.labels.filter((l) => !labels.some((s) => sameLabel(s, l))),
    unmarked: spec.required.filter((l) => !marked.some((s) => sameLabel(s, l))),
    extraMarks: marked.filter((s) => !spec.required.some((l) => sameLabel(s, l))),
  };
}

/**
 * User story 14380: Create Member - step 1 "Member Information" (names,
 * identity, document ID rules, dual-calendar date of birth), the step gate,
 * the field checklist and the end-to-end create. Step 2-4 cases are in
 * create-member-registry-and-contacts.spec.ts, the exploratory 19852 in
 * create-member-exploratory.spec.ts, 19854 in create-permission.spec.ts. See
 * the data file for the literal readings.
 */
test.describe('US 14380 - Create Member', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.createAllSteps.azureId}: should create the member and list it with the entered details when all four steps hold valid data`, async ({
    page,
    memberManagementPage: list,
    discardMemberNamed,
    steps,
  }) => {
    const c = CASES.createAllSteps;
    const drawer = await openAddWizard(steps, list);
    const data = await validWizardData(page, {
      patient: { eHealthId: c.eHealthId, documentId: await literalOrFreeDocumentId(page, c.documentId) },
      nonNational: { mobileNumber: nationalPart(c.mobile), email: c.email.replace('@', `.${memberStamp()}@`), preferredContactMethod: c.contactMethod, preferredLanguage: c.language },
      address: { country: c.country },
    });
    discardMemberNamed(data.displayNameEn);

    await steps.critical(`Enter valid English and Arabic names, E-Health ID, Nationality "Saudi", Identity Type, Document ID "${data.patient.documentId}", Date of Birth, Gender "Male", Member Status "Alive" and click Next - Step 1 data is accepted and Step 2 "Non-National Registry" is displayed`, async () => {
      await drawer.fillPatient(data.patient);
      expect(await drawer.readSelect('identityType'), 'the Identity Type of a Saudi').toContain(WIZARD_LABEL.nationalId);
      expect(await drawer.next(), `step 1 errors: ${JSON.stringify(await drawer.getFieldErrors())}`).toBe(true);
      expect(await drawer.currentStep()).toBe(2);
    });

    await steps.critical(`Enter Mobile Number "${c.mobile}", Email "${data.nonNational.email}", Preferred Contact Method "Email", Preferred Language "English" and click Next - Step 2 data is accepted and Step 3 "Address" is displayed`, async () => {
      await drawer.fillNonNational(data.nonNational);
      expect(await drawer.next(), `step 2 errors: ${JSON.stringify(await drawer.getFieldErrors())}`).toBe(true);
      expect(await drawer.currentStep()).toBe(3);
    });

    await steps.critical('Enter Country "Saudi Arabia" and click Next - Step 3 data is accepted and Step 4 "Emergency Contacts" is displayed', async () => {
      await drawer.fillAddress(data.address);
      expect(await drawer.next(), `step 3 errors: ${JSON.stringify(await drawer.getFieldErrors())}`).toBe(true);
      expect(await drawer.currentStep()).toBe(4);
    });

    await steps.step('Leave Step 4 empty and click Submit - a confirmation message is displayed, the member is saved and appears in the member list with the entered details', async () => {
      expect(await drawer.countContacts(), 'Step 4 left empty').toBe(0);
      const answer = await submitWizard(drawer);
      expect(saved(answer), `the save answered ${said(answer)}`).toBe(true);
      expect(answer.messages.join(' | '), 'the confirmation message').toMatch(MESSAGE.created);
      const row = await list.readRow(data.displayNameEn);
      expect({ documentId: row.documentId, nationality: row.nationality, mobile: row.mobileNumber.includes(nationalPart(c.mobile)), status: row.status }, 'the new row')
        .toEqual({ documentId: data.patient.documentId, nationality: WIZARD_LABEL.saudi, mobile: true, status: expect.stringMatching(/active/i) });
      const record = await readMember(page, createdId(answer) as string);
      expect({ eHealthId: record.eHealthId, email: record.email, dateOfBirth: String(record.dateOfBirth).slice(0, 10), nationality: record.nationalityNameEn, gender: record.genderNameEn, status: record.patientStatusNameEn }, 'the saved record')
        .toEqual({ eHealthId: c.eHealthId, email: data.nonNational.email, dateOfBirth: '1990-05-15', nationality: WIZARD_LABEL.saudi, gender: 'Male', status: 'Alive' });
    });
  });

  test(`TC-${CASES.englishFirstBlank.azureId}: should stay on step 1 and require the English First Name when it is left blank`, async ({ page, memberManagementPage: list, steps }) => {
    const drawer = await openAddWizard(steps, list, 'Step 1 form is displayed');
    const data = await validWizardData(page, { patient: { englishFirstName: '' } });

    await steps.step('Leave "English First Name" blank, fill all other mandatory fields, and click Next - the field is highlighted', async () => {
      await drawer.fillPatient(data.patient);
      await drawer.next();
      expect(await drawer.getValue('englishFirstName'), 'the English First Name box').toBe('');
      expect(await drawer.getFieldError('englishFirstName'), 'the message under English First Name').not.toBe('');
    });

    await steps.step('Observe the outcome - a mandatory-field validation message is shown and the wizard does not advance to Step 2', async () => {
      expect({ error: await drawer.getFieldError('englishFirstName'), step: await drawer.currentStep() }).toEqual({ error: expect.stringMatching(MESSAGE.required), step: 1 });
    });
  });

  test(`TC-${CASES.saudiIdentityLocked.azureId}: should default the Identity Type to National Card and lock it when the nationality is Saudi`, async ({ memberManagementPage: list, steps }) => {
    const drawer = await openAddWizard(steps, list, 'Step 1 form is displayed');

    await steps.step('Select Nationality = "Saudi" - the Identity Type field automatically defaults to "National Card" and becomes locked/read-only', async () => {
      await drawer.choose('nationality', WIZARD_LABEL.saudi);
      expect({ identityType: await drawer.readSelect('identityType'), readOnly: await drawer.isReadOnly('identityType') })
        .toEqual({ identityType: expect.stringMatching(/national (id|card)/i), readOnly: true });
    });

    await steps.step('Attempt to change the Identity Type - the field cannot be edited', async () => {
      const options = await drawer.getOptions('identityType').catch(() => [] as string[]);
      const others = options.filter((o) => !/national/i.test(o));
      if (others.length > 0) await drawer.choose('identityType', others[0]).catch(() => undefined);
      expect({ identityType: await drawer.readSelect('identityType'), otherTypesOffered: others }, `options offered: ${JSON.stringify(options)}`)
        .toEqual({ identityType: expect.stringMatching(/national (id|card)/i), otherTypesOffered: [] });
    });
  });

  test(`TC-${CASES.thirdNamesBlank.azureId}: should accept step 1 when the optional English and Arabic third names are left blank`, async ({ page, memberManagementPage: list, steps }) => {
    const drawer = await openAddWizard(steps, list, 'Step 1 form is displayed');
    const data = await validWizardData(page, { patient: { englishThirdName: '', arabicThirdName: '' } });

    await steps.step('Fill all mandatory Step 1 fields, leave "English Third Name" and "Arabic Third Name" blank, then click Next - Step 1 is accepted and Step 2 is displayed', async () => {
      await drawer.fillPatient(data.patient);
      expect({ english: await drawer.getValue('englishThirdName'), arabic: await drawer.getValue('arabicThirdName') }, 'the third names').toEqual({ english: '', arabic: '' });
      expect(await drawer.next(), `step 1 errors: ${JSON.stringify(await drawer.getFieldErrors())}`).toBe(true);
      expect(await drawer.currentStep()).toBe(2);
    });
  });

  test(`TC-${CASES.saudiIdValid.azureId}: should accept a Saudi national card number that starts with 1 and has exactly 10 digits`, async ({ page, memberManagementPage: list, steps }) => {
    const drawer = await openAddWizard(steps, list, 'Step 1 form is displayed');
    const documentId = await literalOrFreeDocumentId(page, CASES.saudiIdValid.documentId);
    const data = await validWizardData(page, { patient: { documentId } });

    await steps.step(`Select Nationality = "Saudi" and enter Document ID "${documentId}" - the value is accepted in the field`, async () => {
      await drawer.fillPatient(data.patient);
      expect(await readDocumentId(drawer)).toEqual({ value: documentId, error: '' });
    });

    await steps.step('Click Next - Step 1 passes validation and Step 2 is displayed', async () => {
      expect(await drawer.next(), `step 1 errors: ${JSON.stringify(await drawer.getFieldErrors())}`).toBe(true);
      expect(await drawer.currentStep()).toBe(2);
    });
  });

  test(`TC-${CASES.arabicFirstBlank.azureId}: should stay on step 1 and require the Arabic First Name when it is left blank`, async ({ page, memberManagementPage: list, steps }) => {
    const drawer = await openAddWizard(steps, list, 'Step 1 form is displayed');
    const data = await validWizardData(page, { patient: { arabicFirstName: '' } });

    await steps.step('Leave "Arabic First Name" blank, fill all other mandatory fields, and click Next - the field is highlighted', async () => {
      await drawer.fillPatient(data.patient);
      await drawer.next();
      expect(await drawer.getValue('arabicFirstName'), 'the Arabic First Name box').toBe('');
      expect(await drawer.getFieldError('arabicFirstName'), 'the message under Arabic First Name').not.toBe('');
    });

    await steps.step('Observe the outcome - a mandatory-field validation message is shown and the wizard does not advance to Step 2', async () => {
      expect({ error: await drawer.getFieldError('arabicFirstName'), step: await drawer.currentStep() }).toEqual({ error: expect.stringMatching(MESSAGE.required), step: 1 });
    });
  });

  for (const c of [CASES.saudiIdShort, CASES.saudiIdLong, CASES.saudiIdWrongStart]) {
    const what = c === CASES.saudiIdShort ? 'has fewer than 10 digits' : c === CASES.saudiIdLong ? 'has more than 10 digits' : 'does not start with 1';
    test(`TC-${c.azureId}: should reject a Saudi national card number that ${what}`, async ({ page, memberManagementPage: list, steps }) => {
      const drawer = await openAddWizard(steps, list, 'Step 1 form is displayed');
      const data = await validWizardData(page, { patient: { documentId: c.documentId } });
      await documentIdRefused(steps, drawer, data, `Select Nationality = "Saudi" and enter Document ID "${c.documentId}" (${c.documentId.length} digits)`, MESSAGE.saudiId);
    });
  }

  test(`TC-${CASES.iqamaLocked.azureId}: should accept an Iqama number starting with 2 and lock the document type to Resident Card`, async ({ page, memberManagementPage: list, steps }) => {
    const drawer = await openAddWizard(steps, list, 'Step 1 form is displayed');
    const documentId = await literalOrFreeDocumentId(page, CASES.iqamaLocked.documentId);
    const data = await validWizardData(page);

    await steps.step('Select a non-Saudi Nationality and Identity Type = "Resident (Iqama)" - the document type field locks to "Resident Card"', async () => {
      await drawer.choose('nationality', WIZARD_LABEL.nonSaudi);
      await drawer.choose('identityType', WIZARD_LABEL.iqama);
      expect({ identityType: await drawer.readSelect('identityType'), readOnly: await drawer.isReadOnly('identityType') }, `Identity Type options: ${JSON.stringify(await drawer.getOptions('identityType').catch(() => []))}`)
        .toEqual({ identityType: expect.stringMatching(/iqama|resident/i), readOnly: true });
    });

    await steps.step(`Enter Document ID "${documentId}" and click Next - Step 1 passes validation and Step 2 is displayed`, async () => {
      await drawer.fillPatient({ ...withoutIdentity(data), documentId });
      expect(await readDocumentId(drawer)).toEqual({ value: documentId, error: '' });
      expect(await drawer.next(), `step 1 errors: ${JSON.stringify(await drawer.getFieldErrors())}`).toBe(true);
      expect(await drawer.currentStep()).toBe(2);
    });
  });

  test(`TC-${CASES.borderNumber.azureId}: should accept a non-Saudi border number starting with 3 or 4`, async ({ page, memberManagementPage: list, steps }) => {
    const c = CASES.borderNumber;
    const drawer = await openAddWizard(steps, list, 'Step 1 form is displayed');
    const data = await validWizardData(page);
    const second = await literalOrFreeDocumentId(page, c.documentIds[1]);
    await identityTypeAccepted(steps, drawer, data, c, c.documentIds[0], await literalOrFreeDocumentId(page, c.documentIds[0]));

    await steps.step(`Repeat the Step 1 entry with Document ID "${c.documentIds[1]}" - the value is also accepted and Step 2 is displayed`, async () => {
      await drawer.back();
      await drawer.type('documentId', second);
      expect(await readDocumentId(drawer)).toEqual({ value: second, error: '' });
      expect(await drawer.next(), `step 1 errors: ${JSON.stringify(await drawer.getFieldErrors())}`).toBe(true);
      expect(await drawer.currentStep()).toBe(2);
    });
  });

  for (const c of [CASES.visitorNumber, CASES.pilgrimNumber, CASES.companyNumber]) {
    test(`TC-${c.azureId}: should accept a non-Saudi ${c.typeName.toLowerCase()} starting with ${c.documentId[0]} and 10 digits long`, async ({ page, memberManagementPage: list, steps }) => {
      const drawer = await openAddWizard(steps, list, 'Step 1 form is displayed');
      const data = await validWizardData(page);
      await identityTypeAccepted(steps, drawer, data, c, c.documentId, await literalOrFreeDocumentId(page, c.documentId));
    });
  }

  test(`TC-${CASES.passportSpecial.azureId}: should reject a passport number containing special characters`, async ({ page, memberManagementPage: list, steps }) => {
    const c = CASES.passportSpecial;
    const drawer = await openAddWizard(steps, list, 'Step 1 form is displayed');
    const data = await validWizardData(page, { patient: { nationality: WIZARD_LABEL.nonSaudi, identityType: WIZARD_LABEL.passport, documentId: c.documentId } });
    await documentIdRefused(steps, drawer, data, `Select a non-Saudi Nationality, Identity Type = "Passport" and enter Document ID "${c.documentId}"`, MESSAGE.passport);
  });

  test(`TC-${CASES.gccInRange.azureId}: should accept a GCC ID number of 8 and of 15 digits`, async ({ page, memberManagementPage: list, steps }) => {
    const c = CASES.gccInRange;
    const drawer = await openAddWizard(steps, list, 'Step 1 form is displayed');
    const [eight, fifteen] = [await literalOrFreeDocumentId(page, c.documentIds[0]), await literalOrFreeDocumentId(page, c.documentIds[1])];
    const data = await validWizardData(page, { patient: { nationality: WIZARD_LABEL.nonSaudi, identityType: WIZARD_LABEL.gccId, documentId: eight } });

    await steps.step(`Select a non-Saudi Nationality, Identity Type = "GCC ID" and enter Document ID "${eight}" (8 digits) - the value is accepted`, async () => {
      await drawer.fillPatient(data.patient);
      expect(await readDocumentId(drawer)).toEqual({ value: eight, error: '' });
    });

    await steps.step('Click Next - Step 1 passes validation and Step 2 is displayed', async () => {
      expect(await drawer.next(), `step 1 errors: ${JSON.stringify(await drawer.getFieldErrors())}`).toBe(true);
      expect(await drawer.currentStep()).toBe(2);
    });

    await steps.step(`Repeat the Step 1 entry with a 15-digit value "${fifteen}" - the value is also accepted and Step 2 is displayed`, async () => {
      await drawer.ensureStep(1);
      await drawer.type('documentId', fifteen);
      expect(await readDocumentId(drawer)).toEqual({ value: fifteen, error: '' });
      expect(await drawer.next(), `step 1 errors: ${JSON.stringify(await drawer.getFieldErrors())}`).toBe(true);
      expect(await drawer.currentStep()).toBe(2);
    });
  });

  for (const c of [CASES.gccShort, CASES.gccLong]) {
    const what = c === CASES.gccShort ? 'shorter than 8 digits' : 'longer than 15 digits';
    test(`TC-${c.azureId}: should reject a GCC ID number ${what}`, async ({ page, memberManagementPage: list, steps }) => {
      const drawer = await openAddWizard(steps, list, 'Step 1 form is displayed');
      const data = await validWizardData(page, { patient: { nationality: WIZARD_LABEL.nonSaudi, identityType: WIZARD_LABEL.gccId, documentId: c.documentId } });
      await documentIdRefused(steps, drawer, data, `Select a non-Saudi Nationality, Identity Type = "GCC ID" and enter Document ID "${c.documentId}" (${c.documentId.length} digits)`, MESSAGE.gccId);
    });
  }

  test(`TC-${CASES.duplicateDocument.azureId}: should reject a document ID already used by another member`, async ({ page, memberIn, memberManagementPage: list, steps }) => {
    const existing = await memberIn('Active');
    const drawer = await openAddWizard(steps, list, 'Step 1 form is displayed');
    const data = await validWizardData(page, { patient: { documentId: existing.documentId } });
    let moved = true;

    await steps.step(`Enter the existing Document ID "${existing.documentId}" (member ${existing.code}) along with other valid mandatory fields and click Next - the value is entered`, async () => {
      await drawer.fillPatient(data.patient);
      expect(await drawer.getValue('documentId'), 'the Document ID box').toBe(existing.documentId);
      moved = await drawer.next();
    });

    await steps.step('Observe the outcome - a uniqueness validation message is shown and the wizard does not advance', async () => {
      // The uniqueness check is ASYNC (CheckDocumentIdExists on blur): its message
      // arrives after the field rules' - read it once it has had time to land
      // (the smoke of 2026-11-05 read too early and found nothing although the
      // screen showed "This document ID is already registered to another member.").
      let error = '';
      for (const until = Date.now() + 10_000; Date.now() < until;) {
        error = `${await drawer.getFieldError('documentId')} ${(await drawer.getMessages()).join(' ')}`.trim();
        if (MESSAGE.duplicate.test(error)) break;
        await page.waitForTimeout(500);
      }
      expect({ advanced: moved, step: await drawer.currentStep(), error }, `step 1 errors: ${JSON.stringify(await drawer.getFieldErrors())}`)
        .toEqual({ advanced: false, step: 1, error: expect.stringMatching(MESSAGE.duplicate) });
    });
  });

  test(`TC-${CASES.futureDob.azureId}: should reject a date of birth in the future`, async ({ page, memberManagementPage: list, steps }) => {
    const future = CASES.futureDob.dateOfBirth > riyadhDay(0) ? CASES.futureDob.dateOfBirth : riyadhDay(1);
    const drawer = await openAddWizard(steps, list, 'Step 1 form is displayed');
    const data = await validWizardData(page, { patient: { dateOfBirth: memberDayText(future) } });

    await steps.step(`Select a Date of Birth later than today's date (${memberDayText(future)}) - the value is entered in the field`, async () => {
      await drawer.fillPatient(data.patient);
      // The picker's max date is today: refusing the typed date at entry is itself the refusal (data file).
      expect([memberDayText(future), ''], 'the Date of Birth box holds the typed future date (or the picker refused it at entry)').toContain(await drawer.getValue('dateOfBirth'));
    });

    await steps.step('Click Next - a validation message is shown and the wizard does not advance', async () => {
      const moved = await drawer.next();
      expect({ advanced: moved, step: await drawer.currentStep(), error: await drawer.getFieldError('dateOfBirth') }, `box "${await drawer.getValue('dateOfBirth')}", errors ${JSON.stringify(await drawer.getFieldErrors())}`)
        .toEqual({ advanced: false, step: 1, error: expect.stringMatching(/\S/) });
    });
  });

  test(`TC-${CASES.gregorianFillsHijri.azureId}: should fill the matching Hijri date of birth when a Gregorian date of birth is picked`, async ({ page, memberManagementPage: list, steps }) => {
    const day = CASES.gregorianFillsHijri.dateOfBirth;
    const drawer = await openAddWizard(steps, list, 'Step 1 form is displayed');

    await steps.step(`Pick a Gregorian Date of Birth (${memberDayText(day)}) from the calendar picker - the Date of Birth field is populated`, async () => {
      await drawer.type('dateOfBirth', memberDayText(day));
      expect(await drawer.getValue('dateOfBirth')).toBe(memberDayText(day));
    });

    await steps.step('Observe the Hijri Date of Birth field - it is automatically populated with the corresponding Hijri date', async () => {
      expect(await drawer.waitForHijri(), 'the Hijri Date of Birth (the same day, ConvertToHijri)').toBe(await toHijri(page, day));
    });
  });

  test(`TC-${CASES.hijriFillsGregorian.azureId}: should fill the matching Gregorian date of birth when a Hijri date of birth is typed`, async ({ page, memberManagementPage: list, steps }) => {
    const hijri = CASES.hijriFillsGregorian.hijri;
    const drawer = await openAddWizard(steps, list, 'Step 1 form is displayed');

    await steps.step(`Type a valid Hijri Date of Birth ("${hijri}") into the Hijri field - the Hijri Date of Birth field is populated`, async () => {
      await drawer.type('hijriDateOfBirth', hijri);
      expect({ value: await drawer.getValue('hijriDateOfBirth'), error: await drawer.getFieldError('hijriDateOfBirth') }).toEqual({ value: hijri, error: '' });
    });

    await steps.step('Observe the Gregorian Date of Birth field - it is automatically populated with the corresponding Gregorian date', async () => {
      const expected = memberDayText(await toGregorian(page, hijri));
      await expect.poll(() => drawer.getValue('dateOfBirth'), { message: 'the Date of Birth (the same day, ConvertToGregorian)', timeout: 10_000 }).toBe(expected);
    });
  });

  test(`TC-${CASES.datesMismatch.azureId}: should block the wizard when the Gregorian and Hijri dates of birth are not the same day`, async ({ page, memberManagementPage: list, steps }) => {
    const c = CASES.datesMismatch;
    const drawer = await openAddWizard(steps, list, 'Step 1 form is displayed');
    const data = await validWizardData(page, { patient: { dateOfBirth: memberDayText(c.dateOfBirth) } });

    await steps.step(`Set the Gregorian Date of Birth (${memberDayText(c.dateOfBirth)}) and then manually override the Hijri Date of Birth to a non-corresponding date (${c.hijri}) - both fields hold mismatched values`, async () => {
      await drawer.fillPatient(data.patient);
      await drawer.type('hijriDateOfBirth', c.hijri);
      expect({ dateOfBirth: await drawer.getValue('dateOfBirth'), hijri: await drawer.getValue('hijriDateOfBirth') }, 'the two date boxes')
        .toEqual({ dateOfBirth: memberDayText(c.dateOfBirth), hijri: c.hijri });
    });

    await steps.step('Click Next - a validation message is shown indicating the dates do not match, and the wizard does not advance', async () => {
      const moved = await drawer.next();
      const errors = await drawer.getFieldErrors();
      const outcome = { advanced: moved, step: await drawer.currentStep(), message: `${errors.dateOfBirth ?? ''} ${errors.hijriDateOfBirth ?? ''} ${(await drawer.getMessages()).join(' ')}`.trim() };
      // Evidence for the report: when the wizard moved on, go back and read the two
      // boxes - did the screen re-sync them to one day (the AC's "typing a Hijri
      // date fills the Date of Birth") or keep the mismatch?
      if (moved) await drawer.back();
      const boxes = `Date of Birth "${await drawer.getValue('dateOfBirth')}" / Hijri "${await drawer.getValue('hijriDateOfBirth')}" (entered ${memberDayText(c.dateOfBirth)} / ${c.hijri})`;
      expect(outcome, boxes).toEqual({ advanced: false, step: 1, message: expect.stringMatching(/same day|match|correspond/i) });
    });
  });

  test(`TC-${CASES.stepGate.azureId}: should keep the wizard on step 1 while mandatory fields of the step are incomplete`, async ({ memberManagementPage: list, steps }) => {
    const drawer = await openAddWizard(steps, list, 'Step 1 form is displayed');
    const blank = ['englishLastName', 'arabicLastName', 'nationality', 'identityType', 'documentId', 'dateOfBirth', 'gender', 'memberStatus'] as const;

    await steps.step('Leave several mandatory fields blank and click Next - validation messages are shown for each missing mandatory field', async () => {
      await drawer.fillPatient({ englishFirstName: 'QA', englishSecondName: 'Automation', arabicFirstName: 'كيو', arabicSecondName: 'اختبار' });
      await drawer.next();
      const errors = await drawer.getFieldErrors();
      expect(Object.fromEntries(blank.map((f) => [f, errors[f] ?? ''])), 'the message under each blank mandatory field')
        .toEqual(Object.fromEntries(blank.map((f) => [f, expect.stringMatching(MESSAGE.required)])));
    });

    await steps.step('Observe the step indicator - the wizard remains on Step 1 and does not transition to Step 2', async () => {
      expect(await drawer.currentStep()).toBe(1);
    });
  });

  test(`TC-${CASES.fieldChecklist.azureId}: should present every specified field on the four steps with the mandatory ones marked`, async ({ page, memberManagementPage: list, steps }) => {
    const drawer = await openAddWizard(steps, list, 'Step 1 is displayed for review');
    const data = await validWizardData(page);

    await steps.step('Review Step 1 of the Create Member form - all fields listed in the specification are present, and mandatory fields are visibly marked', async () => {
      expect(await reviewStep(page, 1)).toEqual({ step: 1, missing: [], unmarked: [], extraMarks: [] });
    });

    await steps.step('Proceed through Steps 2, 3 and 4 and review each - all fields listed in the specification are present, and mandatory fields are visibly marked on each step', async () => {
      const reviews = [];
      await advanceTo(drawer, data, 2);
      reviews.push(await reviewStep(page, 2));
      await advanceTo(drawer, data, 3);
      reviews.push(await reviewStep(page, 3));
      await advanceTo(drawer, data, 4);
      await drawer.addContact({});
      reviews.push(await reviewStep(page, 4));
      await drawer.close(true);
      expect(reviews).toEqual([2, 3, 4].map((step) => ({ step, missing: [], unmarked: [], extraMarks: [] })));
    });
  });
});
