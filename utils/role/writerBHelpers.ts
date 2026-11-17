import type { Locator, Page } from '@playwright/test';
import { expect, test as pwTest } from '@playwright/test';
import { blockedByPrecondition, type TestSteps } from '../../fixtures/testStatus.fixture';
import type { SuiteRoles } from '../../fixtures/roleModule.fixture';
import type { RoleAdministrationPage } from '../../pages/role/RoleAdministrationPage';
import type { RoleFormDrawer, RoleFormValues, SaveOutcome } from '../../pages/role/RoleFormDrawer';
import type { RoleViewDrawer } from '../../pages/role/RoleViewDrawer';
import type { NodeState, PermissionTree, TreeRow } from '../../pages/role/PermissionTree';
import { ApprovalManagementPage } from '../../pages/approval/ApprovalManagementPage';
import { LanguageSwitcher } from '../../pages/components/LanguageSwitcher';
import { ROLE_FORM_IDS, ROLE_LIST_IDS, ROLE_TOAST } from '../../constants/role/roleIds';
import { WRITER_B_IDS } from '../../constants/role/writerBIds';
import { buttonSelector } from '../../constants/ElementIds';
import { Timeouts } from '../../constants/Timeouts';
import { Logger } from '../Logger';
import { arabicToken } from '../UserProvisioning';
import { deleteNetworkById, pendingRequestId, provisionNetwork, readNetwork } from '../NetworkProvisioning';
import { allRoles, permissionIdsByKeys, readRole, type RoleRecord } from './roleApi';
import { PREDEFINED_ROLE_NAMES } from '../../data/role/common.data';
import type { ValidationRule } from '../../data/role/editRole.data';

/**
 * Writer B helpers - Role Management folders 09 (Create Role, US 21288), 10 (View Role, US 21289) and 11 (Edit
 * Role, US 21290).
 *
 * Built only on the lead's shared layer (RoleAdministrationPage / RoleFormDrawer / RoleViewDrawer / PermissionTree,
 * roleApi, the role fixtures) - never edits it. Nothing here asserts a case's expectation: readers return what
 * the screen / API showed and each case asserts what IT expects, its failure message saying what was seen. The
 * branching a case needs ("next, and if the Privileges step opened, save") lives here, not in the specs.
 *
 * SAFETY: every write goes to a suite role (`suiteRoles`, "QA Automation Role ...") or to a disposable network
 * the role holder submits ("Automation Network ...", withdrawn by `withdrawSubmittedNetworks`). Predefined roles
 * are only read (`predefinedEditOffers`).
 */

// ---------------------------------------------------------------- text

/** Whitespace collapsed and dashes read as spaces - how quotes and screen texts are compared (lead decision 3). */
export function flat(text: string): string {
  return text.replace(/[–—-]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Whether `text` shows `quote` (both flattened). */
export function shows(text: string, quote: string): boolean {
  return flat(text).includes(flat(quote));
}

/** An Arabic role name: the TC's Arabic example + a unique Arabic token (lead decision 2). */
export function arabicNameFrom(stem: string): string {
  return `${stem} ${arabicToken()}`;
}

/** `n` English letters (no digits, no spaces). */
export function lettersOfLength(n: number): string {
  return `QaAutomation${'x'.repeat(Math.max(0, n))}`.slice(0, n);
}

/** A suite role name padded with letters to exactly `n` characters (the suite prefix kept). */
export function suiteNameOfLength(suiteRoles: SuiteRoles, n: number, label = 'Max'): string {
  return `${suiteRoles.newName(label)} ${'x'.repeat(n)}`.slice(0, n);
}

/** Sorted copy. */
export function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

// ---------------------------------------------------------------- BLOCKED

/**
 * steps.blocked(reason) - unless an earlier step already FAILED: then the finding stays a FAIL and the reason
 * is kept as a note (lead decision 8; the settings / notification modules' rule).
 */
export function blockUnlessAStepFailed(steps: TestSteps, reason: string): void {
  const info = pwTest.info();
  if (info.errors.length > 0) {
    info.annotations.push({ type: 'note', description: `Could not be observed either: ${reason}` });
    Logger.warn(`Not marked BLOCKED (an earlier step failed): ${reason}`);
    return;
  }
  steps.blocked(reason);
}

// ---------------------------------------------------------------- drawer reading

export interface FieldErrors {
  englishName: string;
  arabicName: string;
  allowedToAssignBy: string;
}

export async function fieldErrors(form: RoleFormDrawer): Promise<FieldErrors> {
  return {
    englishName: await form.fieldError('englishName'),
    arabicName: await form.fieldError('arabicName'),
    allowedToAssignBy: await form.fieldError('allowedToAssignBy'),
  };
}

export function noFieldErrors(errors: FieldErrors): boolean {
  return !errors.englishName && !errors.arabicName && !errors.allowedToAssignBy;
}

export function describeErrors(errors: FieldErrors): string {
  const parts = [
    errors.englishName ? `English name "${errors.englishName}"` : '',
    errors.arabicName ? `Arabic name "${errors.arabicName}"` : '',
    errors.allowedToAssignBy ? `Allowed To Assign By "${errors.allowedToAssignBy}"` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'none';
}

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** The first NEW toast ("summary detail") within `ms` after `action` ('' when none). */
export async function toastDuring(page: Page, action: () => Promise<void>, ms: number = Timeouts.toast): Promise<string> {
  const read = async (): Promise<string[]> => (await page.locator(`#${ROLE_TOAST.root}`).allInnerTexts().catch(() => [] as string[])).map(norm);
  const before = new Set(await read());
  await action();
  let found = '';
  await expect
    .poll(async () => {
      found = (await read()).find((t) => !before.has(t)) ?? '';
      return found;
    }, { timeout: ms })
    .not.toBe('')
    .catch(() => undefined);
  return found;
}

/** Everything the role drawer shows right now (whitespace collapsed). */
export async function drawerText(page: Page): Promise<string> {
  return norm(await page.locator(`#${ROLE_FORM_IDS.root}`).innerText().catch(() => ''));
}

/** What one Next showed. */
export interface NextOutcome {
  step: 1 | 2;
  toast: string;
  errors: FieldErrors;
  drawerText: string;
}

/** Clicks Next and reads the step reached, the toast and the field errors. */
export async function nextAndRead(page: Page, form: RoleFormDrawer, toastMs: number = Timeouts.toast): Promise<NextOutcome> {
  const reached: { step: 1 | 2 } = { step: 1 };
  const toast = await toastDuring(page, async () => {
    reached.step = await form.next();
  }, toastMs);
  return { step: reached.step, toast, errors: await fieldErrors(form), drawerText: await drawerText(page) };
}

export function describeNext(o: NextOutcome): string {
  return `Next -> ${o.step === 2 ? 'Privileges step' : 'stayed on Role Information'}; toast "${o.toast || 'none'}"; field errors: ${describeErrors(o.errors)}`;
}

/** Whether the outcome showed `quote` (as a toast or anywhere in the drawer). */
export function nextShows(o: NextOutcome, quote: string): boolean {
  return shows(o.toast, quote) || shows(o.drawerText, quote);
}

/** A step-1 text field the cases type into. */
export type TextField = 'englishName' | 'arabicName' | 'englishDescription';

/** What typing `typed` into a step-1 field and pressing Next showed. */
export interface TypedOutcome extends NextOutcome {
  typed: string;
  /** The value the box kept. */
  kept: string;
  /** The field's own error ('' for the descriptions - they have no error element). */
  fieldError: string;
}

/** Types into one field (the other required fields valid), reads what the box kept, then Next. */
export async function typeThenNext(page: Page, form: RoleFormDrawer, field: TextField, typed: string): Promise<TypedOutcome> {
  await form.field(field).fill(typed);
  const kept = await form.field(field).inputValue();
  const next = await nextAndRead(page, form);
  const fieldError = field === 'englishName' ? next.errors.englishName : field === 'arabicName' ? next.errors.arabicName : '';
  return { ...next, typed, kept, fieldError };
}

/** A value refused: the box did not keep it, or the field is marked and Next stayed on Role Information. */
export function valueRefused(o: TypedOutcome): boolean {
  return o.kept !== o.typed || (o.step === 1 && o.fieldError !== '');
}

/** A too-long value refused: the box kept at most `max`, or the field is marked and Next stayed on step 1. */
export function lengthRefused(o: TypedOutcome, max: number): boolean {
  return o.kept.length <= max || (o.step === 1 && o.fieldError !== '');
}

export function describeTyped(o: TypedOutcome): string {
  const kept = o.kept.length > 30 ? `${o.kept.length} characters` : `"${o.kept}"`;
  const typed = o.typed.length > 30 ? `${o.typed.length} characters` : `"${o.typed}"`;
  return `typed ${typed}, the box kept ${kept}; ${describeNext(o)}`;
}

/** Next and, when the Privileges step opened, optionally tick `privilege` and Save. */
export interface ProceedOutcome {
  next: NextOutcome;
  save: SaveOutcome | null;
}

export async function proceedAndSave(page: Page, form: RoleFormDrawer, privilege?: string): Promise<ProceedOutcome> {
  const next = await nextAndRead(page, form, Timeouts.short);
  if (next.step !== 2) return { next, save: null };
  if (privilege) await form.tree.tick(privilege);
  return { next, save: await form.save() };
}

/** Every message the proceed SHOWED on screen (toast after Next, the field errors, the toast after Save). */
export function proceedText(o: ProceedOutcome): string {
  return [o.next.toast, o.next.errors.englishName, o.next.errors.arabicName, o.next.errors.allowedToAssignBy, o.save?.toast ?? ''].filter(Boolean).join(' | ');
}

/** "got answer", never "answered NNN": the failure narrator cuts a sentence at "answered <3 digits>". */
export function describeProceed(o: ProceedOutcome): string {
  const save = o.save ? `Save got answer ${o.save.status ?? 'nothing sent'} "${o.save.apiMessage}", toast "${o.save.toast || 'none'}", drawer ${o.save.closed ? 'closed' : 'open'}` : 'no Save (the Privileges step never opened)';
  return `${describeNext(o.next)}; ${save}`;
}

/** Whether the proceed was refused (Next stayed, nothing sent, or the server said no). */
export function proceedRefused(o: ProceedOutcome): boolean {
  return o.save === null || o.save.status === null || o.save.status >= 300;
}

/** What typing a too-long value, then Next and (if the Privileges step opened) Save showed. */
export interface OverLimitAttempt {
  typed: TypedOutcome;
  save: SaveOutcome | null;
  /** Validation messages shown: the field's error, a toast after Next, a refused Save's toast. */
  messages: string[];
  /** Everything seen, for failure messages. */
  seen: string;
}

export async function attemptOverLimitSave(page: Page, form: RoleFormDrawer, field: TextField, value: string): Promise<OverLimitAttempt> {
  const typed = await typeThenNext(page, form, field, value);
  const save = typed.step === 2 ? await form.save() : null;
  const refusedToast = save && (save.status === null || save.status >= 300) ? save.toast : '';
  const messages = [typed.fieldError, typed.toast, refusedToast].filter(Boolean);
  const seen = `${describeTyped(typed)}${save ? `; Save got answer ${save.status ?? 'nothing (not sent)'} "${save.apiMessage}", toast "${save.toast || 'none'}"` : ''}`;
  return { typed, save, messages, seen };
}

/** Closes the drawer if it is still open (discarding). */
export async function closeIfOpen(form: RoleFormDrawer): Promise<void> {
  if (await form.isOpen()) await form.close('x', 'discard');
}

// ---------------------------------------------------------------- stepper / view navigation

/** The stepper parts and the step buttons of the role drawer (Add / Edit; looked for in View too). */
export function stepControls(page: Page): { stepper: Locator; step1Label: Locator; step2Label: Locator; next: Locator; back: Locator } {
  const n = WRITER_B_IDS.stepNavigation;
  return {
    stepper: page.locator(`#${n.stepper}`),
    step1Label: page.locator(`#${n.step1Label}`),
    step2Label: page.locator(`#${n.step2Label}`),
    next: page.locator(buttonSelector(n.next)).first(),
    back: page.locator(buttonSelector(n.back)).first(),
  };
}

/** The tree's own controls (Privileges step / View). */
export function treeControls(page: Page): { search: Locator; expandAll: Locator; collapseAll: Locator } {
  return {
    search: page.locator(`#${ROLE_FORM_IDS.permissionSearch}`),
    expandAll: page.locator(`#${ROLE_FORM_IDS.expandAll}`),
    collapseAll: page.locator(`#${ROLE_FORM_IDS.collapseAll}`),
  };
}

/**
 * In View Role, moves to `step` the way a stepper drawer would: the step's bullet if one is rendered, else
 * Next / Back. Returns what was used ('none' = View offers no way to move - it is one page).
 */
export async function viewMoveTo(page: Page, step: 1 | 2): Promise<'stepper' | 'button' | 'none'> {
  const n = WRITER_B_IDS.stepNavigation;
  const bullet = page.locator(`#${step === 2 ? n.step2Bullet : n.step1Bullet}`);
  if (await bullet.isVisible().catch(() => false)) {
    await bullet.click();
    return 'stepper';
  }
  const button = page.locator(buttonSelector(step === 2 ? n.next : n.back)).first();
  if (await button.isVisible().catch(() => false)) {
    await button.click();
    return 'button';
  }
  return 'none';
}

// ---------------------------------------------------------------- tree

/** Rows that are NOT at the top level (a collapsed tree shows none). */
export function rowsBelowTop(rows: readonly TreeRow[]): TreeRow[] {
  return rows.filter((r) => r.depth > 0);
}

/** Branch rows that are not expanded. */
export function collapsedBranches(rows: readonly TreeRow[]): TreeRow[] {
  return rows.filter((r) => r.isBranch && r.expanded === false);
}

/** Rows whose checkbox is not in `state`. */
export function rowsNotIn(rows: readonly TreeRow[], state: NodeState): TreeRow[] {
  return rows.filter((r) => r.state !== state);
}

/** Rows whose checkbox is enabled. */
export function enabledRows(rows: readonly TreeRow[]): TreeRow[] {
  return rows.filter((r) => !r.disabled);
}

/** Headings whose "(x/y)" is not "(y/y)" (full) / not "(0/y)" (empty). */
export function headingsNot(rows: readonly TreeRow[], want: 'full' | 'empty'): TreeRow[] {
  return rows.filter((r) => r.depth === 0 && (!r.count || (want === 'full' ? r.count.selected !== r.count.total : r.count.selected !== 0)));
}

/**
 * Rows a search for `pattern` should not have left: neither matching themselves, nor an ancestor of a match
 * (shown to reach it), nor below a matching branch.
 */
export function rowsOutsideSearch(rows: readonly TreeRow[], pattern: RegExp): TreeRow[] {
  const match = rows.map((r) => pattern.test(r.label));
  return rows.filter((r, i) => {
    if (match[i]) return false;
    let depth = r.depth;
    for (let j = i - 1; j >= 0 && depth > 0; j -= 1) {
      if (rows[j].depth < depth) {
        if (match[j]) return false;
        depth = rows[j].depth;
      }
    }
    for (let j = i + 1; j < rows.length && rows[j].depth > r.depth; j += 1) if (match[j]) return false;
    return true;
  });
}

/** "label (x/y) [state]" of up to `max` rows. */
export function describeRows(rows: readonly TreeRow[], max = 12): string {
  if (!rows.length) return 'none';
  const shown = rows.slice(0, max).map((r) => `${r.label}${r.count ? ` (${r.count.selected}/${r.count.total})` : ''} [${r.state}${r.disabled ? ', disabled' : ''}]`);
  return `${shown.join('; ')}${rows.length > max ? ` ... and ${rows.length - max} more` : ''}`;
}

/** Clicks a node's checkbox with a native click (a disabled box ignores it) and reads its state before / after. */
export async function tryToToggle(page: Page, tree: PermissionTree, key: string): Promise<{ key: string; before: NodeState; after: NodeState }> {
  const before = await tree.stateOf(key);
  const row = await tree.rowOf(key);
  await row.locator('input[type="checkbox"]').first().evaluate((input) => (input as HTMLInputElement).click());
  await page.waitForTimeout(400); // a state change would render at once; this only lets it land
  return { key, before, after: await tree.stateOf(key) };
}

/** Unticks every module a role's rights belong to (Edit: leaves nothing ticked). */
export async function clearModulesOf(tree: PermissionTree, rights: readonly string[]): Promise<void> {
  await tree.expandAll();
  for (const moduleKey of new Set(rights.map((k) => k.split('.')[0]))) await tree.untick(moduleKey);
}

// ---------------------------------------------------------------- View / Edit snapshots

export type FormValues = Awaited<ReturnType<RoleFormDrawer['readValues']>>;

export interface EditSnapshot {
  values: FormValues;
  checked: string[];
}

/** Search the role, open Edit. */
export async function openEditOf(roleAdmin: RoleAdministrationPage, role: { id: string; name: string }): Promise<RoleFormDrawer> {
  await roleAdmin.search(role.name);
  return roleAdmin.openEdit(role.id);
}

/** Search the role, open View. */
export async function openViewOf(roleAdmin: RoleAdministrationPage, role: { id: string; name: string }): Promise<RoleViewDrawer> {
  await roleAdmin.search(role.name);
  return roleAdmin.openView(role.id);
}

/** Opens Edit, reads step 1 and the ticked privileges of step 2, closes WITHOUT saving. */
export async function editSnapshot(roleAdmin: RoleAdministrationPage, role: { id: string; name: string }): Promise<EditSnapshot> {
  const form = await openEditOf(roleAdmin, role);
  const values = await form.readValues();
  await form.nextToPrivileges();
  await form.tree.expandAll();
  const checked = sorted(await form.tree.checkedKeys());
  await form.close('x', 'discard');
  return { values, checked };
}

/** The ticked privileges View Role shows (expanded first). */
export async function viewChecked(view: RoleViewDrawer): Promise<string[]> {
  await view.tree.expandAll();
  return sorted(await view.tree.checkedKeys());
}

/** View labels the comparison needs. */
export interface ViewLabels {
  allowedToAssignBy: string;
  isActive: string;
  hasAssignedPayers: string;
  canApproveOwnRequests: string;
}

/**
 * What Edit shows that View does not: every non-empty text value of Edit must be a View value, Allowed To Assign
 * By the same names, each checkbox a Yes / No row under its label.
 */
export function viewGaps(edit: FormValues, view: Record<string, string>, labels: ViewLabels, yesNo: { yes: string; no: string }): string[] {
  const shown = Object.values(view);
  const gaps: string[] = [];
  const text: [string, string][] = [
    ['English name', edit.nameEn],
    ['Arabic name', edit.nameAr],
    ['English description', edit.descriptionEn],
    ['Arabic description', edit.descriptionAr],
  ];
  for (const [what, value] of text) if (value && !shown.includes(value)) gaps.push(`${what} "${value}" not shown`);
  const viewAssigners = sorted((view[labels.allowedToAssignBy] ?? '').split(/\s*,\s*/).filter(Boolean));
  if (JSON.stringify(viewAssigners) !== JSON.stringify(sorted(edit.allowedToAssignBy))) {
    gaps.push(`Allowed To Assign By shows "${viewAssigners.join(', ')}" instead of "${sorted(edit.allowedToAssignBy).join(', ')}"`);
  }
  const flags: [string, boolean][] = [
    [labels.isActive, edit.isActive],
    [labels.hasAssignedPayers, edit.hasAssignedPayers],
    [labels.canApproveOwnRequests, edit.canApproveOwnRequests],
  ];
  for (const [label, on] of flags) {
    const want = on ? yesNo.yes : yesNo.no;
    if (view[label] !== want) gaps.push(`"${label}" shows ${view[label] === undefined ? 'no row' : `"${view[label]}"`} instead of "${want}"`);
  }
  return gaps;
}

/** Of `ids`, the controls rendered in the drawer that a user could still change (text editable / box enabled). */
export async function changeableControls(page: Page, ids: readonly string[]): Promise<string[]> {
  const out: string[] = [];
  for (const id of ids) {
    const loc = page.locator(`#${id}`);
    if ((await loc.count()) === 0) continue;
    const input = loc.first();
    const tag = await input.evaluate((e) => e.tagName.toLowerCase());
    const changeable = tag === 'input' || tag === 'textarea' ? await input.isEditable().catch(() => false) : await input.isEnabled().catch(() => false);
    if (changeable) out.push(id);
  }
  return out;
}

/** Button ids in View Role that would save / apply / move to a step. */
export async function writeButtonsIn(view: RoleViewDrawer): Promise<string[]> {
  const ids = await view.buttonIds();
  return ids.filter((id) => (WRITER_B_IDS.writeButtons as readonly string[]).includes(id) || WRITER_B_IDS.writeButtonFragments.some((f) => id.toLowerCase().includes(f)));
}

// ---------------------------------------------------------------- row actions

export interface ActionAttempt {
  action: 'view' | 'edit';
  present: boolean;
  enabled: boolean;
  /** The drawer opened after the click. */
  opened: boolean;
  title: string;
}

/** Tries a row's View / Edit: present? enabled? does a drawer open (closed again, discarding)? */
export async function attemptRowAction(roles: RoleAdministrationPage, id: string, action: 'view' | 'edit'): Promise<ActionAttempt> {
  const loc = roles.action(id, action);
  const present = (await loc.count()) > 0 && (await loc.isVisible().catch(() => false));
  const enabled = present && (await loc.isEnabled().catch(() => false));
  let opened = false;
  let title = '';
  if (enabled) {
    await loc.click();
    opened = await roles.form.titleLocator().waitFor({ state: 'visible', timeout: Timeouts.short }).then(() => true, () => false);
    if (opened) {
      title = await roles.form.title();
      await roles.form.close('x', 'discard');
    }
  }
  return { action, present, enabled, opened, title };
}

export function describeAttempt(a: ActionAttempt): string {
  return `${a.action} ${a.present ? (a.enabled ? 'offered and enabled' : 'shown but disabled') : 'not offered'}${a.opened ? `, the click opened "${a.title}"` : ''}`;
}

/** As a session whose list may be refused: the row's action attempt, or "not offered" when the list did not load. */
export async function attemptOnListedRole(roles: RoleAdministrationPage, role: { id: string; name: string }, action: 'view' | 'edit'): Promise<ActionAttempt & { listShown: boolean }> {
  await roles.navigate();
  const listShown = await roles.isListShown();
  if (!listShown) return { action, present: false, enabled: false, opened: false, title: '', listShown };
  await roles.waitForRows();
  await roles.search(role.name);
  return { ...(await attemptRowAction(roles, role.id, action)), listShown };
}

/** The list's Add Role button. */
export function addRoleButton(roles: RoleAdministrationPage): Locator {
  return roles.button(ROLE_LIST_IDS.addButton);
}

/**
 * The three predefined roles: whether Edit is offered on their table row and on their card (read only - nothing
 * is clicked). The cards view is a server-side preference of careconnect: always switched back.
 */
export async function predefinedEditOffers(roleAdmin: RoleAdministrationPage, page: Page): Promise<{ role: string; table: string[]; card: string[] }[]> {
  const listed = await allRoles(page);
  const roles = PREDEFINED_ROLE_NAMES.map((name) => ({ name, id: listed.find((r) => r.name === name)?.id ?? '' }));
  const out = roles.map((r) => ({ role: r.name, table: [] as string[], card: [] as string[] }));
  for (const [i, r] of roles.entries()) {
    if (!r.id) continue;
    await roleAdmin.search(r.name);
    out[i].table = (await roleAdmin.rowActions(r.id)).map((a) => `${a.action}${a.enabled ? '' : ' (disabled)'}`);
  }
  await roleAdmin.switchToCards();
  try {
    for (const [i, r] of roles.entries()) {
      if (!r.id) continue;
      await roleAdmin.search(r.name);
      out[i].card = (await roleAdmin.cardActions(r.id)).map((a) => `${a.action}${a.enabled ? '' : ' (disabled)'}`);
    }
  } finally {
    await roleAdmin.switchToTable(); // careconnect's stored view preference - always put the table back
  }
  return out;
}

// ---------------------------------------------------------------- data the cases need

/** A single English letter no listed role is named (22104 - so uniqueness cannot refuse it). */
export async function unusedLetter(page: Page): Promise<string> {
  const names = new Set((await allRoles(page)).map((r) => r.name.toLowerCase()));
  const letter = 'QZXJKVWYUP'.split('').find((c) => !names.has(c.toLowerCase()));
  if (!letter) throw new Error('every candidate one-letter role name is already taken');
  return letter;
}

/**
 * A suite role saved through the API with an EMPTY Allowed To Assign By (22102's "previously incomplete required
 * field"). BLOCKS the case with the answer when the API refuses it.
 */
export async function createRoleWithoutAssigner(page: Page, suiteRoles: SuiteRoles, label: string, rights: readonly string[]): Promise<{ id: string; name: string; record: RoleRecord }> {
  const name = suiteRoles.newName(label);
  try {
    const res = await suiteRoles.createRaw({ name, assignableRoleIds: [], selectedPermissionIds: await permissionIdsByKeys(page, rights, await suiteRoles.catalogue()) });
    if (res.status >= 300 || !res.id) throw new Error(`CreateRole with an empty Allowed To Assign By answered ${res.status}: ${res.text.slice(0, 200)}`);
    const record = await readRole(page, res.id);
    if (!record) throw new Error(`GetRole ${res.id} found nothing after CreateRole`);
    return { id: res.id, name, record };
  } catch (error) {
    return blockedByPrecondition(pwTest.info(), 'a suite role saved with an empty Allowed To Assign By', error);
  }
}

// ---------------------------------------------------------------- 22088: payer picker

/** Ids in the role drawer that look like a payer selection control (the Has Assigned Payers? box excluded). */
export async function payerControlIds(page: Page): Promise<string[]> {
  return page.locator(`#${ROLE_FORM_IDS.root}`).locator('[id]').evaluateAll(
    (els, args) =>
      els
        .map((e) => e.id)
        .filter((id) => id.toLowerCase().includes(args.fragment) && !args.skip.some((s) => id.startsWith(s)) && !id.startsWith('role-form-drawer-permission-')),
    { fragment: WRITER_B_IDS.payerControlFragment, skip: [...WRITER_B_IDS.hasAssignedPayersIds] },
  );
}

/** Chooses `payerName` in the drawer's payer control; throws naming what the drawer offers when there is none. */
export async function choosePayerInForm(page: Page, form: RoleFormDrawer, payerName: string): Promise<void> {
  const ids = await payerControlIds(page);
  const host = ids.find((id) => /select|multiselect|dropdown|payer-ids|payers/.test(id));
  if (!host) throw new Error(`the Add Role drawer offers no payer selection control (ids with "payer": ${ids.join(', ') || 'none'})`);
  await page.locator(`#${host}`).first().click();
  await page.getByRole('option').filter({ hasText: payerName }).first().click();
  await form.titleLocator().click();
}

// ---------------------------------------------------------------- 22080: the Arabic UI

/** Runs `body` with the session's UI in Arabic and ALWAYS switches back to English. */
export async function inArabicUi<T>(page: Page, body: () => Promise<T>): Promise<T> {
  const language = new LanguageSwitcher(page);
  await language.switchTo('ar');
  try {
    return await body();
  } finally {
    await language.switchTo('en');
  }
}

// ---------------------------------------------------------------- 22089: the holder's own request

/** Disposable networks the holder submitted (id -> name), withdrawn by `withdrawSubmittedNetworks`. */
const submittedNetworks = new Map<string, string>();

/**
 * The holder (its own session) creates a disposable network effective in two days and SUBMITS it; the request id
 * is read through careconnect. BLOCKS the case (unless a step already failed) when the holder cannot submit.
 */
export async function holderSubmitsNetwork(steps: TestSteps, holderPage: Page, adminPage: Page): Promise<{ id: string; name: string; requestId: string }> {
  try {
    const network = await provisionNetwork(holderPage, { submitOnly: true, effectiveInMinutes: 2 * 24 * 60 });
    submittedNetworks.set(network.id, network.name);
    const requestId = await pendingRequestId(adminPage, network.name);
    if (!requestId) throw new Error(`no pending approval request found for the submitted network "${network.name}"`);
    Logger.step(`[B] The holder submitted "${network.name}" - approval request ${requestId}`);
    return { id: network.id, name: network.name, requestId };
  } catch (error) {
    blockUnlessAStepFailed(steps, `the role holder could not submit a request for approval (a disposable network): ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
    throw error;
  }
}

/** afterEach: withdraws (DeleteNetwork, careconnect) every network the holder submitted that is still pending. */
export async function withdrawSubmittedNetworks(adminPage: Page): Promise<void> {
  for (const [id, name] of [...submittedNetworks]) {
    const record = await readNetwork(adminPage, id).catch(() => null);
    if (record?.isPendingCreate) {
      const res = await deleteNetworkById(adminPage, id).catch((e: unknown) => ({ status: 0, text: String(e) }));
      Logger.step(`[B] Withdrew the submitted network "${name}" (${res.status})`);
    }
    submittedNetworks.delete(id);
  }
}

/**
 * The actions the Network approvals tab offers on the request of `entityName` in `page`'s session.
 * `mustBeQueued` waits for the row (the reviewer's baseline); otherwise an absent row is reported as such.
 */
export async function networkRequestActions(page: Page, entityName: string, mustBeQueued: boolean): Promise<{ queued: boolean; actions: string[] }> {
  const approvals = new ApprovalManagementPage(page, 'network');
  await approvals.open();
  if (mustBeQueued) return { queued: true, actions: await approvals.getRowActionKeys(entityName) };
  const queued = await approvals.isInQueue(entityName);
  return { queued, actions: queued ? await approvals.getRowActionKeys(entityName) : [] };
}

// ---------------------------------------------------------------- 22113: Add vs Edit validations

/** What triggering one validation showed. */
export interface RuleOutcome {
  step: 1 | 2;
  errors: string;
  /** The known messages the drawer showed after the action. */
  messages: string[];
  toast: string;
  /** The value the changed box kept (length for long values). */
  kept: string;
  /** The Save answer status (null = no Save / nothing sent). */
  status: number | null;
}

export function describeRule(o: RuleOutcome): string {
  return `step ${o.step}, field errors ${o.errors}, messages [${o.messages.join(' / ') || 'none'}], toast "${o.toast || 'none'}", kept ${o.kept || '-'}, save ${o.status ?? 'none'}`;
}

/** Comparable form of an outcome. */
export function ruleKey(o: RuleOutcome): string {
  return [o.step, o.errors, o.messages.join('/'), flat(o.toast), o.kept, o.status ?? 'none'].join(' # ');
}

export type RuleTarget =
  | { mode: 'add'; base: RoleFormValues; privilege: string }
  | { mode: 'edit'; role: { id: string; name: string }; rights: readonly string[] };

const fieldOf = { nameEn: 'englishName', nameAr: 'arabicName', descriptionEn: 'englishDescription' } as const;

/**
 * Opens Add (with valid `base` values) or Edit (the suite role), triggers ONE rule the way a user would, reads
 * the outcome, closes the drawer (discarding). `duplicateName` = the English name of another suite role;
 * `knownMessages` = texts whose presence in the drawer is recorded.
 */
export async function triggerRule(page: Page, roleAdmin: RoleAdministrationPage, rule: ValidationRule, target: RuleTarget, duplicateName: string, knownMessages: readonly string[]): Promise<RuleOutcome> {
  const form = target.mode === 'add' ? await roleAdmin.openAdd() : await openEditOf(roleAdmin, target.role);
  if (target.mode === 'add') await form.fill(target.base);
  let kept = '';
  let status: number | null = null;
  let toast = '';
  let step: 1 | 2 = 1;
  if (rule.kind === 'step1' || rule.kind === 'allowedToAssignBy') {
    if (rule.kind === 'step1') {
      await form.field(fieldOf[rule.field]).fill(rule.value);
      const value = await form.field(fieldOf[rule.field]).inputValue();
      kept = value.length > 30 ? `${value.length} characters` : `"${value}"`;
    } else {
      await form.chooseAllowedToAssignBy([]);
      kept = `[${(await form.readAllowedToAssignBy()).join(', ')}]`;
    }
    const next = await nextAndRead(page, form, Timeouts.short);
    step = next.step;
    toast = next.toast;
  } else {
    if (rule.kind === 'duplicateName') await form.fill({ nameEn: duplicateName });
    const next = await nextAndRead(page, form, Timeouts.short);
    step = next.step;
    toast = next.toast;
    if (step === 2) {
      if (rule.kind === 'noPrivilege' && target.mode === 'edit') await clearModulesOf(form.tree, target.rights);
      if (rule.kind === 'duplicateName' && target.mode === 'add') await form.tree.tick(target.privilege);
      const save = await form.save();
      status = save.status;
      toast = save.toast || save.apiMessage;
    }
  }
  const errors = describeErrors(await fieldErrors(form));
  const text = await drawerText(page);
  const messages = knownMessages.filter((m) => shows(text, m));
  await closeIfOpen(form);
  return { step, errors, messages, toast, kept, status };
}

/**
 * Triggers every rule in Add Role (fresh valid values from `addBase()` each time) and in Edit Role (the suite
 * role) and returns one line per rule whose two outcomes differ ([] = Edit applies the same validations).
 */
export async function rulesDifferingInEdit(
  page: Page,
  roleAdmin: RoleAdministrationPage,
  rules: readonly ValidationRule[],
  addBase: () => RoleFormValues,
  privilege: string,
  edit: { role: { id: string; name: string }; rights: readonly string[] },
  duplicateName: string,
  knownMessages: readonly string[],
): Promise<string[]> {
  const mismatches: string[] = [];
  for (const rule of rules) {
    const add = await triggerRule(page, roleAdmin, rule, { mode: 'add', base: addBase(), privilege }, duplicateName, knownMessages);
    const inEdit = await triggerRule(page, roleAdmin, rule, { mode: 'edit', role: edit.role, rights: edit.rights }, duplicateName, knownMessages);
    Logger.step(`[B] ${rule.title}: Add [${describeRule(add)}] / Edit [${describeRule(inEdit)}]`);
    if (ruleKey(add) !== ruleKey(inEdit)) mismatches.push(`${rule.title}: Add [${describeRule(add)}] vs Edit [${describeRule(inEdit)}]`);
  }
  return mismatches;
}
