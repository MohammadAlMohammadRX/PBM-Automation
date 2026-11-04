import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { blockedByPrecondition } from '../../fixtures/testStatus.fixture';
import type { PolicyDetailPage } from '../../pages/policy/PolicyDetailPage';
import type { PolicyFormDrawer, PolicyCoverage, PolicySaveAnswer } from '../../pages/policy/PolicyFormDrawer';
import type { PolicyMembersTab } from '../../pages/policy/PolicyMembersTab';
import type { MemberSaveAnswer } from '../../pages/policy/PolicyMemberDrawer';
import type { PolicyDocumentsTab } from '../../pages/policy/PolicyDocumentsTab';
import type { ApprovalManagementPage } from '../../pages/approval/ApprovalManagementPage';
import type { PolicySession } from './policyRole';
import { ApiEndpoints } from '../../constants/ApiEndpoints';
import { AppRoutes } from '../../constants/AppRoutes';
import { Timeouts } from '../../constants/Timeouts';
import { POLICY_APPROVAL_REVIEW, POLICY_DETAIL, POLICY_FORM, SCREEN, buttonSelector, type PolicyFormField } from '../../constants/ElementIds';
import { AUDIT_LOG_BY_ID_PATH, FILE_DOWNLOAD_PATH, POLICY_OVERVIEW_PREFIX } from '../../constants/policy/writerBIds';
import { NON_ADMIN_PROFILE } from '../../data/accounts/nonAdminAccount.data';
import { toArabicToken } from '../../data/payers/payer.data';
import { NetworkUtils } from '../NetworkUtils';
import { Logger } from '../Logger';
import {
  answerText,
  deletePolicy,
  inactivatePolicy,
  listPolicyRegister,
  memberCandidates,
  minutesFromNow,
  policyStamp,
  policyStatusCodes,
  policyTypeId,
  publishPolicyChange,
  readPolicy,
  readPolicyMembers,
  submitPolicy,
  suitePolicyPlan,
  waitForPolicyStatus,
  type MemberCandidate,
  type PolicyAnswer,
  type PolicyAuditEntry,
  type PolicyListItem,
  type PolicyMember,
  type PolicyRecord,
  type PolicyState,
  type PolicyUploadFile,
  type ProvisionedPolicy,
  type SuitePolicySpec,
} from '../PolicyProvisioning';

/**
 * Writer B's helpers for the policy folders 03 (Edit), 04 (Member limit), 05
 * (Policyholder), 06 (Create), 07 (Overview), 08 (Documentation), 12
 * (Activate / Inactive) and 13 (Delete). The shared page objects, fixtures and
 * provisioning helpers are not edited (reports/policy/Policy-Writers-Brief.md):
 * what they lack lives here, as functions taking the page object or `Page`.
 * Everything calls the application's own screens or endpoints.
 */

/** A case the environment cannot run, with the reason - written as a data-driven BLOCKED test. */
export interface PolicyBlockedCase {
  azureId: string;
  title: string;
  reason: string;
}

/** The fixture's builder, as a parameter type. */
export type PolicyBuilder = (state: PolicyState, spec?: SuitePolicySpec) => Promise<ProvisionedPolicy>;

/** 'absent' | 'disabled' | 'available' - how a control is offered. */
export type Availability = 'absent' | 'disabled' | 'available';

/**
 * The payer the permission cases build their policy under: NUPCO, the ACTIVE
 * one of the shaped Payer Admin's two payers - that account sees only its own
 * payers' policies, never the suite payer "Al sharq" (foundation notes).
 */
export const POLICY_SCOPED_PAYER = NON_ADMIN_PROFILE.scopedPayers[1];

/** A text field of the policy drawer (every field but the four selects). */
export type PolicyTextField = Exclude<PolicyFormField, 'type' | 'payer' | 'plan' | 'holder'>;

/** ISO time `days` after `iso`. */
export const isoDaysAfter = (iso: string, days: number): string => new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();

/** A suite name with a label: `QA Automation Policy <label> <stamp>`. */
export { suitePolicyName } from '../PolicyProvisioning';

/** An Arabic name the Arabic-only rule accepts (`وثيقة <arabic stamp>`). */
export const arabicName = (prefix = 'وثيقة'): string => `${prefix} ${toArabicToken(policyStamp())}`;

/** The version number of a `v<n> · <status>` badge (NaN when none). */
export const versionNumber = (badge: string): number => {
  const match = badge.match(/v\s*(\d+)/i);
  return match ? Number(match[1]) : NaN;
};

/** The EFFECTIVE status code of a record (`pending` = Future, `active`, `inactive`, `expired` ...). */
export async function effectiveStatusCode(page: Page, record: Pick<PolicyRecord, 'effectiveStatusId' | 'statusId'>): Promise<string> {
  return (await policyStatusCodes(page))[record.effectiveStatusId ?? record.statusId] ?? '';
}

// ---- the policy drawer --------------------------------------------------------------

/** Whether a text field of the policy drawer can be typed into (rendered, not disabled, not read-only). */
export async function isFormFieldEditable(page: Page, field: PolicyTextField, namespace: string = POLICY_FORM.add): Promise<boolean> {
  const input = page.locator(`#${namespace}-${POLICY_FORM[field]}`);
  if (!(await input.isVisible().catch(() => false))) return false;
  return input.evaluate((el) => !(el as HTMLInputElement).disabled && !(el as HTMLInputElement).readOnly).catch(() => false);
}

/**
 * Opens the policy afresh (a reload drops any drawer a failed step left open),
 * clicks Edit, and moves the drawer to step 2 "Coverage Period".
 */
export async function openEditAtCoverage(detail: PolicyDetailPage, policyId: string): Promise<PolicyFormDrawer> {
  await detail.open(policyId);
  const drawer = await detail.openEditDrawer();
  if ((await drawer.currentStep()) === 1 && !(await drawer.next())) await drawer.goToStep(2);
  await expect.poll(() => drawer.currentStep(), { timeout: Timeouts.default, message: 'the Edit drawer should reach Coverage Period' }).toBe(2);
  return drawer;
}

/** Types each coverage value, first asserting the field is editable (a disabled field is the finding, said by name). */
export async function typeCoverage(page: Page, drawer: PolicyFormDrawer, coverage: PolicyCoverage): Promise<void> {
  for (const [field, value] of Object.entries(coverage) as [PolicyTextField, string | undefined][]) {
    if (value === undefined) continue;
    expect(await isFormFieldEditable(page, field), `the ${field} field of the policy drawer should be editable, but the drawer renders it disabled`).toBe(true);
    await drawer.type(field, value);
  }
}

/**
 * Whether a numeric field of the policy drawer kept what was typed. The amount,
 * coinsurance and member-limit inputs are number inputs with a min / max: they
 * drop a minus sign (min >= 0), ignore letters and clamp an out-of-range value
 * on blur (0 -> 1 for the member limit, 101 -> 100 for coinsurance) - the field
 * itself prevents the value, as in the Formulary suite (2026-11-04 triage).
 * `kept` is false when the field holds anything but the typed number.
 */
export async function numberKept(drawer: PolicyFormDrawer, field: PolicyTextField, typed: string): Promise<{ kept: boolean; held: string }> {
  const held = (await drawer.getValue(field)).trim();
  const asNumber = (text: string): number => (text === '' ? NaN : Number(text.replace(/[,\s]/g, '')));
  return { kept: held === typed.trim() || asNumber(held) === asNumber(typed), held };
}

/** Edit -> Coverage Period -> the values -> Save; returns the save's answer. */
export async function editCoverageAndSave(
  page: Page,
  detail: PolicyDetailPage,
  policyId: string,
  coverage: PolicyCoverage,
): Promise<PolicySaveAnswer> {
  const drawer = await openEditAtCoverage(detail, policyId);
  await typeCoverage(page, drawer, coverage);
  return drawer.attemptSave();
}

/** Asserts a write was accepted (2xx), quoting what was answered. */
export function expectAccepted(answer: { status: number; text: string; messages?: string[] }, what = 'the save'): void {
  expect(answer.status, `${what} should be accepted: ${said(answer)}`).toBeGreaterThanOrEqual(200);
  expect(answer.status, `${what} should be accepted: ${said(answer)}`).toBeLessThan(300);
}

/** Asserts a write was refused (nothing sent, or 4xx / 5xx), quoting what was answered. */
export function expectRefused(answer: { status: number; text: string; messages?: string[] }, what = 'the save'): void {
  expect(refused(answer), `${what} should be refused, but it answered ${said(answer)}`).toBe(true);
}

/** Whether a save was refused (nothing sent, or a 4xx / 5xx). */
export const refused = (answer: { status: number }): boolean => answer.status === -1 || answer.status >= 400;

/** A save answer as one line for a message. */
export const said = (answer: { status: number; text: string; messages?: string[] }): string =>
  `${answer.status} ${answerText({ status: answer.status, text: answer.text })} ${(answer.messages ?? []).join(' | ')}`.trim();

/** The step-2 values that make a create valid: effective in 2 days, expiry 60 days later. */
export function validCoverage(overrides: PolicyCoverage = {}): PolicyCoverage {
  const effective = new Date(Date.now() + 2 * 86_400_000);
  effective.setSeconds(0, 0);
  const expiry = new Date(effective.getTime() + 60 * 86_400_000);
  return { effectiveDate: policyDateTextLocal(effective), expiryDate: policyDateTextLocal(expiry), ...overrides };
}

/** `DD/MM/YYYY HH:mm` local - as the pickers take it (PolicyProvisioning.policyDateText, inlined for the Date case). */
export function policyDateTextLocal(d: Date): string {
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** The suite plan's option label fragment for the Plan select (its name). */
export async function suitePlanName(page: Page, payerName?: string): Promise<string> {
  return (await suitePolicyPlan(page, payerName)).name;
}

// ---- members ------------------------------------------------------------------------

/** Members the picker offers that the policy does not hold yet. */
export async function freeCandidates(page: Page, policyId: string, count: number): Promise<MemberCandidate[]> {
  const held = new Set((await readPolicyMembers(page, policyId)).map((m) => m.memberId));
  return (await memberCandidates(page, policyId, 'a')).filter((c) => !held.has(c.id)).slice(0, count);
}

/** Add Member on the Members tab: searches the candidate by document id (or name), picks it, chooses the relationship, saves. */
export async function addMemberOnScreen(
  page: Page,
  members: PolicyMembersTab,
  policyId: string,
  relationship = 'Spouse',
  candidate?: MemberCandidate,
): Promise<{ candidate: MemberCandidate; answer: MemberSaveAnswer }> {
  const pick = candidate ?? (await freeCandidates(page, policyId, 1))[0];
  if (!pick) throw new Error('the member picker offers no member that is not on this policy yet');
  const term = pick.documentId && pick.documentId.length >= 2 ? pick.documentId : pick.displayNameEn;
  const drawer = await members.openAdd();
  const answer = await drawer.addMember(term, relationship, term);
  Logger.step(`[writerB] Add Member ${pick.memberCode} answered ${answer.status}`);
  return { candidate: pick, answer };
}

/** "6 / 10" -> { count: 6, limit: '10' }; "1 · Unlimited" -> { count: 1, limit: 'Unlimited' }. */
export function parseCountChip(chip: string): { count: number; limit: string } {
  const match = chip.match(/(\d+)\s*[/·]\s*(\d[\d,]*|Unlimited)/);
  return match ? { count: Number(match[1]), limit: match[2].replace(/,/g, '') } : { count: NaN, limit: '' };
}

/** A member (and the policy holding it) enrolled on a policy of ANOTHER payer - read-only lookup for 19418. */
export async function memberOfAnotherPayer(page: Page, payerId: string): Promise<{ member: PolicyMember; policy: PolicyListItem } | null> {
  const { items } = await listPolicyRegister(page, {}, 200);
  for (const policy of items.filter((p) => p.payerId !== payerId && p.memberCount > 0)) {
    const live = (await readPolicyMembers(page, policy.id).catch(() => [] as PolicyMember[])).filter((m) => m.rosterState === 'live');
    if (live[0]) return { member: live[0], policy };
  }
  return null;
}

/**
 * A members import file in the tab's own template: the template's headers,
 * one row per candidate - member number / document id / relationship filled
 * where a header names them.
 */
export function membersImportCsv(headers: readonly string[], candidates: readonly MemberCandidate[], relationship = 'Spouse'): PolicyUploadFile {
  const cell = (header: string, c: MemberCandidate): string => {
    if (/member.*(number|code|no)|رقم العضو/i.test(header)) return c.memberCode;
    if (/document|هوية/i.test(header)) return c.documentId;
    if (/relation|صلة/i.test(header)) return relationship;
    if (/name|اسم/i.test(header)) return c.displayNameEn;
    return '';
  };
  const quote = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [headers.map(quote).join(','), ...candidates.map((c) => headers.map((h) => quote(cell(h, c))).join(','))];
  return { name: `members-import-${policyStamp()}.csv`, mimeType: 'text/csv', buffer: Buffer.from(`${lines.join('\r\n')}\r\n`, 'utf8') };
}

// ---- policy writes the fixtures do not cover --------------------------------------------

/**
 * CreatePolicy for a GROUP policy with NO holder (`policyHolderId: null`) - the
 * "no policyholder assigned" precondition of 19421 / 19428. Returns the answer
 * and the new id (null when the server refused it).
 */
export async function createGroupWithoutHolder(page: Page, nameEn: string): Promise<PolicyAnswer & { id: string | null }> {
  const plan = await suitePolicyPlan(page);
  const body = {
    policyNameEn: nameEn,
    policyNameAr: arabicName(),
    planId: plan.id,
    policyHolderId: null,
    effectiveDate: minutesFromNow(2 * 24 * 60),
    expiryDate: new Date(Date.now() + 60 * 86_400_000).toISOString(),
    gracePeriodDays: null,
    maxMembers: null,
    deductibleAmount: 0,
    coinsurancePercent: 0,
    outOfPocketMaximum: 0,
    sublimitAmount: 0,
    policyTypeId: await policyTypeId(page, 'group'),
  };
  const res = await NetworkUtils.postAsSession(page, ApiEndpoints.policyCreate, body);
  let id: string | null = null;
  try { id = res.status < 300 ? ((JSON.parse(res.text) as { payload?: { id?: string } }).payload?.id ?? null) : null; } catch { id = null; }
  return { ...res, id };
}

/**
 * UpdatePolicy sent by ANOTHER session (the shaped Payer Admin) with the
 * policy's current values plus `changes` - read through the administrator's
 * page, sent through the session's.
 */
export async function updateAsSession(
  sessionPage: Page,
  adminPage: Page,
  policyId: string,
  changes: Record<string, unknown>,
): Promise<PolicyAnswer> {
  const current = await readPolicy(adminPage, policyId);
  return NetworkUtils.requestAsSession(sessionPage, 'PUT', ApiEndpoints.policyUpdate, {
    policyNameEn: current.policyNameEn,
    policyNameAr: current.policyNameAr,
    planId: current.planId,
    policyHolderId: current.policyHolderId === '00000000-0000-0000-0000-000000000000' ? null : current.policyHolderId,
    effectiveDate: current.effectiveDate,
    expiryDate: current.expiryDate,
    gracePeriodDays: current.gracePeriodDays,
    maxMembers: current.maxMembers,
    deductibleAmount: current.deductibleAmount,
    coinsurancePercent: current.coinsurancePercent,
    outOfPocketMaximum: current.outOfPocketMaximum,
    sublimitAmount: current.sublimitAmount,
    ...changes,
    id: policyId,
    concurrencyStamp: current.concurrencyStamp,
    confirmRevertToDraft: true,
  });
}

/** Stages the deletion of a PUBLISHED policy and sends it for approval ("Pending Deletion Approval"). Throws with the server's answer. */
export async function stageAndSubmitDeletion(page: Page, policyId: string): Promise<void> {
  const staged = await deletePolicy(page, policyId, true);
  if (staged.status >= 300) throw new Error(`DeletePolicy answered ${staged.status} ${answerText(staged).slice(0, 300)}`);
  const sent = await submitPolicy(page, policyId);
  if (sent.status >= 300) throw new Error(`SubmitPolicyForApproval answered ${sent.status} ${answerText(sent).slice(0, 300)}`);
}

/** What a Delete attempt did: how the screen offered it, the prompt, and the answer (through the screen when offered, else the request the screen would send). */
export interface DeleteAttempt {
  offered: Availability;
  via: 'screen' | 'request';
  prompt: string;
  status: number;
  said: string;
}

/**
 * Deletes from the policy's header when Delete is offered (prompt read, then
 * confirmed); when it is NOT offered, sends the DeletePolicy request the screen
 * would send, so the server's own rule is still observed.
 */
export async function attemptDelete(page: Page, detail: PolicyDetailPage, policyId: string): Promise<DeleteAttempt> {
  await detail.open(policyId);
  const offered = await detail.getActionAvailability('delete');
  if (offered === 'available') {
    const dialog = await detail.requestDelete();
    const prompt = `${await dialog.getTitle().catch(() => '')} ${await dialog.getMessage().catch(() => '')}`.trim();
    const answer = await NetworkUtils.captureResponse(page, ApiEndpoints.policyDelete, async () => { await dialog.confirmWithFollowUps(); });
    const messages = await detail.waitForMessages();
    const text = answer ? answerText({ status: answer.status, text: answer.text }) : 'no DeletePolicy request was sent';
    return { offered, via: 'screen', prompt, status: answer?.status ?? -1, said: [text, ...messages].join(' | ') };
  }
  const res = await deletePolicy(page, policyId, true);
  return { offered, via: 'request', prompt: '', status: res.status, said: answerText(res) };
}

/**
 * Send for Approval from the policy's header when it is offered (prompt
 * confirmed); otherwise nothing is sent (-1) and the header's text is the
 * message - a disabled control with its hint is the screen's answer then.
 */
export async function attemptSendForApproval(detail: PolicyDetailPage): Promise<{ offered: Availability; status: number; text: string; messages: string[] }> {
  const offered = await detail.getActionAvailability('submit');
  if (offered !== 'available') {
    const state = await detail.getActionState('submit');
    return { offered, status: -1, text: '', messages: [state.title, await detail.getHeaderText().catch(() => '')].filter((m) => m !== '') };
  }
  return { offered, ...(await detail.sendForApproval()) };
}

/**
 * An INACTIVE policy that was Active before it was inactivated: an Active seed
 * (policyIn('Active') - BLOCKED when none is left) inactivated, sent and
 * approved through the API. 19580 / 19585 expect a reactivation to read Active;
 * that presupposes a policy that was in force. A Future policy past its
 * effective time is not one - only the daily lifecycle job turns it Active - so
 * the earlier Future-based precondition could never show it (2026-11-04 triage).
 */
export async function inactiveFromActiveSeed(page: Page, policyIn: PolicyBuilder, spec: SuitePolicySpec = {}): Promise<ProvisionedPolicy> {
  const policy = await policyIn('Active', spec);
  try {
    const staged = await inactivatePolicy(page, policy.id);
    if (staged.status >= 300) throw new Error(`InactivatePolicy answered ${staged.status} ${answerText(staged).slice(0, 300)}`);
    await publishPolicyChange(page, policy.id, policy.nameEn);
    await waitForPolicyStatus(page, policy.id, 'inactive');
  } catch (error) {
    return blockedByPrecondition(test.info(), `the Active seed "${policy.nameEn}" inactivated and approved`, error);
  }
  return { ...policy, state: 'Inactive' };
}

/**
 * The audit entry among `entries` that records an inactivation: a STATUS_CHANGE,
 * or an UPDATE whose after-values set IsActive false with an inactivation
 * reason - live 2026-11-03 an approved inactivation is audited as UPDATE
 * (`IsActive` true -> false, `InactivationReasonId`, `InactivationDetails`,
 * `InactivatedOn`), read through the entry's own request.
 */
export async function inactivationEntry(page: Page, entries: readonly PolicyAuditEntry[]): Promise<{ entry: PolicyAuditEntry; after: Record<string, unknown> } | null> {
  for (const entry of entries) {
    if (entry.actionType === 'STATUS_CHANGE') return { entry, after: {} };
    if (entry.actionType !== 'UPDATE') continue;
    const res = await NetworkUtils.postAsSession(page, AUDIT_LOG_BY_ID_PATH, { id: entry.id });
    let after: Record<string, unknown> = {};
    try { after = JSON.parse((JSON.parse(res.text) as { payload?: { afterJson?: string } }).payload?.afterJson ?? '{}') as Record<string, unknown>; } catch { after = {}; }
    if (after.IsActive === false && (after.InactivationReasonId ?? null) !== null) return { entry, after };
  }
  return null;
}

/** Waits until `iso` lies `marginSeconds` in the past (the effective time of a short-fused policy). */
export async function waitUntilPast(page: Page, iso: string, marginSeconds = 10): Promise<void> {
  const due = Date.parse(iso) + marginSeconds * 1000;
  while (Date.now() < due) await page.waitForTimeout(Math.min(15_000, due - Date.now()));
}

/** An EXISTING Expired policy of any payer (read-only use - Expired is not reachable on demand), or null. */
export async function findExpiredPolicy(page: Page): Promise<PolicyListItem | null> {
  const codes = await policyStatusCodes(page);
  const { items } = await listPolicyRegister(page, {}, 500);
  return items.find((p) => codes[p.effectiveStatusId ?? p.statusId] === 'expired') ?? null;
}

// ---- Overview ------------------------------------------------------------------------

/** The Overview values that render as (or hold) an editable control - none should. */
export async function editableOverviewFields(page: Page): Promise<string[]> {
  return page.locator(`[id^="${POLICY_OVERVIEW_PREFIX}"]`).evaluateAll((els) => els
    .filter((el) => ['input', 'textarea', 'select'].includes(el.tagName.toLowerCase())
      || (el as HTMLElement).isContentEditable
      || !!el.querySelector('input, textarea, select, [contenteditable="true"]'))
    .map((el) => el.id));
}

/** Clicks an Overview value, types into it and presses `keys`; returns the value before and after. */
export async function typeIntoOverview(page: Page, detail: PolicyDetailPage, field: keyof typeof POLICY_DETAIL.overview, text: string, keys: string[] = []): Promise<{ before: string; after: string }> {
  const before = await detail.readOverviewField(field);
  const value = page.locator(`#${POLICY_DETAIL.overview[field]}`).last();
  await value.click({ timeout: Timeouts.short }).catch(() => undefined);
  await page.keyboard.type(text);
  for (const key of keys) await page.keyboard.press(key);
  return { before, after: await detail.readOverviewField(field) };
}

/** The writing direction an element renders in (`rtl` / `ltr`): its computed `direction`. */
export async function textDirection(page: Page, id: string): Promise<string> {
  return page.locator(`#${id}`).last().evaluate((el) => getComputedStyle(el).direction).catch(() => '');
}

/**
 * How an element's text is DRAWN: its first character's box lies right of its
 * last character's box -> 'rtl', left of it -> 'ltr' ('' when it has no text).
 * Arabic is drawn right to left by the bidi algorithm even inside a block whose
 * CSS direction is ltr - 19499 reads what the screen draws, not the CSS
 * property (2026-11-04 triage). `truncated` is true when the text overflows its box.
 */
export async function drawnDirection(page: Page, id: string): Promise<{ direction: '' | 'rtl' | 'ltr'; truncated: boolean }> {
  return page.locator(`#${id}`).last().evaluate((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) if ((node.textContent ?? '').trim() !== '') nodes.push(node as Text);
    const truncated = (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 1;
    if (nodes.length === 0) return { direction: '' as const, truncated };
    const boxOf = (node: Text, index: number): DOMRect => {
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + 1);
      return range.getBoundingClientRect();
    };
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const firstIndex = (first.textContent ?? '').search(/\S/);
    const lastIndex = (last.textContent ?? '').length - 1 - ((last.textContent ?? '').split('').reverse().join('').search(/\S/));
    if (first === last && firstIndex === lastIndex) return { direction: '' as const, truncated };
    return { direction: boxOf(first, firstIndex).left > boxOf(last, lastIndex).left ? 'rtl' as const : 'ltr' as const, truncated };
  }).catch(() => ({ direction: '' as const, truncated: false }));
}

/** Clicks through every detail tab `rounds` times without waiting between clicks. */
export async function switchTabsRapidly(page: Page, rounds: number): Promise<void> {
  const ids = Object.values(POLICY_DETAIL.tab);
  for (let round = 0; round < rounds; round += 1) {
    for (const id of ids) await page.locator(`#${id}`).click({ timeout: Timeouts.short });
  }
}

// ---- Documentation ---------------------------------------------------------------------

/** A tiny Word document (the drawer accepts `.doc` / `.docx`). */
export function sampleDocx(name = 'sample.docx'): PolicyUploadFile {
  return { name, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('automation word document')]) };
}

/** A 1x1 PNG (the drawer accepts `image/*`). */
export function samplePng(name = 'sample.png'): PolicyUploadFile {
  return { name, mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') };
}

/** An executable - not an accepted type. */
export function sampleExe(name = 'malicious.exe'): PolicyUploadFile {
  return { name, mimeType: 'application/x-msdownload', buffer: Buffer.concat([Buffer.from('MZ'), Buffer.alloc(510, 0)]) };
}

/** A PDF of exactly `bytes` bytes (header + padding + trailer). */
export function pdfOfSize(bytes: number, name: string): PolicyUploadFile {
  const head = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n');
  const tail = Buffer.from('\ntrailer<<>>\n%%EOF\n');
  const padding = Buffer.alloc(Math.max(0, bytes - head.length - tail.length), 0x20);
  return { name, mimeType: 'application/pdf', buffer: Buffer.concat([head, padding, tail]) };
}

/** GET the stored attachment (`/api/FileUpload/Download/{guid}`) as the session; its status and size. */
export async function attachmentDownload(page: Page, uri: string): Promise<{ status: number; size: number }> {
  const path = uri.startsWith('http') ? new URL(uri).pathname : uri;
  if (!path.startsWith(FILE_DOWNLOAD_PATH)) return { status: -1, size: 0 };
  const res = await NetworkUtils.requestAsSession(page, 'GET', path);
  return { status: res.status, size: res.text.length };
}

/** A documentation card's attachment link (an `a[href]` inside the card). */
export function documentLink(documents: PolicyDocumentsTab, title: string): Locator {
  return documents.card(title).locator('a[href]').first();
}

/** A documentation card's Edit control, if it has one (none live 2026-11-03). */
export function documentEditControl(documents: PolicyDocumentsTab, title: string): Locator {
  // locator-exception: an Edit control on a card would carry no id we know of; the button labelled Edit inside the card.
  return documents.card(title).locator('button, p-button').filter({ hasText: /^\s*Edit\s*$/ }).first();
}

/** Clicks a card's attachment link and returns the downloaded file's bytes, or null when nothing downloaded. */
export async function downloadFromCard(page: Page, documents: PolicyDocumentsTab, title: string): Promise<Buffer | null> {
  const link = documentLink(documents, title);
  if (!(await link.isVisible().catch(() => false))) return null;
  const downloaded = page.waitForEvent('download', { timeout: Timeouts.default }).catch(() => null);
  await link.click();
  const download = await downloaded;
  if (!download) return null;
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

// ---- approvals hub ------------------------------------------------------------------------

/** What the hub's Review drawer shows for a queued policy request. */
export interface PolicyReview {
  requestedBy: string;
  requestedOn: string;
  /** The whole drawer (name, diff, reason - whatever it renders). */
  text: string;
}

/**
 * Opens the Review drawer of the policy's queued request in the hub's Policy
 * tab (`approvals-policy-table-row-{id}-review`) and reads it. Works for a
 * request with no field diff (a deletion), which ApprovalManagementPage.openReview
 * would wait on.
 */
export async function openPolicyReview(page: Page, approvals: ApprovalManagementPage, policyName: string): Promise<PolicyReview> {
  await approvals.open();
  expect(await approvals.isInQueue(policyName), `"${policyName}" should be in the Policy approvals queue`).toBe(true);
  const row = page.locator(`tr[id^="${SCREEN.approvalsPolicy}-table-row-"]`).filter({ hasText: policyName }).first();
  const rowId = (await row.getAttribute('id')) ?? '';
  await page.locator(buttonSelector(`${rowId}-review`)).first().click();
  await expect(page.locator(`#${POLICY_APPROVAL_REVIEW.title}`), 'the Review drawer should open').toBeVisible({ timeout: Timeouts.default });
  const read = (id: string): Promise<string> => page.locator(`#${id}`).first().innerText({ timeout: Timeouts.short }).then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
  const review = {
    requestedBy: await read(POLICY_APPROVAL_REVIEW.requestedBy),
    requestedOn: await read(POLICY_APPROVAL_REVIEW.requestedOn),
    text: await read(POLICY_APPROVAL_REVIEW.root),
  };
  // Closed again so the queue's search box is reachable for an Approve / Reject that follows.
  await page.locator(buttonSelector(POLICY_APPROVAL_REVIEW.close)).first().click({ timeout: Timeouts.short }).catch(() => page.keyboard.press('Escape'));
  await page.locator(`#${POLICY_APPROVAL_REVIEW.title}`).waitFor({ state: 'hidden', timeout: Timeouts.short }).catch(() => undefined);
  return review;
}

// ---- the shaped Payer Admin -------------------------------------------------------------------

/** Opens the policy list for the shaped session, scoped to the case's payer. */
export async function openScopedPolicyList(session: PolicySession): Promise<void> {
  await session.policies.openList(POLICY_SCOPED_PAYER).catch(async () => session.policies.open());
}

/** Whether the shaped session is shown the policy in its list (a refused list counts as not shown). */
export async function isListedFor(session: PolicySession, name: string): Promise<boolean> {
  await openScopedPolicyList(session);
  return session.policies.isListed(name).catch(() => false);
}

/** A direct request as the shaped session, answered how - for the "any direct attempt is blocked" steps. */
export async function requestAs(session: PolicySession, method: 'POST' | 'PUT' | 'DELETE' | 'GET', path: string, data?: unknown): Promise<PolicyAnswer> {
  return NetworkUtils.requestAsSession(session.page, method, path, data);
}

/** The route of a policy's detail screen. */
export const policyRoute = (policyId: string, suffix = ''): string => `${AppRoutes.policyManagement}/${policyId}${suffix ? `/${suffix}` : ''}`;
