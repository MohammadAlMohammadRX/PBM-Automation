import type { Page } from '@playwright/test';
import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { MemberManagementPage } from '../../../pages/member/MemberManagementPage';
import type { MemberFormDrawer } from '../../../pages/member/MemberFormDrawer';
import { CASES, MESSAGE } from '../../../data/member/createMember.data';
import { findMemberByName, lookupItems, lookupLabel, readMember, uniqueDocumentId, type MemberRecord } from '../../../utils/MemberProvisioning';
import {
  WIZARD_LABEL,
  advanceTo,
  createdId,
  nationalPart,
  readDialCodeControl,
  said,
  saved,
  submitWizard,
  validWizardData,
  visibleLabels,
  visibleRequiredLabels,
  type WizardData,
} from '../../../utils/member/writerBHelpers';

/** "Navigate" + "Click Create Member, complete Step 1 (... Steps 1-3) and click Next": the wizard on step `target`. */
async function openAt(steps: TestSteps, list: MemberManagementPage, data: WizardData, target: 2 | 3 | 4, stepText: string): Promise<MemberFormDrawer> {
  let drawer!: MemberFormDrawer;
  await steps.critical('Navigate to the Member Management module - the member list view is displayed', async () => {
    await list.openTable();
    expect(await list.countRows(), 'the member list rows').toBeGreaterThan(0);
  });
  await steps.critical(stepText, async () => {
    drawer = await list.openAddForm();
    expect(await drawer.getTitle(), 'the wizard title').toMatch(/add new member/i);
    await advanceTo(drawer, data, target);
  });
  return drawer;
}

/** The emergency contacts a saved member holds, as name / relationship label / phone. */
async function contactsOf(page: Page, record: MemberRecord): Promise<{ name: string; relationship: string; phoneNumber: string }[]> {
  const out = [];
  for (const c of record.emergencyContacts) out.push({ name: c.name, relationship: c.relationshipNameEn ?? (await lookupLabel(page, 'memberRelationship', c.relationshipId)), phoneNumber: c.phoneNumber });
  return out;
}

const STEP_2 = 'Click "Create Member", complete Step 1 and click Next - Step 2 "Non-National Registry" form is displayed';
const STEP_4 = 'Complete Steps 1-3 with valid data and proceed to Step 4 "Emergency Contacts" - Step 4 form is displayed';

/**
 * User story 14380: Create Member - step 2 "Non-National Registry" (mobile,
 * e-mail, preferred contact method), step 3 "Address", step 4 "Emergency
 * Contacts" and the Country Dial Code (20342). See the data file for the
 * literal readings (the fixed "+966" prefix, the in-place contact edit, Save as
 * the contact's confirm).
 */
test.describe('US 14380 - Create Member - registry, address and contacts', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  for (const c of [CASES.mobileValid, CASES.mobileNotFive, CASES.mobileShort, CASES.mobileLong]) {
    const valid = c === CASES.mobileValid;
    const what = valid ? 'carries the +966 prefix, starts with 5 and has 9 digits'
      : c === CASES.mobileNotFive ? 'does not start with 5' : c === CASES.mobileShort ? 'has fewer than 9 digits after the prefix' : 'has more than 9 digits after the prefix';
    test(`TC-${c.azureId}: should ${valid ? 'accept' : 'reject'} a mobile number that ${what}`, async ({ page, memberManagementPage: list, steps }) => {
      const typed = nationalPart(c.mobile);
      const data = await validWizardData(page, { nonNational: { mobileNumber: typed } });
      const drawer = await openAt(steps, list, data, 2, STEP_2);

      await steps.step(`Enter Mobile Number "${c.mobile}" (the box after the fixed "+966" takes "${typed}") - the value is ${valid ? 'accepted' : 'entered'} in the field`, async () => {
        const { mobileNumber: _m, ...others } = data.nonNational;
        await drawer.fillNonNational({ ...others, mobileNumber: typed });
        expect({ prefix: await drawer.readMobilePrefix(), value: await drawer.getValue('mobileNumber') }).toEqual({ prefix: '+966', value: typed });
        if (valid) expect(await drawer.getFieldError('mobileNumber'), 'no message under the mobile number').toBe('');
      });

      await steps.step(valid ? 'Click Next - Step 2 passes validation and Step 3 is displayed' : 'Click Next - a validation message is shown and the wizard does not advance', async () => {
        const moved = await drawer.next();
        const error = await drawer.getFieldError('mobileNumber');
        if (valid) expect({ advanced: moved, step: await drawer.currentStep() }, `step 2 errors: ${JSON.stringify(await drawer.getFieldErrors())}`).toEqual({ advanced: true, step: 3 });
        else expect({ advanced: moved, step: await drawer.currentStep(), error }, `"${typed}" after "+966"`).toEqual({ advanced: false, step: 2, error: expect.stringMatching(/\S/) });
      });
    });
  }

  test(`TC-${CASES.emailInvalid.azureId}: should block the wizard when the e-mail address has an invalid format`, async ({ page, memberManagementPage: list, steps }) => {
    const email = CASES.emailInvalid.email;
    const data = await validWizardData(page, { nonNational: { email } });
    const drawer = await openAt(steps, list, data, 2, STEP_2);

    await steps.step(`Enter Email "${email}" - the value is entered in the field`, async () => {
      await drawer.fillNonNational(data.nonNational);
      expect(await drawer.getValue('email')).toBe(email);
    });

    await steps.step('Click Next - a validation message is shown and the wizard does not advance', async () => {
      const moved = await drawer.next();
      expect({ advanced: moved, step: await drawer.currentStep(), error: await drawer.getFieldError('email') }).toEqual({ advanced: false, step: 2, error: expect.stringMatching(MESSAGE.email) });
    });
  });

  test(`TC-${CASES.addressCountryOnly.azureId}: should accept the address step with only the mandatory country`, async ({ page, memberManagementPage: list, steps }) => {
    const data = await validWizardData(page, { address: { country: CASES.addressCountryOnly.country } });
    const drawer = await openAt(steps, list, data, 3, 'Complete Steps 1 and 2 with valid data and proceed to Step 3 "Address" - Step 3 form is displayed');

    await steps.step('Enter Country "Saudi Arabia" and leave City, District, Street, Building Number, Postal Code and Additional Number blank, then click Next - Step 3 is accepted and Step 4 is displayed', async () => {
      await drawer.fillAddress(data.address);
      expect({ buildingNumber: await drawer.getValue('buildingNumber'), postalCode: await drawer.getValue('postalCode'), additionalNumber: await drawer.getValue('additionalNumber') }, 'the optional address boxes')
        .toEqual({ buildingNumber: '', postalCode: '', additionalNumber: '' });
      expect(await drawer.next(), `step 3 errors: ${JSON.stringify(await drawer.getFieldErrors())}`).toBe(true);
      expect(await drawer.currentStep()).toBe(4);
    });
  });

  test(`TC-${CASES.contactMethodBlank.azureId}: should stay on step 2 and require a preferred contact method when none is selected`, async ({ page, memberManagementPage: list, steps }) => {
    const data = await validWizardData(page);
    const drawer = await openAt(steps, list, data, 2, STEP_2);

    await steps.step('Fill all Step 2 mandatory fields except "Preferred Contact Method" and click Next - the field is highlighted', async () => {
      const { preferredContactMethod: _p, ...others } = data.nonNational;
      await drawer.fillNonNational(others);
      await drawer.next();
      expect(await drawer.readSelect('preferredContactMethod'), 'Preferred Contact Method left unselected').not.toContain(WIZARD_LABEL.email);
      expect(await drawer.getFieldError('preferredContactMethod'), 'the message under Preferred Contact Method').not.toBe('');
    });

    await steps.step('Observe the outcome - a mandatory-field validation message is shown and the wizard does not advance', async () => {
      expect({ error: await drawer.getFieldError('preferredContactMethod'), step: await drawer.currentStep() }).toEqual({ error: expect.stringMatching(MESSAGE.required), step: 2 });
    });
  });

  test(`TC-${CASES.oneContact.azureId}: should create the member with an emergency contact holding a name, relationship and phone`, async ({ page, memberManagementPage: list, discardMemberNamed, steps }) => {
    const contact = CASES.oneContact.contact;
    const data = await validWizardData(page);
    discardMemberNamed(data.displayNameEn);
    const drawer = await openAt(steps, list, data, 4, STEP_4);

    await steps.step('Click "Add Contact" - Name, Relationship and Phone Number fields are displayed', async () => {
      await drawer.addContact({});
      expect(await drawer.countContacts(), 'contact blocks').toBe(1);
      expect(await visibleLabels(page), 'the contact block\'s fields').toEqual(expect.arrayContaining(['Name', 'Relationship', 'Phone Number']));
    });

    await steps.step(`Enter Name "${contact.name}", Relationship "${contact.relationship}" and Phone Number "${contact.phoneNumber}", then click Submit on the member form - the member is created successfully including the emergency contact`, async () => {
      await drawer.editContact(0, contact);
      const answer = await submitWizard(drawer);
      expect(saved(answer), `the save answered ${said(answer)}`).toBe(true);
      expect(answer.messages.join(' | ')).toMatch(MESSAGE.created);
      expect(await contactsOf(page, await readMember(page, createdId(answer) as string)), 'the saved emergency contacts').toEqual([contact]);
    });
  });

  test(`TC-${CASES.twoContacts.azureId}: should create the member with more than one emergency contact`, async ({ page, memberManagementPage: list, discardMemberNamed, steps }) => {
    const [first, second] = CASES.twoContacts.contacts;
    const data = await validWizardData(page);
    discardMemberNamed(data.displayNameEn);
    const drawer = await openAt(steps, list, data, 4, 'Complete Steps 1-3 and proceed to Step 4 - Step 4 form is displayed');

    await steps.step(`Click "Add Contact" and fill in the first contact's details (${first.relationship}) - the first contact row is saved to the list`, async () => {
      await drawer.addContact(first);
      expect({ count: await drawer.countContacts(), first: await drawer.readContact(0) }).toEqual({ count: 1, first: { ...first, relationship: expect.stringContaining(first.relationship) } });
    });

    await steps.step(`Click "Add Contact" again and fill in a second contact's details (${second.relationship}) - the second contact row is added to the list alongside the first`, async () => {
      await drawer.addContact(second);
      expect({ count: await drawer.countContacts(), first: (await drawer.readContact(0)).name, second: await drawer.readContact(1) })
        .toEqual({ count: 2, first: first.name, second: { ...second, relationship: expect.stringContaining(second.relationship) } });
    });

    await steps.step('Click Submit - the member is created with both emergency contacts recorded', async () => {
      const answer = await submitWizard(drawer);
      expect(saved(answer), `the save answered ${said(answer)}`).toBe(true);
      const contacts = await contactsOf(page, await readMember(page, createdId(answer) as string));
      expect(contacts, 'the saved emergency contacts').toHaveLength(2);
      expect(contacts).toEqual(expect.arrayContaining([first, second]));
    });
  });

  test(`TC-${CASES.editContact.azureId}: should save the edited emergency contact when it is changed before submitting`, async ({ page, memberManagementPage: list, discardMemberNamed, steps }) => {
    const c = CASES.editContact;
    const data = await validWizardData(page);
    discardMemberNamed(data.displayNameEn);
    const drawer = await openAt(steps, list, data, 4, 'Complete Steps 1-3 and proceed to Step 4 - Step 4 form is displayed');

    await steps.step(`Add a contact with Relationship "${c.contact.relationship}" - the contact appears in the list`, async () => {
      await drawer.addContact(c.contact);
      expect(await drawer.readContact(0)).toEqual({ ...c.contact, relationship: expect.stringContaining(c.contact.relationship) });
    });

    await steps.step(`Click Edit on the added contact and change Relationship to "${c.newRelationship}" - the field becomes editable and the new value is accepted`, async () => {
      await drawer.editContact(0, { relationship: c.newRelationship });
      expect((await drawer.readContact(0)).relationship, 'the contact\'s relationship').toContain(c.newRelationship);
    });

    await steps.step('Save the edit and click Submit - the member is created with the updated contact details', async () => {
      const answer = await submitWizard(drawer);
      expect(saved(answer), `the save answered ${said(answer)}`).toBe(true);
      expect(await contactsOf(page, await readMember(page, createdId(answer) as string))).toEqual([{ ...c.contact, relationship: c.newRelationship }]);
    });
  });

  test(`TC-${CASES.removeContact.azureId}: should not save an emergency contact that was removed before submitting`, async ({ page, memberManagementPage: list, discardMemberNamed, steps }) => {
    const contact = CASES.removeContact.contact;
    const data = await validWizardData(page);
    discardMemberNamed(data.displayNameEn);
    const drawer = await openAt(steps, list, data, 4, 'Complete Steps 1-3 and proceed to Step 4 - Step 4 form is displayed');

    await steps.step(`Add a contact ("${contact.name}") - the contact appears in the list`, async () => {
      await drawer.addContact(contact);
      expect(await drawer.countContacts()).toBe(1);
    });

    await steps.step('Click Remove/Delete on the added contact - the contact is removed from the list', async () => {
      await drawer.removeContact(0);
      await expect.poll(() => drawer.countContacts(), { message: 'contact blocks after Remove' }).toBe(0);
    });

    await steps.step('Click Submit - the member is created without the removed emergency contact', async () => {
      const answer = await submitWizard(drawer);
      expect(saved(answer), `the save answered ${said(answer)}`).toBe(true);
      expect(await contactsOf(page, await readMember(page, createdId(answer) as string)), 'the saved emergency contacts').toEqual([]);
    });
  });

  test(`TC-${CASES.contactNoName.azureId}: should refuse an emergency contact without a name`, async ({ page, memberManagementPage: list, discardMemberNamed, steps }) => {
    const c = CASES.contactNoName;
    const data = await validWizardData(page);
    discardMemberNamed(data.displayNameEn);
    const drawer = await openAt(steps, list, data, 4, 'Complete Steps 1-3 and proceed to Step 4 - Step 4 form is displayed');
    let answer = { status: 0, text: '', messages: [] as string[], body: null as Record<string, unknown> | null };

    await steps.step(`Click "Add Contact", leave Name blank, select Relationship "${c.relationship}" and click confirm (Save) - the Name field is highlighted`, async () => {
      await drawer.addContact({ relationship: c.relationship, phoneNumber: c.phoneNumber });
      expect((await drawer.readContact(0)).name, 'the contact Name box').toBe('');
      answer = await submitWizard(drawer);
      expect(await drawer.getText(), `the save answered ${said(answer)}`).toMatch(MESSAGE.required);
    });

    await steps.step('Observe the outcome - a mandatory-field validation message is shown and the contact is not added', async () => {
      expect({ sent: answer.status !== -1, open: await drawer.isOpen(), member: await findMemberByName(page, data.displayNameEn) }, said(answer))
        .toEqual({ sent: false, open: true, member: null });
    });
  });

  test(`TC-${CASES.countryDialCode.azureId}: should offer a required Country Dial Code drop-down defaulted to +966`, async ({ page, memberManagementPage: list, steps }) => {
    const data = await validWizardData(page);
    let drawer!: MemberFormDrawer;
    let dial = { present: false, options: [] as string[], value: '', error: '' };
    let prefix = '';

    await steps.critical('Navigate to "Patient Management" Module then click "Add Patient" (Member Mgmt / Add New Member)', async () => {
      await list.openTable();
      drawer = await list.openAddForm();
      expect(await drawer.getTitle()).toMatch(/add new member/i);
    });

    await steps.step('Enter the "Document ID".', async () => {
      const documentId = await uniqueDocumentId(page, 'nationalId');
      await drawer.fillPatient({ ...data.patient, documentId });
      expect(await drawer.getValue('documentId')).toBe(documentId);
    });

    await steps.step('Ensure that the "Country Dial Code" drop-down field contains all the expected country dial codes - the drop-down contains all expected country dial codes', async () => {
      dial = await readDialCodeControl(page);
      if (!dial.present) {
        await drawer.next();
        dial = await readDialCodeControl(page);
        prefix = await drawer.readMobilePrefix();
      }
      const expected = (await lookupItems(page, 'countryDialCode')).map((i) => i.code);
      expect({ present: dial.present, missing: expected.filter((code) => !dial.options.some((o) => o.includes(code))) }, `a Country Dial Code control on steps 1-2 (the mobile shows the fixed text "${prefix}")`)
        .toEqual({ present: true, missing: [] });
    });

    await steps.step('Ensure that the "Country Dial Code" drop-down field has a default value of +966 - the default value is +966', async () => {
      expect({ present: dial.present, value: dial.value }, `the mobile box shows the fixed text "${prefix}"`).toEqual({ present: true, value: expect.stringContaining(CASES.countryDialCode.defaultCode) });
    });

    await steps.step('Ensure that the "Country Dial Code" field is marked as required and displays an error message if left empty - the field displays an error message if left empty', async () => {
      const marked = (await visibleRequiredLabels(page)).some((l) => /dial code/i.test(l));
      expect({ present: dial.present, markedRequired: marked }, `required labels shown: ${JSON.stringify(await visibleRequiredLabels(page))}`).toEqual({ present: true, markedRequired: true });
    });
  });
});
