/**
 * Test data for US 14323 "Notify administrators when a network becomes Expired
 * or Inactive" (network folder 44). Manual until 2026-11-08.
 *
 * HOW IT WORKS HERE (Foundation-Notes.md, "Notifications", verified 2026-11-08):
 * - A notification exists only when a NOTIFICATION DEFINITION (System Settings >
 *   Notification Center > Definitions - the bilingual "template") is active for
 *   the module action "Expired - Network" / "Inactive - Network". None existed
 *   on 2026-11-08, so every case creates its own suite definition (prefix
 *   "QA Automation Notification", audience: the administrator) and deletes it
 *   afterwards. The sheets' "Notification Centre > Templates" = Definitions.
 * - Delivery = one in-app notification per audience member (GetMyNotifications:
 *   `type` = the definition name, `englishMessage`, `arabicMessage`,
 *   `relatedEntityId` = the network); the bell shows the CURRENT UI language's
 *   text. An approved manual inactivation fired an "Inactive - Network"
 *   definition within ~1 s (probe p3b). E-mail attempts are logged "Failed" -
 *   e-mail delivery is out of reach and is not asserted.
 * - INACTIVE: a FRESH suite network PROVISIONED for the case (approved, default
 *   suite pharmacy; one move of the network job makes a pool of them Active,
 *   restored at once - "provision, don't find": the register's long-lived
 *   anchors such as "Automation Network Facility Anchor ..." are never touched)
 *   is inactivated (stage + submit + approve - "manually set the status to
 *   Inactive and save"; the approval is part of saving a status change here).
 * - EXPIRED is applied only by the daily network job. Cases whose template is
 *   the PRECONDITION of the seed run (18300, 18301, 18307, 18308, 18309) claim
 *   a seed of the network job seeder (`ExpireAfterExpiry`, `ActiveExpiryTomorrow`
 *   - npm run seed:network-jobs) and read the notification its expiry produced.
 *   They are BLOCKED when the seed run produced no Expired notification for any
 *   seed (no "Expired - Network" definition was active at its F2 firing).
 *   Cases that must CONFIGURE the template before the transition (18303 edited
 *   text, 18305 decision table, 18310 no template) take a fresh network of
 *   their own Future -> Active -> Expired with two short moves of the network
 *   job (jobClock, administrator; restored after each firing).
 *
 * LITERAL READINGS / DISAGREEMENTS (the test case is asserted):
 * - "priority 'High'" (18299, 18300, 18301, 18302, 18305): notifications carry
 *   no priority in this build (no field on GetMyNotifications, no selector in
 *   the definition drawer) - asserted, an expected FINDING.
 * - "only users with the Administrator role receive" (18309): the audience is
 *   whatever the definition names; asserted on the seed run's notification -
 *   the administrator has it, the non-administrator (Payer Admin) does not.
 * - "Pending Review" (18306): no such status; the non-Expired/Inactive
 *   transition is an Active network's edit sent for approval (Pending Approval)
 *   and then approved (Active -> Active).
 * - "Suspended -> Expired" (18305 D): no Suspended status; the Expired
 *   transition of case A is reused, with a definition holding ONLY English
 *   (Arabic blank). The drawer requires Arabic - a refusal naming the Arabic
 *   template is the "configuration warning" outcome the case allows.
 * - "rapid toggling Active / Expired / Inactive" (18312): Expired is not a
 *   manual status (job only), so the rapid sequence is the manual one -
 *   Inactive -> Active -> Inactive -> Active; exactly one Inactive notification
 *   per Inactive transition, in order.
 * - "expiry = today-1" (18308): a past expiry is refused at create / edit; the
 *   seed whose expiry passed before the run (ExpireAfterExpiry index 1) stands
 *   for it, "today" is ExpireAfterExpiry index 0, "today+1" is ActiveExpiryTomorrow.
 * - "English subject max 255" (18311): definitions have no subject; the
 *   required English text is the English message template.
 * - "Template saved / updated successfully" toasts: the definition API's own
 *   message ("Notification definition created successfully.").
 */

export const CASES = {
  inactiveHighPriority: { azureId: '18299' },
  expiredHighPriority: { azureId: '18300' },
  englishLocale: { azureId: '18301' },
  arabicLocale: { azureId: '18302' },
  editTemplate: { azureId: '18303' },
  authorTemplate: { azureId: '18304' },
  decisionTable: { azureId: '18305' },
  noNotificationOtherTransition: { azureId: '18306' },
  noDuplicate: { azureId: '18307' },
  expiryBoundary: { azureId: '18308' },
  adminOnly: { azureId: '18309' },
  noTemplate: { azureId: '18310' },
  templateValidation: { azureId: '18311' },
  rapidToggles: { azureId: '18312' },
} as const;

/** The bilingual templates the suite definitions carry ({{NetworkName}} is the action's required variable). */
export const TEMPLATE = {
  expired: {
    english: 'QA N2: network {{NetworkName}} has expired.',
    arabic: 'QA N2: انتهت صلاحية الشبكة {{NetworkName}}.',
  },
  inactive: {
    english: 'QA N2: network {{NetworkName}} is now inactive.',
    arabic: 'QA N2: الشبكة {{NetworkName}} غير نشطة الآن.',
  },
  /** 18303's maintained text. */
  updated: {
    english: 'ALERT: Network has expired and requires action. {{NetworkName}}',
    arabic: 'تنبيه: انتهت صلاحية الشبكة وتتطلب إجراء. {{NetworkName}}',
  },
  /** 18304's new template (subject in the sheet = the opening words). */
  authored: {
    english: 'Network Expired: {{NetworkName}} reached its expiry date.',
    arabic: 'انتهت صلاحية الشبكة: {{NetworkName}}',
  },
} as const;

/** The priority the sheets expect on every Expired / Inactive notification. */
export const EXPECTED_PRIORITY = /high/i;

/** 18311 - the English text limits (sheet: max 255). */
export const ENGLISH_LIMIT = 255;
export const repeatTo = (n: number): string => `{{NetworkName}} ${'E'.repeat(Math.max(0, n - 16))}`.slice(0, n);

/** The definition API's confirmations. */
export const DEFINITION_SAVED = /created successfully|saved successfully/i;
export const DEFINITION_UPDATED = /updated successfully|saved successfully/i;

/** The Arabic-template refusal 18305 D accepts as the configuration warning. */
export const ARABIC_REQUIRED = /arabic|required/i;

/** Rapid toggles (18312): Inactive -> Active, twice. */
export const RAPID_CYCLES = 2;

/** How long a notification may take to arrive (the probe saw ~1-5 s). */
export const NOTIFICATION_WAIT_MS = 90_000;

/** Window in which "no notification" is observed after a transition. */
export const QUIET_WINDOW_MS = 45_000;

/** Budgets per case. */
export const CASE_TIMEOUT_MS = 12 * 60_000;
export const EXPIRY_CASE_TIMEOUT_MS = 25 * 60_000;
