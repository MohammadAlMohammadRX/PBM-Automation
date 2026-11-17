import type { JobKey } from '../../utils/JobClock';

/**
 * US 20865 "View Settings - General Tab" (settings folder 02, 11 cases, 21080-21090).
 *
 * How it works in this build (reports/settings/Settings-Foundation-Notes.md):
 * System Settings > Settings is one hub with the tab strip `settings-hub-tabs`
 * (General, SMS Provider, Two-Factor Authentication, Password Policy). The
 * General read view has FIVE sections - Time Zone & Theme, Currency, SMTP,
 * Notifications & Announcements Archiving, Scheduled Jobs - and its values
 * carry no ids (read by label). No "General OTP Config" section is shown; the
 * OTP.* keys are still stored (GetSystemSettings).
 *
 * Permission keys (how they were found):
 * - The role-permission catalogue (GetRolePermissions, dump
 *   reports/user/probe/foundation-2026-11-08/p3-payeradmin-permissions.json)
 *   holds under SystemSettings: AuditLogs, GetSystemSettings (child:
 *   UpdatePasswordPolicy), UpsertSystemSettings; SMSProviderConfiguration:
 *   GetConfig, SaveConfig; TwoFactorAuthenticationConfiguration: GetConfig
 *   (children GetRoles, GetUsers), SaveSettings.
 * - The app bundle (reports/formulary/probe/bundle/chunk-7LKXOILJ.js) lists
 *   the three "view" keys that open System Settings: GetSystemSettings,
 *   SMSProviderConfiguration.GetConfig, TwoFactorAuthenticationConfiguration.GetConfig.
 * - There is NO separate view key for the Password Policy tab: a suite user
 *   holding ONLY SystemSettings.GetSystemSettings was offered the Password
 *   Policy tab in the User full run (TC 20800, 2026-11-08, step 2 PASS).
 *   So General and Password Policy share GetSystemSettings (TAB_VIEW_RIGHT).
 *
 * Literal readings / decisions:
 * - "Generate" (AC and 21080 / 21082) is read as General - the AC typo (lead
 *   decision 2); there is no "Generate" tab.
 * - "Two-Factor Authentication and Password Policy" (21080 / 21089) is read as
 *   the TWO tabs Two-Factor Authentication and Password Policy (the hub shows
 *   them as two buttons); 21089 selects both in turn.
 * - 21080 "all tabs the user is permitted to see": the expected set is derived
 *   from the admin's own permissions (TAB_VIEW_RIGHT); the case's named tabs
 *   (General, Two-Factor Authentication, Password Policy) must be among them.
 * - 21081 needs exactly ONE permitted tab, and that tab must be General. The
 *   only right that opens General (GetSystemSettings) also opens Password
 *   Policy, so the candidate below is tried and the case is BLOCKED with what
 *   the strip showed when it offers two or more tabs (SINGLE_TAB_BLOCKED).
 * - 21082 "listing the General and Generate tabs" -> the strip lists General
 *   (and the other permitted tab SMS Provider), and NOT the unpermitted
 *   Two-Factor Authentication tab.
 * - 21083: a suite role holding only Users rights (no settings key). Step 1's
 *   "without a visible System Settings entry, OR access is denied" is asserted
 *   as written (either half satisfies it); step 2 asserts the denial itself.
 * - 21084 / 21085 / 21086 compare the read view with GetSystemSettings (and
 *   GetBranding for title / logo / time zone). The time zone is shown as
 *   "(GMT+03:00) Riyadh" for "Asia/Riyadh" - the city must match. Schedules are
 *   compared by their time ("12:15 am" vs the CRON's Riyadh time); the case
 *   quotes no wording, so am/pm case is not compared here.
 * - 21086 / 21087 / 21088 name only Time Zone & Theme, Currency and Scheduled
 *   Jobs. 21088 step 2 says the tab shows ONLY those three - asserted
 *   literally, so the SMTP and Notifications & Announcements Archiving sections
 *   the build also shows are a finding there (the AC lists the same three).
 * - 21087 quotes no Arabic text: the check is that none of the English section
 *   names, labels or schedule wording is left and the view reads in Arabic.
 * - 21088 step 4 is BLOCKED (lead decision 8): no screen action asks for the
 *   General OTP. Two-factor is "Authenticate by None" platform-wide, and the
 *   only codes the platform issues (password reset) are not driven by OTP.*.
 *   Steps 2-3 run first; step 4 first checks the OTP.* values are still stored.
 * - 21090 saves the OTHER currency (USD today) in a second admin window
 *   (storage state .auth/admin.json), then the first window re-opens the tab.
 *   The settingsGuard restore runs straight after the last step.
 */

/** Permission keys of the System Settings hub (role catalogue, 2026-11-08). */
export const SETTINGS_RIGHT = {
  view: 'SystemSettings.GetSystemSettings',
  edit: 'SystemSettings.UpsertSystemSettings',
  smsView: 'SMSProviderConfiguration.GetConfig',
  twoFactorView: 'TwoFactorAuthenticationConfiguration.GetConfig',
} as const;

/** The hub's tab keys (SettingsHubPage / SETTINGS_HUB.tab) and their labels. */
export const TAB_LABEL = {
  general: 'General',
  sms: 'SMS Provider',
  twoFactor: 'Two-Factor Authentication',
  passwordPolicy: 'Password Policy',
} as const;

export type HubTab = keyof typeof TAB_LABEL;

/** The right that offers each tab (Password Policy has no key of its own - see the header). */
export const TAB_VIEW_RIGHT: Record<HubTab, string> = {
  general: SETTINGS_RIGHT.view,
  sms: SETTINGS_RIGHT.smsView,
  twoFactor: SETTINGS_RIGHT.twoFactorView,
  passwordPolicy: SETTINGS_RIGHT.view,
};

/** The three General sections the stories name. */
export const GENERAL_SECTIONS = ['Time Zone & Theme', 'Currency', 'Scheduled Jobs'] as const;

/** Every section heading the General read view is known to carry (5 seen 2026-11-09) plus an OTP one, if it ever came back. */
export const KNOWN_GENERAL_SECTIONS = [
  'Time Zone & Theme',
  'Currency',
  'SMTP',
  'Notifications & Announcements Archiving',
  'General OTP Config',
  'Scheduled Jobs',
] as const;

/** Read-view labels. */
export const VIEW_LABEL = {
  timeZone: 'Time zone',
  siteTitle: 'Site title',
  siteLogo: 'Site logo',
  currency: 'Currency',
  rate: 'Exchange rate (SAR per 1 USD)',
} as const;

/** The read view's label of each scheduled job (21086 names them in this order). */
export const JOB_VIEW_LABEL: Record<JobKey, string> = {
  'Jobs.AccumulatorAnnualResetCron': 'Policy benefit-year reset schedule',
  'Jobs.FormularyLifecycleCron': 'Formulary status update schedule',
  'Jobs.NetworkLifecycleCron': 'Medical network status update schedule',
  'Jobs.PayerLifecycleCron': 'Payer status update schedule',
  'Jobs.PlanLifecycleCron': 'Plan status update schedule',
  'Jobs.PolicyLifecycleCron': 'Policy status update schedule',
};

/** What each currency code reads as (read view and drawer). */
export const CURRENCY_LABEL: Record<string, string> = {
  SAR: 'SAR — Saudi Riyal',
  USD: 'USD — US Dollar',
};

/** Text that only a given tab shows - "is this tab's content on screen" (probe texts 2026-11-09). */
export const TAB_SIGNATURE: Record<HubTab, readonly string[]> = {
  general: ['Time Zone & Theme', 'Scheduled Jobs'],
  sms: ['Sender ID', 'Max message length'],
  twoFactor: ['OTP expiration (minutes)', 'Authenticate by'],
  passwordPolicy: ['Minimum length', 'Passwords remembered'],
};

/** English text of the General view that must be gone once the UI is Arabic (21087). */
export const ENGLISH_GENERAL_TEXT = [
  ...GENERAL_SECTIONS,
  VIEW_LABEL.timeZone,
  VIEW_LABEL.siteTitle,
  VIEW_LABEL.siteLogo,
  VIEW_LABEL.rate,
  ...Object.values(JOB_VIEW_LABEL),
  'Every day at',
] as const;

/** Anything on the General tab that would be the OTP / verification-code section (21088). */
export const OTP_TEXT = /\bOTP\b|verification code|one-time (pass)?code|General OTP/i;

/** The OTP keys the hidden section kept (GetSystemSettings, 2026-11-09). */
export const OTP_KEYS = ['OTP.Enabled', 'OTP.ExpirationMinutes', 'OTP.FailedAttempts', 'OTP.Length'] as const;

export const CASES = {
  allTabs: { azureId: '21080', namedTabs: [TAB_LABEL.general, TAB_LABEL.twoFactor, TAB_LABEL.passwordPolicy] },
  singleTab: {
    azureId: '21081',
    /** Right sets tried for "exactly one tab, and it is General" (GetSystemSettings is the only key that opens General). */
    candidates: [[SETTINGS_RIGHT.view]],
  },
  twoOrMoreTabs: {
    azureId: '21082',
    rights: [SETTINGS_RIGHT.view, SETTINGS_RIGHT.smsView],
    listed: [TAB_LABEL.general, TAB_LABEL.sms],
    notListed: [TAB_LABEL.twoFactor],
  },
  noViewPermission: {
    azureId: '21083',
    /** A suite role with Users rights only - no System Settings key at all. */
    rights: ['Users.GetUsers', 'Users.GetUser', 'Users.GetUsersDashboard'],
  },
  timeZoneTheme: { azureId: '21084' },
  currency: { azureId: '21085' },
  scheduledJobs: { azureId: '21086' },
  arabic: { azureId: '21087' },
  otpHidden: { azureId: '21088' },
  tabSwitching: { azureId: '21089', visit: ['twoFactor', 'passwordPolicy'] as HubTab[] },
  changedElsewhere: { azureId: '21090' },
} as const;

/** BLOCKED reason of 21081 when the single candidate still shows two or more tabs. */
export const SINGLE_TAB_BLOCKED = (tried: string, labels: readonly string[]): string =>
  `needs a user permitted to see exactly ONE settings tab, and that tab General. Tried a suite role holding only ${tried}: `
  + `the strip offered ${labels.length} tabs (${labels.join(', ')}). General and Password Policy share the view key `
  + `SystemSettings.GetSystemSettings (the catalogue has no separate Password Policy view key - UpdatePasswordPolicy is its child), `
  + 'so no right combination shows General alone.';

/** BLOCKED reason of 21088 step 4 (lead decision 8). */
export const OTP_STEP4_BLOCKED =
  'step 4 (trigger a sensitive action that relies on OTP verification) - no screen action asks for the General OTP: two-factor '
  + 'is "Authenticate by None" platform-wide (Two-Factor Authentication tab), enabling it would put every team behind OTP, and '
  + 'the only codes the platform issues (password reset) do not use the OTP.* settings. Steps 2-3 ran above and the OTP.* '
  + 'values were read back as still stored.';
