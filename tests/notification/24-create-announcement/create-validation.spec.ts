import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { NotificationCenterPage } from '../../../pages/notification/NotificationCenterPage';
import type { AnnouncementDrawer } from '../../../pages/notification/Drawers';
import {
  ADMIN_PICKER_NAME,
  CASES,
  LABELS,
  LANGUAGE_CHECKS,
  MESSAGES,
  NONE_ASSIGNED,
  SCHEDULE,
  VALID_TEXT,
} from '../../../data/notification/createAnnouncement.data';
import {
  accepted,
  adminPickerName,
  audienceCardCount,
  cardType,
  countRequests,
  daysAhead,
  describeSave,
  describeSubmit,
  findByName,
  generalValues,
  publishAtAfterTyping,
  submitAnnouncement,
  suiteName,
  trySecondUsersCard,
  type SubmitOutcome,
} from '../../../utils/notification/writerDHelpers';

async function openModule(steps: TestSteps, center: NotificationCenterPage): Promise<void> {
  await steps.critical('Navigate to the Notification Center Management module - the module home page is displayed', async () => {
    await center.open('announcements');
    await expect(center.tabButton('announcements'), 'the Announcements tab').toBeVisible();
  });
}

/** Opens Create, fills a valid General step (Publish at in the future) and moves to Audiences. */
async function reachAudiences(steps: TestSteps, drawer: AnnouncementDrawer, name: string): Promise<void> {
  await steps.critical('Select Create Announcement and complete the General step with valid data - the Audiences step is reached', async () => {
    await drawer.openCreate();
    await drawer.fillGeneral({ name, english: VALID_TEXT.english, arabic: VALID_TEXT.arabic, publishAt: daysAhead(SCHEDULE.futureDays) });
    const toast = await drawer.next();
    await expect(drawer.el('addAudience'), `the Audiences step (toast after Next: "${toast}")`).toBeVisible();
  });
}

/**
 * User story 21012: Create Announcement - what the drawer refuses. Every
 * attempt uses a FUTURE Publish at, so an attempt the app wrongly accepts
 * leaves only a Scheduled suite record (deleted at teardown).
 */
test.describe('US 21012 - Create Announcement (validation)', () => {
  test.describe.configure({ timeout: 5 * 60_000 });

  test(`TC-${CASES.emptyMandatory.azureId}: should name the missing mandatory fields and not save when every General field is empty`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncementDrawer: drawer,
  }) => {
    let toast = '';
    let sent = -1;
    await openModule(steps, ncCenter);

    await steps.critical('Select Create Announcement - the General step is displayed with empty fields', async () => {
      await drawer.openCreate();
      const v = await generalValues(drawer);
      expect({ name: v.name, english: v.english, arabic: v.arabic }).toEqual({ name: '', english: '', arabic: '' });
    });

    await steps.step('Leave Name, English message, Arabic message and Publish at empty - the fields remain empty', async () => {
      await drawer.setPublishAt('');
      expect(await generalValues(drawer)).toEqual({ name: '', english: '', arabic: '', publishAt: '' });
    });

    await steps.step('Try to proceed without entering any data - the form does not advance or save', async () => {
      const creates = countRequests(page, '/Announcement/CreateAnnouncement');
      toast = await drawer.next();
      sent = creates.count();
      creates.stop();
      await expect(drawer.el('name'), 'still on the General step').toBeVisible();
      await expect(drawer.el('addAudience'), 'the Audiences step').toBeHidden();
      expect(sent, 'CreateAnnouncement requests sent').toBe(0);
    });

    await steps.step(`Observe the validation message - "${MESSAGES.fillAll}" is displayed`, async () => {
      expect(toast, `drawer showed: ${await drawer.text()}`).toBe(MESSAGES.fillAll);
      expect(await drawer.text(), 'the field messages').toContain(MESSAGES.required);
    });
  });

  for (const c of LANGUAGE_CHECKS) {
    test(`TC-${c.azureId}: should show "${c.message}" and not save when the ${c.field} message holds letters of the other language`, async ({
      page,
      steps,
      ncCenter,
      ncAnnouncementDrawer: drawer,
      suiteAnnouncements,
    }) => {
      const name = suiteName(c.label);
      let admin = '';
      let outcome: SubmitOutcome | null = null;
      await steps.critical('Precondition: the suite watches anything the attempt might create', async () => {
        await suiteAnnouncements.watch();
        admin = await adminPickerName(page, suiteAnnouncements, ADMIN_PICKER_NAME);
        expect(admin).not.toBe('');
      });
      await openModule(steps, ncCenter);

      await steps.critical('Select Create Announcement - the General step is displayed', async () => {
        await drawer.openCreate();
        await expect(drawer.el('name')).toBeVisible();
      });

      await steps.step(`Enter Name and ${c.other} message with valid values - both accepted`, async () => {
        await drawer.fillGeneral({ name, ...c.validFill });
        expect(await generalValues(drawer)).toMatchObject({ name, ...c.validFill });
      });

      await steps.step(`Enter ${c.field} message "${c.bad}" - the field accepts the typed text pending validation`, async () => {
        await drawer.fillGeneral(c.badFill);
        await expect(drawer.byPart(c.input)).toHaveValue(c.bad);
      });

      await steps.step(`Set a valid Publish at and click Save - the ${c.field} message field is flagged as invalid`, async () => {
        await drawer.setPublishAt(daysAhead(SCHEDULE.futureDays));
        outcome = await submitAnnouncement(page, drawer, admin);
        expect(outcome.messages, describeSubmit(outcome)).toContain(c.message);
      });

      await steps.step(`Observe the validation message - "${c.message}" is displayed and the announcement is not saved`, async () => {
        expect(outcome?.messages ?? '', outcome ? describeSubmit(outcome) : 'no attempt').toContain(c.message);
        expect(accepted(outcome?.save ?? null), outcome ? describeSubmit(outcome) : 'no attempt').toBe(false);
        expect(await findByName(page, name), `"${name}" in GetAnnouncements`).toBeNull();
      });
    });
  }

  test(`TC-${CASES.overOneYear.azureId}: should refuse a Publish at more than one year ahead`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncementDrawer: drawer,
    suiteAnnouncements,
  }) => {
    const name = suiteName('over one year');
    const at = daysAhead(SCHEDULE.overOneYearDays);
    let admin = '';
    let outcome: SubmitOutcome | null = null;
    await steps.critical('Precondition: the suite watches anything the attempt might create', async () => {
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

    await steps.step('Set Publish at to one year and one day from now - the date/time is entered in the field', async () => {
      await drawer.setPublishAt(at);
      const typed = await publishAtAfterTyping(drawer, at);
      expect(typed.held, typed.note).toBe(typed.wanted);
    });

    await steps.step('Click Save - the Publish at field is flagged as invalid', async () => {
      outcome = await submitAnnouncement(page, drawer, admin);
      expect(outcome.messages, describeSubmit(outcome)).toContain(MESSAGES.overYear);
    });

    await steps.step(`Observe the validation message - "${MESSAGES.overYear}" is displayed and the announcement is not saved`, async () => {
      expect(outcome?.messages ?? '', outcome ? describeSubmit(outcome) : 'no attempt').toContain(MESSAGES.overYear);
      expect(accepted(outcome?.save ?? null), outcome ? describeSubmit(outcome) : 'no attempt').toBe(false);
      expect(await findByName(page, name), `"${name}" in GetAnnouncements`).toBeNull();
    });
  });

  test(`TC-${CASES.sameTypeTwice.azureId}: should not allow the same audience type twice on one announcement`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncementDrawer: drawer,
    suiteAnnouncements,
  }) => {
    const name = suiteName('same type twice');
    let admin = '';
    let offered: string[] = [];
    await steps.critical('Precondition: the suite watches anything the attempt might create', async () => {
      await suiteAnnouncements.watch();
      admin = await adminPickerName(page, suiteAnnouncements, ADMIN_PICKER_NAME);
      expect(admin).not.toBe('');
    });
    await openModule(steps, ncCenter);
    await reachAudiences(steps, drawer, name);

    await steps.step('Select Audience type "Users" and assign a user - the Users card is added with the user selected', async () => {
      const idx = await drawer.addAudience('Users');
      await drawer.assign(idx, [admin]);
      expect({ type: await cardType(drawer, idx), text: await drawer.audienceCardText(idx) }).toEqual({ type: LABELS.users, text: expect.stringContaining(admin) });
    });

    await steps.step('Click Add audience - a new, empty audience card is added', async () => {
      await drawer.el('addAudience').click();
      await expect(drawer.audienceCard(1, 'type-select')).toBeVisible();
      expect(await audienceCardCount(page)).toBe(2);
    });

    await steps.step('Open the Audience type dropdown on the new card - "Roles" is available', async () => {
      offered = await drawer.audienceTypeOptions(1);
      expect(offered, 'the new card\'s Audience type options').toContain(LABELS.roles);
    });

    await steps.step('Attempt to select "Users" a second time - the system prevents a second Users audience', async () => {
      const attempt = await trySecondUsersCard(page, drawer, 1, LABELS.users);
      expect(attempt.prevented, `options [${attempt.options.join(', ')}], card type after "${attempt.typeAfter}", ${describeSave(attempt.save)}; drawer: ${attempt.messages.slice(0, 300)}`).toBe(true);
      expect(await findByName(page, name), `"${name}" in GetAnnouncements`).toBeNull();
    });
  });

  test(`TC-${CASES.cardWithoutRecipients.azureId}: should not save when the added audience card has nobody assigned`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncementDrawer: drawer,
    suiteAnnouncements,
  }) => {
    const name = suiteName('card without recipients');
    let outcome: SubmitOutcome | null = null;
    await steps.critical('Precondition: the suite watches anything the attempt might create', async () => {
      await suiteAnnouncements.watch();
      expect(name).toContain('QA Automation Announcement');
    });
    await openModule(steps, ncCenter);
    await reachAudiences(steps, drawer, name);

    await steps.step('Select Audience type "Users" - an empty Users card is added with its Assign picker', async () => {
      const idx = await drawer.addAudience('Users');
      expect(await cardType(drawer, idx)).toBe(LABELS.users);
      await expect(drawer.audienceCard(idx, 'assign-button')).toBeVisible();
    });

    await steps.step('Leave the Selected list empty - nobody is assigned', async () => {
      expect(await drawer.audienceCardText(0)).toContain(NONE_ASSIGNED);
    });

    await steps.step('Click Save - the announcement is not saved', async () => {
      outcome = await submitAnnouncement(page, drawer);
      expect(accepted(outcome.save), describeSubmit(outcome)).toBe(false);
      await expect(drawer.el('close'), 'the drawer stays open').toBeVisible();
    });

    await steps.step(`Observe the validation message - "${MESSAGES.addAudience}" is displayed`, async () => {
      expect(outcome?.messages ?? '', outcome ? describeSubmit(outcome) : 'no attempt').toContain(MESSAGES.addAudience);
      expect(await findByName(page, name), `"${name}" in GetAnnouncements`).toBeNull();
    });
  });

  test(`TC-${CASES.noAudience.azureId}: should not save without any audience`, async ({
    page,
    steps,
    ncCenter,
    ncAnnouncementDrawer: drawer,
    suiteAnnouncements,
  }) => {
    const name = suiteName('no audience');
    let outcome: SubmitOutcome | null = null;
    await steps.critical('Precondition: the suite watches anything the attempt might create', async () => {
      await suiteAnnouncements.watch();
      expect(name).toContain('QA Automation Announcement');
    });
    await openModule(steps, ncCenter);
    await reachAudiences(steps, drawer, name);

    await steps.step('Leave the Audiences step without adding any audience card - no card is present', async () => {
      expect(await audienceCardCount(page)).toBe(0);
    });

    await steps.step('Click Save - the announcement is not saved', async () => {
      outcome = await submitAnnouncement(page, drawer);
      expect(accepted(outcome.save), describeSubmit(outcome)).toBe(false);
      await expect(drawer.el('close'), 'the drawer stays open').toBeVisible();
    });

    await steps.step(`Observe the validation message - "${MESSAGES.addAudience}" is displayed`, async () => {
      expect(outcome?.save?.toast ?? '', outcome ? describeSubmit(outcome) : 'no attempt').toBe(MESSAGES.addAudience);
      expect(await findByName(page, name), `"${name}" in GetAnnouncements`).toBeNull();
    });
  });
});
