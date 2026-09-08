import { test, expect } from '../../../fixtures';
import {
  LIFECYCLE_STATUS,
  RECALCULATION_CASES,
  datesFor,
} from '../../../data/payers/statusTransition.data';

/**
 * User story: Refine Automatic Status Transitions for Expiry Precedence and
 * Recalculation on Edit.
 * The RECALCULATION-ON-EDIT half - synchronous, and testable without waiting.
 *
 * These cases need an Expired payer to edit, which is the one thing the
 * environment cannot readily supply: it holds a single Expired record, shared
 * with every other suite, and extending its expiry would consume it. So they
 * draw on the seeded `expired-to-edit` row (see data/payers/statusSeed.data.ts),
 * which exists precisely so the edit cases have an Expired payer of their own
 * that no other case depends on.
 *
 * Until that row's expiry has passed they report BLOCKED with the date to come
 * back on, rather than failing. Nothing about the application would have been
 * observed, so a failure would be a false statement about it.
 *
 * ONE FINDING ALREADY BAKED IN. The "change the expiry to another past date"
 * case cannot be performed at all: the form rejects any expiry before today
 * with "Expiry date cannot be earlier than today." (verified live). The
 * criterion - the payer stays Expired - still holds, by prevention rather than
 * recalculation, and `expectDateEditOutcome` owns that branch.
 */
test.describe('Refine Automatic Status Transitions - Recalculation on edit', () => {
  for (const recalculation of RECALCULATION_CASES) {
    test(`${recalculation.caseId}: should recalculate the payer status to ${LIFECYCLE_STATUS[recalculation.expected].en} when ${recalculation.label}`, async ({
      payerManagementPage,
      statusSeed,
      steps,
    }) => {
      const blocked = statusSeed.blockedReason('expired-to-edit');
      if (blocked !== null) steps.blocked(blocked);

      const seeded = statusSeed.find('expired-to-edit')!;
      const { effectiveDate, expiryDate } = datesFor(recalculation);

      await steps.critical('Navigate to the Payer Management module', async () => {
        await payerManagementPage.open();
        await payerManagementPage.search(seeded.nameEn);
        // The precondition, asserted rather than assumed: the seeded row must
        // actually have expired. If the lifecycle job never ran it will still
        // read Active, and every assertion below would be meaningless.
        await payerManagementPage.expectStatusText(
          seeded.nameEn,
          LIFECYCLE_STATUS.expired.en,
        );
      });

      await steps.step(
        `The record's dates are edited so that ${recalculation.label}`,
        () => payerManagementPage.expectDateEditOutcome(
          seeded.nameEn,
          effectiveDate,
          expiryDate,
          recalculation.refusedWithMessage,
          LIFECYCLE_STATUS.expired.en,
        ),
      );

      await steps.step(
        `The status settles on ${LIFECYCLE_STATUS[recalculation.expected].en} - ${recalculation.why}`,
        () => payerManagementPage.expectStatusText(
          seeded.nameEn,
          LIFECYCLE_STATUS[recalculation.expected].en,
        ),
      );
    });
  }

  test('TC-007: should show the recalculated status in the list when an expired payer has its expiry extended', async ({
    payerManagementPage,
    statusSeed,
    steps,
  }) => {
    const blocked = statusSeed.blockedReason('expired-to-edit');
    if (blocked !== null) steps.blocked(blocked);

    const seeded = statusSeed.find('expired-to-edit')!;
    const extended = datesFor(RECALCULATION_CASES[0]);

    await steps.critical('Navigate to the Payer Management module', () =>
      payerManagementPage.open());

    await steps.step('The expired record shows its past expiry date and Expired status', async () => {
      await payerManagementPage.search(seeded.nameEn);
      await payerManagementPage.expectStatusText(seeded.nameEn, LIFECYCLE_STATUS.expired.en);
      const detail = await payerManagementPage.openDetails(seeded.nameEn);
      expect(await detail.getFieldValue('Expiry Date')).not.toBe('');
    });

    await steps.step('The expiry is updated to a valid future date and saved', () =>
      payerManagementPage.expectDateEditOutcome(
        seeded.nameEn,
        extended.effectiveDate,
        extended.expiryDate,
        undefined,
        LIFECYCLE_STATUS.expired.en,
      ));

    await steps.step('The list\'s Status column shows the recalculated value, not Expired', async () => {
      await payerManagementPage.search(seeded.nameEn);
      const status = await payerManagementPage.getStatusText(seeded.nameEn);
      expect(status).not.toBe(LIFECYCLE_STATUS.expired.en);
      // Either outcome is correct depending on where the new window falls; what
      // must not happen is the status staying Expired after a valid extension.
      expect([LIFECYCLE_STATUS.active.en, LIFECYCLE_STATUS.pending.en]).toContain(status);
    });
  });
});
