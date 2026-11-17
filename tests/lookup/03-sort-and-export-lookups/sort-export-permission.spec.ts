import { test, expect } from '../../../fixtures';
import { LookupRegisterPage } from '../../../pages/lookup/LookupPages';
import { CASES, EXPORT_MENU, NO_LOOKUP_RIGHTS, SORT_EXPORT_HOLDER_RIGHTS } from '../../../data/lookup/sortAndExportLookups.data';
import { describeAccess, openCapturing, registerAccess, sortAndExportState } from '../../../utils/lookup/writerAHelpers';

/**
 * User story 20855: Sort and Export Lookups - who may sort and export the
 * register. The account without the right and the administrator holding the
 * view-lookups permission are SUITE users in their own windows (lead decision
 * 6); the administrator's own register is the baseline (Sort By and Export
 * offered). Read-only: menus are opened and closed, nothing is exported.
 */
test.describe('US 20855 - Sort and Export Lookups (permission)', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.permission.azureId}: should offer Sort By and Export only to a System Administrator holding the view-lookups permission`, async ({ page, steps, lookupRegister: register, suiteSession }) => {
    const usable = { sortShown: true, sortOffersOptions: true, exportShown: true, exportOptions: [...EXPORT_MENU] };

    await steps.critical('Baseline: the administrator opens the Lookup Register - Sort By and Export are visible and usable', async () => {
      const call = await openCapturing(page, register);
      const state = await sortAndExportState(page);
      expect({ status: call.status, sortShown: state.sortShown, sortOffersOptions: state.sortOptions.length > 0, exportShown: state.exportShown, exportOptions: state.exportOptions }, `Sort By [${state.sortOptions.join(' | ')}]`)
        .toEqual({ status: 200, ...usable });
    });

    const userA = await suiteSession({ rights: NO_LOOKUP_RIGHTS });
    await steps.step('Navigate to the Lookups Management module using the account without view-lookups permission - access to the register is denied or the module is not shown', async () => {
      const access = await registerAccess(userA.page);
      expect(access.denied, `"${userA.role.name}" (${NO_LOOKUP_RIGHTS.join(', ')}): ${describeAccess(access)}`).toBe(true);
    });

    const admin = await suiteSession({ rights: SORT_EXPORT_HOLDER_RIGHTS });
    const registerB = new LookupRegisterPage(admin.page);
    await steps.critical('Log in again as a System Administrator holding the view-lookups permission - the lookups register loads', async () => {
      const call = await openCapturing(admin.page, registerB);
      expect(call.status, `"${admin.role.name}" (${SORT_EXPORT_HOLDER_RIGHTS.join(', ')}): GetLookups answered ${call.status}`).toBe(200);
    });

    await steps.step('Check that Sort By and Export controls are available - both Sort By and Export are visible and usable', async () => {
      const state = await sortAndExportState(admin.page);
      expect({ sortShown: state.sortShown, sortOffersOptions: state.sortOptions.length > 0, exportShown: state.exportShown, exportOptions: state.exportOptions },
        `"${admin.role.name}" (${SORT_EXPORT_HOLDER_RIGHTS.join(', ')}): Sort By [${state.sortOptions.join(' | ')}]`).toEqual(usable);
    });
  });
});
