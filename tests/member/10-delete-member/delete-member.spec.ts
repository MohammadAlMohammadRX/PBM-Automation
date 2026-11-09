import { test, expect } from '../../../fixtures';
import type { ConfirmDialog } from '../../../pages/components/ConfirmDialog';
import type { MemberManagementPage } from '../../../pages/member/MemberManagementPage';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { CASES, DELETED, DELETE_PROMPT, DELETION_ACTION, ENROLMENT_BLOCK } from '../../../data/member/deleteMember.data';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import {
  auditChanges,
  deleteMember,
  readAuditEntry,
  readMemberAuditTrail,
  readMemberDashboard,
  readMemberOrNull,
  updateMemberFields,
} from '../../../utils/MemberProvisioning';
import { closeDialogWithIcon, collectRequests, dialogShown, marksDeleted } from '../../../utils/member/writerCHelpers';

/** "Navigate to the Member Management module": opens the list and answers whether it lists the case's member. */
async function openList(list: MemberManagementPage, name: string): Promise<boolean> {
  await list.openTable();
  return list.isListed(name);
}

/** Every DeleteMember request (DELETE /api/Members/DeleteMember/{id}). */
const DELETE_REQUEST = /\/DeleteMember\//;

/**
 * User story 14385: Delete Member. The administrator plays the System
 * Administrator; every member is the case's own suite member (19904's is
 * enrolled in its own approved suite policy and is left deactivated with the
 * policy retired - an approved enrolment blocks the delete). The restricted
 * user lives in delete-access.spec.ts. See the data file for the readings.
 */
test.describe('US 14385 - Delete Member', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.deleteUnenrolled.azureId}: should delete a member with no policy enrolments after confirmation and confirm it`, async ({
    page,
    memberIn,
    memberManagementPage,
    memberDetailPage,
    steps,
  }) => {
    const member = await memberIn('Active');
    let dialog!: ConfirmDialog;

    await steps.critical('Navigate to the Member Management module - the module loads and displays the member list', async () => {
      expect(await openList(memberManagementPage, member.displayNameEn), 'the member in the list').toBe(true);
    });

    await steps.critical('Search for and open the member with no policy enrolments - the detail page is displayed with a Delete action available', async () => {
      await memberManagementPage.openDetails(member.displayNameEn);
      expect((await readMemberOrNull(page, member.id))?.benefitPolicies ?? [], 'the member\'s enrolments').toEqual([]);
      expect(await memberDetailPage.getActionAvailability('delete')).toBe('available');
    });

    await steps.critical('Select the Delete action - a confirmation dialog asks to confirm the deletion', async () => {
      dialog = await memberDetailPage.requestDelete();
      expect(await dialog.getTitle()).toMatch(DELETE_PROMPT.title);
      expect(await dialog.getMessage()).toMatch(DELETE_PROMPT.message);
    });

    await steps.step('Confirm the deletion - a success message confirms the member has been deleted', async () => {
      const answer = await NetworkUtils.captureResponse(page, ApiEndpoints.memberDelete, () => dialog.confirm());
      const messages = await memberDetailPage.waitForMessages();
      expect(answer?.status ?? -1, `DeleteMember answered ${answer?.text.slice(0, 200) ?? 'nothing'}`).toBe(200);
      expect(messages.join(' | '), 'the success message').toMatch(DELETED);
      expect(await readMemberOrNull(page, member.id), 'the deleted member can no longer be opened').toBeNull();
    });
  });

  test(`TC-${CASES.excludedFromList.azureId}: should leave a deleted member out of the list, its search and its count`, async ({
    page,
    memberIn,
    memberManagementPage,
    steps,
  }) => {
    const member = await memberIn('Active');
    const before = await readMemberDashboard(page);
    const deleted = await deleteMember(page, member.id);
    if (deleted.status >= 300) steps.blocked(`the precondition delete of "${member.displayNameEn}" was refused: ${deleted.status} ${deleted.text.slice(0, 200)}`);

    await steps.critical('Navigate to the Member Management module - the module loads and displays the member list', async () => {
      await memberManagementPage.openTable();
      expect(await memberManagementPage.countRows()).toBeGreaterThan(0);
    });

    await steps.step('Review the default member list view - it displays only members that have not been deleted', async () => {
      expect(await memberManagementPage.readNames(), 'the first page (newest first)').not.toContain(member.displayNameEn);
      expect((await memberManagementPage.fetchRegister({}, 500)).items.map((i) => i.id), 'the register').not.toContain(member.id);
    });

    await steps.step('Search for the deleted member by name or ID in the active list - it does not appear in the results', async () => {
      const byName = await memberManagementPage.searchFor(member.lastName);
      const byCode = await memberManagementPage.searchFor(member.code);
      expect({
        byName: byName.items.some((i) => i.id === member.id),
        byCode: byCode.items.some((i) => i.id === member.id),
        rowShown: await memberManagementPage.readNames().then((names) => names.includes(member.displayNameEn)).catch(() => false),
      }, 'the deleted member in the search results').toEqual({ byName: false, byCode: false, rowShown: false });
    });

    await steps.step('Check the member count indicator on the list view - the count reflects the exclusion of the deleted member', async () => {
      await memberManagementPage.openTable();
      expect(await memberManagementPage.readKpi('total'), `Total Members (${before.total} before the delete)`).toBe(before.total - 1);
    });
  });

  test(`TC-${CASES.cancelDeletion.azureId}: should leave the member untouched when the delete confirmation is cancelled, closed or left`, async ({
    page,
    memberIn,
    memberManagementPage,
    memberDetailPage,
    steps,
  }) => {
    const member = await memberIn('Active');

    await steps.critical('Navigate to the Member Management module - the module loads and displays the member list', async () => {
      expect(await openList(memberManagementPage, member.displayNameEn), 'the member in the list').toBe(true);
    });

    await steps.critical('Open the eligible member and select Delete - a confirmation dialog asks the administrator to confirm', async () => {
      await memberManagementPage.openDetails(member.displayNameEn);
      const dialog = await memberDetailPage.requestDelete();
      expect(await dialog.getMessage()).toMatch(DELETE_PROMPT.message);
      await dialog.cancel();
    });

    await steps.step('Explore alternatives to confirming - Cancel (No), Esc, the close icon and navigating away - the dialog is dismissed each time without deleting', async () => {
      const deletes = collectRequests(page, DELETE_REQUEST);
      const closed: Record<string, boolean> = {};
      const no = await memberDetailPage.requestDelete();
      await no.cancel();
      closed.cancel = !(await dialogShown(page));
      // Each alternative is recorded, and a dialog it left open is closed before the next one (2026-11-05: Esc left it open and blocked the rest).
      const dismissLeftover = async (): Promise<void> => {
        if (await dialogShown(page)) await closeDialogWithIcon(page).catch(() => undefined);
        await expect.poll(() => dialogShown(page), { timeout: 5_000 }).toBe(false).catch(() => undefined);
      };
      await memberDetailPage.requestDelete();
      await page.keyboard.press('Escape');
      closed.escape = await expect.poll(() => dialogShown(page), { timeout: 5_000 }).toBe(false).then(() => true).catch(() => false);
      await dismissLeftover();
      await memberDetailPage.requestDelete();
      await closeDialogWithIcon(page);
      closed.closeIcon = await expect.poll(() => dialogShown(page), { timeout: 5_000 }).toBe(false).then(() => true).catch(() => false);
      await dismissLeftover();
      await memberDetailPage.requestDelete();
      await memberManagementPage.open();
      closed.navigateAway = await expect.poll(() => dialogShown(page), { timeout: 5_000 }).toBe(false).then(() => true).catch(() => false);
      await page.waitForTimeout(1_000);
      expect(closed, 'the dialog after each alternative').toEqual({ cancel: true, escape: true, closeIcon: true, navigateAway: true });
      expect(deletes.stop().map((r) => r.url()), 'delete requests sent').toEqual([]);
    });

    await steps.step('Reopen the member record - the member is unchanged and still appears in the active list', async () => {
      await memberDetailPage.open(member.id);
      expect(await memberDetailPage.getName()).toBe(member.displayNameEn);
      expect(await memberDetailPage.getStatus()).toBe('Active');
      expect(await openList(memberManagementPage, member.displayNameEn), 'the member in the list').toBe(true);
    });
  });

  test(`TC-${CASES.explicitConfirmation.azureId}: should delete a member only once the deletion is explicitly confirmed`, async ({
    page,
    memberIn,
    memberManagementPage,
    memberDetailPage,
    steps,
  }) => {
    const member = await memberIn('Active');
    let dialog!: ConfirmDialog;

    await steps.critical('Navigate to the Member Management module - the module loads and displays the member list', async () => {
      expect(await openList(memberManagementPage, member.displayNameEn), 'the member in the list').toBe(true);
    });

    await steps.critical('Open the eligible member and select Delete - a confirmation prompt requires explicit confirmation', async () => {
      await memberManagementPage.openDetails(member.displayNameEn);
      dialog = await memberDetailPage.requestDelete();
      expect(await dialog.getTitle()).toMatch(DELETE_PROMPT.title);
      expect(await dialog.getMessage()).toMatch(DELETE_PROMPT.message);
    });

    await steps.step('Attempt to dismiss or bypass the confirmation without accepting it - nothing is deleted and the prompt closes without action', async () => {
      const deletes = collectRequests(page, DELETE_REQUEST);
      await dialog.cancel();
      await page.waitForTimeout(1_000);
      expect(await dialogShown(page), 'the prompt after declining').toBe(false);
      expect(deletes.stop().length, 'delete requests sent').toBe(0);
      expect(await readMemberOrNull(page, member.id), 'the member after declining').not.toBeNull();
    });

    await steps.step('Provide the required confirmation and resubmit - the deletion proceeds and a success message is displayed', async () => {
      const answer = await memberDetailPage.deleteMember();
      expect(answer.status, `DeleteMember answered ${answer.text.slice(0, 200)}`).toBe(200);
      expect(answer.messages.join(' | '), 'the success message').toMatch(DELETED);
      expect(await readMemberOrNull(page, member.id), 'the member after confirming').toBeNull();
    });
  });

  test(`TC-${CASES.auditTrail.azureId}: should keep the deletion, who did it and when, alongside the earlier changes in the audit log`, async ({
    page,
    memberIn,
    memberManagementPage,
    auditLogsPage,
    steps,
  }) => {
    const member = await memberIn('Active');
    const edited = await updateMemberFields(page, member.id, { occupation: CASES.auditTrail.occupation });
    if (edited.status >= 300) steps.blocked(`the precondition edit of "${member.displayNameEn}" was refused: ${edited.status} ${edited.text.slice(0, 200)}`);
    let deletedAt = 0;

    await steps.critical('Navigate to the Member Management module - the module loads', async () => {
      expect(await openList(memberManagementPage, member.displayNameEn), 'the member in the list').toBe(true);
    });

    await steps.critical('Delete a member who is not linked to any policy - the member is deleted', async () => {
      deletedAt = Date.now();
      const answer = await memberManagementPage.deleteMember(member.displayNameEn);
      expect(answer.status, `DeleteMember answered ${answer.text.slice(0, 200)}`).toBe(200);
      expect(answer.messages.join(' | ')).toMatch(DELETED);
    });

    await steps.step('Review the deletion entry in the system log - it shows who performed the deletion and when, alongside the prior changes', async () => {
      const trail = await Promise.all((await readMemberAuditTrail(page, member.id)).items.map((e) => readAuditEntry(page, e.id).catch(() => e)));
      const deletion = trail.find((e) => marksDeleted(e)) ?? trail.find((e) => Date.parse(e.occurredAtUtc) >= deletedAt - 30_000) ?? null;
      const prior = trail.find((e) => e !== deletion && 'Occupation' in auditChanges(e)) ?? null;
      const rows = await auditLogsPage.findRowsMentioning(member.id);
      expect({
        deletionEntry: deletion !== null,
        who: (deletion?.actorLabel ?? '') !== '',
        when: deletion !== null && Math.abs(Date.parse(deletion.occurredAtUtc) - deletedAt) <= 2 * 60_000,
        readsAsDeletion: deletion !== null && (DELETION_ACTION.test(deletion.actionType) || rows.some((r) => DELETION_ACTION.test(r.actionType))) ? true : `logged as "${deletion?.actionType ?? '-'}" (${rows.map((r) => r.actionType).join(', ')})`,
        priorChangeKept: prior !== null,
        listedInAuditLogs: rows.length >= 2 ? true : `${rows.length} row(s) for ${member.id}`,
      }, `the member's trail: ${JSON.stringify(trail.map((e) => [e.actionType, e.occurredAtUtc, e.actorLabel]))}`).toEqual({
        deletionEntry: true,
        who: true,
        when: true,
        readsAsDeletion: true,
        priorChangeKept: true,
        listedInAuditLogs: true,
      });
    });
  });

  test(`TC-${CASES.blockedByEnrolment.azureId}: should refuse to delete a member who holds a policy enrolment and keep the record`, async ({
    page,
    memberEnrolled,
    memberManagementPage,
    memberDetailPage,
    memberAccumulatorDashboardTab,
    steps,
  }) => {
    const { member, enrolments } = await memberEnrolled({ policies: 1 });
    let dialog!: ConfirmDialog;

    await steps.critical('Navigate to the Member Management module - the module loads and displays the member list', async () => {
      expect(await openList(memberManagementPage, member.displayNameEn), 'the member in the list').toBe(true);
    });

    await steps.critical('Search for and open the member with a policy enrolment - the detail page shows the associated enrolment', async () => {
      await memberManagementPage.openDetails(member.displayNameEn);
      await memberAccumulatorDashboardTab.open();
      expect((await memberAccumulatorDashboardTab.readPolicy()).policy.policyNumber, 'the enrolment shown').toBe(enrolments[0].policy.policyNumber);
    });

    await steps.critical('Select the Delete action - the confirmation is shown and nothing is deleted before it is answered', async () => {
      const deletes = collectRequests(page, DELETE_REQUEST);
      dialog = await memberDetailPage.requestDelete();
      expect(await dialog.getMessage()).toMatch(DELETE_PROMPT.message);
      expect(deletes.stop().length, 'delete requests before confirming').toBe(0);
    });

    await steps.step('Attempt to confirm the deletion - an error says the member cannot be deleted because enrolments exist, and the member is not removed', async () => {
      const answer = await NetworkUtils.captureResponse(page, ApiEndpoints.memberDelete, () => dialog.confirm().catch(() => undefined));
      const messages = await memberDetailPage.waitForMessages();
      expect(answer?.status ?? -1, `DeleteMember answered ${answer?.text.slice(0, 200) ?? 'nothing'}`).toBeGreaterThanOrEqual(400);
      expect(messages.join(' | '), 'the error message shown').toMatch(ENROLMENT_BLOCK);
      const after = await readMemberOrNull(page, member.id);
      expect({ exists: after !== null, active: after?.isActive, policies: after?.benefitPolicies.map((p) => p.policyNumber) }, 'the member after the refused delete')
        .toEqual({ exists: true, active: true, policies: [enrolments[0].policy.policyNumber] });
    });
  });
});
