import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { UserListPage } from '../../../pages/user/UserListPage';
import type { UserProfilePage } from '../../../pages/user/UserProfilePage';
import type { UserProfileSection } from '../../../constants/user/userIds';
import {
  CASES,
  EDIT_TITLE,
  LOCKED_USER_BLOCKED,
  NAME_MAX_LENGTH,
  NO_LONGER_AVAILABLE,
  OTHER_MODULE,
  SECTION_LABELS,
} from '../../../data/user/viewUserProfile.data';
import { deleteSuiteUser, readUser, suiteUserLastName, type ProvisionedUser } from '../../../utils/UserProvisioning';
import { clickProfileChangePassword, earlierFailures } from '../../../utils/user/writerAHelpers';

/**
 * User story 20413: View User Profile - the administrator's view of a suite
 * user's profile: the page, the summary card, the four sections, Edit Profile,
 * the (missing) change password, statuses, a long name, a fresh status change,
 * navigating away and back, a deleted user, and consistency with the list.
 * The permission cases are in view-profile-access.spec.ts. See the data file.
 */

const SECTIONS: UserProfileSection[] = ['personal', 'contact', 'rolesStatus', 'record'];

async function openModule(steps: TestSteps, list: UserListPage): Promise<void> {
  await steps.critical('Navigate to the User Management module - the User Management list view is displayed', async () => {
    await list.openTable();
    await list.expectToolbar();
  });
}

/** Row View of a suite user -> its loaded profile. */
async function viewFromList(list: UserListPage, profile: UserProfilePage, user: ProvisionedUser): Promise<string> {
  await list.revealRow(user.displayNameEn);
  const url = await list.openProfile(user.id);
  expect(url, 'View opens the profile of THIS user').toContain(`/profile/${user.id}`);
  await profile.waitForLoaded();
  return profile.idFromUrl();
}

/** The whole profile as text: header + every section's label -> value. */
async function snapshot(profile: UserProfilePage): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { header: await profile.readHeader() };
  for (const s of SECTIONS) out[s] = await profile.readSection(s);
  return out;
}

test.describe('US 20413 - View User Profile', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.viewProfile.azureId}: should open the full profile of an active user from the View action`, async ({
    steps,
    userIn,
    userListPage: list,
    userProfilePage: profile,
  }) => {
    const user = await userIn('Active');
    await openModule(steps, list);

    await steps.critical(`Select the active user "${user.displayNameEn}" in the list - its row is shown`, async () => {
      await list.revealRow(user.displayNameEn);
      expect(await list.isRowShownById(user.id)).toBe(true);
    });

    await steps.critical('Click the View action for the selected user - the User Profile page opens', async () => {
      expect(await list.openProfile(user.id)).toContain(`/profile/${user.id}`);
      await profile.waitForLoaded();
    });

    await steps.step('Review the page contents - the summary card and all profile details are displayed', async () => {
      const header = (await profile.readHeader()).join(' | ');
      const personal = await profile.readSection('personal');
      expect({
        name: header.includes(user.displayNameEn),
        sections: await profile.sectionLabels(),
        documentId: personal['Document ID'],
        summary: Object.keys(await profile.readSummary()),
      }, header).toEqual({ name: true, sections: [...SECTION_LABELS], documentId: user.documentId, summary: ['Nationality', 'Document ID', 'Mobile Number', 'Age'] });
    });
  });

  test(`TC-${CASES.summaryCard.azureId}: should show a summary card with the user's name, status and identifying details`, async ({
    steps,
    userIn,
    userListPage: list,
    userProfilePage: profile,
  }) => {
    const user = await userIn('Active');
    await openModule(steps, list);

    await steps.critical('Open the profile of an existing user - the User Profile page opens', async () => {
      expect(await viewFromList(list, profile, user), 'the profile of this user opened').toBe(user.id);
    });

    await steps.step('Inspect the top of the page - a summary card shows the user\'s name, status and key identifying details', async () => {
      const header = await profile.readHeader();
      const summary = await profile.readSummary();
      expect({
        name: header.includes(user.displayNameEn),
        status: header.includes('Active'),
        documentId: summary['Document ID'],
        mobile: summary['Mobile Number'],
        nationality: /\S/.test(summary.Nationality ?? ''),
      }, header.join(' | ')).toEqual({ name: true, status: true, documentId: user.documentId, mobile: user.record.phoneNumber, nationality: true });
    });
  });

  test(`TC-${CASES.fourSections.azureId}: should show the four sections Personal, Contact, Roles & Status and Record Information`, async ({
    steps,
    userIn,
    userListPage: list,
    userProfilePage: profile,
  }) => {
    const user = await userIn('Active');
    let labels: string[] = [];
    await openModule(steps, list);

    await steps.critical('Open the profile of an existing user - the User Profile page opens', async () => {
      expect(await viewFromList(list, profile, user), 'the profile of this user opened').toBe(user.id);
      labels = await profile.sectionLabels();
    });

    for (const [i, section] of SECTIONS.entries()) {
      await steps.step(`${i === 0 ? 'Scroll through the full page' : 'Continue reviewing the page'} - the ${SECTION_LABELS[i]} section is displayed`, async () => {
        const values = await profile.readSection(section);
        expect({ label: labels[i], populated: Object.values(values).filter((v) => v.trim() !== '').length > 0 }, JSON.stringify(values))
          .toEqual({ label: SECTION_LABELS[i], populated: true });
      });
    }
  });

  test(`TC-${CASES.editProfile.azureId}: should open the Edit User drawer for the same user from Edit Profile`, async ({
    steps,
    userIn,
    userListPage: list,
    userProfilePage: profile,
  }) => {
    const user = await userIn('Active');
    await openModule(steps, list);

    await steps.critical('Open the profile of an existing user - the User Profile page opens', async () => {
      expect(await viewFromList(list, profile, user), 'the profile of this user opened').toBe(user.id);
    });

    await steps.step('Click the Edit Profile button - the Edit User drawer opens for the same user', async () => {
      const drawer = await profile.openEdit();
      expect({ title: await drawer.getTitle(), lastName: await drawer.getValue('englishLastName'), documentId: await drawer.getValue('documentId') })
        .toEqual({ title: EDIT_TITLE, lastName: user.lastName, documentId: user.documentId });
      await drawer.close();
    });
  });

  test(`TC-${CASES.changePassword.azureId}: should open the change password control from the profile page`, async ({
    page,
    steps,
    userIn,
    userListPage: list,
    userProfilePage: profile,
  }) => {
    const user = await userIn('Active');
    await openModule(steps, list);

    await steps.critical('Open the profile of an existing user - the User Profile page opens', async () => {
      expect(await viewFromList(list, profile, user), 'the profile of this user opened').toBe(user.id);
    });

    await steps.step('Click the change password option - the change password control opens', async () => {
      const outcome = await clickProfileChangePassword(page);
      expect(outcome, `profile actions offered: Edit Profile ${await profile.isEditOffered()}; a Change Password control ${outcome.offered}`)
        .toEqual({ offered: true, opened: true });
    });
  });

  test(`TC-${CASES.statusStates.azureId}: should show the status that matches each user's account state`, async ({
    steps,
    userIn,
    userListPage: list,
    userProfilePage: profile,
  }) => {
    const active = await userIn('Active');
    const inactive = await userIn('Deactivated');
    await openModule(steps, list);

    await steps.step(`Open the profile of a user with Active status ("${active.displayNameEn}") - the Roles & Status section shows "Active"`, async () => {
      expect(await viewFromList(list, profile, active), 'the profile of this user opened').toBe(active.id);
      expect((await profile.readSection('rolesStatus')).Status).toBe('Active');
    });

    await steps.step(`Open the profile of a user with Inactive status ("${inactive.displayNameEn}") - the Roles & Status section shows "Inactive"`, async () => {
      await list.openTable();
      expect(await viewFromList(list, profile, inactive), 'the profile of this user opened').toBe(inactive.id);
      expect((await profile.readSection('rolesStatus')).Status).toBe('Inactive');
    });

    await steps.step('Open the profile of a user with Locked status - the Roles & Status section shows "Locked"', async () => {
      expect(earlierFailures(steps), `NOT EXERCISED - ${LOCKED_USER_BLOCKED}`).toEqual([]);
      steps.blocked(`the Active and Inactive parts passed; ${LOCKED_USER_BLOCKED}`);
    });
  });

  test(`TC-${CASES.maxLengthName.azureId}: should show a maximum-length name in full on the summary card and in Personal Information`, async ({
    steps,
    userIn,
    userListPage: list,
    userProfilePage: profile,
  }) => {
    const lastName = suiteUserLastName().padEnd(NAME_MAX_LENGTH, 'x').slice(0, NAME_MAX_LENGTH);
    const user = await userIn('Active', { lastName });
    await openModule(steps, list);

    await steps.critical(`Open the profile of the user with a ${NAME_MAX_LENGTH}-character last name - the User Profile page opens`, async () => {
      expect(user.lastName).toHaveLength(NAME_MAX_LENGTH);
      expect(await viewFromList(list, profile, user), 'the profile of this user opened').toBe(user.id);
    });

    await steps.step('Inspect the summary card and the Personal Information section - the full name is displayed without truncation', async () => {
      const header = await profile.readHeader();
      const personal = await profile.readSection('personal');
      expect({
        cardName: header.find((l) => l.includes(lastName.slice(0, 20))) ?? '',
        personalName: personal['First Name'],
      }).toEqual({ cardName: user.displayNameEn, personalName: user.displayNameEn });
    });
  });

  test(`TC-${CASES.afterReactivation.azureId}: should show Active on the profile right after an inactive user is reactivated`, async ({
    steps,
    userIn,
    userListPage: list,
    userProfilePage: profile,
  }) => {
    const user = await userIn('Deactivated');
    await openModule(steps, list);

    await steps.critical(`Reactivate the inactive user "${user.displayNameEn}" from the list - its status changes to Active`, async () => {
      await list.revealRow(user.displayNameEn);
      const done = await list.activateUser(user.id);
      expect(done.status, `${done.text.slice(0, 200)} ${done.messages.join(' | ')}`).toBe(200);
      await expect.poll(async () => (await list.readRowById(user.id)).status, { message: 'the row shows Active' }).toBe('Active');
    });

    await steps.critical('Open the profile of the reactivated user - the User Profile page opens', async () => {
      expect(await list.openProfile(user.id)).toContain(`/profile/${user.id}`);
      await profile.waitForLoaded();
    });

    await steps.step('Review the Roles & Status section - the status shown is "Active"', async () => {
      expect({ section: (await profile.readSection('rolesStatus')).Status, card: (await profile.readHeader()).includes('Active') }).toEqual({ section: 'Active', card: true });
    });
  });

  test(`TC-${CASES.navigateAwayAndBack.azureId}: should show the same profile data after navigating away and back`, async ({
    page,
    steps,
    userIn,
    userListPage: list,
    userProfilePage: profile,
  }) => {
    const user = await userIn('Active');
    let first: Record<string, unknown> = {};
    await openModule(steps, list);

    await steps.critical('Open a user\'s profile, navigate to another module, then return to the user list - the list view loads correctly', async () => {
      expect(await viewFromList(list, profile, user), 'the profile of this user opened').toBe(user.id);
      first = await snapshot(profile);
      await page.goto(OTHER_MODULE);
      await page.waitForURL((u) => u.pathname.startsWith(OTHER_MODULE));
      await list.openTable();
      await list.expectToolbar();
    });

    await steps.critical('Re-open the same user\'s profile - the User Profile page opens again', async () => {
      expect(await viewFromList(list, profile, user), 'the profile of this user opened').toBe(user.id);
    });

    await steps.step('Compare the displayed data with the first viewing - every field matches exactly', async () => {
      expect(await snapshot(profile)).toEqual(first);
    });
  });

  test(`TC-${CASES.deletedUser.azureId}: should tell the administrator that a deleted user's profile is no longer available`, async ({
    page,
    steps,
    userIn,
    userListPage: list,
    userProfilePage: profile,
  }) => {
    const user = await userIn('Active');
    await openModule(steps, list);

    await steps.step('Attempt to open the profile of the now-deleted user from a stale row - the system detects the user no longer exists', async () => {
      await list.revealRow(user.displayNameEn);
      const removed = await deleteSuiteUser(page, user.id);
      expect(removed.status, `the precondition delete: ${removed.text.slice(0, 200)}`).toBe(200);
      await list.openProfile(user.id);
      await page.waitForTimeout(2_000);
      expect({ loaded: await profile.isLoaded(), record: await profile.readViaApi(user.id) }).toEqual({ loaded: false, record: null });
    });

    await steps.step('Observe the system response - a clear message says the user record is no longer available', async () => {
      const text = await profile.getPageText();
      expect({ message: NO_LONGER_AVAILABLE.test(text), sections: SECTION_LABELS.filter((l) => text.includes(l)) }, text.slice(-300))
        .toEqual({ message: true, sections: [] });
    });
  });

  test(`TC-${CASES.matchesList.azureId}: should show on the profile the same details the list shows for the user`, async ({
    page,
    steps,
    userIn,
    userListPage: list,
    userProfilePage: profile,
  }) => {
    const user = await userIn('Active');
    let row: Record<string, string> = {};
    await openModule(steps, list);

    await steps.critical('Note the key details shown for the user in the list - the values are recorded', async () => {
      await list.revealRow(user.displayNameEn);
      row = await list.readRowById(user.id);
      expect({ name: row.name, status: row.status }).toEqual({ name: user.displayNameEn, status: 'Active' });
    });

    await steps.critical('Open that user\'s profile page - the User Profile page opens', async () => {
      expect(await list.openProfile(user.id)).toContain(`/profile/${user.id}`);
      await profile.waitForLoaded();
    });

    await steps.step('Compare the Personal Information and Roles & Status details with the list - the values are identical', async () => {
      const personal = await profile.readSection('personal');
      const contact = await profile.readSection('contact');
      const roles = await profile.readSection('rolesStatus');
      const held = (await readUser(page, user.id)).assignedRoles.map((r) => r.name);
      expect({
        name: personal['First Name'],
        documentId: personal['Document ID'],
        nationality: personal.Nationality,
        identityType: personal['Identity Type'],
        mobileNumber: contact['Mobile Number'],
        status: roles.Status,
        rolesShown: held.filter((r) => !(roles.Roles ?? '').includes(r)),
      }).toEqual({
        name: row.name,
        documentId: row.documentId,
        nationality: row.nationality,
        identityType: row.identityType,
        mobileNumber: row.mobileNumber,
        status: row.status,
        rolesShown: [],
      });
    });
  });
});
