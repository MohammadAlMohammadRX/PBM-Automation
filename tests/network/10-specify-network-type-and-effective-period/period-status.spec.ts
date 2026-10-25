import { test, expect } from '../../../fixtures';
import type { NetworkFormDialog, SaveReport } from '../../../pages/network/NetworkFormDialog';
import { NETWORK_LIFECYCLE, NETWORK_MESSAGE, NETWORK_TOAST } from '../../../data/networks/network.data';
import { HOLD_MS, JOB_WAIT_MS } from '../../../data/networks/networkForm.data';
import { NOTICE, PERIOD } from '../../../data/networks/typeAndEffectivePeriod.data';

/**
 * User story 14124: Specify network type and effective period.
 * What the effective period does to a network's STATUS: the notice the form
 * shows, and the automatic Pending -> Active move when the date arrives.
 *
 * The date arriving is real, not simulated: networks are approved with an
 * effective time a minute or two ahead and the lifecycle job (every minute in
 * this environment) is left to act.
 */
test.describe('US 14124 - Effective period and network status', () => {
  test(`TC-${PERIOD.statusNotice.azureId}: should show a status notice matching the facility and payer conditions when a registration is completed`, async ({
    networkManagementPage,
    steps,
    cleanup,
  }) => {
    let form!: NetworkFormDialog;

    await steps.critical('Navigate to the module - the form opens blank', async () => {
      await networkManagementPage.openList();
      form = await networkManagementPage.openAddForm();
      expect(await form.readField('nameEn')).toBe('');
    });

    await steps.step('With no facility and no active payer, the notice says the network stays Pending until both are assigned', async () => {
      await form.fill(PERIOD.validPpo.build());
      expect(await form.getImportantNotice()).toMatch(NOTICE.unmet);
    });

    await steps.step('The notice ties automatic activation to the facility and payer conditions', async () => {
      const notice = await form.getImportantNotice();
      expect(notice, 'the notice should say the network becomes Active on the date').toMatch(NOTICE.met);
      expect(notice, 'and that it depends on a facility and an active payer').toMatch(NOTICE.conditions);
    });

    await steps.step('The registration saves with the notice it showed', async () => {
      const report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.created, report.text).toBe(true);
    });
  });

  test(`TC-${PERIOD.pendingToActive.azureId}: should move a Pending network to Active automatically when its effective date arrives and its conditions are met`, async ({
    networkManagementPage,
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);

    await steps.critical('Navigate to the Network Management module', async () => {
      await networkManagementPage.openList();
      expect(await networkManagementPage.isAddOffered()).toBe(true);
    });

    const network = await networkIn('Pending', { effectiveInMinutes: PERIOD.pendingToActive.effectiveInMinutes });

    await steps.step('The network\'s overview reads Pending before its effective date', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.expectStatus(NETWORK_LIFECYCLE.pending);
    });

    await steps.step('Once the effective date arrives the job makes it Active', async () => {
      await networkManagementPage.waitForStatus(network.name, NETWORK_LIFECYCLE.active, JOB_WAIT_MS);
      await networkDetailPage.open(network.id);
      await networkDetailPage.expectStatus(NETWORK_LIFECYCLE.active);
    });
  });

  test(`TC-${PERIOD.staysPending.azureId}: should keep a network Pending when its effective date arrives without a facility`, async ({
    networkManagementPage,
    networkDetailPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(15 * 60_000);

    await steps.critical('Navigate to the Network Management module', async () => {
      await networkManagementPage.openList();
      expect(await networkManagementPage.isAddOffered()).toBe(true);
    });

    const network = await networkIn('Pending', { effectiveInMinutes: PERIOD.staysPending.effectiveInMinutes, facilities: 0 });

    await steps.step('The network\'s overview reads Pending', async () => {
      await networkDetailPage.open(network.id);
      await networkDetailPage.expectStatus(NETWORK_LIFECYCLE.pending);
    });

    await steps.step('After its effective date has passed and the job has run, it still reads Pending', async () => {
      await networkManagementPage.expectStatusUnchangedFor(network.name, NETWORK_LIFECYCLE.pending, HOLD_MS);
    });
  });

  test(`TC-${PERIOD.endToEnd.azureId}: should register a fully qualified network end to end with its details and status stored correctly`, async ({
    networkManagementPage,
    networkDetailPage,
    toast,
    steps,
    cleanup,
  }) => {
    const data = PERIOD.endToEnd.build();
    let form!: NetworkFormDialog;
    let report!: SaveReport;

    await steps.critical('Navigate to the module - the form opens blank', async () => {
      await networkManagementPage.openList();
      form = await networkManagementPage.openAddForm();
      expect(await form.readField('nameEn')).toBe('');
    });

    await steps.step('HMO, an effective date of today and an expiry a year later are accepted', async () => {
      await form.fill(data);
      expect(await form.readFieldError('effectiveDate')).toBe('');
      expect(await form.readFieldError('expiryDate')).toBe('');
    });

    await steps.step('The notice explains the automatic activation rule', async () => {
      expect(await form.getImportantNotice()).toContain(NETWORK_MESSAGE.initialPending);
    });

    await steps.step('Saving confirms and the network appears in the list', async () => {
      report = await form.saveNewAndReport();
      cleanup.register(() => form.discardCreated(report.outcome));
      expect(report.created, report.text).toBe(true);
      await toast.expectText(NETWORK_TOAST.savedAsDraft);
      const row = await networkManagementPage.readRow(data.nameEn);
      expect(row.networkType).toBe(data.type);
      expect(row.status, 'a new registration is not live until approved').toBe(NETWORK_LIFECYCLE.notLive);
    });

    await steps.step('The overview shows exactly the type and dates submitted', async () => {
      await networkDetailPage.open(form.createdId(report.outcome));
      expect(await networkDetailPage.readOverviewField('type')).toBe(data.type);
      expect(await networkDetailPage.readOverviewField('effectiveDate')).toBe(data.effectiveDate);
      expect(await networkDetailPage.readOverviewField('expiryDate')).toBe(data.expiryDate);
    });
  });
});
