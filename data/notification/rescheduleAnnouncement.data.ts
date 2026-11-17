/**
 * US 21016 "Reschedule Announcement" (notification folder 27-reschedule-
 * announcement, 7 cases; 21783 / 21787 / 21788 / 21791-21793 wait for the BA).
 *
 * How it works in this build (probe b74): a Cancelled row offers View / Edit /
 * Reschedule; Reschedule opens the drawer "Reschedule" holding only Publish at
 * (default now, "yyyy-MM-dd HH:mm" Riyadh) with the hint "Pick a new date/time
 * (now up to one year ahead). Now re-sends it immediately; a future time
 * re-sends it then." and Cancel / Reschedule. PUT RescheduleAnnouncement
 * { id, publishAt }. A Published row offers View / Cancel; a Scheduled row View /
 * Edit / Delete.
 *
 * SAFETY: only suite announcements. A Cancelled one is produced by publishing a
 * suite announcement now to careconnect and cancelling it (it then stays listed
 * as Cancelled forever). To keep that pile small, the READ-ONLY cases (21785,
 * 21789, 21794 - nothing is saved) REUSE the newest Cancelled suite announcement
 * already listed (REUSE_CANCELLED_FOR_READ_ONLY - set false to always make a
 * fresh one); 21786 and 21790 change the record and always make their own.
 * 21786 leaves it Scheduled a year ahead (deleted at teardown); 21790 leaves it
 * Published (cancelled at teardown).
 *
 * Literal readings (the test case wins):
 * - "shows only the Publish at field" = the drawer holds exactly one editable
 *   field, the Publish at input.
 * - "pre-filled with the current date and time" = within DEFAULT_NOW_TOLERANCE_SECONDS
 *   of now (the picker shows minutes).
 * - 21786 "the drawer closes without validation errors" + the stored record is
 *   Scheduled at the typed minute (GetAnnouncement).
 * - 21790 "appears immediately as unread with its original wording" = careconnect's
 *   inbox (GetMyAnnouncements) holds exactly one copy, unread, with the stored
 *   English and Arabic texts, and the announcement is Published again.
 * - 21794 "close control" = the drawer's X (an Unsaved Changes dialog, if any, is
 *   answered Discard); nothing is sent and the stored status / Publish at stay.
 */
export const CASES = {
  notWhilePublished: { azureId: '21782' },
  notWhileScheduled: { azureId: '21784' },
  defaultsToNow: { azureId: '21785' },
  exactlyOneYear: { azureId: '21786' },
  requiredWhenBlank: { azureId: '21789' },
  resendNow: { azureId: '21790' },
  closeWithoutSaving: { azureId: '21794' },
} as const;

/** Read-only cases reuse a listed Cancelled suite announcement (lead may set false). */
export const REUSE_CANCELLED_FOR_READ_ONLY = true;

export const REQUIRED = 'This field is required.';

export const STATUS = {
  scheduled: 'Scheduled',
  published: 'Published',
  cancelled: 'Cancelled',
} as const;

export const RESCHEDULE_ACTION = 'reschedule';

/** 21786: days ahead (same time). 21794: the changed value (days ahead) typed before closing. */
export const DAYS = {
  oneYear: 365,
  changedBeforeClose: 2,
} as const;

export const DEFAULT_NOW_TOLERANCE_SECONDS = 90;
