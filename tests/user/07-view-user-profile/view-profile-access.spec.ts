import { test, expect } from '../../../utils/user/userRole';
import { CASES, ACCESS_DENIED, NO_VIEW_RIGHTS, SECTION_LABELS } from '../../../data/user/viewUserProfile.data';
import { WRITER_A_IDS } from '../../../constants/user/writerAIds';
import { pressEnterOn } from '../../../utils/user/writerAHelpers';

/**
 * User story 20413: View User Profile - who may open it. The restricted account
 * is a suite user whose suite role lacks Users.GetUser ("View User"); the
 * baseline shows the administrator (who holds it) is offered View / opens the
 * profile first. See the data file.
 */
test.describe('US 20413 - View User Profile (permission)', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.noViewPermission.azureId}: should not offer or open the View action when the role lacks the view permission`, async ({
    steps,
    userIn,
    userListPage: list,
    userRole,
    requireShapeApplied,
  }) => {
    const target = await userIn('Active');

    await steps.critical('Baseline - the administrator, who holds View User, is offered the View action on the row', async () => {
      await list.openTable();
      await list.revealRow(target.displayNameEn);
      expect((await list.getActionState(target.id, 'view')).availability).toBe('available');
    });

    const s = await userRole.signIn({ with: NO_VIEW_RIGHTS });
    requireShapeApplied(s);

    await steps.critical('Navigate to the User Management module as the user without the View User Profile permission - the list view is displayed', async () => {
      await s.users.openTable();
      await s.users.expectToolbar();
    });

    await steps.critical(`Locate the user record "${target.displayNameEn}" in the list - the row is visible`, async () => {
      await s.users.revealRow(target.displayNameEn);
      expect(await s.users.isRowShownById(target.id)).toBe(true);
    });

    await steps.step('Look for a View action against the row - it is not shown, or is disabled', async () => {
      expect(['absent', 'disabled']).toContain((await s.users.getActionState(target.id, 'view')).availability);
    });

    await steps.step('Attempt to trigger the view action anyway (keyboard) - nothing happens and the profile page does not open', async () => {
      const enter = await pressEnterOn(s.page, `${WRITER_A_IDS.userRowPrefix}${target.id}`);
      expect({ profileUrl: /\/profile\//.test(enter.urlAfter), profileLoaded: await s.profile.isLoaded() }).toEqual({ profileUrl: false, profileLoaded: false });
    });
  });

  test(`TC-${CASES.directLinkDenied.azureId}: should deny a direct profile link to a user without the view permission`, async ({
    steps,
    userIn,
    userProfilePage: profile,
    userRole,
    requireShapeApplied,
  }) => {
    const target = await userIn('Active');
    let outcome!: { url: string; loaded: boolean; messages: string[] };

    await steps.critical('Baseline - the administrator, who holds View User, opens the profile link', async () => {
      await profile.open(target.id);
      expect(await profile.isLoaded()).toBe(true);
    });

    const s = await userRole.signIn({ with: NO_VIEW_RIGHTS });
    requireShapeApplied(s);

    await steps.critical('Navigate to the User Management module as the user without the View User Profile permission - the list view is displayed', async () => {
      await s.users.openTable();
      await s.users.expectToolbar();
    });

    await steps.step('Open the known profile URL directly in the browser - access is denied or the user is redirected', async () => {
      outcome = await s.profile.openExpectingFailure(target.id);
      const text = await s.profile.getPageText();
      expect({ redirected: !outcome.url.includes(`/profile/${target.id}`), denied: ACCESS_DENIED.test([text, ...outcome.messages].join(' ')) }, `${outcome.url} | ${text.slice(-200)}`)
        .not.toEqual({ redirected: false, denied: false });
    });

    await steps.step('Confirm no profile data is rendered - no Personal, Contact, Roles & Status or Record Information content', async () => {
      const text = await s.profile.getPageText();
      expect({
        loaded: outcome.loaded,
        sections: SECTION_LABELS.filter((l) => text.includes(l)),
        documentId: text.includes(target.documentId),
        email: text.includes(target.email),
      }).toEqual({ loaded: false, sections: [], documentId: false, email: false });
    });
  });
});
