import { randomInt } from 'crypto';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { TestSteps } from '../../fixtures/testStatus.fixture';
import type { UserListPage } from '../../pages/user/UserListPage';
import type { ContactValues, UserFormDrawer, UserInfoValues, UserSaveAnswer } from '../../pages/user/UserFormDrawer';
import { requiredLabels } from '../../pages/components/PrimeControls';
import { buttonSelector } from '../../constants/ElementIds';
import { USER_FORM } from '../../constants/user/userIds';
import { USER_PAYER_PICKER } from '../../constants/user/writerBIds';
import {
  SUITE_USER_ARABIC_FIRST,
  SUITE_USER_FIRST_NAME,
  arabicToken,
  riyadhDate,
  suiteMobileNumber,
  uniqueUserDocumentId,
  userDayText,
  userDocumentIdExists,
  type IdentityTypeCode,
  type ProvisionedUser,
} from '../UserProvisioning';

/**
 * Writer B helpers (user folders 05 Create User, 09 Edit User), on top of the
 * foundation (pages/user/UserFormDrawer, utils/UserProvisioning). Nothing here
 * writes to an account the suite did not create: the drawer only ever saves
 * the case's own new user (registered with `discardUserEmail` BEFORE Save) or a
 * suite user from `userIn`.
 */

/** The option labels of the drawer's selects as the live lookups name them (2026-11-08). */
export const DRAWER_LABEL = {
  saudi: 'Saudi (SAU)',
  emirati: 'Emirati (ARE)',
  nationalId: 'National ID',
  iqama: 'Iqama (Residence Permit)',
  passport: 'Passport',
  gccId: 'GCC ID',
  male: 'Male',
  contactEmail: 'Email',
  english: 'English',
} as const;

const IDENTITY_LABEL: Record<IdentityTypeCode, string> = {
  nationalId: DRAWER_LABEL.nationalId,
  iqama: DRAWER_LABEL.iqama,
  passport: DRAWER_LABEL.passport,
  gccId: DRAWER_LABEL.gccId,
};

/** A suite user name pair (the `newSuiteUserName` fixture's answer). */
export interface SuiteName {
  lastName: string;
  displayNameEn: string;
  email: string;
}

/** Everything typed into the Add User drawer for a valid suite user. */
export interface DrawerUser extends SuiteName {
  info: UserInfoValues;
  contact: ContactValues;
}

/**
 * Valid step-1 and step-2 values for a suite user ("QA Automation User<stamp>",
 * qa.automation.* e-mail): born 15/05/1990, Male, deactivation in a year,
 * Saudi + National ID (a non-National-ID identity type switches to Emirati),
 * a free document ID, a Saudi mobile, contact Email, language English. Is Active
 * is left as the drawer has it (unticked) unless `info.isActive` says otherwise.
 */
export async function drawerUser(page: Page, name: SuiteName, overrides: { identity?: IdentityTypeCode; info?: Partial<UserInfoValues>; contact?: Partial<ContactValues> } = {}): Promise<DrawerUser> {
  const identity = overrides.identity ?? 'nationalId';
  const info: UserInfoValues = {
    englishFirstName: SUITE_USER_FIRST_NAME,
    englishLastName: name.lastName,
    arabicFirstName: SUITE_USER_ARABIC_FIRST,
    arabicLastName: `اختبار ${arabicToken()}`,
    dob: userDayText('1990-05-15'),
    gender: DRAWER_LABEL.male,
    accountDeactivationDate: userDayText(riyadhDate(365)),
    nationality: identity === 'nationalId' ? DRAWER_LABEL.saudi : DRAWER_LABEL.emirati,
    // Saudi presets National ID (the only option); the others are chosen.
    identityType: identity === 'nationalId' ? undefined : IDENTITY_LABEL[identity],
    documentId: await uniqueUserDocumentId(page, identity),
    ...overrides.info,
  };
  const contact: ContactValues = {
    phoneNumber: suiteMobileNumber(),
    email: name.email,
    preferredContactMethod: DRAWER_LABEL.contactEmail,
    preferredLanguage: DRAWER_LABEL.english,
    ...overrides.contact,
  };
  return { ...name, info, contact };
}

/** The literal document ID of a case when no user holds it, else a free one of the same type (the literal is kept when free). */
export async function literalOrFreeDocumentId(page: Page, literal: string, type: IdentityTypeCode = 'nationalId'): Promise<string> {
  return (await userDocumentIdExists(page, literal)) ? uniqueUserDocumentId(page, type) : literal;
}

/** `n` digits starting with `first` (random tail - document IDs / mobile numbers that are not anyone's). */
export function digits(n: number, first = String(1 + randomInt(9))): string {
  let out = first;
  while (out.length < n) out += String(randomInt(10));
  return out.slice(0, n);
}

/** A syntactically valid e-mail of exactly `length` characters (local part <= 64, domain label <= 63), qa.automation.* local part. */
export function emailOfLength(length: number): string {
  const tld = '.com';
  const room = length - 1 - tld.length; // local part + domain label
  const local = Math.min(64, room - 1);
  const label = room - local;
  if (local < 'qa.automation.'.length + 1 || label < 1 || label > 63) throw new Error(`no e-mail shape for length ${length}`);
  return `qa.automation.${'x'.repeat(local - 'qa.automation.'.length)}@${'d'.repeat(label)}${tld}`;
}

/** Straight quotes for comparing texts the app writes with curly ones. */
export const plainQuotes = (text: string): string => text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();

/** A Save from the drawer, in a few words (status, toasts, errors on screen). */
export function said(answer: UserSaveAnswer): string {
  return `status ${answer.status}${answer.text ? ` "${answer.text.slice(0, 200)}"` : ''}; shown ${JSON.stringify(answer.messages)}; errors ${JSON.stringify(answer.errors)}`;
}

/** Refused on screen (nothing sent) or by the server. */
export const refused = (answer: UserSaveAnswer): boolean => answer.status === -1 || answer.status >= 400;

/** Saved (2xx). */
export const saved = (answer: UserSaveAnswer): boolean => answer.status >= 200 && answer.status < 300;

/** "Navigate to the User Management module" - Users Administration in Table view, with rows. */
export async function navigateToUsers(steps: TestSteps, list: UserListPage, expected: string): Promise<void> {
  await steps.critical(`Navigate to the User Management module - ${expected}`, async () => {
    await list.openTable();
    expect(await list.countRows(), 'user rows listed').toBeGreaterThan(0);
  });
}

/** "Navigate to the User Management module" with the case's suite user revealed in the list. */
export async function navigateToUser(steps: TestSteps, list: UserListPage, user: ProvisionedUser, expected = 'the User Management list view is displayed'): Promise<void> {
  await steps.critical(`Navigate to the User Management module - ${expected}`, async () => {
    await list.openTable();
    await list.revealRow(user.displayNameEn);
    expect(await list.isRowShownById(user.id), `the suite user "${user.displayNameEn}" in the list`).toBe(true);
  });
}

/** Add User -> the drawer on User Information (step 1). */
export async function openAddUser(steps: TestSteps, list: UserListPage, action = 'Click "Add User"', expected = 'the User Information step is displayed'): Promise<UserFormDrawer> {
  let drawer!: UserFormDrawer;
  await steps.critical(`${action} - ${expected}`, async () => {
    drawer = await list.openAddForm();
    expect({ title: await drawer.getTitle(), step: await drawer.currentStep() }, 'the Add User drawer').toEqual({ title: expect.stringMatching(/add new user/i), step: 1 });
  });
  return drawer;
}

/** Row Edit on a suite user -> the Edit User drawer on User Information, loaded. */
export async function openEditUser(list: UserListPage, user: ProvisionedUser): Promise<UserFormDrawer> {
  await list.revealRow(user.displayNameEn);
  const drawer = await list.openEditForm(user.id);
  expect({ title: await drawer.getTitle(), step: await drawer.currentStep(), lastName: await drawer.getValue('englishLastName') }, 'the Edit User drawer')
    .toEqual({ title: expect.stringMatching(/edit user/i), step: 1, lastName: user.lastName });
  return drawer;
}

/** Fills step 1 with `user` and clicks Next; true when Contact Information is showing. */
export async function passUserInfo(drawer: UserFormDrawer, user: DrawerUser): Promise<boolean> {
  await drawer.fillUserInfo(user.info);
  await drawer.next();
  return (await drawer.currentStep()) === 2;
}

/** Fills step 2 with `user` and clicks Next; true when Roles and Privileges is showing. */
export async function passContact(drawer: UserFormDrawer, user: DrawerUser): Promise<boolean> {
  await drawer.fillContact(user.contact);
  await drawer.next();
  return (await drawer.currentStep()) === 3;
}

/** The step-1 / step-2 errors on screen, for a failure message. */
export async function errorsShown(drawer: UserFormDrawer): Promise<string> {
  return JSON.stringify(await drawer.getFieldErrors());
}

/** Whether the shared dialog (Unsaved Changes) is closed and the drawer is gone. */
export async function drawerClosed(drawer: UserFormDrawer): Promise<boolean> {
  await expect.poll(async () => drawer.isOpen(), { timeout: 8_000 }).toBe(false).catch(() => undefined);
  return !(await drawer.isOpen());
}

/**
 * Whether the drawer offers a Job Title field (Edit User cases 20587, 20602,
 * 20604, 20605 - the field does not exist on 2026-11-08): reads step 1, moves
 * to step 2 with Next and reads it too. Leaves the drawer on step 2 when Next
 * moved on.
 */
export async function jobTitleOffered(drawer: UserFormDrawer, label: RegExp = /job title/i): Promise<{ offered: boolean; step: number }> {
  const texts = [await drawer.getText()];
  if (await drawer.next()) texts.push(await drawer.getText());
  return { offered: texts.some((t) => label.test(t)), step: await drawer.currentStep() };
}

/** Selected Payers of the open picker, then "Move all up" (every payer back to Available). */
export async function moveAllPayersBack(page: Page, drawer: UserFormDrawer): Promise<{ before: string[]; after: string[]; saveEnabled: boolean }> {
  const before = await drawer.readPickerPayers('target');
  await page.locator(buttonSelector(USER_PAYER_PICKER.moveAllToSource)).click();
  await page.waitForTimeout(400);
  const after = await drawer.readPickerPayers('target');
  const saveEnabled = await page.locator(buttonSelector(USER_FORM.assignSave)).isEnabled().catch(() => false);
  return { before, after, saveEnabled };
}

/** One drawer step as the screen builds it: the visible controls (role ids folded to `*`), the labels marked required, the boxes' maxlength. */
export interface DrawerStepShape {
  controls: string[];
  required: string[];
  maxLengths: Record<string, string | null>;
}

/** The current step's shape (Record Information - Edit only - and the drawer chrome left out). */
export async function drawerStepShape(page: Page): Promise<DrawerStepShape> {
  const raw = await page.locator(`[id^="${USER_FORM.root}-"]`).evaluateAll((els) =>
    els
      .filter((e) => e.getClientRects().length > 0)
      .map((e) => ({ id: e.id, maxLength: e.getAttribute('maxlength') })));
  const kept = raw
    .filter((c) => /-(input|select|checkbox|link|add-role-button|remove-button)$/.test(c.id) && !/record-info|picklist|stepper/.test(c.id))
    // A card's Role select is `user-form-drawer-role-select` on a card added in this drawer and
    // `user-form-drawer-role-row-{roleId}-role-select` on a saved card - the SAME control (full run
    // 20611: Add showed one form, Edit the other), so both are normalised to one key.
    .map((c) => ({ id: c.id.replace(/role-row-(?:idx-\d+|[0-9a-f-]{36})-/, 'role-row-*-').replace(/^(user-form-drawer-)role-select$/, '$1role-row-*-role-select'), maxLength: c.maxLength }));
  const controls = [...new Set(kept.map((c) => c.id))].sort();
  const maxLengths: Record<string, string | null> = {};
  for (const c of kept) if (/-input$/.test(c.id)) maxLengths[c.id] = c.maxLength;
  const required = (await requiredLabels(page.locator(`#${USER_FORM.root}`)).catch(() => [] as string[])).sort();
  return { controls, required, maxLengths };
}
