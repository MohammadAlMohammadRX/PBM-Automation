import type { BlockedCase } from './payerTypes';

/**
 * Test data for "Trigger Downstream Impact Analysis on Status Change".
 *
 * The impact preview itself - that it appears, names its three categories,
 * shows zeros for a payer with nothing, and that cancelling it changes nothing
 * - is the impact-preview story (folder 52) and is not repeated. This story's
 * own ground is the ANALYSIS as a gate: what happens when it cannot run, and
 * what happens when two administrators run it against the same payer at once.
 *
 * VERIFIED: when the preview endpoint fails, the drawer drops its impact
 * section entirely - no error, no disabled Confirm - so the "service
 * unavailable" case is expected to FAIL and report that the change can be
 * staged unassessed. That is the module's silent-failure pattern again.
 *
 * Every case that needs the preview to count something ABOVE zero, or the
 * notification that a real cascade sends, needs a payer that owns active
 * policies - which this environment cannot provision. Those are listed in
 * BLOCKED_CASES.
 */

/** How the drawer should tell the user the impact could not be assessed. */
export const IMPACT_FAILURE_HINT = /impact|could not|unable|fail|error|try again|unavailable|تعذر|خطأ/i;

/** How a second administrator should be told a change is already in progress. */
export const CONCURRENT_CHANGE_HINT = /already|concurrent|another|pending|draft|conflict|modified|in progress|بالفعل|آخر|قيد/i;

const NEEDS_AFFECTED_POLICIES =
  'This case needs a payer with active policies and plans that a status change would affect, '
  + 'so the impact summary lists them and a notification is sent. No payer here owns a policy, '
  + 'and the Policies module is outside this framework. Provide a payer with known active '
  + 'policies and plans and re-run.';

/** The sheet's cases this environment cannot exercise, in renumbered order. */
export const BLOCKED_CASES: readonly BlockedCase[] = [
  {
    id: '001',
    title: 'should analyse the impact and notify recipients when a status change affects policies',
    reason: NEEDS_AFFECTED_POLICIES,
  },
  {
    id: '003',
    title: 'should display and paginate a large volume of affected policies',
    reason: `${NEEDS_AFFECTED_POLICIES} The upper boundary asks for 1,000 or more.`,
  },
  {
    id: '004',
    title: 'should include or exclude each policy and plan according to its status',
    reason: `${NEEDS_AFFECTED_POLICIES} The matrix needs Active, Inactive and Terminated combinations.`,
  },
  {
    id: '006',
    title: 'should send a High-priority notification listing every affected policy and member to the right recipients',
    reason:
      `${NEEDS_AFFECTED_POLICIES} The notification content is also read from the notifications `
      + 'panel, which no payer story has needed to drive yet.',
  },
  {
    id: '009',
    title: 'should support drill-down, filtering and sorting of the impact summary',
    reason: `${NEEDS_AFFECTED_POLICIES} The exploratory session needs a variety of affected records.`,
  },
  {
    id: '010',
    title: 'should flag the status-change notification as High priority rather than Medium or Low',
    reason: `${NEEDS_AFFECTED_POLICIES} Without an affected policy no notification is generated to inspect.`,
  },
];
