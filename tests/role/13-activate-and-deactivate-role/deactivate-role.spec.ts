import { test, expect } from '../../../fixtures';
import type { TestSteps } from '../../../fixtures/testStatus.fixture';
import type { RoleAdministrationPage } from '../../../pages/role/RoleAdministrationPage';
import { ROLE_MESSAGES, ROLE_STATUS } from '../../../data/role/common.data';
import {
  CASES,
  DEACTIVATED_TOAST,
  DETAILS_MAX,
  OTHER_DETAILS,
  REASON_OTHER,
  REASON_REORGANISATION,
} from '../../../data/role/activateAndDeactivateRole.data';
import { roleOptionsInAssign, sepless, typeDetails } from '../../../utils/role/writerCHelpers';

/** Step 1: Role Administration (careconnect) showing the case's own suite role. */
async function openRegister(steps: TestSteps, roleAdmin: RoleAdministrationPage, roleName: string): Promise<void> {
  await steps.critical('Navigate to the Role Management module - the Role Register list is displayed', async () => {
    await roleAdmin.open();
    const found = await roleAdmin.search(roleName);
    expect(found.items.map((r) => r.name), 'the case\'s suite role in the list').toEqual([roleName]);
  });
}

/**
 * User story 21293: Activate and Deactivate Role - the Deactivate drawer. Every role is the case's own suite
 * role (suiteRoles, deleted at teardown). See the data file for the readings.
 */
test.describe('US 21293 - Activate and Deactivate Role (deactivate)', () => {
  test.describe.configure({ timeout: 6 * 60_000 });

  test(`TC-${CASES.deactivateWithReason.azureId}: should deactivate a custom role with the reason Reorganisation`, async ({ page, steps, roleAdmin, suiteRoles, suiteUsers }) => {
    const role = await suiteRoles.create({ label: 'deactivate reorg' });
    const host = await suiteUsers.create({ role: await suiteRoles.create({ label: 'assign host' }) });
    await openRegister(steps, roleAdmin, role.name);

    await steps.critical('Locate the active custom role and select Deactivate - a confirmation is displayed with the message "Deactivate <name>? Users holding this role lose its permissions. No other record is changed."', async () => {
      const drawer = await roleAdmin.openDeactivate(role.id);
      expect({ title: await drawer.title(), text: await drawer.bodyText() }).toEqual({ title: ROLE_MESSAGES.deactivateTitle, text: ROLE_MESSAGES.deactivateWarning(role.name) });
    });

    await steps.step(`Select Reason "${REASON_REORGANISATION}" from the dropdown - the Reason field shows "${REASON_REORGANISATION}" as selected`, async () => {
      await roleAdmin.deactivate.chooseReason(REASON_REORGANISATION);
      expect(await roleAdmin.deactivate.selectedReason()).toBe(REASON_REORGANISATION);
    });

    await steps.step(`Confirm the deactivation - the dialog closes, the role is Inactive, "${DEACTIVATED_TOAST}" is displayed and the role is no longer available for assignment`, async () => {
      const out = await roleAdmin.deactivate.confirm();
      expect({ status: out.status, toast: sepless(out.toast), open: await roleAdmin.deactivate.isOpen() }, `SetActive answered ${out.status} "${out.apiMessage}"`)
        .toEqual({ status: 200, toast: sepless(DEACTIVATED_TOAST), open: false });
      await expect(roleAdmin.statusBadge(role.id)).toHaveText(ROLE_STATUS.inactive);
      expect((await suiteRoles.read(role.id))?.isActive, 'GetRole isActive').toBe(false);
      expect(await roleOptionsInAssign(page, host), 'the Role list of Assign Roles & Payers').not.toContain(role.name);
    });
  });

  test(`TC-${CASES.deactivateOtherWithDetails.azureId}: should deactivate a role with the reason Other and its details`, async ({ steps, roleAdmin, suiteRoles }) => {
    const role = await suiteRoles.create({ label: 'deactivate other' });
    await openRegister(steps, roleAdmin, role.name);

    await steps.critical('Select Deactivate on the active custom role - confirmation dialog is displayed', async () => {
      const drawer = await roleAdmin.openDeactivate(role.id);
      expect(await drawer.title()).toBe(ROLE_MESSAGES.deactivateTitle);
    });

    await steps.step(`Select Reason "${REASON_OTHER}" - the Details text field becomes visible and mandatory`, async () => {
      await roleAdmin.deactivate.chooseReason(REASON_OTHER);
      await expect(roleAdmin.deactivate.detailsInput()).toBeVisible();
      const empty = await roleAdmin.deactivate.confirm();
      expect({ sent: empty.status, error: await roleAdmin.deactivate.detailsError() }, 'Deactivate with Other and no details').toEqual({ sent: null, error: ROLE_MESSAGES.detailsRequiredForOther });
    });

    await steps.step(`Enter details text, e.g. "${OTHER_DETAILS}" - the text is accepted in the Details field`, async () => {
      expect((await typeDetails(roleAdmin, OTHER_DETAILS)).value).toBe(OTHER_DETAILS);
    });

    await steps.step(`Confirm the deactivation - the dialog closes, "${DEACTIVATED_TOAST}" is shown and the role becomes Inactive`, async () => {
      const out = await roleAdmin.deactivate.confirm();
      expect({ status: out.status, toast: sepless(out.toast), open: await roleAdmin.deactivate.isOpen() }, `SetActive answered ${out.status} "${out.apiMessage}"`)
        .toEqual({ status: 200, toast: sepless(DEACTIVATED_TOAST), open: false });
      await expect(roleAdmin.statusBadge(role.id)).toHaveText(ROLE_STATUS.inactive);
    });
  });

  test(`TC-${CASES.otherWithoutDetailsBlocked.azureId}: should block a deactivation with the reason Other and no details`, async ({ steps, roleAdmin, suiteRoles }) => {
    const role = await suiteRoles.create({ label: 'other no details' });
    await openRegister(steps, roleAdmin, role.name);

    await steps.critical('Select Deactivate on an active custom role - confirmation dialog is displayed', async () => {
      const drawer = await roleAdmin.openDeactivate(role.id);
      expect(await drawer.title()).toBe(ROLE_MESSAGES.deactivateTitle);
    });

    await steps.step(`Select Reason "${REASON_OTHER}" and leave Details blank - the Details field remains empty`, async () => {
      await roleAdmin.deactivate.chooseReason(REASON_OTHER);
      await expect(roleAdmin.deactivate.detailsInput()).toHaveValue('');
    });

    await steps.step(`Attempt to confirm the deactivation - the deactivation is blocked with "${ROLE_MESSAGES.detailsRequiredForOther}" and the role remains Active`, async () => {
      const out = await roleAdmin.deactivate.confirm();
      expect({ sent: out.status, error: await roleAdmin.deactivate.detailsError(), stillOpen: await roleAdmin.deactivate.isOpen(), active: (await suiteRoles.read(role.id))?.isActive }, `SetActive answered ${out.status} "${out.apiMessage}"`)
        .toEqual({ sent: null, error: ROLE_MESSAGES.detailsRequiredForOther, stillOpen: true, active: true });
    });
  });

  test(`TC-${CASES.details500Accepted.azureId}: should accept deactivation details of exactly 500 characters`, async ({ steps, roleAdmin, suiteRoles }) => {
    const role = await suiteRoles.create({ label: 'details 500' });
    const text = 'D'.repeat(DETAILS_MAX);
    await openRegister(steps, roleAdmin, role.name);

    await steps.critical(`Select Deactivate and choose Reason "${REASON_OTHER}" - the Details field is enabled`, async () => {
      await roleAdmin.openDeactivate(role.id);
      await roleAdmin.deactivate.chooseReason(REASON_OTHER);
      await expect(roleAdmin.deactivate.detailsInput()).toBeEnabled();
    });

    await steps.step(`Enter exactly ${DETAILS_MAX} characters of text in Details - the field accepts the full text without truncation`, async () => {
      const typed = await typeDetails(roleAdmin, text);
      expect({ length: typed.value.length, error: typed.error }).toEqual({ length: DETAILS_MAX, error: '' });
    });

    await steps.step(`Confirm the deactivation - the request is submitted, the role is deactivated and "${DEACTIVATED_TOAST}" is displayed`, async () => {
      const out = await roleAdmin.deactivate.confirm();
      expect({ status: out.status, toast: sepless(out.toast) }, `SetActive answered ${out.status} "${out.apiMessage}"`).toEqual({ status: 200, toast: sepless(DEACTIVATED_TOAST) });
      expect((await suiteRoles.read(role.id))?.isActive, 'GetRole isActive').toBe(false);
    });
  });

  test(`TC-${CASES.details501Rejected.azureId}: should not take deactivation details longer than 500 characters`, async ({ steps, roleAdmin, suiteRoles }) => {
    const role = await suiteRoles.create({ label: 'details 501' });
    await openRegister(steps, roleAdmin, role.name);

    await steps.critical(`Select Deactivate and choose Reason "${REASON_OTHER}" - the Details field is enabled`, async () => {
      await roleAdmin.openDeactivate(role.id);
      await roleAdmin.deactivate.chooseReason(REASON_OTHER);
      await expect(roleAdmin.deactivate.detailsInput()).toBeEnabled();
    });

    await steps.step(`Enter ${DETAILS_MAX + 1} characters of text in Details - the field either stops accepting further input or flags a length violation, and the role is not deactivated`, async () => {
      const typed = await typeDetails(roleAdmin, 'E'.repeat(DETAILS_MAX + 1));
      await roleAdmin.deactivate.cancel();
      expect({ heldOrFlagged: typed.value.length <= DETAILS_MAX || typed.error !== '', active: (await suiteRoles.read(role.id))?.isActive },
        `the box holds ${typed.value.length} characters; error "${typed.error}"`).toEqual({ heldOrFlagged: true, active: true });
    });
  });

  test(`TC-${CASES.noReasonBlocked.azureId}: should block a deactivation without a reason`, async ({ steps, roleAdmin, suiteRoles }) => {
    const role = await suiteRoles.create({ label: 'no reason' });
    await openRegister(steps, roleAdmin, role.name);

    await steps.critical('Select Deactivate on an active custom role - confirmation dialog with a Reason dropdown is displayed', async () => {
      await roleAdmin.openDeactivate(role.id);
      await expect(roleAdmin.deactivate.reasonSelect()).toBeVisible();
      expect(await roleAdmin.deactivate.selectedReason()).toBe(ROLE_MESSAGES.deactivateReasonPlaceholder);
    });

    await steps.step('Leave the Reason dropdown unselected and attempt to confirm - deactivation is blocked, an error indicating that Reason is mandatory is shown, and the role remains Active', async () => {
      const out = await roleAdmin.deactivate.confirm();
      const error = await roleAdmin.deactivate.reasonError();
      expect({ sent: out.status, errorShown: error !== '', active: (await suiteRoles.read(role.id))?.isActive }, `SetActive answered ${out.status}; the Reason error read "${error}"`)
        .toEqual({ sent: null, errorShown: true, active: true });
    });
  });
});
