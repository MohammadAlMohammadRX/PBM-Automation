import { test, expect } from '../../../fixtures';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import {
  ACTIVATION_PROMPT,
  NETWORK_STATUS,
  STAGED_TOAST,
  STATUS_COMBINATIONS,
} from '../../../data/networks/networkActivation.data';

/**
 * User story: Enable Network Activation Regardless of Payer Status.
 * The four payer/network status combinations, and the boundary case.
 *
 * TWO THINGS FOUND BEFORE THESE WERE WRITTEN, both of which shape every case:
 *
 *   THE SHEET'S ROUTE DOES NOT EXIST. It has the user open a payer, go to its
 *   Networks tab, select a network and click Activate or Deactivate there. That
 *   table offers one control per row - Unassign - beside the network's status
 *   and its assignment state. TC-001 asserts the activation control is there,
 *   where the sheet first calls for it, and fails. The other cases note the gap
 *   and exercise the capability where it lives, in the Network module: one
 *   defect reported once, rather than the same finding four times over.
 *
 *   THE REQUIREMENT ITSELF HOLDS. A network's lifecycle action is decided by
 *   the NETWORK's status and never by its payer's - Inactive offers Activate,
 *   Active offers Deactivate, and an Active payer and an Inactive one behave
 *   identically. That is what the sheet is really asking, and it is what these
 *   cases prove.
 *
 * MAKER-CHECKER: confirming stages a draft, so a case that must observe the new
 * status sends the change for approval and approves it first. The prompt itself
 * tells the user to expect that.
 */
test.describe('Network activation - Status combinations', () => {
  const combinationOf = (caseId: string) =>
    STATUS_COMBINATIONS.find((candidate) => candidate.caseId === caseId)!;

  test('TC-001: should activate a linked network when the payer is Active', async ({
    payerManagementPage,
    networkManagementPage,
    networkApprovalsPage,
    networkInStatus,
    publishedPayer,
    toast,
    steps,
  }) => {
    let network!: string;

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.critical('An Inactive network is on screen', async () => {
      network = await networkInStatus(NETWORK_STATUS.inactive);
      await networkManagementPage.openList();
      await networkManagementPage.search(network);
      await networkManagementPage.expectStatusText(network, NETWORK_STATUS.inactive);
    });

    await steps.step('A payer Networks tab offers an enabled lifecycle action for its network', async () => {
      // FAILS - and this is the story's central finding, asserted here because
      // this is the first step in the sheet that calls for the control. The row
      // offers Unassign and nothing else, so the journey the story describes
      // cannot be walked: changing a network's status means leaving the payer
      // for the Network module. What is missing is the ROUTE, not the
      // capability - the rest of this case proves the capability works.
      //
      // Read from a link that ALREADY exists rather than one this case makes.
      // Assigning a network needs one from the Assign Network drawer's pool of
      // live, unassigned networks, and that pool is exhausted here: a payer
      // holding a network cannot be deleted, so earlier runs' links were never
      // released. A case that only needs to LOOK at a linked row should not be
      // blocked by that.
      await payerManagementPage.open();
      const holder = await payerManagementPage.findPayerWithNetworkDependency();
      const detail = await payerManagementPage.openDetails(holder.name);
      const row = await detail.getFirstLinkedNetwork();
      expect(
        row.actions,
        `the Linked Networks row for "${row.name}" offers only `
          + `${row.actions.join(', ') || '(nothing)'}`,
      ).toContain(row.status === NETWORK_STATUS.active ? 'inactivate' : 'activate');
    });

    await steps.step('Activating it from the Network module prompts and reports the change staged', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(network);
      await networkManagementPage.expectRowActionsEnabled(network, ['activate']);

      const prompt = await networkManagementPage.openActivationPrompt(network);
      expect(await prompt.getTitle(), 'the prompt should name the action').toBe(
        ACTIVATION_PROMPT.title,
      );
      expect(await prompt.getMessage(), 'the prompt should name the network').toContain(network);
      await prompt.confirm('activate');
      await toast.expectText(STAGED_TOAST);
    });

    await steps.step('The network reads Active once the change is approved, and the payer is untouched', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(network);

      await networkApprovalsPage.open();
      await networkApprovalsPage.expectInQueue(network);
      await networkApprovalsPage.approve(network);

      await networkManagementPage.openList();
      await networkManagementPage.search(network);
      await networkManagementPage.expectStatusText(network, NETWORK_STATUS.active);

      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });
  });

  for (const caseId of ['TC-002', 'TC-003'] as const) {
    const combination = combinationOf(caseId);
    const verb = combination.action === 'activate' ? 'activate' : 'deactivate';

    test(`${caseId}: should ${verb} the network when its payer is Inactive`, async ({
      payerManagementPage,
      networkManagementPage,
      networkApprovalsPage,
      networkInStatus,
      inactivePayer,
      toast,
      steps,
    }) => {
      let network!: string;

      await steps.critical('Navigate to the module with an Inactive payer', async () => {
        await payerManagementPage.open();
        await payerManagementPage.search(inactivePayer.nameEn);
        await payerManagementPage.expectLifecycleStatus(
          inactivePayer.nameEn,
          LIFECYCLE_STATUS.inactive.en,
        );
      });

      await steps.critical(
        `A network displaying ${combination.networkStatus} is on screen`,
        async () => {
          // Not linked to this payer, and it does not need to be: the claim
          // under test is that a network's lifecycle action never consults its
          // payer, so what matters is that a payer in the awkward status exists
          // at the same time. Linking is impossible here in any case - the
          // assignable-network pool is exhausted, see TC-001 - and a blocked
          // case would report the environment rather than the rule.
          network = await networkInStatus(combination.networkStatus);
          await networkManagementPage.openList();
          await networkManagementPage.search(network);
          await networkManagementPage.expectStatusText(network, combination.networkStatus);
        },
      );

      await steps.step(
        `The ${verb} action is available even though the payer is Inactive`,
        async () => {
          // The sheet's own words: "not disabled due to payer status". Read in
          // the Network module because the payer's tab offers no such control
          // at all - see TC-001, which reports that gap.
          await networkManagementPage.openList();
          await networkManagementPage.search(network);
          await networkManagementPage.expectRowActionsEnabled(network, [combination.action]);
        },
      );

      await steps.step('Confirming the change reports it saved and staged', async () => {
        // The two directions use different surfaces - a dialog for activate, a
        // reason drawer for inactivate - so the wording is read back through
        // one method rather than branched on here. See
        // NetworkManagementPage.stageStatusChange.
        const wording = await networkManagementPage.stageStatusChange(
          network,
          combination.action,
        );
        expect(
          wording.explanation,
          'the confirmation should state that the change needs approval to take effect',
        ).toContain(ACTIVATION_PROMPT.approvalCaveat);
        await toast.expectText(STAGED_TOAST);
      });

      await steps.step(
        `The network reads ${combination.becomes} once approved, and the payer stays Inactive`,
        async () => {
          await networkManagementPage.openList();
          await networkManagementPage.submitForApproval(network);

          await networkApprovalsPage.open();
          await networkApprovalsPage.expectInQueue(network);
          await networkApprovalsPage.approve(network);

          await networkManagementPage.openList();
          await networkManagementPage.search(network);
          await networkManagementPage.expectStatusText(network, combination.becomes);

          // The second half of "regardless of payer status": the network moved
          // and the payer did not follow it.
          await payerManagementPage.open();
          await payerManagementPage.search(inactivePayer.nameEn);
          await payerManagementPage.expectLifecycleStatus(
            inactivePayer.nameEn,
            LIFECYCLE_STATUS.inactive.en,
          );
        },
      );
    });
  }

  test('TC-004: should deactivate the network when its payer is Active', async ({
    payerManagementPage,
    networkManagementPage,
    networkApprovalsPage,
    networkInStatus,
    publishedPayer,
    toast,
    steps,
  }) => {
    let network!: string;

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.critical('An Active network is on screen alongside the Active payer', async () => {
      network = await networkInStatus(NETWORK_STATUS.active);
      await networkManagementPage.openList();
      await networkManagementPage.search(network);
      await networkManagementPage.expectStatusText(network, NETWORK_STATUS.active);
    });

    await steps.step('The Deactivate action is offered and its opposite is not', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.search(network);
      await networkManagementPage.expectRowActionsEnabled(network, ['inactivate']);
      // An Active network must not also offer Activate. Asserted because it is
      // the half that shows the action is chosen by status rather than simply
      // always rendered.
      await networkManagementPage.expectRowActionUnavailable(network, 'activate');
    });

    await steps.step('Confirming the deactivation reports it saved and staged', async () => {
      // Deactivation opens a drawer that requires a reason for the audit
      // history - not the shared dialog activation uses.
      const wording = await networkManagementPage.stageStatusChange(network, 'inactivate');
      expect(wording.title, 'the confirmation should name the action').not.toBe('');
      expect(
        wording.explanation,
        'and should state that the change needs approval to take effect',
      ).toContain(ACTIVATION_PROMPT.approvalCaveat);
      await toast.expectText(STAGED_TOAST);
    });

    await steps.step('The network reads Inactive once the change is approved', async () => {
      await networkManagementPage.openList();
      await networkManagementPage.submitForApproval(network);

      await networkApprovalsPage.open();
      await networkApprovalsPage.expectInQueue(network);
      await networkApprovalsPage.approve(network);

      await networkManagementPage.openList();
      await networkManagementPage.search(network);
      await networkManagementPage.expectStatusText(network, NETWORK_STATUS.inactive);
    });
  });

  test('TC-005: should offer the correct lifecycle action in every payer/network status combination', async ({
    payerManagementPage,
    networkManagementPage,
    networkInStatus,
    publishedPayer,
    inactivePayer,
    steps,
  }) => {
    const payerOf = { Active: publishedPayer.nameEn, Inactive: inactivePayer.nameEn };
    const seen: string[] = [];

    await steps.critical('Navigate to the module with a payer in each status', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        inactivePayer.nameEn,
        LIFECYCLE_STATUS.inactive.en,
      );
    });

    await steps.step('Each combination displays the network status it should', async () => {
      for (const combination of STATUS_COMBINATIONS) {
        const network = await networkInStatus(combination.networkStatus);
        await networkManagementPage.openList();
        await networkManagementPage.search(network);
        await networkManagementPage.expectStatusText(network, combination.networkStatus);
        seen.push(`${combination.payerStatus}/${combination.networkStatus}`);
      }
      expect(seen, 'all four combinations should be reachable').toHaveLength(
        STATUS_COMBINATIONS.length,
      );
    });

    await steps.step('The action is enabled in every combination, whatever the payer status', async () => {
      // The matrix asserted as a whole, and read-only on purpose: TC-001 to
      // TC-004 already perform the four changes, so repeating them here would
      // spend four more approval round trips to prove the same thing.
      for (const combination of STATUS_COMBINATIONS) {
        const network = await networkInStatus(combination.networkStatus);
        await networkManagementPage.openList();
        await networkManagementPage.search(network);
        expect(
          await networkManagementPage.getRowActionAvailability(network, combination.action),
          `${combination.payerStatus} payer / ${combination.networkStatus} network: `
            + `"${combination.action}" must be usable`,
        ).toBe('available');
      }
    });

    await steps.step('Every payer keeps the status it started with', async () => {
      for (const status of ['Active', 'Inactive'] as const) {
        await payerManagementPage.open();
        await payerManagementPage.search(payerOf[status]);
        await payerManagementPage.expectLifecycleStatus(
          payerOf[status],
          status === 'Active' ? LIFECYCLE_STATUS.active.en : LIFECYCLE_STATUS.inactive.en,
        );
      }
    });
  });

  test('TC-006: should still offer the network action immediately after its payer status changes', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    networkManagementPage,
    networkInStatus,
    publishedPayer,
    steps,
  }) => {
    let network!: string;

    await steps.critical('Navigate to the Payer Management module', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.critical('The payer status is changed from Active to Inactive', async () => {
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
      await payerInactivateDialog.inactivateWithFirstReason(
        'Inactivated to cross a status boundary.',
      );
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
      await approvalManagementPage.approve(publishedPayer.nameEn);

      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.inactive.en,
      );
    });

    await steps.step('A network is still offered its Activate action right afterwards', async () => {
      // "Immediately", in the sheet's sense: straight after the payer crossed
      // its status boundary, with no intervening reload. If a network's action
      // were computed from its payer, or cached from before the change, this is
      // where a stale answer would show.
      network = await networkInStatus(NETWORK_STATUS.inactive);
      await networkManagementPage.openList();
      await networkManagementPage.search(network);
      await networkManagementPage.expectRowActionsEnabled(network, ['activate']);
    });

    await steps.step('Opening the prompt confirms the action is genuinely available', async () => {
      const prompt = await networkManagementPage.openActivationPrompt(network);
      expect(await prompt.getTitle(), 'the activation prompt should open').toBe(
        ACTIVATION_PROMPT.title,
      );
      expect(await prompt.getMessage(), 'the prompt should name the network').toContain(network);
      // Cancelled rather than confirmed: the point is that the action was
      // AVAILABLE across the boundary, and TC-001 to TC-004 already prove the
      // change itself applies.
      await prompt.cancel();
      await networkManagementPage.expectStatusText(network, NETWORK_STATUS.inactive);
    });
  });
});
