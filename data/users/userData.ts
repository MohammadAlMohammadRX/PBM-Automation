import { RandomDataUtils } from '../../utils/RandomDataUtils';
import type { AdminCredentials, UserData } from '../common/types';
import { env } from '../../constants/EnvironmentConfig';

/**
 * Test data factory for Users Administration.
 * Prefer `buildUniqueUser()` inside tests so parallel runs never collide.
 */
export function buildUniqueUser(overrides: Partial<UserData> = {}): UserData {
  return {
    fullName: RandomDataUtils.uniqueUserName(),
    email: RandomDataUtils.uniqueEmail(),
    mobileNumber: RandomDataUtils.validSaudiMobileNumber(),
    documentId: String(Math.floor(1_000_000_000 + Math.random() * 8_999_999_999)),
    identityType: 'National ID',
    nationality: 'Saudi (SAU)',
    ...overrides,
  };
}

/**
 * Admin credentials come exclusively from EnvironmentConfig (backed by .env),
 * never hardcoded in a test file. This function exists so tests import data
 * from `data/` consistently rather than reaching into `constants/` directly.
 */
export function getAdminCredentials(): AdminCredentials {
  return {
    username: env.adminUsername,
    password: env.adminPassword,
  };
}
