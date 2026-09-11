import { mergeTests } from '@playwright/test';
import { test as authTest } from './auth.fixture';
import { test as testDataTest } from './testData.fixture';
import { test as payerStateTest } from './payerState.fixture';
import { test as payerIdentityTest } from './payerIdentity.fixture';
import { test as discardSeedTest } from './discardSeed.fixture';
import { test as statusSeedTest } from './statusSeed.fixture';
import { test as concurrentEditTest } from './concurrentEdit.fixture';
import { test as networkStateTest } from './networkState.fixture';
import { test as cascadeDependentsTest } from './cascadeDependents.fixture';
import { test as networkAssignmentTest } from './networkAssignment.fixture';
import { test as versionHistoryStateTest } from './versionHistoryState.fixture';
import { test as linkedCountStateTest } from './linkedCountState.fixture';
import { test as cleanupTest } from './cleanup.fixture';
import { test as screenshotTest } from './screenshot.fixture';
import { test as testStatusTest } from './testStatus.fixture';

/**
 * Single entry point for every test file: merges the auth/Page-Object,
 * test-data, payer-state, payer-sampling, discard-seed, status-seed,
 * stale-session, network-state, cleanup, failure-screenshot and execution-status fixtures into
 * one `test`.
 *
 * The `steps` fixture from testStatus.fixture provides step-level results plus
 * the BLOCKED and dependency-SKIPPED outcomes - see constants/TestStatus.ts.
 *
 *   import { test, expect } from '../../fixtures';
 */
export const test = mergeTests(
  authTest,
  testDataTest,
  payerStateTest,
  payerIdentityTest,
  discardSeedTest,
  statusSeedTest,
  concurrentEditTest,
  networkStateTest,
  cascadeDependentsTest,
  networkAssignmentTest,
  versionHistoryStateTest,
  linkedCountStateTest,
  cleanupTest,
  screenshotTest,
  testStatusTest,
);
export { expect } from '@playwright/test';
