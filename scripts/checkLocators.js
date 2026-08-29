#!/usr/bin/env node
/**
 * Locator policy check.
 *
 * The application carries an `id` on every interactive element, so every
 * selector in this suite must be built from one. This script fails the build if
 * a Page Object reaches for anything else - a CSS class, an accessible name, a
 * `title` attribute, a cell position.
 *
 * It exists because the cleanup is the easy half. Without a guard, the next
 * person under time pressure writes `getByRole('button', { name: 'Save' })`,
 * it works today, and the suite drifts back to selectors that break the moment
 * a label is reworded or the UI is viewed in Arabic.
 *
 * Escape hatch: append a comment on the same line explaining why no id can
 * serve, and the line is allowed:
 *
 *     .locator('.p-dialog-mask')   // locator-exception: PrimeNG overlay, no app id
 *
 * Run:  npm run lint:locators
 */
const fs = require('fs');
const path = require('path');

const ROOTS = ['pages', 'utils', 'fixtures', 'tests', 'data', 'constants'];
const EXCEPTION = 'locator-exception:';

/** Selector strategies that must not be used unless an exception is stated. */
const BANNED = [
  { re: /getByPlaceholder\s*\(/, why: 'placeholder text is content, not identity' },
  { re: /getByLabel\s*\(/, why: 'label text is localized' },
  { re: /getByTitle\s*\(/, why: 'title text is localized' },
  { re: /getByAltText\s*\(/, why: 'alt text is content' },
  { re: /\[title\s*=/, why: 'the title attribute is localized' },
  { re: /\[aria-label\s*=/, why: 'aria-label is localized' },
  { re: /locator\(\s*['"`]\s*\./, why: 'CSS class selectors are styling, not identity' },
  {
    re: /getByRole\(\s*['"`](textbox|button|combobox|checkbox|radio|link|heading|cell|row|table|columnheader|tab|menuitem|menuitemradio|searchbox)['"`]/,
    why: 'role + accessible name depends on rendered text',
  },
  { re: /\.nth\(\s*\d+\s*\)/, why: 'positional access breaks when a column or control is added' },
];

/**
 * Strategies that ARE permitted, with the reason recorded once here rather than
 * repeated at every call site. Each is a case where the application exposes no
 * id that could serve.
 */
const ALLOWED = [
  { re: /getByRole\(\s*['"`]option['"`]/, why: 'PrimeNG option ids are render-order dependent and explicitly unusable' },
  { re: /getByRole\(\s*['"`]progressbar['"`]/, why: 'no global loading id is documented' },
  { re: /locator\(\s*['"`]html['"`]/, why: 'the document element, which has no id' },
  { re: /\[aria-(checked|selected|disabled|expanded)\s*=/, why: 'reads STATE, not identity' },
  { re: /p-dialog-mask|p-multiselect|p-select|p-progressspinner|p-progress-bar|pbm-loader|pbm-spinner|loading-overlay|data-loading|pbm-stepper__step/, why: 'PrimeNG internals with no id; identity still comes from an id' },
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

/**
 * Second rule: a locator rooted at the PAGE must reference an id.
 *
 * The banned list above catches named strategies, but not a raw structural
 * selector such as `page.locator('table tbody tr')`. Anything rooted at the page
 * is identifying an element from scratch, so it has to name an id - via `#id`,
 * or an `id^=` / `id$=` / `id*=` prefix match for the dynamic, record-keyed ones.
 *
 * A CHAINED `.locator('button')` is not flagged: it narrows inside an already
 * id-scoped locator, which is how the `pbm-button` host/inner-button pair and the
 * PrimeNG wrappers are reached.
 */
const ROOT_LOCATOR = /(?:^|[^.\w])page\s*\.locator\(\s*[`'"]([^`'"]+)[`'"]/;
const REFERENCES_ID = /#|id\^=|id\$=|id\*=|id=/;

const findings = [];
let scanned = 0;

for (const root of ROOTS) {
  for (const file of walk(root)) {
    scanned += 1;
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      const code = line.trim();
      // Skip comments and doc blocks - prose may legitimately name old selectors.
      if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return;
      // The marker may sit on this line or on any of the comment lines directly
      // above it, so a long explanation does not have to be crammed inline.
      if (line.includes(EXCEPTION)) return;
      for (let back = i - 1; back >= 0; back -= 1) {
        const prev = lines[back].trim();
        if (!prev.startsWith('//')) break;
        if (prev.includes(EXCEPTION)) return;
      }
      if (ALLOWED.some((a) => a.re.test(line))) return;

      const hit = BANNED.find((b) => b.re.test(line));
      if (hit) {
        findings.push({ file, line: i + 1, why: hit.why, text: code.slice(0, 110) });
        return;
      }

      const rooted = line.match(ROOT_LOCATOR);
      if (rooted && !REFERENCES_ID.test(rooted[1])) {
        findings.push({
          file,
          line: i + 1,
          why: `page-rooted selector "${rooted[1]}" names no id`,
          text: code.slice(0, 110),
        });
      }
    });
  }
}

console.log(`Locator policy: scanned ${scanned} files in ${ROOTS.join(', ')}`);

if (findings.length === 0) {
  console.log('PASS - every locator is built from an element id.');
  process.exit(0);
}

console.error(`\nFAIL - ${findings.length} locator(s) not built from an id:\n`);
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}`);
  console.error(`    ${f.text}`);
  console.error(`    why this is banned: ${f.why}`);
  console.error('');
}
console.error('Fix by using the element id (add it to constants/ElementIds.ts), or, if the');
console.error('application genuinely exposes no id, state why on the same line:');
console.error('    // locator-exception: <reason>\n');
process.exit(1);
