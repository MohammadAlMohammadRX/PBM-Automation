import { test, expect } from '../../../fixtures';
import type { MemberManagementPage } from '../../../pages/member/MemberManagementPage';
import type { MemberDetailPage } from '../../../pages/member/MemberDetailPage';
import { MEMBER_DETAIL, type MemberDetailTab } from '../../../constants/member/memberIds';
import {
  CASES,
  FLAG_PLACEHOLDER,
  FLAG_SET,
  FLAG_UNSET,
  NO_CONTACTS,
  PLACEHOLDER,
  RECORD_DATE_TIME,
} from '../../../data/member/viewMember.data';
import {
  birthdayToday,
  lookupLabel,
  memberBody,
  memberDayText,
  readMember,
  readMemberAuditTrail,
  requestCreateMember,
  suiteMemberDisplayName,
  updateMemberFields,
} from '../../../utils/MemberProvisioning';
import { editableControls, memberCreateEntry, readToasts, saveActions, saveFullAddress } from '../../../utils/member/writerCHelpers';
import { minutesApart } from '../../../utils/facility/writerBHelpers';

/** "Navigate to the Member Management module": opens the list and answers whether it lists the case's member. */
async function openList(list: MemberManagementPage, name: string): Promise<boolean> {
  await list.openTable();
  return list.isListed(name);
}

/** Opens the member from its row (View) - the view page opens on Member Information. */
async function openFromList(list: MemberManagementPage, detail: MemberDetailPage, name: string): Promise<void> {
  await list.openDetails(name);
  expect(await detail.getName()).toBe(name);
}

/** The shown value when it carries the expected one (lookup labels may add a code, "Saudi (SAU)"). */
const carrying = (shown: string, expected: string): string => (expected !== '' && shown.includes(expected) ? expected : shown);

/**
 * User story 14383: View Member - the record tabs. The administrator plays the
 * Member Administrator; every member is the case's own suite member. The tabs
 * that need a policy (PBM Accumulator Dashboard, Coverage Ordering, all tabs)
 * live in view-member-policies.spec.ts, the restricted user in
 * view-member-access.spec.ts. See the data file for the literal readings.
 */
test.describe('US 14383 - View Member', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.informationTab.azureId}: should display every Member Information value read-only when a fully populated member is opened`, async ({
    page,
    memberIn,
    memberManagementPage,
    memberDetailPage,
    memberInformationTab,
    steps,
  }) => {
    const member = await memberIn('Complete', { specialNeeds: true });
    const record = await readMember(page, member.id);

    await steps.critical('Navigate to the Member Management module - the Member Management list view loads', async () => {
      expect(await openList(memberManagementPage, member.displayNameEn), 'the member in the list').toBe(true);
    });

    await steps.critical('Select a member record and open it in view mode - the details page opens on the Member Information tab', async () => {
      await openFromList(memberManagementPage, memberDetailPage, member.displayNameEn);
      expect(await memberInformationTab.hasField('displayName'), 'the Member Information values on opening').toBe(true);
    });

    await steps.step('Verify Display Name, Nationality, Identity Type, Document ID, E-Health ID, Date of Birth, Hijri Date of Birth, Gender, Place of Birth, Age, Occupation, Marital Status, Member Status and Special Needs - each shows the stored value, read-only', async () => {
      const shown = await memberInformationTab.read();
      expect({
        displayName: shown.displayName,
        nationality: carrying(shown.nationality, record.nationalityNameEn),
        identityType: carrying(shown.identityType, record.identityTypeNameEn),
        documentId: shown.documentId,
        eHealthId: shown.eHealthId,
        dateOfBirth: shown.dateOfBirth,
        hijriDateOfBirth: shown.hijriDateOfBirth,
        gender: carrying(shown.gender, record.genderNameEn),
        placeOfBirth: carrying(shown.placeOfBirth, 'Saudi Arabia'),
        age: shown.age,
        occupation: shown.occupation,
        maritalStatus: carrying(shown.maritalStatus, await lookupLabel(page, 'maritalStatus', record.maritalStatusId)),
        memberStatus: carrying(shown.memberStatus, record.patientStatusNameEn),
        specialNeedsShownAsSet: FLAG_SET.test(shown.specialNeeds) ? true : `"${shown.specialNeeds}"`,
      }, 'Member Information as shown').toEqual({
        displayName: record.displayNameEn,
        nationality: record.nationalityNameEn,
        identityType: record.identityTypeNameEn,
        documentId: record.documentId,
        eHealthId: record.eHealthId,
        dateOfBirth: memberDayText(record.dateOfBirth ?? ''),
        hijriDateOfBirth: record.hijriDateOfBirth,
        gender: record.genderNameEn,
        placeOfBirth: 'Saudi Arabia',
        age: String(record.age),
        occupation: record.occupation,
        maritalStatus: await lookupLabel(page, 'maritalStatus', record.maritalStatusId),
        memberStatus: record.patientStatusNameEn,
        specialNeedsShownAsSet: true,
      });
      expect(await editableControls(page), 'editable controls on the view').toEqual([]);
    });
  });

  test(`TC-${CASES.recordInformation.azureId}: should show who created and last modified the member as the audit history records it`, async ({
    page,
    memberIn,
    memberManagementPage,
    memberDetailPage,
    memberInformationTab,
    steps,
  }) => {
    const member = await memberIn('Active');
    const edited = await updateMemberFields(page, member.id, { occupation: CASES.recordInformation.occupation });
    if (edited.status >= 300) steps.blocked(`the precondition edit of "${member.displayNameEn}" was refused: ${edited.status} ${edited.text.slice(0, 200)}`);
    const record = await readMember(page, member.id);

    await steps.critical('Navigate to the Member Management module - the Member Management list view loads', async () => {
      expect(await openList(memberManagementPage, member.displayNameEn), 'the member in the list').toBe(true);
    });

    await steps.critical('Open a member record in view mode and locate the Record Information section - it is visible on the Member Information tab', async () => {
      await openFromList(memberManagementPage, memberDetailPage, member.displayNameEn);
      expect(await memberInformationTab.hasField('createdBy'), 'Created By').toBe(true);
      expect(await memberInformationTab.hasField('modifiedOn'), 'Modified On').toBe(true);
    });

    await steps.step('Verify Created By, Created On, Modified By and Modified On - each value matches the audit history of the record', async () => {
      const shown = {
        createdBy: await memberInformationTab.readField('createdBy'),
        createdOn: await memberInformationTab.readField('createdOn'),
        modifiedBy: await memberInformationTab.readField('modifiedBy'),
        modifiedOn: await memberInformationTab.readField('modifiedOn'),
      };
      const update = (await readMemberAuditTrail(page, member.id, { actionType: 'UPDATE' })).items[0] ?? null;
      const create = await memberCreateEntry(page, record);
      expect({
        createdOnFormat: RECORD_DATE_TIME.test(shown.createdOn),
        modifiedOnFormat: RECORD_DATE_TIME.test(shown.modifiedOn),
        createdOnAsAudited: create ? minutesApart(shown.createdOn, create.occurredAtUtc) <= 1 : 'no CREATE entry for the member in Audit Logs',
        createdByAsAudited: create ? shown.createdBy.includes(create.actorLabel) && create.actorLabel !== '' : 'no CREATE entry for the member in Audit Logs',
        modifiedOnAsAudited: update ? minutesApart(shown.modifiedOn, update.occurredAtUtc) <= 1 : 'no UPDATE entry on the member\'s trail',
        modifiedByAsAudited: update ? shown.modifiedBy.includes(update.actorLabel) && update.actorLabel !== '' : 'no UPDATE entry on the member\'s trail',
      }, `Record Information ${JSON.stringify(shown)} against CREATE ${create?.occurredAtUtc ?? '-'} by ${create?.actorLabel ?? '-'}, UPDATE ${update?.occurredAtUtc ?? '-'} by ${update?.actorLabel ?? '-'}`).toEqual({
        createdOnFormat: true,
        modifiedOnFormat: true,
        createdOnAsAudited: true,
        createdByAsAudited: true,
        modifiedOnAsAudited: true,
        modifiedByAsAudited: true,
      });
    });
  });

  test(`TC-${CASES.nonNational.azureId}: should display every Non-National Registry value of the member`, async ({
    page,
    memberIn,
    memberManagementPage,
    memberDetailPage,
    memberNonNationalTab,
    steps,
  }) => {
    const member = await memberIn('Complete');
    const record = await readMember(page, member.id);

    await steps.critical('Navigate to the Member Management module - the Member Management list view loads', async () => {
      expect(await openList(memberManagementPage, member.displayNameEn), 'the member in the list').toBe(true);
    });

    await steps.critical('Open a member record in view mode and select the Non-National Registry tab - the tab opens', async () => {
      await openFromList(memberManagementPage, memberDetailPage, member.displayNameEn);
      await memberNonNationalTab.open();
      expect(await memberNonNationalTab.hasField('email'), 'the Non-National Registry values').toBe(true);
    });

    await steps.step('Verify Insurance Number, Country Dial Code, Mobile Number, Email, Preferred Contact Method, Preferred Language, Blood Group and VIP - each shows the stored value', async () => {
      const shown = await memberNonNationalTab.read();
      const contact = await lookupLabel(page, 'preferredContactMethod', record.preferredContactMethodId);
      const language = await lookupLabel(page, 'preferredLanguage', record.preferredLanguageId);
      const blood = await lookupLabel(page, 'bloodGroup', record.bloodGroupId);
      expect({
        insuranceNumber: shown.insuranceNumber,
        countryDialCode: carrying(shown.countryDialCode, '+966'),
        mobileNumber: carrying(shown.mobileNumber, record.mobileNumber),
        email: shown.email,
        preferredContactMethod: carrying(shown.preferredContactMethod, contact),
        preferredLanguage: carrying(shown.preferredLanguage, language),
        bloodGroup: carrying(shown.bloodGroup, blood),
        vipShownAsSet: FLAG_SET.test(shown.isVip) ? true : `"${shown.isVip}"`,
      }, 'Non-National Registry as shown').toEqual({
        insuranceNumber: record.insuranceNumber,
        countryDialCode: '+966',
        mobileNumber: record.mobileNumber,
        email: record.email,
        preferredContactMethod: contact,
        preferredLanguage: language,
        bloodGroup: blood,
        vipShownAsSet: true,
      });
    });
  });

  test(`TC-${CASES.address.azureId}: should display every Address value of the member`, async ({
    page,
    memberIn,
    memberManagementPage,
    memberDetailPage,
    memberAddressTab,
    steps,
  }) => {
    const member = await memberIn('Complete');
    await memberDetailPage.open(member.id);
    const chosen = await saveFullAddress(memberDetailPage).catch((error: unknown) =>
      steps.blocked(`the precondition address (City / District / Street) could not be saved through the Edit wizard: ${String(error instanceof Error ? error.message : error).slice(0, 240)}`));
    const record = await readMember(page, member.id);

    await steps.critical('Navigate to the Member Management module - the Member Management list view loads', async () => {
      expect(await openList(memberManagementPage, member.displayNameEn), 'the member in the list').toBe(true);
    });

    await steps.critical('Open a member record in view mode and select the Address tab - the tab opens', async () => {
      await openFromList(memberManagementPage, memberDetailPage, member.displayNameEn);
      await memberAddressTab.open();
      expect(await memberAddressTab.hasField('country'), 'the Address values').toBe(true);
    });

    await steps.step('Verify Country, City, District, Street, Building Number, Postal Code and Additional Number - each shows the stored value', async () => {
      const shown = await memberAddressTab.read();
      expect({
        country: carrying(shown.country, 'Saudi Arabia'),
        city: carrying(shown.city, chosen.city),
        district: carrying(shown.district, chosen.district),
        street: carrying(shown.street, chosen.street),
        buildingNumber: shown.buildingNumber,
        postalCode: shown.postalCode,
        additionalNumber: shown.additionalNumber,
      }, 'Address as shown').toEqual({
        country: 'Saudi Arabia',
        city: chosen.city,
        district: chosen.district || '—',
        street: chosen.street || '—',
        buildingNumber: record.buildingNumber,
        postalCode: record.postalCode,
        additionalNumber: record.additionalNumber,
      });
    });
  });

  test(`TC-${CASES.emergencyContacts.azureId}: should list every emergency contact with its name, relationship and phone number`, async ({
    page,
    memberIn,
    memberManagementPage,
    memberDetailPage,
    memberEmergencyContactsTab,
    steps,
  }) => {
    const member = await memberIn('WithContacts');
    const record = await readMember(page, member.id);
    const stored = await Promise.all(record.emergencyContacts.map(async (c) => ({
      name: c.name,
      relationship: c.relationshipNameEn ?? await lookupLabel(page, 'memberRelationship', c.relationshipId),
      phoneNumber: c.phoneNumber,
    })));

    await steps.critical('Navigate to the Member Management module - the Member Management list view loads', async () => {
      expect(await openList(memberManagementPage, member.displayNameEn), 'the member in the list').toBe(true);
    });

    await steps.critical('Open a member record in view mode and select the Emergency Contacts tab - the tab opens', async () => {
      await openFromList(memberManagementPage, memberDetailPage, member.displayNameEn);
      await memberEmergencyContactsTab.open();
      expect(await memberEmergencyContactsTab.countContacts(), 'contacts listed').toBeGreaterThan(0);
    });

    await steps.step('Verify each listed contact shows Name, Relationship and Phone Number - every entry displays complete details', async () => {
      const shown = (await memberEmergencyContactsTab.readContacts()).map((c) => ({ name: c.name, relationship: c.relationship, phoneNumber: c.phoneNumber }));
      const byName = (a: { name: string }, b: { name: string }): number => a.name.localeCompare(b.name);
      expect(stored.length, 'contacts stored').toBeGreaterThanOrEqual(2);
      expect([...shown].sort(byName), 'the contacts as shown').toEqual([...stored].sort(byName));
    });
  });

  test(`TC-${CASES.noContacts.azureId}: should show an empty Emergency Contacts tab without an error when the member has none`, async ({
    page,
    memberIn,
    memberManagementPage,
    memberDetailPage,
    memberEmergencyContactsTab,
    steps,
  }) => {
    const member = await memberIn('Active');

    await steps.critical('Navigate to the Member Management module - the Member Management list view loads', async () => {
      expect(await openList(memberManagementPage, member.displayNameEn), 'the member in the list').toBe(true);
    });

    await steps.critical('Open a member record with no emergency contacts and select the Emergency Contacts tab - the tab opens', async () => {
      await openFromList(memberManagementPage, memberDetailPage, member.displayNameEn);
      expect((await readMember(page, member.id)).emergencyContacts, 'contacts stored').toEqual([]);
      await memberEmergencyContactsTab.open();
      expect(await memberDetailPage.isLoaded()).toBe(true);
    });

    await steps.step('Observe the tab content - an empty state with no contact rows and no error', async () => {
      expect(await memberEmergencyContactsTab.countContacts(), 'contact rows').toBe(0);
      expect(await memberEmergencyContactsTab.getText(), 'the empty state').toMatch(NO_CONTACTS);
      expect((await readToasts(page)).filter((t) => /error|fail|unable/i.test(t)), 'error messages').toEqual([]);
    });
  });

  test(`TC-${CASES.readOnly.azureId}: should present every tab of the member for viewing only with nothing editable or savable`, async ({
    page,
    memberIn,
    memberManagementPage,
    memberDetailPage,
    memberInformationTab,
    steps,
  }) => {
    const member = await memberIn('Complete');
    const updates = { count: 0 };

    await steps.critical('Navigate to the Member Management module - the Member Management list view loads', async () => {
      expect(await openList(memberManagementPage, member.displayNameEn), 'the member in the list').toBe(true);
    });

    await steps.critical('Open a member record in view mode - the Member Information tab opens', async () => {
      await openFromList(memberManagementPage, memberDetailPage, member.displayNameEn);
      expect(await memberInformationTab.hasField('displayName')).toBe(true);
    });

    await steps.step('Attempt to click into or modify any displayed field across each tab - no field becomes editable and no save / submit action is available', async () => {
      const listener = (r: { url: () => string; method: () => string }): void => {
        if (/\/(UpdateMember|SetMemberActive|DeleteMember|ReorderMemberCoverage)/.test(r.url())) updates.count += 1;
      };
      page.on('request', listener);
      const found: Record<string, { editable: string[]; save: string[] }> = {};
      for (const tab of ['patient', 'nonNational', 'address', 'emergency', 'dashboard', 'cob'] as MemberDetailTab[]) {
        await memberDetailPage.openTab(tab);
        if (tab === 'patient') {
          await page.locator(`#${MEMBER_DETAIL.patient.displayName}`).click();
          await page.keyboard.type('x');
        }
        found[tab] = { editable: await editableControls(page), save: await saveActions(page) };
      }
      page.off('request', listener);
      expect(Object.fromEntries(Object.entries(found).filter(([, v]) => v.editable.length > 0 || v.save.length > 0)), 'tabs with an editable field or a save / submit action').toEqual({});
      expect(updates.count, 'write requests sent while viewing').toBe(0);
      await memberDetailPage.openTab('patient');
      expect(await memberInformationTab.readField('displayName'), 'the display name after typing on the view').toBe(member.displayNameEn);
    });
  });

  test(`TC-${CASES.flags.azureId}: should show Special Needs and VIP as set or not set as each member's flags are stored`, async ({
    memberIn,
    memberManagementPage,
    memberDetailPage,
    memberInformationTab,
    memberNonNationalTab,
    steps,
  }) => {
    const flagged = await memberIn('Active', { specialNeeds: true, vip: true });
    const plain = await memberIn('Active');

    await steps.critical('Navigate to the Member Management module - the Member Management list view loads', async () => {
      expect(await openList(memberManagementPage, flagged.displayNameEn), 'the member in the list').toBe(true);
    });

    await steps.critical('Open a member record where Special Needs and VIP are set - the Member Information tab opens', async () => {
      await openFromList(memberManagementPage, memberDetailPage, flagged.displayNameEn);
      expect(await memberInformationTab.hasField('specialNeeds')).toBe(true);
    });

    await steps.step('Verify Special Needs (Member Information) and VIP (Non-National Registry) - both indicators are displayed as active', async () => {
      const specialNeeds = await memberInformationTab.readField('specialNeeds');
      await memberNonNationalTab.open();
      const vip = await memberNonNationalTab.readField('isVip');
      expect({ specialNeeds: FLAG_SET.test(specialNeeds), vip: FLAG_SET.test(vip) }, `Special Needs "${specialNeeds}", VIP "${vip}"`).toEqual({ specialNeeds: true, vip: true });
    });

    await steps.step('Open a second member record where both flags are not set - both indicators display as inactive / not set', async () => {
      expect(await openList(memberManagementPage, plain.displayNameEn), 'the member in the list').toBe(true);
      await openFromList(memberManagementPage, memberDetailPage, plain.displayNameEn);
      const specialNeeds = await memberInformationTab.readField('specialNeeds');
      await memberNonNationalTab.open();
      const vip = await memberNonNationalTab.readField('isVip');
      expect({ specialNeeds: FLAG_UNSET.test(specialNeeds), vip: FLAG_UNSET.test(vip) }, `Special Needs "${specialNeeds}", VIP "${vip}"`).toEqual({ specialNeeds: true, vip: true });
    });
  });

  test(`TC-${CASES.birthday.azureId}: should count the new year of age on the day of the member's birthday`, async ({
    page,
    memberIn,
    memberManagementPage,
    memberDetailPage,
    memberInformationTab,
    steps,
  }) => {
    const dateOfBirth = birthdayToday(CASES.birthday.years);
    const member = await memberIn('Active', { dateOfBirth });

    await steps.critical('Navigate to the Member Management module - the Member Management list view loads', async () => {
      expect(await openList(memberManagementPage, member.displayNameEn), 'the member in the list').toBe(true);
    });

    await steps.critical(`Open a member whose Date of Birth is exactly ${CASES.birthday.years} year(s) before today (${dateOfBirth}) - the Member Information tab opens`, async () => {
      await openFromList(memberManagementPage, memberDetailPage, member.displayNameEn);
      expect(await memberInformationTab.hasField('age')).toBe(true);
    });

    await steps.step('Verify the displayed Age - it reflects the newly incremented year as of today, not the prior year', async () => {
      const age = await memberInformationTab.readField('age');
      const header = (await memberDetailPage.readHeaderStrip()).age;
      const stored = (await readMember(page, member.id)).age;
      expect({ age, headerStartsWithTheYear: new RegExp(`^${CASES.birthday.years} years?\\b`).test(header) ? true : header, stored }, 'the age on the birthday')
        .toEqual({ age: String(CASES.birthday.years), headerStartsWithTheYear: true, stored: CASES.birthday.years });
    });
  });

  test(`TC-${CASES.optionalBlank.azureId}: should show unpopulated optional values as a placeholder without breaking the view`, async ({
    page,
    discardMemberId,
    memberManagementPage,
    memberDetailPage,
    memberInformationTab,
    steps,
  }) => {
    const body = { ...(await memberBody(page)), eHealthId: '', hijriDateOfBirth: '', isSpecialNeeds: false };
    const created = await requestCreateMember(page, body);
    if (created.id) discardMemberId(created.id);
    if (created.status >= 300 || !created.id) steps.blocked(`a suite member without E-Health ID / Hijri date could not be created: ${created.status} ${created.text.slice(0, 200)}`);
    const name = suiteMemberDisplayName(body.englishLastName);
    const record = await readMember(page, created.id as string);

    await steps.critical('Navigate to the Member Management module - the Member Management list view loads', async () => {
      expect(await openList(memberManagementPage, name), 'the member in the list').toBe(true);
    });

    await steps.critical('Open a member record where E-Health ID, Hijri Date of Birth and Special Needs are not populated - the Member Information tab opens', async () => {
      await openFromList(memberManagementPage, memberDetailPage, name);
      expect(await memberInformationTab.hasField('eHealthId')).toBe(true);
    });

    await steps.step('Review the display of these unpopulated fields - each displays a blank or "Not Provided" placeholder without errors or broken layout', async () => {
      const shown = await memberInformationTab.read();
      const hijriStored = record.hijriDateOfBirth ?? '';
      expect({
        eHealthId: PLACEHOLDER.test(shown.eHealthId) ? 'placeholder' : `"${shown.eHealthId}"`,
        hijriDateOfBirth: hijriStored === '' ? (PLACEHOLDER.test(shown.hijriDateOfBirth) ? 'placeholder' : `"${shown.hijriDateOfBirth}"`) : shown.hijriDateOfBirth,
        specialNeeds: FLAG_PLACEHOLDER.test(shown.specialNeeds) ? 'placeholder' : `"${shown.specialNeeds}"`,
      }, `the unpopulated values (Hijri stored "${hijriStored}")`).toEqual({
        eHealthId: 'placeholder',
        hijriDateOfBirth: hijriStored === '' ? 'placeholder' : hijriStored,
        specialNeeds: 'placeholder',
      });
      const required = ['displayName', 'nationality', 'identityType', 'documentId', 'dateOfBirth', 'gender', 'age', 'memberStatus'] as const;
      const missing = required.filter((field) => shown[field] === '');
      expect(missing, 'values not rendered at all (broken layout)').toEqual([]);
      expect((await readToasts(page)).filter((t) => /error|fail|unable/i.test(t)), 'error messages').toEqual([]);
    });
  });
});
