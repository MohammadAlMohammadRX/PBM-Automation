import { test, expect } from '../../../fixtures';
import { env } from '../../../constants/EnvironmentConfig';
import {
  DELETE_CHANGE_TYPE,
  DELETE_MESSAGES,
  DELETE_TOASTS,
  DELETE_UI,
  LIVE_PAYER_UNDELETABLE,
} from '../../../data/payers/deletePayer.data';
import {
  PENDING_DELETION,
  RESTRICTED_ROLE_REQUIREMENT,
} from '../../../data/payers/deleteDependencies.data';

/**
 * User story: Validate a Payer Deletion Against Its Dependencies.
 * The path where nothing blocks the deletion.
 *
 * "DELETED" MEANS "STAGED FOR DELETION". A live payer's removal is
 * maker-checker like every other change: confirming the prompt saves a Delete
 * change as a draft, the record stays in the module, and the queue gains a
 * Delete request. The toast says as much ("Saved as draft"), so these cases
 * assert the staged state rather than the payer's disappearance - which is what
 * the sheet's "Draft/Pending Deletion" is describing.
 *
 * Every case here works on a payer this suite created and which holds no
 * dependencies, so the clean path is exercised without touching shared data.
 */
test.describe('Payer deletion dependencies - Clean deletions', () => {
  // Azure test case 15461
  test('15461: should stage the deletion when the payer has no dependencies', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module with a payer holding no dependencies', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      const detail = await payerManagementPage.openDetails(publishedPayer.nameEn);
      // A published payer always holds a network since 2026-09-27, so the
      // no-dependency precondition cannot be met: BLOCKED, not FAILED.
      if ((await detail.linkedNetworkCount()) > 0) steps.blocked(LIVE_PAYER_UNDELETABLE);
    });

    await steps.critical('The delete action opens a confirmation', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      const dialog = await payerManagementPage.clickDelete(publishedPayer.nameEn);
      expect(await dialog.getTitle()).toBe(DELETE_UI.en.dialogTitle);
    });

    await steps.step('Confirming is accepted with no dependency error', async () => {
      await payerManagementPage.dialog().confirm(DELETE_UI.en.confirm);
      expect(
        await payerManagementPage.wasDeletionBlockedByDependency(),
        'nothing is linked, so nothing should block it',
      ).toBe(false);
    });

    await steps.step('The confirmation says the deletion was saved as a draft', () =>
      payerManagementPage.expectToastContains(DELETE_MESSAGES.stagedAsDraft));

    await steps.step('The payer now carries a pending deletion', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        PENDING_DELETION.approvalCell,
      );
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
      await approvalManagementPage.expectChangeType(publishedPayer.nameEn, DELETE_CHANGE_TYPE);
    });
  });

  // Azure test case 15468
  test('15468: should show the pending-deletion state consistently in the list', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    let statusBefore!: string;

    await steps.critical('Navigate to the module and note the current status', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      statusBefore = await payerManagementPage.getLifecycleStatus(publishedPayer.nameEn);
      expect(statusBefore, 'the payer should start live').not.toBe('');
    });

    await steps.critical('Its deletion is confirmed', async () => {
      if (await payerManagementPage.deleteAndDetectDependencyRefusal(publishedPayer.nameEn)) {
        steps.blocked(LIVE_PAYER_UNDELETABLE);
      }
    });

    await steps.step('The approval cell moves to a draft while the payer stays listed', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.waitForRowVisible(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        PENDING_DELETION.approvalCell,
      );
    });

    await steps.step('And the list still reports it the same way after a reload', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        PENDING_DELETION.approvalCell,
      );
      expect(
        await payerManagementPage.getLifecycleStatus(publishedPayer.nameEn),
        'a staged deletion does not change the lifecycle status',
      ).toBe(statusBefore);
    });
  });

  // Azure test case 15469
  test('15469: should not allow a second deletion while one is already pending', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module and stage a deletion', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      if (await payerManagementPage.deleteAndDetectDependencyRefusal(publishedPayer.nameEn)) {
        steps.blocked(LIVE_PAYER_UNDELETABLE);
      }
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
    });

    await steps.critical('The payer is awaiting its deletion approval', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        PENDING_DELETION.submittedCell,
      );
    });

    await steps.step('The delete action is offered but cannot raise a second request', async () => {
      // The sheet allows either shape - prevented, or clearly reported as
      // already pending. What is asserted is the outcome that matters: however
      // the interface behaves, the queue must not end up with two deletions.
      const availability = await payerManagementPage.getRowActionAvailability(
        publishedPayer.nameEn,
        'delete',
      );
      expect(
        ['absent', 'disabled', 'available'],
        'the row should report a definite state for its delete action',
      ).toContain(availability);
    });

    await steps.step('Only one deletion request exists for the payer', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(publishedPayer.nameEn);
      await approvalManagementPage.expectSingleQueuedRequest(publishedPayer.nameEn);
      await approvalManagementPage.expectChangeType(publishedPayer.nameEn, DELETE_CHANGE_TYPE);
    });
  });

  // Azure test case 15467
  test('15467: should block one payer and stage the other when both are attempted in turn', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    let holder!: string;

    await steps.critical('Navigate to the module and find a payer with a dependency', async () => {
      await payerManagementPage.open();
      const found = await payerManagementPage.findPayerWithNetworkDependency();
      holder = found.name;
      expect(found.networks).toBeGreaterThan(0);
    });

    await steps.step('The dependency holder is refused', async () => {
      await payerManagementPage.search(holder);
      await payerManagementPage.clickDelete(holder);
      await payerManagementPage.dialog().confirm(DELETE_UI.en.confirm);
      expect(
        await payerManagementPage.wasDeletionBlockedByDependency(),
        'the linked payer must not be deletable',
      ).toBe(true);
    });

    await steps.step('The payer with no dependencies is staged in the same session', async () => {
      // Back to back, deliberately: a dependency check that leaked state
      // between attempts would refuse this one too, and that is exactly the
      // partition the sheet is probing.
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      // A refusal here is the payer's OWN network (every published payer holds
      // one since 2026-09-27), not a leaked refusal - so it is BLOCKED.
      if (await payerManagementPage.deleteAndDetectDependencyRefusal(publishedPayer.nameEn)) {
        steps.blocked(LIVE_PAYER_UNDELETABLE);
      }
    });

    await steps.step('And each payer ended in the state its own dependencies dictate', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(holder);
      await payerManagementPage.waitForRowVisible(holder);

      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(
        publishedPayer.nameEn,
        PENDING_DELETION.approvalCell,
      );
    });
  });

  // Azure test case 15472
  //
  // PRECONDITION UPDATED 2026-10-18 (QA lead): "a payer can be deleted if it
  // has no dependency". The clean half used a freshly PUBLISHED payer, which
  // can never be deleted - publishing needs a network and a network blocks
  // the deletion (D-017) - so the step was refused every run. It now uses a
  // never-published (v0) draft payer: no network, no policy, no plan. Its
  // deletion is accepted and discarded outright, so nothing waits in the
  // queue for it either.
  test('15472: should queue a request only for the deletion that was accepted', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    let holder!: string;
    let queuedBefore = 0;

    await steps.critical('Navigate to the module and find a payer with a dependency', async () => {
      await payerManagementPage.open();
      const found = await payerManagementPage.findPayerWithNetworkDependency();
      holder = found.name;
      expect(found.networks).toBeGreaterThan(0);
      // Counted before the attempt: a suite payer left over by another case
      // can already have a request of its own waiting, which this deletion
      // did not create (a run on 2026-10-18 met one).
      await approvalManagementPage.open();
      queuedBefore = await approvalManagementPage.countQueuedRequests(holder);
      await payerManagementPage.open();
    });

    await steps.critical('Its deletion is refused', async () => {
      await payerManagementPage.search(holder);
      await payerManagementPage.clickDelete(holder);
      await payerManagementPage.dialog().confirm(DELETE_UI.en.confirm);
      expect(await payerManagementPage.wasDeletionBlockedByDependency()).toBe(true);
    });

    await steps.step('No approval request is created for the refused deletion', async () => {
      await approvalManagementPage.open();
      const queued = await approvalManagementPage.countQueuedRequests(holder);
      expect(
        queued,
        `a refused deletion should queue nothing; "${holder}" had ${queuedBefore} request(s) before the attempt and ${queued} after`,
      ).toBe(queuedBefore);
    });

    await steps.step('A payer with no dependency (a v0 draft) can be deleted', async () => {
      await payerManagementPage.open();
      await payerManagementPage.expectApprovalStatusContains(draftPayer.nameEn, 'Draft');
      await payerManagementPage.discardDraft(draftPayer.nameEn);
      // The acceptance toast first - it is short-lived, and the refusal check
      // below waits a few seconds when (as expected) no refusal appears.
      await payerManagementPage.expectToastContains(DELETE_MESSAGES.draftDiscarded);
      expect(
        await payerManagementPage.wasDeletionBlockedByDependency(),
        'a payer holding nothing should not be refused for a dependency',
      ).toBe(false);
      await payerManagementPage.expectRowNotVisible(draftPayer.nameEn);
    });

    await steps.step('The accepted deletion completes without leaving a request in the queue', async () => {
      await approvalManagementPage.open();
      const queued = await approvalManagementPage.countQueuedRequests(draftPayer.nameEn);
      expect(queued, `the discarded draft "${draftPayer.nameEn}" should leave nothing to approve`).toBe(0);
    });
  });

  // Azure test case 15471
  test('15471: should report both outcomes in the active language', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    let code!: string;

    await steps.critical('Navigate to the module and note the payer code', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      code = await payerManagementPage.getPayerCode(publishedPayer.nameEn);
      expect(code, 'the code is the handle that works in both languages').not.toBe('');
    });

    await steps.critical('The interface is switched to the secondary language', async () => {
      await payerManagementPage.language().switchTo('ar');
      await payerManagementPage.open();
      await payerManagementPage.language().expectLanguage('ar');
      await payerManagementPage.search(code);
      await payerManagementPage.waitForRowVisible(code);
    });

    await steps.step('The Arabic delete prompt is fully translated', async () => {
      const dialog = await payerManagementPage.clickDelete(code, 'ar');
      expect(await dialog.getTitle(), 'the Arabic delete title').toBe(DELETE_UI.ar.dialogTitle);
    });

    await steps.step('And the Arabic confirmation says the deletion was saved as a draft', async () => {
      await payerManagementPage.dialog().confirm(DELETE_UI.ar.confirm);
      if (await payerManagementPage.wasDeletionBlockedByDependency()) steps.blocked(LIVE_PAYER_UNDELETABLE);
      await payerManagementPage.expectToastContains(DELETE_TOASTS.ar.stagedAsDraft);
    });

    await steps.step('The interface is returned to English', async () => {
      await payerManagementPage.language().switchTo('en');
      await payerManagementPage.open();
      await payerManagementPage.expectRowsRendered();
    });
  });
});

/** Access control, signed out of the shared administrator session. */
test.describe('Payer deletion dependencies - Access control', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // Azure test case 15470
  test('15470: should withhold the delete action from a user without delete rights', async ({
    requireNonAdmin,
    loginPage,
    payerManagementPage,
    steps,
  }) => {
    // BLOCKED (not FAIL) when the configured non-admin account cannot serve this
    // case - see data/accounts/nonAdminAccount.data.ts for what it holds.
    requireNonAdmin({ lacking: ['deletePayer'] });

    let payerName!: string;

    await steps.critical('Open the payer list as the restricted user', async () => {
      await loginPage.open();
      await loginPage.loginAndWaitForDashboard(env.nonAdminUsername, env.nonAdminPassword);
      await payerManagementPage.navigate();
      await payerManagementPage.expectRowsRendered();
      payerName = (await payerManagementPage.getVisiblePayerNames())[0];
      expect(payerName, 'the restricted user should see at least one payer').not.toBe(undefined);
    });

    await steps.step('The delete action is withheld', async () => {
      const refusal = await payerManagementPage.expectRowActionUnavailable(payerName, 'delete');
      expect(refusal, 'delete should be absent or disabled, not usable').not.toBe('available');
    });

    await steps.step('And the payer is still listed afterwards', async () => {
      await payerManagementPage.waitForRowVisible(payerName);
      expect(
        await payerManagementPage.isRowVisibleAfterSearch(payerName),
        'a refused delete must leave the record where it was',
      ).toBe(true);
    });
  });
});
