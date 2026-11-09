import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { UserListPage } from '../../../pages/user/UserListPage';
import type { UserFormDrawer } from '../../../pages/user/UserFormDrawer';
import { readDialog } from '../../../pages/user/userCommon';
import { CASES, JOB_TITLE } from '../../../data/user/editUser.data';
import { readUser, suiteMobileNumber, type ProvisionedUser } from '../../../utils/UserProvisioning';
import { drawerClosed, jobTitleOffered, navigateToUser, openEditUser } from '../../../utils/user/writerBHelpers';

/** "Open Edit on an existing user" - the Edit User drawer, loaded, on User Information. */
async function openEdit(steps: TestSteps, list: UserListPage, user: ProvisionedUser): Promise<UserFormDrawer> {
  let drawer!: UserFormDrawer;
  await steps.critical(`Open Edit on an existing user ("${user.displayNameEn}") - the Edit User drawer opens with the user's data`, async () => {
    drawer = await openEditUser(list, user);
    expect(await drawer.currentStep()).toBe(1);
  });
  return drawer;
}

/** Decision 1: the step asserting the Job Title field the case edits is offered (it is not - finding). */
async function jobTitleStep(steps: TestSteps, drawer: UserFormDrawer, instead: string): Promise<void> {
  await steps.step(`Change a field such as the Job Title - the Job Title field is offered (the case goes on with the ${instead})`, async () => {
    const { offered } = await jobTitleOffered(drawer, JOB_TITLE);
    expect(offered, 'a Job Title field on User Information / Contact Information').toBe(true);
  });
}

const UNSAVED = CASES.unsavedWarning.message;

/**
 * User story 20415: Edit User - the "Unsaved Changes" guard of the Edit User
 * drawer (warning text, Discard Changes, Keep Editing, a clean close). See
 * data/user/editUser.data.ts for the literal readings (Job Title).
 */
test.describe('US 20415 - Edit User', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.unsavedWarning.azureId}: should show the exact unsaved-changes warning when the Edit User drawer is closed with unsaved changes`, async ({ steps, userListPage: list, userIn }) => {
    const c = CASES.unsavedWarning;
    const user = await userIn('Active');
    const mobile = suiteMobileNumber();
    let dialog: { title: string; message: string; actions: string[] } | null = null;
    await navigateToUser(steps, list, user);
    const drawer = await openEdit(steps, list, user);
    await jobTitleStep(steps, drawer, 'Mobile Number');

    await steps.step(`Change the Mobile Number to "${mobile}" (in place of the Job Title) without saving - the field shows the unsaved value`, async () => {
      await drawer.ensureStep(2);
      await drawer.type('phoneNumber', mobile);
      expect(await drawer.getValue('phoneNumber')).toBe(mobile);
    });

    await steps.step('Close the drawer - a warning dialog appears', async () => {
      dialog = await drawer.close();
      expect(dialog, 'the Unsaved Changes warning').not.toBeNull();
    });

    await steps.step(`Inspect the warning text - the message reads "${c.message}"`, async () => {
      expect((dialog as { message: string } | null)?.message).toBe(c.message);
    });
  });

  test(`TC-${CASES.discardChanges.azureId}: should close the drawer and keep the user's data unchanged when Discard Changes is chosen`, async ({ page, steps, userListPage: list, userIn }) => {
    const c = CASES.discardChanges;
    const user = await userIn('Active');
    const original = user.record.englishSecondName ?? '';
    await navigateToUser(steps, list, user);
    const drawer = await openEdit(steps, list, user);
    await jobTitleStep(steps, drawer, 'English Second Name');

    await steps.step(`Make an unsaved change (English Second Name "${c.secondName}" in place of the Job Title) and attempt to close the drawer (Cancel) - the unsaved-changes warning is displayed`, async () => {
      if ((await drawer.currentStep()) !== 1) await drawer.back();
      await drawer.type('englishSecondName', c.secondName);
      const dialog = await drawer.cancel();
      expect(dialog?.message, 'the Unsaved Changes warning').toBe(UNSAVED);
    });

    await steps.step('Click Discard Changes - the warning dialog and the Edit User drawer both close', async () => {
      await drawer.discardChanges();
      expect({ drawerClosed: await drawerClosed(drawer), dialog: (await readDialog(page)).visible }).toEqual({ drawerClosed: true, dialog: false });
    });

    await steps.step('Re-open the same user\'s edit drawer - the original, unchanged data is shown', async () => {
      const again = await openEditUser(list, user);
      const shown = await again.getValue('englishSecondName');
      await again.close();
      expect({ shown, stored: (await readUser(page, user.id)).englishSecondName ?? '' }).toEqual({ shown: original, stored: original });
    });
  });

  test(`TC-${CASES.keepEditing.azureId}: should return to the Edit User form with the unsaved change intact when Keep Editing is chosen`, async ({ page, steps, userListPage: list, userIn }) => {
    const user = await userIn('Active');
    const mobile = suiteMobileNumber();
    await navigateToUser(steps, list, user);
    const drawer = await openEdit(steps, list, user);
    await jobTitleStep(steps, drawer, 'Mobile Number');

    await steps.step(`Make an unsaved change (Mobile Number "${mobile}" in place of the Job Title) and attempt to close the drawer - the unsaved-changes warning is displayed`, async () => {
      await drawer.ensureStep(2);
      await drawer.type('phoneNumber', mobile);
      const dialog = await drawer.close();
      expect(dialog?.message, 'the Unsaved Changes warning').toBe(UNSAVED);
    });

    await steps.step('Click Keep Editing - the warning dialog closes and the Edit User drawer reopens', async () => {
      await drawer.keepEditing();
      expect({ dialog: (await readDialog(page)).visible, drawerOpen: await drawer.isOpen() }).toEqual({ dialog: false, drawerOpen: true });
    });

    await steps.step('Inspect the previously changed field - the unsaved value is still present', async () => {
      expect(await drawer.getValue('phoneNumber'), 'the Mobile Number box').toBe(mobile);
    });
  });

  test(`TC-${CASES.cleanClose.azureId}: should close the Edit User drawer without a warning when nothing was changed`, async ({ steps, userListPage: list, userIn }) => {
    const user = await userIn('Active');
    let drawer!: UserFormDrawer;
    await navigateToUser(steps, list, user);

    await steps.step('Open Edit on an existing user without changing any field - the drawer is displayed with existing data', async () => {
      drawer = await openEditUser(list, user);
      expect(await drawer.getValue('documentId')).toBe(user.documentId);
    });

    await steps.step('Click Cancel - the drawer closes immediately with no warning dialog shown', async () => {
      const dialog = await drawer.cancel();
      expect({ warning: dialog, closed: await drawerClosed(drawer) }).toEqual({ warning: null, closed: true });
    });
  });
});
