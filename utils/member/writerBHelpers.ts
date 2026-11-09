import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { TestSteps } from '../../fixtures/testStatus.fixture';
import type { MemberManagementPage } from '../../pages/member/MemberManagementPage';
import type {
  MemberAddressInfo,
  MemberFormDrawer,
  MemberNonNationalInfo,
  MemberPatientInfo,
  MemberSaveAnswer,
} from '../../pages/member/MemberFormDrawer';
import { readSelectOptions } from '../../pages/components/PrimeControls';
import { MEMBER_FORM } from '../../constants/member/memberIds';
import { MEMBER_FORM_DIAL_CODE_PREFIX } from '../../constants/member/writerBIds';
import { Timeouts } from '../../constants/Timeouts';
import {
  SUITE_MEMBER_ARABIC_FIRST,
  SUITE_MEMBER_ARABIC_SECOND,
  SUITE_MEMBER_FIRST_NAME,
  SUITE_MEMBER_SECOND_NAME,
  arabicLettersToken,
  documentIdExists,
  memberDayText,
  readMemberDashboard,
  readMemberForEdit,
  riyadhDay,
  suiteMemberDisplayName,
  suiteMemberEmail,
  suiteMemberLastName,
  suiteMobileNumber,
  uniqueDocumentId,
  type MemberBody,
} from '../MemberProvisioning';

/**
 * Writer B's helpers for the member folders 05 (US 14380 Create Member) and 07
 * (US 14382 Edit Member). Everything the wizard itself does lives in
 * pages/member/MemberFormDrawer.ts; this file only adds what those two stories
 * need on top: a valid data set for the four steps, walking the wizard step by
 * step with each Next asserted, a Submit that also works when the wizard stops
 * on an earlier step, the labels a step shows / marks required, the (absent)
 * Country Dial Code control, and a reload that survives a "leave page" prompt.
 */

/** The select labels the wizard offers (verified 2026-11-05). */
export const WIZARD_LABEL = {
  saudi: 'Saudi (SAU)',
  /** Any non-Saudi nationality: Iqama is preset, Iqama / Passport / GCC ID offered. */
  nonSaudi: 'Jordanian (JOR)',
  nationalId: 'National ID',
  iqama: 'Iqama (Residence Permit)',
  passport: 'Passport',
  gccId: 'GCC ID',
  male: 'Male',
  alive: 'Alive',
  email: 'Email',
  english: 'English',
  saudiArabia: 'Saudi Arabia',
} as const;

/** One complete, valid wizard data set for a fresh suite member. */
export interface WizardData {
  lastName: string;
  /** "QA Automation Member<stamp>" - what the list shows and teardown finds. */
  displayNameEn: string;
  patient: MemberPatientInfo;
  nonNational: MemberNonNationalInfo;
  address: MemberAddressInfo;
}

/**
 * Valid values for every mandatory field of the four steps (Saudi, National ID
 * with a free document ID, 15/05/1990, Male, Alive; a unique Saudi mobile and
 * e-mail, Email / English; Saudi Arabia) - the overrides replace them.
 */
export async function validWizardData(
  page: Page,
  overrides: { patient?: MemberPatientInfo; nonNational?: MemberNonNationalInfo; address?: MemberAddressInfo } = {},
): Promise<WizardData> {
  const lastName = overrides.patient?.englishLastName || suiteMemberLastName();
  return {
    lastName,
    displayNameEn: suiteMemberDisplayName(lastName),
    patient: {
      englishFirstName: SUITE_MEMBER_FIRST_NAME,
      englishSecondName: SUITE_MEMBER_SECOND_NAME,
      englishLastName: lastName,
      arabicFirstName: SUITE_MEMBER_ARABIC_FIRST,
      arabicSecondName: SUITE_MEMBER_ARABIC_SECOND,
      arabicLastName: arabicLettersToken(),
      nationality: WIZARD_LABEL.saudi,
      documentId: overrides.patient?.documentId ?? (await uniqueDocumentId(page, 'nationalId')),
      dateOfBirth: memberDayText('1990-05-15'),
      gender: WIZARD_LABEL.male,
      memberStatus: WIZARD_LABEL.alive,
      ...overrides.patient,
    },
    nonNational: {
      mobileNumber: suiteMobileNumber(),
      email: suiteMemberEmail(),
      preferredContactMethod: WIZARD_LABEL.email,
      preferredLanguage: WIZARD_LABEL.english,
      ...overrides.nonNational,
    },
    address: { country: WIZARD_LABEL.saudiArabia, ...overrides.address },
  };
}

/**
 * The case's literal document ID when no member holds it, else one of the same
 * length and first character that is free (the literal values of the Azure
 * cases - "1234567890", "2123456789" ... - may already be registered, and the
 * wizard refuses a taken ID on blur).
 */
export async function literalOrFreeDocumentId(page: Page, literal: string): Promise<string> {
  if (!(await documentIdExists(page, literal))) return literal;
  const digits = /^\d+$/.test(literal);
  for (let i = 0; i < 8; i += 1) {
    let tail = '';
    while (tail.length < literal.length - 1) tail += digits ? String(Math.floor(Math.random() * 10)) : String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const candidate = `${literal[0]}${tail}`;
    if (!(await documentIdExists(page, candidate))) return candidate;
  }
  throw new Error(`no free document ID shaped like "${literal}" after 8 tries`);
}

/** The national part of a Saudi mobile as the case writes it ("+966512345678" -> "512345678"): the wizard shows "+966" as fixed text before the box. */
export const nationalPart = (mobile: string): string => mobile.replace(/^\+966/, '');

/** A save the application accepted. */
export const saved = (answer: MemberSaveAnswer): boolean => answer.status >= 200 && answer.status < 300;

/** What a save answered, for a failure message. */
export const said = (answer: MemberSaveAnswer): string => `${answer.status === -1 ? 'refused on screen (nothing sent)' : answer.status} ${answer.text.slice(0, 240)} | ${answer.messages.join(' | ')}`;

/** The new member's id from a CreateMember answer, or null. */
export function createdId(answer: MemberSaveAnswer): string | null {
  try {
    return (JSON.parse(answer.text) as { payload?: { id?: string } }).payload?.id ?? null;
  } catch {
    return null;
  }
}

/** The register's Total (GetMembersDashboard) - "no member was created" is this unchanged. */
export const totalMembers = async (page: Page): Promise<number> => (await readMemberDashboard(page)).total;

/** The two opening steps of a Create case; returns the open wizard on step 1. */
export async function openAddWizard(steps: TestSteps, list: MemberManagementPage, step2Expected = 'Step 1 "Member Information" form is displayed'): Promise<MemberFormDrawer> {
  let drawer!: MemberFormDrawer;
  await steps.critical('Navigate to the Member Management module - the member list view is displayed', async () => {
    await list.openTable();
    expect(await list.countRows(), 'the member list rows').toBeGreaterThan(0);
  });
  await steps.critical(`Click "Create Member" - ${step2Expected}`, async () => {
    drawer = await list.openAddForm();
    expect(await drawer.getTitle(), 'the wizard title').toMatch(/add new member/i);
    expect(await drawer.currentStep(), 'the wizard opens on step 1 Member Information').toBe(1);
  });
  return drawer;
}

/** Fills step `from` and presses Next, asserting the wizard moved on. */
async function fillAndNext(drawer: MemberFormDrawer, data: WizardData, step: 1 | 2 | 3): Promise<void> {
  if (step === 1) await drawer.fillPatient(data.patient);
  if (step === 2) await drawer.fillNonNational(data.nonNational);
  if (step === 3) await drawer.fillAddress(data.address);
  const moved = await drawer.next();
  expect(moved, `step ${step} should be accepted: ${JSON.stringify(await drawer.getFieldErrors())} ${(await drawer.getMessages()).join(' | ')}`).toBe(true);
}

/** Fills the steps before `target` with `data` (each Next asserted) and stops on `target`. */
export async function advanceTo(drawer: MemberFormDrawer, data: WizardData, target: 2 | 3 | 4): Promise<void> {
  for (let step = (await drawer.currentStep()) as number; step < target; step += 1) await fillAndNext(drawer, data, step as 1 | 2 | 3);
  expect(await drawer.currentStep(), `the wizard should show step ${target}`).toBe(target);
}

/**
 * The wizard's Submit (Save on step 4). When a step before 4 does not validate
 * the wizard stops there and Save is not rendered: that is a refusal on screen
 * (status -1, nothing sent) with the step's messages - MemberFormDrawer.attemptSave
 * would otherwise wait for a Save that is not there.
 */
export async function submitWizard(drawer: MemberFormDrawer): Promise<MemberSaveAnswer> {
  await drawer.ensureStep(4);
  if ((await drawer.currentStep()) !== 4) return { status: -1, text: '', messages: await drawer.getMessages(), body: null };
  return drawer.attemptSave();
}

/** The labels of the step on screen, in order (third names, checkboxes and contact fields included). */
export async function visibleLabels(page: Page): Promise<string[]> {
  return page.locator(`#${MEMBER_FORM.root}`).locator('label').evaluateAll((labels) => labels
    .filter((l) => (l as HTMLElement).offsetParent !== null)
    .map((l) => (l as HTMLElement).innerText.replace(/\*/g, '').replace(/\s+/g, ' ').trim())
    .filter((t) => t !== ''));
}

/** The labels of the step on screen marked required (the red "*" is drawn by CSS on the label). */
export async function visibleRequiredLabels(page: Page): Promise<string[]> {
  return page.locator(`#${MEMBER_FORM.root}`).locator('label').evaluateAll((labels) => labels
    .filter((l) => (l as HTMLElement).offsetParent !== null)
    .filter((l) => {
      const before = getComputedStyle(l, '::before').content;
      const after = getComputedStyle(l, '::after').content;
      return /\*/.test(`${(l as HTMLElement).innerText} ${before} ${after}`) || l.querySelector('[class*="required"]') !== null;
    })
    .map((l) => (l as HTMLElement).innerText.replace(/\*/g, '').replace(/\s+/g, ' ').trim())
    .filter((t) => t !== ''));
}

/** What the wizard shows of a Country Dial Code control (20342): present, its options, its value, its error. */
export async function readDialCodeControl(page: Page): Promise<{ present: boolean; options: string[]; value: string; error: string }> {
  const control = page.locator(`#${MEMBER_FORM.root} [id^="${MEMBER_FORM_DIAL_CODE_PREFIX}"]:not([id$="-error"])`).first();
  const present = await control.isVisible().catch(() => false);
  if (!present) return { present, options: [], value: '', error: '' };
  const value = (await control.innerText().catch(() => '')).trim() || (await control.inputValue().catch(() => ''));
  const options = await readSelectOptions(page, control).catch(() => [] as string[]);
  const error = (await page.locator(`[id^="${MEMBER_FORM_DIAL_CODE_PREFIX}"][id$="-error"]`).first().innerText({ timeout: Timeouts.short }).catch(() => '')).trim();
  return { present, options, value, error };
}

/**
 * Reloads the page mid-wizard. A "leave this page?" prompt (beforeunload) is
 * accepted - and reported - so the reload is not cancelled by Playwright's
 * default dismissal.
 */
export async function reloadMidWizard(page: Page): Promise<{ prompted: boolean }> {
  let prompted = false;
  const onDialog = (dialog: { type: () => string; accept: () => Promise<void> }): void => {
    prompted = prompted || dialog.type() === 'beforeunload';
    void dialog.accept().catch(() => undefined);
  };
  page.on('dialog', onDialog);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
  } finally {
    page.off('dialog', onDialog);
  }
  return { prompted };
}

/** Collects every JavaScript dialog (alert / confirm / prompt) the page raises - a script that ran - and dismisses it. */
export function watchScriptDialogs(page: Page): string[] {
  const seen: string[] = [];
  page.on('dialog', (dialog) => {
    // A leave-page prompt is accepted (dismissing it would cancel the navigation); any other dialog is a script that ran.
    if (dialog.type() === 'beforeunload') {
      void dialog.accept().catch(() => undefined);
      return;
    }
    seen.push(`${dialog.type()}: ${dialog.message()}`);
    void dialog.dismiss().catch(() => undefined);
  });
  return seen;
}

/** Collects uncaught page errors (a crash of the screen's code). */
export function watchPageErrors(page: Page): string[] {
  const seen: string[] = [];
  page.on('pageerror', (error) => seen.push(error.message.slice(0, 200)));
  return seen;
}

/** Whole years between a `YYYY-MM-DD` birth date and today in Riyadh (what the view's Age shows). */
export function ageToday(dateOfBirth: string): number {
  const [by, bm, bd] = dateOfBirth.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = riyadhDay(0).split('-').map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/** The editable values of a member (GetMemberForEdit without its concurrency stamp / code) - "the record is unchanged" compares these. */
export async function editableValues(page: Page, memberId: string): Promise<MemberBody & { id: string; policyHolderIds: string[] }> {
  const { concurrencyStamp: _stamp, memberCode: _code, ...values } = await readMemberForEdit(page, memberId);
  return values;
}

/** A Latin-letters string of `length` characters starting with the suite last name prefix "Member" (an English name has letters only). */
export function longEnglishName(length: number): string {
  let out = 'Member';
  while (out.length < length) out += String.fromCharCode(97 + Math.floor(Math.random() * 26));
  return out.slice(0, length);
}
