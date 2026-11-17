import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { NotificationCenterPage } from '../../../pages/notification/NotificationCenterPage';
import { readAnnouncement } from '../../../utils/notification/notificationApi';
import { CASES, DELETE_API, NEAR_PUBLISH, SCHEDULED } from '../../../data/notification/deleteAnnouncement.data';
import {
  WriterDAnnouncements,
  countRequests,
  findByName,
  inboxCopies,
  minutesAhead,
  waitForWrite,
  waitUntil,
} from '../../../utils/notification/writerDHelpers';

async function openModule(steps: TestSteps, center: NotificationCenterPage): Promise<void> {
  await steps.critical('Navigate to the Notification Center Management module - the module home page is displayed', async () => {
    await center.open('announcements');
    await expect(center.tabButton('announcements'), 'the Announcements tab').toBeVisible();
  });
}

/**
 * User story 21014: Delete Announcement. Every deleted record is the case's
 * OWN Scheduled suite announcement. The confirmation dialog was not probed for
 * announcements: the cases read what appears and count the DELETE requests
 * sent before any answer. See the data file for the readings.
 */
test.describe('US 21014 - Delete Announcement', () => {
  test.describe.configure({ timeout: 8 * 60_000 });

  test(`TC-${CASES.deleteScheduled.azureId}: should delete a Scheduled announcement after confirmation so it is no longer listed`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncements,
    suiteAnnouncements,
  }) => {
    const seed = await suiteAnnouncements.create();
    const screen = new WriterDAnnouncements(page);
    let deleteAnswer: Promise<{ status: number | null; text: string }> = Promise.resolve({ status: null, text: '' });
    await openModule(steps, ncCenter);

    await steps.critical('Open the list and locate the Scheduled announcement - its row shows a Delete option', async () => {
      expect(await ncAnnouncements.rowIdByName(seed.name)).toBe(seed.id);
      await expect(ncAnnouncements.rowAction(seed.id, 'delete')).toBeVisible();
    });

    await steps.step('Select Delete - a confirmation prompt asks to confirm the removal', async () => {
      const sent = countRequests(page, DELETE_API, 'DELETE');
      deleteAnswer = waitForWrite(page, DELETE_API);
      await ncAnnouncements.rowAction(seed.id, 'delete').click();
      const dialog = await screen.readDialog();
      expect(dialog, `no confirmation appeared; DELETE requests sent on the click: ${sent.count()}`).not.toBeNull();
      sent.stop();
    });

    await steps.step('Confirm the deletion - the announcement is removed from the list', async () => {
      await screen.answerIfOpen('confirm');
      const answer = await deleteAnswer;
      expect(answer.status, `DeleteAnnouncement answered ${answer.status ?? 'nothing'} ${answer.text.slice(0, 200)}`).toBeLessThan(300);
      await expect(ncAnnouncements.row(seed.id), 'the deleted row').toHaveCount(0);
      expect(await readAnnouncement(page, seed.id), 'GetAnnouncement').toBeNull();
    });

    await steps.step('Search for the announcement by name - it no longer appears anywhere in the list', async () => {
      expect(await ncAnnouncements.rowIdByName(seed.name), 'the row after a name search').toBe('');
      await expect(ncAnnouncements.emptyState(), 'the list after the search').toBeVisible();
      expect(await findByName(page, seed.name), 'GetAnnouncements search').toBeNull();
    });
  });

  test(`TC-${CASES.confirmFirst.azureId}: should keep the Scheduled announcement listed until the deletion is confirmed`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncements,
    suiteAnnouncements,
  }) => {
    const seed = await suiteAnnouncements.create();
    const screen = new WriterDAnnouncements(page);
    let deleteAnswer: Promise<{ status: number | null; text: string }> = Promise.resolve({ status: null, text: '' });
    let sentOnClick = -1;
    await openModule(steps, ncCenter);

    await steps.critical('Open the list and locate the Scheduled announcement - its row shows a Delete option', async () => {
      expect(await ncAnnouncements.rowIdByName(seed.name)).toBe(seed.id);
      await expect(ncAnnouncements.rowAction(seed.id, 'delete')).toBeVisible();
    });

    await steps.step('Select Delete - a confirmation dialog with Confirm and Cancel options is shown and nothing is removed yet', async () => {
      const sent = countRequests(page, DELETE_API, 'DELETE');
      deleteAnswer = waitForWrite(page, DELETE_API);
      await ncAnnouncements.rowAction(seed.id, 'delete').click();
      const dialog = await screen.readDialog();
      sentOnClick = sent.count();
      sent.stop();
      expect({ dialog: dialog !== null, confirm: !!dialog?.confirm, cancel: !!dialog?.cancel, deleteSent: sentOnClick }, `dialog ${JSON.stringify(dialog)}`)
        .toEqual({ dialog: true, confirm: true, cancel: true, deleteSent: 0 });
    });

    await steps.step('Verify the announcement is still listed while the dialog is open - it remains listed as Scheduled', async () => {
      await expect(ncAnnouncements.cell(seed.id, 'status')).toHaveText(SCHEDULED);
      expect((await readAnnouncement(page, seed.id))?.status, `GetAnnouncement (DELETE requests sent on the click: ${sentOnClick})`).toBe(SCHEDULED);
    });

    await steps.step('Select Confirm in the dialog - the announcement is removed from the list', async () => {
      await screen.answerIfOpen('confirm');
      const answer = await deleteAnswer;
      expect(answer.status, `DeleteAnnouncement answered ${answer.status ?? 'nothing'} ${answer.text.slice(0, 200)}`).toBeLessThan(300);
      await expect(ncAnnouncements.row(seed.id)).toHaveCount(0);
      expect(await readAnnouncement(page, seed.id), 'GetAnnouncement').toBeNull();
    });
  });

  test(`TC-${CASES.cancelKeeps.azureId}: should keep the Scheduled announcement unchanged when the delete is cancelled or dismissed`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncements,
    suiteAnnouncements,
  }) => {
    const seed = await suiteAnnouncements.create();
    const screen = new WriterDAnnouncements(page);
    const sent = countRequests(page, DELETE_API, 'DELETE');
    await openModule(steps, ncCenter);

    await steps.critical('Open the list and locate the Scheduled announcement - its row shows a Delete option', async () => {
      expect(await ncAnnouncements.rowIdByName(seed.name)).toBe(seed.id);
      await expect(ncAnnouncements.rowAction(seed.id, 'delete')).toBeVisible();
    });

    await steps.step('Select Delete - a confirmation dialog is displayed', async () => {
      await ncAnnouncements.rowAction(seed.id, 'delete').click();
      expect(await screen.readDialog(), `no dialog; DELETE requests sent: ${sent.count()}`).not.toBeNull();
    });

    await steps.step('Select Cancel (and, on a second Delete, dismiss the dialog with X) - the dialog closes with no changes made', async () => {
      await screen.answerIfOpen('cancel');
      await expect(screen.dialogTitle(), 'the dialog after Cancel').toBeHidden();
      await ncAnnouncements.rowAction(seed.id, 'delete').click();
      expect(await screen.readDialog(), `no dialog on the second Delete; DELETE requests sent: ${sent.count()}`).not.toBeNull();
      await screen.answerIfOpen('close');
      await expect(screen.dialogTitle(), 'the dialog after X').toBeHidden();
      expect(sent.count(), 'DELETE requests sent').toBe(0);
    });

    await steps.step('Refresh the announcement list - the announcement is still Scheduled with unchanged content', async () => {
      sent.stop();
      await ncAnnouncements.open();
      expect(await ncAnnouncements.rowIdByName(seed.name)).toBe(seed.id);
      await expect(ncAnnouncements.cell(seed.id, 'status')).toHaveText(SCHEDULED);
      expect(await readAnnouncement(page, seed.id), 'the stored announcement').toMatchObject({
        name: seed.name,
        status: SCHEDULED,
        englishMessage: seed.englishMessage,
        arabicMessage: seed.arabicMessage,
        publishAt: seed.publishAt,
      });
    });
  });

  test(`TC-${CASES.deleteBeforePublish.azureId}: should delete a Scheduled announcement minutes before its publish time so it never publishes`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncements,
    suiteAnnouncements,
  }) => {
    const publishAt = minutesAhead(NEAR_PUBLISH.minutesAhead);
    const seed = await suiteAnnouncements.create({ publishAt });
    const screen = new WriterDAnnouncements(page);
    let deleteAnswer: Promise<{ status: number | null; text: string }> = Promise.resolve({ status: null, text: '' });
    await openModule(steps, ncCenter);

    await steps.critical('Locate the Scheduled announcement nearing its Publish at - the row shows Scheduled and a Delete option', async () => {
      expect(await ncAnnouncements.rowIdByName(seed.name)).toBe(seed.id);
      await expect(ncAnnouncements.cell(seed.id, 'status')).toHaveText(SCHEDULED);
      await expect(ncAnnouncements.rowAction(seed.id, 'delete')).toBeVisible();
    });

    let deletedAt = 0;
    await steps.step('Select Delete and confirm with time remaining before Publish at - the announcement is removed immediately', async () => {
      deleteAnswer = waitForWrite(page, DELETE_API);
      await ncAnnouncements.rowAction(seed.id, 'delete').click();
      // The confirmation opens ~0.2 s after the click: wait for it before answering (full run 2026-11-12: an
      // immediate answerIfOpen saw no dialog yet, nothing was confirmed, and the announcement then published).
      const dialog = await screen.readDialog();
      if (dialog) await screen.answerDialog('confirm');
      const answer = await deleteAnswer;
      const how = `confirmation ${dialog ? `"${dialog.title}" answered ${dialog.confirm || 'Yes'}` : 'none appeared'}`;
      expect(answer.status, `DeleteAnnouncement was never sent (${how})`).not.toBeNull();
      expect(answer.status, `DeleteAnnouncement answered ${answer.status} ${answer.text.slice(0, 200)} (${how})`).toBeLessThan(300);
      deletedAt = Date.now();
      expect(deletedAt, `deleted at ${new Date(deletedAt).toISOString()}, before the Publish at ${publishAt.toISOString()}`).toBeLessThan(publishAt.getTime());
      await expect(ncAnnouncements.row(seed.id)).toHaveCount(0);
    });

    await steps.step('Wait past the original Publish at time - no publication occurs and no recipient receives it', async () => {
      await waitUntil(page, publishAt.getTime() + NEAR_PUBLISH.waitAfterPublishSeconds * 1000);
      const deleted = deletedAt > 0 ? `deleted at ${new Date(deletedAt).toISOString()}` : 'the delete in the step before did NOT go through';
      expect({ record: await readAnnouncement(page, seed.id), listed: await findByName(page, seed.name), inbox: (await inboxCopies(page, seed.name)).length }, `after the Publish at ${publishAt.toISOString()} (${deleted})`)
        .toEqual({ record: null, listed: null, inbox: 0 });
    });
  });
});
