import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { Timeouts } from '../../constants/Timeouts';
import {
  ANNOUNCEMENT_DRAWER,
  ANNOUNCEMENT_RESCHEDULE,
  ANNOUNCEMENT_VIEW,
  NC_DIALOG,
  NC_FORM,
  TRIGGER_DRAWER,
  type FormTab,
} from '../../constants/notification/notificationIds';
import { Logger } from '../../utils/Logger';
import { TOAST } from '../../constants/ElementIds';
import { riyadhDate, riyadhTime } from '../../utils/JobClock';
import { chooseSelectOption, readSelectOptions, setCheckbox } from '../components/PrimeControls';

/**
 * The Notification Center drawers (foundation 2026-11-11). Shared shape,
 * namespace `nc-<tab>-form-drawer`:
 *
 *   stepper (Trigger: 1 General / 2 Content; App Notification: 1 General / 2 Content / 3 Audiences;
 *   Announcement: 1 General / 2 Audiences), back ("Cancel" on step 1), next, save, close (X).
 *   Next with empty required fields: toast "Please fill Name, Module and Action." (triggers +
 *   definitions) / "Please fill Name, English message, Arabic message and Publish date/time."
 *   (announcements) and "This field is required." under each field.
 *   Closing a dirty drawer (X or Escape!) -> pbm-dialog "Unsaved Changes" (Keep Editing / Discard Changes).
 *   NEVER press Escape inside a drawer - it closes the drawer (and raises the dialog).
 *   Audiences (definitions, announcements): "Add audience" adds a card (type Users / Roles); the card's
 *   "Assign" opens a pick list (Available / Selected, search boxes, move buttons, Save / Cancel).
 *   Saving answers the toast "Saved successfully." (or the server's message).
 */
export interface DrawerSaveOutcome {
  /** HTTP status of the Create/Update request, or null when none left the browser (client validation). */
  status: number | null;
  /** The request body sent (parsed), or null. */
  sent: Record<string, unknown> | null;
  /** The raw answer text. */
  answer: string;
  /** The toast text seen ('' when none). */
  toast: string;
  /** Whether the drawer was still open after the save settled. */
  drawerOpen: boolean;
}

const SAVE_API: Record<FormTab, RegExp> = {
  triggers: /\/TriggersConfiguration\/(CreateTrigger|UpdateTrigger)/,
  definitions: /\/NotificationDefinition\/(CreateDefinition|UpdateDefinition)/,
  announcements: /\/Announcement\/(CreateAnnouncement|UpdateAnnouncement)/,
};

export class NcFormDrawer extends BasePage {
  constructor(page: Page, readonly tab: FormTab) {
    super(page);
  }

  el(key: keyof typeof NC_FORM.part): Locator {
    return this.byId(NC_FORM.id(this.tab, NC_FORM.part[key]));
  }

  byPart(part: string): Locator {
    return this.byId(NC_FORM.id(this.tab, part));
  }

  private combo(l: Locator): Locator {
    return l.locator('xpath=descendant-or-self::*[@role="combobox"]').first();
  }

  async isOpen(timeout = 500): Promise<boolean> {
    return this.el('close').waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
  }

  async waitForOpen(): Promise<void> {
    await expect(this.el('close'), `the ${this.tab} drawer should open`).toBeVisible({ timeout: Timeouts.default });
  }

  /** The drawer's own text (title, steps, labels, errors) - whitespace collapsed. */
  async text(): Promise<string> {
    return (await this.el('root').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** The title line ("Add New Trigger", "Edit Trigger", "Create", ...). */
  async title(): Promise<string> {
    return (await this.el('root').innerText().catch(() => '')).split('\n').map((s) => s.trim()).find(Boolean) ?? '';
  }

  /** The step number shown as active (1-based), read from the stepper's aria/state classes. */
  async activeStep(): Promise<number> {
    const n = await this.el('stepper').locator('li').evaluateAll((lis) => lis.findIndex((li) => /active|current/i.test(li.className) || li.getAttribute('aria-current') === 'step'));
    return n + 1;
  }

  stepBullet(n: number): Locator {
    return this.byPart(`stepper-step-${n}-bullet`);
  }

  /** Clicks Next; answers the toast that appeared ('' when none). */
  async next(): Promise<string> {
    await this.btn(NC_FORM.id(this.tab, NC_FORM.part.next)).click();
    return this.toastSoon();
  }

  async back(): Promise<void> {
    await this.btn(NC_FORM.id(this.tab, NC_FORM.part.back)).click();
  }

  /** A field's inline error under it ('' when none): `<field>-error`. */
  async fieldError(field: string): Promise<string> {
    const l = this.byPart(`${field}-error`);
    return (await l.isVisible().catch(() => false)) ? (await l.innerText()).trim() : '';
  }

  /** Every inline error text in the drawer, in DOM order. */
  async allErrors(): Promise<string[]> {
    const prefix = NC_FORM.id(this.tab, '');
    return this.page.locator(`[id^="${prefix}"][id$="-error"]`).evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => (e.textContent ?? '').trim()));
  }

  async toastSoon(timeout = 2_500): Promise<string> {
    return this.isToastVisible(timeout).then(async (v) => (v ? (await this.getToastMessage()).replace(/\s+/g, ' ') : ''));
  }

  selectOf(part: string): Locator {
    return this.combo(this.byPart(part));
  }

  async choose(part: string, label: string): Promise<void> {
    await chooseSelectOption(this.page, this.selectOf(part), label);
  }

  async options(part: string): Promise<string[]> {
    return readSelectOptions(this.page, this.selectOf(part));
  }

  /** The text a select shows ('' when empty / placeholder). */
  async selected(part: string): Promise<string> {
    return (await this.byPart(part).innerText().catch(() => '')).trim();
  }

  async setActive(value: boolean): Promise<void> {
    await setCheckbox(this.el('isActive').locator('xpath=descendant-or-self::input').first(), value);
  }

  /** Clicks Save and reports what happened (asserts nothing). */
  async save(): Promise<DrawerSaveOutcome> {
    Logger.step(`[${this.tab} drawer] Save`);
    const request = this.page.waitForResponse((r) => SAVE_API[this.tab].test(r.url()), { timeout: 8_000 }).catch(() => null);
    // A client-side refusal sends nothing, and its toast ("At least one English message template is
    // required.") is gone before the 8 s response wait ends (smoke 1, 21915) - so the first NEW toast is
    // caught while the request is awaited, and used when no request left the browser. Toasts already on
    // screen (an earlier attempt's, smoke 2 / 21580) are marked first so they are not taken for this one.
    // locator-exception: the toasts share one id; every toast on screen now is marked as seen.
    await this.page.locator(`[id="${TOAST.root}"]`).evaluateAll((els) => els.forEach((e) => e.setAttribute('data-qa-seen', '1'))).catch(() => undefined);
    // locator-exception: the toasts share one id; ":not([data-qa-seen])" keeps only toasts raised after the click.
    const fresh = this.page.locator(`[id="${TOAST.root}"]:not([data-qa-seen])`).first();
    await this.btn(NC_FORM.id(this.tab, NC_FORM.part.save)).click();
    const early = fresh
      .waitFor({ state: 'visible', timeout: 8_000 })
      .then(async () => (await fresh.innerText().catch(() => '')).replace(/\s+/g, ' ').trim())
      .catch(() => '');
    const r = await request;
    let sent: Record<string, unknown> | null = null;
    try {
      sent = r ? (JSON.parse(r.request().postData() ?? 'null') as Record<string, unknown>) : null;
    } catch {
      sent = null;
    }
    const toast = (await early) || (await this.toastSoon(r ? Timeouts.toast : 2_500));
    const drawerOpen = await this.el('close').isVisible().catch(() => false);
    return { status: r?.status() ?? null, sent, answer: (await r?.text().catch(() => '')) ?? '', toast, drawerOpen };
  }

  /** X. When the Unsaved Changes dialog appears, answers it (`discard` default). Returns the dialog text, or null when none appeared. */
  async close(answer: 'discard' | 'stay' = 'discard'): Promise<{ title: string; message: string } | null> {
    await this.el('close').click();
    const shown = await this.byId(NC_DIALOG.title).waitFor({ state: 'visible', timeout: 2_000 }).then(() => true).catch(() => false);
    if (!shown) return null;
    const seen = { title: (await this.byId(NC_DIALOG.title).innerText()).trim(), message: (await this.byId(NC_DIALOG.message).innerText()).trim() };
    await this.btn(NC_DIALOG.action(answer)).click();
    return seen;
  }

  // ---- Preview / Manage Variables (triggers + definitions) ---------------------------

  /** Reads the Preview dialog opened by `button` and closes it. */
  async previewVia(button: Locator): Promise<string> {
    await button.click();
    await expect(this.byId(NC_DIALOG.title), 'the Preview dialog should open').toBeVisible({ timeout: Timeouts.default });
    const text = (await this.byId(NC_DIALOG.message).innerText()).trim();
    await this.btn(NC_DIALOG.action('close')).click();
    await expect(this.byId(NC_DIALOG.title)).toBeHidden({ timeout: Timeouts.default });
    return text;
  }

  async openVariables(): Promise<void> {
    await this.el('manageVariables').click();
    await expect(this.byPart('variables-back-button'), 'Manage Variables should open').toBeVisible({ timeout: Timeouts.default });
  }

  variable(name: string, field: 'sample-value-input' | 'description-input' | 'use-as-default-checkbox' | 'is-required-checkbox' | 'is-sensitive-checkbox' | string): Locator {
    return this.byPart(`variable-${name.toLowerCase()}${field ? `-${field}` : ''}`);
  }

  /** Names of the variables listed in Manage Variables. */
  async variableNames(): Promise<string[]> {
    const prefix = NC_FORM.id(this.tab, 'variable-');
    return this.page.locator(`[id^="${prefix}"]:not([id*="-input"]):not([id*="-checkbox"]):not([id*="-select"])`).evaluateAll((els) => els.map((e) => (e.textContent ?? '').split('\n')[0].trim()).filter(Boolean));
  }

  async variablesBack(): Promise<void> {
    await this.byPart('variables-back-button').click();
  }

  async variablesSave(): Promise<string> {
    await this.btn(NC_FORM.id(this.tab, 'variables-save-button')).click();
    return this.toastSoon();
  }

  /** Right-clicks `field`, returns the Insert-variable menu's variable names and closes the menu again. */
  async insertVariableMenu(field: Locator): Promise<string[]> {
    await field.click({ button: 'right' });
    const prefix = NC_FORM.id(this.tab, 'insert-variable-');
    await this.page.locator(`[id^="${prefix}"]`).first().waitFor({ state: 'visible', timeout: Timeouts.default });
    const names = await this.page.locator(`[id^="${prefix}"]`).evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim().replace(/^\{\{|\}\}$/g, '')));
    await this.closeInsertVariableMenu();
    return names;
  }

  /**
   * Dismisses an open Insert-variable menu the way a user does: a click outside it. Left open, its
   * full-screen backdrop swallows every later click (smoke 1, 21906: the drawer's X was "intercepted").
   */
  async closeInsertVariableMenu(): Promise<void> {
    const items = this.page.locator(`[id^="${NC_FORM.id(this.tab, 'insert-variable-')}"]`);
    if (!(await items.first().isVisible().catch(() => false))) return;
    // locator-exception: the menu's backdrop carries no id; clicking it (top-left, away from the menu) closes the menu.
    await this.page.locator('.nc-ctx__backdrop').first().click({ position: { x: 5, y: 5 } });
    await expect(items.first(), 'the Insert variable menu should close').toBeHidden({ timeout: Timeouts.default });
  }

  /** Clicks a variable in the open Insert-variable menu (inserts at the cursor). */
  async insertVariable(name: string): Promise<void> {
    await this.byPart(`insert-variable-${name.toLowerCase()}`).click();
  }

  // ---- Audiences (definitions + announcements) ---------------------------------------

  audienceCard(idx: number, part: 'type-select' | 'remove-button' | 'assign-button'): Locator {
    return this.byPart(`audience-idx-${idx}-${part}`);
  }

  async addAudience(type: 'Users' | 'Roles'): Promise<number> {
    const prefix = NC_FORM.id(this.tab, 'audience-idx-');
    const before = await this.page.locator(`[id^="${prefix}"][id$="-type-select"]`).count();
    await this.el('addAudience').click();
    await expect(this.audienceCard(before, 'type-select')).toBeVisible({ timeout: Timeouts.default });
    await chooseSelectOption(this.page, this.combo(this.audienceCard(before, 'type-select')), type);
    return before;
  }

  /** The type options a NEW card would offer (adds a card, reads, leaves it). */
  async audienceTypeOptions(idx: number): Promise<string[]> {
    return readSelectOptions(this.page, this.combo(this.audienceCard(idx, 'type-select')));
  }

  picklist(part: string): Locator {
    return this.byPart(`assign-picklist-${part}`);
  }

  /**
   * Opens the card's Assign window, moves each `names` entry from Available to
   * Selected (searching for it first) and saves. Names are the DISPLAY names
   * ("CareConnect Admin User" = careconnect, "Payer Admin" = maalmohammad).
   */
  async assign(idx: number, names: readonly string[]): Promise<void> {
    await this.audienceCard(idx, 'assign-button').click();
    await expect(this.picklist('source-list'), 'the Assign window should open').toBeVisible({ timeout: Timeouts.default });
    for (const name of names) {
      await this.picklist('source-search-input').fill(name);
      const item = this.page.locator(`[id^="${NC_FORM.id(this.tab, 'assign-picklist-source-item-')}"]`).filter({ hasText: name }).first();
      await item.click();
      await this.picklist('move-selected-to-target').click();
      await expect(this.picklist('target-list')).toContainText(name, { timeout: Timeouts.default });
    }
    await this.picklist('source-search-input').fill('');
    await this.btn(NC_FORM.id(this.tab, 'assign-save-button')).click();
    await expect(this.picklist('source-list')).toBeHidden({ timeout: Timeouts.default });
  }

  /** A card's text (type + assigned names / "None assigned yet."). */
  async audienceCardText(idx: number): Promise<string> {
    return (await this.audienceCard(idx, 'type-select').locator('xpath=ancestor::*[.//*[contains(@id,"-assign-button")]][1]').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }
}

/** "Add New Trigger" / "Edit Trigger". */
export class TriggerDrawer extends NcFormDrawer {
  constructor(page: Page) {
    super(page, 'triggers');
  }

  async openAdd(): Promise<void> {
    await this.btn('nc-triggers-add-button').click();
    await this.waitForOpen();
  }

  /** Fills General (only the given fields). */
  async fillGeneral(v: { name?: string; module?: string; action?: string; active?: boolean }): Promise<void> {
    if (v.name !== undefined) await this.el('name').fill(v.name);
    if (v.module !== undefined) await this.choose(NC_FORM.part.module, v.module);
    if (v.action !== undefined) await this.choose(NC_FORM.part.action, v.action);
    if (v.active !== undefined) await this.setActive(v.active);
  }

  async recipient(): Promise<string> {
    return (await this.byId(TRIGGER_DRAWER.recipientIndicator).innerText()).trim();
  }

  templateChannel(t: number): Locator {
    return this.byId(TRIGGER_DRAWER.template.channelSelect(t));
  }

  /** Sets a template's channel and language (labels: SMS / Email, English / Arabic). */
  async setTemplate(t: number, channel?: 'SMS' | 'Email', language?: 'English' | 'Arabic'): Promise<void> {
    if (channel) await this.choose(`template-idx-${t}-channel-select`, channel);
    if (language) await this.choose(`template-idx-${t}-language-select`, language);
  }

  /** Writes a template body: the SMS textarea, or the e-mail rich editor (+ subject). */
  async setBody(t: number, body: string, subject?: string): Promise<void> {
    const sms = this.byId(TRIGGER_DRAWER.template.bodyInput(t));
    if (await sms.isVisible().catch(() => false)) {
      await sms.fill(body);
    } else {
      if (subject !== undefined) await this.byId(TRIGGER_DRAWER.template.subjectInput(t)).fill(subject);
      const editor = this.byId(TRIGGER_DRAWER.template.editorArea(t));
      await editor.click();
      await this.page.keyboard.press('Control+A');
      await this.page.keyboard.type(body);
    }
  }

  async addTemplate(): Promise<void> {
    await this.byId(TRIGGER_DRAWER.addTemplateButton).click();
  }

  async previewTemplate(t: number): Promise<string> {
    return this.previewVia(this.byId(TRIGGER_DRAWER.template.previewButton(t)));
  }
}

/** App Notification "Create" / edit (3 steps). */
export class DefinitionDrawer extends NcFormDrawer {
  constructor(page: Page) {
    super(page, 'definitions');
  }

  async openCreate(): Promise<void> {
    await this.btn('nc-definitions-add-button').click();
    await this.waitForOpen();
  }

  async fillGeneral(v: { name?: string; module?: string; action?: string; description?: string; active?: boolean }): Promise<void> {
    if (v.name !== undefined) await this.el('name').fill(v.name);
    if (v.module !== undefined) await this.choose(NC_FORM.part.module, v.module);
    if (v.action !== undefined) await this.choose(NC_FORM.part.action, v.action);
    if (v.description !== undefined) await this.byPart('description-input').fill(v.description);
    if (v.active !== undefined) await this.setActive(v.active);
  }

  /** Content: English (ltr) / Arabic (rtl) message textareas + Notes. */
  async fillContent(v: { english?: string; arabic?: string; notes?: string }): Promise<void> {
    if (v.english !== undefined) await this.byPart('english-message-input').fill(v.english);
    if (v.arabic !== undefined) await this.byPart('arabic-message-input').fill(v.arabic);
    if (v.notes !== undefined) await this.byPart('notes-input').fill(v.notes);
  }

  async preview(): Promise<string> {
    return this.previewVia(this.byPart('preview-button'));
  }
}

/** Announcement "Create" / edit (General + Audiences). */
export class AnnouncementDrawer extends NcFormDrawer {
  constructor(page: Page) {
    super(page, 'announcements');
  }

  async openCreate(): Promise<void> {
    await this.btn('nc-announcements-add-button').click();
    await this.waitForOpen();
  }

  /**
   * The Publish at text for an instant: "yyyy-MM-dd HH:mm" in Riyadh time
   * (the input shows "2026-11-11 17:18"; typing that format is accepted).
   */
  static publishText(at: Date): string {
    return `${riyadhDate(at)} ${riyadhTime(at)}`;
  }

  publishInput(): Locator {
    return this.byId(ANNOUNCEMENT_DRAWER.publishOnInput);
  }

  /** Types into Publish at (select-all + type, then blur) - `''` empties it. */
  async setPublishAt(value: Date | string): Promise<void> {
    const text = typeof value === 'string' ? value : AnnouncementDrawer.publishText(value);
    const input = this.publishInput();
    await input.click();
    await this.page.keyboard.press('Control+A');
    if (text === '') await this.page.keyboard.press('Delete');
    else await this.page.keyboard.type(text, { delay: 20 });
    // The calendar panel opens UPWARDS over Name / the messages (smoke 1: "<span weekday> intercepts pointer
    // events" on the Name click). Tab closes it (PrimeNG hides the overlay on Tab) and blurs the input.
    await this.page.keyboard.press('Tab');
    // locator-exception: the PrimeNG calendar panel carries no id; its weekday headers mark it as open.
    await expect(this.el('root').locator('[data-pc-section="weekday"]').first(), 'the Publish at calendar should close').toBeHidden({ timeout: Timeouts.default });
  }

  async fillGeneral(v: { name?: string; english?: string; arabic?: string; publishAt?: Date | string }): Promise<void> {
    if (v.name !== undefined) await this.el('name').fill(v.name);
    if (v.english !== undefined) await this.byId(ANNOUNCEMENT_DRAWER.englishInput).fill(v.english);
    if (v.arabic !== undefined) await this.byId(ANNOUNCEMENT_DRAWER.arabicInput).fill(v.arabic);
    if (v.publishAt !== undefined) await this.setPublishAt(v.publishAt);
  }
}

/** The announcement "Announcement details" drawer (row View). */
export class AnnouncementViewDrawer extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async waitForOpen(): Promise<void> {
    await expect(this.byId(ANNOUNCEMENT_VIEW.title), 'Announcement details should open').toBeVisible({ timeout: Timeouts.default });
  }

  /**
   * The drawer's label/value pairs as shown: Name, Status, Publish at,
   * Published on ("—" when not published), ENGLISH MESSAGE, ARABIC MESSAGE,
   * AUDIENCES ("Users:Payer Admin"). Values carry no ids - read by label.
   */
  async read(): Promise<{ text: string; fields: Record<string, string> }> {
    await this.waitForOpen();
    // The drawer first shows "Loading…" while GetAnnouncement answers (smoke 1 read it then: every value '').
    await expect(this.byId(ANNOUNCEMENT_VIEW.root), 'Announcement details should finish loading').not.toContainText(/Loading(\.\.\.|…)/, { timeout: Timeouts.default });
    // locator-exception: the drawer's value cells carry no ids; the text is read from the id'd drawer host.
    const raw = await this.byId(ANNOUNCEMENT_VIEW.root).innerText();
    const lines = raw.split('\n').map((s) => s.trim()).filter(Boolean);
    const fields: Record<string, string> = {};
    const labels = ['Name', 'Status', 'Publish at', 'Published on', 'ENGLISH MESSAGE', 'ARABIC MESSAGE', 'AUDIENCES'];
    for (let i = 0; i < lines.length; i += 1) if (labels.includes(lines[i]) && i + 1 < lines.length) fields[lines[i]] = lines[i + 1];
    return { text: lines.join(' | '), fields };
  }

  async close(): Promise<void> {
    await this.btn(ANNOUNCEMENT_VIEW.closeButton).click();
    await expect(this.byId(ANNOUNCEMENT_VIEW.title)).toBeHidden({ timeout: Timeouts.default });
  }
}

/** The Reschedule drawer of a Cancelled announcement: Publish at only (default now). */
export class AnnouncementRescheduleDrawer extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  input(): Locator {
    return this.byId(ANNOUNCEMENT_RESCHEDULE.publishOnInput);
  }

  async waitForOpen(): Promise<void> {
    await expect(this.byId(ANNOUNCEMENT_RESCHEDULE.title), 'the Reschedule drawer should open').toBeVisible({ timeout: Timeouts.default });
  }

  async value(): Promise<string> {
    return this.input().inputValue();
  }

  async setPublishAt(value: Date | string): Promise<void> {
    const text = typeof value === 'string' ? value : AnnouncementDrawer.publishText(value);
    await this.input().click();
    await this.page.keyboard.press('Control+A');
    if (text === '') await this.page.keyboard.press('Delete');
    else await this.page.keyboard.type(text, { delay: 20 });
    await this.byId(ANNOUNCEMENT_RESCHEDULE.title).click();
  }

  /** Clicks Reschedule; returns RescheduleAnnouncement's status (null = nothing sent) and the toast. */
  async confirm(): Promise<{ status: number | null; toast: string }> {
    const r = this.page.waitForResponse((x) => x.url().includes('/RescheduleAnnouncement'), { timeout: 8_000 }).catch(() => null);
    await this.btn(ANNOUNCEMENT_RESCHEDULE.confirm).click();
    const res = await r;
    const toast = await this.isToastVisible(2_500).then(async (v) => (v ? await this.getToastMessage() : ''));
    return { status: res?.status() ?? null, toast };
  }

  async cancel(): Promise<void> {
    await this.btn(ANNOUNCEMENT_RESCHEDULE.cancel).click();
  }

  async close(): Promise<void> {
    await this.byId(ANNOUNCEMENT_RESCHEDULE.close).click();
  }
}
