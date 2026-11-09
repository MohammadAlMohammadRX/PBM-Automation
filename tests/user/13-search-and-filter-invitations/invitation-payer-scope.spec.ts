import { test, expect } from '../../../utils/user/userRole';
import { CASES, PAYER_A, PAYER_B } from '../../../data/user/searchAndFilterInvitations.data';
import { invitationSearchAs, openInvitationLink, stampTerm, stampedInvitationEmail } from '../../../utils/user/writerDHelpers';
import { listInvitations, payerIdByName, userStamp } from '../../../utils/UserProvisioning';

/**
 * User story 20419: Search and Filter Invitations - the Payer Admin's scope.
 * "Payer Admin for Payer A" is a payer-scoped SUITE session on PAYER_A holding
 * Invitations.GetInvitations (decision 8) - the shared Payer Admin is never
 * used. Both invitations are suite invitations of a payer-scoped suite role,
 * one per payer. There is no invitation detail page (20662): the direct-link
 * attempt is the list route + the id, and the list API asked as the scoped
 * account. See the data file.
 */
test.describe('US 20419 - Search and Filter Invitations', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.payerAdminOwnPayer.azureId}: should show a Payer Admin only the invitations of their own payer when the Payer column is reviewed`, async ({
    page,
    userRole,
    requireShapeApplied,
    suiteRole,
    suiteInvitation,
    steps,
  }) => {
    const stamp = userStamp();
    const role = await suiteRole({ hasAssignedPayers: true });
    const payerAId = await payerIdByName(page, PAYER_A);
    const own = await suiteInvitation({ roleId: role.id, payerName: PAYER_A, email: stampedInvitationEmail(stamp, 'a') });
    const other = await suiteInvitation({ roleId: role.id, payerName: PAYER_B, email: stampedInvitationEmail(stamp, 'b') });
    const s = await userRole.signIn({ with: CASES.payerAdminOwnPayer.rights, payers: [PAYER_A] });
    requireShapeApplied(s);

    await steps.critical(`Navigate to the User Management module (suite Payer Admin scoped to "${PAYER_A}") - the module home page loads`, async () => {
      await s.invitations.open();
      await s.invitations.expectToolbar();
    });

    await steps.critical('Open the Invitations list - the list loads', async () => {
      await s.invitations.openTable();
      expect(await s.invitations.getPageText()).not.toBe('');
    });

    await steps.step(`Review the Payer column across all records - only "${PAYER_A}" invitations appear, none of "${PAYER_B}"`, async () => {
      // Which invitations appear is judged by the records themselves: every record the scoped list
      // answered must belong to PAYER_A (its payerId), none may show PAYER_B. The Payer column itself
      // reads "—" for the scoped account's own PAYER_A invitation (probe 2026-11-08: with or without
      // Payers.GetPayersDropdown) - until 2026-11-08 that "—" was counted as a foreign payer; it is
      // now recorded as an observation (the name is not displayed), not as a Payer B record.
      const rows = await s.invitations.readRows();
      const listed = await listInvitations(s.page, {}, 200);
      const ours = await s.invitations.searchFor(stampTerm(stamp));
      const emails = ours.items.map((i) => i.email.toLowerCase());
      const payerNamesShown = [...new Set(rows.map((r) => r.payer))];
      if (payerNamesShown.some((p) => p !== PAYER_A)) test.info().annotations.push({ type: 'observation', description: `20661: the scoped account's Payer column shows ${JSON.stringify(payerNamesShown)} (own ${PAYER_A} invitation ${own.email})` });
      expect({
        notPayerAAnswered: listed.items.filter((i) => i.payerId !== payerAId).map((i) => `${i.email} (${i.roleName}, payer ${i.payerId ?? 'none'})`),
        payerBOnScreen: rows.filter((r) => r.payer === PAYER_B).map((r) => r.email),
        ownListed: emails.includes(own.email),
        otherListed: emails.includes(other.email),
      }, `Payer column shows ${JSON.stringify(payerNamesShown)}`).toEqual({ notPayerAAnswered: [], payerBOnScreen: [], ownListed: true, otherListed: false });
    });
  });

  test(`TC-${CASES.payerAdminDirectLink.azureId}: should deny a Payer Admin another payer's invitation when it is opened by direct link`, async ({
    userRole,
    requireShapeApplied,
    suiteRole,
    suiteInvitation,
    steps,
  }) => {
    const role = await suiteRole({ hasAssignedPayers: true });
    const other = await suiteInvitation({ roleId: role.id, payerName: PAYER_B });
    const s = await userRole.signIn({ with: CASES.payerAdminDirectLink.rights, payers: [PAYER_A] });
    requireShapeApplied(s);

    await steps.critical(`Navigate to the User Management module (suite Payer Admin scoped to "${PAYER_A}") - the module home page loads`, async () => {
      await s.invitations.open();
      await s.invitations.expectToolbar();
    });

    await steps.step(`Open the "${PAYER_B}" invitation directly by its URL / ID - access is denied or the record is reported as not found`, async () => {
      const landed = await openInvitationLink(s.page, other.id);
      const asked = await invitationSearchAs(s.page, other.email);
      expect({ recordShown: landed.text.toLowerCase().includes(other.email.toLowerCase()), apiAnswered: asked.emails.includes(other.email.toLowerCase()) }, `landed on ${landed.url}; GetInvitations ${asked.status}`)
        .toEqual({ recordShown: false, apiAnswered: false });
    });
  });
});
