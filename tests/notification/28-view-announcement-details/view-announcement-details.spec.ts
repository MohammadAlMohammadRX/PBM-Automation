import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { NotificationCenterPage } from '../../../pages/notification/NotificationCenterPage';
import type { AnnouncementRecord } from '../../../utils/notification/notificationApi';
import { readAnnouncement } from '../../../utils/notification/notificationApi';
import { CASES, CHECKLIST, FIELD, NOT_PUBLISHED_MARKS, REUSE_CANCELLED, STATUS, TEXTS, TITLE } from '../../../data/notification/viewAnnouncementDetails.data';
import {
  WriterDAnnouncements,
  cancelledSuiteAnnouncement,
  detailsExpected,
  detailsShown,
  missingAudienceLines,
  present,
  publishedSuiteAnnouncement,
  viewDetails,
} from '../../../utils/notification/writerDHelpers';

async function openModule(steps: TestSteps, center: NotificationCenterPage): Promise<void> {
  await steps.critical('Navigate to the Notification Center Management module - the announcements list is displayed', async () => {
    await center.open('announcements');
    await expect(center.tabButton('announcements'), 'the Announcements tab').toBeVisible();
  });
}

const NOT_PUBLISHED = NOT_PUBLISHED_MARKS[1];
const texts = { englishMessage: TEXTS.english, arabicMessage: TEXTS.arabic };

/**
 * User story 21017: View Announcement Details - the row View drawer for each
 * status. Suite announcements only; see the data file for the readings.
 */
test.describe('US 21017 - View Announcement Details', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.published.azureId}: should show every detail of a Published announcement`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncements,
    ncAnnouncementView: view,
    suiteAnnouncements,
  }) => {
    let record: AnnouncementRecord | null = null;
    let shown: Record<string, string> = {};
    let text = '';
    await steps.critical('Precondition: a suite announcement Published to careconnect with known English and Arabic texts', async () => {
      record = await publishedSuiteAnnouncement(page, steps, suiteAnnouncements, texts);
      expect(record.status).toBe(STATUS.published);
    });
    await openModule(steps, ncCenter);

    await steps.step('Select View on the Published announcement - the "Announcement details" panel opens', async () => {
      const id = await ncAnnouncements.rowIdByName(record?.name ?? '');
      const read = await viewDetails(ncAnnouncements, view, id);
      shown = detailsShown(read);
      text = read.text;
      expect(read.text.split(' | ')[0], 'the panel title').toBe(TITLE);
    });

    await steps.step('Review the fields - name, Published, publish at, published on, both messages and the audiences', async () => {
      const stored = (await readAnnouncement(page, present(record, 'the Published announcement').id)) ?? present(record, 'the Published announcement');
      expect(shown, `panel: ${text}`).toMatchObject(detailsExpected(stored, NOT_PUBLISHED));
      expect(missingAudienceLines(stored, shown[FIELD.audiences]), `audiences not named (panel: ${text})`).toEqual([]);
    });
  });

  test(`TC-${CASES.scheduled.azureId}: should show the details of a Scheduled announcement`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncements,
    ncAnnouncementView: view,
    suiteAnnouncements,
  }) => {
    const seed = await suiteAnnouncements.create(texts);
    let shown: Record<string, string> = {};
    let text = '';
    await openModule(steps, ncCenter);

    await steps.step('Select View on the Scheduled announcement - the "Announcement details" panel opens', async () => {
      const read = await viewDetails(ncAnnouncements, view, await ncAnnouncements.rowIdByName(seed.name));
      shown = detailsShown(read);
      text = read.text;
      expect(read.text.split(' | ')[0], 'the panel title').toBe(TITLE);
    });

    await steps.step('Review the fields - name, Scheduled, publish at, both messages and the audiences', async () => {
      expect({ ...shown, [FIELD.publishedOn]: '' }, `panel: ${text}`).toMatchObject({ ...detailsExpected(seed, NOT_PUBLISHED), [FIELD.publishedOn]: '' });
      expect(shown[FIELD.status]).toBe(STATUS.scheduled);
      expect(missingAudienceLines(seed, shown[FIELD.audiences]), `audiences not named (panel: ${text})`).toEqual([]);
    });
  });

  test(`TC-${CASES.cancelled.azureId}: should show the details of a Cancelled announcement`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncements,
    ncAnnouncementView: view,
    suiteAnnouncements,
  }) => {
    let record: AnnouncementRecord | null = null;
    let shown: Record<string, string> = {};
    let text = '';
    await steps.critical('Precondition: a Cancelled suite announcement', async () => {
      record = await cancelledSuiteAnnouncement(page, steps, suiteAnnouncements, REUSE_CANCELLED);
      expect(record.status).toBe(STATUS.cancelled);
    });
    await openModule(steps, ncCenter);

    await steps.step('Select View on the Cancelled announcement - the "Announcement details" panel opens', async () => {
      const read = await viewDetails(ncAnnouncements, view, await ncAnnouncements.rowIdByName(record?.name ?? ''));
      shown = detailsShown(read);
      text = read.text;
      expect(read.text.split(' | ')[0], 'the panel title').toBe(TITLE);
    });

    await steps.step('Review the fields - name, Cancelled, publish at, published on, both messages and the audiences', async () => {
      const r = present(record, 'the Cancelled announcement');
      expect(text, 'the panel shows the Published on field').toContain(FIELD.publishedOn);
      expect(shown, `panel: ${text}`).toMatchObject({ ...detailsExpected(r, NOT_PUBLISHED), [FIELD.status]: STATUS.cancelled });
      expect(missingAudienceLines(r, shown[FIELD.audiences]), `audiences not named (panel: ${text})`).toEqual([]);
    });
  });

  test(`TC-${CASES.bothLanguages.azureId}: should show the English and the Arabic message together, each in its own direction`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncements,
    ncAnnouncementView: view,
    suiteAnnouncements,
  }) => {
    const seed = await suiteAnnouncements.create(texts);
    const screen = new WriterDAnnouncements(page);
    let shown: Record<string, string> = {};
    await openModule(steps, ncCenter);

    await steps.step('Select View on the announcement - the "Announcement details" panel opens', async () => {
      const read = await viewDetails(ncAnnouncements, view, await ncAnnouncements.rowIdByName(seed.name));
      shown = detailsShown(read);
      expect(read.text.split(' | ')[0], 'the panel title').toBe(TITLE);
    });

    await steps.step('Locate the message section - both messages are shown in full, English left-to-right and Arabic right-to-left', async () => {
      expect({ english: shown[FIELD.english], arabic: shown[FIELD.arabic] }).toEqual({ english: TEXTS.english, arabic: TEXTS.arabic });
      const ar = await screen.directionOf(TEXTS.arabic);
      const en = await screen.directionOf(TEXTS.english);
      expect({ arabic: ar.found && (ar.dir === 'rtl' || ar.direction === 'rtl'), english: en.found && en.direction === 'ltr' }, `Arabic ${JSON.stringify(ar)}, English ${JSON.stringify(en)}`)
        .toEqual({ arabic: true, english: true });
    });
  });

  test(`TC-${CASES.checklist.azureId}: should present every required piece of information with the values the announcement holds`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncements,
    ncAnnouncementView: view,
    suiteAnnouncements,
  }) => {
    let record: AnnouncementRecord | null = null;
    let shown: Record<string, string> = {};
    let text = '';
    await steps.critical('Precondition: a suite announcement Published to careconnect (so Published on is filled)', async () => {
      record = await publishedSuiteAnnouncement(page, steps, suiteAnnouncements, texts);
      expect(record.status).toBe(STATUS.published);
    });
    await openModule(steps, ncCenter);

    await steps.step('Select View on the announcement - the "Announcement details" panel opens', async () => {
      const read = await viewDetails(ncAnnouncements, view, await ncAnnouncements.rowIdByName(record?.name ?? ''));
      shown = detailsShown(read);
      text = read.text;
      expect(read.text.split(' | ')[0], 'the panel title').toBe(TITLE);
    });

    await steps.step('Check each checklist item - name, status, publish at, published on, English message, Arabic message, audiences are present and correct', async () => {
      const stored = (await readAnnouncement(page, present(record, 'the Published announcement').id)) ?? present(record, 'the Published announcement');
      expect(CHECKLIST.filter((label) => !shown[label]), `empty or missing items (panel: ${text})`).toEqual([]);
      expect(shown, `panel: ${text}`).toMatchObject(detailsExpected(stored, NOT_PUBLISHED));
      expect(missingAudienceLines(stored, shown[FIELD.audiences]), `audiences not named (panel: ${text})`).toEqual([]);
    });
  });

  test(`TC-${CASES.publishedOnOnlyWhenPublished.azureId}: should fill Published on only once the announcement has been published`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncements,
    ncAnnouncementView: view,
    suiteAnnouncements,
  }) => {
    let published: AnnouncementRecord | null = null;
    let scheduled: AnnouncementRecord | null = null;
    await steps.critical('Precondition: one Scheduled and one Published suite announcement', async () => {
      scheduled = await suiteAnnouncements.create(texts);
      published = await publishedSuiteAnnouncement(page, steps, suiteAnnouncements, texts);
      expect({ scheduled: scheduled.status, published: published.status }).toEqual({ scheduled: STATUS.scheduled, published: STATUS.published });
    });
    await openModule(steps, ncCenter);

    await steps.step('Select View on the Scheduled announcement - Published on is blank or marked not applicable', async () => {
      const read = await viewDetails(ncAnnouncements, view, await ncAnnouncements.rowIdByName(scheduled?.name ?? ''));
      expect(read.text, 'the panel shows the Published on field').toContain(FIELD.publishedOn);
      expect([...NOT_PUBLISHED_MARKS] as string[], `Published on (panel: ${read.text})`).toContain(detailsShown(read)[FIELD.publishedOn]);
      await view.close();
    });

    await steps.step('Select View on the Published announcement - Published on shows the actual date/time it was published', async () => {
      const stored = (await readAnnouncement(page, present(published, 'the Published announcement').id)) ?? present(published, 'the Published announcement');
      const read = await viewDetails(ncAnnouncements, view, await ncAnnouncements.rowIdByName(published?.name ?? ''));
      expect(detailsShown(read)[FIELD.publishedOn], `Published on (panel: ${read.text}; stored ${stored.publishedOn})`).toBe(detailsExpected(stored, NOT_PUBLISHED)[FIELD.publishedOn]);
      expect(stored.publishedOn, 'the stored publishedOn').not.toBeNull();
    });
  });
});
