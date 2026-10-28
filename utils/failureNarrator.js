/* eslint-disable no-console */
'use strict';

/**
 * Turns a failed step into plain language a non-technical reader can act on:
 * what the step did, what should have happened, what actually happened, and
 * what the screen showed at that moment.
 *
 * Why (QA lead, 2026-10-28): the failure text in the reports was the raw
 * assertion - "expect(locator).toBeVisible() failed, Locator:
 * locator('#plan-form-drawer-payer-id-select')" - which only a developer can
 * read. Every report reads failures through THIS module - the step recorder
 * (fixtures/testStatus.fixture.ts), the HTML report (scripts/buildReport.js),
 * the Azure results and the failure sheet (scripts/buildFailureSheet.js) - so
 * a failure reads the same everywhere, now and for future runs.
 *
 * Plain JavaScript (CommonJS) so the Node report scripts and the TypeScript
 * fixtures share one implementation; types are in failureNarrator.d.ts.
 */

const ANSI = /\u001b\[[0-9;]*m/g;
const clean = (t) => String(t || '').replace(ANSI, '').trim();
const squash = (t) => clean(t).replace(/\s+/g, ' ').trim();
const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
const short = (t, n = 220) => {
  const s = squash(t);
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};
const secondsOf = (ms) => {
  const s = Number(ms) / 1000;
  return Number.isInteger(s) ? String(s) : s.toFixed(1);
};

// ---- what an element id means on screen -------------------------------------

/** The control kind an id segment names, as a reader would call it. */
const KIND = {
  select: 'drop-down', input: 'field', textarea: 'text box', button: 'button', tag: 'label',
  badge: 'badge', tab: 'tab', tabs: 'tabs', title: 'title', error: 'error message', chip: 'filter chip',
  chips: 'filter chips', table: 'table', value: 'number', label: 'label', notice: 'notice', menu: 'menu',
  trigger: 'button', pager: 'page navigation', drawer: 'panel', dialog: 'pop-up', card: 'card', kpi: 'tile',
  toggle: 'switch', option: 'option', message: 'message', row: 'row', cell: 'cell', header: 'header',
};
/** Row actions are buttons even when the id ends in the verb. */
const ACTIONS = new Set([
  'approve', 'reject', 'delete', 'edit', 'view', 'clone', 'submit', 'activate', 'inactivate', 'recall',
  'withdraw', 'revert', 'export', 'import', 'assign', 'remove', 'close', 'cancel', 'confirm', 'next', 'prev',
]);
/** Id segments that only say where the element lives, already covered by PLACE. */
const NOISE = new Set([
  'plan', 'plans', 'form', 'drawer', 'detail', 'list', 'id', 'pbm', 'app', 'breadcrumb', 'approvals',
  'approval', 'formulary', 'audit', 'log', 'versions', 'field', 'search', 'advanced', 'important',
  'overview', 'header', 'card', 'table', 'row', 'button',
]);
/** Where an id prefix puts the element, most specific first. */
const PLACE = [
  [/^plan-form-drawer/, 'in the plan form'],
  [/^plan-detail-audit|^audit-log-detail/, "on the plan's Audit History"],
  [/^plan-detail-versions|^plan-detail-view-version|^plan-detail-drawer/, "on the plan's Version History"],
  [/^plan-detail-(selected-formulary|assign-formulary|view-formulary|remove-formulary|last-updated)/, "on the plan's Formulary Assignment tab"],
  [/^plan-detail/, "on the plan's page"],
  [/^plan-list-advanced-search/, 'in the Advanced Search panel of the Plans list'],
  [/^plan-list/, 'on the Plans list'],
  [/^approvals?-/, 'on the Approvals screen'],
  [/^pbm-dialog/, 'in the pop-up window'],
  [/^formulary-form/, 'in the formulary form'],
  [/^formulary-detail/, "on the formulary's page"],
  [/^app-breadcrumb-payer/, 'in the top bar (payer selector)'],
  [/^app-breadcrumb/, 'in the top bar'],
  [/^network/, 'on the network screens'],
  [/^payer/, 'on the payer screens'],
];
// Record ids are uuids split by "-": any hex run with a digit is one of them.
const isUuid = (t) => /^\d+$/.test(t) || (/^[0-9a-f]{4,}$/i.test(t) && /\d/.test(t));
const WORD = {
  kpi: 'KPI', csv: 'CSV', en: 'English', ar: 'Arabic', id: 'ID', approvalstatus: 'Approval Status',
  payerid: 'Payer', plantypeid: 'Plan Type', statusid: 'Status', searchtext: 'Plan Name', actiontype: 'Action Type',
  daterange: 'Date Range', actorlabel: 'User', effective: 'Effective', expiry: 'Expiry',
};

/** "plan-form-drawer-payer-id-select" -> "the Payer drop-down in the plan form". */
function describeId(id) {
  const raw = String(id || '').replace(/^#/, '');
  if (!raw) return '';
  const place = (PLACE.find(([re]) => re.test(raw)) || [null, ''])[1];
  const tokens = raw.split(/[-_]+/).filter((t) => t && !isUuid(t));
  let kind = '';
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    if (KIND[tokens[i]]) { kind = KIND[tokens[i]]; break; }
    if (ACTIONS.has(tokens[i])) { kind = 'button'; break; }
  }
  const words = tokens.filter((t) => !NOISE.has(t) && !KIND[t]).map((t) => WORD[t] || t);
  const name = words.length ? words.map(cap).join(' ') : '';
  const label = [name, kind].filter(Boolean).join(' ') || 'screen element';
  return `the ${label}${place ? ` ${place}` : ''}`;
}

/** The element a Playwright error names, described for a reader ('' if none). */
function elementOf(message) {
  const msg = clean(message);
  const id = (msg.match(/locator\('[^']*#([A-Za-z0-9_-]+)/) || msg.match(/#([A-Za-z][A-Za-z0-9_-]{3,})/) || [])[1];
  if (id) return describeId(id);
  const role = msg.match(/getByRole\('(\w+)'(?:,\s*\{\s*name:\s*['/]([^'/]+))?/);
  if (role) return `the ${role[2] ? `"${role[2]}" ` : ''}${KIND[role[1]] || role[1]}`;
  const text = msg.match(/getByText\('([^']+)'/);
  if (text) return `the text "${text[1]}"`;
  return '';
}

// ---- what the server said ------------------------------------------------------

/** The server's own sentence inside a JSON answer quoted in a failure. */
function serverMessage(text) {
  const t = clean(text);
  const reason = (t.match(/"Reason"\s*:\s*"([^"]+)"/) || [])[1];
  const error = (t.match(/"ErrorMessage"\s*:\s*"([^"]+)"/) || [])[1];
  const success = (t.match(/"successMessage"\s*:\s*"([^"]+)"/) || [])[1];
  const status = (t.match(/"[Ss]tatus"\s*:\s*(\d{3})/) || t.match(/answered (\d{3})/) || t.match(/^(\d{3})\s*\{/) || [])[1];
  const said = reason || (error && !/There were some errors processing/.test(error) ? error : '') || success || error || '';
  return { status: status ? Number(status) : undefined, said };
}

// ---- the test's own words --------------------------------------------------------

/** The message the test gave its check - everything before Playwright's echo. */
function ownMessage(message) {
  const msg = clean(message);
  const head = msg.split(/\n\s*\n|\s*expect\((?:received|locator)\)|\n\s*Expected|\n\s*Call [Ll]og/)[0] || '';
  return untech(head.replace(/^Error:\s*/, '').replace(/^Step \d+ "[^"]*" failed:\s*/, ''));
}

/**
 * Takes the machinery out of a sentence: JSON answers (serverMessage says
 * those separately), links, regular expressions, and screen-text dumps after "|".
 */
/** Server operations the tests name, as a reader would say them. */
const OPERATION = {
  SetPlanActive: 'the activation', SubmitPlanForApproval: 'the submission for approval', UpdatePlan: 'saving the plan',
  CreatePlan: 'creating the plan', DeletePlan: 'the deletion', ApproveRequest: 'the approval', RejectRequest: 'the rejection',
  AssignFormularyToPlan: 'assigning the formulary', RevertPlanVersion: 'the revert', InactivatePlan: 'the deactivation',
  GetPlan: 'opening the plan', ClonePlan: 'the clone', GetPlans: 'loading the plans list', GetPlanAuditTrail: 'loading the audit history',
};

function untech(text) {
  let t = squash(text);
  // "/api/Approvals/ApproveRequest answered 409: Title: ..." - the operation
  // stays (in words below), the transport detail goes; serverMessage keeps the reason.
  t = t.replace(/\s+answered\s+\d{3}\b.*$/, '').replace(/:?\s*\/api\/\S+/g, '');
  t = t.replace(/\b(SetPlanActive|SubmitPlanForApproval|UpdatePlan|CreatePlan|DeletePlan|ApproveRequest|RejectRequest|AssignFormularyToPlan|RevertPlanVersion|InactivatePlan|GetPlanAuditTrail|GetPlans|GetPlan|ClonePlan)\b/g, (m) => OPERATION[m]);
  t = t.replace(/\(https?:\/\/[^)]*\)/g, '').replace(/https?:\/\/\S+/g, '');
  t = t.replace(/"?\/((?:[^/\\]|\\.)+)\/[gimsuy]*"?/g, (m, body) => (/[|()?*]/.test(body) ? `"${readablePattern(body)}"` : m));
  t = t.replace(/:?\s*\d{3}\s*\{.*$/, '').replace(/:?\s*\{".*$/, '');
  t = t.replace(/\s*\|.*$/, '');
  t = t.replace(/;\s*it showed \d+ entr(?:y|ies):.*$/, '');
  t = t.replace(/;?\s*messages \[\s*\]/g, ', and no message was shown').replace(/;\s*messages \[([^\]]*)\]/g, '; the screen said: $1');
  return t.trim().replace(/[.:;,\s-]+$/, '');
}

/** "/no (audit )?(history|records?)/i" -> 'no audit history / records'. */
function readablePattern(p) {
  return String(p)
    .replace(/^\/|\/[a-z]*$/g, '')
    .replace(/\\[bsdw]/g, ' ')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\.\*|\.\+|[?*+^$]/g, ' ')
    .replace(/\\(.)/g, '$1')
    .replace(/[()]/g, ' ')
    .replace(/\|/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Quoted values on the "+" (received) or "-" (expected) lines of a Jest diff. */
const PRIMARY_KEYS = ['status', 'action', 'name', 'planName', 'code', 'payer', 'label', 'title', 'type'];
function diffValues(msg, sign) {
  const singles = [];
  const pairs = [];
  for (const line of clean(msg).split('\n')) {
    if (!line.startsWith(sign) || /^[+-]\s*(Expected|Received)\b/.test(line)) continue;
    const pair = line.match(/"(\w+)":\s*"([^"]*)"/);
    const single = line.match(/^[+-]\s+"([^"]*)",?$/) || line.match(/^[+-]\s+(-?\d+(?:\.\d+)?),?$/);
    if (pair) pairs.push([pair[1], pair[2]]);
    else if (single) singles.push(single[1]);
  }
  // An object is summarised by its most telling field ("Not Live", not
  // "tone neutral"); plain values are listed as they are.
  if (pairs.length) {
    const keys = [...new Set(pairs.map(([k]) => k))];
    const key = PRIMARY_KEYS.find((k) => keys.includes(k)) || keys[0];
    singles.push(...pairs.filter(([k]) => k === key).map(([, v]) => v));
  }
  return [...new Set(singles)];
}
const listOf = (items, n = 6) => {
  if (!items.length) return 'nothing';
  const shown = items.slice(0, n).map((v) => `"${v}"`).join(', ');
  return items.length > n ? `${shown} and ${items.length - n} more` : shown;
};

// ---- the narration --------------------------------------------------------------

/**
 * The actual result in plain words. `reason` is the raw failure the step
 * recorded; nothing technical (locators, matcher names, stack lines) survives.
 */
function narrateActual(reason) {
  const msg = clean(reason);
  if (!msg) return 'The step failed without saying why.';
  const own = ownMessage(msg);
  const el = elementOf(msg);
  const waitMs = (msg.match(/Timeout:?\s*(\d+)\s*ms/) || msg.match(/Timeout (\d+)ms exceeded/) || [])[1];
  const waited = waitMs ? ` (waited ${secondsOf(waitMs)} seconds)` : '';
  const server = serverMessage(msg);
  const serverLine = server.said
    ? ` The system answered: "${short(server.said, 200).replace(/[.\s]+$/, '')}"${server.status ? ` (code ${server.status})` : ''}.`
    : '';

  // The automation could not use a control at all.
  const act = msg.match(/^(?:Error:\s*)?locator\.(\w+): Timeout (\d+)ms exceeded/);
  if (act) {
    const verb = { click: 'click', fill: 'type into', check: 'tick', selectOption: 'choose from', press: 'press a key in', hover: 'point at', innerText: 'read', waitFor: 'find' }[act[1]] || 'use';
    return `The automation tried to ${verb} ${el || 'a control'}, but it was not on the screen or could not be used within ${secondsOf(act[2])} seconds.`;
  }
  if (/page\.goto: Timeout/.test(msg)) return `The page did not finish opening within ${secondsOf((msg.match(/Timeout (\d+)ms/) || [])[1] || 45000)} seconds.`;
  if (/Cannot read properties of (undefined|null)/.test(msg)) {
    return 'The test could not continue: an earlier action did not produce the result this step needed (a test-side problem, not an application behaviour).';
  }

  // A repeated check that never came true.
  if (/Timeout \d+ms exceeded while waiting on the predicate/.test(msg)) {
    const ownSentence = own.replace(/^The /, 'the ');
    return `${cap(ownSentence)} - this never happened, although it was checked again and again${waited}.`;
  }

  // Checks on an element.
  const loc = msg.match(/expect\(locator\)\.(not\.)?(\w+)\(/);
  if (loc) {
    const matcher = loc[2];
    const neg = Boolean(loc[1]);
    const wanted = ((msg.match(/Expected(?: string| pattern| substring)?:\s*(.+)/) || [])[1] || '').trim();
    const got = ((msg.match(/Received(?: string)?:\s*(.+)/) || [])[1] || '').trim();
    const missing = /element\(s\) not found/.test(msg);
    const lead = own && !/^expect\(/.test(own) ? `${cap(own)}: ` : '';
    const E = lead ? (el || 'the expected screen element') : cap(el || 'the expected screen element');
    if (matcher === 'toBeVisible') return missing ? `${lead}${E} did not appear on the screen${waited}.` : `${lead}${E} was there but not visible${waited}.`;
    if (matcher === 'toBeHidden') return `${lead}${E} was still showing${waited}.`;
    if (matcher === 'toBeEnabled') return `${lead}${E} stayed disabled${waited}.`;
    if (matcher === 'toBeDisabled') return `${lead}${E} could still be used, although it should have been disabled${waited}.`;
    if (matcher === 'toHaveText' || matcher === 'toContainText') {
      return missing ? `${lead}${E} was not on the screen${waited}.` : `${lead}${E} showed "${short(got.replace(/^"|"$/g, ''), 120)}" instead of "${short(wanted.replace(/^"|"$/g, ''), 120)}"${waited}.`;
    }
    if (matcher === 'toHaveCount') {
      return neg ? `${lead}${E} was present ${got} time(s); none were expected.` : `${lead}expected ${wanted} of ${el || 'the element'} but found ${got}${waited}.`;
    }
    if (matcher === 'toHaveAttribute') {
      const unq = (v) => v.replace(/^"|"$/g, '');
      if (/'html'/.test(msg) && /rtl|ltr/.test(wanted)) {
        return `${lead}the page layout stayed ${unq(got) === 'ltr' ? 'left-to-right (English)' : 'right-to-left (Arabic)'} instead of switching to ${unq(wanted) === 'rtl' ? 'right-to-left (Arabic)' : 'left-to-right (English)'}${waited}.`;
      }
      return `${lead}${E} had "${unq(got)}" instead of "${unq(wanted)}"${waited}.`;
    }
    if (matcher === 'toHaveValue') return `${lead}${E} held "${got}" instead of "${wanted}"${waited}.`;
    return `${lead}${E} did not behave as expected${waited}.`;
  }

  // Value checks.
  const expLine = (msg.match(/\n\s*Expected(?: value| pattern| substring| length| string)?:\s*(.+)/) || [])[1];
  const recLine = (msg.match(/\n\s*Received(?: value| array| string| length| object)?:\s*(.+)/) || [])[1];
  const ownSays = own && !/^expect\(/.test(own) ? own : '';

  // An answer that should have been a refusal.
  if (expLine && />=\s*400/.test(expLine)) {
    const status = Number(recLine) || server.status;
    return `${ownSays ? `${cap(ownSays)}. ` : ''}The system accepted the request${status ? ` (answer ${status})` : ''} instead of refusing it.${serverLine}`.replace(/\.\./g, '.');
  }
  if (expLine && /^<\s*300/.test(expLine)) {
    return `${ownSays ? `${cap(ownSays)}. ` : ''}The system refused the request${recLine ? ` (answer ${recLine})` : ''}.${serverLine}`;
  }

  if (/not\.toMatch\(/.test(msg) && expLine) {
    let said = (recLine || '').replace(/^"|"$/g, '');
    if (/^\\?\{/.test(said)) said = serverMessage(said.replace(/\\"/g, '"')).said || said;
    return `${ownSays ? `${cap(ownSays)}. ` : ''}No message like "${readablePattern(expLine.replace(/^not\s*/, ''))}" should appear, but the screen/system said: "${short(said, 200)}".`;
  }
  if (/toMatch\(/.test(msg) && expLine) {
    let said = (recLine || '').replace(/^"|"$/g, '');
    if (/^\\?\{/.test(said)) said = serverMessage(said.replace(/\\"/g, '"')).said || 'a technical answer with no message';
    // The whole page's text (it starts with the side menu) means no message was shown.
    if (/^\s*Dashboard\b/.test(said)) said = '';
    return `${ownSays ? `${cap(ownSays)}. ` : ''}Expected wording like "${readablePattern(expLine)}", but ${said ? `the screen/system said: "${short(said, 200)}"` : 'no message was shown at all'}.`;
  }
  if (/toContain\(/.test(msg) && expLine) {
    const wanted = expLine.replace(/^"|"$/g, '');
    const inArray = /Received array/.test(msg);
    const got = (recLine || '').replace(/^"|"$/g, '');
    if (inArray) {
      return /^\[\s*\]$/.test(got)
        ? `${ownSays ? `${cap(ownSays)}: ` : ''}expected to find "${wanted}", but nothing was found.`
        : `${ownSays ? `${cap(ownSays)}: ` : ''}"${wanted}" was expected among ${short(got, 160)}, but it was not there.`;
    }
    return `${ownSays ? `${cap(ownSays)}: ` : ''}expected to see "${short(wanted, 120)}", but found ${got ? `"${short(got, 200)}"` : 'nothing'}.`;
  }
  if (/toHaveLength\(/.test(msg)) {
    const want = (msg.match(/Expected length:\s*(\d+)/) || [])[1];
    const have = (msg.match(/Received length:\s*(\d+)/) || [])[1];
    return `${ownSays ? `${cap(ownSays)}: ` : ''}expected ${want} item(s), found ${have}.`;
  }
  if (/toEqual\(|toStrictEqual\(/.test(msg)) {
    const containing = (expLine || '').match(/ArrayContaining \[(.*)\]/);
    if (containing) {
      const want = containing[1].split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
      const have = (recLine || '').replace(/^\[|\]$/g, '').split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
      const lacking = want.filter((w) => !have.includes(w));
      return `${ownSays ? `${cap(ownSays)}: ` : ''}expected to include ${listOf(want)}; found ${listOf(have)}${lacking.length ? ` - missing ${listOf(lacking)}` : ''}.`;
    }
    const plus = diffValues(msg, '+');
    const minus = diffValues(msg, '-');
    const expectedNone = /-\s*Array \[\]/.test(msg);
    if (expectedNone && plus.length) return `${ownSays ? `${cap(ownSays)}: ` : 'Unexpected items: '}expected none, but found ${listOf(plus)}.`;
    if (plus.length || minus.length) return `${ownSays ? `${cap(ownSays)}: ` : ''}expected ${listOf(minus)}, but found ${listOf(plus)}.`;
    if (recLine) return `${ownSays ? `${cap(ownSays)}: ` : ''}expected ${short(expLine, 120)}, but found ${short(recLine, 160)}.`;
  }
  if (/not\.toBe\(/.test(msg) && expLine) {
    const not = expLine.replace(/^not\s*/, '').replace(/^"|"$/g, '');
    return `${ownSays ? `${cap(ownSays)}: ` : ''}it should not be "${not}", but it was.`;
  }
  if (/not\.toEqual\(/.test(msg) && /not \[\]/.test(expLine || '')) {
    return `${ownSays ? `${cap(ownSays)} - ` : ''}nothing was shown.`;
  }
  if (/toBeGreaterThan(OrEqual)?\(|toBeLessThan(OrEqual)?\(/.test(msg) && expLine) {
    const bound = expLine.replace(/\s+/g, ' ');
    const words = bound.replace(/^>=\s*/, 'at least ').replace(/^>\s*/, 'more than ').replace(/^<=\s*/, 'at most ').replace(/^<\s*/, 'less than ');
    return `${ownSays ? `${cap(ownSays)}: ` : ''}expected ${words}, but got ${recLine}.${serverLine}`;
  }
  if (/toBe\(/.test(msg) && expLine) {
    const want = expLine.replace(/^"|"$/g, '');
    const got = (recLine || '').replace(/^"|"$/g, '');
    if ((want === 'true' && got === 'false') || (want === 'false' && got === 'true')) {
      if (ownSays) {
        // "must not render" that rendered reads "but it did", not "but it did not".
        const forbidden = /\b(should|must)( not|n't)\b|\bnot be\b/i.test(ownSays);
        return /\b(should|must)\b/i.test(ownSays) ? `${cap(ownSays)} - but it did${forbidden ? '' : ' not'}.${serverLine}` : `Not as expected: ${ownSays}.${serverLine}`;
      }
      if (server.said) {
        return server.status && server.status >= 400
          ? `The system refused it: "${short(server.said, 200).replace(/[.\s]+$/, '')}" (code ${server.status}).`
          : `The system accepted it: "${short(server.said, 200).replace(/[.\s]+$/, '')}".`;
      }
      return `The check did not hold (expected ${want}, found ${got}).`;
    }
    const q = (v) => (/^-?\d+(\.\d+)?$/.test(v) ? v : `"${short(v, 160)}"`);
    return `${ownSays ? `${cap(ownSays)}: ` : 'The value was not as expected: '}expected ${q(want)}, but found ${q(got)}.${serverLine}`;
  }

  // Anything else: the test's own sentence, or the first line.
  const first = ownSays || (msg.split('\n').find((l) => l.trim()) || '');
  return `${cap(short(first, 300))}${/[.!?]$/.test(first) ? '' : '.'}${serverLine}`;
}

/** The step split into what was done and what should have resulted. */
function narrateExpected(stepName) {
  const name = squash(stepName);
  const at = name.indexOf(' - ');
  if (at < 0) return { action: name, expected: `${name.replace(/[.\s]+$/, '')}.` };
  return { action: name.slice(0, at).trim(), expected: `${cap(name.slice(at + 3).trim().replace(/[.\s]+$/, ''))}.` };
}

/** What the application showed during the step, as short readable sentences. */
function narrateScreen(events) {
  const lines = [];
  const seen = new Set();
  for (const raw of events || []) {
    const m = String(raw).match(/^\+[\d.]+s \[([^\]]+)\] (.*)$/);
    if (!m) continue;
    const [, kind, text] = m;
    // The standing "Important: ... submitted for approval" banner of every form is not news.
    if (kind === 'alert' && /^Important:This plan will be submitted|^هام:/.test(text)) continue;
    let line = '';
    if (/^API (\d{3})/.test(kind)) {
      const status = kind.slice(4);
      const said = serverMessage(text).said || text.replace(/^\w+ \S+:\s*/, '');
      line = `The system refused an action (error ${status}): "${short(said, 160)}"`;
    } else if (kind === 'console error' || kind === 'page error') {
      if (/Failed to load resource/.test(text)) continue; // the API line above already says it
      line = `A technical error was logged by the page: "${short(text, 120)}"`;
    } else {
      const label = { toast: 'Message', alert: 'Notice', 'field error': 'Field error', dialog: 'Pop-up opened' }[kind] || cap(kind);
      line = `${label}: "${short(text, 160)}"`;
    }
    const key = line.toLowerCase().slice(0, 60);
    // "Saved as draft" and "Saved as draft Your changes..." are one toast.
    if ([...seen].some((k) => k.startsWith(key) || key.startsWith(k))) continue;
    seen.add(key);
    lines.push(line);
  }
  return lines.slice(-6);
}

/** "Step 4: Confirm the activation" - or just "Step 4" when the action IS the expectation. */
function stepHeading(n) {
  const same = n.expected.replace(/[.\s]+$/, '').toLowerCase() === n.action.replace(/[.\s]+$/, '').toLowerCase();
  return same ? `Step ${n.index}` : `Step ${n.index}: ${n.action}`;
}

/** One step's failure, ready for any report. */
function narrateStep(step) {
  const { action, expected } = narrateExpected(step.name);
  return {
    index: step.index,
    step: squash(step.name),
    action,
    expected,
    actual: narrateActual(step.reason),
    screen: narrateScreen(step.observed && step.observed.events),
  };
}

/** The whole failure as a few readable lines (HTML report, Azure, steps.txt). */
function narrateText(step) {
  const n = narrateStep(step);
  const lines = [stepHeading(n), `Expected: ${n.expected}`, `Actual: ${n.actual}`];
  if (n.screen.length) lines.push(`On screen at that moment: ${n.screen.join('; ')}.`);
  return lines.join('\n');
}

module.exports = { describeId, elementOf, narrateActual, narrateExpected, narrateScreen, narrateStep, narrateText, serverMessage, stepHeading };
