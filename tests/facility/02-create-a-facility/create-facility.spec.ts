import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { FacilityManagementPage } from '../../../pages/facility/FacilityManagementPage';
import type { FacilityFormDrawer, FacilitySaveAnswer } from '../../../pages/facility/FacilityFormDrawer';
import { CASES, FULL_CONTACT, MESSAGE } from '../../../data/facility/createAFacility.data';
import {
  findFacilityByName,
  listFacilityRegister,
  readFacility,
  suiteFacilityArabicName,
  suiteFacilityEmail,
  suiteFacilityName,
} from '../../../utils/FacilityProvisioning';
import {
  createThroughForm,
  isCodeTruncated,
  readExpectedError,
  said,
  saved,
  submitForm,
  validFacilityForm,
  type FacilityFormData,
} from '../../../utils/facility/writerAHelpers';

/** The two opening steps nearly every case shares; returns the open Add drawer. */
async function navigateAndOpenAdd(steps: TestSteps, list: FacilityManagementPage): Promise<FacilityFormDrawer> {
  let drawer!: FacilityFormDrawer;
  await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
    await list.openTable();
    expect(await list.countRows(), 'the list of existing facilities').toBeGreaterThan(0);
  });
  await steps.critical('Click "Create" to add a new facility - a new facility form opens', async () => {
    drawer = await list.openAddForm();
    expect(await drawer.getTitle(), 'the Add drawer').toMatch(/add new facility/i);
    expect(await drawer.currentStep(), 'the form opens on Basic Information').toBe(1);
  });
  return drawer;
}

/** Fills both steps, then goes back to step 1 (the step-1 "all other fields completed" cases). */
async function fillBothStepsAndReturn(drawer: FacilityFormDrawer, data: FacilityFormData): Promise<void> {
  await drawer.fillBasic(data.basic);
  expect(await drawer.next(), `step 1 should validate: ${(await drawer.getMessages()).join(' | ')}`).toBe(true);
  await drawer.fillContact(data.contact);
  await drawer.back();
}

/** The step-1 values shown now. */
async function readBasic(drawer: FacilityFormDrawer): Promise<Record<string, string | boolean>> {
  return {
    nameEn: await drawer.getValue('nameEn'),
    nameAr: await drawer.getValue('nameAr'),
    type: await drawer.readSelect('type'),
    providerType: await drawer.readSelect('providerType'),
    nationalCode: await drawer.getValue('nationalCode'),
    isActive: await drawer.isActiveTicked(),
  };
}

/** The dashboard Total now - "no record is created" is this unchanged. */
const totalNow = async (list: FacilityManagementPage): Promise<number> => (await list.fetchDashboard()).total;

/**
 * User story 15132: Create a facility (basic identity, contact and licence).
 * Mandatory and format checks on both steps of the Add drawer, the generated
 * Facility Code and Authority Code, Is Active, licence dates and the status
 * they give, duplicate names and data kept between steps. 17610 (a role without
 * Create) is in create-permission.spec.ts. See the data file for the mapping.
 */
test.describe('US 15132 - Create a facility', () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test(`TC-${CASES.arabicNameLatin.azureId}: should refuse to save when the Arabic name holds Latin letters and digits`, async ({
    facilityManagementPage: list,
    discardFacilityNamed,
    page,
    steps,
  }) => {
    const data = validFacilityForm('Arabic Latin', { basic: { nameAr: CASES.arabicNameLatin.nameAr, type: 'Clinic' } });
    discardFacilityNamed(data.basic.nameEn as string);
    const drawer = await navigateAndOpenAdd(steps, list);

    await steps.step(`Enter a valid English Name and type "${CASES.arabicNameLatin.nameAr}" into the Arabic Name field - the typed value appears in the Arabic Name field`, async () => {
      await drawer.fillBasic(data.basic);
      expect({ nameEn: await drawer.getValue('nameEn'), nameAr: await drawer.getValue('nameAr') }).toEqual({ nameEn: data.basic.nameEn, nameAr: CASES.arabicNameLatin.nameAr });
    });

    await steps.step('Click Submit - a format validation error is displayed stating Arabic letters only are permitted', async () => {
      const answer = await submitForm(drawer);
      if (answer.status === -1) {
        expect(await drawer.getFieldError('nameAr'), `messages: ${answer.messages.join(' | ')}`).toMatch(MESSAGE.arabicOnly);
      } else {
        // Past step 1 (it accepts digits): the remaining step is filled so the Save itself is tried.
        await drawer.fillContact(data.contact);
        const final = await submitForm(drawer);
        expect({ saved: saved(final), messages: final.messages.join(' | ') }, said(final)).toEqual({ saved: false, messages: expect.stringMatching(MESSAGE.arabicOnly) });
      }
      expect(await findFacilityByName(page, data.basic.nameEn as string), 'a facility saved with that Arabic name').toBeNull();
    });
  });

  test(`TC-${CASES.englishNameBlank.azureId}: should refuse to save and require the English name when it is left blank`, async ({
    facilityManagementPage: list,
    steps,
  }) => {
    const data = validFacilityForm('English Blank', { basic: { nameAr: CASES.englishNameBlank.nameAr, type: CASES.englishNameBlank.type, providerType: CASES.englishNameBlank.providerType } });
    const drawer = await navigateAndOpenAdd(steps, list);
    let total = NaN;

    await steps.step('Leave the English Name field blank and complete all other mandatory fields with valid values - the other fields display the entered values', async () => {
      total = await totalNow(list);
      await fillBothStepsAndReturn(drawer, data);
      await drawer.clear('nameEn');
      expect(await readBasic(drawer)).toEqual({ nameEn: '', nameAr: CASES.englishNameBlank.nameAr, type: CASES.englishNameBlank.type, providerType: CASES.englishNameBlank.providerType, nationalCode: '', isActive: true });
    });

    await steps.step('Click Submit - a mandatory field validation error is displayed for English Name and the form remains open', async () => {
      const answer = await submitForm(drawer);
      expect({ sent: answer.status !== -1, error: await drawer.getFieldError('nameEn'), open: await drawer.isOpen(), total: await totalNow(list) }, said(answer))
        .toEqual({ sent: false, error: expect.stringMatching(MESSAGE.required), open: true, total });
    });
  });

  test(`TC-${CASES.arabicNameBlank.azureId}: should refuse to save and require the Arabic name when it is left blank`, async ({
    facilityManagementPage: list,
    discardFacilityNamed,
    steps,
  }) => {
    const data = validFacilityForm(CASES.arabicNameBlank.label, { basic: { type: 'Hospital' } });
    discardFacilityNamed(data.basic.nameEn as string);
    const drawer = await navigateAndOpenAdd(steps, list);
    let total = NaN;

    await steps.step('Enter a valid English Name but leave the Arabic Name field blank, and complete all other mandatory fields - the other fields display the entered values', async () => {
      total = await totalNow(list);
      await fillBothStepsAndReturn(drawer, data);
      await drawer.clear('nameAr');
      expect(await readBasic(drawer)).toEqual({ nameEn: data.basic.nameEn, nameAr: '', type: 'Hospital', providerType: 'Both', nationalCode: '', isActive: true });
    });

    await steps.step('Click Submit - a mandatory field validation error is displayed for Arabic Name and the form remains open', async () => {
      const answer = await submitForm(drawer);
      expect({ sent: answer.status !== -1, error: await drawer.getFieldError('nameAr'), open: await drawer.isOpen(), total: await totalNow(list) }, said(answer))
        .toEqual({ sent: false, error: expect.stringMatching(MESSAGE.required), open: true, total });
    });
  });

  test(`TC-${CASES.fullCreate.azureId}: should register a facility with complete bilingual and licence details, a generated code and Authority Code 1 for a Clinic`, async ({
    facilityManagementPage: list,
    discardFacilityNamed,
    page,
    steps,
  }) => {
    const data = CASES.fullCreate;
    const nameEn = suiteFacilityName(data.label);
    const nameAr = suiteFacilityArabicName();
    const email = suiteFacilityEmail();
    discardFacilityNamed(nameEn);
    let drawer!: FacilityFormDrawer;
    let answer!: FacilitySaveAnswer;

    await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.critical('Click "Create" to add a new facility - a new facility form opens on the Basic Information tab', async () => {
      drawer = await list.openAddForm();
      expect({ step: await drawer.currentStep(), labels: (await drawer.getStepLabels())[0] ?? '' }).toEqual({ step: 1, labels: expect.stringMatching(/basic information/i) });
    });

    await steps.step('Enter unique English and Arabic names, select Provider Type and Facility Type, leave National Code blank and check Is Active - all values are displayed', async () => {
      await drawer.fillBasic({ nameEn, nameAr, type: data.type, providerType: data.providerType, isActive: true });
      expect(await readBasic(drawer)).toEqual({ nameEn, nameAr, type: data.type, providerType: data.providerType, nationalCode: '', isActive: true });
    });

    await steps.step('Switch to the Contact & Licence tab and enter every contact, location and licence value with an expiry after the start - all values are displayed', async () => {
      expect(await drawer.next(), `step 1: ${(await drawer.getMessages()).join(' | ')}`).toBe(true);
      await drawer.fillContact({ email, ...FULL_CONTACT });
      const location = await drawer.clickMap(40, -25);
      const shown: Record<string, string> = {};
      for (const field of ['email', 'phone', 'mobile', 'buildingName', 'zipCode', 'unitNumber', 'additionalAddressEn', 'additionalAddressAr', 'licenseNo', 'licenseStart', 'licenseExpiry'] as const) {
        shown[field] = await drawer.getValue(field);
      }
      const { longitude, latitude, ...typed } = FULL_CONTACT;
      expect(shown).toEqual({ email, ...typed });
      const coordinate = /^-?\d+(\.\d+)?$/;
      expect(location, `the map location (typed ${longitude} / ${latitude} first, then picked on the map)`)
        .toEqual({ longitude: expect.stringMatching(coordinate), latitude: expect.stringMatching(coordinate) });
    });

    await steps.step('Click Submit - a success confirmation message is displayed and the facility record is saved', async () => {
      answer = await submitForm(drawer);
      expect({ saved: saved(answer), message: answer.messages.join(' | ') }, said(answer)).toEqual({ saved: true, message: expect.stringMatching(MESSAGE.created) });
      const created = await findFacilityByName(page, nameEn);
      expect(created, `"${nameEn}" in the register`).not.toBeNull();
      const record = await readFacility(page, created?.id ?? '');
      expect({ code: record.facilityCode, authorityCode: String(record.authorityCode), nameAr: record.facilityNameAr })
        .toEqual({ code: expect.stringMatching(/^FCL-\d+$/), authorityCode: data.authorityCode, nameAr });
    });
  });

  test(`TC-${CASES.codeOnForm.azureId}: should show a generated, read-only Facility Code of at most 20 characters on the form after saving`, async ({
    facilityManagementPage: list,
    discardFacilityNamed,
    page,
    steps,
  }) => {
    const data = validFacilityForm('Code On Form');
    const nameEn = data.basic.nameEn as string;
    discardFacilityNamed(nameEn);
    let drawer!: FacilityFormDrawer;

    await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.critical('Click "Create" and complete all mandatory fields with valid data - all values are displayed correctly in the form', async () => {
      drawer = await list.openAddForm();
      await drawer.fillBasic(data.basic);
      expect(await drawer.next()).toBe(true);
      await drawer.fillContact(data.contact);
      expect({ email: await drawer.getValue('email'), licenseNo: await drawer.getValue('licenseNo') }).toEqual({ email: data.contact.email, licenseNo: data.contact.licenseNo });
    });

    await steps.critical('Click Submit - a success message is displayed and the facility is saved', async () => {
      const answer = await submitForm(drawer);
      expect({ saved: saved(answer), message: answer.messages.join(' | ') }, said(answer)).toEqual({ saved: true, message: expect.stringMatching(MESSAGE.created) });
    });

    await steps.step('Reopen the saved facility and inspect the Facility Code field - a generated code of up to 20 characters is displayed and cannot be edited', async () => {
      const created = await findFacilityByName(page, nameEn);
      const code = created?.facilityCode ?? '';
      const form = await list.openEditForm(nameEn);
      const text = await form.getText();
      await form.close(true);
      expect({ codeOnForm: code !== '' && text.includes(code), length: code.length <= CASES.codeOnForm.maxLength },
        `the reopened form for ${code} reads: "${text.slice(0, 300)}"`).toEqual({ codeOnForm: true, length: true });
    });
  });

  test(`TC-${CASES.duplicateName.azureId}: should refuse a new facility whose English and Arabic names duplicate an existing one`, async ({
    facilityManagementPage: list,
    facilityIn,
    page,
    steps,
  }) => {
    const existing = await facilityIn('Active', { nameEn: suiteFacilityName(CASES.duplicateName.label) });
    const data = validFacilityForm('unused', { basic: { nameEn: existing.nameEn, nameAr: existing.nameAr, type: 'Clinic' } });
    let drawer!: FacilityFormDrawer;

    await steps.critical(`Navigate to the Facility Management module - the module opens showing the list of existing facilities, including "${existing.nameEn}"`, async () => {
      await list.openTable();
      expect(await list.isListed(existing.nameEn), `"${existing.nameEn}" listed`).toBe(true);
    });

    await steps.critical('Click "Create" to add a new facility - a new facility form opens', async () => {
      drawer = await list.openAddForm();
      expect(await drawer.getTitle()).toMatch(/add new facility/i);
    });

    await steps.step('Enter the English and Arabic names of the existing facility and complete the remaining mandatory fields - the duplicate names are displayed in the fields', async () => {
      await drawer.fillBasic(data.basic);
      expect({ nameEn: await drawer.getValue('nameEn'), nameAr: await drawer.getValue('nameAr') }).toEqual({ nameEn: existing.nameEn, nameAr: existing.nameAr });
      expect(await drawer.next()).toBe(true);
      await drawer.fillContact(data.contact);
    });

    await steps.step('Click Submit - a uniqueness validation error is displayed indicating the name already exists', async () => {
      const answer = await submitForm(drawer);
      const same = (await listFacilityRegister(page, { searchText: existing.nameEn }, 50)).items.filter((i) => i.facilityNameEn === existing.nameEn);
      expect({ saved: saved(answer), message: answer.messages.join(' | '), facilitiesNamed: same.length }, said(answer))
        .toEqual({ saved: false, message: expect.stringMatching(MESSAGE.duplicate), facilitiesNamed: 1 });
    });

    await drawer.close(true).catch(() => undefined);
  });

  test(`TC-${CASES.codeLength.azureId}: should display a saved facility's whole Facility Code, never longer than 20 characters`, async ({
    facilityManagementPage: list,
    facilityDetailPage: detail,
    facilityIn,
    page,
    steps,
  }) => {
    const facility = await facilityIn('Active');
    let code = '';

    await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.step('Open a saved facility record and inspect the generated Facility Code - the full code value is visible in the field without truncation', async () => {
      await detail.open(facility.id);
      code = await detail.readOverviewField('facilityCode');
      expect({ code, truncated: await isCodeTruncated(page) }).toEqual({ code: facility.code, truncated: false });
    });

    await steps.step(`Verify the length of the displayed code against the ${CASES.codeLength.maxLength}-character limit - the code is ${CASES.codeLength.maxLength} characters or fewer`, async () => {
      const longer = (await listFacilityRegister(page, {}, 1000)).items.map((i) => i.facilityCode).filter((c) => c.length > CASES.codeLength.maxLength);
      expect({ length: code.length <= CASES.codeLength.maxLength, longerCodes: longer }, `"${code}" (${code.length})`).toEqual({ length: true, longerCodes: [] });
    });
  });

  test(`TC-${CASES.authorityCode.azureId}: should set the Authority Code to 1, 2 and 3 for a Clinic, a Hospital and a Pharmacy`, async ({
    facilityManagementPage: list,
    discardFacilityNamed,
    page,
    steps,
  }) => {
    await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    for (const [i, { type, code }] of CASES.authorityCode.types.entries()) {
      await steps.step(`Create ${i === 0 ? 'a' : i === 1 ? 'a second' : 'a third'} facility selecting Facility Type = ${type} and save - the Authority Code field shows value ${code}`, async () => {
        const data = validFacilityForm(`Authority ${type}`, { basic: { type } });
        discardFacilityNamed(data.basic.nameEn as string);
        const drawer = await list.openAddForm();
        await drawer.fillBasic(data.basic);
        const onForm = await drawer.getAuthorityCode();
        expect(await drawer.next()).toBe(true);
        await drawer.fillContact(data.contact);
        const answer = await submitForm(drawer);
        const created = await findFacilityByName(page, data.basic.nameEn as string);
        const record = created ? await readFacility(page, created.id) : null;
        expect({ onForm, saved: saved(answer), savedCode: String(record?.authorityCode ?? '') }, said(answer)).toEqual({ onForm: code, saved: true, savedCode: code });
      });
    }
  });

  test(`TC-${CASES.typeMissing.azureId}: should refuse to save, require a Facility Type and leave the Authority Code empty when no type is selected`, async ({
    facilityManagementPage: list,
    steps,
  }) => {
    const data = validFacilityForm('No Type', { basic: { type: undefined } });
    let drawer!: FacilityFormDrawer;
    let total = NaN;

    await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.step('Click "Create" and complete all mandatory fields except Facility Type - the other fields display the entered values while Facility Type stays unselected', async () => {
      total = await totalNow(list);
      drawer = await list.openAddForm();
      await drawer.fillBasic(data.basic);
      const shown = await readBasic(drawer);
      expect({ nameEn: shown.nameEn, nameAr: shown.nameAr, providerType: shown.providerType, typeChosen: ['Clinic', 'Hospital', 'Pharmacy'].includes(String(shown.type)) })
        .toEqual({ nameEn: data.basic.nameEn, nameAr: data.basic.nameAr, providerType: 'Both', typeChosen: false });
    });

    await steps.step('Click Submit - a mandatory field validation error is displayed for Facility Type and the Authority Code remains unpopulated', async () => {
      const answer = await submitForm(drawer);
      expect({ sent: answer.status !== -1, error: await drawer.getFieldError('type'), authorityCode: await drawer.getAuthorityCode(), total: await totalNow(list) }, said(answer))
        .toEqual({ sent: false, error: expect.stringMatching(MESSAGE.required), authorityCode: '', total });
    });
  });

  test(`TC-${CASES.providerMissing.azureId}: should refuse to save and require a Provider Type when none is selected`, async ({
    facilityManagementPage: list,
    steps,
  }) => {
    const data = validFacilityForm('No Provider', { basic: { providerType: undefined } });
    let drawer!: FacilityFormDrawer;
    let total = NaN;

    await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.step('Click "Create" and complete all mandatory fields except Provider Type - the other fields display the entered values while Provider Type stays unselected', async () => {
      total = await totalNow(list);
      drawer = await list.openAddForm();
      await drawer.fillBasic(data.basic);
      const shown = await readBasic(drawer);
      expect({ nameEn: shown.nameEn, nameAr: shown.nameAr, type: shown.type, providerChosen: ['Both', 'Integration Provider', 'Provider Portal'].includes(String(shown.providerType)) })
        .toEqual({ nameEn: data.basic.nameEn, nameAr: data.basic.nameAr, type: 'Pharmacy', providerChosen: false });
    });

    await steps.step('Click Submit - a mandatory field validation error is displayed for Provider Type', async () => {
      const answer = await submitForm(drawer);
      expect({ sent: answer.status !== -1, error: await drawer.getFieldError('providerType'), total: await totalNow(list) }, said(answer))
        .toEqual({ sent: false, error: expect.stringMatching(MESSAGE.required), total });
    });
  });

  test(`TC-${CASES.isActiveBox.azureId}: should list a facility saved with Is Active unchecked as inactive and one saved checked as active`, async ({
    facilityManagementPage: list,
    discardFacilityNamed,
    steps,
  }) => {
    await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    for (const { active, label, status } of [
      { active: false, label: 'leaving the Is Active checkbox unchecked', status: 'Inactive' },
      { active: true, label: 'with the Is Active checkbox checked', status: 'Active' },
    ]) {
      await steps.step(`Create a facility ${label} and save - the facility list shows the new record with ${active ? 'an active' : 'an inactive'} status`, async () => {
        const data = validFacilityForm(active ? 'Is Active On' : 'Is Active Off', { basic: { isActive: active } });
        discardFacilityNamed(data.basic.nameEn as string);
        const { answer } = await createThroughForm(list, data);
        expect(saved(answer), said(answer)).toBe(true);
        expect((await list.readRow(data.basic.nameEn as string)).status).toBe(status);
      });
    }
  });

  test(`TC-${CASES.nationalCodeOptional.azureId}: should save a facility without the optional National Code`, async ({
    facilityManagementPage: list,
    discardFacilityNamed,
    page,
    steps,
  }) => {
    const data = validFacilityForm('No National Code');
    discardFacilityNamed(data.basic.nameEn as string);
    let drawer!: FacilityFormDrawer;

    await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.step('Click "Create" and complete all mandatory fields, leaving National Code blank - National Code stays empty while the other fields show the entered data', async () => {
      drawer = await list.openAddForm();
      await drawer.fillBasic(data.basic);
      expect({ nationalCode: await drawer.getValue('nationalCode'), nameEn: await drawer.getValue('nameEn') }).toEqual({ nationalCode: '', nameEn: data.basic.nameEn });
      expect(await drawer.next()).toBe(true);
      await drawer.fillContact(data.contact);
      expect(await drawer.getValue('licenseNo')).toBe(data.contact.licenseNo);
    });

    await steps.step('Click Submit - a success confirmation message is displayed and the record is saved', async () => {
      const answer = await submitForm(drawer);
      expect({ saved: saved(answer), message: answer.messages.join(' | ') }, said(answer)).toEqual({ saved: true, message: expect.stringMatching(MESSAGE.created) });
      const created = await findFacilityByName(page, data.basic.nameEn as string);
      expect(created, 'the saved record').not.toBeNull();
      expect((await readFacility(page, created?.id ?? '')).nationalCode ?? '', 'its National Code').toBe('');
    });
  });

  for (const missing of [
    { data: CASES.licenceNoMissing, field: 'licenseNo' as const, name: 'Licence Number', entered: 'valid Start and Expiry Dates', expected: 'the Licence Number field remains empty' },
    { data: CASES.expiryMissing, field: 'licenseExpiry' as const, name: 'Licence Expiry Date', entered: 'a Licence Number and Start Date', expected: 'the Expiry Date field remains empty' },
    { data: CASES.startMissing, field: 'licenseStart' as const, name: 'Licence Start Date', entered: 'a Licence Number and Expiry Date', expected: 'the Start Date field remains empty' },
  ]) {
    test(`TC-${missing.data.azureId}: should refuse to save and require the ${missing.name} when it is left blank`, async ({
      facilityManagementPage: list,
      discardFacilityNamed,
      steps,
    }) => {
      const data = validFacilityForm(`No ${missing.name}`);
      discardFacilityNamed(data.basic.nameEn as string);
      let drawer!: FacilityFormDrawer;
      let total = NaN;

      await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
        await list.openTable();
        expect(await list.countRows()).toBeGreaterThan(0);
      });

      await steps.step(`Click "Create", complete the Basic Information tab, then on the Contact & Licence tab enter ${missing.entered} but leave the ${missing.name} blank - ${missing.expected}`, async () => {
        total = await totalNow(list);
        drawer = await list.openAddForm();
        await drawer.fillBasic(data.basic);
        expect(await drawer.next()).toBe(true);
        await drawer.fillContact({ ...data.contact, [missing.field]: undefined });
        expect(await drawer.getValue(missing.field)).toBe('');
      });

      await steps.step(`Click Submit - a mandatory field validation error is displayed for ${missing.name}`, async () => {
        const answer = await submitForm(drawer);
        expect({ saved: saved(answer), error: await drawer.getFieldError(missing.field), total: await totalNow(list) }, said(answer))
          .toEqual({ saved: false, error: expect.stringMatching(MESSAGE.required), total });
      });
    });
  }

  test(`TC-${CASES.expiryNotLater.azureId}: should refuse a licence expiry date equal to or earlier than the start date`, async ({
    facilityManagementPage: list,
    discardFacilityNamed,
    steps,
  }) => {
    const data = CASES.expiryNotLater;
    const form = validFacilityForm('Expiry Same Day', { contact: { licenseStart: data.start, licenseExpiry: data.sameDay } });
    discardFacilityNamed(form.basic.nameEn as string);
    let drawer!: FacilityFormDrawer;

    await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.critical(`Click "Create", complete Basic Information, then enter Start Date ${data.start} and an Expiry Date equal to it - both dates are displayed as entered`, async () => {
      drawer = await list.openAddForm();
      await drawer.fillBasic(form.basic);
      expect(await drawer.next()).toBe(true);
      await drawer.fillContact(form.contact);
      expect({ start: await drawer.getValue('licenseStart'), expiry: await drawer.getValue('licenseExpiry') }).toEqual({ start: data.start, expiry: data.sameDay });
    });

    await steps.step('Click Submit - a date validation error states the expiry date must be later than the start date', async () => {
      const answer = await submitForm(drawer);
      expect({ saved: saved(answer), error: await drawer.getFieldError('licenseExpiry') }, said(answer)).toEqual({ saved: false, error: expect.stringMatching(MESSAGE.dateOrder) });
    });

    await steps.step(`Change the Expiry Date to ${data.earlier}, earlier than the Start Date, and click Submit again - the same date validation error is displayed`, async () => {
      if (!(await drawer.isOpen())) {
        // The same-day save went through (the finding above): a fresh Add form for this half.
        const again = validFacilityForm('Expiry Earlier', { contact: { licenseStart: data.start, licenseExpiry: data.sameDay } });
        discardFacilityNamed(again.basic.nameEn as string);
        drawer = await list.openAddForm();
        await drawer.fillBasic(again.basic);
        expect(await drawer.next()).toBe(true);
        await drawer.fillContact(again.contact);
      }
      await drawer.type('licenseExpiry', data.earlier);
      const answer = await submitForm(drawer);
      expect({ saved: saved(answer), error: await drawer.getFieldError('licenseExpiry') }, said(answer)).toEqual({ saved: false, error: expect.stringMatching(MESSAGE.dateOrder) });
    });
  });

  test(`TC-${CASES.expiryNextDay.azureId}: should accept a licence expiry date exactly one day after the start date`, async ({
    facilityManagementPage: list,
    discardFacilityNamed,
    steps,
  }) => {
    const data = CASES.expiryNextDay;
    const form = validFacilityForm('Expiry Next Day', { contact: { licenseStart: data.start, licenseExpiry: data.expiry } });
    discardFacilityNamed(form.basic.nameEn as string);
    let drawer!: FacilityFormDrawer;

    await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.critical(`Click "Create", complete Basic Information, then set Start Date ${data.start} and Expiry Date ${data.expiry} - both dates are displayed correctly`, async () => {
      drawer = await list.openAddForm();
      await drawer.fillBasic(form.basic);
      expect(await drawer.next()).toBe(true);
      await drawer.fillContact(form.contact);
      expect({ start: await drawer.getValue('licenseStart'), expiry: await drawer.getValue('licenseExpiry') }).toEqual({ start: data.start, expiry: data.expiry });
    });

    await steps.step('Click Submit - a success confirmation message is displayed and the record is saved', async () => {
      const answer = await submitForm(drawer);
      expect({ saved: saved(answer), message: answer.messages.join(' | ') }, said(answer)).toEqual({ saved: true, message: expect.stringMatching(MESSAGE.created) });
      expect(await list.isListed(form.basic.nameEn as string), 'the saved facility in the list').toBe(true);
    });
  });

  test(`TC-${CASES.licenceStatus.azureId}: should show a facility with a future expiry as active and one with a past expiry as expired`, async ({
    facilityManagementPage: list,
    discardFacilityNamed,
    steps,
  }) => {
    const data = CASES.licenceStatus;

    await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.step(`Create Facility A with a Licence Expiry Date in the future (${data.futureExpiry}) and save - it is saved and its licence status shows as valid/active`, async () => {
      const form = validFacilityForm('Licence Valid', { contact: { licenseStart: data.futureStart, licenseExpiry: data.futureExpiry } });
      discardFacilityNamed(form.basic.nameEn as string);
      const { answer } = await createThroughForm(list, form);
      expect(saved(answer), said(answer)).toBe(true);
      expect((await list.readRow(form.basic.nameEn as string)).status).toBe('Active');
    });

    await steps.step(`Create Facility B with a Licence Expiry Date in the past (${data.pastExpiry}) and save - it is saved and its licence status shows as expired`, async () => {
      const form = validFacilityForm('Licence Expired', { contact: { licenseStart: data.pastStart, licenseExpiry: data.pastExpiry } });
      discardFacilityNamed(form.basic.nameEn as string);
      const { answer } = await createThroughForm(list, form);
      expect(saved(answer), said(answer)).toBe(true);
      expect((await list.readRow(form.basic.nameEn as string)).status).toBe('Expired');
    });
  });

  test(`TC-${CASES.emailFormat.azureId}: should refuse to save an improperly formatted email address`, async ({
    facilityManagementPage: list,
    discardFacilityNamed,
    steps,
  }) => {
    const form = validFacilityForm('Bad Email', { contact: { email: CASES.emailFormat.email } });
    discardFacilityNamed(form.basic.nameEn as string);
    let drawer!: FacilityFormDrawer;

    await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.step(`Click "Create", complete Basic Information, then enter the email "${CASES.emailFormat.email}" - the value is displayed in the Email field`, async () => {
      drawer = await list.openAddForm();
      await drawer.fillBasic(form.basic);
      expect(await drawer.next()).toBe(true);
      await drawer.fillContact(form.contact);
      expect(await drawer.getValue('email')).toBe(CASES.emailFormat.email);
    });

    await steps.step('Click Submit - a validation error indicates the email format is invalid', async () => {
      const answer = await submitForm(drawer);
      expect({ saved: saved(answer), error: await drawer.getFieldError('email') }, said(answer)).toEqual({ saved: false, error: expect.stringMatching(MESSAGE.email) });
    });
  });

  test(`TC-${CASES.phoneFormat.azureId}: should refuse to save a phone number with letters and a too-short mobile number`, async ({
    facilityManagementPage: list,
    discardFacilityNamed,
    page,
    steps,
  }) => {
    const data = CASES.phoneFormat;
    const form = validFacilityForm('Bad Phone', { contact: { phone: data.phone, mobile: data.mobile } });
    discardFacilityNamed(form.basic.nameEn as string);
    let drawer!: FacilityFormDrawer;

    await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.step(`Click "Create", complete Basic Information, then enter Phone "${data.phone}" and Mobile "${data.mobile}" - the values are displayed in their fields`, async () => {
      drawer = await list.openAddForm();
      await drawer.fillBasic(form.basic);
      expect(await drawer.next()).toBe(true);
      await drawer.fillContact(form.contact);
      expect({ phone: await drawer.getValue('phone'), mobile: await drawer.getValue('mobile') }).toEqual({ phone: data.phone, mobile: data.mobile });
    });

    await steps.step('Click Submit - validation errors indicate the phone and mobile number formats are invalid', async () => {
      const answer = await submitForm(drawer);
      expect({ saved: saved(answer), phoneError: await readExpectedError(page, 'phone') !== '', mobileError: await readExpectedError(page, 'mobile') !== '' }, said(answer))
        .toEqual({ saved: false, phoneError: true, mobileError: true });
    });
  });

  test(`TC-${CASES.coordinateRange.azureId}: should refuse to save a longitude and a latitude outside the geographic ranges`, async ({
    facilityManagementPage: list,
    discardFacilityNamed,
    page,
    steps,
  }) => {
    const data = CASES.coordinateRange;
    const form = validFacilityForm('Bad Coordinates', { contact: { longitude: data.longitude, latitude: data.latitude } });
    discardFacilityNamed(form.basic.nameEn as string);
    let drawer!: FacilityFormDrawer;

    await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.step(`Click "Create", complete Basic Information, then enter Longitude ${data.longitude} and Latitude ${data.latitude} - the out-of-range values are displayed in their fields`, async () => {
      drawer = await list.openAddForm();
      await drawer.fillBasic(form.basic);
      expect(await drawer.next()).toBe(true);
      await drawer.fillContact(form.contact);
      const shown = await drawer.readCoordinates();
      expect({ longitude: Number(shown.longitude.replace(/,/g, '')), latitude: Number(shown.latitude.replace(/,/g, '')) }).toEqual({ longitude: Number(data.longitude), latitude: Number(data.latitude) });
    });

    await steps.step('Click Submit - a validation error indicates the coordinate values are out of the valid range and the record is not saved', async () => {
      const answer = await submitForm(drawer);
      const errors = `${await readExpectedError(page, 'longitude')} ${await readExpectedError(page, 'latitude')}`.trim();
      expect({ saved: saved(answer), coordinateError: errors !== '' || /range|longitude|latitude/i.test(answer.messages.join(' ')) }, said(answer))
        .toEqual({ saved: false, coordinateError: true });
    });
  });

  test(`TC-${CASES.stepRetained.azureId}: should keep the Basic Information values after moving to Contact & Licence and back`, async ({
    facilityManagementPage: list,
    steps,
  }) => {
    const data = validFacilityForm('Step Retained', { basic: { type: 'Hospital', providerType: 'Provider Portal', nationalCode: CASES.stepRetained.nationalCode, isActive: false } });
    let drawer!: FacilityFormDrawer;
    let entered: Record<string, string | boolean> = {};

    await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
      await list.openTable();
      expect(await list.countRows()).toBeGreaterThan(0);
    });

    await steps.critical('Click "Create" and enter valid values on the Basic Information tab without saving - the entered values are displayed in their fields', async () => {
      drawer = await list.openAddForm();
      await drawer.fillBasic(data.basic);
      entered = await readBasic(drawer);
      expect(entered).toEqual({ nameEn: data.basic.nameEn, nameAr: data.basic.nameAr, type: 'Hospital', providerType: 'Provider Portal', nationalCode: CASES.stepRetained.nationalCode, isActive: false });
    });

    await steps.critical('Switch to the Contact & Licence tab - the contact and licence tab is displayed', async () => {
      expect(await drawer.next(), `step 1: ${(await drawer.getMessages()).join(' | ')}`).toBe(true);
      expect(await drawer.currentStep()).toBe(2);
    });

    await steps.step('Switch back to the Basic Information tab - the previously entered values are still displayed unchanged', async () => {
      await drawer.back();
      const shown = await readBasic(drawer);
      await drawer.close(true).catch(() => undefined);
      expect(shown).toEqual(entered);
    });
  });
});
