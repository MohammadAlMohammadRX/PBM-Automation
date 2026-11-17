/**
 * US 21014 "Delete Announcement" (notification folder 26-delete-announcement,
 * 4 cases; 21762 / 21765-21769 wait for the BA).
 *
 * How it works in this build: a Scheduled row offers View / Edit / Delete
 * (`nc-announcements-table-row-<id>-delete`); DELETE /api/Announcement/
 * DeleteAnnouncement/<id>. The confirmation is expected in the shared
 * `pbm-dialog` (Yes = `pbm-dialog-action-confirm`, No = `-cancel`, X =
 * `pbm-dialog-close-button`) - NOT probed for announcements: the probe saw Delete
 * TRIGGER send DELETE at once with no dialog, so the cases read what appears and
 * count the DELETE requests sent before any answer.
 *
 * SAFETY: every deleted announcement is the case's OWN Scheduled suite
 * announcement (API-made, audience careconnect). 21770 schedules it three
 * minutes ahead, deletes it at once and waits past the publish time plus one
 * publishing run.
 *
 * Literal readings (the test case wins):
 * - "a confirmation dialog with Confirm and Cancel options" (21763) = the dialog
 *   shows its confirm and cancel actions (ids `-confirm` / `-cancel`; the labels
 *   seen are reported - the shared dialog says "Yes" / "No").
 * - "removed from the list" = the row is gone from the list AND GetAnnouncement /
 *   GetAnnouncements no longer return it.
 * - 21764 "Select Cancel (or dismiss the dialog)": No is pressed; then Delete is
 *   opened again and the dialog's X is pressed (the "dismiss" variant); after a
 *   reload the record is still Scheduled with unchanged content.
 * - 21770 "no recipients receive the announcement" = careconnect's inbox
 *   (GetMyAnnouncements search) holds no copy after the original Publish at + one run.
 */
export const CASES = {
  deleteScheduled: { azureId: '21761' },
  confirmFirst: { azureId: '21763' },
  cancelKeeps: { azureId: '21764' },
  deleteBeforePublish: { azureId: '21770' },
} as const;

/** The API path the Delete sends. */
export const DELETE_API = '/api/Announcement/DeleteAnnouncement';

export const SCHEDULED = 'Scheduled';

/** 21770: minutes ahead the announcement is scheduled, and the wait after its Publish at (one publishing run + margin). */
export const NEAR_PUBLISH = {
  minutesAhead: 3,
  waitAfterPublishSeconds: 100,
} as const;
