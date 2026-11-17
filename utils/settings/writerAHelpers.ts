import type { Page } from '@playwright/test';
import { randomBytes } from 'crypto';
import { deflateSync } from 'zlib';
import { buttonSelector } from '../../constants/ElementIds';
import { SETTINGS_DRAWER, SETTINGS_TOAST } from '../../constants/settings/settingsIds';
import { BRANDING } from '../../constants/settings/writerAIds';
import { Timeouts } from '../../constants/Timeouts';
import { BLOCK_WHEN_NOT_DEFAULT, NO_LOGO_BLOCKED, newInstallBlockedReason } from '../../data/settings/editTimeZoneSiteTitleAndLogo.data';
import type { SettingsGuard } from '../../fixtures/settingsModule.fixture';
import type { TestSteps } from '../../fixtures/testStatus.fixture';
import { LanguageSwitcher } from '../../pages/components/LanguageSwitcher';
import type { DrawerSaveOutcome, SettingsHubPage } from '../../pages/settings/SettingsHubPage';
import { clickDialogAction, readDialog } from '../../pages/user/userCommon';
import { Logger } from '../Logger';

/**
 * Writer A helpers (System Setting Management folder 01, story 20864 "Edit Time
 * Zone, Site Title and Logo" - 2026-11-09). What the lead's SettingsHubPage does
 * not cover: the test images (generated here at runtime, never committed), the
 * logo preview / upload label / read-view logo, where the saved branding shows
 * outside the drawer (nav menu, sign-in screen, browser tab), the time-zone
 * filter list, a "no reload happened" marker, and the Arabic repeat of a
 * message. Ids only (constants/settings/*); nothing here asserts - the specs do.
 */

// ---- text ---------------------------------------------------------------------------

/** Whitespace collapsed, em / en dashes read as "-" (lead decision 4); case kept. */
export function normalise(text: string): string {
  return text.replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
}

// ---- test images (lead decision 6) --------------------------------------------------

/** A file for `setInputFiles` / a data URL. */
export interface LogoFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * A valid 32x32 RGB PNG of EXACTLY `bytes` bytes: IHDR + IDAT + a `tEXt`
 * "Comment" chunk that pads to the size (its CRC computed) + IEND.
 */
export function pngOfSize(bytes: number): Buffer {
  const width = 32;
  const height = 32;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  const row = width * 3 + 1;
  const raw = Buffer.alloc(row * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * row] = 0; // filter: none
    for (let x = 0; x < width; x += 1) raw.set([0x1f, 0x6f, 0xeb], y * row + 1 + x * 3);
  }
  const head = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw))]);
  const tail = pngChunk('IEND', Buffer.alloc(0));
  const pad = bytes - head.length - tail.length;
  if (pad === 0) return Buffer.concat([head, tail]);
  const keyword = Buffer.from('Comment\0', 'latin1');
  if (pad < 12 + keyword.length) throw new Error(`a PNG of ${bytes} bytes cannot be built (the smallest padded PNG is ${head.length + tail.length + 12 + keyword.length})`);
  const text = Buffer.concat([keyword, Buffer.alloc(pad - 12 - keyword.length, 0x20)]);
  return Buffer.concat([head, pngChunk('tEXt', text), tail]);
}

/**
 * A valid JPEG of EXACTLY `bytes` bytes: a 64x64 JPEG drawn by the browser's own
 * canvas (so it is certainly decodable), padded with COM segments inserted
 * after the JFIF APP0 segment.
 */
export async function jpegOfSize(page: Page, bytes: number): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const g = canvas.getContext('2d');
    if (g) {
      g.fillStyle = '#1f6feb';
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#ffffff';
      g.fillRect(16, 16, 32, 32);
    }
    return canvas.toDataURL('image/jpeg', 0.9);
  });
  const base = Buffer.from(dataUrl.split(',')[1], 'base64');
  // After SOI (2 bytes), and after the APP0 segment when the encoder wrote one.
  const insertAt = base[2] === 0xff && base[3] === 0xe0 ? 4 + base.readUInt16BE(4) : 2;
  let pad = bytes - base.length;
  if (pad < 0 || (pad > 0 && pad < 4)) throw new Error(`a JPEG of ${bytes} bytes cannot be built from a ${base.length}-byte base`);
  const segments: Buffer[] = [];
  while (pad > 0) {
    let size = Math.min(pad, 4 + 65533);
    if (pad - size > 0 && pad - size < 4) size -= 4;
    const header = Buffer.from([0xff, 0xfe, 0, 0]);
    header.writeUInt16BE(size - 2, 2);
    segments.push(header, Buffer.alloc(size - 4, 0x20));
    pad -= size;
  }
  return Buffer.concat([base.subarray(0, insertAt), ...segments, base.subarray(insertAt)]);
}

/** A valid 1x1 GIF89a of EXACTLY `bytes` bytes (a comment extension pads it). */
export function gifOfSize(bytes: number): Buffer {
  const base = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
  const body = base.subarray(0, base.length - 1); // without the 0x3B trailer
  let rest = bytes - base.length - 3; // 0x21 0xFE ... 0x00
  if (rest < 0 || rest === 1) throw new Error(`a GIF of ${bytes} bytes cannot be built`);
  const blocks: Buffer[] = [];
  while (rest > 0) {
    let take = Math.min(rest, 256);
    if (rest - take === 1) take -= 1;
    blocks.push(Buffer.from([take - 1]), Buffer.alloc(take - 1, 0x20));
    rest -= take;
  }
  return Buffer.concat([body, Buffer.from([0x21, 0xfe]), ...blocks, Buffer.from([0x00, 0x3b])]);
}

/** A valid 24-bit BMP of EXACTLY `bytes` bytes (256 px wide; trailing bytes pad the rest). */
export function bmpOfSize(bytes: number): Buffer {
  const width = 256;
  const rowSize = width * 3;
  const height = Math.max(1, Math.floor((bytes - 54) / rowSize));
  const out = Buffer.alloc(Math.max(bytes, 54 + rowSize * height), 0x80);
  out.write('BM', 0, 'ascii');
  out.writeUInt32LE(out.length, 2);
  out.writeUInt32LE(0, 6);
  out.writeUInt32LE(54, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(width, 18);
  out.writeInt32LE(height, 22);
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(24, 28);
  out.writeUInt32LE(0, 30);
  out.writeUInt32LE(rowSize * height, 34);
  out.writeInt32LE(2835, 38);
  out.writeInt32LE(2835, 42);
  out.writeUInt32LE(0, 46);
  out.writeUInt32LE(0, 50);
  return out;
}

/** Random bytes named `.png` with the PNG mime type - not decodable as an image. */
export function unreadableBytes(bytes: number): Buffer {
  const out = randomBytes(bytes);
  out[0] = 0x00; // never a PNG signature by chance
  return out;
}

export const pngLogo = (spec: { name: string; bytes: number }): LogoFile => ({ name: spec.name, mimeType: 'image/png', buffer: pngOfSize(spec.bytes) });
export const jpegLogo = async (page: Page, spec: { name: string; bytes: number }): Promise<LogoFile> => ({ name: spec.name, mimeType: 'image/jpeg', buffer: await jpegOfSize(page, spec.bytes) });
export const gifLogo = (spec: { name: string; bytes: number }): LogoFile => ({ name: spec.name, mimeType: 'image/gif', buffer: gifOfSize(spec.bytes) });
export const bmpLogo = (spec: { name: string; bytes: number }): LogoFile => ({ name: spec.name, mimeType: 'image/bmp', buffer: bmpOfSize(spec.bytes) });
export const unreadableLogo = (spec: { name: string; bytes: number }): LogoFile => ({ name: spec.name, mimeType: 'image/png', buffer: unreadableBytes(spec.bytes) });

/** The value the drawer would send for a picked file: `data:<mime>;base64,...`. */
export function toDataUrl(file: LogoFile): string {
  return `data:${file.mimeType};base64,${file.buffer.toString('base64')}`;
}

// ---- drawer: logo, title, time zone -------------------------------------------------

/** The drawer logo preview's src ('' when no preview is shown). */
export async function logoPreviewSrc(page: Page): Promise<string> {
  const img = page.locator(`#${SETTINGS_DRAWER.logoPreview}`);
  if (!(await img.isVisible().catch(() => false))) return '';
  return (await img.getAttribute('src')) ?? '';
}

/** The logo upload button's label ('' when it is not offered). */
export async function uploadButtonLabel(page: Page): Promise<string> {
  const host = page.locator(`#${SETTINGS_DRAWER.logoUploadButton}`);
  if (!(await host.isVisible().catch(() => false))) return '';
  return normalise(await host.innerText());
}

/** The drawer's text + every toast on screen - wherever the logo message is shown. */
export async function drawerAndToastText(page: Page): Promise<string> {
  const drawer = await page.locator(`#${SETTINGS_DRAWER.drawer}`).innerText().catch(() => '');
  const toasts = await page.locator(`#${SETTINGS_TOAST.toast}`).allInnerTexts().catch(() => [] as string[]);
  return normalise([drawer, ...toasts].join(' '));
}

/**
 * The drawer + toast text once it contains `expected`, or the last text read
 * when it never does within `timeout` (the caller asserts - this only waits, so
 * a message that expires with its toast is still caught).
 */
export async function textOnceShown(page: Page, expected: string, timeout: number = Timeouts.toast): Promise<string> {
  const until = Date.now() + timeout;
  let last = await drawerAndToastText(page);
  while (!last.includes(expected) && Date.now() < until) {
    await page.waitForTimeout(250);
    last = await drawerAndToastText(page);
  }
  return last;
}

/** Presses the logo's Remove button. */
export async function pressRemoveLogo(page: Page): Promise<void> {
  await page.locator(buttonSelector(SETTINGS_DRAWER.logoRemoveButton)).first().click();
}

/** Empties the site title the way a user would: click, select all, Delete (lead decision 10). */
export async function clearTitleLikeAUser(hub: SettingsHubPage): Promise<void> {
  const input = hub.control('siteTitleInput');
  await input.click();
  await input.press('Control+A');
  await input.press('Delete');
}

/**
 * Opens the time-zone select and types into its filter searchbox. Types INTO
 * the searchbox once it is shown: keystrokes sent straight after the click were
 * lost before the overlay's filter took focus (full run 2026-11-09, 21065 - the
 * list stayed unfiltered; by hand the filter narrows "Cairo" to one option).
 */
export async function typeInTimeZoneFilter(page: Page, hub: SettingsHubPage, term: string): Promise<void> {
  const select = hub.control('timeZoneSelect');
  await select.scrollIntoViewIfNeeded();
  await select.click();
  // locator-exception: PrimeNG's overlay filter carries no id; it is the open overlay's only searchbox.
  const filter = page.getByRole('searchbox').filter({ visible: true }).last();
  await filter.waitFor({ state: 'visible', timeout: Timeouts.short });
  await filter.pressSequentially(term, { delay: 30 });
}

/** The options the open select overlay shows now. */
export async function visibleOptions(page: Page): Promise<string[]> {
  return (await page.getByRole('option').filter({ visible: true }).allInnerTexts().catch(() => [] as string[]))
    .map(normalise)
    .filter(Boolean);
}

/** Clicks the visible overlay option with exactly this text. */
export async function chooseVisibleOption(page: Page, text: string): Promise<void> {
  await page.getByRole('option', { name: text, exact: true }).filter({ visible: true }).first().click();
}

/** The keys a drawer Save sent ([] when no request left). */
export function sentKeys(outcome: DrawerSaveOutcome): string[] {
  return (outcome.sent?.settings ?? []).map((s) => s.key);
}

/**
 * Closes the drawer with Cancel, discarding an Unsaved Changes prompt if one is
 * raised. Answers whether the drawer is closed afterwards.
 */
export async function cancelDrawer(page: Page, hub: SettingsHubPage): Promise<boolean> {
  if (!(await hub.isDrawerOpen(500))) return true;
  await page.locator(buttonSelector(SETTINGS_DRAWER.cancel)).first().click();
  if ((await readDialog(page)).visible) await clickDialogAction(page, 'discard').catch(() => undefined);
  await hub.drawerTitle().waitFor({ state: 'hidden', timeout: Timeouts.short }).catch(() => undefined);
  return !(await hub.drawerTitle().isVisible().catch(() => false));
}

// ---- where the saved branding shows ---------------------------------------------------

/** The read view's logo src ('' when it shows no image, e.g. "Default logo"). */
export async function readViewLogoSrc(page: Page): Promise<string> {
  // locator-exception: the read view's logo <img> carries no id; it is the outlet's visible image other than the drawer preview.
  const img = page.locator(`#${BRANDING.outlet} img:not(#${SETTINGS_DRAWER.logoPreview})`).filter({ visible: true }).first();
  if (!(await img.isVisible().catch(() => false))) return '';
  return (await img.getAttribute('src')) ?? '';
}

/** The side navigation's logo src ('' when no image). */
export async function navLogoSrc(page: Page): Promise<string> {
  // locator-exception: the nav brand's <img> carries no id; it is the only image inside the id'd brand block.
  const img = page.locator(`#${BRANDING.navBrand} img`).first();
  if (!(await img.isVisible().catch(() => false))) return '';
  return (await img.getAttribute('src')) ?? '';
}

/**
 * What a sign-in screen shows of the branding: tab title, logo src and alt,
 * and whether the logo image actually loaded.
 *
 * Read from the element once it is attached, NOT gated on visibility: a logo
 * whose image is still loading - or failed to load - has a width of 0 for a
 * while, so `isVisible()` flips between false and true and the src/alt read
 * back as '' (full run 2026-11-09: 21062, 21068, 21069, 21074, 21078). Waits
 * (at most 10 s) for the image to finish loading or failing, then reports
 * `logoLoaded` = the browser decoded a real image (naturalWidth > 0). A logo
 * address that answers 404 therefore reads as src set, logoLoaded false.
 */
export async function signInBranding(
  page: Page,
): Promise<{ tabTitle: string; logoSrc: string; logoAlt: string; logoLoaded: boolean }> {
  const logo = page.locator(`#${BRANDING.signInLogo}`);
  const attached = await logo
    .waitFor({ state: 'attached', timeout: Timeouts.default })
    .then(() => true)
    .catch(() => false);
  if (!attached) return { tabTitle: normalise(await page.title()), logoSrc: '', logoAlt: '', logoLoaded: false };
  await logo
    .evaluate((img: HTMLImageElement) => (img.complete ? null : new Promise((done) => {
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
      setTimeout(done, 10_000);
    })))
    .catch(() => undefined);
  const logoLoaded = await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0).catch(() => false);
  return {
    tabTitle: normalise(await page.title()),
    logoSrc: (await logo.getAttribute('src').catch(() => null)) ?? '',
    logoAlt: normalise((await logo.getAttribute('alt').catch(() => null)) ?? ''),
    logoLoaded,
  };
}

/** Puts a marker on the window - it survives everything but a reload / navigation. */
export async function markDocument(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__pbmQaNoReload = true;
  });
}

/** Whether the marker is still there (no reload happened since `markDocument`). */
export async function isSameDocument(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as unknown as Record<string, unknown>).__pbmQaNoReload === true).catch(() => false);
}

// ---- preconditions ------------------------------------------------------------------

/**
 * Lead decision 1: when the screen's value differs from the new-installation
 * default, the case is BLOCKED (BLOCK_WHEN_NOT_DEFAULT); otherwise nothing
 * happens and the spec asserts the default.
 */
export function blockUnlessNewInstallDefault(steps: TestSteps, what: string, shown: string, expected: string): void {
  if (BLOCK_WHEN_NOT_DEFAULT && normalise(shown) !== normalise(expected)) steps.blocked(newInstallBlockedReason(what, shown, expected));
}

/** 21076's precondition: no logo set (Site.Logo = ''), or BLOCKED with the server's answer. */
export async function clearLogoOrBlock(steps: TestSteps, guard: SettingsGuard): Promise<void> {
  const answer = await guard.set({ 'Site.Logo': '' });
  if (answer.status >= 400) steps.blocked(`${NO_LOGO_BLOCKED} (${answer.status}: ${answer.errors.join('; ') || answer.text.slice(0, 200)})`);
}

// ---- Arabic repeat (lead decision 3) ------------------------------------------------

/**
 * Closes the drawer, switches the UI to Arabic, reopens the drawer, runs
 * `action` (which repeats the step and returns the text it shows), then closes
 * the drawer and ALWAYS switches back to English. The caller asserts.
 */
export async function readInArabic(page: Page, hub: SettingsHubPage, action: () => Promise<string>): Promise<string> {
  const language = new LanguageSwitcher(page);
  await cancelDrawer(page, hub);
  await language.switchTo('ar');
  try {
    await hub.openEdit();
    const text = await action();
    Logger.step(`[ar] the step showed: "${text.slice(0, 200)}"`);
    return text;
  } finally {
    await cancelDrawer(page, hub).catch(() => undefined);
    await language.switchTo('en');
  }
}
