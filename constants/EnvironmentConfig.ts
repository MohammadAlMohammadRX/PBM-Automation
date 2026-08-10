import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env once, as early as possible. Safe to import this module from
// anywhere (playwright.config.ts, fixtures, tests) - dotenv only loads once.
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

/**
 * Strongly typed, centralized environment configuration.
 * This is the ONLY place that should read from `process.env` for these values.
 * Every other file should import `env` from here instead of touching
 * `process.env` directly, so configuration stays in one place and typed.
 */
export interface EnvironmentConfigShape {
  baseUrl: string;
  adminUsername: string;
  adminPassword: string;
  browser: string;
  headless: boolean;
  slowMo: number;
  defaultTimeout: number;
  navigationTimeout: number;
  actionTimeout: number;
  expectTimeout: number;
  workers: number | undefined;
  retries: number;
  failedScreenshotsPath: string | undefined;
  logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
}

function toBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value.trim().toLowerCase() === 'true';
}

function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return value && !Number.isNaN(parsed) ? parsed : fallback;
}

function toOptionalInt(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function requireLogLevel(value: string | undefined): 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' {
  const allowed = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
  const upper = (value ?? 'INFO').toUpperCase();
  return (allowed.includes(upper) ? upper : 'INFO') as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
}

export const env: EnvironmentConfigShape = {
  baseUrl: process.env.BASE_URL ?? 'http://20.75.201.176',
  adminUsername: process.env.ADMIN_USERNAME ?? '',
  adminPassword: process.env.ADMIN_PASSWORD ?? '',
  browser: (process.env.BROWSER ?? 'chromium').toLowerCase(),
  headless: toBool(process.env.HEADLESS, true),
  slowMo: toInt(process.env.SLOW_MO, 0),
  defaultTimeout: toInt(process.env.DEFAULT_TIMEOUT, 30_000),
  navigationTimeout: toInt(process.env.NAVIGATION_TIMEOUT, 45_000),
  actionTimeout: toInt(process.env.ACTION_TIMEOUT, 15_000),
  expectTimeout: toInt(process.env.EXPECT_TIMEOUT, 10_000),
  workers: toOptionalInt(process.env.WORKERS),
  retries: toInt(process.env.RETRIES, 0),
  failedScreenshotsPath: process.env.FAILED_SCREENSHOTS_PATH,
  logLevel: requireLogLevel(process.env.LOG_LEVEL),
};

/**
 * Fails fast with a clear message if required secrets are missing, instead of
 * letting tests fail later with a confusing "login failed" error.
 */
export function assertRequiredEnv(): void {
  const missing: string[] = [];
  if (!env.adminUsername) missing.push('ADMIN_USERNAME');
  if (!env.adminPassword) missing.push('ADMIN_PASSWORD');
  if (!env.baseUrl) missing.push('BASE_URL');

  if (missing.length > 0) {
    throw new Error(
      `[EnvironmentConfig] Missing required environment variable(s): ${missing.join(', ')}. ` +
        `Copy .env.example to .env and fill in real values.`,
    );
  }
}
