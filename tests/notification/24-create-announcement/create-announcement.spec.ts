import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { NotificationCenterPage } from '../../../pages/notification/NotificationCenterPage';
import type { DrawerSaveOutcome } from '../../../pages/notification/Drawers';
import {
  ADMIN_PICKER_NAME,
  CASES,
  DEFAULT_NOW_TOLERANCE_SECONDS,
  FILLING,
  HOLIDAY,
  LABELS,
  MANAGERS_ROLE_RIGHTS,
  MESSAGES,
  NAME_MAX,
  PUNCTUATION,
  ROLE_AUDIENCE_RIGHTS,
  SCHEDULE,
  VALID_TEXT,
} from '../../../data/notification/createAnnouncement.data';
import { readAnnouncement, AUDIENCE_TYPE } from '../../../utils/notification/notificationApi';
import {
  accepted,
  adminPickerName,
  bellRowsNamed,
  cardType,
  daysAhead,
  describeSave,
  findByName,
  generalValues,
  pickerText,
  secondsFromNow,
  suiteName,
  viewDetails,
  viewField,
  waitForInboxCopies,
  waitForMinuteStart,
  waitForStatus,
  waitUntil,
  audienceCardCount,
  normalise,
} from '../../../utils/notification/writerDHelpers';

/** Step 1 of every case: the Notification Center, Announcements tab. */
async function openModule(steps: TestSteps, center: NotificationCenterPage): Promise<void> {
  await steps.critical('Navigate to the Notification Center Management module - the module home page is displayed', async () => {
    await center.open('announcements');
    await expect(center.tabButton('announcements'), 'the Announcements tab').toBeVisible();
  });
}

/**
 * User story 21012: Create Announcement - the cases that SAVE an announcement
 * through the screen. Validation cases are in create-validation.spec.ts. See
 * the data file for the readings. Published ones are cancelled at teardown
 * (they stay listed as Cancelled); Scheduled ones are deleted.
 */
test.describe('US 21012 - Create Announcement', () => {
  test.describe.configure({ timeout: 8 * 60_000 });

  test(`TC-${CASES.publishNowToUser.azureId}: should publish the announcement at once to the selected user when Publish at is left at now`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncementDrawer: drawer,
    suiteAnnouncements,
  }) => {
    const name = suiteName(HOLIDAY.label);
    let admin = '';
    let idx = 0;
    await steps.critical('Precondition: the suite watches what the case creates; careconnect is the user to select', async () => {
      await suiteAnnouncements.watch();
      admin = await adminPickerName(page, suiteAnnouncements, ADMIN_PICKER_NAME);
      expect(admin, 'careconnect in the audience picker').not.toBe('');
    });
    await openModule(steps, ncCenter);

    await steps.critical('Select Create Announcement - the General step is displayed with empty Name, English and Arabic messages (Publish at is checked at step 6)', async () => {
      await waitForMinuteStart(page);
      await drawer.openCreate();
      const v = await generalValues(drawer);
      expect({ name: v.name, english: v.english, arabic: v.arabic }, 'the General fields').toEqual({ name: '', english: '', arabic: '' });
    });

    await steps.step(`Enter Name "${HOLIDAY.label}" (suite name) - the name is accepted and shown`, async () => {
      await drawer.fillGeneral({ name });
      await expect(drawer.el('name')).toHaveValue(name);
    });

    await steps.step(`Enter English message "${HOLIDAY.english}" - accepted`, async () => {
      await drawer.fillGeneral({ english: HOLIDAY.english });
      await expect(drawer.byPart('english-message-input')).toHaveValue(HOLIDAY.english);
    });

    await steps.step(`Enter Arabic message "${HOLIDAY.arabic}" - accepted`, async () => {
      await drawer.fillGeneral({ arabic: HOLIDAY.arabic });
      await expect(drawer.byPart('arabic-message-input')).toHaveValue(HOLIDAY.arabic);
    });

    await steps.step('Leave Publish at unchanged - the field shows the current date and time', async () => {
      const shown = await drawer.publishInput().inputValue();
      expect(Math.abs(secondsFromNow(shown) ?? 1e9), `Publish at "${shown}" vs now`).toBeLessThanOrEqual(DEFAULT_NOW_TOLERANCE_SECONDS);
    });

    await steps.critical('Proceed to the Audiences step - the Audiences step is displayed', async () => {
      const toast = await drawer.next();
      await expect(drawer.el('addAudience'), `the Audiences step (toast after Next: "${toast}")`).toBeVisible();
    });

    await steps.step('Select Audience type "Users" - a Users audience card appears with its Assign (Available / Selected) picker', async () => {
      idx = await drawer.addAudience('Users');
      expect(await cardType(drawer, idx)).toBe(LABELS.users);
      await expect(drawer.audienceCard(idx, 'assign-button')).toBeVisible();
    });

    await steps.step('Move one user (careconnect) from Available to Selected - the user appears in the Selected list', async () => {
      await drawer.assign(idx, [admin]);
      expect(await drawer.audienceCardText(idx), 'the Users card').toContain(admin);
    });

    await steps.step('Click Save - "Saved successfully." is displayed and the announcement is published at once to the selected user', async () => {
      const saved = await drawer.save();
      expect(saved.toast, describeSave(saved)).toBe(MESSAGES.saved);
      expect(accepted(saved), describeSave(saved)).toBe(true);
      const row = await findByName(page, name);
      expect(row, `"${name}" in GetAnnouncements`).not.toBeNull();
      expect((await waitForStatus(page, row?.id ?? '', LABELS.published))?.status, 'its status after the publishing run').toBe(LABELS.published);
      expect((await waitForInboxCopies(page, name)).length, 'copies in the selected user\'s (careconnect) inbox').toBe(1);
    });
  });

  test(`TC-${CASES.scheduleToRole.azureId}: should save a Scheduled announcement for a selected role when Publish at is three days ahead`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncements,
    ncAnnouncementDrawer: drawer,
    suiteRole,
    suiteAnnouncements,
  }) => {
    const name = suiteName('scheduled to a role');
    const at = daysAhead(SCHEDULE.futureDays);
    let roleName = '';
    let idx = 0;
    await steps.critical('Precondition: an empty suite role to select; the suite watches what the case creates', async () => {
      roleName = (await suiteRole({ rights: ROLE_AUDIENCE_RIGHTS })).name;
      await suiteAnnouncements.watch();
      expect(roleName).toContain('QA Automation Role');
    });
    await openModule(steps, ncCenter);

    await steps.critical('Select Create Announcement - the General step is displayed', async () => {
      await drawer.openCreate();
      await expect(drawer.el('name')).toBeVisible();
    });

    await steps.step('Enter Name, English message and Arabic message - all three are accepted', async () => {
      await drawer.fillGeneral({ name, english: VALID_TEXT.english, arabic: VALID_TEXT.arabic });
      expect(await generalValues(drawer)).toMatchObject({ name, english: VALID_TEXT.english, arabic: VALID_TEXT.arabic });
    });

    await steps.step('Set Publish at to a date and time three days ahead - the future date/time is accepted', async () => {
      await drawer.setPublishAt(at);
      await expect(drawer.publishInput()).toHaveValue(pickerText(at));
    });

    await steps.critical('Proceed to the Audiences step - the Audiences step is displayed', async () => {
      const toast = await drawer.next();
      await expect(drawer.el('addAudience'), `the Audiences step (toast after Next: "${toast}")`).toBeVisible();
    });

    await steps.step('Select Audience type "Roles" - a Roles audience card appears with its Assign picker', async () => {
      idx = await drawer.addAudience('Roles');
      expect(await cardType(drawer, idx)).toBe(LABELS.roles);
      await expect(drawer.audienceCard(idx, 'assign-button')).toBeVisible();
    });

    await steps.step('Move one role (the suite role) from Available to Selected - the role appears in the Selected list', async () => {
      await drawer.assign(idx, [roleName]);
      expect(await drawer.audienceCardText(idx), 'the Roles card').toContain(roleName);
    });

    await steps.step('Click Save - "Saved successfully." is displayed and the announcement shows as Scheduled', async () => {
      const saved = await drawer.save();
      expect(saved.toast, describeSave(saved)).toBe(MESSAGES.saved);
      const id = await ncAnnouncements.rowIdByName(name);
      expect(id, `"${name}" listed`).not.toBe('');
      await expect(ncAnnouncements.cell(id, 'status')).toHaveText(LABELS.scheduled);
      const stored = await readAnnouncement(page, id);
      expect({ status: stored?.status, publishAt: pickerText(stored?.publishAt ?? 0), types: stored?.audiences.map((a) => a.audienceTypeId) })
        .toEqual({ status: LABELS.scheduled, publishAt: pickerText(at), types: [AUDIENCE_TYPE.roles] });
    });
  });

  test(`TC-${CASES.nameMaxLength.azureId}: should save an announcement whose name is exactly 200 characters and show it in full`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncements,
    ncAnnouncementDrawer: drawer,
    ncAnnouncementView,
    announcementBell,
    announcementDetail,
    suiteAnnouncements,
  }) => {
    const name = suiteName('max length', NAME_MAX);
    let admin = '';
    await steps.critical('Precondition: the suite watches what the case creates; careconnect is the audience', async () => {
      await suiteAnnouncements.watch();
      admin = await adminPickerName(page, suiteAnnouncements, ADMIN_PICKER_NAME);
      expect(name).toHaveLength(NAME_MAX);
    });
    await openModule(steps, ncCenter);

    await steps.critical('Select Create Announcement - the General step is displayed', async () => {
      await waitForMinuteStart(page);
      await drawer.openCreate();
      await expect(drawer.el('name')).toBeVisible();
    });

    await steps.step('Enter a Name of exactly 200 characters - the full name is accepted with no truncation or error', async () => {
      await drawer.fillGeneral({ name });
      await expect(drawer.el('name')).toHaveValue(name);
    });

    await steps.step('Fill English message, Arabic message and Publish at (left at now) with valid values - all accepted', async () => {
      await drawer.fillGeneral({ english: VALID_TEXT.english, arabic: VALID_TEXT.arabic });
      const v = await generalValues(drawer);
      expect({ english: v.english, arabic: v.arabic }).toEqual({ english: VALID_TEXT.english, arabic: VALID_TEXT.arabic });
      expect(Math.abs(secondsFromNow(v.publishAt) ?? 1e9), `Publish at "${v.publishAt}"`).toBeLessThanOrEqual(DEFAULT_NOW_TOLERANCE_SECONDS);
    });

    await steps.step('Add an audience with one assigned item on the Audiences step - the audience is accepted', async () => {
      const toast = await drawer.next();
      await expect(drawer.el('addAudience'), `the Audiences step (toast "${toast}")`).toBeVisible();
      const idx = await drawer.addAudience('Users');
      await drawer.assign(idx, [admin]);
      expect(await drawer.audienceCardText(idx)).toContain(admin);
    });

    await steps.step('Click Save - "Saved successfully." and the 200-character name is the title in the list, the details and the recipient\'s list and detail page', async () => {
      const saved = await drawer.save();
      expect(saved.toast, describeSave(saved)).toBe(MESSAGES.saved);
      const id = await ncAnnouncements.rowIdByName(name);
      expect(id, 'the list row named with all 200 characters').not.toBe('');
      expect(viewField((await viewDetails(ncAnnouncements, ncAnnouncementView, id)).fields, 'Name'), 'Announcement details: Name').toBe(name);
      await ncAnnouncementView.close();
      expect((await waitForStatus(page, id, LABELS.published))?.status).toBe(LABELS.published);
      expect((await waitForInboxCopies(page, name)).length, 'the recipient\'s (careconnect) inbox copies').toBe(1);
      await announcementBell.search(name);
      expect(bellRowsNamed(await announcementBell.readRows(), name).length, 'the recipient\'s announcement bell rows titled with the full name').toBe(1);
      await announcementBell.close();
      await announcementDetail.open(id);
      await announcementDetail.waitForLoaded();
      await expect(announcementDetail.el('title'), 'the recipient\'s detail page title').toHaveText(name);
    });
  });

  test(`TC-${CASES.exactlyOneYear.azureId}: should save a Scheduled announcement whose Publish at is exactly one year ahead`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncementDrawer: drawer,
    suiteAnnouncements,
  }) => {
    const name = suiteName('one year ahead');
    const at = daysAhead(SCHEDULE.oneYearDays);
    let admin = '';
    await steps.critical('Precondition: the suite watches what the case creates; careconnect is the audience', async () => {
      await suiteAnnouncements.watch();
      admin = await adminPickerName(page, suiteAnnouncements, ADMIN_PICKER_NAME);
      expect(admin).not.toBe('');
    });
    await openModule(steps, ncCenter);

    await steps.critical('Select Create Announcement - the General step is displayed', async () => {
      await drawer.openCreate();
      await expect(drawer.el('name')).toBeVisible();
    });

    await steps.step('Fill Name, English message and Arabic message with valid values - all accepted', async () => {
      await drawer.fillGeneral({ name, english: VALID_TEXT.english, arabic: VALID_TEXT.arabic });
      expect(await generalValues(drawer)).toMatchObject({ name, english: VALID_TEXT.english, arabic: VALID_TEXT.arabic });
    });

    await steps.step('Set Publish at to exactly one year from now - accepted with no validation error', async () => {
      await drawer.setPublishAt(at);
      await expect(drawer.publishInput()).toHaveValue(pickerText(at));
      expect(await drawer.text(), 'the General step').not.toContain(MESSAGES.overYear);
    });

    await steps.step('Add an audience with one assigned item and click Save - "Saved successfully." and the announcement is Scheduled one year ahead', async () => {
      const toast = await drawer.next();
      await expect(drawer.el('addAudience'), `the Audiences step (toast "${toast}")`).toBeVisible();
      const idx = await drawer.addAudience('Users');
      await drawer.assign(idx, [admin]);
      const saved = await drawer.save();
      expect(saved.toast, describeSave(saved)).toBe(MESSAGES.saved);
      const row = await findByName(page, name);
      expect({ status: row?.status, publishAt: pickerText(row?.publishAt ?? 0) }).toEqual({ status: LABELS.scheduled, publishAt: pickerText(at) });
    });
  });

  test(`TC-${CASES.fillingAllowance.azureId}: should save and publish at once when about 50 seconds were spent on the form with Publish at left at its default`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncementDrawer: drawer,
    suiteAnnouncements,
  }) => {
    const name = suiteName('filling allowance');
    let admin = '';
    let openedAt = 0;
    let defaultValue = '';
    await steps.critical('Precondition: the suite watches what the case creates; careconnect is the audience', async () => {
      await suiteAnnouncements.watch();
      admin = await adminPickerName(page, suiteAnnouncements, ADMIN_PICKER_NAME);
      expect(admin).not.toBe('');
    });
    await openModule(steps, ncCenter);

    await steps.critical('Select Create Announcement - the General step is displayed with Publish at defaulted to now', async () => {
      await waitForMinuteStart(page);
      openedAt = Date.now();
      await drawer.openCreate();
      defaultValue = await drawer.publishInput().inputValue();
      expect(Math.abs(secondsFromNow(defaultValue) ?? 1e9), `Publish at "${defaultValue}"`).toBeLessThanOrEqual(DEFAULT_NOW_TOLERANCE_SECONDS);
    });

    await steps.step('Leave Publish at untouched and spend about 45 seconds entering Name and both messages - Publish at still shows the original default', async () => {
      await drawer.fillGeneral({ name, english: VALID_TEXT.english, arabic: VALID_TEXT.arabic });
      await waitUntil(page, openedAt + FILLING.typingSeconds * 1000);
      await expect(drawer.publishInput()).toHaveValue(defaultValue);
    });

    await steps.step('Proceed to the Audiences step and assign an audience - the audience is accepted', async () => {
      const toast = await drawer.next();
      await expect(drawer.el('addAudience'), `the Audiences step (toast "${toast}")`).toBeVisible();
      const idx = await drawer.addAudience('Users');
      await drawer.assign(idx, [admin]);
      expect(await drawer.audienceCardText(idx)).toContain(admin);
    });

    await steps.step('Click Save about 50 seconds after opening - no "cannot be in the past" error; saved and published at once', async () => {
      await waitUntil(page, openedAt + FILLING.saveAtSeconds * 1000);
      const saved = await drawer.save();
      expect(`${saved.toast} | ${await drawer.text()}`, describeSave(saved)).not.toContain(MESSAGES.past);
      expect(saved.toast, describeSave(saved)).toBe(MESSAGES.saved);
      const row = await findByName(page, name);
      expect((await waitForStatus(page, row?.id ?? '', LABELS.published))?.status, `"${name}" after the publishing run`).toBe(LABELS.published);
    });
  });

  test(`TC-${CASES.onceForSeveralAudiences.azureId}: should deliver the announcement once to a user who is in both a Users and a Roles audience`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncementDrawer: drawer,
    secondUser,
    suiteAnnouncements,
  }) => {
    const name = suiteName('once for several audiences');
    let roleName = '';
    await steps.critical('Precondition: User A (maalmohammad) holds only a suite role ("Managers"); the suite watches what the case creates', async () => {
      roleName = (await secondUser.withRights(MANAGERS_ROLE_RIGHTS)).name;
      await suiteAnnouncements.watch();
      expect(roleName).toContain('QA Automation Role');
    });
    await openModule(steps, ncCenter);

    await steps.critical('Select Create Announcement and complete the General step with Publish at now - the current time is accepted', async () => {
      await waitForMinuteStart(page);
      await drawer.openCreate();
      await drawer.fillGeneral({ name, english: VALID_TEXT.english, arabic: VALID_TEXT.arabic });
      const shown = await drawer.publishInput().inputValue();
      expect(Math.abs(secondsFromNow(shown) ?? 1e9), `Publish at "${shown}"`).toBeLessThanOrEqual(DEFAULT_NOW_TOLERANCE_SECONDS);
    });

    await steps.step('On the Audiences step add Audience type "Users" and select User A - User A is in the Users Selected list', async () => {
      const toast = await drawer.next();
      await expect(drawer.el('addAudience'), `the Audiences step (toast "${toast}")`).toBeVisible();
      const idx = await drawer.addAudience('Users');
      await drawer.assign(idx, [secondUser.displayName]);
      expect(await drawer.audienceCardText(idx), 'the Users card (spaces collapsed as the screen shows them)').toContain(normalise(secondUser.displayName));
    });

    await steps.step('Click Add audience, select "Roles" and assign the role holding User A - the role is in the Roles Selected list', async () => {
      const idx = await drawer.addAudience('Roles');
      await drawer.assign(idx, [roleName]);
      expect(await drawer.audienceCardText(idx)).toContain(roleName);
    });

    await steps.step('Click Save - "Saved successfully." and the announcement publishes at once', async () => {
      const saved = await drawer.save();
      expect(saved.toast, describeSave(saved)).toBe(MESSAGES.saved);
      const row = await findByName(page, name);
      expect((await waitForStatus(page, row?.id ?? '', LABELS.published))?.status).toBe(LABELS.published);
    });

    await steps.step('Check User A\'s announcement list - exactly one entry for the announcement', async () => {
      expect((await waitForInboxCopies(secondUser.page, name)).length, 'copies in User A\'s inbox (GetMyAnnouncements)').toBe(1);
      await secondUser.announcementBell.search(name);
      expect(bellRowsNamed(await secondUser.announcementBell.readRows(), name).length, 'rows in User A\'s announcement bell').toBe(1);
    });
  });

  test(`TC-${CASES.secondCard.azureId}: should save an announcement with a Users card and a second Roles card`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncements,
    ncAnnouncementDrawer: drawer,
    ncAnnouncementView,
    suiteRole,
    suiteAnnouncements,
  }) => {
    const name = suiteName('two audience cards');
    let admin = '';
    let roleName = '';
    let saved: DrawerSaveOutcome | null = null;
    await steps.critical('Precondition: an empty suite role and careconnect to select; the suite watches what the case creates', async () => {
      roleName = (await suiteRole({ rights: ROLE_AUDIENCE_RIGHTS })).name;
      await suiteAnnouncements.watch();
      admin = await adminPickerName(page, suiteAnnouncements, ADMIN_PICKER_NAME);
      expect(admin).not.toBe('');
    });
    await openModule(steps, ncCenter);

    await steps.critical('Select Create Announcement, complete the General step and reach the Audiences step - one audience card can be configured', async () => {
      await drawer.openCreate();
      await drawer.fillGeneral({ name, english: VALID_TEXT.english, arabic: VALID_TEXT.arabic, publishAt: daysAhead(SCHEDULE.futureDays) });
      const toast = await drawer.next();
      await expect(drawer.el('addAudience'), `the Audiences step (toast "${toast}")`).toBeVisible();
    });

    await steps.step('Select Audience type "Users" and assign one user - the Users card shows one selected user', async () => {
      const idx = await drawer.addAudience('Users');
      await drawer.assign(idx, [admin]);
      expect(await drawer.audienceCardText(idx)).toContain(admin);
    });

    await steps.step('Click Add audience - a second, empty audience card is displayed', async () => {
      await drawer.el('addAudience').click();
      await expect(drawer.audienceCard(1, 'type-select')).toBeVisible();
      expect(await audienceCardCount(page)).toBe(2);
    });

    await steps.step('Select Audience type "Roles" on the second card and assign one role - the Roles card shows one selected role', async () => {
      await drawer.choose('audience-idx-1-type-select', LABELS.roles);
      await drawer.assign(1, [roleName]);
      expect({ type: await cardType(drawer, 1), text: await drawer.audienceCardText(1) }).toEqual({ type: LABELS.roles, text: expect.stringContaining(roleName) });
    });

    await steps.step('Click Save - "Saved successfully." and the announcement is saved with both audience cards', async () => {
      saved = await drawer.save();
      expect(saved.toast, describeSave(saved)).toBe(MESSAGES.saved);
      const id = await ncAnnouncements.rowIdByName(name);
      const details = (await viewDetails(ncAnnouncements, ncAnnouncementView, id)).text;
      expect(details, 'Announcement details lists the user').toContain(admin);
      expect(details, 'Announcement details lists the role').toContain(roleName);
      const types = (await readAnnouncement(page, id))?.audiences.map((a) => a.audienceTypeId).sort() ?? [];
      expect(types, 'the stored audience types').toEqual([AUDIENCE_TYPE.users, AUDIENCE_TYPE.roles].sort());
    });
  });

  test(`TC-${CASES.digitsAndPunctuation.azureId}: should accept digits and punctuation in both language messages`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncementDrawer: drawer,
    suiteAnnouncements,
  }) => {
    const name = suiteName(PUNCTUATION.label);
    let admin = '';
    await steps.critical('Precondition: the suite watches what the case creates; careconnect is the audience', async () => {
      await suiteAnnouncements.watch();
      admin = await adminPickerName(page, suiteAnnouncements, ADMIN_PICKER_NAME);
      expect(admin).not.toBe('');
    });
    await openModule(steps, ncCenter);

    await steps.critical('Select Create Announcement - the General step is displayed', async () => {
      await drawer.openCreate();
      await expect(drawer.el('name')).toBeVisible();
    });

    await steps.step(`Enter Name "${PUNCTUATION.label}" (suite name) - the name is accepted`, async () => {
      await drawer.fillGeneral({ name });
      await expect(drawer.el('name')).toHaveValue(name);
    });

    await steps.step(`Enter English message "${PUNCTUATION.english}" - accepted with no language error`, async () => {
      await drawer.fillGeneral({ english: PUNCTUATION.english });
      await expect(drawer.byPart('english-message-input')).toHaveValue(PUNCTUATION.english);
      expect(await drawer.text()).not.toContain(MESSAGES.englishOnly);
    });

    await steps.step(`Enter Arabic message "${PUNCTUATION.arabic}" - accepted with no language error`, async () => {
      await drawer.fillGeneral({ arabic: PUNCTUATION.arabic });
      await expect(drawer.byPart('arabic-message-input')).toHaveValue(PUNCTUATION.arabic);
      expect(await drawer.text()).not.toContain(MESSAGES.arabicOnly);
    });

    await steps.step('Set a valid Publish at, add an audience and click Save - "Saved successfully." is displayed', async () => {
      await drawer.setPublishAt(daysAhead(SCHEDULE.futureDays));
      const toast = await drawer.next();
      await expect(drawer.el('addAudience'), `the Audiences step (toast "${toast}")`).toBeVisible();
      const idx = await drawer.addAudience('Users');
      await drawer.assign(idx, [admin]);
      const saved = await drawer.save();
      expect(`${toast} | ${saved.toast}`, describeSave(saved)).not.toContain(MESSAGES.englishOnly);
      expect(`${toast} | ${saved.toast}`, describeSave(saved)).not.toContain(MESSAGES.arabicOnly);
      expect(saved.toast, describeSave(saved)).toBe(MESSAGES.saved);
      const stored = await readAnnouncement(page, (await findByName(page, name))?.id ?? '');
      expect({ english: stored?.englishMessage, arabic: stored?.arabicMessage }).toEqual({ english: PUNCTUATION.english, arabic: PUNCTUATION.arabic });
    });
  });
});
