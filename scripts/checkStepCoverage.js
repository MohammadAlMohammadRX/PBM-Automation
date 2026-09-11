#!/usr/bin/env node
/**
 * Step-assertion policy check.
 *
 * The QA sheets state an Expected Result for EVERY step, so every step in a
 * spec should assert something. This fails the build when a step neither
 * asserts directly nor calls a helper that asserts on its behalf.
 *
 * Written as a policy check rather than a convention, because the convention
 * silently decayed once already: six cases were folding several of the sheet's
 * expectations into one step, and nothing caught it until the sheets were
 * re-read step by step.
 *
 * A step counts as asserting if its body:
 *   - calls `expect(` or `expect.` directly, or
 *   - calls a method whose name starts with `expect` (this framework's naming
 *     convention for an assertion helper), or
 *   - calls one of the ASSERTS_INTERNALLY helpers, whose assertion lives inside
 *     the Page Object, or
 *   - calls one of the ALLOWED_ACTIONS - the few steps that legitimately assert
 *     nothing at all, each listed with its reason.
 *
 * Usage:  npm run lint:steps
 */
const fs = require('fs');
const path = require('path');

const TEST_ROOT = path.join('tests', 'payer');

/**
 * Calls whose assertion is INSIDE the Page Object.
 *
 * These steps do fail when the application misbehaves - the expectation simply
 * lives one level down, which is where it belongs when every caller needs it.
 * `open()` asserting its own table rendered is the reason a missing list fails
 * at "Open the payer list" rather than several steps later against a row.
 */
const ASSERTS_INTERNALLY = [
  ['.open()', 'asserts its table rendered'],
  ['.openList()', 'asserts its table rendered'],
  ['.reopen()', 'reloads and asserts the table rendered'],
  ['.waitForLoaded()', 'asserts the screen mounted'],
  ['.waitForOpen()', 'asserts the drawer opened'],
  ['.search(', 'waits for the list to settle, and for the row when given one'],
  ['.recordIdOf(', 'asserts the row is visible before reading its id'],
  ['.createDraftPayer(', 'asserts the wizard saved'],
  ['.sendForApproval(', 'waits for the row, then confirms the dialog'],
  ['.approve(', 'asserts the request left the queue'],
  ['.reject(', 'asserts the request left the queue'],
  ['.switchTo(', 'asserts <html lang> changed'],
  ['.openEntry(', 'asserts the drawer title appeared'],
  ['.closeEntry()', 'asserts the drawer closed'],
  ['.inactivateWithFirstReason()', 'asserts the drawer closed after confirming'],
  ['.findAndInactivateRow(', 'searches and waits for the row before clicking'],
  ['.editTextFieldAndSave(', 'asserts the save completed'],
  ['.renamePayer(', 'asserts the save completed'],
  ['.getTabOrder()', 'reads the strip, which must exist'],
];

/**
 * Steps that are ACTIONS by design, with the reason each asserts nothing.
 *
 * Deliberately a short, explicit list. Anything not on it must assert, so a new
 * action-only step is a conscious decision that gets added here with its
 * reason, rather than slipping in unnoticed.
 */
const ALLOWED_ACTIONS = [
  ['NetworkUtils.failEndpoint', 'fault injection - nothing about the app to assert yet'],
  ['NetworkUtils.abortEndpoint', 'fault injection'],
  ['NetworkUtils.restoreEndpoint', 'fault removal - recovery is asserted in a later step'],
  ['NetworkUtils.failMutatingRequests', 'fault injection'],
  ['NetworkUtils.restore', 'fault removal'],
  ['NetworkUtils.rewriteJsonResponse', 'fault injection - the rendering is asserted next'],
  ['.blankStatusInListResponse()', 'fault injection - what the column then renders is asserted next'],
  ['.navigate()', 'deliberately does NOT assert the page rendered - the RBAC cases need it to be allowed to be denied'],
  ['.goToLastPage()', 'navigation - the resulting page state is asserted next'],
  ['.goToNextPage()', 'navigation - the resulting page is asserted next'],
  ['.goToPreviousPage()', 'navigation - the resulting page is asserted next'],
  ['.goToPage(', 'navigation - the resulting page is asserted next'],
  ['.openAuditHistory()', 'switches tab; the entries are asserted next'],
];

/**
 * Story folders the policy is ENFORCED on.
 *
 * Scoped rather than module-wide on purpose. The six stories written before
 * this policy existed contain steps that assert nothing, and failing the build
 * on them would mean either breaking `npm run lint` for everyone or rewriting
 * work nobody asked to change. They are still scanned and counted below, so the
 * debt is visible instead of hidden - it just does not block.
 *
 * Add a folder here as its story is brought up to the policy.
 */
const ENFORCED = [
  '07-view-paginated-payer-list-with-metrics',
  '08-display-payer-names-in-the-interface-language',
  '09-return-only-active-payers-in-cross-module-selection',
  '10-add-version-history-tab-to-payer-details',
  '11-automatically-discard-unapproved-registrations',
  '12-validate-payer-licence-number-length-and-required-entry',
  '13-detect-and-prevent-overwriting-concurrent-payer-edits',
  '14-refine-automatic-status-transitions-for-expiry-precedence',
  '15-provide-arabic-labels-for-all-approval-status-values',
  '16-define-bilingual-names-for-all-payer-module-permissions',
  '17-validate-payer-name-fields-for-language-specific-character-sets',
  '18-enforce-payer-email-uniqueness-across-the-register',
  '19-strengthen-guardrails-and-messaging-for-payer-activation',
  '20-restrict-expiry-date-to-today-or-later',
  '21-enable-network-activation-regardless-of-payer-status',
  '22-validate-a-payer-deletion-against-its-dependencies',
  '23-reject-submissions-and-saves-that-change-nothing',
  '24-warn-before-withdrawing-a-pending-approval',
  '25-confirm-a-submission-with-a-bilingual-toast',
  '26-require-a-reason-when-rejecting-a-request',
  '27-explain-inactivation-and-reactivation-effects',
  '28-ask-which-rows-to-export-when-a-filter-is-applied',
  '29-show-an-explicit-empty-state-in-version-history',
  '30-check-the-record-version-at-save-time',
  '31-guard-publishing-and-reverting-a-payer-version',
  '32-revalidate-network-selection-at-approval-time',
  '33-validate-payer-creation-input-fields',
  '34-display-toast-notification-on-payer-creation',
  '36-manually-inactivate-active-payer',
  '38-manually-reactivate-inactive-payer',
  '39-display-linked-networks-count-on-payer-list',
  '40-display-linked-members-count-on-payer-list',
  '41-validate-payercode-uniqueness-on-approval',
  '42-select-country-from-the-central-country-catalogue',
  '43-derive-initial-payer-status-from-effective-date-on-approval',
  '44-prevent-invalid-status-transitions-manually',
  '45-display-color-coded-status-tags-on-payer-list',
];

const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.spec.ts')) files.push(full);
  }
})(TEST_ROOT);

const isEnforced = (file) => ENFORCED.some((dir) => file.includes(dir));

const offenders = [];
const legacy = [];
let stepCount = 0;
let enforcedSteps = 0;

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const parts = src.split(/await steps\.(step|critical)\(/);
  for (let i = 1; i < parts.length; i += 2) {
    const body = parts[i + 1] || '';
    const name = (body.match(/^\s*[`'"]([^`'"]*)/) || [, '(unnamed)'])[1];
    stepCount += 1;
    if (isEnforced(file)) enforcedSteps += 1;

    const assertsDirectly = /\bexpect\s*[.(]/.test(body);
    const assertsViaHelper = /\.\s*expect[A-Z]\w*\s*\(/.test(body);
    const internal = ASSERTS_INTERNALLY.find(([needle]) => body.includes(needle));
    const allowed = ALLOWED_ACTIONS.find(([needle]) => body.includes(needle));

    if (!assertsDirectly && !assertsViaHelper && !internal && !allowed) {
      (isEnforced(file) ? offenders : legacy).push({ file, name });
    }
  }
}

console.log(
  `Step policy: ${enforcedSteps} step(s) enforced across ${ENFORCED.length} stories `
  + `(${stepCount} scanned in total)`,
);

if (legacy.length > 0) {
  console.log(
    `  note: ${legacy.length} non-asserting step(s) in the stories written before this `
    + 'policy - reported, not enforced',
  );
}

if (offenders.length === 0) {
  console.log('PASS - every enforced step asserts, or is a listed action-only step.');
  process.exit(0);
}

console.error(`\nFAIL - ${offenders.length} enforced step(s) assert nothing:\n`);
for (const o of offenders) {
  console.error(`  ${o.file}`);
  console.error(`    "${o.name}"`);
}
console.error(
  '\nEvery step should assert its own expected result - the QA sheets state one per step.'
  + '\nEither add the assertion, or, if the step is genuinely an action, add its call to'
  + '\nALLOWED_ACTIONS in scripts/checkStepCoverage.js with the reason.',
);
process.exit(1);
