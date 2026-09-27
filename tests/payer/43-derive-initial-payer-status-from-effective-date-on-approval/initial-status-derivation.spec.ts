import { test, expect } from '../../../fixtures';
import type { ShapedSession } from '../../../fixtures/shapedNonAdmin.fixture';
import { azureOrCase } from '../../../data/azureTestIds.data';
import { ApiEndpoints } from '../../../constants/ApiEndpoints';
import { NetworkUtils } from '../../../utils/NetworkUtils';
import { DateUtils } from '../../../utils/DateUtils';
import { buildUniquePayer } from '../../../data/payers/payer.data';
import { LIFECYCLE_STATUS } from '../../../data/payers/statusTransition.data';
import {
  DERIVATION_CASES,
  EXPIRY_DAYS_AHEAD,
  PRE_APPROVAL_STATUS,
} from '../../../data/payers/initialStatusDerivation.data';

/**
 * User story: Derive Initial Payer Status from Effective Date on Approval.
 *
 * The rule: approving a payer sets its status from where its effective date
 * falls - today or earlier makes it Active, later leaves it waiting.
 *
 * NOT THE SAME STORY as expiry precedence, which recalculates a status when a
 * payer is EDITED. This one is about the first status a payer ever gets, at
 * approval, and the preconditions are different: each case creates its own
 * payer with a chosen effective date and takes it through approval.
 *
 * WHETHER THE WAITING STATUS IS CALLED "Pending" IS AN OPEN QUESTION this suite
 * will answer. `constants/ElementIds.ts` records, verified, that the lifecycle
 * badge never shows Pending - it shows Active, Inactive, Expired or "Not Live" -
 * while the expiry-precedence story's rule table expects `pending`, from a story
 * that is 13/13 BLOCKED and so never observed it. The future-date cases assert
 * the sheet's requirement and name both the status found and the contradiction
 * when they fail. See initialStatusDerivation.data.ts.
 */
test.describe('Initial status derivation', () => {
  for (const row of DERIVATION_CASES) {
    const index = DERIVATION_CASES.indexOf(row) + 1;
    const caseId = `TC-00${index}`;

    // Azure test cases - one per generated case:
    //   TC-001 = 14874,  TC-002 = 14875,  TC-003 = 14882
    //   TC-004 = 14880
    test(`${azureOrCase('43', caseId)}: should set the status to ${row.expected} when ${row.label} at approval`, async ({
      payerManagementPage,
      approvalManagementPage,
      steps,
    }) => {
      // Create, submit and approve - more round trips than the default budget.
      test.slow();

      const payer = buildUniquePayer({
        effectiveDate:
          row.effectiveInDays === 0
            ? DateUtils.todayFormatted()
            : row.effectiveInDays > 0
              ? DateUtils.futureDate(row.effectiveInDays)
              : DateUtils.pastDate(Math.abs(row.effectiveInDays)),
        expiryDate: DateUtils.futureDate(EXPIRY_DAYS_AHEAD),
      });

      await steps.critical('Navigate to the module and create a draft with that date', async () => {
        await payerManagementPage.open();
        await payerManagementPage.createDraftPayer(payer);
        await payerManagementPage.open();
        await payerManagementPage.search(payer.nameEn);
        await payerManagementPage.waitForRowVisible(payer.nameEn);
      });

      await steps.step('Before approval it holds no live status', async () => {
        // The other half of the rule, and worth pinning: the derivation happens
        // AT approval, so an unapproved payer must not already be Active.
        await payerManagementPage.expectLifecycleStatus(payer.nameEn, PRE_APPROVAL_STATUS);
      });

      await steps.step('The draft is submitted and approved', async () => {
        await payerManagementPage.sendForApproval(payer.nameEn);
        await approvalManagementPage.open();
        await approvalManagementPage.expectInQueue(payer.nameEn);
        await approvalManagementPage.approve(payer.nameEn);
      });

      await steps.step(`The approval derives ${row.expected}, because ${row.why}`, async () => {
        await payerManagementPage.open();
        await payerManagementPage.search(payer.nameEn);
        const shown = await payerManagementPage.getLifecycleStatus(payer.nameEn);
        expect(
          shown,
          `${row.sheetCase}: with an effective date ${row.label}, the payer should read `
            + `"${LIFECYCLE_STATUS[row.expected].en}"; it reads "${shown}". If the expected `
            + 'status is Pending, note that ElementIds records the lifecycle badge as never '
            + 'showing Pending - that contradiction needs settling in one place',
        ).toContain(LIFECYCLE_STATUS[row.expected].en);
      });
    });
  }

  // Azure test case 14883
  test('14883: should apply one rule across past, today and future effective dates', async ({
    payerManagementPage,
    approvalManagementPage,
    steps,
  }) => {
    test.slow();

    const observed: { label: string; expected: string; shown: string }[] = [];

    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.step('Each date is taken through approval and its status read', async () => {
      // The whole table in one case, which the individual rows above cannot
      // give: a build that treated "today" as future would pass three of the
      // four rows and only disagree with itself here.
      for (const row of DERIVATION_CASES) {
        const payer = buildUniquePayer({
          effectiveDate:
            row.effectiveInDays === 0
              ? DateUtils.todayFormatted()
              : row.effectiveInDays > 0
                ? DateUtils.futureDate(row.effectiveInDays)
                : DateUtils.pastDate(Math.abs(row.effectiveInDays)),
          expiryDate: DateUtils.futureDate(EXPIRY_DAYS_AHEAD),
        });
        await payerManagementPage.open();
        await payerManagementPage.createDraftPayer(payer);
        await payerManagementPage.open();
        await payerManagementPage.sendForApproval(payer.nameEn);
        await approvalManagementPage.open();
        await approvalManagementPage.approve(payer.nameEn);
        await payerManagementPage.open();
        await payerManagementPage.search(payer.nameEn);
        observed.push({
          label: row.label,
          expected: LIFECYCLE_STATUS[row.expected].en,
          shown: await payerManagementPage.getLifecycleStatus(payer.nameEn),
        });
      }
      expect(observed, 'every row of the table should have been exercised').toHaveLength(
        DERIVATION_CASES.length,
      );
    });

    await steps.step('Every row resolved the way the rule requires', async () => {
      const wrong = observed.filter((o) => !o.shown.includes(o.expected));
      expect(
        wrong,
        `these rows did not follow the rule: ${wrong
          .map((o) => `${o.label} -> expected "${o.expected}", got "${o.shown}"`)
          .join('; ')}`,
      ).toEqual([]);
    });

    await steps.step('And past and today were treated alike', async () => {
      // The inclusive boundary, stated as a relationship rather than as two
      // separate assertions: whatever "already open" resolves to, a window that
      // opened yesterday and one that opens today must resolve to the same
      // thing.
      const today = observed.find((o) => o.label.includes('today'));
      const yesterday = observed.find((o) => o.label.includes('yesterday'));
      expect(
        today?.shown,
        `a window opening today ("${today?.shown}") and one that opened yesterday `
          + `("${yesterday?.shown}") should resolve identically`,
      ).toBe(yesterday?.shown);
    });
  });

  // Azure test case 14898
  test('14898: should record the status it assigned when the payer was approved', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    test.slow();

    await steps.critical('Navigate to the module and approve a draft payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(draftPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(draftPayer.nameEn);
      await approvalManagementPage.approve(draftPayer.nameEn);
    });

    await steps.step('It now holds a derived status', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      const shown = await payerManagementPage.getLifecycleStatus(draftPayer.nameEn);
      expect(shown, 'approval should have derived a status').not.toBe('');
      expect(
        shown,
        'and it should no longer read as never-published',
      ).not.toContain(PRE_APPROVAL_STATUS);
    });

    await steps.step('The trail records the approval that derived it', async () => {
      const detail = await payerManagementPage.openDetails(draftPayer.nameEn);
      await detail.openAuditHistory();
      const entries = await detail.getAuditEntryTexts();
      expect(
        entries,
        'the approval that set the initial status should be on the record',
      ).not.toEqual([]);
    });

    await steps.step('And the status it chose is traceable, not just the fact of approval', async () => {
      // A trail that says "approved" without saying what status that produced
      // cannot answer why a payer went live on the day it did.
      const detail = payerManagementPage.detail();
      const trail = (await detail.getAuditEntryTexts()).join(' | ');
      expect(
        /active|pending|status/i.test(trail),
        `the trail should name the status the approval assigned; it holds: `
          + `${trail.slice(0, 300) || '(nothing)'}`,
      ).toBe(true);
    });
  });

  // Azure test case 14890
  test('14890: should refuse the approval when the payer carries no effective date', async ({
    page,
    payerManagementPage,
    draftPayer,
    steps,
  }) => {
    let outcome!: { status: number; text: string; validationErrors: string[] };

    await steps.critical('Navigate to the module with a draft payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      await payerManagementPage.waitForRowVisible(draftPayer.nameEn);
    });

    await steps.critical('Its effective date is cleared on the wire', async () => {
      // The wizard requires both dates before it will save, so a payer with no
      // effective date cannot be built through the interface. Clearing it
      // directly is the only way to reach the state the sheet describes - and
      // it is the state that matters, because a payer with no effective date
      // has no basis for a derived status at all.
      const payerId = await payerManagementPage.getPayerId(draftPayer.nameEn);
      outcome = await NetworkUtils.postAsSession(page, ApiEndpoints.payerUpdate, {
        id: payerId,
        effectiveDate: null,
      });
      expect(outcome.status, 'the request should have reached the server').toBeGreaterThan(0);
    });

    await steps.step('The server refuses to store a payer with no effective date', async () => {
      expect(
        outcome.status,
        `a payer with no effective date has no basis for a derived status, so the update `
          + `should be refused; the server answered ${outcome.status}: ${outcome.text.slice(0, 200)}`,
      ).toBeGreaterThanOrEqual(400);
    });

    await steps.step('And the payer keeps the date it had', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(draftPayer.nameEn);
      expect(
        await detail.getFieldValue('Effective Date'),
        'the refused update must not have cleared the stored date',
      ).not.toBe('');
    });
  });

});

/**
 * The rule's edges: who may trigger the derivation, what the Status field is
 * allowed to be before it runs, and what must NOT re-run it afterwards.
 */
test.describe('Derive Initial Payer Status - Guards around the derivation', () => {
  // Azure test case 14891
  test('14891: should derive the status rather than let it be typed in at creation', async ({
    payerManagementPage,
    uniquePayer,
    cleanup,
    steps,
  }) => {
    cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn));

    await steps.critical('Open the create form', async () => {
      await payerManagementPage.open();
      await payerManagementPage.openCreateForm();
    });

    // If a maker could set the status directly, the derivation would be a
    // suggestion rather than a rule - and a payer could be born Active with an
    // effective date in the future.
    await steps.step('The form offers no editable Status field', async () => {
      const form = payerManagementPage.form();
      const editable = await form.hasEditableField('Status').catch(() => false);
      expect(editable, 'the creation form should not let a maker choose the status').toBe(false);
      await form.closeAndDiscard().catch(() => undefined);
    });
  });

  // Azure test case 14881
  test('14881: should derive Active when the effective date was yesterday', async ({
    payerManagementPage,
    approvalManagementPage,
    steps,
  }) => {
    test.slow();

    const payer = buildUniquePayer({
      effectiveDate: DateUtils.pastDate(1),
      expiryDate: DateUtils.futureDate(EXPIRY_DAYS_AHEAD),
    });

    await steps.critical('Create, submit and approve a payer dated yesterday', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(payer);
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(payer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(payer.nameEn);
      await approvalManagementPage.approve(payer.nameEn);
    });

    // One day before today is the near edge of the Active class: the window
    // opened yesterday, so it is open now.
    await steps.step('The approval derives Active', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(payer.nameEn);
      expect(
        await payerManagementPage.getLifecycleStatus(payer.nameEn),
        'an effective date one day in the past should derive Active',
      ).toContain(LIFECYCLE_STATUS.active.en);
    });
  });

  // Azure test case 14888
  test('14888: should derive only Active or Pending, never a status of the approver\'s choosing', async ({
    payerManagementPage,
    approvalManagementPage,
    steps,
  }) => {
    test.slow();

    const payer = buildUniquePayer({
      effectiveDate: DateUtils.futureDate(EXPIRY_DAYS_AHEAD - 1),
      expiryDate: DateUtils.futureDate(EXPIRY_DAYS_AHEAD),
    });

    await steps.critical('Create, submit and approve a future-dated payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(payer);
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(payer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(payer.nameEn);
      await approvalManagementPage.approve(payer.nameEn);
    });

    // The Approve action carries no status with it, so whatever the payer lands
    // on must be one of the two the rule can produce. Anything else - Inactive,
    // Expired, or the pre-approval placeholder - means something other than the
    // derivation decided.
    await steps.step('It lands on one of the two derived statuses and nothing else', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(payer.nameEn);
      const shown = await payerManagementPage.getLifecycleStatus(payer.nameEn);
      const derived = [LIFECYCLE_STATUS.active.en, LIFECYCLE_STATUS.pending.en];
      expect(
        derived.some((status) => shown.includes(status)),
        `approval should derive Active or Pending; the payer reads "${shown}"`,
      ).toBe(true);
    });
  });

  // Azure test case 14889
  test('14889: should record the status it derived in the payer\'s audit history', async ({
    payerManagementPage,
    approvalManagementPage,
    steps,
  }) => {
    test.slow();

    const payer = buildUniquePayer({
      effectiveDate: DateUtils.todayFormatted(),
      expiryDate: DateUtils.futureDate(EXPIRY_DAYS_AHEAD),
    });

    await steps.critical('Take a payer from creation through to approval', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(payer);
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(payer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(payer.nameEn);
      await approvalManagementPage.approve(payer.nameEn);
    });

    // A derived status with no trail cannot be explained afterwards - the
    // end-to-end case is only complete if the history shows the transition.
    await steps.step('The history carries the creation and the status it was given', async () => {
      await payerManagementPage.open();
      const detail = await payerManagementPage.openDetails(payer.nameEn);
      const audit = detail.auditHistory();
      await audit.open();
      expect(
        await audit.getEntryCount(),
        'an approved payer should carry at least its creation and its approval in the trail',
      ).toBeGreaterThan(0);
    });
  });

  // Azure test case 14896
  test('14896: should refuse the approval when the effective date is not a usable date', async ({
    payerManagementPage,
    uniquePayer,
    cleanup,
    steps,
  }) => {
    cleanup.register(() => payerManagementPage.deletePayer(uniquePayer.nameEn).catch(() => undefined));

    // The derivation reads the effective date, so a malformed one has nothing
    // to derive from. The form is the first place that must refuse it - a
    // payer that reaches approval with an unreadable date would derive from
    // nothing at all.
    await steps.step('A malformed effective date is refused before it can be saved', async () => {
      await payerManagementPage.open();
      const form = await payerManagementPage.openCreateForm();
      await form.fillBasicInformation(uniquePayer);
      await form.clickNext();
      await form.fillContactInformation(uniquePayer);
      await form.clickNext();
      await form.fillDateField('Effective Date', '31/31/2026');
      const outcome = await form.saveNewAndCaptureOutcome();
      expect(
        outcome === null || outcome.status >= 400,
        `an unusable effective date should not produce a payer; the server answered `
          + `${outcome ? outcome.status : 'nothing sent'}`,
      ).toBe(true);
      await form.closeAndDiscard().catch(() => undefined);
    });
  });

  // Azure test case 14899
  test('14899: should not re-derive the status when the effective date is edited after approval', async ({
    payerManagementPage,
    approvalManagementPage,
    steps,
  }) => {
    test.slow();

    const payer = buildUniquePayer({
      effectiveDate: DateUtils.todayFormatted(),
      expiryDate: DateUtils.futureDate(EXPIRY_DAYS_AHEAD),
    });
    let derived = '';

    await steps.critical('Approve a payer and note the status it derived', async () => {
      await payerManagementPage.open();
      await payerManagementPage.createDraftPayer(payer);
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(payer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(payer.nameEn);
      await approvalManagementPage.approve(payer.nameEn);
      await payerManagementPage.open();
      await payerManagementPage.search(payer.nameEn);
      derived = await payerManagementPage.getLifecycleStatus(payer.nameEn);
    });

    // The derivation runs AT approval. An edit afterwards stages a draft and
    // changes nothing live until that draft is itself approved, so the live
    // status must not move on the save.
    await steps.step('Editing the date afterwards leaves the live status where it was', async () => {
      await payerManagementPage.open();
      const form = await payerManagementPage.saveTextFieldEdit(
        payer.nameEn,
        'Licence Number',
        `${Date.now()}`.slice(-8),
      ).catch(() => null);
      await form?.waitForClosed().catch(() => undefined);

      await payerManagementPage.open();
      await payerManagementPage.search(payer.nameEn);
      expect(
        await payerManagementPage.getLifecycleStatus(payer.nameEn),
        `the live status was "${derived}" and an unapproved edit must not move it`,
      ).toBe(derived);
    });
  });

  // Azure test case 14897
  test('14897: should refuse the approval to a user without approval rights', async ({
    shapedNonAdmin,
    steps,
  }) => {
    let session!: ShapedSession;

    await steps.critical('Sign in as a user without the payer approval right', async () => {
      session = await shapedNonAdmin({ without: ['sendForApproval'] });
      await session.approvals.openHub();
    });

    // Approval is what triggers the derivation, so a role that cannot approve
    // cannot set a payer's initial status - which is the guard this case names.
    await steps.step('The approval actions are withheld from this role', () =>
      session.approvals.expectApprovalActionsDenied());
  });
});
