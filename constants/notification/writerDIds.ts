/**
 * Writer D (Notification Center - Announcements folders 23-28) - the id the
 * lead's constants/notification/notificationIds.ts does not list. Read off the
 * 2026-11-11 probe dump reports/notification/probe/live-2026-11-11/
 * 22-tab-announcements.ids.txt.
 */
export const WRITER_D_IDS = {
  /** The routed screen host - carries the Announcements tab's "Next job MM:SS" text (no id of its own). */
  outlet: 'app-layout-outlet',
} as const;
