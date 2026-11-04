import { test, expect } from '../../../fixtures';
import type { ConfirmDialog } from '../../../pages/components/ConfirmDialog';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { BLOCKED_CASES, CASES, DELETED_TOAST, DELETE_PROMPT, NETWORK_BLOCK } from '../../../data/facility/blockDeletion.data';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { listFacilityRegister, readFacilityNetworks, readFacilityOrNull, suiteFacilityName } from '../../../utils/FacilityProvisioning';
import { closeDialogWithIcon, dialogShown, networkAnchorOrBlock, watchDeleteRequest } from '../../../utils/facility/writerCHelpers';

/**
 * User story 15141: Block deletion a facility.
 * Delete asks for confirmation (No / Yes, the X closes it); Yes soft-deletes a
 * facility nothing depends on and refuses (409, toast) one a network holds.
 * Every facility is the suite's own; the network case reuses the suite's
 * long-lived anchor. See the data file for the literal readings.
 */
test.describe('US 15141 - Block deletion a facility', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.confirmPrompt.azureId}: should show a delete confirmation before any data is removed when Delete is clicked`, async ({
    page,
    facilityIn,
    facilityManagementPage,
    steps,
  }) => {
    const facility = await facilityIn('Active');

    await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.step('Click the "Delete" button next to the facility record - a delete confirmation asks the user to confirm the deletion', async () => {
      const sent = watchDeleteRequest(page);
      const dialog = await facilityManagementPage.requestAction(facility.nameEn, 'delete');
      expect(await dialog.getTitle()).toMatch(DELETE_PROMPT.title);
      expect(await dialog.getMessage()).toMatch(DELETE_PROMPT.message);
      expect(await sent, 'no delete is sent before the confirmation is answered').toBeNull();
      expect(await readFacilityOrNull(page, facility.id), 'the facility before confirming').not.toBeNull();
      await dialog.cancel();
    });
  });

  test(`TC-${CASES.deleteUnlinked.azureId}: should delete a facility without linked transactions after confirmation and confirm it`, async ({
    page,
    facilityIn,
    facilityManagementPage,
    steps,
  }) => {
    const facility = await facilityIn('Active');
    let dialog!: ConfirmDialog;

    await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Click the "Delete" button next to the facility record - a delete confirmation message is displayed', async () => {
      dialog = await facilityManagementPage.requestAction(facility.nameEn, 'delete');
      expect(await dialog.getMessage()).toMatch(DELETE_PROMPT.message);
    });

    await steps.step('Click OK - the facility record is removed and a successful deletion confirmation message is displayed', async () => {
      const answer = await NetworkUtils.captureResponse(page, ApiEndpoints.facilityDelete, () => dialog.confirm());
      const messages = await facilityManagementPage.waitForVisibleMessages();
      expect(answer?.status ?? -1, `DeleteFacility answered ${answer?.text.slice(0, 200) ?? 'nothing'}`).toBe(200);
      expect(messages.join(' | '), 'the success message').toMatch(DELETED_TOAST);
      expect(await readFacilityOrNull(page, facility.id), 'the deleted facility can no longer be opened').toBeNull();
      expect(await facilityManagementPage.isListed(facility.nameEn), 'the deleted facility in the list').toBe(false);
    });
  });

  test(`TC-${CASES.declineKeeps.azureId}: should end the deletion and keep the record when the administrator clicks No`, async ({
    page,
    facilityIn,
    facilityManagementPage,
    steps,
  }) => {
    const facility = await facilityIn('Active');
    let dialog!: ConfirmDialog;

    await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Click the "Delete" button next to the facility record - a delete confirmation message is displayed', async () => {
      dialog = await facilityManagementPage.requestAction(facility.nameEn, 'delete');
      expect(await dialog.getMessage()).toMatch(DELETE_PROMPT.message);
    });

    await steps.step('Click No - the dialog closes without further action and the record stays unchanged in the list', async () => {
      const before = await facilityManagementPage.readRow(facility.nameEn);
      const sent = watchDeleteRequest(page);
      await dialog.cancel();
      expect(await dialogShown(page), 'the confirmation after No').toBe(false);
      expect(await sent, 'a delete request after No').toBeNull();
      expect(await readFacilityOrNull(page, facility.id), 'the facility after No').not.toBeNull();
      expect(await facilityManagementPage.readRow(facility.nameEn), 'the row after No').toEqual(before);
    });
  });

  test(`TC-${CASES.networkDependency.azureId}: should show the dependency error and keep the facility when a network still holds it`, async ({
    page,
    facilityManagementPage,
    steps,
  }) => {
    const anchor = await networkAnchorOrBlock(page, test.info());
    const name = anchor.facility.nameEn;
    let dialog!: ConfirmDialog;

    await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(name)).toBe(true);
    });

    await steps.critical('Click the "Delete" button next to a facility linked to a network - a delete confirmation message is displayed', async () => {
      expect(anchor.networks.length, 'networks holding the facility').toBeGreaterThan(0);
      dialog = await facilityManagementPage.requestAction(name, 'delete');
      expect(await dialog.getMessage()).toMatch(DELETE_PROMPT.message);
    });

    await steps.step('Click Yes - an error describes the dependency conflict, the deletion is discarded and the facility and its networks stay intact', async () => {
      const answer = await NetworkUtils.captureResponse(page, ApiEndpoints.facilityDelete, () => dialog.confirm().catch(() => undefined));
      const messages = await facilityManagementPage.waitForVisibleMessages();
      expect(answer?.status ?? -1, `DeleteFacility answered ${answer?.text.slice(0, 200) ?? 'nothing'}`).toBeGreaterThanOrEqual(400);
      expect(messages.join(' | '), 'the error message shown').toMatch(NETWORK_BLOCK);
      expect(await readFacilityOrNull(page, anchor.facility.id), 'the facility after the refused delete').not.toBeNull();
      const networksAfter = (await readFacilityNetworks(page, anchor.facility.id, 100)).items.map((n) => n.id);
      expect(anchor.networks.filter((n) => !networksAfter.includes(n.id)).map((n) => n.code), 'networks that no longer hold the facility').toEqual([]);
      expect(await facilityManagementPage.isListed(name), 'the facility in the list').toBe(true);
    });
  });

  test(`TC-${CASES.dismissDialog.azureId}: should treat dismissing the delete confirmation with Esc or the close icon as No`, async ({
    page,
    facilityIn,
    facilityManagementPage,
    steps,
  }) => {
    const facility = await facilityIn('Active');

    await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });

    await steps.critical('Click the "Delete" button next to a facility record - a delete confirmation message is displayed', async () => {
      const dialog = await facilityManagementPage.requestAction(facility.nameEn, 'delete');
      expect(await dialog.getMessage()).toMatch(DELETE_PROMPT.message);
    });

    await steps.step('Dismiss the dialog using the Esc key, then (opened again) the close icon - the dialog closes each time and nothing is deleted', async () => {
      const sent = watchDeleteRequest(page, 8_000);
      await page.keyboard.press('Escape');
      await expect.poll(() => dialogShown(page), { message: 'the confirmation after Esc', timeout: 5_000 }).toBe(false);
      const again = await facilityManagementPage.requestAction(facility.nameEn, 'delete');
      expect(await again.getMessage()).toMatch(DELETE_PROMPT.message);
      await closeDialogWithIcon(page);
      await expect.poll(() => dialogShown(page), { message: 'the confirmation after its close icon', timeout: 5_000 }).toBe(false);
      expect(await sent, 'a delete request after dismissing').toBeNull();
      expect(await readFacilityOrNull(page, facility.id), 'the facility after dismissing').not.toBeNull();
      expect(await facilityManagementPage.isListed(facility.nameEn)).toBe(true);
    });
  });

  test(`TC-${CASES.deleteOnEveryRow.azureId}: should offer an accessible Delete action on every facility record whatever its status`, async ({
    facilityIn,
    facilityManagementPage,
    steps,
  }) => {
    const active = await facilityIn('Active');
    const inactive = await facilityIn('Inactive');

    await steps.critical('Navigate to the Facility Management module - the module opens showing the list of existing facilities', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.countRows()).toBeGreaterThan(0);
    });

    await steps.step('Review each facility record in the list for a Delete action - a Delete button is visible and accessible next to each record, active or inactive', async () => {
      const missing: string[] = [];
      for (const row of await facilityManagementPage.readRowsOnScreen()) {
        const state = await facilityManagementPage.getActionState(row.name, 'delete');
        if (state.availability !== 'available') missing.push(`${row.name} (${row.status}): ${state.availability}`);
      }
      for (const own of [active, inactive]) {
        await facilityManagementPage.revealRow(own.nameEn);
        const state = await facilityManagementPage.getActionState(own.nameEn, 'delete');
        const status = (await facilityManagementPage.readRow(own.nameEn)).status;
        if (state.availability !== 'available') missing.push(`${own.nameEn} (${status}): ${state.availability}`);
      }
      expect((await facilityManagementPage.readRow(inactive.nameEn)).status, 'the inactive record').toBe('Inactive');
      expect(missing, 'records without an accessible Delete').toEqual([]);
    });
  });

  test(`TC-${CASES.othersUnaffected.azureId}: should remove only the targeted facility and leave every other record intact`, async ({
    page,
    facilityIn,
    facilityManagementPage,
    steps,
  }) => {
    const a = await facilityIn('Active', { nameEn: suiteFacilityName(CASES.othersUnaffected.labelA) });
    const b = await facilityIn('Active', { nameEn: suiteFacilityName(CASES.othersUnaffected.labelB) });
    let rowB!: Awaited<ReturnType<typeof facilityManagementPage.readRow>>;
    let registerBefore: string[] = [];

    await steps.critical('Navigate to the Facility Management module - the list shows the existing facilities, including Facility A and Facility B', async () => {
      await facilityManagementPage.openTable();
      expect(await facilityManagementPage.isListed(a.nameEn), 'Facility A').toBe(true);
      rowB = await facilityManagementPage.readRow(b.nameEn);
      expect(rowB.name, 'Facility B').toBe(b.nameEn);
      registerBefore = (await listFacilityRegister(page, {}, 1000)).items.map((i) => i.id);
    });

    await steps.critical('Click Delete next to Facility A and confirm with OK - Facility A is removed from the list and a success message is displayed', async () => {
      const answer = await facilityManagementPage.deleteFacility(a.nameEn);
      expect(answer.status, `DeleteFacility answered ${answer.text.slice(0, 200)}`).toBe(200);
      expect(answer.messages.join(' | '), 'the success message').toMatch(DELETED_TOAST);
      expect(await facilityManagementPage.isListed(a.nameEn), 'Facility A in the list').toBe(false);
    });

    await steps.step('Review the facility list for Facility B and the other records - Facility B and all other records are still present and unchanged', async () => {
      expect(await facilityManagementPage.readRow(b.nameEn), 'Facility B').toEqual(rowB);
      const registerAfter = (await listFacilityRegister(page, {}, 1000)).items.map((i) => i.id);
      const vanished = registerBefore.filter((id) => id !== a.id && !registerAfter.includes(id));
      expect(vanished, 'other records gone from the register').toEqual([]);
      expect(registerAfter.includes(a.id), 'Facility A in the register').toBe(false);
    });
  });

  for (const blocked of BLOCKED_CASES) {
    test(`TC-${blocked.azureId}: ${blocked.title}`, async ({ steps }) => {
      steps.blocked(blocked.reason);
    });
  }
});
