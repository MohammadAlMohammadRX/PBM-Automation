import { test, expect } from '../../../fixtures';
import type { NetworkFormDialog } from '../../../pages/network/NetworkFormDialog';
import { buildNetwork } from '../../../data/networks/network.data';
import { CASE, CYCLES, FORCED_CODE, NETWORK_CODE_PATTERN } from '../../../data/networks/networkCodeRetention.data';

/**
 * User story 14142: Retain network codes permanently without reuse.
 * Generation: every new network gets a code of its own - through the wizard,
 * twice, concurrently, and across repeated create/delete cycles - and the code
 * cannot be edited afterwards.
 *
 * Networks created through the wizard are discarded again at teardown.
 */
test.describe('US 14142 - Code generation', () => {
  test(`TC-${CASE.generated}: should assign a unique system-generated code when a network is created`, async ({
    networkManagementPage,
    cleanup,
    steps,
  }) => {
    const data = buildNetwork();
    cleanup.register(() => networkManagementPage.discardDraftNetwork(data.nameEn));
    let form!: NetworkFormDialog;

    await steps.critical('Navigate to the Network Management module - the list is displayed', async () => {
      await networkManagementPage.openList();
    });

    await steps.critical('Add Network and complete every mandatory field - the form is ready to save', async () => {
      form = await networkManagementPage.openAddForm();
      await form.fill(data);
      expect(await form.offersNetworkCodeField(), 'the code is not the user\'s to type').toBe(false);
    });

    await steps.step('Save - the network is created and shows a system-generated code', async () => {
      const outcome = await form.saveNewAndCapture();
      expect(outcome?.status, `CreateNetwork: ${outcome?.text.slice(0, 200)}`).toBeLessThan(300);
      await form.waitForClosed();
      const detail = await networkManagementPage.openDetails(data.nameEn);
      expect((await detail.readOverview()).code, 'the detail screen should show the generated code').toMatch(NETWORK_CODE_PATTERN);
    });
  });

  test(`TC-${CASE.distinct}: should give two newly created networks different codes when they are created one after the other`, async ({
    networkManagementPage,
    cleanup,
    steps,
  }) => {
    const networks = [{ label: 'A', data: buildNetwork() }, { label: 'B', data: buildNetwork() }];
    for (const network of networks) cleanup.register(() => networkManagementPage.discardDraftNetwork(network.data.nameEn));
    const codes: string[] = [];

    await steps.critical('Navigate to the Network Management module - the list is displayed', async () => {
      await networkManagementPage.openList();
    });

    for (const network of networks) {
      await steps.step(`Create Network ${network.label} - it is created with a code`, async () => {
        const form = await networkManagementPage.openAddForm();
        await form.create(network.data);
        const code = await networkManagementPage.readCode(network.data.nameEn);
        expect(code).toMatch(NETWORK_CODE_PATTERN);
        codes.push(code);
      });
    }

    await steps.step('The two codes differ', async () => {
      expect(new Set(codes).size, `codes ${codes.join(', ')}`).toBe(2);
    });
  });

  test(`TC-${CASE.notEditable}: should prevent editing a network's code through the form or the API when the network exists`, async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    const network = await networkIn('Pending', { facilities: 0 });
    let code = '';

    await steps.critical('Navigate to the module - the network carries its code', async () => {
      await networkManagementPage.openList();
      code = (await networkManagementPage.readNetworkRecord(network.id)).networkCode ?? '';
      expect(code).toMatch(NETWORK_CODE_PATTERN);
    });

    await steps.step('The Edit screen shows no code field to change', async () => {
      const form = await networkManagementPage.openEditForm(network.name);
      expect(await form.offersNetworkCodeField(), 'the edit form must not offer the code').toBe(false);
      await form.closeAndDiscard();
    });

    await steps.step('A direct update carrying another code leaves the code unchanged', async () => {
      await networkManagementPage.attemptUpdateViaApi(network.id, { networkCode: FORCED_CODE });
      expect((await networkManagementPage.readNetworkRecord(network.id)).networkCode, 'the code must survive').toBe(code);
    });
  });

  test(`TC-${CASE.concurrent}: should give each network its own code when two sessions create networks at the same moment`, async ({
    networkManagementPage,
    staleSession,
    cleanup,
    steps,
  }) => {
    const first = buildNetwork();
    const second = buildNetwork();
    cleanup.register(() => networkManagementPage.discardDraftNetwork(first.nameEn));
    cleanup.register(() => networkManagementPage.discardDraftNetwork(second.nameEn));
    let forms: NetworkFormDialog[] = [];

    await steps.critical('Navigate to the module in both sessions with a complete form each', async () => {
      await networkManagementPage.openList();
      await staleSession.networks.openList();
      forms = [await networkManagementPage.openAddForm(), await staleSession.networks.openAddForm()];
      await forms[0].fill(first);
      await forms[1].fill(second);
    });

    await steps.step('Both sessions save at once and both creations are processed', async () => {
      const outcomes = await Promise.all(forms.map((form) => form.saveNewAndCapture()));
      expect(outcomes.length).toBe(2);
      expect(outcomes.filter((o) => (o?.status ?? 500) >= 300), 'no duplicate-key or other error to either user').toEqual([]);
    });

    await steps.step('The two networks carry distinct, valid codes', async () => {
      const codes = [await networkManagementPage.readCode(first.nameEn), await networkManagementPage.readCode(second.nameEn)];
      expect(codes.filter((code) => !NETWORK_CODE_PATTERN.test(code)), 'invalid codes').toEqual([]);
      expect(new Set(codes).size, `codes ${codes.join(', ')}`).toBe(2);
    });
  });

  test(`TC-${CASE.repeatedCycles}: should never repeat a code when networks are created and deleted repeatedly`, async ({
    networkManagementPage,
    networkIn,
    steps,
  }) => {
    test.setTimeout(30 * 60_000);
    const codes: string[] = [];

    await steps.critical('Navigate to the Network Management module - the list is displayed', async () => {
      await networkManagementPage.openList();
    });

    await steps.step(`${CYCLES} create / delete cycles each complete and log a code`, async () => {
      for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
        const network = await networkIn('Draft', { facilities: 0 });
        codes.push(await networkManagementPage.readCode(network.name));
        const outcome = await networkManagementPage.deleteNetwork(network.name);
        expect(outcome?.status, `cycle ${cycle}: DeleteNetwork ${outcome?.text.slice(0, 120)}`).toBeLessThan(300);
      }
      expect(codes.length).toBe(CYCLES);
    });

    await steps.step('No code appears more than once across the session', async () => {
      expect(new Set(codes).size, `codes ${codes.join(', ')}`).toBe(codes.length);
    });
  });
});
