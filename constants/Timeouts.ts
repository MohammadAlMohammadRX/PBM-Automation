import { env } from './EnvironmentConfig';

/**
 * Centralized timeout values so magic numbers don't get scattered across
 * Page Objects and tests. Values are sourced from EnvironmentConfig, which in
 * turn reads from .env, so they remain configurable per environment.
 */
export const Timeouts = {
  default: env.defaultTimeout,
  navigation: env.navigationTimeout,
  action: env.actionTimeout,
  expect: env.expectTimeout,
  /** Short wait for transient UI states (dropdown open, tooltip, etc). */
  short: 5_000,
  /** Wait allowed for a loading spinner / skeleton to disappear. */
  loadingIndicator: 20_000,
  /** Wait allowed for a toast/notification to appear after an action. */
  toast: 10_000,
} as const;
