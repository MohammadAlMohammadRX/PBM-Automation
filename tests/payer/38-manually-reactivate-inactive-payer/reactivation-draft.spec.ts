import { test, expect } from '../../../fixtures';
import type { ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';
import { NON_ADMIN_PROFILE } from '../../../data/accounts/nonAdminAccount.data';
import { Logger } from '../../../utils/Logger';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import {
  CONCURRENCY_OUTCOMES,
  PRESERVED_FIELDS,
  REASON_REQUIREMENT,
} from '../../../data/payers/reactivationDraft.data';

/**
 * User story: Manually Reactivate Inactive Payer.
 *
 * Four cases. The expiry boundaries that block a reactivation, the eligibility
 * matrix, the refusal wording, the access-control refusal, the version ledger
 * and the rejected-draft outcome are all already automated by the
 * activation-guardrails and publish-and-revert stories - see the traceability
 * matrix. What is left is the end-to-end draft, the promise that nothing but
 * the status moves, the mandatory reason, and two sessions racing.
 *
 * TC-002 IS ASSERTING A RULE TWO SHEETS DISAGREE ABOUT. Sheet 43 requires a
 * mandatory reason on the reactivation draft; sheet 41 TC-566 expects
 * reactivation to need no reason at all. Both are automated, each against its
 * own sheet, and one of them must fail - see reactivationDraft.data.ts. That is
 * a product decision to settle, not something a test should paper over.
 */
test.describe('Reactivate an inactive payer', () => {
  // Azure test case 14754
  test('14754: should return the payer to Active when a reactivation draft is approved', async ({
    payerManagementPage,
    approvalManagementPage,
    inactivePayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module with an Inactive payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        inactivePayer.nameEn,
        LIFECYCLE_STATUS.inactive.en,
      );
    });

    await steps.step('The row offers Activate rather than Inactivate', async () => {
      const actions = await payerManagementPage.getEnabledRowActions(inactivePayer.nameEn, [
        'activate',
        'inactivate',
      ]);
      expect(
        actions,
        'an Inactive payer should offer a route back to Active',
      ).toEqual(['activate']);
    });

    await steps.step('Confirming the prompt stages the reactivation as a draft', async () => {
      // Staged, not applied. The status still reads Inactive here, and a case
      // that asserted Active at this point would report a defect against a
      // module behaving exactly as every other payer change does.
      const prompt = await payerManagementPage.openActivationPrompt(inactivePayer.nameEn);
      await prompt.confirm();
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(inactivePayer.nameEn, 'Draft');
    });

    await steps.step('And approving it makes the payer Active', async () => {
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

  // Azure test case 14762
  test('14762: should refuse a reactivation draft that carries no reason', async ({
    payerManagementPage,
    inactivePayer,
    steps,
  }) => {
    await steps.critical('Navigate to the module with an Inactive payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        inactivePayer.nameEn,
        LIFECYCLE_STATUS.inactive.en,
      );
    });

    await steps.critical('The reactivation prompt opens', async () => {
      const prompt = await payerManagementPage.openActivationPrompt(inactivePayer.nameEn);
      expect(await prompt.isVisible(), 'the Activate action should raise a prompt').toBe(true);
    });

    await steps.step('It asks for a reason before it will accept the draft', async () => {
      // CONFLICT, and the case is written to expose it rather than to hide it.
      // Sheet 43 requires a mandatory reason here; sheet 41 TC-566 expects
      // reactivation to need none. If this fails, the prompt takes no reason -
      // which means sheet 43's requirement was never built, or sheet 41 is
      // right and this case should be retired.
      const prompt = payerManagementPage.dialog();
      const offersReason =
        (await prompt.getReasonOptions()).length > 0 || (await prompt.hasFreeTextInput());
      expect(
        offersReason,
        `the reactivation draft should demand a reason (${REASON_REQUIREMENT.conflictsWith})`,
      ).toBe(REASON_REQUIREMENT.mandatory);
    });

    await steps.step('And it will not submit while the reason is blank', async () => {
      const prompt = payerManagementPage.dialog();
      await prompt.expectAffirmativeDisabled(
        'a draft with no reason should not be submittable',
      );
    });
  });

  // Azure test case 14753
  test('14753: should change nothing but the status when a payer is reactivated', async ({
    payerManagementPage,
    approvalManagementPage,
    inactivePayer,
    steps,
  }) => {
    test.slow();

    const before: Record<string, string> = {};

    await steps.critical('Navigate to the module and record the payer as it stands', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      const detail = await payerManagementPage.openDetails(inactivePayer.nameEn);
      for (const label of PRESERVED_FIELDS) {
        before[label] = await detail.getFieldValue(label);
      }
      before['__name'] = await detail.getName();
      expect(
        Object.values(before).filter((value) => value !== '').length,
        'the payer should have populated fields to compare against',
      ).toBeGreaterThan(0);
    });

    await steps.critical('It is reactivated and the change approved', async () => {
      await payerManagementPage.open();
      const prompt = await payerManagementPage.openActivationPrompt(inactivePayer.nameEn);
      await prompt.confirm();
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(inactivePayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.approve(inactivePayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        inactivePayer.nameEn,
        LIFECYCLE_STATUS.active.en,
      );
    });

    await steps.step('Every other field survives the reactivation unchanged', async () => {
      // The guarantee worth having: a status change that quietly rewrites a
      // licence number or a contact address would be far worse than one that
      // failed outright, and nothing else in the suite would catch it.
      const detail = await payerManagementPage.openDetails(inactivePayer.nameEn);
      const changed: string[] = [];
      for (const label of PRESERVED_FIELDS) {
        const now = await detail.getFieldValue(label);
        if (now !== before[label]) changed.push(`${label}: "${before[label]}" -> "${now}"`);
      }
      // The payer's NAME is compared through the header rather than as a
      // field: the detail screen has no id-addressed field for it, which is
      // why it is not in PRESERVED_FIELDS. See PRESERVED_HEADER_NAME.
      const nameNow = await detail.getName();
      if (nameNow !== before.__name) {
        changed.push(`name: "${before.__name}" -> "${nameNow}"`);
      }
      expect(
        changed,
        `reactivation should touch only the status; these fields moved: ${changed.join('; ')}`,
      ).toEqual([]);
    });
  });

});

/**
 * The reactivation as a RECORD: what it stages, what it writes to the ledger and
 * the trail, what it leaves behind when it is refused or abandoned, and who is
 * allowed to raise it at all.
 *
 * The expiry boundaries this story also asks about are not here. An INACTIVE
 * payer is provisioned by the fixture, so everything that only needs one runs;
 * an inactive payer whose expiry has already PASSED cannot be built - the
 * create form refuses an expiry before tomorrow - so the three cases that turn
 * on that date say so rather than assert against a payer in the wrong state.
 */
test.describe('Reactivate an inactive payer - the draft as a record', () => {
  // Azure test case 14746
  test('14746: should stage the reactivation as a draft rather than apply it', async ({
    payerManagementPage,
    inactivePayer,
    steps,
  }) => {
    test.slow();
    let versionBefore = '';

    await steps.critical('Note the version the inactive payer sits on', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      versionBefore = await payerManagementPage.getVersionLabel(inactivePayer.nameEn);
    });

    // A reactivation is a change like any other: it waits for a checker. A
    // confirmation that moved the payer to Active on the spot would put the
    // status outside the maker-checker flow every other payer change obeys.
    await steps.step('Confirming the prompt stages a draft', async () => {
      const prompt = await payerManagementPage.openActivationPrompt(inactivePayer.nameEn);
      await prompt.confirm();
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      await payerManagementPage.expectApprovalStatusContains(inactivePayer.nameEn, 'Draft');
    });

    await steps.step('The payer is still Inactive until that draft is decided', () =>
      payerManagementPage.expectLifecycleStatus(inactivePayer.nameEn, LIFECYCLE_STATUS.inactive.en));

    await steps.step('And the staged change is carried on a version of its own', async () => {
      const versionAfter = await payerManagementPage.getVersionLabel(inactivePayer.nameEn);
      expect(
        versionAfter.trim(),
        `the staged reactivation should be referable by a version; the row read `
          + `"${versionBefore}" before and "${versionAfter}" after`,
      ).not.toBe('');
    });
  });

  // Azure test case 14750
  test('14750: should carry the reactivation on the version ledger with a number', async ({
    payerManagementPage,
    inactivePayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Stage a reactivation', async () => {
      await payerManagementPage.open();
      const prompt = await payerManagementPage.openActivationPrompt(inactivePayer.nameEn);
      await prompt.confirm();
      await payerManagementPage.open();
    });

    // A version-less ledger row is the failure this names: the change would be
    // visible but not referable, so nobody could say which version an approval
    // was deciding on.
    await steps.step('Every ledger row carries a version label', async () => {
      const detail = await payerManagementPage.openDetails(inactivePayer.nameEn);
      const history = detail.versionHistory();
      await history.open();
      const labels = await history.getVersionLabels();
      expect(labels.length, 'the payer should carry at least one version entry').toBeGreaterThan(0);
      for (const label of labels) {
        expect(label.trim(), `a ledger row read "${label}" - every row needs a version`).not.toBe('');
      }
    });
  });

  // Azure test case 14748
  test('14748: should leave the payer\'s data intact on the staged reactivation', async ({
    payerManagementPage,
    inactivePayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Stage a reactivation', async () => {
      await payerManagementPage.open();
      const prompt = await payerManagementPage.openActivationPrompt(inactivePayer.nameEn);
      await prompt.confirm();
      await payerManagementPage.open();
    });

    // The fields a checker decides on have to still be on the record while it
    // waits, or the decision is taken blind. 14753 proves they survive the
    // approval; this proves they survive the staging.
    await steps.step('The payer still reads back with its identifying data', async () => {
      const detail = await payerManagementPage.openDetails(inactivePayer.nameEn);
      await detail.waitForLoaded();
      const blank: string[] = [];
      for (const field of PRESERVED_FIELDS) {
        const value = await detail.getFieldValue(field).catch((): string => '');
        if (value.trim() === '') blank.push(field);
      }
      expect(
        blank,
        `a pending reactivation should not empty the payer; these read blank: ${blank.join(', ')}`,
      ).toEqual([]);
    });
  });

  // Azure test case 14761
  test('14761: should record who raised the reactivation and when', async ({
    payerManagementPage,
    inactivePayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Stage a reactivation', async () => {
      await payerManagementPage.open();
      const prompt = await payerManagementPage.openActivationPrompt(inactivePayer.nameEn);
      await prompt.confirm();
      await payerManagementPage.open();
    });

    await steps.step('The audit trail carries the event, with an actor and a time', async () => {
      const detail = await payerManagementPage.openDetails(inactivePayer.nameEn);
      const audit = detail.auditHistory();
      await audit.open();
      const entries = await audit.getEntries();
      expect(entries.length, 'the reactivation should have left a trail entry').toBeGreaterThan(0);
      // Who and when are what make a trail answerable afterwards; an entry with
      // a blank actor records that something happened and nothing else.
      const incomplete = entries
        .filter((entry) => entry.user.trim() === '' || entry.timestamp.trim() === '')
        .map((entry) => entry.raw);
      expect(
        incomplete,
        `every trail entry should name who acted and when; these did not: ${incomplete.join(' | ')}`,
      ).toEqual([]);
    });
  });

  // Azure test case 14766
  test('14766: should offer no reactivation on a payer that is already Active', async ({
    payerManagementPage,
    publishedPayer,
    steps,
  }) => {
    await steps.critical('Open the list on a live, active payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(publishedPayer.nameEn);
      await payerManagementPage.waitForRowVisible(publishedPayer.nameEn);
    });

    // Reactivating what is already active has no meaning, and offering it
    // invites a change that spends a version and a checker's time to do nothing.
    await steps.step('The Activate action is not offered', async () => {
      const refusal = await payerManagementPage.expectRowActionUnavailable(
        publishedPayer.nameEn,
        'activate',
      );
      Logger.info(`an Active payer refused the reactivation by being "${refusal}"`);
    });

    await steps.step('And the payer is untouched by having been looked at', () =>
      payerManagementPage.expectLifecycleStatus(publishedPayer.nameEn, LIFECYCLE_STATUS.active.en));
  });

  // Azure test case 14769
  test('14769: should leave the payer Inactive when its reactivation is rejected', async ({
    payerManagementPage,
    approvalManagementPage,
    inactivePayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Stage a reactivation and submit it', async () => {
      await payerManagementPage.open();
      const prompt = await payerManagementPage.openActivationPrompt(inactivePayer.nameEn);
      await prompt.confirm();
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(inactivePayer.nameEn);
    });

    await steps.critical('The checker rejects it', async () => {
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(inactivePayer.nameEn);
      await approvalManagementPage.reject(inactivePayer.nameEn);
    });

    // The refusal has to be complete. A payer left half-moved - Active because
    // the draft was raised, rejected because it was refused - is the worst of
    // both, and nothing downstream could tell which state was intended.
    await steps.step('The payer is still Inactive', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      await payerManagementPage.expectLifecycleStatus(
        inactivePayer.nameEn,
        LIFECYCLE_STATUS.inactive.en,
      );
    });
  });

  // Azure test case 14770
  test('14770: should let a staged reactivation be abandoned before it is decided', async ({
    payerManagementPage,
    inactivePayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Stage a reactivation', async () => {
      await payerManagementPage.open();
      const prompt = await payerManagementPage.openActivationPrompt(inactivePayer.nameEn);
      await prompt.confirm();
      await payerManagementPage.open();
      await payerManagementPage.expectApprovalStatusContains(inactivePayer.nameEn, 'Draft');
    });

    // A maker who changes their mind must be able to leave nothing behind -
    // otherwise every abandoned thought costs a version and a checker's time.
    await steps.step('The draft can be discarded and the row stops reporting one', async () => {
      await payerManagementPage.discardDraft(inactivePayer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(inactivePayer.nameEn);
      const approvalState = await payerManagementPage.getApprovalStatus(inactivePayer.nameEn);
      expect(
        approvalState,
        `the discarded reactivation should be gone; the row still reports "${approvalState}"`,
      ).not.toContain('Draft');
    });

    await steps.step('And the payer is exactly where it was', () =>
      payerManagementPage.expectLifecycleStatus(
        inactivePayer.nameEn,
        LIFECYCLE_STATUS.inactive.en,
      ));
  });

  // Azure test case 14764
  test('14764: should withhold the reactivation and its approval from a role without the rights', async ({
    shapedNonAdmin,
    steps,
  }) => {
    test.slow();
    let session!: ShapedSession;

    await steps.critical('Sign in as a user without the status rights', async () => {
      session = await shapedNonAdmin({ without: ['activatePayer', 'inactivatePayer'] });
      await session.payers.navigate();
      await session.payers.expectRowsRendered();
    });

    // Both halves of the segregation: the maker's control is withheld from a
    // role that does not hold it, and the checker's decisions are withheld from
    // a role that is not a checker.
    await steps.step('The Activate action is withheld', async () => {
      await session.payers.search(NON_ADMIN_PROFILE.scopedPayers[0]);
      await session.payers.expectRowActionUnavailable(NON_ADMIN_PROFILE.scopedPayers[0], 'activate');
    });

    await steps.step('And so is the decision on one', async () => {
      await session.approvals.open();
      await session.approvals.expectApprovalActionsDenied();
    });
  });

  for (const [azureId, what, needs] of [
    [
      '14756',
      'block the reactivation with a message when the expiry date has already passed',
      'an INACTIVE payer whose expiry date is in the past',
    ],
    [
      '14758',
      'permit the reactivation on the day the expiry date itself falls',
      'an INACTIVE payer whose expiry date is today',
    ],
    [
      '14772',
      'refuse the reactivation of an Expired payer as an invalid transition',
      'an EXPIRED payer',
    ],
  ] as const) {
    test(`${azureId}: should ${what}`, async ({ steps }) => {
      steps.blocked(
        `This case needs ${needs}. The create form will not accept an expiry date earlier than `
        + 'tomorrow, so the state cannot be built through the interface, and the nightly lifecycle '
        + 'job that would age a payer into it cannot be triggered from this suite. Seed a payer in '
        + 'that state, or expose a way to run the job, and the case can be asserted as written.',
      );
      // steps.blocked() does not narrow the type for the compiler; the return
      // is what tells it nothing below runs.
      return;
    });
  }
});
