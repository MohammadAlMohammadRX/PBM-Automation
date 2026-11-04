import { test, expect } from '../../../fixtures';
import type { FacilityFormDrawer, FacilitySaveAnswer } from '../../../pages/facility/FacilityFormDrawer';
import {
  ARABIC_ONLY,
  CASES,
  EMAIL_INVALID,
  EXPIRY_AFTER_START,
  NOT_UNIQUE,
  REQUIRED,
  UPDATED_TOAST,
} from '../../../data/facility/editFacility.data';
import { facilityDayText, facilityStamp, facilityTypeId, readFacility, suiteFacilityName } from '../../../utils/FacilityProvisioning';
import {
  codeOnForm,
  submitForm,
  toContactStep,
  waitForToastsGone,
  watchUpdateRequest,
} from '../../../utils/facility/writerCHelpers';

/** A save the application accepted. */
const accepted = (answer: FacilitySaveAnswer): boolean => answer.status >= 200 && answer.status < 300;

/** What a save answered, for a failure message. */
const said = (answer: FacilitySaveAnswer): string => `${answer.status} ${answer.text.slice(0, 200)} ${answer.messages.join(' | ')}`;

/**
 * User story 15143: Edit facility.
 * Edit opens the facility drawer ("Edit Facility") loaded with the record;
 * Save sends UpdateFacility and applies at once; invalid data is refused on
 * screen (step 1 on Next, step 2 on Save) or by the server, and the record
 * keeps its values. Every facility is the suite's own (fixture `facilityIn`).
 */
test.describe('US 15143 - Edit facility', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.validUpdate.azureId}: should save valid updates to a facility's phone number and address`, async ({
    page,
    facilityIn,
    facilityManagementPage,
    steps,
  }) => {
    const data = CASES.validUpdate;
    const facility = await facilityIn('Active');
    let drawer!: FacilityFormDrawer;

    await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Click "Edit" next to a facility record - the edit form opens pre-populated with existing data', async () => {
      drawer = await facilityManagementPage.openEditForm(facility.nameEn);
      expect(await drawer.getValue('nameEn')).toBe(facility.nameEn);
    });

    await steps.step(`Update the phone number ("${data.phone}") and address ("${data.buildingName}") with new valid values - the updated values are displayed in the form`, async () => {
      await toContactStep(drawer);
      await drawer.type('phone', data.phone);
      await drawer.type('buildingName', data.buildingName);
      expect({ phone: await drawer.getValue('phone'), buildingName: await drawer.getValue('buildingName') }).toEqual({ phone: data.phone, buildingName: data.buildingName });
    });

    await steps.step('Click Submit - a success confirmation message is displayed, the changes are saved and persist when the form is reopened', async () => {
      const answer = await submitForm(page, drawer);
      expect(accepted(answer), `the save answered ${said(answer)}`).toBe(true);
      expect(answer.messages.join(' | '), 'the success message').toMatch(UPDATED_TOAST);
      const saved = await readFacility(page, facility.id);
      expect({ phone: saved.phoneNumber, buildingName: saved.buildingName }, 'the saved record').toEqual({ phone: data.phone, buildingName: data.buildingName });
      const reopened = await facilityManagementPage.openEditForm(facility.nameEn);
      await toContactStep(reopened);
      expect({ phone: await reopened.getValue('phone'), buildingName: await reopened.getValue('buildingName') }, 'the reopened form').toEqual({ phone: data.phone, buildingName: data.buildingName });
      await reopened.close(true);
    });
  });

  test(`TC-${CASES.opensEditForm.azureId}: should open the edit form pre-populated with the selected facility's data`, async ({
    facilityIn,
    facilityManagementPage,
    steps,
  }) => {
    const facility = await facilityIn('Active');

    await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.step('Click the "Edit" button next to a specific facility record - the Facility Information edit form opens pre-populated with that record\'s data', async () => {
      const drawer = await facilityManagementPage.openEditForm(facility.nameEn);
      expect(await drawer.getTitle(), 'the form title').toMatch(/edit/i);
      const basic = { nameEn: await drawer.getValue('nameEn'), nameAr: await drawer.getValue('nameAr'), type: await drawer.readSelect('type') };
      await toContactStep(drawer);
      const contact = { email: await drawer.getValue('email'), licenseNo: await drawer.getValue('licenseNo'), licenseExpiry: await drawer.getValue('licenseExpiry') };
      expect({ ...basic, ...contact }, 'the edit form values').toEqual({
        nameEn: facility.nameEn,
        nameAr: facility.nameAr,
        type: 'Pharmacy',
        email: facility.email,
        licenseNo: facility.licenseNo,
        licenseExpiry: facilityDayText(facility.licenseExpiryDate),
      });
      await drawer.close(true);
    });
  });

  test(`TC-${CASES.invalidArabic.azureId}: should reject non-Arabic characters in the Arabic name and keep the original data`, async ({
    page,
    facilityIn,
    facilityManagementPage,
    steps,
  }) => {
    const data = CASES.invalidArabic;
    const facility = await facilityIn('Active');
    let drawer!: FacilityFormDrawer;

    await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Click "Edit" next to a facility record - the edit form opens pre-populated with existing data', async () => {
      drawer = await facilityManagementPage.openEditForm(facility.nameEn);
      expect(await drawer.getValue('nameAr')).toBe(facility.nameAr);
    });

    await steps.step(`Change the Arabic Name to "${data.nameAr}" - the invalid value is displayed in the field`, async () => {
      await drawer.type('nameAr', data.nameAr);
      expect(await drawer.getValue('nameAr')).toBe(data.nameAr);
    });

    await steps.step('Click Submit - an error message is displayed and the invalid change is discarded', async () => {
      const answer = await submitForm(page, drawer);
      expect(accepted(answer), `the save answered ${said(answer)}`).toBe(false);
      expect(answer.messages.join(' | '), 'the error message').toMatch(ARABIC_ONLY);
      expect((await readFacility(page, facility.id)).facilityNameAr, 'the stored Arabic name').toBe(facility.nameAr);
      await drawer.close(true);
    });
  });

  test(`TC-${CASES.leaveAfterError.azureId}: should let the administrator leave the edit form without saving after a validation error`, async ({
    page,
    facilityIn,
    facilityManagementPage,
    steps,
  }) => {
    const facility = await facilityIn('Active');
    let drawer!: FacilityFormDrawer;

    await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.step('Click "Edit", clear the mandatory License Number and click Submit - an error message is displayed and the change is discarded', async () => {
      drawer = await facilityManagementPage.openEditForm(facility.nameEn);
      await toContactStep(drawer);
      await drawer.clear('licenseNo');
      const answer = await submitForm(page, drawer);
      expect(accepted(answer), `the save answered ${said(answer)}`).toBe(false);
      expect(answer.messages.join(' | '), 'the error message').toMatch(REQUIRED);
      expect((await readFacility(page, facility.id)).licenseNo, 'the stored licence number').toBe(facility.licenseNo);
    });

    await steps.step('Wait for the error message to disappear, then navigate away without correcting or resubmitting - the system exits the edit form without saving', async () => {
      expect(await waitForToastsGone(page), 'the error toast went away').toBe(true);
      const sent = watchUpdateRequest(page);
      await drawer.close(true);
      expect(await drawer.isOpen(), 'the edit form after leaving').toBe(false);
      expect(await sent, 'an update sent while leaving').toBeNull();
      expect((await readFacility(page, facility.id)).licenseNo, 'the stored licence number').toBe(facility.licenseNo);
      const reopened = await facilityManagementPage.openEditForm(facility.nameEn);
      await toContactStep(reopened);
      expect(await reopened.getValue('licenseNo'), 'the reopened form').toBe(facility.licenseNo);
      await reopened.close(true);
    });
  });

  test(`TC-${CASES.mandatoryCleared.azureId}: should not let a mandatory field be cleared during an edit`, async ({
    page,
    facilityIn,
    facilityManagementPage,
    steps,
  }) => {
    const facility = await facilityIn('Active');
    let drawer!: FacilityFormDrawer;

    await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Click "Edit" next to a facility record - the edit form opens pre-populated with existing data', async () => {
      drawer = await facilityManagementPage.openEditForm(facility.nameEn);
      expect(await drawer.getValue('nameEn')).toBe(facility.nameEn);
    });

    await steps.step('Clear the English Name field, leaving it blank - the field appears empty', async () => {
      await drawer.clear('nameEn');
      expect(await drawer.getValue('nameEn')).toBe('');
    });

    await steps.step('Click Submit - a mandatory field validation error is displayed and the change is discarded', async () => {
      const answer = await submitForm(page, drawer);
      expect(accepted(answer), `the save answered ${said(answer)}`).toBe(false);
      expect(answer.messages.join(' | '), 'the mandatory field error').toMatch(REQUIRED);
      expect((await readFacility(page, facility.id)).facilityNameEn, 'the stored English name').toBe(facility.nameEn);
      await drawer.close(true);
    });
  });

  test(`TC-${CASES.correctAndResubmit.azureId}: should save after the administrator corrects invalid data and resubmits`, async ({
    page,
    facilityIn,
    facilityManagementPage,
    steps,
  }) => {
    const data = CASES.correctAndResubmit;
    const corrected = data.correctedEmail(facilityStamp());
    const facility = await facilityIn('Active');
    let drawer!: FacilityFormDrawer;

    await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.step(`Click "Edit", enter the invalid e-mail "${data.invalidEmail}" and click Submit - an error message is displayed and the change is discarded`, async () => {
      drawer = await facilityManagementPage.openEditForm(facility.nameEn);
      await toContactStep(drawer);
      await drawer.type('email', data.invalidEmail);
      const answer = await submitForm(page, drawer);
      expect(accepted(answer), `the save answered ${said(answer)}`).toBe(false);
      expect(answer.messages.join(' | '), 'the error message').toMatch(EMAIL_INVALID);
      expect((await readFacility(page, facility.id)).email, 'the stored e-mail').toBe(facility.email);
    });

    await steps.step(`Wait for the error message to disappear, then correct the e-mail ("${corrected}") - the corrected value is displayed`, async () => {
      expect(await waitForToastsGone(page), 'the error toast went away').toBe(true);
      await drawer.type('email', corrected);
      expect(await drawer.getValue('email')).toBe(corrected);
    });

    await steps.step('Click Submit again - a success confirmation message is displayed and the changes are saved', async () => {
      const answer = await submitForm(page, drawer);
      expect(accepted(answer), `the save answered ${said(answer)}`).toBe(true);
      expect(answer.messages.join(' | '), 'the success message').toMatch(UPDATED_TOAST);
      expect((await readFacility(page, facility.id)).email, 'the stored e-mail').toBe(corrected);
    });
  });

  test(`TC-${CASES.duplicateNames.azureId}: should not allow a facility's names to be changed to another facility's names`, async ({
    page,
    facilityIn,
    facilityManagementPage,
    steps,
  }) => {
    const data = CASES.duplicateNames;
    const a = await facilityIn('Active', { nameEn: suiteFacilityName(data.labelA) });
    const b = await facilityIn('Active', { nameEn: suiteFacilityName(data.labelB) });
    let drawer!: FacilityFormDrawer;

    await steps.critical('Navigate to the Facility Management module - the list shows the existing facilities, including Facility A and Facility B', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(a.nameEn), 'Facility A').toBe(true);
      expect(await facilityManagementPage.isListed(b.nameEn), 'Facility B').toBe(true);
    });

    await steps.critical('Click "Edit" next to Facility A - the edit form opens pre-populated with Facility A\'s data', async () => {
      drawer = await facilityManagementPage.openEditForm(a.nameEn);
      expect(await drawer.getValue('nameEn')).toBe(a.nameEn);
    });

    await steps.step('Change Facility A\'s English and Arabic names to exactly match Facility B\'s names - the duplicate names are displayed in the fields', async () => {
      await drawer.fillBasic({ nameEn: b.nameEn, nameAr: b.nameAr });
      expect({ nameEn: await drawer.getValue('nameEn'), nameAr: await drawer.getValue('nameAr') }).toEqual({ nameEn: b.nameEn, nameAr: b.nameAr });
    });

    await steps.step('Click Submit - a uniqueness validation error is displayed and the change is discarded', async () => {
      const answer = await submitForm(page, drawer);
      expect(accepted(answer), `the save answered ${said(answer)}`).toBe(false);
      expect(`${answer.text} ${answer.messages.join(' | ')}`, 'the uniqueness error').toMatch(NOT_UNIQUE);
      const stored = await readFacility(page, a.id);
      expect({ nameEn: stored.facilityNameEn, nameAr: stored.facilityNameAr }, 'Facility A\'s stored names').toEqual({ nameEn: a.nameEn, nameAr: a.nameAr });
      await drawer.close(true).catch(() => undefined);
    });
  });

  test(`TC-${CASES.expiryBeforeStart.azureId}: should reject a licence expiry date earlier than the start date during edit`, async ({
    page,
    facilityIn,
    facilityManagementPage,
    steps,
  }) => {
    const data = CASES.expiryBeforeStart;
    const facility = await facilityIn('Active', { licenseStartDate: data.licenseStartDate });
    let drawer!: FacilityFormDrawer;

    await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Click "Edit" next to a facility record - the edit form opens pre-populated with the existing licence dates', async () => {
      drawer = await facilityManagementPage.openEditForm(facility.nameEn);
      await toContactStep(drawer);
      expect({ start: await drawer.getValue('licenseStart'), expiry: await drawer.getValue('licenseExpiry') })
        .toEqual({ start: facilityDayText(data.licenseStartDate), expiry: facilityDayText(facility.licenseExpiryDate) });
    });

    await steps.step(`Change the Licence Expiry Date to ${data.newExpiry}, earlier than the start date - the new, earlier date is displayed in the field`, async () => {
      await drawer.type('licenseExpiry', data.newExpiry);
      expect(await drawer.getValue('licenseExpiry')).toBe(data.newExpiry);
    });

    await steps.step('Click Submit - a date validation error says the expiry date must be later than the start date, and the change is discarded', async () => {
      const answer = await submitForm(page, drawer);
      expect(accepted(answer), `the save answered ${said(answer)}`).toBe(false);
      expect(answer.messages.join(' | '), 'the date validation error').toMatch(EXPIRY_AFTER_START);
      const stored = await readFacility(page, facility.id);
      expect({ start: String(stored.licenseStartDate).slice(0, 10), expiry: String(stored.licenseExpiryDate).slice(0, 10) }, 'the stored licence dates')
        .toEqual({ start: facility.licenseStartDate.slice(0, 10), expiry: facility.licenseExpiryDate.slice(0, 10) });
      await drawer.close(true).catch(() => undefined);
    });
  });

  test(`TC-${CASES.authorityCode.azureId}: should update the authority code automatically when the facility type changes during editing`, async ({
    page,
    facilityIn,
    facilityManagementPage,
    facilityDetailPage,
    steps,
  }) => {
    const data = CASES.authorityCode;
    const facility = await facilityIn('Active', { type: 'clinic' });
    let drawer!: FacilityFormDrawer;

    await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.step(`Click "Edit" next to the facility - the edit form shows Facility Type ${data.from} and Authority Code ${data.codeBefore}`, async () => {
      drawer = await facilityManagementPage.openEditForm(facility.nameEn);
      expect({ type: await drawer.readSelect('type'), authorityCode: await drawer.getAuthorityCode() }).toEqual({ type: data.from, authorityCode: data.codeBefore });
    });

    await steps.step(`Change Facility Type from ${data.from} to ${data.to} - the Facility Type field updates to ${data.to}`, async () => {
      await drawer.choose('type', data.to);
      expect(await drawer.readSelect('type')).toBe(data.to);
    });

    await steps.step(`Click Submit - a success message is displayed and the record is saved with the Authority Code updated to ${data.codeAfter}`, async () => {
      const answer = await submitForm(page, drawer);
      expect(accepted(answer), `the save answered ${said(answer)}`).toBe(true);
      expect(answer.messages.join(' | '), 'the success message').toMatch(UPDATED_TOAST);
      const stored = await readFacility(page, facility.id);
      expect({ typeId: stored.typeId, authorityCode: String(stored.authorityCode) }, 'the saved record')
        .toEqual({ typeId: await facilityTypeId(page, 'hospital'), authorityCode: data.codeAfter });
      await facilityDetailPage.open(facility.id);
      expect(await facilityDetailPage.readOverviewField('authorityCode'), 'the Overview\'s Authority Code').toBe(data.codeAfter);
    });
  });

  test(`TC-${CASES.codeReadOnly.azureId}: should keep the facility code read-only and unchanged while editing`, async ({
    page,
    facilityIn,
    facilityManagementPage,
    steps,
  }) => {
    const data = CASES.codeReadOnly;
    const facility = await facilityIn('Active');
    let drawer!: FacilityFormDrawer;

    await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
      await facilityManagementPage.openTable();
      expect((await facilityManagementPage.readRow(facility.nameEn)).code).toBe(facility.code);
    });

    await steps.step(`Click "Edit" next to the facility record - the edit form opens pre-populated, including the Facility Code ${facility.code}`, async () => {
      drawer = await facilityManagementPage.openEditForm(facility.nameEn);
      const shown = await codeOnForm(page, facility.code);
      await toContactStep(drawer);
      const onStep2 = await codeOnForm(page, facility.code);
      expect(shown.inText || shown.input || onStep2.inText || onStep2.input, 'the Facility Code on the edit form').toBe(true);
      await drawer.back();
    });

    await steps.step('Attempt to click into or modify the Facility Code field - the field does not accept input and remains unchanged', async () => {
      const step1 = await codeOnForm(page, facility.code);
      await toContactStep(drawer);
      const step2 = await codeOnForm(page, facility.code);
      const field = step1.input ? step1 : step2;
      expect({ field: field.input, readOnly: field.readOnly }, 'the Facility Code field').toEqual({ field: true, readOnly: true });
    });

    await steps.step('Update another field, then click Submit - a success message is displayed and the Facility Code is unchanged in the saved record', async () => {
      await toContactStep(drawer);
      await drawer.type('buildingName', `${data.buildingName} ${facilityStamp()}`);
      const answer = await submitForm(page, drawer);
      expect(accepted(answer), `the save answered ${said(answer)}`).toBe(true);
      expect(answer.messages.join(' | '), 'the success message').toMatch(UPDATED_TOAST);
      expect((await readFacility(page, facility.id)).facilityCode, 'the saved Facility Code').toBe(facility.code);
      expect((await facilityManagementPage.readRow(facility.nameEn)).code, 'the listed Facility Code').toBe(facility.code);
    });
  });

  test(`TC-${CASES.unsavedDiscarded.azureId}: should discard unsaved changes when the administrator leaves the edit form without submitting`, async ({
    page,
    facilityIn,
    facilityManagementPage,
    steps,
  }) => {
    const data = CASES.unsavedDiscarded;
    const facility = await facilityIn('Active', { buildingName: data.original });
    let drawer!: FacilityFormDrawer;

    await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Click "Edit" next to a facility record - the edit form opens pre-populated with existing data', async () => {
      drawer = await facilityManagementPage.openEditForm(facility.nameEn);
      await toContactStep(drawer);
      expect(await drawer.getValue('buildingName')).toBe(data.original);
    });

    await steps.step(`Modify the Building Name to "${data.temporary}" without clicking Submit - the modified value is displayed in the form`, async () => {
      await drawer.type('buildingName', data.temporary);
      expect(await drawer.getValue('buildingName')).toBe(data.temporary);
    });

    await steps.step('Navigate back to the facility list without submitting - the system returns to the list without saving', async () => {
      const sent = watchUpdateRequest(page);
      await drawer.close(true);
      expect(await drawer.isOpen(), 'the edit form').toBe(false);
      expect(await facilityManagementPage.isListed(facility.nameEn), 'the facility list').toBe(true);
      expect(await sent, 'an update sent while leaving').toBeNull();
    });

    await steps.step('Reopen the same facility record - the field shows its original, unmodified value', async () => {
      const reopened = await facilityManagementPage.openEditForm(facility.nameEn);
      await toContactStep(reopened);
      expect(await reopened.getValue('buildingName'), 'the reopened form').toBe(data.original);
      expect((await readFacility(page, facility.id)).buildingName, 'the stored Building Name').toBe(data.original);
      await reopened.close(true);
    });
  });
});
