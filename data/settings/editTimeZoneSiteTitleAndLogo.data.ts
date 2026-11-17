/**
 * US 20864 "Edit Time Zone, Site Title and Logo" (settings folder 01, 18 cases
 * 21062-21079) - Writer A, 2026-11-09.
 *
 * How it works in this build (reports/settings/Settings-Foundation-Notes.md):
 * System Settings > Settings > General - a read view (Time zone "(GMT+03:00)
 * Riyadh", Site title "PBM", Site logo = an image, or the text "Default logo"
 * when none is set) and Edit -> the "Edit Setting" drawer: a time-zone select
 * with a filter searchbox, the site-title input (NO maxlength, no client check -
 * the server answers 422 and the drawer shows it as a toast), the logo preview +
 * hidden file input (accept png/jpeg/webp) + "Replace logo" / "Remove". Save ->
 * PUT UpsertSystemSettings with ONLY the changed keys; a good save shows the
 * toast "Setting updated" and closes the drawer.
 *
 * SAFETY - every value here is GLOBAL. Every test takes `settingsGuard`, which
 * snapshots the time zone, title and logo before the test and restores + reads
 * them back after it. No case restores by hand; each change lives seconds.
 *
 * Test images are GENERATED at runtime (utils/settings/writerAHelpers.ts), never
 * committed: 1 MB = 1,048,576 bytes, "1.1 MB" = 1,153,434 bytes (lead decision 6).
 *
 * Literal readings / decisions:
 * - Lead decision 1 (new installation): 21063 / 21068 read the value the screen
 *   shows and compare it with the story's default - equal -> asserted (PASS),
 *   different -> BLOCKED (NEW_INSTALL_DEFAULTS + BLOCK_WHEN_NOT_DEFAULT below).
 * - Lead decision 3 (messages): 21064, 21067, 21070, 21072 and 21073 quote the
 *   English AND the Arabic message and say it "is displayed / shown", so each
 *   also repeats the message-producing action with the UI in Arabic (same
 *   step) and switches back to English in that last step.
 * - "The site title appears with the logo on sign-in screens" (AC / 21068 /
 *   21078): the sign-in screen shows the title only as the browser-tab title and
 *   as the logo's alt text (probe 2026-11-09: title "PBM", img alt "PBM"); both
 *   are asserted.
 * - "Instantly, without a page reload" (21062 / 21078): a signed-out window is
 *   put on the sign-in screen BEFORE the save and is never reloaded; a marker
 *   set on its window proves no reload happened. The new title / logo must
 *   appear there within INSTANT_APPLY_WAIT_MS.
 * - "The logo is replaced": a saved logo is stored as a server URL, so the new
 *   logo is asserted as "a non-empty src different from the one shown before
 *   the save" (nav menu, sign-in screen).
 * - 21062 "time zone updated on every screen": the read view shows "(GMT+04:00)
 *   Dubai" and GetBranding (what every screen and the sign-in page load)
 *   answers "Asia/Dubai".
 * - 21064 (lead decision 10): the title is emptied the way a user would
 *   (select all + Delete); "the save is blocked" = no PUT, or a refused PUT,
 *   and the stored title is unchanged.
 * - 21070 / 21072 "both at pick time and if Save is attempted": the drawer's
 *   Save after the refused pick must not send a Site.Logo; then (lead decision
 *   5) the same bad file goes straight to the server with `upsertSettings` and
 *   must be refused with the case's message.
 * - 21074 "no logo state": the preview no longer shows the custom logo and the
 *   upload button no longer reads "Replace logo".
 * - 21076 precondition "no logo is set": Site.Logo = '' through
 *   `settingsGuard.set` (the API must accept it, else BLOCKED); "an upload
 *   prompt" = the upload button is offered and does not read "Replace logo".
 * - 21077 step 4 "bypass the client check ... and select Save": per lead
 *   decision 5 the bypass is `upsertSettings` with a GIF (type) and with a
 *   1.1 MB PNG (size); each must be refused with its message. The drawer's
 *   valid pick is then discarded (Cancel).
 * - 21079 "a valid new value": "(GMT+04:00) Abu Dhabi" (the environment runs
 *   on Riyadh). The list offers NO "(GMT+04:00) Dubai" - its +04:00 options are
 *   Abu Dhabi, Baku and Muscat (full run 2026-11-09). 21062 keeps "Dubai"
 *   because its own test data names it: that case reports the missing option.
 */

/** The story (titles + describe). */
export const STORY = { id: '20864', title: 'Edit Time Zone, Site Title and Logo' } as const;

/** A title of exactly `length` characters, recognisably the suite's. */
const suiteTitle = (length: number): string => 'QA Automation Site Title '.padEnd(length, 'X');

export const CASES = {
  updateAllInOneSave: {
    azureId: '21062',
    timeZone: '(GMT+04:00) Dubai',
    timeZoneFilter: 'Dubai',
    timeZoneIana: 'Asia/Dubai',
    siteTitle: 'Acme Health',
    logo: { name: 'logo.png', bytes: 400 * 1024 },
  },
  timeZoneDefault: { azureId: '21063' },
  emptyTitle: { azureId: '21064' },
  timeZoneSearch: { azureId: '21065', term: 'Cairo', option: '(GMT+02:00) Cairo' },
  titleAtMaximum: { azureId: '21066', title: suiteTitle(100) },
  titleOverMaximum: { azureId: '21067', title: suiteTitle(101) },
  titleDefault: { azureId: '21068' },
  validJpg: { azureId: '21069', logo: { name: 'brand.jpg', bytes: 300 * 1024 } },
  unsupportedGif: { azureId: '21070', logo: { name: 'icon.gif', bytes: 200 * 1024 } },
  exactlyOneMb: { azureId: '21071', logo: { name: 'logo-1mb.png', bytes: 1_048_576 } },
  overOneMb: { azureId: '21072', logo: { name: 'logo-1.1mb.png', bytes: 1_153_434 } },
  unreadable: { azureId: '21073', logo: { name: 'corrupted.png', bytes: 20 * 1024 } },
  removeLogo: { azureId: '21074' },
  cancelPreview: { azureId: '21075', logo: { name: 'new-logo.png', bytes: 20 * 1024 } },
  replaceLabel: { azureId: '21076', noLogo: '', logo: { name: 'first-logo.png', bytes: 20 * 1024 } },
  serverRevalidation: {
    azureId: '21077',
    bmp: { name: 'logo.bmp', bytes: 2 * 1_048_576 },
    valid: { name: 'valid-logo.png', bytes: 20 * 1024 },
    badType: { name: 'bypass.gif', bytes: 20 * 1024 },
    tooBig: { name: 'bypass-1.1mb.png', bytes: 1_153_434 },
  },
  instantApply: { azureId: '21078', siteTitle: 'PBM QA Instant Apply', logo: { name: 'instant-logo.png', bytes: 20 * 1024 } },
  confirmation: { azureId: '21079', timeZone: '(GMT+04:00) Abu Dhabi', timeZoneFilter: 'Abu Dhabi' },
} as const;

/** The AC's messages, English / Arabic, exactly as the cases quote them. */
export const MESSAGES = {
  titleInvalid: { en: 'Site title is required and must not exceed 100 characters.', ar: 'عنوان الموقع مطلوب ويجب ألا يتجاوز 100 حرف.' },
  logoType: { en: 'The logo must be a PNG, JPG or WebP image.', ar: 'يجب أن يكون الشعار صورة بصيغة PNG أو JPG أو WebP.' },
  logoSize: { en: 'The logo file must not exceed 1 MB.', ar: 'يجب ألا يتجاوز حجم ملف الشعار 1 ميجابايت.' },
  logoUnreadable: { en: 'The logo file could not be read. Try again or pick another file.', ar: 'تعذّر قراءة ملف الشعار. أعد المحاولة أو اختر ملفًا آخر.' },
} as const;

/** Texts the screen shows. */
export const TEXTS = {
  settingUpdated: 'Setting updated',
  replaceLogo: 'Replace logo',
  defaultLogo: 'Default logo',
  /** The General read view's section titles step 2 of 21062 names. */
  generalSections: ['Time Zone & Theme', 'Currency', 'Scheduled Jobs'],
  /** Read-view labels. */
  label: { timeZone: 'Time zone', siteTitle: 'Site title', siteLogo: 'Site logo' },
  /** How every time zone is shown: "(GMT+03:00) Riyadh". */
  timeZoneFormat: /^\(GMT[+-]\d{2}:\d{2}\) /,
} as const;

/** A picked (not yet saved) logo previews as a data URL of its own type. */
export const PREVIEW = { png: /^data:image\/png/, jpeg: /^data:image\/jpeg/, picked: /^data:/ } as const;

/** The setting keys this folder changes (all guarded by settingsGuard). */
export const KEYS = { timeZone: 'Site.TimeZone', title: 'Site.Title', logo: 'Site.Logo' } as const;

/**
 * Lead decision 1 - the story's "new installation" defaults (21063, 21068) and
 * the rule: a shown value that differs from the default makes the case BLOCKED
 * (this environment is not a new installation). Set BLOCK_WHEN_NOT_DEFAULT to
 * false to report the difference as a FAIL instead.
 */
export const NEW_INSTALL_DEFAULTS = { timeZone: '(GMT+03:00) Riyadh', siteTitle: 'PBM' } as const;
export const BLOCK_WHEN_NOT_DEFAULT = true;

/** BLOCKED reason of a default case whose shown value is not the default. */
export const newInstallBlockedReason = (what: string, shown: string, expected: string): string =>
  `needs a new installation: this environment's ${what} is "${shown}", the new-installation default is "${expected}"`;

/** BLOCKED reason of 21076 when the API refuses to clear the logo. */
export const NO_LOGO_BLOCKED = 'the precondition "no logo is set" could not be produced: UpsertSystemSettings refused Site.Logo = \'\'';

/** How long a screen may take to show a saved change without a reload ("immediately"). */
export const INSTANT_APPLY_WAIT_MS = 10_000;
