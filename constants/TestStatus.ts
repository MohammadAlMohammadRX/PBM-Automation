/**
 * Execution statuses for a test case and for the individual steps inside it.
 *
 * Playwright natively reports only `passed`, `failed`, `timedOut` and `skipped`.
 * BLOCKED has no native equivalent, and a dependency-skip is indistinguishable
 * from a deliberate skip. Both distinctions matter for reporting, so they are
 * carried as ANNOTATIONS on the test rather than invented statuses - the run
 * stays a normal Playwright run, and `reports/results.json` carries everything
 * the report needs.
 *
 * The mapping to what Playwright records:
 *
 *   PASS     -> passed
 *   FAIL     -> failed            (a soft failure is registered per failed step)
 *   BLOCKED  -> skipped + annotation `blocked`
 *   SKIPPED  -> skipped           (+ annotation `dependency-skipped` when a
 *                                  prerequisite test case failed)
 *
 * BLOCKED is deliberately NOT reported as failed: the test never got to evaluate
 * the behaviour it exists to check, so calling it a failure would assert
 * something about the application that was never observed.
 */

/** Overall outcome of a test case. */
export const TestStatus = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  BLOCKED: 'BLOCKED',
  SKIPPED: 'SKIPPED',
} as const;
export type TestStatusName = (typeof TestStatus)[keyof typeof TestStatus];

/**
 * Outcome of one step inside a test case.
 *
 * NOT_EXECUTED is distinct from a skip: it means an earlier step failed and this
 * step depended on it, so running it would have produced a meaningless result.
 */
export const StepStatus = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  NOT_EXECUTED: 'NOT EXECUTED',
} as const;
export type StepStatusName = (typeof StepStatus)[keyof typeof StepStatus];

/** Annotation types this framework adds, so the report can tell cases apart. */
export const ANNOTATION = {
  /** External prerequisite missing - environment, service, account, data. */
  blocked: 'blocked',
  /** Not executed because a prerequisite TEST CASE failed. */
  dependencySkipped: 'dependency-skipped',
  /** The per-step breakdown, serialised, so the JSON report carries it. */
  steps: 'steps',
} as const;

/** One recorded step of a test case. */
export interface StepRecord {
  index: number;
  name: string;
  status: StepStatusName;
  /** Assertion or error detail for a failed step; the reason for NOT_EXECUTED. */
  reason?: string;
  durationMs: number;
  /** Absolute path of the screenshot taken when this step failed, if any. */
  screenshot?: string;
}
