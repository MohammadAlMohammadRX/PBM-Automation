import { test, expect } from '../../../fixtures';
import type { SuiteSession } from '../../../fixtures/userModule.fixture';
import { AppRoutes } from '../../../constants/AppRoutes';
import { CASES, FORCED_CHANGE_BLOCKED, READ_ONLY_PATTERN } from '../../../data/user/viewAndEditMyProfile.data';
import { readDialog } from '../../../pages/user/userCommon';
import {
  clickSummaryStrip,
  headerLines,
  initialsOf,
  isChangePasswordButtonShown,
  openMyProfileWithFailingLoad,
  profileLines,
  sectionLines,
  summaryLabelTops,
  summaryLines,
  visibleEditableControls,
} from '../../../utils/user/writerFHelpers';

/** "Navigate to the User Management module": the suite user's Users Administration list opens. */
async function openModule(s: SuiteSession): Promise<boolean> {
  await s.users.openTable();
  expect(new URL(s.page.url()).pathname, 'the User Management module').toBe(AppRoutes.usersAdministration);
  return true;
}

/** User menu > My Profile, loaded. */
async function openProfile(s: SuiteSession): Promise<void> {
  await s.menu.openMyProfile();
  await s.myProfile.waitForLoaded();
}

/**
 * User story 20423: View and Edit My Profile - the read side (header, summary
 * strip, sections, read-only fields, load failure). Every case runs in a SUITE
 * user's own window (`suiteSession`); the edit cases live in
 * my-profile-edit.spec.ts. See the data file for the literal readings.
 */
test.describe('US 20423 - View and Edit My Profile', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.openWithoutPermission.azureId}: should open My Profile from the user menu when the signed-in user holds no profile permission`, async ({ steps, suiteSession }) => {
    const s = await suiteSession();

    await steps.critical('Navigate to the User Management module - the module is accessible', async () => {
      expect(await openModule(s), 'the User Management module').toBe(true);
    });

    await steps.step('Open the user menu and select My Profile - the My Profile page opens without any permission prompt', async () => {
      await openProfile(s);
      expect(new URL(s.page.url()).pathname, 'the page opened').toBe(AppRoutes.myProfile);
      expect((await readDialog(s.page)).visible, 'a permission prompt / dialog').toBe(false);
      expect(await s.myProfile.readName(), 'the profile shown is the signed-in user').toBe(s.user.displayNameEn);
      expect(s.role.rights.some((r) => /profile|manage/i.test(r)), 'the suite role holds no profile right').toBe(false);
    });
  });

  test(`TC-${CASES.header.azureId}: should show the name, initials, gender, status and Change Password in the header when My Profile is open`, async ({ steps, suiteSession }) => {
    const s = await suiteSession();

    await steps.critical('Navigate to the User Management module - the module is accessible', async () => {
      expect(await openModule(s), 'the User Management module').toBe(true);
    });

    await steps.step('Open My Profile and review the header area - Name, Initials, Gender, Status and a Change Password button are displayed', async () => {
      await openProfile(s);
      const header = headerLines(await profileLines(s.page));
      const name = await s.myProfile.readName();
      const gender = await s.myProfile.readValue('gender');
      expect({
        name,
        initials: header.includes(initialsOf(name)),
        gender: gender !== '' && header.includes(gender),
        status: await s.myProfile.readStatusLabel(),
        changePassword: await isChangePasswordButtonShown(s.page),
      }, `the header (${header.join(' | ')})`).toEqual({
        name: s.user.displayNameEn,
        initials: true,
        gender: true,
        status: 'Active',
        changePassword: true,
      });
    });
  });

  test(`TC-${CASES.summaryStrip.azureId}: should show Nationality, Document ID, Mobile Number and Age read-only in one line when the summary strip is reviewed`, async ({ steps, suiteSession }) => {
    const s = await suiteSession();

    await steps.critical('Navigate to the User Management module - the module is accessible', async () => {
      expect(await openModule(s), 'the User Management module').toBe(true);
    });

    await steps.step('Open My Profile and review the summary strip - Nationality, Document ID, Mobile Number and Age are displayed as read-only text in one line', async () => {
      await openProfile(s);
      await s.myProfile.expandAll();
      const strip = summaryLines(await profileLines(s.page));
      expect(strip, 'the summary strip').toEqual([
        'Nationality', await s.myProfile.readValue('nationality'),
        'Document ID', await s.myProfile.readValue('documentId'),
        'Mobile Number', await s.myProfile.readField('phoneNumber'),
        'Age', await s.myProfile.readValue('age'),
      ]);
      const tops = Object.values(await summaryLabelTops(s.page)).filter((t): t is number => t !== null);
      expect(tops.length, 'the four strip labels found').toBe(4);
      expect(Math.max(...tops) - Math.min(...tops), 'the four labels on one line (px apart)').toBeLessThanOrEqual(8);
    });

    await steps.step('Attempt to click or edit any summary strip value - the fields do not become editable', async () => {
      const clicked = await clickSummaryStrip(s.page);
      expect(clicked, 'summary strip elements clicked (-1 = the strip could not be isolated from the sections)').toBeGreaterThan(0);
      expect(await visibleEditableControls(s.page), 'editable controls after clicking the strip').toEqual([]);
    });
  });

  test(`TC-${CASES.expandCollapseAll.azureId}: should expand and then collapse all four sections when the single expand / collapse control is used`, async ({ steps, suiteSession }) => {
    const s = await suiteSession();
    const sections = ['personal', 'contact', 'rolesStatus', 'record'] as const;
    const states = async (): Promise<Record<string, boolean>> => Object.fromEntries(
      await Promise.all(sections.map(async (k) => [k, await s.myProfile.isSectionExpanded(k)] as const)),
    );

    await steps.critical('Navigate to the User Management module - the module is accessible', async () => {
      expect(await openModule(s), 'the User Management module').toBe(true);
    });

    await steps.critical('Open My Profile with every section collapsed (each closed by its own header)', async () => {
      await openProfile(s);
      for (const k of sections) if (await s.myProfile.isSectionExpanded(k)) await s.myProfile.toggleSection(k);
      expect(await states(), 'sections before Expand all').toEqual({ personal: false, contact: false, rolesStatus: false, record: false });
    });

    await steps.step('Select Expand all - Personal Information, Contact Information, Roles & Status and Record Information all expand', async () => {
      await s.myProfile.clickCollapseAll();
      expect(await states(), 'sections after Expand all').toEqual({ personal: true, contact: true, rolesStatus: true, record: true });
    });

    await steps.step('Select Collapse all - all four sections collapse', async () => {
      await s.myProfile.clickCollapseAll();
      expect(await states(), 'sections after Collapse all').toEqual({ personal: false, contact: false, rolesStatus: false, record: false });
    });
  });

  test(`TC-${CASES.readOnlyFields.azureId}: should offer no pencil on email, roles, status and identity details when the user reviews them`, async ({ steps, suiteSession }) => {
    const s = await suiteSession();

    await steps.critical('Navigate to the User Management module - the module is accessible', async () => {
      expect(await openModule(s), 'the User Management module').toBe(true);
    });

    await steps.step('Review Email Address, Roles, Status, Gender, Nationality, Identity Type, Document ID, both Dates of Birth and Age - none of these fields show a pencil icon or become editable', async () => {
      await openProfile(s);
      await s.myProfile.expandAll();
      const shown: Record<string, string> = {};
      for (const key of ['email', 'status', 'gender', 'nationality', 'identityType', 'documentId', 'dob', 'hijriDob', 'age'] as const) {
        shown[key] = await s.myProfile.readValue(key);
      }
      expect(Object.entries(shown).filter(([, v]) => v === '').map(([k]) => k), 'read-only values not displayed').toEqual([]);
      expect(sectionLines(await profileLines(s.page), 'Roles & Status'), 'the Roles row').toContain('Roles');
      const pencils = await s.myProfile.editableFieldKeys();
      expect(pencils.filter((k) => READ_ONLY_PATTERN.test(k)), `read-only fields offering a pencil (all pencils: ${pencils.join(', ')})`).toEqual([]);
      expect(await visibleEditableControls(s.page), 'editable controls with no edit started').toEqual([]);
    });
  });

  test(`TC-${CASES.forcedChangePending.azureId}: should block My Profile until the password is changed when a forced password change is pending`, async ({ steps }) => {
    steps.blocked(FORCED_CHANGE_BLOCKED);
  });

  test(`TC-${CASES.loadFailure.azureId}: should show "Your profile could not be loaded." when the profile data cannot be retrieved`, async ({ steps, suiteSession }) => {
    const s = await suiteSession();

    await steps.critical('Navigate to the User Management module - the module is accessible', async () => {
      expect(await openModule(s), 'the User Management module').toBe(true);
    });

    await steps.step('Attempt to open My Profile while the profile data cannot be retrieved - the message "Your profile could not be loaded." is displayed', async () => {
      const outcome = await openMyProfileWithFailingLoad(s.page);
      expect(outcome.failedCalls, 'profile loads answered 500 by the test').toBeGreaterThan(0);
      expect([outcome.text, ...outcome.messages].join(' | '), 'what the page showed').toContain(CASES.loadFailure.message);
    });
  });

  test(`TC-${CASES.recordInformation.azureId}: should show created, updated, email-confirmed and deactivation details read-only when Record Information is expanded`, async ({ steps, suiteSession }) => {
    const s = await suiteSession();

    await steps.critical('Navigate to the User Management module - the module is accessible', async () => {
      expect(await openModule(s), 'the User Management module').toBe(true);
    });

    await steps.step('Expand the Record Information section - Created At, Created By, Updated At, Updated By, Email Confirmed and Deactivated On are displayed as read-only', async () => {
      await openProfile(s);
      await s.myProfile.expandAll();
      const record = sectionLines(await profileLines(s.page), 'Record Information');
      expect(CASES.recordInformation.labels.filter((l) => !record.includes(l)), `labels missing from Record Information (${record.join(' | ')})`).toEqual([]);
      const pencils = await s.myProfile.editableFieldKeys();
      expect(pencils.filter((k) => /created|updated|modified|confirmed|deactivat/i.test(k)), 'Record Information fields offering a pencil').toEqual([]);
    });
  });
});
