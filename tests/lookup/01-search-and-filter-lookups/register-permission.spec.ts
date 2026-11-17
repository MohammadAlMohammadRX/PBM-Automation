import { test, expect } from '../../../fixtures';
import { LookupRegisterPage } from '../../../pages/lookup/LookupPages';
import { CASES, NO_LOOKUP_RIGHTS, VIEW_LOOKUP_RIGHTS } from '../../../data/lookup/searchAndFilterLookups.data';
import { readAllLookups } from '../../../utils/lookup/lookupApi';
import { describeAccess, openCapturing, registerAccess, rowIdsOnScreen, type RegisterCall } from '../../../utils/lookup/writerAHelpers';

/**
 * User story 20853: Search and Filter Lookups - who may open the Lookup
 * Register. Both users are SUITE users in their own windows (lead decision 6):
 * User A's suite role holds no Lookups.* right, User B's only the view rights.
 * The administrator's own register is the baseline. Read-only.
 */
test.describe('US 20853 - Search and Filter Lookups (permission)', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.permission.azureId}: should open the Lookup Register only for a user holding the permission to view lookups`, async ({ page, steps, lookupRegister: register, suiteSession }) => {
    await steps.critical('Baseline: the administrator, who holds the view-lookups permission, opens the Lookup Register', async () => {
      const call = await openCapturing(page, register);
      expect(call.status, `GetLookups answered ${call.status}`).toBe(200);
    });

    const userA = await suiteSession({ rights: NO_LOOKUP_RIGHTS });
    await steps.step('Navigate to the Lookups Management module as the user without the view-lookups permission - System Settings > Lookups is not accessible or is denied', async () => {
      const access = await registerAccess(userA.page);
      expect(access.denied, `"${userA.role.name}" (${NO_LOOKUP_RIGHTS.join(', ')}): ${describeAccess(access)}`).toBe(true);
    });

    const userB = await suiteSession({ rights: VIEW_LOOKUP_RIGHTS });
    const registerB = new LookupRegisterPage(userB.page);
    let callB!: RegisterCall;
    await steps.critical('Sign in as the user holding the view-lookups permission and navigate to the Lookups Management module - the module loads', async () => {
      callB = await openCapturing(userB.page, registerB);
      expect(callB.status, `"${userB.role.name}" (${VIEW_LOOKUP_RIGHTS.join(', ')}): GetLookups answered ${callB.status}`).toBe(200);
    });

    await steps.step('Open System Settings > Lookups - the Lookup Register screen opens showing all lookup lists', async () => {
      const api = await readAllLookups(page);
      expect({ totalRows: callB.answer.totalRows, rowsShown: (await rowIdsOnScreen(userB.page)).length > 0 }).toEqual({ totalRows: api.totalRows, rowsShown: true });
    });
  });
});
