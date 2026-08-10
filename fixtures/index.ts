import { mergeTests } from '@playwright/test';
import { test as authTest } from './auth.fixture';
import { test as testDataTest } from './testData.fixture';
import { test as cleanupTest } from './cleanup.fixture';
import { test as screenshotTest } from './screenshot.fixture';

/**
 * Single entry point for every test file: merges the auth/Page-Object,
 * test-data, cleanup, and failure-screenshot fixtures into one `test`.
 *
 *   import { test, expect } from '../../fixtures';
 */
export const test = mergeTests(authTest, testDataTest, cleanupTest, screenshotTest);
export { expect } from '@playwright/test';
