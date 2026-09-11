import { test, expect } from '../../../fixtures';
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

    test(`${caseId}: should set the status to ${row.expected} when ${row.label} at approval`, async ({
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

  test('TC-005: should apply one rule across past, today and future effective dates', async ({
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

  test('TC-006: should record the status it assigned when the payer was approved', async ({
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

  test('TC-007: should refuse the approval when the payer carries no effective date', async ({
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

  test('TC-008: should show the derived status identically in the list and on the detail screen', async ({
    payerManagementPage,
    approvalManagementPage,
    draftPayer,
    steps,
  }) => {
    test.slow();

    let inList = '';

    await steps.critical('Navigate to the module and approve a draft payer', async () => {
      await payerManagementPage.open();
      await payerManagementPage.sendForApproval(draftPayer.nameEn);
      await approvalManagementPage.open();
      await approvalManagementPage.expectInQueue(draftPayer.nameEn);
      await approvalManagementPage.approve(draftPayer.nameEn);
    });

    await steps.step('The list shows its derived status', async () => {
      await payerManagementPage.open();
      await payerManagementPage.search(draftPayer.nameEn);
      inList = await payerManagementPage.getLifecycleStatus(draftPayer.nameEn);
      expect(inList, 'the list should show a derived status').not.toBe('');
    });

    await steps.step('The detail screen shows the same one', async () => {
      // Two independently built surfaces rendering the same fact. Disagreement
      // means one of them is deriving or caching the status on its own, which is
      // how a payer comes to look live on one screen and not on another.
      const detail = await payerManagementPage.openDetails(draftPayer.nameEn);
      const onDetail = (await detail.statusBadge().innerText()).trim();
      expect(
        onDetail,
        `the list reads "${inList}" and the detail header reads "${onDetail}"`,
      ).toContain(inList);
    });

    await steps.step('And both agree on the colour band they render it in', async () => {
      const detail = payerManagementPage.detail();
      const detailTone = await detail.statusBadge().getAttribute('data-tone');
      const listTone = await payerManagementPage.getStatusTone(draftPayer.nameEn);
      expect(
        detailTone,
        `the list bands this status as "${listTone}" and the detail screen as "${detailTone}"`,
      ).toBe(listTone);
    });
  });
});
