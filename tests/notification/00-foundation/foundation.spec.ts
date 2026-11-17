import { test, expect } from '../../../fixtures';
import { NOTIFICATION_ACTION, NOTIFICATION_MODULE, SUITE_ANNOUNCEMENT_PREFIX, SUITE_DEFINITION_PREFIX, SUITE_TRIGGER_PREFIX, listAnnouncements, listTriggers, myAnnouncements, myNotifications, readAnnouncement, readTrigger, listDefinitions } from '../../../utils/notification/notificationApi';
import { readSecondUser, snapshotOf, SECOND_USER_HOME_ROLE } from '../../../utils/notification/secondUserAccount';
import { currentPermissions } from '../../../utils/UserProvisioning';
import { FOUNDATION } from '../../../data/notification/foundation.data';

/**
 * Notification Center foundation proof (2026-11-11) - stays in the suite as
 * the module's smoke check of the shared layer: suite records are created and
 * cleaned, every tab and drawer opens, the second user takes a suite role and
 * gets its home role back, and the global settings guard round-trips.
 */
test.describe('Notification Center - foundation', () => {
  test('FND-001: should create a suite trigger, app notification and announcement through the API and list each on its own tab', async ({ steps, suiteTriggers, suiteDefinitions, suiteAnnouncements, ncTriggers, ncDefinitions, ncAnnouncements, page }) => {
    const made = { trigger: { id: '', name: '' }, definition: { id: '', name: '' }, announcement: { id: '', name: '' } };

    await steps.critical('Create one suite record of each kind through the API', async () => {
      const trigger = await suiteTriggers.create();
      const definition = await suiteDefinitions.create({
        moduleId: NOTIFICATION_MODULE.networkManagement,
        actionId: NOTIFICATION_ACTION.networkInactive,
        englishMessageTemplate: FOUNDATION.definitionEnglish,
        arabicMessageTemplate: FOUNDATION.definitionArabic,
      });
      const announcement = await suiteAnnouncements.create();
      made.trigger = { id: trigger.id, name: trigger.name };
      made.definition = definition;
      made.announcement = { id: announcement.id, name: announcement.name };
      expect(trigger.isActive, 'a suite trigger is created inactive').toBe(false);
      expect(announcement.status, 'a default suite announcement is Scheduled').toBe('Scheduled');
    });

    await steps.step('The suite trigger is listed on Triggers (Email&SMS) as a custom, inactive row', async () => {
      await ncTriggers.open();
      expect(await ncTriggers.rowIdByName(made.trigger.name)).toBe(made.trigger.id);
      await expect(ncTriggers.predefinedNone(made.trigger.id)).toBeVisible();
      await expect(ncTriggers.rowAction(made.trigger.id, 'toggle-active')).toHaveText(FOUNDATION.activateLabel);
      expect((await readTrigger(page, made.trigger.id))?.isPredefined).toBe(false);
    });

    await steps.step('The suite app notification is listed on App Notification', async () => {
      await ncDefinitions.open();
      expect(await ncDefinitions.rowIdByName(made.definition.name)).toBe(made.definition.id);
      await expect(ncDefinitions.cell(made.definition.id, 'action')).toHaveText(FOUNDATION.definitionActionLabel);
      expect((await listDefinitions(page)).some((d) => d.id === made.definition.id)).toBe(true);
    });

    await steps.step('The suite announcement is listed on Announcements as Scheduled with View / Edit / Delete', async () => {
      await ncAnnouncements.open();
      expect(await ncAnnouncements.rowIdByName(made.announcement.name)).toBe(made.announcement.id);
      await expect(ncAnnouncements.cell(made.announcement.id, 'status')).toHaveText(FOUNDATION.scheduledLabel);
      expect(await ncAnnouncements.rowActions(made.announcement.id)).toEqual(['view', 'edit', 'delete']);
      expect((await readAnnouncement(page, made.announcement.id))?.status).toBe('Scheduled');
    });
  });

  test('FND-002: should open every tab and drawer and close them without leaving anything behind', async ({ steps, ncTriggers, ncDefinitions, ncAnnouncements, ncTriggerDrawer, ncDefinitionDrawer, ncAnnouncementDrawer, notificationBell, announcementBell }) => {
    await steps.step('Triggers: the Add drawer opens on General; Next with nothing asks for Name, Module and Action', async () => {
      await ncTriggers.open();
      await ncTriggerDrawer.openAdd();
      expect(await ncTriggerDrawer.title()).toBe(FOUNDATION.addTriggerTitle);
      expect(await ncTriggerDrawer.next()).toBe(FOUNDATION.fillNameModuleAction);
      expect(await ncTriggerDrawer.close()).toBeNull();
      await expect(ncTriggerDrawer.el('close')).toBeHidden();
    });

    await steps.step('Triggers: a typed name makes X ask "Unsaved Changes"; Discard closes the drawer', async () => {
      await ncTriggerDrawer.openAdd();
      await ncTriggerDrawer.fillGeneral({ name: FOUNDATION.discardName });
      expect(await ncTriggerDrawer.close('discard')).toEqual({ title: FOUNDATION.unsavedTitle, message: FOUNDATION.unsavedMessage });
      await expect(ncTriggerDrawer.el('close')).toBeHidden();
    });

    await steps.step('App Notification: the Create drawer offers the six modules', async () => {
      await ncDefinitions.open();
      await ncDefinitionDrawer.openCreate();
      expect(await ncDefinitionDrawer.options('module-select')).toEqual(FOUNDATION.definitionModules);
      expect(await ncDefinitionDrawer.close()).toBeNull();
      await expect(ncDefinitionDrawer.el('close')).toBeHidden();
    });

    await steps.step('Announcements: the Create drawer pre-fills Publish at with now and asks for every field on Next', async () => {
      await ncAnnouncements.open();
      await ncAnnouncementDrawer.openCreate();
      await expect(ncAnnouncementDrawer.publishInput()).toHaveValue(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
      expect(await ncAnnouncementDrawer.next()).toBe(FOUNDATION.fillAnnouncement);
      expect(await ncAnnouncementDrawer.close()).toBeNull();
      await expect(ncAnnouncementDrawer.el('close')).toBeHidden();
    });

    await steps.step('Both header bells open on the All tab and close', async () => {
      await notificationBell.open();
      await expect(notificationBell.control('title')).toHaveText(FOUNDATION.notificationsTitle);
      await notificationBell.close();
      await announcementBell.open();
      await expect(announcementBell.control('title')).toHaveText(FOUNDATION.announcementsTitle);
      await announcementBell.close();
    });
  });

  test('FND-003: should give the second user only a suite role, sign it in again, and give its home role back read back', async ({ steps, secondUser, page }) => {
    await steps.step('The second user starts signed in with its home role and its bells read its own inbox', async () => {
      expect(secondUser.original.roleNames).toContain(SECOND_USER_HOME_ROLE);
      await secondUser.announcementBell.open();
      const shown = await secondUser.announcementBell.readRows();
      const inbox = await myAnnouncements(secondUser.page, { rows: 50 });
      expect(shown.length).toBeGreaterThan(0);
      expect(shown.every((r) => inbox.items.some((i) => i.id === r.id)), 'bell row ids are the inbox item ids').toBe(true);
      await secondUser.announcementBell.close();
      await secondUser.notificationBell.open();
      const rows = await secondUser.notificationBell.readRows();
      const notes = await myNotifications(secondUser.page, { rows: 50 });
      expect(rows.every((r) => notes.items.some((i) => i.id === r.id)), 'notification bell row ids are the inbox item ids').toBe(true);
      await secondUser.notificationBell.close();
    });

    await steps.critical('withRights gives it ONLY a suite role with exactly the asked rights', async () => {
      const role = await secondUser.withRights(FOUNDATION.secondUserRights);
      const now = snapshotOf(await readSecondUser(page));
      expect(now.roleNames).toEqual([role.name]);
      expect([...(await currentPermissions(secondUser.page))].sort()).toEqual([...FOUNDATION.secondUserRights].sort());
    });

    await steps.step('The restricted session still opens the announcement bell', async () => {
      await secondUser.announcementBell.open();
      await expect(secondUser.announcementBell.control('title')).toBeVisible();
      await secondUser.announcementBell.close();
    });

    await steps.step('restoreNow gives back the original roles and language, read back', async () => {
      await secondUser.restoreNow();
      const back = snapshotOf(await readSecondUser(page));
      expect(back.roleNames.sort()).toEqual([...secondUser.original.roleNames].sort());
      expect(back.roleNames).toContain(SECOND_USER_HOME_ROLE);
      expect(back.preferredLanguageId).toBe(secondUser.original.preferredLanguageId);
    });
  });

  test('FND-004: should snapshot the notification settings and round-trip them unchanged; the Edit drawer shows the same values', async ({ steps, notificationSettingsGuard, settingsHub, ncSettingsPanel }) => {
    await steps.step('The guard holds the notification, SMTP and job keys - and no password', async () => {
      const keys = Object.keys(notificationSettingsGuard.original);
      expect(keys).toEqual(expect.arrayContaining([...FOUNDATION.guardedKeys]));
      expect(keys.filter((k) => /pass|secret/i.test(k))).toEqual([]);
    });

    await steps.step('A restore with nothing changed is a no-op and the read-back equals the snapshot', async () => {
      await notificationSettingsGuard.restoreNow();
      expect(await notificationSettingsGuard.current()).toEqual(notificationSettingsGuard.original);
    });

    await steps.step('The General Edit drawer shows the snapshot values (opened and cancelled, nothing saved)', async () => {
      await settingsHub.openEdit();
      await expect(ncSettingsPanel.field('autoArchiveAnnouncements')).toHaveValue(notificationSettingsGuard.original['Notifi.AutoArchiveAnnouncementsAfterRead']);
      await expect(ncSettingsPanel.field('autoArchiveNotifications')).toHaveValue(notificationSettingsGuard.original['Notifi.AutoArchiveNotificationsAfterRead']);
      await expect(ncSettingsPanel.field('reminderBeforeDays')).toHaveValue(notificationSettingsGuard.original['NotifiConfig.ExpiryReminderBeforeDays']);
      await expect(ncSettingsPanel.field('smtpServer')).toHaveValue(notificationSettingsGuard.original['SMTP.Server']);
      await expect(ncSettingsPanel.field('smtpPort')).toHaveValue(notificationSettingsGuard.original['SMTP.Port']);
      await ncSettingsPanel.cancel();
      expect(await notificationSettingsGuard.current()).toEqual(notificationSettingsGuard.original);
    });
  });

  test('FND-005: should leave no suite trigger, app notification or live suite announcement behind after the tests above', async ({ steps, page }) => {
    steps.dependsOn('FND-001');
    await steps.step('No suite trigger and no suite app notification remain', async () => {
      expect((await listTriggers(page, { searchText: SUITE_TRIGGER_PREFIX })).items.map((t) => t.name)).toEqual([]);
      expect((await listDefinitions(page)).filter((d) => d.name.startsWith(SUITE_DEFINITION_PREFIX)).map((d) => d.name)).toEqual([]);
    });
    await steps.step('No suite announcement is Scheduled or Published (cancelled ones may stay listed)', async () => {
      const live = (await listAnnouncements(page, { searchText: SUITE_ANNOUNCEMENT_PREFIX })).items.filter((a) => a.status !== 'Cancelled');
      expect(live.map((a) => `${a.name} (${a.status})`)).toEqual([]);
    });
  });
});
