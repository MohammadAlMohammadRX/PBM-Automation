import { mergeTests } from '@playwright/test';
import { test as authTest } from './auth.fixture';
import { test as testDataTest } from './testData.fixture';
import { test as payerStateTest } from './payerState.fixture';
import { test as cleanupTest } from './cleanup.fixture';
import { test as screenshotTest } from './screenshot.fixture';
import { test as testStatusTest } from './testStatus.fixture';

/**
 * Single entry point for every test file: merges the auth/Page-Object,
 * test-data, cleanup, failure-screenshot and execution-status fixtures into
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
  cleanupTest,
  screenshotTest,
  testStatusTest,
);
export { expect } from '@playwright/test';
