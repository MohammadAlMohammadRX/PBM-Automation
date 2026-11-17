/**
 * Writer A ids (System Setting Management folder 01, story 20864 - 2026-11-09).
 * The ids the lead's SETTINGS_DRAWER does not hold: where the saved branding
 * (title + logo) shows OUTSIDE the drawer. Seen in the probe dumps
 * (reports/user/probe/foundation-2026-11-08/p5-login-page.ids.txt,
 * reports/settings/probe/foundation-2026-11-09/p2-drawer.ids.txt).
 */
export const BRANDING = {
  /** The sign-in screen's logo `<img id="auth-shell-logo">` (alt = the site title, src = the branding logo). */
  signInLogo: 'auth-shell-logo',
  /** The side navigation's brand block - its logo `<img>` carries no id of its own. */
  navBrand: 'app-nav-drawer-brand',
  /** The General read view's outlet (its logo `<img>` carries no id). */
  outlet: 'app-layout-outlet',
} as const;
