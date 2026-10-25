import { KNOWN_FACILITIES, buildNetwork, pickerDateTime, pickerMinutesFromNow, uniqueArabic, type NetworkFormData } from './network.data';
import { DISPOSABLE_NETWORK_PREFIX, networkStamp } from '../../utils/NetworkProvisioning';
import { toArabicToken } from '../payers/payer.data';

/**
 * Shared data for the create / edit / validation stories (05, 10, 11, 22, 37,
 * 38). What the live wizard says and does, verified 2026-10-21:
 *
 * - the form is drafts-first: Save stores a private draft ("Saved as draft")
 *   with a PROVISIONAL code `NET-D-nnnn`; the permanent `NET-nnnnnn` code is
 *   issued when a checker approves. The sheets' "no code before approval" is
 *   asserted as "no PERMANENT code before approval";
 * - the owning payer is the top-bar scope payer, shown read-only on step 1;
 *   facilities are assigned on the detail screen, not in the form;
 * - client-side "This field is required." on empty names/type/dates (step 1
 *   blocks Next); server-side 422s for character sets and past dates
 *   ("Arabic network name must contain only Arabic characters.",
 *   "Effective date and time cannot be in the past.");
 * - an expiry on the SAME DAY as the effective date (two hours later) is
 *   ACCEPTED - the same-day cases are expected to fail as findings.
 */

/** The permanent network code issued at approval, e.g. NET-000675. */
export const PERMANENT_CODE = /^NET-\d{6}$/;

/** The provisional code a never-approved draft carries, e.g. NET-D-0159. */
export const DRAFT_CODE = /^NET-D-\d+$/;

/** Any Arabic letter. */
export const ARABIC_TEXT = /[؀-ۿ]/;

/** An English word - two or more Latin letters together. */
export const LATIN_WORD = /[A-Za-z]{2,}/;

/** Words that may legitimately stay Latin on an Arabic screen (codes, types, brand). */
export const LATIN_ALLOWED_IN_ARABIC = ['HMO', 'PPO', 'EPO', 'POS', 'NET', 'PBM', 'FCL', 'CSV', 'Excel', 'AAA'] as const;

/** Message patterns for rules the app words in ways the sheets do not pin down. */
export const MESSAGE = {
  duplicateName: /already|exist|in use|duplicate|unique/i,
  arabicOnly: /Arabic/i,
  englishOnly: /English/i,
  expiryAfterEffective: /expiry.*(after|later|greater|before)|(after|later).*effective|period/i,
  expiryInPast: /expiry.*(past|today|earlier)/i,
  lengthLimit: /maximum|exceed|at most|characters|length|long/i,
} as const;

/** How long the lifecycle job (every minute here) may take to move a network. */
export const JOB_WAIT_MS = 8 * 60_000;

/** How long a "stays Pending" case watches the network. */
export const HOLD_MS = 3 * 60_000;

/** The facility the UI flows assign before sending a network for approval. */
export const FLOW_FACILITY = KNOWN_FACILITIES[0].code;

/** A unique English name built on a sheet name. */
export const named = (sheetName: string): string => `${sheetName} ${networkStamp()}`;

/** A unique Arabic name built on a sheet name (Arabic letters only). */
export const namedAr = (sheetNameAr: string): string => uniqueArabic(sheetNameAr);

/** `count` Arabic letters, unique per call (no spaces). */
export const arabicOfLength = (count: number): string => {
  const token = toArabicToken(networkStamp());
  return (token + 'ب'.repeat(count)).slice(0, count);
};

/** `count` English letters, unique per call. */
export const englishOfLength = (count: number): string =>
  (`${DISPOSABLE_NETWORK_PREFIX.replace(/\s/g, '')}${networkStamp().replace(/[^a-z]/gi, '')}` + 'N'.repeat(count)).slice(0, count);

/** A valid network for the form whose effective date-time is a few minutes from now (today). */
export const networkEffectiveToday = (overrides: Partial<NetworkFormData> = {}): NetworkFormData =>
  buildNetwork({ effectiveDate: pickerMinutesFromNow(5), expiryDate: pickerDateTime(366), ...overrides });

/**
 * The English words left in texts that should be Arabic - every run of two or
 * more Latin letters that is not a code, type or brand (LATIN_ALLOWED_IN_ARABIC)
 * and not part of test data the case typed itself (`ownData`).
 */
export function untranslatedWords(texts: readonly string[], ownData: readonly string[] = []): string[] {
  const allowed = new Set<string>(LATIN_ALLOWED_IN_ARABIC);
  const own = ownData.join(' ');
  return texts
    .flatMap((text) => text.match(/[A-Za-z]{2,}/g) ?? [])
    .filter((word) => !allowed.has(word) && !own.includes(word));
}

export { buildNetwork, pickerDateTime, pickerMinutesFromNow };
