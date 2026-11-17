import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { AnnouncementsTab, NotificationCenterPage } from '../../../pages/notification/NotificationCenterPage';
import type { AnnouncementDrawer } from '../../../pages/notification/Drawers';
import type { AnnouncementRecord } from '../../../utils/notification/notificationApi';
import { AUDIENCE_TYPE, readAnnouncement } from '../../../utils/notification/notificationApi';
import { ADMIN_PICKER_NAME, LABELS, MESSAGES, NAME_MAX, ROLE_AUDIENCE_RIGHTS } from '../../../data/notification/createAnnouncement.data';
import { CASES, EDIT_DATA, LANGUAGE_EDITS, PUBLISH_AT_EDITS, SEED_TEXT } from '../../../data/notification/editAnnouncement.data';
import {
  accepted,
  adminPickerName,
  audienceCardCount,
  cardType,
  clearField,
  describeSave,
  describeSubmit,
  publishAtAfterTyping,
  generalValues,
  openEdit,
  pickerText,
  removeAudienceCard,
  submitAnnouncement,
  suiteName,
  type SubmitOutcome,
} from '../../../utils/notification/writerDHelpers';

async function openModule(steps: TestSteps, center: NotificationCenterPage): Promise<void> {
  await steps.critical('Navigate to the Notification Center Management module - the module home page is displayed', async () => {
    await center.open('announcements');
    await expect(center.tabButton('announcements'), 'the Announcements tab').toBeVisible();
  });
}

/** Step 2 of every case: the suite's Scheduled announcement, Edit, the General step pre-filled. */
async function openScheduledForEdit(steps: TestSteps, tab: AnnouncementsTab, drawer: AnnouncementDrawer, seed: AnnouncementRecord): Promise<void> {
  await steps.critical('Open the Scheduled announcement and select Edit - the General step opens pre-filled', async () => {
    expect(await tab.rowIdByName(seed.name), `"${seed.name}" listed`).toBe(seed.id);
    await openEdit(tab, drawer, seed.id);
    expect(await generalValues(drawer)).toMatchObject({ name: seed.name, english: seed.englishMessage, arabic: seed.arabicMessage });
  });
}

const seedSpec = { englishMessage: SEED_TEXT.english, arabicMessage: SEED_TEXT.arabic };

/**
 * User story 21013: Edit Announcement. Every case edits its OWN Scheduled suite
 * announcement (API-made, three days ahead, audience careconnect), deleted at
 * teardown. See the data file for the readings.
 */
test.describe('US 21013 - Edit Announcement', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.nameMaxLength.azureId}: should save a Scheduled announcement renamed to exactly 200 characters`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncements,
    ncAnnouncementDrawer: drawer,
    suiteAnnouncements,
  }) => {
    const seed = await suiteAnnouncements.create(seedSpec);
    const newName = suiteName('edited to max length', NAME_MAX);
    await openModule(steps, ncCenter);
    await openScheduledForEdit(steps, ncAnnouncements, drawer, seed);

    await steps.step('Replace the Name with exactly 200 characters - the full name is accepted', async () => {
      await drawer.fillGeneral({ name: newName });
      await expect(drawer.el('name')).toHaveValue(newName);
    });

    await steps.step('Click Save - "Saved successfully." is displayed and the announcement carries the new name', async () => {
      const o = await submitAnnouncement(page, drawer);
      expect(o.save?.toast ?? '', describeSubmit(o)).toBe(MESSAGES.saved);
      expect((await readAnnouncement(page, seed.id))?.name, 'the stored name').toBe(newName);
      expect(await ncAnnouncements.rowIdByName(newName), 'the list row under the new name').toBe(seed.id);
    });
  });

  for (const c of LANGUAGE_EDITS) {
    test(`TC-${c.azureId}: should show "${MESSAGES[c.messageKey]}" and keep the stored text when the ${c.field} message is edited to hold the other language`, async ({
      page,
      steps,
      ncCenter,
      ncAnnouncements,
      ncAnnouncementDrawer: drawer,
      suiteAnnouncements,
    }) => {
      const seed = await suiteAnnouncements.create(seedSpec);
      let outcome: SubmitOutcome | null = null;
      await openModule(steps, ncCenter);
      await openScheduledForEdit(steps, ncAnnouncements, drawer, seed);

      await steps.step(`Replace the ${c.field} message with "${c.bad}" - the field accepts the typed text pending validation`, async () => {
        await drawer.fillGeneral(c.badFill);
        await expect(drawer.byPart(c.input)).toHaveValue(c.bad);
      });

      await steps.step(`Click Save - the ${c.field} message field is flagged as invalid`, async () => {
        outcome = await submitAnnouncement(page, drawer);
        expect(outcome.messages, describeSubmit(outcome)).toContain(MESSAGES[c.messageKey]);
      });

      await steps.step(`Observe the validation message - "${MESSAGES[c.messageKey]}" is displayed and the edit is not saved`, async () => {
        expect(outcome?.messages ?? '', outcome ? describeSubmit(outcome) : 'no attempt').toContain(MESSAGES[c.messageKey]);
        expect(accepted(outcome?.save ?? null), outcome ? describeSubmit(outcome) : 'no attempt').toBe(false);
        expect((await readAnnouncement(page, seed.id))?.[c.stored], `the stored ${c.field} message`).toBe(seed[c.stored]);
      });
    });
  }

  for (const c of PUBLISH_AT_EDITS) {
    test(`TC-${c.azureId}: should show "${MESSAGES[c.messageKey]}" and keep the stored Publish at when it is edited to ${c.what}`, async ({
      page,
      steps,
      ncCenter,
      ncAnnouncements,
      ncAnnouncementDrawer: drawer,
      suiteAnnouncements,
    }) => {
      const seed = await suiteAnnouncements.create(seedSpec);
      const at = new Date(Date.now() + c.hours * 3_600_000);
      let outcome: SubmitOutcome | null = null;
      await openModule(steps, ncCenter);
      await openScheduledForEdit(steps, ncAnnouncements, drawer, seed);

      await steps.step(`Change Publish at to ${c.what} - the date/time is entered in the field`, async () => {
        await drawer.setPublishAt(at);
        const typed = await publishAtAfterTyping(drawer, at);
        expect(typed.held, typed.note).toBe(typed.wanted);
      });

      await steps.step('Click Save - the Publish at field is flagged as invalid', async () => {
        outcome = await submitAnnouncement(page, drawer);
        expect(outcome.messages, describeSubmit(outcome)).toContain(MESSAGES[c.messageKey]);
      });

      await steps.step(`Observe the validation message - "${MESSAGES[c.messageKey]}" is displayed and the edit is not saved`, async () => {
        expect(outcome?.messages ?? '', outcome ? describeSubmit(outcome) : 'no attempt').toContain(MESSAGES[c.messageKey]);
        expect(accepted(outcome?.save ?? null), outcome ? describeSubmit(outcome) : 'no attempt').toBe(false);
        expect(pickerText((await readAnnouncement(page, seed.id))?.publishAt ?? 0), 'the stored Publish at').toBe(pickerText(seed.publishAt));
      });
    });
  }

  test(`TC-${CASES.allBlank.azureId}: should name the missing mandatory fields and keep the record when every General field is emptied`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncements,
    ncAnnouncementDrawer: drawer,
    suiteAnnouncements,
  }) => {
    const seed = await suiteAnnouncements.create(seedSpec);
    let outcome: SubmitOutcome | null = null;
    await openModule(steps, ncCenter);
    await openScheduledForEdit(steps, ncAnnouncements, drawer, seed);

    await steps.step('Clear the Name, English message, Arabic message and Publish at fields - all four are empty', async () => {
      await clearField(page, drawer.el('name'));
      await clearField(page, drawer.byPart('english-message-input'));
      await clearField(page, drawer.byPart('arabic-message-input'));
      await drawer.setPublishAt('');
      expect(await generalValues(drawer)).toEqual({ name: '', english: '', arabic: '', publishAt: '' });
    });

    await steps.step('Click Save - the changes are not saved', async () => {
      outcome = await submitAnnouncement(page, drawer);
      expect(accepted(outcome.save), describeSubmit(outcome)).toBe(false);
      expect(await readAnnouncement(page, seed.id), 'the stored announcement').toMatchObject({ name: seed.name, englishMessage: seed.englishMessage, arabicMessage: seed.arabicMessage });
    });

    await steps.step(`Observe the validation message - "${MESSAGES.fillAll}" is displayed`, async () => {
      expect(outcome?.messages ?? '', outcome ? describeSubmit(outcome) : 'no attempt').toContain(MESSAGES.fillAll);
    });
  });

  test(`TC-${CASES.noAudienceLeft.azureId}: should not save an edit that leaves no audience`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncements,
    ncAnnouncementDrawer: drawer,
    suiteAnnouncements,
  }) => {
    const seed = await suiteAnnouncements.create(seedSpec);
    let admin = '';
    let outcome: SubmitOutcome | null = null;
    await openModule(steps, ncCenter);

    await steps.critical('Open the Scheduled announcement and select Edit - the Audiences step shows the existing card with its assigned user', async () => {
      admin = await adminPickerName(page, suiteAnnouncements, ADMIN_PICKER_NAME);
      expect(await ncAnnouncements.rowIdByName(seed.name)).toBe(seed.id);
      await openEdit(ncAnnouncements, drawer, seed.id);
      const toast = await drawer.next();
      await expect(drawer.el('addAudience'), `the Audiences step (toast "${toast}")`).toBeVisible();
      expect(await drawer.audienceCardText(0), 'the stored Users card').toContain(admin);
    });

    await steps.step('Remove the audience card entirely - no audience remains assigned', async () => {
      expect(await removeAudienceCard(page, drawer, 0), 'audience cards left after removing the only one').toBe(0);
    });

    await steps.step('Click Save - the changes are not saved', async () => {
      outcome = await submitAnnouncement(page, drawer);
      expect(accepted(outcome.save), describeSubmit(outcome)).toBe(false);
      expect((await readAnnouncement(page, seed.id))?.audiences.map((a) => a.referenceId), 'the stored audiences').toEqual(seed.audiences.map((a) => a.referenceId));
    });

    await steps.step(`Observe the validation message - "${MESSAGES.addAudience}" is displayed`, async () => {
      expect(outcome?.messages ?? '', outcome ? describeSubmit(outcome) : 'no attempt').toContain(MESSAGES.addAudience);
    });
  });

  test(`TC-${CASES.savedConfirmation.azureId}: should confirm "Saved successfully." and return to the list after a valid edit`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncements,
    ncAnnouncementDrawer: drawer,
    suiteAnnouncements,
  }) => {
    const seed = await suiteAnnouncements.create(seedSpec);
    const english = `${seed.englishMessage}${EDIT_DATA.englishSuffix}`;
    let admin = '';
    await openModule(steps, ncCenter);
    await openScheduledForEdit(steps, ncAnnouncements, drawer, seed);

    await steps.step('Make a minor valid change to the English message - the updated text is accepted', async () => {
      await drawer.fillGeneral({ english });
      await expect(drawer.byPart('english-message-input')).toHaveValue(english);
    });

    await steps.step('Proceed through the Audiences step without removing the existing audience - the audience remains assigned', async () => {
      admin = await adminPickerName(page, suiteAnnouncements, ADMIN_PICKER_NAME);
      const toast = await drawer.next();
      await expect(drawer.el('addAudience'), `the Audiences step (toast "${toast}")`).toBeVisible();
      expect({ cards: await audienceCardCount(page), text: await drawer.audienceCardText(0) }).toEqual({ cards: 1, text: expect.stringContaining(admin) });
    });

    await steps.step('Click Save - "Saved successfully." is displayed and the user returns to the announcement list', async () => {
      const saved = await drawer.save();
      expect(saved.toast, describeSave(saved)).toBe(MESSAGES.saved);
      await expect(drawer.el('close'), 'the drawer').toBeHidden();
      await expect(ncAnnouncements.row(seed.id), 'the list row').toBeVisible();
      expect((await readAnnouncement(page, seed.id))?.englishMessage, 'the stored English message').toBe(english);
    });
  });

  test(`TC-${CASES.usersToRoles.azureId}: should replace a Users audience with a Roles audience while editing`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncements,
    ncAnnouncementDrawer: drawer,
    suiteRole,
    suiteAnnouncements,
  }) => {
    let roleId = '';
    let roleName = '';
    await steps.critical('Precondition: an empty suite role to assign', async () => {
      const role = await suiteRole({ rights: ROLE_AUDIENCE_RIGHTS });
      roleId = role.id;
      roleName = role.name;
      expect(roleName).toContain('QA Automation Role');
    });
    const seed = await suiteAnnouncements.create(seedSpec);
    await openModule(steps, ncCenter);

    await steps.critical('Open the Scheduled announcement and select Edit - the Audiences step shows the existing Users card', async () => {
      expect(await ncAnnouncements.rowIdByName(seed.name)).toBe(seed.id);
      await openEdit(ncAnnouncements, drawer, seed.id);
      const toast = await drawer.next();
      await expect(drawer.el('addAudience'), `the Audiences step (toast "${toast}")`).toBeVisible();
      expect(await cardType(drawer, 0)).toBe(LABELS.users);
    });

    await steps.step('Remove the Users audience card - the audience list is now empty', async () => {
      expect(await removeAudienceCard(page, drawer, 0), 'audience cards left after removing the Users card').toBe(0);
    });

    await steps.step('Click Add audience and select Audience type "Roles" - a Roles card appears with its Assign picker', async () => {
      const idx = await drawer.addAudience('Roles');
      expect(await cardType(drawer, idx)).toBe(LABELS.roles);
      await expect(drawer.audienceCard(idx, 'assign-button')).toBeVisible();
    });

    await steps.step('Assign one role in the Selected list - the role appears in the Selected list', async () => {
      await drawer.assign(0, [roleName]);
      expect(await drawer.audienceCardText(0)).toContain(roleName);
    });

    await steps.step('Click Save - "Saved successfully." and the announcement now targets the role instead of the user', async () => {
      const saved = await drawer.save();
      expect(saved.toast, describeSave(saved)).toBe(MESSAGES.saved);
      const stored = await readAnnouncement(page, seed.id);
      expect(stored?.audiences.map((a) => ({ type: a.audienceTypeId, id: a.referenceId })), 'the stored audiences').toEqual([{ type: AUDIENCE_TYPE.roles, id: roleId }]);
    });
  });
});
