#!/usr/bin/env node
/**
 * Builds the payer-module test report from a run's results.json.
 *
 * Everything in the output is read from the run - statuses, observed values and
 * the step breakdown - so the report cannot drift from what actually happened.
 * The one editorial choice is the "expected result", which is taken from each
 * test's own title: the titles are written as requirement statements ("should
 * save the payer as a private Draft when ..."), which is exactly what the case
 * is asserting.
 *
 * Usage:  node scripts/buildReport.js [results.json] [out.html]
 *         npm run report:doc
 */
const fs = require('fs');
const path = require('path');

const IN = process.argv[2] || path.join('reports', 'results.json');
const OUT = process.argv[3] || path.join('reports', 'PBM-Payer-Module-Test-Results.html');
/**
 * Optional: the partials directory the merged input was built from. When given,
 * the running time is the ACTIVE execution time - wall clock minus the periods
 * the machine was asleep or frozen - per scripts/executionTiming.js.
 */
const PARTIALS_DIR = process.argv[4] || '';

const ANSI = /\[[0-9;]*m/g;
const clean = (t) => (t || '').replace(ANSI, '').trim();

/**
 * Directory name -> the user story as the QA documents name it.
 *
 * Order here is the order of the report. A story directory that is NOT listed
 * still appears, but lands in an unnamed "Other" bucket - so every new story
 * folder needs a line here, or its cases lose the requirement they trace to.
 */
const STORIES = [
  ['07-view-paginated-payer-list-with-metrics', 'View Paginated Payer List with Metrics'],
  ['08-display-payer-names-in-the-interface-language', 'Display Payer Names in the Interface Language'],
  [
    '09-return-only-active-payers-in-cross-module-selection',
    'Return Only Active Payers with Status in Cross-Module Payer Selection',
  ],
  ['10-add-version-history-tab-to-payer-details', 'Add Version History Tab to Payer Details'],
  [
    '11-automatically-discard-unapproved-registrations',
    'Automatically Discard Unapproved Registrations Past Their Effective Window',
  ],
  [
    '12-validate-payer-licence-number-length-and-required-entry',
    'Validate Payer Licence Number Length and Required Entry',
  ],
  [
    '13-detect-and-prevent-overwriting-concurrent-payer-edits',
    'Detect and Prevent Overwriting Concurrent Payer Edits',
  ],
  [
    '14-refine-automatic-status-transitions-for-expiry-precedence',
    'Refine Automatic Status Transitions for Expiry Precedence and Recalculation on Edit',
  ],
  [
    '15-provide-arabic-labels-for-all-approval-status-values',
    'Provide Arabic Labels for All Approval Status Values, Including Withdrawn',
  ],
  [
    '16-define-bilingual-names-for-all-payer-module-permissions',
    'Define Bilingual Names for All Payer Module Permissions',
  ],
  [
    '17-validate-payer-name-fields-for-language-specific-character-sets',
    'Validate Payer Name Fields for Language-Specific Character Sets and Arabic Name Length',
  ],
  [
    '18-enforce-payer-email-uniqueness-across-the-register',
    'Enforce Payer Email Uniqueness Across the Register',
  ],
  [
    '19-strengthen-guardrails-and-messaging-for-payer-activation',
    'Strengthen Guardrails and Messaging for Payer Activation, Inactivation and Reactivation',
  ],
  [
    '20-restrict-expiry-date-to-today-or-later',
    'Restrict Expiry Date to Today or Later',
  ],
  [
    '21-enable-network-activation-regardless-of-payer-status',
    'Enable Network Activation Regardless of Payer Status',
  ],
  [
    '22-validate-a-payer-deletion-against-its-dependencies',
    'Validate a Payer Deletion Against Its Dependencies',
  ],
  [
    '23-reject-submissions-and-saves-that-change-nothing',
    'Reject Submissions and Saves That Change Nothing',
  ],
  [
    '24-warn-before-withdrawing-a-pending-approval',
    'Warn Before an Edit or Delete Withdraws a Pending Approval',
  ],
  [
    '25-confirm-a-submission-with-a-bilingual-toast',
    'Confirm a Submission with a Bilingual Toast',
  ],
  [
    '26-require-a-reason-when-rejecting-a-request',
    'Require a Reason When Rejecting a Request',
  ],
  [
    '27-explain-inactivation-and-reactivation-effects',
    'Explain Inactivation and Reactivation Effects Before They Are Applied',
  ],
  [
    '28-ask-which-rows-to-export-when-a-filter-is-applied',
    'Ask Which Rows to Export When a Filter Is Applied',
  ],
  [
    '29-show-an-explicit-empty-state-in-version-history',
    'Show an Explicit Empty State in Version History',
  ],
  [
    '30-check-the-record-version-at-save-time',
    'Check the Record Version at Save Time',
  ],
  [
    '31-guard-publishing-and-reverting-a-payer-version',
    'Guard Publishing and Reverting a Payer Version',
  ],
  [
    '32-revalidate-network-selection-at-approval-time',
    'Re-validate Network Selection at Approval Time',
  ],
  [
    '33-validate-payer-creation-input-fields',
    'Validate Payer Creation Input Fields',
  ],
  [
    '34-display-toast-notification-on-payer-creation',
    'Display Toast Notification on Payer Creation',
  ],
  [
    '36-manually-inactivate-active-payer',
    'Manually Inactivate Active Payer',
  ],
  [
    '38-manually-reactivate-inactive-payer',
    'Manually Reactivate Inactive Payer',
  ],
  [
    '39-display-linked-networks-count-on-payer-list',
    'Display Linked Networks Count on Payer List',
  ],
  [
    '40-display-linked-members-count-on-payer-list',
    'Display Linked Members Count on Payer List',
  ],
  [
    '41-validate-payercode-uniqueness-on-approval',
    'Validate PayerCode Uniqueness on Approval',
  ],
  [
    '42-select-country-from-the-central-country-catalogue',
    'Select Country from the Central Country Catalogue',
  ],
  [
    '43-derive-initial-payer-status-from-effective-date-on-approval',
    'Derive Initial Payer Status from Effective Date on Approval',
  ],
  [
    '44-prevent-invalid-status-transitions-manually',
    'Prevent Invalid Status Transitions Manually',
  ],
  [
    '45-display-color-coded-status-tags-on-payer-list',
    'Display Color-Coded Status Tags on Payer List',
  ],
  [
    '46-show-created-modified-metadata-on-payer-overview',
    'Show Created-Modified Metadata on Payer Overview',
  ],
  [
    '47-restrict-effective-date-to-today-or-later',
    'Restrict Effective Date to Today or Later',
  ],
  [
    '48-keep-a-rejected-payer-registration-visible-and-editable',
    'Keep a Rejected Payer Registration Visible and Editable',
  ],
  [
    '49-show-approval-status-across-list-cards-and-payer-details',
    'Show Approval Status Across List, Cards and Payer Details',
  ],
  [
    '50-help-icon-banners-on-payer-details',
    'Help Icon (What-To-Do-Next) Banners on Payer Details',
  ],
  [
    '51-show-inactivation-reason-details-by-and-on-while-inactive',
    'Show Inactivation Reason, Details, By and On While a Payer Is Inactive',
  ],
  [
    '52-preview-impact-before-confirming-inactivation',
    'Preview Impact Before Confirming Inactivation',
  ],
  [
    '53-capture-and-display-payer-licence-number',
    'Capture and Display Payer Licence Number',
  ],
  ['54-display-read-only-linked-policies-list', 'Display Read-Only Linked Policies List'],
  ['55-manage-linked-networks-from-payer-details', 'Manage Linked Networks from Payer Details'],
  [
    '56-trigger-downstream-impact-analysis-on-status-change',
    'Trigger Downstream Impact Analysis on Status Change',
  ],
  [
    '57-restrict-payer-visibility-to-a-users-assigned-scope',
    'Restrict Payer Visibility to a User\'s Assigned Scope',
  ],
  [
    '58-show-draft-assignment-removal-states-and-reserve-networks-being-staged',
    'Show Draft Assignment/Removal States and Reserve Networks Being Staged',
  ],
  [
    '59-re-check-network-removal-dependency-at-both-staging-and-approval',
    'Re-check Network Removal Dependency at Both Staging and Approval',
  ],
  ['60-show-real-facility-count-per-linked-network', 'Show Real Facility Count per Linked Network'],
  ['61-stop-payer-validity-in-bre-on-expiry', 'Stop Payer Validity in BRE on Expiry'],
  [
    '62-maintain-member-eligibility-until-policy-expiry',
    'Maintain Member Eligibility Until Policy Expiry',
  ],
  ['63-submit-a-payer-draft-for-approval', 'Submit a Payer Draft for Approval'],
  [
    '64-cascade-inactivation-to-plans-and-policies-and-restore-on-reactivation',
    'Cascade Inactivation to Plans and Policies, Restore on Reactivation',
  ],
  [
    '65-revert-a-payer-to-a-previously-published-version',
    'Revert a Payer to a Previously Published Version',
  ],
  [
    '66-make-the-lifecycle-job-schedule-configurable-and-resilient',
    'Make the Lifecycle Job Schedule Configurable and Resilient',
  ],
  ['67-withdraw-a-payer-change-before-it-is-reviewed', 'Withdraw a Payer Change Before It Is Reviewed'],
  [
    '68-add-inactivate-view-details-and-approval-permissions',
    'Add Inactivate, View Details and Approval Permissions',
  ],
  [
    '69-reconstruct-a-payers-historical-configuration',
    'Reconstruct a Payer\'s Historical Configuration',
  ],
  ['70-export-payer-list-to-csv-and-excel', 'Export Payer List to CSV and Excel'],
  ['71-display-payer-audit-history-with-filters', 'Display Payer Audit History with Filters'],
  ['72-display-toast-notification-on-payer-update', 'Display Toast Notification on Payer Update'],
  ['73-view-comprehensive-payer-details-with-tabs', 'View Comprehensive Payer Details with Tabs'],
  [
    '74-automatically-transition-payer-status-to-active',
    'Automatically Transition Payer Status to Active',
  ],
  [
    '75-automatically-transition-payer-status-to-expired',
    'Automatically Transition Payer Status to Expired',
  ],
  // The three stories added from the 2026-09-27 change sheet. Missing here, so
  // the first full run that reached them reported all 44 cases under "Other".
  ['76-enforce-unique-active-payer-names', 'Enforce Unique Active Payer Names'],
  ['77-clone-an-existing-payer-record', 'Clone an Existing Payer Record'],
  ['78-bulk-import-and-export-payer-records', 'Bulk Import and Export Payer Records'],
  ['01-create-new-payer-organization-record', 'Create New Payer Organization Record'],
  ['04-edit-existing-payer-configuration-details', 'Edit Existing Payer Configuration Details'],
  ['06-delete-payer-with-dependency-validation', 'Delete Payer with/without Dependency Validation'],
  ['03-search-payers-by-name-or-code', 'Search Payers by Name or Code'],
  ['02-filter-payer-list-by-type-and-status', 'Filter Payer List by Type and Status'],
  ['05-sort-payer-list-by-column-headers', 'Sort Payer List by Column Headers'],
];

const ORDER = ['PASS', 'FAIL', 'BLOCKED', 'SKIPPED'];

if (!fs.existsSync(IN)) {
  console.error(`No results file at ${IN}. Run the suite with no --reporter flag first.`);
  process.exit(2);
}

const raw = JSON.parse(fs.readFileSync(IN, 'utf8'));

/**
 * Two accepted inputs:
 *   - a Playwright results.json, which this script derives everything from;
 *   - an already-prepared dataset (it has `stories`), which is rendered as-is.
 * The second exists so a report can be rebuilt for a run whose results.json is
 * gone, without this renderer having to know where the data came from.
 */
const PREPARED = Array.isArray(raw.stories);

// Taken from the RUN, not from the clock: the report describes when the suite
// executed, which is not necessarily when the document was generated.
const RUN_DATE = (() => {
  if (Array.isArray(raw.stories) && raw.runDate) return raw.runDate;
  const iso = raw.stats?.startTime;
  if (!iso) return 'not recorded in results.json';
  const d = new Date(iso);
  return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
})();

const RUN_ENV = (Array.isArray(raw.stories) && raw.environment) || process.env.BASE_URL
  || (fs.existsSync('.env')
    ? (fs.readFileSync('.env', 'utf8').match(/^BASE_URL=(.*)$/m) || [, 'see .env'])[1].trim()
    : 'see .env');

// ---- collect every case ---------------------------------------------------
const cases = [];

(function walk(suites, hint = '', titles = []) {
  for (const suite of suites || []) {
    const file = suite.file || hint;
    const chain = [...titles, suite.title || ''];
    // A case under a describe tagged [MANUAL] is not executed by the
    // automation - it is skipped by design - so it is kept out of the results.
    const manual = chain.some((t) => /\[MANUAL\]/.test(t));
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const results = test.results || [];
        const last = results[results.length - 1] || {};
        const ann = {};
        for (const a of test.annotations || []) ann[a.type] = a.description || '';

        let steps = [];
        if (ann.steps) {
          try {
            steps = JSON.parse(ann.steps);
          } catch {
            steps = [];
          }
        }

        cases.push({
          file,
          manual,
          storyDir: (file || '').split(/[\\/]/).slice(-2, -1)[0] || '',
          title: spec.title,
          playwrightStatus: last.status || test.status || 'unknown',
          durationMs: results.reduce((n, r) => n + (r.duration || 0), 0),
          ann,
          steps,
          message: clean(
            results.flatMap((r) => (r.errors || []).map((e) => e.message)).join('\n'),
          ),
        });
      }
    }
    walk(suite.suites, file, chain);
  }
})(raw.suites);

// MANUAL STORIES ARE LEFT OUT (2026-10-07). They are skipped by design - they
// need scheduled jobs or time to pass - so counting them inflated the case total
// and the SKIPPED share and pulled every percentage down. The report states
// which stories were excluded instead of carrying them as results.
const executed = cases.filter((c) => !/setup/.test(c.file || ''));
const testCases = executed.filter((c) => !c.manual);
const manualCases = executed.filter((c) => c.manual);
/** Folders whose every case is manual - their run time is excluded too. */
const MANUAL_DIRS = [...new Set(manualCases.map((c) => c.storyDir))]
  .filter((d) => !testCases.some((c) => c.storyDir === d));

// ---- QA-lead overrides (optional, REPORT_OVERRIDES=<json>) -------------------
// Decisions recorded in reports/qa-review/report-overrides.json. The run's own
// result is never altered: an overridden case keeps its original status and
// actual result beside the decision, and removed stories are listed with the
// reason rather than silently dropped.
const OVERRIDES = (() => {
  const file = process.env.REPORT_OVERRIDES;
  if (!file || !fs.existsSync(file)) return { statusOverrides: [], removeStories: [], storyLabels: [] };
  return JSON.parse(fs.readFileSync(file, 'utf8'));
})();
const dirOfStory = (name) => (STORIES.find(([, n]) => n === name) || [''])[0];
const REMOVED = (OVERRIDES.removeStories || []).map((r) => ({ ...r, dir: dirOfStory(r.name) })).filter((r) => r.dir);
const removedCases = [];
for (let i = testCases.length - 1; i >= 0; i -= 1) {
  const hit = REMOVED.find((r) => r.dir === testCases[i].storyDir);
  if (hit) removedCases.push(...testCases.splice(i, 1).map((c) => ({ ...c, removedBy: hit })));
}

// ---- status + expected/actual --------------------------------------------
function statusOf(c) {
  if (c.ann.blocked !== undefined) return 'BLOCKED';
  if (c.playwrightStatus === 'skipped') return 'SKIPPED';
  if (c.playwrightStatus === 'passed') return 'PASS';
  return 'FAIL';
}

/**
 * The failure signatures the "Select a Payer" scope gate leaves behind.
 *
 * Since 2026-09-27 the payer list shows ONE payer at a time, where it used to
 * return the whole register (1216 rows). Every case that asserts across the
 * register - filter, sort, paginate, count, search, export scope - now fails,
 * and fails in a recognisable way: the list is empty once filtered, a search
 * for a payer that is not the one in scope returns nothing, there is no second
 * page, or "mixed types" turns out to be a single type.
 *
 * These are NOT defects and NOT test faults: they are cases whose premise the
 * product has withdrawn, and they need re-baselining with the business rather
 * than a fix. Labelling them from the failure text rather than a hand-kept
 * list means the label cannot drift as folders are added.
 */
const SCOPE_GATE_SIGNATURES = [
  /Received:\s*"<empty>"/i,
  /"none" below means the search returned/i,
  /should include the payer .*, and did not/i,
  /payer-list-table-pager-page-2/i,
  /Expected substring: ","/,
  /waiting for locator\('#payer-list-table-el'\)/i,
  // Added after folders 06-07: the same one-payer list, different wording.
  /No payer with a linked network found in the first/i,
  /needs at least three pages/i,
  /should settle at a full page of rows/i,
  /offered \[none\]/i,
  /the total counter should read/i,
];

/**
 * Cases whose ACCEPTANCE CRITERIA describe something the product does not have.
 *
 * Distinct from the scope gate, and the distinction matters to whoever reads
 * the report: a scope-gate case tested something real that the product has
 * since narrowed, while these describe a control that was specified and never
 * built - a configurable page size, a manual "go to page" input, a
 * newest-to-oldest sort. Both need a business conversation; only the second is
 * a gap between the specification and the build.
 */
const SPEC_GAP_SIGNATURES = [
  /acceptance criteria require/i,
  /the list should open on its default sort/i,
  /the indicator should report "Newest to Oldest"/i,
];

/**
 * WITHDRAWN 2026-10-04, kept rather than deleted.
 *
 * The build deployed that morning restored "All Payers" - it is the DEFAULT
 * breadcrumb scope now, and GetPayers answers with the whole register again
 * (1298 rows). The gate these signatures describe is gone, so every one of
 * them has become a way to MISLABEL A GENUINE FAILURE: `Received: "<empty>"`
 * matches any assertion that found an empty list, for any reason at all, and
 * the label would tell the business team to re-baseline a case that is in
 * fact broken.
 *
 * Flip SCOPE_GATE_ACTIVE back to true if the gate ever returns; the
 * signatures below were earned over three folders and are worth keeping.
 */
const SCOPE_GATE_ACTIVE = false;

function isScopeGate(c, status) {
  if (!SCOPE_GATE_ACTIVE) return false;
  if (status !== 'FAIL') return false;
  const text = [c.message || '', ...(c.steps || []).map((s) => s.detail || s.reason || '')].join(' ');
  if (SPEC_GAP_SIGNATURES.some((pattern) => pattern.test(text))) return false;
  return SCOPE_GATE_SIGNATURES.some((pattern) => pattern.test(text));
}

function isSpecGap(c, status) {
  if (status !== 'FAIL') return false;
  const text = [c.message || '', ...(c.steps || []).map((s) => s.detail || s.reason || '')].join(' ');
  return SPEC_GAP_SIGNATURES.some((pattern) => pattern.test(text));
}

/**
 * `15803: should block ...` -> { id: '15803', expected: 'Should block ...' }
 *
 * The bare number is an AZURE DEVOPS test-case id, which is what the titles now
 * lead with. The `TC-`/`AC-`/`ST-` forms are still accepted: 43 cases have no
 * Azure id yet and keep their sheet number, and older result files still carry
 * the previous titles.
 */
/**
 * The expected result in words anyone can read (QA-lead note N-016,
 * 2026-10-11): the case's claim as a sentence, then its steps in order. Step
 * names are written as the outcome each step expects ("The Create New Payer
 * action is not offered"), so together they ARE the expected behaviour - the
 * raw test title alone ("Should deny ... when ...") was not enough for someone
 * outside the team to follow.
 */
function readableExpected(c) {
  const claim = String(c.expected || '').replace(/^Should\s+/i, 'The system should ');
  const sentence = /[.!?]$/.test(claim) ? claim : `${claim}.`;
  const steps = (c.steps || []).map((s) => String(s.name || '').trim()).filter(Boolean);
  return { sentence, steps };
}

function splitTitle(title) {
  const m = title.match(/^\s*((?:TC|AC|ST)-\d+|\d{4,})\s*:\s*(.*)$/);
  if (!m) return { id: '-', expected: title.trim() };
  const text = m[2].trim();
  return { id: m[1], expected: text.charAt(0).toUpperCase() + text.slice(1) };
}

/**
 * The observed result, in the words of the run.
 *
 * An Expected/Received pair is the most useful form for a defect report - it is
 * literally what the application produced - so it is preferred over the raw
 * assertion text where present.
 */
/**
 * The actual result for one failed assertion: the test's OWN explanation first,
 * then the observed values where they add something.
 *
 * FIXED 2026-10-11. This used to return only the matcher's values whenever
 * Expected/Received were present, which discarded the sentence the test wrote
 * for exactly this purpose. 36 failed cases read "Observed false - expected
 * true" in the report while the raw result said, for instance, "The approval
 * queue should list X after it was submitted ... the submission did not reach
 * the queue". The actual result is what bug reports are written from, so the
 * explanation must survive.
 */
function observed(message) {
  const msg = clean(message);
  if (!msg) return '';
  // Everything before Playwright's matcher echo is the test's own message.
  const own = msg.split(/\s*expect\((?:received|locator)\)|\n\s*Expected:/)[0].trim().replace(/[.:\s]+$/, '');
  const detail = observedDetail(msg);
  if (!own || own.length < 4 || /^Error:?$/i.test(own)) return detail;
  const bare = /^Observed (true|false) — expected (true|false)\.$/.test(detail)
    || /^The (expected|element|number|expected control)\b/.test(detail);
  if (!detail || bare || detail.startsWith(own.slice(0, 40))) return `${own}.`;
  const values = detail.match(/^Observed (.+) — expected (.+)\.$/);
  return values ? `${own} — observed ${values[1]}, expected ${values[2]}.` : `${own}. ${detail}`;
}

/** The matcher-level reading of a failure: values, timeout or locator state. */
function observedDetail(message) {
  const msg = clean(message);
  if (!msg) return '';

  const pair = msg.match(/Expected:?\s*(?:pattern|substring|string)?\s*(.+?)\n+Received:?\s*(?:string|array|object)?\s*(.+?)(?:\n|$)/s);
  if (pair) {
    // A leading ":" survives shapes like "Received: string: \"x\"", so it is
    // trimmed here rather than complicating the pattern above.
    const tidy = (t) => t.replace(/\s+/g, ' ').replace(/^:\s*/, '').trim().slice(0, 240);
    const exp = tidy(pair[1]);
    const got = tidy(pair[2]);
    return `Observed ${got} — expected ${exp}.`;
  }

  const timeout = msg.match(/Timeout\s+(\d+)ms exceeded while waiting on the predicate/);
  if (timeout) {
    return `The expected condition was never met within ${
      Number(timeout[1]) / 1000
    }s of polling.`;
  }

  // "(expected)" as well as "()": toHaveText / toContainText name their
  // argument, and an empty-brackets-only pattern let them fall through.
  const locator = msg.match(/expect\(locator\)\.(\w+)\([^)]*\)/);
  if (locator) {
    // SAY WHAT WAS MISSING, AND WHERE (2026-10-11, QA-lead note N-036). The
    // raw message names the element, the expected value and whether the
    // element existed at all; "toHaveText failed" threw all three away. 15852
    // read "expect(locator).toHaveText(expected) failed" while the run had
    // recorded that the error message "Effective date cannot be earlier than
    // today." never appeared under the date field.
    const where = (msg.match(/Locator:\s*locator\('([^']+)'\)/) || [])[1];
    const wanted = ((msg.match(/Expected(?: string| pattern| substring)?:\s*(.+)/) || [])[1] || '').trim();
    const got = ((msg.match(/Received(?: string)?:\s*(.+)/) || [])[1] || '').trim();
    const missing = /element\(s\) not found/.test(msg);
    const secs = (msg.match(/Timeout:\s*(\d+)ms/) || [])[1];
    const verb = {
      toBeVisible: 'to be visible', toBeHidden: 'to disappear', toBeEnabled: 'to be enabled',
      toBeDisabled: 'to be disabled', toContainText: 'to contain', toHaveText: 'to read', toHaveCount: 'to number',
    }[locator[1]];
    if (where && verb) {
      const name = where.replace(/^#/, '').replace(/[-_]+/g, ' ');
      const value = wanted && !/^(visible|hidden|enabled|disabled)$/i.test(wanted) ? ` ${wanted}` : '';
      const wait = secs ? ` (waited ${Number(secs) / 1000} s)` : '';
      if (missing) return `Expected "${name}" ${verb}${value}, but that element never appeared on the page${wait}.`;
      if (got) return `Expected "${name}" ${verb}${value}; it showed ${got}${wait}.`;
    }
    const map = {
      toBeVisible: 'The expected element never became visible.',
      toBeHidden: 'The element that should have disappeared stayed on screen.',
      toBeEnabled: 'The expected control never became enabled.',
      toContainText: 'The element did not contain the expected text.',
      toHaveCount: 'The number of matching elements differed from the expectation.',
    };
    if (map[locator[1]]) return map[locator[1]];
  }

  return (msg.split('\n').find((l) => l.trim()) || '').slice(0, 220);
}

function actualOf(c, status) {
  if (status === 'PASS') return 'As expected.';
  if (status === 'BLOCKED') return c.ann.blocked;
  if (status === 'SKIPPED') {
    if (c.ann['dependency-skipped']) return `Not run — ${c.ann['dependency-skipped']}.`;
    return c.ann.skip || c.ann.fixme || 'Intentionally excluded from this execution.';
  }

  const failed = c.steps.filter((s) => s.status === 'FAIL');
  const notRun = c.steps.filter((s) => s.status === 'NOT EXECUTED').length;

  if (!failed.length) {
    const detail = observed(c.message);
    return c.steps.length === 0
      ? `The test body never ran — a fixture could not provision its precondition. ${detail}`
      : detail || 'Failed with no detail captured.';
  }

  const parts = failed.map(
    (s) => `Step ${s.index} (${s.name}): ${observed(s.reason) || clean(s.reason)}`,
  );
  if (notRun) {
    parts.push(
      `${notRun} later step${notRun === 1 ? '' : 's'} not executed, because a step they depend on failed.`,
    );
  }
  return parts.join(' ');
}

for (const c of testCases) {
  c.status = statusOf(c);
  c.scopeGate = isScopeGate(c, c.status);
  c.specGap = isSpecGap(c, c.status);
  const t = splitTitle(c.title);
  c.id = t.id;
  c.expected = t.expected;
  c.actual = actualOf(c, c.status);
  if (c.scopeGate) {
    c.actual = `[SCOPE GATE] ${c.actual} — this case asserts across the whole payer `
      + 'register, which the application no longer shows: since 2026-09-27 the list holds one '
      + 'payer at a time. Needs re-baselining with the business, not a fix.';
  }
  if (c.specGap) {
    c.actual = `[SPEC GAP] ${c.actual} — the acceptance criteria describe a control the `
      + 'product does not have. Specified but not built, rather than broken.';
  }
  // What the RUN said, kept before any decision is applied - the re-run diff
  // compares run results, and an overridden case shows this beside the decision.
  c.runStatus = c.status;
  const decision = (OVERRIDES.statusOverrides || []).find((o) => o.cases.includes(c.id));
  if (decision && decision.status !== c.status) {
    c.override = decision;
    c.actual = `[${decision.ref}] ${decision.label} Original result: ${c.runStatus} — ${c.actual}`;
    c.status = decision.status;
  }
}

const scopeGateCount = testCases.filter((c) => c.scopeGate).length;
const specGapCount = testCases.filter((c) => c.specGap).length;

// ---- group by story ------------------------------------------------------
const grouped = STORIES.map(([dir, name]) => ({
  name,
  dir,
  cases: testCases.filter((c) => c.storyDir === dir),
})).filter((g) => g.cases.length);

const other = testCases.filter((c) => !STORIES.some(([d]) => d === c.storyDir));
if (other.length) grouped.push({ name: 'Other', dir: '', cases: other });

let totals = Object.fromEntries(ORDER.map((s) => [s, 0]));
for (const c of testCases) totals[c.status] += 1;

if (PREPARED) {
  grouped.length = 0;
  for (const st of raw.stories) {
    grouped.push({
      name: st.name,
      dir: '',
      cases: st.cases.map((c) => ({ ...c, durationMs: c.durationMs || 0 })),
    });
  }
  totals = raw.totals;
}

/** Case count for the header and the percentages, from whichever path ran. */
const CASE_COUNT = PREPARED
  ? Object.values(raw.totals).reduce((a, b) => a + b, 0)
  : testCases.length;

const totalMs = testCases.reduce((n, c) => n + c.durationMs, 0);
const workers = PREPARED ? raw.workers : (raw.config?.metadata?.actualWorkers ?? raw.config?.workers ?? '-');
let durationMs = PREPARED ? raw.durationMs : (raw.stats?.duration ?? totalMs);

// ---- active execution time ----------------------------------------------
// Wall clock overstates the run whenever the machine slept mid-folder, so with
// the partials to hand the duration is recomputed as ACTIVE time, and folders
// holding only manual stories are left out of it as they are out of the cases.
let timing = null;
if (!PREPARED && PARTIALS_DIR && fs.existsSync(PARTIALS_DIR)) {
  const { measureTiming } = require('./executionTiming');
  const all = measureTiming(PARTIALS_DIR);
  // Removed stories are out of the time as they are out of the cases.
  const manualFolders = new Set([...MANUAL_DIRS, ...REMOVED.map((r) => r.dir)].map((d) => d.slice(0, 2)));
  const folders = all.folders.filter((f) => !manualFolders.has(f.folder));
  const sum = (k) => folders.reduce((n, f) => n + f[k], 0);
  const starts = folders.map((f) => f.start).filter(Boolean).sort();
  const ends = folders.map((f) => f.end).filter(Boolean).sort();
  timing = {
    thresholdSec: all.thresholdSec,
    folders,
    wallMs: sum('wallMs'),
    frozenMs: sum('frozenMs'),
    activeMs: sum('activeMs'),
    firstStart: starts[0] || null,
    lastEnd: ends[ends.length - 1] || null,
  };
  durationMs = timing.activeMs;
}

/** Hours and minutes - a 26-hour run read as "1606m" is not a duration anyone can use. */
const hm = (ms) => `${Math.floor(ms / 3600000)}h ${Math.round((ms % 3600000) / 60000)}m`;
const MANUAL_STORY_NAMES = MANUAL_DIRS.map((d) => (STORIES.find(([dir]) => dir === d) || [d, d])[1]);

// ---- render --------------------------------------------------------------
const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Story tag, because case ids repeat across stories (TC-003 exists in four). */
const tagOf = (name) => name.replace(/[^A-Za-z ]/g, '').split(' ')[0].slice(0, 3).toUpperCase();

/** Cases that did not pass come first; failures before blocked before skipped. */
const RANK = { FAIL: 0, BLOCKED: 1, SKIPPED: 2, PASS: 3 };
const byAttention = (a, b) =>
  RANK[a.status] - RANK[b.status] || a.id.localeCompare(b.id, 'en', { numeric: true });

/** True when the two runs of the day did not agree on this case. */
const disputed = (c) =>
  c.reproducibility === 'unstable' || c.reproducibility === 'same-status-different-cause';

/** Quoted values inside a sentence are data - set them in mono. */
const codeify = (t) =>
  esc(t).replace(/&quot;([^&]*?)&quot;/g, '<code>$1</code>');

const mins = (ms) => `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
const pct = (n) => (CASE_COUNT ? Math.round((n / CASE_COUNT) * 100) : 0);

function storyCounts(g) {
  const c = Object.fromEntries(ORDER.map((s) => [s, 0]));
  for (const x of g.cases) c[x.status] += 1;
  return c;
}

function stepsHtml(c) {
  if (!c.steps.length || c.status === 'PASS') return '';
  const rows = c.steps
    .map(
      (s) => `<li class="st st--${s.status.replace(' ', '-').toLowerCase()}">
        <span class="st__n">${s.index}</span>
        <span class="st__s">${esc(s.status)}</span>
        <span class="st__t">${esc(s.name)}${
        s.reason ? `<em>${codeify(clean(s.reason).split('\n')[0].slice(0, 200))}</em>` : ''
      }${
        s.screenshot
          ? `<em class="shot">Screenshot at this step: <code>${esc(
              s.screenshot.split(/[\/]/).pop(),
            )}</code></em>`
          : ''
      }</span>
      </li>`,
    )
    .join('');
  const partial = c.stepsPartial
    ? '<p class="partial">The run log truncated this step list; later steps are not shown.</p>'
    : '';
  return `<details class="steps"><summary>Step-by-step result (${c.steps.length} step${
    c.steps.length === 1 ? '' : 's'
  })</summary><ol class="stl">${rows}</ol>${partial}</details>`;
}

const storySections = grouped
  .map((g) => {
    const c = storyCounts(g);
    const chips = ORDER.filter((s) => c[s])
      .map((s) => `<span class="chip chip--${s.toLowerCase()}">${c[s]} ${s}</span>`)
      .join('');

    const rows = [...g.cases]
      .sort(byAttention)
      .map(
        (x) => `<tr class="r r--${x.status.toLowerCase()}${
          disputed(x) ? ' r--unstable' : ''
        }">
        <td class="c-id">${esc(tagOf(g.name))}-${esc(x.id)}</td>
        <td class="c-exp">${
          x.status === 'PASS'
            ? esc(x.expected)
            : (() => {
              const r = readableExpected(x);
              return `${esc(r.sentence)}${r.steps.length
                ? `<ol class="exp-steps">${r.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`
                : ''}`;
            })()
        }</td>
        <td class="c-act">${codeify(x.actual)}${
          disputed(x)
            ? `<p class="repro">Not reproduced &mdash; the other run of the same day recorded this case as <b>${esc(
                x.otherRunStatus,
              )}</b>.</p>`
            : ''
        }${stepsHtml(x)}</td>
        <td class="c-st"><span class="badge badge--${x.status.toLowerCase()}">${x.status}</span>${
          disputed(x) ? '<span class="flaky">unstable</span>' : ''
        }</td>
      </tr>`,
      )
      .join('');

    return `<section class="story">
      <h2>${esc(g.name)}</h2>
      <p class="story__meta">${g.cases.length} test case${g.cases.length === 1 ? '' : 's'} ${chips}</p>
      <div class="tw"><table>
        <thead><tr><th>Case</th><th>Expected result</th><th>Actual result</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </section>`;
  })
  .join('');

// ---- re-run provenance ----------------------------------------------------
// A report assembled from a full run plus a partial re-run says which stories
// came from the re-run, and what the re-run changed. Optional, from the env:
//   REPORT_RERUN     folder numbers that were re-run, e.g. "04,06,09"
//   REPORT_RERUN_ON  when, for the label, e.g. "6 Oct 2026"
//   REPORT_BASELINE  the prepared JSON of the run BEFORE the re-run, to diff against
const RERUN = new Set((process.env.REPORT_RERUN || '').split(',').map((s) => s.trim()).filter(Boolean));
const RERUN_ON = process.env.REPORT_RERUN_ON || 're-run';
const isRerun = (g) => RERUN.size > 0 && RERUN.has((g.dir || '').slice(0, 2));
const rerunChanges = (() => {
  const file = process.env.REPORT_BASELINE;
  if (!file || !fs.existsSync(file)) return null;
  const base = JSON.parse(fs.readFileSync(file, 'utf8'));
  const key = (story, c) => `${story}||${c.id}||${c.expected}`;
  const before = new Map();
  for (const st of base.stories || []) for (const c of st.cases) before.set(key(st.name, c), c.status);
  const out = [];
  for (const g of grouped) {
    for (const c of g.cases) {
      const was = before.get(key(g.name, c)) || 'NOT IN FULL RUN';
      const ran = c.runStatus || c.status;
      if (was !== ran) out.push({ story: g.name, id: c.id, was, now: ran, actual: c.actual || '' });
    }
  }
  return { baseTotals: base.totals, changes: out };
})();

const summaryRows = grouped
  .map((g) => {
    const c = storyCounts(g);
    return `<tr><td><b>${esc(tagOf(g.name))}</b>&nbsp; ${esc(g.name)}${
      isRerun(g) ? ` <small class="rerun">re-run ${esc(RERUN_ON)}</small>` : ''
    }${
      (OVERRIDES.storyLabels || []).filter((l) => l.name === g.name)
        .map((l) => `<br><small>${esc(l.label)}</small>`).join('')
    }</td><td class="n">${g.cases.length}</td>${ORDER.map(
      (s) => `<td class="n${c[s] && s !== 'PASS' ? ' n--flag' : ''}">${c[s] || '–'}</td>`,
    ).join('')}</tr>`;
  })
  .join('');

const html = `<title>Payer Module Test Results</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Serif:wght@500;600&display=swap">
<style>
  :root{
    --ground:#f7f9f9; --panel:#ffffff; --panel-2:#f1f5f5;
    --ink:#101a1a; --muted:#566b6b; --rule:#dce5e5; --accent:#0f5f63;
    --pass:#0e7a4b; --pass-bg:#e4f3ea; --fail:#b3261e; --fail-bg:#fbeae8;
    --blocked:#8a5a00; --blocked-bg:#fbf0dc; --skip:#55636b; --skip-bg:#eceff0;
    --sans:"IBM Plex Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    --serif:"IBM Plex Serif",Georgia,"Times New Roman",serif;
    --mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  }
  @media (prefers-color-scheme: dark){
    :root:not([data-theme="light"]){
      --ground:#0e1414; --panel:#161d1d; --panel-2:#1b2323;
      --ink:#e6eded; --muted:#93a5a5; --rule:#263131; --accent:#5cc9cf;
      --pass:#5fd39b; --pass-bg:#122a20; --fail:#ff9086; --fail-bg:#2e1a18;
      --blocked:#e8b96b; --blocked-bg:#2a2013; --skip:#a3b0b8; --skip-bg:#1f2529;
    }
  }
  :root[data-theme="dark"]{
    --ground:#0e1414; --panel:#161d1d; --panel-2:#1b2323;
    --ink:#e6eded; --muted:#93a5a5; --rule:#263131; --accent:#5cc9cf;
    --pass:#5fd39b; --pass-bg:#122a20; --fail:#ff9086; --fail-bg:#2e1a18;
    --blocked:#e8b96b; --blocked-bg:#2a2013; --skip:#a3b0b8; --skip-bg:#1f2529;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--sans);
    font-size:15px;line-height:1.55;-webkit-font-smoothing:antialiased}
  .wrap{max-width:1200px;margin:0 auto;padding:40px 22px 80px;display:flex;flex-direction:column;gap:30px}
  code{font-family:var(--mono);font-size:.88em;background:var(--panel-2);
    padding:1px 5px;border-radius:4px;word-break:break-word}

  .eyebrow{font-size:.72rem;letter-spacing:.13em;text-transform:uppercase;color:var(--accent);
    font-weight:600;margin:0 0 8px}
  h1{font-family:var(--serif);font-weight:600;font-size:2.15rem;line-height:1.15;margin:0 0 10px;
    letter-spacing:-.015em;text-wrap:balance}
  .lede{color:var(--muted);margin:0;max-width:64ch}

  .meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:1px;
    background:var(--rule);border:1px solid var(--rule);border-radius:10px;overflow:hidden}
  .meta div{background:var(--panel);padding:11px 14px}
  .meta dt{font-size:.68rem;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);
    margin:0 0 3px;font-weight:600}
  .meta dd{margin:0;font-size:.92rem;font-variant-numeric:tabular-nums}

  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
  .card{background:var(--panel);border:1px solid var(--rule);border-radius:10px;
    padding:16px 18px;position:relative;overflow:hidden}
  .card::before{content:"";position:absolute;inset:0 auto 0 0;width:3px}
  .card--pass::before{background:var(--pass)} .card--fail::before{background:var(--fail)}
  .card--blocked::before{background:var(--blocked)} .card--skipped::before{background:var(--skip)}
  .card b{display:block;font-family:var(--mono);font-size:2.05rem;font-weight:500;line-height:1.05;
    font-variant-numeric:tabular-nums}
  .card--pass b{color:var(--pass)} .card--fail b{color:var(--fail)}
  .card--blocked b{color:var(--blocked)} .card--skipped b{color:var(--skip)}
  .card span{display:block;color:var(--muted);font-size:.74rem;letter-spacing:.09em;
    text-transform:uppercase;font-weight:600;margin-top:5px}

  h2{font-family:var(--serif);font-size:1.3rem;font-weight:600;margin:0 0 6px;letter-spacing:-.01em}
  .story{display:flex;flex-direction:column;gap:10px}
  .story__meta{color:var(--muted);font-size:.84rem;margin:0;display:flex;flex-wrap:wrap;gap:7px;align-items:center}
  .chip{font-size:.71rem;padding:2px 9px;border-radius:20px;font-weight:600;letter-spacing:.02em}
  .chip--pass{background:var(--pass-bg);color:var(--pass)}
  .chip--fail{background:var(--fail-bg);color:var(--fail)}
  .chip--blocked{background:var(--blocked-bg);color:var(--blocked)}
  .chip--skipped{background:var(--skip-bg);color:var(--skip)}

  .tw{overflow-x:auto;border:1px solid var(--rule);border-radius:10px;background:var(--panel)}
  table{border-collapse:collapse;width:100%;min-width:900px;font-size:.875rem}
  th,td{text-align:left;padding:11px 13px;border-bottom:1px solid var(--rule);vertical-align:top}
  th{background:var(--panel-2);font-size:.68rem;letter-spacing:.09em;text-transform:uppercase;
    color:var(--muted);font-weight:600;position:sticky;top:0;z-index:1}
  tbody tr:last-child td{border-bottom:0}
  td.c-id{font-family:var(--mono);font-weight:500;white-space:nowrap;width:78px;
    border-left:3px solid transparent;font-variant-numeric:tabular-nums}
  .r--pass td.c-id{border-left-color:var(--pass)}
  .r--fail td.c-id{border-left-color:var(--fail);color:var(--fail)}
  .r--blocked td.c-id{border-left-color:var(--blocked);color:var(--blocked)}
  .r--skipped td.c-id{border-left-color:var(--skip);color:var(--skip)}
  .c-exp{width:33%}
  .c-st{width:100px}
  .badge{display:inline-block;font-size:.68rem;font-weight:600;padding:3px 9px;border-radius:5px;
    letter-spacing:.06em}
  .badge--pass{background:var(--pass-bg);color:var(--pass)}
  .badge--fail{background:var(--fail-bg);color:var(--fail)}
  .badge--blocked{background:var(--blocked-bg);color:var(--blocked)}
  .badge--skipped{background:var(--skip-bg);color:var(--skip)}
  td.n{text-align:right;font-family:var(--mono);font-variant-numeric:tabular-nums}
  th.n{text-align:right}

  .steps{margin-top:10px}
  .steps summary{cursor:pointer;color:var(--accent);font-size:.79rem;font-weight:500}
  .steps summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:3px}
  .stl{list-style:none;margin:10px 0 0;padding:0 0 0 12px;border-left:1px solid var(--rule);
    display:flex;flex-direction:column;gap:5px}
  .st{display:grid;grid-template-columns:1.6rem 6.6rem 1fr;gap:9px;font-size:.81rem}
  .st__n{color:var(--muted);font-family:var(--mono);font-variant-numeric:tabular-nums}
  .st__s{font-size:.67rem;font-weight:600;letter-spacing:.06em;padding-top:2px}
  .st__t em{display:block;color:var(--muted);font-style:normal;margin-top:2px}
  .st__t em.shot{color:var(--accent)}
  .st--pass .st__s{color:var(--pass)}
  .st--fail .st__s{color:var(--fail)}
  .st--not-executed .st__s{color:var(--muted)}
  .partial{color:var(--blocked);font-size:.78rem;margin:7px 0 0}

  .repro{margin:8px 0 0;padding:7px 10px;background:var(--blocked-bg);color:var(--blocked);
    border-radius:6px;font-size:.79rem}
  .repro b{font-weight:600}
  .flaky{display:block;margin-top:5px;font-size:.63rem;letter-spacing:.08em;text-transform:uppercase;
    color:var(--blocked);font-weight:600}
  .r--unstable td.c-id{border-left-style:dashed}
  .exp-steps{margin:6px 0 0;padding-left:18px;font-size:12px;color:var(--muted)}
  .exp-steps li{margin:1px 0}
  .rerun{font-size:11px;color:var(--accent);border:1px solid var(--accent);border-radius:3px;
    padding:0 5px;margin-left:6px;white-space:nowrap;vertical-align:1px}
  .note{background:var(--panel);border:1px solid var(--rule);border-left:3px solid var(--blocked);
    border-radius:8px;padding:14px 16px;font-size:.87rem}
  .note b{color:var(--blocked)}
  footer{border-top:1px solid var(--rule);padding-top:20px;color:var(--muted);font-size:.85rem;
    display:flex;flex-direction:column;gap:11px}
  footer b{color:var(--ink)}
  @media (max-width:640px){ .wrap{padding:26px 14px 60px} h1{font-size:1.7rem} .c-exp{width:auto} }
  @media (prefers-reduced-motion:reduce){ *{animation:none!important;transition:none!important} }
</style>

<div class="wrap">
<header>
  <p class="eyebrow">NeoRx PBM &middot; Automated regression</p>
  <h1>Payer Module Test Results</h1>
  <p class="lede">Every one of the ${CASE_COUNT} automated test cases across the
  ${grouped.length} automated payer user stories, with the expected result, what the application
  actually did, and the step at which it diverged.</p>
</header>

<dl class="meta">
  <div><dt>Run</dt><dd>${esc(timing && timing.firstStart
    ? `${timing.firstStart.slice(0, 16).replace('T', ' ')} to ${timing.lastEnd.slice(0, 16).replace('T', ' ')} UTC`
    : RUN_DATE)}</dd></div>
  <div><dt>User stories</dt><dd>${grouped.length}</dd></div>
  <div><dt>Test cases</dt><dd>${CASE_COUNT}</dd></div>
  <div><dt>Workers</dt><dd>${esc(String(workers))}</dd></div>
  <div><dt>Retries</dt><dd>0</dd></div>
  <div><dt>${timing ? 'Active execution time' : 'Duration'}</dt><dd>${timing ? hm(durationMs) : mins(durationMs)}</dd></div>
  ${timing ? `<div><dt>Wall clock</dt><dd>${hm(timing.wallMs)}</dd></div>` : ''}
  <div><dt>Environment</dt><dd>${esc(RUN_ENV)}</dd></div>
</dl>

${
  MANUAL_DIRS.length || timing || REMOVED.length
    ? `<p class="note"><b>What these figures cover.</b> ${
      REMOVED.length
        ? `${REMOVED.length} user stories are not reported (${removedCases.length} cases): ${
          REMOVED.map((r) => `${esc(r.name)} — ${esc(r.reason)}`).join('; ')}. `
        : ''
    }${
      MANUAL_DIRS.length
        ? `Only results produced by the automation are counted. ${MANUAL_DIRS.length} manual user
          stories (${manualCases.length} cases, skipped by design because they need scheduled jobs or
          time to pass) are excluded from every total and percentage: ${esc(MANUAL_STORY_NAMES.join('; '))}. `
        : ''
    }${
      timing
        ? `Execution time is the active time only: any period of more than ${Math.round(timing.thresholdSec / 60)}
          minutes with no test activity in the logs (the machine asleep or frozen) is excluded, which removed
          ${hm(timing.frozenMs)} from a wall clock of ${hm(timing.wallMs)}.`
        : ''
    }</p>`
    : ''
}

<div class="cards">
  ${ORDER.map(
    (s) => `<div class="card card--${s.toLowerCase()}">
    <b>${totals[s]}</b><span>${s} &middot; ${pct(totals[s])}%</span>
  </div>`,
  ).join('')}
</div>

${
  PREPARED && raw.provenance
    ? `<p class="note"><b>How this report was assembled.</b> ${esc(raw.provenance)}</p>`
    : ''
}

<section class="story">
  <h2>Summary by user story</h2>
  <div class="tw"><table>
    <thead><tr><th>User story</th><th class="n">Cases</th>${ORDER.map(
      (s) => `<th class="n">${s}</th>`,
    ).join('')}</tr></thead>
    <tbody>${summaryRows}</tbody>
  </table></div>
</section>

${
  rerunChanges
    ? `<section class="story">
  <h2>Changes after the re-run</h2>
  <p class="note">${RERUN.size} user stories were re-run ${esc(RERUN_ON)} and their results replace the
  full run's. ${rerunChanges.changes.length} cases changed status as a result. Totals before the
  re-run: ${ORDER.map((s) => `${s} ${rerunChanges.baseTotals[s] || 0}`).join(', ')}; after:
  ${ORDER.map((s) => `${s} ${totals[s]}`).join(', ')}.</p>
  <div class="tw"><table>
    <thead><tr><th>Change</th><th class="n">Cases</th></tr></thead>
    <tbody>${Object.entries(
      rerunChanges.changes.reduce((m, x) => ({ ...m, [`${x.was} → ${x.now}`]: (m[`${x.was} → ${x.now}`] || 0) + 1 }), {}),
    ).sort((a, b) => b[1] - a[1]).map(([t, n]) => `<tr><td>${esc(t)}</td><td class="n">${n}</td></tr>`).join('')}</tbody>
  </table></div>
  <div class="tw"><table>
    <thead><tr><th>Case</th><th>User story</th><th>Before</th><th>After</th><th>Result after the re-run</th></tr></thead>
    <tbody>${rerunChanges.changes
      .sort((a, b) => a.now.localeCompare(b.now) || a.story.localeCompare(b.story))
      .map((x) => `<tr><td>${esc(x.id)}</td><td>${esc(x.story)}</td><td>${esc(x.was)}</td><td><b>${esc(x.now)}</b></td><td>${codeify(x.actual.replace(/\s+/g, ' ').slice(0, 220))}</td></tr>`)
      .join('')}</tbody>
  </table></div>
</section>`
    : ''
}

${
  testCases.some((c) => c.override)
    ? `<section class="story">
  <h2>QA-lead decisions applied</h2>
  <p class="note">These cases carry a status decided in review rather than the one the run produced.
  The run's own result is shown beside each, so nothing is hidden.</p>
  <div class="tw"><table>
    <thead><tr><th>Ref</th><th>Case</th><th>Run result</th><th>Reported as</th><th>Decision</th></tr></thead>
    <tbody>${testCases.filter((c) => c.override)
      .sort((a, b) => a.override.ref.localeCompare(b.override.ref) || a.id.localeCompare(b.id))
      .map((c) => `<tr><td>${esc(c.override.ref)}</td><td>${esc(c.id)}</td><td>${esc(c.runStatus)}</td><td><b>${esc(c.status)}</b></td><td>${esc(c.override.label)}</td></tr>`)
      .join('')}</tbody>
  </table></div>
</section>`
    : ''
}

${storySections}

<footer>
  <p><b>PASS</b> the expected result was observed. <b>FAIL</b> the application was exercised and
  produced a different result &mdash; the actual result names the failing step and the observed
  value. <b>BLOCKED</b> a prerequisite was unavailable, so the behaviour was never exercised and
  nothing was learned about it; this is deliberately not counted as a failure. <b>SKIPPED</b>
  deliberately excluded, with the reason recorded.</p>
  <p>Steps marked <b>NOT EXECUTED</b> were not run because an earlier step they depend on failed.
  Where a step failed and later steps still ran, those checks were independent, and each reports
  its own result.</p>
  <p><b>Retries are disabled.</b> Every verdict comes from a single execution &mdash; a case that
  passes only on a second attempt is reported as a failure, not a pass.</p>
</footer>
</div>
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');

// A machine-readable copy, for building other formats without re-deriving any of this.
// Skipped when the input was already such a file.
const jsonOut = OUT.replace(/\.html$/, '.json');
if (!PREPARED) fs.writeFileSync(
  jsonOut,
  JSON.stringify(
    {
      runDate: RUN_DATE,
      environment: RUN_ENV,
      workers,
      retries: 0,
      durationMs,
      wallMs: timing ? timing.wallMs : null,
      frozenMs: timing ? timing.frozenMs : null,
      excludedManual: { stories: MANUAL_STORY_NAMES, cases: manualCases.length },
      folderTiming: timing ? timing.folders : null,
      totals,
      stories: grouped.map((g) => ({
        name: g.name,
        counts: storyCounts(g),
        cases: g.cases.map((c) => ({
          id: c.id,
          expected: c.expected,
          expectedReadable: readableExpected(c),
          actual: c.actual,
          status: c.status,
          steps: c.steps,
        })),
      })),
    },
    null,
    2,
  ),
  'utf8',
);

console.log(`Report written: ${OUT}`);
console.log(`Data written  : ${jsonOut}`);
console.log(
  `  ${testCases.length} cases  |  ` + ORDER.map((s) => `${s} ${totals[s]}`).join('  ')
    + (manualCases.length ? `  |  excluded ${manualCases.length} manual case(s) in ${MANUAL_DIRS.length} stories` : '')
    + (timing ? `  |  active ${hm(timing.activeMs)} (wall ${hm(timing.wallMs)}, frozen ${hm(timing.frozenMs)})` : ''),
);
