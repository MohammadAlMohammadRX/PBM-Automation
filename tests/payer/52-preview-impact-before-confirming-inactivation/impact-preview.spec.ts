import { test, expect } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import { NON_ADMIN_PROFILE } from '../../../data/accounts/nonAdminAccount.data';
import { PAYER_STATUS_PERMISSIONS } from '../../../data/accounts/payerAdminRole.data';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import { IMPACT_SUMMARY_PATTERN } from '../../../data/payers/cascadeMessaging.data';
import { PRIMARY_REASON } from '../../../data/payers/inactivationDecisions.data';
import { IMPACT_CATEGORIES } from '../../../data/payers/impactPreview.data';

/**
 * User story: Preview Impact Before Confirming Inactivation.
 *
 * The inactivation drawer previews the impact before the change is staged. The
 * cascade story proves the preview appears; this story's residue is the preview
 * itself - it names all three categories with counts, a payer with nothing shows
 * zeros, and cancelling it leaves the payer untouched.
 *
 * The live-count and aggregate cases are BLOCKED: counts above zero need a payer
 * that owns active plans and policies, which this environment cannot provision.
 */
test.describe('Impact preview before inactivation', () => {
  test('TC-001: should name and count all three impacted categories in the preview', async ({
    payerManagementPage,
    payerInactivateDialog,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and open the Inactivate drawer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.waitForRowVisible(publishedPayer.nameEn);
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
    });

    await steps.step('The preview counts plans, policies and members', async () => {
      // The preview must finish counting - not sit on its "Checking impact..."
      // placeholder - and it must name every category, so a reviewer sees the
      // full blast radius before confirming.
      const summary = await payerInactivateDialog.getImpactSummaryText();
      expect(
        summary,
        `the preview should name and count all three categories; it read "${summary}"`,
      ).toMatch(IMPACT_SUMMARY_PATTERN);
      for (const category of IMPACT_CATEGORIES) {
        expect(summary.toLowerCase(), `the preview should mention ${category}`).toContain(category);
      }
      await payerInactivateDialog.cancel();
    });
  });

  test('TC-002: should show zero counts for a payer with no active plans, policies or members', async ({
    payerManagementPage,
    payerInactivateDialog,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and open the Inactivate drawer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.waitForRowVisible(publishedPayer.nameEn);
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
    });

    await steps.step('The preview reads zero across every category', async () => {
      // A payer this suite reaches owns no plans or policies, so the honest
      // preview is all zeros - and it must still SHOW the zeros, not hide the
      // section, so the reviewer is told "nothing cascades" explicitly.
      const summary = await payerInactivateDialog.getImpactSummaryText();
      const match = summary.match(IMPACT_SUMMARY_PATTERN);
      expect(match, `the preview should be parseable; it read "${summary}"`).not.toBeNull();
      const counts = (match ?? []).slice(1, 4).map((n) => Number(n));
      expect(
        counts,
        `a payer with nothing to cascade should preview all zeros; it read "${summary}"`,
      ).toEqual([0, 0, 0]);
      await payerInactivateDialog.cancel();
    });
  });

  test('TC-003: should abort the inactivation with no side effects when the preview is cancelled', async ({
    payerManagementPage,
    payerInactivateDialog,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and open the Inactivate drawer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
    });

    await steps.step('The preview is reviewed and then cancelled', async () => {
      await payerInactivateDialog.getImpactSummaryText();
      await payerInactivateDialog.cancel();
      expect(await payerInactivateDialog.isOpen(), 'the drawer should have closed').toBe(false);
    });

    await steps.step('The payer is still Active, with nothing staged', async () => {
      // Cancel must be truly side-effect free: no status change, and no draft
      // left behind that a later approval could apply.
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
      const label = await payerManagementPage.getVersionLabel(publishedPayer.nameEn);
      expect(
        label,
        `cancelling should stage nothing; the row reads "${label}"`,
      ).not.toMatch(/Draft|Pending/i);
    });
  });

  test('TC-004: should change the status only after the preview is confirmed', async ({
    payerManagementPage,
    payerInactivateDialog,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and open the Inactivate drawer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
    });

    await steps.step('Confirming the preview stages the inactivation as a draft', async () => {
      // The payer is still Active on the list until the staged change is
      // approved - confirming the preview does not itself flip the status, it
      // stages the change, matching every other payer edit in this module.
      await payerInactivateDialog.getImpactSummaryText();
      await payerInactivateDialog.selectReason(PRIMARY_REASON);
      await payerInactivateDialog.confirm();
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      const label = await payerManagementPage.getVersionLabel(publishedPayer.nameEn);
      expect(
        label,
        `confirming should stage a draft change; the row reads "${label}"`,
      ).toMatch(/Draft|Pending/i);
    });
  });

  test('TC-005: should show live counts aggregated from Plans, Policies and Members', async ({
    steps,
  }) => {
    steps.blocked(
      'This case needs a payer that owns active plans and policies so the preview counts are '
      + 'above zero and can be checked against the source modules. This environment cannot '
      + 'provision a payer with cascade content - the same wall the cascade story met. Provide a '
      + 'payer with known active plans, policies and members, then this case can verify the '
      + 'preview aggregates them correctly.',
    );
  });
});

/** Access control - who may inactivate and see the preview. */
test.describe('Impact preview - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('TC-006: should keep inactivation and its preview behind an authorised role', async ({
    shapeRole,
    loginPage,
    payerManagementPage,
    steps,
  }) => {
    // The role the case needs is BUILT rather than waited for: the administrator
    // takes both status rights off the shared "Payer Admin" role, and puts them
    // back when the case ends.
    await shapeRole({ without: PAYER_STATUS_PERMISSIONS });

    await steps.critical('Sign in as a user without the status rights', async () => {
      await loginPage.open();
      await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
      await payerManagementPage.navigate();
    });

    // The preview is raised BY the inactivation action, so a role that is not
    // offered the action never reaches the preview - which is the whole of what
    // this case has to prove.
    await steps.step('The inactivation action, and so its preview, is withheld', async () => {
      const payerName = NON_ADMIN_PROFILE.scopedPayers[0];
      await payerManagementPage.expectRowActionUnavailable(payerName, 'inactivate');
    });
  });
});
