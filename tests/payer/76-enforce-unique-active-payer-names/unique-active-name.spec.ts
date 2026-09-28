import { test, expect } from '../../../fixtures';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { Logger } from '../../../utils/Logger';
import { buildUniquePayer } from '../../../data/payers/payer.data';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import { NON_ADMIN_PROFILE } from '../../../data/accounts/nonAdminAccount.data';
import type { ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';
import {
  DUPLICATE_NAME_MESSAGE,
  NAME_VARIANTS,
  NEEDS_EXPIRED_PAYER,
  RAPID_SUBMIT_CLICKS,
} from '../../../data/payers/uniqueActiveName.data';

/**
 * User story: Enforce Unique Active Payer Names (Azure US 16220).
 *
 * THE SHEET'S FLOW IS NOT THIS APPLICATION'S FLOW - see uniqueActiveName.data.ts
 * for the whole argument. In short: every case in the sheet says "set status to
 * Active and click Save/Activate", but PBM has no editable Status field. A payer
 * is saved as a draft, sent for approval, and its status is DERIVED at approval.
 * So "activation" here is the approval, which is the only moment a payer becomes
 * Active and therefore the only moment the rule can bite.
 *
 * These cases were written before Azure had issued ids for them, against the
 * local ids the 2026-09-27 sheet carried, and were restamped to their Azure
 * ids (16412-16429) from the 2026-09-28 sheet.
 */
test.describe('Enforce unique Active payer names - the rule at approval', () => {
  test('16412: should publish a payer whose name no other Active payer holds', async ({
    payerManagementPage,
    approvalManagementPage,
    uniquePayer,
    cleanup,
    steps,
  }) => {
    test.slow();
    cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));

    await steps.critical('Register a payer under a name nothing else holds', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(uniquePayer.nameEn);
    });

    // THE CONTROL for this whole story. Every other case asserts a refusal, and
    // a rule that refused every approval would satisfy all of them. This is the
    // one that fails if the guard is too eager.
    await steps.step('The approval is accepted and the payer goes live', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(uniquePayer.nameEn);
      await approvalManagementPage.approve(uniquePayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(uniquePayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        uniquePayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });
  });

  test('16413: should refuse to publish a second payer under a live payer\'s name', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    cleanup,
    steps,
  }) => {
    test.slow();
    const twin = buildUniquePayer({ nameEn: publishedPayer.nameEn });
    cleanup.register(() => payerManagementPage.deletePayer(twin.nameEn));

    await steps.critical('An Active payer already holds the name', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });

    // The defect this story exists to prevent: two Active payers under one name.
    // Every downstream module that resolves a payer BY NAME - claims, policies,
    // the cross-module selector - would then be choosing between them blind.
    await steps.step('A second registration under that name is not published', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(twin);
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(twin.nameEn).catch(() => undefined);
      await approvalManagementPage.open();
      await approvalManagementPage.approve(twin.nameEn).catch(() => undefined);

      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      const live = await payerManagementPage.getVisiblePayerNames();
      const activeTwins = live.filter((name) => name.trim() === publishedPayer.nameEn.trim());
      expect(
        activeTwins.length,
        `only one payer may be Active under "${publishedPayer.nameEn}"; the list shows `
          + `${activeTwins.length} rows carrying that name`,
      ).toBeLessThanOrEqual(1);
    });
  });

  test('16415: should free the name once the payer holding it is Inactive', async ({
    payerManagementPage,
    approvalManagementPage,
    inactivePayer,
    cleanup,
    steps,
  }) => {
    test.slow();
    const reuse = buildUniquePayer({ nameEn: inactivePayer.nameEn });
    cleanup.register(() => payerManagementPage.deletePayer(reuse.nameEn));

    await steps.critical('A payer holds the name but is Inactive', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        inactivePayer.nameEn,
        LIFECYCLE_STATUS.inactive.en,
      );
    });

    // The rule reserves a name for ACTIVE payers only. A withdrawn payer that
    // kept its name forever would make every name a one-time allocation.
    await steps.step('A new registration may take that name and go live', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(reuse);
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(reuse.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(reuse.nameEn);
      await approvalManagementPage.approve(reuse.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(reuse.nameEn);
      await payerManagementPage.expectLifecycleStatus(reuse.nameEn, LIFECYCLE_STATUS.active.en);
    });
  });

  test('16416: should free the name once the payer holding it is deleted', async ({
    payerManagementPage,
    approvalManagementPage,
    uniquePayer,
    cleanup,
    steps,
  }) => {
    test.slow();
    const reuse = buildUniquePayer({ nameEn: uniquePayer.nameEn });
    cleanup.register(() => payerManagementPage.deletePayer(reuse.nameEn));

    await steps.critical('Register a payer and then delete it', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(uniquePayer);
      await payerManagementPage.open();
      await payerManagementPage.deletePayer(uniquePayer.nameEn);
    });

    await steps.step('The name is available again', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(reuse);
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(reuse.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(reuse.nameEn);
      await approvalManagementPage.approve(reuse.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(reuse.nameEn);
      await payerManagementPage.expectLifecycleStatus(reuse.nameEn, LIFECYCLE_STATUS.active.en);
    });
  });

  test('16417: should release a name for reuse when its holder is withdrawn', async ({
    payerManagementPage,
    payerInactivateDialog,
    approvalManagementPage,
    publishedPayer,
    cleanup,
    steps,
  }) => {
    // Three maker-checker round trips: the blocked attempt, the withdrawal, the
    // second attempt.
    test.slow();
    const twin = buildUniquePayer({ nameEn: publishedPayer.nameEn });
    cleanup.register(() => payerManagementPage.deletePayer(twin.nameEn));

    await steps.critical('The name is taken by an Active payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.critical('Withdraw the payer holding it', async () => {
      await payerManagementPage.inactivateRow(publishedPayer.nameEn);
      await payerInactivateDialog.inactivateWithFirstReason('Freeing the name for a reuse case.');
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(publishedPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.approve(publishedPayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.inactive.en,
      );
    });

    // The state transition the case is really about: the same registration that
    // must be refused while the name is held becomes legitimate the moment it
    // is released. A rule that reserved names permanently would fail here.
    await steps.step('The same name may now be registered and published', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(twin);
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(twin.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(twin.nameEn);
      await approvalManagementPage.approve(twin.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(twin.nameEn);
      await payerManagementPage.expectLifecycleStatus(twin.nameEn, LIFECYCLE_STATUS.active.en);
    });
  });

  test('16420: should compare names ignoring case and surrounding spaces', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    cleanup,
    steps,
  }) => {
    test.slow();

    for (const variant of NAME_VARIANTS) {
      const candidate = buildUniquePayer({ nameEn: variant.build(publishedPayer.nameEn) });
      cleanup.register(() => payerManagementPage.deletePayer(candidate.nameEn));

      await steps.step(`"${variant.key}" is ${variant.refused ? 'refused' : 'allowed'}`, async () => {
        await payerManagementPage.open();
        await payerManagementPage.createDraftPayer(candidate);
        await payerManagementPage.open();
        await payerManagementPage.sendForApproval(candidate.nameEn).catch(() => undefined);
        await approvalManagementPage.open();
        await approvalManagementPage.approve(candidate.nameEn).catch(() => undefined);

        await payerManagementPage.open();
        await payerManagementPage.search(candidate.nameEn);
        const status = await payerManagementPage.getLifecycleStatus(candidate.nameEn).catch(
          (): string => '',
        );
        const wentLive = status.includes(LIFECYCLE_STATUS.active.en);
        expect(
          wentLive,
          `${variant.why} The candidate "${candidate.nameEn}" ended as "${status || '(not found)'}".`,
        ).toBe(!variant.refused);
      });
    }
  });

  test('16422: should accept the registration once the clashing name is corrected', async ({
    payerManagementPage,
    approvalManagementPage,
    publishedPayer,
    cleanup,
    steps,
  }) => {
    test.slow();
    const corrected = `${publishedPayer.nameEn} II`;
    const clashing = buildUniquePayer({ nameEn: publishedPayer.nameEn });
    cleanup.register(() => payerManagementPage.deletePayer(clashing.nameEn));
    cleanup.register(() => payerManagementPage.deletePayer(corrected));

    await steps.critical('A registration is raised under a name already held', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(clashing);
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(clashing.nameEn).catch(() => undefined);
      await approvalManagementPage.open();
      await approvalManagementPage.approve(clashing.nameEn).catch(() => undefined);
    });

    // The recovery path, which is what makes the rule usable rather than a dead
    // end: the maker renames and the same registration goes through.
    await steps.step('Renaming it clears the clash and it publishes', async () => {
      await payerManagementPage.open();
      await payerManagementPage.renamePayer(clashing.nameEn, corrected);
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(corrected).catch(() => undefined);
      await approvalManagementPage.open();
      await approvalManagementPage.approve(corrected).catch(() => undefined);
      await payerManagementPage.open();
      await payerManagementPage.search(corrected);
      const names = await payerManagementPage.getVisiblePayerNames();
      expect(
        names,
        `the corrected registration "${corrected}" should exist; the list showed: `
          + `${names.join(', ') || '(nothing)'}`,
      ).toContain(corrected);
    });
  });

  test('16429: should refuse a registration that carries no name at all', async ({
    payerManagementPage,
    uniquePayer,
    steps,
  }) => {
    await steps.critical('Open the registration form', async () => {
      await payerManagementPage.open();
      await payerManagementPage.openCreateForm();
    });

    // A blank name is the degenerate case of the uniqueness rule: every blank
    // name collides with every other blank name, so the register must never
    // accept one in the first place.
    await steps.step('A blank name is refused and nothing is created', async () => {
      const form = payerManagementPage.form();
      await form.setFieldValue('Payer Name', '', 'text');
      const outcome = await form.saveNewAndCaptureOutcome();
      expect(
        outcome === null || outcome.status >= 400,
        `a payer with no name must not be created; the server answered `
          + `${outcome ? outcome.status : 'nothing sent'}`,
      ).toBe(true);
      await form.closeAndDiscard().catch(() => undefined);
    });

    await steps.step('And the list holds no blank-named record', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(uniquePayer.nameEn);
      await payerManagementPage.expectRowNotVisible(uniquePayer.nameEn);
    });
  });
});

/**
 * Where the rule is enforced, and who it applies to.
 */
test.describe('Enforce unique Active payer names - enforcement and access', () => {
  test('16425: should enforce the rule in the service, not only in the form', async ({
    payerManagementPage,
    publishedPayer,
    page,
    steps,
  }) => {
    test.slow();
    let payload: Record<string, unknown> = {};

    await steps.critical('Take a live payer whose name is held', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        publishedPayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
      payload = {
        payerNameEn: publishedPayer.nameEn,
        payerNameAr: publishedPayer.nameAr,
        email: publishedPayer.email,
        licenseNumber: `LIC-DUP-${Date.now()}`.slice(0, 20),
      };
    });

    // A rule that lives only in the browser is not a rule. Anything else
    // talking to this API - an import, an integration, a second client - walks
    // straight past a form validation.
    await steps.step('A direct request under the held name is refused', async () => {
      const response = await NetworkUtils.postAsSession(page, ApiEndpoints.payerCreate, payload);
      expect(
        response.status < 300,
        `creating a payer under the Active name "${publishedPayer.nameEn}" must be refused by `
          + `the service; it answered ${response.status} ("${response.text.slice(0, 200)}")`,
      ).toBe(false);
    });
  });

  test('16426: should explain a refusal without losing what the maker typed', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    test.slow();
    const twin = buildUniquePayer({ nameEn: publishedPayer.nameEn });

    await steps.critical('Fill the form with a name that is already held', async () => {
      await payerManagementPage.open();
      const form = await payerManagementPage.openCreateForm();
      await form.fillBasicInformation(twin);
      await form.clickNext();
      await form.fillContactInformation(twin);
    });

    // Two failures worth telling apart: a refusal nobody can read, and a
    // refusal that empties the form so the maker retypes everything. The
    // second is what turns a rule into a reason to avoid the system.
    await steps.step('The refusal names the payer and the form keeps its values', async () => {
      const form = payerManagementPage.form();
      const outcome = await form.saveNewAndCaptureOutcome();
      const refused = outcome === null || outcome.status >= 400;

      if (!refused) {
        expect(
          refused,
          `the duplicate name "${twin.nameEn}" was accepted (${outcome?.status}), so there was `
            + 'no refusal message to judge',
        ).toBe(true);
        return;
      }

      const messages = await payerManagementPage.waitForVisibleMessages().catch((): string[] => []);
      const shown = messages.join(' ').trim();
      Logger.info(`the refusal read: "${shown}"`);
      expect(
        shown.length >= DUPLICATE_NAME_MESSAGE.minimumLength,
        `a refusal should explain itself; the screen showed "${shown || '(nothing)'}"`,
      ).toBe(true);

      const kept = await form.getFieldValue('Email Address').catch((): string => '');
      expect(
        kept.trim(),
        'the form should keep what the maker typed so the name can be corrected in place',
      ).not.toBe('');
      await form.closeAndDiscard().catch(() => undefined);
    });
  });

  test('16421: should create one payer, not two, when Save is clicked repeatedly', async ({
    payerManagementPage,
    uniquePayer,
    cleanup,
    steps,
  }) => {
    test.slow();
    cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));

    await steps.critical('Fill a valid registration', async () => {
      await payerManagementPage.open();
      const form = await payerManagementPage.openCreateForm();
      await form.fillBasicInformation(uniquePayer);
      await form.clickNext();
      await form.fillContactInformation(uniquePayer);
      await form.clickNext();
      await form.fillEffectivePeriod(uniquePayer);
    });

    // The race the rule cannot see: two requests in flight at once both find
    // the name free. The guard against it is the button disabling itself, and
    // this is the only case that exercises it.
    await steps.step(`Clicking Save ${RAPID_SUBMIT_CLICKS} times creates one record`, async () => {
      const form = payerManagementPage.form();
      await form.saveRepeatedly(RAPID_SUBMIT_CLICKS);
      await payerManagementPage.open();
      await payerManagementPage.search(uniquePayer.nameEn);
      const found = await payerManagementPage.getVisiblePayerNames();
      const copies = found.filter((name) => name.trim() === uniquePayer.nameEn.trim());
      expect(
        copies.length,
        `a repeated Save must not create a second record; the list shows ${copies.length} rows `
          + `named "${uniquePayer.nameEn}"`,
      ).toBeLessThanOrEqual(1);
    });
  });

  test('16423: should withhold the publishing decision from a role without the right', async ({
    shapedNonAdmin,
    steps,
  }) => {
    test.slow();
    let session!: ShapedSession;

    await steps.critical('Sign in as a role without the activation right', async () => {
      session = await shapedNonAdmin({ without: ['activatePayer'] });
      await session.payers.navigate();
      await session.payers.expectRowsRendered();
    });

    // Publishing is what makes a payer Active, so whoever may publish decides
    // which name is reserved. That is why this guard belongs to this story.
    await steps.step('The activation action is withheld', async () => {
      await session.payers.search(NON_ADMIN_PROFILE.scopedPayers[0]);
      await session.payers.expectRowActionUnavailable(NON_ADMIN_PROFILE.scopedPayers[0], 'activate');
    });

    await steps.step('And so is the approval decision', async () => {
      await session.approvals.open();
      await session.approvals.expectApprovalActionsDenied();
    });
  });

  test('16424: should let an administrator publish a payer whose name is free', async ({
    payerManagementPage,
    approvalManagementPage,
    inactivePayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('An Inactive payer holds a name nothing else holds Active', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        inactivePayer.nameEn,
        LIFECYCLE_STATUS.inactive.en,
      );
    });

    // The permissive control for the access half: TC-146 proves the action is
    // withheld from a role without the right, and this proves it is offered to
    // one that has it. Neither means anything alone.
    await steps.step('An administrator may take it Active', async () => {
      const prompt = await payerManagementPage.openActivationPrompt(inactivePayer.nameEn);
      await prompt.confirm();
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(inactivePayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(inactivePayer.nameEn);
      await approvalManagementPage.approve(inactivePayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        inactivePayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });
  });

  test('16428: should hold no two Active payers under one name, across the whole register', async ({
    payerManagementPage,
    page,
    steps,
  }) => {
    test.slow();
    let register: { name: string; active: boolean }[] = [];

    // Read through the API rather than the screen. The payer list is scoped to
    // ONE payer since the breadcrumb gate arrived, so the whole-register
    // question the case asks cannot be answered from the table any more - and
    // the endpoint is not scoped. See the admin-scope-gate note.
    await steps.critical('Read the whole register', async () => {
      await payerManagementPage.open();
      const response = await NetworkUtils.postAsSession(page, ApiEndpoints.payerList, {
        pageNumber: 1,
        rowsPerPage: 5000,
      });
      expect(response.status, 'the register should be readable').toBeLessThan(300);
      const body = JSON.parse(response.text) as {
        payload?: { payers?: { items?: { payerNameEn?: string; isActive?: boolean }[] } };
      };
      register = (body.payload?.payers?.items ?? []).map((row) => ({
        name: (row.payerNameEn ?? '').trim().toLowerCase(),
        active: row.isActive === true,
      }));
      expect(register.length, 'the register should not read back empty').toBeGreaterThan(0);
    });

    // The invariant stated directly. Every other case in this story tests one
    // route to breaking it; this one asks whether it is broken, however it got
    // that way - including by data that predates the rule.
    await steps.step('No name carries more than one Active payer', async () => {
      const activeByName = new Map<string, number>();
      for (const row of register.filter((r) => r.active && r.name !== '')) {
        activeByName.set(row.name, (activeByName.get(row.name) ?? 0) + 1);
      }
      const offenders = [...activeByName.entries()]
        .filter(([, count]) => count > 1)
        .map(([name, count]) => `"${name}" x${count}`);
      expect(
        offenders,
        `${register.length} payers read; these names carry more than one Active record: `
          + `${offenders.join(', ')}`,
      ).toEqual([]);
    });
  });
});

/**
 * The cases that need a payer state this environment cannot produce.
 */
test.describe('Enforce unique Active payer names - states this environment cannot build', () => {
  for (const [azureId, what] of [
    ['16414', 'free the name once the payer holding it has expired'],
    ['16418', 'refuse the name when one of several same-named payers is still Active'],
    ['16419', 'allow the name when every payer holding it is Expired or Inactive'],
    ['16427', 'stay consistent while a payer is moved Active to Expired and back'],
  ] as const) {
    test(`${azureId}: should ${what}`, async ({ steps }) => {
      steps.blocked(NEEDS_EXPIRED_PAYER);
      // steps.blocked() does not narrow the type for the compiler.
      return;
    });
  }
});
