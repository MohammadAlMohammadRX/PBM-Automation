/**
 * Data of the Notification Center foundation spec (tests/notification/00-foundation).
 * Texts as the live screens showed them on 2026-11-11.
 */
export const FOUNDATION = {
  definitionEnglish: 'QA automation: network {{NetworkName}} is inactive',
  definitionArabic: 'اختبار آلي: الشبكة {{NetworkName}} غير نشطة',
  definitionActionLabel: 'Inactive - Network',
  activateLabel: 'Activate',
  scheduledLabel: 'Scheduled',
  addTriggerTitle: 'Add New Trigger',
  fillNameModuleAction: 'Please fill Name, Module and Action.',
  fillAnnouncement: 'Please fill Name, English message, Arabic message and Publish date/time.',
  discardName: 'QA Automation Trigger discard',
  unsavedTitle: 'Unsaved Changes',
  unsavedMessage: 'You have unsaved changes. If you leave now, your edits will be lost.',
  definitionModules: ['Approval Management', 'Payer Management', 'Network Management', 'Plan Management', 'Policy Management', 'Formulary Management'],
  notificationsTitle: 'Notifications',
  announcementsTitle: 'Announcements',
  /** A few read rights for the second user's suite role. */
  secondUserRights: ['Announcement.GetAnnouncements', 'Announcement.GetAnnouncement', 'NotificationDefinition.GetDefinitions'],
  guardedKeys: [
    'Notifi.AutoArchiveAnnouncementsAfterRead',
    'Notifi.AutoArchiveNotificationsAfterRead',
    'NotifiConfig.ExpiryReminderBeforeDays',
    'NotifiConfig.ExpiryReminderEveryDays',
    'SMTP.FromEmail',
    'SMTP.Port',
    'SMTP.Server',
    'SMTP.User',
    'Jobs.PayerLifecycleCron',
    'Jobs.NetworkLifecycleCron',
  ],
} as const;
