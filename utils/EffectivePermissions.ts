import type { Page } from '@playwright/test';
import { env } from '../constants/EnvironmentConfig';
import { ACCESS_TOKEN_KEY } from '../data/payers/lifecycleGuardrails.data';
import { PAYER_PERMISSION, type PayerPermissionKey } from '../data/accounts/payerAdminRole.data';
import { Logger } from '../utils/Logger';

/**
 * What the application itself says the signed-in account may do.
 *
 * WHY THIS EXISTS - and it is the most important comment in the shaping code.
 * The suite builds the account a permission case needs by taking a permission
 * off the "Payer Admin" role. Every visible sign said that worked: the right
 * role (id 72fc3b78, the one the account's own Roles and Privileges step names),
 * the catalogue toggled, "Role updated" raised, and the permission reading back
 * as unchecked from a COMPLETELY FRESH administrator window - so it is stored on
 * the server, not merely in a form.
 *
 * It still does not reach the account. Measured 21 September 2026: after the
 * removal and a fresh sign-in, `GetCurrentUserRolesAndPermissions` STILL lists
 * `Payers.UpdatePayer` for that user. A role's permissions do not propagate to
 * the people holding it.
 *
 * That is an application defect in its own right, and it is also a trap for this
 * suite: thirty-five cases reported "the control is still offered without the
 * permission" when the permission had never actually been withdrawn. Those were
 * not findings. A case may only speak about enforcement once the account has
 * been TOLD it lost the right - so every shaped session now asks, and a case
 * whose setup did not take reports BLOCKED instead of a defect that is not there.
 */
const ENDPOINT = '/api/Manage/GetCurrentUserRolesAndPermissions';

/** The Payers-module prefix the effective list uses for its codes. */
const PAYER_PREFIX = 'Payers.';

/** The permission codes the signed-in session is told it holds. */
export async function readEffectivePermissions(page: Page): Promise<string[]> {
  const token = await page.evaluate((key) => window.localStorage.getItem(key), ACCESS_TOKEN_KEY);
  if (token === null) return [];

  const response = await page.request.get(`${env.baseUrl}${ENDPOINT}`, {
    headers: { Authorization: `Bearer ${token}` },
    failOnStatusCode: false,
  });
  if (!response.ok()) {
    Logger.warn(`${ENDPOINT} answered ${response.status()}; the effective permission set is unknown`);
    return [];
  }
  const body = (await response.json()) as { payload?: { permissions?: string[] } };
  return body.payload?.permissions ?? [];
}

/**
 * Which of `removed` the account is STILL told it holds.
 *
 * Empty means the shaping took. Anything else is the propagation defect above,
 * and the case that asked for it cannot prove anything about enforcement.
 *
 * Permissions whose catalogue entry is a human name rather than a code (only
 * "View Audit Logs") are skipped: their code cannot be derived from the label,
 * so a check would report a false mismatch rather than no mismatch.
 */
export async function permissionsStillHeld(
  page: Page,
  removed: readonly PayerPermissionKey[],
): Promise<string[]> {
  if (removed.length === 0) return [];
  const effective = await readEffectivePermissions(page);
  if (effective.length === 0) return [];

  return removed
    .map((key) => PAYER_PERMISSION[key])
    .filter((label) => !label.includes(' '))
    .filter((label) => effective.includes(`${PAYER_PREFIX}${label}`));
}

/** The message a case reports when its setup did not reach the account. */
export const propagationFailure = (stillHeld: readonly string[]): string =>
  'the permission was taken off the "Payer Admin" role and the removal IS stored - a fresh '
  + 'administrator window reads it back as unchecked - but the account is still told it holds '
  + `${stillHeld.join(', ')} by ${ENDPOINT} after signing in again. A role\'s permissions do not `
  + 'propagate to the users holding that role, so the right was never actually withdrawn and '
  + 'nothing this case observes could say whether the application enforces it. This is an '
  + 'application defect in the role/permission propagation, reported separately - not a result '
  + 'for this case.';
