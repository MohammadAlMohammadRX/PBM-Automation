import type { Page } from '@playwright/test';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { buttonSelector } from '../../constants/ElementIds';
import { AppRoutes } from '../../constants/AppRoutes';
import { env } from '../../constants/EnvironmentConfig';
import { Timeouts } from '../../constants/Timeouts';
import { CHANGE_PASSWORD, MY_PROFILE, PASSWORD_POLICY, type MyProfileField, type PasswordRule } from '../../constants/user/userIds';
import type { ChangePasswordDrawer } from '../../pages/user/ChangePasswordDrawer';
import type { MyProfilePage, ProfileFieldSave } from '../../pages/user/MyProfilePage';
import type { PasswordPolicyTab } from '../../pages/user/PasswordPolicyTab';
import { toastMessages } from '../../pages/user/userCommon';
import type { PasswordPolicy, UserRecord } from '../UserProvisioning';

/**
 * Writer F helpers (User Management folders 15 My Profile, 17 Change Password,
 * 18 Password Policy - 2026-11-08). What the foundation page objects do not
 * cover: the My Profile header / summary strip (they carry NO ids - read from
 * the `#my-profile` text and layout), a simulated profile-load failure, the
 * strength meter read while typing, the Password Policy drawer re-opened
 * between Saves. Ids only; nothing here types or returns a real password.
 */

// ---- My Profile -----------------------------------------------------------------------

/** The `#my-profile` text as trimmed, non-empty lines (header, summary strip, sections). */
export async function profileLines(page: Page): Promise<string[]> {
  const text = await page.locator(`#${MY_PROFILE.root}`).innerText().catch(() => '');
  return text.split('\n').map((l) => l.trim()).filter(Boolean);
}

/** The header lines: everything before the summary strip's first label "Nationality". */
export function headerLines(lines: string[]): string[] {
  const i = lines.indexOf('Nationality');
  return i < 0 ? lines : lines.slice(0, i);
}

/** The summary strip lines: from the first "Nationality" up to "Personal Information". */
export function summaryLines(lines: string[]): string[] {
  const start = lines.indexOf('Nationality');
  const end = lines.indexOf('Personal Information');
  return start < 0 ? [] : lines.slice(start, end > start ? end : undefined);
}

/** The lines of one section: after its title up to the next section title. */
export function sectionLines(lines: string[], title: string): string[] {
  const titles = ['Personal Information', 'Contact Information', 'Roles & Status', 'Record Information'];
  const start = lines.indexOf(title);
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const next = rest.findIndex((l) => titles.includes(l));
  return next < 0 ? rest : rest.slice(0, next);
}

/** Initials as the header derives them from a name: first letter of the first and last words. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  return `${words[0][0]}${words.length > 1 ? words[words.length - 1][0] : ''}`.toUpperCase();
}

export async function isChangePasswordButtonShown(page: Page): Promise<boolean> {
  return page.locator(`#${MY_PROFILE.changePasswordButton}`).isVisible().catch(() => false);
}

/**
 * The vertical position of the summary strip's four labels (Nationality, Document
 * ID, Mobile Number, Age - their FIRST occurrence inside `#my-profile`, which is
 * the strip; the strip carries no ids). One line = the same top.
 */
export async function summaryLabelTops(page: Page): Promise<Record<string, number | null>> {
  return page.locator(`#${MY_PROFILE.root}`).evaluate((root) => {
    const leaves = Array.from(root.querySelectorAll('*')).filter((e) => e.children.length === 0);
    const out: Record<string, number | null> = {};
    for (const label of ['Nationality', 'Document ID', 'Mobile Number', 'Age']) {
      const el = leaves.find((e) => (e.textContent ?? '').trim() === label);
      out[label] = el ? Math.round(el.getBoundingClientRect().top) : null;
    }
    return out;
  });
}

/**
 * Clicks and double-clicks every value of the summary strip (the smallest
 * container holding its four labels). Refuses (-1) when that container would
 * also hold an editable field or a section toggle - never clicks a pencil.
 * Returns how many elements were clicked.
 */
export async function clickSummaryStrip(page: Page): Promise<number> {
  return page.locator(`#${MY_PROFILE.root}`).evaluate((root) => {
    const leaves = Array.from(root.querySelectorAll('*')).filter((e) => e.children.length === 0);
    const found = ['Nationality', 'Document ID', 'Mobile Number', 'Age']
      .map((t) => leaves.find((e) => (e.textContent ?? '').trim() === t))
      .filter((e): e is Element => !!e);
    if (found.length === 0) return 0;
    let common: Element | null = found[0].parentElement;
    while (common && !found.every((f) => common?.contains(f))) common = common.parentElement;
    if (!common || common === root || common.querySelector('[id^="my-profile-field-"], [id^="my-profile-section-"]')) return -1;
    const targets = Array.from(common.querySelectorAll('*')).filter((e) => e.children.length === 0);
    for (const t of targets) {
      t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      t.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    }
    return targets.length;
  });
}

/** Ids of the visible text inputs / text areas / editable regions / selects inside My Profile (none outside edit mode). */
export async function visibleEditableControls(page: Page): Promise<string[]> {
  return page.locator(`#${MY_PROFILE.root}`).evaluate((root) => Array.from(root.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), textarea, select, [contenteditable="true"], [id$="-save-button"]'))
    .filter((e) => {
      const r = (e as HTMLElement).getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    })
    .map((e) => e.id || e.tagName.toLowerCase()));
}

export async function isCancelShown(page: Page, field: MyProfileField): Promise<boolean> {
  return page.locator(`#my-profile-field-${MY_PROFILE.field[field]}-cancel-button`).isVisible().catch(() => false);
}

/** Clicks a field's pencil if it can be clicked (short timeout); false when it is not offered / not clickable. */
export async function tryStartEdit(page: Page, field: MyProfileField): Promise<boolean> {
  return page.locator(`#my-profile-field-${MY_PROFILE.field[field]}-edit-button`).click({ timeout: 3_000 }).then(() => true).catch(() => false);
}

/** Pencil (when not already editing), type, Save. */
export async function editAndSave(profile: MyProfilePage, field: MyProfileField, value: string): Promise<ProfileFieldSave> {
  if (!(await profile.isEditing(field))) await profile.startEdit(field);
  await profile.typeField(field, value);
  return profile.saveField(field);
}

/** Pencil (when not already editing), choose an option whose label matches, Save. Returns the save and the label chosen. */
export async function chooseAndSave(profile: MyProfilePage, field: MyProfileField, matcher: RegExp): Promise<{ save: ProfileFieldSave; chosen: string; options: string[] }> {
  if (!(await profile.isEditing(field))) await profile.startEdit(field);
  const options = await profile.getFieldOptions(field);
  const chosen = options.find((o) => matcher.test(o)) ?? '';
  if (chosen === '') throw new Error(`no option matching ${matcher} among ${JSON.stringify(options)}`);
  await profile.chooseField(field, chosen);
  return { save: await profile.saveField(field), chosen, options };
}

/** The user-record keys My Profile can change - to prove a Save touched only its own field. */
export const PROFILE_KEYS = [
  'englishFirstName', 'englishSecondName', 'englishLastName', 'arabicFirstName', 'arabicSecondName', 'arabicLastName',
  'phoneNumber', 'countryDialCodeId', 'preferredLanguageId', 'preferredContactMethodId',
] as const;

/** Which PROFILE_KEYS differ between two reads of the user. */
export function changedProfileKeys(before: UserRecord, after: UserRecord): string[] {
  return PROFILE_KEYS.filter((k) => (before[k] ?? '') !== (after[k] ?? ''));
}

/**
 * Opens My Profile while GetCurrentUser (the profile's own load) answers 500 -
 * the "backend unavailable" of 20760. Only that call is failed (the layout's
 * GetCurrentUserRolesAndPermissions is untouched); the route is removed after.
 * Returns the main area's text and the toasts shown.
 */
export async function openMyProfileWithFailingLoad(page: Page): Promise<{ text: string; messages: string[]; failedCalls: number }> {
  let failedCalls = 0;
  const matcher = (url: URL): boolean => url.pathname.endsWith(ApiEndpoints.manageCurrentUser);
  await page.route(matcher, async (route) => {
    failedCalls += 1;
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ Status: 500, ErrorMessage: 'Simulated outage (automation suite)' }) });
  });
  try {
    await page.goto(new URL(AppRoutes.myProfile, env.baseUrl).toString(), { waitUntil: 'domcontentloaded', timeout: Timeouts.navigation });
    const messages = await toastMessages(page, 5_000);
    await page.waitForTimeout(1_500);
    const text = (await page.locator('#app-layout-outlet').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    return { text, messages, failedCalls };
  } finally {
    await page.unroute(matcher);
  }
}

// ---- Change Password ------------------------------------------------------------------

/**
 * Types `text` into New Password one character at a time (focus + End, keyboard)
 * and reads the strength meter after each character. `text` is a THROWAWAY
 * guidance string, never a password that is submitted.
 */
export async function strengthWhileTyping(page: Page, drawer: ChangePasswordDrawer, text: string): Promise<string[]> {
  const input = page.locator(`#${CHANGE_PASSWORD.next}`);
  await input.focus();
  await input.press('End');
  const labels: string[] = [];
  for (const ch of text) {
    await page.keyboard.type(ch);
    await page.waitForTimeout(150);
    labels.push(await drawer.readStrength());
  }
  return labels;
}

/** Consecutive duplicates removed (Weak, Weak, Fair -> Weak, Fair). */
export function distinctRun(labels: string[]): string[] {
  return labels.filter((l, i) => l !== '' && l !== labels[i - 1]);
}

export async function isRequirementsListShown(page: Page): Promise<boolean> {
  return page.locator(`#${CHANGE_PASSWORD.requirements}`).isVisible().catch(() => false);
}

/** The text of the Current Password box's own error (empty when none). */
export async function currentPasswordError(page: Page): Promise<string> {
  const el = page.locator(`#${CHANGE_PASSWORD.currentError}`);
  return (await el.isVisible().catch(() => false)) ? (await el.innerText()).replace(/\s+/g, ' ').trim() : '';
}

/**
 * Which of the three password boxes read as highlighted (invalid): an error of
 * its own, `aria-invalid`, or Angular's ng-invalid on the box or its field host
 * once touched / dirty.
 */
export async function highlightedPasswordBoxes(page: Page): Promise<string[]> {
  const boxes = { current: CHANGE_PASSWORD.current, next: CHANGE_PASSWORD.next, confirm: CHANGE_PASSWORD.confirm };
  const errors = { current: CHANGE_PASSWORD.currentError, next: CHANGE_PASSWORD.nextError, confirm: CHANGE_PASSWORD.confirmError };
  const out: string[] = [];
  for (const key of Object.keys(boxes) as (keyof typeof boxes)[]) {
    const ownError = await page.locator(`#${errors[key]}`).isVisible().catch(() => false);
    const flagged = await page.locator(`#${boxes[key]}`).evaluate((el) => el.getAttribute('aria-invalid') === 'true'
      || (el.classList.contains('ng-invalid') && (el.classList.contains('ng-touched') || el.classList.contains('ng-dirty')))
      || !!el.closest('.ng-invalid.ng-touched, .ng-invalid.ng-dirty')).catch(() => false);
    if (ownError || flagged) out.push(key);
  }
  return out;
}

/** The checklist lines a policy should show (AC 20425: only what it imposes; distinct characters only above 1). */
export function expectedRuleKeys(policy: Pick<PasswordPolicy, 'requireUppercase' | 'requireLowercase' | 'requireDigit' | 'requireNonAlphanumeric' | 'requiredUniqueChars'>): PasswordRule[] {
  const keys: PasswordRule[] = ['lengthRange'];
  if (policy.requireUppercase) keys.push('uppercase');
  if (policy.requireLowercase) keys.push('lowercase');
  if (policy.requireDigit) keys.push('digit');
  if (policy.requireNonAlphanumeric) keys.push('symbol');
  if (policy.requiredUniqueChars > 1) keys.push('uniqueChars');
  return keys;
}

// ---- Password Policy ------------------------------------------------------------------

/** Re-opens the Edit Password Policy drawer when a Save closed it. */
export async function ensurePolicyDrawer(tab: PasswordPolicyTab): Promise<void> {
  if (!(await tab.isDrawerOpen())) await tab.openEdit();
}

/** Waits for the drawer to close after a Save (true when it closed). */
export async function policyDrawerClosed(page: Page): Promise<boolean> {
  return page.locator(`#${PASSWORD_POLICY.title}`).waitFor({ state: 'hidden', timeout: Timeouts.default }).then(() => true).catch(() => false);
}

/** Puts `text` into a policy box as a paste would (no key events per character), then leaves the box. */
export async function pasteIntoPolicyBox(page: Page, inputId: string, text: string): Promise<void> {
  const input = page.locator(`#${inputId}`);
  await input.click();
  await input.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
  await input.blur();
  await page.waitForTimeout(200);
}

/** Whether the Password Policy Edit button is shown AND enabled (a usable control). */
export async function isPolicyEditUsable(page: Page): Promise<{ shown: boolean; enabled: boolean }> {
  const button = page.locator(buttonSelector(PASSWORD_POLICY.editButton)).first();
  const shown = await button.isVisible().catch(() => false);
  return { shown, enabled: shown && (await button.isEnabled().catch(() => false)) };
}

/** Opens System Settings > Password Policy for a session that may NOT be offered Edit (the page object's `open` waits for Edit). */
export async function openPolicyViewWithoutEdit(page: Page): Promise<{ tabOffered: boolean }> {
  await page.goto(new URL(AppRoutes.systemSettings, env.baseUrl).toString(), { waitUntil: 'domcontentloaded', timeout: Timeouts.navigation });
  const tab = page.locator(`#${PASSWORD_POLICY.tab}`);
  const tabOffered = await tab.waitFor({ state: 'visible', timeout: Timeouts.default }).then(() => true).catch(() => false);
  if (tabOffered) {
    await tab.click();
    await page.waitForTimeout(1_500);
  }
  return { tabOffered };
}
