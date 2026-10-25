import { test, expect } from '../../../fixtures';
import type { ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';
import { NETWORK_PERMISSION } from '../../../data/accounts/payerAdminRole.data';
import { AUTHORISATION_REFUSALS } from '../../../data/networks/networkPermissions.data';
import { NETWORK_LIFECYCLE } from '../../../data/networks/network.data';
import {
  CATALOGUE_SEVEN,
  INACTIVATE_BYPASS,
  MID_SESSION_REVOKE,
  REVOKE_EXPORT,
} from '../../../data/networks/granularPermissions.data';

/**
 * User story 14315: Grant permissions individually for each network action.
 * Permission CHANGES - revoking, revoking mid-session - the server-side check
 * behind a hidden control, and the catalogue's seven independent entries.
 *
 * Revocation is done by shaping the shared Payer Admin role a second time
 * while the first session is still signed in (fixture `shapedNonAdmin`); the
 * role is restored in teardown, newest change first.
 */
test.describe('US 14315 - Changing and bypassing network permissions', () => {
  test(`TC-${REVOKE_EXPORT.azureId}: should stop the user exporting when Export Networks is revoked from the role`, async ({
    shapedNonAdmin,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    let before!: ShapedSession;

    await steps.critical('Navigate to the Network Management module - the network list is displayed', async () => {
      before = await shapedNonAdmin(REVOKE_EXPORT.granted);
      await before.networks.openList();
    });

    await steps.critical('The user exports networks while the permission is held', async () => {
      const file = await before.networks.exportMenu().exportCsv('all');
      expect(file.rows.length, 'the export should produce a file with rows').toBeGreaterThan(0);
    });

    await steps.critical('Revoking Export Networks shows it unchecked on the role', async () => {
      const after = await shapedNonAdmin(REVOKE_EXPORT.revoked);
      expect(after.removed).toEqual([NETWORK_PERMISSION.exportNetworks]);
    });

    await steps.step('The same user\'s next export attempt is denied', async () => {
      await before.networks.openList();
      expect(await before.networks.exportMenu().isAvailable(), 'the export control must be withdrawn once the permission is revoked').toBe(
        false,
      );
    });
  });

  test(`TC-${INACTIVATE_BYPASS.azureId}: should reject a direct inactivate request for authorisation when the user lacks Inactivate Network`, async ({
    networkManagementPage,
    shapedNonAdmin,
    requireBaseline,
    networkIn,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const network = await networkIn('Active');
    let shaped!: ShapedSession;

    await steps.critical('Navigate to the Network Management module - the network list is displayed', async () => {
      requireBaseline((await networkManagementPage.readActionAccess(network)).inactivate, 'Inactivate');
      shaped = await shapedNonAdmin(INACTIVATE_BYPASS.role);
      await shaped.networks.openList();
    });

    await steps.step('The inactivate control is hidden or disabled and its endpoint is SetNetworkInactive', async () => {
      await shaped.networks.search(network.name);
      expect(await shaped.networks.getRowActionAvailability(network.name, 'inactivate')).not.toBe('available');
    });

    await steps.step('Invoking the inactivate endpoint directly is rejected with an authorisation error', async () => {
      const answer = await shaped.networks.submitStatusRequest('inactivate', network.id);
      expect(AUTHORISATION_REFUSALS, `the server answered ${answer.status}: ${answer.text.slice(0, 200)}`).toContain(answer.status);
      expect(await networkManagementPage.readStatus(network.name), 'the network must stay Active').toBe(NETWORK_LIFECYCLE.active);
    });
  });

  test(`TC-${MID_SESSION_REVOKE.azureId}: should deny the audit log on the next access when the permission is revoked during an active session`, async ({
    shapedNonAdmin,
    networkIn,
    steps,
  }) => {
    test.setTimeout(20 * 60_000);
    const network = await networkIn('Active');
    let session!: ShapedSession;

    await steps.critical('Navigate to the Network Management module - the network list is displayed', async () => {
      session = await shapedNonAdmin(MID_SESSION_REVOKE.granted);
      await session.networks.openList();
    });

    await steps.critical('The user opens the audit log and it is accessible', async () => {
      await session.networkDetail.open(network.id);
      await session.networkDetail.audit().open();
      expect((await session.networkDetail.audit().readEntries()).length, 'the audit log should show entries').toBeGreaterThan(0);
    });

    await steps.critical('An administrator revokes the permission in another session', async () => {
      const revoked = await shapedNonAdmin(MID_SESSION_REVOKE.revoked);
      expect(revoked.removed).toEqual([NETWORK_PERMISSION.viewNetworkAuditTrail]);
    });

    await steps.step('Re-accessing the audit log in the original session is denied', async () => {
      const access = await session.networks.readActionAccess(network);
      expect(access.auditLog, 'the still-open session must lose the audit log after the refresh point').toBe(false);
    });
  });

  test(`TC-${CATALOGUE_SEVEN.azureId}: should offer the seven network permissions as separate entries that toggle independently when a role is configured`, async ({
    networkManagementPage,
    roleAdministrationPage,
    steps,
  }) => {
    await steps.critical('Navigate to the Network Management module - the network list is displayed', async () => {
      await networkManagementPage.openList();
    });

    await steps.critical('The role\'s permission configuration screen lists the permissions', async () => {
      const catalogue = await roleAdministrationPage.openPermissionCatalogue(CATALOGUE_SEVEN.role);
      expect((await catalogue.getPermissionLabels()).length).toBeGreaterThan(0);
    });

    for (const entry of CATALOGUE_SEVEN.entries) {
      await steps.step(`"${entry.requirement}" is its own entry and toggles without moving the other six`, async () => {
        const catalogue = await roleAdministrationPage.openPermissionCatalogue(CATALOGUE_SEVEN.role);
        expect(await catalogue.hasPermissionLabelled(entry.label), `"${entry.label}" should be listed`).toBe(true);
        const read = async () => Promise.all(CATALOGUE_SEVEN.entries.map((e) => catalogue.isPermissionChecked(e.label)));
        const before = await read();
        await catalogue.togglePermission(entry.label);
        const after = await read();
        const index = CATALOGUE_SEVEN.entries.indexOf(entry);
        expect(after[index], `"${entry.label}" should have changed`).toBe(!before[index]);
        expect(after.filter((_, i) => i !== index), 'the other six should not move').toEqual(before.filter((_, i) => i !== index));
        await catalogue.togglePermission(entry.label);
        await roleAdministrationPage.closeDrawerDiscarding();
      });
    }
  });
});
